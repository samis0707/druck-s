import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Vendored kalpri-Engine (siehe scripts/kalpri-sync.mjs)
      "@druck/units": path.resolve(__dirname, "lib/kalpri/units/index.ts"),
      "@druck/layout-core": path.resolve(__dirname, "lib/kalpri/layout-core/index.ts"),
      "@druck/resources": path.resolve(__dirname, "lib/kalpri/resources/index.ts"),
    },
  },
  test: {
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 30000,
  },
});
