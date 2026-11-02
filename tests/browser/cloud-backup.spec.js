import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("cloud backup fetches the latest records and restores explicitly to the browser", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await page.getByLabel("Learner name or nickname").fill("Local learner");
  await page.getByRole("button", { name: "Add learner" }).click();
  await page.getByRole("button", { name: "Log a drive" }).click();
  await page.getByLabel("Total duration (minutes)").fill("30");
  await page.getByRole("button", { name: "Save drive" }).click();
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`backup-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("This account has 0 learners and 0 drives")).toBeVisible();
  await page.getByRole("button", { name: "Review local records to copy" }).click();
  await page.getByRole("button", { name: "Copy to account" }).click();
  await expect(page.getByText(/Import finished: 2 copied/)).toBeVisible();
  await page.getByRole("button", { name: "Use cloud account" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Total duration (minutes)").fill("45");
  await page.getByLabel("Notes").fill("Cloud-only note");
  await page.getByRole("button", { name: "Save drive" }).click();
  await expect(page.getByText("Cloud-only note")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download cloud backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("driveready-cloud-backup.json");
  const contents = await readFile(await download.path());
  const backup = JSON.parse(contents.toString("utf8"));
  expect(backup.learners).toHaveLength(1);
  expect(backup.drives).toHaveLength(1);
  expect(backup.drives[0]).toMatchObject({ minutes: 45, notes: "Cloud-only note" });

  await page.getByRole("button", { name: "Use this browser" }).click();
  await expect(page.getByText("30m", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Cloud-only note")).toHaveCount(0);
  await page.getByLabel("Choose backup to review").setInputFiles({ name: "cloud.json", mimeType: "application/json", buffer: contents });
  await expect(page.getByText("Review backup:", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Replace with this backup" }).click();
  await expect(page.getByText("Backup restored on this browser.")).toBeVisible();
  await expect(page.getByText("Cloud-only note")).toBeVisible();
});

test("cloud backup does not download a stale copy while offline", async ({ page, context }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`backup-offline-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("This account has 0 learners and 0 drives")).toBeVisible();
  let downloaded = false;
  page.on("download", () => { downloaded = true; });
  try {
    await context.setOffline(true);
    await page.getByRole("button", { name: "Download cloud backup" }).click();
    await expect(page.getByText("Could not prepare a cloud backup.", { exact: false })).toBeVisible({ timeout: 20000 });
    expect(downloaded).toBe(false);
  } finally { await context.setOffline(false); }
});
