import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Frontend composables + tests import vue; resolve it from the frontend
      // workspace so root-level vitest can load them. Point at the package
      // directory (not a specific entry file) so the resolver honors vue's
      // own `exports` map.
      vue: resolve(__dirname, "frontend/node_modules/vue"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    reporters: ["default"],
    coverage: {
      enabled: false,
    },
  },
});
