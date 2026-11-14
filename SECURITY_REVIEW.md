# DriveReady development security review

Internal review, November 2, 2026; hosted-service section added November 11, 2026; updated November 12, 2026. This is not an independent security assessment. The development Firebase project is intended for synthetic test data; no conclusion here authorizes a real-data pilot.

## Current protections

Updated November 12, 2026, after the single-supervisor workspace was removed. The app now uses only shared learner spaces.

- Firestore rules allow reads only: an active member reads their own learner space, its routes and drives, and their own membership; only a manager lists members. Everything else is denied, including the retired `users/{uid}/learners` and `users/{uid}/drives` records and any client write. Emulator tests cover members, removed members, invalid roles, outsiders, signed-out users, several learners per manager, and the retired paths (`tests/rules/firestore.rules.test.js`).
- All writes go through the shared service, which authorizes each request against the caller's verified, unrevoked ID token and current membership (see the hosted-service section below).
- The service was deployed on November 12, 2026 (Railway, development project only). A walkthrough on the deployed site with fictional data covered sign-in, creating a learner, saving a road-following route, logging a drive and the dashboard. Requests from other origins, without a token and with an invalid token were refused.
- The app labels itself a development preview and asks for fictional data.

## Findings to resolve before a real-data pilot

1. **Account and abuse controls:** email/password sign-up is open on the development project. The service requires a verified email for shared-space actions, but there is no production password, sign-up abuse or bot-protection policy. Invitations are one-time links the manager sends themselves, not delivered by the app. The code sits after `#` in the link, so browsers don't send it to the web host; the app moves it into the tab's session storage and removes it from the address bar and history on arrival. Anyone holding a link still needs the invited email's verified account to use it, but a forwarded link reveals the learner's name and role to whoever signs in with that account.
2. **Deletion and retention:** since November 13, 2026 members can delete drives and routes within their permissions, supervisors and learners can leave a space, and the manager can delete a learner's whole space (see SHARED_ACCESS_DESIGN.md). Deletion is permanent; there are no backups to restore from. People can also delete their own sign-in account in the app (after a fresh password check; managers delete their spaces first), which revokes their sessions, ends their memberships and removes their stored email from them. Still missing: a retention policy, and handling for the retired single-supervisor records, which remain in the development database until deleted in the console.
3. **Backups and recovery:** the earlier manual backup and import belonged to the single-supervisor workspace and was removed. There is no backup, export or tested recovery process for shared spaces.
4. **Privacy and access:** an in-app plain-language privacy notice (the **Privacy** page, November 13, 2026) describes what is stored, who can see it and which services are involved. It is not a reviewed privacy policy. Before real data, decide what to collect, how minors' accounts are created and supervised, retention, and handling on shared devices, and replace the placeholder privacy contact (`src/app/contact.js`) with a monitored inbox. Map tiles and road snapping send viewed areas and route points to third-party services. **Community library (November 13, 2026):** shared routes are visible to every verified account. The service strips identifying fields and trims about 300 m from each end, but a public name or description could still identify a family, and a trimmed line can hint at a neighbourhood. Publishing is live without prior review; reports and moderator removal are the safeguards, and moderators get no alerts yet.
5. **Production operations:** no production Firebase project, incident process, monitoring or reviewed access policy exists. Keep development and production separate and review IAM, billing and usage controls, rules deployment and recovery before launch.
6. **Independent review:** the rules, service, application flows and production configuration still need review by someone independent of this implementation. Tests and this document are evidence for that review, not a substitute for it.

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

The npm audit on November 2, 2026 reported no known production-dependency vulnerabilities after removing unused React Router, updating Vite and other build dependencies, and overriding Firestore's gRPC dependency to `1.14.7`. Adding the Admin SDK for the local membership prototype introduced six moderate advisories in development-only transitive dependencies; `npm audit fix` did not resolve them, and testing the available 13.x Admin release produced more advisories. The newer Admin version was retained. As of November 11, 2026 `firebase-admin` is a runtime dependency because the hosted service uses it.

On November 12, 2026 the unused Figma-export dependencies were removed (MUI, Emotion, Radix UI and about 45 others), `firebase-admin` was updated to 14.5.1, and `npm audit fix` resolved the `fast-xml-parser` advisory. Six moderate advisories remain, all in one chain inside Google's Firestore client: `@google-cloud/firestore-api` → `google-gax` 5 → `rimraf` → `glob` → `minimatch`, plus `gaxios` and `gcp-metadata` through the same `google-gax`. `npm audit fix` cannot update them without breaking that pinned chain. They are file-cleanup and metadata utilities that request data does not reach. Recheck when `firebase-admin` or `@google-cloud/firestore` release updates, rather than forcing overrides.

The gRPC advisory applies to particular server-side certificate-authentication configurations; this project uses Firestore as a client and does not implement the described gRPC server configuration. See the [gRPC maintainer advisory](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j).

The gRPC override is outside the version range declared by the current Firebase Firestore package. Emulator integration and a live development SDK smoke test passed with it, but this is not a vendor compatibility guarantee. Revisit the override when Firebase updates its dependency and rerun the emulator, browser and live development tests after dependency changes. Audit results are a point-in-time signal, not proof that the application is secure.
