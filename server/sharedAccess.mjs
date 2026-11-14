// Trusted server-side prototype. Do not import into the browser or deploy as-is.
// Callers must never supply the Admin SDK instances or clock over a network API.
import { createHash, randomBytes } from "node:crypto";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { decodeRoutePolyline, encodeRoutePolyline } from "../src/app/routePolyline.js";
import { lineLengthM, samplePoints } from "../src/app/publicLine.js";
import { PRACTICE_CONDITIONS, PRACTICE_SKILLS } from "../src/app/practiceData.js";

const INVITATION_LIFETIME_MS = 48 * 60 * 60 * 1000;
const RECENT_SIGN_IN_MS = 10 * 60 * 1000;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const invitationIdPattern = /^[a-f0-9]{64}$/;
const operationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const unavailable = () => new Error("Invitation cannot be accepted.");
const unauthorized = () => new Error("Not authorized.");
// A request refused before anything changed, with a reason safe to show the person.
const rejected = (message) => Object.assign(new Error(message), { rejected: true });

function emailKey(value) {
  if (typeof value !== "string") return "";
  const result = value.trim().toLowerCase();
  return result.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) ? result : "";
}
function checkId(value) {
  if (typeof value !== "string" || !idPattern.test(value)) throw unauthorized();
  return value;
}
function invitationId(token) {
  if (typeof token !== "string" || !tokenPattern.test(token)) throw unavailable();
  return createHash("sha256").update(token).digest("hex");
}
function invitationVersion(space) {
  const version = space.invitationVersion;
  if (!Number.isSafeInteger(version) || version < 0 || version >= Number.MAX_SAFE_INTEGER) throw unauthorized();
  return version;
}
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
// Optional practice tags arrive as a JSON string array; only catalog labels are kept, in catalog order.
function practiceTags(value, choices) {
  if (value === undefined || value === "") return [];
  let parsed;
  try { parsed = typeof value === "string" && value.length <= 2000 ? JSON.parse(value) : null; } catch { parsed = null; }
  if (!Array.isArray(parsed) || parsed.length > choices.length || new Set(parsed).size !== parsed.length || !parsed.every((item) => choices.includes(item))) throw rejected("Invalid practice tags.");
  return choices.filter((choice) => parsed.includes(choice));
}
function routeGeometry(value) {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 3000) throw rejected("Invalid route map.");
  let points;
  try { points = JSON.parse(value); } catch { throw rejected("Invalid route map."); }
  if (!Array.isArray(points) || points.length < 2 || points.length > 50 || points.some((point) => !point || typeof point !== "object" || Array.isArray(point) || Object.keys(point).sort().join(",") !== "lat,lng" || typeof point.lat !== "number" || !Number.isFinite(point.lat) || point.lat < -85 || point.lat > 85 || typeof point.lng !== "number" || !Number.isFinite(point.lng) || point.lng < -180 || point.lng > 180)) throw rejected("Invalid route map.");
  if (points.every((point) => point.lat === points[0].lat && point.lng === points[0].lng)) throw rejected("Select at least two different map points.");
  return points.map(({ lat, lng }) => ({ lat, lng }));
}

// Routes saved before approval existed have no status and count as approved.
const routeApproved = (route) => route.status === undefined || route.status === "approved";

const REPORT_REASONS = ["unsafe", "private", "inaccurate", "inappropriate", "other"];
const oneLine = (value, min, max) => typeof value === "string" && value.trim().length >= min && value.length <= max && !/[\r\n\u2028\u2029\u0000-\u001f]/.test(value);

// isModerator(email) decides who may review reported public routes (MODERATOR_EMAILS).
export function createSharedAccessService({ db, auth, now = Date.now, isModerator = () => false }) {
  async function identity(idToken) {
    try {
      if (typeof idToken !== "string" || !idToken) throw unauthorized();
      const claims = await auth.verifyIdToken(idToken, true);
      const uid = checkId(claims.uid);
      const account = await auth.getUser(uid);
      const email = emailKey(claims.email);
      if (claims.email_verified !== true || account.disabled || !account.emailVerified || !email || emailKey(account.email) !== email) throw unauthorized();
      return { uid, email, authTime: Number.isSafeInteger(claims.auth_time) ? claims.auth_time : 0 };
    } catch { throw unauthorized(); }
  }
  const refs = (spaceId, uid) => {
    const space = db.collection("spaces").doc(checkId(spaceId));
    return { space, member: space.collection("members").doc(uid) };
  };
  const isManager = (space, member) => space.exists && space.data().status === "active" && member.exists && member.data().active === true && member.data().role === "manager";

  async function createSpace({ idToken, learnerName }) {
    const caller = await identity(idToken);
    if (typeof learnerName !== "string" || !learnerName.trim() || learnerName.trim().length > 60 || /[\r\n\u2028\u2029]/.test(learnerName)) throw rejected("Enter a learner name of up to 60 characters on one line.");
    const space = db.collection("spaces").doc();
    const member = space.collection("members").doc(caller.uid);
    const link = db.collection("users").doc(caller.uid).collection("spaceLinks").doc(space.id);
    await db.runTransaction(async (tx) => {
      tx.create(space, { learnerName: learnerName.trim(), status: "active", managerUid: caller.uid, learnerUid: null, invitationVersion: 0, createdAt: FieldValue.serverTimestamp() });
      tx.create(member, { role: "manager", active: true, emailAtJoining: caller.email, joinedAt: FieldValue.serverTimestamp() });
      tx.create(link, { spaceId: space.id });
    });
    return { spaceId: space.id };
  }

  async function createInvitation({ idToken, spaceId, recipientEmail, role }) {
    const caller = await identity(idToken);
    const email = emailKey(recipientEmail);
    if (!email || !["supervisor", "learner"].includes(role)) throw rejected("Enter a valid email and invitation role.");
    const { space, member } = refs(spaceId, caller.uid);
    const token = randomBytes(32).toString("base64url");
    const invite = space.collection("invitations").doc(invitationId(token));
    const expiresAt = now() + INVITATION_LIFETIME_MS;
    await db.runTransaction(async (tx) => {
      const [spaceSnap, managerSnap] = await tx.getAll(space, member);
      if (!isManager(spaceSnap, managerSnap) || spaceSnap.data().managerUid !== caller.uid) throw unauthorized();
      tx.create(invite, { recipientEmail: email, invitationVersion: invitationVersion(spaceSnap.data()), role, managerUid: caller.uid, status: "pending", expiresAt, createdAt: FieldValue.serverTimestamp() });
    });
    // The token is a secret. Delivery is intentionally not implemented.
    return { spaceId: space.id, token, expiresAt };
  }

  async function validInvitation(tx, space, member, invite, caller) {
    const [spaceSnap, inviteSnap, memberSnap] = await tx.getAll(space, invite, member);
    if (!spaceSnap.exists || spaceSnap.data().status !== "active" || !inviteSnap.exists) throw unavailable();
    const item = inviteSnap.data();
    if (item.status !== "pending" || item.recipientEmail !== caller.email || !Number.isSafeInteger(item.invitationVersion) || !["supervisor", "learner"].includes(item.role) || !Number.isSafeInteger(item.expiresAt) || now() >= item.expiresAt || !idPattern.test(item.managerUid)) throw unavailable();
    const manager = await tx.get(space.collection("members").doc(item.managerUid));
    if (!isManager(spaceSnap, manager) || spaceSnap.data().managerUid !== item.managerUid || (memberSnap.exists && memberSnap.data().active === true)) throw unavailable();
    if (invitationVersion(spaceSnap.data()) !== item.invitationVersion) throw unavailable();
    // A learner slot cannot be transferred to a different account by re-inviting.
    if (item.role === "learner" && spaceSnap.data().learnerUid != null && spaceSnap.data().learnerUid !== caller.uid) throw unavailable();
    if (item.role === "supervisor" && spaceSnap.data().learnerUid === caller.uid) throw unavailable();
    return { spaceSnap, item };
  }

  async function previewInvitation({ idToken, spaceId, token }) {
    const caller = await identity(idToken);
    const { space, member } = refs(spaceId, caller.uid);
    const invite = space.collection("invitations").doc(invitationId(token));
    return db.runTransaction(async (tx) => {
      const { spaceSnap, item } = await validInvitation(tx, space, member, invite, caller);
      return { learnerName: spaceSnap.data().learnerName, role: item.role, expiresAt: item.expiresAt };
    });
  }

  async function acceptInvitation({ idToken, spaceId, token }) {
    const caller = await identity(idToken);
    const { space, member } = refs(spaceId, caller.uid);
    const invite = space.collection("invitations").doc(invitationId(token));
    await db.runTransaction(async (tx) => {
      const { item } = await validInvitation(tx, space, member, invite, caller);
      tx.set(member, { role: item.role, active: true, emailAtJoining: caller.email, joinedAt: FieldValue.serverTimestamp() });
      tx.set(db.collection("users").doc(caller.uid).collection("spaceLinks").doc(space.id), { spaceId: space.id });
      if (item.role === "learner") tx.update(space, { learnerUid: caller.uid });
      tx.update(invite, { status: "accepted", acceptedByUid: caller.uid, acceptedAt: FieldValue.serverTimestamp() });
    });
    return { spaceId: space.id };
  }

  async function cancelInvitation({ idToken, spaceId, token }) {
    const caller = await identity(idToken);
    const { space, member } = refs(spaceId, caller.uid);
    const invite = space.collection("invitations").doc(invitationId(token));
    await db.runTransaction(async (tx) => {
      const [spaceSnap, managerSnap, inviteSnap] = await tx.getAll(space, member, invite);
      if (!isManager(spaceSnap, managerSnap) || spaceSnap.data().managerUid !== caller.uid) throw unauthorized();
      if (!inviteSnap.exists || inviteSnap.data().status !== "pending") throw unavailable();
      tx.update(invite, { status: "cancelled", cancelledAt: FieldValue.serverTimestamp() });
    });
  }

  async function listInvitations({ idToken, spaceId, cursor = "" }) {
    const caller = await identity(idToken);
    if (typeof cursor !== "string" || (cursor !== "" && !invitationIdPattern.test(cursor))) throw unauthorized();
    const { space, member } = refs(spaceId, caller.uid);
    return db.runTransaction(async (tx) => {
      const [spaceSnap, managerSnap] = await tx.getAll(space, member);
      if (!isManager(spaceSnap, managerSnap) || spaceSnap.data().managerUid !== caller.uid) throw unauthorized();
      const version = invitationVersion(spaceSnap.data());
      // Scan bounded pages, including expired or invalidated pending records.
      let query = space.collection("invitations").where("status", "==", "pending").orderBy(FieldPath.documentId()).limit(26);
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await tx.get(query);
      const page = snapshot.docs.slice(0, 25);
      const invitations = page.filter((doc) => {
        const item = doc.data();
        return item.invitationVersion === version && Number.isSafeInteger(item.expiresAt) && item.expiresAt > now() && item.managerUid === caller.uid && ["supervisor", "learner"].includes(item.role);
      }).map((doc) => ({ id: doc.id, recipientEmail: doc.data().recipientEmail, role: doc.data().role, expiresAt: doc.data().expiresAt }));
      return { invitations, nextCursor: snapshot.size > 25 ? page[page.length - 1].id : null };
    });
  }

  async function cancelInvitationById({ idToken, spaceId, invitationId: targetId }) {
    const caller = await identity(idToken);
    if (typeof targetId !== "string" || !invitationIdPattern.test(targetId)) throw unavailable();
    const { space, member } = refs(spaceId, caller.uid);
    const invite = space.collection("invitations").doc(targetId);
    await db.runTransaction(async (tx) => {
      const [spaceSnap, managerSnap, inviteSnap] = await tx.getAll(space, member, invite);
      if (!isManager(spaceSnap, managerSnap) || spaceSnap.data().managerUid !== caller.uid) throw unauthorized();
      if (!inviteSnap.exists || inviteSnap.data().status !== "pending" || inviteSnap.data().invitationVersion !== invitationVersion(spaceSnap.data()) || inviteSnap.data().expiresAt <= now()) throw unavailable();
      tx.update(invite, { status: "cancelled", cancelledAt: FieldValue.serverTimestamp() });
    });
  }

  async function removeMember({ idToken, spaceId, memberUid }) {
    const caller = await identity(idToken);
    const { space, member } = refs(spaceId, caller.uid);
    const targetUid = checkId(memberUid);
    const target = space.collection("members").doc(targetUid);
    const link = db.collection("users").doc(targetUid).collection("spaceLinks").doc(space.id);
    await db.runTransaction(async (tx) => {
      const [spaceSnap, managerSnap, targetSnap] = await tx.getAll(space, member, target);
      if (!isManager(spaceSnap, managerSnap) || spaceSnap.data().managerUid !== caller.uid) throw unauthorized();
      if (!targetSnap.exists || targetSnap.data().active !== true || targetSnap.data().role === "manager") throw unauthorized();
      // Invalidate all pending invitations in this space. An account can change
      // its email, so filtering only by the old invite address is unsafe.
      tx.update(space, { invitationVersion: invitationVersion(spaceSnap.data()) + 1 });
      tx.update(target, { active: false, removedAt: FieldValue.serverTimestamp(), emailAtJoining: FieldValue.delete() });
      tx.delete(link);
    });
  }

  async function createDrive({ idToken, spaceId, operationId, date, minutes, nightMinutes, notes, supervisorPresentUid, routeId = "", practicedSkills, practicedConditions }) {
    const caller = await identity(idToken);
    if (typeof operationId !== "string" || !operationIdPattern.test(operationId) || !validDate(date) ||
      typeof minutes !== "string" || !/^[1-9]\d{0,3}$/.test(minutes) || Number(minutes) > 1440 ||
      typeof nightMinutes !== "string" || !/^(0|[1-9]\d{0,3})$/.test(nightMinutes) || Number(nightMinutes) > Number(minutes) ||
      typeof notes !== "string" || notes.length > 1000 || typeof routeId !== "string" || (routeId !== "" && !operationIdPattern.test(routeId))) throw rejected("Invalid drive details.");
    const presentUid = checkId(supervisorPresentUid);
    const skills = practiceTags(practicedSkills, PRACTICE_SKILLS), conditions = practiceTags(practicedConditions, PRACTICE_CONDITIONS);
    const { space, member } = refs(spaceId, caller.uid);
    const present = space.collection("members").doc(presentUid);
    const drive = space.collection("drives").doc(operationId);
    const data = { date, minutes: Number(minutes), nightMinutes: Number(nightMinutes), notes, recordedByUid: caller.uid, lastEditedByUid: caller.uid, supervisorPresentUid: presentUid };
    return db.runTransaction(async (tx) => {
      const route = routeId ? space.collection("routes").doc(routeId) : null;
      const [spaceSnap, actorSnap, presentSnap, existing, routeSnap] = await tx.getAll(space, member, present, drive, ...(route ? [route] : []));
      const supervisor = (snapshot) => snapshot.exists && snapshot.data().active === true && ["manager", "supervisor"].includes(snapshot.data().role) && (snapshot.data().role !== "manager" || snapshot.id === spaceSnap.data()?.managerUid);
      if (!spaceSnap.exists || spaceSnap.data().status !== "active" || !supervisor(actorSnap) || !supervisor(presentSnap)) throw unauthorized();
      if (existing.exists) {
        const saved = existing.data();
        if (!Object.entries(data).every(([key, value]) => saved[key] === value) || (saved.routeId ?? "") !== routeId ||
          JSON.stringify(saved.practicedSkills ?? []) !== JSON.stringify(skills) || JSON.stringify(saved.practicedConditions ?? []) !== JSON.stringify(conditions)) throw rejected("Drive operation conflicts with an existing record.");
        return { driveId: drive.id, created: false };
      }
      if (!route) throw rejected("Choose a saved route before recording a drive.");
      if (route && !routeSnap.exists) throw rejected("Route is unavailable in this space.");
      if (!routeSnap.data().geometry) throw rejected("Choose a mapped route before recording a drive.");
      if (!routeApproved(routeSnap.data())) throw rejected("This route is waiting for the managing supervisor's approval.");
      routeGeometry(JSON.stringify(routeSnap.data().geometry));
      const routeDetails = route ? { routeId, routeSnapshot: { name: routeSnap.data().name, start: routeSnap.data().start, destination: routeSnap.data().destination, ...(routeSnap.data().geometry ? { geometry: routeSnap.data().geometry } : {}), ...(routeSnap.data().roadPolyline ? { roadPolyline: routeSnap.data().roadPolyline } : {}) } } : {};
      // Drives on a community route add to its totals: how often it was driven and by
      // how many families. Only counts are kept, never who drove it or when.
      const publicId = routeSnap.data().sourcePublicRouteId || routeSnap.data().publicRouteId;
      let counted = "";
      if (publicId) {
        const publicRef = db.collection("publicRoutes").doc(publicId), practiced = publicRef.collection("practicedBy").doc(space.id);
        const [publicSnap, practicedSnap] = await tx.getAll(publicRef, practiced);
        if (publicSnap.exists) {
          counted = publicId;
          tx.update(publicRef, { driveCount: FieldValue.increment(1), ...(practicedSnap.exists ? {} : { practicedCount: FieldValue.increment(1) }) });
          if (!practicedSnap.exists) tx.create(practiced, { since: FieldValue.serverTimestamp() });
        }
      }
      tx.create(drive, { ...data, practicedSkills: skills, practicedConditions: conditions, ...routeDetails, ...(counted ? { countedPublicRouteId: counted } : {}), createdAt: FieldValue.serverTimestamp() });
      return { driveId: drive.id, created: true };
    });
  }
  async function createRoute({ idToken, spaceId, operationId, name, start, destination, geometry: geometryInput, roadPolyline = "" }) {
    const caller = await identity(idToken);
    const validText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\r\n\u2028\u2029]/.test(value);
    if (typeof operationId !== "string" || !operationIdPattern.test(operationId) || !validText(name, 80) || !validText(start, 160) || !validText(destination, 160)) throw rejected("Invalid route details.");
    const geometry = routeGeometry(geometryInput);
    if (typeof roadPolyline !== "string") throw rejected("Invalid route line.");
    if (roadPolyline) { if (!geometry) throw rejected("Invalid route line."); decodeRoutePolyline(roadPolyline); }
    const { space, member } = refs(spaceId, caller.uid);
    const route = space.collection("routes").doc(operationId);
    const data = { name: name.trim(), start: start.trim(), destination: destination.trim(), createdByUid: caller.uid };
    return db.runTransaction(async (tx) => {
      const [spaceSnap, actorSnap, existing] = await tx.getAll(space, member, route);
      const actor = actorSnap.data();
      if (!spaceSnap.exists || spaceSnap.data().status !== "active" || !actorSnap.exists || actor.active !== true || !["manager", "supervisor", "learner"].includes(actor.role) || (actor.role === "manager" && caller.uid !== spaceSnap.data().managerUid)) throw unauthorized();
      if (existing.exists) {
        if (!Object.entries(data).every(([key, value]) => existing.data()[key] === value) || JSON.stringify(existing.data().geometry ?? null) !== JSON.stringify(geometry) || (existing.data().roadPolyline ?? "") !== roadPolyline) throw rejected("Route operation conflicts with an existing record.");
        return { routeId: route.id, created: false };
      }
      if (!geometry) throw rejected("Draw a route with at least two map points.");
      if (!roadPolyline) throw rejected("Find a road route before saving.");
      // A learner's route is a proposal until the managing supervisor approves it.
      const status = actor.role === "learner" ? "proposed" : "approved";
      tx.create(route, { ...data, status, geometry, ...(roadPolyline ? { roadPolyline } : {}), createdAt: FieldValue.serverTimestamp() });
      return { routeId: route.id, created: true, status };
    });
  }
  async function editDrive({ idToken, spaceId, driveId, operationId, expectedRevision, date, minutes, nightMinutes, notes, practicedSkills, practicedConditions }) {
    const caller = await identity(idToken);
    if (typeof operationId !== "string" || !operationIdPattern.test(operationId) || typeof expectedRevision !== "string" || !/^(0|[1-9]\d{0,15})$/.test(expectedRevision) || !Number.isSafeInteger(Number(expectedRevision)) || Number(expectedRevision) >= Number.MAX_SAFE_INTEGER || !validDate(date) ||
      typeof minutes !== "string" || !/^[1-9]\d{0,3}$/.test(minutes) || Number(minutes) > 1440 || typeof nightMinutes !== "string" || !/^(0|[1-9]\d{0,3})$/.test(nightMinutes) || Number(nightMinutes) > Number(minutes) || typeof notes !== "string" || notes.length > 1000) throw rejected("Invalid drive details.");
    const skills = practiceTags(practicedSkills, PRACTICE_SKILLS), conditions = practiceTags(practicedConditions, PRACTICE_CONDITIONS);
    const { space, member } = refs(spaceId, caller.uid);
    const drive = space.collection("drives").doc(checkId(driveId));
    const operation = space.collection("driveEditOperations").doc(operationId);
    const fingerprint = createHash("sha256").update(JSON.stringify([drive.id, caller.uid, expectedRevision, date, minutes, nightMinutes, notes, skills, conditions])).digest("hex");
    return db.runTransaction(async (tx) => {
      const [spaceSnap, actorSnap, driveSnap, operationSnap] = await tx.getAll(space, member, drive, operation);
      const actor = actorSnap.data(), existing = driveSnap.data();
      if (!spaceSnap.exists || spaceSnap.data().status !== "active" || !actorSnap.exists || actor.active !== true || !driveSnap.exists ||
        !((actor.role === "manager" && caller.uid === spaceSnap.data().managerUid) || (actor.role === "supervisor" && existing.recordedByUid === caller.uid))) throw unauthorized();
      if (operationSnap.exists) {
        if (operationSnap.data().fingerprint !== fingerprint) throw rejected("Edit operation conflicts with an existing request.");
        return { driveId: drive.id, updated: false };
      }
      const revision = existing.revision ?? 0;
      if (!Number.isSafeInteger(revision) || revision < 0 || revision !== Number(expectedRevision)) throw rejected("Drive changed on another device.");
      tx.update(drive, { date, minutes: Number(minutes), nightMinutes: Number(nightMinutes), notes, practicedSkills: skills, practicedConditions: conditions, revision: revision + 1, lastEditedByUid: caller.uid, lastEditedAt: FieldValue.serverTimestamp() });
      tx.create(operation, { fingerprint, createdAt: FieldValue.serverTimestamp() });
      return { driveId: drive.id, updated: true };
    });
  }
  // Deleting a drive follows the edit rules: the manager may delete any drive, a
  // supervisor only drives they recorded. The revision must match, so a drive that
  // changed on another device is not deleted unseen. Repeating a delete is harmless.
  async function deleteDrive({ idToken, spaceId, driveId, expectedRevision }) {
    const caller = await identity(idToken);
    if (typeof expectedRevision !== "string" || !/^(0|[1-9]\d{0,15})$/.test(expectedRevision)) throw rejected("Invalid drive details.");
    const { space, member } = refs(spaceId, caller.uid);
    const drive = space.collection("drives").doc(checkId(driveId));
    return db.runTransaction(async (tx) => {
      const [spaceSnap, actorSnap, driveSnap] = await tx.getAll(space, member, drive);
      const actor = actorSnap.data();
      if (!spaceSnap.exists || spaceSnap.data().status !== "active" || !actorSnap.exists || actor.active !== true || !["manager", "supervisor"].includes(actor.role)) throw unauthorized();
      if (!driveSnap.exists) return { deleted: false };
      if (!((actor.role === "manager" && caller.uid === spaceSnap.data().managerUid) || (actor.role === "supervisor" && driveSnap.data().recordedByUid === caller.uid))) throw unauthorized();
      if ((driveSnap.data().revision ?? 0) !== Number(expectedRevision)) throw rejected("Drive changed on another device.");
      const counted = driveSnap.data().countedPublicRouteId;
      if (counted) {
        const publicRef = db.collection("publicRoutes").doc(counted), publicSnap = await tx.get(publicRef);
        if (publicSnap.exists && (publicSnap.data().driveCount ?? 0) > 0) tx.update(publicRef, { driveCount: FieldValue.increment(-1) });
      }
      tx.delete(drive);
      return { deleted: true };
    });
  }

  // The manager or the route's creator may delete a route. Drives logged on it keep
  // their own snapshot of the route, so history is unchanged.
  async function deleteRoute({ idToken, spaceId, routeId }) {
    const caller = await identity(idToken);
    const { space, member } = refs(spaceId, caller.uid);
    const route = space.collection("routes").doc(checkId(routeId));
    return db.runTransaction(async (tx) => {
      const [spaceSnap, actorSnap, routeSnap] = await tx.getAll(space, member, route);
      const actor = actorSnap.data();
      if (!spaceSnap.exists || spaceSnap.data().status !== "active" || !actorSnap.exists || actor.active !== true || !["manager", "supervisor", "learner"].includes(actor.role)) throw unauthorized();
      if (!routeSnap.exists) return { deleted: false };
      if (!((actor.role === "manager" && caller.uid === spaceSnap.data().managerUid) || routeSnap.data().createdByUid === caller.uid)) throw unauthorized();
      tx.delete(route);
      return { deleted: true, publicRouteId: routeSnap.data().publicRouteId };
    }).then(async ({ publicRouteId, ...result }) => { if (publicRouteId) await removePublic(publicRouteId); return result; });
  }

  // A supervisor or learner may leave a space. Like removal by the manager, this
  // ends their access and invalidates the space's pending invitations.
  async function leaveSpace({ idToken, spaceId }) {
    const caller = await identity(idToken);
    const { space, member } = refs(spaceId, caller.uid);
    const link = db.collection("users").doc(caller.uid).collection("spaceLinks").doc(space.id);
    await db.runTransaction(async (tx) => {
      const [spaceSnap, memberSnap] = await tx.getAll(space, member);
      if (!spaceSnap.exists || spaceSnap.data().status !== "active" || !memberSnap.exists || memberSnap.data().active !== true || !["supervisor", "learner"].includes(memberSnap.data().role)) throw unauthorized();
      tx.update(space, { invitationVersion: invitationVersion(spaceSnap.data()) + 1 });
      tx.update(member, { active: false, leftAt: FieldValue.serverTimestamp(), emailAtJoining: FieldValue.delete() });
      tx.delete(link);
    });
    return { left: true };
  }

  // The manager may delete the learner's whole space after typing the learner's name.
  // The space is first marked "deleting", which stops every other change (all writes
  // require an active space); then each member's discovery link and the space with all
  // its drives, routes, memberships and invitations are deleted. A failed run can be
  // repeated to finish the cleanup.
  async function deleteSpace({ idToken, spaceId, confirmName }) {
    const caller = await identity(idToken);
    const { space, member } = refs(spaceId, caller.uid);
    const ownLink = db.collection("users").doc(caller.uid).collection("spaceLinks").doc(space.id);
    const state = await db.runTransaction(async (tx) => {
      const [spaceSnap, managerSnap] = await tx.getAll(space, member);
      if (!spaceSnap.exists) return "gone";
      const data = spaceSnap.data();
      if (data.managerUid !== caller.uid) throw unauthorized();
      if (data.status === "deleting") return "resume";
      if (!isManager(spaceSnap, managerSnap)) throw unauthorized();
      if (typeof confirmName !== "string" || confirmName.trim() !== data.learnerName) throw rejected("Type the learner's name exactly to confirm.");
      tx.update(space, { status: "deleting", deletingAt: FieldValue.serverTimestamp() });
      return "started";
    });
    if (state === "gone") { await ownLink.delete(); return { deleted: false }; }
    const members = await space.collection("members").get();
    const writer = db.bulkWriter();
    for (const doc of members.docs) writer.delete(db.collection("users").doc(doc.id).collection("spaceLinks").doc(space.id));
    await writer.close();
    const published = await db.collection("publicRouteSources").where("spaceId", "==", space.id).get();
    for (const source of published.docs) await removePublic(source.id);
    await db.recursiveDelete(space);
    return { deleted: true };
  }
  // Deletes the caller's own sign-in account. It needs a sign-in within the last
  // ten minutes and the account's email typed as confirmation, and it refuses while
  // the caller still manages a learner space (those are deleted first, on purpose).
  // Other memberships end as if the person had left; their drives and routes stay
  // with the learner's history without their email. Existing sessions are revoked
  // first, so a failed run is finished by signing in again and repeating it.
  async function deleteAccount({ idToken, confirmEmail }) {
    const caller = await identity(idToken);
    if (emailKey(confirmEmail) !== caller.email) throw rejected("Type your account email exactly to confirm.");
    if (!caller.authTime || now() - caller.authTime * 1000 > RECENT_SIGN_IN_MS) throw rejected("Sign in again to confirm.");
    const user = db.collection("users").doc(caller.uid);
    const managedSpace = async () => {
      const links = await user.collection("spaceLinks").get();
      for (const link of links.docs) {
        const space = await db.collection("spaces").doc(link.id).get();
        if (space.exists && space.data().managerUid === caller.uid) return true;
      }
      return false;
    };
    if (await managedSpace()) throw rejected("Delete the learner spaces you manage first.");
    await auth.revokeRefreshTokens(caller.uid);
    // A space created from another tab just before the revocation is caught here.
    if (await managedSpace()) throw rejected("Delete the learner spaces you manage first.");
    const links = await user.collection("spaceLinks").get();
    for (const link of links.docs) {
      const { space, member } = refs(link.id, caller.uid);
      await db.runTransaction(async (tx) => {
        const [spaceSnap, memberSnap] = await tx.getAll(space, member);
        if (spaceSnap.exists && spaceSnap.data().status === "active" && memberSnap.exists && memberSnap.data().active === true) {
          tx.update(space, { invitationVersion: invitationVersion(spaceSnap.data()) + 1 });
          tx.update(member, { active: false, leftAt: FieldValue.serverTimestamp(), emailAtJoining: FieldValue.delete() });
        } else if (memberSnap.exists) tx.update(member, { emailAtJoining: FieldValue.delete() });
        tx.delete(link.ref);
      });
    }
    await db.recursiveDelete(user);
    try { await auth.deleteUser(caller.uid); } catch (error) { if (error?.code !== "auth/user-not-found") throw error; }
    return { deleted: true };
  }
  // The managing supervisor approves or declines a route a learner proposed. Only
  // approved routes can be used to log drives. Repeating the same decision is harmless;
  // a declined route can still be approved later, but an approved one stays approved.
  async function reviewRoute({ idToken, spaceId, routeId, decision, reason = "" }) {
    const caller = await identity(idToken);
    if (!["approve", "decline"].includes(decision) || typeof reason !== "string" || reason.length > 300 || /[\u0000-\u0008\u000b-\u001f]/.test(reason)) throw rejected("Invalid review.");
    const { space, member } = refs(spaceId, caller.uid);
    const route = space.collection("routes").doc(checkId(routeId));
    return db.runTransaction(async (tx) => {
      const [spaceSnap, managerSnap, routeSnap] = await tx.getAll(space, member, route);
      if (!isManager(spaceSnap, managerSnap) || spaceSnap.data().managerUid !== caller.uid || !routeSnap.exists) throw unauthorized();
      const current = routeSnap.data().status;
      const target = decision === "approve" ? "approved" : "declined";
      if (current === target) return { status: target, updated: false };
      if (!["proposed", "declined"].includes(current) || (target === "declined" && current !== "proposed")) throw rejected("Only a proposed route can be reviewed.");
      tx.update(route, { status: target, reviewedByUid: caller.uid, reviewedAt: FieldValue.serverTimestamp(), declineReason: target === "declined" ? reason.trim() : FieldValue.delete() });
      return { status: target, updated: true };
    });
  }

  // The learner adds their own reflection to a drive in their space: what went well,
  // what to practise. It is shared with everyone in the space and never changes the
  // supervisor's record. An empty reflection removes it.
  async function setReflection({ idToken, spaceId, driveId, reflection }) {
    const caller = await identity(idToken);
    if (typeof reflection !== "string" || reflection.length > 1000) throw rejected("Invalid reflection.");
    const { space, member } = refs(spaceId, caller.uid);
    const drive = space.collection("drives").doc(checkId(driveId));
    const text = reflection.trim();
    return db.runTransaction(async (tx) => {
      const [spaceSnap, memberSnap, driveSnap] = await tx.getAll(space, member, drive);
      if (!spaceSnap.exists || spaceSnap.data().status !== "active" || !memberSnap.exists || memberSnap.data().active !== true || memberSnap.data().role !== "learner" || !driveSnap.exists) throw unauthorized();
      tx.update(drive, text ? { learnerReflection: text, learnerReflectionByUid: caller.uid, learnerReflectionAt: FieldValue.serverTimestamp() } : { learnerReflection: FieldValue.delete(), learnerReflectionByUid: FieldValue.delete(), learnerReflectionAt: FieldValue.delete() });
      return { saved: true };
    });
  }
  // ---- Public route library -------------------------------------------------
  // A published route is copied to publicRoutes/{id} with no learner name, space,
  // member or start/destination text, and with ~300 m cut from both ends of the line.
  // publicRouteSources/{id} (server-only) remembers where it came from.
  async function removePublic(publicRouteId) {
    await db.recursiveDelete(db.collection("publicRoutes").doc(publicRouteId));
    await db.collection("publicRouteSources").doc(publicRouteId).delete();
  }

  // The whole route is shared as drawn, start and end included: the manager confirms
  // it starts and ends at public places and doesn't pass their home. (Cutting gaps
  // around private places was tried and dropped: gaps across several routes from one
  // family could point to where they live.)
  async function publishRoute({ idToken, spaceId, routeId, name, description = "", area, practicedSkills, practicedConditions, confirmPrivacy }) {
    const caller = await identity(idToken);
    if (!oneLine(name, 3, 80) || !oneLine(area, 2, 60) || typeof description !== "string" || description.length > 300 || /[\u0000-\u0008\u000b-\u001f]/.test(description)) throw rejected("Invalid public route details.");
    if (confirmPrivacy !== "yes") throw rejected("Confirm that the route doesn't start, end or pass at a private place.");
    const skills = practiceTags(practicedSkills, PRACTICE_SKILLS), conditions = practiceTags(practicedConditions, PRACTICE_CONDITIONS);
    const { space, member } = refs(spaceId, caller.uid);
    const route = space.collection("routes").doc(checkId(routeId));
    return db.runTransaction(async (tx) => {
      const [spaceSnap, managerSnap, routeSnap] = await tx.getAll(space, member, route);
      if (!isManager(spaceSnap, managerSnap) || spaceSnap.data().managerUid !== caller.uid || !routeSnap.exists) throw unauthorized();
      const data = routeSnap.data();
      if (data.publicRouteId) {
        const existing = await tx.get(db.collection("publicRoutes").doc(data.publicRouteId));
        if (existing.exists) return { publicRouteId: data.publicRouteId, created: false };
      }
      if (!routeApproved(data)) throw rejected("Only an approved route can be shared.");
      if (!data.roadPolyline) throw rejected("Only a route that follows roads can be shared.");
      const line = samplePoints(decodeRoutePolyline(data.roadPolyline).map(({ lat, lng }) => ({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 })), 1000);
      const publicRef = db.collection("publicRoutes").doc();
      tx.create(publicRef, { name: name.trim(), description: description.trim(), area: area.trim(), practicedSkills: skills, practicedConditions: conditions, line: encodeRoutePolyline(line), lengthKm: Math.round(lineLengthM(line) / 100) / 10, reportCount: 0, saveCount: 0, practicedCount: 0, driveCount: 0, ratingCount: 0, starsTotal: 0, difficultyTotal: 0, tipReportCount: 0, publishedAt: FieldValue.serverTimestamp() });
      tx.create(db.collection("publicRouteSources").doc(publicRef.id), { spaceId: space.id, routeId: route.id, publishedByUid: caller.uid, publishedAt: FieldValue.serverTimestamp() });
      // The family's own route remembers the skills too, so its drive form can suggest them.
      tx.update(route, { publicRouteId: publicRef.id, suggestedSkills: skills, suggestedConditions: conditions });
      return { publicRouteId: publicRef.id, created: true };
    });
  }

  async function unpublishRoute({ idToken, spaceId, routeId }) {
    const caller = await identity(idToken);
    const { space, member } = refs(spaceId, caller.uid);
    const route = space.collection("routes").doc(checkId(routeId));
    const publicRouteId = await db.runTransaction(async (tx) => {
      const [spaceSnap, managerSnap, routeSnap] = await tx.getAll(space, member, route);
      if (!isManager(spaceSnap, managerSnap) || spaceSnap.data().managerUid !== caller.uid || !routeSnap.exists) throw unauthorized();
      const id = routeSnap.data().publicRouteId;
      if (id) tx.update(route, { publicRouteId: FieldValue.delete() });
      return id;
    });
    if (publicRouteId) await removePublic(publicRouteId);
    return { unpublished: !!publicRouteId };
  }

  async function reportPublicRoute({ idToken, publicRouteId, reason, note = "" }) {
    const caller = await identity(idToken);
    if (!REPORT_REASONS.includes(reason) || typeof note !== "string" || note.length > 300 || /[\u0000-\u0008\u000b-\u001f]/.test(note)) throw rejected("Invalid report.");
    const publicRef = db.collection("publicRoutes").doc(checkId(publicRouteId));
    const report = publicRef.collection("reports").doc(caller.uid);
    return db.runTransaction(async (tx) => {
      const [publicSnap, reportSnap] = await tx.getAll(publicRef, report);
      if (!publicSnap.exists) throw unauthorized();
      if (reportSnap.exists) return { reported: false };
      tx.create(report, { reason, note: note.trim(), createdAt: FieldValue.serverTimestamp() });
      tx.update(publicRef, { reportCount: FieldValue.increment(1) });
      return { reported: true };
    });
  }

  // A manager or supervisor copies a public route into a learner's space, where it is
  // an ordinary approved route. The operation ID makes retries safe.
  async function savePublicRoute({ idToken, publicRouteId, spaceId, operationId }) {
    const caller = await identity(idToken);
    if (typeof operationId !== "string" || !operationIdPattern.test(operationId)) throw rejected("Invalid route details.");
    const { space, member } = refs(spaceId, caller.uid);
    const publicRef = db.collection("publicRoutes").doc(checkId(publicRouteId));
    const route = space.collection("routes").doc(operationId);
    return db.runTransaction(async (tx) => {
      const savedBy = publicRef.collection("savedBy").doc(space.id);
      const [spaceSnap, actorSnap, publicSnap, existing, savedSnap] = await tx.getAll(space, member, publicRef, route, savedBy);
      const actor = actorSnap.data();
      if (!spaceSnap.exists || spaceSnap.data().status !== "active" || !actorSnap.exists || actor.active !== true || !["manager", "supervisor"].includes(actor.role) || (actor.role === "manager" && caller.uid !== spaceSnap.data().managerUid)) throw unauthorized();
      if (existing.exists) {
        if (existing.data().createdByUid !== caller.uid || existing.data().sourcePublicRouteId !== publicRef.id) throw rejected("Route operation conflicts with an existing record.");
        return { routeId: route.id, created: false };
      }
      if (!publicSnap.exists) throw rejected("This public route is no longer available.");
      const item = publicSnap.data();
      const line = decodeRoutePolyline(item.line);
      tx.create(route, { name: item.name, start: "Community route", destination: item.area, geometry: samplePoints(line, 50).map(({ lat, lng }) => ({ lat, lng })), roadPolyline: item.line, createdByUid: caller.uid, status: "approved", sourcePublicRouteId: publicRef.id, suggestedSkills: item.practicedSkills ?? [], suggestedConditions: item.practicedConditions ?? [], createdAt: FieldValue.serverTimestamp() });
      if (!savedSnap.exists) { tx.create(savedBy, { since: FieldValue.serverTimestamp() }); tx.update(publicRef, { saveCount: FieldValue.increment(1) }); }
      return { routeId: route.id, created: true };
    });
  }

  async function moderator(idToken) {
    const caller = await identity(idToken);
    if (!isModerator(caller.email)) throw unauthorized();
    return caller;
  }
  async function moderationStatus({ idToken }) {
    const caller = await identity(idToken);
    return { moderator: !!isModerator(caller.email) };
  }
  async function listReportedRoutes({ idToken }) {
    await moderator(idToken);
    const [routeReports, tipReports] = await Promise.all([
      db.collection("publicRoutes").where("reportCount", ">", 0).orderBy("reportCount", "desc").limit(50).get(),
      db.collection("publicRoutes").where("tipReportCount", ">", 0).orderBy("tipReportCount", "desc").limit(50).get(),
    ]);
    const docs = [...routeReports.docs, ...tipReports.docs.filter((item) => !routeReports.docs.some((other) => other.id === item.id))];
    const routes = await Promise.all(docs.map(async (item) => {
      const [reports, tips] = await Promise.all([item.ref.collection("reports").orderBy("createdAt", "desc").limit(20).get(), item.ref.collection("tips").where("reportCount", ">", 0).limit(20).get()]);
      return { id: item.id, name: item.data().name, area: item.data().area, reportCount: item.data().reportCount ?? 0, reports: reports.docs.map((report) => ({ reason: report.data().reason, note: report.data().note ?? "", createdAt: report.data().createdAt?.toMillis?.() ?? 0 })), tips: tips.docs.map((tip) => ({ id: tip.id, text: tip.data().text, reportCount: tip.data().reportCount })) };
    }));
    return { routes };
  }
  async function moderatePublicRoute({ idToken, publicRouteId, action, tipId: targetTip = "" }) {
    await moderator(idToken);
    if (!["remove", "dismiss", "removeTip", "keepTip"].includes(action)) throw rejected("Invalid moderation action.");
    const publicRef = db.collection("publicRoutes").doc(checkId(publicRouteId));
    if (action === "removeTip" || action === "keepTip") {
      const tip = publicRef.collection("tips").doc(checkId(targetTip));
      const tipSnap = await tip.get();
      const count = tipSnap.exists ? tipSnap.data().reportCount ?? 0 : 0;
      if (action === "removeTip") await db.recursiveDelete(tip);
      else if (tipSnap.exists) { const reports = await tip.collection("reports").get(); const writer = db.bulkWriter(); for (const report of reports.docs) writer.delete(report.ref); await writer.close(); await tip.update({ reportCount: 0 }); }
      await db.runTransaction(async (tx) => { const snap = await tx.get(publicRef); if (snap.exists) tx.update(publicRef, { tipReportCount: Math.max(0, (snap.data().tipReportCount ?? 0) - count) }); });
      return { [action === "removeTip" ? "removed" : "kept"]: true };
    }
    if (action === "dismiss") {
      const reports = await publicRef.collection("reports").get();
      const writer = db.bulkWriter();
      for (const report of reports.docs) writer.delete(report.ref);
      await writer.close();
      if ((await publicRef.get()).exists) await publicRef.update({ reportCount: 0 });
      return { dismissed: true };
    }
    const source = await db.collection("publicRouteSources").doc(publicRef.id).get();
    if (source.exists) {
      const routeRef = db.collection("spaces").doc(source.data().spaceId).collection("routes").doc(source.data().routeId);
      await db.runTransaction(async (tx) => { const snap = await tx.get(routeRef); if (snap.exists && snap.data().publicRouteId === publicRef.id) tx.update(routeRef, { publicRouteId: FieldValue.delete() }); });
    }
    await removePublic(publicRef.id);
    return { removed: true };
  }
  // ---- Community reviews ----------------------------------------------------
  // Anyone in a family that has logged at least one drive on a community route can
  // rate it (1–5 stars and a 1–5 difficulty) and leave one short tip. Ratings are kept
  // per account, server-only, so each person counts once and can change their mind;
  // the public record holds only totals. Tips carry no name or account.
  const tipId = (uid, publicRouteId) => createHash("sha256").update(`tip:${uid}:${publicRouteId}`).digest("hex").slice(0, 32);
  async function practisedRoute(caller, publicRef) {
    const links = await db.collection("users").doc(caller.uid).collection("spaceLinks").get();
    for (const link of links.docs) {
      const [practiced, membership, spaceSnap] = await db.getAll(publicRef.collection("practicedBy").doc(link.id), db.collection("spaces").doc(link.id).collection("members").doc(caller.uid), db.collection("spaces").doc(link.id));
      if (practiced.exists && membership.exists && membership.data().active === true && spaceSnap.exists && spaceSnap.data().status === "active") return true;
    }
    return false;
  }
  async function myRouteReview({ idToken, publicRouteId }) {
    const caller = await identity(idToken);
    const publicRef = db.collection("publicRoutes").doc(checkId(publicRouteId));
    const [publicSnap, ratingSnap, tipSnap] = await db.getAll(publicRef, publicRef.collection("ratings").doc(caller.uid), publicRef.collection("tips").doc(tipId(caller.uid, publicRef.id)));
    if (!publicSnap.exists) throw unauthorized();
    return { canReview: await practisedRoute(caller, publicRef), rating: ratingSnap.exists ? { stars: ratingSnap.data().stars, difficulty: ratingSnap.data().difficulty } : null, tip: tipSnap.exists ? tipSnap.data().text : "", tipId: tipSnap.exists ? tipSnap.id : "" };
  }
  async function rateRoute({ idToken, publicRouteId, stars, difficulty }) {
    const caller = await identity(idToken);
    if (!/^[1-5]$/.test(stars ?? "") || !/^[1-5]$/.test(difficulty ?? "")) throw rejected("Invalid rating.");
    const publicRef = db.collection("publicRoutes").doc(checkId(publicRouteId));
    if (!(await practisedRoute(caller, publicRef))) throw rejected("Log a drive on this route before rating it.");
    const rating = publicRef.collection("ratings").doc(caller.uid);
    return db.runTransaction(async (tx) => {
      const [publicSnap, ratingSnap] = await tx.getAll(publicRef, rating);
      if (!publicSnap.exists) throw unauthorized();
      const before = ratingSnap.exists ? ratingSnap.data() : null, next = { stars: Number(stars), difficulty: Number(difficulty) };
      tx.set(rating, { ...next, updatedAt: FieldValue.serverTimestamp() });
      tx.update(publicRef, { ratingCount: FieldValue.increment(before ? 0 : 1), starsTotal: FieldValue.increment(next.stars - (before?.stars ?? 0)), difficultyTotal: FieldValue.increment(next.difficulty - (before?.difficulty ?? 0)) });
      return { saved: true, updated: !!before };
    });
  }
  async function setRouteTip({ idToken, publicRouteId, text }) {
    const caller = await identity(idToken);
    if (typeof text !== "string" || text.length > 280 || /[\u0000-\u0008\u000b-\u001f]/.test(text)) throw rejected("Invalid tip.");
    const publicRef = db.collection("publicRoutes").doc(checkId(publicRouteId));
    if (!(await practisedRoute(caller, publicRef))) throw rejected("Log a drive on this route before leaving a tip.");
    const tip = publicRef.collection("tips").doc(tipId(caller.uid, publicRef.id)), clean = text.trim();
    return db.runTransaction(async (tx) => {
      const [publicSnap, tipSnap] = await tx.getAll(publicRef, tip);
      if (!publicSnap.exists) throw unauthorized();
      if (!clean) { if (tipSnap.exists) tx.delete(tip); return { saved: false, removed: tipSnap.exists }; }
      // Editing a tip clears earlier reports about it, but the moderator still sees new ones.
      tx.set(tip, { text: clean, createdAt: tipSnap.exists ? tipSnap.data().createdAt : FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), reportCount: tipSnap.exists ? tipSnap.data().reportCount ?? 0 : 0 });
      return { saved: true, tipId: tip.id };
    });
  }
  async function reportTip({ idToken, publicRouteId, tipId: reportedTip, reason }) {
    const caller = await identity(idToken);
    if (!REPORT_REASONS.includes(reason)) throw rejected("Invalid report.");
    const publicRef = db.collection("publicRoutes").doc(checkId(publicRouteId));
    const tip = publicRef.collection("tips").doc(checkId(reportedTip)), report = tip.collection("reports").doc(caller.uid);
    return db.runTransaction(async (tx) => {
      const [publicSnap, tipSnap, reportSnap] = await tx.getAll(publicRef, tip, report);
      if (!publicSnap.exists || !tipSnap.exists) throw unauthorized();
      if (reportSnap.exists) return { reported: false };
      tx.create(report, { reason, createdAt: FieldValue.serverTimestamp() });
      tx.update(tip, { reportCount: FieldValue.increment(1) });
      tx.update(publicRef, { tipReportCount: FieldValue.increment(1) });
      return { reported: true };
    });
  }
  return { createSpace, createInvitation, previewInvitation, acceptInvitation, cancelInvitation, listInvitations, cancelInvitationById, removeMember, createDrive, createRoute, editDrive, deleteDrive, deleteRoute, leaveSpace, deleteSpace, deleteAccount, reviewRoute, setReflection, publishRoute, unpublishRoute, reportPublicRoute, savePublicRoute, moderationStatus, listReportedRoutes, moderatePublicRoute, myRouteReview, rateRoute, setRouteTip, reportTip };
}
