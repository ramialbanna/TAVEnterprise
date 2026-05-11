import { configDefaults, defineConfig } from "vitest/config";

/**
 * Minimal Vitest config for /web.
 *
 * It exists primarily so Vitest uses /web's own settings instead of walking up the
 * directory tree and inheriting the root Cloudflare-Worker repo's `vitest.config.ts`
 * (whose include globs are scoped to the Worker, not this app).
 *
 * Task 1.16 expands this: `environment: "jsdom"`, `@vitejs/plugin-react`, the
 * React-Testing-Library setup file, and the MSW server lifecycle. For now the
 * pure-module tests (e.g. lib/env.test.ts) only need the defaults (node environment).
 */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/.next/**"],
  },
  resolve: {
    // Mirror tsconfig's "@/*" path alias so future tests can import from "@/...".
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
