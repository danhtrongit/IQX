import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  FundamentalChart,
  SECOND_LINE_COLOR,
  decimalsForUnit,
  figureLegend,
  figureTable,
  figureTooltip,
  formatWithUnit,
  hasNegativeMain,
  referenceLabel,
  type FundamentalChartData,
} from "."

/** Mẫu biểu đồ của các chỉ tiêu v3 (spec Dashboard v3 §9, §10; tên đường lấy từ MAU, số tự đặt). */
const LABELS = ["Q3/25", "Q4/25", "Q1/26", "Q2/26"]

const CASH_TO_SHORT_DEBT: FundamentalChartData = {
  name: "Tiền / Nợ vay ngắn hạn",
  kind: "B",
  unit: "lần",
  decimals: 2,
  ref: 1,
  labels: LABELS,
  main: [{ name: "Tiền / Nợ vay ngắn hạn", v: [2.4, 2.1, 1.85, 2.6] }],
  sub: {
    unit: "tỷ đồng",
    type: "grouped",
    series: [
      { name: "Tiền", v: [1200, 1150, 1100, 1300] },
      { name: "Nợ vay ngắn hạn", v: [500, 550, 600, 500] },
    ],
  },
}

const NET_CASH_TO_EQUITY: FundamentalChartData = {
  name: "Tiền ròng / VCSH",
  kind: "B",
  unit: "%",
  labels: LABELS,
  main: [{ name: "Tiền ròng / VCSH", v: [-12.5, -8.2, null, 4.1] }],
  sub: {
    unit: "tỷ đồng",
    type: "grouped",
    series: [
      { name: "Tiền ròng", v: [-900, -600, null, 300] },
      { name: "VCSH", v: [7200, 7300, 7400, 7500] },
    ],
  },
}

const YEARS_TO_SELL_INVENTORY: FundamentalChartData = {
  name: "Số năm bán hết tồn kho",
  kind: "B",
  unit: "năm",
  labels: LABELS,
  main: [{ name: "Số năm bán hết tồn kho", v: [3.46, 3.21, 2.98, 2.74] }],
  sub: {
    unit: "tỷ đồng",
    type: "grouped",
    series: [
      { name: "Tồn kho", v: [180000, 175000, 170000, 165000] },
      { name: "Giá vốn 4 quý", v: [52000, 54500, 57000, 60200] },
    ],
  },
}

const BANK_ROE: FundamentalChartData = {
  name: "ROE",
  kind: "B",
  unit: "%",
  labels: LABELS,
  main: [
    { name: "ROE 4 quý", v: [18.2, 18.9, 19.4, 20.1] },
    { name: "ROA 4 quý", v: [1.6, 1.7, 1.7, 1.8] },
  ],
  sub: { unit: "lần", type: "grouped", series: [{ name: "Đòn bẩy (Tổng tài sản / VCSH)", v: [11.4, 11.1, 11.4, 11.2] }] },
}

const PROFIT_STREAK: FundamentalChartData = {
  name: "Profit Positive Streak",
  kind: "E2",
  unit: "năm",
  labels: ["2021", "2022", "2023", "2024", "2025"],
  main: [{ name: "LNST năm", v: [3, 2, 4, 5, 6] }],
  hero: 5,
}

describe("bộ khuôn v3 · quy tắc số liệu (spec §10)", () => {
  it('đơn vị "năm" có 1 chữ số thập phân, các đơn vị khác giữ như v2', () => {
    expect(decimalsForUnit("năm")).toBe(1)
    expect(decimalsForUnit("%")).toBe(1)
    expect(decimalsForUnit("điểm %")).toBe(1)
    expect(decimalsForUnit("lần")).toBe(2)
    expect(decimalsForUnit("tỷ đồng")).toBe(0)
    expect(decimalsForUnit("ngày")).toBe(0)
    expect(formatWithUnit(3.46, "năm")).toBe("3,5 năm")
    expect(formatWithUnit(null, "năm")).toBe("—")
  })

  it("Số năm bán hết tồn kho: hộp số liệu và bảng số ghi 1 chữ số", () => {
    expect(figureTooltip(YEARS_TO_SELL_INVENTORY, 0).rows[0]).toEqual(["Số năm bán hết tồn kho", "3,5 năm"])
    expect(figureTable(YEARS_TO_SELL_INVENTORY).rows[3].slice(0, 2)).toEqual(["Q2/26", "2,7 năm"])
  })

  it("khuôn E2: số năm dương liên tục vẫn là số nguyên khi chuỗi chính không có đơn vị riêng", () => {
    expect(figureTable(PROFIT_STREAK).rows[0]).toEqual(["2021", "3 năm"])
    expect(figureTable({ ...PROFIT_STREAK, mainUnit: "tỷ đồng" }).rows[0]).toEqual(["2021", "3 tỷ đồng"])
  })

  it("kỳ trống ghi — trong hộp số liệu và bảng số", () => {
    expect(figureTooltip(NET_CASH_TO_EQUITY, 2).rows).toEqual([
      ["Tiền ròng / VCSH", "—"],
      ["Tiền ròng", "—"],
      ["VCSH", "7.400 tỷ đồng"],
    ])
  })
})

describe("bộ khuôn v3 · mốc tham chiếu và mốc 0 (spec §9)", () => {
  it('mốc 1 lần ghi "Mốc 1,00"; mốc % giữ "Mốc 100%"', () => {
    expect(referenceLabel(CASH_TO_SHORT_DEBT)).toBe("Mốc 1,00")
    expect(referenceLabel({ ref: 100, unit: "%" })).toBe("Mốc 100%")
    expect(referenceLabel({ ref: 1.5, unit: "lần" })).toBe("Mốc 1,50")
    expect(figureLegend(CASH_TO_SHORT_DEBT).map((item) => item.label)).toEqual([
      "Tiền / Nợ vay ngắn hạn",
      "Mốc 1,00",
      "Tiền",
      "Nợ vay ngắn hạn",
    ])
  })

  it("chỉ khuôn có giá trị âm ở đường chính mới cần mốc 0", () => {
    expect(hasNegativeMain(NET_CASH_TO_EQUITY)).toBe(true)
    expect(hasNegativeMain(CASH_TO_SHORT_DEBT)).toBe(false)
  })
})

describe("FundamentalChart v3", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  const upperPanel = (container: HTMLElement) => container.querySelector('svg[role="img"]') as SVGElement

  it('khuôn B mốc 1 lần: đường nét đứt ở tầng trên, trục chứa mốc, chú giải "Mốc 1,00"', () => {
    const far = { ...CASH_TO_SHORT_DEBT, main: [{ name: "Tiền / Nợ vay ngắn hạn", v: [3.2, 3.6, 3.4, 3.9] }] }
    const { container } = render(<FundamentalChart chart={far} />)
    expect(screen.getByText("Mốc 1,00")).toBeTruthy()
    const upper = upperPanel(container)
    expect(upper.querySelectorAll('line[stroke-dasharray="4 4"]')).toHaveLength(1)
    // Trục luôn chứa mốc: mốc nằm trong khung vẽ dù đường chính ở xa mốc.
    const tickValues = [...upper.querySelectorAll("text")].map((node) => node.textContent)
    expect(tickValues).toContain("1")
  })

  it("khuôn B có giá trị âm vẽ mốc 0; không âm thì không vẽ", () => {
    const negative = render(<FundamentalChart chart={NET_CASH_TO_EQUITY} />)
    expect(upperPanel(negative.container).querySelectorAll("[data-zero-line]")).toHaveLength(1)
    negative.unmount()
    const positive = render(<FundamentalChart chart={CASH_TO_SHORT_DEBT} />)
    expect(upperPanel(positive.container).querySelectorAll("[data-zero-line]")).toHaveLength(0)
  })

  it("ROE và ROA đều dương: lề trục không kéo xuống dưới 0, không có mốc 0", () => {
    const { container } = render(<FundamentalChart chart={BANK_ROE} />)
    const upper = upperPanel(container)
    expect(upper.querySelectorAll("[data-zero-line]")).toHaveLength(0)
    const ticks = [...upper.querySelectorAll("text")].map((node) => node.textContent ?? "")
    expect(ticks.some((text) => text.startsWith("-") || text.startsWith("−"))).toBe(false)
  })

  it("khuôn A mọi giá trị âm vẫn có mốc 0", () => {
    const chart: FundamentalChartData = {
      name: "Tăng trưởng LNST",
      kind: "A",
      unit: "%",
      labels: LABELS,
      main: [{ name: "Tăng trưởng LNST", v: [-5, -12, -3, -8] }],
    }
    const { container } = render(<FundamentalChart chart={chart} />)
    expect(upperPanel(container).querySelectorAll("[data-zero-line]")).toHaveLength(1)
  })

  it("ROE ngân hàng: 2 đường --s1 và --line2, cột đòn bẩy ở tầng dưới", () => {
    const { container } = render(<FundamentalChart chart={BANK_ROE} />)
    const strokes = [...upperPanel(container).querySelectorAll("path[stroke]")].map((path) => path.getAttribute("stroke"))
    expect(strokes).toEqual(["var(--s1)", SECOND_LINE_COLOR])
    expect(SECOND_LINE_COLOR).toBe("var(--line2)")
    const panels = container.querySelectorAll('svg[role="img"]')
    expect(panels).toHaveLength(2)
    expect(panels[1].querySelectorAll("path[fill]").length).toBe(4)
    const legend = [...container.querySelectorAll("ul li")].map((item) => item.textContent)
    expect(legend).toEqual(["ROE 4 quý", "ROA 4 quý", "Đòn bẩy (Tổng tài sản / VCSH)"])
  })

  it('nút "Bảng số" mặc định có, bấm lại là "Ẩn bảng"', () => {
    render(<FundamentalChart chart={YEARS_TO_SELL_INVENTORY} />)
    fireEvent.click(screen.getByRole("button", { name: "Bảng số" }))
    const table = screen.getByRole("table")
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Kỳ",
      "Số năm bán hết tồn kho",
      "Tồn kho",
      "Giá vốn 4 quý",
    ])
    expect(within(table).getByText("3,5 năm")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Ẩn bảng" }))
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("showTable={false} (Học viện) ẩn nút Bảng số, giữ chú giải", () => {
    render(<FundamentalChart chart={BANK_ROE} showTable={false} />)
    expect(screen.queryByRole("button", { name: "Bảng số" })).toBeNull()
    expect(screen.queryByRole("table")).toBeNull()
    expect(screen.getByText("ROE 4 quý")).toBeTruthy()
  })
})
