import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { encodeRoutePolyline } from "../../src/app/routePolyline.js";

const password = "synthetic-password-123";
// About 3 km of fictional road in the Augusta area.
const line = Array.from({ length: 31 }, (_, i) => ({ lat: Number((33.47 + i * 0.001).toFixed(5)), lng: Number((-82.01 + (i % 2) * 0.0003).toFixed(5)) }));
const roadPolyline = encodeRoutePolyline(line);

async function signIn(page, email) {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}
const nav = (page, name) => page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true }).click();

test("a manager shares a route, another family saves and reports it, and a moderator reviews the report", async ({ browser }) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const app = initializeApp({ projectId: "demo-driveready" }, "community-admin");
  const db = getFirestore(app), adminAuth = getAuth(app);
  const contexts = [];
  const open = async (email) => { const context = await browser.newContext(); contexts.push(context); const page = await context.newPage(); await signIn(page, email); return page; };
  try {
    const stamp = Date.now();
    const [sharer, saver, moderator] = await Promise.all([`share-${stamp}`, `save-${stamp}`, `moderator-${stamp}`].map((name) => adminAuth.createUser({ email: `${name}@example.test`, password, emailVerified: true })));
    const batch = db.batch();
    const spaceA = db.collection("spaces").doc(), spaceB = db.collection("spaces").doc(), routeId = randomUUID();
    for (const [space, user, learnerName] of [[spaceA, sharer, "Secret Learner Name"], [spaceB, saver, "Blake Saver"]]) {
      batch.set(space, { learnerName, status: "active", managerUid: user.uid, learnerUid: null, invitationVersion: 0 });
      batch.set(space.collection("members").doc(user.uid), { role: "manager", active: true, emailAtJoining: user.email });
      batch.set(db.doc(`users/${user.uid}/spaceLinks/${space.id}`), { spaceId: space.id });
    }
    batch.set(spaceA.collection("routes").doc(routeId), { name: "Home to Lakeside High", start: "Our house on Elm St", destination: "Lakeside High", geometry: [line[0], line[30]], roadPolyline, createdByUid: sharer.uid, status: "approved" });
    await batch.commit();

    // Family A shares the route, renaming it so it doesn't mention home.
    const page = await open(sharer.email);
    await nav(page, "Routes");
    const item = page.getByRole("list", { name: "Shared routes" }).locator(":scope > li").filter({ hasText: "Home to Lakeside High" });
    await item.locator("summary").click();
    await item.getByRole("button", { name: "Share with the community…" }).click();
    const form = item.getByRole("form", { name: "Share with the community" });
    await expect(form).toContainText("Secret Learner Name’s name and the start and destination descriptions are left out");
    // Mark a private place on the preview map; the shareable length drops and the form must be re-confirmed.
    const preview = page.getByRole("region", { name: "Sharing preview map" });
    await expect(preview).toBeVisible();
    const before = await form.getByText("will be shared", { exact: false }).textContent();
    const box = await preview.boundingBox();
    await preview.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(form.getByText("Private place 1")).toBeVisible();
    await expect(form.getByText("will be shared", { exact: false })).not.toHaveText(before);
    await expect(form.getByRole("button", { name: "Share publicly" })).toBeDisabled();
    await form.getByLabel("I’ve checked the preview", { exact: false }).check();
    await form.getByLabel("Public name").fill("Lakeside loop with four-way stops");
    await form.getByLabel("General area").fill("Evans");
    await form.getByLabel("What’s it good for?", { exact: false }).fill("Quiet residential streets, then a busier road.");
    await form.getByLabel("Turns").check();
    await form.getByLabel("Residential roads").check();
    await form.getByRole("button", { name: "Share publicly" }).click();
    await expect(page.getByText("“Lakeside loop with four-way stops” is now in the community library.")).toBeVisible();
    await expect(item).toContainText("Shared publicly");
    const publicId = (await spaceA.collection("routes").doc(routeId).get()).data().publicRouteId;
    const stored = JSON.stringify((await db.doc(`publicRoutes/${publicId}`).get()).data());
    for (const secret of ["Secret Learner Name", "Elm St", "Home to Lakeside", spaceA.id, sharer.uid]) expect(stored).not.toContain(secret);

    // Family B finds it, filters, saves it and reports it.
    const saverPage = await open(saver.email);
    await nav(saverPage, "Community");
    const list = saverPage.getByRole("list", { name: "Community route list" });
    await expect(list).toContainText("Lakeside loop with four-way stops");
    await saverPage.getByRole("group", { name: "Filter by skill" }).getByRole("button", { name: "Parking" }).click();
    await expect(list.getByText("Lakeside loop with four-way stops")).toHaveCount(0);
    await saverPage.getByRole("group", { name: "Filter by skill" }).getByRole("button", { name: "Turns" }).click();
    await list.getByRole("button", { name: /Lakeside loop with four-way stops/ }).click();
    const details = saverPage.getByRole("region", { name: "Selected community route" });
    await expect(details).toContainText("Quiet residential streets");
    await expect(details).toContainText("Evans");
    await details.getByRole("button", { name: "Save to learner’s routes" }).click();
    await expect(saverPage.getByText("saved to Blake Saver’s routes", { exact: false })).toBeVisible();
    const saved = (await spaceB.collection("routes").where("sourcePublicRouteId", "==", publicId).get()).docs;
    expect(saved).toHaveLength(1);
    expect(saved[0].data().status).toBe("approved");
    await details.getByRole("button", { name: "Report this route" }).click();
    await details.getByLabel("Shows a private place").check();
    await details.getByLabel("Details", { exact: false }).fill("Ends near a driveway.");
    await details.getByRole("button", { name: "Send report" }).click();
    await expect(saverPage.getByText("The report was sent to DriveReady’s moderators.", { exact: false })).toBeVisible();
    await expect(saverPage.getByRole("region", { name: "Reported routes" })).toHaveCount(0);

    // The moderator sees the report and dismisses it.
    const modPage = await open(moderator.email);
    await nav(modPage, "Community");
    const reports = modPage.getByRole("region", { name: "Reported routes" });
    await expect(reports).toContainText("Lakeside loop with four-way stops");
    await expect(reports).toContainText("Shows a private place");
    await expect(reports).toContainText("Ends near a driveway.");
    await reports.getByRole("button", { name: "Dismiss reports" }).click();
    await expect(reports).toContainText("No open reports.");

    // Family A stops sharing; it disappears for everyone, but B keeps its copy.
    page.on("dialog", (dialog) => dialog.accept());
    if (!(await item.locator("details").evaluate((element) => element.open))) await item.locator("summary").click();
    await item.getByRole("button", { name: "Stop sharing" }).click();
    await expect(page.getByText("is no longer shared.", { exact: false })).toBeVisible();
    await saverPage.getByRole("button", { name: "Refresh", exact: true }).click();
    await saverPage.getByRole("group", { name: "Filter by skill" }).getByRole("button", { name: "All" }).click();
    await expect(list.getByText("Lakeside loop with four-way stops")).toHaveCount(0);
    expect((await spaceB.collection("routes").doc(saved[0].id).get()).exists).toBe(true);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await deleteApp(app);
  }
});
