import { beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "@/lib/api"
import {
  adaptPortfolioAnalysis,
  adaptWatchlistItem,
  fetchWatchlist,
  fetchSymbolInfo,
  recordCap0TaskAfterStar,
  validateStockSymbol,
} from "./api"

vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

const mockedApi = vi.mocked(api)

describe("demo trading v2 portfolio adapters", () => {
  beforeEach(() => mockedApi.mockReset())

  it("does not round oversized integer VND into a misleading display value", () => {
    const report = adaptPortfolioAnalysis({ analysis: { overview: { nav: "9007199254740993", total_pnl: "0", positions: [] } }, narrative: null, meta: {} })
    expect(report.analysis.overview?.nav).toBeNull()
    expect(report.analysis.overview?.total_pnl).toBe(0)
  })

  it("reads the real camelCase watchlist envelope without inventing fields", async () => {
    mockedApi.mockResolvedValueOnce({
      data: [{ id: "wl-1", symbol: "FPT", sortOrder: 2, createdAt: "2026-09-23T01:02:03.000Z" }],
      meta: { count: 1, limit: 50 },
    })

    await expect(fetchWatchlist()).resolves.toEqual([
      { id: "wl-1", symbol: "FPT", sortOrder: 2, createdAt: "2026-09-23T01:02:03.000Z" },
    ])
    expect(mockedApi).toHaveBeenCalledWith("/watchlists", { signal: undefined })
    expect(adaptWatchlistItem({ symbol: "FPT" })).toBeNull()
  })

  it("uses the instruments v2 detail/search contracts", async () => {
    mockedApi.mockResolvedValueOnce({
      data: { symbol: "FPT", assetType: "stock", isIndex: false, isActive: true },
      meta: {},
    })
    await expect(validateStockSymbol("fpt")).resolves.toBeNull()
    expect(mockedApi).toHaveBeenCalledWith("/instruments/FPT")

    mockedApi.mockResolvedValueOnce({
      data: [{ symbol: "FPT", name: "FPT Corp", shortName: "FPT", exchange: "HOSE", icbLv1: "Technology", icbLv2: null }],
      meta: { pagination: { page: 1, page_size: 5, total: 1, total_pages: 1 } },
    })
    await expect(fetchSymbolInfo("FPT")).resolves.toEqual({
      symbol: "FPT",
      name: "FPT Corp",
      shortName: "FPT",
      exchange: "HOSE",
      industry: "Technology",
    })
    expect(mockedApi.mock.calls[1]?.[0]).toBe("/instruments?q=FPT&page=1&page_size=5&asset_type=stock&include_indices=false")
  })

  it("records Cấp 0 after a filled BUY when starring a watched mã", async () => {
    mockedApi.mockResolvedValueOnce({ orders: [{ id: "buy-1" }], total: 1, page: 1, page_size: 1 })
    const completeTask = vi.fn().mockResolvedValue(undefined)

    await expect(recordCap0TaskAfterStar("vnm", {
      isLoading: false,
      level: 0,
      progress: { task_1_done_at: null, task5_debrief_done: false, task1_star_clicked: false },
    }, completeTask)).resolves.toBe(true)
    expect(mockedApi).toHaveBeenCalledWith("/virtual-trading/orders?status=filled&side=buy&symbol=VNM&page=1&page_size=1")
    expect(completeTask).toHaveBeenCalledWith(1, "star")
  })

  it("does not record Cấp 0 before a filled BUY exists", async () => {
    mockedApi.mockResolvedValueOnce({ orders: [], total: 0, page: 1, page_size: 1 })
    const completeTask = vi.fn().mockResolvedValue(undefined)

    await expect(recordCap0TaskAfterStar("vnm", {
      isLoading: false,
      level: 0,
      progress: { task_1_done_at: null, task5_debrief_done: false, task1_star_clicked: false },
    }, completeTask)).resolves.toBe(false)
    expect(completeTask).not.toHaveBeenCalled()
  })

  it.each([
    [true, 0, { task_1_done_at: null }],
    [false, 1, { task_1_done_at: null }],
    [false, 0, null],
  ])("keeps the star gate closed for loading/non-Cấp-0/already-unentered state", async (isLoading, level, progress) => {
    const completeTask = vi.fn().mockResolvedValue(undefined)
    await expect(recordCap0TaskAfterStar("vnm", { isLoading, level, progress }, completeTask)).resolves.toBe(false)
    expect(mockedApi).not.toHaveBeenCalled()
    expect(completeTask).not.toHaveBeenCalled()
  })

  it("does not repeat completion when the server already marked task 1", async () => {
    const completeTask = vi.fn().mockResolvedValue(undefined)
    await expect(recordCap0TaskAfterStar("vnm", {
      isLoading: false,
      level: 0,
      progress: { task_1_done_at: "2026-09-28T00:00:00Z", task1_star_clicked: true },
    }, completeTask)).resolves.toBe(false)
    expect(mockedApi).not.toHaveBeenCalled()
    expect(completeTask).not.toHaveBeenCalled()
  })

  it("preserves nullable portfolio risk and cash scores while converting money strings", () => {
    const report = adaptPortfolioAnalysis({
      analysis: {
        overview: { nav: "100000000", cash_pct: null, total_pnl: "-250000", positions: [{ ticker: "FPT", pnl: "-250000", weight: 1 }] },
        risk: { beta: null, volatility: null, correlation: [] },
        scores: { overall: null, pillars: { performance: null, risk: 3 } },
      },
      narrative: null,
      meta: { valid: true },
    })
    expect(report.analysis.overview?.nav).toBe(100000000)
    expect(report.analysis.overview?.total_pnl).toBe(-250000)
    expect(report.analysis.overview?.cash_pct).toBeNull()
    expect(report.analysis.risk?.beta).toBeNull()
    expect(report.analysis.scores?.overall).toBeNull()
    expect(report.analysis.scores?.pillars).toEqual({ performance: null, risk: 3 })
  })
})
