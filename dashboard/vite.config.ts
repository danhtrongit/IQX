import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            if (
              id.includes("react-dom") ||
              id.includes("react-router") ||
              (id.includes("/react/") && !id.includes("react-"))
            ) {
              return "vendor-react"
            }
            if (id.includes("@arco-design")) {
              return "vendor-arco"
            }
            if (id.includes("@tanstack")) {
              return "vendor-query"
            }
            if (id.includes("recharts") || id.includes("d3-")) {
              return "vendor-charts"
            }
            if (id.includes("framer-motion")) {
              return "vendor-motion"
            }
            if (id.includes("@xyflow")) {
              return "vendor-xyflow"
            }
          }
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        // Use 127.0.0.1 (not "localhost"): macOS resolves "localhost" to ::1
        // (IPv6) first, but the backend listens only on IPv4 127.0.0.1.
        // NOTE: the backend must run with a keep-alive timeout LONGER than the
        // dashboard's 5s poll interval (we start uvicorn with --timeout-keep-alive 75)
        // so pooled proxy sockets don't get closed mid-poll → ECONNRESET → 502.
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        timeout: 60000,
        proxyTimeout: 60000,
        configure: (proxy) => {
          proxy.on("error", (err, req) => {
            // eslint-disable-next-line no-console
            console.log("[proxy error]", req?.method, req?.url, "→", (err as NodeJS.ErrnoException).code, err.message)
          })
        },
      },
    },
  },
})
