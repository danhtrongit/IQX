/**
 * Công cụ vẽ đợt 2 của IQLine trên Canvas thật, với API giả lập (không cần backend): vùng thời gian Fibonacci, quạt Fibonacci, kênh Fibonacci,
 * Pitchfork Andrews, quạt Gann, hộp Gann, XABCD, vai đầu vai và mẫu hình tam giác.
 *
 * - Vẽ từng công cụ ở máy tính và điện thoại, giao diện sáng và tối: xem trước, hoàn tất, nét thật trên lớp hình vẽ, tay nắm trên lớp trên cùng.
 * - Một vòng đủ ở máy tính sáng: chọn lại bằng cách bấm vào nét, kéo tay nắm, khoá, ẩn, nhân bản, lưu rồi nạp lại trang.
 * - Vùng thời gian Fibonacci được đo thẳng trên điểm ảnh: khoảng cách giữa các vạch phải theo dãy 1, 1, 1, 2, 3, 5.
 *
 * Ảnh chụp chỉ ghi khi đặt IQLINE_SHOTS=<thư mục> (để xem bằng mắt, không ghi vào repo).
 */
import path from "node:path"
import type { Locator, Page, Route } from "@playwright/test"
import { expect, test } from "./fixtures"

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

async function mockMarket(page: Page): Promise<void> {
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
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

type Layer = "base" | "data" | "drawings" | "top"
const host = (page: Page) => page.locator('[data-iqline-mode="market"]')
const layerCanvas = (page: Page, layer: Layer) => page.locator(`[data-iqline-mode="market"] canvas[data-iqline-layer="${layer}"]`)

/** Số điểm ảnh có nội dung của một lớp canvas. */
async function layerInk(page: Page, layer: Layer): Promise<number> {
  return layerCanvas(page, layer).evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d")
    if (!context || canvas.width === 0) return 0
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let ink = 0
    for (let index = 3; index < data.length; index += 4) if (data[index] > 0) ink += 1
    return ink
  })
}

async function layerHash(page: Page, layer: Layer): Promise<string> {
  return layerCanvas(page, layer).evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL().length + ":" + canvas.toDataURL().slice(-80))
}

/** Giao diện do ThemeProvider giữ trong localStorage (khoá `theme`), nên đặt ở đó chứ không chỉ đổi prefers-color-scheme. */
async function useScheme(page: Page, scheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: scheme })
  await page.addInitScript((value) => localStorage.setItem("theme", value), scheme)
}

const URL_CHART = "/demo-trading?content=chart&symbol=FPT&interval=D"

async function openChart(page: Page) {
  await page.goto(URL_CHART)
  await expect(host(page)).toBeVisible()
  await expect(page.getByRole("group", { name: "Chú giải biểu đồ" })).toBeVisible()
  await expect.poll(() => layerInk(page, "data"), { timeout: 10_000 }).toBeGreaterThan(200)
}

type ToolCase = {
  tool: string
  label: string
  /** Mã nhóm trên thanh công cụ (`data-tool-group`). */
  group: "fib" | "pitchfork" | "pattern"
  /** Điểm neo theo tỷ lệ của khung biểu đồ (x từ trái, y từ trên xuống), nằm trong vùng nến. */
  points: [number, number][]
}

const TOOLS: ToolCase[] = [
  { tool: "fib-time-zones", label: "Vùng thời gian Fibonacci", group: "fib", points: [[0.14, 0.58], [0.2, 0.42]] },
  { tool: "fib-fan", label: "Quạt Fibonacci", group: "fib", points: [[0.1, 0.78], [0.46, 0.24]] },
  { tool: "fib-channel", label: "Kênh Fibonacci", group: "fib", points: [[0.1, 0.72], [0.5, 0.5], [0.3, 0.26]] },
  { tool: "pitchfork", label: "Pitchfork Andrews", group: "pitchfork", points: [[0.1, 0.72], [0.3, 0.24], [0.46, 0.56]] },
  { tool: "gann-fan", label: "Quạt Gann", group: "pitchfork", points: [[0.1, 0.78], [0.28, 0.58]] },
  { tool: "gann-box", label: "Hộp Gann", group: "pitchfork", points: [[0.14, 0.72], [0.62, 0.24]] },
  { tool: "xabcd", label: "Mẫu hình XABCD", group: "pattern", points: [[0.08, 0.7], [0.22, 0.2], [0.34, 0.5], [0.5, 0.28], [0.66, 0.62]] },
  { tool: "head-shoulders", label: "Vai đầu vai", group: "pattern", points: [[0.06, 0.68], [0.17, 0.42], [0.25, 0.58], [0.4, 0.22], [0.53, 0.58], [0.63, 0.42], [0.76, 0.68]] },
  { tool: "triangle-pattern", label: "Mẫu hình tam giác", group: "pattern", points: [[0.1, 0.2], [0.2, 0.76], [0.46, 0.38], [0.62, 0.6]] },
]

type Box = { x: number; y: number; width: number; height: number }
const at = (box: Box, [fx, fy]: [number, number]) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy })

async function pickTool(page: Page, tool: ToolCase) {
  await page.locator(`[data-tool-group="${tool.group}"]`).click()
  await page.locator(`[data-tool="${tool.tool}"]`).click()
  // Công cụ đã bật thì nút nhóm sáng. Menu đóng xong mới bấm lên biểu đồ: trong lúc menu còn đóng dần, lần bấm đầu rơi vào lớp phủ của menu.
  await expect(page.locator(`[data-tool-group="${tool.group}"]`)).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("menu")).toHaveCount(0)
  await page.waitForTimeout(150)
}

/** Bấm hết các điểm neo; trả về số điểm ảnh ở lớp trên cùng khi đang xem trước (đã bấm đủ trừ điểm cuối, con trỏ ở điểm cuối). */
async function drawTool(page: Page, tool: ToolCase, box: Box): Promise<number> {
  await pickTool(page, tool)
  const last = tool.points.length - 1
  for (let index = 0; index < last; index++) {
    const point = at(box, tool.points[index])
    await click(page, point.x, point.y)
  }
  const target = at(box, tool.points[last])
  await page.mouse.move(target.x, target.y, { steps: 6 })
  // Chờ một khung vẽ để lớp xem trước có nét.
  await page.waitForTimeout(90)
  const previewInk = await layerInk(page, "top")
  await click(page, target.x, target.y)
  return previewInk
}

const styleBar = (page: Page, tool: ToolCase) => page.getByRole("toolbar", { name: `Kiểu của ${tool.label}` })

/** Bấm liền nhau không chờ khung render: bộ điều khiển giữ trạng thái dispatch mới nhất (`isStaleState`), nên không mất điểm neo. */
async function click(page: Page, x: number, y: number) {
  await page.mouse.move(x, y)
  await page.mouse.click(x, y)
}

/** Điểm trống trong vùng nến (không công cụ nào đi qua): bấm vào đây thì bỏ chọn hình. */
const EMPTY: [number, number] = [0.88, 0.78]

/** Đưa con trỏ ra ngoài biểu đồ để ảnh không có crosshair che nét. */
async function park(page: Page) {
  await page.mouse.move(4, 4)
}

async function chartBox(page: Page): Promise<Box> {
  const box = await host(page).boundingBox()
  if (!box) throw new Error("Không có khung biểu đồ")
  return box
}

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const

for (const scheme of ["light", "dark"] as const) {
  for (const viewport of VIEWPORTS) {
    test(`chín công cụ đợt 2: vẽ từng công cụ ở ${viewport.name}, giao diện ${scheme}`, async ({ page }) => {
      test.setTimeout(120_000)
      await useScheme(page, scheme)
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await mockMarket(page)
      await openChart(page)
      const box = await chartBox(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(await layerInk(page, "drawings")).toBe(0)

      for (const tool of TOOLS) {
        const before = await layerInk(page, "top")
        const previewInk = await drawTool(page, tool, box)
        // Xem trước: các điểm đã bấm và nét chạy theo con trỏ nằm ở lớp trên cùng, trước khi hình hoàn tất.
        expect(previewInk, `${tool.tool}: xem trước`).toBeGreaterThan(before + 30)
        // Hoàn tất: hình đang chọn có thanh kiểu, nét thật trên lớp hình vẽ, tay nắm trên lớp trên cùng.
        await expect(styleBar(page, tool), `${tool.tool}: thanh kiểu`).toBeVisible()
        await expect.poll(() => layerInk(page, "drawings"), { message: `${tool.tool}: nét trên lớp hình vẽ` }).toBeGreaterThan(400)
        await expect.poll(() => layerInk(page, "top"), { message: `${tool.tool}: tay nắm` }).toBeGreaterThan(0)
        await park(page)
        await shot(page, `${viewport.name}-${scheme}-${tool.tool}`)
        await page.getByRole("button", { name: "Xoá hình", exact: true }).click()
        await expect.poll(() => layerInk(page, "drawings"), { message: `${tool.tool}: xoá` }).toBe(0)
      }
    })
  }
}

test("vòng đủ ở máy tính sáng: chọn bằng cách bấm vào nét, kéo tay nắm, khoá, ẩn, nhân bản, lưu rồi nạp lại", async ({ page }) => {
  test.setTimeout(240_000)
  await useScheme(page, "light")
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockMarket(page)
  await openChart(page)
  const box = await chartBox(page)
  const list = page.getByRole("list", { name: "Hình vẽ trên biểu đồ" })
  const openList = async () => {
    await page.getByRole("button", { name: "Danh sách hình vẽ" }).click()
  }
  const closeList = () => page.keyboard.press("Escape")

  for (const tool of TOOLS) {
    await drawTool(page, tool, box)
    await expect(styleBar(page, tool)).toBeVisible()

    // Bỏ chọn bằng cách bấm vào chỗ trống, rồi chọn lại bằng cách bấm đúng vào điểm neo đầu (nằm trên một nét của mọi công cụ).
    const first = at(box, tool.points[0])
    const empty = at(box, EMPTY)
    await click(page, empty.x, empty.y)
    await expect(styleBar(page, tool), `${tool.tool}: bỏ chọn`).toBeHidden()
    await click(page, first.x, first.y)
    await expect(styleBar(page, tool), `${tool.tool}: chọn lại bằng cách bấm vào nét`).toBeVisible()

    // Kéo tay nắm của điểm neo đầu: lớp hình vẽ đổi.
    const beforeDrag = await layerHash(page, "drawings")
    await page.mouse.move(first.x, first.y)
    await page.mouse.down()
    await page.mouse.move(first.x + 18, first.y + 14, { steps: 6 })
    await page.mouse.up()
    await expect.poll(() => layerHash(page, "drawings"), { message: `${tool.tool}: kéo tay nắm` }).not.toBe(beforeDrag)

    // Khoá: tay nắm biến mất và kéo vào điểm neo không đổi hình.
    await page.getByRole("button", { name: "Khoá hình" }).click()
    await expect.poll(() => layerInk(page, "top"), { message: `${tool.tool}: khoá bỏ tay nắm` }).toBe(0)
    const moved = first
    const locked = await layerHash(page, "drawings")
    await page.mouse.move(moved.x + 18, moved.y + 14)
    await page.mouse.down()
    await page.mouse.move(moved.x + 60, moved.y + 40, { steps: 4 })
    await page.mouse.up()
    expect(await layerHash(page, "drawings"), `${tool.tool}: khoá chặn kéo`).toBe(locked)
    await page.getByRole("button", { name: "Mở khoá hình" }).click()

    // Ẩn rồi hiện lại từ danh sách.
    await page.getByRole("button", { name: "Ẩn hình" }).click()
    await expect.poll(() => layerInk(page, "drawings"), { message: `${tool.tool}: ẩn` }).toBe(0)
    await openList()
    await page.getByRole("button", { name: `Hiện ${tool.label}`, exact: true }).click()
    await closeList()
    await expect.poll(() => layerInk(page, "drawings"), { message: `${tool.tool}: hiện lại` }).toBeGreaterThan(400)

    // Nhân bản: chọn lại hình (điểm neo đầu đã dời 18, 14), danh sách có hai hình.
    await click(page, first.x + 18, first.y + 14)
    await expect(styleBar(page, tool), `${tool.tool}: chọn trước khi nhân bản`).toBeVisible()
    await page.getByRole("button", { name: "Nhân bản hình" }).click()
    await openList()
    await expect(list.getByRole("listitem"), `${tool.tool}: nhân bản`).toHaveCount(2)
    // Xoá tất cả cho công cụ kế tiếp (bấm hai lần để xác nhận).
    await page.getByRole("button", { name: "Xoá tất cả" }).click()
    await page.getByRole("button", { name: "Bấm lần nữa để xoá" }).click()
    await closeList()
    await expect.poll(() => layerInk(page, "drawings"), { message: `${tool.tool}: dọn` }).toBe(0)
  }

  // Lưu và nạp lại: vẽ cả chín công cụ trên cùng một biểu đồ, kiểm bản đệm rồi tải lại trang.
  for (const tool of TOOLS) {
    await drawTool(page, tool, box)
    await expect(styleBar(page, tool)).toBeVisible()
    const empty = at(box, EMPTY)
    await click(page, empty.x, empty.y)
  }
  await park(page)
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.entries(localStorage)
          .filter(([key]) => key.startsWith("iqx.iqline_drawings_v1_") && key.endsWith(":FPT"))
          .map(([, value]) => (JSON.parse(value) as { iqline: { drawings: { tool: string; anchors: unknown[] }[] } }).iqline.drawings.map((drawing) => `${drawing.tool}:${drawing.anchors.length}`)),
      ),
    )
    .toEqual([TOOLS.map((tool) => `${tool.tool}:${tool.points.length}`)])
  await shot(page, "desktop-light-all-nine")
  const beforeReload = await layerInk(page, "drawings")
  await page.reload()
  await expect(host(page)).toBeVisible()
  await expect.poll(() => layerInk(page, "data"), { timeout: 10_000 }).toBeGreaterThan(200)
  await expect.poll(() => layerInk(page, "drawings"), { message: "nạp lại: hình vẽ về đúng chỗ" }).toBeGreaterThan(beforeReload * 0.9)
  await openList()
  await expect(list.getByRole("listitem")).toHaveCount(TOOLS.length)
  await closeList()
  await shot(page, "desktop-light-all-nine-reloaded")
})

/** Các cột có nét dọc trên một hàng điểm ảnh của lớp hình vẽ, gộp các cột liền nhau; trả về vị trí giữa (CSS pixel). */
async function verticalLineXs(canvas: Locator, rowFraction: number): Promise<number[]> {
  return canvas.evaluate((element: HTMLCanvasElement, fraction: number) => {
    const context = element.getContext("2d")
    if (!context) return []
    const scale = element.width / element.getBoundingClientRect().width
    const row = Math.round(element.height * fraction)
    const { data } = context.getImageData(0, row, element.width, 1)
    const xs: number[] = []
    let start = -1
    for (let x = 0; x <= element.width; x++) {
      const inked = x < element.width && data[x * 4 + 3] > 40
      if (inked && start < 0) start = x
      if (!inked && start >= 0) {
        xs.push((start + x - 1) / 2 / scale)
        start = -1
      }
    }
    return xs
  }, rowFraction)
}

test("vùng thời gian Fibonacci: khoảng cách giữa các vạch theo dãy 1, 1, 1, 2, 3, 5 đơn vị (đo trên điểm ảnh)", async ({ page }) => {
  await useScheme(page, "light")
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockMarket(page)
  await openChart(page)
  const box = await chartBox(page)
  const tool = TOOLS[0]
  await pickTool(page, tool)
  // Đơn vị rộng 60px: các vạch ở 0, 60, 120, 180, 300, 480, 780 px kể từ điểm đầu (khung nến ở 1440px rộng khoảng 850px).
  const x0 = box.x + 50
  const y = box.y + box.height * 0.5
  await click(page, x0, y)
  await page.mouse.move(x0 + 60, y - 30, { steps: 4 })
  await click(page, x0 + 60, y - 30)
  await park(page)
  await expect.poll(() => layerInk(page, "drawings")).toBeGreaterThan(400)
  const xs = await verticalLineXs(layerCanvas(page, "drawings"), 0.6)
  expect(xs.length, `vạch đo được: ${xs.join(", ")}`).toBeGreaterThanOrEqual(7)
  const gaps = xs.slice(1).map((value, index) => value - xs[index])
  const unit = gaps[0]
  expect(unit).toBeGreaterThan(50)
  // Khoảng cách F(n+1) - F(n): 1, 1, 1, 2, 3, 5 đơn vị (sai số 3px do làm tròn pixel và độ dày nét).
  const expected = [1, 1, 1, 2, 3, 5]
  expected.slice(0, gaps.length).forEach((ratio, index) => expect(Math.abs(gaps[index] - ratio * unit), `khoảng ${index}: ${gaps[index]} so với ${ratio} x ${unit}`).toBeLessThan(3))
  await shot(page, "desktop-light-fib-time-zones-measured")
})
