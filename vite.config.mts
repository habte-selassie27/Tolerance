import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { DEFAULT_API_PORT, DEFAULT_WEB_PORT } from "./src/config/ports";

const apiPort = process.env.PORT ?? String(DEFAULT_API_PORT);
const webPort = Number(process.env.WEB_PORT ?? DEFAULT_WEB_PORT);
const apiTarget = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  // The Supabase browser-visible keys keep their established names, so expose
  // the same NEXT_PUBLIC_ prefix the previous framework used.
  envPrefix: ["NEXT_PUBLIC_"],
  publicDir: "public",
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV !== "production",
  },
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: false },
      "/auth": { target: apiTarget, changeOrigin: false },
    },
  },
});
