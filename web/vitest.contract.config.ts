import { defineConfig } from "vitest/config";

/**
 * Opt-in CONTRACT tests for `/web`.
 *
 * These hit the **real staging Cloudflare Worker** `/app/*` API and validate every
 * response against the Zod schemas in `lib/app-api/schemas.ts` — catching Worker-side
 * envelope drift before it breaks the dashboard. They are deliberately:
 *   - NOT part of `pnpm test` (excluded in `vitest.config.ts`),
 *   - NOT wired into `web-ci`,
 *   - self-skipping unless `APP_API_SECRET` (and `APP_API_BASE_URL`) are present.
 *
 * Run: `pnpm test:contract` after exporting `APP_API_BASE_URL` + `APP_API_SECRET`
 * (e.g. `env $(grep -E 'APP_API_(BASE_URL|SECRET)=' .env.local | xargs) pnpm test:contract`).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/contract/**/*.contract.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: {
    // Mirror tsconfig's "@/*" alias so the contract test can import the shared schemas.
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
