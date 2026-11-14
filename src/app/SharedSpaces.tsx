import { useCallback, useEffect, useRef, useState } from "react";
import { readSharedMembers, readSharedSpaces, sharedAccessRequest, sharedAccessDemo } from "./sharedClient";
import SharedPractice from "./SharedPractice";
import SharedRoutes from "./SharedRoutes";
import SharedDashboard from "./SharedDashboard";
import CommunityRoutes from "./CommunityRoutes";
import type { TimerDraft } from "./DriveTimer";
import { Copy, Link2, Plus, RefreshCw, Share2 } from "lucide-react";
import { Badge, Card, CardHeader, dangerButton, ghostButton, heading, mono, primaryButton } from "./design";
import { inviteLink, parseInvite, savePendingInvite } from "./inviteLink";
import { usePendingInvite } from "./usePendingInvite";

type Space = { id: string; learnerName: string; role: string };
type Preview = { learnerName: string; role: string; expiresAt: number };
type Member = { uid: string; role: string; email: string };
type Invitation = { id: string; recipientEmail: string; role: string; expiresAt: number };
const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50";

function Avatar({ text, small = false }: { text: string; small?: boolean }) {
  const initial = text.trim().charAt(0).toUpperCase() || "?";
  return <span aria-hidden="true" className={`flex flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0C7A8D] to-[#12B5C9] font-bold text-white ${small ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"}`} style={heading}>{initial}</span>;
}
function RoleBadge({ role }: { role: string }) {
  return <Badge>{role}</Badge>;
}

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
    catch (error) {
      if (!alive.current) return;
      // A refusal with a reason changed nothing, so the page stays usable.
      if ((error as { rejected?: boolean })?.rejected) setStatus((error as Error).message);
      else { setUncertain(true); setStatus("Could not confirm the request. Refresh spaces and check the result before trying again."); }
    }
    finally { busyRef.current = false; if (alive.current) setBusy(false); onBusyChange(false); }
  }
  const blocked = busy || disabled || !verified || uncertain;
  const onDashboard = page === "dashboard";
  const managed = spaces.filter((space) => space.role === "manager");
  const current = managed.find((space) => space.id === selected);
  return <section>
    <h3 className="sr-only">{sharedAccessDemo ? "Shared spaces · local emulator only" : "Shared spaces"}</h3>
    {!verified && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{sharedAccessDemo ? "Verify your email in the emulator to use this test." : "Verify your email under Account to add learners or accept invitations."}</p>}
    {status && <p role="status" className="mb-3 rounded-lg bg-[#E4EFF2] p-3 text-sm text-[#095969]">{status}</p>}
    {page !== "shared" && page !== "community" && <div className="mb-3 flex items-center justify-end gap-2 text-xs" hidden={onDashboard && spaces.length > 0}><button type="button" disabled={busy || disabled || !verified} className={button} onClick={() => { setStatus(""); void refresh(); void refreshMembers(); void refreshInvitations(); }}>Refresh spaces</button><span className="text-sm">{spaces.length} {spaces.length === 1 ? "space" : "spaces"}</span></div>}
    {spaces.length === 0 && page !== "shared" && page !== "community" && <p className="mt-3 text-sm">Add a learner in <button type="button" className="text-[#0C7A8D] underline" onClick={() => onNavigate("shared")}>People &amp; access</button> to get started.</p>}
    {onDashboard && <SharedDashboard uid={uid} spaces={spaces} blocked={blocked} onNavigate={onNavigate} preferredSpace={dashboardSpace} onSelect={setDashboardSpace} onLogDrive={(spaceId, draft) => { setLogRequest({ spaceId, nonce: crypto.randomUUID(), draft }); onNavigate("logs"); }} />}
    <div hidden={page !== "logs"}><SharedPractice uid={uid} spaces={spaces} blocked={blocked} run={run} createdRoute={createdRoute} logRequest={logRequest} visible={page === "logs"} routesVersion={routesVersion} onCreateRoute={(spaceId) => { onNavigate("routes"); setRouteRequest({ spaceId, nonce: crypto.randomUUID() }); }} /></div>
    <div hidden={page !== "routes"}><SharedRoutes uid={uid} spaces={spaces} blocked={blocked} run={run} createRequest={routeRequest} activePage={page === "routes"} onDeleted={() => setRoutesVersion((value) => value + 1)} onCreated={(spaceId, routeId) => { setRoutesVersion((value) => value + 1); if (routeRequest?.spaceId === spaceId) { setCreatedRoute({ spaceId, routeId, nonce: crypto.randomUUID() }); setRouteRequest(null); onNavigate("logs"); } }} /></div>
    <div hidden={page !== "community"}><CommunityRoutes uid={uid} spaces={spaces} blocked={blocked} run={run} active={page === "community"} onSaved={() => setRoutesVersion((value) => value + 1)} /></div>
    {page === "shared" && <div className="space-y-5">
    {invite && <div className="rounded-2xl border border-[#0C7A8D]/30 bg-[#E4EFF2] p-5 text-sm text-[#095969]" role="region" aria-label="Invitation">
      {!verified ? <><p><strong>You’ve been invited to a learner’s space.</strong> Verify your email under Account first, then come back here to review the invitation.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={ghostButton} onClick={() => onNavigate("account")}>Go to Account</button><button type="button" className={ghostButton} onClick={() => savePendingInvite(null)}>Dismiss</button></div></>
      : preview?.key === inviteKey && preview.state === "ready" && preview.details ? <><p className="text-base font-bold" style={heading}>Invitation to {preview.details.learnerName}’s space as {preview.details.role}.</p><p className="mt-1">Once you join, you’ll see {preview.details.learnerName}’s routes, drives and shared notes{preview.details.role === "supervisor" ? ", and you can log drives" : ""}. Access begins only after you accept.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={primaryButton} disabled={blocked} onClick={() => { const accepted = invite; const name = preview.details?.learnerName ?? ""; void run(async () => { await sharedAccessRequest(uid, "acceptInvitation", { spaceId: accepted.spaceId, token: accepted.token }); savePendingInvite(null); const loaded = await refresh(); setStatus(loaded ? `Invitation accepted. You can now see ${name}’s routes and drives.` : "Invitation accepted, but the list could not refresh."); }); }}>Accept invitation</button><button type="button" className={ghostButton} disabled={busy} onClick={() => savePendingInvite(null)}>Not now</button></div><p className="mt-2 text-xs">“Not now” only closes this; the link keeps working until it expires.</p></>
      : preview?.key === inviteKey && preview.state === "failed" ? <><p><strong>This invitation can’t be used with this account.</strong> It may have expired (links last 48 hours), been cancelled or already used, or been sent to a different email address. Ask the managing supervisor for a new link.</p><div className="mt-3"><button type="button" className={ghostButton} onClick={() => savePendingInvite(null)}>Dismiss</button></div></>
      : <p>Checking your invitation…</p>}
    </div>}

    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="min-w-0" aria-label="Your learner spaces">
        <CardHeader title="Learner spaces" subtitle={`${spaces.length} ${spaces.length === 1 ? "space" : "spaces"}`} divided action={<button type="button" disabled={busy || disabled || !verified} className={ghostButton} aria-label="Refresh spaces" onClick={() => { setStatus(""); void refresh(); void refreshMembers(); void refreshInvitations(); }}><RefreshCw size={14} aria-hidden="true" /><span className="hidden sm:inline">Refresh</span></button>} />
        {spaces.length > 0 ? <ul className="divide-y divide-border" aria-label="Shared spaces">{spaces.map((space) => <li key={space.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
          <Avatar text={space.learnerName} />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{space.learnerName}<span className="sr-only"> · </span></p><p className="mt-0.5"><RoleBadge role={space.role} /></p></div>
          {space.role !== "manager" && <button type="button" className={dangerButton} disabled={blocked} onClick={() => { if (!window.confirm(`Leave ${space.learnerName}’s space? You will lose access to their routes and practice history. The managing supervisor can invite you again.`)) return; void run(async () => { await sharedAccessRequest(uid, "leaveSpace", { spaceId: space.id }); await refresh(); if (alive.current) setStatus(`You left ${space.learnerName}’s space.`); }); }}>Leave space</button>}
        </li>)}</ul> : <p className="px-5 py-4 text-sm text-muted-foreground">No learner spaces yet. Add a learner below, or join one with an invitation link.</p>}
        <form className="flex flex-wrap items-end gap-2 border-t border-border px-5 py-4" onSubmit={(event) => { event.preventDefault(); void run(async () => { await sharedAccessRequest(uid, "createSpace", { learnerName: learnerName.trim() }); setLearnerName(""); const loaded = await refresh(); setStatus(loaded ? "Learner space created." : "Learner space created, but the list could not refresh."); }); }}>
          <label className="min-w-0 basis-full text-sm font-medium sm:basis-0 sm:flex-1">Learner name for shared space<input className={`${field} mt-1`} value={learnerName} maxLength={60} required disabled={blocked} placeholder="A name or nickname" onChange={(event) => setLearnerName(event.target.value)} /></label>
          <button className={primaryButton} disabled={blocked}><Plus size={15} aria-hidden="true" />Create shared space</button>
        </form>
      </Card>

      <Card className="min-w-0" aria-label="Join a learner’s space">
        <CardHeader title="Join a learner’s space" subtitle="Paste the invitation link someone sent you" divided />
        <form className="flex flex-wrap items-end gap-2 px-5 py-4" onSubmit={(event) => { event.preventDefault(); const found = parseInvite(joinLink); if (!found) { setJoinError("That doesn’t look like a DriveReady invitation link. Paste the whole link you were sent."); return; } setJoinError(""); setJoinLink(""); setStatus(""); savePendingInvite(found); }}>
          <label className="min-w-0 basis-full text-sm font-medium sm:basis-0 sm:flex-1">Invitation link you received<input className={`${field} mt-1`} value={joinLink} autoComplete="off" required disabled={blocked} onChange={(event) => { setJoinLink(event.target.value); setJoinError(""); }} placeholder="https://…#invite=…" /></label>
          <button className={ghostButton} disabled={blocked}>Review invitation</button>
        </form>
        {joinError && <p role="status" className="px-5 pb-4 text-sm text-red-800">{joinError}</p>}
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Invitations aren’t emailed: the managing supervisor creates a link and sends it to you. Use fictional data in this preview.</p>
      </Card>
    </div>

    {managed.length > 0 && <Card aria-label="Manage a learner space">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 pb-4 pt-5">
        <div className="min-w-0"><h2 className="text-base font-bold" style={heading}>Manage {current?.learnerName ?? "a learner"}</h2><p className="mt-0.5 text-xs text-muted-foreground">People with access, invitations and pending links for this learner</p></div>
        <label className={`text-sm font-medium ${managed.length === 1 ? "sr-only" : ""}`}>Learner space<select className={`${field} mt-1 sm:w-56`} value={selected} disabled={blocked} onChange={(event) => { setSelected(event.target.value); setIssued(null); }}>{managed.map((space) => <option value={space.id} key={space.id}>{space.learnerName}</option>)}</select></label>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-border">
        <div className="min-w-0 px-5 py-4">
          <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold" style={heading}>People with access</h3><button type="button" className={ghostButton} disabled={busy || disabled || !verified} onClick={() => void refreshMembers()}>Refresh people</button></div>
          <p className="mt-1 text-xs text-muted-foreground">Emails are from when each person joined and may have changed.</p>
          {membersError && <p role="status" className="mt-2 text-sm text-red-800">Could not load people. Refresh and try again.</p>}
          <ul aria-label="People with access" className="mt-2 divide-y divide-border">{members.map((member) => <li key={member.uid} className="flex flex-wrap items-center gap-3 py-2.5">
            <Avatar text={member.email || "?"} small />
            <div className="min-w-0 flex-1"><p className="truncate text-sm">{member.email || `Account ${member.uid}`}<span className="sr-only"> · </span></p><p className="mt-0.5"><RoleBadge role={member.role} /></p></div>
            {member.role !== "manager" && <button type="button" className={dangerButton} disabled={blocked} aria-label={`Remove ${member.email || member.uid}`} onClick={() => setRemoving(member)}>Remove</button>}
          </li>)}</ul>
          {removing && <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p>Remove {removing.email || removing.uid} from this learner’s space? They will lose access, and all pending invitations for this space will be invalidated. Other invitees will need a new invitation. Previously downloaded information cannot be recalled.</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" className={dangerButton} disabled={blocked} onClick={() => void run(async () => { await sharedAccessRequest(uid, "removeMember", { spaceId: selected, memberUid: removing.uid }); setRemoving(null); setIssued(null); setCancelling(null); await Promise.all([refreshMembers(), refreshInvitations()]); setStatus("Access removed. All pending invitations for this space were invalidated."); })}>Confirm removal</button><button type="button" className={ghostButton} disabled={busy} onClick={() => setRemoving(null)}>Keep access</button></div></div>}
        </div>

        <div className="min-w-0 border-t border-border px-5 py-4 lg:border-t-0">
          <h3 className="text-sm font-bold" style={heading}>Invite someone</h3>
          <p className="mt-1 text-xs text-muted-foreground">Creates a one-time link for one email address. It expires after 48 hours.</p>
          <form className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={(event) => { event.preventDefault(); setIssued(null); void run(async () => { const recipient = email.trim(), learner = current?.learnerName ?? ""; const result = await sharedAccessRequest(uid, "createInvitation", { spaceId: selected, recipientEmail: recipient, role }); setIssued({ link: inviteLink(window.location.href, result.spaceId, result.token), email: recipient, role, learnerName: learner, expiresAt: result.expiresAt }); setEmail(""); await refreshInvitations(); setStatus("Invitation link created."); }); }}>
            <label className="text-sm font-medium">Invitee email<input className={`${field} mt-1`} value={email} type="email" required disabled={blocked} placeholder="name@example.com" onChange={(event) => { setEmail(event.target.value); setIssued(null); }} /></label>
            <label className="text-sm font-medium">Invitee role<select className={`${field} mt-1`} value={role} disabled={blocked} onChange={(event) => { setRole(event.target.value); setIssued(null); }}><option value="supervisor">Supervisor</option><option value="learner">Learner</option></select></label>
            <div className="sm:col-span-2"><button className={primaryButton} disabled={blocked || !selected}><Link2 size={15} aria-hidden="true" />Create invitation link</button></div>
          </form>
          {issued && <div className="mt-3 space-y-2 rounded-xl border border-[#0C7A8D]/30 bg-[#E4EFF2] p-4 text-sm text-[#095969]" role="region" aria-label="New invitation link">
            <p><strong>Send this link to {issued.email}</strong> yourself, by text, chat or email. It joins {issued.learnerName}’s space as a {issued.role}, works once, only for that email address, and expires {new Date(issued.expiresAt).toLocaleString()}. It can’t be shown again.</p>
            <label className="block font-medium">Link to send<input className={`${field} mt-1 bg-card text-xs`} style={mono} value={issued.link} readOnly onFocus={(event) => event.target.select()} /></label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primaryButton} onClick={async () => { try { await navigator.clipboard.writeText(issued.link); setStatus("Link copied."); } catch { setStatus("Couldn’t copy automatically. Select the link and copy it."); } }}><Copy size={15} aria-hidden="true" />Copy link</button>
              {typeof navigator.share === "function" && <button type="button" className={ghostButton} onClick={async () => { try { await navigator.share({ title: "DriveReady invitation", text: `Join ${issued.learnerName}’s learner space on DriveReady as a ${issued.role}. Sign in or create an account with ${issued.email}. The link works once and expires in 48 hours.`, url: issued.link }); } catch { /* closed or unavailable */ } }}><Share2 size={15} aria-hidden="true" />Share…</button>}
              <button type="button" className={ghostButton} onClick={() => setIssued(null)}>Done</button>
            </div>
          </div>}

          <div className="mt-5 flex items-center justify-between gap-2"><h3 className="text-sm font-bold" style={heading}>Pending invitations</h3><button type="button" className={ghostButton} disabled={busy || disabled || !verified} onClick={() => void refreshInvitations()}>Refresh invitations</button></div>
          <p className="mt-1 text-xs text-muted-foreground">Not yet accepted, cancelled or expired. Links can’t be shown again; cancel a lost one and create a new one.</p>
          {invitationError && <p role="status" className="mt-2 text-sm text-red-800">Could not load invitations. Refresh or try loading more again.</p>}
          {!invitationError && invitations.length === 0 && <p className="mt-2 text-sm text-muted-foreground">None.</p>}
          <ul aria-label="Pending invitations" className="mt-2 divide-y divide-border">{invitations.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1"><p className="truncate text-sm">{item.recipientEmail}<span className="sr-only"> · </span></p><p className="mt-0.5 flex flex-wrap items-center gap-2"><RoleBadge role={item.role} /><span className="text-xs text-muted-foreground">expires {new Date(item.expiresAt).toLocaleString()}</span></p></div>
            <button type="button" className={ghostButton} disabled={blocked} aria-label={`Cancel invitation for ${item.recipientEmail}`} onClick={() => setCancelling(item)}>Cancel</button>
          </li>)}</ul>
          {invitationCursor && <button type="button" className={`${ghostButton} mt-2`} disabled={busy || disabled || !verified || invitationsLoading} onClick={() => void loadMoreInvitations()}>{invitationsLoading ? "Loading invitations…" : "Load more invitations"}</button>}
          {cancelling && <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p>Cancel the {cancelling.role} invitation for {cancelling.recipientEmail}? This will prevent its acceptance.</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" className={dangerButton} disabled={blocked} onClick={() => void run(async () => { await sharedAccessRequest(uid, "cancelInvitationById", { spaceId: selected, invitationId: cancelling.id }); setCancelling(null); setIssued(null); await refreshInvitations(); setStatus("Invitation cancelled."); })}>Confirm cancellation</button><button type="button" className={ghostButton} disabled={busy} onClick={() => setCancelling(null)}>Keep invitation</button></div></div>}
        </div>
      </div>
    </Card>}

    {current && <Card className="border-red-200" aria-label="Delete learner space">
      <div className="px-5 py-4 text-sm">
        <h3 className="text-sm font-bold text-red-800" style={heading}>Delete {current.learnerName}’s space</h3>
        <p className="mt-1 text-muted-foreground">Permanently deletes all of {current.learnerName}’s drives, routes, notes and invitations, and removes everyone’s access. This can’t be undone. Print or save the practice log first if you want to keep a record.</p>
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); if (confirmDelete.trim() !== current.learnerName) return; const name = current.learnerName; void run(async () => { await sharedAccessRequest(uid, "deleteSpace", { spaceId: current.id, confirmName: confirmDelete.trim() }); setConfirmDelete(""); await refresh(); if (alive.current) setStatus(`${name}’s space was deleted.`); }); }}>
          <label className="min-w-0 basis-full text-sm sm:basis-auto">Type <strong>{current.learnerName}</strong> to confirm<input className={`${field} mt-1 sm:w-64`} value={confirmDelete} autoComplete="off" disabled={blocked} onChange={(event) => setConfirmDelete(event.target.value)} /></label>
          <button className={dangerButton} disabled={blocked || confirmDelete.trim() !== current.learnerName}>Delete learner space</button>
        </form>
      </div>
    </Card>}
    </div>}
  </section>;
}
