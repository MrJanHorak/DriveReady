import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

test("manager, invited supervisor and learner can join only the intended space", async ({ browser }) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const adminApp = initializeApp({ projectId: "demo-driveready" }, "shared-browser-admin");
  const adminAuth = getAuth(adminApp);
  const suffix = Date.now();
  const password = "synthetic-password-123";
  const emails = ["manager", "supervisor", "learner", "outsider"].map((role) => `${role}-${suffix}@example.test`);
  const contexts = [];
  try {
    for (const email of emails) await adminAuth.createUser({ email, password, emailVerified: true });
    async function login(email) {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4173/");
      await expect(page.getByText("Shared local demo.", { exact: false })).toBeVisible();
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Show password" }).click();
      await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
      await page.getByRole("button", { name: "Hide password" }).click();
      await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.getByRole("button", { name: "Shared space", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Shared spaces · local emulator only" })).toBeVisible();
      return page;
    }
    const manager = await login(emails[0]);
    for (const name of ["First learner", "Second learner", "Third learner"]) {
      await manager.getByLabel("Learner name for shared space").fill(name);
      await manager.getByRole("button", { name: "Create shared space" }).click();
      await expect(manager.getByText("Learner space created.")).toBeVisible();
    }
    const managerList = manager.getByRole("list", { name: "Shared spaces" });
    await expect(managerList.getByRole("listitem")).toHaveCount(3);
    await manager.getByRole("combobox", { name: "Learner space" }).selectOption({ label: "First learner" });
    async function makeInvite(email, role) {
      await manager.getByLabel("Invitee email").fill(email);
      await manager.getByRole("combobox", { name: "Invitee role" }).selectOption(role);
      await manager.getByRole("button", { name: "Create test invitation" }).click();
      await expect(manager.getByText("Invitation created for this emulator test.")).toBeVisible();
      return { spaceId: await manager.getByLabel("Invitation space ID").inputValue(), token: await manager.getByLabel("Invitation code to share").inputValue() };
    }
    const supervisorInvite = await makeInvite(emails[1], "supervisor");
    const learnerInvite = await makeInvite(emails[2], "learner");
    const outsider = await login(emails[3]);
    await outsider.getByLabel("Received space ID").fill(supervisorInvite.spaceId);
    await outsider.getByLabel("Received invitation code").fill(supervisorInvite.token);
    await outsider.getByRole("button", { name: "Review invitation" }).click();
    await expect(outsider.getByText("Could not confirm the request.", { exact: false })).toBeVisible();
    await expect(outsider.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
    const cancelledInvite = await makeInvite(emails[3], "supervisor");
    await expect(manager.getByRole("list", { name: "Pending invitations" })).toContainText(emails[3]);
    await manager.getByRole("button", { name: `Cancel invitation for ${emails[3]}` }).click();
    await manager.getByRole("button", { name: "Keep invitation" }).click();
    await manager.getByRole("button", { name: `Cancel invitation for ${emails[3]}` }).click();
    await manager.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(manager.getByText("Invitation cancelled.")).toBeVisible();
    await expect(manager.getByRole("list", { name: "Pending invitations" })).not.toContainText(emails[3]);
    await outsider.getByRole("button", { name: "Refresh spaces" }).click();
    await outsider.getByLabel("Received space ID").fill(cancelledInvite.spaceId);
    await outsider.getByLabel("Received invitation code").fill(cancelledInvite.token);
    await outsider.getByRole("button", { name: "Review invitation" }).click();
    await expect(outsider.getByText("Could not confirm the request.", { exact: false })).toBeVisible();
    let supervisor;
    for (const [email, invite, role] of [[emails[1], supervisorInvite, "supervisor"], [emails[2], learnerInvite, "learner"]]) {
      const page = await login(email);
      if (role === "supervisor") supervisor = page;
      await page.getByLabel("Received space ID").fill(invite.spaceId);
      await page.getByLabel("Received invitation code").fill(invite.token);
      await page.getByRole("button", { name: "Review invitation" }).click();
      await expect(page.getByText(`Invitation to First learner’s space as ${role}.`, { exact: false })).toBeVisible();
      await expect(page.getByText("0 spaces", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Accept invitation" }).click();
      await expect(page.getByText("Invitation accepted.")).toBeVisible();
      const list = page.getByRole("list", { name: "Shared spaces" });
      await expect(list.getByRole("listitem")).toHaveCount(1);
      await expect(list).toContainText(`First learner · ${role}`);
      await expect(list).not.toContainText("Second learner");
      await expect(list).not.toContainText("Third learner");
      await expect(page.getByRole("list", { name: "People with access" })).toHaveCount(0);
      await expect(page.getByRole("list", { name: "Pending invitations" })).toHaveCount(0);
    }
    const pending = await makeInvite(emails[3], "supervisor");
    await manager.getByRole("button", { name: "Refresh people" }).click();
    const people = manager.getByRole("list", { name: "People with access" });
    await expect(people).toContainText(`${emails[1]} · supervisor`);
    await expect(people).toContainText(`${emails[2]} · learner`);
    await manager.getByRole("button", { name: `Remove ${emails[1]}` }).click();
    await expect(manager.getByText(/all pending invitations for this space will be invalidated/)).toBeVisible();
    await manager.getByRole("button", { name: "Keep access" }).click();
    await expect(people).toContainText(`${emails[1]} · supervisor`);
    await manager.getByRole("button", { name: `Remove ${emails[1]}` }).click();
    await manager.getByRole("button", { name: "Confirm removal" }).click();
    await expect(manager.getByText("Access removed. All pending invitations for this space were invalidated.")).toBeVisible();
    await expect(people).not.toContainText(emails[1]);
    await expect(people).toContainText(emails[2]);
    await expect(manager.getByLabel("Invitation code to share")).toHaveCount(0);
    await supervisor.getByRole("button", { name: "Refresh spaces" }).click();
    await expect(supervisor.getByText("0 spaces", { exact: true })).toBeVisible();
    await outsider.getByRole("button", { name: "Refresh spaces" }).click();
    await outsider.getByLabel("Received space ID").fill(pending.spaceId);
    await outsider.getByLabel("Received invitation code").fill(pending.token);
    await outsider.getByRole("button", { name: "Review invitation" }).click();
    await expect(outsider.getByText("Could not confirm the request.", { exact: false })).toBeVisible();
    await expect(outsider.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await deleteApp(adminApp);
  }
});

test("pending shared and existing cloud operations block conflicting actions", async ({ browser }) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const adminApp = initializeApp({ projectId: "demo-driveready" }, "busy-browser-admin");
  const email = `busy-${Date.now()}@example.test`, password = "synthetic-password-123";
  const context = await browser.newContext();
  let release;
  try {
    await getAuth(adminApp).createUser({ email, password, emailVerified: true });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4173/");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Shared space", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Shared spaces · local emulator only" })).toBeVisible();
    let reached;
    let pending = new Promise((resolve) => { reached = resolve; });
    let gate = new Promise((resolve) => { release = resolve; });
    await page.route("**/v1/spaces", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      reached(); await gate; await route.continue();
    });
    await page.getByLabel("Learner name for shared space").fill("Shared learner");
    await page.getByRole("button", { name: "Create shared space" }).click();
    await pending;
    await expect(page.getByRole("button", { name: "Account", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Route Explorer" })).toBeDisabled();
    release();
    await expect(page.getByText("Learner space created.")).toBeVisible();
    await page.unroute("**/v1/spaces");
    await page.getByRole("button", { name: "Account", exact: true }).click();
    const backup = { version: 1, learners: [{ id: "busy-learner", name: "Backup learner" }], drives: [] };
    await page.getByLabel("Choose backup to copy to cloud").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
    pending = new Promise((resolve) => { reached = resolve; });
    gate = new Promise((resolve) => { release = resolve; });
    await page.route("**/documents:commit", async (route) => { reached(); await gate; await route.continue(); });
    await page.getByRole("button", { name: "Copy to account" }).click();
    await pending;
    await expect(page.getByRole("button", { name: "Sign out" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Route Explorer" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Shared space", exact: true })).toBeDisabled();
    release();
    await expect(page.getByText(/Import finished: 1 copied/)).toBeVisible();
  } finally {
    release?.();
    await context.close();
    await deleteApp(adminApp);
  }
});

test("manager can load another page of invitations", async ({ browser }) => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local emulators are required.");
  const adminApp = initializeApp({ projectId: "demo-driveready" }, "pages-browser-admin");
  const email = `pages-${Date.now()}@example.test`, password = "synthetic-password-123";
  const context = await browser.newContext();
  try {
    const user = await getAuth(adminApp).createUser({ email, password, emailVerified: true });
    const db = getFirestore(adminApp), space = db.collection("spaces").doc();
    const batch = db.batch();
    batch.set(space, { learnerName: "Paged learner", status: "active", managerUid: user.uid, learnerUid: null, invitationVersion: 0 });
    batch.set(space.collection("members").doc(user.uid), { role: "manager", active: true, emailAtJoining: email });
    batch.set(db.doc(`users/${user.uid}/spaceLinks/${space.id}`), { spaceId: space.id });
    for (let index = 0; index < 26; index++) batch.set(space.collection("invitations").doc(index.toString(16).padStart(64, "0")), { status: "pending", recipientEmail: `person-${index}@example.test`, role: "supervisor", invitationVersion: 0, managerUid: user.uid, expiresAt: Date.now() + 60_000 });
    await batch.commit();
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4173/");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Shared space", exact: true }).click();
    const list = page.getByRole("list", { name: "Pending invitations" });
    await expect(list.getByRole("listitem")).toHaveCount(25);
    await page.getByRole("button", { name: "Load more invitations" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(26);
    await expect(page.getByRole("button", { name: "Load more invitations" })).toHaveCount(0);
  } finally {
    await context.close();
    await deleteApp(adminApp);
  }
});
