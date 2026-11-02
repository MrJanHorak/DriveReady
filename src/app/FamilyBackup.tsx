import { useRef, useState } from "react";
import { parseFamilyBackup } from "./familyData";

type Family = { version: number; learners: { id: string; name: string }[]; drives: { id: string }[] };
const secondary = "rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted";

export default function FamilyBackup({ family, canExport, onRestore }: { family: Family; canExport: boolean; onRestore: (data: any) => boolean }) {
  const [candidate, setCandidate] = useState<Family | null>(null);
  const [message, setMessage] = useState("");
  const [reading, setReading] = useState(false);
  const request = useRef(0);
  function download() {
    const blob = new Blob([JSON.stringify(family, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "driveready-backup.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const current = ++request.current;
    setCandidate(null); setMessage("");
    if (!file) { setReading(false); return; }
    if (file.size > 5 * 1024 * 1024) { setReading(false); setMessage("The backup is too large. Choose a file smaller than 5 MB."); return; }
    setReading(true);
    try {
      const data = parseFamilyBackup(await file.text());
      if (request.current === current) setCandidate(data);
    } catch {
      if (request.current === current) setMessage("This file could not be read as a valid DriveReady backup. Your current data was not changed.");
    } finally {
      if (request.current === current) setReading(false);
    }
  }
  function restore() {
    if (!candidate || !window.confirm("Replace all learners and drives saved in this browser with the selected backup? This cannot be undone. Download a backup of current data first if you need it.")) return;
    if (onRestore(candidate)) { setCandidate(null); setMessage("Backup restored on this browser."); }
  }
  return <section className="rounded-2xl border border-border bg-card p-5">
    <h3 className="font-semibold">Back up or restore</h3>
    <p className="mt-1 text-sm text-muted-foreground">Download a copy of all learners and drives, or restore a previously downloaded backup. The file contains personal notes and locations in readable text; keep it somewhere private.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" className={secondary} onClick={download} disabled={!canExport}>Download backup</button><label className={secondary}>Choose backup to review<input className="sr-only" type="file" accept=".json,application/json" onChange={selectFile} /></label>{reading && <span className="text-sm text-muted-foreground">Reading backup…</span>}</div>
    {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
    {candidate && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p><strong>Review backup:</strong> {candidate.learners.length} learners and {candidate.drives.length} drives. The browser currently has {family.learners.length} learners and {family.drives.length} drives.</p><p className="mt-1">Restoring replaces all current browser data and discards an open, unsaved drive. It does not merge records.</p><div className="mt-3 flex gap-2"><button type="button" className="rounded-lg bg-amber-900 px-4 py-2 font-semibold text-white" onClick={restore}>Replace with this backup</button><button type="button" className={secondary} onClick={() => { request.current += 1; setCandidate(null); setMessage(""); }}>Cancel</button></div></div>}
  </section>;
}
