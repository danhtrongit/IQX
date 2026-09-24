/**
 * MarketDataProvider — the board's live data engine for one page.
 *
 * Three sources, merged in this order:
 *  1. `POST /market-data/trading/price-board` — the REST snapshot (reference
 *     price, ceiling/floor, foreign flows) and the fallback for live prices.
 *  2. The realtime WebSocket — tick + order-book overlays applied on top of the
 *     snapshot, batched into state every `OVERLAY_FLUSH_MS` so a busy session
 *     does not re-render the board once per message.
 *  3. `GET /market-data/overview/market-index` (10s) as the seed/fallback under
 *     the live index channel.
 *
 * When the socket is down the overlays are ignored at render time, so the 5s
 * REST poll drives the board instead of frozen WebSocket values; when it is up
 * the snapshot is only re-fetched every 30s (reference data + backstop). Off a
 * tab's budget (`WS_SYMBOL_BUDGET`) the fast poll stays on because those symbols
 * have no socket coverage.
 *
 * Symbol demand is ref-counted in React state, so a page that mounts no price
 * consumer opens no socket and fetches nothing.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"

import { securitiesKeys } from "../keys"
import {
  fetchMarketIndices,
  fetchPriceBoard,
  INDEX_CODE_TO_NAME,
  INDEX_NAME_TO_CODE,
} from "./api"
import { MarketDataContext, type MarketDataContextValue } from "./context"
import {
  RealtimeClient,
  type IndexMessage,
  type OrderBookMessage,
  type TickMessage,
} from "./realtime"
import type { DepthLevel, MarketIndexQuote, PriceBoardRow } from "./types"

// WS live → the snapshot only backstops reference data; WS down → fast polling.
const PRICE_INTERVAL_WS = 30_000
const PRICE_INTERVAL_POLL = 5_000
const INDEX_INTERVAL = 10_000
/** Batch tick-driven re-renders to ~2/s. */
const OVERLAY_FLUSH_MS = 500
/** Backend caps a WS connection at `REALTIME_WS_MAX_SYMBOLS_PER_CONN` (~100) — keep headroom. */
const WS_SYMBOL_BUDGET = 90

/** Index codes permanently subscribed on the realtime "index" channel. */
const INDEX_CHANNEL_CODES = ["VNINDEX", "VN30", "HNX", "HNX30", "UPCOM"]

/** Live tick overlay applied on top of the snapshot (x1000 convention). */
interface TickOverlay {
  closePrice: number
  totalVolume: number
  /** KL của lệnh khớp gần nhất. */
  lastVolume: number
}

/** Live order-book overlay (prices already converted to x1000). */
interface BookOverlay {
  bids: DepthLevel[]
  asks: DepthLevel[]
}

interface BoardOverlays {
  ticks: Map<string, TickOverlay>
  books: Map<string, BookOverlay>
  /** Newest source timestamp seen on the socket, epoch ms. */
  at: number | null
}

interface IndexOverlays {
  messages: Map<string, IndexMessage>
  at: number | null
}

const EMPTY_BOARD_OVERLAYS: BoardOverlays = { ticks: new Map(), books: new Map(), at: null }
const EMPTY_INDEX_OVERLAYS: IndexOverlays = { messages: new Map(), at: null }

/** Upstream time → epoch ms; accepts ISO, `YYYY-MM-DD HH:mm:ss`, epoch s and ms. */
function sourceEpoch(value: string | null): number | null {
  if (!value) return null
  if (/^\d+$/.test(value)) {
    const numeric = Number(value)
    return numeric > 1e12 ? numeric : numeric * 1000
  }
  // `Date.parse` only accepts the space spelling in V8; normalise it first.
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? value.replace(" ", "T") : value)
  return Number.isNaN(parsed) ? null : parsed
}

/** Newest of the given optional timestamps (0/null ignored), or null when none is known. */
function newestOf(...values: (number | null)[]): number | null {
  let newest = 0
  for (const value of values) {
    if (value && value > newest) newest = value
  }
  return newest > 0 ? newest : null
}

/** Ref-counted symbol demand: a symbol leaves the union with its last subscriber. */
function withDemand(
  previous: Record<string, number>,
  symbols: string[],
  delta: 1 | -1,
): Record<string, number> {
  const next = { ...previous }
  for (const symbol of symbols) {
    const key = symbol.trim().toUpperCase()
    if (!key) continue
    const count = (next[key] ?? 0) + delta
    if (count > 0) next[key] = count
    else delete next[key]
  }
  return next
}

/** Snapshot row + live tick + live depth → the row the board prints. */
function mergeBoardRow(
  row: PriceBoardRow,
  tick: TickOverlay | undefined,
  book: BookOverlay | undefined,
): PriceBoardRow {
  let merged = row
  if (tick && tick.closePrice > 0) {
    const reference = row.referencePrice
    const priceChange = reference > 0 ? tick.closePrice - reference : row.priceChange
    merged = {
      ...merged,
      closePrice: tick.closePrice,
      priceChange,
      percentChange: reference > 0 ? (priceChange / reference) * 100 : row.percentChange,
      hasTraded: true,
      totalVolume: tick.totalVolume || row.totalVolume,
      lastMatchVolume: tick.lastVolume || undefined,
    }
  }
  if (book && (book.bids.length > 0 || book.asks.length > 0)) {
    merged = { ...merged, bid: book.bids, ask: book.asks }
  }
  return merged
}

/** Live index message → summary row (used when REST has no row for the code yet). */
function adaptLiveIndex(message: IndexMessage): MarketIndexQuote {
  const code = message.code.toUpperCase()
  return {
    name: INDEX_CODE_TO_NAME[code] ?? code,
    value: message.value,
    change: message.change,
    changePercent: message.change_percent,
    trend: message.change > 0 ? "up" : message.change < 0 ? "down" : "flat",
    volume: message.total_volume ?? undefined,
    totalValue: message.total_value ?? undefined,
    advances: message.advances ?? undefined,
    declines: message.declines ?? undefined,
    noChange: message.nochange ?? undefined,
    time: message.time ?? undefined,
  }
}

/** REST index poll + live index channel → the printed index list. */
function mergeIndices(
  polled: MarketIndexQuote[],
  live: Map<string, IndexMessage>,
): MarketIndexQuote[] {
  if (live.size === 0) return polled

  const merged: MarketIndexQuote[] = polled.map((item): MarketIndexQuote => {
    const code = INDEX_NAME_TO_CODE[item.name]
    const message = code ? live.get(code) : undefined
    if (!message) return item
    return {
      ...item,
      value: message.value ?? item.value,
      change: message.change,
      changePercent: message.change_percent,
      trend: message.change > 0 ? "up" : message.change < 0 ? "down" : "flat",
      volume: message.total_volume ?? item.volume,
      totalValue: message.total_value ?? item.totalValue,
      advances: message.advances ?? item.advances,
      declines: message.declines ?? item.declines,
      noChange: message.nochange ?? item.noChange,
      time: message.time ?? item.time,
    }
  })

  for (const code of INDEX_CHANNEL_CODES) {
    const message = live.get(code)
    if (!message) continue
    if (polled.some((item) => INDEX_NAME_TO_CODE[item.name] === code)) continue
    merged.push(adaptLiveIndex(message))
  }
  return merged
}

export function MarketDataProvider({ children }: { children: ReactNode }) {
  const [demand, setDemand] = useState<Record<string, number>>({})
  const [wsConnected, setWsConnected] = useState(false)
  const [board, setBoard] = useState<BoardOverlays>(EMPTY_BOARD_OVERLAYS)
  const [indexOverlays, setIndexOverlays] = useState<IndexOverlays>(EMPTY_INDEX_OVERLAYS)

  // Lazy singleton: consumers subscribe from their own effects, which React runs
  // before the provider's effects, so the client must exist from the first render.
  const [client] = useState(() => new RealtimeClient({ onStatusChange: setWsConnected }))

  const subscribe = useCallback((symbols: string[]) => {
    setDemand((previous) => withDemand(previous, symbols, 1))
    return () => setDemand((previous) => withDemand(previous, symbols, -1))
  }, [])

  // Sorted union key — stable across re-orders so the query key stays deterministic.
  const symbolsKey = useMemo(() => Object.keys(demand).sort().join(","), [demand])

  useEffect(() => {
    client.connect()
    return () => client.disconnect()
  }, [client])

  // Tick + order-book subscriptions for the current symbol union, flushed on a
  // timer. Beyond the socket budget the tail symbols stay REST-only (fast poll).
  useEffect(() => {
    const symbols = symbolsKey.split(",").filter(Boolean).slice(0, WS_SYMBOL_BUDGET)
    if (symbols.length === 0) return

    const ticks = new Map<string, TickOverlay>()
    const books = new Map<string, BookOverlay>()
    let latest: number | null = null
    let dirty = false
    const unsubscribes: (() => void)[] = []

    for (const symbol of symbols) {
      unsubscribes.push(
        client.on(symbol, "tick", (message) => {
          const tick = message as TickMessage
          ticks.set(tick.symbol.toUpperCase(), {
            closePrice: tick.price / 1000, // VND → x1000 convention
            totalVolume: tick.total_volume,
            lastVolume: tick.volume,
          })
          latest = sourceEpoch(tick.time) ?? Date.now()
          dirty = true
        }),
      )
      unsubscribes.push(
        client.on(symbol, "orderbook", (message) => {
          const book = message as OrderBookMessage
          books.set(book.symbol.toUpperCase(), {
            bids: book.bids.map((level) => ({ price: level.price / 1000, volume: level.volume })),
            asks: book.asks.map((level) => ({ price: level.price / 1000, volume: level.volume })),
          })
          dirty = true
        }),
      )
    }

    const flush = window.setInterval(() => {
      if (!dirty) return
      dirty = false
      setBoard({ ticks: new Map(ticks), books: new Map(books), at: latest })
    }, OVERLAY_FLUSH_MS)

    return () => {
      window.clearInterval(flush)
      for (const unsubscribe of unsubscribes) unsubscribe()
    }
  }, [client, symbolsKey])

  // The index channel is symbol-independent — one subscription set for the session.
  useEffect(() => {
    const messages = new Map<string, IndexMessage>()
    let latest: number | null = null
    let dirty = false

    const unsubscribes = INDEX_CHANNEL_CODES.map((code) =>
      client.on(code, "index", (message) => {
        const index = message as IndexMessage
        messages.set(index.code.toUpperCase(), index)
        latest = sourceEpoch(index.time) ?? Date.now()
        dirty = true
      }),
    )

    const flush = window.setInterval(() => {
      if (!dirty) return
      dirty = false
      setIndexOverlays({ messages: new Map(messages), at: latest })
    }, OVERLAY_FLUSH_MS)

    return () => {
      window.clearInterval(flush)
      for (const unsubscribe of unsubscribes) unsubscribe()
    }
  }, [client])

  // Symbols beyond the socket budget (large tabs) have no live coverage → keep the
  // fast poll even while the socket is healthy.
  const wsCovered = symbolsKey.split(",").filter(Boolean).length <= WS_SYMBOL_BUDGET
  const pricesQuery = useQuery({
    queryKey: securitiesKeys.priceBoard(symbolsKey),
    queryFn: () => fetchPriceBoard(symbolsKey.split(",").filter(Boolean)),
    enabled: symbolsKey.length > 0,
    refetchInterval: wsConnected && wsCovered ? PRICE_INTERVAL_WS : PRICE_INTERVAL_POLL,
    refetchIntervalInBackground: false, // pause while the tab is hidden
    staleTime: PRICE_INTERVAL_POLL,
  })

  const indicesQuery = useQuery({
    queryKey: securitiesKeys.indices,
    queryFn: fetchMarketIndices,
    refetchInterval: INDEX_INTERVAL,
    refetchIntervalInBackground: false,
    staleTime: INDEX_INTERVAL,
  })

  // Overlays only count while the socket is up: after a drop the REST snapshot
  // shows through immediately instead of the board freezing on dead ticks.
  const activeBoard = wsConnected ? board : EMPTY_BOARD_OVERLAYS
  const activeIndexOverlays = wsConnected ? indexOverlays : EMPTY_INDEX_OVERLAYS

  const priceMap = useMemo(() => {
    const map: Record<string, PriceBoardRow> = {}
    for (const row of pricesQuery.data?.rows ?? []) {
      const key = row.symbol.toUpperCase()
      map[key] = mergeBoardRow(row, activeBoard.ticks.get(key), activeBoard.books.get(key))
    }
    return map
  }, [pricesQuery.data, activeBoard])

  const indices = useMemo(
    () => mergeIndices(indicesQuery.data ?? [], activeIndexOverlays.messages),
    [indicesQuery.data, activeIndexOverlays],
  )

  const snapshotAt = sourceEpoch(pricesQuery.data?.asOf ?? null)

  const value = useMemo<MarketDataContextValue>(
    () => ({
      priceMap,
      indices,
      // Only "loading" once something is subscribed but no data has landed yet.
      isPriceLoading: symbolsKey.length > 0 && pricesQuery.isLoading,
      isIndicesLoading: indicesQuery.isLoading,
      priceError: pricesQuery.error,
      isRealtime: wsConnected,
      // Newest board time: a live tick's own timestamp, else the snapshot's
      // server-side `as_of`, else when this client received it.
      boardUpdatedAt: newestOf(pricesQuery.dataUpdatedAt, snapshotAt, activeBoard.at),
      boardSource: pricesQuery.data?.source ?? null,
      indicesUpdatedAt: newestOf(indicesQuery.dataUpdatedAt, activeIndexOverlays.at),
      subscribe,
    }),
    [
      priceMap,
      indices,
      symbolsKey,
      pricesQuery.isLoading,
      indicesQuery.isLoading,
      pricesQuery.error,
      snapshotAt,
      indicesQuery.dataUpdatedAt,
      wsConnected,
      pricesQuery.dataUpdatedAt,
      pricesQuery.data?.source,
      activeBoard,
      activeIndexOverlays,
      subscribe,
    ],
  )

  return <MarketDataContext.Provider value={value}>{children}</MarketDataContext.Provider>
}
