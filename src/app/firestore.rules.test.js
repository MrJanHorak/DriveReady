import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-driveready", firestore: { rules: await readFile("firestore.rules", "utf8") } });
});
after(async () => { if (env) await env.cleanup(); });

test("only the signed-in owner can access private family records", async () => {
  const alice = env.authenticatedContext("alice").firestore();
  const bob = env.authenticatedContext("bob").firestore();
  const guest = env.unauthenticatedContext().firestore();
  const path = "users/alice/learners/learner-1";
  await assertSucceeds(setDoc(doc(alice, path), { name: "Test learner" }));
  await assertSucceeds(getDoc(doc(alice, path)));
  await assertFails(getDoc(doc(bob, path)));
  await assertFails(setDoc(doc(bob, path), { name: "Changed" }));
  await assertFails(getDoc(doc(guest, path)));
  await assertFails(setDoc(doc(guest, path), { name: "Changed" }));
  await assertFails(setDoc(doc(alice, "publicRoutes/route-1"), { name: "Not supported" }));
  await assertSucceeds(setDoc(doc(alice, "users/alice/drives/drive-1"), { minutes: 30 }));
  await assertFails(getDoc(doc(bob, "users/alice/drives/drive-1")));
});
