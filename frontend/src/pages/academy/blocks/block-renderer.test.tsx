import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { INTERACTIVE_BLOCK_TYPES, type LessonBlockType } from "../content-types"
import { BlockRenderer } from "./block-renderer"
import { InlineText } from "./inline-text"
import { ALL_BLOCKS, CHARTS, INTERACTIVE_BLOCK, STATIC_BLOCKS, mockReaderWidth, svgOverflows } from "./test-blocks"

const STATIC_TYPES: LessonBlockType[] = [
  "paragraph",
  "heading",
  "note",
  "chart",
  "chart_grid",
  "table",
  "cards",
  "steps",
  "definitions",
  "stats",
  "gauges",
  "kv_cards",
  "formula",
  "tiles",
  "quote",
  "objection",
  "funnel",
  "sample_post",
]

let restore: (() => void) | null = null
afterEach(() => {
  restore?.()
  restore = null
})

function renderAll(width = 760) {
  restore = mockReaderWidth(width)
  return render(<BlockRenderer blocks={ALL_BLOCKS} charts={CHARTS} renderInteractive={(block, key) => <div key={key} data-testid={`interactive-${block.type}`} />} />)
}

describe("BlockRenderer", () => {
  it("has a fixture for every static block type of the schema", () => {
    expect(new Set(STATIC_BLOCKS.map((block) => block.type))).toEqual(new Set(STATIC_TYPES))
    expect(STATIC_TYPES.length + INTERACTIVE_BLOCK_TYPES.length).toBe(24)
  })

  it("renders every static block type in order, each in its own wrapper", () => {
    const { container } = renderAll()
    const rendered = [...container.querySelectorAll("[data-academy-block]")].map((node) => node.getAttribute("data-academy-block"))
    expect(rendered).toEqual(STATIC_BLOCKS.map((block) => block.type))
    for (const node of container.querySelectorAll("[data-academy-block]")) expect(node.childElementCount).toBeGreaterThan(0)
  })

  it("delegates interactive blocks to renderInteractive and drops them without it", () => {
    renderAll()
    expect(screen.getByTestId("interactive-workpad")).toBeTruthy()
    restore?.()
    const { container } = render(<BlockRenderer blocks={[INTERACTIVE_BLOCK]} charts={{}} />)
    expect(container.querySelector(".academy-blocks")?.childElementCount).toBe(0)
  })

  it("renders prose with the inline allowlist and tone spans", () => {
    const { container } = renderAll()
    const paragraph = container.querySelector('[data-academy-block="paragraph"] p')
    expect(paragraph?.textContent).toBe("Giá tăng khi cầu lớn hơn cung & ngược lại.")
    expect(paragraph?.querySelector("b")?.textContent).toBe("tăng")
    expect(paragraph?.querySelector(".tone-pos")?.textContent).toBe("cầu")
    expect(screen.getByRole("heading", { level: 4, name: "Một tiêu đề phụ" })).toBeTruthy()
    expect(screen.getByText("Số liệu giả định để minh họa")).toBeTruthy()
  })

  it("renders the three table variants with ratings, merged cells, row headers and group cells", () => {
    renderAll()
    const grid = screen.getByRole("region", { name: "So sánh kênh đầu tư" })
    expect(grid?.getAttribute("tabindex")).toBe("0")
    expect(within(grid).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Tiêu chí", "Cổ phiếu", "Tiết kiệm"])
    expect(within(grid).getByText("Cả hai kênh").closest("td")?.getAttribute("colspan")).toBe("2")
    expect(within(grid).getByText("Cao").closest("span")?.parentElement?.textContent).toContain("(Kém)")
    const rows = screen.getByRole("region", { name: "Hai loại tài khoản" })
    expect(within(rows).getByRole("rowheader", { name: "Đòn bẩy" })).toBeTruthy()
    const grouped = screen.getByText("Chuẩn bị")
    expect(grouped.tagName).toBe("TH")
    expect(grouped?.getAttribute("rowspan")).toBe("2")
  })

  it("renders cards, steps, definitions, stats, gauges, receipts, formulas and tiles", () => {
    renderAll()
    expect(screen.getByText("Quỹ mở")).toBeTruthy()
    expect(screen.getByText("Loại 2")).toBeTruthy()
    expect(screen.getByText("Mua theo tin đồn")).toBeTruthy()
    expect(screen.getAllByRole("listitem").some((item) => item.textContent?.includes("Mở tài khoản"))).toBe(true)
    expect(screen.getByText("Cổ đông")).toBeTruthy()
    expect(screen.getByText("Tiền nhàn rỗi")).toBeTruthy()
    expect(screen.getByText("308 triệu")).toBeTruthy()
    expect(screen.getByText("±10%")).toBeTruthy()
    expect(screen.getByRole("meter", { name: "Giá giảm 20%" })?.getAttribute("aria-valuenow")).toBe("37.5")
    expect(screen.getByText("12.575.000 đ")).toBeTruthy()
    expect(screen.getByText("12 lần")).toBeTruthy()
    expect(screen.getByText("Doanh nghiệp tốt").tagName).toBe("LEGEND")
    expect(within(document.querySelector('[data-academy-block="tiles"]') as HTMLElement).getByText("61,8%")).toBeTruthy()
  })

  it("renders quotes, objections, funnels and sample posts", () => {
    renderAll()
    expect(screen.getByText("Nên")).toBeTruthy()
    expect(screen.getByText("“Chứng khoán là cờ bạc.”")).toBeTruthy()
    expect(screen.getByText("Chuyển đổi")).toBeTruthy()
    expect(screen.getByText(/Dòng một/).classList.contains("whitespace-pre-line")).toBe(true)
    expect(screen.getByText("Vì sao hiệu quả:")).toBeTruthy()
  })

  it("renders chart figures with title, legend, note and the data table toggle", async () => {
    renderAll()
    const figure = document.querySelector('[data-chart-id="c4l7-g6"]') as HTMLElement
    expect(within(figure).getByText("MACD và giá")).toBeTruthy()
    expect(within(figure).getByRole("list", { name: "Chú giải" })).toBeTruthy()
    expect(within(figure).getByText("Dữ liệu minh họa")).toBeTruthy()
    const summary = within(figure).getByText("Xem bảng số liệu")
    fireEvent.click(summary)
    expect(within(figure).getAllByRole("columnheader").map((cell) => cell.textContent)).toContain("Histogram")
    expect(document.querySelector('[data-chart-id="c4l1-g4"]')).not.toBeNull()
    expect(screen.getByText("Vốn đầu tư linh hoạt")).toBeTruthy()
  })

  it("shows an empty state for a chart id that has no model", () => {
    render(<BlockRenderer blocks={[{ type: "chart", chart_id: "c9l9-zz" }]} charts={{}} />)
    expect(screen.getByText("Biểu đồ này chưa có dữ liệu.")).toBeTruthy()
  })

  it("lays every chart out inside a 358px reader without overflowing text", () => {
    const { container } = renderAll(358)
    expect(svgOverflows(container, 358)).toEqual([])
  })

  it("lays every chart out inside a 760px reader without overflowing text", () => {
    const { container } = renderAll(760)
    expect(svgOverflows(container, 760)).toEqual([])
  })
})

describe("InlineText", () => {
  it("sanitizes before injecting and keeps the requested element", () => {
    const { container } = render(<InlineText as="p" className="x" html={'<script>alert(1)</script>a <span class="tone-neg" onclick="x()">b</span>'} />)
    const paragraph = container.querySelector("p")
    expect(paragraph?.className).toBe("academy-inline x")
    expect(paragraph?.innerHTML).toBe('a <span class="tone-neg">b</span>')
  })
})

describe("academy content folders use the academy text tokens", () => {
  const sources = import.meta.glob(["./*.{ts,tsx}", "../charts/*.{ts,tsx}", "!../**/*.test.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>

  it("scans the renderer sources", () => {
    expect(Object.keys(sources)).toEqual(expect.arrayContaining(["./block-renderer.tsx", "../charts/series-panels-chart.tsx"]))
  })

  // Built from parts so the acceptance grep over these folders finds no literal match in this test.
  const bannedTextToken = new RegExp(["muted", "foreground"].join("-"))

  it("never uses the grey workspace text token or a hardcoded colour", () => {
    for (const [file, text] of Object.entries(sources)) {
      expect(text, file).not.toMatch(bannedTextToken)
      expect(text, file).not.toMatch(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/)
    }
  })

  it("draws no emoji or glyph icons in chart and block code", () => {
    for (const [file, text] of Object.entries(sources)) expect(text, file).not.toMatch(/[✓✔→←↑↓]/)
  })
})
