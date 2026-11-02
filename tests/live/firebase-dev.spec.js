import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { initializeApp, deleteApp } from "firebase/app";
import { createUserWithEmailAndPassword, deleteUser, getAuth } from "firebase/auth";

test("live development browser can save, reload and export synthetic records", async ({ page }) => {
  const env = Object.fromEntries(readFileSync(".env.development.local", "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#")).map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
  const projectId = "driveready-dev-jh-261102";
  expect(env.VITE_FIREBASE_PROJECT_ID).toBe(projectId);
  expect(env.VITE_FIREBASE_USE_EMULATORS).toBe("false");
  const firebaseCli = join(dirname(process.execPath), "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
  expect(existsSync(firebaseCli)).toBeTruthy();
  const app = initializeApp({ projectId, apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, appId: env.VITE_FIREBASE_APP_ID }, "live-browser-test");
  const auth = getAuth(app);
  const suffix = randomBytes(10).toString("hex");
  const email = `driveready-browser-${suffix}@example.com`;
  const password = randomBytes(24).toString("base64url");
  let user;
  try {
    user = (await createUserWithEmailAndPassword(auth, email, password)).user;
    expect(user.uid).toMatch(/^[A-Za-z0-9_-]{20,128}$/);
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/");
    const actualProject = await page.evaluate(async () => (await import("/src/app/firebaseClient.ts")).db?.app.options.projectId);
    expect(actualProject).toBe(projectId);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
    await page.getByRole("button", { name: "Use cloud account" }).click();
    await page.getByLabel("Learner name or nickname").fill("Synthetic Test");
    await page.getByRole("button", { name: "Add learner" }).click();
    await page.getByRole("button", { name: "Log a drive" }).click();
    await page.getByLabel("Total duration (minutes)").fill("30");
    await page.getByLabel("Notes").fill("Synthetic live browser test");
    await page.getByRole("button", { name: "Save drive" }).click();
    await expect(page.locator("article")).toContainText("Synthetic live browser test", { timeout: 20000 });
    await page.reload();
    await page.getByRole("button", { name: "Use cloud account" }).click();
    await expect(page.locator("article")).toContainText("Synthetic live browser test", { timeout: 20000 });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download cloud backup" }).click();
    const result = JSON.parse(readFileSync(await (await download).path(), "utf8"));
    expect(result.drives).toHaveLength(1);
    expect(result.drives[0]).toMatchObject({ minutes: 30, notes: "Synthetic live browser test" });
    const upload = (data) => page.getByLabel("Choose backup to copy to cloud").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
    await upload(result);
    await page.getByRole("button", { name: "Copy to account" }).click();
    await expect(page.getByText(/Import finished: 0 copied, 2 already present, 0 conflicts/)).toBeVisible({ timeout: 20000 });
    const recovery = structuredClone(result);
    recovery.learners[0].id = "synthetic-restored-learner";
    recovery.learners[0].name = "Synthetic restored learner";
    recovery.drives[0].id = "synthetic-restored-drive";
    recovery.drives[0].learnerId = "synthetic-restored-learner";
    await upload(recovery);
    await page.getByRole("button", { name: "Copy to account" }).click();
    await expect(page.getByText(/Import finished: 2 copied, 0 already present, 0 conflicts/)).toBeVisible({ timeout: 20000 });
  } finally {
    if (user && /^[A-Za-z0-9_-]{20,128}$/.test(user.uid)) {
      try {
        execFileSync(process.execPath, [firebaseCli, "firestore:delete", `users/${user.uid}`, "--recursive", "--force", "--project", projectId], { stdio: "pipe" });
      } catch { throw new Error(`Could not remove temporary Firestore path users/${user.uid} in ${projectId}.`); }
      finally { await deleteUser(user); }
    }
    await deleteApp(app);
  }
});
