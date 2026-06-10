import { api } from "@/shared/http/client"

/** UI-facing watchlist row (camelCase). */
export interface WatchlistItem {
  id: string
  symbol: string
  sortOrder: number
  createdAt: string
}

/** Raw backend watchlist row (snake_case). */
interface BackendWatchlistItem {
  id: string
  symbol: string
  sort_order: number
  created_at: string
}

interface BackendWatchlistResponse {
  items: BackendWatchlistItem[]
  count: number
}

/** Company / instrument metadata used to render a watchlist row. */
export interface SymbolInfo {
  name: string
  shortName: string
  industry: string
  exchange: string
  assetType: string
  isIndex: boolean
}

/** snake_case backend item → camelCase WatchlistItem. */
function adaptItem(raw: BackendWatchlistItem): WatchlistItem {
  return {
    id: String(raw.id),
    symbol: String(raw.symbol).toUpperCase(),
    sortOrder: raw.sort_order ?? 0,
    createdAt: raw.created_at,
  }
}

function toSymbolInfo(raw: Record<string, unknown>): SymbolInfo {
  return {
    name: String(raw.name || raw.organ_name || ""),
    shortName: String(raw.short_name || ""),
    industry: String(raw.icb_lv2 || raw.icb_lv1 || ""),
    exchange: String(raw.exchange || ""),
    assetType: String(raw.asset_type || ""),
    isIndex: Boolean(raw.is_index),
  }
}

export const watchlistApi = {
  /** GET /watchlist */
  list: async (): Promise<WatchlistItem[]> => {
    const res = await api.get("watchlist").json<BackendWatchlistResponse>()
    return (res.items || []).map(adaptItem)
  },

  /** POST /watchlist { symbol } */
  add: async (symbol: string): Promise<WatchlistItem> => {
    const raw = await api
      .post("watchlist", { json: { symbol: symbol.toUpperCase() } })
      .json<BackendWatchlistItem>()
    return adaptItem(raw)
  },

  /** DELETE /watchlist/{symbol} */
  remove: async (symbol: string): Promise<void> => {
    await api.delete(`watchlist/${symbol.toUpperCase()}`)
  },

  /** PUT /watchlist/reorder { symbols } */
  reorder: async (symbols: string[]): Promise<WatchlistItem[]> => {
    const res = await api
      .put("watchlist/reorder", { json: { symbols } })
      .json<BackendWatchlistResponse>()
    return (res.items || []).map(adaptItem)
  },

  /**
   * Validate that `symbol` is a tradable stock (not an index / fund).
   * Returns a Vietnamese error message, or `null` when valid.
   */
  validateStock: async (symbol: string): Promise<string | null> => {
    try {
      const raw = await api
        .get(`market-data/reference/symbols/${symbol}`)
        .json<Record<string, unknown>>()
      const info = toSymbolInfo(raw)
      if (info.isIndex || info.assetType.toLowerCase() !== "stock") {
        return `Mã ${symbol} không phải là cổ phiếu`
      }
      return null
    } catch (err) {
      const status = (err as { response?: Response })?.response?.status
      if (status === 404) return `Mã ${symbol} không tồn tại`
      return "Không thể kiểm tra mã cổ phiếu"
    }
  },

  /** Lookup company metadata for a single symbol (best-effort, may return null). */
  getSymbolInfo: async (symbol: string): Promise<SymbolInfo | null> => {
    try {
      const json = await api
        .get("market-data/reference/symbols/search", {
          searchParams: {
            q: symbol,
            page_size: 1,
            asset_type: "stock",
            include_indices: false,
          },
        })
        .json<{ items?: Record<string, unknown>[]; data?: Record<string, unknown>[] }>()
      const items = json.items || json.data || []
      const match =
        items.find(
          (i) => String(i.symbol || "").toUpperCase() === symbol.toUpperCase(),
        ) || items[0]
      return match ? toSymbolInfo(match) : null
    } catch {
      return null
    }
  },

  /**
   * 3-month daily close prices for a symbol's sparkline.
   * Returns an empty array on any failure.
   */
  getSparkline: async (symbol: string): Promise<number[]> => {
    try {
      const now = new Date()
      const end = now.toISOString().slice(0, 10)
      const start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
        .toISOString()
        .slice(0, 10)
      const json = await api
        .get(`market-data/quotes/${symbol}/ohlcv`, {
          searchParams: { start, end, interval: "1D" },
        })
        .json<{ data?: Record<string, unknown>[] } | Record<string, unknown>[]>()
      const rows = Array.isArray(json) ? json : json.data || []
      return rows
        .map((p) => Number(p.close ?? p.close_price ?? 0))
        .filter((v) => v > 0)
    } catch {
      return []
    }
  },
}
