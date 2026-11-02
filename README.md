
# DriveReady

DriveReady is a desktop web prototype for helping supervisors and learner drivers plan practice drives, discover routes, and track progress toward licensing requirements. The current project is a Figma-generated React interface with sample data; it is not yet a production driving log or a source of verified legal guidance.

## Getting started

Prerequisites: Node.js and npm. Install the dependencies and start the development server:

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. Run `npm run build` to check the production build and `npm test` for the family-data checks. Lint and type-check scripts are not yet configured.

## Current state

Learners and manually entered driving logs are saved in the current browser's local storage. Progress is calculated from those logs and can be edited. Select skills, roads, and conditions on a drive to see per-learner practice coverage; older free-text entries remain intact but must be tagged to appear in those counts. The dashboard also offers starting points and links to Georgia DDS and NHTSA guidance; community-submitted tips are not yet supported. A log can include a place, an HTTPS map link, a route described by a start, destination and up to three stops, and an optional current-location pin captured with browser permission. Place and route descriptions can be opened in Google Maps for review; Google Maps calculates the suggested path, which might differ from the actual drive. A pin is a single approximate point, not a recorded or verified route. Opening a location or route in Google Maps, or opening a saved link, sends that information to the external service. This is an early local-only implementation: data is not synced and may be lost if browser data is cleared. Download and securely store a backup from the dashboard; backup files contain readable personal information and locations. Restoring a backup replaces, rather than merges with, existing browser data. Do not enter sensitive personal details.

The route explorer and route creation wizard remain design previews with sample content and temporary state; routes are not published, location-aware, or suitable for navigation. State Requirements offers a Georgia overview and links to official sources, not a complete or personalized eligibility check; other states are not yet covered. The app has no backend, account system, or real mapping integration.

See [PROJECT_STATUS.md](PROJECT_STATUS.md) for the assessment and known gaps, [PRODUCT_PLAN.md](PRODUCT_PLAN.md) for the product vision and proposed phases, and [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for the Firebase work in progress. Firebase sign-in does not yet sync family data.

## Project structure

- `src/app/App.tsx`: sample data and most application screens and interactions.
- `src/app/components/ui/`: reusable UI components included in the generated bundle.
- `src/styles/`: global styles, theme, and fonts.
- `vite.config.ts`: Vite, React, and Tailwind configuration.

The original design bundle references [Desktop Web Dashboard Design on Figma](https://www.figma.com/design/Whz9TgPqbRKDzbyiPCFKKg/Desktop-Web-Dashboard-Design). See `ATTRIBUTIONS.md` for additional attribution.
