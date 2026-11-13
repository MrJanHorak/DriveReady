import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { readSharedDrives, readSharedMembers } from "./sharedClient";
import { auth } from "./firebaseClient";
import { formatDate, formatDuration } from "./SharedDashboard";
import { ghostButton, heading, mono, primaryButton } from "./design";

type LogDrive = { id: string; date: string; minutes: number; nightMinutes: number; notes?: string; supervisorPresentUid?: string; routeSnapshot?: { name?: string }; practicedSkills?: string[]; practicedConditions?: string[] };

// Georgia DDS describes 40 supervised hours, 6 of them at night (see State Requirements).
const TARGET_HOURS = 40, TARGET_NIGHT_HOURS = 6;
const MAX_PAGES = 40;

/**
 * Printable practice log for one learner: an on-screen preview that prints (or saves
 * as PDF through the browser) without the rest of the app.
 */
export default function PracticeLog({ uid, spaceId, learnerName, onClose }: { uid: string; spaceId: string; learnerName: string; onClose: () => void }) {
  const [drives, setDrives] = useState<LogDrive[] | null>(null);
  const [supervisors, setSupervisors] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  const [partial, setPartial] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all: LogDrive[] = [];
        let cursor: Parameters<typeof readSharedDrives>[2] = null, pages = 0;
        do {
          const result = await readSharedDrives(uid, spaceId, cursor);
          all.push(...(result.drives as LogDrive[]));
          cursor = result.cursor as typeof cursor; pages += 1;
        } while (cursor && pages < MAX_PAGES && !cancelled);
        // Managers can list members; others see their own name and a generic label.
        const names: Record<string, string> = {};
        const own = auth?.currentUser;
        if (own?.uid === uid && own.email) names[uid] = own.email;
        try { for (const member of await readSharedMembers(uid, spaceId)) if (member.email) names[member.uid] = member.email; } catch { /* not a manager */ }
        if (cancelled) return;
        setDrives(all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)));
        setPartial(!!cursor); setSupervisors(names);
      } catch { if (!cancelled) setError(true); }
    })();
    return () => { cancelled = true; };
  }, [uid, spaceId]);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("printing-log");
    return () => { document.removeEventListener("keydown", onKey); document.body.classList.remove("printing-log"); };
  }, [onClose]);

  const total = drives?.reduce((sum, drive) => sum + drive.minutes, 0) ?? 0;
  const night = drives?.reduce((sum, drive) => sum + drive.nightMinutes, 0) ?? 0;
  const generated = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const period = drives?.length ? `${formatDate(drives[0].date)} – ${formatDate(drives[drives.length - 1].date)}` : "No drives yet";

  return createPortal(<div className="print-log fixed inset-0 z-[2000] overflow-y-auto bg-[#1A2332]/60 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label="Practice log">
    <div className="print-log-toolbar mx-auto mb-3 flex max-w-[860px] flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-medium text-white">Preview · use Print to print or save as PDF</p>
      <div className="flex gap-2">
        <button type="button" className={primaryButton} disabled={!drives} onClick={() => window.print()}><Printer size={15} aria-hidden="true" /> Print / Save as PDF</button>
        <button ref={closeButton} type="button" className={ghostButton} onClick={onClose}><X size={15} aria-hidden="true" /> Close</button>
      </div>
    </div>
    <article className="print-log-sheet mx-auto max-w-[860px] rounded-2xl bg-white p-6 text-[#1A2332] shadow-xl sm:p-10" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1A2332]/15 pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#0C7A8D]" style={mono}>DriveReady · Supervised driving practice log</p>
          <h2 className="mt-1 text-2xl font-bold" style={heading}>{learnerName}</h2>
          <p className="mt-1 text-sm text-[#6B7A8D]">{period}</p>
        </div>
        <p className="text-right text-xs text-[#6B7A8D]">Generated {generated}</p>
      </header>

      {error && <p role="status" className="mt-6 text-sm">Could not load the practice log. Close it and try again.</p>}
      {!drives && !error && <p className="mt-6 text-sm text-[#6B7A8D]">Loading drives…</p>}
      {drives && <>
        <section aria-label="Practice totals" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Drives", String(drives.length), ""], ["Total", formatDuration(total), `of ${TARGET_HOURS} h`], ["Day", formatDuration(total - night), `of ${TARGET_HOURS - TARGET_NIGHT_HOURS} h`], ["Night", formatDuration(night), `of ${TARGET_NIGHT_HOURS} h`]].map(([label, value, target]) =>
            <div key={label} className="rounded-xl border border-[#1A2332]/12 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7A8D]" style={mono}>{label}</p>
              <p className="text-xl font-bold text-[#0C7A8D]" style={heading}>{value}</p>
              {target && <p className="text-[11px] text-[#6B7A8D]">{target}</p>}
            </div>)}
        </section>
        {partial && <p className="mt-3 text-xs">This log includes the first {drives.length} drives only.</p>}
        {drives.length > 0 ? <table className="mt-6 w-full border-collapse text-left text-[12px]">
          <thead><tr className="border-b-2 border-[#1A2332]/20">{["Date", "Route", "Duration", "Night", "Practised", "Supervisor", "Notes"].map((h) => <th key={h} scope="col" className="py-2 pr-3 align-bottom text-[10px] font-semibold uppercase tracking-wider text-[#6B7A8D]" style={mono}>{h}</th>)}</tr></thead>
          <tbody>{drives.map((drive) => <tr key={drive.id} className="border-b border-[#1A2332]/10 align-top">
            <td className="whitespace-nowrap py-2 pr-3">{formatDate(drive.date)}</td>
            <td className="py-2 pr-3">{drive.routeSnapshot?.name ?? "—"}</td>
            <td className="whitespace-nowrap py-2 pr-3">{formatDuration(drive.minutes)}</td>
            <td className="whitespace-nowrap py-2 pr-3">{drive.nightMinutes ? formatDuration(drive.nightMinutes) : "—"}</td>
            <td className="py-2 pr-3">{[...(drive.practicedSkills ?? []), ...(drive.practicedConditions ?? [])].join(", ") || "—"}</td>
            <td className="py-2 pr-3 break-all">{drive.supervisorPresentUid ? supervisors[drive.supervisorPresentUid] ?? "Supervisor" : "—"}</td>
            <td className="py-2 pr-3">{drive.notes || "—"}</td>
          </tr>)}</tbody>
          <tfoot><tr className="border-t-2 border-[#1A2332]/20 font-semibold"><td className="py-2 pr-3">Total</td><td /><td className="whitespace-nowrap py-2 pr-3">{formatDuration(total)}</td><td className="whitespace-nowrap py-2 pr-3">{formatDuration(night)}</td><td colSpan={3} /></tr></tfoot>
        </table> : <p className="mt-6 text-sm">No drives have been logged for {learnerName} yet.</p>}
        <section aria-label="Signatures" className="mt-10 grid gap-8 sm:grid-cols-2">
          {["Parent or guardian", "Date"].map((label) => <div key={label}><div className="h-8 border-b border-[#1A2332]/40" /><p className="mt-1 text-xs text-[#6B7A8D]">{label}</p></div>)}
        </section>
        <footer className="mt-8 border-t border-[#1A2332]/15 pt-3 text-[11px] leading-relaxed text-[#6B7A8D]">
          A personal record kept in DriveReady, not an official form. Georgia DDS describes 40 hours of supervised driving, 6 of them at night, and asks a parent or guardian to affirm them; check the current requirements at dds.georgia.gov. Supervisors and night minutes are as recorded by the family and are not independently verified.
        </footer>
      </>}
    </article>
  </div>, document.body);
}
