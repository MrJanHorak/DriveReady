import { defineConfig } from "@playwright/test";

// Browser tests run the app in shared-demo mode against the local emulators and gateway.
// Use npm run test:browser (it starts the emulators first).
const isolated = process.env.DRIVEREADY_ISOLATED_DEMO === "true";
const appPort = isolated ? 4174 : 4173;
const gatewayPort = isolated ? 4176 : 4175;

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 60000,
  use: { baseURL: `http://127.0.0.1:${appPort}`, channel: "chrome", headless: true, actionTimeout: 10000 },
  webServer: [
    {
      command: "node server/startLocalSharedGateway.mjs",
      url: `http://127.0.0.1:${gatewayPort}/health`,
      reuseExistingServer: process.env.DRIVEREADY_REUSE_DEMO === "true",
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${appPort} --strictPort`,
      url: `http://127.0.0.1:${appPort}`,
      reuseExistingServer: process.env.DRIVEREADY_REUSE_DEMO === "true",
      env: {
        VITE_FIREBASE_API_KEY: "demo-key",
        VITE_FIREBASE_AUTH_DOMAIN: "demo-driveready.firebaseapp.com",
        VITE_FIREBASE_PROJECT_ID: "demo-driveready",
        VITE_FIREBASE_APP_ID: "demo-app",
        VITE_FIREBASE_USE_EMULATORS: "true",
        VITE_SHARED_ACCESS_EMULATOR: "true",
        VITE_SHARED_GATEWAY_PORT: isolated ? "4176" : "4175",
      },
    },
  ],
});
