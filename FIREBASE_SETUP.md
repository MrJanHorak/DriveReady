# Firebase setup

Updated November 12, 2026.

DriveReady uses Firebase Authentication (email and password) and Cloud Firestore. The development project is `driveready-dev-jh-261102` (DriveReady Development), with a registered web app and a Firestore Standard database in `us-east1`. It holds fictional data only. No production project exists yet.

## How the app uses Firebase

- **Sign-in:** the browser signs in with Firebase Auth. Adding a learner or accepting an invitation needs a verified email, which users verify from the **Account** page.
- **Reads:** the browser reads shared data directly from Firestore, limited by `firestore.rules`: a member reads their own learner spaces, and a manager also lists members.
- **Writes:** every change goes through the shared service (`server/sharedAccess.mjs`, hosted as `server/main.mjs`). It checks the caller's ID token and membership, then writes with the Admin SDK. Browsers cannot write anything.

Data layout (opaque IDs, no names or emails in paths):

```text
spaces/{spaceId}                    learner name, manager, invitation version
spaces/{spaceId}/members/{uid}      role (manager, supervisor, learner) and active flag
spaces/{spaceId}/invitations/{id}   hashed one-time invitations (service only)
spaces/{spaceId}/routes/{routeId}   name, start, destination, points, road line
spaces/{spaceId}/drives/{driveId}   date, minutes, night minutes, skills, conditions, notes, route snapshot
spaces/{spaceId}/driveEditOperations/{id}  retry markers for edits (service only)
users/{uid}/spaceLinks/{spaceId}    discovery index; grants nothing by itself
```

See [SHARED_ACCESS_DESIGN.md](SHARED_ACCESS_DESIGN.md) for roles and permissions.

## Web app settings

`npm run dev` reads `.env.development.local`; a deployed build (for example on Vercel) reads the host's environment variables. See [.env.example](.env.example):

| Variable | Value |
| --- | --- |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | From Firebase console → Project settings → Your apps |
| `VITE_SHARED_API_URL` | The hosted shared service, e.g. your Railway address ([DEPLOYMENT.md](DEPLOYMENT.md)) |

Optional map settings are described under [Map and routing providers](#map-and-routing-providers).

These values are built into the browser code; they are not secrets. The service-account key used by the service is a secret and belongs only in the service host's variables.

For a deployed web app, add its domain under Authentication → Settings → **Authorized domains**.

## Map and routing providers

By default the maps use the public OpenStreetMap tiles and **Follow roads** uses the public OSRM demo server. Both are for light testing only. To switch, set these web app variables (in `.env.development.local` or on Vercel) and rebuild:

| Variable | Value |
| --- | --- |
| `VITE_ROUTING_URL` | Base address of an OSRM-compatible routing server, for example a self-hosted OSRM (`https://osrm.your-domain.com`). It may include a path and query string, such as an API key, which are kept on every request. https only, except `localhost`/`127.0.0.1`. The app calls `<base>/route/v1/driving/<points>`. An invalid value turns road snapping off with a message instead of falling back to the demo. |
| `VITE_MAP_TILE_URL` | A tile template such as `https://tiles.provider.com/{z}/{x}/{y}.png` (include the provider's key if it needs one). |
| `VITE_MAP_TILE_ATTRIBUTION` | The credit line your tile provider requires, as plain text. Without it, OpenStreetMap is credited. |

Anything in these variables, API keys included, is visible in the browser. Use keys the provider lets you restrict to your site's domain. When a custom provider is set, the Privacy page names it generically ("the provider configured for this site"); update the notice if you want it named.

Choosing a provider for a pilot is still open: compare a self-hosted OSRM (free software, but you run and update the server and map data) with a hosted service that offers an OSRM-compatible API, and check each one's terms, privacy and pricing.

## Rules

Deploy rule changes explicitly, always naming the project:

```sh
firebase deploy --only firestore:rules --project driveready-dev-jh-261102
```

Since November 12, 2026 the rules no longer allow the retired single-supervisor records (`users/{uid}/learners`, `users/{uid}/drives`). Any test data left there stays in the database but nothing can read or change it from the app. Delete it in the Firebase console if you want it gone.

## Emulators and tests

The Firebase CLI and Java 21+ are needed for the emulator-based commands (see the README for Java on Windows). `firebase.json` configures the Auth (9099), Firestore (8080) and Emulator UI (4000) ports, and selects no default project. Emulator runs always use the `demo-driveready` project, so they never touch a real one:

- `npm run demo:shared` runs the full app locally with fictional seeded accounts.
- `npm run test:rules` runs the security rules tests.
- `npm run test:shared` runs the service, gateway and deployable-server tests.
- `npm run test:browser` runs the app in Chrome.

## Before real family data

A production project needs to be separate from development, with reviewed IAM, billing and usage controls, region, backups and recovery, and data deletion and retention. See [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

References: [Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure), [Firestore security rules](https://firebase.google.com/docs/firestore/security/rules-conditions).
