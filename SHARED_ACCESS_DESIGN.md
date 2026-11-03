# Shared learner space: proposed access design

Working design, November 2, 2026. A local, read-only Firestore rules foundation and an emulator-only shared-space prototype are implemented and tested for the paths below. The prototype can create and list spaces, create, review, and accept test invitations, and let a manager review and remove members. Client writes remain denied, and neither the service nor these rules has been deployed. The normal application and existing development project still use single-supervisor records under `users/{uid}`. Use synthetic data only until security and privacy review is complete.

## Product requirements

- Each learner has a practice space managed by a supervisor. A person can participate in more than one space, with a separate role in each.
- A managing supervisor can invite specific trusted adults, including relatives, guardians, or instructors. Relationships are descriptive labels, not proof of identity or legal status.
- Invited supervisors can see the learner's full earlier drive history and shared notes. An invited supervisor can log a trip and identify which supervisor was present; this attribution is user-reported, not independently verified.
- The learner has their own login and can see routes, shared notes, and progress. For the first version the learner views notes and progress; creating their own notes comes later. Feedback and theory lessons are future capabilities.
- Anyone may sign up. Signup alone does not grant access to a learner's space. Public route contributions, voting, reporting, and moderation are a separate design and must not expose private history.

## More than one learner

A managing supervisor can manage separate spaces for two, three, or more learners at the same time, whether they are twins, different ages, relatives, or unrelated people. The model has no fixed two-learner limit; the eventual dashboard and service must be tested for usable performance with larger numbers. The proposed experience is a single dashboard listing each learner the signed-in person is authorized to access, with a clear way to choose the active learner. Each learner has their own account, routes in their space, practice history, notes, and progress. Their records are not combined simply because they share a supervisor.

The manager may invite the same adult to both spaces, or different adults to each. Each invitation and membership is scoped to the selected learner; an invitation to one space does not automatically grant access to another. A future convenience flow could let the manager select multiple learners in one invitation, but it must show and confirm the access granted to each. Each learner sees only spaces to which that learner's account has been explicitly granted access, unless a separate sharing policy is later designed.

Multiple learners may select the same community route. A drive belongs to the learner who drove, so recording practice for one learner must not automatically add hours or a trip to another learner's history. A supervisor can record a separate drive for each learner when appropriate. Public route-use counts, if implemented, need separately defined aggregation and must not expose who drove or link siblings' activity.

## Proposed first permission model

These are implementation defaults derived from the requirements. The detailed write and membership policies below should be reviewed before implementation.

| Action | Managing supervisor | Invited supervisor | Learner |
| --- | --- | --- | --- |
| View learner profile, shared routes, full drive history, shared notes and progress | Yes | Yes | Yes |
| Create a drive and identify the supervisor reported present | Yes | Yes | No |
| Edit a drive | Yes | Proposed: their own entries only | No |
| Create or edit a route within this space | Proposed: yes | Proposed: yes | View only initially |
| Invite or remove a member | Yes | No | No |
| Change another person's role or transfer management | Not in first implementation; recovery/transfer needs a separate process | No | No |
| Delete a space, learner account, or historical records | Not enabled until deletion and retention behavior is designed | No | No |

Drive notes are shared with all active space members in this model; there is no private-note feature. A user interface must state that before a supervisor enters notes. Whether an invited supervisor may edit any member's drive, and whether learners may help create routes, remain product decisions. If a drive is edited by another authorized person, preserve both who recorded it and who last edited it; identify the person reported present separately.

## Data boundaries

The following paths illustrate a proposed Firestore structure, not a finalized schema:

```text
spaces/{spaceId}                         # one learner space and its state
spaces/{spaceId}/members/{uid}           # server-controlled role and active status
spaces/{spaceId}/drives/{driveId}        # private drive and shared notes
spaces/{spaceId}/routes/{routeId}        # space-private route or reference
users/{uid}/spaceLinks/{spaceId}          # server-maintained discovery index only
```

- Use opaque IDs for spaces and records; do not put a name, email, or location in a path. The learner profile belongs to one space; a manager with multiple learners has separate spaces and memberships.
- `members/{uid}` is the authorization source. A `spaceLinks` record only helps the app discover spaces: it never grants permission by itself. Clients must not create or change their own memberships, roles, or discovery links.
- The local rules currently let active members read the space, its drives and routes, and their own membership; only a manager can list memberships. They deny all shared-space client writes. The local trusted-service prototype and screen create memberships, invitations, and basic drive records for emulator tests, but production-ready field schemas and a reviewed participant display are still missing.
- Every private read and write must be checked against the **current active membership for that space**. Rules must deny unknown paths and fields, verify allowed record shapes, and enforce write permissions independently of the UI. Signed-out, unrelated, removed, expired, or improperly scoped identities must be denied.
- A drive stores `recordedByUid`, `lastEditedByUid`, and `supervisorPresentUid` as distinct concepts. The backend or rules must bind the recording and editing actor to the authenticated account, and verify that a supervisor reported present is an eligible member at the time. Do not call this verified attendance. Preserve historical attribution if a member is later removed without preserving their access.
- Do not place public route data, votes, reports, or popularity counts inside a learner's private space. Public route publication must be an explicit operation with its own policy and moderation controls. Route-use aggregates must not reveal learner IDs, supervisor IDs, individual trips, precise private locations, or timestamps.
- Avoid duplicating private notes, exact locations, or membership lists in the discovery index. Only expose a space's display information to a signed-in member with a legitimate need to see it.

## Invitations and revocation

Proposed lifecycle: the managing supervisor creates an invitation for one specific intended recipient and role; the recipient signs in or creates an account, reviews the invitation, and explicitly accepts. The service then activates membership for that exact account and creates its discovery link. Pending invitations grant no space access.

Membership and invitation creation, acceptance, cancellation, and removal require a trusted server-side component. It must authenticate the caller, check the current managing supervisor, validate the intended recipient and role, enforce expiration and one-time acceptance, and make the membership change and index update atomic. Firestore rules must deny direct client attempts to create or promote memberships or bypass acceptance. Trusted server code bypasses Firestore rules, so it needs its own authorization checks, limited credentials, logging that excludes private notes and invitation secrets, and independent review.

Do not use an email address typed into the UI alone as proof that the intended person controls the account. Specify and test how verified account identity and invitation delivery work before building the flow, including account recovery and protections against replay, forwarding, enumeration, and expired or revoked invitations. No invitation emails are sent by this design.

### Local prototype status

`server/sharedAccess.mjs` contains trusted server-side logic, exercised only through the Auth and Firestore emulators by `npm run test:shared`. It verifies Firebase ID tokens and current account status, requires verified matching email addresses, creates a manager's learner space and discovery link atomically, and issues one-time 48-hour invitations using random tokens whose hashes—not raw tokens—are stored. A verified intended recipient can preview the learner name, role, and expiry without gaining access; acceptance rechecks the invitation. A manager can cancel a pending invitation or remove a member. Removal deactivates membership, removes the discovery link, and invalidates **all pending invitations in that space** atomically, including invitations addressed to a member's changed email. Other pending invitees must be re-invited; this conservative behavior needs clear UI before use. A learner slot remains associated with the same learner account after removal; transferring it is not implemented. Expiry is checked using the server clock when the transaction runs.

`server/localSharedGateway.mjs` provides a local-only HTTP handler for emulator tests. It refuses to initialize without the expected local emulators and demo project, checks for a loopback connection and a specific local origin, accepts identity tokens only in the authorization header, limits request size, and returns generic errors. `npm run test:shared:browser` starts the emulators, a temporary loopback gateway, and a specially configured local app to exercise the UI with fictional accounts. The prototype UI is gated to this demo configuration and is absent from the normal application. No invitation messages are sent. These checks are not a production gateway, and the handler has no production rate limiting or operational controls.

The local manager screen lists active members for the selected space and requires a confirmation before removal. It explains that removal invalidates all pending invitations and cannot recall already downloaded data. Member records include the verified email at the time of joining to help identify people; this is a historical label and may no longer match their current account email. Earlier emulator records without that field show an account identifier instead. Membership records are readable only by the member or the manager under the local rules; listing the collection requires manager access.

The manager can also list and cancel individual unexpired, current-version pending invitations through the emulator-only service. The list does not expose recoverable invitation codes; its identifiers are token hashes and do not grant access. The service checks manager access for both listing and cancellation. A pending invitation may still be ineligible for acceptance, for example if its intended account is already a member. The local list processes 25 pending records per page and reads one more to detect a next page, so a page can contain fewer visible invitations or none when records have expired or been invalidated. The manager can load further pages; refreshing restarts the list. Pages are not a frozen snapshot, so refresh after concurrent changes. Production pagination, limits, indexing and cleanup still need review. Acceptance and cancellation use transactions so only one can succeed. No invitation messages are sent.

The prototype has no deployed endpoint, invitation delivery, full invitation management UI, production rate limiting, account-age or guardian-status verification, or recovery/transfer process. The account screen can request a verification email only when the user explicitly clicks the button and can refresh verification status. It does not yet enforce verification for the existing single-supervisor cloud workspace. A production endpoint must independently enforce authentication and authorization, protect invitation secrets and logs, limit abuse, and be independently reviewed. All membership removals must use the service's atomic invalidation mechanism; an administrative change that only flips the membership flag would not invalidate invitations. Verified email proves control of that email account, not a person's age, identity, or authority over a learner. Emulator tests do not send real messages. The Admin SDK is a development dependency at this stage; a production service needs its own deployment configuration and dependency review.

The local service can create a minimal shared drive with date, total and night minutes, and shared notes. Both the person recording it and the supervisor reported present must be active supervisors in that exact space; the actor is taken from the verified account rather than the request. The local screen currently records the signed-in supervisor as the person reported present. The reported supervisor is a claim, not verified attendance. Existing members, including the learner, can read the record under the local rules. The local history loads up to 50 drives at a time and totals only loaded records, explicitly indicating when more exist. Pages are not a frozen snapshot, so refresh after concurrent changes; production-scale complete totals need further design. A caller-supplied random operation ID makes an identical retry idempotent; reusing it with different fields is rejected. A retry still requires current authorization and an active reported supervisor. The screen keeps the operation ID and submitted values for retry after an uncertain outcome only while the page remains open; it warns users to review history before re-entering a drive after leaving. Durable recovery is needed before production. The test prototype limits a drive to 1,440 minutes, a provisional validation choice to review for the product. Drive editing, deletion, mapped paths, migration, and production readiness remain unimplemented.

When a manager removes a member, change the authoritative membership so new server reads and writes are denied, and remove the discovery link. End active listeners and clear the space from the app as soon as access loss is observed. Removal cannot recall data already downloaded, screenshots, backups, or offline copies; explain that limitation to the manager. Define how and when removal, transfer of management, learner account recovery, and account or data deletion work before a real-data pilot.

The emulator prototype also supports space-private route descriptions with a name, start, and destination. Active supervisors can create them through the local service; all active members can read them. Creates use an operation ID for safe identical retries. The saved list and practice selector load routes in pages of 50; they are not a frozen snapshot and should be refreshed after concurrent changes. Refreshing the selector clears its selection. The descriptions are not geographic paths or navigation. A supervisor may optionally select a route from the same learner's space when recording a drive; the service validates the association and saves a snapshot of its description with the drive. Existing drives without routes remain readable. Routes cannot yet be edited. Retry details are held only while the page remains open. These behaviors need further design and review before real data or deployment.

## Migration from current single-supervisor data

Migration is a separate, explicit action after the new model is implemented and reviewed. Do not automatically migrate or delete browser-local or cloud records.

1. Inventory the source account's learners and drives and offer a private backup. Review the mapping: one proposed space per learner, with that learner's drives assigned to it and the source supervisor as manager. Do not create memberships for anyone else.
2. Before copying, deploy and verify a server-controlled migration lock in the **legacy** rules so older clients cannot continue writing that account during the snapshot and copy. Hiding controls in the new UI is insufficient. Reject stale or queued writes safely and tell users what happened.
3. Use a trusted, authenticated migration service with a per-account operation ID and durable per-record progress. Preserve source IDs or a stable mapping; copy in resumable batches without overwriting conflicting destination records. Keep spaces inaccessible to invitees while migration is incomplete.
4. Verify record counts, IDs, learner-to-drive relationships, field values, and representative totals against the locked source. A partial run must be retryable without duplication. Report mismatches and conflicts for review rather than silently resolving them.
5. Only after verification, make the new spaces available to the managing supervisor. Preserve the old cloud records and local copy until a separately approved retention and rollback plan is in place. Define how rollback, source unlock, and writes made after cutover are reconciled; do not promise a lossless rollback without it.

This migration design is not implemented. The current import flow is not a shared-space migration service and must not be reused as though it provided locking or atomic cutover.

## Required checks before enabling shared access

- Test manager, invited supervisor, learner, unrelated signed-in user, and signed-out user against every read and write, including cross-space paths, collection queries, batches, forged roles and actor IDs, and unsupported paths.
- Test invitation acceptance by the intended recipient, the wrong account, replay, expiry, revocation, simultaneous acceptance, and a manager losing permission while an invitation is pending. Test removing a member during reads, writes, open sessions, and device reconnects.
- Test learner read-only permissions, full history for invited supervisors, notes visibility, actor versus reported-supervisor attribution, and changing or removing the reported supervisor.
- Test multi-learner managers, different invited supervisors per learner, each learner's isolation from the others' private history, a person with different roles in different spaces, stale clients and simultaneous edits, interrupted migration, retries, collisions, locked source writes, verification, and rollback. Local tests cover a read-only four-learner case and a three-space invitation flow; a production dashboard and membership service remain to be implemented.
- Test exports, recovery, and deletion separately from authorization. Verify that public route data and aggregated counts cannot reveal private trip details.
- Review rules and trusted service authorization independently, then test with synthetic accounts in the development project before considering production or real family data.
