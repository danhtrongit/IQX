/**
 * QA-06 (spec cập nhật 22-10 §4) for the Dashboard phân tích and a Chương 8-12 lesson with a
 * representative chart: at 390px nothing overflows horizontally and no text is grey. DB-02: the
 * lesson's ROE chart and the Dashboard's ROE card are drawn by the same shared renderer.
 *
 * The API is mocked: the lesson comes from the committed content JSON, the Dashboard numbers are the
 * same sample company so both screenshots can be compared side by side (written to the test output).
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Page, Route } from "@playwright/test"

import { buildCatalog, buildItem, buildProgress, catalogItemsOf } from "../src/pages/academy/test-fixtures"
import { closePanelLayer, expect, seedMember, test } from "./fixtures"

const CONTENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../backend/src/modules/academy/content/v4/lessons")

type Series = { name: string; v: (number | null)[] }
type Fundamental = {
  kind: "fundamental"
  chart: { name: string; kind: string; unit: string; labels: string[]; main: Series[]; sub?: { unit: string; type: "grouped" | "stacked"; series: Series[] } }
}
type LessonFile = { id: string; title: string; lead: string; intro_blocks: unknown[]; sections: unknown[]; summary: string[]; charts: Record<string, unknown> }

const lesson = (id: string) => JSON.parse(readFileSync(path.join(CONTENT, `${id}.vi.json`), "utf8")) as LessonFile
const rep = (lessonId: string, chartId: string) => lesson(lessonId).charts[chartId] as Fundamental

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
}

/** Dashboard card payload (both modes carry the same quarters; the test only looks at Quý). */
function card(name: string, model: Fundamental) {
  const series = { labels: model.chart.labels, main: model.chart.main, ...(model.chart.sub ? { sub: model.chart.sub } : {}) }
  return { name, kind: model.chart.kind, unit: model.chart.unit, decimals: model.chart.unit === "lần" ? 2 : 1, status: "ok", q: series, y: series }
}

async function mockDashboard(page: Page) {
  const pe = rep("ch08-l14", "c8l14-rep")
  const charts = {
    "Tăng trưởng doanh thu": card("Tăng trưởng doanh thu", rep("ch08-l01", "c8l1-rep")),
    "Tăng trưởng LNST": card("Tăng trưởng LNST", rep("ch08-l02", "c8l2-rep")),
    "Biên lợi nhuận ròng": card("Biên lợi nhuận ròng", rep("ch08-l13", "c8l13-rep")),
    ROE: card("ROE", rep("ch08-l11", "c8l11-rep")),
    "D/E": card("D/E", rep("ch09-l06", "c9l6-rep")),
    "P/E": { name: "P/E", kind: "F", unit: "lần", decimals: 2, status: "ok", v: [] },
  }
  const groups = [
    { group: "Tốc độ tăng trưởng", items: [["Tăng trưởng doanh thu", "A"], ["Tăng trưởng LNST", "A"]] },
    { group: "Hiệu quả và biên lợi nhuận", items: [["ROE", "B"], ["Biên lợi nhuận ròng", "B"]] },
    { group: "Nợ và khả năng thanh toán", items: [["D/E", "B"]] },
    { group: "Định giá", items: [["P/E", "F"]] },
  ]
  // Dashboard v2 (update 4-11): catalog by industry, the symbol's industry, then fundamental/valuation data.
  const industryLabels = { thuong: "Doanh nghiệp sản xuất", nh: "Ngân hàng", ck: "Chứng khoán", bh: "Bảo hiểm" }
  const names = groups.flatMap(({ items }) => items.map(([name]) => name))
  await page.route("**/api/v2/dashboard/catalog", (route) =>
    json(route, {
      industries: Object.entries(industryLabels).map(([nganh, label]) => ({
        nganh,
        label,
        total: names.length,
        default_charts: names,
        chapters: [{
          chapter: "Chỉ tiêu chung",
          academy_chapter: 8,
          groups: groups.map(({ group, items }) => ({ group, items: items.map(([name, kind], index) => ({ name, metric_key: `${group}-${index}`, kind })) })),
        }],
      })),
    }),
  )
  await page.route("**/api/v2/dashboard/industry/**", (route) => json(route, { symbol: "FPT", nganh: "thuong", label: industryLabels.thuong }))
  await page.route("**/api/v2/fundamental/**", (route) => json(route, { symbol: "FPT", nganh: "thuong", is_bank: false, per: "q", charts }))
  await page.route("**/api/v2/valuation/**", (route) =>
    json(route, { symbol: "FPT", nganh: "thuong", dates: pe.chart.labels, charts: { "P/E": { name: "P/E", kind: "F", unit: "lần", v: pe.chart.main[0]?.v ?? [] } } }),
  )
  await page.route("**/api/v2/instruments/FPT", (route) =>
    json(route, { data: { symbol: "FPT", icbLv1: "Công nghệ", icbLv2: "Công nghệ thông tin" }, meta: {} }),
  )
}

async function mockAcademy(page: Page, lessonId: string) {
  const catalog = buildCatalog()
  const items = catalogItemsOf(catalog)
  const progress = buildProgress(new Set(items.map((item) => item.lesson_key)), catalog)
  const item = items.find((entry) => entry.id === lessonId)!
  const file = lesson(lessonId)
  const content = buildItem(item, "passed", {
    title: file.title,
    lead: file.lead,
    intro_blocks: file.intro_blocks as never,
    sections: file.sections as never,
    summary: file.summary,
    charts: file.charts as never,
  })
  await page.route("**/api/v2/academy/**", (route) => {
    const url = new URL(route.request().url()).pathname.replace(/^.*\/api\/v2\/academy/, "")
    if (url === "/catalog") return json(route, catalog)
    if (url === "/progress") return json(route, progress)
    if (url === `/lessons/${lessonId}`) return json(route, content)
    if (url === `/lessons/${lessonId}/notes`)
      return json(route, { lesson_id: lessonId, revision: 0, texts: {}, checks: {}, scores: {}, updated_at: null })
    if (url === `/lessons/${lessonId}/attempt`) return json(route, { attempt: null })
    return json(route, {})
  })
}

/** Page wider than the viewport? */
const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)

/**
 * Text that renders grey: a low-chroma colour between near-black (text on a bright fill such as the
 * primary button) and the secondary text token (#c9d6e4, relative luminance about 0.66) on the dark
 * theme, e.g. `muted-foreground` (#9ba6b1). HTML text uses `color`, SVG text uses `fill`.
 */
function greyTexts(page: Page, scope: string) {
  return page.evaluate((selector) => {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    const context = canvas.getContext("2d", { willReadFrequently: true })!
    const rgb = (color: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = "#000"
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data]
    }
    const luminance = ([r, g, b]: number[]) => {
      const channel = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const root = document.querySelector(selector)
    if (!root) return [`${selector} not found`]
    const problems: string[] = []
    for (const element of root.querySelectorAll<HTMLElement | SVGElement>("*")) {
      if (element.closest("option, select")) continue
      const ownText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
      if (!ownText) continue
      const box = element.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      const style = getComputedStyle(element)
      const isSvgText = element instanceof SVGElement
      const [r, g, b, a] = rgb(isSvgText ? style.fill : style.color)
      if (a === 0) continue
      const chroma = Math.max(r, g, b) - Math.min(r, g, b)
      const light = luminance([r, g, b])
      if (chroma < 48 && light > 0.08 && light < 0.6)
        problems.push(`${element.tagName.toLowerCase()} "${element.textContent?.trim().slice(0, 40)}" rgb(${r},${g},${b})`)
    }
    return problems
  }, scope)
}

test.describe("QA-06 · 390px · bộ khuôn biểu đồ chỉ tiêu dùng chung", () => {
  test.use({ viewport: { width: 390, height: 900 } })

  test("Dashboard phân tích: không tràn ngang, không chữ xám, thẻ ROE vẽ bằng bộ khuôn chung", async ({ page }, testInfo) => {
    await mockDashboard(page)
    await page.goto("/luyen-tap?tool=phan-tich&symbol=FPT")
    await closePanelLayer(page)
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard phân tích" })).toBeVisible()
    const roe = page.locator('[data-chart="ROE"]')
    await roe.getByLabel("Số kỳ hiển thị của ROE").selectOption("8")
    await expect(roe.locator('[data-fundamental-chart="B"]')).toBeVisible()
    await expect(page.locator('[data-chart="P/E"] [data-fundamental-chart="F"]')).toBeVisible()

    expect(await overflows(page)).toBe(false)
    expect(await greyTexts(page, "[data-analysis-dashboard]")).toEqual([])

    await roe.getByRole("button", { name: "Bảng số" }).click()
    await expect(roe.getByRole("button", { name: "Ẩn bảng" })).toBeVisible()
    expect(await overflows(page)).toBe(false)
    await roe.getByRole("button", { name: "Ẩn bảng" }).click()
    await roe.scrollIntoViewIfNeeded()
    await roe.locator("[data-fundamental-chart]").screenshot({ path: testInfo.outputPath("dashboard-roe-390.png") })
  })

  test("Học viện ch08-l11: không tràn ngang, không chữ xám, biểu đồ đại diện ROE là cùng bộ khuôn", async ({ page }, testInfo) => {
    await seedMember(page)
    await mockAcademy(page, "ch08-l11")
    await page.goto("/luyen-tap?tool=hoc-vien&lesson=ch08-l11")
    const figure = page.locator('[data-chart-id="c8l11-rep"]')
    await expect(figure.locator('[data-fundamental-chart="B"]')).toBeVisible()
    // Học viện ẩn nút "Bảng số" của bộ khuôn (spec Học viện v5 §2.4, showTable={false}).
    await expect(figure.getByRole("button", { name: "Bảng số" })).toHaveCount(0)

    expect(await overflows(page)).toBe(false)
    expect(await greyTexts(page, '[data-lesson-id="ch08-l11"]')).toEqual([])

    await figure.scrollIntoViewIfNeeded()
    await figure.locator("[data-fundamental-chart]").screenshot({ path: testInfo.outputPath("academy-roe-390.png") })
  })
})

/**
 * Dashboard v3 §12 mục 8 và 11 (update 22-11, T3): bộ khuôn chung vẽ "Mốc 1,00", mốc 0 khi có số âm,
 * đơn vị "năm" 1 chữ số và ROE 2 đường + cột đòn bẩy; ở 390px không tràn ngang, không chữ xám, kể cả
 * khi mở bảng số và khi hộp số liệu hiện ở mép phải. Tên đường/cột theo MAU, số tự đặt.
 */
const V3_LABELS = ["Q3/24", "Q4/24", "Q1/25", "Q2/25", "Q3/25", "Q4/25", "Q1/26", "Q2/26"]
const v3Series = (name: string, v: (number | null)[]): Series => ({ name, v })
type V3Chart = { kind: string; unit: string; decimals: number; ref?: number; main: Series[]; sub: { unit: string; type: "grouped" | "stacked"; series: Series[] } }
const V3_CHARTS: Record<string, V3Chart> = {
  "Tiền / Nợ vay ngắn hạn": {
    kind: "B",
    unit: "lần",
    decimals: 2,
    ref: 1,
    main: [v3Series("Tiền / Nợ vay ngắn hạn", [1.42, 1.18, 0.94, 0.88, 1.05, 1.21, 1.36, 1.52])],
    sub: {
      unit: "tỷ đồng",
      type: "grouped",
      series: [
        v3Series("Tiền", [14200, 12900, 11800, 11000, 12600, 14300, 15900, 17300]),
        v3Series("Nợ vay ngắn hạn", [10000, 10930, 12550, 12500, 12000, 11820, 11690, 11380]),
      ],
    },
  },
  "Tiền ròng / VCSH": {
    kind: "B",
    unit: "%",
    decimals: 1,
    main: [v3Series("Tiền ròng / VCSH", [-18.4, -15.2, -12.9, null, -6.1, -2.4, 1.8, 4.6])],
    sub: {
      unit: "tỷ đồng",
      type: "grouped",
      series: [
        v3Series("Tiền ròng", [-9800, -8300, -7200, null, -3600, -1450, 1100, 2900]),
        v3Series("VCSH", [53200, 54600, 55800, 57100, 59000, 60400, 61800, 63000]),
      ],
    },
  },
  "Số năm bán hết tồn kho": {
    kind: "B",
    unit: "năm",
    decimals: 1,
    main: [v3Series("Số năm bán hết tồn kho", [4.36, 4.12, 3.95, 3.71, 3.48, 3.22, 3.07, 2.94])],
    sub: {
      unit: "tỷ đồng",
      type: "grouped",
      series: [
        v3Series("Tồn kho", [186000, 181500, 178200, 174000, 170300, 166800, 163100, 160400]),
        v3Series("Giá vốn 4 quý", [42660, 44050, 45110, 46900, 48940, 51800, 53130, 54560]),
      ],
    },
  },
  ROE: {
    kind: "B",
    unit: "%",
    decimals: 1,
    main: [
      v3Series("ROE 4 quý", [20.4, 20.9, 21.3, 21.0, 20.6, 20.1, 19.8, 19.5]),
      v3Series("ROA 4 quý", [1.8, 1.8, 1.9, 1.9, 1.8, 1.8, 1.7, 1.7]),
    ],
    sub: { unit: "lần", type: "grouped", series: [v3Series("Đòn bẩy (Tổng tài sản / VCSH)", [11.3, 11.6, 11.2, 11.1, 11.4, 11.2, 11.6, 11.5])] },
  },
}

async function mockV3Dashboard(page: Page) {
  const names = Object.keys(V3_CHARTS)
  const charts = Object.fromEntries(
    Object.entries(V3_CHARTS).map(([name, chart]) => {
      const series = { labels: V3_LABELS, main: chart.main, sub: chart.sub }
      const ref = chart.ref === undefined ? {} : { ref: chart.ref }
      return [name, { name, kind: chart.kind, unit: chart.unit, decimals: chart.decimals, ...ref, status: "ok", q: series, y: series }]
    }),
  )
  const industryLabels = { thuong: "Doanh nghiệp sản xuất", nh: "Ngân hàng", ck: "Chứng khoán", bh: "Bảo hiểm" }
  await page.route("**/api/v2/dashboard/catalog", (route) =>
    json(route, {
      industries: Object.entries(industryLabels).map(([nganh, label]) => ({
        nganh,
        label,
        total: names.length,
        default_charts: names,
        chapters: [{
          chapter: "Chỉ tiêu chung",
          academy_chapter: 8,
          groups: [{ group: "Nợ và khả năng thanh toán", items: names.map((name, index) => ({ name, metric_key: `v3-${index}`, kind: "B" })) }],
        }],
      })),
    }),
  )
  await page.route("**/api/v2/dashboard/industry/**", (route) => json(route, { symbol: "FPT", nganh: "thuong", label: industryLabels.thuong }))
  await page.route("**/api/v2/fundamental/**", (route) => json(route, { symbol: "FPT", nganh: "thuong", is_bank: false, per: "q", charts }))
  await page.route("**/api/v2/valuation/**", (route) => json(route, { symbol: "FPT", nganh: "thuong", dates: [], charts: {} }))
  await page.route("**/api/v2/instruments/FPT", (route) =>
    json(route, { data: { symbol: "FPT", icbLv1: "Công nghệ", icbLv2: "Công nghệ thông tin" }, meta: {} }),
  )
}

test.describe("Dashboard v3 · 390px · quy tắc vẽ của bộ khuôn chung", () => {
  test.use({ viewport: { width: 390, height: 900 } })

  test("Mốc 1,00, mốc 0, năm 1 chữ số, ROE 2 đường; không tràn ngang, không chữ xám", async ({ page }, testInfo) => {
    await mockV3Dashboard(page)
    await page.goto("/luyen-tap?tool=phan-tich&symbol=FPT")
    await closePanelLayer(page)
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard phân tích" })).toBeVisible()

    const card = (name: string) => page.locator(`[data-chart="${name}"]`)
    const upper = (name: string) => card(name).locator('[data-fundamental-chart] svg[role="img"]').first()

    // §12.8: mốc 1 lần nét đứt ở tầng trên, chú giải "Mốc 1,00".
    const cash = card("Tiền / Nợ vay ngắn hạn")
    await expect(cash.locator('[data-fundamental-chart="B"]')).toBeVisible()
    await expect(cash.getByText("Mốc 1,00", { exact: true })).toBeVisible()
    await expect(upper("Tiền / Nợ vay ngắn hạn").locator('line[stroke-dasharray="4 4"]')).toHaveCount(1)

    // Mốc 0 khi có số âm.
    await expect(upper("Tiền ròng / VCSH").locator("[data-zero-line]")).toHaveCount(1)
    await expect(upper("Tiền / Nợ vay ngắn hạn").locator("[data-zero-line]")).toHaveCount(0)

    // ROE 2 đường (--s1, --line2 = #f5d76e ở nền tối) và cột đòn bẩy ở tầng dưới.
    const strokes = await upper("ROE").locator("path[stroke]").evaluateAll((paths) => paths.map((path) => path.getAttribute("stroke")))
    expect(strokes).toEqual(["var(--s1)", "var(--line2)"])
    const line2 = await upper("ROE").locator('path[stroke="var(--line2)"]').evaluate((path) => getComputedStyle(path).stroke)
    expect(line2).toBe("rgb(245, 215, 110)")
    await expect(card("ROE").getByText("Đòn bẩy (Tổng tài sản / VCSH)")).toBeVisible()

    expect(await overflows(page)).toBe(false)
    expect(await greyTexts(page, "[data-analysis-dashboard]")).toEqual([])

    // Đơn vị "năm" 1 chữ số trong bảng số; bảng mở ra vẫn không tràn ngang.
    const years = card("Số năm bán hết tồn kho")
    await years.getByRole("button", { name: "Bảng số" }).click()
    const cells = await years.getByRole("cell").allTextContents()
    const yearCells = cells.filter((cell) => cell.endsWith(" năm"))
    expect(yearCells.length).toBeGreaterThan(0)
    expect(yearCells.every((cell) => /^\d+,\d năm$/.test(cell))).toBe(true)
    expect(cells).toContain("2,9 năm")
    expect(await overflows(page)).toBe(false)
    expect(await greyTexts(page, "[data-analysis-dashboard]")).toEqual([])
    await years.getByRole("button", { name: "Ẩn bảng" }).click()

    // Hộp số liệu ở kỳ cuối (mép phải) nằm trong thẻ, không đẩy trang tràn ngang.
    const roePanel = upper("ROE")
    await roePanel.scrollIntoViewIfNeeded()
    const box = (await roePanel.boundingBox())!
    await page.mouse.move(box.x + box.width - 12, box.y + box.height / 2)
    const tip = card("ROE").getByRole("status")
    await expect(tip).toBeVisible()
    await expect(tip).toContainText("Q2/26")
    const cardBox = (await card("ROE").boundingBox())!
    const tipBox = (await tip.boundingBox())!
    expect(tipBox.x).toBeGreaterThanOrEqual(cardBox.x - 1)
    expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1)
    expect(await overflows(page)).toBe(false)

    await card("ROE").locator("[data-fundamental-chart]").screenshot({ path: testInfo.outputPath("dashboard-v3-roe-390.png") })
    await cash.locator("[data-fundamental-chart]").screenshot({ path: testInfo.outputPath("dashboard-v3-cash-debt-390.png") })
  })
})
