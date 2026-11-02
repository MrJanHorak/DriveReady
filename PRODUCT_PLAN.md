# DriveReady product plan

Working plan, updated November 2, 2026. This captures the product vision and the user's current direction; details still marked as decisions are not a fixed specification. The selected first pilot is the Augusta, Georgia area.

## Vision

Help US families build confident, capable drivers through flexible practice, approachable guidance, and shared local knowledge. DriveReady should be useful to a supervisor who is new to an area or unsure how to teach, while leaving families free to choose their own pace and priorities.

The product is a toolkit, not a required lesson-by-lesson curriculum. A welcoming “Where to start” experience helps families take the first step and remains available whenever they need direction. Progress means both time behind the wheel and exposure to a range of skills, roads, and conditions; the app does not certify a learner as safe or ready to drive.

## Core journey

1. A managing supervisor creates a learner's practice space and can invite specific trusted adults; relationships may include parents, guardians, relatives, or other supervisors.
2. The learner can sign in to view routes, progress, and shared notes. The managing supervisor controls invitations; detailed permissions are still to be decided.
3. The learner and supervisor find an existing shared route or plan a route of their own, using skills and location to help choose.
4. After the drive, a supervisor records its duration, route, skills, conditions, notes, and the supervisor who was present. Identity of the supervisor present is reported by the user, not independently verified.
5. The learner and supervisors review practice and decide what to try or repeat next. Later, the learner can also receive feedback and access theory lessons.
6. Community members can submit routes, vote them up or down, and report routes for review with a reason. Route-use counts can show how often routes were logged, not whether they are safe.

## Product principles

- **Encourage, don't judge.** Support conversation and practice; avoid claiming to assess driving safety from a checklist or sensor reading.
- **Guide without prescribing.** Offer clear starting suggestions and allow families to make their own choices.
- **Make trust visible.** Distinguish official, sourced state requirements from community observations and indicate when information was reviewed.
- **Design for privacy.** Make access and sharing understandable, particularly for minors, location history, and learner reflections.
- **Keep the road first.** Learners should not have to interact with a phone while driving.
- **Build for web and mobile.** Use shared domain concepts and backend interfaces while adapting each experience to its setting.

## Phase 1: A useful family toolkit on the web

**Outcome:** A supervisor and learner can return to a shared practice space, discover or create a route, log a drive, and review their saved practice.

Proposed capabilities:

- Supervisor-managed learner spaces, learner sign-in, and invitations for specific trusted adults. Avoid assuming all supervisors have the same family relationship. Decide exactly who can invite, view, record, edit, or remove information before implementing permissions.
- An optional “Where to start” flow, with suggestions tailored to experience and location and a clear way to explore independently.
- A flexible catalog of skills, driving environments, conditions, and short learning tips.
- Manual drive logs containing date, duration, day/night, skills and conditions practiced, route information, notes, and the supervisor reported as present. Support editing and correcting entries. Define how route-use counts respond to edits and repeated logs.
- A progress view calculated from logs, showing total and night hours as well as skills and conditions practiced. It should distinguish exposure from proficiency and make repetition possible.
- Route discovery and creation are central to the pilot. Start in the Augusta area, potentially with seeded routes, and allow community submissions. Use a location the user provides, or device location with permission, to find nearby routes; allow a wider search and useful filters. Provide up/down voting and reporting with reasons. Define moderation, abuse controls, reporting response, and whether and when to temporarily hide reported routes before public contributions go live.
- The current drive-log route description and external map preview are an interim solution. Revisit route creation with an interactive map and a way to choose and save actual locations and paths; the current experience has not yet met the desired vision.
- Basic guidance can support the pilot; broader feedback, theory lessons, and any community-contributed advice are later work. Distinguish product-provided material from community contributions and decide how each is reviewed.
- State information only where sourced and reviewed, with source links and review dates. Show clearly when a state or requirement is not yet covered; do not infer compliance from incomplete information.
- Mobile-first, responsive and accessible web experience: planning should also work on a computer. Test phone use before assuming a native app, offline navigation, or automatic trip recording is needed. Make privacy and access controls clear.

**First milestone:** Build a complete vertical slice for a supervisor-managed learner space: find or create a real saved route, record a drive against it, and let the learner review the route and notes. Extend the existing single-supervisor storage model to support authorized members before enabling shared access. Add public submissions and community feedback with moderation safeguards before presenting them as working features.

**Phase 1 is successful when:** A learner and their authorized supervisors can retrieve a shared practice space, use a saved route, and review a logged drive and its notes. Route contributions and feedback must be real if shown as available. Community routes and popularity must not be presented as verified or as a safety guarantee.

## Phase 2: Learner participation and learning

**Outcome:** A learner can prepare, reflect, and take ownership of progress alongside their supervisor.

- Expand the learner's initial access to support more independent preparation and participation, subject to agreed permissions.
- Provide short, approachable tips and optional learning activities tied to practical skills; explore community-contributed tips with review and attribution.
- Allow learner and supervisor reflections, with visibility and sharing rules decided before implementation.
- Decide whether learner accounts can suggest or submit routes and how supervisors participate in those actions.
- Design invitations, permissions, family changes, and privacy controls around the needs of minors and their families.

## Phase 3: Phone-assisted drives

**Outcome:** Make it easier to capture a practice session without distracting the learner, building on the initial mobile-friendly website.

- Evaluate whether a native mobile app adds enough value beyond the initial mobile web experience.
- Explore a drive timer and optional GPS recording, with explicit controls for consent, access, retention, and deletion. A supervisor or passenger should operate the app.
- Evaluate navigation through Google Maps, Apple Maps, or an integrated map. Test whether a practice route's required roads and waypoints survive handoff or recalculation before selecting an approach.
- Research and test whether speed or sudden-braking observations are reliable and useful. Present any supported observations as context for reflection, not automatic mistakes or a safety score; a rapid slowdown may be appropriate.
- Consider sensor limitations, battery use, offline behavior, and permission changes during real-world design and testing.

## State requirements and community trust

State rules should be expanded state by state using authoritative sources, with an owner and review process. Community members may suggest information or flag changes, but community submissions should not automatically become verified requirements. Decide how to represent age, permit, timing, and other eligibility factors before calculating any status.

Community routes and tips need reporting, moderation, and a way to flag outdated or unsafe information. Consider when a route was last reviewed and whether it is appropriate for a particular learner or current conditions. Do not present community popularity or a difficulty label as a guarantee of safety.

## Decisions to make next

1. **Accounts and access:** How are learner accounts created and connected, and what can learners, the managing supervisor, and invited supervisors view or change? How are invitations, lost access, removal, and changing the managing supervisor handled?
2. **Routes:** What route editing and mapping experience is needed first? Are new routes private, shared with the learner's space, or public by default? Can learners submit or vote?
3. **Moderation:** Who reviews reports, what reasons are available, and when should a reported route be temporarily hidden? How are voting abuse, appeals, and outdated routes handled?
4. **Route-use counts:** What qualifies as a logged use, how should edits or deleted logs affect the count, and what should be shown publicly without identifying a learner or revealing a trip?
5. **Learning and notes:** Which notes are visible to the learner and invited supervisors, and what feedback and theory content should follow the initial release? Who authors and reviews learning content?
6. **Privacy and operations:** How will data deletion, retention, access to accounts belonging to minors, backups, recovery, and support work before real family data is used?
7. **Launch and geography:** Anyone may sign up; define the practical rollout and initial Augusta seed coverage. Decide location precision and discovery radius without exposing homes or routines.

The proposed role model, invitation boundaries, and migration requirements are documented in [SHARED_ACCESS_DESIGN.md](SHARED_ACCESS_DESIGN.md). Invited supervisors should see the full practice history; learners should initially view shared notes and progress, with their own writing added later.

## Engineering starting point

The current Figma-derived web interface is a prototype with sample routes. A Firebase development project supports an early single-supervisor cloud workspace, but learner sign-in, invitations, shared practice spaces, persistent routes, community voting, and reporting are not implemented. Do not infer that these features are ready from the plan. See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) and [SECURITY_REVIEW.md](SECURITY_REVIEW.md) for current implementation and security work; [PROJECT_STATUS.md](PROJECT_STATUS.md) is an earlier dated assessment. Preserve the prototype as a design reference while replacing simulated actions with real behavior.
