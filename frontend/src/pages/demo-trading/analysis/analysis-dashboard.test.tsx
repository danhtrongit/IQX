import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  SERIES_COLORS,
  decimalsForUnit,
  figureLegend,
  figureTable,
  figureTooltip,
} from "./charts/figure-data"
import { AnalysisDashboard } from "./dashboard"
import { isSameSettings, nksSignature } from "./model"
/* Danh mục 33 chỉ tiêu của spec §8, theo đúng thứ tự và nhóm. */
const GROUPS: [string, string[]][] = [
  [
    "Tốc độ tăng trưởng",
    [
      "Tăng trưởng doanh thu",
      "Tăng trưởng LNST",
      "Tăng trưởng EPS",
      "Revenue CAGR 3Y",
      "Net Profit CAGR 3Y",
      "EPS CAGR 3Y",
    ],
  ],
  [
    "Độ ổn định",
    [
      "Profit Positive Streak",
      "Revenue Growth Stability",
      "Margin Stability",
      "EPS Stability",
      "ROIC Stability",
    ],
  ],
  [
    "Hiệu quả và biên lợi nhuận",
    [
      "ROE",
      "ROA",
      "ROIC",
      "Biên lợi nhuận gộp",
      "Biên lợi nhuận ròng",
      "Asset Turnover",
      "Cash Conversion Cycle",
    ],
  ],
  ["Nợ và khả năng thanh toán", ["D/E", "Current Ratio", "Interest Coverage", "Net Debt / EBITDA"]],
  ["Dòng tiền", ["CFO Margin", "CFO / LNST", "Capex / Revenue", "FCF Margin", "FCF Positive Streak"]],
  ["Định giá", ["P/E", "P/B", "P/S", "PEG", "EV / EBITDA", "FCF Yield"]],
]

const ALL_NAMES = GROUPS.flatMap(([, items]) => items)

const KIND_BY_NAME: Record<string, string> = {
  "Tăng trưởng doanh thu": "A",
  "Tăng trưởng LNST": "A",
  "Tăng trưởng EPS": "A",
  "Revenue CAGR 3Y": "D",
  "Net Profit CAGR 3Y": "D",
  "EPS CAGR 3Y": "D",
  "Profit Positive Streak": "E2",
  "FCF Positive Streak": "E2",
  "Revenue Growth Stability": "E1",
  "Margin Stability": "E1",
  "EPS Stability": "E1",
  "ROIC Stability": "E1",
  "Cash Conversion Cycle": "C",
  PEG: "F2",
  "P/E": "F",
  "P/B": "F",
  "P/S": "F",
  "EV / EBITDA": "F",
  "FCF Yield": "F",
}

/** 11 chỉ tiêu áp dụng cho mã ngân hàng (spec §7). */
const BANK_NAMES = [
  "Tăng trưởng LNST",
  "Tăng trưởng EPS",
  "Net Profit CAGR 3Y",
  "EPS CAGR 3Y",
  "Profit Positive Streak",
  "EPS Stability",
  "ROE",
  "ROA",
  "P/E",
  "P/B",
  "PEG",
]

const DEFAULT_CHARTS = [
  "Tăng trưởng doanh thu",
  "Tăng trưởng LNST",
  "Biên lợi nhuận ròng",
  "ROE",
  "D/E",
  "P/E",
]

const mocks = vi.hoisted(() => ({
  requestOperation: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  openAuth: vi.fn(),
}))

vi.mock("@/lib/contract-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/contract-client")>()),
  requestOperation: mocks.requestOperation,
}))
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: "tester" }, openAuth: mocks.openAuth }),
}))
vi.mock("sonner", () => ({ toast: mocks.toast }))

/** Trạng thái máy chủ giả lập cho mỗi phép thử. */
type FakeState = {
  charts: string[]
  per: "q" | "y"
  nks: Record<string, { q?: number; y?: number }>
  isBank: boolean
  saved: { charts: string[]; per: "q" | "y"; nks: Record<string, { q?: number; y?: number }> } | null
}

let state: FakeState

function chartEntry(name: string, isBank: boolean) {
  if (isBank && !BANK_NAMES.includes(name)) return { name, na: 1 }
  const kind = KIND_BY_NAME[name] ?? "B"
  if (kind === "D" || kind === "E1" || kind === "E2") {
    return {
      name,
      kind,
      unit: "tỷ đồng",
      decimals: 0,
      status: "ok",
      labels: ["2022", "2023", "2024", "2025"],
      main: [{ name: `${name} hằng năm`, v: [10, 12, 15, 18] }],
      mainUnit: "tỷ đồng",
      hero: 12,
    }
  }
  if (kind === "F") {
    return { name, kind, unit: "lần", decimals: 2, status: "ok", v: [] }
  }
  const series = {
    labels: ["Q1/25", "Q2/25", "Q3/25", "Q4/25", "Q1/26"],
    main: [{ name: `${name} 4 quý`, v: [10.5, 11.2, 12.4, 13.1, 14.8] }],
    sub: {
      unit: "tỷ đồng",
      type: "grouped" as const,
      series: [{ name: "Kỳ này", v: [100, 110, 120, 130, 140] }],
    },
  }
  return {
    name,
    kind,
    unit: "%",
    decimals: 1,
    status: "ok",
    q: series,
    y: {
      labels: ["2022", "2023", "2024", "2025"],
      main: [{ name: `${name} 4 quý`, v: [9.1, 10.2, 11.4, 12.6] }],
      sub: {
        unit: "tỷ đồng",
        type: "grouped" as const,
        series: [{ name: "Kỳ này", v: [900, 1000, 1100, 1200] }],
      },
    },
    ...(kind === "F2" ? { ref: 1 } : {}),
  }
}

function install() {
  mocks.requestOperation.mockImplementation((key: string, request: { body?: unknown }) => {
    if (key === "GET /api/v2/dashboard/settings") {
      return Promise.resolve({ charts: state.charts, per: state.per, nks: state.nks })
    }
    if (key === "GET /api/v2/dashboard/catalog") {
      return Promise.resolve(
        GROUPS.map(([group, items]) => ({
          group,
          items: items.map((name) => ({
            name,
            na_for_bank: !BANK_NAMES.includes(name),
          })),
        })),
      )
    }
    if (key === "GET /api/v2/fundamental/{symbol}") {
      const charts: Record<string, unknown> = {}
      for (const name of ALL_NAMES) charts[name] = chartEntry(name, state.isBank)
      return Promise.resolve({
        symbol: "FPT",
        is_bank: state.isBank,
        per: state.per,
        charts,
      })
    }
    if (key === "GET /api/v2/valuation/{symbol}") {
      return Promise.resolve({
        symbol: "FPT",
        dates: ["2026-01-02", "2026-02-02", "2026-03-02"],
        charts: {},
      })
    }
    if (key === "PUT /api/v2/dashboard/settings") {
      const body = request.body as { charts: string[]; per: "q" | "y"; nks: FakeState["nks"] }
      state.saved = { charts: body.charts, per: body.per, nks: body.nks }
      return Promise.resolve({ ...body, revision: 2, updated_at: "2026-10-22T00:00:00Z" })
    }
    return Promise.reject(new Error(`Không có route giả lập: ${key}`))
  })
}

function renderDashboard(symbol = "FPT") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AnalysisDashboard symbol={symbol} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function cardNames(): string[] {
  return [...document.querySelectorAll<HTMLElement>("[data-chart]")].map(
    (element) => element.dataset.chart ?? "",
  )
}

beforeEach(() => {
  state = { charts: [...DEFAULT_CHARTS], per: "q", nks: {}, isBank: false, saved: null }
  mocks.requestOperation.mockReset()
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  install()
})

afterEach(() => vi.unstubAllGlobals())

describe("Dashboard phân tích · thiết lập biểu đồ", () => {
  it("tick thêm biểu đồ vào cuối dashboard và bỏ tick thì biểu đồ mất", async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole("heading", { level: 1, name: "Dashboard phân tích" })
    await waitFor(() => expect(cardNames()).toHaveLength(DEFAULT_CHARTS.length))

    await user.click(await screen.findByRole("checkbox", { name: "Hiện biểu đồ ROA" }))
    await waitFor(() => expect(cardNames()).toHaveLength(DEFAULT_CHARTS.length + 1))
    expect(cardNames().at(-1)).toBe("ROA")

    await user.click(screen.getByRole("checkbox", { name: "Hiện biểu đồ ROA" }))
    await waitFor(() => expect(cardNames()).toHaveLength(DEFAULT_CHARTS.length))
    expect(cardNames()).not.toContain("ROA")
  })

  it("bấm × trên thẻ thì ô tick bỏ theo", async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole("heading", { level: 1, name: "Dashboard phân tích" })
    await waitFor(() => expect(cardNames()).toHaveLength(DEFAULT_CHARTS.length))

    await user.click(screen.getByRole("button", { name: "Bỏ ROE khỏi dashboard" }))
    await waitFor(() => expect(cardNames()).not.toContain("ROE"))
    expect(
      screen.getByRole("checkbox", { name: "Hiện biểu đồ ROE" }).getAttribute("aria-checked"),
    ).toBe("false")
  })

  it("mỗi biểu đồ nhớ riêng số kỳ cho Quý và cho Năm", async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole("heading", { level: 1, name: "Dashboard phân tích" })
    await screen.findByLabelText("Số kỳ hiển thị của ROE")

    const select = screen.getByLabelText("Số kỳ hiển thị của ROE") as HTMLSelectElement
    expect(select.value).toBe("5")
    await user.selectOptions(select, "20")
    expect((screen.getByLabelText("Số kỳ hiển thị của ROE") as HTMLSelectElement).value).toBe("20")

    await user.click(screen.getByRole("button", { name: "Năm" }))
    await waitFor(() =>
      expect((screen.getByLabelText("Số kỳ hiển thị của ROE") as HTMLSelectElement).value).toBe("5"),
    )

    await user.click(screen.getByRole("button", { name: "Quý" }))
    await waitFor(() =>
      expect((screen.getByLabelText("Số kỳ hiển thị của ROE") as HTMLSelectElement).value).toBe("20"),
    )
  })

  it("nút Lưu thiết lập sáng khi có thay đổi và đổi thành ✓ Đã lưu sau khi lưu", async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole("heading", { level: 1, name: "Dashboard phân tích" })
    await waitFor(() => expect(cardNames()).toHaveLength(DEFAULT_CHARTS.length))

    const save = screen.getByRole("button", { name: "✓ Đã lưu" })
    expect(save).toHaveProperty("disabled", true)

    await user.click(screen.getByRole("checkbox", { name: "Hiện biểu đồ ROA" }))
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Lưu thiết lập" })).toHaveProperty("disabled", false),
    )

    await user.click(screen.getByRole("button", { name: "Lưu thiết lập" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "✓ Đã lưu" })).toHaveProperty("disabled", true))
    expect(state.saved?.charts.at(-1)).toBe("ROA")
    expect(mocks.toast.success).toHaveBeenCalledWith("Đã lưu thiết lập dashboard")
  })

  it("Mặc định đưa về 6 biểu đồ, Quý và 5 kỳ nhưng chưa lưu", async () => {
    const user = userEvent.setup()
    state.charts = ["ROE"]
    renderDashboard()
    await screen.findByRole("heading", { level: 1, name: "Dashboard phân tích" })
    await waitFor(() => expect(cardNames()).toEqual(["ROE"]))

    await user.click(screen.getByRole("button", { name: "Mặc định" }))
    await waitFor(() => expect(cardNames()).toEqual(DEFAULT_CHARTS))
    await screen.findByLabelText("Số kỳ hiển thị của ROE")
    expect(screen.getByRole("button", { name: "Quý" }).getAttribute("aria-pressed")).toBe("true")
    expect((screen.getByLabelText("Số kỳ hiển thị của ROE") as HTMLSelectElement).value).toBe("5")
    expect(state.saved).toBeNull()
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "Đã đưa về bộ mặc định, bấm Lưu thiết lập để giữ",
    )
  })

  it("mã ngân hàng báo 22 chỉ tiêu không áp dụng", async () => {
    const user = userEvent.setup()
    state.isBank = true
    state.charts = ["Tăng trưởng doanh thu", "ROE"]
    renderDashboard("VCB")
    await screen.findByRole("heading", { level: 1, name: "Dashboard phân tích" })
    await waitFor(() => expect(cardNames()).toHaveLength(2))

    const notApplicable = await screen.findByText(
      "Không áp dụng cho ngân hàng. Báo cáo tài chính ngân hàng không có chỉ tiêu này theo cách tính của doanh nghiệp thông thường.",
    )
    expect(notApplicable).toBeTruthy()
    expect(screen.getAllByText("Không áp dụng").length).toBeGreaterThan(0)
    expect(screen.getByText("Ngân hàng")).toBeTruthy()
    // Thẻ không áp dụng cho ngân hàng không được hiện nhãn "Theo năm, cố định".
    const revCard = document.querySelector<HTMLElement>('[data-chart="Tăng trưởng doanh thu"]')
    expect(revCard?.textContent).not.toContain("Theo năm, cố định")

    // Chỉ tiêu không áp dụng vẫn tick được.
    const checkbox = screen.getByRole("checkbox", { name: "Hiện biểu đồ ROIC" })
    await user.click(checkbox)
    await waitFor(() => expect(cardNames()).toHaveLength(3))
  })

  it("đầu thẻ không có con số lớn của kỳ gần nhất", async () => {
    renderDashboard()
    await screen.findByRole("heading", { level: 1, name: "Dashboard phân tích" })
    await screen.findByLabelText("Số kỳ hiển thị của ROE")

    const card = document.querySelector<HTMLElement>('[data-chart="ROE"]')
    expect(card).toBeTruthy()
    const header = card?.querySelector("header")
    expect(header?.textContent?.trim()).toBe("ROE")
  })

  it("khung Biểu đồ đếm số chỉ tiêu đã chọn và lọc theo tên", async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByRole("heading", { level: 1, name: "Dashboard phân tích" })
    await waitFor(() => expect(cardNames()).toHaveLength(DEFAULT_CHARTS.length))

    expect(screen.getByText(`Đã chọn ${DEFAULT_CHARTS.length}/33`)).toBeTruthy()

    await user.type(screen.getByLabelText("Tìm chỉ tiêu"), "roe")
    await waitFor(() =>
      expect(screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"))).toEqual([
        "Hiện biểu đồ ROE",
      ]),
    )

    await user.clear(screen.getByLabelText("Tìm chỉ tiêu"))
    await user.type(screen.getByLabelText("Tìm chỉ tiêu"), "khong-co-chi-tieu")
    expect(await screen.findByText("Không có chỉ tiêu phù hợp")).toBeTruthy()
  })

  it("kéo thả đổi thứ tự thẻ về đầu, tiến 1 bước và về cuối dashboard", async () => {
    renderDashboard()
    await screen.findByRole("heading", { level: 1, name: "Dashboard phân tích" })
    await waitFor(() => expect(cardNames()).toHaveLength(DEFAULT_CHARTS.length))

    // Kéo ROE về đầu
    const roe = document.querySelector<HTMLElement>('[data-chart="ROE"]')!
    const first = document.querySelector<HTMLElement>('[data-chart="Tăng trưởng doanh thu"]')!
    fireEvent.dragStart(roe)
    fireEvent.dragOver(first)
    fireEvent.drop(first)
    await waitFor(() => expect(cardNames()[0]).toBe("ROE"))

    // Kéo ROE tiến 1 vị trí (từ index 0 sang sau Tăng trưởng doanh thu ở index 1)
    fireEvent.dragStart(document.querySelector<HTMLElement>('[data-chart="ROE"]')!)
    fireEvent.dragOver(document.querySelector<HTMLElement>('[data-chart="Tăng trưởng doanh thu"]')!)
    fireEvent.drop(document.querySelector<HTMLElement>('[data-chart="Tăng trưởng doanh thu"]')!)
    await waitFor(() => expect(cardNames().slice(0, 2)).toEqual(["Tăng trưởng doanh thu", "ROE"]))

    // Kéo Tăng trưởng doanh thu xuống cuối cùng (sau P/E)
    fireEvent.dragStart(document.querySelector<HTMLElement>('[data-chart="Tăng trưởng doanh thu"]')!)
    fireEvent.dragOver(document.querySelector<HTMLElement>('[data-chart="P/E"]')!)
    fireEvent.drop(document.querySelector<HTMLElement>('[data-chart="P/E"]')!)
    await waitFor(() => expect(cardNames().at(-1)).toBe("Tăng trưởng doanh thu"))
  })

  it("chuẩn hoá nks khi đổi về 5 kỳ mặc định và giữ nhãn Theo năm, cố định cho khuôn D/E1/E2", async () => {
    const user = userEvent.setup()
    state.charts = ["ROE", "Revenue CAGR 3Y"]
    renderDashboard()
    await screen.findByRole("heading", { level: 1, name: "Dashboard phân tích" })
    await screen.findByLabelText("Số kỳ hiển thị của ROE")

    const cagrCard = document.querySelector<HTMLElement>('[data-chart="Revenue CAGR 3Y"]')
    expect(cagrCard?.textContent).toContain("Theo năm, cố định")
    expect(screen.queryByLabelText("Số kỳ hiển thị của Revenue CAGR 3Y")).toBeNull()

    const select = screen.getByLabelText("Số kỳ hiển thị của ROE") as HTMLSelectElement
    await user.selectOptions(select, "20")
    expect(screen.getByRole("button", { name: "Lưu thiết lập" })).toHaveProperty("disabled", false)

    // Chọn lại 5 kỳ (mặc định) thì trạng thái sạch ngay như ban đầu
    await user.selectOptions(select, "5")
    expect(screen.getByRole("button", { name: "✓ Đã lưu" })).toHaveProperty("disabled", true)
    expect(nksSignature({ ROE: { q: 5, y: 5 } })).toBe("")
    expect(
      isSameSettings(
        { charts: ["ROE"], per: "q", nks: { ROE: { q: 5 } } },
        { charts: ["ROE"], per: "q", nks: {} },
      ),
    ).toBe(true)
  })

  it("định dạng đúng đơn vị, số lẻ, hàng phụ và chú giải của từng khuôn biểu đồ", () => {
    expect(decimalsForUnit("%")).toBe(1)
    expect(decimalsForUnit("điểm %")).toBe(1)
    expect(decimalsForUnit("lần")).toBe(2)
    expect(decimalsForUnit("tỷ đồng")).toBe(0)
    expect(decimalsForUnit("đồng/CP")).toBe(0)
    expect(decimalsForUnit("ngày")).toBe(0)
    expect(SERIES_COLORS).toEqual(["var(--chart-1)", "#d95926", "#199e70"])

    // Khuôn B có đường chính % (1 số lẻ) và cột phụ tỷ đồng (0 số lẻ)
    const viewB = {
      name: "ROE",
      kind: "B" as const,
      unit: "%",
      decimals: 1,
      labels: ["Q1/26"],
      main: [{ name: "ROE (4 quý)", v: [15.4] }],
      sub: { unit: "tỷ đồng", type: "grouped" as const, series: [{ name: "LNST 4 quý", v: [1234.56] }] },
    }
    expect(figureTooltip(viewB, 0).rows).toEqual([
      ["ROE (4 quý)", "15,4%"],
      ["LNST 4 quý", "1.235 tỷ đồng"],
    ])
    expect(figureTable(viewB)).toEqual({
      columns: ["Kỳ", "ROE (4 quý)", "LNST 4 quý"],
      rows: [["Q1/26", "15,4%", "1.235 tỷ đồng"]],
    })

    // Khuôn D có hàng/cột Theo CAGR và cột đầu "Năm"
    const viewD = {
      name: "Revenue CAGR 3Y",
      kind: "D" as const,
      unit: "%",
      decimals: 1,
      mainUnit: "tỷ đồng",
      hero: 10,
      labels: ["2023", "2024"],
      main: [{ name: "Doanh thu", v: [1000, 1200] }],
    }
    expect(figureTooltip(viewD, 1).rows).toEqual([
      ["Doanh thu", "1.200 tỷ đồng"],
      ["Theo CAGR", "1.100 tỷ đồng"],
    ])
    expect(figureTable(viewD)).toEqual({
      columns: ["Năm", "Doanh thu", "Theo CAGR"],
      rows: [
        ["2023", "1.000 tỷ đồng", "1.000 tỷ đồng"],
        ["2024", "1.200 tỷ đồng", "1.100 tỷ đồng"],
      ],
    })

    // Khuôn E1 có hàng Bình quân trong tooltip và cột đầu "Năm"
    const viewE1 = {
      name: "EPS Stability",
      kind: "E1" as const,
      unit: "%",
      decimals: 1,
      mainUnit: "đồng/CP",
      hero: 8.5,
      labels: ["2023", "2024"],
      main: [{ name: "EPS năm", v: [2000, 3000] }],
    }
    expect(figureTooltip(viewE1, 0).rows).toEqual([
      ["EPS năm", "2.000 đồng/CP"],
      ["Bình quân", "2.500 đồng/CP"],
    ])
    expect(figureTable(viewE1)).toEqual({
      columns: ["Năm", "EPS năm"],
      rows: [
        ["2023", "2.000 đồng/CP"],
        ["2024", "3.000 đồng/CP"],
      ],
    })

    // Khuôn F2 chú giải PEG = 1
    const viewF2 = {
      name: "PEG",
      kind: "F2" as const,
      unit: "lần",
      decimals: 2,
      reference: 1,
      labels: ["Q1/26"],
      main: [{ name: "PEG cuối quý", v: [1.25] }],
    }
    expect(figureLegend(viewF2).map((item) => item.label)).toEqual(["PEG cuối quý", "PEG = 1"])
  })
})
