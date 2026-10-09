import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { LessonBlock } from "../api"
import { ALL_CHART_MODELS, IMAGE_BLOCK } from "../test-fixtures"
import { stubBrowser } from "../test-support"
import { BlockRenderer } from "./block-renderer"

beforeEach(() => stubBrowser())
afterEach(() => vi.unstubAllGlobals())

function renderBlocks(blocks: LessonBlock[], onReload?: () => void) {
  return render(<BlockRenderer blocks={blocks} context={{ charts: ALL_CHART_MODELS, onReload }} />)
}

describe("BlockRenderer", () => {
  it("renders html blocks through the sanitizer, with < > ∈ ∉ as text and no script", () => {
    const { container } = renderBlocks([
      { type: "html", html: "<p>RSI &lt; 30; giá ∈ dải; giá ∉ dải; a &gt; b<script>window.__pwned = 1</script></p><div class=\"math-eq\">H<sub>2</sub>O x<sup>2</sup></div>" },
    ])
    expect(screen.getByText("RSI < 30; giá ∈ dải; giá ∉ dải; a > b")).toBeTruthy()
    expect(container.querySelector("script")).toBeNull()
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
    expect(container.querySelector(".math-eq sub")?.textContent).toBe("2")
    expect(container.querySelector(".math-eq sup")?.textContent).toBe("2")
  })

  it("renders a table in a focusable internal scroll region with alignment and escaped cells", () => {
    renderBlocks([{ type: "table", head: ["Điều kiện", "Giá trị"], rows: [["RSI &lt; 30", "<b>70</b>"]], align: ["l", "r"], aria_label: "Bảng mẫu" }])
    const region = screen.getByRole("region", { name: "Bảng mẫu" })
    expect(region.getAttribute("tabindex")).toBe("0")
    const table = within(region).getByRole("table")
    expect(within(table).getByRole("columnheader", { name: "Giá trị" }).className).toContain("align-r")
    expect(within(table).getByRole("cell", { name: "RSI < 30" })).toBeTruthy()
    expect(table.querySelector("td b")?.textContent).toBe("70")
  })

  it("renders a chart block with its title, illustrative tag, caption and the data table toggle", async () => {
    const user = userEvent.setup()
    renderBlocks([{ type: "chart", chart_id: "grouped-chart", title: "Doanh thu", caption: "Mỗi cặp cột so sánh cùng một quý.", illustrative: true, table_toggle: true }])
    expect(screen.getByRole("heading", { name: "Doanh thu" })).toBeTruthy()
    expect(screen.getByText("Dữ liệu minh họa")).toBeTruthy()
    expect(screen.getByText("Mỗi cặp cột so sánh cùng một quý.")).toBeTruthy()
    expect(screen.getByRole("img", { name: /Doanh thu/ })).toBeTruthy()
    const summary = screen.getByText("Xem bảng số liệu của biểu đồ")
    await user.click(summary)
    expect(screen.getByRole("columnheader", { name: "2025 (tỷ đồng)" })).toBeTruthy()
  })

  it("omits the data table toggle when the block does not offer it", () => {
    renderBlocks([{ type: "chart", chart_id: "grouped-chart", title: "Doanh thu", table_toggle: false }])
    expect(screen.queryByText("Xem bảng số liệu của biểu đồ")).toBeNull()
  })

  it("shows an error with Thử lại when the model of a chart block is missing", async () => {
    const onReload = vi.fn()
    const user = userEvent.setup()
    renderBlocks([{ type: "chart", chart_id: "does-not-exist", title: "Thiếu", table_toggle: true }], onReload)
    expect(screen.getByRole("alert").textContent).toContain("Chưa có dữ liệu của biểu đồ này.")
    await user.click(screen.getByRole("button", { name: "Thử lại" }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it("renders an image block as a lazy, sized figure with its caption", () => {
    renderBlocks([IMAGE_BLOCK])
    const image = screen.getByRole("img", { name: IMAGE_BLOCK.alt })
    expect(image.getAttribute("loading")).toBe("lazy")
    expect(image.getAttribute("width")).toBe("2160")
    expect(image.getAttribute("height")).toBe("1175")
    expect(screen.getByText("Chú thích ảnh")).toBeTruthy()
  })

  it("renders steps with their numbers, titles and html bodies", () => {
    const { container } = renderBlocks([{ type: "steps", items: [{ no: "01", title: "Chọn cổ phiếu", html: "<p>Chọn <strong>FPT</strong> &lt; 10 mã.</p>" }, { no: "02", title: "Chọn ngày", html: "<p>Từ ngày.</p>" }] }])
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByRole("heading", { name: /Chọn cổ phiếu/ })).toBeTruthy()
    expect(container.querySelector("li strong")?.textContent).toBe("FPT")
    expect(screen.getByText(/10 mã/).textContent).toContain("< 10")
  })

  it("renders callouts with their variants and titles", () => {
    renderBlocks([
      { type: "callout", variant: "notice", title: "Lưu ý", blocks: [{ type: "html", html: "<p>Nội dung lưu ý</p>" }] },
      { type: "callout", variant: "filter-example", aria_label: "Ví dụ điều kiện lọc", blocks: [{ type: "html", html: '<span class="filter-name">Tăng trưởng</span><b class="filter-expression">&gt; 15%</b>' }] },
    ])
    expect(screen.getByRole("note", { name: "Lưu ý" }).textContent).toContain("Nội dung lưu ý")
    const example = screen.getByRole("group", { name: "Ví dụ điều kiện lọc" })
    expect(example.getAttribute("data-variant")).toBe("filter-example")
    expect(example.querySelector(".filter-expression")?.textContent).toBe("> 15%")
  })

  it("puts an adjacent signal-buy and signal-sell pair side by side", () => {
    renderBlocks([
      { type: "callout", variant: "signal-buy", title: "Điều kiện Mua mẫu", blocks: [{ type: "html", html: "<p>Mua</p>" }] },
      { type: "callout", variant: "signal-sell", title: "Điều kiện Bán mẫu", blocks: [{ type: "html", html: "<p>Bán</p>" }] },
    ])
    const pair = screen.getByTestId("signal-pair")
    expect(within(pair).getByRole("group", { name: "Điều kiện Mua mẫu" })).toBeTruthy()
    expect(within(pair).getByRole("group", { name: "Điều kiện Bán mẫu" })).toBeTruthy()
  })

  it("renders a details block that holds nested blocks", async () => {
    const user = userEvent.setup()
    const { container } = renderBlocks([{ type: "details", summary: "Thao tác trên điện thoại", blocks: [{ type: "html", html: "<p>Bấm Chỉ báo.</p>" }, IMAGE_BLOCK] }])
    const details = container.querySelector("details") as HTMLDetailsElement
    expect(details.open).toBe(false)
    await user.click(screen.getByText("Thao tác trên điện thoại"))
    expect(details.open).toBe(true)
    expect(within(details).getByText("Bấm Chỉ báo.")).toBeTruthy()
    expect(within(details).getByRole("img", { name: IMAGE_BLOCK.alt })).toBeTruthy()
  })
})
