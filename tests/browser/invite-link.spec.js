import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const password = "synthetic-password-123";

test("a copied invitation link takes the invitee from sign-in to joining in one tap", async ({ browser }) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const app = initializeApp({ projectId: "demo-driveready" }, "invite-link-admin");
  const db = getFirestore(app), adminAuth = getAuth(app);
  const managerContext = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] }), inviteeContext = await browser.newContext();
  try {
    const stamp = Date.now();
    const manager = await adminAuth.createUser({ email: `link-m-${stamp}@example.test`, password, emailVerified: true });
    const invitee = await adminAuth.createUser({ email: `link-s-${stamp}@example.test`, password, emailVerified: true });
    const space = db.collection("spaces").doc(), batch = db.batch();
    batch.set(space, { learnerName: "Jordan Link", status: "active", managerUid: manager.uid, learnerUid: null, invitationVersion: 0 });
    batch.set(space.collection("members").doc(manager.uid), { role: "manager", active: true, emailAtJoining: manager.email });
    batch.set(db.doc(`users/${manager.uid}/spaceLinks/${space.id}`), { spaceId: space.id });
    await batch.commit();

    // The manager creates and copies a link.
    const managerPage = await managerContext.newPage();
    await managerPage.goto("/");
    await managerPage.getByLabel("Email", { exact: true }).fill(manager.email);
    await managerPage.getByLabel("Password", { exact: true }).fill(password);
    await managerPage.getByRole("button", { name: "Sign in", exact: true }).click();
    await managerPage.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "People & access", exact: true }).click();
    await managerPage.getByLabel("Invitee email").fill(invitee.email);
    await managerPage.getByRole("button", { name: "Create invitation link" }).click();
    const issued = managerPage.getByRole("region", { name: "New invitation link" });
    await expect(issued).toContainText(`Send this link to ${invitee.email}`);
    await expect(issued).toContainText("Jordan Link");
    await issued.getByRole("button", { name: "Copy link" }).click();
    await expect(managerPage.getByText("Link copied.")).toBeVisible();
    const link = await managerPage.evaluate(() => navigator.clipboard.readText());
    expect(link).toBe(await issued.getByLabel("Link to send").inputValue());

    // The invitee opens it before signing in; the code leaves the address bar at once.
    const page = await inviteeContext.newPage();
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(link);
    await expect.poll(() => page.url()).not.toContain("invite=");
    expect(requests.some((url) => url.includes(link.split("#")[1]))).toBe(false);
    await expect(page.getByText("You’ve been invited to a learner’s space.")).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill(invitee.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    const card = page.getByRole("region", { name: "Invitation" });
    await expect(page.getByRole("heading", { name: "People & access" })).toBeVisible();
    await expect(card).toContainText("Invitation to Jordan Link’s space as supervisor.");
    await card.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page.getByText("Invitation accepted. You can now see Jordan Link’s routes and drives.")).toBeVisible();
    await expect(card).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Shared spaces" })).toContainText("Jordan Link · supervisor");
    expect((await space.collection("members").doc(invitee.uid).get()).data().active).toBe(true);

    // Reloading doesn't bring the used invitation back.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Invitation" })).toHaveCount(0);
  } finally {
    await managerContext.close(); await inviteeContext.close();
    await deleteApp(app);
  }
});
