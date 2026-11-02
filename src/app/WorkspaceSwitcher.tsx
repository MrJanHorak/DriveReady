import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebaseClient";
import FirebaseAccount from "./FirebaseAccount";
import FamilyWorkspace from "./FamilyWorkspace";

export default function WorkspaceSwitcher({ showAll }: { showAll: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [cloudOwner, setCloudOwner] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [saving, setSaving] = useState(false);
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
    {!showAll && <FirebaseAccount disableSignOut={saving} />}
    {user && <section className="rounded-xl border border-[#0C7A8D]/20 bg-card p-4"><p className="text-sm font-semibold">Practice records: {inCloud ? "Cloud account" : "This browser"}</p><p className="mt-1 text-sm text-muted-foreground">{inCloud ? `Showing records for ${user.email}. Cloud saves require a connection.` : "Local records and your cloud account are separate. Copy local records from the account panel before viewing them in the cloud."}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={!inCloud || saving} onClick={() => switchMode(false)}>Use this browser</button><button type="button" className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={inCloud || saving} onClick={() => switchMode(true)}>Use cloud account</button>{inCloud && <button type="button" disabled={saving} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50" onClick={() => switchMode(true)}>Refresh cloud records</button>}</div></section>}
    <FamilyWorkspace key={`${inCloud ? user?.uid : "local"}-${generation}`} showAll={showAll} cloudUid={inCloud ? user!.uid : undefined} onSavingChange={setSaving} />
  </div></main>;
}
