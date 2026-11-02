// Trusted server-side prototype. Do not import into the browser or deploy as-is.
// Callers must never supply the Admin SDK instances or clock over a network API.
import { createHash, randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

const INVITATION_LIFETIME_MS = 48 * 60 * 60 * 1000;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
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
function recipientKey(email) { return createHash("sha256").update(email).digest("hex"); }
function versionOf(snapshot) {
  if (!snapshot.exists) return 0;
  const version = snapshot.data().version;
  if (!Number.isSafeInteger(version) || version < 0 || version >= Number.MAX_SAFE_INTEGER) throw unauthorized();
  return version;
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
      tx.create(space, { learnerName: learnerName.trim(), status: "active", managerUid: caller.uid, learnerUid: null, createdAt: FieldValue.serverTimestamp() });
      tx.create(member, { role: "manager", active: true, joinedAt: FieldValue.serverTimestamp() });
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
    const key = recipientKey(email);
    const epoch = space.collection("invitationEpochs").doc(key);
    const expiresAt = now() + INVITATION_LIFETIME_MS;
    await db.runTransaction(async (tx) => {
      const [spaceSnap, managerSnap, epochSnap] = await tx.getAll(space, member, epoch);
      if (!isManager(spaceSnap, managerSnap) || spaceSnap.data().managerUid !== caller.uid) throw unauthorized();
      tx.create(invite, { recipientEmail: email, recipientKey: key, invitationVersion: versionOf(epochSnap), role, managerUid: caller.uid, status: "pending", expiresAt, createdAt: FieldValue.serverTimestamp() });
    });
    // The token is a secret. Delivery is intentionally not implemented.
    return { spaceId: space.id, token, expiresAt };
  }

  async function acceptInvitation({ idToken, spaceId, token }) {
    const caller = await identity(idToken);
    const { space, member } = refs(spaceId, caller.uid);
    const invite = space.collection("invitations").doc(invitationId(token));
    await db.runTransaction(async (tx) => {
      const [spaceSnap, inviteSnap, memberSnap] = await tx.getAll(space, invite, member);
      if (!spaceSnap.exists || spaceSnap.data().status !== "active" || !inviteSnap.exists) throw unavailable();
      const item = inviteSnap.data();
      if (item.status !== "pending" || item.recipientEmail !== caller.email || item.recipientKey !== recipientKey(caller.email) || !Number.isSafeInteger(item.invitationVersion) || !["supervisor", "learner"].includes(item.role) || !Number.isSafeInteger(item.expiresAt) || now() >= item.expiresAt || !idPattern.test(item.managerUid)) throw unavailable();
      const [manager, epoch] = await tx.getAll(space.collection("members").doc(item.managerUid), space.collection("invitationEpochs").doc(item.recipientKey));
      if (!isManager(spaceSnap, manager) || spaceSnap.data().managerUid !== item.managerUid || (memberSnap.exists && memberSnap.data().active === true)) throw unavailable();
      if (versionOf(epoch) !== item.invitationVersion) throw unavailable();
      // A learner slot cannot be transferred to a different account by re-inviting.
      if (item.role === "learner" && spaceSnap.data().learnerUid != null && spaceSnap.data().learnerUid !== caller.uid) throw unavailable();
      if (item.role === "supervisor" && spaceSnap.data().learnerUid === caller.uid) throw unavailable();
      tx.set(member, { role: item.role, active: true, joinedAt: FieldValue.serverTimestamp() });
      tx.set(space.collection("membershipPrivate").doc(caller.uid), { recipientKey: item.recipientKey });
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

  async function removeMember({ idToken, spaceId, memberUid }) {
    const caller = await identity(idToken);
    const { space, member } = refs(spaceId, caller.uid);
    const targetUid = checkId(memberUid);
    const target = space.collection("members").doc(targetUid);
    const link = db.collection("users").doc(targetUid).collection("spaceLinks").doc(space.id);
    await db.runTransaction(async (tx) => {
      const metadata = space.collection("membershipPrivate").doc(targetUid);
      const [spaceSnap, managerSnap, targetSnap, metadataSnap] = await tx.getAll(space, member, target, metadata);
      if (!isManager(spaceSnap, managerSnap) || spaceSnap.data().managerUid !== caller.uid) throw unauthorized();
      if (!targetSnap.exists || targetSnap.data().active !== true || targetSnap.data().role === "manager") throw unauthorized();
      const key = metadataSnap.exists ? metadataSnap.data().recipientKey : null;
      if (typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key)) throw new Error("Member access could not be removed; contact support.");
      const epoch = space.collection("invitationEpochs").doc(key);
      const epochSnap = await tx.get(epoch);
      tx.set(epoch, { version: versionOf(epochSnap) + 1 });
      tx.update(target, { active: false, removedAt: FieldValue.serverTimestamp() });
      tx.delete(link);
    });
  }
  return { createSpace, createInvitation, acceptInvitation, cancelInvitation, removeMember };
}
