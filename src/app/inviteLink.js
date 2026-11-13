// Invitation links. The invitation code travels in the part of the address after
// "#", which browsers never send to the web host, so it stays out of Vercel's logs.
// When the app opens such a link it moves the invitation into this tab's session
// storage and removes it from the address bar and browser history.
const SPACE_ID = "[A-Za-z0-9_-]{1,128}";
const TOKEN = "[A-Za-z0-9_-]{43}";
const pattern = new RegExp(`(?:^|[#&?\\s])invite=(${SPACE_ID})\\.(${TOKEN})(?=$|[&\\s])`);
const STORAGE_KEY = "driveready.pendingInvite.v1";
export const INVITE_EVENT = "driveready-invite";

/** @param {string} base the app's address @param {string} spaceId @param {string} token */
export function inviteLink(base, spaceId, token) {
  if (!new RegExp(`^${SPACE_ID}$`).test(spaceId) || !new RegExp(`^${TOKEN}$`).test(token)) throw new Error("Invalid invitation.");
  const url = new URL(base);
  url.search = ""; url.hash = `invite=${spaceId}.${token}`;
  return url.toString();
}

/** Finds an invitation in a link or address fragment. @param {unknown} text */
export function parseInvite(text) {
  if (typeof text !== "string" || text.length > 2048) return null;
  const match = pattern.exec(text.trim());
  return match ? { spaceId: match[1], token: match[2] } : null;
}

function sessionStore() { try { return globalThis.sessionStorage ?? null; } catch { return null; } }
let memory = null; // used when session storage is unavailable

export function loadPendingInvite(storage = sessionStore()) {
  try { const saved = storage?.getItem(STORAGE_KEY); if (saved) return parseInvite(`invite=${saved}`); } catch { /* fall back */ }
  return memory;
}
export function savePendingInvite(invite, storage = sessionStore()) {
  memory = invite;
  try { if (invite) storage?.setItem(STORAGE_KEY, `${invite.spaceId}.${invite.token}`); else storage?.removeItem(STORAGE_KEY); } catch { /* memory copy above */ }
  globalThis.dispatchEvent?.(new Event(INVITE_EVENT));
}

// Called on start-up and whenever the address fragment changes.
export function takeInviteFromLocation(location = globalThis.location, history = globalThis.history) {
  const invite = parseInvite(location?.hash ?? "");
  if (!invite) return null;
  try { history?.replaceState(history.state, "", `${location.pathname}${location.search}`); } catch { /* keep going */ }
  savePendingInvite(invite);
  return invite;
}
