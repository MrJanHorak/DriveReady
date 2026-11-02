# Firebase development plan

Firebase Authentication and Cloud Firestore have been selected for DriveReady. The user plans to create a new Firebase/Google Cloud project later. No cloud project, authentication provider, database, billing account, or deployed security rules has been configured by this repository.

## Current status

The driving log continues to use browser-local storage. With Firebase configuration and sign-in, an early preview can read account record counts and explicitly copy existing local records to account-scoped Firestore documents. It does not sync later edits or allow cloud log editing. `firestore.rules` passed initial owner-isolation tests against the locally available Firestore emulator, but it is not deployed and does not yet validate data shapes. Do not use this preview for real family data before security and data validation are reviewed.

## Intended first model

- A supervisor authenticates with Firebase Authentication.
- A supervisor's initial private records live under `users/{uid}/learners/{learnerId}` and `users/{uid}/drives/{driveId}`. Store records separately so edits do not overwrite a whole household or hit Firestore's single-document size limit.
- The first version is single-supervisor only. Family invitations, learner access, community routes, and sharing require an explicit membership model and separate authorization rules before being enabled.
- Do not silently copy browser-local records to the cloud. Provide an explicit review and import flow that preserves the original records and handles existing cloud data and repeated imports safely.
- Design for failed or pending writes, multi-device conflicts, logout, backup/export, and privacy of location history. Do not report a change as saved until the appropriate persistence result is known.

## Next implementation steps

1. The Firebase web SDK and optional configuration are installed. Copy `.env.example` to `.env.local` and supply a Firebase web app configuration when ready. For emulators use a `demo-` project ID and set `VITE_FIREBASE_USE_EMULATORS=true`; this requires running local Auth and Firestore emulators. Never use emulator mode for a real project.
2. Run `npm run test:rules` with Firebase CLI and Java 21+ installed. Initial Firestore emulator tests cover owner isolation, conflicting writes, and safe repeat imports. Add Authentication emulator tests and extend rules to validate data shapes and write constraints before production.
3. Implement account-scoped cloud editing in the driving log. Make the storage mode and synchronization status visible, with explicit handling for offline and failed saves and changes on other devices.
4. The early import preview preserves local data, skips identical records, and reports collisions. Test complete user flows including interrupted imports, authentication changes, reloads, and multi-device behavior before using it with real data.
5. Create a Firebase project and web app when the user is ready, configure Authentication and Firestore, and deploy reviewed rules. Use separate development and production projects and review billing and region settings.

The checked-in `firebase.json` configures local emulator ports and points to the proposed rules; it does not select a real project. A demo project ID should be supplied explicitly during local testing. Do not deploy with a demo ID or assume the rules have been tested merely because the configuration exists.

Reference: [Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure), [Firestore rules and authentication](https://firebase.google.com/docs/firestore/security/rules-conditions).
