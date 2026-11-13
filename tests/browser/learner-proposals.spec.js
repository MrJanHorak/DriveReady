import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

const password = "synthetic-password-123";
const roadPolyline = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
const geometry = [{ lat: 33.47, lng: -82.01 }, { lat: 33.48, lng: -82.02 }];

async function signIn(page, email) {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}
const nav = (page, name) => page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true }).click();

test("a learner suggests a route, the manager approves it, and the learner reflects on a drive", async ({ browser }) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const app = initializeApp({ projectId: "demo-driveready" }, "proposal-admin");
  const db = getFirestore(app), adminAuth = getAuth(app);
  const learnerContext = await browser.newContext(), managerContext = await browser.newContext();
  try {
    const stamp = Date.now();
    const manager = await adminAuth.createUser({ email: `prop-m-${stamp}@example.test`, password, emailVerified: true });
    const learner = await adminAuth.createUser({ email: `prop-l-${stamp}@example.test`, password, emailVerified: true });
    const space = db.collection("spaces").doc(), driveId = randomUUID(), declinedId = randomUUID(), batch = db.batch();
    batch.set(space, { learnerName: "Casey Learner", status: "active", managerUid: manager.uid, learnerUid: learner.uid, invitationVersion: 0 });
    for (const [user, role] of [[manager, "manager"], [learner, "learner"]]) {
      batch.set(space.collection("members").doc(user.uid), { role, active: true, emailAtJoining: user.email });
      batch.set(db.doc(`users/${user.uid}/spaceLinks/${space.id}`), { spaceId: space.id });
    }
    batch.set(space.collection("routes").doc(declinedId), { name: "Interstate idea", start: "A", destination: "B", geometry, roadPolyline, createdByUid: learner.uid, status: "proposed" });
    batch.set(space.collection("drives").doc(driveId), { date: "2026-11-01", minutes: 45, nightMinutes: 0, notes: "Smooth stops.", recordedByUid: manager.uid, lastEditedByUid: manager.uid, supervisorPresentUid: manager.uid });
    await batch.commit();

    // The learner draws and sends a route for approval.
    const page = await learnerContext.newPage();
    await page.route("https://router.project-osrm.org/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: "Ok", routes: [{ geometry: roadPolyline }] }) }));
    await signIn(page, learner.email);
    await nav(page, "Routes");
    const create = page.getByRole("region", { name: "Create a route" });
    await expect(create.getByRole("heading", { name: "Suggest a route" })).toBeVisible();
    await create.getByLabel("Route name", { exact: true }).fill("School loop");
    await create.getByLabel("Start description").fill("Example start");
    await create.getByLabel("Destination description").fill("Example school");
    const drawing = page.getByRole("region", { name: "Route drawing map" });
    await drawing.click({ position: { x: 150, y: 120 } });
    await drawing.click({ position: { x: 230, y: 160 } });
    await create.getByRole("button", { name: "Follow roads" }).click();
    await expect(page.getByText("Road route found.", { exact: false })).toBeVisible();
    await create.getByRole("button", { name: "Send for approval" }).click();
    await expect(page.getByText("Route sent for approval.", { exact: false })).toBeVisible();
    const routes = page.getByRole("list", { name: "Shared routes" });
    await expect(routes.locator("li").filter({ hasText: "School loop" })).toContainText("Awaiting approval");
    await expect(routes.getByRole("button", { name: "Approve route" })).toHaveCount(0);
    const schoolLoop = (await space.collection("routes").where("name", "==", "School loop").get()).docs[0];
    expect(schoolLoop.data().status).toBe("proposed");

    // The manager sees the request, declines one and approves the other.
    const managerPage = await managerContext.newPage();
    await signIn(managerPage, manager.email);
    await nav(managerPage, "Driving Logs");
    await managerPage.getByRole("button", { name: "Log a drive", exact: true }).click();
    await expect(managerPage.getByLabel("Choose a saved route").locator(`option[value="${schoolLoop.id}"]`)).toHaveAttribute("disabled", "");
    await expect(managerPage.getByLabel("Choose a saved route").locator(`option[value="${schoolLoop.id}"]`)).toContainText("awaiting approval");
    await nav(managerPage, "Routes");
    await expect(managerPage.getByText("2 routes are waiting for your approval.")).toBeVisible();
    const managed = managerPage.getByRole("list", { name: "Shared routes" });
    const idea = managed.locator(":scope > li").filter({ hasText: "Interstate idea" });
    await idea.locator("summary").click();
    await idea.getByLabel("Reason if declining", { exact: false }).fill("Let's wait until you've done more highway practice.");
    await idea.getByRole("button", { name: "Decline route" }).click();
    await expect(managerPage.getByText("“Interstate idea” was not approved.", { exact: false })).toBeVisible();
    const loop = managed.locator(":scope > li").filter({ hasText: "School loop" });
    await loop.locator("summary").click();
    await loop.getByRole("button", { name: "Approve route" }).click();
    await expect(managerPage.getByText("“School loop” approved.", { exact: false })).toBeVisible();
    await expect(managerPage.getByText("waiting for your approval", { exact: false })).toHaveCount(0);
    await nav(managerPage, "Driving Logs");
    await expect(managerPage.getByLabel("Choose a saved route").locator(`option[value="${schoolLoop.id}"]`)).not.toHaveAttribute("disabled", "");

    // The learner sees both outcomes and adds a reflection to the drive.
    await page.getByRole("button", { name: "Refresh shared routes" }).click();
    const declined = routes.locator(":scope > li").filter({ hasText: "Interstate idea" });
    await expect(declined).toContainText("Not approved");
    await declined.locator("summary").click();
    await expect(declined).toContainText("Let's wait until you've done more highway practice.");
    await expect(routes.locator(":scope > li").filter({ hasText: "School loop" })).not.toContainText("Awaiting approval");
    await nav(page, "Driving Logs");
    const history = page.getByRole("list", { name: "Shared practice history" });
    await history.getByRole("button", { name: "Add your reflection" }).click();
    await history.getByLabel("Your reflection", { exact: false }).fill("Braking felt smoother. Next: lane changes.");
    await history.getByRole("button", { name: "Save reflection" }).click();
    await expect(page.getByText("Reflection saved.")).toBeVisible();
    await expect(history.getByLabel("Learner reflection")).toContainText("Braking felt smoother.");
    expect((await space.collection("drives").doc(driveId).get()).data().learnerReflection).toBe("Braking felt smoother. Next: lane changes.");
    await expect(history.getByRole("button", { name: "Edit practice" })).toHaveCount(0);

    // The manager sees the reflection, labelled with the learner's name.
    await managerPage.reload();
    await nav(managerPage, "Driving Logs");
    await expect(managerPage.getByRole("list", { name: "Shared practice history" }).getByLabel("Learner reflection")).toContainText("Casey Learner’s reflection");
  } finally {
    await learnerContext.close(); await managerContext.close();
    await deleteApp(app);
  }
});
