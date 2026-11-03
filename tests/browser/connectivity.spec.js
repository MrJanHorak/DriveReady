import { test, expect } from "@playwright/test";

async function setup(page, prefix) {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`${prefix}-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("Practice records: Cloud account")).toBeVisible();
  await page.getByLabel("Learner name or nickname").fill("Cloud learner");
  await page.getByRole("button", { name: "Add learner" }).click();
  await page.getByRole("button", { name: "Log a drive" }).click();
  await page.getByLabel("Total duration (minutes)").fill("30");
}

test("network loss during a save preserves the form until the outcome is known", async ({ page, context }) => {
  test.setTimeout(60000);
  await setup(page, "offline");
  try {
    await context.setOffline(true);
    const failedRequest = page.waitForEvent("requestfailed", { predicate: (request) => request.url().includes("127.0.0.1:8080"), timeout: 15000 });
    await page.getByRole("button", { name: "Save drive" }).click();
    await failedRequest;
    await expect(page.getByLabel("Total duration (minutes)")).toHaveValue("30");
  } finally {
    await context.setOffline(false);
  }
  await expect.poll(async () => {
    if (await page.getByText("30m", { exact: false }).count()) return "saved";
    if (await page.getByRole("alert").count()) return "uncertain";
    return "pending";
  }, { timeout: 45000 }).not.toBe("pending");
  if (await page.getByRole("alert").count()) {
    await expect(page.getByRole("alert")).toContainText("Could not confirm the cloud save");
    await expect(page.getByRole("button", { name: "Save drive" })).toBeDisabled();
  }
  await page.getByRole("button", { name: "Refresh cloud records" }).click();
  await expect(page.getByRole("button", { name: "Log a drive" })).toBeEnabled();
  expect(await page.locator("article").count()).toBeLessThanOrEqual(1);
});

test("closing a tab after a server commit does not duplicate the saved drive", async ({ context }) => {
  const page = await context.newPage();
  await setup(page, "close");
  let committed;
  const serverCommitted = new Promise((resolve) => { committed = resolve; });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/documents:commit", async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    committed();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByRole("button", { name: "Save drive" }).click();
  await serverCommitted;
  await expect(page.getByText("Cloud operation in progress.", { exact: false })).toBeVisible();
  page.removeAllListeners("dialog");
  const warning = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const dialog = await warning;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await page.close({ runBeforeUnload: false });
  release();
  const reopened = await context.newPage();
  reopened.on("dialog", (dialog) => dialog.accept());
  await reopened.goto("/");
  await expect(reopened.locator("article")).toHaveCount(1);
  await expect(reopened.locator("article")).toContainText("30m");
});

test("a lost commit response requires a refresh before retrying", async ({ page }) => {
  test.setTimeout(60000);
  await setup(page, "lost-response");
  let commits = 0;
  await page.route("**/documents:commit", async (route) => {
    if (++commits === 1) {
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Save drive" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not confirm the cloud save", { timeout: 45000 });
  await expect(page.getByRole("button", { name: "Save drive" })).toBeDisabled();
  await page.unroute("**/documents:commit");
  await page.getByRole("button", { name: "Refresh cloud records" }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article")).toContainText("30m");
});

test("an import interrupted by lost connectivity remains safe to retry", async ({ page, context }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`import-offline-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByText("This account has 0 learners and 0 drives")).toBeVisible();
  let commits = 0;
  let cutConnection;
  const disconnected = new Promise((resolve) => { cutConnection = resolve; });
  await page.route("**/documents:commit", async (route) => {
    if (++commits === 2) { await context.setOffline(true); cutConnection(); }
    await route.continue().catch(() => {});
  });
  const backup = { version: 1, learners: [{ id: "offline-learner", name: "Backup learner" }], drives: [{ id: "offline-drive", learnerId: "offline-learner", date: "2026-11-01", minutes: 30, nightMinutes: 0, skills: "", notes: "" }] };
  const file = { name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) };
  await page.getByLabel("Choose backup to copy to cloud").setInputFiles(file);
  await page.getByRole("button", { name: "Copy to account" }).click();
  await disconnected;
  await context.setOffline(false);
  await page.unroute("**/documents:commit");
  await expect(page.getByText(/Import (was interrupted|finished)/)).toBeVisible({ timeout: 45000 });
  await page.getByLabel("Choose backup to copy to cloud").setInputFiles(file);
  await page.getByRole("button", { name: "Copy to account" }).click();
  await expect(page.getByText(/0 conflicts skipped/)).toBeVisible({ timeout: 45000 });
  await page.getByRole("button", { name: "Refresh cloud count" }).click();
  await expect(page.getByText("This account has 1 learner and 1 drive")).toBeVisible();
});
