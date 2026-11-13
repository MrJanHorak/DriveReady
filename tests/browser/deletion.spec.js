import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

const geometry = [{ lat: 33.47, lng: -82.01 }, { lat: 33.48, lng: -82.02 }];
const password = "synthetic-password-123";

async function signIn(page, email) {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("supervisors can delete drives and routes, leave a space, and the manager can delete the whole space", async ({ browser }) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const app = initializeApp({ projectId: "demo-driveready" }, "deletion-admin");
  const db = getFirestore(app), adminAuth = getAuth(app);
  const managerContext = await browser.newContext(), supervisorContext = await browser.newContext();
  try {
    const stamp = Date.now();
    const manager = await adminAuth.createUser({ email: `del-m-${stamp}@example.test`, password, emailVerified: true });
    const supervisor = await adminAuth.createUser({ email: `del-s-${stamp}@example.test`, password, emailVerified: true });
    const space = db.collection("spaces").doc(), routeId = randomUUID(), keepDrive = randomUUID(), dropDrive = randomUUID(), batch = db.batch();
    batch.set(space, { learnerName: "Casey Delete", status: "active", managerUid: manager.uid, learnerUid: null, invitationVersion: 0 });
    for (const [user, role] of [[manager, "manager"], [supervisor, "supervisor"]]) {
      batch.set(space.collection("members").doc(user.uid), { role, active: true, emailAtJoining: user.email });
      batch.set(db.doc(`users/${user.uid}/spaceLinks/${space.id}`), { spaceId: space.id });
    }
    batch.set(space.collection("routes").doc(routeId), { name: "Doomed route", start: "Example start", destination: "Example end", geometry, createdByUid: manager.uid });
    const drive = (id, date) => batch.set(space.collection("drives").doc(id), { date, minutes: 40, nightMinutes: 0, notes: "", recordedByUid: manager.uid, lastEditedByUid: manager.uid, supervisorPresentUid: manager.uid, routeId, routeSnapshot: { name: "Doomed route", start: "Example start", destination: "Example end", geometry } });
    drive(keepDrive, "2026-10-01"); drive(dropDrive, "2026-10-02");
    await batch.commit();

    const page = await managerContext.newPage();
    page.on("dialog", (dialog) => dialog.accept());
    await signIn(page, manager.email);

    // Delete one drive.
    await page.getByRole("button", { name: "Driving Logs", exact: true }).click();
    const history = page.getByRole("list", { name: "Shared practice history" });
    await expect(history.locator(":scope > li")).toHaveCount(2);
    await history.locator(":scope > li").filter({ hasText: "Oct 2, 2026" }).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Practice drive deleted.")).toBeVisible();
    await expect(history.locator(":scope > li")).toHaveCount(1);
    expect((await space.collection("drives").doc(dropDrive).get()).exists).toBe(false);

    // Delete the route; the drive keeps its route copy and the drive form drops the route.
    await page.getByRole("button", { name: "Routes", exact: true }).click();
    const routes = page.getByRole("list", { name: "Shared routes" });
    await routes.locator("summary").first().click();
    await routes.getByRole("button", { name: "Delete route" }).click();
    await expect(page.getByText("Route deleted.")).toBeVisible();
    await expect(routes.locator(":scope > li")).toHaveCount(0);
    expect((await space.collection("drives").doc(keepDrive).get()).data().routeSnapshot.name).toBe("Doomed route");
    await page.getByRole("button", { name: "Driving Logs", exact: true }).click();
    await page.getByRole("button", { name: "Log a drive", exact: true }).click();
    await expect(page.getByLabel("Choose a saved route").locator("option")).toHaveCount(1);
    await page.getByRole("button", { name: "Cancel" }).click();

    // The supervisor leaves.
    const supervisorPage = await supervisorContext.newPage();
    supervisorPage.on("dialog", (dialog) => dialog.accept());
    await signIn(supervisorPage, supervisor.email);
    await supervisorPage.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "People & access", exact: true }).click();
    const spacesList = supervisorPage.getByRole("list", { name: "Shared spaces" });
    await spacesList.getByRole("button", { name: "Leave space" }).click();
    await expect(supervisorPage.getByText("You left Casey Delete’s space.")).toBeVisible();
    await expect(spacesList).toBeHidden();
    expect((await space.collection("members").doc(supervisor.uid).get()).data().active).toBe(false);

    // The manager deletes the whole space after typing the learner's name.
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "People & access", exact: true }).click();
    const danger = page.getByLabel("Delete learner space");
    const confirm = danger.getByLabel("Type Casey Delete to confirm");
    const remove = danger.getByRole("button", { name: "Delete learner space" });
    await expect(remove).toBeDisabled();
    await confirm.fill("casey delete");
    await expect(remove).toBeDisabled();
    await confirm.fill("Casey Delete");
    await remove.click();
    await expect(page.getByText("Casey Delete’s space was deleted.")).toBeVisible();
    await expect(page.getByText("0 spaces")).toBeVisible();
    expect((await space.get()).exists).toBe(false);
    expect((await space.collection("drives").get()).size).toBe(0);
    for (const user of [manager, supervisor]) expect((await db.doc(`users/${user.uid}/spaceLinks/${space.id}`).get()).exists).toBe(false);
  } finally {
    await managerContext.close();
    await supervisorContext.close();
    await deleteApp(app);
  }
});
