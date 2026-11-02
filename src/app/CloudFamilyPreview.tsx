import { useEffect, useState } from "react";
import { db } from "./firebaseClient";
import { importCloudFamily, readCloudFamily, validateCloudImport } from "./cloudFamily";
import { readFamily } from "./familyData";

type Family = { version: number; learners: { id: string; name: string }[]; drives: { id: string }[] };

export default function CloudFamily({ uid, onBusyChange }: { uid: string; onBusyChange: (busy: boolean) => void }) {
  const [cloud, setCloud] = useState<Family | null>(null);
  const [local, setLocal] = useState<Family | null>(null);
  const [status, setStatus] = useState("Loading cloud records…");
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setCloud(null); setStatus("Loading cloud records…");
    if (!db) { setStatus("Cloud storage is not configured."); return; }
    readCloudFamily(db, uid).then((data: Family) => { if (active) { setCloud(data); setStatus(""); } }).catch(() => { if (active) setStatus("Could not load cloud records. Check your connection and Firestore security rules."); });
    return () => { active = false; };
  }, [uid, refreshKey]);

  function reviewImport() {
    try {
      // Apply the same validation as a backup, without deleting or changing it.
      setLocal(validateCloudImport(readFamily(window.localStorage)));
      setStatus("");
    } catch { setStatus("Local records could not be read or contain fields outside cloud storage limits. Nothing was imported."); setLocal(null); }
  }
  async function doImport() {
    if (!db || !local || busy) return;
    setBusy(true); onBusyChange(true); setStatus("Copying records to your account…");
    try {
      const result = await importCloudFamily(db, uid, local);
      setLocal(null);
      setStatus(`Import finished: ${result.created} copied, ${result.existing} already present, ${result.conflicts} conflicts skipped. Local records were not removed.`);
      const updated = await readCloudFamily(db, uid);
      setCloud(updated);
    } catch {
      setStatus("Import was interrupted. Some records may already have been copied. Your local records are unchanged; you can retry safely.");
      setLocal(null);
    } finally { setBusy(false); onBusyChange(false); }
  }
  return <div className="mt-4 rounded-xl border border-[#0C7A8D]/20 bg-[#E4EFF2]/40 p-4">
    <h3 className="text-sm font-semibold">Cloud records · early preview</h3>
    <p className="mt-1 text-sm text-muted-foreground">Copy existing browser records to your account. After copying, choose “Use cloud account” below to view and edit the cloud copy. Later local edits are not copied automatically.</p>
    {cloud && <p className="mt-2 text-sm">This account has {cloud.learners.length} {cloud.learners.length === 1 ? "learner" : "learners"} and {cloud.drives.length} {cloud.drives.length === 1 ? "drive" : "drives"} in cloud storage.</p>}
    {status && <p role="status" className="mt-2 text-sm text-muted-foreground">{status}</p>}
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy || !cloud} onClick={reviewImport} className="rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50">Review local records to copy</button><button type="button" disabled={busy} onClick={() => { setLocal(null); setRefreshKey((value) => value + 1); }} className="rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50">Refresh cloud count</button></div>
    {local && <div className="mt-3 rounded-lg border border-border bg-card p-3 text-sm"><p>Copy {local.learners.length} local learners and {local.drives.length} local drives to this account? Existing identical records will be skipped; conflicting records and their related drives will not be overwritten. The local copy stays in this browser.</p><div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={doImport} className="rounded-lg bg-[#0C7A8D] px-3 py-2 text-white disabled:opacity-50">Copy to account</button><button type="button" disabled={busy} onClick={() => setLocal(null)} className="rounded-lg border border-border px-3 py-2">Cancel</button></div></div>}
  </div>;
}
