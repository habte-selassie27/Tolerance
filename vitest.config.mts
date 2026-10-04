import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The browser bundle never reaches these modules; Vitest executes them in
      // Node where the marker would otherwise throw.
      "server-only": fileURLToPath(
        new URL("./src/lib/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: [
      "lib/**",
      "dist/**",
      ".venv-genlayer/**",
      "node_modules/**",
      ...(process.env.RUN_PHASE3_INTEGRATION_TESTS === "1"
        ? []
        : ["tests/integration/**"]),
    ],
  },
});
