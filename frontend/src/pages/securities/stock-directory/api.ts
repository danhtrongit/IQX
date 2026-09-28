/**
 * Directory data layer for /co-phieu — public reference data, no auth needed:
 *
 * - `GET /instruments` — the canonical paginated v2 symbol catalog.
 */
import { api } from "@/lib/api"

import type { DirectorySymbol } from "./types"

type Raw = Record<string, unknown>

/** Trimmed non-empty string → string, otherwise null. */
function str(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed === "" ? null : trimmed
  }
  if (typeof value === "number") return String(value)
  return null
}

/** Backend symbol row (snake_case) → camelCase directory row. */
function adaptSymbol(raw: Raw): DirectorySymbol {
  return {
    symbol: (str(raw.symbol) ?? str(raw.ticker) ?? "").toUpperCase(),
    name: str(raw.name) ?? str(raw.organ_name),
    shortName: str(raw.short_name),
    exchange: str(raw.exchange),
    assetType: str(raw.asset_type),
    isIndex: raw.is_index === true,
    icbLv1: str(raw.icb_lv1),
    icbLv2: str(raw.icb_lv2),
    logoUrl: str(raw.logo_url),
  }
}

/**
 * The full tradable-stock directory. The v2 catalog is a single envelope, so
 * there is no client-side pagination to synthesize (and no `items`/`page_size`
 * contract on this route).
 */
export async function fetchDirectorySymbols(): Promise<DirectorySymbol[]> {
  const items: unknown[] = []
  for (let page = 1; page <= 100; page += 1) {
    const params = new URLSearchParams({ asset_type: "stock", page: String(page), page_size: "100" })
    const payload = await api<{ data?: unknown; meta?: Raw }>(`/instruments?${params.toString()}`)
    const rows = Array.isArray(payload.data) ? payload.data : []
    items.push(...rows)
    const pagination = (payload.meta?.pagination ?? {}) as Raw
    if (rows.length === 0 || page >= (Number(pagination.total_pages) || page)) break
  }
  return items.flatMap((item) => {
    const symbol = adaptSymbol((item ?? {}) as Raw)
    return symbol.symbol ? [symbol] : []
  })
}

/**
 * Tickers of one index group. The endpoint returns symbols only, so the UI
 * intersects this set with the directory to recover names/exchange/industry.
 */
export async function fetchGroupSymbols(group: string): Promise<string[]> {
  const normalized = group.trim().toUpperCase()
  if (["HOSE", "HNX", "UPCOM"].includes(normalized)) {
    const rows = await fetchDirectorySymbols()
    return rows.filter((row) => row.exchange?.toUpperCase() === normalized).map((row) => row.symbol)
  }
  if (normalized === "ETF") {
    const rows = await fetchDirectorySymbols()
    return rows.filter((row) => row.assetType?.toUpperCase() === "ETF").map((row) => row.symbol)
  }
  const payload = await api<{ data?: unknown }>(
    `/market-data/reference/groups/${encodeURIComponent(group)}/symbols`,
  )
  const rows = Array.isArray(payload.data) ? payload.data : []
  return rows.flatMap((row) => {
    const value = typeof row === "string" ? row : str((row as Raw)?.symbol)
    return value ? [value.toUpperCase()] : []
  })
}
