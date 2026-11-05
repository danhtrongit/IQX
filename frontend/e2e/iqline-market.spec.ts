/**
 * IQLine `market` trên Canvas thật, với API giả lập (không cần backend): `/bieu-do` mở bằng `?iqline=1` ở giao diện sáng, tối,
 * máy tính và điện thoại; đổi mã, đổi khung, kéo, zoom, vẽ đường xu hướng, thêm RSI.
 *
 * Ảnh chụp chỉ ghi khi đặt IQLINE_SHOTS=<thư mục> (để xem bằng mắt, không ghi vào repo).
 */
import path from "node:path"
import type { Page, Route } from "@playwright/test"
import { expect, test } from "./fixtures"

const DAY = 86_400
const ICT = 7 * 3600

/** Giá đóng cửa giả lập, chỉ phụ thuộc thời gian nên các lần xin chồng nhau cho cùng một nến (nghìn đồng). */
function closeAt(symbol: string, time: number): number {
  const base = symbol === "VN30" ? 1_250 : symbol === "VNINDEX" ? 1_280 : 27
  const scale = base / 27
  const t = time / DAY
  const noise = Math.sin(time * 12.9898) * 43_758.5453
  return (base + Math.sin(t / 9) * 3.4 * scale + Math.sin(t / 3.1) * 0.9 * scale + (noise - Math.floor(noise) - 0.5) * 0.5 * scale) * 1
}

function stepSeconds(interval: string): number {
  return { "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1H": 3600, "1D": DAY, "1W": 7 * DAY, "1M": 30 * DAY }[interval] ?? DAY
}

/** Nến giả lập trong `[start, end]` (ngày Việt Nam): ngày thường, khung trong ngày chỉ trong giờ giao dịch. */
function barsFor(symbol: string, interval: string, start: string, end: string) {
  const from = Date.parse(`${start}T00:00:00+07:00`) / 1000
  const to = Date.parse(`${end}T23:59:59+07:00`) / 1000
  const step = stepSeconds(interval)
  const bars: { time: number; open: number; high: number; low: number; close: number; volume: number }[] = []
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

type Mocks = { ohlcv: string[]; puts: unknown[] }

async function mockMarket(page: Page, options: { delayMs?: (symbol: string) => number } = {}): Promise<Mocks> {
  const mocks: Mocks = { ohlcv: [], puts: [] }
  await page.route("**/api/v2/market-data/quotes/*/ohlcv*", async (route: Route) => {
    const url = new URL(route.request().url())
    const symbol = decodeURIComponent(url.pathname.split("/").at(-2) ?? "FPT")
    mocks.ohlcv.push(`${symbol}|${url.searchParams.get("interval")}`)
    const delay = options.delayMs?.(symbol) ?? 0
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    const data = barsFor(symbol, url.searchParams.get("interval") ?? "1D", url.searchParams.get("start") ?? "2025-01-01", url.searchParams.get("end") ?? "2026-11-05")
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) }).catch(() => undefined)
  })
  await page.route("**/api/v2/market-data/trading/price-board", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [{ symbol: "FPT", close_price: 27_500, reference_price: 27_000, ceiling_price: 28_890, floor_price: 25_110, high_price: 27_800, low_price: 26_900, total_volume: 1_200_000 }] }) }),
  )
  await page.route("**/api/v2/chart-drawings/*", async (route) => {
    if (route.request().method() === "PUT") mocks.puts.push(route.request().postDataJSON())
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ symbol: "FPT", state: null, updated_at: null }) })
  })
  return mocks
}

const SHOTS = process.env.IQLINE_SHOTS
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

/** Số điểm ảnh khác nền trên bốn lớp canvas: biểu đồ thật phải có nội dung, không phải khung trắng. */
async function inkOf(page: Page): Promise<number> {
  return page.evaluate(() => {
    const host = document.querySelector('[data-iqline-mode="market"]')
    let ink = 0
    for (const canvas of host?.querySelectorAll("canvas") ?? []) {
      const context = canvas.getContext("2d")
      if (!context || canvas.width === 0) continue
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
      for (let index = 3; index < data.length; index += 4 * 7) if (data[index] > 0) ink += 1
    }
    return ink
  })
}

/** Điểm ảnh có nội dung của một lớp canvas (`base`, `data`, `drawings`, `top`). */
async function layerInk(page: Page, layer: string): Promise<number> {
  return page.evaluate((name) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`[data-iqline-mode="market"] canvas[data-iqline-layer="${name}"]`)
    const context = canvas?.getContext("2d")
    if (!canvas || !context || canvas.width === 0) return 0
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let ink = 0
    for (let index = 3; index < data.length; index += 4) if (data[index] > 0) ink += 1
    return ink
  }, layer)
}

async function canvasHash(page: Page): Promise<string> {
  return page.evaluate(() => {
    const host = document.querySelector('[data-iqline-mode="market"]')
    return [...(host?.querySelectorAll("canvas") ?? [])].map((canvas) => canvas.toDataURL().length + ":" + canvas.toDataURL().slice(-60)).join("|")
  })
}

/** Giao diện do ThemeProvider giữ trong localStorage (khoá `theme`), nên đặt ở đó chứ không chỉ đổi prefers-color-scheme. */
async function useScheme(page: Page, scheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript((value) => localStorage.setItem("theme", value), scheme)
}

const URL_CHART = "/demo-trading?content=chart&symbol=FPT&interval=D&iqline=1"
const host = (page: Page) => page.locator('[data-iqline-mode="market"]')

async function openChart(page: Page, url = URL_CHART) {
  await page.goto(url)
  await expect(host(page)).toBeVisible()
  await expect(page.getByRole("group", { name: "Chú giải biểu đồ" })).toBeVisible()
  await expect.poll(() => inkOf(page), { timeout: 10_000 }).toBeGreaterThan(200)
}

for (const scheme of ["light", "dark"] as const) {
  test(`IQLine vẽ nến thật ở máy tính, giao diện ${scheme}`, async ({ page }) => {
    await useScheme(page, scheme)
    await page.setViewportSize({ width: 1440, height: 900 })
    const mocks = await mockMarket(page)
    await openChart(page)
    // Chú giải DOM đọc được: có mã và giá O H L C, không phải ảnh.
    const legend = page.getByRole("group", { name: "Chú giải biểu đồ" })
    await expect(legend).toContainText("FPT")
    await expect(legend.getByText("Giá đóng cửa", { exact: true })).toHaveCount(1)
    await expect(page.locator("html")).toHaveClass(scheme === "dark" ? /dark/ : /^(?!.*dark)/)
    expect(mocks.ohlcv.some((entry) => entry.startsWith("FPT|1D"))).toBe(true)
    // Không còn TradingView.
    await expect(page.locator("iframe")).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await shot(page, `desktop-${scheme}`)
  })

  test(`IQLine ở điện thoại 390px, giao diện ${scheme}`, async ({ page }) => {
    await useScheme(page, scheme)
    await page.setViewportSize({ width: 390, height: 844 })
    await mockMarket(page)
    await openChart(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const canvas = host(page).locator("canvas").last()
    expect(await canvas.evaluate((element) => getComputedStyle(element).touchAction)).toBe("pan-y")
    await shot(page, `phone-${scheme}`)
  })
}

test("đổi mã: nạp nến mã mới và không mang hình vẽ của mã cũ sang", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockMarket(page)
  await openChart(page)
  // Vẽ một đường xu hướng trên FPT.
  await page.getByRole("button", { name: /^Đường:/ }).click()
  await page.getByRole("menuitem", { name: "Đường xu hướng" }).click()
  const box = (await host(page).boundingBox())!
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.35)
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.25)
  await page.getByRole("button", { name: "Danh sách hình vẽ" }).click()
  await expect(page.getByRole("list", { name: "Hình vẽ trên biểu đồ" }).getByRole("listitem")).toHaveCount(1)
  await page.keyboard.press("Escape")
  // Đổi sang VN30 bằng nút chỉ số nhanh của trang.
  await page.getByRole("radio", { name: "VN30" }).click()
  await expect(page.getByRole("group", { name: "Chú giải biểu đồ" })).toContainText("VN30")
  await expect.poll(() => inkOf(page)).toBeGreaterThan(200)
  await page.getByRole("button", { name: "Danh sách hình vẽ" }).click()
  await expect(page.getByText("Chưa có hình nào")).toBeVisible()
  await shot(page, "symbol-vn30")
})

test("đổi khung thời gian: nạp lại nến 1 phút và vẫn vẽ", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const mocks = await mockMarket(page)
  await openChart(page)
  await page.getByRole("combobox", { name: "Khung thời gian" }).first().click()
  await page.getByRole("option", { name: "5 phút", exact: true }).click()
  await expect.poll(() => mocks.ohlcv.some((entry) => entry === "FPT|5m")).toBe(true)
  await expect(host(page)).toHaveAttribute("aria-label", /khung 5/)
  await expect.poll(() => inkOf(page)).toBeGreaterThan(200)
  await shot(page, "interval-5m")
})

test("kéo và zoom làm đổi khung nhìn; nhấp đúp trục thời gian về mặc định", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockMarket(page)
  await openChart(page)
  const box = (await host(page).boundingBox())!
  const before = await canvasHash(page)
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4, { steps: 8 })
  await page.mouse.up()
  const dragged = await canvasHash(page)
  expect(dragged).not.toBe(before)
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4)
  await page.mouse.wheel(0, -400)
  await expect.poll(() => canvasHash(page)).not.toBe(dragged)
  await shot(page, "after-drag-zoom")
  await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height - 8)
  await expect.poll(() => canvasHash(page)).not.toBe(dragged)
})

test("vẽ đường xu hướng bằng hai cú bấm và lưu theo mã", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockMarket(page)
  await openChart(page)
  await page.getByRole("button", { name: /^Đường:/ }).click()
  await page.getByRole("menuitem", { name: "Đường xu hướng" }).click()
  const box = (await host(page).boundingBox())!
  const before = await canvasHash(page)
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4)
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3, { steps: 5 })
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.25)
  await expect.poll(() => canvasHash(page)).not.toBe(before)
  // Đường phải nằm thật trên lớp hình vẽ, không chỉ có tay nắm ở lớp trên cùng.
  await expect.poll(() => layerInk(page, "drawings")).toBeGreaterThan(300)
  await expect(page.getByRole("toolbar", { name: "Kiểu của Đường xu hướng" })).toBeVisible()
  await shot(page, "trend-line")
  // Bản đệm trình duyệt có đúng một hình của FPT.
  await expect
    .poll(() => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("iqx.iqline_drawings_v1_") && key.endsWith(":FPT")).map(([, value]) => JSON.parse(value).iqline.drawings.length)))
    .toEqual([1])
})

test("thêm RSI từ hộp thoại chỉ báo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockMarket(page)
  await openChart(page)
  await page.getByRole("button", { name: "Chỉ báo" }).click()
  const dialog = page.getByRole("dialog", { name: "Thêm chỉ báo" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("textbox", { name: "Tìm chỉ báo" }).fill("RSI")
  await dialog.getByRole("button", { name: "RSI", exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("group", { name: "Chú giải biểu đồ" })).toContainText("RSI (14)")
  await shot(page, "rsi-added")
  // Mở cài đặt, đổi chu kỳ.
  await page.getByRole("button", { name: "Cài đặt RSI (14)" }).click({ force: true })
  const edit = page.getByRole("dialog", { name: /Cài đặt RSI/ })
  await edit.getByLabel("Chu kỳ RSI").fill("21")
  await edit.getByRole("button", { name: "Lưu" }).click()
  await expect(page.getByRole("group", { name: "Chú giải biểu đồ" })).toContainText("RSI (21)")
})

test("trang chi tiết cổ phiếu bật IQLine bằng ?iqline=1 và mặc định vẫn là TradingView", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockMarket(page)
  await openChart(page, "/co-phieu/FPT?iqline=1")
  await shot(page, "stock-detail")
  await page.goto("/co-phieu/FPT")
  await expect(host(page)).toHaveCount(0)
})
