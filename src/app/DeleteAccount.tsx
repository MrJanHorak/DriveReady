import { useState } from "react";
import { EmailAuthProvider, deleteUser, reauthenticateWithCredential, signOut, type Auth, type User } from "firebase/auth";
import { readSharedSpaces, sharedAccessRequest } from "./sharedClient";
import { saveTimer } from "./timerState";
import { dangerButton, ghostButton, heading } from "./design";

const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

// "Delete my account" on the Account page. Managers delete their learner spaces first;
// everyone confirms with their email and password (a fresh sign-in the service checks).
export default function DeleteAccount({ auth, user, verified, disabled, onNavigate, onDeleted, onBusyChange }: { auth: Auth; user: User; verified: boolean; disabled: boolean; onNavigate: (page: string) => void; onDeleted: (message: string) => void; onBusyChange: (busy: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [managed, setManaged] = useState<string[] | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const accountEmail = (user.email ?? "").trim().toLowerCase();

  async function start() {
    setOpen(true); setMessage(""); setManaged(null);
    if (!verified) { setManaged([]); return; }
    try {
      const spaces = await readSharedSpaces(user.uid);
      setManaged(spaces.flatMap((space) => space && space.role === "manager" ? [space.learnerName] : []));
    } catch { setMessage("Could not check your learner spaces. Check your connection and try again."); }
  }
  function close() { setOpen(false); setEmail(""); setPassword(""); setMessage(""); }

  async function remove(event: React.FormEvent) {
    event.preventDefault();
    if (email.trim().toLowerCase() !== accountEmail) { setMessage("Type your account email exactly to confirm."); return; }
    setBusy(true); onBusyChange(true); setMessage("");
    try {
      try { await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? "", password)); }
      catch { setMessage("That password isn’t right. Nothing was deleted."); return; }
      // Accounts that never verified their email cannot belong to any space, so
      // Firebase can remove them directly.
      if (verified) await sharedAccessRequest(user.uid, "deleteAccount", { confirmEmail: email.trim() });
      else await deleteUser(user);
      saveTimer(user.uid, null);
      try { await signOut(auth); } catch { /* the account no longer exists */ }
      onDeleted("Your account was deleted. Drives you logged stay in the learners’ practice history without your email.");
    } catch {
      setMessage("The account could not be deleted. If you were signed out, sign in again and repeat these steps to finish.");
    } finally { setBusy(false); onBusyChange(false); setPassword(""); }
  }

  return <section className="mt-5 border-t border-border pt-4" aria-label="Delete account">
    <h3 className="text-sm font-bold text-red-800" style={heading}>Delete account</h3>
    {!open ? <>
      <p className="mt-1 text-sm text-muted-foreground">Permanently delete your sign-in and your access to every learner space.</p>
      <button type="button" className={`${dangerButton} mt-2`} disabled={disabled} onClick={start}>Delete my account…</button>
    </> : managed === null ? <p className="mt-2 text-sm">{message || "Checking your learner spaces…"}</p>
    : managed.length > 0 ? <div className="mt-2 space-y-2 text-sm">
      <p>You manage {managed.length === 1 ? "a learner space" : `${managed.length} learner spaces`}: <strong>{managed.join(", ")}</strong>. Delete {managed.length === 1 ? "it" : "them"} under People &amp; access first, so no learner is left without a managing supervisor.</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={ghostButton} onClick={() => onNavigate("shared")}>Go to People &amp; access</button><button type="button" className={ghostButton} onClick={close}>Cancel</button></div>
    </div>
    : <form className="mt-2 space-y-3 text-sm" onSubmit={remove}>
      <ul className="list-disc space-y-1 pl-5 text-foreground/90">
        <li>Your sign-in is deleted and you leave every learner space you belong to. This can’t be undone.</li>
        <li>Drives and routes you recorded stay in each learner’s practice history, without your email.</li>
        <li>A drive timer running in this browser is discarded.</li>
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="font-medium">Type your email to confirm<input className={`${input} mt-1`} type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label className="font-medium">Password<input className={`${input} mt-1`} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="inline-flex items-center rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50" disabled={busy || disabled || email.trim().toLowerCase() !== accountEmail || !password}>{busy ? "Deleting…" : "Delete account permanently"}</button>
        <button type="button" className={ghostButton} disabled={busy} onClick={close}>Cancel</button>
      </div>
      {message && <p role="status" className="text-red-800">{message}</p>}
    </form>}
  </section>;
}
