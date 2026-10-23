/**
 * QA-06 (spec cập nhật 22-10 §4) for the Dashboard phân tích and a Chương 8-13 lesson with a
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
import { expect, seedMember, test } from "./fixtures"

const CONTENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../backend/src/modules/academy/content/v3/lessons")

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
  const pe = rep("ch13-l01", "c13l1-rep")
  const charts = {
    "Tăng trưởng doanh thu": card("Tăng trưởng doanh thu", rep("ch08-l01", "c8l1-rep")),
    "Tăng trưởng LNST": card("Tăng trưởng LNST", rep("ch08-l02", "c8l2-rep")),
    "Biên lợi nhuận ròng": card("Biên lợi nhuận ròng", rep("ch10-l05", "c10l5-rep")),
    ROE: card("ROE", rep("ch10-l01", "c10l1-rep")),
    "D/E": card("D/E", rep("ch11-l01", "c11l1-rep")),
    "P/E": { name: "P/E", kind: "F", unit: "lần", decimals: 2, status: "ok", v: [] },
  }
  const groups = [
    { group: "Tốc độ tăng trưởng", items: [["Tăng trưởng doanh thu", "A"], ["Tăng trưởng LNST", "A"]] },
    { group: "Hiệu quả và biên lợi nhuận", items: [["ROE", "B"], ["Biên lợi nhuận ròng", "B"]] },
    { group: "Nợ và khả năng thanh toán", items: [["D/E", "B"]] },
    { group: "Định giá", items: [["P/E", "F"]] },
  ]
  await page.route("**/api/v2/dashboard/catalog", (route) =>
    json(route, groups.map(({ group, items }) => ({ group, items: items.map(([name, kind]) => ({ name, kind, na_for_bank: false })) }))),
  )
  await page.route("**/api/v2/fundamental/**", (route) => json(route, { symbol: "FPT", is_bank: false, per: "q", charts }))
  await page.route("**/api/v2/valuation/**", (route) =>
    json(route, { symbol: "FPT", dates: pe.chart.labels, charts: { "P/E": { name: "P/E", kind: "F", unit: "lần", v: pe.chart.main[0]?.v ?? [] } } }),
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
    await page.goto("/demo-trading?content=dashboard&symbol=FPT")
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

  test("Học viện ch10-l01: không tràn ngang, không chữ xám, biểu đồ đại diện ROE là cùng bộ khuôn", async ({ page }, testInfo) => {
    await seedMember(page)
    await mockAcademy(page, "ch10-l01")
    await page.goto("/demo-trading?view=academy&lesson=ch10-l01")
    const figure = page.locator('[data-chart-id="c10l1-rep"]')
    await expect(figure.locator('[data-fundamental-chart="B"]')).toBeVisible()
    await expect(figure.getByRole("button", { name: "Bảng số" })).toBeVisible()

    expect(await overflows(page)).toBe(false)
    expect(await greyTexts(page, '[data-lesson-id="ch10-l01"]')).toEqual([])

    await figure.scrollIntoViewIfNeeded()
    await figure.locator("[data-fundamental-chart]").screenshot({ path: testInfo.outputPath("academy-roe-390.png") })
  })
})
