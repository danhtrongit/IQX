import type { FinReportType } from "./types"

/**
 * Query keys for the stock detail page. Namespaced under `charts` (this slice)
 * and user-scoped where the payload is private: BCTC AI memos and AI Insight
 * are premium, per-subscription responses and must never be served from another
 * user's cache entry.
 */
export const stockKeys = {
  all: ["charts", "stock"] as const,
  overview: (symbol: string) => ["charts", "stock", "overview", symbol] as const,
  report: (symbol: string, type: FinReportType, termType: number, periodCount: number) =>
    ["charts", "stock", "report", symbol, type, termType, periodCount] as const,
  ratio: (symbol: string, period: "Q" | "Y") =>
    ["charts", "stock", "ratio", symbol, period] as const,
  bctc: (symbol: string, termType: number) =>
    ["charts", "stock", "bctc", symbol, termType] as const,
  bctcAi: (symbol: string, termType: number, userId: string | undefined) =>
    ["charts", "stock", "bctc-ai", userId, symbol, termType] as const,
  aiInsight: (symbol: string, userId: string | undefined) =>
    ["charts", "stock", "ai-insight", userId, symbol] as const,
} as const
