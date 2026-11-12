# DriveReady development security review

Internal review, November 2, 2026; hosted-service section added November 11, 2026. This is not an independent security assessment. The development Firebase project is intended for synthetic test data; no conclusion here authorizes a real-data pilot.

## Current protections

- Firestore rules restrict learner and drive reads and writes to the matching authenticated user ID, validate record fields and reject deletion, unsupported paths, and moving a drive to another learner. Emulator tests cover cross-account document and collection access and mixed-authority batch writes.
- The cloud workspace requires explicit selection and server-confirmed writes. Conflict and uncertain-save handling require a refresh before another cloud write. Local and cloud copies are separate.
- The app labels the account and cloud workspace as a development preview and asks for fictional data. Downloaded backups are readable files; the UI warns users to store them privately. Cloud backup reads are not a single atomic snapshot.
- A live smoke test with synthetic accounts checked sign-in, private reads and writes, cross-account denial, and cleanup. A live browser test checked saving, reload and export. These tests do not cover every failure or attack.

## Findings to resolve before a real-data pilot

1. **Account and abuse controls:** Email/password signup is enabled on the development project. The account screen can request an email verification and refresh its status, but the existing single-supervisor cloud workspace does not require verification. The shared-space service checks verified identity and can now be hosted (`server/main.mjs`), but it has not been deployed. The app does not yet implement invitation enrollment or a production password and abuse-prevention policy. Configure and verify server-side enforcement; hiding a button alone is not an access control.
2. **Deletion and retention:** Firestore rules currently deny deletion, and the app has no end-user cloud data or account deletion flow. Decide retention, deletion and recovery requirements, including how learner, drive, account, backup and local-browser copies are handled, before collecting real data.
3. **Backups and recovery:** Backups require an explicit download; there is no operator-managed backup or tested production recovery process. Cloud exports read learners and drives separately. Backups up to 5 MB can be reviewed and copied into the cloud without overwriting conflicts. Files over 5 MB download with a warning but cannot be restored through the current UI. Earlier browser-local copies remain on devices even though the app no longer shows them; their secure removal and recovery need a separate user-controlled process. Decide and test an appropriate production recovery approach.
4. **Privacy and access:** Records can contain learner information, notes and locations. Define the data to collect, who can access it, handling for shared devices and exports, retention, and the user-facing privacy notice. The initial model is a single supervisor; invitations and learner access need a separately designed authorization model.
5. **Production operations:** No production Firebase project, environment, incident process, operational monitoring or reviewed access policy is configured. Keep development and production separate and review IAM, billing and usage controls, rules deployment and recovery procedures before launch.
6. **Independent review:** The rules, application flows and proposed production configuration still require review by someone independent of this implementation. Local tests and this document are evidence for that review, not a substitute for it.

## Hosted shared service (November 11, 2026)

`server/main.mjs` makes the shared-space service deployable (see [DEPLOYMENT.md](DEPLOYMENT.md)). It uses the same handler as the local gateway, `server/sharedGateway.mjs`.

**Protections in place**

- Every write is authorized server-side against the caller's verified Firebase ID token (revocation is checked) and current membership. Client writes to shared data are denied by `firestore.rules`.
- Browser origins must match an exact allow-list. Only `localhost`/`127.0.0.1` may use http. Requests need a bearer token and a JSON body of at most 32 KB with only the expected string fields.
- Errors return a generic message. Request logs record method, known path, status and duration only, with no bodies, tokens, invitation codes, IP addresses or account IDs.
- Startup refuses `demo-` projects without emulators, emulator settings with a real project, a service-account key for another project, and non-https origins. The emulator mode needs an explicit `SHARED_SERVICE_ALLOW_EMULATORS=true` with a `demo-` project.
- A per-instance, in-memory rate limit (default 120 requests per minute per client address) applies. Behind a proxy, `TRUST_PROXY=true` uses the right-most `X-Forwarded-For` entry, the one added by the platform.
- Tests cover config validation, origin, method, body and token handling, rate limiting, and the entry point against the emulators (`server/config.test.mjs`, `server/sharedGateway.test.mjs`, `server/main.test.mjs`).

**Open items before relying on it**

1. **Service-account key handling:** the key grants full admin access. Store it only in the host's secret variables, limit who can read them, and rotate it if exposed. Prefer a Google Cloud runtime identity where possible. Consider a dedicated service account with only the Firestore and Auth permissions the service needs.
2. **Abuse controls:** rate limiting is per instance, resets on restart, and does not cover sign-up. Consider Firebase App Check, platform-level limits, and alerting before any public URL is shared widely.
3. **Monitoring and incident response:** the service has no alerting, error reporting or audit trail beyond host logs.
4. **Hosting review:** confirm TLS, region, log retention and who has access on the chosen host.
5. **Committed configuration archive:** a temporary source archive (`_dr_src.tgz`) committed on November 11, 2026 contained `.env.development.local`, which holds the development project's web app settings. It holds no passwords or service-account keys, and these values ship in any web build anyway. Remove the file from the repository. Consider restricting the development browser API key to the expected domains in Google Cloud Console. `.gitignore` now blocks archives and common service-account key file names.

## Dependency review

The npm audit on November 2, 2026 reported no known production-dependency vulnerabilities after removing unused React Router, updating Vite and other build dependencies, and overriding Firestore's gRPC dependency to `1.14.7`. Adding the Admin SDK for the local membership prototype introduced six moderate advisories in development-only transitive dependencies; `npm audit fix` did not resolve them, and testing the available 13.x Admin release produced more advisories. The newer Admin version was retained. As of November 11, 2026 `firebase-admin` is a runtime dependency because the hosted service uses it. On that date, `npm audit --omit=dev` reported 7 transitive advisories through it (1 low, 6 moderate: `fast-xml-parser`, `minimatch`, `glob`, `rimraf`, `gaxios`, `gcp-metadata`, `google-gax`). These are mostly file and metadata utilities rather than request handling, and `npm audit fix` offers non-breaking updates. Apply the updates, rerun all test suites, and record the result before deploying the service. The gRPC advisory applies to particular server-side certificate-authentication configurations; this project uses Firestore as a client and does not implement the described gRPC server configuration. See the [gRPC maintainer advisory](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j).

The gRPC override is outside the version range declared by the current Firebase Firestore package. Emulator integration and a live development SDK smoke test passed with it, but this is not a vendor compatibility guarantee. Revisit the override when Firebase updates its dependency and rerun the emulator, browser and live development tests after dependency changes. Audit results are a point-in-time signal, not proof that the application is secure.
