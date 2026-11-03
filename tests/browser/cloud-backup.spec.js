import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("cloud backup fetches the latest account records", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`backup-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByText("This account has 0 learners and 0 drives")).toBeVisible();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByLabel("Learner name or nickname").fill("Cloud learner");
  await page.getByRole("button", { name: "Add learner" }).click();
  await page.getByRole("button", { name: "Log a drive" }).click();
  await page.getByLabel("Total duration (minutes)").fill("45");
  await page.getByLabel("Notes").fill("Cloud-only note");
  await page.getByRole("button", { name: "Save drive" }).click();
  await expect(page.getByText("Cloud-only note")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Download cloud backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("driveready-cloud-backup.json");
  const contents = await readFile(await download.path());
  const backup = JSON.parse(contents.toString("utf8"));
  expect(backup.learners).toHaveLength(1);
  expect(backup.drives).toHaveLength(1);
  expect(backup.drives[0]).toMatchObject({ minutes: 45, notes: "Cloud-only note" });

});

test("cloud backup does not download a stale copy while offline", async ({ page, context }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`backup-offline-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
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

test("a backup can be reviewed and copied to cloud without overwriting conflicts", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`restore-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByText("This account has 0 learners and 0 drives")).toBeVisible();
  const backup = { version: 1, learners: [{ id: "backup-learner", name: "Backup learner" }], drives: [{ id: "backup-drive", learnerId: "backup-learner", date: "2026-11-01", minutes: 42, nightMinutes: 0, skills: "", notes: "Backup note" }] };
  const upload = (data) => page.getByLabel("Choose backup to copy to cloud").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  await upload(backup);
  await expect(page.getByText("Copy 1 backup learner and 1 backup drive", { exact: false })).toBeVisible();
  await expect(page.getByText("This account has 0 learners and 0 drives")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copy to account" })).toHaveCount(0);
  await upload(backup);
  await page.getByRole("button", { name: "Copy to account" }).click();
  await expect(page.getByText(/Import finished: 2 copied, 0 already present, 0 conflicts/)).toBeVisible();
  await upload(backup);
  await page.getByRole("button", { name: "Copy to account" }).click();
  await expect(page.getByText(/Import finished: 0 copied, 2 already present, 0 conflicts/)).toBeVisible();
  await upload({ ...backup, learners: [{ id: "backup-learner", name: "Different learner" }] });
  await page.getByRole("button", { name: "Copy to account" }).click();
  await expect(page.getByText(/Import finished: 0 copied, 0 already present, 2 conflicts/)).toBeVisible();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Refresh cloud records" }).click();
  await expect(page.getByRole("combobox", { name: "Learner" })).toHaveValue("backup-learner");
  await expect(page.getByText("Backup note")).toBeVisible();
});

test("invalid or oversized backup files cannot be copied to cloud", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`bad-backup-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByText("This account has 0 learners and 0 drives")).toBeVisible();
  const input = page.getByLabel("Choose backup to copy to cloud");
  await input.setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("not json") });
  await expect(page.getByText("This file is not a valid DriveReady backup. Nothing was copied.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy to account" })).toHaveCount(0);
  await input.setInputFiles({ name: "large.json", mimeType: "application/json", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(page.getByText("This backup is larger than 5 MB. Nothing was copied.")).toBeVisible();
  await expect(page.getByText("This account has 0 learners and 0 drives")).toBeVisible();
});

test("a backup copy interrupted after one record can be retried safely", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`backup-interrupted-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByText("This account has 0 learners and 0 drives")).toBeVisible();
  const backup = { version: 1, learners: [{ id: "a", name: "Backup learner" }], drives: [{ id: "d", learnerId: "a", date: "2026-11-01", minutes: 30, nightMinutes: 0, skills: "", notes: "" }] };
  const file = { name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) };
  let commits = 0;
  await page.route("**/documents:commit", async (route) => {
    if (++commits === 2) await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "Injected failure" } }) });
    else await route.continue();
  });
  await page.getByLabel("Choose backup to copy to cloud").setInputFiles(file);
  await page.getByRole("button", { name: "Copy to account" }).click();
  await expect(page.getByText("Import was interrupted.", { exact: false })).toBeVisible();
  expect(commits).toBe(2);
  await page.unroute("**/documents:commit");
  await page.getByLabel("Choose backup to copy to cloud").setInputFiles(file);
  await page.getByRole("button", { name: "Copy to account" }).click();
  await expect(page.getByText(/Import finished: 1 copied, 1 already present, 0 conflicts/)).toBeVisible();
  await expect(page.getByText("This account has 1 learner and 1 drive")).toBeVisible();
});
