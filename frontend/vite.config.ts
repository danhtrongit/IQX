import { fileURLToPath, URL } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

import { prerender } from "./vite-plugins/prerender.ts"

// https://vite.dev/config/
export default defineConfig(({ mode, isSsrBuild }) => {
  const environment = loadEnv(mode, process.cwd(), "")
  const apiTarget = environment.API_PROXY_TARGET || "http://127.0.0.1:3001"
  return {
  plugins: [react(), tailwindcss(), prerender({ routes: ["/", "/about"] })],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Client build writes dist/.vite/manifest.json so the prerender plugin can
  // link the CSS/JS chunks of prerendered routes. The nested SSR build (used
  // only at build time) bundles everything.
  build: isSsrBuild
    ? { manifest: false, copyPublicDir: false }
    : { manifest: true },
  ssr: { noExternal: true },
  server: {
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        ws: true,
      },
      "/media": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  }
})
