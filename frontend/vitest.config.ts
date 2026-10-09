import { fileURLToPath, URL } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globalSetup: ["./src/lib/test-harness/prerender-global-setup.ts"],
    setupFiles: ["./src/lib/test-harness/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "vite-plugins/**/*.test.ts"],
    restoreMocks: true,
  },
})
