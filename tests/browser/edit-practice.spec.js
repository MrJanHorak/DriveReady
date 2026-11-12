import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createLocalSharedGateway } from "../../server/localSharedGateway.mjs";

test("shared edits retry safely, reject stale changes and remain visible to the learner", async ({ browser }) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const app = initializeApp({ projectId: "demo-driveready" }, `edit-browser-${randomUUID()}`);
  const db = getFirestore(app), auth = getAuth(app), contexts = [];
  const gateway = createServer(createLocalSharedGateway({ db, auth, origin: process.env.DRIVEREADY_ISOLATED_DEMO === "true" ? "http://127.0.0.1:4174" : "http://127.0.0.1:4173" }));
  await new Promise((resolve, reject) => { gateway.once("error", reject); gateway.listen(0, "127.0.0.1", resolve); });
  const gatewayUrl = `http://127.0.0.1:${gateway.address().port}/v1/drives/edit`;
  try {
    const suffix = randomUUID(), password = "synthetic-password-123";
    const [manager, author, learner] = await Promise.all(["manager", "author", "learner"].map((role) => auth.createUser({ email: `edit-${role}-${suffix}@example.test`, password, emailVerified: true })));
    const space = db.collection("spaces").doc(), otherSpace = db.collection("spaces").doc(), drive = space.collection("drives").doc(randomUUID()), batch = db.batch();
    batch.set(space, { learnerName: "Edit learner", status: "active", managerUid: manager.uid, learnerUid: learner.uid, invitationVersion: 0 });
    for (const [user, role] of [[manager, "manager"], [author, "supervisor"], [learner, "learner"]]) {
      batch.set(space.collection("members").doc(user.uid), { role, active: true, emailAtJoining: user.email });
      batch.set(db.doc(`users/${user.uid}/spaceLinks/${space.id}`), { spaceId: space.id });
    }
    batch.set(otherSpace, { learnerName: "Other edit learner", status: "active", managerUid: manager.uid, learnerUid: null, invitationVersion: 0 });
    batch.set(otherSpace.collection("members").doc(manager.uid), { role: "manager", active: true, emailAtJoining: manager.email });
    batch.set(db.doc(`users/${manager.uid}/spaceLinks/${otherSpace.id}`), { spaceId: otherSpace.id });
    batch.set(drive, { date: "2026-10-30", minutes: 60, nightMinutes: 15, notes: "Original notes", recordedByUid: author.uid, lastEditedByUid: author.uid, supervisorPresentUid: manager.uid, routeSnapshot: { name: "Fictional route", start: "Example start", destination: "Example end" } });
    await batch.commit();
    async function login(user, expectedNotes = "Original notes") {
      const context = await browser.newContext(); contexts.push(context);
      const page = await context.newPage();
      await page.goto("/");
      await page.getByLabel("Email", { exact: true }).fill(user.email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.getByRole("button", { name: "Driving Logs", exact: true }).click();
      if (user.uid === manager.uid) await page.getByLabel("Practice learner").selectOption({ label: "Edit learner · manager" });
      await expect(page.getByRole("list", { name: "Shared practice history" })).toContainText(expectedNotes);
      return page;
    }
    const managerPage = await login(manager), authorPage = await login(author);
    await managerPage.route("**/v1/drives/edit", async (route) => route.fulfill({ response: await route.fetch({ url: gatewayUrl }) }));
    let loseResponse = true;
    await authorPage.route("**/v1/drives/edit", async (route) => {
      const response = await route.fetch({ url: gatewayUrl });
      if (loseResponse) { loseResponse = false; expect(response.status()).toBe(200); await route.abort("failed"); }
      else await route.fulfill({ response });
    });
    await managerPage.getByRole("button", { name: "Edit practice" }).click();
    await managerPage.getByLabel("Shared practice notes").fill("Stale manager notes");
    await authorPage.getByRole("button", { name: "Edit practice" }).click();
    await authorPage.getByLabel("Total minutes").fill("45");
    await authorPage.getByLabel("Shared practice notes").fill("Author correction");
    await authorPage.getByRole("button", { name: "Save practice changes" }).click();
    await expect(authorPage.getByText("Could not confirm the request.", { exact: false })).toBeVisible();
    await authorPage.getByRole("button", { name: "Refresh spaces" }).click();
    await authorPage.getByRole("button", { name: "Refresh practice history" }).click();
    await authorPage.getByRole("button", { name: "Retry same practice save" }).click();
    await expect(authorPage.getByText("Practice changes saved.")).toBeVisible();
    expect((await drive.get()).data().revision).toBe(1);
    await managerPage.getByRole("button", { name: "Save practice changes" }).click();
    await expect(managerPage.getByText("Could not confirm the request.", { exact: false })).toBeVisible();
    expect((await drive.get()).data().notes).toBe("Author correction");
    await managerPage.getByRole("button", { name: "Refresh spaces" }).click();
    await managerPage.getByRole("button", { name: "Refresh practice history" }).click();
    await managerPage.getByRole("button", { name: "Discard retry details" }).click();
    await managerPage.getByRole("button", { name: "Confirm discard" }).click();
    await managerPage.getByRole("button", { name: "Cancel editing" }).click();
    await managerPage.getByRole("button", { name: "Edit practice" }).click();
    await managerPage.getByLabel("Shared practice notes").fill("Manager correction");
    await managerPage.getByRole("button", { name: "Save practice changes" }).click();
    await expect(managerPage.getByText("Practice changes saved.")).toBeVisible();
    const saved = (await drive.get()).data();
    expect(saved).toMatchObject({ revision: 2, minutes: 45, recordedByUid: author.uid, lastEditedByUid: manager.uid, supervisorPresentUid: manager.uid, routeSnapshot: { name: "Fictional route", start: "Example start", destination: "Example end" } });
    const learnerPage = await login(learner, "Manager correction");
    await expect(learnerPage.getByRole("list", { name: "Shared practice history" })).toContainText("Manager correction");
    await expect(learnerPage.getByRole("button", { name: "Edit practice" })).toHaveCount(0);
    await managerPage.getByRole("button", { name: "Edit practice" }).click();
    await managerPage.getByLabel("Shared practice notes").fill("Unsaved previous learner notes");
    await space.collection("members").doc(manager.uid).update({ active: false });
    await db.doc(`users/${manager.uid}/spaceLinks/${space.id}`).delete();
    await managerPage.getByRole("button", { name: "Refresh spaces" }).click();
    await expect(managerPage.getByLabel("Practice learner")).toHaveValue(otherSpace.id);
    await expect(managerPage.getByLabel("Shared practice notes")).toHaveCount(0);
    await expect(managerPage.getByText("Editing practice from", { exact: false })).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await new Promise((resolve, reject) => gateway.close((error) => error ? reject(error) : resolve()));
    await deleteApp(app);
  }
});
