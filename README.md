# DriveReady

[![CI](https://github.com/MrJanHorak/DriveReady/actions/workflows/ci.yml/badge.svg)](https://github.com/MrJanHorak/DriveReady/actions/workflows/ci.yml)

DriveReady helps families and other supervisors guide learner drivers: plan practice routes on a map, log supervised drives with the skills and conditions practised, and track progress toward Georgia's supervised-driving hours. The first pilot area is Augusta, Georgia.

It is a working prototype. Use fictional data only: security and privacy review is still needed before real family data (see [SECURITY_REVIEW.md](SECURITY_REVIEW.md)). Logs are a personal record, not official certification, and DriveReady does not give legal or navigation guidance.

## What works today

- **Shared learner spaces.** A managing supervisor creates a space for each learner and invites other supervisors and the learner. Invitations are one-time links that you send yourself (**Copy link** or, on a phone, **Share…**); nothing is emailed. Opening the link takes the invitee to a review screen after they sign in, where one tap joins the space.
- **Dashboard** in the original Figma style: hours toward Georgia's 40 hours (6 at night), recent drives, skill and condition coverage with a suggestion of something new to try, and saved routes.
- **Routes:** draw a route on a Leaflet/OpenStreetMap map, snap it to roads (OSRM), review it, and save it to the learner's space. Saved routes appear in a list next to a large map.
- **Driving logs:** log a drive against a saved route, with date, minutes, night minutes, skills, road conditions and shared notes. Managers can correct any entry; supervisors can correct their own.
- **Drive timer:** the passenger starts it as the drive begins, pauses it for stops, and taps **Stop & log** to open the drive form with the date and minutes filled in. It survives reloads and a locked phone (kept in that browser), keeps the screen awake where supported, and clears once the drive is saved.
- **Night minutes:** give a drive a start time (the timer fills it in) and the form suggests how many minutes fell after sunset or before sunrise, at the route's start point or the Augusta area, and fills them in. Georgia DDS doesn't define "night", so the suggestion can always be changed.
- **Printable practice log:** **Print log** on Driving Logs previews a one-learner log (every drive in date order with route, duration, night minutes, skills, supervisor and notes; totals against Georgia's 40/6; signature lines) and prints it or saves it as PDF through the browser. It is a personal record, not an official DDS form.
- **Learners take part:** learners can suggest routes, which the managing supervisor approves (or declines with a reason) before anyone can log a drive on them, and can add their own reflection to each drive.
- **Community route library:** a managing supervisor can share an approved route with other DriveReady families. The public copy has no learner name and no start or destination text, and leaves out every part of the line within 400–600 m of its start, its end or any private place (home, school) the manager marks on a preview map before sharing. Signed-in families browse it on the **Community** page, filter by skill and community difficulty, sort by rating or popularity, save routes to their learner, and report problems. Each route shows how many families saved and practised it and how often it was driven; families who have driven it rate it (1–5 stars and a five-step difficulty from Beginner to Expert, averaged into a community difficulty) and leave short anonymous tips; moderators (set with `MODERATOR_EMAILS`) review reports.
- **Deleting and leaving:** delete drives and routes you're allowed to edit; supervisors and learners can leave a space; the managing supervisor can delete a learner's whole space after typing the learner's name. Anyone can delete their own account under **Account** after confirming their email and password; managers delete their learner spaces first.
- **Privacy notice:** the **Privacy** page explains in plain language what is stored, who can see it and which outside services are involved.
- **State requirements:** a sourced Georgia DDS overview with links. Other states are not covered yet.

Shared spaces run in two ways: in the **local demo** (`npm run demo:shared`) with no setup beyond the emulators, or with **plain `npm run dev`** once the shared service is hosted (see [DEPLOYMENT.md](DEPLOYMENT.md)). Without either, the app shows a short setup notice and the State Requirements page.

## Prerequisites

- Node.js 22 or newer and npm (the Firebase Admin SDK requires 22)
- For the demo and most tests: [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`) and **Java 21 or newer**
- For browser tests: Google Chrome

Install dependencies once with `npm ci`.

### Java on Windows

The Firebase emulators use the first `java` on your `PATH`. If `java -version` still reports an older version after installing JDK 21, run `where.exe java` to see which one wins. Oracle's installer often puts `C:\Program Files\Common Files\Oracle\Java\javapath` first.

To fix it for the current PowerShell window only (Temurin 21 shown; adjust the folder for other JDKs):

```powershell
$env:JAVA_HOME = (Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory | Where-Object Name -like 'jdk-21*' | Select-Object -First 1).FullName
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
```

To fix it permanently, open **Edit the system environment variables → Environment Variables**. Move the JDK 21 `bin` folder above the Oracle `javapath` entry in the system `Path`, or remove that entry, and set `JAVA_HOME` to the JDK folder. Then close every terminal, including those inside your editor, and open a new one.

## Run the shared demo (recommended)

```sh
npm run demo:shared
```

Keep the terminal open. When Vite reports it is ready, open <http://127.0.0.1:4173/>. The sign-in panel should say **Shared local demo**. Sign in with any of these fictional, already-verified accounts:

| Role | Email | Password |
| --- | --- | --- |
| Managing supervisor | `manager@example.test` | `fictional-drive-123` |
| Invited supervisor | `supervisor@example.test` | `fictional-drive-123` |
| Learner | `learner@example.test` | `fictional-drive-123` |

The demo seeds one learner ("Alex Example"), a road-following route and a few tagged drives. Things to try:

1. **Dashboard:** switch learners and check progress, recent drives and coverage. **Log a drive** opens the drive form for that learner.
2. **Routes:** click a saved route to see it on the large map. Under **Create a route**, click the map to add points, select **Follow roads**, review the line, name it and save.
3. **Driving Logs:** log a drive against a saved route and tick the skills and conditions practised.
4. **Community:** open a saved route under **Routes** as the manager, choose **Share with the community…**, then browse it on **Community**. `manager@example.test` is also the demo moderator, so reports appear there too.
5. **People & access:** add another fictional learner, invite someone, or remove a member.
6. **Account:** sign out and sign in as the learner (read-only) or the invited supervisor.

The demo starts local Auth and Firestore emulators, the local shared gateway and Vite. Nothing is sent to your Firebase project, and all data is discarded when you press Ctrl+C. Ports 4000, 4173, 4175, 8080 and 9099 must be free. Restart the command, then reload the page if sign-in fails.

## Run against your Firebase project

`npm run dev` uses `.env.development.local` (copy [.env.example](.env.example) and fill in your project's web app settings). To get the shared spaces, dashboard and route editor there, host the shared service and set `VITE_SHARED_API_URL`; [DEPLOYMENT.md](DEPLOYMENT.md) walks through it on Railway. Without that setting the app shows a setup notice.

## Maps and routing

Map tiles come from the public OpenStreetMap tile service by default, which sees the area you view. **Follow roads** sends the chosen points to the public [OSRM demo server](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server) by default. Both can be switched without code changes; see [Map and routing providers](FIREBASE_SETUP.md#map-and-routing-providers). That server is free for light, non-commercial testing (about one request per second) and has no availability guarantee. A pilot needs a paid routing provider or a self-hosted OSRM, and a reviewed tile provider. Suggested routes use mapped road restrictions, which can be incomplete. They are not turn-by-turn navigation, so follow signs and the actual road. Dashboard route thumbnails are drawn from saved points and load no tiles.

## Tests

| Command | What it covers | Needs |
| --- | --- | --- |
| `npm test` | Sun times, drive timer, invitation links, route-line decoding, map/routing settings, service config and HTTP handler | Node only |
| `npm run typecheck` | TypeScript checks for the app (`tsconfig.json`, strict) | Node only |
| `npm run test:rules` | Firestore security rules | Firebase CLI, Java 21+ |
| `npm run test:shared` | Shared-space service, local gateway and the deployable server | Firebase CLI, Java 21+ |
| `npm run test:browser` | The app in Chrome: dashboard, routes, logs, timer, print log, invitations and invitation links, deletion, route sync | + Chrome |

Emulator tests use a `demo-` project and synthetic accounts; they never touch a real project. Run `npm run build` to check the production build.

**CI:** `.github/workflows/ci.yml` runs on every push to `main` and every pull request. One job runs unit tests, the type check, the service syntax check and the build; the other runs the rules, service and browser tests against the emulators (Java 21, Firebase CLI, the runner's Chrome). When browser tests fail, their screenshots and traces are attached to the run as `playwright-results`. Vercel and Railway still deploy on push; to make them wait for CI, turn on branch protection for `main` with both CI checks required and work through pull requests.

## Project structure

- `src/app/App.tsx`: app shell (sidebar, header, navigation).
- `src/app/Workspace.tsx`, `FirebaseAccount.tsx`: the main content area, sign-in and account, or a setup notice when no shared service is configured.
- `src/app/DeleteAccount.tsx`: deleting your own account from the Account page.
- `src/app/design.tsx`: the Figma visual building blocks (cards, progress ring and bars, skill chips, route sketch). Reuse these for new screens; see `guidelines/Guidelines.md`.
- `src/app/SharedDashboard.tsx`, `SharedRoutes.tsx`, `SharedPractice.tsx`, `SharedSpaces.tsx`: dashboard, routes, driving logs, and people & access.
- `src/app/inviteLink.js`, `usePendingInvite.ts`: building and reading invitation links, and holding an opened invitation for this tab.
- `src/app/sharedClient.js`: decides demo or hosted mode, reads shared data from Firestore and calls the shared service.
- `src/app/RouteMap.tsx`, `SharedRouteCard.tsx`, `followRoads.js`, `routePolyline.js`, `mapProviders.js`: Leaflet maps, the routing request, route-line decoding, and which tile and routing providers are used.
- `src/app/Privacy.tsx`, `contact.js`: the privacy notice and its contact address (a placeholder until a real inbox exists).
- `src/app/practiceData.js`, `PracticeChoices.tsx`: the skills and conditions catalogue (also used by the service) and its checkboxes.
- `src/app/CommunityRoutes.tsx`, `publicLine.js`: the community library page, and trimming route lines before they are shared.
- `src/app/StateRequirements.tsx`: the Georgia overview.
- `server/sharedAccess.mjs`: the trusted shared-space service (memberships, invitations, routes, drives).
- `server/sharedGateway.mjs`: HTTP handler shared by the local demo gateway (`localSharedGateway.mjs`) and the deployable server (`main.mjs`, configured by `config.mjs`).
- `firestore.rules`: security rules; members can read their learner spaces, and all writes go through the service.
- `scripts/shared-demo.mjs`: seeds and starts the local demo. `tests/shared-demo-smoke.mjs` signs in to a running demo with each fictional account.
- `tests/browser/`, `tests/rules/`: browser and rules tests; service tests sit next to the code in `server/`.

## Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md): host the shared service and connect the app to it
- [PROJECT_STATUS.md](PROJECT_STATUS.md): where the project stands and what's next
- [PRODUCT_PLAN.md](PRODUCT_PLAN.md): vision, phases and open product decisions
- [SHARED_ACCESS_DESIGN.md](SHARED_ACCESS_DESIGN.md): roles, permissions, invitations and data model
- [FIREBASE_SETUP.md](FIREBASE_SETUP.md): Firebase projects, rules and environment settings
- [SECURITY_REVIEW.md](SECURITY_REVIEW.md): internal review and blockers for a real-data pilot
- [OPERATIONS.md](OPERATIONS.md): project inbox, map and routing providers, and backups (costs, setup, restoring)

The original design is [Desktop Web Dashboard Design on Figma](https://www.figma.com/design/Whz9TgPqbRKDzbyiPCFKKg/Desktop-Web-Dashboard-Design). See `ATTRIBUTIONS.md` for attribution.
