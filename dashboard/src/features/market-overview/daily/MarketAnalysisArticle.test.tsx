import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import type { DailyAnalysis } from "./types"

// ─── Mock hook ─────────────────────────────────────────────────────────────
vi.mock("./useDailyMarketAnalysis", () => ({
  useDailyMarketAnalysis: vi.fn(),
}))

// ─── Fixture ────────────────────────────────────────────────────────────────
const fixture: DailyAnalysis = {
  id: "test-id-1",
  session_date: "2026-06-20",
  session_type: "regular",
  session_type_display: "Phiên thường",
  headline: "VN-Index phục hồi sau nhịp điều chỉnh",
  tagline: {
    direction: "up",
    marker: "↑",
    text: "Dòng tiền nội địa hỗ trợ đà tăng",
  },
  paragraphs: {
    structure:
      'Phiên giao dịch diễn ra sôi động. <script>alert(1)</script><span class="num">1.824</span> điểm là mốc hỗ trợ quan trọng.',
    smart_money: "Dòng tiền tổ chức tích cực mua vào cuối phiên.",
    market_health: "Breadth tích cực với 300 mã tăng / 120 mã giảm.",
    historical_pattern: "Mô hình tương tự xuất hiện 3 lần trong 6 tháng qua.",
  },
  scenarios: [
    {
      direction: "up",
      condition_html: "Giữ trên 1.820",
      outcome_html: "Hướng đến 1.840",
    },
  ],
  watchlist: [
    {
      ticker: "HPG",
      alert: true,
      reason_html: "Khối lượng đột biến",
    },
  ],
  unexplained: "Một số tín hiệu bất thường cần theo dõi thêm.",
}

// ─── Import component after mocks are set up ────────────────────────────────
import { MarketAnalysisArticle } from "./MarketAnalysisArticle"
import { useDailyMarketAnalysis } from "./useDailyMarketAnalysis"

const mockHook = vi.mocked(useDailyMarketAnalysis)

describe("MarketAnalysisArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders headline text when data is loaded", () => {
    mockHook.mockReturnValue({
      data: fixture,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    render(<MarketAnalysisArticle />)
    expect(screen.getByText("VN-Index phục hồi sau nhịp điều chỉnh")).toBeInTheDocument()
  })

  it("sanitizes script tags from paragraphs (XSS prevention)", () => {
    mockHook.mockReturnValue({
      data: fixture,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    const { container } = render(<MarketAnalysisArticle />)
    // script element must not appear in the DOM
    expect(container.querySelector("script")).toBeNull()
  })

  it("keeps allowed .num spans from paragraphs", () => {
    mockHook.mockReturnValue({
      data: fixture,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    const { container } = render(<MarketAnalysisArticle />)
    const numSpan = container.querySelector('span.num')
    expect(numSpan).not.toBeNull()
    expect(numSpan?.textContent).toBe("1.824")
  })

  it("renders tagline marker and text with up direction", () => {
    mockHook.mockReturnValue({
      data: fixture,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    render(<MarketAnalysisArticle />)
    expect(screen.getByText(/Dòng tiền nội địa hỗ trợ đà tăng/)).toBeInTheDocument()
  })

  it("renders header badge, session date, and session type", () => {
    mockHook.mockReturnValue({
      data: fixture,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    render(<MarketAnalysisArticle />)
    expect(screen.getByText("IQX AI")).toBeInTheDocument()
    expect(screen.getByText(/2026-06-20/)).toBeInTheDocument()
    expect(screen.getByText(/Phiên thường/)).toBeInTheDocument()
  })

  it("renders all 3 section labels", () => {
    mockHook.mockReturnValue({
      data: fixture,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    render(<MarketAnalysisArticle />)
    expect(screen.getByText("Cấu trúc phiên")).toBeInTheDocument()
    expect(screen.getByText("Dòng tiền")).toBeInTheDocument()
    expect(screen.getByText("Sức khỏe thị trường")).toBeInTheDocument()
  })

  it("renders historical_pattern section when present", () => {
    mockHook.mockReturnValue({
      data: fixture,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    render(<MarketAnalysisArticle />)
    expect(screen.getByText("Mẫu lịch sử")).toBeInTheDocument()
    expect(screen.getByText(/Mô hình tương tự xuất hiện/)).toBeInTheDocument()
  })

  it("does NOT render historical_pattern section when absent", () => {
    const noHistorical: DailyAnalysis = {
      ...fixture,
      paragraphs: { ...fixture.paragraphs, historical_pattern: null },
    }
    mockHook.mockReturnValue({
      data: noHistorical,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    render(<MarketAnalysisArticle />)
    expect(screen.queryByText("Mẫu lịch sử")).toBeNull()
  })

  it("renders unexplained callout when present", () => {
    mockHook.mockReturnValue({
      data: fixture,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    render(<MarketAnalysisArticle />)
    expect(screen.getByText(/Một số tín hiệu bất thường/)).toBeInTheDocument()
  })

  it("shows skeleton/loading state and does not crash", () => {
    mockHook.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    const { container } = render(<MarketAnalysisArticle />)
    // Loading state renders something (no crash)
    expect(container.firstChild).not.toBeNull()
    // Headline must NOT appear
    expect(screen.queryByText("VN-Index phục hồi sau nhịp điều chỉnh")).toBeNull()
  })

  it("shows error message on error state and does not crash", () => {
    mockHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
    } as ReturnType<typeof useDailyMarketAnalysis>)

    render(<MarketAnalysisArticle />)
    // Should render an error message
    expect(screen.getByText(/Không thể tải nhận định/)).toBeInTheDocument()
  })
})
