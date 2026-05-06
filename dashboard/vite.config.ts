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
            if (id.includes("react-dom") || id.includes("react-router") || (id.includes("/react/") && !id.includes("react-"))) {
              return "vendor-react"
            }
            if (id.includes("radix-ui") || id.includes("class-variance-authority") || id.includes("clsx") || id.includes("tailwind-merge") || id.includes("sonner")) {
              return "vendor-ui"
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
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
})
