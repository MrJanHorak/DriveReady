# DriveReady product plan

Working plan, November 1, 2026. This captures the product vision and a proposed sequence; it is not a fixed specification. The selected first pilot is the Augusta, Georgia area.

## Vision

Help US families build confident, capable drivers through flexible practice, approachable guidance, and shared local knowledge. DriveReady should be useful to a supervisor who is new to an area or unsure how to teach, while leaving families free to choose their own pace and priorities.

The product is a toolkit, not a required lesson-by-lesson curriculum. A welcoming “Where to start” experience helps families take the first step and remains available whenever they need direction. Progress means both time behind the wheel and exposure to a range of skills, roads, and conditions; the app does not certify a learner as safe or ready to drive.

## Core journey

1. A supervisor creates a family space and a learner profile.
2. “Where to start” suggests a few appropriate skills, tips, and next actions based on the learner's experience and location.
3. The family selects a skill and finds or plans a suitable practice route.
4. After the drive, the supervisor records its duration, skills, conditions, and reflections, including the learner's input if they wish.
5. The family reviews hours and the breadth of practice, then chooses what to try or repeat next.
6. Supervisors contribute routes and practical tips that help other families, subject to product safeguards.

## Product principles

- **Encourage, don't judge.** Support conversation and practice; avoid claiming to assess driving safety from a checklist or sensor reading.
- **Guide without prescribing.** Offer clear starting suggestions and allow families to make their own choices.
- **Make trust visible.** Distinguish official, sourced state requirements from community observations and indicate when information was reviewed.
- **Design for privacy.** Make access and sharing understandable, particularly for minors, location history, and learner reflections.
- **Keep the road first.** Learners should not have to interact with a phone while driving.
- **Build for web and mobile.** Use shared domain concepts and backend interfaces while adapting each experience to its setting.

## Phase 1: A useful family toolkit on the web

**Outcome:** A supervisor can set up a learner, find a practice idea, record a real drive, and return later to see accurate progress.

Proposed capabilities:

- Supervisor-managed family and learner profiles, with persistent data.
- An optional “Where to start” flow, with suggestions tailored to experience and location and a clear way to explore independently.
- A flexible catalog of skills, driving environments, conditions, and short learning tips.
- Manual drive logs containing date, duration, day/night, skills and conditions practiced, optional route, and notes. Support editing and correcting entries.
- A progress view calculated from logs, showing total and night hours as well as skills and conditions practiced. It should distinguish exposure from proficiency and make repetition possible.
- Location-aware route discovery: use a location the family provides, or their device location with permission, to show nearby routes first. Let them adjust the area or search elsewhere and clearly show the route's location and approximate distance. When nearby results are scarce, explain that and offer a wider search rather than silently presenting distant routes as local. Combine proximity with skill, difficulty, and other filters. Supervisors can create and share routes; decide how routes are reviewed before enabling public contributions.
- The current drive-log route description and external map preview are an interim solution. Revisit route creation with an interactive map and a way to choose and save actual locations and paths; the current experience has not yet met the desired vision.
- An initial learning-tip collection, with a clear distinction between product-provided and community-contributed advice. Start with a manageable contribution and review process.
- State information only where sourced and reviewed, with source links and review dates. Show clearly when a state or requirement is not yet covered; do not infer compliance from incomplete information.
- Responsive, accessible web experience and clear privacy and data controls appropriate to the chosen account model.

**First milestone:** Implement the smallest complete vertical slice—create a learner, record and edit a drive, and see progress calculated from saved data. Add route and tip discovery to that foundation, then enable contributions when the trust and moderation approach is ready. Details, order, and scope should be confirmed before development.

**Phase 1 is successful when:** A family can complete the core journey with real saved data, retrieve it in a later session, and understand which routes, tips, and requirements are community-contributed or verified. No progress, publication, or compliance claim should be simulated as real.

## Phase 2: Learner participation and learning

**Outcome:** A learner can prepare, reflect, and take ownership of progress alongside their supervisor.

- Offer optional invited learner access to their own progress and planned activities.
- Provide short, approachable tips and optional learning activities tied to practical skills; explore community-contributed tips with review and attribution.
- Allow learner and supervisor reflections, with visibility and sharing rules decided before implementation.
- Keep route creation and public publishing limited to authorized supervisors; define how learner suggestions, if any, reach a supervisor.
- Design invitations, permissions, family changes, and privacy controls around the needs of minors and their families.

## Phase 3: Phone-assisted drives

**Outcome:** Make it easier to capture a practice session without distracting the learner.

- Introduce a mobile experience using the same family, learner, route, and log data as the web app.
- Explore a drive timer and optional GPS recording, with explicit controls for consent, access, retention, and deletion. A supervisor or passenger should operate the app.
- Evaluate navigation through Google Maps, Apple Maps, or an integrated map. Test whether a practice route's required roads and waypoints survive handoff or recalculation before selecting an approach.
- Research and test whether speed or sudden-braking observations are reliable and useful. Present any supported observations as context for reflection, not automatic mistakes or a safety score; a rapid slowdown may be appropriate.
- Consider sensor limitations, battery use, offline behavior, and permission changes during real-world design and testing.

## State requirements and community trust

State rules should be expanded state by state using authoritative sources, with an owner and review process. Community members may suggest information or flag changes, but community submissions should not automatically become verified requirements. Decide how to represent age, permit, timing, and other eligibility factors before calculating any status.

Community routes and tips need reporting, moderation, and a way to flag outdated or unsafe information. Consider when a route was last reviewed and whether it is appropriate for a particular learner or current conditions. Do not present community popularity or a difficulty label as a guarantee of safety.

## Decisions to make next

1. **Pilot:** Augusta, Georgia is the selected initial area; define the scope and participants for validation.
2. **Audience:** Are parents and guardians the only initial supervisors, or should other trusted adults and instructors be supported from the start?
3. **Accounts and privacy:** What family access, invitation, data deletion, and sharing controls are needed for the first release?
4. **Routes:** How should supervisors create routes initially, and should a new route be private by default, shared with a family, or eligible for public review?
5. **Learning tips:** Who can submit them, who reviews them, and how should sources, author attribution, and updates work?
6. **Progress:** Which skills and conditions matter most initially, and what constitutes a useful record without implying a formal competency assessment?
7. **Learner reflections:** In phase 2, should they be shared with the supervisor automatically, private, or individually shareable?
8. **Launch:** Is the near-term target a personal family prototype, a small invited pilot, or a public service?
9. **Local discovery:** What default search radius feels useful, particularly in rural areas, and should it vary with the number of nearby routes? How precise a starting location can be shown publicly without exposing a family's home or routine?

## Engineering starting point

The current Figma-derived web interface is a prototype with sample data. See [PROJECT_STATUS.md](PROJECT_STATUS.md) for its current gaps and [README.md](README.md) for local setup. Before choosing providers or building broad features, define the first end-to-end workflow and data model, establish version control and appropriate automated checks, and decide on the initial hosting and privacy requirements. Preserve the existing prototype as a design reference while replacing simulated actions with real behavior.
