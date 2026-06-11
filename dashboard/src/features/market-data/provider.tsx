import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchMarketIndices, fetchPriceBoard, INDEX_CODE_TO_NAME } from "./api"
import { MarketDataContext, type MarketDataContextValue } from "./context"
import { marketDataKeys } from "./keys"
import {
  RealtimeClient,
  type IndexMessage,
  type OrderBookMessage,
  type TickMessage,
} from "./realtime"
import type { IndexData, PriceBoardData } from "./types"

// When WS is live, the price-board snapshot is only needed for reference data
// (ceiling/floor/reference) + as a fallback, so we poll it slowly. When WS is
// down we fall back to the original fast poll for live prices.
const PRICE_INTERVAL_WS = 30_000 // 30s — reference refresh + backstop
const PRICE_INTERVAL_POLL = 5_000 // 5s — fallback live polling
const INDEX_INTERVAL = 10_000 // 10s
const OVERLAY_FLUSH_MS = 500 // batch tick-driven re-renders to ~2/s
// Backend cap ~100 mã/WS connection (REALTIME_WS_MAX_SYMBOLS_PER_CONN, kênh
// index miễn cap) — giữ headroom cho watchlist/header.
const WS_SYMBOL_BUDGET = 90

/** Index codes permanently subscribed on the realtime "index" channel. */
const INDEX_CHANNEL_CODES = ["VNINDEX", "VN30", "HNX", "HNX30", "UPCOM"]
/** UI display name → realtime index code (VN-Index → VNINDEX). */
const INDEX_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(INDEX_CODE_TO_NAME).map(([code, name]) => [name, code]),
)

/** Live tick overlay applied on top of the price-board snapshot. */
interface TickOverlay {
  closePrice: number // x1000 convention (VND / 1000), matching PriceBoardData
  totalVolume: number
  lastVolume: number // KL của lệnh khớp gần nhất (cổ phiếu)
}

/** Live order-book overlay (prices already converted to x1000 convention). */
interface BookOverlay {
  bids: { price: number; volume: number }[]
  asks: { price: number; volume: number }[]
}

/** Snapshot wrapper flushed into state every OVERLAY_FLUSH_MS when dirty. */
interface OverlaySnapshot {
  ticks: ReadonlyMap<string, TickOverlay>
  books: ReadonlyMap<string, BookOverlay>
}

/** Shallow compare of bid/ask depth arrays. */
function sameLevels(
  a: { price: number; volume: number }[],
  b: { price: number; volume: number }[],
): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].price !== b[i].price || a[i].volume !== b[i].volume) return false
  }
  return true
}

/** Field-wise compare so unchanged rows keep referential identity across flushes. */
function isSameRow(a: PriceBoardData, b: PriceBoardData): boolean {
  return (
    a.symbol === b.symbol &&
    a.exchange === b.exchange &&
    a.ceilingPrice === b.ceilingPrice &&
    a.floorPrice === b.floorPrice &&
    a.referencePrice === b.referencePrice &&
    a.openPrice === b.openPrice &&
    a.closePrice === b.closePrice &&
    a.highestPrice === b.highestPrice &&
    a.lowestPrice === b.lowestPrice &&
    a.priceChange === b.priceChange &&
    a.percentChange === b.percentChange &&
    a.hasTraded === b.hasTraded &&
    a.totalVolume === b.totalVolume &&
    a.totalValue === b.totalValue &&
    a.lastMatchVolume === b.lastMatchVolume &&
    a.foreignBuy === b.foreignBuy &&
    a.foreignSell === b.foreignSell &&
    a.foreignRoom === b.foreignRoom &&
    sameLevels(a.bid, b.bid) &&
    sameLevels(a.ask, b.ask)
  )
}

/** Live index message → IndexData (when REST has no row for the code yet). */
function adaptLiveIndex(live: IndexMessage): IndexData {
  return {
    name: INDEX_CODE_TO_NAME[live.code.toUpperCase()] || live.code.toUpperCase(),
    value: live.value,
    change: live.change,
    changePercent: live.change_percent,
    trend: live.change > 0 ? "up" : live.change < 0 ? "down" : "flat",
    volume: live.total_volume || undefined,
    totalValue: live.total_value || undefined,
    advances: live.advances || undefined,
    declines: live.declines || undefined,
    noChange: live.nochange || undefined,
  }
}

/**
 * MarketDataProvider — ref-counted symbol union backed by:
 *  - A realtime WebSocket (DNSE-fed tick/orderbook/index streams) for live data.
 *  - A price-board `useQuery` for reference data (ceiling/floor/ref) and as a
 *    fallback when the WS is unavailable.
 *  - An indices `useQuery` (10s) as seed/fallback under the live index channel.
 */
export function MarketDataProvider({ children }: { children: ReactNode }) {
  // Ref-counted subscription tracking. Key: uppercase symbol → subscriber count.
  const refCountMap = useRef<Map<string, number>>(new Map())
  const [subscribedSymbols, setSubscribedSymbols] = useState<string[]>([])

  const subscribe = useCallback((symbols: string[]): (() => void) => {
    const map = refCountMap.current
    let changed = false

    for (const sym of symbols) {
      const upper = sym.toUpperCase()
      if (!upper) continue
      const prev = map.get(upper) || 0
      map.set(upper, prev + 1)
      if (prev === 0) changed = true
    }

    if (changed) setSubscribedSymbols(Array.from(map.keys()))

    return () => {
      let removed = false
      for (const sym of symbols) {
        const upper = sym.toUpperCase()
        if (!upper) continue
        const count = map.get(upper) || 0
        if (count <= 1) {
          map.delete(upper)
          removed = true
        } else {
          map.set(upper, count - 1)
        }
      }
      if (removed) setSubscribedSymbols(Array.from(map.keys()))
    }
  }, [])

  // Sorted union key — stable across re-orders so the query key is deterministic.
  const symbolsKey = useMemo(
    () => [...subscribedSymbols].sort().join(","),
    [subscribedSymbols],
  )

  // ── Realtime WebSocket ─────────────────────────────
  const [wsConnected, setWsConnected] = useState(false)

  // Live overlays are accumulated in refs by WS handlers (no re-render per
  // message) and flushed into state at most every OVERLAY_FLUSH_MS.
  const tickOverlayRef = useRef<Map<string, TickOverlay>>(new Map())
  const bookOverlayRef = useRef<Map<string, BookOverlay>>(new Map())
  const overlayDirtyRef = useRef(false)
  const indexLiveRef = useRef<Map<string, IndexMessage>>(new Map())
  const indexDirtyRef = useRef(false)
  const [overlay, setOverlay] = useState<OverlaySnapshot>({
    ticks: new Map(),
    books: new Map(),
  })
  const [indexLive, setIndexLive] = useState<ReadonlyMap<string, IndexMessage>>(
    new Map(),
  )

  // Lazy singleton via useState initializer (created once, before any effect).
  // Khi WS rớt: xoá toàn bộ overlay để REST fallback (5s) không bị dữ liệu
  // đông cứng từ phiên WS cũ đè lên — nếu không cả bảng sẽ "đứng hình" suốt
  // thời gian mất kết nối.
  // eslint-disable-next-line react-hooks/refs -- handler chỉ chạy khi WS đổi trạng thái (event), không chạy trong render
  const [client] = useState<RealtimeClient | null>(() =>
    typeof window !== "undefined"
      ? new RealtimeClient({
          onStatusChange: (connected) => {
            setWsConnected(connected)
            if (!connected) {
              tickOverlayRef.current = new Map()
              bookOverlayRef.current = new Map()
              indexLiveRef.current = new Map()
              overlayDirtyRef.current = false
              indexDirtyRef.current = false
              setOverlay({ ticks: new Map(), books: new Map() })
              setIndexLive(new Map())
            }
          },
        })
      : null,
  )

  // Connect once on mount; flush batched overlays on an interval.
  useEffect(() => {
    if (!client) return
    client.connect()
    const flush = setInterval(() => {
      if (overlayDirtyRef.current) {
        overlayDirtyRef.current = false
        setOverlay({
          ticks: tickOverlayRef.current,
          books: bookOverlayRef.current,
        })
      }
      if (indexDirtyRef.current) {
        indexDirtyRef.current = false
        setIndexLive(new Map(indexLiveRef.current))
      }
    }, OVERLAY_FLUSH_MS)
    return () => {
      clearInterval(flush)
      client.disconnect()
    }
  }, [client])

  // Subscribe tick + orderbook streams for the current symbol union.
  // Backend giới hạn ~100 mã/connection (kênh index được miễn) — chỉ subscribe
  // phần đầu (đã sort); phần còn lại do REST poll 5s bao phủ (wsCovered=false).
  useEffect(() => {
    if (!client) return
    const symbols = symbolsKey
      .split(",")
      .filter(Boolean)
      .slice(0, WS_SYMBOL_BUDGET)
    const unsubs: (() => void)[] = []
    for (const sym of symbols) {
      unsubs.push(
        client.on(sym, "tick", (msg) => {
          const tick = msg as TickMessage
          tickOverlayRef.current.set(tick.symbol.toUpperCase(), {
            closePrice: tick.price / 1000, // VND → x1000 convention
            totalVolume: tick.total_volume,
            lastVolume: tick.volume,
          })
          overlayDirtyRef.current = true
        }),
      )
      unsubs.push(
        client.on(sym, "orderbook", (msg) => {
          const book = msg as OrderBookMessage
          bookOverlayRef.current.set(book.symbol.toUpperCase(), {
            bids: book.bids.map((l) => ({ price: l.price / 1000, volume: l.volume })),
            asks: book.asks.map((l) => ({ price: l.price / 1000, volume: l.volume })),
          })
          overlayDirtyRef.current = true
        }),
      )
    }
    return () => {
      for (const u of unsubs) u()
    }
  }, [client, symbolsKey])

  // Subscribe the index channel once for the main indices.
  useEffect(() => {
    if (!client) return
    const unsubs = INDEX_CHANNEL_CODES.map((code) =>
      client.on(code, "index", (msg) => {
        const idx = msg as IndexMessage
        indexLiveRef.current.set(idx.code.toUpperCase(), idx)
        indexDirtyRef.current = true
      }),
    )
    return () => {
      for (const u of unsubs) u()
    }
  }, [client])

  // ── Price-board snapshot (reference data + fallback) ──
  // Khi union vượt ngân sách WS (tab lớn), các mã ngoài budget chỉ có REST —
  // phải giữ nhịp poll nhanh thay vì nhịp backstop 30s.
  const wsCovered =
    (symbolsKey ? symbolsKey.split(",").length : 0) <= WS_SYMBOL_BUDGET
  const pricesQuery = useQuery({
    queryKey: marketDataKeys.priceBoard(symbolsKey),
    queryFn: () => fetchPriceBoard(symbolsKey.split(",").filter(Boolean)),
    enabled: symbolsKey.length > 0,
    refetchInterval:
      wsConnected && wsCovered ? PRICE_INTERVAL_WS : PRICE_INTERVAL_POLL,
    refetchIntervalInBackground: false, // pause when tab hidden
    staleTime: PRICE_INTERVAL_POLL,
  })

  // Merge snapshot with the live tick/orderbook overlays. Unchanged rows keep
  // their previous object identity so memoized rows skip re-rendering.
  const prevRowsRef = useRef<Record<string, PriceBoardData>>({})
  const priceMap = useMemo(() => {
    const map: Record<string, PriceBoardData> = {}
    for (const item of pricesQuery.data ?? []) {
      const key = item.symbol.toUpperCase()
      const tick = overlay.ticks.get(key)
      const book = overlay.books.get(key)

      let row = item
      if (tick && tick.closePrice > 0) {
        const closePrice = tick.closePrice
        const ref = item.referencePrice || 0
        const priceChange = ref > 0 ? closePrice - ref : item.priceChange
        const percentChange =
          ref > 0 ? (priceChange / ref) * 100 : item.percentChange
        row = {
          ...row,
          closePrice,
          priceChange,
          percentChange,
          hasTraded: true,
          totalVolume: tick.totalVolume || item.totalVolume,
          lastMatchVolume: tick.lastVolume || undefined,
        }
      }
      if (book && (book.bids.length > 0 || book.asks.length > 0)) {
        row = {
          ...row,
          bid: book.bids,
          ask: book.asks,
        }
      }

      // Cache có chủ đích: row không đổi giữ nguyên identity để React.memo bỏ qua.
      const prev = prevRowsRef.current[item.symbol]
      // eslint-disable-next-line react-hooks/refs -- so sánh giá trị cache để tái dùng object cũ
      map[item.symbol] = prev && isSameRow(prev, row) ? prev : row
    }
    // eslint-disable-next-line react-hooks/refs -- cập nhật cache sau khi merge
    prevRowsRef.current = map
    return map
  }, [pricesQuery.data, overlay])

  // ── Indices: REST poll (seed/fallback) + live index channel overlay ──
  const indicesQuery = useQuery({
    queryKey: marketDataKeys.indices(),
    queryFn: fetchMarketIndices,
    refetchInterval: INDEX_INTERVAL,
    refetchIntervalInBackground: false,
    staleTime: INDEX_INTERVAL,
  })

  const indices = useMemo<IndexData[]>(() => {
    const polled = indicesQuery.data ?? []
    if (indexLive.size === 0) return polled

    const merged = polled.map((item) => {
      const code = INDEX_NAME_TO_CODE[item.name]
      const live = code ? indexLive.get(code) : undefined
      if (!live) return item
      const change = live.change
      const trend: IndexData["trend"] =
        change > 0 ? "up" : change < 0 ? "down" : "flat"
      return {
        ...item,
        value: live.value || item.value,
        change,
        changePercent: live.change_percent,
        trend,
        volume: live.total_volume || item.volume,
        totalValue: live.total_value || item.totalValue,
        advances: live.advances || item.advances,
        declines: live.declines || item.declines,
        noChange: live.nochange || item.noChange,
      }
    })

    // Chỉ số chỉ có dữ liệu live (REST chưa trả về) → thêm vào cuối.
    for (const code of INDEX_CHANNEL_CODES) {
      const live = indexLive.get(code)
      if (!live) continue
      if (polled.some((p) => INDEX_NAME_TO_CODE[p.name] === code)) continue
      merged.push(adaptLiveIndex(live))
    }
    return merged
  }, [indicesQuery.data, indexLive])

  const value = useMemo<MarketDataContextValue>(
    () => ({
      priceMap,
      indices,
      // Only "loading" when we have subscribers but no data yet.
      isPriceLoading:
        symbolsKey.length > 0 && pricesQuery.isLoading,
      isIndicesLoading: indicesQuery.isLoading,
      isRealtime: wsConnected,
      subscribe,
      getRealtimeClient: () => client,
    }),
    [
      priceMap,
      indices,
      symbolsKey,
      pricesQuery.isLoading,
      indicesQuery.isLoading,
      wsConnected,
      subscribe,
      client,
    ],
  )

  return (
    <MarketDataContext.Provider value={value}>
      {children}
    </MarketDataContext.Provider>
  )
}
