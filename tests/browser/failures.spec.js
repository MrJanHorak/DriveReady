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
    await first.getByRole("button", { name: "Use cloud account" }).click();
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
    await second.getByRole("button", { name: "Use cloud account" }).click();
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

test("interrupted import preserves the local copy and retry completes it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Learner name or nickname").fill("Local learner");
  await page.getByRole("button", { name: "Add learner" }).click();
  await page.getByRole("button", { name: "Log a drive" }).click();
  await page.getByLabel("Total duration (minutes)").fill("30");
  await page.getByRole("button", { name: "Save drive" }).click();
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
  await page.getByRole("button", { name: "Review local records to copy" }).click();
  await page.getByRole("button", { name: "Copy to account" }).click();
  await pending;
  await expect(page.getByRole("button", { name: "Sign out" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Use cloud account" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Driving Logs" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add learner" })).toBeDisabled();
  release();
  await expect(page.getByText("Import was interrupted.", { exact: false })).toBeVisible();
  expect(commits).toBe(2);
  await expect(page.getByText("30m", { exact: false }).first()).toBeVisible();
  await page.unroute(commitUrl);
  await page.getByRole("button", { name: "Review local records to copy" }).click();
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
  await expect(page.getByRole("button", { name: "Use cloud account" })).toBeVisible();
  await page.getByRole("button", { name: "Use cloud account" }).click();
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
  await expect(page.getByRole("button", { name: "Use this browser" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Driving Logs" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Review local records to copy" })).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText("Could not save to your account");
  await expect(page.getByLabel("Total duration (minutes)")).toHaveValue("30");
  await page.unroute("**/documents:commit");
  await page.getByRole("button", { name: "Save drive" }).click();
  await expect(page.getByText("30m", { exact: false }).first()).toBeVisible();
});
