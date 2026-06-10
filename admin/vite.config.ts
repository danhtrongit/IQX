import path from "node:path"
import { defineConfig } from "vitest/config"
import vue from "@vitejs/plugin-vue"

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined
          if (id.includes("vue") || id.includes("pinia")) return "vendor-vue"
          if (id.includes("naive-ui") || id.includes("vueuc") || id.includes("vooks")) return "vendor-ui"
          if (id.includes("echarts") || id.includes("vue-echarts")) return "vendor-charts"
          return undefined
        },
      },
    },
  },
})
