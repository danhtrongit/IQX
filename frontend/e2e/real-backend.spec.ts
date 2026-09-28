import type { Page } from "@playwright/test"
import { test, expect } from "./fixtures"

async function login(page: Page, email: string, remember = true) {
  await page.goto("/")
  await page.getByRole("button", { name: "Đăng nhập" }).click()
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Mật khẩu").fill(process.env.E2E_TEST_PASSWORD || "System!Passw0rd")
  if (!remember) await page.getByRole("checkbox", { name: "Ghi nhớ đăng nhập" }).uncheck()
  await page.getByRole("dialog").getByRole("button", { name: "Đăng nhập" }).click()
  await expect(page.getByRole("dialog")).not.toBeVisible()
}

test.describe("frontend-v2 real APIv2 smoke", () => {
  test.skip(process.env.E2E_REAL_BACKEND !== "1", "Set E2E_REAL_BACKEND=1 with an isolated seeded backend")

  test("seeded user can establish a v2 session and read learning data", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Đăng nhập" }).click()
    await page.getByLabel("Email").fill(process.env.E2E_USER_EMAIL || "")
    await page.getByLabel("Mật khẩu").fill(process.env.E2E_TEST_PASSWORD || "System!Passw0rd")
    await page.getByRole("dialog").getByRole("button", { name: "Đăng nhập" }).click()
    await expect(page.getByRole("dialog")).not.toBeVisible()
    await expect(page.getByRole("banner").getByRole("button", { name: /System browser-user/ })).toBeVisible()
    await page.goto("/bai-hoc")
    await expect(page.getByRole("heading", { name: "Kiến thức" })).toBeVisible()
    const apiRequests: string[] = []
    page.on("request", request => { if (request.url().includes("/api/")) apiRequests.push(request.url()) })
    await page.reload()
    await expect(page.getByRole("heading", { name: "Kiến thức", exact: true })).toBeVisible()
    expect(apiRequests.length).toBeGreaterThan(0)
    expect(apiRequests.every(url => url.includes("/api/v2/") || !url.includes("/api/"))).toBeTruthy()
  })

  test("seeded non-admin cannot enter admin routes", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Đăng nhập" }).click()
    await page.getByLabel("Email").fill(process.env.E2E_USER_EMAIL || "")
    await page.getByLabel("Mật khẩu").fill(process.env.E2E_TEST_PASSWORD || "System!Passw0rd")
    await page.getByRole("dialog").getByRole("button", { name: "Đăng nhập" }).click()
    await expect(page.getByRole("dialog")).not.toBeVisible()
    await page.goto("/admin")
    await expect(page.getByText(/không có quyền quản trị/i)).toBeVisible()
  })

  test("browser adapters persist v2 watchlists and reserve/cancel a real order", async ({ page }) => {
    await login(page, process.env.E2E_USER_EMAIL || "")
    const result = await page.evaluate(async () => {
      const clientPath = "/src/lib/api.ts"
      const portfolioPath = "/src/pages/demo-trading/portfolio/api.ts"
      const client = await import(clientPath)
      const portfolio = await import(portfolioPath)
      await portfolio.addToWatchlist("VCB")
      const watchlist = await portfolio.fetchWatchlist()
      const account = await client.api("/virtual-trading/account/activate", { method: "POST" })
      const order = await client.api("/virtual-trading/orders", { method: "POST", body: JSON.stringify({ symbol: "VCB", side: "buy", order_type: "limit", quantity: 100, limit_price_vnd: 90000 }) })
      const reserved = await client.api("/virtual-trading/account")
      await portfolio.cancelOrder(order.id)
      const released = await client.api("/virtual-trading/account")
      await portfolio.removeFromWatchlist("VCB")
      return { watchlist, initial: account.total_cash_vnd, orderStatus: order.status, reserved: reserved.cash_reserved_vnd, released: released.cash_available_vnd }
    })
    expect(result.watchlist).toEqual([expect.objectContaining({ symbol: "VCB", sortOrder: expect.any(Number) })])
    expect(result.orderStatus).toBe("pending")
    expect(result.reserved).toBeGreaterThan(9_000_000)
    expect(result.released).toBe(result.initial)
  })

  test("admin browser routes and multipart learning upload use the real v2 server", async ({ page }) => {
    test.setTimeout(90_000)
    await login(page, process.env.E2E_ADMIN_EMAIL || "")
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    page.on("response", response => {
      if (response.url().includes("/api/v2/admin/") && response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`)
    })
    const result = await page.evaluate(async () => {
      const modulePath = "/src/pages/admin/learning/api.ts"
      const lessons = await import(modulePath)
      const course = await lessons.createCourse({ slug: `browser-course-${Date.now()}`, title: "Khoá học kiểm thử v2", level: "beginner", category: "system", isPremium: false, isPublished: true })
      const episode = await lessons.createEpisode(course.id, { title: "Nội dung v2", contentType: "text", markdownBody: "# Kiểm thử nội dung thực", sortOrder: 1 })
      await lessons.updateEpisode(episode.id, { isPublished: true })
      const pixel = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lFkAAAAASUVORK5CYII="), character => character.charCodeAt(0))
      const uploaded = await lessons.uploadCourseThumbnail(course.id, new File([pixel], "thumbnail.png", { type: "image/png" }), () => {})
      return { id: course.id, slug: course.slug, thumbnail: uploaded.thumbnailUrl }
    })
    expect(result.thumbnail).toContain("/api/v2/media/")
    await page.goto(`/bai-hoc/${result.slug}`)
    await expect(page.getByText("Khoá học kiểm thử v2").first()).toBeVisible()
    for (const route of ["/admin", "/admin/users", "/admin/plans", "/admin/subscriptions", "/admin/payments", "/admin/ipn", "/admin/vt/accounts", "/admin/vt/config", "/admin/audit", "/admin/system", "/admin/alerts", "/admin/lessons"]) {
      await page.goto(route)
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
      await expect(page.getByText("Không có quyền truy cập", { exact: true })).not.toBeVisible()
    }
    expect(errors).toEqual([])
  })

  test("canonical websocket works while the v1 HTTP surface is disabled", async ({ page, request }) => {
    const response = await request.get(`${process.env.E2E_API_BASE_URL}/auth/me`)
    expect(response.status()).toBe(401)
    const legacy = await request.get(`${process.env.E2E_API_BASE_URL?.replace(/\/api\/v2$/, "/api/v1")}/virtual-trading/leaderboard`)
    expect(legacy.status()).toBe(404)
    await page.goto("/")
    const pong = await page.evaluate(() => new Promise<boolean>((resolve, reject) => {
      const url = new URL("/api/v2/market-data/ws", window.location.origin)
      url.protocol = "ws:"
      const socket = new WebSocket(url)
      const timer = setTimeout(() => { socket.close(); reject(new Error("Websocket ping timed out")) }, 5000)
      socket.onopen = () => socket.send(JSON.stringify({ action: "ping" }))
      socket.onmessage = event => { clearTimeout(timer); resolve(JSON.parse(event.data).type === "pong"); socket.close() }
      socket.onerror = () => { clearTimeout(timer); reject(new Error("Websocket unavailable")) }
    }))
    expect(pong).toBe(true)
  })

  test("two session-only tabs rotate a copied refresh token without replay", async ({ page, context }) => {
    await login(page, process.env.E2E_USER_EMAIL || "", false)
    const tokens = await page.evaluate(() => ({ access: sessionStorage.getItem("iqx.v2.access_token"), refresh: sessionStorage.getItem("iqx.v2.refresh_token") }))
    expect(tokens.refresh).toBeTruthy()
    const peer = await context.newPage()
    try {
      await peer.goto("/")
      await peer.evaluate(saved => {
        sessionStorage.setItem("iqx.v2.access_token", saved.access!)
        sessionStorage.setItem("iqx.v2.refresh_token", saved.refresh!)
      }, tokens)
      await Promise.all([page, peer].map(tab => tab.evaluate(() => sessionStorage.setItem("iqx.v2.access_token", "expired-test-access"))))
      const results = await Promise.all([page, peer].map(tab => tab.evaluate(async () => {
        const modulePath = "/src/lib/api.ts"
        const client = await import(modulePath)
        const user = await client.api("/auth/me")
        return { id: user.id, refresh: sessionStorage.getItem("iqx.v2.refresh_token"), persistedRefresh: localStorage.getItem("iqx.v2.refresh_token") }
      })))
      expect(results[0]?.id).toBe(results[1]?.id)
      expect(results[0]?.refresh).toBe(results[1]?.refresh)
      expect(results[0]?.refresh).not.toBe(tokens.refresh)
      expect(results.map(result => result.persistedRefresh)).toEqual([null, null])
    } finally {
      await peer.close()
    }
  })
})
