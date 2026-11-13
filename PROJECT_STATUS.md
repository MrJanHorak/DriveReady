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
| People & access | Spaces, one-time invitations shared by hand, removal. |
| Shared service | Deployed (`server/main.mjs`): origin allow-list, rate limit, request logs that record no content. |
| Code health | Unused Figma-export kit and about 50 unused dependencies removed; strict TypeScript check (`npm run typecheck`) passes. |
| State requirements | Sourced Georgia DDS overview; no eligibility calculation; no other states. |

All suites pass as of this update: unit (`npm test`), type check, rules, service (`npm run test:shared`), browser (`npm run test:browser`), and the production build.

## Next steps

1. **CI (added November 12):** `.github/workflows/ci.yml` runs every suite and the build on each push and pull request. Optionally require it through branch protection on `main`.
2. **Make logging easier:** a drive timer for the passenger, automatic night minutes from sunset times, and a printable practice log.
3. **Before real families:** privacy notice, data and account deletion, backups, a reviewed routing and tile provider, invitation delivery, and independent security review ([SECURITY_REVIEW.md](SECURITY_REVIEW.md)).
4. **Housekeeping:** choose a Railway plan before the trial ends. Optionally delete the retired `users/{uid}/learners` and `users/{uid}/drives` test records in the Firebase console.

## Known limits

- Dashboard totals cover up to 1,000 drives per learner; the logs page loads 50 at a time.
- Rate limiting is per service instance and in memory.
- Public OSRM and OpenStreetMap services are for light testing only.
- Learners cannot yet write notes or submit routes; community routes, voting and moderation are not built.
