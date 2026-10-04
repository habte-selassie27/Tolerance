import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = process.env.PORT ?? "3001";
const webPort = Number(process.env.WEB_PORT ?? 3000);
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
