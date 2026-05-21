import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
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
            if (
              id.includes("@radix-ui") ||
              id.includes("class-variance-authority") ||
              id.includes("clsx") ||
              id.includes("tailwind-merge") ||
              id.includes("sonner")
            ) {
              return "vendor-ui"
            }
            if (id.includes("@tanstack/react-table")) {
              return "vendor-table"
            }
            if (id.includes("recharts") || id.includes("d3-")) {
              return "vendor-charts"
            }
            if (id.includes("react-hook-form") || id.includes("zod") || id.includes("@hookform")) {
              return "vendor-forms"
            }
          }
        },
      },
    },
  },
})
