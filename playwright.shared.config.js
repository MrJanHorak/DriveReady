import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/shared-browser",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:4173", channel: "chrome", headless: true, actionTimeout: 10000 },
  webServer: [
    {
      command: "node server/startLocalSharedGateway.mjs",
      url: "http://127.0.0.1:4175/health",
      reuseExistingServer: process.env.DRIVEREADY_REUSE_DEMO === "true",
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: process.env.DRIVEREADY_REUSE_DEMO === "true",
      env: {
        VITE_FIREBASE_API_KEY: "demo-key",
        VITE_FIREBASE_AUTH_DOMAIN: "demo-driveready.firebaseapp.com",
        VITE_FIREBASE_PROJECT_ID: "demo-driveready",
        VITE_FIREBASE_APP_ID: "demo-app",
        VITE_FIREBASE_USE_EMULATORS: "true",
        VITE_SHARED_ACCESS_EMULATOR: "true",
      },
    },
  ],
});
