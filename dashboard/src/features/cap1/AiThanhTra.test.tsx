import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AiThanhTra } from "./AiThanhTra"

const navigateMock = vi.fn()
vi.mock("react-router", () => ({ useNavigate: () => navigateMock }))

const analyzeMock = vi.fn()
const stockAiInsightMock = vi.fn()
vi.mock("@/features/stock", () => ({
  useStockAiInsight: (...args: unknown[]) => stockAiInsightMock(...args),
}))

const bctcDashboardMock = vi.fn()
vi.mock("@/features/stock/bctc-dashboard", () => ({
  useBctcDashboard: (...args: unknown[]) => bctcDashboardMock(...args),
}))

/** A minimal `LayerCard`-shaped payload at the given `statusLevel`, keyed under `layerKey`. */
function layerAt(statusLevel: 1 | 2 | 3 | 4 | 5, layerKey: "L1" | "L3" | "L4" | "L5") {
  return {
    layerNum: layerKey,
    layerName: "Xu hướng",
    statusLabel: "Mạnh",
    statusLevel,
    fields: [
      { label: "Xu hướng", value: [{ type: "text", content: "Tăng" }] },
      { label: "Hỗ trợ/Kháng cự", value: [{ type: "text", content: "60,000 / 68,000" }] },
    ],
    diff: { text: [], hasChange: false },
  }
}

function mockInsight(
  statusLevel: 1 | 2 | 3 | 4 | 5 | null,
  opts: { pending?: boolean; error?: boolean } = {},
  layerKey: "L1" | "L3" | "L4" | "L5" = "L1",
) {
  stockAiInsightMock.mockReturnValue({
    insight:
      statusLevel == null
        ? null
        : {
            symbol: "VNM",
            updatedAt: "t",
            header: {},
            briefing: {},
            layers: { [layerKey]: layerAt(statusLevel, layerKey) },
            rawInput: {},
          },
    analyze: analyzeMock,
    analyzeAsync: vi.fn(),
    isPending: opts.pending ?? false,
    isError: opts.error ?? false,
    error: opts.error ? new Error("boom") : null,
    reset: vi.fn(),
  })
}

function mockBctc(overrides: Partial<{ current_price: number | null; fair_median: number | null }> = {}, opts: { loading?: boolean; error?: boolean } = {}) {
  bctcDashboardMock.mockReturnValue({
    data: opts.error
      ? undefined
      : {
          template: "A",
          sub_sector: null,
          hero: {},
          radar: { dims: [] },
          blocks: {
            valuation: {
              methods: [
                { name: "PE", bear: 80, base: 100, bull: 120 },
                { name: "RIM", bear: 82, base: 98, bull: 118 },
              ],
              current_price: 100,
              fair_median: 100,
              upside_pct: 0,
              metrics: [],
              ...overrides,
            },
          },
          meta: {},
        },
    isLoading: opts.loading ?? false,
    isError: opts.error ?? false,
  })
}

beforeEach(() => {
  analyzeMock.mockClear()
  navigateMock.mockClear()
  stockAiInsightMock.mockReset()
  bctcDashboardMock.mockReset()
  mockInsight(null)
  mockBctc()
})

describe("AiThanhTra — AI Insight-backed lý do (spec §5)", () => {
  it('shows the layer header + source + summary lines + "Đọc chi tiết" for a loaded layer', () => {
    mockInsight(4)
    render(<AiThanhTra symbol="VNM" lyDo="ky_thuat" currentPrice={62_400} />)
    expect(screen.getByText("🔍 AI Thanh tra · Kỹ thuật — L1")).toBeInTheDocument()
    expect(screen.getByText("(Dữ liệu từ AI Insight · L1 Xu hướng)")).toBeInTheDocument()
    expect(screen.getByText("Xu hướng: Tăng")).toBeInTheDocument()
    expect(screen.getByText("Đọc chi tiết lớp này →")).toBeInTheDocument()
  })

  it("names the backing layer in the header for each AI-Insight-backed lý do", () => {
    mockInsight(4, {}, "L3")
    const { unmount } = render(<AiThanhTra symbol="VNM" lyDo="dong_tien" currentPrice={62_400} />)
    expect(screen.getByText("🔍 AI Thanh tra · Dòng tiền — L3")).toBeInTheDocument()
    unmount()

    mockInsight(4, {}, "L5")
    render(<AiThanhTra symbol="VNM" lyDo="tin_tuc" currentPrice={62_400} />)
    expect(screen.getByText("🔍 AI Thanh tra · Tin tức — L5")).toBeInTheDocument()
  })

  it("renders the verdict as a full-width coloured pill (no «Trạng thái:» line)", () => {
    mockInsight(4)
    render(<AiThanhTra symbol="VNM" lyDo="ky_thuat" currentPrice={62_400} />)
    const pill = screen.getByTestId("ai-thanh-tra-verdict")
    expect(pill).toHaveTextContent("✅ Ủng hộ")
    expect(pill.className).toContain("w-full")
    expect(pill.className).toContain("text-up")
    expect(screen.queryByText(/Trạng thái:/)).not.toBeInTheDocument()
  })

  it("colours the pill by verdict — ❌ Ngược chiều is the down colour", () => {
    mockInsight(1, {}, "L4")
    render(<AiThanhTra symbol="VNM" lyDo="noi_bo" currentPrice={62_400} />)
    expect(screen.getByTestId("ai-thanh-tra-verdict").className).toContain("text-down")
  })

  it("colours the pill by verdict — ⚠ Cần chú ý is the warning colour", () => {
    mockInsight(2, {}, "L4")
    render(<AiThanhTra symbol="VNM" lyDo="noi_bo" currentPrice={62_400} />)
    expect(screen.getByTestId("ai-thanh-tra-verdict").className).toContain("warning-6")
  })

  it("maps statusLevel 5 → ✅ Ủng hộ mạnh", () => {
    mockInsight(5)
    render(<AiThanhTra symbol="VNM" lyDo="ky_thuat" currentPrice={62_400} />)
    expect(screen.getByText("✅ Ủng hộ mạnh", { exact: false })).toBeInTheDocument()
  })

  it("maps statusLevel 3 → ⚪ Trung tính", () => {
    mockInsight(3, {}, "L3")
    render(<AiThanhTra symbol="VNM" lyDo="dong_tien" currentPrice={62_400} />)
    expect(screen.getByText("⚪ Trung tính", { exact: false })).toBeInTheDocument()
  })

  it('maps statusLevel 1 → ❌ Ngược chiều and shows the "Chọn lý do khác" / "Vẫn đặt lệnh với lý do này" two-button case', () => {
    mockInsight(1, {}, "L4")
    const onChonLyDoKhac = vi.fn()
    render(
      <AiThanhTra symbol="VNM" lyDo="noi_bo" currentPrice={62_400} onChonLyDoKhac={onChonLyDoKhac} />,
    )
    expect(screen.getByText("❌ Ngược chiều", { exact: false })).toBeInTheDocument()
    expect(
      screen.getByText("⚠ Lý do bạn chọn KHÔNG khớp với dữ liệu hiện tại của lớp này."),
    ).toBeInTheDocument()
    expect(screen.getByText("Chọn lý do khác")).toBeInTheDocument()
    expect(screen.getByText("Vẫn đặt lệnh với lý do này")).toBeInTheDocument()

    fireEvent.click(screen.getByText("Chọn lý do khác"))
    expect(onChonLyDoKhac).toHaveBeenCalledTimes(1)
  })

  it('"Vẫn đặt lệnh với lý do này" dismisses the mismatch warning (does NOT block)', () => {
    mockInsight(1, {}, "L5")
    render(<AiThanhTra symbol="VNM" lyDo="tin_tuc" currentPrice={62_400} />)
    fireEvent.click(screen.getByText("Vẫn đặt lệnh với lý do này"))
    expect(
      screen.queryByText("⚠ Lý do bạn chọn KHÔNG khớp với dữ liệu hiện tại của lớp này."),
    ).not.toBeInTheDocument()
    // The verdict itself is still shown (❌) — dismissing only hides the banner.
    expect(screen.getByText("❌ Ngược chiều", { exact: false })).toBeInTheDocument()
  })

  it('clicking "Đọc chi tiết lớp này →" fires onDocChiTiet and navigates to the stock page', () => {
    mockInsight(4)
    const onDocChiTiet = vi.fn()
    render(<AiThanhTra symbol="VNM" lyDo="ky_thuat" currentPrice={62_400} onDocChiTiet={onDocChiTiet} />)
    fireEvent.click(screen.getByText("Đọc chi tiết lớp này →"))
    expect(onDocChiTiet).toHaveBeenCalledTimes(1)
    expect(navigateMock).toHaveBeenCalledWith("/co-phieu/VNM")
  })

  it("reports the resolved verdict via onVerdict", () => {
    mockInsight(4)
    const onVerdict = vi.fn()
    render(<AiThanhTra symbol="VNM" lyDo="ky_thuat" currentPrice={62_400} onVerdict={onVerdict} />)
    expect(onVerdict).toHaveBeenCalledWith("ung_ho", expect.objectContaining({ lyDo: "ky_thuat" }))
  })

  it("shows a loading state while the insight fetch is pending", () => {
    mockInsight(null, { pending: true })
    render(<AiThanhTra symbol="VNM" lyDo="ky_thuat" currentPrice={62_400} />)
    expect(screen.getByText("Đang tải dữ liệu lớp…")).toBeInTheDocument()
  })

  it("degrades gracefully (⚪, no crash, no Đọc chi tiết) when the insight fetch fails (e.g. non-premium 403)", () => {
    mockInsight(null, { error: true })
    render(<AiThanhTra symbol="VNM" lyDo="ky_thuat" currentPrice={62_400} />)
    expect(screen.getByText("Không tải được dữ liệu lớp này ngay bây giờ.")).toBeInTheDocument()
    expect(screen.getByText("⚪ Trung tính", { exact: false })).toBeInTheDocument()
    expect(screen.queryByText("Đọc chi tiết lớp này →")).not.toBeInTheDocument()
  })

  it("triggers analyze() lazily, once, when an AI-Insight-backed lý do is picked", () => {
    mockInsight(null)
    render(<AiThanhTra symbol="VNM" lyDo="dong_tien" currentPrice={62_400} />)
    expect(analyzeMock).toHaveBeenCalledTimes(1)
  })
})

describe("AiThanhTra — 💎 Định giá (BCTC KHỐI 02)", () => {
  it("price below the whole valuation range → ✅ Ủng hộ mạnh", () => {
    mockBctc({ current_price: 70 })
    render(<AiThanhTra symbol="VNM" lyDo="dinh_gia" currentPrice={0} />)
    // 💎 Định giá is NOT an AI Insight layer (spec §4: BCTC KHỐI 02) — so the
    // header says BCTC where the other 4 lý do say L{n}.
    expect(screen.getByText("🔍 AI Thanh tra · Định giá — BCTC")).toBeInTheDocument()
    expect(screen.getByText("✅ Ủng hộ mạnh", { exact: false })).toBeInTheDocument()
  })

  it("price above the valuation range (vượt đỉnh) → ❌ Ngược chiều", () => {
    mockBctc({ current_price: 130 })
    render(<AiThanhTra symbol="VNM" lyDo="dinh_gia" currentPrice={0} />)
    expect(screen.getByText("❌ Ngược chiều", { exact: false })).toBeInTheDocument()
  })

  it("prefers the live currentPrice prop over BCTC's own cached current_price", () => {
    // BCTC says 100 (neutral); the live feed says 65 (well below range) — the
    // live price must win (spec §5 "Giá hiện tại vs vùng").
    mockBctc({ current_price: 100 })
    render(<AiThanhTra symbol="VNM" lyDo="dinh_gia" currentPrice={65} />)
    expect(screen.getByText("✅ Ủng hộ mạnh", { exact: false })).toBeInTheDocument()
  })

  it("does not call the AI Insight analyze() for Định giá", () => {
    mockBctc({ current_price: 100 })
    render(<AiThanhTra symbol="VNM" lyDo="dinh_gia" currentPrice={100} />)
    expect(analyzeMock).not.toHaveBeenCalled()
  })

  it("degrades gracefully when the BCTC dashboard fails to load", () => {
    mockBctc({}, { error: true })
    render(<AiThanhTra symbol="VNM" lyDo="dinh_gia" currentPrice={100} />)
    expect(
      screen.getByText("Không tải được dữ liệu định giá cho mã này ngay bây giờ."),
    ).toBeInTheDocument()
    expect(screen.getByText("⚪ Trung tính", { exact: false })).toBeInTheDocument()
  })
})
