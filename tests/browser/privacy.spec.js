import { test, expect } from "@playwright/test";

test("the privacy notice is reachable before signing in, from the sidebar and the sign-in panel", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Privacy", exact: true }).first().click();
  const notice = page.getByRole("main", { name: "Privacy notice" });
  await expect(notice.getByRole("heading", { name: "What DriveReady keeps, and who can see it" })).toBeVisible();
  for (const text of ["Google Firebase", "Railway", "Vercel", "OpenStreetMap", "OSRM", "no advertising or analytics trackers", "Notes are shared"]) await expect(notice).toContainText(text);
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(notice).toBeHidden();
  await page.getByRole("main").getByRole("button", { name: "Privacy" }).click();
  await expect(notice).toBeVisible();
});
