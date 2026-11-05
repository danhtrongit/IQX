/**
 * Dữ liệu và route giả của Flashback dùng chung cho các test e2e của IQLine (`flashback-iqline.spec.ts`).
 * Giống `mockFlashback` trong `flashback-mobile.spec.ts` nhưng có thêm: nến khởi tạo (warmup), vài phiên đã chơi, hai lệnh đã khớp,
 * ba chỉ báo trong danh mục, và các trường lạ (ngày thật, mã) trong nến để kiểm tra chúng không bao giờ lên màn hình.
 */
import type { Page, Route } from "@playwright/test"

export const ROOM_ID = "482913"
export const MATCH_ID = "11111111-1111-4111-8111-111111111111"
export const PRICE = 28_800
export const VIEW_BARS = 60
export const PLAY_BARS = 30
export const WARMUP_BARS = 30
/** Số phiên đã chơi khi vào ván. */
export const START_STEP = 6
export const SECRET_SYMBOL = "VNM"
export const SECRET_DATE = "2026-01-02"

/** Nến giả lập: bước đi nhẹ có xu hướng, vài nến thân dài để nhìn rõ màu. Trường `symbol`, `date` là dữ liệu lẽ ra không có. */
export function bars(count: number, offset = 0, base = 0) {
  return Array.from({ length: count }, (_, index) => {
    const n = base + offset + index
    const close = Math.round(PRICE - 900 + n * 11 + Math.sin(n / 4.2) * 520 + Math.sin(n * 1.7) * 140)
    const open = Math.round(PRICE - 900 + (n - 1) * 11 + Math.sin((n - 1) / 4.2) * 520 + Math.sin((n - 1) * 1.7) * 140)
    return {
      session: offset + index,
      open,
      high: Math.max(open, close) + 120 + (n % 5) * 20,
      low: Math.min(open, close) - 110 - (n % 4) * 25,
      close,
      volume: 1_000_000 + Math.round(Math.abs(Math.sin(n / 3)) * 2_000_000),
      symbol: SECRET_SYMBOL,
      date: SECRET_DATE,
    }
  })
}

const member = (id: string, name: string, owner: boolean) => ({
  avatar_url: null,
  is_me: id === "member-1",
  is_owner: owner,
  joined_at: "2026-10-30T01:00:00.000Z",
  name,
  ready: true,
  user_id: id,
})

function room(stage: "waiting" | "playing") {
  return {
    auto_close_at: null,
    chat_enabled: true,
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

/** Lệnh đã khớp: mua ở phiên 2, bán ở phiên 5. */
const ORDERS = [
  { id: "o1", side: "buy", qty: 100, price: String(PRICE), step: 2, amount: "2880000", fee: "4320", tax: "0", created_at: "2026-10-30T01:01:00.000Z" },
  { id: "o2", side: "sell", qty: 100, price: String(PRICE), step: 5, amount: "2880000", fee: "4320", tax: "2880", created_at: "2026-10-30T01:02:00.000Z" },
]

function me(step: number) {
  return {
    auto_finished: false,
    cash: "10000000",
    finished: false,
    holdings: 0,
    max_buy_qty: 346,
    orders: ORDERS.filter((order) => order.step <= step),
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
    history_bars: bars(VIEW_BARS, 0, WARMUP_BARS),
    initial_cash: "10000000",
    match_id: MATCH_ID,
    me: me(step),
    minutes: 10,
    my_finished: false,
    my_step: step,
    play_bars: PLAY_BARS,
    played_bars: bars(step, VIEW_BARS, WARMUP_BARS),
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
    warmup_bars: bars(WARMUP_BARS, -WARMUP_BARS, WARMUP_BARS),
  }
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
}

const param = (key: string, label: string, min: number, max: number, def: number) => ({ key, label, type: "integer", min, max, step: 1, unit: "phiên", default: def, lower: null, upper: null })
const levelParam = (key: string, label: string, lower: number, upper: number) => ({
  key,
  label,
  type: "integer",
  min: 0,
  max: 100,
  step: 1,
  unit: "",
  default: lower,
  lower: { min: 0, max: 100, default: lower, label: `${label} dưới` },
  upper: { min: 0, max: 100, default: upper, label: `${label} trên` },
})
const meta = (id: string, name: string, params: unknown[], warmup: number) => ({ id, name, chapter: 4, lesson_id: null, params, cross_fields: [], warmup_sessions: warmup })

export const FLASHBACK_INDICATORS = [
  meta("ma", "MA / SMA", [param("period", "Chu kỳ SMA", 5, 200, 20)], 20),
  meta("rsi", "RSI", [param("period", "Chu kỳ RSI", 5, 50, 14), levelParam("level", "Ngưỡng RSI", 30, 70)], 14),
  meta("macd", "MACD", [param("fast", "Chu kỳ EMA nhanh", 2, 50, 12), param("slow", "Chu kỳ EMA chậm", 5, 100, 26), param("signal", "Chu kỳ tín hiệu", 2, 30, 9)], 26),
]

/** Route Flashback v2 giả: sảnh, tạo phòng, phòng chờ, bắt đầu rồi màn chơi (đã chơi `START_STEP` phiên). */
export async function mockFlashback(page: Page) {
  let stage: "lobby" | "waiting" | "playing" = "lobby"
  let step = START_STEP
  await page.route("**/api/v2/flashback/**", async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^.*\/api\/v2/, "")
    const method = route.request().method()
    if (path === "/flashback/rooms/me") return json(route, { room: stage === "lobby" ? null : room(stage), notice: null, kicked: false })
    if (path === "/flashback/rooms" && method === "GET") return json(route, { rooms: [] })
    if (path === "/flashback/rooms" && method === "POST") {
      stage = "waiting"
      return json(route, room("waiting"))
    }
    if (path === `/flashback/rooms/${ROOM_ID}` && method === "GET") return json(route, room(stage === "playing" ? "playing" : "waiting"))
    if (path === `/flashback/rooms/${ROOM_ID}/start`) {
      stage = "playing"
      return json(route, { match: snapshot(step), room: room("playing"), removed: [] })
    }
    if (path === `/flashback/rooms/${ROOM_ID}/chat`) return json(route, { enabled: true, messages: [], muted: [] })
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
      return json(route, { bar: bars(1, VIEW_BARS + step - 1, WARMUP_BARS)[0], me: me(step) })
    }
    if (path === "/flashback/indicators") return json(route, { indicators: FLASHBACK_INDICATORS })
    return json(route, {})
  })
}

/** Văn bản hiển thị có tương phản dưới 4,5:1 so với nền thật phía sau (bỏ qua nút đang khoá). */
export async function lowContrastTexts(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D
    function parse(color: string): [number, number, number, number] | null {
      if (!color || color === "transparent") return null
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = "#000"
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
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
    if (checked < 10) offenders.push(`chỉ kiểm tra được ${checked} đoạn chữ`)
    return offenders
  })
}

export async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}
