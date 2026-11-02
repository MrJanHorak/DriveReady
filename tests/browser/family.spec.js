import { test, expect } from "@playwright/test";

test("local and cloud workspaces stay separate across import, edit, reload and sign-out", async ({ page }) => {
  const email = `browser-${Date.now()}@example.test`;
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await expect(page.getByText("Use fictional names, notes, and locations only.", { exact: false })).toBeVisible();
  await page.getByLabel("Learner name or nickname").fill("Local learner");
  await page.getByRole("button", { name: "Add learner" }).click();
  await page.getByRole("button", { name: "Log a drive" }).click();
  await page.getByLabel("Total duration (minutes)").fill("30");
  await page.getByRole("button", { name: "Save drive" }).click();
  await expect(page.getByText("30m", { exact: false }).first()).toBeVisible();

  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await expect(page.getByText("This account has 0 learners and 0 drives")).toBeVisible();
  await page.getByRole("button", { name: "Review local records to copy" }).click();
  await page.getByRole("button", { name: "Copy to account" }).click();
  await expect(page.getByText(/Import finished: 2 copied/)).toBeVisible();
  await page.getByRole("button", { name: "Review local records to copy" }).click();
  await page.getByRole("button", { name: "Copy to account" }).click();
  await expect(page.getByText(/0 copied, 2 already present/)).toBeVisible();

  await page.getByRole("button", { name: "Use cloud account" }).click();
  await expect(page.getByText("Practice records: Cloud account")).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Total duration (minutes)").fill("45");
  await page.getByRole("button", { name: "Save drive" }).click();
  await expect(page.getByText("45m", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Use this browser" }).click();
  await expect(page.getByText("30m", { exact: false }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Practice records: This browser")).toBeVisible();
  await page.getByRole("button", { name: "Use cloud account" }).click();
  await expect(page.getByText("45m", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Saved on this device.")).toBeVisible();
  await expect(page.getByText("30m", { exact: false }).first()).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
});
