import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebaseClient";
import FirebaseAccount from "./FirebaseAccount";
import FamilyWorkspace from "./FamilyWorkspace";

export default function WorkspaceSwitcher({ showAll, onBusyChange }: { showAll: boolean; onBusyChange?: (busy: boolean) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [cloudOwner, setCloudOwner] = useState<string | null>(null);
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
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setCloudOwner((current) => current && current !== next?.uid ? null : current);
    });
  }, []);
  const inCloud = !!user && cloudOwner === user.uid;
  function switchMode(toCloud: boolean) {
    if (!window.confirm("Switching storage closes any unsaved form. Continue?")) return;
    setCloudOwner(toCloud && user ? user.uid : null);
    setGeneration((value) => value + 1);
  }
  return <main className="flex-1 overflow-auto p-5 md:p-8"><div className="mx-auto max-w-5xl space-y-5">
    {busy && <p role="status" className="rounded-lg bg-[#E4EFF2] p-3 text-sm text-[#095969]">Cloud operation in progress. Please wait before switching sections or signing out.</p>}
    {!showAll && <FirebaseAccount disableSignOut={saving} onImportingChange={setImporting} />}
    {user && <section className="rounded-xl border border-[#0C7A8D]/20 bg-card p-4"><p className="text-sm font-semibold">Practice records: {inCloud ? "Cloud account" : "This browser"}</p><p className="mt-1 text-sm text-muted-foreground">{inCloud ? `Showing records for ${user.email}. Cloud saves require a connection.` : "Local records and your cloud account are separate. Copy local records from the account panel before viewing them in the cloud."}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={!inCloud || busy} onClick={() => switchMode(false)}>Use this browser</button><button type="button" className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={inCloud || busy} onClick={() => switchMode(true)}>Use cloud account</button>{inCloud && <button type="button" disabled={busy} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50" onClick={() => switchMode(true)}>Refresh cloud records</button>}</div></section>}
    <fieldset disabled={importing}><FamilyWorkspace key={`${inCloud ? user?.uid : "local"}-${generation}`} showAll={showAll} cloudUid={inCloud ? user!.uid : undefined} onSavingChange={setSaving} /></fieldset>
  </div></main>;
}
