/**
 * Bộ dùng chung của các spec IQLine trên Canvas thật với API giả lập (không cần backend): nến giả lập theo thời gian, route giả cho `ohlcv`,
 * bảng giá và hình vẽ, đọc điểm ảnh của từng lớp canvas, chọn giao diện sáng hoặc tối, bấm có chờ một khung vẽ.
 *
 * Ảnh chụp chỉ ghi khi đặt IQLINE_SHOTS=<thư mục> (để xem bằng mắt, không ghi vào repo).
 */
import path from "node:path"
import type { Locator, Page, Route } from "@playwright/test"
import { expect } from "./fixtures"

const DAY = 86_400
const ICT = 7 * 3600

/** Giá đóng cửa giả lập, chỉ phụ thuộc thời gian nên các lần xin chồng nhau cho cùng một nến (nghìn đồng). */
function closeAt(symbol: string, time: number): number {
  const base = symbol === "VN30" ? 1_250 : symbol === "VNINDEX" ? 1_280 : 27
  const scale = base / 27
  const t = time / DAY
  const noise = Math.sin(time * 12.9898) * 43_758.5453
  return base + Math.sin(t / 9) * 3.4 * scale + Math.sin(t / 3.1) * 0.9 * scale + (noise - Math.floor(noise) - 0.5) * 0.5 * scale
}

function stepSeconds(interval: string): number {
  return { "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1H": 3600, "1D": DAY, "1W": 7 * DAY, "1M": 30 * DAY }[interval] ?? DAY
}

export type MockBar = { time: number; open: number; high: number; low: number; close: number; volume: number }

/** Nến giả lập trong `[start, end]` (ngày Việt Nam): ngày thường, khung trong ngày chỉ trong giờ giao dịch. */
export function barsFor(symbol: string, interval: string, start: string, end: string): MockBar[] {
  const from = Date.parse(`${start}T00:00:00+07:00`) / 1000
  const to = Date.parse(`${end}T23:59:59+07:00`) / 1000
  const step = stepSeconds(interval)
  const bars: MockBar[] = []
  const push = (time: number) => {
    const close = closeAt(symbol, time)
    const open = closeAt(symbol, time - step)
    const wick = Math.abs(Math.sin(time)) * 0.35 * (close / 27)
    bars.push({ time, open, high: Math.max(open, close) + wick, low: Math.min(open, close) - wick, close, volume: Math.round(900_000 + Math.abs(Math.sin(time / 7)) * 2_500_000) })
  }
  if (step < DAY) {
    for (let day = Math.floor((from + ICT) / DAY) * DAY - ICT; day <= to; day += DAY) {
      const weekday = new Date((day + ICT) * 1000).getUTCDay()
      if (weekday === 0 || weekday === 6) continue
      for (const [open, close] of [[9 * 3600, 11.5 * 3600], [13 * 3600, 14.75 * 3600]]) {
        for (let second = open; second < close; second += step) {
          const time = day + second
          if (time >= from && time <= to) push(time)
        }
      }
    }
  } else {
    for (let time = Math.floor((from + ICT) / DAY) * DAY - ICT + 8 * 3600; time <= to; time += step) {
      const weekday = new Date((time + ICT) * 1000).getUTCDay()
      if (step === DAY && (weekday === 0 || weekday === 6)) continue
      push(time)
    }
  }
  return bars
}

export async function mockMarket(page: Page): Promise<void> {
  await page.route("**/api/v2/market-data/quotes/*/ohlcv*", async (route: Route) => {
    const url = new URL(route.request().url())
    const symbol = decodeURIComponent(url.pathname.split("/").at(-2) ?? "FPT")
    const data = barsFor(symbol, url.searchParams.get("interval") ?? "1D", url.searchParams.get("start") ?? "2025-01-01", url.searchParams.get("end") ?? "2026-11-05")
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) }).catch(() => undefined)
  })
  await page.route("**/api/v2/market-data/trading/price-board", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [{ symbol: "FPT", close_price: 27_500, reference_price: 27_000, ceiling_price: 28_890, floor_price: 25_110, high_price: 27_800, low_price: 26_900, total_volume: 1_200_000 }] }) }),
  )
  await page.route("**/api/v2/chart-drawings/*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ symbol: "FPT", state: null, updated_at: null }) }),
  )
}

const SHOTS = process.env.IQLINE_SHOTS
export async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

export type Layer = "base" | "data" | "drawings" | "top"
export const host = (page: Page): Locator => page.locator('[data-iqline-mode="market"]')
const layerCanvas = (page: Page, layer: Layer): Locator => page.locator(`[data-iqline-mode="market"] canvas[data-iqline-layer="${layer}"]`)

/** Số điểm ảnh có nội dung của một lớp canvas. */
export async function layerInk(page: Page, layer: Layer): Promise<number> {
  return layerCanvas(page, layer).evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d")
    if (!context || canvas.width === 0) return 0
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let ink = 0
    for (let index = 3; index < data.length; index += 4) if (data[index] > 0) ink += 1
    return ink
  })
}

export async function layerHash(page: Page, layer: Layer): Promise<string> {
  return layerCanvas(page, layer).evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL().length + ":" + canvas.toDataURL().slice(-80))
}

/** Giao diện do ThemeProvider giữ trong localStorage (khoá `theme`), nên đặt ở đó chứ không chỉ đổi prefers-color-scheme. */
export async function useScheme(page: Page, scheme: "light" | "dark"): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript((value) => localStorage.setItem("theme", value), scheme)
}

export const URL_CHART = "/demo-trading?content=chart&symbol=FPT&interval=D"

export async function openChart(page: Page, url = URL_CHART): Promise<void> {
  await page.goto(url)
  await expect(host(page)).toBeVisible()
  await expect(page.getByRole("group", { name: "Chú giải biểu đồ" })).toBeVisible()
  await expect.poll(() => layerInk(page, "data"), { timeout: 10_000 }).toBeGreaterThan(200)
}

export type Box = { x: number; y: number; width: number; height: number }

export async function chartBox(page: Page): Promise<Box> {
  const box = await host(page).boundingBox()
  if (!box) throw new Error("Không có khung biểu đồ")
  return box
}

export const at = (box: Box, [fx, fy]: [number, number]) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy })

/** Chờ một khung vẽ trước khi đọc Canvas. */
export const SETTLE_MS = 90

/** Bấm liền nhau không chờ khung render: bộ điều khiển giữ trạng thái dispatch mới nhất (`isStaleState`), nên không mất điểm neo. */
export async function click(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y)
  await page.mouse.click(x, y)
}

/** Đưa con trỏ ra ngoài biểu đồ để ảnh không có crosshair che nét. */
export async function park(page: Page): Promise<void> {
  await page.mouse.move(4, 4)
}

/** Các hình đã lưu trong bản đệm trình duyệt của mã FPT (khách). */
export async function savedDrawings(page: Page): Promise<{ id: string; tool: string; anchors: { time?: number; session?: number; price: number }[]; locked?: boolean; hidden?: boolean; text?: string }[]> {
  return page.evaluate(() => {
    const entry = Object.entries(localStorage).find(([key]) => key.startsWith("iqx.iqline_drawings_v1_") && key.endsWith(":FPT"))
    return entry ? (JSON.parse(entry[1]) as { iqline: { drawings: never[] } }).iqline.drawings : []
  })
}
