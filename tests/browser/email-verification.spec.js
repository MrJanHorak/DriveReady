import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase/app";
import { applyActionCode, connectAuthEmulator, getAuth } from "firebase/auth";

test("verification is requested explicitly and the status can be refreshed", async ({ page }) => {
  const email = `verify-${Date.now()}@example.test`;
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByText("Email not verified.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Refresh verification status" }).click();
  await expect(page.getByText("Email not verified yet.", { exact: false })).toBeVisible();
  const before = await page.request.get("http://127.0.0.1:9099/emulator/v1/projects/demo-driveready/oobCodes");
  expect((await before.json()).oobCodes?.filter((item) => item.email === email) ?? []).toHaveLength(0);
  await page.getByRole("button", { name: "Send verification email" }).click();
  await expect(page.getByText("Verification email requested.", { exact: false })).toBeVisible();
  const response = await page.request.get("http://127.0.0.1:9099/emulator/v1/projects/demo-driveready/oobCodes");
  const code = (await response.json()).oobCodes.find((item) => item.email === email && item.requestType === "VERIFY_EMAIL");
  expect(code).toBeTruthy();
  const app = initializeApp({ apiKey: "demo-key", projectId: "demo-driveready", authDomain: "demo-driveready.firebaseapp.com", appId: "demo-app" }, "verify-browser-test");
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    await applyActionCode(auth, code.oobCode);
  } finally { await deleteApp(app); }
  await page.getByRole("button", { name: "Refresh verification status" }).click();
  await expect(page.getByText("Email verified", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send verification email" })).toHaveCount(0);
});
