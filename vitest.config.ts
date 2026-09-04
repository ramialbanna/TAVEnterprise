import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@scripts/enrich-queues": path.resolve(rootDir, "scripts/lib/enrich-queues.mjs"),
      "@scripts/gologin-antiban": path.resolve(rootDir, "scripts/lib/gologin-antiban.mjs"),
    },
  },
  test: {
    environment: "node",
    include: [
      "test/**/*.test.ts",
      "src/**/__tests__/**/*.test.ts",
      "workers/**/__tests__/**/*.test.ts",
    ],
    exclude: ["test/**/*.int.test.ts"],
  },
});
