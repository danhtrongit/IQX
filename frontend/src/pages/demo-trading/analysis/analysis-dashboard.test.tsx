import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  FOURTH_COLOR,
  SECOND_LINE_COLOR,
  SERIES_COLORS,
  decimalsForUnit,
  figureLegend,
  figureTable,
  figureTooltip,
} from "@/components/fundamental-charts"

import { AnalysisDashboard } from "./dashboard"
import { academyMetricHref, defaultDraftOf, isSameSettings, normalizeSearch, nksSignature } from "./model"

type Industry = "thuong" | "nh" | "ck" | "bh"
type Item = [name: string, metricKey: string, kind: string]
type Draft = { charts: string[]; per: "q" | "y"; nks: Record<string, { q?: number; y?: number }> }

/* 17 chỉ tiêu chung của spec §8.1 (Học viện Chương 8), theo đúng nhóm và thứ tự. */
const COMMON: [string, Item[]][] = [
  [
    "Tăng trưởng",
    [
      ["Tăng trưởng doanh thu", "revenue_yoy", "A"],
      ["Tăng trưởng LNST", "profit_yoy", "A"],
      ["Tăng trưởng EPS", "eps_yoy", "A"],
      ["Revenue CAGR 3Y", "revenue_cagr3", "D"],
      ["Net Profit CAGR 3Y", "profit_cagr3", "D"],
      ["EPS CAGR 3Y", "eps_cagr3", "D"],
    ],
  ],
  [
    "Ổn định",
    [
      ["Profit Positive Streak", "profit_positive_streak", "E2"],
      ["Revenue Growth Stability", "revenue_growth_stability", "E1"],
      ["Margin Stability", "net_margin_stability", "E1"],
      ["EPS Stability", "eps_growth_stability", "E1"],
    ],
  ],
  [
    "Hiệu quả",
    [
      ["ROE", "roe", "B"],
      ["ROA", "roa", "B"],
      ["Biên lợi nhuận ròng", "net_margin", "B"],
    ],
  ],
  [
    "Định giá",
    [
      ["P/E", "pe", "F"],
      ["P/B", "pb", "F"],
      ["P/S", "ps", "F"],
      ["PEG", "peg", "F2"],
    ],
  ],
]

/* Chương riêng của từng ngành: 16 + 11 + 10 + 8 chỉ tiêu (spec §8.2–§8.5). */
const OWN: Record<Industry, { chapter: string; academy: number; groups: [string, Item[]][] }> = {
  thuong: {
    chapter: "Doanh nghiệp sản xuất",
    academy: 9,
    groups: [
      [
        "Hiệu quả và biên lợi nhuận",
        [
          ["Biên lợi nhuận gộp", "gross_margin", "B"],
          ["ROIC", "roic", "B"],
          ["ROIC Stability", "roic_stability", "E1"],
          ["Asset Turnover", "asset_turnover", "B"],
          ["Cash Conversion Cycle", "ccc", "C"],
        ],
      ],
      [
        "Nợ và khả năng thanh toán",
        [
          ["D/E", "debt_equity", "B"],
          ["Current Ratio", "current_ratio", "B"],
          ["Interest Coverage", "interest_coverage", "B"],
          ["Net Debt / EBITDA", "net_debt_ebitda", "B"],
        ],
      ],
      [
        "Dòng tiền",
        [
          ["CFO Margin", "cfo_margin", "B"],
          ["CFO / LNST", "cfo_profit", "B"],
          ["Capex / Revenue", "capex_revenue", "B"],
          ["FCF Margin", "fcf_margin", "B"],
          ["FCF Positive Streak", "fcf_positive_streak", "E2"],
        ],
      ],
      [
        "Định giá",
        [
          ["EV / EBITDA", "ev_ebitda", "F"],
          ["FCF Yield", "fcf_yield", "F"],
        ],
      ],
    ],
  },
  nh: {
    chapter: "Ngân hàng",
    academy: 10,
    groups: [
      [
        "Thu nhập và hiệu quả",
        [
          ["NIM", "nim", "B"],
          ["Lợi suất tài sản sinh lãi và chi phí vốn", "yield_cost", "B"],
          ["CIR", "cir", "B"],
          ["Tỷ trọng thu nhập ngoài lãi", "non_interest_share", "B"],
          ["Tăng trưởng lợi nhuận trước dự phòng", "ppop_growth", "A"],
        ],
      ],
      [
        "Rủi ro tín dụng",
        [
          ["Chi phí tín dụng", "credit_cost", "B"],
          ["Tỷ lệ dự phòng / Dư nợ", "provision_to_loans", "B"],
          ["Lãi dự thu / Dư nợ", "accrued_to_loans", "B"],
        ],
      ],
      [
        "Quy mô và vốn",
        [
          ["Tăng trưởng tín dụng và huy động", "credit_deposit_growth", "A"],
          ["LDR", "ldr", "B"],
          ["VCSH / Tổng tài sản", "equity_to_assets", "B"],
        ],
      ],
    ],
  },
  ck: {
    chapter: "Chứng khoán",
    academy: 11,
    groups: [
      [
        "Doanh thu và chi phí",
        [
          ["Cơ cấu doanh thu hoạt động", "revenue_mix", "B"],
          ["Biên lợi nhuận hoạt động", "operating_margin", "B"],
          ["Chi phí hoạt động / Doanh thu hoạt động", "opex_to_revenue", "B"],
        ],
      ],
      [
        "Cho vay margin",
        [
          ["Tăng trưởng dư nợ cho vay", "margin_loan_growth", "A"],
          ["Dư nợ cho vay / VCSH", "margin_loan_to_equity", "B"],
          ["Lợi suất cho vay", "margin_loan_yield", "B"],
        ],
      ],
      [
        "Môi giới và tự doanh",
        [
          ["Biên lợi nhuận môi giới", "brokerage_margin", "B"],
          ["Tỷ trọng tài sản tự doanh", "prop_asset_share", "B"],
          ["Hiệu suất tự doanh", "prop_return", "B"],
        ],
      ],
      ["Đòn bẩy", [["Nợ vay / VCSH", "borrowings_to_equity", "B"]]],
    ],
  },
  bh: {
    chapter: "Bảo hiểm",
    academy: 12,
    groups: [
      [
        "Doanh thu phí",
        [
          ["Tăng trưởng doanh thu phí bảo hiểm gốc", "gwp_growth", "A"],
          ["Tỷ lệ giữ lại", "retention_ratio", "B"],
        ],
      ],
      [
        "Hiệu quả nghiệp vụ",
        [
          ["Tỷ lệ bồi thường", "loss_ratio", "B"],
          ["Tỷ lệ chi phí", "expense_ratio", "B"],
          ["Combined ratio", "combined_ratio", "B"],
        ],
      ],
      [
        "Đầu tư",
        [
          ["Lợi suất đầu tư", "investment_yield", "B"],
          ["Cơ cấu lợi nhuận", "profit_mix", "B"],
        ],
      ],
      ["Dự phòng", [["Dự phòng nghiệp vụ / VCSH", "reserves_to_equity", "B"]]],
    ],
  },
}

const INDUSTRY_LABEL: Record<Industry, string> = {
  thuong: "Doanh nghiệp sản xuất",
  nh: "Ngân hàng",
  ck: "Chứng khoán",
  bh: "Bảo hiểm",
}

/* Bộ mặc định của từng ngành (spec §6.3). */
const DEFAULTS: Record<Industry, string[]> = {
  thuong: ["Tăng trưởng doanh thu", "Tăng trưởng LNST", "Biên lợi nhuận ròng", "ROE", "D/E", "P/E"],
  nh: ["Tăng trưởng LNST", "NIM", "CIR", "Chi phí tín dụng", "ROE", "P/B"],
  ck: [
    "Cơ cấu doanh thu hoạt động",
    "Tăng trưởng LNST",
    "Dư nợ cho vay / VCSH",
    "Biên lợi nhuận hoạt động",
    "ROE",
    "P/B",
  ],
  bh: [
    "Tăng trưởng doanh thu phí bảo hiểm gốc",
    "Combined ratio",
    "Lợi suất đầu tư",
    "Tăng trưởng LNST",
    "ROE",
    "P/B",
  ],
}

const TOTAL: Record<Industry, number> = { thuong: 33, nh: 28, ck: 27, bh: 25 }

/** Ngành của từng mã giả lập (spec §1.3). */
const INDUSTRY_OF: Record<string, Industry> = {
  FPT: "thuong",
  HPG: "thuong",
  VCB: "nh",
  MBB: "nh",
  SSI: "ck",
  BVH: "bh",
}

const KIND_OF = new Map<string, string>()
const KEY_OF = new Map<string, string>()
const INDUSTRY_NAMES: Record<Industry, string[]> = { thuong: [], nh: [], ck: [], bh: [] }
for (const industry of Object.keys(OWN) as Industry[]) {
  for (const [, items] of [...COMMON, ...OWN[industry].groups]) {
    for (const [name, key, kind] of items) {
      KIND_OF.set(name, kind)
      KEY_OF.set(name, key)
      INDUSTRY_NAMES[industry].push(name)
    }
  }
}

function catalogOf() {
  return {
    industries: (Object.keys(OWN) as Industry[]).map((industry) => ({
      nganh: industry,
      label: INDUSTRY_LABEL[industry],
      total: TOTAL[industry],
      default_charts: DEFAULTS[industry],
      chapters: [
        {
          chapter: "Phân tích cơ bản chung",
          academy_chapter: 8,
          groups: COMMON.map(([group, items]) => ({
            group,
            items: items.map(([name, metric_key, kind]) => ({ name, metric_key, kind })),
          })),
        },
        {
          chapter: OWN[industry].chapter,
          academy_chapter: OWN[industry].academy,
          groups: OWN[industry].groups.map(([group, items]) => ({
            group,
            items: items.map(([name, metric_key, kind]) => ({ name, metric_key, kind })),
          })),
        },
      ],
    })),
  }
}

const mocks = vi.hoisted(() => ({
  requestOperation: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  openAuth: vi.fn(),
  auth: { isAuthenticated: true },
}))

vi.mock("@/lib/contract-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/contract-client")>()),
  requestOperation: mocks.requestOperation,
}))
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isAuthenticated: mocks.auth.isAuthenticated,
    isLoading: false,
    user: mocks.auth.isAuthenticated ? { id: "tester" } : null,
    openAuth: mocks.openAuth,
  }),
}))
vi.mock("sonner", () => ({ toast: mocks.toast }))

/** Trạng thái máy chủ giả lập cho mỗi phép thử. */
type FakeState = {
  /** Thiết lập đã lưu của từng ngành, đúng như `GET /dashboard/settings` trả về. */
  saved: Record<Industry, Draft>
  /** Mọi lần lưu, để kiểm tra chỉ ngành đang xem được ghi. */
  puts: { nganh: Industry; body: Draft }[]
  /** Giữ câu trả lời số liệu để xem thẻ lúc đang tải. */
  holdFundamental?: boolean
}

let state: FakeState

const freshSettings = (): Record<Industry, Draft> => ({
  thuong: { charts: [...DEFAULTS.thuong], per: "q", nks: {} },
  nh: { charts: [...DEFAULTS.nh], per: "q", nks: {} },
  ck: { charts: [...DEFAULTS.ck], per: "q", nks: {} },
  bh: { charts: [...DEFAULTS.bh], per: "q", nks: {} },
})

/** Các chỉ tiêu có hai đường trên tầng trên (spec §9) và đường tham chiếu của khuôn B. */
const TWO_LINES: Record<string, [string, string]> = {
  "Lợi suất tài sản sinh lãi và chi phí vốn": ["Lợi suất tài sản sinh lãi", "Chi phí vốn"],
  "Tăng trưởng tín dụng và huy động": ["Tăng trưởng tín dụng", "Tăng trưởng huy động"],
}

/** Cột chồng của khuôn B: Combined ratio có hai cột, Cơ cấu doanh thu hoạt động có bốn cột (cột thứ tư tím). */
const STACKS: Record<string, string[]> = {
  "Combined ratio": ["Tỷ lệ bồi thường", "Tỷ lệ chi phí"],
  "Cơ cấu doanh thu hoạt động": ["Môi giới", "Cho vay margin", "Tự doanh", "Khác"],
}

function chartEntry(name: string) {
  const kind = KIND_OF.get(name) ?? "B"
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
  const lines = TWO_LINES[name]
  const main = (values: number[]) =>
    lines
      ? [
          { name: lines[0], v: values },
          { name: lines[1], v: values.map((value) => value / 2) },
        ]
      : [{ name: `${name} 4 quý`, v: values }]
  const stack = STACKS[name]
  const stacked = stack !== undefined
  const bars = (values: number[]) =>
    stack
      ? stack.map((series, index) => ({
          name: series,
          v: values.map((value) => (value * (index + 1)) / 10),
        }))
      : [{ name: "Kỳ này", v: values.map((value) => value * 10) }]
  const sub = {
    unit: stacked ? "%" : "tỷ đồng",
    type: stacked ? ("stacked" as const) : ("grouped" as const),
  }
  return {
    name,
    kind,
    unit: kind === "F2" ? "lần" : "%",
    decimals: kind === "F2" ? 2 : 1,
    status: "ok",
    q: {
      labels: ["Q1/25", "Q2/25", "Q3/25", "Q4/25", "Q1/26"],
      main: main([10.5, 11.2, 12.4, 13.1, 14.8]),
      sub: { ...sub, series: bars([10.5, 11.2, 12.4, 13.1, 14.8]) },
    },
    y: {
      labels: ["2022", "2023", "2024", "2025"],
      main: main([9.1, 10.2, 11.4, 12.6]),
      sub: { ...sub, series: bars([9.1, 10.2, 11.4, 12.6]) },
    },
    ...(kind === "F2" ? { ref: 1 } : {}),
    ...(name === "Combined ratio" ? { ref: 100 } : {}),
    ...(name === "D/E" ? { legend_note: "Tiền gồm đầu tư tài chính ngắn hạn" } : {}),
  }
}

function install() {
  mocks.requestOperation.mockImplementation(
    (
      key: string,
      request: { body?: unknown; path?: { symbol?: string; nganh?: Industry }; query?: { charts?: string } },
    ) => {
      if (key === "GET /api/v2/dashboard/industry/{symbol}") {
        const symbol = request.path?.symbol ?? ""
        const nganh = INDUSTRY_OF[symbol] ?? "thuong"
        return Promise.resolve({ symbol, nganh, label: INDUSTRY_LABEL[nganh] })
      }
      if (key === "GET /api/v2/dashboard/settings") {
        return Promise.resolve(structuredClone(state.saved))
      }
      if (key === "GET /api/v2/dashboard/catalog") {
        return Promise.resolve(catalogOf())
      }
      if (key === "GET /api/v2/fundamental/{symbol}") {
        if (state.holdFundamental) return new Promise(() => {})
        const symbol = request.path?.symbol ?? ""
        const nganh = INDUSTRY_OF[symbol] ?? "thuong"
        const names = (request.query?.charts ?? "").split(",").filter(Boolean)
        // Như máy chủ: chỉ tiêu ngoài ngành của mã là lỗi 400.
        const foreign = names.filter((name) => !INDUSTRY_NAMES[nganh].includes(name))
        if (foreign.length > 0) return Promise.reject(new Error(`400 ${symbol} không có ${foreign.join(", ")}`))
        const charts: Record<string, unknown> = {}
        for (const name of names) charts[name] = chartEntry(name)
        return Promise.resolve({ symbol, nganh, per: "q", charts })
      }
      if (key === "GET /api/v2/valuation/{symbol}") {
        const symbol = request.path?.symbol ?? ""
        return Promise.resolve({
          symbol,
          nganh: INDUSTRY_OF[symbol] ?? "thuong",
          dates: ["2026-01-02", "2026-02-02", "2026-03-02"],
          charts: {},
        })
      }
      if (key === "PUT /api/v2/dashboard/settings/{nganh}") {
        const nganh = request.path?.nganh as Industry
        const body = request.body as Draft
        state.puts.push({ nganh, body })
        state.saved[nganh] = structuredClone(body)
        return Promise.resolve({ ...body, nganh, revision: 2, updated_at: "2026-11-04T00:00:00Z" })
      }
      return Promise.reject(new Error(`Không có route giả lập: ${key}`))
    },
  )
}

function Probe() {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}

function renderDashboard(symbol = "FPT") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = (current: string) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AnalysisDashboard symbol={current} />
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>
  )
  const view = render(tree(symbol))
  return { ...view, setSymbol: (next: string) => view.rerender(tree(next)) }
}

function cardNames(): string[] {
  return [...document.querySelectorAll<HTMLElement>("[data-chart]")].map(
    (element) => element.dataset.chart ?? "",
  )
}

const industryChip = () => document.querySelector<HTMLElement>("[data-industry]")?.textContent ?? null

function chapterHeading(chapter: string): string {
  return document.querySelector(`[data-chapter="${chapter}"] > h3`)?.textContent ?? ""
}

function groupHeading(group: string): string {
  return document.querySelector(`[data-group="${group}"] > h4`)?.textContent ?? ""
}

const pickerNames = () =>
  screen
    .queryAllByRole("checkbox")
    .map((box) => box.getAttribute("aria-label")?.replace("Hiện biểu đồ ", "") ?? "")

async function ready(symbol = "FPT", expected: string[] = DEFAULTS[INDUSTRY_OF[symbol] ?? "thuong"]) {
  await screen.findByRole("heading", { level: 1, name: "Dashboard phân tích" })
  await waitFor(() => expect(cardNames()).toEqual(expected))
}

/** Thẻ biểu đồ đã có thân biểu đồ (số liệu đã về, hết khung chờ). */
async function chartCard(name: string): Promise<HTMLElement> {
  return waitFor(() => {
    const card = document.querySelector<HTMLElement>(`[data-chart="${name}"]`)
    expect(card?.querySelector("[data-fundamental-chart]")).toBeTruthy()
    return card as HTMLElement
  })
}

beforeEach(() => {
  state = { saved: freshSettings(), puts: [] }
  mocks.auth.isAuthenticated = true
  mocks.openAuth.mockReset()
  mocks.requestOperation.mockReset()
  mocks.toast.success.mockReset()
  mocks.toast.error.mockReset()
  install()
})

afterEach(() => vi.unstubAllGlobals())

describe("Dashboard phân tích v2 · thiết lập biểu đồ", () => {
  it("tick thêm biểu đồ vào cuối dashboard và bỏ tick thì biểu đồ mất", async () => {
    const user = userEvent.setup()
    renderDashboard()
    await ready()

    await user.click(await screen.findByRole("checkbox", { name: "Hiện biểu đồ ROA" }))
    await waitFor(() => expect(cardNames()).toHaveLength(DEFAULTS.thuong.length + 1))
    expect(cardNames().at(-1)).toBe("ROA")

    await user.click(screen.getByRole("checkbox", { name: "Hiện biểu đồ ROA" }))
    await waitFor(() => expect(cardNames()).toHaveLength(DEFAULTS.thuong.length))
    expect(cardNames()).not.toContain("ROA")
  })

  it("bấm × trên thẻ thì ô tick bỏ theo", async () => {
    const user = userEvent.setup()
    renderDashboard()
    await ready()

    await user.click(screen.getByRole("button", { name: "Bỏ ROE khỏi dashboard" }))
    await waitFor(() => expect(cardNames()).not.toContain("ROE"))
    expect(
      screen.getByRole("checkbox", { name: "Hiện biểu đồ ROE" }).getAttribute("aria-checked"),
    ).toBe("false")
  })

  it("mỗi biểu đồ nhớ riêng số kỳ cho Quý và cho Năm", async () => {
    const user = userEvent.setup()
    renderDashboard()
    await ready()
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

  it("nút Lưu thiết lập sáng khi có thay đổi, lưu đúng ngành của mã và đổi thành ✓ Đã lưu", async () => {
    const user = userEvent.setup()
    renderDashboard()
    await ready()

    expect(screen.getByRole("button", { name: "✓ Đã lưu" })).toHaveProperty("disabled", true)

    await user.click(screen.getByRole("checkbox", { name: "Hiện biểu đồ ROA" }))
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Lưu thiết lập" })).toHaveProperty("disabled", false),
    )

    await user.click(screen.getByRole("button", { name: "Lưu thiết lập" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "✓ Đã lưu" })).toHaveProperty("disabled", true))
    expect(state.puts).toHaveLength(1)
    expect(state.puts[0]?.nganh).toBe("thuong")
    expect(state.puts[0]?.body.charts.at(-1)).toBe("ROA")
    expect(mocks.requestOperation).toHaveBeenCalledWith(
      "PUT /api/v2/dashboard/settings/{nganh}",
      expect.objectContaining({ path: { nganh: "thuong" } }),
      expect.anything(),
    )
    expect(mocks.toast.success).toHaveBeenCalledWith("Đã lưu thiết lập dashboard")
  })

  it("Mặc định đưa về 6 biểu đồ của ngành, Quý và 5 kỳ nhưng chưa lưu", async () => {
    const user = userEvent.setup()
    state.saved.thuong.charts = ["ROE"]
    renderDashboard()
    await ready("FPT", ["ROE"])

    await user.click(screen.getByRole("button", { name: "Mặc định" }))
    await waitFor(() => expect(cardNames()).toEqual(DEFAULTS.thuong))
    await screen.findByLabelText("Số kỳ hiển thị của ROE")
    expect(screen.getByRole("button", { name: "Quý" }).getAttribute("aria-pressed")).toBe("true")
    expect((screen.getByLabelText("Số kỳ hiển thị của ROE") as HTMLSelectElement).value).toBe("5")
    expect(state.puts).toHaveLength(0)
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "Đã đưa về bộ mặc định, bấm Lưu thiết lập để giữ",
    )
  })

  it("đầu thẻ có tên chỉ tiêu và nút Học, không có con số lớn của kỳ gần nhất", async () => {
    renderDashboard()
    await ready()
    await screen.findByLabelText("Số kỳ hiển thị của ROE")

    const card = document.querySelector<HTMLElement>('[data-chart="ROE"]')
    expect(card).toBeTruthy()
    const header = card?.querySelector("header")
    expect(header?.textContent?.trim()).toBe("ROEHọc")
  })

  it("menu thẻ có Lên trên và Xuống dưới để đổi thứ tự khi không kéo được", async () => {
    const user = userEvent.setup()
    renderDashboard()
    await ready()

    await user.click(screen.getByRole("button", { name: "Tuỳ chọn ROE" }))
    await user.click(await screen.findByRole("menuitem", { name: "Lên trên" }))
    await waitFor(() => expect(cardNames().slice(2, 4)).toEqual(["ROE", "Biên lợi nhuận ròng"]))
    expect(screen.getByRole("button", { name: "Lưu thiết lập" })).toHaveProperty("disabled", false)

    await user.click(screen.getByRole("button", { name: "Tuỳ chọn ROE" }))
    await user.click(await screen.findByRole("menuitem", { name: "Xuống dưới" }))
    await waitFor(() => expect(cardNames().slice(2, 4)).toEqual(["Biên lợi nhuận ròng", "ROE"]))

    // Thẻ đầu không lên được nữa, thẻ cuối không xuống được nữa.
    await user.click(screen.getByRole("button", { name: "Tuỳ chọn Tăng trưởng doanh thu" }))
    expect((await screen.findByRole("menuitem", { name: "Lên trên" })).getAttribute("aria-disabled")).toBe("true")
    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: "Tuỳ chọn P/E" }))
    expect((await screen.findByRole("menuitem", { name: "Xuống dưới" })).getAttribute("aria-disabled")).toBe("true")
    await user.keyboard("{Escape}")

    // Lên rồi xuống trả lại đúng thứ tự đã lưu: không còn thay đổi chưa lưu.
    await waitFor(() => expect(screen.getByRole("button", { name: "✓ Đã lưu" })).toHaveProperty("disabled", true))
  })

  it("tay kéo là nút kéo thả dùng được bằng cảm ứng và bàn phím", async () => {
    renderDashboard()
    await ready()

    const handle = screen.getByRole("button", { name: "Kéo để đổi chỗ ROE" })
    expect(handle.getAttribute("aria-roledescription")).toBe("sortable")
    expect(handle.className).toContain("touch-none")
  })

  it("ô số kỳ và nhãn Theo năm, cố định hiện ngay cả khi thẻ đang tải", async () => {
    state.holdFundamental = true
    state.saved.thuong.charts = ["ROE", "Revenue CAGR 3Y"]
    renderDashboard()
    await screen.findByRole("heading", { level: 1, name: "Dashboard phân tích" })
    expect(await screen.findByLabelText("Số kỳ hiển thị của ROE")).toBeTruthy()
    const cagr = document.querySelector<HTMLElement>('[data-chart="Revenue CAGR 3Y"]')
    expect(cagr?.textContent).toContain("Theo năm, cố định")
  })

  it("khách chưa đăng nhập xem bộ mặc định, đổi tạm được và Lưu thiết lập mời đăng nhập", async () => {
    const user = userEvent.setup()
    mocks.auth.isAuthenticated = false
    renderDashboard()
    await ready()
    expect(mocks.requestOperation.mock.calls.map(([key]) => key)).not.toContain("GET /api/v2/dashboard/settings")

    await user.click(screen.getByRole("button", { name: "Bỏ ROE khỏi dashboard" }))
    await waitFor(() => expect(cardNames()).not.toContain("ROE"))

    await user.click(screen.getByRole("button", { name: "Lưu thiết lập" }))
    expect(mocks.openAuth).toHaveBeenCalledWith("login")
    expect(state.puts).toHaveLength(0)
  })

  it("khách xem mã ngân hàng thấy bộ mặc định của ngân hàng", async () => {
    mocks.auth.isAuthenticated = false
    renderDashboard("VCB")
    await ready("VCB")
    expect(industryChip()).toBe("Ngân hàng")
  })

  it("legend_note hiện dưới chú giải, note chỉ là lời báo biểu đồ trống", async () => {
    renderDashboard()
    await screen.findByLabelText("Số kỳ hiển thị của D/E")
    await waitFor(() =>
      expect(document.querySelector('[data-chart="D/E"]')?.textContent).toContain(
        "Tiền gồm đầu tư tài chính ngắn hạn",
      ),
    )
    expect(document.querySelector('[data-chart="ROE"]')?.textContent).not.toContain("Tiền gồm")
  })

  it("biểu đồ trong thẻ có hộp số liệu khi rê chuột và Bảng số mở đúng các kỳ đang hiện", async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    state.saved.thuong.charts = ["ROE"]
    renderDashboard()
    await screen.findByLabelText("Số kỳ hiển thị của ROE")
    const card = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('[data-chart="ROE"] [data-fundamental-chart="B"]')
      expect(element).toBeTruthy()
      return element as HTMLElement
    })
    await user.click(within(card).getByRole("button", { name: "Bảng số" }))
    const rows = within(card).getAllByRole("row")
    expect(rows).toHaveLength(6)
    expect(rows[5]?.textContent).toContain("Q1/26")
    expect(within(card).getByRole("button", { name: "Ẩn bảng" }).getAttribute("aria-expanded")).toBe("true")
  })

  it("chuẩn hoá nks khi đổi về 5 kỳ mặc định và giữ nhãn Theo năm, cố định cho khuôn D/E1/E2", async () => {
    const user = userEvent.setup()
    state.saved.thuong.charts = ["ROE", "Revenue CAGR 3Y"]
    renderDashboard()
    await ready("FPT", ["ROE", "Revenue CAGR 3Y"])
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
})

describe("Dashboard phân tích v2 · ngành của mã", () => {
  it("hiện nhãn ngành của mã cạnh ô mã, lấy từ mẫu báo cáo tài chính", async () => {
    const view = renderDashboard("FPT")
    await ready("FPT")
    expect(industryChip()).toBe("Doanh nghiệp sản xuất")
    view.setSymbol("VCB")
    await waitFor(() => expect(industryChip()).toBe("Ngân hàng"))
    view.setSymbol("SSI")
    await waitFor(() => expect(industryChip()).toBe("Chứng khoán"))
    view.setSymbol("BVH")
    await waitFor(() => expect(industryChip()).toBe("Bảo hiểm"))
  })

  it("nhãn ngành hiện khi số liệu chưa về", async () => {
    state.holdFundamental = true
    renderDashboard("VCB")
    await waitFor(() => expect(industryChip()).toBe("Ngân hàng"))
  })

  it("khung Biểu đồ chỉ có chỉ tiêu của ngành: 33, 28, 27 và 25", async () => {
    const view = renderDashboard("FPT")
    await ready("FPT")
    expect(screen.getByText("Đã chọn 6/33")).toBeTruthy()
    expect(pickerNames()).toHaveLength(33)

    view.setSymbol("VCB")
    await ready("VCB")
    expect(screen.getByText("Đã chọn 6/28")).toBeTruthy()
    const bank = pickerNames()
    expect(bank).toHaveLength(28)
    expect(bank).toContain("NIM")
    expect(bank).toContain("ROE")
    // Không có Biên gộp, D/E, CCC, dòng tiền của doanh nghiệp sản xuất.
    for (const name of ["Biên lợi nhuận gộp", "D/E", "Cash Conversion Cycle", "CFO Margin", "ROIC"]) {
      expect(bank).not.toContain(name)
    }

    view.setSymbol("SSI")
    await ready("SSI")
    expect(screen.getByText("Đã chọn 6/27")).toBeTruthy()
    expect(pickerNames()).toHaveLength(27)

    view.setSymbol("BVH")
    await ready("BVH")
    expect(screen.getByText("Đã chọn 6/25")).toBeTruthy()
    expect(pickerNames()).toHaveLength(25)
    expect(pickerNames()).toContain("Combined ratio")
  })

  it("chia hai cấp chương rồi nhóm, mỗi cấp có số đã chọn", async () => {
    renderDashboard("VCB")
    await ready("VCB")

    const chapters = [...document.querySelectorAll<HTMLElement>("[data-chapter]")].map(
      (element) => element.dataset.chapter,
    )
    expect(chapters).toEqual(["Phân tích cơ bản chung", "Ngân hàng"])
    // Mặc định ngân hàng: chung có Tăng trưởng LNST, ROE, P/B; riêng có NIM, CIR, Chi phí tín dụng.
    expect(chapterHeading("Phân tích cơ bản chung")).toContain("3/17")
    expect(chapterHeading("Ngân hàng")).toContain("3/11")
    expect(groupHeading("Tăng trưởng")).toContain("1/6")
    expect(groupHeading("Hiệu quả")).toContain("1/3")
    expect(groupHeading("Định giá")).toContain("1/4")
    expect(groupHeading("Thu nhập và hiệu quả")).toContain("2/5")
    expect(groupHeading("Rủi ro tín dụng")).toContain("1/3")
    expect(groupHeading("Quy mô và vốn")).toContain("0/3")
  })

  it("lọc theo tên giữ lại chương và nhóm có kết quả, không có kết quả thì báo", async () => {
    const user = userEvent.setup()
    renderDashboard("VCB")
    await ready("VCB")

    await user.type(screen.getByLabelText("Tìm chỉ tiêu"), "nim")
    await waitFor(() => expect(pickerNames()).toEqual(["NIM"]))
    expect(document.querySelectorAll("[data-chapter]")).toHaveLength(1)
    expect(chapterHeading("Ngân hàng")).toContain("3/11")

    await user.clear(screen.getByLabelText("Tìm chỉ tiêu"))
    await user.type(screen.getByLabelText("Tìm chỉ tiêu"), "khong-co-chi-tieu")
    expect(await screen.findByText("Không có chỉ tiêu phù hợp")).toBeTruthy()
  })

  it("mã ngân hàng không còn thẻ Không áp dụng và không bao giờ xin chỉ tiêu ngoài ngành", async () => {
    const user = userEvent.setup()
    renderDashboard("VCB")
    await ready("VCB")
    expect(screen.queryByText(/Không áp dụng/)).toBeNull()
    expect(document.body.textContent).not.toContain("Không áp dụng")

    await user.click(screen.getByRole("checkbox", { name: "Hiện biểu đồ LDR" }))
    await waitFor(() => expect(cardNames().at(-1)).toBe("LDR"))
    // Máy chủ giả lập báo lỗi 400 nếu có một lần xin chỉ tiêu ngoài ngành.
    expect(screen.queryByText("Không tải được số liệu dashboard")).toBeNull()
  })

  it("đổi sang mã cùng ngành giữ thiết lập, sang mã khác ngành chuyển thiết lập và quay lại còn thay đổi chưa lưu", async () => {
    const user = userEvent.setup()
    const view = renderDashboard("FPT")
    await ready("FPT")

    // Thay đổi chưa lưu ở FPT: bỏ ROE.
    await user.click(screen.getByRole("button", { name: "Bỏ ROE khỏi dashboard" }))
    const edited = DEFAULTS.thuong.filter((name) => name !== "ROE")
    await waitFor(() => expect(cardNames()).toEqual(edited))

    // Cùng ngành (FPT → HPG): thiết lập giữ nguyên.
    view.setSymbol("HPG")
    await waitFor(() => expect(industryChip()).toBe("Doanh nghiệp sản xuất"))
    await waitFor(() => expect(cardNames()).toEqual(edited))

    // Khác ngành (→ VCB): thiết lập của ngân hàng, không dính thay đổi của doanh nghiệp.
    view.setSymbol("VCB")
    await ready("VCB")
    expect(screen.getByRole("button", { name: "✓ Đã lưu" })).toHaveProperty("disabled", true)
    await user.click(screen.getByRole("button", { name: "Bỏ CIR khỏi dashboard" }))
    const bankEdited = DEFAULTS.nh.filter((name) => name !== "CIR")
    await waitFor(() => expect(cardNames()).toEqual(bankEdited))

    // Quay lại FPT: còn nguyên thay đổi chưa lưu trong phiên, và ngân hàng giữ thay đổi của nó.
    view.setSymbol("FPT")
    await waitFor(() => expect(cardNames()).toEqual(edited))
    expect(screen.getByRole("button", { name: "Lưu thiết lập" })).toHaveProperty("disabled", false)
    view.setSymbol("VCB")
    await waitFor(() => expect(cardNames()).toEqual(bankEdited))
    expect(state.puts).toHaveLength(0)
  })

  it("lưu ở VCB rồi tải lại: VCB và MBB cùng dùng thiết lập ngân hàng, FPT không bị ảnh hưởng", async () => {
    const user = userEvent.setup()
    const first = renderDashboard("VCB")
    await ready("VCB")
    await user.click(screen.getByRole("checkbox", { name: "Hiện biểu đồ LDR" }))
    await waitFor(() => expect(cardNames().at(-1)).toBe("LDR"))
    await user.click(screen.getByRole("button", { name: "Lưu thiết lập" }))
    await waitFor(() => expect(state.puts).toHaveLength(1))
    expect(state.puts[0]?.nganh).toBe("nh")
    first.unmount()

    const saved = [...DEFAULTS.nh, "LDR"]
    const second = renderDashboard("MBB")
    await ready("MBB", saved)
    second.unmount()

    renderDashboard("FPT")
    await ready("FPT", DEFAULTS.thuong)
    expect(state.saved.thuong.charts).toEqual(DEFAULTS.thuong)
  })

  it("Mặc định ở mã bảo hiểm về 6 biểu đồ mặc định của bảo hiểm", async () => {
    const user = userEvent.setup()
    renderDashboard("BVH")
    await ready("BVH")
    await user.click(screen.getByRole("button", { name: "Bỏ Combined ratio khỏi dashboard" }))
    await user.click(screen.getByRole("checkbox", { name: "Hiện biểu đồ Tỷ lệ giữ lại" }))
    await waitFor(() => expect(cardNames()).toContain("Tỷ lệ giữ lại"))

    await user.click(screen.getByRole("button", { name: "Mặc định" }))
    await waitFor(() => expect(cardNames()).toEqual(DEFAULTS.bh))
    expect(state.puts).toHaveLength(0)
  })
})

describe("Dashboard phân tích v2 · nút Học", () => {
  it("mỗi dòng của khung Biểu đồ có nút Học mở bài học của chỉ tiêu, không làm tick hay bỏ tick", async () => {
    const user = userEvent.setup()
    renderDashboard("VCB")
    await ready("VCB")

    // Nút Học của khung Biểu đồ nằm trong các chương; thẻ biểu đồ có nút Học riêng ngoài khung này.
    const pickerLearn = (key: string) =>
      document.querySelector<HTMLElement>(`[data-chapter] a[data-learn="${key}"]`) as HTMLElement
    expect(document.querySelectorAll("[data-chapter] a[data-learn]")).toHaveLength(28)

    const learn = pickerLearn("provision_to_loans")
    expect(learn.getAttribute("href")).toBe("/academy?metric=provision_to_loans")
    expect(learn.getAttribute("aria-label")).toBe("Học bài Tỷ lệ dự phòng / Dư nợ")

    const checkbox = screen.getByRole("checkbox", { name: "Hiện biểu đồ Tỷ lệ dự phòng / Dư nợ" })
    expect(checkbox.getAttribute("aria-checked")).toBe("false")
    const before = cardNames()

    await user.click(learn)
    expect(screen.getByTestId("location").textContent).toBe("/academy?metric=provision_to_loans")
    // Bấm Học không đổi ô tick cũng không thêm biểu đồ.
    expect(
      screen.getByRole("checkbox", { name: "Hiện biểu đồ Tỷ lệ dự phòng / Dư nợ" }).getAttribute("aria-checked"),
    ).toBe("false")
    expect(cardNames()).toEqual(before)

    // Với chỉ tiêu đang được chọn cũng vậy: ô tick vẫn bật.
    await user.click(pickerLearn("nim"))
    expect(screen.getByTestId("location").textContent).toBe("/academy?metric=nim")
    expect(screen.getByRole("checkbox", { name: "Hiện biểu đồ NIM" }).getAttribute("aria-checked")).toBe("true")
    expect(cardNames()).toEqual(before)
  })

  it("đầu mỗi thẻ biểu đồ có nút Học cùng khoá bài học", async () => {
    const user = userEvent.setup()
    renderDashboard("VCB")
    await ready("VCB")

    const card = document.querySelector<HTMLElement>('[data-chart="CIR"]') as HTMLElement
    const learn = within(card).getByRole("link", { name: "Học bài CIR" })
    expect(learn.textContent).toBe("Học")
    expect(learn.getAttribute("href")).toBe("/academy?metric=cir")
    for (const name of cardNames()) {
      const link = document.querySelector<HTMLElement>(`[data-chart="${name}"] a[data-learn]`)
      expect(link?.getAttribute("data-learn")).toBe(KEY_OF.get(name))
    }

    await user.click(learn)
    expect(screen.getByTestId("location").textContent).toBe("/academy?metric=cir")
    expect(cardNames()).toEqual(DEFAULTS.nh)
  })

  it("dựng đường dẫn Học từ khoá chỉ tiêu", () => {
    expect(academyMetricHref("roe")).toBe("/academy?metric=roe")
    expect(academyMetricHref("combined_ratio")).toBe("/academy?metric=combined_ratio")
  })
})

describe("Dashboard phân tích v2 · khuôn biểu đồ của chỉ tiêu theo ngành", () => {
  it("vẽ hai đường cho Lợi suất tài sản sinh lãi và chi phí vốn, Tăng trưởng tín dụng và huy động", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    state.saved.nh.charts = [
      "Lợi suất tài sản sinh lãi và chi phí vốn",
      "Tăng trưởng tín dụng và huy động",
    ]
    renderDashboard("VCB")
    await ready("VCB", state.saved.nh.charts)

    for (const name of state.saved.nh.charts) {
      const card = await chartCard(name)
      const legend = [...card.querySelectorAll("[data-fundamental-chart] ul li")].map((item) => item.textContent)
      const [first, second] = TWO_LINES[name] as [string, string]
      expect(legend.slice(0, 2)).toEqual([first, second])
      // Hai đường trên tầng trên: đường 1 xanh --s1, đường 2 vàng --line2.
      const strokes = [...(card.querySelector('svg[role="img"]')?.querySelectorAll("path[stroke]") ?? [])]
      expect(strokes.map((path) => path.getAttribute("stroke"))).toEqual(["var(--s1)", SECOND_LINE_COLOR])
      // Không có mốc tham chiếu: không có đường nét đứt.
      expect(card.querySelectorAll('svg line[stroke-dasharray="4 4"]')).toHaveLength(0)
    }
  })

  it("vẽ mốc 100% nét đứt cho Combined ratio, chú giải ghi Mốc 100% và bảng số ghi cả hai tỷ lệ", async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    state.saved.bh.charts = ["Combined ratio"]
    renderDashboard("BVH")
    await ready("BVH", ["Combined ratio"])

    const card = await chartCard("Combined ratio")
    expect(within(card).getByText("Mốc 100%")).toBeTruthy()
    // Mốc nét đứt nằm ở tầng trên cùng với đường Combined ratio.
    const upper = card.querySelector('svg[role="img"]') as SVGElement
    expect(upper.querySelectorAll('line[stroke-dasharray="4 4"]')).toHaveLength(1)
    // Cột chồng Tỷ lệ bồi thường và Tỷ lệ chi phí nằm ở tầng dưới.
    expect(within(card).getByText("Tỷ lệ bồi thường")).toBeTruthy()
    expect(within(card).getByText("Tỷ lệ chi phí")).toBeTruthy()

    await user.click(within(card).getByRole("button", { name: "Bảng số" }))
    const header = within(card).getAllByRole("columnheader").map((cell) => cell.textContent)
    expect(header).toEqual(["Kỳ", "Combined ratio 4 quý", "Tỷ lệ bồi thường", "Tỷ lệ chi phí"])
  })

  it("trục tầng trên luôn chứa mốc 100% dù đường chính nằm xa mốc", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    state.saved.bh.charts = ["Combined ratio"]
    renderDashboard("BVH")
    await ready("BVH", ["Combined ratio"])

    const card = await chartCard("Combined ratio")
    const upper = card.querySelector('svg[role="img"]') as SVGElement
    const ticks = [...upper.querySelectorAll("text")]
      .map((text) => Number((text.textContent ?? "").replace(/\./g, "").replace(",", ".")))
      .filter((value) => Number.isFinite(value))
    // Đường chính (10 đến 15) nằm xa mốc 100: trục phải kéo lên tới 100.
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(100)
  })

  it("cột thứ tư của biểu đồ cột chồng có màu tím --s4 (Cơ cấu doanh thu hoạt động)", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    state.saved.ck.charts = ["Cơ cấu doanh thu hoạt động"]
    renderDashboard("SSI")
    await ready("SSI", ["Cơ cấu doanh thu hoạt động"])

    const card = await chartCard("Cơ cấu doanh thu hoạt động")
    const legend = [...card.querySelectorAll("[data-fundamental-chart] ul li")].map((item) => item.textContent)
    expect(legend).toEqual(["Cơ cấu doanh thu hoạt động 4 quý", "Môi giới", "Cho vay margin", "Tự doanh", "Khác"])
    const fills = new Set([...card.querySelectorAll("svg path[fill]")].map((path) => path.getAttribute("fill")))
    for (const color of SERIES_COLORS) expect(fills.has(color)).toBe(true)
    expect(fills.has(FOURTH_COLOR)).toBe(true)
    // Nhãn nhóm ghi tên các cột theo thứ tự.
    const swatches = [...card.querySelectorAll("[data-fundamental-chart] ul li span[aria-hidden]")].map(
      (swatch) => (swatch as HTMLElement).style.background,
    )
    expect(swatches).toEqual(["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"])
  })
})

describe("Bộ khuôn biểu đồ · định dạng và chú giải", () => {
  it("định dạng đúng đơn vị, số lẻ, hàng phụ và chú giải của từng khuôn biểu đồ", () => {
    expect(decimalsForUnit("%")).toBe(1)
    expect(decimalsForUnit("điểm %")).toBe(1)
    expect(decimalsForUnit("lần")).toBe(2)
    expect(decimalsForUnit("tỷ đồng")).toBe(0)
    expect(decimalsForUnit("nghìn tỷ đồng")).toBe(0)
    expect(decimalsForUnit("đồng/CP")).toBe(0)
    expect(decimalsForUnit("ngày")).toBe(0)
    // Bốn màu cột: xanh, cam, xanh lá và tím (cột thứ tư dùng cho Cơ cấu doanh thu hoạt động).
    expect(SERIES_COLORS).toEqual(["var(--s1)", "var(--s2)", "var(--s3)", FOURTH_COLOR])
    expect(FOURTH_COLOR).toBe("var(--s4)")
    expect(SECOND_LINE_COLOR).toBe("var(--line2)")

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

    // Hai đường: chú giải, hộp số liệu và bảng số ghi cả hai (spec §9); nghìn tỷ đồng không có số lẻ.
    const viewTwo = {
      name: "Tăng trưởng tín dụng và huy động",
      kind: "A" as const,
      unit: "%",
      decimals: 1,
      labels: ["Q1/26"],
      main: [
        { name: "Tăng trưởng tín dụng", v: [14.2] },
        { name: "Tăng trưởng huy động", v: [11.05] },
      ],
      sub: {
        unit: "nghìn tỷ đồng",
        type: "grouped" as const,
        series: [
          { name: "Cho vay khách hàng", v: [1500.4] },
          { name: "Tiền gửi khách hàng", v: [1600.6] },
        ],
      },
    }
    expect(figureLegend(viewTwo)).toEqual([
      { label: "Tăng trưởng tín dụng", color: "var(--s1)", shape: "line" },
      { label: "Tăng trưởng huy động", color: SECOND_LINE_COLOR, shape: "line" },
      { label: "Cho vay khách hàng", color: "var(--s1)", shape: "bar" },
      { label: "Tiền gửi khách hàng", color: "var(--s2)", shape: "bar" },
    ])
    expect(figureTooltip(viewTwo, 0).rows).toEqual([
      ["Tăng trưởng tín dụng", "14,2%"],
      ["Tăng trưởng huy động", "11,1%"],
      ["Cho vay khách hàng", "1.500 nghìn tỷ đồng"],
      ["Tiền gửi khách hàng", "1.601 nghìn tỷ đồng"],
    ])
    expect(figureTable(viewTwo).columns).toEqual([
      "Kỳ",
      "Tăng trưởng tín dụng",
      "Tăng trưởng huy động",
      "Cho vay khách hàng",
      "Tiền gửi khách hàng",
    ])

    // Mốc tham chiếu của khuôn B: chú giải "Mốc 100%" đứng giữa các đường và các cột.
    const viewRef = {
      name: "Combined ratio",
      kind: "B" as const,
      unit: "%",
      decimals: 1,
      ref: 100,
      labels: ["Q1/26"],
      main: [{ name: "Combined ratio (4 quý)", v: [95] }],
      sub: {
        unit: "%",
        type: "stacked" as const,
        series: [
          { name: "Tỷ lệ bồi thường", v: [60] },
          { name: "Tỷ lệ chi phí", v: [35] },
        ],
      },
    }
    expect(figureLegend(viewRef).map((item) => item.label)).toEqual([
      "Combined ratio (4 quý)",
      "Mốc 100%",
      "Tỷ lệ bồi thường",
      "Tỷ lệ chi phí",
    ])

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
      ref: 1,
      labels: ["Q1/26"],
      main: [{ name: "PEG cuối quý", v: [1.25] }],
    }
    expect(figureLegend(viewF2).map((item) => item.label)).toEqual(["PEG cuối quý", "PEG = 1"])
  })
})

describe("Dashboard phân tích v2 · phép tính thuần", () => {
  it("bộ mặc định của một ngành lấy từ danh mục của máy chủ, chưa có danh mục thì chưa có bộ mặc định", () => {
    const nh = catalogOf().industries.find((industry) => industry.nganh === "nh")
    expect(defaultDraftOf(nh as never)).toEqual({ charts: DEFAULTS.nh, per: "q", nks: {} })
    expect(defaultDraftOf(undefined)).toBeUndefined()
    // Mỗi lần gọi trả bản sao: sửa bản nháp không làm đổi danh mục.
    const draft = defaultDraftOf(nh as never)
    draft?.charts.push("ROA")
    expect(nh?.default_charts).toEqual(DEFAULTS.nh)
  })

  it("tìm kiếm bỏ dấu và phân biệt đ", () => {
    expect(normalizeSearch("  Dư nợ cho vay ")).toBe("du no cho vay")
    expect(normalizeSearch("Đòn bẩy")).toBe("don bay")
  })
})
