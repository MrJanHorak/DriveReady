import { collection, doc, getDocsFromServer, runTransaction } from "firebase/firestore";
import { parseFamilyBackup, validCalendarDate, validCloudRouteUrl } from "./familyData.js";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const sameRecord = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

// Check the whole import before writing anything. Firestore rules remain the authority.
export function validateCloudImport(family) {
  const parsed = parseFamilyBackup(JSON.stringify(family));
  const keys = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key));
  const text = (value, max) => typeof value === "string" && value.length <= max;
  const list = (value, max) => Array.isArray(value) && value.length <= max && value.every((item) => text(item, 200));
  const id = (value) => typeof value === "string" && value.length > 0 && new TextEncoder().encode(value).length <= 1500 && !value.includes("/") && value !== "." && value !== ".." && !/^__.*__$/.test(value);
  const invalid = (record, reason) => { throw new Error(`${record}: ${reason} (cloud storage limits). No records were copied.`); };
  for (const [index, learner] of parsed.learners.entries()) {
    const label = `Learner ${index + 1}`;
    if (!keys(learner, ["id", "name"]) || !id(learner.id)) invalid(label, "unsupported record identifier or extra fields");
    if (!text(learner.name, 60) || !learner.name.trim() || /[\r\n\u2028\u2029]/.test(learner.name)) invalid(label, "name must be 1–60 characters on one line");
  }
  for (const [index, drive] of parsed.drives.entries()) {
    const label = `Drive ${index + 1}`;
    if (!keys(drive, ["id", "learnerId", "date", "minutes", "nightMinutes", "skills", "notes", "place", "routeUrl", "route", "location", "practicedSkills", "practicedConditions"]) || !id(drive.id) || !id(drive.learnerId)) invalid(label, "unsupported record identifier or extra fields");
    if (!validCalendarDate(drive.date) || !Number.isSafeInteger(drive.minutes) || !Number.isSafeInteger(drive.nightMinutes)) invalid(label, "date or duration is invalid");
    if (!text(drive.skills, 200) || !text(drive.notes, 1000) || (drive.place !== undefined && !text(drive.place, 200))) invalid(label, "skills, notes or place is too long");
    if (drive.routeUrl !== undefined && !validCloudRouteUrl(drive.routeUrl)) invalid(label, "route link must use HTTPS and a standard domain without a custom port");
    if ((drive.practicedSkills !== undefined && !list(drive.practicedSkills, 8)) || (drive.practicedConditions !== undefined && !list(drive.practicedConditions, 8))) invalid(label, "practice tags exceed the allowed size");
    if (drive.route != null && (!keys(drive.route, ["start", "end", "stops"]) || !text(drive.route.start, 200) || !text(drive.route.end, 200) || !list(drive.route.stops, 3))) invalid(label, "route fields exceed the allowed size");
    if (drive.location != null && (!keys(drive.location, ["latitude", "longitude", "accuracy", "recordedAt"]) || drive.location.accuracy > 100000000 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(drive.location.recordedAt) || new Date(drive.location.recordedAt).toISOString() !== drive.location.recordedAt)) invalid(label, "location accuracy or timestamp is invalid");
  }
  return parsed;
}

function records(db, uid, kind) {
  return collection(db, "users", uid, kind);
}

// A separate document for each record avoids overwriting unrelated family data.
export async function readCloudFamily(db, uid) {
  const [learners, drives] = await Promise.all([
    getDocsFromServer(records(db, uid, "learners")), getDocsFromServer(records(db, uid, "drives")),
  ]);
  const data = { version: 1, learners: learners.docs.map((item) => item.data()), drives: drives.docs.map((item) => item.data()) };
  if (learners.docs.some((item) => item.id !== item.data().id) || drives.docs.some((item) => item.id !== item.data().id)) throw new Error("Cloud record identifiers do not match their paths.");
  return parseFamilyBackup(JSON.stringify(data));
}

// Creates never overwrite records, including when a local import is retried.
export async function createCloudRecord(db, uid, kind, record) {
  if (!['learners', 'drives'].includes(kind) || !record.id || record.id.includes('/')) throw new Error("Invalid record identifier.");
  const ref = doc(records(db, uid, kind), record.id);
  return runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists()) throw new Error("A record with this identifier already exists.");
    if (kind === "drives") {
      const learner = await transaction.get(doc(records(db, uid, "learners"), record.learnerId));
      if (!learner.exists()) throw new Error("The learner does not exist in this account.");
    }
    transaction.set(ref, record);
  });
}

// On updates, compare against the version the user loaded before editing.
export async function replaceCloudRecord(db, uid, kind, original, replacement) {
  if (!['learners', 'drives'].includes(kind) || !original.id || original.id !== replacement.id || original.id.includes('/')) throw new Error("Invalid record identifier.");
  const ref = doc(records(db, uid, kind), original.id);
  return runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    if (!existing.exists() || !sameRecord(existing.data(), original)) throw new Error("This record changed on another device. Refresh before editing it again.");
    if (kind === "drives" && replacement.learnerId !== original.learnerId) throw new Error("A drive cannot be moved to another learner.");
    transaction.set(ref, replacement);
  });
}

// Import never overwrites cloud records. Partial runs can be retried safely;
// collisions are reported for review rather than silently merged.
export async function importCloudFamily(db, uid, family) {
  family = validateCloudImport(family);
  const result = { created: 0, existing: 0, conflicts: 0 };
  const conflictedLearners = new Set();
  for (const [kind, entries] of [["learners", family.learners], ["drives", family.drives]]) {
    for (const record of entries) {
      if (kind === "drives" && conflictedLearners.has(record.learnerId)) { result.conflicts += 1; continue; }
      const ref = doc(records(db, uid, kind), record.id);
      const outcome = await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(ref);
        if (existing.exists()) return sameRecord(existing.data(), record) ? "existing" : "conflicts";
        if (kind === "drives") {
          const learner = await transaction.get(doc(records(db, uid, "learners"), record.learnerId));
          if (!learner.exists()) return "conflicts";
        }
        transaction.set(ref, record);
        return "created";
      });
      result[outcome] += 1;
      if (kind === "learners" && outcome === "conflicts") conflictedLearners.add(record.id);
    }
  }
  return result;
}
