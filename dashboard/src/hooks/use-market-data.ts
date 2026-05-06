import { useState, useEffect, useCallback } from "react"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

// ── Types (shared by context + consumers) ──

export interface IndexData {
  name: string
  value: number
  change: number
  changePercent: number
  trend: "up" | "down" | "flat"
  volume?: number
  advances?: number
  declines?: number
  noChange?: number
}

export interface PriceBoardData {
  symbol: string
  exchange: string
  ceilingPrice: number
  floorPrice: number
  referencePrice: number
  openPrice: number
  closePrice: number
  highestPrice: number
  lowestPrice: number
  priceChange: number
  percentChange: number
  totalVolume: number
  totalValue: number
  bid: { price: number; volume: number }[]
  ask: { price: number; volume: number }[]
  foreignBuy: number
  foreignSell: number
  foreignRoom: number | null
}

// ── Fetch Indices from /market-data/overview/market-index ──

const INDEX_REQUEST_SYMBOLS = ["VNINDEX", "VN30", "HNXIndex", "HNX30", "HNXUpcomIndex"]
const INDEX_SYMBOLS = ["VNINDEX", "VN30", "HNX", "HNX30", "UPCOM"]
const INDEX_DISPLAY: Record<string, string> = {
  VNINDEX: "VN-Index",
  VN30: "VN30",
  HNX: "HNX-Index",
  HNX30: "HNX30",
  UPCOM: "UPCOM",
}

const INDEX_ALIASES: Record<string, string> = {
  VNINDEX: "VNINDEX",
  VN30: "VN30",
  HNX: "HNX",
  HNXINDEX: "HNX",
  HNX30: "HNX30",
  UPCOM: "UPCOM",
  UPCOMINDEX: "UPCOM",
  HNXUPCOMINDEX: "UPCOM",
}

/** Backend market-index response item (snake_case) */
interface BackendMarketIndex {
  index_name?: string
  index_value?: number
  symbol?: string
  price?: number
  change?: number
  change_percent?: number
  total_shares?: number
  total_value_million_vnd?: number
  total_stock_increase?: number
  total_stock_decline?: number
  total_stock_no_change?: number
  [key: string]: unknown
}

function normalizeIndexSymbol(rawSymbol: string | undefined): string | null {
  const normalized = rawSymbol?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  if (!normalized) return null
  return INDEX_ALIASES[normalized] || normalized
}

function getMarketIndexUrl() {
  const params = new URLSearchParams({ symbols: INDEX_REQUEST_SYMBOLS.join(",") })
  return `${API_BASE}/market-data/overview/market-index?${params.toString()}`
}

/** Adapt backend market-index to UI IndexData */
function adaptMarketIndex(raw: BackendMarketIndex): IndexData | null {
  const symbol = normalizeIndexSymbol(raw.symbol || raw.index_name)
  if (!symbol) return null
  const displayName = INDEX_DISPLAY[symbol] || symbol

  const change = Number(raw.change) || 0
  const changePercent = Number(raw.change_percent) || 0
  const value = Number(raw.price ?? raw.index_value) || 0

  return {
    name: displayName,
    value,
    change,
    changePercent,
    trend: change > 0 ? "up" : change < 0 ? "down" : "flat",
    volume: raw.total_shares ? Number(raw.total_shares) : undefined,
    advances: raw.total_stock_increase ? Number(raw.total_stock_increase) : undefined,
    declines: raw.total_stock_decline ? Number(raw.total_stock_decline) : undefined,
    noChange: raw.total_stock_no_change ? Number(raw.total_stock_no_change) : undefined,
  }
}

export async function fetchIndexData(): Promise<IndexData[]> {
  try {
    const resp = await fetch(getMarketIndexUrl())
    if (!resp.ok) return []
    const json = await resp.json()
    const rawItems: BackendMarketIndex[] = json?.data || json || []
    if (!Array.isArray(rawItems)) return []

    const adapted = rawItems
      .map(adaptMarketIndex)
      .filter((item): item is IndexData => item !== null)

    // Sort by INDEX_SYMBOLS order
    return INDEX_SYMBOLS.map((s) =>
      adapted.find((r) => {
        const displayName = INDEX_DISPLAY[s] || s
        return r.name === displayName
      }),
    ).filter(Boolean) as IndexData[]
  } catch {
    return []
  }
}

// ── Fetch Market Indices for polling consumers ──

interface RawIndexItem {
  symbol: string
  price: number
  change: number
  changePercent: number
}

export async function fetchMarketIndices(): Promise<RawIndexItem[]> {
  try {
    const resp = await fetch(getMarketIndexUrl())
    if (!resp.ok) return []
    const json = await resp.json()
    const rawItems: BackendMarketIndex[] = json?.data || json || []
    if (!Array.isArray(rawItems)) return []

    return rawItems
      .map((r) => {
        const symbol = normalizeIndexSymbol(r.symbol || r.index_name)
        if (!symbol) return null
        return {
          symbol,
          price: Number(r.price ?? r.index_value) || 0,
          change: Number(r.change) || 0,
          changePercent: Number(r.change_percent) || 0,
        }
      })
      .filter((item): item is RawIndexItem => item !== null)
  } catch {
    // Fallback to fetchIndexData
    const indexData = await fetchIndexData()
    return indexData.map((d) => ({
      symbol: Object.keys(INDEX_DISPLAY).find((k) => INDEX_DISPLAY[k] === d.name) || d.name,
      price: d.value,
      change: d.change,
      changePercent: d.changePercent,
    }))
  }
}

/** Adapt backend snake_case price-board item to camelCase PriceBoardData.
 *  Backend returns prices in raw VND (e.g. 219500).
 *  UI expects prices in x1000 format (e.g. 219.5) and displays via `* 1000`.
 *  We divide by 1000 here so the UI math is correct.
 */
function adaptPriceBoardItem(raw: any): PriceBoardData {
  const toK = (v: number | null | undefined) => (v != null ? v / 1000 : 0)

  const closePrice = toK(raw.close_price ?? raw.closePrice)
  const referencePrice = toK(raw.reference_price ?? raw.referencePrice)
  const priceChange = raw.price_change != null
    ? toK(raw.price_change)
    : raw.priceChange != null
      ? raw.priceChange
      : closePrice - referencePrice
  const percentChange = raw.percent_change ?? raw.percentChange
    ?? (referencePrice > 0 ? (priceChange / referencePrice) * 100 : 0)

  return {
    symbol: raw.symbol || "",
    exchange: raw.exchange || "",
    ceilingPrice: toK(raw.ceiling_price ?? raw.ceilingPrice),
    floorPrice: toK(raw.floor_price ?? raw.floorPrice),
    referencePrice,
    openPrice: toK(raw.open_price ?? raw.openPrice),
    closePrice,
    highestPrice: toK(raw.high_price ?? raw.highestPrice),
    lowestPrice: toK(raw.low_price ?? raw.lowestPrice),
    priceChange,
    percentChange,
    totalVolume: raw.total_volume ?? raw.totalVolume ?? 0,
    totalValue: raw.total_value ?? raw.totalValue ?? 0,
    bid: Array.isArray(raw.bid_prices)
      ? raw.bid_prices.map((b: any) => ({ price: toK(b.price), volume: b.volume ?? 0 }))
      : raw.bid || [],
    ask: Array.isArray(raw.ask_prices)
      ? raw.ask_prices.map((a: any) => ({ price: toK(a.price), volume: a.volume ?? 0 }))
      : raw.ask || [],
    foreignBuy: raw.foreign_buy_volume ?? raw.foreignBuy ?? 0,
    foreignSell: raw.foreign_sell_volume ?? raw.foreignSell ?? 0,
    foreignRoom: raw.foreign_remaining_room ?? raw.foreignRoom ?? null,
  }
}

export async function fetchPriceBoard(symbols: string[]): Promise<PriceBoardData[]> {
  try {
    const resp = await fetch(`${API_BASE}/market-data/trading/price-board`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols }),
    })
    if (!resp.ok) return []
    const json = await resp.json()
    const rawItems = json?.data || []
    return Array.isArray(rawItems) ? rawItems.map(adaptPriceBoardItem) : []
  } catch {
    return []
  }
}

// ── Arena Account Hook (uses virtual-trading endpoints) ──

export interface ArenaAccountData {
  id: string
  balance: number
  initialBalance: number
  pnl: number
  pnlPercent: number
  winRate: number
  totalOrders: number
  pendingOrders: number
  portfolio: { symbol: string; quantity: number; avgBuyPrice: number }[]
}

function adaptVTAccountFull(raw: any): ArenaAccountData {
  return {
    id: String(raw.id || ""),
    balance: raw.cash_available_vnd ?? raw.balance ?? 0,
    initialBalance: raw.initial_cash_vnd ?? raw.initialBalance ?? 0,
    pnl: raw.total_unrealized_pnl_vnd ?? raw.pnl ?? 0,
    pnlPercent: raw.return_pct ?? raw.pnlPercent ?? 0,
    winRate: raw.win_rate ?? raw.winRate ?? 0,
    totalOrders: raw.total_orders ?? raw.totalOrders ?? 0,
    pendingOrders: raw.pending_orders ?? raw.pendingOrders ?? 0,
    portfolio: [], // Portfolio loaded separately via getPortfolio
  }
}

export function useArenaAccount(isAuthenticated: boolean, refreshInterval = 15000) {
  const [account, setAccount] = useState<ArenaAccountData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setAccount(null)
      return
    }
    setIsLoading(true)
    try {
      const token = localStorage.getItem("accessToken")
      if (!token) return
      const resp = await fetch(`${API_BASE}/virtual-trading/account`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) {
        setAccount(null)
        return
      }
      const json = await resp.json()
      // Backend returns AccountResponse directly (no { data } wrapper)
      setAccount(adaptVTAccountFull(json))
    } catch {
      setAccount(null)
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    load()
    if (!isAuthenticated) return
    const timer = setInterval(load, refreshInterval)
    return () => clearInterval(timer)
  }, [load, isAuthenticated, refreshInterval])

  return { account, isLoading, refresh: load }
}
