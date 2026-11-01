# DriveReady project status

Assessment of the workspace, November 1, 2026. Augusta, Georgia has been selected as the first pilot area. This is a working assessment, not an agreed product specification.

## Product hypothesis

DriveReady appears intended to help families or other supervisors guide learner drivers through supervised practice: choose appropriate routes and skills, record sessions, and understand progress toward state licensing requirements. Community-created routes could help people discover practice opportunities nearby.

## What exists

- A React, Vite, and Tailwind desktop-oriented interface, based on a Figma export.
- Learner creation and manual drive logs, including edits and per-learner day/night totals, stored locally in the current browser.
- A Georgia requirements overview linking to DDS resources; it does not determine eligibility and other states are not yet covered.
- A route explorer with sample routes, search and filters, a diagrammatic map, selection, zoom, and temporary favorites.
- A three-step route creation interface with waypoint drawing, skills, difficulty, and safety fields. Its publish action only closes the wizard.
- A successful local `npm run build` on November 1, 2026. This verifies compilation, not complete functionality or correctness.

## Gaps and risks to resolve

- **Real workflows and data:** Learner profiles and drive logs persist only in this browser; there is no backend, sync, or backup. Route and community data remain examples.
- **Navigation and controls:** The route explorer remains a design preview, and some visible actions have no behavior, including Use Route. Search matches route title, neighborhood, or skill rather than the advertised ZIP code or school search.
- **Maps and sharing:** Maps and waypoints are SVG illustrations, not geographic routes or navigation. Publishing does not save or share data, and favorites are temporary.
- **Trust and safety:** Sample route and safety descriptions should not be treated as real-world guidance. The Georgia overview links to authoritative sources, but a sustained update process and further review are needed before any eligibility calculations. Community publishing would also need a safety and moderation approach.
- **Product fit:** The mock references both Atlanta and the Augusta area and uses a fixed date. Responsive/mobile behavior and accessibility need assessment; the current interface uses fixed desktop-oriented dimensions.
- **Engineering foundation:** Much of the original route prototype remains in `src/app/App.tsx`. Basic family-data tests are available, but lint and TypeScript checking are not yet configured. The workspace is a Git repository.

## Decisions to make together

1. Who is the primary user: a parent or supervisor, a learner, a driving instructor, or several roles?
2. What is the first end-to-end outcome: recording hours, finding and planning practice, or something else?
3. Which locations and licensing jurisdictions should the first release serve?
4. Should routes be private, shared within a family, or community-published? What level of map and navigation is expected?
5. Is the intended experience desktop web, mobile web, a mobile app, or a combination?
6. What existing designs, requirements, data, or previous work should inform the product?

Once those choices are clear, agree on a small first usable workflow and its data, privacy, safety, and verification needs before selecting infrastructure or implementing the rest.
