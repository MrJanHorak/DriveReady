import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

const geometry = [{ lat: 33.47, lng: -82.01 }, { lat: 33.48, lng: -82.02 }];
const roadPolyline = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

test("routes saved on the Routes page or by another member appear in the drive form without a manual refresh", async ({ browser }) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const app = initializeApp({ projectId: "demo-driveready" }, "route-sync-admin");
  const db = getFirestore(app), adminAuth = getAuth(app), context = await browser.newContext();
  try {
    const password = "synthetic-password-123";
    const manager = await adminAuth.createUser({ email: `route-sync-${Date.now()}@example.test`, password, emailVerified: true });
    const space = db.collection("spaces").doc(), batch = db.batch();
    batch.set(space, { learnerName: "Casey Example", status: "active", managerUid: manager.uid, learnerUid: null, invitationVersion: 0 });
    batch.set(space.collection("members").doc(manager.uid), { role: "manager", active: true, emailAtJoining: manager.email });
    batch.set(db.doc(`users/${manager.uid}/spaceLinks/${space.id}`), { spaceId: space.id });
    batch.set(space.collection("routes").doc(randomUUID()), { name: "B existing route", start: "Example start", destination: "Example end", geometry, createdByUid: manager.uid });
    await batch.commit();

    const page = await context.newPage();
    await page.route("https://router.project-osrm.org/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: "Ok", routes: [{ geometry: roadPolyline }] }) }));
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill(manager.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    // Open the drive form and choose the existing route; the choice must survive later syncs.
    await page.getByRole("button", { name: "Driving Logs", exact: true }).click();
    await page.getByRole("button", { name: "Log a drive", exact: true }).click();
    const selector = page.getByLabel("Choose a saved route");
    await expect(selector.locator("option")).toHaveCount(2);
    const existing = (await space.collection("routes").get()).docs[0].id;
    await selector.selectOption(existing);

    // A route saved on the Routes page is offered straight away.
    await page.getByRole("button", { name: "Routes", exact: true }).click();
    const drawing = page.getByRole("region", { name: "Route drawing map" });
    await drawing.scrollIntoViewIfNeeded();
    await drawing.click({ position: { x: 150, y: 120 } });
    await drawing.click({ position: { x: 230, y: 160 } });
    await page.getByRole("button", { name: "Follow roads" }).click();
    await expect(page.getByText("Road route found.", { exact: false })).toBeVisible();
    await page.getByLabel("Route name").fill("A new route");
    await page.getByLabel("Start description").fill("Fictional start");
    await page.getByLabel("Destination description").fill("Fictional end");
    await page.getByRole("button", { name: "Save shared route" }).click();
    await expect(page.getByText("Shared route saved.")).toBeVisible();
    await page.getByRole("button", { name: "Driving Logs", exact: true }).click();
    await expect(selector.locator("option")).toHaveText(["Select a mapped route", /A new route/, /B existing route/]);
    await expect(selector).toHaveValue(existing);

    // A route added by someone else appears when the page is shown again.
    await space.collection("routes").doc(randomUUID()).set({ name: "C added elsewhere", start: "Example start", destination: "Example end", geometry, roadPolyline, createdByUid: manager.uid });
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.getByRole("button", { name: "Driving Logs", exact: true }).click();
    await expect(selector.locator("option")).toHaveCount(4);
    await expect(selector).toHaveValue(existing);
  } finally {
    await context.close();
    await deleteApp(app);
  }
});
