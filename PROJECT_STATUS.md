# DriveReady project status

Updated November 12, 2026. The pilot area is Augusta, Georgia; all data so far is fictional.

## Where things stand

DriveReady is deployed for development: the web app on Vercel (https://drive-ready-ivory.vercel.app) and the shared service on Railway, against the `driveready-dev-jh-261102` Firebase project. A walkthrough on the live site with fictional data passed: sign-in, creating a learner, drawing and road-snapping a route, logging a drive with skills, and the dashboard update. The phase 1 milestone from [PRODUCT_PLAN.md](PRODUCT_PLAN.md) works end to end.

| Area | State |
| --- | --- |
| Data model | Shared learner spaces only. The single-supervisor workspace, its backup and import, and its rules were removed on November 12. |
| Visual design | Original Figma style through `src/app/design.tsx`; responsive from phone to desktop with no horizontal scrolling. |
| Dashboard | Hours toward Georgia's 40 (6 at night), recent drives, skill and condition coverage, saved routes, per learner. |
| Routes | Leaflet drawing, OSRM road snapping (required before saving), saved-route list beside a large map. |
| Driving logs | Drives use a mapped route and record skills, conditions and notes. Edits keep attribution and detect conflicts; retries are safe. New routes appear automatically. |
| Drive timer | Start, pause, resume, stop & log on the Dashboard and Driving Logs; fills the date and minutes; survives reloads; keeps the screen awake where supported. |
| Night minutes | Suggested from an optional start time, the drive length and the route's start point (sunrise/sunset within about a minute of reference values); filled in unless changed by hand. The drive form now has the Figma styling. Start times are not stored with drives. |
| Practice log | Printable one-learner log with totals, every drive and signature lines; prints or saves as PDF through the browser. Supervisor emails show for managers; others see "Supervisor". |
| Deletion | Drives, routes, leaving a space, deleting a whole space (manager, name confirmation), and deleting your own account (email and password confirmation; managers delete their spaces first); permanent. |
| Privacy notice | In-app plain-language page (not a reviewed policy); linked from sign-in. The contact address is a placeholder (`src/app/contact.js`). |
| Learner contributions | Learners suggest routes (the managing supervisor approves or declines them before they can be used) and add reflections to drives (November 13). |
| Community library | Managers share approved routes (the whole route as drawn, no names or start/end text; the manager confirms on a map preview that it starts and ends at public places); signed-in families browse, filter by skill and save them; reports go to moderators (`MODERATOR_EMAILS`), who remove or dismiss (November 13). |
| Community reviews | Saved/practised/driven counts, star ratings and a community difficulty (Beginner to Expert) from families who drove the route, anonymous tips with reporting (November 13). |
| People & access | Figma-styled page (November 13): learner spaces, joining with a link, and a manage card per learner with people, invitation links (copy or share; the invitee reviews and joins in one tap), pending invitations, removal and space deletion. |
| Shared service | Deployed (`server/main.mjs`): origin allow-list, rate limit, request logs that record no content. |
| Code health | Unused Figma-export kit and about 50 unused dependencies removed; strict TypeScript check (`npm run typecheck`) passes. |
| State requirements | Sourced Georgia DDS overview; no eligibility calculation; no other states. |

All suites pass as of this update: unit (`npm test`), type check, rules, service (`npm run test:shared`), browser (`npm run test:browser`), and the production build.

## Next steps

1. **CI (added November 12):** `.github/workflows/ci.yml` runs every suite and the build on each push and pull request. Optionally require it through branch protection on `main`.
2. **Make logging easier:** done (November 13): drive timer, night-minute suggestions and the printable practice log.
3. **Community library:** built (November 13). Reviews, counts and community difficulty added the same day. Next ideas: seeded Augusta routes, moderator email alerts, and letting learners ask their manager to share a route.
4. **Before real families:** privacy notice and in-app deletion done (November 13). Account deletion done (November 13). Routing and tile providers are now configurable (`VITE_ROUTING_URL`, `VITE_MAP_TILE_URL`, `VITE_MAP_TILE_ATTRIBUTION`). Remaining: a real privacy inbox to replace the placeholder, backups (plan and commands in [OPERATIONS.md](OPERATIONS.md)), choosing a routing and tile provider, invitation emails (links work today; sending them for you needs a mail provider), and independent security review ([SECURITY_REVIEW.md](SECURITY_REVIEW.md)).
5. **Housekeeping:** choose a Railway plan before the trial ends. Optionally delete the retired `users/{uid}/learners` and `users/{uid}/drives` test records in the Firebase console.

## Known limits

- Dashboard totals cover up to 1,000 drives per learner; the logs page loads 50 at a time.
- Rate limiting is per service instance and in memory.
- Public OSRM and OpenStreetMap services are for light testing only.
- Moderators must open the Community page to see new reports (no alerts). Sorting and filtering apply to the routes loaded so far (24 at a time).
