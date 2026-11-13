import { useCallback, useEffect, useRef, useState } from "react";
import { readSharedMembers, readSharedSpaces, sharedAccessRequest, sharedAccessDemo } from "./sharedClient";
import SharedPractice from "./SharedPractice";
import SharedRoutes from "./SharedRoutes";
import SharedDashboard from "./SharedDashboard";
import type { TimerDraft } from "./DriveTimer";
import { dangerButton, ghostButton, primaryButton } from "./design";
import { inviteLink, parseInvite, savePendingInvite } from "./inviteLink";
import { usePendingInvite } from "./usePendingInvite";

type Space = { id: string; learnerName: string; role: string };
type Preview = { learnerName: string; role: string; expiresAt: number };
type Member = { uid: string; role: string; email: string };
type Invitation = { id: string; recipientEmail: string; role: string; expiresAt: number };
const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50";

export default function SharedSpaces({ uid, verified, disabled, onBusyChange, page, onNavigate }: { uid: string; verified: boolean; disabled: boolean; onBusyChange: (busy: boolean) => void; page: string; onNavigate: (page: string) => void }) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selected, setSelected] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [membersError, setMembersError] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitationError, setInvitationError] = useState(false);
  const [invitationCursor, setInvitationCursor] = useState<string | null>(null);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [cancelling, setCancelling] = useState<Invitation | null>(null);
  const [learnerName, setLearnerName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("supervisor");
  const [issued, setIssued] = useState<{ link: string; email: string; role: string; learnerName: string; expiresAt: number } | null>(null);
  const [joinLink, setJoinLink] = useState("");
  const [joinError, setJoinError] = useState("");
  const invite = usePendingInvite();
  const [preview, setPreview] = useState<{ key: string; state: "checking" | "ready" | "failed"; details?: Preview } | null>(null);
  const [status, setStatus] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [routeRequest, setRouteRequest] = useState<{ spaceId: string; nonce: string } | null>(null);
  const [createdRoute, setCreatedRoute] = useState<{ spaceId: string; routeId: string; nonce: string } | null>(null);
  const [logRequest, setLogRequest] = useState<{ spaceId: string; nonce: string; draft?: TimerDraft } | null>(null);
  // Bumped whenever a route is saved, so the drive form picks it up without a manual refresh.
  const [routesVersion, setRoutesVersion] = useState(0);
  const [dashboardSpace, setDashboardSpace] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const busyRef = useRef(false);
  const generation = useRef(0);
  const memberGeneration = useRef(0);
  const invitationGeneration = useRef(0);
  const invitationLoading = useRef(false);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current += 1; memberGeneration.current += 1; invitationGeneration.current += 1; onBusyChange(false); }; }, [onBusyChange]);
  useEffect(() => { setIssued(null); setRemoving(null); setCancelling(null); setConfirmDelete(""); }, [selected]);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!verified) { setSpaces([]); setSelected(""); return false; }
    try {
      const found = await readSharedSpaces(uid) as Space[];
      if (!alive.current || request !== generation.current) return false;
      setSpaces(found);
      setSelected((current) => found.some((item) => item.id === current && item.role === "manager") ? current : found.find((item) => item.role === "manager")?.id ?? "");
      setUncertain(false);
      return true;
    } catch {
      if (!alive.current || request !== generation.current) return false;
      setSpaces([]); setSelected(""); setStatus(sharedAccessDemo ? "Could not load shared spaces. Check the local emulators and refresh." : "Could not load shared spaces. Check your connection and refresh.");
      return false;
    }
  }, [uid, verified]);
  useEffect(() => { void refresh(); }, [refresh]);
  const refreshMembers = useCallback(async () => {
    const request = ++memberGeneration.current;
    setMembers([]); setMembersError(false);
    if (!verified || !selected) return;
    try {
      const found = await readSharedMembers(uid, selected) as Member[];
      if (alive.current && request === memberGeneration.current) setMembers(found);
    } catch {
      if (alive.current && request === memberGeneration.current) setMembersError(true);
    }
  }, [uid, verified, selected]);
  useEffect(() => { void refreshMembers(); }, [refreshMembers]);
  // Review a held invitation as soon as the account can. Reviewing grants nothing and
  // changes nothing, so a failure here just explains itself instead of blocking the page.
  const inviteKey = invite ? `${invite.spaceId}.${invite.token}` : "";
  useEffect(() => {
    if (!invite || !verified) { setPreview(null); return; }
    let current = true;
    setPreview({ key: inviteKey, state: "checking" });
    sharedAccessRequest(uid, "previewInvitation", { spaceId: invite.spaceId, token: invite.token })
      .then((details: Preview) => { if (current && alive.current) setPreview({ key: inviteKey, state: "ready", details }); })
      .catch(() => { if (current && alive.current) setPreview({ key: inviteKey, state: "failed" }); });
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteKey, verified, uid]);
  const refreshInvitations = useCallback(async () => {
    const request = ++invitationGeneration.current;
    setInvitations([]); setInvitationError(false); setInvitationCursor(null);
    invitationLoading.current = false; setInvitationsLoading(false);
    if (!verified || !selected) return;
    try {
      const result = await sharedAccessRequest(uid, "listInvitations", { spaceId: selected, cursor: "" });
      if (alive.current && request === invitationGeneration.current) { setInvitations(result.invitations); setInvitationCursor(result.nextCursor); }
    } catch {
      if (alive.current && request === invitationGeneration.current) setInvitationError(true);
    }
  }, [uid, verified, selected]);
  useEffect(() => { void refreshInvitations(); }, [refreshInvitations]);
  async function loadMoreInvitations() {
    if (!invitationCursor || invitationLoading.current || !selected || disabled || busy) return;
    const request = invitationGeneration.current;
    invitationLoading.current = true; setInvitationsLoading(true); setInvitationError(false);
    try {
      const result = await sharedAccessRequest(uid, "listInvitations", { spaceId: selected, cursor: invitationCursor });
      if (alive.current && request === invitationGeneration.current) {
        setInvitations((existing) => [...existing, ...result.invitations.filter((item: Invitation) => !existing.some((entry) => entry.id === item.id))]);
        setInvitationCursor(result.nextCursor);
      }
    } catch {
      if (alive.current && request === invitationGeneration.current) setInvitationError(true);
    } finally {
      if (alive.current && request === invitationGeneration.current) { invitationLoading.current = false; setInvitationsLoading(false); }
    }
  }
  async function run(action: () => Promise<void>) {
    if (busyRef.current || disabled || !verified || uncertain) return;
    busyRef.current = true; setBusy(true); onBusyChange(true); setStatus("");
    try { await action(); }
    catch { if (alive.current) { setUncertain(true); setStatus("Could not confirm the request. Refresh spaces and check the result before trying again."); } }
    finally { busyRef.current = false; if (alive.current) setBusy(false); onBusyChange(false); }
  }
  const blocked = busy || disabled || !verified || uncertain;
  const onDashboard = page === "dashboard";
  // Dashboard and Routes lay out their own cards; other pages sit in one card.
  const bare = onDashboard || page === "routes" || page === "logs";
  return <section className={bare ? "" : "rounded-2xl border border-border bg-card p-4 sm:p-5"}>
    <h3 className={bare ? "sr-only" : "font-semibold"}>{sharedAccessDemo ? "Shared spaces · local emulator only" : "Shared spaces"}</h3>
    {!verified && <p className="mt-2 text-sm">{sharedAccessDemo ? "Verify your email in the emulator to use this test." : "Verify your email under Account to add learners or accept invitations."}</p>}
    {status && <p role="status" className="mt-2 text-sm">{status}</p>}
    <div className={bare ? "mb-3 flex items-center justify-end gap-2 text-xs" : "mt-3 flex items-center gap-2"} hidden={onDashboard && spaces.length > 0}><button type="button" disabled={busy || disabled || !verified} className={button} onClick={() => { setStatus(""); void refresh(); void refreshMembers(); void refreshInvitations(); }}>Refresh spaces</button><span className="text-sm">{spaces.length} {spaces.length === 1 ? "space" : "spaces"}</span></div>
    {spaces.length === 0 && page !== "shared" && <p className="mt-3 text-sm">Add a learner in <button type="button" className="text-[#0C7A8D] underline" onClick={() => onNavigate("shared")}>People &amp; access</button> to get started.</p>}
    {onDashboard && <SharedDashboard uid={uid} spaces={spaces} blocked={blocked} onNavigate={onNavigate} preferredSpace={dashboardSpace} onSelect={setDashboardSpace} onLogDrive={(spaceId, draft) => { setLogRequest({ spaceId, nonce: crypto.randomUUID(), draft }); onNavigate("logs"); }} />}
    <div hidden={page !== "logs"}><SharedPractice uid={uid} spaces={spaces} blocked={blocked} run={run} createdRoute={createdRoute} logRequest={logRequest} visible={page === "logs"} routesVersion={routesVersion} onCreateRoute={(spaceId) => { onNavigate("routes"); setRouteRequest({ spaceId, nonce: crypto.randomUUID() }); }} /></div>
    <div hidden={page !== "routes"}><SharedRoutes uid={uid} spaces={spaces} blocked={blocked} run={run} createRequest={routeRequest} activePage={page === "routes"} onDeleted={() => setRoutesVersion((value) => value + 1)} onCreated={(spaceId, routeId) => { setRoutesVersion((value) => value + 1); if (routeRequest?.spaceId === spaceId) { setCreatedRoute({ spaceId, routeId, nonce: crypto.randomUUID() }); setRouteRequest(null); onNavigate("logs"); } }} /></div>
    <div hidden={page !== "shared"}>
    {invite && <div className="mt-3 rounded-xl border border-[#0C7A8D]/30 bg-[#E4EFF2] p-4 text-sm text-[#095969]" role="region" aria-label="Invitation">
      {!verified ? <><p><strong>You’ve been invited to a learner’s space.</strong> Verify your email under Account first, then come back here to review the invitation.</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" className={ghostButton} onClick={() => onNavigate("account")}>Go to Account</button><button type="button" className={ghostButton} onClick={() => savePendingInvite(null)}>Dismiss</button></div></>
      : preview?.key === inviteKey && preview.state === "ready" && preview.details ? <><p><strong>Invitation to {preview.details.learnerName}’s space as {preview.details.role}.</strong> Once you join, you’ll see {preview.details.learnerName}’s routes, drives and shared notes{preview.details.role === "supervisor" ? ", and you can log drives" : ""}. Access begins only after you accept.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={primaryButton} disabled={blocked} onClick={() => { const accepted = invite; const name = preview.details?.learnerName ?? ""; void run(async () => { await sharedAccessRequest(uid, "acceptInvitation", { spaceId: accepted.spaceId, token: accepted.token }); savePendingInvite(null); const loaded = await refresh(); setStatus(loaded ? `Invitation accepted. You can now see ${name}’s routes and drives.` : "Invitation accepted, but the list could not refresh."); }); }}>Accept invitation</button><button type="button" className={ghostButton} disabled={busy} onClick={() => savePendingInvite(null)}>Not now</button></div><p className="mt-2 text-xs">“Not now” only closes this; the link keeps working until it expires.</p></>
      : preview?.key === inviteKey && preview.state === "failed" ? <><p><strong>This invitation can’t be used with this account.</strong> It may have expired (links last 48 hours), been cancelled or already used, or been sent to a different email address. Ask the managing supervisor for a new link.</p><div className="mt-2"><button type="button" className={ghostButton} onClick={() => savePendingInvite(null)}>Dismiss</button></div></>
      : <p>Checking your invitation…</p>}
    </div>}
    <p className="mt-3 text-sm text-muted-foreground">Use fictional data. Invitations aren’t emailed: create a link below and send it to the person yourself.</p>
    {spaces.length > 0 && <ul className="mt-2 space-y-1 text-sm" aria-label="Shared spaces">{spaces.map((space) => <li key={space.id} className="flex flex-wrap items-center gap-2"><span>{space.learnerName} · {space.role}</span>{space.role !== "manager" && <button type="button" className={dangerButton} disabled={blocked} onClick={() => { if (!window.confirm(`Leave ${space.learnerName}’s space? You will lose access to their routes and practice history. The managing supervisor can invite you again.`)) return; void run(async () => { await sharedAccessRequest(uid, "leaveSpace", { spaceId: space.id }); await refresh(); if (alive.current) setStatus(`You left ${space.learnerName}’s space.`); }); }}>Leave space</button>}</li>)}</ul>}
    <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void run(async () => { await sharedAccessRequest(uid, "createSpace", { learnerName: learnerName.trim() }); setLearnerName(""); const loaded = await refresh(); setStatus(loaded ? "Learner space created." : "Learner space created, but the list could not refresh."); }); }}>
      <label className="text-sm">Learner name for shared space<input className={`${field} mt-1`} value={learnerName} maxLength={60} required disabled={blocked} onChange={(event) => setLearnerName(event.target.value)} /></label><button className={button} disabled={blocked}>Create shared space</button>
    </form>
    {spaces.some((space) => space.role === "manager") && <form className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); setIssued(null); void run(async () => { const recipient = email.trim(), learner = spaces.find((space) => space.id === selected)?.learnerName ?? ""; const result = await sharedAccessRequest(uid, "createInvitation", { spaceId: selected, recipientEmail: recipient, role }); setIssued({ link: inviteLink(window.location.href, result.spaceId, result.token), email: recipient, role, learnerName: learner, expiresAt: result.expiresAt }); setEmail(""); await refreshInvitations(); setStatus("Invitation link created."); }); }}>
      <label className="text-sm">Learner space<select className={`${field} mt-1`} value={selected} disabled={blocked} onChange={(event) => { setSelected(event.target.value); setIssued(null); }}>{spaces.filter((space) => space.role === "manager").map((space) => <option value={space.id} key={space.id}>{space.learnerName}</option>)}</select></label>
      <label className="text-sm">Invitee email<input className={`${field} mt-1`} value={email} type="email" required disabled={blocked} onChange={(event) => { setEmail(event.target.value); setIssued(null); }} /></label>
      <label className="text-sm">Invitee role<select className={`${field} mt-1`} value={role} disabled={blocked} onChange={(event) => { setRole(event.target.value); setIssued(null); }}><option value="supervisor">Supervisor</option><option value="learner">Learner</option></select></label>
      <div className="flex items-end"><button className={button} disabled={blocked || !selected}>Create invitation link</button></div>
    </form>}
    {issued && <div className="mt-3 space-y-2 rounded-xl border border-[#0C7A8D]/30 bg-[#E4EFF2] p-4 text-sm text-[#095969]" role="region" aria-label="New invitation link">
      <p><strong>Send this link to {issued.email}</strong> yourself, by text, chat or email. It joins {issued.learnerName}’s space as a {issued.role}, works once, only for that email address, and expires {new Date(issued.expiresAt).toLocaleString()}. It can’t be shown again.</p>
      <label className="block font-medium">Link to send<input className={`${field} mt-1 font-mono text-xs`} value={issued.link} readOnly onFocus={(event) => event.target.select()} /></label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryButton} onClick={async () => { try { await navigator.clipboard.writeText(issued.link); setStatus("Link copied."); } catch { setStatus("Couldn’t copy automatically. Select the link and copy it."); } }}>Copy link</button>
        {typeof navigator.share === "function" && <button type="button" className={ghostButton} onClick={async () => { try { await navigator.share({ title: "DriveReady invitation", text: `Join ${issued.learnerName}’s learner space on DriveReady as a ${issued.role}. Sign in or create an account with ${issued.email}. The link works once and expires in 48 hours.`, url: issued.link }); } catch { /* closed or unavailable */ } }}>Share…</button>}
        <button type="button" className={ghostButton} onClick={() => setIssued(null)}>Done</button>
      </div>
    </div>}
    {selected && <div className="mt-4 rounded-lg bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">People with access</h4><button type="button" className={button} disabled={busy || disabled || !verified} onClick={() => void refreshMembers()}>Refresh people</button></div>
      <p className="mt-1 text-muted-foreground">Emails shown are from when each person joined and may have changed.</p>
      {membersError && <p role="status">Could not load people. Refresh and try again.</p>}
      <ul aria-label="People with access" className="mt-2 space-y-2">{members.map((member) => <li key={member.uid} className="flex flex-wrap items-center gap-2"><span>{member.email || `Account ${member.uid}`} · {member.role}</span>{member.role !== "manager" && <button type="button" className={button} disabled={blocked} onClick={() => setRemoving(member)}>Remove {member.email || member.uid}</button>}</li>)}</ul>
      {removing && <div className="mt-3 rounded-lg border border-amber-400 p-3"><p>Remove {removing.email || removing.uid} from this learner’s space? They will lose access, and all pending invitations for this space will be invalidated. Other invitees will need a new invitation. Previously downloaded information cannot be recalled.</p><div className="mt-2 flex gap-2"><button type="button" className={button} disabled={blocked} onClick={() => void run(async () => { await sharedAccessRequest(uid, "removeMember", { spaceId: selected, memberUid: removing.uid }); setRemoving(null); setIssued(null); setCancelling(null); await Promise.all([refreshMembers(), refreshInvitations()]); setStatus("Access removed. All pending invitations for this space were invalidated."); })}>Confirm removal</button><button type="button" className={button} disabled={busy} onClick={() => setRemoving(null)}>Keep access</button></div></div>}
    </div>}
    {selected && <div className="mt-4 rounded-lg bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">Pending invitations</h4><button type="button" className={button} disabled={busy || disabled || !verified} onClick={() => void refreshInvitations()}>Refresh invitations</button></div>
      <p className="mt-1 text-muted-foreground">These invitations have not expired or been cancelled. An invitation may still be ineligible for acceptance. Links can’t be shown again; cancel a lost one and create a new one. Refresh to see recent changes.</p>
      {invitationError && <p role="status">Could not load invitations. Refresh or try loading more again.</p>}
      <ul aria-label="Pending invitations" className="mt-2 space-y-2">{invitations.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-2"><span>{item.recipientEmail} · {item.role} · expires {new Date(item.expiresAt).toLocaleString()}</span><button type="button" className={button} disabled={blocked} onClick={() => setCancelling(item)}>Cancel invitation for {item.recipientEmail}</button></li>)}</ul>
      {invitationCursor && <button type="button" className={`${button} mt-2`} disabled={busy || disabled || !verified || invitationsLoading} onClick={() => void loadMoreInvitations()}>{invitationsLoading ? "Loading invitations…" : "Load more invitations"}</button>}
      {cancelling && <div className="mt-3 rounded-lg border border-amber-400 p-3"><p>Cancel the {cancelling.role} invitation for {cancelling.recipientEmail}? This will prevent its acceptance.</p><div className="mt-2 flex gap-2"><button type="button" className={button} disabled={blocked} onClick={() => void run(async () => { await sharedAccessRequest(uid, "cancelInvitationById", { spaceId: selected, invitationId: cancelling.id }); setCancelling(null); setIssued(null); await refreshInvitations(); setStatus("Invitation cancelled."); })}>Confirm cancellation</button><button type="button" className={button} disabled={busy} onClick={() => setCancelling(null)}>Keep invitation</button></div></div>}
    </div>}
    {selected && (() => {
      const target = spaces.find((space) => space.id === selected && space.role === "manager");
      if (!target) return null;
      const matches = confirmDelete.trim() === target.learnerName;
      return <div className="mt-4 rounded-xl border border-red-200 bg-red-50/40 p-4 text-sm" aria-label="Delete learner space">
        <h4 className="font-semibold text-red-800">Delete {target.learnerName}’s space</h4>
        <p className="mt-1 text-muted-foreground">Permanently deletes all of {target.learnerName}’s drives, routes, notes and invitations, and removes everyone’s access. This can’t be undone. Print or save the practice log first if you want to keep a record.</p>
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); if (!matches) return; const name = target.learnerName; void run(async () => { await sharedAccessRequest(uid, "deleteSpace", { spaceId: target.id, confirmName: confirmDelete.trim() }); setConfirmDelete(""); await refresh(); if (alive.current) setStatus(`${name}’s space was deleted.`); }); }}>
          <label className="text-sm">Type <strong>{target.learnerName}</strong> to confirm<input className={`${field} mt-1`} value={confirmDelete} autoComplete="off" disabled={blocked} onChange={(event) => setConfirmDelete(event.target.value)} /></label>
          <button className={dangerButton} disabled={blocked || !matches}>Delete learner space</button>
        </form>
      </div>;
    })()}
    <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const found = parseInvite(joinLink); if (!found) { setJoinError("That doesn’t look like a DriveReady invitation link. Paste the whole link you were sent."); return; } setJoinError(""); setJoinLink(""); setStatus(""); savePendingInvite(found); }}>
      <label className="min-w-0 basis-full text-sm sm:basis-0 sm:flex-1">Invitation link you received<input className={`${field} mt-1`} value={joinLink} autoComplete="off" required disabled={blocked} onChange={(event) => { setJoinLink(event.target.value); setJoinError(""); }} placeholder="https://…#invite=…" /></label>
      <button className={button} disabled={blocked}>Review invitation</button>
    </form>
    {joinError && <p role="status" className="mt-2 text-sm text-red-800">{joinError}</p>}
    </div>
  </section>;
}
