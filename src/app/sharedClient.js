import { collection, doc, getDocFromServer, getDocsFromServer, limit, orderBy, query, startAfter } from "firebase/firestore";
import { auth, db } from "./firebaseClient";

import { firebaseConfigured } from "./firebaseClient";

// Local demo: emulators plus the loopback gateway started by npm run demo:shared.
export const sharedAccessDemo = import.meta.env.DEV &&
  import.meta.env.VITE_SHARED_ACCESS_EMULATOR === "true" &&
  import.meta.env.VITE_FIREBASE_USE_EMULATORS === "true" &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID === "demo-driveready";

// Hosted service (server/main.mjs). https is required except for a service on this computer.
function hostedServiceUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.search || url.hash || url.username || url.password) return "";
    return url.href.replace(/\/+$/, "");
  } catch { return ""; }
}
const hostedService = sharedAccessDemo ? "" : hostedServiceUrl(import.meta.env.VITE_SHARED_API_URL);
export const sharedServiceMisconfigured = !sharedAccessDemo && !!import.meta.env.VITE_SHARED_API_URL && !hostedService;

// Shared learner spaces are on in the demo, or when a hosted service is configured
// (server/main.mjs, or the same service against the emulators for local testing).
export const sharedAccessEnabled = sharedAccessDemo || (!!hostedService && firebaseConfigured);

const gateway = sharedAccessDemo ? (import.meta.env.VITE_SHARED_GATEWAY_PORT === "4176" ? "http://127.0.0.1:4176" : "http://127.0.0.1:4175") : hostedService;
const paths = Object.freeze({ createSpace: "/v1/spaces", createInvitation: "/v1/invitations", previewInvitation: "/v1/invitations/preview", acceptInvitation: "/v1/invitations/accept", removeMember: "/v1/members/remove", listInvitations: "/v1/invitations/list", cancelInvitationById: "/v1/invitations/cancel-by-id", createDrive: "/v1/drives", editDrive: "/v1/drives/edit", createRoute: "/v1/routes", deleteRoute: "/v1/routes/delete", deleteDrive: "/v1/drives/delete", leaveSpace: "/v1/spaces/leave", deleteSpace: "/v1/spaces/delete", deleteAccount: "/v1/account/delete", reviewRoute: "/v1/routes/review", setReflection: "/v1/drives/reflection", publishRoute: "/v1/public/publish", unpublishRoute: "/v1/public/unpublish", reportPublicRoute: "/v1/public/report", savePublicRoute: "/v1/public/save", moderationStatus: "/v1/moderation/status", listReportedRoutes: "/v1/moderation/reports", moderatePublicRoute: "/v1/moderation/act", myRouteReview: "/v1/public/my-review", rateRoute: "/v1/public/rate", setRouteTip: "/v1/public/tip", reportTip: "/v1/public/report-tip" });

function currentUser(uid) {
  if (!sharedAccessEnabled || !auth || !db || !auth.currentUser || auth.currentUser.uid !== uid) throw new Error("Shared spaces are unavailable.");
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

/** @param {string} uid @param {string} spaceId @param {import("firebase/firestore").DocumentSnapshot | null} [cursor] */
export async function readSharedDrives(uid, spaceId, cursor = null) {
  currentUser(uid);
  const constraints = [orderBy("date", "desc"), ...(cursor ? [startAfter(cursor)] : []), limit(51)];
  const snapshot = await getDocsFromServer(query(collection(db, "spaces", spaceId, "drives"), ...constraints));
  currentUser(uid);
  const page = snapshot.docs.slice(0, 50);
  return { drives: page.map((item) => ({ id: item.id, ...item.data() })), cursor: snapshot.size > 50 ? page[page.length - 1] : null };
}

/** @param {string} uid @param {string} spaceId @param {import("firebase/firestore").DocumentSnapshot | null} [cursor] */
export async function readSharedRoutes(uid, spaceId, cursor = null) {
  currentUser(uid);
  const constraints = [orderBy("name"), ...(cursor ? [startAfter(cursor)] : []), limit(51)];
  const snapshot = await getDocsFromServer(query(collection(db, "spaces", spaceId, "routes"), ...constraints));
  currentUser(uid);
  const page = snapshot.docs.slice(0, 50);
  return { routes: page.map((item) => ({ id: item.id, ...item.data() })), cursor: snapshot.size > 50 ? page[page.length - 1] : null };
}

export async function readSharedRoute(uid, spaceId, routeId) {
  currentUser(uid);
  const snapshot = await getDocFromServer(doc(db, "spaces", spaceId, "routes", routeId));
  currentUser(uid);
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

/** The public route library, newest first, 24 at a time. Needs a verified account.
 * @param {string} uid @param {import("firebase/firestore").DocumentSnapshot | null} [cursor] */
export async function readPublicRoutes(uid, cursor = null) {
  currentUser(uid);
  const constraints = [orderBy("publishedAt", "desc"), ...(cursor ? [startAfter(cursor)] : []), limit(25)];
  const snapshot = await getDocsFromServer(query(collection(db, "publicRoutes"), ...constraints));
  currentUser(uid);
  const page = snapshot.docs.slice(0, 24);
  return { routes: page.map((item) => ({ id: item.id, ...item.data() })), cursor: snapshot.size > 24 ? page[page.length - 1] : null };
}

/** Anonymous tips on a community route, newest first. Needs a verified account.
 * @param {string} uid @param {string} publicRouteId */
export async function readRouteTips(uid, publicRouteId) {
  currentUser(uid);
  const snapshot = await getDocsFromServer(query(collection(db, "publicRoutes", publicRouteId, "tips"), orderBy("updatedAt", "desc"), limit(20)));
  currentUser(uid);
  return snapshot.docs.map((item) => ({ id: item.id, text: item.data().text, updatedAt: item.data().updatedAt?.toMillis?.() ?? 0, reportCount: item.data().reportCount ?? 0 }));
}
