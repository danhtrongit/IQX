/**
 * Spec 22-10 QA-06 (phần Flashback): ở độ rộng 390px màn Flashback không tràn ngang, chữ đủ
 * tương phản (không có chữ xám mờ) và thanh nút cố định ở đáy hiện đủ Mua · Bán · Phiên tiếp.
 * FB-11c: Mua và Bán ở đáy bị khoá khi chưa tham gia đề.
 *
 * Chạy với API giả lập (fixtures.ts) cộng các route Flashback bên dưới, không cần backend.
 */
import type { Page, Route } from "@playwright/test"
import { expect, seedMember, test } from "./fixtures"

const MATCH_PRICE = 28_800

function bars(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const close = MATCH_PRICE - 400 + (index % 9) * 80
    return {
      session: offset + index,
      open: close - 60,
      high: close + 150,
      low: close - 180,
      close: index === count - 1 && offset === 0 ? MATCH_PRICE : close,
      volume: 1_000_000 + index * 1_000,
    }
  })
}

function entry(step: number) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    step,
    cash: "10000000",
    holdings: 0,
    total_assets: "10000000",
    pnl_pct: 0,
    pnl_percent: 0,
    max_drawdown: 0,
    max_drawdown_percent: 0,
    status: "playing",
    joined_at: "2026-10-22T13:00:00.000Z",
    finished_at: null,
    final_nav: null,
    rank: null,
    reward_xu: 0,
    reward_eligible: true,
    indicator_params: [],
    positions: [],
    orders: [],
  }
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
}

/** Route Flashback giả: một đề đang mở, tham gia được một lần. */
async function mockFlashback(page: Page) {
  let joined = false
  await page.route("**/api/v2/flashback/**", async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^.*\/api\/v2/, "")
    const method = route.request().method()
    if (path === "/flashback/current" && method === "GET") {
      return json(route, {
        round_id: "22222222-2222-4222-8222-222222222222",
        round_no: 7,
        closes_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        player_count: 12,
        fee_xu: 100,
        first_join_free: true,
        reward_table: [
          { from_rank: 1, to_rank: 1, xu: 1_000 },
          { from_rank: 2, to_rank: 3, xu: 500 },
          { from_rank: 4, to_rank: 10, xu: 200 },
        ],
        joined,
        my_entry: joined ? entry(0) : null,
        bars: bars(60),
        played_bars: [],
        warmup_bars: [],
        history_sessions: 60,
        play_sessions: 60,
        total_sessions: 120,
      })
    }
    if (path === "/flashback/current/join" && method === "POST") {
      joined = true
      return json(route, {
        entry_id: "11111111-1111-4111-8111-111111111111",
        round_id: "22222222-2222-4222-8222-222222222222",
        first_join: true,
        fee_xu: 0,
        cash: "10000000",
        joined_at: "2026-10-22T13:00:00.000Z",
      })
    }
    if (path === "/flashback/current/leaderboard") {
      return json(route, { scope: "all", rows: [{ rank: 1, username: "ngoclan.vo", pnl_pct: 0.12, is_me: false }], me: null, total_players: 12 })
    }
    if (path === "/flashback/indicators") return json(route, { indicators: [] })
    return json(route, {})
  })
}

/** Văn bản hiển thị có tương phản dưới 4,5:1 so với nền thật phía sau (bỏ qua nút đang khoá). */
async function lowContrastTexts(page: Page) {
  return page.evaluate(() => {
    function parse(color: string): [number, number, number, number] | null {
      // Token màu dùng oklch: để canvas đổi mọi cú pháp màu CSS sang RGBA.
      if (!color || color === "transparent") return null
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = "#000"
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D
    function luminance([r, g, b]: [number, number, number, number]) {
      const channel = (value: number) => {
        const v = value / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    function background(element: Element | null): [number, number, number, number] {
      for (let node = element; node; node = node.parentElement) {
        const color = parse(getComputedStyle(node).backgroundColor)
        if (color && color[3] >= 0.6) return color
      }
      return parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255, 1]
    }
    const offenders: string[] = []
    let checked = 0
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim()
      const element = node.parentElement
      if (!text || !element) continue
      if (element.closest("[disabled], [aria-disabled='true'], [aria-hidden='true'], .sr-only, svg, canvas")) continue
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden" || Number(style.opacity) === 0) continue
      // Chữ bị lớp khác phủ lên (ví dụ chú giải biểu đồ dưới thẻ tham gia) không phải chữ người dùng đọc.
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      if (top && top !== element && !element.contains(top) && !top.contains(element)) continue
      const foreground = parse(style.color)
      if (!foreground) continue
      const back = background(element)
      checked += 1
      const [lighter, darker] = [luminance(foreground), luminance(back)].sort((a, b) => b - a)
      const ratio = (lighter + 0.05) / (darker + 0.05)
      if (ratio < 4.5) offenders.push(`${text.slice(0, 40)} (${ratio.toFixed(2)}:1)`)
    }
    // Phải thật sự đọc được chữ trên màn, nếu không phép kiểm tra không có nghĩa.
    if (checked < 10) offenders.push(`chỉ kiểm tra được ${checked} đoạn chữ`)
    return offenders
  })
}

async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}

for (const theme of ["dark", "light"] as const) {
  test(`Flashback ở 390px (${theme}): không tràn ngang, chữ rõ, thanh đáy khoá Mua/Bán khi chưa tham gia`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: theme })
    await page.addInitScript((value) => {
      try {
        localStorage.setItem("iqx.v2.theme", value)
      } catch {
        // Bỏ qua khi trình duyệt chặn localStorage.
      }
    }, theme)
    await seedMember(page)
    await mockFlashback(page)
    await page.goto("/demo-trading?view=flashback")

    // Panel Giao dịch mở phủ màn chính trên điện thoại: kiểm tra rồi đóng lại.
    const panel = page.getByRole("complementary", { name: "Flashback" })
    await expect(panel).toBeVisible()
    await expect(panel.getByText("Giá khớp")).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
    expect(await lowContrastTexts(page)).toEqual([])
    await page.getByRole("button", { name: "Đóng công cụ" }).click()
    await expect(panel).toBeHidden()

    const joinCard = page.getByTestId("join-card")
    await expect(joinCard).toBeVisible()
    const buy = page.getByTestId("flashback-buy-mobile")
    const sell = page.getByTestId("flashback-sell-mobile")
    const next = page.getByTestId("flashback-next-mobile")
    await expect(buy).toBeVisible()
    await expect(sell).toBeVisible()
    await expect(next).toBeVisible()
    await expect(buy).toBeDisabled()
    await expect(sell).toBeDisabled()
    await expect(next).toBeDisabled()

    // Thanh đáy nằm trọn trong màn hình.
    const bar = await buy.evaluate((element) => element.parentElement?.getBoundingClientRect().toJSON() as DOMRect)
    expect(bar.left).toBeGreaterThanOrEqual(0)
    expect(bar.right).toBeLessThanOrEqual(390)
    expect(bar.bottom).toBeLessThanOrEqual(844)

    expect(await noHorizontalOverflow(page)).toBe(true)
    expect(await lowContrastTexts(page)).toEqual([])

    await joinCard.getByRole("button", { name: "Tham gia miễn phí" }).click()
    await expect(joinCard).toBeHidden()
    await expect(buy).toBeEnabled()
    await expect(sell).toBeEnabled()
    await expect(next).toBeEnabled()
    expect(await noHorizontalOverflow(page)).toBe(true)
    expect(await lowContrastTexts(page)).toEqual([])

    // Bấm Mua ở đáy mở lại panel đặt lệnh.
    await buy.click()
    await expect(panel).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
  })
}
