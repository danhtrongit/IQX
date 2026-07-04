import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import type { DailyAnalysis } from "./types"

// ─── Mock hook ─────────────────────────────────────────────────────────────
vi.mock("./useDailyMarketAnalysis", () => ({
  useDailyMarketAnalysis: vi.fn(),
}))

// ─── Mock Arco Skeleton (avoids ResizeObserver issues in jsdom) ─────────────
vi.mock("@arco-design/web-react", () => ({
  Skeleton: ({ text }: { text?: { rows?: number } }) => (
    <div data-testid="skeleton" aria-label={`skeleton-${text?.rows ?? 1}`} />
  ),
}))

// ─── Fixture ────────────────────────────────────────────────────────────────
const fixture: DailyAnalysis = {
  id: "test-id-2",
  session_date: "2026-06-20",
  generated_at: "2026-06-20T16:30:00",
  session_type: "regular",
  session_type_display: "Phiên thường",
  headline: "Headline",
  tagline: { direction: "up", marker: "↑", text: "Tagline" },
  paragraphs: {
    structure: "Structure",
    smart_money: "Smart money",
    market_health: "Health",
  },
  scenarios: [
    {
      direction: "up",
      condition_html: 'Giữ trên <span class="num">1.820</span>',
      outcome_html: "Hướng đến 1.840",
    },
    {
      direction: "down",
      condition_html: "Mất 1.815",
      outcome_html: 'Test <script>alert(1)</script>1.800',
    },
  ],
  watchlist: [
    { ticker: "HPG", alert: true, reason_html: "Khối lượng đột biến" },
    { ticker: "FPT", alert: false, reason_html: "Áp lực thoái vốn" },
  ],
  unexplained: null,
}

// ─── Import after mocks ──────────────────────────────────────────────────────
import { MarketTakeaway } from "./MarketTakeaway"
import { useDailyMarketAnalysis } from "./useDailyMarketAnalysis"

const mockHook = vi.mocked(useDailyMarketAnalysis)

describe("MarketTakeaway", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders section headings", () => {
    mockHook.mockReturnValue({
      data: fixture,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    render(<MarketTakeaway />)
    expect(screen.getByText(/Kịch bản phiên sau/i)).toBeInTheDocument()
    expect(screen.getByText(/Đáng quan sát/i)).toBeInTheDocument()
  })

  it("renders both scenario items", () => {
    mockHook.mockReturnValue({
      data: fixture,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    const { container } = render(<MarketTakeaway />)
    // condition from up scenario (contains sanitized html)
    expect(container.textContent).toContain("1.820")
    expect(container.textContent).toContain("Hướng đến 1.840")
    // down scenario
    expect(container.textContent).toContain("Mất 1.815")
    expect(container.textContent).toContain("1.800")
  })

  it("sanitizes script tags from outcome_html", () => {
    mockHook.mockReturnValue({
      data: fixture,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    const { container } = render(<MarketTakeaway />)
    expect(container.querySelector("script")).toBeNull()
  })

  it("renders alert watchlist item (HPG) with ticker", () => {
    mockHook.mockReturnValue({
      data: fixture,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    render(<MarketTakeaway />)
    expect(screen.getByText("HPG")).toBeInTheDocument()
    expect(screen.getByText("FPT")).toBeInTheDocument()
  })

  it("renders reason text for watchlist items", () => {
    mockHook.mockReturnValue({
      data: fixture,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    const { container } = render(<MarketTakeaway />)
    expect(container.textContent).toContain("Khối lượng đột biến")
    expect(container.textContent).toContain("Áp lực thoái vốn")
  })

  it("shows skeleton while loading", () => {
    mockHook.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useDailyMarketAnalysis>)

    const { container } = render(<MarketTakeaway />)
    expect(container.firstChild).not.toBeNull()
    expect(screen.queryByText(/Kịch bản/i)).toBeNull()
  })

  it("shows error fallback on error state", () => {
    mockHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network"),
    } as ReturnType<typeof useDailyMarketAnalysis>)

    render(<MarketTakeaway />)
    expect(screen.getByText(/Không thể tải kịch bản/)).toBeInTheDocument()
  })
})
