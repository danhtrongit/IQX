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
    // jsdom không có Canvas: test trang chạy bản cũ, test IQLine tự bật bằng `?iqline=1`. Mặc định bật được kiểm ở iqline-flag.test.ts và e2e.
    env: { VITE_IQLINE_OFF: "market,flashback,static" },
    globalSetup: ["./src/lib/test-harness/prerender-global-setup.ts"],
    setupFiles: ["./src/lib/test-harness/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "vite-plugins/**/*.test.ts"],
    restoreMocks: true,
  },
})
