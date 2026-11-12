# Firebase development plan

Updated November 11, 2026.

Firebase Authentication and Cloud Firestore have been selected for DriveReady. A dedicated development project, `driveready-dev-jh-261102` (DriveReady Development), is configured with a registered web app, email/password sign-in, and a default Firestore Standard database in `us-east1`. The rules in this repository were deployed to that development project on November 2, 2026. This project is for synthetic test data; no production project has been configured by this repository.

## Current status

DriveReady now has two modes:

- **Shared learner spaces** (the direction of the product). They run in the local demo (`npm run demo:shared`, see [README.md](README.md#run-the-shared-demo-recommended)), which seeds verified emulator accounts, a road-following route and tagged drives and never touches the development project. They also run against a real project once the shared service (`server/main.mjs`) is hosted and `VITE_SHARED_API_URL` is set; [DEPLOYMENT.md](DEPLOYMENT.md) has the steps. Clients only read shared data; the service performs all writes with the Admin SDK.
- **Single-supervisor workspace** (described below). This is what `npm run dev` shows when `VITE_SHARED_API_URL` is not set. It will be retired once shared mode runs on the development project.

Before using shared mode on the development project, redeploy the rules in this repository (`firebase deploy --only firestore:rules --project <project-id>`). They add read-only access for active members of a space. The rules last deployed on November 2, 2026 may predate them.

With Firebase configuration, practice records require sign-in and the app opens the account-scoped cloud workspace automatically. It reads from Firestore and can create learners and create or edit logs; writes use transactions, and conflicting edits are rejected. Cloud reads require a connection and changes from another device require a manual refresh. Signing out removes account records from the displayed workspace. The former browser-local workspace is no longer shown or offered as a storage mode; existing browser data is not automatically copied or deleted and remains accessible to someone with access to that browser profile outside this UI.

The account panel can download a cloud backup using fresh server reads. A backup in the existing JSON format can be reviewed and explicitly copied into a cloud account. Cloud copying adds missing records, skips identical records, and reports conflicts without overwriting them; it is not a full replacement. The original file remains unchanged. Learners and drives are read separately, so concurrent edits can produce a backup containing data from different moments. Files contain readable personal information and locations. The cloud-copy screen accepts files up to 5 MB; larger exports are still downloaded with a warning and need another recovery method.

The development rules are deployed; local changes require a deliberate redeployment. Emulator tests cover owner isolation for document and collection reads, well-formed cross-account writes, atomic rejection of mixed-access batches, document fields and types, real calendar dates, Unicode whitespace names, learner references, location bounds, and stale edits. A live SDK smoke test verified private reads and writes, cross-account denial, and sign-out; a live Chrome test verified sign-in, saving, reload, and cloud backup. These tests used temporary synthetic accounts and records that were removed afterward. Emulator browser tests also cover local and cloud switching, interrupted imports, competing edits, and selected connectivity failures. These tests exercise specific inputs and failure timings, not every possible attack or failure. The rules and client validation still need independent review before use with real family data.

Cloud writes have stricter limits than the existing backup parser, including field lengths, at most three route stops and eight practice tags, valid dates, and a UTC timestamp for a location. Cloud route links must use HTTPS with a standard domain and no custom port; local records can still retain other valid HTTPS links. Import preflight identifies the affected learner or drive and field for many cloud-limit failures before copying. An interrupted import can leave earlier records copied and can be retried without overwriting existing records.

## Intended first model

- A supervisor authenticates with Firebase Authentication.
- A supervisor's initial private records live under `users/{uid}/learners/{learnerId}` and `users/{uid}/drives/{driveId}`. Store records separately so edits do not overwrite a whole household or hit Firestore's single-document size limit.
- The first version is single-supervisor only. Family invitations, learner access, community routes, and sharing require an explicit membership model and separate authorization rules before being enabled.
- [SHARED_ACCESS_DESIGN.md](SHARED_ACCESS_DESIGN.md) describes the learner-centred membership model. Its read-only rules, trusted service and screens are implemented and tested. The service can be hosted ([DEPLOYMENT.md](DEPLOYMENT.md)) but has not been deployed. The `users/{uid}` rules do not grant shared access.
- Do not silently copy or delete older browser-local records. A selected backup file can be reviewed and copied into the account; it does not overwrite conflicting records.
- Design for failed or pending writes, multi-device conflicts, logout, backup/export, and privacy of location history. Do not report a change as saved until the appropriate persistence result is known.

## Next implementation steps

1. The Firebase web SDK is installed. This workspace's ignored `.env.development.local` targets the development project when running `npm run dev`; it is not included in production builds. Add `VITE_SHARED_API_URL` there to use a hosted shared service. For emulator tests use a `demo-` project ID and set `VITE_FIREBASE_USE_EMULATORS=true`; never use emulator mode for a real project. A separate production configuration and project have not been created.
2. Run `npm run test:rules`, `npm run test:firebase`, `npm run test:shared`, and `npm run test:browser` with Firebase CLI and Java 21+ installed. Browser tests use installed Google Chrome, local emulators, and synthetic records. If an older Java is found first on `PATH`, see [Java on Windows](README.md#java-on-windows). Review the rules and reconcile cloud validation with local backup and import validation before production.
3. Account-scoped cloud editing uses explicit mode selection, server-confirmed writes, and conflict checks. If a save fails or its outcome is uncertain, the form remains visible and cloud writes are blocked until the user refreshes and checks the server copy; refreshing closes the form. A browser close warning is best effort and cannot prevent a crash or forced close.
4. The early import preview preserves local data, skips identical records, and reports collisions. Browser tests cover a server rejection and a simulated offline transition after an earlier record was copied. Expand diagnostics for malformed backup data and continue checking parity between rules and client validation.
5. Obtain independent security and privacy review, decide production backup and recovery, and create a separate production project only when ready. Verify region and billing settings for that project. Email/password signup is enabled in the development project; keep real family data out of it.

See [SECURITY_REVIEW.md](SECURITY_REVIEW.md) for the internal review, open pilot blockers, and the Firestore gRPC dependency override.

The checked-in `firebase.json` configures local emulator ports, email/password authentication, and the rules; it does not select a default project. Supply a project ID explicitly for all deployment commands. The opt-in `npm run test:live:dev` test creates a temporary account and records in the named development project and deletes those test resources using the signed-in Firebase CLI. It requires Chrome, network access, and sufficient project permissions. `scripts/firebase-dev-smoke.mjs` runs the corresponding SDK access check and cleans up only the synthetic user path created by that run.

Reference: [Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure), [Firestore rules and authentication](https://firebase.google.com/docs/firestore/security/rules-conditions).
