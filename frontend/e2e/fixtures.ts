import { test as base, expect, type Page, type Route } from "@playwright/test"

export const test = base.extend<{ api: void }>({
  api: [async ({ page }, useFixture) => {
    if (process.env.E2E_REAL_BACKEND === "1") {
      await useFixture()
      return
    }
    await page.route("**/api/v2/**", (route) => mockApi(route))
    await useFixture()
  }, { auto: true }],
})

export { expect }

export async function seedMember(page: Page, premium = false) {
  await page.addInitScript(({ isPremium }) => {
    sessionStorage.setItem("iqx.v2.access_token", "e2e-member-token")
    sessionStorage.setItem("iqx.v2.refresh_token", "e2e-refresh-token")
    sessionStorage.setItem("iqx.v2.remember", "false")
    ;(window as unknown as { __IQX_E2E_PREMIUM__?: boolean }).__IQX_E2E_PREMIUM__ = isPremium
  }, { isPremium: premium })
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
}

async function mockApi(route: Route) {
  const url = new URL(route.request().url())
  const path = url.pathname.replace(/^.*\/api\/v2/, "")
  const token = route.request().headers().authorization

  if (path === "/auth/login") {
    const body = route.request().postDataJSON() as { email?: string }
    if (body.email === "wrong@example.com") return json(route, { error: { message: "Email hoặc mật khẩu không đúng" } }, 401)
    return json(route, { access_token: "e2e-member-token", refresh_token: "e2e-refresh-token", token_type: "bearer" })
  }
  if (path === "/auth/refresh") return json(route, { access_token: "e2e-member-token", refresh_token: "e2e-refresh-token", token_type: "bearer" })
  if (path === "/auth/me") {
    if (!token) return json(route, { error: { message: "Chưa đăng nhập" } }, 401)
    return json(route, { id: "member-1", email: "member@example.com", full_name: "Nhà đầu tư thử nghiệm", role: "user" })
  }
  if (path === "/premium/me") return json(route, { is_premium: false })
  if (path === "/premium/plans") return json(route, [{ id: "plan-month", name: "Premium tháng", duration_days: 30, price_vnd: 199000, is_active: true }])
  if (path === "/premium/my-orders") return json(route, [])
  if (path.startsWith("/lessons/courses")) {
    if (url.searchParams.get("search") === "không tồn tại") return json(route, { items: [], total: 0, page: 1, page_size: 12, total_pages: 0 })
    return json(route, { items: [{ id: "course-1", slug: "nhap-mon-chung-khoan", title: "Nhập môn chứng khoán", description: "Nền tảng cho người mới bắt đầu", thumbnail_url: null, level: "beginner", category: "basics", is_premium: false, total_episodes: 3, total_duration_seconds: 1800 }], total: 1, page: 1, page_size: 12, total_pages: 1 })
  }
  if (path === "/auth/logout") return json(route, {}, 204)
  if (path.startsWith("/market-data") || path.startsWith("/stocks") || path.startsWith("/market")) return json(route, { items: [], total: 0 })
  return json(route, {})
}

export function assertV2Request(page: Page) {
  const requests: string[] = []
  page.on("request", request => {
    if (request.url().includes("/api/")) requests.push(request.url())
  })
  return () => requests
}
