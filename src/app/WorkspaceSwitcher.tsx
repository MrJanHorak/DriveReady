import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebaseClient";
import FirebaseAccount from "./FirebaseAccount";
import FamilyWorkspace from "./FamilyWorkspace";
import { sharedAccessEmulatorEnabled } from "./sharedAccessEmulator";

export default function WorkspaceSwitcher({ page, onNavigate, onBusyChange }: { page: string; onNavigate: (page: string) => void; onBusyChange?: (busy: boolean) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(!!auth);
  const [generation, setGeneration] = useState(0);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const busy = saving || importing;
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (next) => { setUser(next); setAuthLoading(false); }, () => { setUser(null); setAuthLoading(false); });
  }, []);
  function refreshRecords() {
    if (!window.confirm("Refreshing closes any unsaved form. Continue?")) return;
    setGeneration((value) => value + 1);
  }
  const showPractice = page === "dashboard" || page === "logs";
  return <main className="flex-1 overflow-auto p-4 sm:p-6" style={{ display: page === "requirements" || (page === "routes" && !sharedAccessEmulatorEnabled) ? "none" : undefined }}><div className="mx-auto max-w-6xl space-y-5">
    {busy && <p role="status" className="rounded-lg bg-[#E4EFF2] p-3 text-sm text-[#095969]">Cloud operation in progress. Please wait before switching sections or signing out.</p>}
    <FirebaseAccount user={user} loading={authLoading} view={!user || page === "account" ? "account" : sharedAccessEmulatorEnabled ? "shared" : "hidden"} page={page} onNavigate={onNavigate} disableSignOut={saving} onImportingChange={setImporting} />
    {!sharedAccessEmulatorEnabled && user && showPractice && <section className="rounded-xl border border-[#0C7A8D]/20 bg-card p-4"><p className="text-sm font-semibold">Practice records: Cloud account</p><p className="mt-1 text-sm text-muted-foreground">{user.email} · Fictional data only · Connection required</p><button type="button" disabled={busy} className="mt-3 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50" onClick={refreshRecords}>Refresh cloud records</button></section>}
    {!sharedAccessEmulatorEnabled && user && <fieldset disabled={importing} hidden={!showPractice}><FamilyWorkspace key={`${user.uid}-${generation}`} showAll={page === "logs"} cloudUid={user.uid} onSavingChange={setSaving} /></fieldset>}
  </div></main>;
}
