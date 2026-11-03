import { defineConfig } from "@playwright/test";

const port = process.env.DRIVEREADY_TEST_PORT ?? "4173";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 30000,
  use: { baseURL: `http://127.0.0.1:${port}`, channel: "chrome", headless: true },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: {
      VITE_FIREBASE_API_KEY: "demo-key",
      VITE_FIREBASE_AUTH_DOMAIN: "demo-driveready.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "demo-driveready",
      VITE_FIREBASE_APP_ID: "demo-app",
      VITE_FIREBASE_USE_EMULATORS: "true",
    },
  },
});
