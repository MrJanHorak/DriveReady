import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

test("the printable practice log lists every drive in date order with totals and prints only the log", async ({ browser }) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const app = initializeApp({ projectId: "demo-driveready" }, "practice-log-admin");
  const db = getFirestore(app), adminAuth = getAuth(app);
  const context = await browser.newContext({ timezoneId: "America/New_York" });
  try {
    const password = "synthetic-password-123";
    const manager = await adminAuth.createUser({ email: `log-${Date.now()}@example.test`, password, emailVerified: true });
    const space = db.collection("spaces").doc(), batch = db.batch();
    batch.set(space, { learnerName: "Morgan Example", status: "active", managerUid: manager.uid, learnerUid: null, invitationVersion: 0 });
    batch.set(space.collection("members").doc(manager.uid), { role: "manager", active: true, emailAtJoining: manager.email });
    batch.set(db.doc(`users/${manager.uid}/spaceLinks/${space.id}`), { spaceId: space.id });
    const drive = (date, minutes, nightMinutes, extra = {}) => batch.set(space.collection("drives").doc(randomUUID()), { date, minutes, nightMinutes, notes: "", recordedByUid: manager.uid, lastEditedByUid: manager.uid, supervisorPresentUid: manager.uid, ...extra });
    drive("2026-10-20", 90, 30, { notes: "Fictional evening drive", practicedSkills: ["Turns"], practicedConditions: ["Rain"], routeSnapshot: { name: "River loop", start: "A", destination: "B" } });
    drive("2026-09-02", 60, 0, { routeSnapshot: { name: "School run", start: "A", destination: "B" } });
    drive("2026-11-01", 30, 0);
    await batch.commit();

    const page = await context.newPage();
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill(manager.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Driving Logs", exact: true }).click();
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
    await page.getByRole("button", { name: "Print log" }).click();

    const log = page.getByRole("dialog", { name: "Practice log" });
    await expect(log.getByRole("heading", { name: "Morgan Example" })).toBeVisible();
    await expect(log).toContainText("Sep 2, 2026 – Nov 1, 2026");
    const totals = log.getByLabel("Practice totals");
    await expect(totals).toContainText("Drives3");
    await expect(totals).toContainText("Total3h 00mof 40 h");
    await expect(totals).toContainText("Night30mof 6 h");
    await expect(totals).toContainText("Day2h 30mof 34 h");
    const rows = log.locator("tbody tr");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Sep 2, 2026");
    await expect(rows.nth(1)).toContainText("Oct 20, 2026River loop1h 30m30mTurns, Rain");
    await expect(rows.nth(1)).toContainText(manager.email);
    await expect(rows.nth(1)).toContainText("Fictional evening drive");
    await expect(log.locator("tfoot")).toContainText("3h 00m");
    await expect(log).toContainText("not an official form");

    await log.getByRole("button", { name: "Print / Save as PDF" }).click();
    expect(await page.evaluate(() => window.__printed)).toBe(1);

    // In print, only the log sheet shows.
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("#root")).toBeHidden();
    await expect(log.getByRole("button", { name: "Print / Save as PDF" })).toBeHidden();
    await expect(log.getByRole("heading", { name: "Morgan Example" })).toBeVisible();
    await page.emulateMedia({ media: "screen" });

    await page.keyboard.press("Escape");
    await expect(log).toBeHidden();
    await expect(page.getByRole("button", { name: "Print log" })).toBeVisible();
  } finally {
    await context.close();
    await deleteApp(app);
  }
});
