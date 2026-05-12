import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * Vitest config for /web.
 *
 * It exists so Vitest uses /web's own settings instead of walking up the directory
 * tree to the root Cloudflare-Worker repo's config (whose globs are scoped to the
 * Worker). Component/integration tests run under jsdom with React Testing Library +
 * MSW; the pure-module tests (lib/**, app-api/**) tolerate jsdom fine since they
 * never touch the DOM.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    exclude: [...configDefaults.exclude, "**/.next/**", "**/e2e/**"],
  },
  resolve: {
    // Mirror tsconfig's "@/*" path alias so tests can import from "@/...".
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
