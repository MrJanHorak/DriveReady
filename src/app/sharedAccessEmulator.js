import { collection, doc, getDocFromServer, getDocsFromServer, limit, orderBy, query, startAfter } from "firebase/firestore";
import { auth, db } from "./firebaseClient";

// This prototype cannot target a live Firebase project or a non-local service.
export const sharedAccessEmulatorEnabled = import.meta.env.DEV &&
  import.meta.env.VITE_SHARED_ACCESS_EMULATOR === "true" &&
  import.meta.env.VITE_FIREBASE_USE_EMULATORS === "true" &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID === "demo-driveready";

const gateway = "http://127.0.0.1:4175";
const paths = Object.freeze({ createSpace: "/v1/spaces", createInvitation: "/v1/invitations", previewInvitation: "/v1/invitations/preview", acceptInvitation: "/v1/invitations/accept", removeMember: "/v1/members/remove", listInvitations: "/v1/invitations/list", cancelInvitationById: "/v1/invitations/cancel-by-id", createDrive: "/v1/drives", createRoute: "/v1/routes" });

function currentUser(uid) {
  if (!sharedAccessEmulatorEnabled || !auth || !db || !auth.currentUser || auth.currentUser.uid !== uid) throw new Error("Shared-space emulator is unavailable.");
  return auth.currentUser;
}

export async function sharedAccessRequest(uid, action, body) {
  const user = currentUser(uid);
  if (!Object.hasOwn(paths, action)) throw new Error("Unsupported operation.");
  const idToken = await user.getIdToken(true);
  if (currentUser(uid) !== user) throw new Error("Account changed.");
  const response = await fetch(`${gateway}${paths[action]}`, {
    method: "POST", headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), credentials: "omit", cache: "no-store", redirect: "error",
  });
  if (!response.ok) throw new Error("Request could not be confirmed.");
  return response.json();
}

export async function readSharedSpaces(uid) {
  currentUser(uid);
  const links = await getDocsFromServer(collection(db, "users", uid, "spaceLinks"));
  const result = await Promise.all(links.docs.map(async (link) => {
    try {
      const [space, member] = await Promise.all([
        getDocFromServer(doc(db, "spaces", link.id)),
        getDocFromServer(doc(db, "spaces", link.id, "members", uid)),
      ]);
      if (!space.exists() || !member.exists() || member.data().active !== true) return null;
      return { id: link.id, learnerName: space.data().learnerName, role: member.data().role };
    } catch (error) {
      if (error?.code === "permission-denied") return null;
      throw error;
    }
  }));
  currentUser(uid);
  return result.filter(Boolean);
}

export async function readSharedMembers(uid, spaceId) {
  currentUser(uid);
  const snapshot = await getDocsFromServer(collection(db, "spaces", spaceId, "members"));
  currentUser(uid);
  return snapshot.docs.filter((member) => member.data().active === true).map((member) => ({
    uid: member.id, role: member.data().role, email: member.data().emailAtJoining ?? "",
  }));
}

export async function readSharedDrives(uid, spaceId, cursor = null) {
  currentUser(uid);
  const constraints = [orderBy("date", "desc"), ...(cursor ? [startAfter(cursor)] : []), limit(51)];
  const snapshot = await getDocsFromServer(query(collection(db, "spaces", spaceId, "drives"), ...constraints));
  currentUser(uid);
  const page = snapshot.docs.slice(0, 50);
  return { drives: page.map((item) => ({ id: item.id, ...item.data() })), cursor: snapshot.size > 50 ? page[page.length - 1] : null };
}

export async function readSharedRoutes(uid, spaceId) {
  currentUser(uid);
  const snapshot = await getDocsFromServer(query(collection(db, "spaces", spaceId, "routes"), orderBy("name"), limit(51)));
  currentUser(uid);
  return { routes: snapshot.docs.slice(0, 50).map((item) => ({ id: item.id, ...item.data() })), more: snapshot.size > 50 };
}
