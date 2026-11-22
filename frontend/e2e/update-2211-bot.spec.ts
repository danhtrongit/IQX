/**
 * Update 22-11 · Bot và Chiến lược v2.0 (frontend-observable cases), API mocked:
 * `backend/docs/update-22-11/IQX-Bot-Chien-Luoc-SPEC.md` §5 (Bot panel, Lịch phiên), §8.2–8.4 (THÔNG BÁO, chuông, tắt qua email), §9.
 * The Bot reads go through the in-page fake of `u1911-support`; the v2.0 schedule, strategy options and notification
 * endpoints are served here from a small state so a test can see what the page wrote.
 */
import type { Page, Route } from "@playwright/test"

import { expect, test } from "./fixtures"
import { json, mockMember, overflows } from "./u1911-support"

test.describe.configure({ timeout: 90_000 })

type Call = { method: string; path: string; body: unknown }

const CONTENT = { universe: { type: "vn30" }, indicators: {}, max_holding: 30 }
const IQX_RUNNING = { session_date: "2026-11-06", source: "iqx", id: "iqx-1", name: "Theo xu hướng", version: 2, version_label: "v2", hidden: false, content: CONTENT }

function v2State() {
  return {
    schedule: {
      last: IQX_RUNNING,
      next: { ...IQX_RUNNING, session_date: "2026-11-09", follow_latest: false, cutoff_at: null } as Record<string, unknown>,
      iqx_update: null,
    },
    options: {
      iqx: [
        { id: "iqx-1", slug: "xu-huong", name: "Theo xu hướng", version: 2, universe_label: "VN30", max_holding: 30, hidden: false, on_bot: { last: true, next: true } },
        { id: "iqx-2", slug: "dao-chieu", name: "Bắt đảo chiều", version: 1, universe_label: "VN30", max_holding: 30, hidden: false, on_bot: { last: false, next: false } },
      ],
      mine: [{ id: "u-1", name: "RSI + SMA20", latest_version: 3, latest_saved_at: "2026-11-08T06:47:00Z", on_bot: { last: false, next: false } }],
    },
    settings: { enabled: true, types: { bulletin: true, bot_trades: true }, channels: { web: true, email: false }, email_available: true, updated_at: null },
    notifications: [
      { id: "00000000-0000-4000-8000-000000000001", type: "bot_trades", trade_date: "2026-11-06", title: "Bot giao dịch · phiên 06/11", body: "Mua HPG, FPT · Bán VNM (hết thời gian giữ)", link: "/luyen-tap?tool=bot&bot_tab=lich-su", read_at: null as string | null, created_at: "2026-11-06T12:30:00Z" },
      { id: "00000000-0000-4000-8000-000000000002", type: "bulletin", trade_date: "2026-11-06", title: "Bản tin cuối phiên 06/11", body: "VN-Index 1.755,61 (−0,63%)", link: "/thi-truong?bt=ban-tin&date=2026-11-06", read_at: null as string | null, created_at: "2026-11-06T12:00:00Z" },
    ],
  }
}

/** Member + Bot fake, then the v2.0 endpoints on top (later routes win in Playwright). */
async function member(page: Page, calls: Call[]) {
  const state = v2State()
  await mockMember(page)
  await page.route(/\/api\/v2\/(bot\/schedule|bot\/strategy-options|me\/notification)/, async (route: Route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^.*\/api\/v2/, "")
    const method = route.request().method()
    const raw = route.request().postData()
    const body = raw ? JSON.parse(raw) : null
    calls.push({ method, path, body })
    if (path === "/bot/schedule" && method === "GET") return json(route, state.schedule)
    if (path === "/bot/strategy-options") return json(route, state.options)
    if (path === "/bot/schedule/next/impact") return json(route, { next_session: "2026-11-09", n_current: 30, n_new: 30, positions: [] })
    if (path === "/bot/schedule/next" && method === "PUT") {
      const target = body as { source: "iqx" | "user"; id: string; version?: number }
      const list = target.source === "iqx" ? state.options.iqx : state.options.mine
      const chosen = list.find((item) => item.id === target.id)!
      for (const item of [...state.options.iqx, ...state.options.mine]) item.on_bot.next = item === chosen
      state.schedule.next = { ...IQX_RUNNING, source: target.source, id: target.id, name: chosen.name, version: target.version ?? 1, version_label: target.source === "iqx" ? `v${target.version ?? 1}` : "bản 08/11 13:47", session_date: "2026-11-09", follow_latest: target.source === "user", cutoff_at: null }
      return json(route, state.schedule)
    }
    if (path === "/me/notification-settings") {
      if (method === "PUT") state.settings = { ...state.settings, ...(body as object), channels: { web: true, ...(body as { channels: object }).channels } }
      return json(route, state.settings)
    }
    const unread = () => state.notifications.filter((item) => !item.read_at).length
    if (path === "/me/notifications/unread-count") return json(route, { unread_count: unread() })
    if (path === "/me/notifications/read") {
      const read = body as { id?: string; all?: boolean }
      for (const item of state.notifications) if (read.all || item.id === read.id) item.read_at ??= "2026-11-06T13:00:00Z"
      return json(route, { unread_count: unread() })
    }
    if (path === "/me/notifications") return json(route, { items: state.notifications, unread_count: unread() })
    return route.fallback()
  })
}


test.describe("Bot v2.0 · máy tính 1440", () => {
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 1440, height: 900 }))

  test("B01 B02: panel Bot liệt kê chiến lược; Dùng hỏi, ghi phiên tới, Lịch phiên đổi theo", async ({ page }) => {
    const calls: Call[] = []
    await member(page, calls)
    await page.goto("/luyen-tap?tool=bot")
    const iqx = page.getByRole("region", { name: "Chiến lược IQX" })
    await expect(iqx).toBeVisible({ timeout: 20_000 })
    await expect(iqx.getByTestId("strategy-row")).toHaveCount(2)
    await expect(page.getByRole("region", { name: "Chiến lược của tôi" })).toContainText("RSI + SMA20")
    await expect(page.getByRole("button", { name: "Dùng Theo xu hướng" })).toHaveCount(0)
    await expect(page.getByTestId("schedule-next")).toContainText("không đổi")

    await page.getByRole("button", { name: "Dùng RSI + SMA20" }).click()
    const dialog = page.getByRole("dialog", { name: "Đổi chiến lược của Bot?" })
    await expect(dialog).toContainText("Từ phiên Thứ 2 09/11, Bot dùng RSI + SMA20")
    await dialog.getByRole("button", { name: "Dùng cho Bot" }).click()
    await expect(dialog).toBeHidden()
    expect(calls.filter((call) => call.method === "PUT" && call.path === "/bot/schedule/next").map((call) => call.body)).toEqual([
      { source: "user", id: "u-1", expected_next_session: "2026-11-09" },
    ])
    await expect(page.getByTestId("schedule-next")).toContainText("RSI + SMA20")
    await expect(page.getByTestId("schedule-next")).toContainText("có thay đổi")
    await expect(page.getByRole("button", { name: "Dùng RSI + SMA20" })).toHaveCount(0)
  })

  test("T08 T09: chuông đếm chưa đọc; bấm thông báo Bot mở tab Lịch sử", async ({ page }) => {
    const calls: Call[] = []
    await member(page, calls)
    await page.goto("/chien-luoc")
    const bell = page.getByTestId("notification-bell")
    await expect(page.getByTestId("notification-badge")).toHaveText("2", { timeout: 20_000 })
    await bell.click()
    const list = page.getByRole("list", { name: "Danh sách thông báo" })
    await expect(list.getByRole("button")).toHaveCount(2)
    await list.getByRole("button").first().click()
    await expect(page).toHaveURL(/\/luyen-tap\?tool=bot/)
    await expect(page.getByRole("tab", { name: "Lịch sử", selected: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("notification-badge")).toHaveText("1")
    expect(calls.find((call) => call.path === "/me/notifications/read")?.body).toEqual({ id: "00000000-0000-4000-8000-000000000001" })
  })
})

test.describe("Bot v2.0 · điện thoại 390", () => {
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 390, height: 844 }))

  test("§9: Bot không tràn ngang; chuông › Cài đặt thông báo mở thẻ THÔNG BÁO", async ({ page }) => {
    const calls: Call[] = []
    await member(page, calls)
    await page.goto("/chien-luoc")
    await page.getByTestId("notification-bell").click()
    await page.getByRole("button", { name: "Cài đặt thông báo" }).click()
    await expect(page).toHaveURL(/tool=bot/)
    const card = page.getByRole("region", { name: "Thông báo", exact: true })
    await expect(card).toBeVisible({ timeout: 20_000 })
    await expect(card.getByRole("switch", { name: "Bật thông báo" })).toHaveAttribute("aria-checked", "true")
    await expect(page).not.toHaveURL(/focus=/)
    expect(await overflows(page)).toBe(false)

    await card.getByRole("switch", { name: "Bot giao dịch" }).click()
    await expect.poll(() => calls.filter((call) => call.method === "PUT" && call.path === "/me/notification-settings").length).toBe(1)
    expect(await overflows(page)).toBe(false)

    await page.goto("/luyen-tap?tool=bot")
    await expect(page.getByTestId("bot-schedule")).toBeVisible({ timeout: 20_000 })
    expect(await overflows(page)).toBe(false)
  })
})

test("T07: /thong-bao/tat không cần đăng nhập, báo đã tắt", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const posted: unknown[] = []
  await page.route("**/api/v2/notifications/unsubscribe", async (route) => {
    posted.push(route.request().postDataJSON())
    return json(route, { type: "bulletin", status: "unsubscribed" })
  })
  await page.goto("/thong-bao/tat?token=abc.def")
  await expect(page.getByRole("heading", { name: "Đã tắt thông báo Bản tin cuối phiên." })).toBeVisible({ timeout: 20_000 })
  expect(posted).toEqual([{ token: "abc.def" }])
  expect(await overflows(page)).toBe(false)
})
