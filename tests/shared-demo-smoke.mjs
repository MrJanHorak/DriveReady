// Run while npm run demo:shared is running; uses only the seeded fictional accounts.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const role of ["manager", "supervisor", "learner"]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4173/");
      await page.getByText("Shared local demo.", { exact: false }).waitFor();
      await page.getByLabel("Email", { exact: true }).fill(`${role}@example.test`);
      const password = page.getByLabel("Password", { exact: true });
      await password.fill("fictional-drive-123");
      await page.getByRole("button", { name: "Show password" }).click();
      assert.equal(await password.getAttribute("type"), "text");
      await page.getByRole("button", { name: "Hide password" }).click();
      assert.equal(await password.getAttribute("type"), "password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.getByRole("button", { name: "Shared space", exact: true }).click();
      await page.getByRole("list", { name: "Shared spaces" }).getByText("Alex Example", { exact: false }).waitFor();
      await page.getByRole("button", { name: "Account", exact: true }).click();
      await page.getByText(`Signed in as ${role}@example.test`).waitFor();
      console.log(`${role}: sign-in and shared space verified`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
