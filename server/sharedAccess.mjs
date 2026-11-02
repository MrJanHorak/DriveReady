// Trusted server-side prototype. Do not import into the browser or deploy as-is.
// Callers must never supply the Admin SDK instances or clock over a network API.
import { createHash, randomBytes } from "node:crypto";
import { FieldPath, FieldValue } from "firebase-admin/firestore";

const INVITATION_LIFETIME_MS = 48 * 60 * 60 * 1000;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const invitationIdPattern = /^[a-f0-9]{64}$/;
const operationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const unavailable = () => new Error("Invitation cannot be accepted.");
const unauthorized = () => new Error("Not authorized.");

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

export function createSharedAccessService({ db, auth, now = Date.now }) {
  async function identity(idToken) {
    try {
      if (typeof idToken !== "string" || !idToken) throw unauthorized();
      const claims = await auth.verifyIdToken(idToken, true);
      const uid = checkId(claims.uid);
      const account = await auth.getUser(uid);
      const email = emailKey(claims.email);
      if (claims.email_verified !== true || account.disabled || !account.emailVerified || !email || emailKey(account.email) !== email) throw unauthorized();
      return { uid, email };
    } catch { throw unauthorized(); }
  }
  const refs = (spaceId, uid) => {
    const space = db.collection("spaces").doc(checkId(spaceId));
    return { space, member: space.collection("members").doc(uid) };
  };
  const isManager = (space, member) => space.exists && space.data().status === "active" && member.exists && member.data().active === true && member.data().role === "manager";

  async function createSpace({ idToken, learnerName }) {
    const caller = await identity(idToken);
    if (typeof learnerName !== "string" || !learnerName.trim() || learnerName.trim().length > 60 || /[\r\n\u2028\u2029]/.test(learnerName)) throw new Error("Enter a learner name of up to 60 characters on one line.");
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
    if (!email || !["supervisor", "learner"].includes(role)) throw new Error("Enter a valid email and invitation role.");
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
      tx.update(target, { active: false, removedAt: FieldValue.serverTimestamp() });
      tx.delete(link);
    });
  }

  async function createDrive({ idToken, spaceId, operationId, date, minutes, nightMinutes, notes, supervisorPresentUid }) {
    const caller = await identity(idToken);
    if (typeof operationId !== "string" || !operationIdPattern.test(operationId) || !validDate(date) ||
      typeof minutes !== "string" || !/^[1-9]\d{0,3}$/.test(minutes) || Number(minutes) > 1440 ||
      typeof nightMinutes !== "string" || !/^(0|[1-9]\d{0,3})$/.test(nightMinutes) || Number(nightMinutes) > Number(minutes) ||
      typeof notes !== "string" || notes.length > 1000) throw new Error("Invalid drive details.");
    const presentUid = checkId(supervisorPresentUid);
    const { space, member } = refs(spaceId, caller.uid);
    const present = space.collection("members").doc(presentUid);
    const drive = space.collection("drives").doc(operationId);
    const data = { date, minutes: Number(minutes), nightMinutes: Number(nightMinutes), notes, recordedByUid: caller.uid, lastEditedByUid: caller.uid, supervisorPresentUid: presentUid };
    return db.runTransaction(async (tx) => {
      const [spaceSnap, actorSnap, presentSnap, existing] = await tx.getAll(space, member, present, drive);
      const supervisor = (snapshot) => snapshot.exists && snapshot.data().active === true && ["manager", "supervisor"].includes(snapshot.data().role) && (snapshot.data().role !== "manager" || snapshot.id === spaceSnap.data()?.managerUid);
      if (!spaceSnap.exists || spaceSnap.data().status !== "active" || !supervisor(actorSnap) || !supervisor(presentSnap)) throw unauthorized();
      if (existing.exists) {
        const saved = existing.data();
        if (!Object.entries(data).every(([key, value]) => saved[key] === value)) throw new Error("Drive operation conflicts with an existing record.");
        return { driveId: drive.id, created: false };
      }
      tx.create(drive, { ...data, createdAt: FieldValue.serverTimestamp() });
      return { driveId: drive.id, created: true };
    });
  }
  return { createSpace, createInvitation, previewInvitation, acceptInvitation, cancelInvitation, listInvitations, cancelInvitationById, removeMember, createDrive };
}
