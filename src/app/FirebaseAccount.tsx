import { useCallback, useEffect, useRef, useState } from "react";
import { createUserWithEmailAndPassword, getIdToken, reload, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { auth } from "./firebaseClient";
import CloudFamily from "./CloudFamilyPreview";
import SharedSpacesEmulator from "./SharedSpacesEmulator";
import { sharedAccessEmulatorEnabled } from "./sharedAccessEmulator";

const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "rounded-lg bg-[#0C7A8D] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

export default function FirebaseAccount({ user, loading, disableSignOut = false, onImportingChange }: { user: User | null; loading: boolean; disableSignOut?: boolean; onImportingChange?: (busy: boolean) => void }) {
  const [emailVerified, setEmailVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sharedBusy, setSharedBusy] = useState(false);
  const cloudBusyRef = useRef(false);
  const sharedBusyRef = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const onSharedBusyChange = useCallback((value: boolean) => { sharedBusyRef.current = value; setSharedBusy(value); onImportingChange?.(value || cloudBusyRef.current); }, [onImportingChange]);
  const onCloudBusyChange = useCallback((value: boolean) => { cloudBusyRef.current = value; setImporting(value); onImportingChange?.(value || sharedBusyRef.current); }, [onImportingChange]);
  useEffect(() => { setEmailVerified(user?.emailVerified ?? false); }, [user]);
  if (!auth) return <section className="rounded-2xl border border-border bg-card p-5">Sign-in is unavailable because Firebase is not configured.</section>;
  const activeAuth = auth;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (creating) await createUserWithEmailAndPassword(activeAuth, email.trim(), password);
      else await signInWithEmailAndPassword(activeAuth, email.trim(), password);
      setPassword("");
    } catch { setMessage("Unable to sign in or create the account. Check your details and Firebase configuration, then try again."); }
    finally { setBusy(false); }
  }
  async function resetPassword() {
    if (!email.trim()) { setMessage("Enter your email address first."); return; }
    setBusy(true); setMessage("");
    try { await sendPasswordResetEmail(activeAuth, email.trim()); setMessage("If the account is available, check your email for reset instructions."); }
    catch { setMessage("Could not request a password reset. Please try again later."); }
    finally { setBusy(false); }
  }
  async function sendVerification() {
    if (!user || busy) return;
    setBusy(true); setMessage("");
    try { await sendEmailVerification(user); setMessage("Verification email requested. Check your inbox, then return here to refresh your status."); }
    catch { setMessage("Could not send the verification email. Please try again later."); }
    finally { setBusy(false); }
  }
  async function refreshVerification() {
    if (!user || busy) return;
    setBusy(true); setMessage("");
    try {
      await reload(user);
      await getIdToken(user, true);
      if (activeAuth.currentUser?.uid !== user.uid) return;
      setEmailVerified(user.emailVerified);
      setMessage(user.emailVerified ? "Email verified." : "Email not verified yet. Open the link in your verification email and try again.");
    } catch { setMessage("Could not refresh email verification. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-border bg-card p-5">
    <h2 className="font-semibold">Supervisor account <span className="text-xs font-normal text-muted-foreground">(early setup)</span></h2>
    <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><strong>Development preview:</strong> Use fictional names, notes, and locations only. This cloud service is not ready for real family data.</p>
    <p className="mt-1 text-sm text-muted-foreground">Sign in to see and save practice records for your account.</p>
    {loading ? <p className="mt-3 text-sm">Checking account…</p> : user ? <>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><span>Signed in as {user.email}</span><button disabled={busy || importing || sharedBusy || disableSignOut} className="rounded-lg border border-border px-3 py-2 disabled:opacity-50" onClick={async () => { try { await signOut(activeAuth); setMessage(""); setCreating(false); } catch { setMessage("Could not sign out. Please try again."); } }}>Sign out</button></div>
      <div className="mt-3 text-sm">{emailVerified ? <p>Email verified</p> : <><p>Email not verified. Verification will be required for future shared-space invitations.</p><div className="mt-2 flex flex-wrap gap-3"><button type="button" className="text-[#0C7A8D] underline disabled:opacity-50" disabled={busy || importing || sharedBusy || disableSignOut} onClick={sendVerification}>Send verification email</button><button type="button" className="text-[#0C7A8D] underline disabled:opacity-50" disabled={busy || importing || sharedBusy || disableSignOut} onClick={refreshVerification}>Refresh verification status</button></div></>}</div>
      <CloudFamily key={user.uid} uid={user.uid} disabled={disableSignOut || sharedBusy || busy} onBusyChange={onCloudBusyChange} />
      {sharedAccessEmulatorEnabled && <SharedSpacesEmulator key={user.uid} uid={user.uid} verified={emailVerified} disabled={disableSignOut || importing || busy} onBusyChange={onSharedBusyChange} />}
    </> : <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Email<input className={`${input} mt-1`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label className="text-sm font-medium">Password<input className={`${input} mt-1`} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={creating ? "new-password" : "current-password"} required /></label><div className="flex flex-wrap gap-3 sm:col-span-2"><button className={button} disabled={busy}>{creating ? "Create account" : "Sign in"}</button><button type="button" className="text-sm text-[#0C7A8D] underline disabled:opacity-50" disabled={busy} onClick={() => { setCreating(!creating); setMessage(""); setPassword(""); }}>{creating ? "Use an existing account" : "Create an account"}</button>{!creating && <button type="button" className="text-sm text-[#0C7A8D] underline" disabled={busy} onClick={resetPassword}>Forgot password?</button>}</div></form>}
    {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
  </section>;
}
