import { useCallback, useEffect, useRef, useState } from "react";
import { readSharedMembers, readSharedSpaces, sharedAccessRequest } from "./sharedAccessEmulator";
import SharedPracticeEmulator from "./SharedPracticeEmulator";
import SharedRoutesEmulator from "./SharedRoutesEmulator";

type Space = { id: string; learnerName: string; role: string };
type Preview = { learnerName: string; role: string; expiresAt: number };
type Member = { uid: string; role: string; email: string };
type Invitation = { id: string; recipientEmail: string; role: string; expiresAt: number };
const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50";

export default function SharedSpacesEmulator({ uid, verified, disabled, onBusyChange }: { uid: string; verified: boolean; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
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
  const [issued, setIssued] = useState<{ spaceId: string; token: string } | null>(null);
  const [joinSpace, setJoinSpace] = useState("");
  const [joinToken, setJoinToken] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const memberGeneration = useRef(0);
  const invitationGeneration = useRef(0);
  const invitationLoading = useRef(false);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current += 1; memberGeneration.current += 1; invitationGeneration.current += 1; onBusyChange(false); }; }, [onBusyChange]);
  useEffect(() => { setIssued(null); setRemoving(null); setCancelling(null); }, [selected]);
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
      setSpaces([]); setSelected(""); setStatus("Could not load shared spaces. Check the local emulators and refresh.");
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
  return <section className="mt-4 rounded-xl border border-dashed border-[#0C7A8D] bg-[#E4EFF2]/40 p-4">
    <h3 className="font-semibold">Shared spaces · local emulator only</h3>
    <p className="mt-1 text-sm text-muted-foreground">This test is separate from existing records. No invitation messages are sent. Use fictional data only.</p>
    {!verified && <p className="mt-2 text-sm">Verify your email in the emulator to use this test.</p>}
    {status && <p role="status" className="mt-2 text-sm">{status}</p>}
    <div className="mt-3 flex items-center gap-2"><button type="button" disabled={busy || disabled || !verified} className={button} onClick={() => { setStatus(""); void refresh(); void refreshMembers(); void refreshInvitations(); }}>Refresh spaces</button><span className="text-sm">{spaces.length} {spaces.length === 1 ? "space" : "spaces"}</span></div>
    {spaces.length > 0 && <ul className="mt-2 space-y-1 text-sm" aria-label="Shared spaces">{spaces.map((space) => <li key={space.id}>{space.learnerName} · {space.role}</li>)}</ul>}
    <SharedPracticeEmulator uid={uid} spaces={spaces} blocked={blocked} run={run} />
    <SharedRoutesEmulator uid={uid} spaces={spaces} blocked={blocked} run={run} />
    <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void run(async () => { await sharedAccessRequest(uid, "createSpace", { learnerName: learnerName.trim() }); setLearnerName(""); const loaded = await refresh(); setStatus(loaded ? "Learner space created." : "Learner space created, but the list could not refresh."); }); }}>
      <label className="text-sm">Learner name for shared space<input className={`${field} mt-1`} value={learnerName} maxLength={60} required disabled={blocked} onChange={(event) => setLearnerName(event.target.value)} /></label><button className={button} disabled={blocked}>Create shared space</button>
    </form>
    {spaces.some((space) => space.role === "manager") && <form className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); setIssued(null); void run(async () => { const result = await sharedAccessRequest(uid, "createInvitation", { spaceId: selected, recipientEmail: email.trim(), role }); setIssued(result); await refreshInvitations(); setStatus("Invitation created for this emulator test."); }); }}>
      <label className="text-sm">Learner space<select className={`${field} mt-1`} value={selected} disabled={blocked} onChange={(event) => { setSelected(event.target.value); setIssued(null); }}>{spaces.filter((space) => space.role === "manager").map((space) => <option value={space.id} key={space.id}>{space.learnerName}</option>)}</select></label>
      <label className="text-sm">Invitee email<input className={`${field} mt-1`} value={email} type="email" required disabled={blocked} onChange={(event) => { setEmail(event.target.value); setIssued(null); }} /></label>
      <label className="text-sm">Invitee role<select className={`${field} mt-1`} value={role} disabled={blocked} onChange={(event) => { setRole(event.target.value); setIssued(null); }}><option value="supervisor">Supervisor</option><option value="learner">Learner</option></select></label>
      <div className="flex items-end"><button className={button} disabled={blocked || !selected}>Create test invitation</button></div>
    </form>}
    {selected && <div className="mt-4 rounded-lg bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">People with access</h4><button type="button" className={button} disabled={busy || disabled || !verified} onClick={() => void refreshMembers()}>Refresh people</button></div>
      <p className="mt-1 text-muted-foreground">Emails shown are from when each person joined and may have changed.</p>
      {membersError && <p role="status">Could not load people. Refresh and try again.</p>}
      <ul aria-label="People with access" className="mt-2 space-y-2">{members.map((member) => <li key={member.uid} className="flex flex-wrap items-center gap-2"><span>{member.email || `Account ${member.uid}`} · {member.role}</span>{member.role !== "manager" && <button type="button" className={button} disabled={blocked} onClick={() => setRemoving(member)}>Remove {member.email || member.uid}</button>}</li>)}</ul>
      {removing && <div className="mt-3 rounded-lg border border-amber-400 p-3"><p>Remove {removing.email || removing.uid} from this learner’s space? They will lose access, and all pending invitations for this space will be invalidated. Other invitees will need a new invitation. Previously downloaded information cannot be recalled.</p><div className="mt-2 flex gap-2"><button type="button" className={button} disabled={blocked} onClick={() => void run(async () => { await sharedAccessRequest(uid, "removeMember", { spaceId: selected, memberUid: removing.uid }); setRemoving(null); setIssued(null); setCancelling(null); await Promise.all([refreshMembers(), refreshInvitations()]); setStatus("Access removed. All pending invitations for this space were invalidated."); })}>Confirm removal</button><button type="button" className={button} disabled={busy} onClick={() => setRemoving(null)}>Keep access</button></div></div>}
    </div>}
    {selected && <div className="mt-4 rounded-lg bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">Pending invitations</h4><button type="button" className={button} disabled={busy || disabled || !verified} onClick={() => void refreshInvitations()}>Refresh invitations</button></div>
      <p className="mt-1 text-muted-foreground">These invitations have not expired or been cancelled. An invitation may still be ineligible for acceptance. Test codes cannot be recovered here. Refresh to see recent changes.</p>
      {invitationError && <p role="status">Could not load invitations. Refresh or try loading more again.</p>}
      <ul aria-label="Pending invitations" className="mt-2 space-y-2">{invitations.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-2"><span>{item.recipientEmail} · {item.role} · expires {new Date(item.expiresAt).toLocaleString()}</span><button type="button" className={button} disabled={blocked} onClick={() => setCancelling(item)}>Cancel invitation for {item.recipientEmail}</button></li>)}</ul>
      {invitationCursor && <button type="button" className={`${button} mt-2`} disabled={busy || disabled || !verified || invitationsLoading} onClick={() => void loadMoreInvitations()}>{invitationsLoading ? "Loading invitations…" : "Load more invitations"}</button>}
      {cancelling && <div className="mt-3 rounded-lg border border-amber-400 p-3"><p>Cancel the {cancelling.role} invitation for {cancelling.recipientEmail}? This will prevent its acceptance.</p><div className="mt-2 flex gap-2"><button type="button" className={button} disabled={blocked} onClick={() => void run(async () => { await sharedAccessRequest(uid, "cancelInvitationById", { spaceId: selected, invitationId: cancelling.id }); setCancelling(null); setIssued(null); await refreshInvitations(); setStatus("Invitation cancelled."); })}>Confirm cancellation</button><button type="button" className={button} disabled={busy} onClick={() => setCancelling(null)}>Keep invitation</button></div></div>}
    </div>}
    {issued && <div className="mt-3 space-y-2 rounded-lg bg-card p-3 text-sm"><p>Share these test values privately. This code grants an invitation to the intended verified account; no message was sent.</p><label className="block">Invitation space ID<input className={`${field} mt-1`} value={issued.spaceId} readOnly /></label><label className="block">Invitation code to share<input className={`${field} mt-1`} value={issued.token} readOnly /></label></div>}
    <form className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); setPreview(null); void run(async () => { const result = await sharedAccessRequest(uid, "previewInvitation", { spaceId: joinSpace.trim(), token: joinToken.trim() }); setPreview(result); setStatus(""); }); }}>
      <label className="text-sm">Received space ID<input className={`${field} mt-1`} value={joinSpace} autoComplete="off" required disabled={blocked} onChange={(event) => { setJoinSpace(event.target.value); setPreview(null); }} /></label>
      <label className="text-sm">Received invitation code<input className={`${field} mt-1`} type="password" value={joinToken} autoComplete="off" required disabled={blocked} onChange={(event) => { setJoinToken(event.target.value); setPreview(null); }} /></label>
      <div><button className={button} disabled={blocked}>Review invitation</button></div>
    </form>
    {preview && <div className="mt-3 rounded-lg bg-card p-3 text-sm"><p>Invitation to {preview.learnerName}’s space as {preview.role}. Access begins only after acceptance.</p><div className="mt-2 flex gap-2"><button type="button" className={button} disabled={blocked} onClick={() => void run(async () => { await sharedAccessRequest(uid, "acceptInvitation", { spaceId: joinSpace.trim(), token: joinToken.trim() }); setPreview(null); setJoinToken(""); setJoinSpace(""); const loaded = await refresh(); setStatus(loaded ? "Invitation accepted." : "Invitation accepted, but the list could not refresh."); })}>Accept invitation</button><button type="button" className={button} disabled={busy} onClick={() => setPreview(null)}>Cancel</button></div></div>}
  </section>;
}
