import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Frontend composables + tests import vue; resolve it from the frontend
      // workspace so root-level vitest can load them.
      vue: resolve(__dirname, "frontend/node_modules/vue/index.mjs"),
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
