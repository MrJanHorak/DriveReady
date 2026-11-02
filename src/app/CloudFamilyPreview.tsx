import { useEffect, useRef, useState } from "react";
import { db } from "./firebaseClient";
import { importCloudFamily, readCloudFamily, validateCloudImport } from "./cloudFamily";
import { readFamily } from "./familyData";
import { downloadFamilyBackup, MAX_BACKUP_BYTES } from "./backupDownload";

type Family = { version: number; learners: { id: string; name: string }[]; drives: { id: string }[] };

export default function CloudFamily({ uid, onBusyChange, disabled = false }: { uid: string; onBusyChange: (busy: boolean) => void; disabled?: boolean }) {
  const [cloud, setCloud] = useState<Family | null>(null);
  const [candidate, setCandidate] = useState<{ family: Family; source: "browser" | "backup" } | null>(null);
  const [status, setStatus] = useState("Loading cloud records…");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const readRequest = useRef(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => () => { readRequest.current += 1; }, []);

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
      readRequest.current += 1;
      setCandidate({ family: validateCloudImport(readFamily(window.localStorage)), source: "browser" });
      setStatus("");
    } catch (failure) {
      const message = failure instanceof Error && failure.message.includes("cloud storage limits") ? failure.message : "Local records are invalid or could not be read. Nothing was copied.";
      setStatus(message); setCandidate(null);
    }
  }
  async function reviewBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const request = ++readRequest.current;
    setCandidate(null); setStatus("");
    if (!file) { setReading(false); return; }
    if (file.size > MAX_BACKUP_BYTES) { setReading(false); setStatus("This backup is larger than 5 MB. Nothing was copied."); return; }
    setReading(true);
    try {
      const family = validateCloudImport(JSON.parse(await file.text()));
      if (request === readRequest.current) setCandidate({ family, source: "backup" });
    } catch (failure) {
      if (request === readRequest.current) {
        const message = failure instanceof Error && failure.message.includes("cloud storage limits") ? failure.message : "This file is not a valid DriveReady backup. Nothing was copied.";
        setStatus(message);
      }
    } finally { if (request === readRequest.current) setReading(false); }
  }
  async function doImport() {
    if (!db || !candidate || busy || disabled || reading) return;
    setBusy(true); onBusyChange(true); setStatus("Copying records to your account…");
    try {
      const result = await importCloudFamily(db, uid, candidate.family);
      setCandidate(null);
      const summary = `Import finished: ${result.created} copied, ${result.existing} already present, ${result.conflicts} conflicts skipped. Local records were not removed.`;
      try { setCloud(await readCloudFamily(db, uid)); setStatus(summary); }
      catch { setCloud(null); setStatus(`${summary} Could not refresh the cloud count; refresh it when connected.`); }
    } catch {
      setStatus("Import was interrupted. Some records may already have been copied. Your local records are unchanged; you can retry safely.");
      setCandidate(null);
    } finally { setBusy(false); onBusyChange(false); }
  }
  async function downloadCloudBackup() {
    if (!db || busy || disabled) return;
    setBusy(true); onBusyChange(true); setStatus("Preparing cloud backup…");
    try {
      const latest = await readCloudFamily(db, uid);
      const bytes = downloadFamilyBackup(latest, "driveready-cloud-backup.json");
      setStatus(bytes > MAX_BACKUP_BYTES ? "Cloud backup prepared, but it exceeds 5 MB and cannot be restored with the current restore screen. Store it privately." : "Cloud backup prepared. Store the downloaded file somewhere private.");
    } catch {
      setStatus("Could not prepare a cloud backup. Check your connection and try again; no backup was downloaded.");
    } finally { setBusy(false); onBusyChange(false); }
  }
  return <div className="mt-4 rounded-xl border border-[#0C7A8D]/20 bg-[#E4EFF2]/40 p-4">
    <h3 className="text-sm font-semibold">Cloud records · early preview</h3>
    <p className="mt-1 text-sm text-muted-foreground">Copy browser records or a backup file to your account. After copying, choose “Use cloud account” below to view and edit the cloud copy. Later local edits are not copied automatically.</p>
    <p className="mt-1 text-sm text-muted-foreground">Cloud backups are readable files containing notes and locations. Store them privately. Learners and drives are read separately, so changes made on another device during the download may appear at different points in time.</p>
    {cloud && <p className="mt-2 text-sm">This account has {cloud.learners.length} {cloud.learners.length === 1 ? "learner" : "learners"} and {cloud.drives.length} {cloud.drives.length === 1 ? "drive" : "drives"} in cloud storage.</p>}
    {status && <p role="status" className="mt-2 text-sm text-muted-foreground">{status}</p>}
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy || disabled || reading || !cloud} onClick={reviewImport} className="rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50">Review local records to copy</button><label className={`rounded-lg border border-border bg-card px-3 py-2 text-sm ${busy || disabled || reading || !cloud ? "opacity-50" : "cursor-pointer"}`}>Choose backup to copy to cloud<input className="sr-only" type="file" accept=".json,application/json" disabled={busy || disabled || reading || !cloud} onChange={reviewBackup} /></label><button type="button" disabled={busy || disabled || reading} onClick={downloadCloudBackup} className="rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50">Download cloud backup</button><button type="button" disabled={busy || disabled || reading} onClick={() => { setCandidate(null); setRefreshKey((value) => value + 1); }} className="rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50">Refresh cloud count</button></div>
    {reading && <p role="status" className="mt-2 text-sm">Reading backup…</p>}
    {candidate && <div className="mt-3 rounded-lg border border-border bg-card p-3 text-sm"><p>Copy {candidate.family.learners.length} {candidate.source === "browser" ? "local" : "backup"} {candidate.family.learners.length === 1 ? "learner" : "learners"} and {candidate.family.drives.length} {candidate.source === "browser" ? "local" : "backup"} {candidate.family.drives.length === 1 ? "drive" : "drives"} to this account? Existing identical records will be skipped; conflicting records and their related drives will not be overwritten. The browser-local records and backup file stay unchanged.</p><div className="mt-3 flex gap-2"><button type="button" disabled={busy || disabled || reading} onClick={doImport} className="rounded-lg bg-[#0C7A8D] px-3 py-2 text-white disabled:opacity-50">Copy to account</button><button type="button" disabled={busy} onClick={() => setCandidate(null)} className="rounded-lg border border-border px-3 py-2">Cancel</button></div></div>}
  </div>;
}
