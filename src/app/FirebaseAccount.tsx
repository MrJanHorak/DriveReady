import { useEffect, useState } from "react";
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { auth } from "./firebaseClient";

const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "rounded-lg bg-[#0C7A8D] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

export default function FirebaseAccount() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    return onAuthStateChanged(auth, (next) => { setUser(next); setLoading(false); }, () => { setMessage("Account status could not be loaded."); setLoading(false); });
  }, []);
  if (!auth) return null;
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
  return <section className="rounded-2xl border border-border bg-card p-5">
    <h2 className="font-semibold">Supervisor account <span className="text-xs font-normal text-muted-foreground">(early setup)</span></h2>
    <p className="mt-1 text-sm text-muted-foreground">Sign-in is being prepared. Driving records remain on this browser and are not yet linked to your account or synced.</p>
    {loading ? <p className="mt-3 text-sm">Checking account…</p> : user ? <div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><span>Signed in as {user.email}</span><button className="rounded-lg border border-border px-3 py-2" onClick={async () => { try { await signOut(activeAuth); setMessage(""); } catch { setMessage("Could not sign out. Please try again."); } }}>Sign out</button></div> : <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Email<input className={`${input} mt-1`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label className="text-sm font-medium">Password<input className={`${input} mt-1`} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={creating ? "new-password" : "current-password"} required /></label><div className="flex flex-wrap gap-3 sm:col-span-2"><button className={button} disabled={busy}>{creating ? "Create account" : "Sign in"}</button><button type="button" className="text-sm text-[#0C7A8D] underline" onClick={() => { setCreating(!creating); setMessage(""); setPassword(""); }}>{creating ? "Use an existing account" : "Create an account"}</button>{!creating && <button type="button" className="text-sm text-[#0C7A8D] underline" disabled={busy} onClick={resetPassword}>Forgot password?</button>}</div></form>}
    {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
  </section>;
}
