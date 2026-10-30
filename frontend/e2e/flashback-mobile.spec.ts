/**
 * Flashback v2 "Phòng chơi" ở 390px, cả giao diện tối và sáng: sảnh, hộp tạo phòng, phòng chờ và
 * màn chơi đều không tràn ngang, chữ đủ tương phản (không có chữ xám mờ), và thanh nút cố định ở
 * đáy màn chơi hiện đủ Mua, Bán, Phiên tiếp.
 *
 * Chạy với API giả lập (fixtures.ts) cộng các route Flashback bên dưới, không cần backend.
 */
import type { Page, Route } from "@playwright/test"
import { expect, seedMember, test } from "./fixtures"

const ROOM_ID = "482913"
const MATCH_ID = "11111111-1111-4111-8111-111111111111"
const PRICE = 28_800
const VIEW_BARS = 60
const PLAY_BARS = 30

function bars(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const close = PRICE - 400 + (index % 9) * 80
    return {
      session: offset + index,
      open: close - 60,
      high: close + 150,
      low: close - 180,
      close: offset === 0 && index === count - 1 ? PRICE : close,
      volume: 1_000_000 + index * 1_000,
    }
  })
}

const member = (id: string, name: string, owner: boolean) => ({
  avatar_url: null,
  is_me: id === "member-1",
  is_owner: owner,
  joined_at: "2026-10-30T01:00:00.000Z",
  name,
  user_id: id,
})

function room(stage: "waiting" | "playing") {
  return {
    auto_close_at: null,
    created_at: "2026-10-30T01:00:00.000Z",
    id: ROOM_ID,
    is_owner: true,
    locked: false,
    match:
      stage === "playing"
        ? { ends_at: "2026-10-30T01:10:00.000Z", id: MATCH_ID, joined: true, started_at: "2026-10-30T01:00:00.000Z", status: "playing" }
        : null,
    max_players: 4,
    members: [member("member-1", "Nhà đầu tư thử nghiệm", true), member("member-2", "Minh", false)],
    minutes: 10,
    owner_id: "member-1",
    play_bars: PLAY_BARS,
    server_now: "2026-10-30T01:00:30.000Z",
    stake_xu: 100,
    status: stage,
    view_bars: VIEW_BARS,
  }
}

const players = [
  { avatar_url: null, finished: false, is_me: true, name: "Nhà đầu tư thử nghiệm", pnl_pct: 0, pnl_percent: 0, user_id: "member-1" },
  { avatar_url: null, finished: false, is_me: false, name: "Minh", pnl_pct: 0.021, pnl_percent: 2.1, user_id: "member-2" },
]

function me(step: number) {
  return {
    auto_finished: false,
    cash: "10000000",
    finished: false,
    holdings: 0,
    max_buy_qty: 346,
    orders: [],
    play_bars: PLAY_BARS,
    pnl_pct: 0,
    pnl_percent: 0,
    positions: [],
    price: String(PRICE),
    sellable: 0,
    step,
    total_assets: "10000000",
  }
}

function snapshot(step: number) {
  return {
    ends_at: "2026-10-30T01:10:00.000Z",
    history_bars: bars(VIEW_BARS),
    initial_cash: "10000000",
    match_id: MATCH_ID,
    me: me(step),
    minutes: 10,
    my_finished: false,
    my_step: step,
    play_bars: PLAY_BARS,
    played_bars: bars(step, VIEW_BARS),
    players,
    playing_count: 2,
    pot_xu: 200,
    remaining_ms: 420_000,
    room_id: ROOM_ID,
    server_now: "2026-10-30T01:00:30.000Z",
    stake_xu: 100,
    started_at: "2026-10-30T01:00:00.000Z",
    status: "playing",
    view_bars: VIEW_BARS,
    warmup_bars: [],
  }
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
}

/** Route Flashback v2 giả: sảnh, tạo phòng, phòng chờ, bắt đầu rồi màn chơi. */
async function mockFlashback(page: Page) {
  let stage: "lobby" | "waiting" | "playing" = "lobby"
  let step = 0
  await page.route("**/api/v2/flashback/**", async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^.*\/api\/v2/, "")
    const method = route.request().method()
    if (path === "/flashback/rooms/me") return json(route, { room: stage === "lobby" ? null : room(stage), notice: null })
    if (path === "/flashback/rooms" && method === "GET") {
      return json(route, {
        rooms: [
          {
            created_at: "2026-10-30T01:00:00.000Z",
            full: false,
            id: "111111",
            locked: true,
            max_players: 4,
            member_count: 2,
            minutes: 10,
            owner: { avatar_url: null, name: "Minh Khoa" },
            play_bars: 30,
            stake_xu: 100,
            status: "waiting",
            view_bars: 60,
          },
          {
            created_at: "2026-10-30T01:00:00.000Z",
            full: false,
            id: "222222",
            locked: false,
            max_players: 2,
            member_count: 2,
            minutes: 20,
            owner: { avatar_url: null, name: "Ngọc Lan" },
            play_bars: 45,
            stake_xu: 0,
            status: "playing",
            view_bars: 90,
          },
        ],
      })
    }
    if (path === "/flashback/rooms" && method === "POST") {
      stage = "waiting"
      return json(route, room("waiting"))
    }
    if (path === `/flashback/rooms/${ROOM_ID}` && method === "GET") return json(route, room(stage === "playing" ? "playing" : "waiting"))
    if (path === `/flashback/rooms/${ROOM_ID}/start`) {
      stage = "playing"
      return json(route, { match: snapshot(0), room: room("playing"), removed: [] })
    }
    if (path === `/flashback/matches/${MATCH_ID}` && method === "GET") return json(route, snapshot(step))
    if (path === `/flashback/matches/${MATCH_ID}/state`) {
      return json(route, {
        ends_at: "2026-10-30T01:10:00.000Z",
        match_id: MATCH_ID,
        my_finished: false,
        my_step: step,
        players,
        playing_count: 2,
        remaining_ms: 420_000,
        room_id: ROOM_ID,
        server_now: "2026-10-30T01:00:30.000Z",
        started_at: "2026-10-30T01:00:00.000Z",
        status: "playing",
      })
    }
    if (path === `/flashback/matches/${MATCH_ID}/next`) {
      step += 1
      return json(route, { bar: bars(1, VIEW_BARS + step - 1)[0], me: me(step) })
    }
    if (path === "/flashback/indicators") {
      return json(route, {
        indicators: [
          {
            id: "ma",
            name: "MA / SMA",
            chapter: 4,
            lesson_id: null,
            params: [{ key: "period", label: "Chu kỳ SMA", type: "integer", min: 5, max: 200, step: 1, unit: "phiên", default: 20, lower: null, upper: null }],
            cross_fields: [],
            warmup_sessions: 20,
          },
        ],
      })
    }
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
  test(`Flashback ở 390px (${theme}): sảnh, tạo phòng, phòng chờ và màn chơi không tràn ngang, chữ rõ, thanh đáy đủ nút`, async ({ page }) => {
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

    // Sảnh: vùng chính rộng hết cỡ, không có panel đặt lệnh.
    await expect(page.getByRole("button", { name: "Chơi phòng bất kỳ" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Vào phòng 111111" })).toBeVisible()
    await expect(page.getByRole("complementary", { name: "Flashback" })).toBeHidden()
    expect(await noHorizontalOverflow(page)).toBe(true)
    expect(await lowContrastTexts(page)).toEqual([])

    // Hộp tạo phòng.
    await page.getByRole("button", { name: "Tạo phòng" }).click()
    const dialog = page.getByTestId("flashback-create-room")
    await expect(dialog).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
    expect(await lowContrastTexts(page)).toEqual([])
    await dialog.getByRole("button", { name: "Tạo phòng" }).click()

    // Phòng chờ.
    await expect(page.getByTestId("flashback-room-id")).toHaveText(ROOM_ID)
    await expect(page.getByRole("button", { name: "Bắt đầu" })).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
    expect(await lowContrastTexts(page)).toEqual([])

    // Màn chơi: thanh người chơi, đồng hồ và thanh nút cố định ở đáy.
    await page.getByRole("button", { name: "Bắt đầu" }).click()
    await expect(page.getByTestId("flashback-clock")).toBeVisible()
    const buy = page.getByTestId("flashback-buy-mobile")
    const sell = page.getByTestId("flashback-sell-mobile")
    const next = page.getByTestId("flashback-next-mobile")
    await expect(buy).toBeVisible()
    await expect(sell).toBeVisible()
    await expect(next).toBeVisible()
    await expect(buy).toBeEnabled()
    await expect(next).toBeEnabled()
    // Panel đặt lệnh chỉ mở khi người chơi bấm, không tự bật lên lúc bắt đầu ván.
    await expect(page.getByRole("complementary", { name: "Flashback" })).toBeHidden()

    const bar = await buy.evaluate((element) => element.parentElement?.getBoundingClientRect().toJSON() as DOMRect)
    expect(bar.left).toBeGreaterThanOrEqual(0)
    expect(bar.right).toBeLessThanOrEqual(390)
    expect(bar.bottom).toBeLessThanOrEqual(844)
    expect(await noHorizontalOverflow(page)).toBe(true)
    expect(await lowContrastTexts(page)).toEqual([])

    await next.click()
    await expect(page.getByTestId("flashback-session")).toHaveText("Phiên 1")
    expect(await noHorizontalOverflow(page)).toBe(true)

    // Bấm Mua ở đáy mở panel đặt lệnh; đóng lại thì chỉ còn màn chơi.
    await buy.click()
    const panel = page.getByRole("complementary", { name: "Flashback" })
    await expect(panel).toBeVisible()
    await expect(panel.getByText("Giá khớp")).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
    expect(await lowContrastTexts(page)).toEqual([])
    await page.getByRole("button", { name: "Đóng công cụ" }).click()
    await expect(panel).toBeHidden()
  })
}
