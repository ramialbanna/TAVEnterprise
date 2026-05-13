import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for /web — Phase 1 e2e smoke (sign-in page + auth-gate behavior).
 *
 * `webServer` boots `next dev` with placeholder env vars so the server starts without a
 * real `.env.local` (these are NOT real credentials — auth/Worker calls aren't exercised
 * by the Phase 1 specs). Real Google OAuth + the authenticated shell are validated on a
 * Vercel Preview deploy, not here.
 */
const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Bind dev explicitly to IPv4 — `next dev` defaults to `localhost`, which on macOS
    // can resolve to `::1` while Playwright probes `127.0.0.1`, causing a readiness timeout.
    command: `env -u NO_COLOR pnpm dev --hostname 127.0.0.1 --port ${PORT}`,
    // Probe a public 200 page (the sign-in page is allow-listed in the proxy) rather than
    // `/`, which would 307-redirect through the auth gate.
    url: `${BASE_URL}/signin`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // Point SSR at the in-process e2e fixture handler (`/api/e2e-mocks/app/*`).
      // `E2E_MOCKS=1` activates that handler; without the flag it returns 404, so
      // this configuration is inert outside Playwright.
      APP_API_BASE_URL: `${BASE_URL}/api/e2e-mocks`,
      E2E_MOCKS: "1",
      APP_API_SECRET: "e2e-placeholder",
      AUTH_SECRET: "e2e-secret",
      AUTH_GOOGLE_ID: "e2e-google-id",
      AUTH_GOOGLE_SECRET: "e2e-google-secret",
      ALLOWED_EMAIL_DOMAIN: "texasautovalue.com",
    },
  },
});
