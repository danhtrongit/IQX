import { api, unwrap } from "@/shared/http/client"
import type { DirectorySymbol, Industry } from "./types"

/* ── Adapters (snake_case → camelCase), ported from dashboard-bak ─────────── */

type Raw = Record<string, unknown>

function str(raw: Raw, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k]
    if (v != null && v !== "") return String(v)
  }
  return null
}

/** Adapt a backend symbol item to a camelCase directory row. */
function adaptSymbol(raw: Raw): DirectorySymbol {
  return {
    symbol: (str(raw, "symbol", "ticker") ?? "").toUpperCase(),
    name: str(raw, "name", "organ_name", "organName"),
    shortName: str(raw, "short_name", "shortName"),
    exchange: str(raw, "exchange"),
    assetType: str(raw, "asset_type", "assetType"),
    isIndex: Boolean(raw.is_index ?? raw.isIndex ?? false),
    icbLv1: str(raw, "icb_lv1", "icbLv1"),
    icbLv2: str(raw, "icb_lv2", "icbLv2"),
    logoUrl: str(raw, "logo_url", "logoUrl"),
  }
}

function adaptIndustry(raw: Raw): Industry {
  return {
    code: str(raw, "icb_code", "code") ?? "",
    name: str(raw, "icb_name", "name") ?? "",
    nameEn: str(raw, "en_icb_name", "nameEn") ?? "",
    level: typeof raw.level === "number" ? raw.level : null,
  }
}

/* ── API ─────────────────────────────────────────────────────────────────── */

const SEARCH_PAGE_SIZE = 100

/**
 * Fetch every tradable stock by paging through the DB-backed search endpoint
 * (`reference/symbols/search`, asset_type=stock, indices excluded). Mirrors the
 * page-loop from `dashboard-bak/src/pages/stock-directory.tsx`.
 */
export async function fetchAllSymbols(): Promise<DirectorySymbol[]> {
  const symbols: DirectorySymbol[] = []
  let page = 1
  let totalPages = 1

  do {
    const res = await api
      .get("market-data/reference/symbols/search", {
        searchParams: {
          page,
          page_size: SEARCH_PAGE_SIZE,
          asset_type: "stock",
          include_indices: "false",
        },
      })
      .json<Raw>()

    const rawItems = (res.items ?? res.data ?? []) as unknown
    if (Array.isArray(rawItems)) {
      symbols.push(...rawItems.map((r) => adaptSymbol(r as Raw)))
    }
    totalPages = typeof res.total_pages === "number" ? res.total_pages : page
    page += 1
  } while (page <= totalPages)

  return symbols
}

/**
 * GET reference/groups/{group}/symbols — the set of tickers in an index group
 * (VN30/HOSE/ETF…). The endpoint returns symbols only; the UI intersects this
 * set with the full directory to recover names/exchange/industry.
 */
export async function fetchGroupSymbols(group: string): Promise<string[]> {
  const res = await api
    .get(`market-data/reference/groups/${group}/symbols`)
    .json<unknown>()
  const rawItems = unwrap<Raw[]>(res as never)
  if (!Array.isArray(rawItems)) return []
  return rawItems
    .map((r) => str(r, "symbol", "ticker"))
    .filter((s): s is string => !!s)
    .map((s) => s.toUpperCase())
}

/** GET reference/industries — ICB industry classification list. */
export async function fetchIndustries(): Promise<Industry[]> {
  const res = await api.get("market-data/reference/industries").json<unknown>()
  const rawItems = unwrap<Raw[]>(res as never)
  return Array.isArray(rawItems) ? rawItems.map(adaptIndustry) : []
}
