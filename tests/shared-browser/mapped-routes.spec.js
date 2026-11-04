import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createLocalSharedGateway } from "../../server/localSharedGateway.mjs";

function encodeLine(points) {
  let previousLat = 0, previousLng = 0, result = "";
  for (const point of points) {
    const lat = Math.round(point.lat * 100000), lng = Math.round(point.lng * 100000);
    for (const delta of [lat - previousLat, lng - previousLng]) {
      let value = delta < 0 ? ~(delta << 1) : delta << 1;
      while (value >= 32) { result += String.fromCharCode((32 | (value & 31)) + 63); value >>= 5; }
      result += String.fromCharCode(value + 63);
    }
    previousLat = lat; previousLng = lng;
  }
  return result;
}

test("a new learner uses a drawn route before a drive can be logged", async ({ browser }, testInfo) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const app = initializeApp({ projectId: "demo-driveready" }, `mapped-${randomUUID()}`);
  const db = getFirestore(app), auth = getAuth(app), context = await browser.newContext();
  const gateway = createServer(createLocalSharedGateway({ db, auth, origin: process.env.DRIVEREADY_ISOLATED_DEMO === "true" ? "http://127.0.0.1:4174" : "http://127.0.0.1:4173" }));
  await new Promise((resolve, reject) => { gateway.once("error", reject); gateway.listen(0, "127.0.0.1", resolve); });
  const base = `http://127.0.0.1:${gateway.address().port}`;
  let releaseFirstRoute;
  try {
    const password = "synthetic-password-123";
    const manager = await auth.createUser({ email: `mapped-${randomUUID()}@example.test`, password, emailVerified: true });
    const page = await context.newPage();
    const roadPolyline = encodeLine([{ lat: 33.47, lng: -82.01 }, { lat: 33.471, lng: -82.012 }, { lat: 33.473, lng: -82.013 }]);
    let routingRequests = 0;
    let firstRouteStarted;
    const routeGate = new Promise((resolve) => { releaseFirstRoute = resolve; });
    const firstRoute = new Promise((resolve) => { firstRouteStarted = resolve; });
    await page.route("https://router.project-osrm.org/**", async (route) => {
      routingRequests += 1;
      if (routingRequests === 1) { firstRouteStarted(); await routeGate; }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: "Ok", routes: [{ geometry: roadPolyline }] }) }).catch(() => {});
    });
    for (const path of ["/v1/routes", "/v1/drives"]) await page.route(`**${path}`, async (route) => route.fulfill({ response: await route.fetch({ url: `${base}${path}` }) }));
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill(manager.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Account-only practice")).toHaveCount(0);
    await expect(page.getByLabel("Learner name or nickname")).toHaveCount(0);
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "People & access", exact: true }).click();
    await page.getByLabel("Learner name for shared space").fill("Map learner");
    await page.getByRole("button", { name: "Create shared space" }).click();
    await expect(page.getByText("Learner space created.")).toBeVisible();
    const link = (await db.collection(`users/${manager.uid}/spaceLinks`).get()).docs[0];
    const space = db.doc(`spaces/${link.id}`);
    const legacyRoute = space.collection("routes").doc(randomUUID());
    await legacyRoute.set({ name: "Older route", start: "Old start", destination: "Old end", createdByUid: manager.uid });
    await page.getByRole("button", { name: "Driving Logs", exact: true }).click();
    await page.getByRole("button", { name: "Log a drive", exact: true }).click();
    await page.getByRole("button", { name: "Refresh routes for practice" }).click();
    await expect(page.getByLabel("Choose a saved route").locator(`option[value="${legacyRoute.id}"]`)).toHaveAttribute("disabled", "");
    await page.getByLabel("Practice date").fill("2026-11-04");
    await page.getByLabel("Total minutes").fill("35");
    await page.getByRole("button", { name: "Save shared practice" }).click();
    expect(await page.getByLabel("Choose a saved route").evaluate((element) => element.validity.valueMissing)).toBe(true);
    expect((await space.collection("drives").get()).size).toBe(0);
    await page.getByRole("button", { name: "Create a route", exact: true }).click();
    await page.getByLabel("Route name", { exact: true }).fill("Map practice");
    await page.getByLabel("Start description").fill("Example start");
    await page.getByLabel("Destination description").fill("Example end");
    const drawing = page.getByRole("region", { name: "Route drawing map" });
    const initialZoom = Number(await drawing.getAttribute("data-zoom"));
    await drawing.hover();
    await page.mouse.wheel(0, -500);
    await expect.poll(async () => Number(await drawing.getAttribute("data-zoom"))).toBeGreaterThan(initialZoom);
    await drawing.click({ position: { x: 150, y: 120 } });
    await drawing.click({ position: { x: 230, y: 160 } });
    await drawing.click({ position: { x: 300, y: 200 } });
    await expect(page.getByText("3 / 50 points")).toBeVisible();
    await expect(drawing.locator("svg path").first()).toBeVisible();
    expect(routingRequests).toBe(0);
    await page.getByRole("button", { name: "Follow roads" }).click();
    await firstRoute;
    expect(routingRequests).toBe(1);
    await page.getByRole("button", { name: "Undo point" }).click();
    releaseFirstRoute();
    await expect(page.getByText("Road route found.", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Points changed.", { exact: false })).toBeVisible();
    await drawing.click({ position: { x: 300, y: 200 } });
    await page.waitForTimeout(1050); // The public demo permits at most one routing request per second.
    await page.getByRole("button", { name: "Follow roads" }).click();
    await expect(page.getByText("Road route found.", { exact: false })).toBeVisible();
    expect(routingRequests).toBe(2);
    await page.getByRole("button", { name: "Save shared route" }).click();
    await expect(page.getByText("Route selected. Add the practice details below.")).toBeVisible();
    await expect(page.getByLabel("Total minutes")).toHaveValue("35");
    const route = (await space.collection("routes").where("name", "==", "Map practice").get()).docs[0];
    expect(route.data().geometry).toHaveLength(3);
    expect(route.data().roadPolyline).toBe(roadPolyline);
    await expect(page.getByLabel("Choose a saved route")).toHaveValue(route.id);
    await expect(page.getByRole("region", { name: "Map practice map preview" })).toBeVisible();
    await page.getByRole("button", { name: "Save shared practice" }).click();
    await expect(page.getByText("Practice drive saved.")).toBeVisible();
    const drive = (await space.collection("drives").get()).docs[0].data();
    expect(drive.routeId).toBe(route.id);
    expect(drive.routeSnapshot.geometry).toEqual(route.data().geometry);
    expect(drive.routeSnapshot.roadPolyline).toBe(roadPolyline);
    const history = page.getByRole("list", { name: "Shared practice history" });
    await expect(history.getByText("Map practice")).toBeVisible();
    const preview = history.getByRole("region", { name: "Map practice map preview" });
    await preview.scrollIntoViewIfNeeded();
    await expect(preview.locator("svg path").first()).toBeVisible();
    await expect(preview.getByText("OpenStreetMap")).toBeVisible();
    await history.locator("summary").filter({ hasText: "Map practice" }).click();
    await expect(history.getByText("Suggested road route by", { exact: false })).toBeVisible();
    await history.screenshot({ path: testInfo.outputPath("mapped-practice.png") });
    await page.getByRole("button", { name: "Routes", exact: true }).click();
    await expect(page.getByRole("list", { name: "Shared routes" }).getByText("Map practice")).toBeVisible();
    await expect(page.getByText("not navigation", { exact: false })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileMap = page.getByRole("region", { name: "Route drawing map" });
    await mobileMap.scrollIntoViewIfNeeded();
    await expect(mobileMap).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("mobile-route-editor.png") });

    const offlineContext = await browser.newContext();
    try {
      const offlinePage = await offlineContext.newPage();
      await offlinePage.route("**/tile.openstreetmap.org/**", (request) => request.abort("failed"));
      await offlinePage.goto("/");
      await offlinePage.getByLabel("Email", { exact: true }).fill(manager.email);
      await offlinePage.getByLabel("Password", { exact: true }).fill(password);
      await offlinePage.getByRole("button", { name: "Sign in", exact: true }).click();
      await offlinePage.getByRole("button", { name: "Routes", exact: true }).click();
      const offlineMap = offlinePage.getByRole("region", { name: "Route drawing map" });
      await offlineMap.scrollIntoViewIfNeeded();
      await expect(offlineMap.locator("..").getByText("Map unavailable")).toBeVisible();
    } finally { await offlineContext.close(); }
  } finally {
    releaseFirstRoute?.();
    await context.close();
    await new Promise((resolve, reject) => gateway.close((error) => error ? reject(error) : resolve()));
    await deleteApp(app);
  }
});

test("the public routing demo returns a road route for fictional points", async ({ browser }) => {
  test.skip(process.env.DRIVEREADY_TEST_LIVE_ROUTING !== "true", "Explicit opt-in: contacts the public routing demo.");
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const app = initializeApp({ projectId: "demo-driveready" }, `live-route-${randomUUID()}`);
  const db = getFirestore(app), context = await browser.newContext();
  try {
    const password = "synthetic-password-123";
    const manager = await getAuth(app).createUser({ email: `live-route-${randomUUID()}@example.test`, password, emailVerified: true });
    const space = db.collection("spaces").doc(), batch = db.batch();
    batch.set(space, { learnerName: "Fictional route learner", status: "active", managerUid: manager.uid, learnerUid: null, invitationVersion: 0 });
    batch.set(space.collection("members").doc(manager.uid), { role: "manager", active: true, emailAtJoining: manager.email });
    batch.set(db.doc(`users/${manager.uid}/spaceLinks/${space.id}`), { spaceId: space.id });
    await batch.commit();
    const page = await context.newPage();
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill(manager.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Routes", exact: true }).click();
    await page.getByText("Enter coordinates instead").click();
    for (const [lat, lng] of [["33.47000", "-82.01000"], ["33.48000", "-82.02000"]]) {
      await page.getByLabel("Latitude").fill(lat);
      await page.getByLabel("Longitude").fill(lng);
      await page.getByRole("button", { name: "Add point" }).click();
    }
    await page.getByRole("button", { name: "Follow roads" }).click();
    await expect(page.getByText("Road route found.", { exact: false })).toBeVisible({ timeout: 25000 });
  } finally { await context.close(); await deleteApp(app); }
});
