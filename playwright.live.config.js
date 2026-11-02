import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/live",
  workers: 1,
  timeout: 90000,
  use: { baseURL: "http://127.0.0.1:4174", channel: "chrome", headless: true },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
  },
});
