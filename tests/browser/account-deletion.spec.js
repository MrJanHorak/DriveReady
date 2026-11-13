import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

const password = "synthetic-password-123";

async function signIn(page, email) {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("managers are sent to delete their spaces first; a supervisor can delete their own account", async ({ browser }) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const app = initializeApp({ projectId: "demo-driveready" }, "account-deletion-admin");
  const db = getFirestore(app), adminAuth = getAuth(app);
  const managerContext = await browser.newContext(), supervisorContext = await browser.newContext();
  try {
    const stamp = Date.now();
    const manager = await adminAuth.createUser({ email: `acct-m-${stamp}@example.test`, password, emailVerified: true });
    const supervisor = await adminAuth.createUser({ email: `acct-s-${stamp}@example.test`, password, emailVerified: true });
    const space = db.collection("spaces").doc(), driveId = randomUUID(), batch = db.batch();
    batch.set(space, { learnerName: "Robin Account", status: "active", managerUid: manager.uid, learnerUid: null, invitationVersion: 0 });
    for (const [user, role] of [[manager, "manager"], [supervisor, "supervisor"]]) {
      batch.set(space.collection("members").doc(user.uid), { role, active: true, emailAtJoining: user.email });
      batch.set(db.doc(`users/${user.uid}/spaceLinks/${space.id}`), { spaceId: space.id });
    }
    batch.set(space.collection("drives").doc(driveId), { date: "2026-10-03", minutes: 30, nightMinutes: 0, notes: "", recordedByUid: supervisor.uid, lastEditedByUid: supervisor.uid, supervisorPresentUid: supervisor.uid });
    await batch.commit();

    // The manager is pointed to People & access instead of a delete form.
    const managerPage = await managerContext.newPage();
    await signIn(managerPage, manager.email);
    await expect(managerPage.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await managerPage.getByRole("button", { name: "Account", exact: true }).click();
    const managerZone = managerPage.getByRole("region", { name: "Delete account" });
    await managerZone.getByRole("button", { name: "Delete my account…" }).click();
    await expect(managerZone.getByText("Robin Account")).toBeVisible();
    await expect(managerZone.getByRole("button", { name: "Delete account permanently" })).toHaveCount(0);
    await managerZone.getByRole("button", { name: "Go to People & access" }).click();
    await expect(managerPage.getByRole("heading", { name: "People & access" })).toBeVisible();

    // The supervisor confirms with email and password and the account is gone.
    const page = await supervisorContext.newPage();
    await signIn(page, supervisor.email);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await page.getByRole("button", { name: "Account", exact: true }).click();
    const zone = page.getByRole("region", { name: "Delete account" });
    await zone.getByRole("button", { name: "Delete my account…" }).click();
    const confirm = zone.getByRole("button", { name: "Delete account permanently" });
    await zone.getByLabel("Type your email to confirm").fill(supervisor.email);
    await zone.getByLabel("Password").fill("wrong-password-000");
    await confirm.click();
    await expect(zone.getByText("That password isn’t right. Nothing was deleted.")).toBeVisible();
    await zone.getByLabel("Password").fill(password);
    await confirm.click();
    await expect(page.getByText("Your account was deleted.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(adminAuth.getUser(supervisor.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
    const membership = (await space.collection("members").doc(supervisor.uid).get()).data();
    expect(membership.active).toBe(false);
    expect(membership.emailAtJoining).toBeUndefined();
    expect((await space.collection("drives").doc(driveId).get()).exists).toBe(true);
  } finally {
    await managerContext.close(); await supervisorContext.close();
    await deleteApp(app);
  }
});
