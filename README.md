
# DriveReady

DriveReady is a desktop web prototype for helping supervisors and learner drivers plan practice drives, discover routes, and track progress toward licensing requirements. The current project is a Figma-generated React interface with sample data; it is not yet a production driving log or a source of verified legal guidance.

## Getting started

Prerequisites: Node.js and npm. Install the dependencies and start the development server:

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. To check the production build, run `npm run build`. There are currently no test, lint, or type-check scripts configured.

## Current state

The dashboard, route explorer, and route publishing wizard are interactive prototypes. Route search, filters, selection, map zoom, favorites, driver selection, and the wizard use temporary component state. The map and all people, routes, ratings, logs, progress, and requirements are sample content. A route submitted through the wizard is not saved or published. Refreshing or leaving parts of the interface can reset state.

Driving Logs and State Requirements currently show the dashboard content. The app has no backend, account system, real mapping integration, or persistent storage. Treat the on-screen compliance claims and route safety information as placeholders until the product's requirements and authoritative sources are established.

See [PROJECT_STATUS.md](PROJECT_STATUS.md) for the assessment and known gaps, and [PRODUCT_PLAN.md](PRODUCT_PLAN.md) for the product vision and proposed phases.

## Project structure

- `src/app/App.tsx`: sample data and most application screens and interactions.
- `src/app/components/ui/`: reusable UI components included in the generated bundle.
- `src/styles/`: global styles, theme, and fonts.
- `vite.config.ts`: Vite, React, and Tailwind configuration.

The original design bundle references [Desktop Web Dashboard Design on Figma](https://www.figma.com/design/Whz9TgPqbRKDzbyiPCFKKg/Desktop-Web-Dashboard-Design). See `ATTRIBUTIONS.md` for additional attribution.
