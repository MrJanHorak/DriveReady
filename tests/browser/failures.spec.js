import { test, expect } from "@playwright/test";

test("two browsers report a stale edit and preserve the saved version", async ({ browser }) => {
  const email = `conflict-${Date.now()}@example.test`;
  const password = "test-password-123";
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  for (const page of [first, second]) page.on("dialog", (dialog) => dialog.accept());
  try {
    await first.goto("/");
    await first.getByRole("button", { name: "Create an account" }).click();
    await first.getByLabel("Email", { exact: true }).fill(email);
    await first.getByLabel("Password", { exact: true }).fill(password);
    await first.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(first.getByText(`Signed in as ${email}`)).toBeVisible();
    await first.getByLabel("Learner name or nickname").fill("Cloud learner");
    await first.getByRole("button", { name: "Add learner" }).click();
    await first.getByRole("button", { name: "Log a drive" }).click();
    await first.getByLabel("Total duration (minutes)").fill("30");
    await first.getByRole("button", { name: "Save drive" }).click();
    await expect(first.getByText("30m", { exact: false }).first()).toBeVisible();

    await second.goto("/");
    await second.getByLabel("Email", { exact: true }).fill(email);
    await second.getByLabel("Password", { exact: true }).fill(password);
    await second.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(second.getByText(`Signed in as ${email}`)).toBeVisible();
    await expect(second.getByText("30m", { exact: false }).first()).toBeVisible();
    await second.getByRole("button", { name: "Edit", exact: true }).click();
    await second.getByLabel("Total duration (minutes)").fill("60");
    await first.getByRole("button", { name: "Edit", exact: true }).click();
    await first.getByLabel("Total duration (minutes)").fill("45");
    await first.getByRole("button", { name: "Save drive" }).click();
    await expect(first.getByText("45m", { exact: false }).first()).toBeVisible();
    await second.getByRole("button", { name: "Save drive" }).click();
    await expect(second.getByRole("alert")).toContainText("changed on another device");
    await expect(second.getByLabel("Total duration (minutes)")).toHaveValue("60");
    await second.getByRole("button", { name: "Refresh cloud records" }).click();
    await expect(second.getByText("45m", { exact: false }).first()).toBeVisible();
  } finally {
    await Promise.all([firstContext.close(), secondContext.close()]);
  }
});

test("interrupted backup import can be retried", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`interrupt-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("This account has 0 learners and 0 drives")).toBeVisible();
  let commits = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let intercepted;
  const pending = new Promise((resolve) => { intercepted = resolve; });
  const commitUrl = "**/documents:commit";
  await page.route(commitUrl, async (route) => {
    if (++commits === 1) { intercepted(); await gate; await route.continue(); }
    else if (commits === 2) await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "Injected failure" } }) });
    else await route.continue();
  });
  const backup = { version: 1, learners: [{ id: "interrupted-learner", name: "Backup learner" }], drives: [{ id: "interrupted-drive", learnerId: "interrupted-learner", date: "2026-11-01", minutes: 30, nightMinutes: 0, skills: "", notes: "" }] };
  const file = { name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) };
  await page.getByLabel("Choose backup to copy to cloud").setInputFiles(file);
  await page.getByRole("button", { name: "Copy to account" }).click();
  await pending;
  await expect(page.getByRole("button", { name: "Sign out" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Refresh cloud records" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Driving Logs" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add learner" })).toBeDisabled();
  release();
  await expect(page.getByText("Import was interrupted.", { exact: false })).toBeVisible();
  expect(commits).toBe(2);
  await page.unroute(commitUrl);
  await page.getByLabel("Choose backup to copy to cloud").setInputFiles(file);
  await page.getByRole("button", { name: "Copy to account" }).click();
  await expect(page.getByText(/1 copied, 1 already present/)).toBeVisible();
});

test("a pending cloud save blocks sign-out and a rejected save keeps the form", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`save-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("Practice records: Cloud account")).toBeVisible();
  await page.getByLabel("Learner name or nickname").fill("Cloud learner");
  await page.getByRole("button", { name: "Add learner" }).click();
  await page.getByRole("button", { name: "Log a drive" }).click();
  await page.getByLabel("Total duration (minutes)").fill("30");
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let intercepted;
  const pending = new Promise((resolve) => { intercepted = resolve; });
  await page.route("**/documents:commit", async (route) => {
    intercepted();
    await gate;
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "Injected failure" } }) });
  });
  await page.getByRole("button", { name: "Save drive" }).click();
  await pending;
  await expect(page.getByRole("button", { name: "Sign out" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Refresh cloud records" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Driving Logs" })).toBeDisabled();
  await expect(page.getByLabel("Choose backup to copy to cloud")).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText("Could not confirm the cloud save");
  await expect(page.getByLabel("Total duration (minutes)")).toHaveValue("30");
  await expect(page.getByRole("button", { name: "Save drive" })).toBeDisabled();
  await page.unroute("**/documents:commit");
  await page.getByRole("button", { name: "Refresh cloud records" }).click();
  await page.getByRole("button", { name: "Log a drive" }).click();
  await page.getByLabel("Total duration (minutes)").fill("30");
  await page.getByRole("button", { name: "Save drive" }).click();
  await expect(page.getByText("30m", { exact: false }).first()).toBeVisible();
});

test("an incompatible backup identifies the field before any copy", async ({ page }) => {
  const family = { version: 1, learners: [{ id: "a", name: "Alex" }], drives: [{ id: "d", learnerId: "a", date: "2026-11-01", minutes: 30, nightMinutes: 0, skills: "", notes: "", routeUrl: "https://example.com:8443/" }] };
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`invalid-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("This account has 0 learners and 0 drives")).toBeVisible();
  await page.getByLabel("Choose backup to copy to cloud").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(family)) });
  await expect(page.getByText(/Drive 1: route link must use HTTPS/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy to account" })).toHaveCount(0);
  await expect(page.getByText("This account has 0 learners and 0 drives")).toBeVisible();
});
