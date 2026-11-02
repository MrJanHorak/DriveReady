# Firebase development plan

Firebase Authentication and Cloud Firestore have been selected for DriveReady. The user plans to create a new Firebase/Google Cloud project later. No cloud project, authentication provider, database, billing account, or deployed security rules has been configured by this repository.

## Current status

With Firebase configuration and sign-in, a supervisor can explicitly choose browser-local or account-scoped cloud records. The cloud workspace reads from Firestore and can create learners and create or edit logs; writes use transactions, and conflicting edits are rejected. Existing local records can be copied explicitly without deleting the originals or overwriting conflicting records. Switching modes closes an open form. Cloud reads require a connection and changes from another device require a manual refresh. Signing out returns to local mode; local data is still present on that device.

`firestore.rules` is not deployed. Local emulator tests cover owner isolation, document fields and types, learner references, and stale edits. Browser tests cover account creation and sign-in, local and cloud mode switching, import and retry after an injected failure, reload, sign-out, competing edits, and an injected rejected save. They also check that navigation and sign-out are disabled while a cloud operation is pending. The rules add validation but do not fully validate every semantic detail (for example, whether a date is a real calendar date). Do not use this early integration for real family data before further security and data validation review.

Cloud writes have stricter limits than the existing backup parser, including field lengths, at most three route stops and eight practice tags, and a UTC timestamp for a location. The import preview checks these limits before copying; older local records outside them must be corrected first. An interrupted import can leave earlier records copied and can be retried without overwriting existing records. Record-specific errors are still needed.

## Intended first model

- A supervisor authenticates with Firebase Authentication.
- A supervisor's initial private records live under `users/{uid}/learners/{learnerId}` and `users/{uid}/drives/{driveId}`. Store records separately so edits do not overwrite a whole household or hit Firestore's single-document size limit.
- The first version is single-supervisor only. Family invitations, learner access, community routes, and sharing require an explicit membership model and separate authorization rules before being enabled.
- Do not silently copy browser-local records to the cloud. Provide an explicit review and import flow that preserves the original records and handles existing cloud data and repeated imports safely.
- Design for failed or pending writes, multi-device conflicts, logout, backup/export, and privacy of location history. Do not report a change as saved until the appropriate persistence result is known.

## Next implementation steps

1. The Firebase web SDK and optional configuration are installed. Copy `.env.example` to `.env.local` and supply a Firebase web app configuration when ready. For emulators use a `demo-` project ID and set `VITE_FIREBASE_USE_EMULATORS=true`; this requires running local Auth and Firestore emulators. Never use emulator mode for a real project.
2. Run `npm run test:rules`, `npm run test:firebase`, and `npm run test:browser` with Firebase CLI and Java 21+ installed. Browser tests use installed Google Chrome, local emulators, and synthetic records. On this machine, Android Studio's bundled Java 25 can be put first in `PATH` for these commands. Review the rules and reconcile cloud validation with local backup and import validation before production.
3. Account-scoped cloud editing uses explicit mode selection, server-confirmed writes, and conflict checks. Expand testing to real network loss and browser or tab closure during operations; a pending request may have an uncertain outcome.
4. The early import preview preserves local data, skips identical records, and reports collisions. The browser test injects a server rejection after the first record; real connection interruptions and record-specific validation errors still need work.
5. Create a Firebase project and web app when the user is ready, configure Authentication and Firestore, and deploy reviewed rules. Use separate development and production projects and review billing and region settings.

The checked-in `firebase.json` configures local emulator ports and points to the proposed rules; it does not select a real project. A demo project ID should be supplied explicitly during local testing. Do not deploy with a demo ID or assume the rules have been tested merely because the configuration exists.

Reference: [Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure), [Firestore rules and authentication](https://firebase.google.com/docs/firestore/security/rules-conditions).
