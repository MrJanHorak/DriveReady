
# DriveReady

DriveReady is a desktop web prototype for helping supervisors and learner drivers plan practice drives, discover routes, and track progress toward licensing requirements. The current project is a Figma-generated React interface with sample data; it is not yet a production driving log or a source of verified legal guidance.

## Getting started

Prerequisites: Node.js and npm. Install the dependencies and start the development server:

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. Run `npm run build` to check the production build and `npm test` for the family-data checks. Lint and type-check scripts are not yet configured.

For the Firebase emulator browser tests, install the Firebase CLI and Java 21 or newer, ensure Google Chrome is installed, then run `npm run test:browser`. The test starts Vite and the Auth and Firestore emulators with a demo project and synthetic data. See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for the other emulator tests and limitations.

## Try the shared family prototype

Install the project dependencies, Firebase CLI, and Java 21 or newer, then run `npm run demo:shared` from this directory. Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/) and sign in using any of these fictional, already verified accounts:

| Role | Email | Password |
| --- | --- | --- |
| Managing supervisor | `manager@example.test` | `fictional-drive-123` |
| Invited supervisor | `supervisor@example.test` | `fictional-drive-123` |
| Learner | `learner@example.test` | `fictional-drive-123` |

In the account panel, find **Shared spaces · local emulator only**. All three accounts have access to Alex Example's space and a fictional drive. As a supervisor, add practice; sign out and sign in as the learner to see the shared notes and totals. The manager can create another space, issue an invitation, and manually copy its space ID and token to the invited account; no email is sent. Use separate browser profiles or sign out between accounts. The account-scoped workspace is separate from shared practice.

Use fictional data only. The command starts local Auth and Firestore emulators, the local shared gateway, and Vite; it does not connect to the development Firebase project. Ports 4000, 4173, 4175, 8080, and 9099 must be free. Press Ctrl+C to stop. Emulator data is temporary and is recreated on each run. The shared prototype is not production-ready: shared routes, drive editing, migration, recovery, and deployment are not implemented, and practice totals cover at most the 50 displayed drives.

## Current state

The normal workspace requires an account and stores its learners and manually entered drives in the configured cloud project. Older browser-local records are not automatically copied or deleted. Progress is calculated from logs and can be edited. The development cloud setup is for synthetic data until security and privacy review is complete.

The route explorer and route creation wizard remain design previews with sample content and temporary state; routes are not published, location-aware, or suitable for navigation. State Requirements offers a Georgia overview and links to official sources, not a complete or personalized eligibility check; other states are not yet covered. The app does not have real mapping integration.

See [PROJECT_STATUS.md](PROJECT_STATUS.md) for an earlier assessment, [PRODUCT_PLAN.md](PRODUCT_PLAN.md) for the product vision, and [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for the current Firebase work. Cloud integration needs security review before use with real family data.

The account panel can download a cloud backup. It reads learners and drives separately, so simultaneous edits on other devices may be reflected at different moments. Backups contain readable personal details and locations. After review, a backup can be copied into the cloud account; copying skips identical records and conflicts rather than overwriting them. The import accepts files up to 5 MB; larger downloads display a warning.

## Project structure

- `src/app/App.tsx`: sample data and most application screens and interactions.
- `src/app/components/ui/`: reusable UI components included in the generated bundle.
- `src/styles/`: global styles, theme, and fonts.
- `vite.config.ts`: Vite, React, and Tailwind configuration.

The original design bundle references [Desktop Web Dashboard Design on Figma](https://www.figma.com/design/Whz9TgPqbRKDzbyiPCFKKg/Desktop-Web-Dashboard-Design). See `ATTRIBUTIONS.md` for additional attribution.
