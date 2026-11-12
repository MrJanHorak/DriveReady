# DriveReady project status

Updated November 11, 2026. This replaces the November 1 assessment. The pilot area is Augusta, Georgia; all data so far is fictional.

## Where things stand

The product has converged on **shared learner spaces**: one space per learner, managed by a supervisor, with invited supervisors and the learner as members. In this model the phase 1 milestone from [PRODUCT_PLAN.md](PRODUCT_PLAN.md) works end to end: find or create a real mapped route, record a drive against it, and let the learner review the route and notes.

| Area | State |
| --- | --- |
| Visual design | Restored to the original Figma style through shared building blocks in `src/app/design.tsx`: Figma sidebar and header, card dashboard, colour-coded skill chips, progress ring. |
| Dashboard | Hours toward Georgia's 40 hours (6 at night), recent drives, skill and condition coverage with a suggestion of something new to try, and saved routes, per learner. |
| Routes | Leaflet map drawing, OSRM road snapping (required before saving), and a split view of the saved-routes list beside a large map. Routes are private to a learner's space. |
| Driving logs | Drives must use a mapped route and record skills and conditions; edits keep attribution and detect conflicting changes, and saves can be retried safely. |
| People & access | Create spaces, issue one-time invitations, accept, cancel, remove members. Invitations are shared manually. |
| Shared service | `server/sharedAccess.mjs` behind one HTTP handler. It runs as the local demo gateway or as a deployable server (`server/main.mjs`) with origin allow-listing, rate limiting and request logs that record no content. **Not yet deployed.** |
| Single-supervisor workspace | Still what `npm run dev` shows when no shared service is configured. To be retired once the shared service is hosted. |
| State requirements | Sourced Georgia DDS overview; no eligibility calculation; no other states. |

All automated suites pass as of this update: unit tests, rules, single-supervisor emulator and browser tests, shared service and browser tests (including the dashboard and the deployable server), and the production build.

## How to run it

- **Everything, locally, no setup:** `npm run demo:shared` (see [README.md](README.md)).
- **Against the development Firebase project:** host the shared service and set `VITE_SHARED_API_URL` (see [DEPLOYMENT.md](DEPLOYMENT.md)).

## Next steps

1. **Host the shared service** on the development project (Railway is ready via `railway.json`), deploy the current rules, and point `npm run dev` at it.
2. **Retire the single-supervisor path:** once shared mode runs on the development project, remove `users/{uid}` records from the rules and code, along with the design-preview route explorer, the unused `components/ui` kit and unused dependencies. The development data is fictional, so no migration is needed.
3. **Add type checking and CI:** add a `tsconfig.json` and a GitHub Actions workflow running `npm test`, the emulator suites and the build.
4. **Make logging easier:** a drive timer for the passenger, automatic night minutes from sunset times, and a printable practice log.
5. **Before real families:** privacy notice, data and account deletion, a reviewed routing and tile provider, invitation delivery, and independent security review ([SECURITY_REVIEW.md](SECURITY_REVIEW.md)).

## Known limits

- Totals on the dashboard cover up to 1,000 drives per learner; the logs page loads 50 at a time.
- Rate limiting is per service instance and in memory.
- Public OSRM and OpenStreetMap services are for light testing only.
- Learners cannot yet write notes or submit routes; community routes, voting and moderation are not built.
