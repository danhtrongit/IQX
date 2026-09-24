import { defineConfig, devices } from "@playwright/test"

const realApi = process.env.E2E_API_BASE_URL?.trim()

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: process.env.E2E_REAL_BACKEND !== "1",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    cwd: ".",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_API_URL: "/api/v2",
      VITE_WS_URL: "/api/v2/market-data/ws",
      API_PROXY_TARGET: process.env.API_PROXY_TARGET || (realApi ? realApi.replace(/\/api\/v2\/?$/, "") : "http://127.0.0.1:3001"),
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
})
