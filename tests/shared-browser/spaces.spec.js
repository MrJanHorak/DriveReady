import { test, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

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
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
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
    for (const [email, invite, role] of [[emails[1], supervisorInvite, "supervisor"], [emails[2], learnerInvite, "learner"]]) {
      const page = await login(email);
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
    }
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
    await expect(page.getByRole("button", { name: "Sign out" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Route Explorer" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Use cloud account" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Download cloud backup" })).toBeDisabled();
    release();
    await expect(page.getByText("Learner space created.")).toBeVisible();
    await page.unroute("**/v1/spaces");
    await page.getByLabel("Learner name or nickname").fill("Local learner");
    await page.getByRole("button", { name: "Add learner" }).click();
    await page.getByRole("button", { name: "Review local records to copy" }).click();
    pending = new Promise((resolve) => { reached = resolve; });
    gate = new Promise((resolve) => { release = resolve; });
    await page.route("**/documents:commit", async (route) => { reached(); await gate; await route.continue(); });
    await page.getByRole("button", { name: "Copy to account" }).click();
    await pending;
    await expect(page.getByRole("button", { name: "Sign out" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Route Explorer" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Use cloud account" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Create shared space" })).toBeDisabled();
    release();
    await expect(page.getByText(/Import finished: 1 copied/)).toBeVisible();
  } finally {
    release?.();
    await context.close();
    await deleteApp(adminApp);
  }
});
