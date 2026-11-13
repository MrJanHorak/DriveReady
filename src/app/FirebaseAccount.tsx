import { useCallback, useEffect, useState } from "react";
import { createUserWithEmailAndPassword, getIdToken, reload, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { auth } from "./firebaseClient";
import SharedSpaces from "./SharedSpaces";
import DeleteAccount from "./DeleteAccount";
import { usePendingInvite } from "./usePendingInvite";
import { sharedAccessDemo } from "./sharedClient";
import { heading } from "./design";

const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "rounded-lg bg-[#0C7A8D] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

export default function FirebaseAccount({ user, loading, view, page, onNavigate, onBusyChange }: { user: User | null; loading: boolean; view: "account" | "shared"; page: string; onNavigate: (page: string) => void; onBusyChange?: (busy: boolean) => void }) {
  const [emailVerified, setEmailVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sharedBusy, setSharedBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const invite = usePendingInvite();
  const onSharedBusyChange = useCallback((value: boolean) => { setSharedBusy(value); onBusyChange?.(value); }, [onBusyChange]);
  useEffect(() => { setEmailVerified(user?.emailVerified ?? false); }, [user]);
  if (!auth) return <section className="rounded-2xl border border-border bg-card p-5">Sign-in is unavailable because Firebase is not configured.</section>;
  const activeAuth = auth;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (creating) await createUserWithEmailAndPassword(activeAuth, email.trim(), password);
      else await signInWithEmailAndPassword(activeAuth, email.trim(), password);
      setPassword(""); setShowPassword(false);
    } catch (error) {
      if ((error as { code?: string })?.code === "auth/network-request-failed") {
        setMessage(sharedAccessDemo ? "Cannot reach the local sign-in emulator. Make sure the demo is still running, then try again." : "Cannot reach the sign-in service. Check your connection and try again.");
      } else if (!sharedAccessDemo && ["manager@example.test", "supervisor@example.test", "learner@example.test"].includes(email.trim().toLowerCase())) {
        setMessage("These fictional accounts are available only in the shared local demo. Start npm run demo:shared and open http://127.0.0.1:4173/.");
      } else setMessage("Unable to sign in or create the account. Check your email and password, then try again.");
    }
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
  return <><section hidden={view !== "account"} className="rounded-2xl border border-border bg-card p-5" aria-label="Account">
    <h2 className="text-base font-bold" style={heading}>Account</h2>
    <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><strong>Development preview:</strong> Use fictional names, notes, and locations only. This preview is not ready for real family data.</p>
    {sharedAccessDemo ? <p className="mt-2 rounded-lg bg-[#E4EFF2] p-3 text-sm"><strong>Shared local demo.</strong> Sign in with manager@example.test, supervisor@example.test, or learner@example.test. The password is fictional-drive-123. The demo resets when stopped.</p> : <p className="mt-2 rounded-lg bg-[#E4EFF2] p-3 text-sm"><strong>Shared spaces (development).</strong> Your email must be verified before you can add a learner or accept an invitation.</p>}
    {!user && !loading && invite && <p role="status" className="mt-2 rounded-lg border border-[#0C7A8D]/30 bg-[#E4EFF2] p-3 text-sm text-[#095969]"><strong>You’ve been invited to a learner’s space.</strong> Sign in, or create an account, with the email address the invitation was sent to. You’ll be able to review it before joining.</p>}
    {!user && !loading && <p className="mt-2 text-sm text-muted-foreground">Sign in to see and record practice for the learners you supervise. See <button type="button" className="text-[#0C7A8D] underline" onClick={() => onNavigate("privacy")}>Privacy</button> for what is stored and who can see it.</p>}
    {loading ? <p className="mt-3 text-sm">Checking account…</p> : user ? <>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><span>Signed in as {user.email}</span><button disabled={busy || sharedBusy} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50" onClick={async () => { try { await signOut(activeAuth); setMessage(""); setCreating(false); } catch { setMessage("Could not sign out. Please try again."); } }}>Sign out</button></div>
      <div className="mt-3 text-sm">{emailVerified ? <p>Email verified</p> : <><p>Email not verified. Verify it to add learners or accept invitations.</p><div className="mt-2 flex flex-wrap gap-3"><button type="button" className="text-[#0C7A8D] underline disabled:opacity-50" disabled={busy || sharedBusy} onClick={sendVerification}>Send verification email</button><button type="button" className="text-[#0C7A8D] underline disabled:opacity-50" disabled={busy || sharedBusy} onClick={refreshVerification}>Refresh verification status</button></div></>}</div>
      <DeleteAccount key={user.uid} auth={activeAuth} user={user} verified={emailVerified} disabled={busy || sharedBusy} onNavigate={onNavigate} onDeleted={(text) => { setMessage(text); setCreating(false); }} onBusyChange={onSharedBusyChange} />
    </> : <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Email<input className={`${input} mt-1`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><div><label className="text-sm font-medium">Password<input className={`${input} mt-1`} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={creating ? "new-password" : "current-password"} required /></label><button type="button" className="mt-1 text-sm text-[#0C7A8D] underline" aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "Hide password" : "Show password"}</button></div><div className="flex flex-wrap gap-3 sm:col-span-2"><button className={button} disabled={busy}>{creating ? "Create account" : "Sign in"}</button><button type="button" className="text-sm text-[#0C7A8D] underline disabled:opacity-50" disabled={busy} onClick={() => { setCreating(!creating); setMessage(""); setPassword(""); setShowPassword(false); }}>{creating ? "Use an existing account" : "Create an account"}</button>{!creating && <button type="button" className="text-sm text-[#0C7A8D] underline" disabled={busy} onClick={resetPassword}>Forgot password?</button>}</div></form>}
    {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
  </section>{user && <div hidden={view !== "shared"}><SharedSpaces key={user.uid} uid={user.uid} verified={emailVerified} disabled={busy} onBusyChange={onSharedBusyChange} page={page} onNavigate={onNavigate} /></div>}</>;
}
