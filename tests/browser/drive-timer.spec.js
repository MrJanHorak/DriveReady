import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

const geometry = [{ lat: 33.47, lng: -82.01 }, { lat: 33.48, lng: -82.02 }];

test("the drive timer survives a reload, excludes pauses, fills the drive form and clears once the drive is saved", async ({ browser }) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const app = initializeApp({ projectId: "demo-driveready" }, "drive-timer-admin");
  const db = getFirestore(app), adminAuth = getAuth(app);
  const context = await browser.newContext({ timezoneId: "America/New_York" });
  try {
    const password = "synthetic-password-123";
    const manager = await adminAuth.createUser({ email: `drive-timer-${Date.now()}@example.test`, password, emailVerified: true });
    const space = db.collection("spaces").doc(), routeId = randomUUID(), batch = db.batch();
    batch.set(space, { learnerName: "Jordan Example", status: "active", managerUid: manager.uid, learnerUid: null, invitationVersion: 0 });
    batch.set(space.collection("members").doc(manager.uid), { role: "manager", active: true, emailAtJoining: manager.email });
    batch.set(db.doc(`users/${manager.uid}/spaceLinks/${space.id}`), { spaceId: space.id });
    batch.set(space.collection("routes").doc(routeId), { name: "Timer loop", start: "Example start", destination: "Example end", geometry, createdByUid: manager.uid });
    await batch.commit();

    const page = await context.newPage();
    await page.clock.install();
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill(manager.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();

    const card = page.getByLabel("Practice dashboard").getByLabel("Drive timer");
    const clock = card.getByRole("timer", { name: "Driving time" });
    await card.getByRole("button", { name: "Start drive timer" }).click();
    await expect(card).toContainText("Drive in progress · Jordan Example");
    await expect(clock).toHaveText("00:00");
    await page.clock.fastForward("20:00");
    await expect(clock).toHaveText("20:00");
    await card.getByRole("button", { name: "Pause" }).click();
    await page.clock.fastForward("05:00");
    await expect(clock).toHaveText("20:00");
    await card.getByRole("button", { name: "Resume" }).click();
    await page.clock.fastForward("12:00");
    await expect(clock).toHaveText("32:00");

    // A reload (or a locked phone) keeps the running drive.
    await page.reload();
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(clock).toHaveText(/^32:0\d$/);
    await expect(card).toContainText("pauses not counted");

    await card.getByRole("button", { name: "Stop & log" }).click();
    await expect(page.getByLabel("Practice learner")).toHaveValue(space.id);
    await expect(page.getByLabel("Total minutes")).toHaveValue("32");
    await expect(page.getByLabel("Practice date")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByText("Filled in from the drive timer: 32 min", { exact: false })).toBeVisible();
    // The stopped drive stays available until it is logged or discarded.
    const logsCard = page.getByRole("region", { name: "Practice log" }).getByLabel("Drive timer");
    await expect(logsCard).toContainText("Drive finished");

    await page.getByLabel("Choose a saved route").selectOption(routeId);
    await page.getByRole("group", { name: /Skills practised/ }).getByLabel("Turns").check();
    await page.getByRole("button", { name: "Save shared practice" }).click();
    await expect(page.getByText("Practice drive saved.")).toBeVisible();
    await expect(logsCard.getByRole("button", { name: "Start drive timer" })).toBeVisible();
    const saved = (await space.collection("drives").get()).docs.map((item) => item.data());
    expect(saved).toHaveLength(1);
    expect(saved[0].minutes).toBe(32);

    // Discarding asks first and leaves nothing behind.
    await logsCard.getByRole("button", { name: "Start drive timer" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await logsCard.getByRole("button", { name: "Discard timed drive" }).click();
    await expect(logsCard.getByRole("button", { name: "Start drive timer" })).toBeVisible();
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("driveready.driveTimer")))).toEqual([]);
  } finally {
    await context.close();
    await deleteApp(app);
  }
});
