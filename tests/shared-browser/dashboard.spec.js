import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

const geometry = [{ lat: 33.47, lng: -82.01 }, { lat: 33.48, lng: -82.02 }];

test("dashboard shows hours, recent drives and coverage, and Log a drive saves skills for the chosen learner", async ({ browser }) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const app = initializeApp({ projectId: "demo-driveready" }, "dashboard-browser-admin");
  const db = getFirestore(app), adminAuth = getAuth(app), context = await browser.newContext();
  try {
    const password = "synthetic-password-123";
    const manager = await adminAuth.createUser({ email: `dashboard-${Date.now()}@example.test`, password, emailVerified: true });
    const first = db.collection("spaces").doc(), second = db.collection("spaces").doc(), batch = db.batch();
    for (const [ref, name] of [[first, "Avery Example"], [second, "Blake Example"]]) {
      batch.set(ref, { learnerName: name, status: "active", managerUid: manager.uid, learnerUid: null, invitationVersion: 0 });
      batch.set(ref.collection("members").doc(manager.uid), { role: "manager", active: true, emailAtJoining: manager.email });
      batch.set(db.doc(`users/${manager.uid}/spaceLinks/${ref.id}`), { spaceId: ref.id });
      batch.set(ref.collection("routes").doc(randomUUID()), { name: `${name} loop`, start: "Example start", destination: "Example end", geometry, createdByUid: manager.uid });
    }
    // Avery: 3h total, 1h at night, with tagged and untagged (older) drives.
    batch.set(first.collection("drives").doc(randomUUID()), { date: "2026-10-01", minutes: 120, nightMinutes: 60, notes: "", recordedByUid: manager.uid, lastEditedByUid: manager.uid, supervisorPresentUid: manager.uid, practicedSkills: ["Turns", "Parking"], practicedConditions: ["Rain"], routeSnapshot: { name: "Avery loop", start: "Example start", destination: "Example end" } });
    batch.set(first.collection("drives").doc(randomUUID()), { date: "2026-09-20", minutes: 60, nightMinutes: 0, notes: "", recordedByUid: manager.uid, lastEditedByUid: manager.uid, supervisorPresentUid: manager.uid });
    await batch.commit();

    const page = await context.newPage();
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill(manager.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();

    const dashboard = page.getByLabel("Practice dashboard");
    await page.getByRole("button", { name: /Change learner/ }).click();
    await page.getByRole("option", { name: /Avery Example/ }).click();
    await expect(dashboard.getByRole("img", { name: "3 of 40 hrs" })).toBeVisible();
    await expect(dashboard.getByText("37 hrs left")).toBeVisible();
    await expect(dashboard.getByText("1/6 hrs")).toBeVisible();
    const recent = dashboard.getByRole("table");
    await expect(recent.locator("tbody tr")).toHaveCount(2);
    await expect(recent.locator("tbody tr").first()).toContainText("Avery loop");
    await expect(recent.locator("tbody tr").first()).toContainText("Turns");
    const coverage = dashboard.getByLabel("Practice coverage");
    await expect(coverage.getByRole("listitem").filter({ hasText: "Turns" })).toContainText("×1");
    await expect(coverage.getByText("Something new to try:", { exact: false })).toContainText("Starting and stopping");
    await expect(dashboard.getByLabel("Saved routes")).toContainText("Avery Example loop");

    // Switch learners: totals and routes belong only to the chosen learner.
    await page.getByRole("button", { name: /Change learner/ }).click();
    await page.getByRole("option", { name: /Blake Example/ }).click();
    await expect(dashboard.getByRole("img", { name: "0 of 40 hrs" })).toBeVisible();
    await expect(dashboard.getByText("No drives logged yet")).toBeVisible();
    await expect(dashboard.getByLabel("Saved routes")).toContainText("Blake Example loop");
    await expect(dashboard.getByLabel("Saved routes")).not.toContainText("Avery");

    // Log a drive opens the form for Blake on Driving Logs.
    await dashboard.getByRole("button", { name: "Log a drive", exact: true }).click();
    await expect(page.getByLabel("Practice learner")).toHaveValue(second.id);
    const blakeRoute = (await second.collection("routes").get()).docs[0].id;
    await page.getByLabel("Choose a saved route").selectOption(blakeRoute);
    await page.getByLabel("Practice date").fill("2026-11-02");
    await page.getByLabel("Total minutes").fill("30");
    await page.getByLabel("Night minutes").fill("0");
    await page.getByRole("group", { name: /Skills practised/ }).getByLabel("Roundabouts").check();
    await page.getByRole("group", { name: /Roads and conditions/ }).getByLabel("Highway").check();
    await page.getByRole("button", { name: "Save shared practice" }).click();
    await expect(page.getByText("Practice drive saved.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Shared practice history" })).toContainText("Roundabouts");

    const saved = (await second.collection("drives").get()).docs.map((item) => item.data());
    expect(saved).toHaveLength(1);
    expect(saved[0].practicedSkills).toEqual(["Roundabouts"]);
    expect(saved[0].practicedConditions).toEqual(["Highway"]);
    expect((await first.collection("drives").get()).size).toBe(2);

    // Returning to the dashboard shows the new drive without a manual refresh.
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(dashboard.getByRole("table").locator("tbody tr")).toHaveCount(1);
    await expect(dashboard.getByRole("table")).toContainText("Roundabouts");
  } finally {
    await context.close();
    await deleteApp(app);
  }
});
