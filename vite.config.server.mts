import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * The Express API is bundled rather than compiled file-by-file so the
 * framework-agnostic domain modules keep their extensionless relative imports
 * while the production entry stays a single runnable Node ESM file. Runtime
 * dependencies stay external via Vite's default SSR behaviour.
 */
export default defineConfig({
  resolve: {
    alias: {
      // The real marker throws unless the runtime advertises `react-server`.
      "server-only": fileURLToPath(
        new URL("./src/lib/server-only.ts", import.meta.url),
      ),
    },
  },
  build: {
    ssr: true,
    outDir: "dist/server",
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV !== "production",
    target: `node${process.versions.node.split(".")[0]}`,
    rollupOptions: {
      input: "src/api/server.ts",
    },
  },
});
