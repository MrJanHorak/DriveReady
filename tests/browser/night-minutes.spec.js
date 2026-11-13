import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

// Augusta-area route; sunset there on 2026-11-12 is about 5:27 pm EST.
const geometry = [{ lat: 33.4735, lng: -82.0105 }, { lat: 33.48, lng: -82.02 }];

test("night minutes are suggested from the start time and sunset, filled in, and can be overridden", async ({ browser }) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const app = initializeApp({ projectId: "demo-driveready" }, "night-minutes-admin");
  const db = getFirestore(app), adminAuth = getAuth(app);
  const context = await browser.newContext({ timezoneId: "America/New_York" });
  try {
    const password = "synthetic-password-123";
    const manager = await adminAuth.createUser({ email: `night-${Date.now()}@example.test`, password, emailVerified: true });
    const space = db.collection("spaces").doc(), routeId = randomUUID(), batch = db.batch();
    batch.set(space, { learnerName: "Riley Example", status: "active", managerUid: manager.uid, learnerUid: null, invitationVersion: 0 });
    batch.set(space.collection("members").doc(manager.uid), { role: "manager", active: true, emailAtJoining: manager.email });
    batch.set(db.doc(`users/${manager.uid}/spaceLinks/${space.id}`), { spaceId: space.id });
    batch.set(space.collection("routes").doc(routeId), { name: "Evening loop", start: "Example start", destination: "Example end", geometry, createdByUid: manager.uid });
    await batch.commit();

    const page = await context.newPage();
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill(manager.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Driving Logs", exact: true }).click();
    await page.getByRole("button", { name: "Log a drive", exact: true }).click();

    const night = page.getByLabel("Night minutes");
    const help = page.locator("#night-help");
    await expect(help).toHaveText("Add a start time to get a suggestion from sunset and sunrise.");
    await page.getByLabel("Choose a saved route").selectOption(routeId);
    await page.getByLabel("Practice date").fill("2026-11-12");
    await page.getByLabel("Total minutes").fill("60");
    await page.getByLabel("Start time").fill("17:00");
    await expect(help).toContainText("near the route’s start");
    await expect(help).toContainText("sunset 5:2");
    const suggested = Number(await night.inputValue());
    expect(suggested).toBeGreaterThanOrEqual(31);
    expect(suggested).toBeLessThanOrEqual(35);
    await expect(help).toContainText(`Suggested ${suggested} min`);

    // A manual value wins until the suggestion is chosen again.
    await night.fill("10");
    await page.getByLabel("Total minutes").fill("90");
    await expect(night).toHaveValue("10");
    await help.getByRole("button", { name: /^Use \d+$/ }).click();
    const longer = Number(await night.inputValue());
    expect(longer).toBe(suggested + 30);

    // A daytime drive suggests none.
    await page.getByLabel("Start time").fill("10:00");
    await expect(night).toHaveValue("0");

    await page.getByLabel("Start time").fill("17:00");
    await page.getByRole("button", { name: "Save shared practice" }).click();
    await expect(page.getByText("Practice drive saved.")).toBeVisible();
    const saved = (await space.collection("drives").get()).docs.map((item) => item.data());
    expect(saved[0].minutes).toBe(90);
    expect(saved[0].nightMinutes).toBe(longer);
  } finally {
    await context.close();
    await deleteApp(app);
  }
});
