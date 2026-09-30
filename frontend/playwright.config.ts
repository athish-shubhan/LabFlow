import { defineConfig, devices } from "@playwright/test";

// Runs against the docker compose stack (or `npm run dev` + a local backend) already
// listening on :3000. No webServer block: the app needs a real Postgres-backed backend
// behind it, which docker compose already provides.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
