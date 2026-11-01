
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

Learners and manually entered driving logs are saved in the current browser's local storage. Progress is calculated from those logs and can be edited. This is an early local-only implementation: data is not synced or backed up and may be lost if browser data is cleared. Do not enter sensitive personal details.

The route explorer and route creation wizard remain design previews with sample content and temporary state; routes are not published, location-aware, or suitable for navigation. State requirements are not yet provided. The app has no backend, account system, or real mapping integration.

See [PROJECT_STATUS.md](PROJECT_STATUS.md) for the assessment and known gaps, and [PRODUCT_PLAN.md](PRODUCT_PLAN.md) for the product vision and proposed phases.

## Project structure

- `src/app/App.tsx`: sample data and most application screens and interactions.
- `src/app/components/ui/`: reusable UI components included in the generated bundle.
- `src/styles/`: global styles, theme, and fonts.
- `vite.config.ts`: Vite, React, and Tailwind configuration.

The original design bundle references [Desktop Web Dashboard Design on Figma](https://www.figma.com/design/Whz9TgPqbRKDzbyiPCFKKg/Desktop-Web-Dashboard-Design). See `ATTRIBUTIONS.md` for additional attribution.
