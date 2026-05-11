import { defineConfig } from "vitest/config";

export default defineConfig({
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
