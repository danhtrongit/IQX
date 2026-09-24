/**
 * Dữ liệu cho panel "Danh mục" của /demo-trading — ba tab Theo dõi / Nắm giữ /
 * Lịch sử (port từ `dashboard/src/features/watchlist`).
 *
 * Mọi hàm ở đây gọi REST thật của backend-v2 (`/api/v2/...`):
 * - `GET/POST/DELETE /watchlists`, `PUT /watchlists/reorder` — danh sách theo dõi
 * - `GET /instruments/{symbol}` — kiểm tra mã là CỔ PHIẾU
 * - `GET /instruments?q=...` — tên/sàn/ngành của mã
 * - `GET /market-data/quotes/{symbol}/ohlcv` — sparkline 3 tháng
 * - `GET /virtual-trading/orders` — bằng chứng lệnh MUA đã khớp (cổng ★ Cấp 0)
 * - `POST /virtual-trading/orders/{id}/cancel`
 * - `POST /portfolio-manager/analyze` — báo cáo AI (premium)
 *
 * DTO v2 dùng camelCase cho instruments/watchlists; trading/analysis vẫn có
 * snake_case và tiền ở đơn vị VND. Giá trị upstream không có
 * thì giữ `null` (UI render "—"), KHÔNG bao giờ ép về 0.
 */
import { api, ApiError } from "@/lib/api"
import type { OrderPage } from "@/pages/demo-trading/types"

type Raw = Record<string, unknown>

/* ── Đọc payload ─────────────────────────────────────────────────────────── */

function record(value: unknown): Raw | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null
}

function str(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed === "" ? null : trimmed
  }
  if (typeof value === "number") return String(value)
  return null
}

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** Danh sách bản ghi trong payload: mảng trần, `{items}`, rồi `{data}`. */
function rows(payload: unknown): Raw[] {
  if (Array.isArray(payload)) return payload as Raw[]
  const wrapped = record(payload)
  if (!wrapped) return []
  const items = wrapped.items ?? wrapped.data
  return Array.isArray(items) ? (items as Raw[]) : []
}

/* ── Theo dõi (watchlist) ────────────────────────────────────────────────── */

export type WatchlistItem = {
  id: string
  symbol: string
  sortOrder: number
  createdAt: string
  updatedAt?: string
  instrument?: {
    name: string | null
    shortName: string | null
    exchange: string | null
    assetType: string | null
    logoUrl: string | null
    isActive: boolean | null
  }
  provenance?: { huntFilter: string | null; huntSignal: string | null; huntAt: string | null }
  consensus?: {
    supportingLayers: number | null
    previousSupportingLayers: number | null
    evaluatedLayers: number | null
    evaluatedAt: string | null
    status: string | null
  }
}

/** Exact v2 watchlist DTO adapter. Missing required fields are rejected rather
 * than silently replaced with a symbol, zero, or an empty timestamp. */
export function adaptWatchlistItem(raw: unknown): WatchlistItem | null {
  const item = record(raw)
  if (!item) return null
  const id = str(item.id)
  const symbol = str(item.symbol)?.toUpperCase()
  const sortOrder = num(item.sortOrder)
  const createdAt = str(item.createdAt)
  if (!id || !symbol || sortOrder === null || !createdAt) return null
  const result: WatchlistItem = {
    id,
    symbol,
    sortOrder,
    createdAt,
  }
  const instrument = record(item.instrument)
  if (instrument) {
    result.instrument = {
      name: str(instrument.name),
      shortName: str(instrument.shortName),
      exchange: str(instrument.exchange),
      assetType: str(instrument.assetType),
      logoUrl: str(instrument.logoUrl),
      isActive: typeof instrument.isActive === "boolean" ? instrument.isActive : null,
    }
  }
  const provenance = record(item.provenance)
  if (provenance) {
    result.provenance = {
      huntFilter: str(provenance.huntFilter),
      huntSignal: str(provenance.huntSignal),
      huntAt: str(provenance.huntAt),
    }
  }
  const consensus = record(item.consensus)
  if (consensus) {
    result.consensus = {
      supportingLayers: num(consensus.supportingLayers),
      previousSupportingLayers: num(consensus.previousSupportingLayers),
      evaluatedLayers: num(consensus.evaluatedLayers),
      evaluatedAt: str(consensus.evaluatedAt),
      status: str(consensus.status),
    }
  }
  if (str(item.updatedAt)) result.updatedAt = str(item.updatedAt)!
  return result
}

/** `GET /watchlists` */
export async function fetchWatchlist(signal?: AbortSignal): Promise<WatchlistItem[]> {
  const payload = await api<unknown>("/watchlists", { signal })
  return rows(payload).flatMap((raw) => {
    const item = adaptWatchlistItem(raw)
    return item ? [item] : []
  })
}

/** `POST /watchlists` — backend là nơi chốt luật "là cổ phiếu" (400/409). */
export async function addToWatchlist(symbol: string): Promise<void> {
  await api<unknown>("/watchlists", {
    method: "POST",
    body: JSON.stringify({ symbol: symbol.trim().toUpperCase() }),
  })
}

/** `DELETE /watchlists/{symbol}` — 404 khi mã không còn trong danh sách. */
export async function removeFromWatchlist(symbol: string): Promise<void> {
  await api<unknown>(`/watchlists/${encodeURIComponent(symbol.trim().toUpperCase())}`, {
    method: "DELETE",
  })
}

/** `PUT /watchlists/reorder` — thứ tự mới được lưu server-side. */
export async function reorderWatchlist(symbols: string[]): Promise<void> {
  await api<unknown>("/watchlists/reorder", {
    method: "PUT",
    body: JSON.stringify({ symbols }),
  })
}

/* ── Tham chiếu mã ───────────────────────────────────────────────────────── */

export type SymbolInfo = {
  symbol: string
  name: string | null
  shortName: string | null
  exchange: string | null
  industry: string | null
}

/** Cùng luật với `app.models.symbol.la_co_phieu` phía backend. */
function isTradableStock(raw: Raw): boolean {
  return (
    raw.isActive === true &&
    raw.isIndex === false &&
    (str(raw.assetType) ?? "").toLowerCase() === "stock"
  )
}

/**
 * Kiểm tra `symbol` có phải cổ phiếu giao dịch được không.
 * Trả về thông báo lỗi tiếng Việt, hoặc `null` khi hợp lệ.
 */
export async function validateStockSymbol(symbol: string): Promise<string | null> {
  try {
    const payload = await api<Raw>(
      `/instruments/${encodeURIComponent(symbol.trim().toUpperCase())}`,
    )
    const raw = record(payload.data)
    if (raw && isTradableStock(raw)) return null
    return `Mã ${symbol} không phải là cổ phiếu`
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return `Mã ${symbol} không tồn tại`
    return "Không thể kiểm tra mã cổ phiếu. Vui lòng thử lại."
  }
}

/** Tên/sàn/ngành của một mã (dữ liệu tham chiếu, có thể không có → `null`). */
export async function fetchSymbolInfo(
  symbol: string,
  signal?: AbortSignal,
): Promise<SymbolInfo | null> {
  const code = symbol.trim().toUpperCase()
  const params = new URLSearchParams({ q: code, page: "1", page_size: "5", asset_type: "stock", include_indices: "false" })
  const payload = await api<unknown>(`/instruments?${params}`, { signal })
  const match = rows(payload).find(
    (item) => (str(item.symbol) ?? "").toUpperCase() === code,
  )
  if (!match) return null
  return {
    symbol: code,
    name: str(match.name),
    shortName: str(match.shortName),
    exchange: str(match.exchange)?.toUpperCase() ?? null,
    industry: str(match.icbLv2) ?? str(match.icbLv1),
  }
}

/** Giá đóng cửa ~3 tháng gần nhất cho sparkline. Lỗi → mảng rỗng. */
export async function fetchDailyCloses(
  symbol: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const code = symbol.trim().toUpperCase()
  if (!code) return []
  const end = new Date()
  const start = new Date(end.getFullYear(), end.getMonth() - 3, end.getDate())
  const params = new URLSearchParams({
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    interval: "1D",
  })
  try {
    const payload = await api<Raw>(
      `/market-data/quotes/${encodeURIComponent(code)}/ohlcv?${params}`,
      { signal },
    )
    return rows(payload.data ?? payload).flatMap((bar) => {
      const close = num(bar.close ?? bar.close_price)
      return close !== null && close > 0 ? [close] : []
    })
  } catch {
    return []
  }
}

/* ── Lệnh ────────────────────────────────────────────────────────────────── */

/**
 * Bằng chứng lệnh MUA đã khớp cho một mã — điều kiện để Cấp 0 ghi nhận ★ của
 * nhiệm vụ ①. Trả `true` khi server đã có ít nhất một lệnh MUA khớp của mã đó.
 *
 * Ném lỗi khi không tra được (người gọi coi như KHÔNG có bằng chứng).
 */
export async function hasFilledBuyEvidence(symbol: string): Promise<boolean> {
  const params = new URLSearchParams({
    status: "filled",
    side: "buy",
    symbol: symbol.trim().toUpperCase(),
    page: "1",
    page_size: "1",
  })
  const page = await api<OrderPage>(`/virtual-trading/orders?${params}`)
  return (page.total ?? 0) > 0
}

/** `POST /virtual-trading/orders/{id}/cancel` — chỉ lệnh đang chờ mới huỷ được. */
export async function cancelOrder(id: string): Promise<void> {
  await api<unknown>(`/virtual-trading/orders/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  })
}

/* ── Báo cáo phân tích danh mục (premium) ────────────────────────────────── */

export type AnalysisMeta = {
  date?: string
  mode?: string
  period?: string
  period_number?: number
  portfolio_id?: string
}

export type AnalysisPosition = {
  ticker?: string
  sector?: string
  weight?: number
  pnl?: number
  low_confidence?: boolean
}

export type AnalysisAllocation = {
  sector?: string
  weight?: number
  benchmark?: number | null
  active?: number | null
}

export type AnalysisCorrelation = { a?: string; b?: string; value?: number }

/** Báo cáo `POST /portfolio-manager/analyze` — backend trả dict tự do nên mọi
 * phần đều được đọc phòng thủ và chỉ render khi có dữ liệu. */
export type PortfolioAnalysis = {
  insufficient_data?: boolean
  reason?: string
  meta?: AnalysisMeta
  overview?: {
    nav?: number
    cash_pct?: number | null
    n_positions?: number
    total_return?: number
    total_pnl?: number | null
    holding_months?: number
    positions?: AnalysisPosition[]
  }
  performance?: {
    portfolio_return?: number
    benchmark_return?: number
    excess_return?: number
    max_drawdown?: number
    method?: string
  }
  allocation?: AnalysisAllocation[]
  concentration?: { top1?: number; top3?: number; effective_n?: number; largest_sector?: number }
  risk?: {
    beta?: number | null
    volatility?: number | null
    tracking_error?: number | null
    correlation?: AnalysisCorrelation[]
    excluded?: { ticker?: string; reason?: string }[]
  }
  attribution?: { ticker?: string; pnl?: number; pct?: number | null }[]
  quality?: {
    pe?: number | null
    pb?: number | null
    roe?: number | null
    dividend?: number | null
    sector_benchmark?: { sector?: string; your_return?: number; industry_return?: number; gap?: number } | null
  }
  behavior?: {
    avg_holding_days?: number
    losing_count?: number
    disposition_flag?: boolean
    worst_loser?: { ticker?: string; pnl_pct?: number | null; periods_held?: number } | null
  }
  scores?: {
    overall?: number | null
    prev_overall?: number | null
    pillars?: Record<string, number | null>
  }
  progress?: { prev_actions?: { id?: string; done?: boolean; detail?: string }[] }
}

export type PortfolioNarrative = {
  title?: string
  verdict?: string
  lede?: string
  progress_text?: string
  layers?: Record<string, string>
  insight?: { label?: string; text?: string }
  low_data_note?: string
  actions?: { title?: string; detail?: string }[]
  watch?: unknown[]
  closing?: string
}

export type PortfolioAnalysisResponse = {
  analysis: PortfolioAnalysis
  narrative: PortfolioNarrative | null
  meta: { valid?: boolean; cached?: boolean; insufficient?: boolean; model?: string; session_date?: string; period_number?: number }
}

function numericFields<T extends Raw>(value: unknown, fields: readonly string[]): T {
  const source = record(value) ?? {}
  const result: Raw = { ...source }
  for (const field of fields) {
    if (field in source) {
      const value = num(source[field])
      // Integer VND must not silently round when a serialized BIGINT exceeds
      // the JS safe range. Ratio/percentage fields remain fractional.
      result[field] = ["nav", "total_pnl", "pnl"].includes(field) && value !== null && !Number.isSafeInteger(value) ? null : value
    }
  }
  return result as T
}

/** Convert exactly representable money strings to UI numbers while keeping
 * every unavailable metric as `null`. No default score or cash value is made
 * up when the portfolio math cannot calculate it. */
export function adaptPortfolioAnalysis(payload: unknown): PortfolioAnalysisResponse {
  const root = record(payload) ?? {}
  const rawAnalysis = record(root.analysis) ?? {}
  const overviewRaw = record(rawAnalysis.overview)
  const performanceRaw = record(rawAnalysis.performance)
  const riskRaw = record(rawAnalysis.risk)
  const qualityRaw = record(rawAnalysis.quality)
  const behaviorRaw = record(rawAnalysis.behavior)
  const scoresRaw = record(rawAnalysis.scores)
  const positions = Array.isArray(overviewRaw?.positions)
    ? overviewRaw.positions.map((position) => numericFields(position, ["weight", "pnl"]))
    : overviewRaw?.positions
  const attribution = Array.isArray(rawAnalysis.attribution)
    ? rawAnalysis.attribution.map((row) => numericFields(row, ["pnl", "pct"]))
    : rawAnalysis.attribution
  const analysis: Raw = {
    ...rawAnalysis,
    overview: overviewRaw
      ? numericFields({ ...overviewRaw, positions }, ["nav", "cash_pct", "total_return", "total_pnl", "holding_months"])
      : undefined,
    performance: performanceRaw
      ? numericFields(performanceRaw, ["portfolio_return", "benchmark_return", "excess_return", "max_drawdown"])
      : undefined,
    risk: riskRaw ? numericFields(riskRaw, ["beta", "volatility", "tracking_error", "max_drawdown"]) : undefined,
    quality: qualityRaw ? numericFields(qualityRaw, ["pe", "pb", "roe", "dividend"]) : undefined,
    behavior: behaviorRaw ? numericFields(behaviorRaw, ["avg_holding_days", "losing_count"]) : undefined,
    attribution,
    scores: scoresRaw
      ? {
          ...scoresRaw,
          overall: num(scoresRaw.overall),
          prev_overall: num(scoresRaw.prev_overall),
          pillars:
            record(scoresRaw.pillars) == null
              ? scoresRaw.pillars
              : Object.fromEntries(
                  Object.entries(record(scoresRaw.pillars)!).map(([key, value]) => [key, num(value)]),
                ),
        }
      : undefined,
  }
  return {
    analysis: analysis as PortfolioAnalysis,
    narrative: (record(root.narrative) as PortfolioNarrative | null) ?? null,
    meta: (record(root.meta) as PortfolioAnalysisResponse["meta"]) ?? {},
  }
}

/** `POST /portfolio-manager/analyze` — sinh mới hoặc lấy cache trong ngày. */
export async function analyzePortfolio(signal?: AbortSignal): Promise<PortfolioAnalysisResponse> {
  return adaptPortfolioAnalysis(await api<unknown>("/portfolio-manager/analyze", { method: "POST", signal }))
}
