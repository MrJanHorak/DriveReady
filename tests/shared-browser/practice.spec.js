import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

test("a supervisor retries an uncertain save without duplication and the learner can read it", async ({ browser }) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const app = initializeApp({ projectId: "demo-driveready" }, "practice-browser-admin");
  const db = getFirestore(app), adminAuth = getAuth(app), contexts = [];
  const suffix = Date.now(), password = "synthetic-password-123";
  try {
    const accounts = await Promise.all(["manager", "supervisor", "learner"].map((role) => adminAuth.createUser({ email: `practice-${role}-${suffix}@example.test`, password, emailVerified: true })));
    const [manager, supervisor, learner] = accounts;
    const space = db.collection("spaces").doc(), other = db.collection("spaces").doc(), batch = db.batch();
    batch.set(space, { learnerName: "Practice learner", status: "active", managerUid: manager.uid, learnerUid: learner.uid, invitationVersion: 0 });
    batch.set(other, { learnerName: "Other learner", status: "active", managerUid: manager.uid, learnerUid: null, invitationVersion: 0 });
    for (const [account, role] of [[manager, "manager"], [supervisor, "supervisor"], [learner, "learner"]]) {
      batch.set(space.collection("members").doc(account.uid), { role, active: true, emailAtJoining: account.email });
      batch.set(db.doc(`users/${account.uid}/spaceLinks/${space.id}`), { spaceId: space.id });
    }
    batch.set(other.collection("members").doc(manager.uid), { role: "manager", active: true, emailAtJoining: manager.email });
    batch.set(db.doc(`users/${manager.uid}/spaceLinks/${other.id}`), { spaceId: other.id });
    await batch.commit();
    async function login(account) {
      const context = await browser.newContext(); contexts.push(context);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4173/");
      await page.getByLabel("Email", { exact: true }).fill(account.email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Shared practice · local emulator" })).toBeVisible();
      return page;
    }
    const adultPage = await login(supervisor);
    await adultPage.getByLabel("Practice date").fill("2026-10-30");
    await adultPage.getByLabel("Total minutes").fill("60");
    await adultPage.getByLabel("Night minutes").fill("15");
    await adultPage.getByLabel("Shared practice notes").fill("Synthetic first drive");
    let submitted;
    await adultPage.route("**/v1/drives", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submitted = route.request().postDataJSON();
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    });
    await adultPage.getByRole("button", { name: "Save shared practice" }).click();
    await expect(adultPage.getByText("Could not confirm the request.", { exact: false })).toBeVisible();
    await expect(adultPage.getByLabel("Shared practice notes")).toBeDisabled();
    await expect(adultPage.getByRole("button", { name: "Retry same practice save" })).toBeDisabled();
    await adultPage.unroute("**/v1/drives");
    await adultPage.getByRole("button", { name: "Refresh spaces" }).click();
    await adultPage.getByRole("button", { name: "Refresh practice history" }).click();
    await expect(adultPage.getByRole("list", { name: "Shared practice history" })).toContainText("Synthetic first drive");
    await adultPage.getByRole("button", { name: "Retry same practice save" }).click();
    await expect(adultPage.getByText("Practice drive saved.")).toBeVisible();
    const records = await space.collection("drives").get();
    expect(records.size).toBe(1);
    expect(records.docs[0].id).toBe(submitted.operationId);
    expect(records.docs[0].data().recordedByUid).toBe(supervisor.uid);
    expect(records.docs[0].data().supervisorPresentUid).toBe(supervisor.uid);
    const learnerPage = await login(learner);
    await expect(learnerPage.getByRole("list", { name: "Shared practice history" })).toContainText("Synthetic first drive");
    await expect(learnerPage.getByLabel("Shared practice totals")).toContainText("60 minutes, including 15 at night");
    await expect(learnerPage.getByRole("button", { name: "Save shared practice" })).toHaveCount(0);
    const managerPage = await login(manager);
    await managerPage.getByRole("combobox", { name: "Practice learner" }).selectOption({ label: "Other learner · manager" });
    await expect(managerPage.getByRole("list", { name: "Shared practice history" })).not.toContainText("Synthetic first drive");
    await expect(managerPage.getByLabel("Shared practice totals")).toContainText("0 minutes, including 0 at night");
    await adultPage.getByLabel("Practice date").fill("2026-10-31");
    await adultPage.getByLabel("Total minutes").fill("20");
    await adultPage.route("**/v1/drives", async (route) => route.request().method() === "POST" ? route.abort("failed") : route.continue());
    await adultPage.getByRole("button", { name: "Save shared practice" }).click();
    await expect(adultPage.getByText("Could not confirm the request.", { exact: false })).toBeVisible();
    await space.collection("members").doc(supervisor.uid).update({ active: false });
    await db.doc(`users/${supervisor.uid}/spaceLinks/${space.id}`).delete();
    await adultPage.getByRole("button", { name: "Refresh spaces" }).click();
    await expect(adultPage.getByText(/pending save cannot be retried/)).toBeVisible();
    await adultPage.getByRole("button", { name: "Discard retry details" }).click();
    await adultPage.getByRole("button", { name: "Confirm discard" }).click();
    await expect(adultPage.getByText(/pending save cannot be retried/)).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await deleteApp(app);
  }
});
