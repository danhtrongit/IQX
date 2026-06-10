import type { FinReportType } from "./types"

/**
 * Feature-local query keys for the stock detail page. Leaves are `readonly`
 * tuples (or functions returning them) per the foundation key convention.
 */
export const stockKeys = {
  all: ["stock"] as const,
  overview: (symbol: string) => ["stock", "overview", symbol] as const,
  report: (symbol: string, type: FinReportType, termType: number, periodCount: number) =>
    ["stock", "report", symbol, type, termType, periodCount] as const,
  ratio: (symbol: string, period: "Q" | "Y") => ["stock", "ratio", symbol, period] as const,
  bctc: (symbol: string, termType: number) => ["stock", "bctc", symbol, termType] as const,
  bctcAi: (symbol: string, termType: number) => ["stock", "bctc-ai", symbol, termType] as const,
  aiInsight: (symbol: string) => ["stock", "ai-insight", symbol] as const,
} as const
