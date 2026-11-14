# Hosting the shared service

The shared learner spaces (dashboard, routes, driving logs, people & access) need a small trusted service. That service checks who is signed in and what they may do, then writes to Firestore with admin access. Browsers can only read shared data; every change goes through this service. In the local demo it runs as a loopback-only gateway. To use shared spaces from `npm run dev` or a deployed web app, host `server/main.mjs` and point the app at it.

This guide is for a **development** deployment with fictional data. A real-data pilot needs the items in [SECURITY_REVIEW.md](SECURITY_REVIEW.md) first.

## How it fits together

```text
Browser (DriveReady web app)
  ├─ Firebase Auth: sign-in, ID tokens
  ├─ Firestore: reads only (firestore.rules)
  └─ HTTPS POST + ID token ──► shared service (server/main.mjs)
                                  └─ Firebase Admin SDK ──► Firestore writes
```

The service is one Node process with no framework. It runs on any Node 22+ host (the Firebase Admin SDK requires Node 22). The repository includes `railway.json` for Railway; the same steps work on Render or Cloud Run.

## Before you start

1. **Deploy the current Firestore rules** to the project. They include the read-only rules for shared spaces:

   ```sh
   firebase deploy --only firestore:rules --project <your-project-id>
   ```

2. **Create a service-account key:** Firebase console → Project settings → Service accounts → **Generate new private key**. This JSON file grants full admin access to the project. Keep it out of the repository (`.gitignore` blocks common key file names), store it only in your host's secret variables, and delete the downloaded copy once it is stored. On Google Cloud hosts (Cloud Run, Cloud Functions) you can skip the key and use the runtime's service account.

3. **Email verification:** the service only accepts accounts with a verified email. Users can send themselves a verification email from the app's **Account** page.

## Deploy on Railway

1. In Railway, create a project → **Deploy from GitHub repo** → choose this repository.
2. Under **Variables**, add the settings below (also listed in [service-variables.example](service-variables.example)).
3. Under **Settings → Networking**, select **Generate Domain** to get a public `https://…up.railway.app` address.
4. Deploy. `railway.json` sets the start command (`node server/main.mjs`, started directly so a normal shutdown during redeploys isn't reported as an npm error) and the health check (`/health`). The log should show `DriveReady shared service listening …` with your project and allowed origins.
5. Check it: opening `https://<your-domain>/health` in a browser should return `{"ok":true}`.

| Variable | Required | Example / notes |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | Yes | Your project ID, the same one the web app uses |
| `FIREBASE_SERVICE_ACCOUNT` | Yes, except on Google Cloud | The whole service-account JSON, pasted as is or base64-encoded. It must belong to `FIREBASE_PROJECT_ID`. |
| `ALLOWED_ORIGINS` | Yes | `http://localhost:5173` for `npm run dev`, plus your deployed web app, e.g. `https://driveready.vercel.app`. Comma-separated, exact origins, no trailing slash. Only `localhost`/`127.0.0.1` may use http. |
| `TRUST_PROXY` | Recommended | `true` on Railway, Render or Cloud Run, so rate limiting sees the real client address |
| `RATE_LIMIT_PER_MINUTE` | No | Requests per minute per client address; default `120` |
| `MODERATOR_EMAILS` | Recommended | Comma-separated verified emails allowed to review reported community routes (for example the project inbox). Without it, reports are stored but nobody can review them in the app. |
| `PORT`, `HOST` | No | Set by the host; defaults `8080`, `0.0.0.0` |

The service refuses to start if a setting is missing or unsafe: a `demo-` project, emulator variables, a key for a different project, or a non-https origin.

## Connect the web app

Add the service address to `.env.development.local` (for `npm run dev`) or to your web host's environment (for a deployed build):

```sh
VITE_SHARED_API_URL=https://<your-domain>.up.railway.app
```

Restart `npm run dev`. After you sign in, the Account page shows **Shared spaces (development)**, and the full sidebar appears. Add a learner under **People & access** to start. Without `VITE_SHARED_API_URL` the app shows a setup notice instead.

If the app is deployed (for example on Vercel or Netlify), also add its domain under Firebase console → Authentication → Settings → **Authorized domains**, so sign-in works there.

## Other hosts

- **Render or another Node host:** use start command `npm run start:service` and health check path `/health`, with the same variables.
- **Google Cloud Run:** deploy from source with start command `npm run start:service`. Leave `FIREBASE_SERVICE_ACCOUNT` unset and grant the Cloud Run service account Firestore and Firebase Auth admin access for the project.
- **Firebase Cloud Functions:** possible with a small wrapper around `createSharedGateway` in `server/sharedGateway.mjs`. Cloud Functions requires the project to be on the pay-as-you-go Blaze plan. This wrapper is not included yet.

## Try the hosted path locally

To run the deployable server against the emulators (useful before deploying):

```sh
firebase emulators:start --only auth,firestore --project demo-driveready
# in a second terminal (PowerShell: set each variable with $env:NAME="value")
FIREBASE_PROJECT_ID=demo-driveready SHARED_SERVICE_ALLOW_EMULATORS=true \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
ALLOWED_ORIGINS=http://127.0.0.1:5173 PORT=4195 npm run start:service
```

Then start Vite on port 5173 with these settings (for example in a temporary `.env.development.local`):

```sh
VITE_FIREBASE_API_KEY=demo-key
VITE_FIREBASE_AUTH_DOMAIN=demo-driveready.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-driveready
VITE_FIREBASE_APP_ID=demo-app
VITE_FIREBASE_USE_EMULATORS=true
VITE_SHARED_API_URL=http://127.0.0.1:4195
```

Create an account in the app, then send a verification email from the **Account** page. The Auth emulator prints the verification link in its terminal instead of sending an email; open the link, then refresh the verification status in the app. `npm run test:shared` does this automatically for the service (`server/main.test.mjs`).

## What this deployment does not provide yet

- Rate limiting is per instance and in memory. It slows bursts but is not abuse protection across instances, and there is no sign-up abuse control.
- Invitations are not emailed; managers share codes themselves.
- There is no data deletion, account deletion, backup, monitoring or alerting.
- The public OSRM and OpenStreetMap services are for light testing only (see the README).

See [SECURITY_REVIEW.md](SECURITY_REVIEW.md) for the full list before any real family data.
