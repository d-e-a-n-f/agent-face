import { defineConfig, devices } from "@playwright/test";

// e2e runs on its own port with its own server, NEVER reusing a dev server:
// a reused server wouldn't have NEXT_PUBLIC_AGENTFACE_MOCK=1 baked in, and
// the suite would silently hit the real model endpoint instead of the
// deterministic mock adapter.
const E2E_PORT = 3900;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}`,
    reuseExistingServer: false,
    env: {
      ...process.env,
      // Deterministic assistant in e2e; no real model calls in CI.
      NEXT_PUBLIC_AGENTFACE_MOCK: "1",
      // Own dist dir: Next 16 locks one dev server per dist directory, so
      // this lets e2e run alongside a developer's normal `pnpm dev`.
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
