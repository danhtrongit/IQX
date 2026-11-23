import { useEffect, useMemo, useRef, useState } from "react"
import type { QueryClient } from "@tanstack/react-query"
import {
  RealtimeClient,
  type IndexMessage,
  type RealtimeMessage,
  type TickMessage,
} from "@/pages/securities/market/realtime"
import type { AdaptedWidgetSnapshot } from "./api"
import {
  VN_AFTERNOON_END_MIN,
  VN_FUTURES_START_MIN,
  getIntradayBoundsForSymbol,
  timeToCompressedSlot,
  type IntradayBounds,
} from "./charts/intraday-axis"
import { isVnRealtimeWidget, marketOverviewKeys } from "./hooks"
import type { GridItem, IndexChartSymbol, WidgetSlug } from "./types"

const BATCH_FLUSH_INTERVAL_MS = 3_000
const MAX_TICK_SUBSCRIPTIONS = 40
const VN_INDEX_CHANNELS: readonly string[] = ["VNINDEX", "VN30", "HNX", "UPCOM"]
const FUTURES_INTRADAY_BOUNDS: IntradayBounds = {
  startMin: VN_FUTURES_START_MIN,
  endMin: VN_AFTERNOON_END_MIN,
}
const BARE_HM_RE = /^(\d{2}):(\d{2})(?::\d{2})?$/

const INDEX_WIDGETS: ReadonlySet<WidgetSlug> = new Set<WidgetSlug>([
  "index_chart",
  "vnindex_impact",
  "derivatives_summary",
  "vn30f_vs_vn30",
  "futures_table",
])

const DERIVATIVE_WIDGETS: ReadonlySet<WidgetSlug> = new Set<WidgetSlug>([
  "index_chart",
  "derivatives_summary",
  "vn30f_vs_vn30",
  "futures_table",
])

const STOCK_TICK_WIDGETS: ReadonlySet<WidgetSlug> = new Set<WidgetSlug>([
  "featured_stocks",
  "market_heatmap",
  "vnindex_impact",
])

function normalizeIndexCode(raw: string): IndexChartSymbol | null {
  const upper = raw.trim().toUpperCase()
  if (upper === "VNINDEX" || upper === "VN-INDEX") return "VNINDEX"
  if (upper === "VN30") return "VN30"
  if (upper === "HNX" || upper === "HNXINDEX" || upper === "HNX-INDEX") return "HNX"
  if (upper === "UPCOM" || upper === "HNXUPCOMINDEX" || upper === "UPCOMINDEX") {
    return "UPCOM"
  }
  if (upper === "VN30F1M") return "VN30F1M"
  return null
}

function normalizeTickPriceToMatchScale(tickPrice: number, existingPrice: number): number {
  if (!Number.isFinite(tickPrice) || tickPrice <= 0) return existingPrice
  if (Number.isFinite(existingPrice) && existingPrice > 0 && tickPrice / existingPrice > 250) {
    return tickPrice / 1000
  }
  return tickPrice
}

/**
 * Formats a realtime WS timestamp into ICT (`Asia/Ho_Chi_Minh`, UTC+7) `"HH:MM"`.
 * Bare `"HH:MM"` / `"HH:MM:SS"` strings are accepted ONLY when anchored without a date/timezone;
 * full ISO timestamps (e.g. `"2026-11-23T03:30:00.000Z"`) are parsed via `Date.parse` and shifted +7h.
 */
export function formatHmFromMessage(time: string | null): string | null {
  if (!time) return null
  const trimmed = time.trim()
  if (!trimmed) return null

  const bareMatch = BARE_HM_RE.exec(trimmed)
  if (bareMatch) {
    const h = Number(bareMatch[1])
    const m = Number(bareMatch[2])
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${bareMatch[1]}:${bareMatch[2]}`
    }
    return null
  }

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed)
    if (!Number.isFinite(numeric)) return null
    const ms = numeric > 1e12 ? numeric : numeric * 1000
    const vn = new Date(ms + 7 * 3_600_000)
    return `${String(vn.getUTCHours()).padStart(2, "0")}:${String(vn.getUTCMinutes()).padStart(2, "0")}`
  }

  const parsed = Date.parse(trimmed.replace(" ", "T"))
  if (!Number.isFinite(parsed)) return null
  const vn = new Date(parsed + 7 * 3_600_000)
  return `${String(vn.getUTCHours()).padStart(2, "0")}:${String(vn.getUTCMinutes()).padStart(2, "0")}`
}

function resolveFrontFuturesCode(queryClient: QueryClient): string | null {
  const derivQueries = queryClient.getQueriesData<AdaptedWidgetSnapshot<"derivatives_summary">>({
    queryKey: marketOverviewKeys.widgetPrefix("derivatives_summary"),
  })
  for (const [, snap] of derivQueries) {
    const code = snap?.data.contractCode?.trim().toUpperCase()
    if (code) return code
  }

  const futuresQueries = queryClient.getQueriesData<AdaptedWidgetSnapshot<"futures_table">>({
    queryKey: marketOverviewKeys.widgetPrefix("futures_table"),
  })
  for (const [, snap] of futuresQueries) {
    const vn30Group = snap?.data.groups.find((g) => g.underlying === "VN30")
    const front = vn30Group?.contracts.find((c) => c.maturity === "1M") ?? vn30Group?.contracts[0]
    const code = front?.code?.trim().toUpperCase()
    if (code) return code
  }

  return null
}

function findFrontFuturesTick(
  queryClient: QueryClient,
  frames: ReadonlyMap<string, TickMessage>,
): TickMessage | undefined {
  const code = resolveFrontFuturesCode(queryClient)
  if (code) {
    const direct = frames.get(code)
    if (direct) return direct
  }
  return frames.get("VN30F1M")
}

function detectMarketOpenFromCache(queryClient: QueryClient): boolean {
  const entries = queryClient.getQueriesData<AdaptedWidgetSnapshot>({
    queryKey: ["market-overview", "widget"],
  })
  for (const [, snapshot] of entries) {
    if (snapshot && isVnRealtimeWidget(snapshot.widget) && snapshot.meta.isMarketOpen) {
      return true
    }
  }
  return false
}

export function collectVisibleStockSymbols(
  queryClient: QueryClient,
  activeSlugs: ReadonlySet<WidgetSlug>,
): string[] {
  const symbols = new Set<string>()

  const push = (sym: string | undefined) => {
    if (!sym || symbols.size >= MAX_TICK_SUBSCRIPTIONS) return
    const upper = sym.trim().toUpperCase()
    if (/^[A-Z0-9]{2,12}$/.test(upper)) {
      symbols.add(upper)
    }
  }

  // Prioritize derivative contract symbols first so a large heatmap never starves futures ticks.
  if (Array.from(DERIVATIVE_WIDGETS).some((slug) => activeSlugs.has(slug))) {
    const derivQueries = queryClient.getQueriesData<AdaptedWidgetSnapshot<"derivatives_summary">>({
      queryKey: marketOverviewKeys.widgetPrefix("derivatives_summary"),
    })
    for (const [, snap] of derivQueries) {
      if (snap?.data.contractCode) push(snap.data.contractCode)
    }

    const futuresQueries = queryClient.getQueriesData<AdaptedWidgetSnapshot<"futures_table">>({
      queryKey: marketOverviewKeys.widgetPrefix("futures_table"),
    })
    for (const [, snap] of futuresQueries) {
      for (const group of snap?.data.groups ?? []) {
        for (const contract of group.contracts) {
          push(contract.code)
        }
      }
    }

    push("VN30F1M")
  }

  if (activeSlugs.has("featured_stocks")) {
    const queries = queryClient.getQueriesData<AdaptedWidgetSnapshot<"featured_stocks">>({
      queryKey: marketOverviewKeys.widgetPrefix("featured_stocks"),
    })
    for (const [, snap] of queries) {
      for (const item of snap?.data.items ?? []) {
        push(item.symbol)
      }
    }
  }

  if (activeSlugs.has("vnindex_impact")) {
    const queries = queryClient.getQueriesData<AdaptedWidgetSnapshot<"vnindex_impact">>({
      queryKey: marketOverviewKeys.widgetPrefix("vnindex_impact"),
    })
    for (const [, snap] of queries) {
      for (const item of snap?.data.gainers ?? []) push(item.symbol)
      for (const item of snap?.data.decliners ?? []) push(item.symbol)
    }
  }

  if (activeSlugs.has("market_heatmap")) {
    const queries = queryClient.getQueriesData<AdaptedWidgetSnapshot<"market_heatmap">>({
      queryKey: marketOverviewKeys.widgetPrefix("market_heatmap"),
    })
    for (const [, snap] of queries) {
      for (const sector of snap?.data.sectors ?? []) {
        for (const stock of sector.stocks) {
          push(stock.symbol)
        }
      }
    }
  }

  return Array.from(symbols).sort()
}

function appendOrUpdateIndexSeries(
  series: readonly { time: string; timestamp?: number; value: number; volume: number | null }[],
  hm: string,
  value: number,
  bounds: IntradayBounds,
): { series: typeof series; changed: boolean } {
  const slot = timeToCompressedSlot(hm, bounds)
  if (slot === null) return { series, changed: false }

  const last = series[series.length - 1]
  if (last) {
    if (hm < last.time) {
      return { series, changed: false }
    }
    if (last.time === hm) {
      if (last.value === value) return { series, changed: false }
      return {
        series: [...series.slice(0, -1), { ...last, value }],
        changed: true,
      }
    }
  }

  return {
    series: [...series, { time: hm, value, volume: null }],
    changed: true,
  }
}

export function patchIndexFrames(
  queryClient: QueryClient,
  frames: ReadonlyMap<IndexChartSymbol, IndexMessage>,
): void {
  if (frames.size === 0) return

  // 1. index_chart cards & intraday active series
  queryClient.setQueriesData<AdaptedWidgetSnapshot<"index_chart">>(
    { queryKey: marketOverviewKeys.widgetPrefix("index_chart") },
    (prev) => {
      if (!prev) return prev
      let touched = false

      const nextCards = prev.data.cards.map((card) => {
        const msg = frames.get(card.code)
        if (!msg || !Number.isFinite(msg.value) || msg.value <= 0) return card
        touched = true
        return {
          ...card,
          price: msg.value,
          change: Number.isFinite(msg.change) ? msg.change : card.change,
          changePct: Number.isFinite(msg.change_percent)
            ? msg.change_percent
            : card.changePct,
          volume: msg.total_volume > 0 ? msg.total_volume : card.volume,
          valueBillion: msg.total_value > 0 ? msg.total_value / 1e9 : card.valueBillion,
        }
      })

      let nextSeries = prev.data.series
      const selectedFrame = frames.get(prev.data.selectedIndex)
      if (
        selectedFrame &&
        prev.data.range === "intraday" &&
        Number.isFinite(selectedFrame.value) &&
        selectedFrame.value > 0
      ) {
        const hm = formatHmFromMessage(selectedFrame.time)
        if (hm) {
          const bounds = getIntradayBoundsForSymbol(prev.data.selectedIndex)
          const updated = appendOrUpdateIndexSeries(
            nextSeries,
            hm,
            selectedFrame.value,
            bounds,
          )
          if (updated.changed) {
            nextSeries = [...updated.series]
            touched = true
          }
        }
      }

      if (!touched) return prev
      return {
        ...prev,
        data: {
          ...prev.data,
          cards: nextCards,
          series: nextSeries,
        },
      }
    },
  )

  // Note: Do NOT overwrite equity-only `market_breadth` counts with DNSE raw index
  // advances/declines (which include ETF/CW/CCQ and leave ceiling/floor stale).
  // The equity-filtered 15s REST aggregator remains authoritative for `market_breadth`.

  // 2. vnindex_impact headline indexChange
  const vnindexFrame = frames.get("VNINDEX")
  if (vnindexFrame && Number.isFinite(vnindexFrame.change)) {
    queryClient.setQueriesData<AdaptedWidgetSnapshot<"vnindex_impact">>(
      { queryKey: marketOverviewKeys.widgetPrefix("vnindex_impact") },
      (prev) => {
        if (!prev || prev.data.indexChange === vnindexFrame.change) return prev
        return {
          ...prev,
          data: {
            ...prev.data,
            indexChange: vnindexFrame.change,
          },
        }
      },
    )
  }

  // 3. VN30 spot updates for derivatives_summary, futures_table, and vn30f_vs_vn30
  const vn30Frame = frames.get("VN30")
  if (vn30Frame && Number.isFinite(vn30Frame.value) && vn30Frame.value > 0) {
    queryClient.setQueriesData<AdaptedWidgetSnapshot<"derivatives_summary">>(
      { queryKey: marketOverviewKeys.widgetPrefix("derivatives_summary") },
      (prev) => {
        if (!prev) return prev
        const nextVn30 = vn30Frame.value
        const nextBasis = Number.isFinite(prev.data.vn30fPrice)
          ? prev.data.vn30fPrice - nextVn30
          : prev.data.basis
        return {
          ...prev,
          data: {
            ...prev.data,
            vn30Price: nextVn30,
            vn30ChangePct: Number.isFinite(vn30Frame.change_percent)
              ? vn30Frame.change_percent
              : prev.data.vn30ChangePct,
            basis: nextBasis,
          },
        }
      },
    )

    queryClient.setQueriesData<AdaptedWidgetSnapshot<"futures_table">>(
      { queryKey: marketOverviewKeys.widgetPrefix("futures_table") },
      (prev) => {
        if (!prev) return prev
        let touched = false
        const nextGroups = prev.data.groups.map((group) => {
          if (group.underlying !== "VN30") return group
          touched = true
          return {
            ...group,
            spotPrice: vn30Frame.value,
            contracts: group.contracts.map((contract) => ({
              ...contract,
              basis: Number.isFinite(contract.price)
                ? contract.price - vn30Frame.value
                : contract.basis,
            })),
          }
        })
        if (!touched) return prev
        return { ...prev, data: { ...prev.data, groups: nextGroups } }
      },
    )

    queryClient.setQueriesData<AdaptedWidgetSnapshot<"vn30f_vs_vn30">>(
      { queryKey: marketOverviewKeys.widgetPrefix("vn30f_vs_vn30") },
      (prev) => {
        if (!prev) return prev
        const nextVn30 = vn30Frame.value
        const nextBasis = Number.isFinite(prev.data.latestVn30f)
          ? prev.data.latestVn30f - nextVn30
          : prev.data.latestBasis

        let nextPoints = prev.data.points
        if (prev.data.range === "intraday") {
          const hm = formatHmFromMessage(vn30Frame.time)
          if (hm && timeToCompressedSlot(hm, FUTURES_INTRADAY_BOUNDS) !== null) {
            const last = nextPoints[nextPoints.length - 1]
            if (!last || hm >= last.time) {
              const carriedVn30f = Number.isFinite(prev.data.latestVn30f)
                ? prev.data.latestVn30f
                : (last?.vn30f ?? null)
              const pointBasis =
                carriedVn30f !== null ? carriedVn30f - nextVn30 : null
              if (last && last.time === hm) {
                nextPoints = [
                  ...nextPoints.slice(0, -1),
                  {
                    ...last,
                    vn30: nextVn30,
                    vn30f: last.vn30f ?? carriedVn30f,
                    basis:
                      (last.vn30f ?? carriedVn30f) !== null
                        ? (last.vn30f ?? carriedVn30f)! - nextVn30
                        : last.basis,
                  },
                ]
              } else {
                nextPoints = [
                  ...nextPoints,
                  {
                    time: hm,
                    vn30: nextVn30,
                    vn30f: carriedVn30f,
                    basis: pointBasis,
                  },
                ]
              }
            }
          }
        }

        return {
          ...prev,
          data: {
            ...prev.data,
            latestVn30: nextVn30,
            latestBasis: nextBasis,
            points: nextPoints,
          },
        }
      },
    )
  }
}

export function patchTickFrames(
  queryClient: QueryClient,
  frames: ReadonlyMap<string, TickMessage>,
): void {
  if (frames.size === 0) return

  // 1. featured_stocks
  queryClient.setQueriesData<AdaptedWidgetSnapshot<"featured_stocks">>(
    { queryKey: marketOverviewKeys.widgetPrefix("featured_stocks") },
    (prev) => {
      if (!prev) return prev
      let touched = false
      const nextItems = prev.data.items.map((row) => {
        const msg = frames.get(row.symbol.toUpperCase())
        if (!msg) return row
        const nextPrice = normalizeTickPriceToMatchScale(msg.price, row.price)
        if (nextPrice === row.price) return row
        touched = true
        const nextChangePct =
          row.refPrice > 0 ? ((nextPrice - row.refPrice) / row.refPrice) * 100 : row.changePct
        return {
          ...row,
          price: nextPrice,
          changePct: nextChangePct,
          isCeiling: row.ceilingPrice > 0 && nextPrice >= row.ceilingPrice - 1e-6,
          isFloor: row.floorPrice > 0 && nextPrice <= row.floorPrice + 1e-6,
        }
      })
      if (!touched) return prev
      return { ...prev, data: { ...prev.data, items: nextItems } }
    },
  )

  // 2. market_heatmap
  queryClient.setQueriesData<AdaptedWidgetSnapshot<"market_heatmap">>(
    { queryKey: marketOverviewKeys.widgetPrefix("market_heatmap") },
    (prev) => {
      if (!prev) return prev
      let touched = false
      const nextSectors = prev.data.sectors.map((sector) => {
        let sectorTouched = false
        const nextStocks = sector.stocks.map((stock) => {
          const msg = frames.get(stock.symbol.toUpperCase())
          if (!msg) return stock
          const nextPrice = normalizeTickPriceToMatchScale(msg.price, stock.price)
          if (nextPrice === stock.price) return stock
          sectorTouched = true
          touched = true
          const nextChangePct =
            stock.refPrice > 0
              ? ((nextPrice - stock.refPrice) / stock.refPrice) * 100
              : stock.changePct
          return {
            ...stock,
            price: nextPrice,
            changePct: nextChangePct,
            isCeiling: stock.ceilingPrice > 0 && nextPrice >= stock.ceilingPrice - 1e-6,
            isFloor: stock.floorPrice > 0 && nextPrice <= stock.floorPrice + 1e-6,
          }
        })
        return sectorTouched ? { ...sector, stocks: nextStocks } : sector
      })
      if (!touched) return prev
      return { ...prev, data: { ...prev.data, sectors: nextSectors } }
    },
  )

  // 3. vnindex_impact
  queryClient.setQueriesData<AdaptedWidgetSnapshot<"vnindex_impact">>(
    { queryKey: marketOverviewKeys.widgetPrefix("vnindex_impact") },
    (prev) => {
      if (!prev) return prev
      let touched = false
      const patchList = (list: typeof prev.data.gainers) =>
        list.map((item) => {
          const msg = frames.get(item.symbol.toUpperCase())
          if (!msg) return item
          const nextPrice = normalizeTickPriceToMatchScale(msg.price, item.price)
          if (nextPrice === item.price) return item
          touched = true
          const nextChangePct =
            item.refPrice > 0
              ? ((nextPrice - item.refPrice) / item.refPrice) * 100
              : item.changePct
          return { ...item, price: nextPrice, changePct: nextChangePct }
        })
      const nextGainers = patchList(prev.data.gainers)
      const nextDecliners = patchList(prev.data.decliners)
      if (!touched) return prev
      return {
        ...prev,
        data: { ...prev.data, gainers: nextGainers, decliners: nextDecliners },
      }
    },
  )

  // 4. derivatives_summary front-month futures tick
  queryClient.setQueriesData<AdaptedWidgetSnapshot<"derivatives_summary">>(
    { queryKey: marketOverviewKeys.widgetPrefix("derivatives_summary") },
    (prev) => {
      if (!prev) return prev
      const msg =
        frames.get(prev.data.contractCode.toUpperCase()) ?? frames.get("VN30F1M")
      if (!msg || !Number.isFinite(msg.price) || msg.price <= 0) return prev
      const nextPrice = normalizeTickPriceToMatchScale(msg.price, prev.data.vn30fPrice)
      const nextVolume =
        msg.total_volume > 0 ? msg.total_volume : prev.data.volumeContracts
      if (nextPrice === prev.data.vn30fPrice && nextVolume === prev.data.volumeContracts) {
        return prev
      }
      const nextChangePct =
        Number.isFinite(prev.data.vn30fRefPrice) && prev.data.vn30fRefPrice > 0
          ? ((nextPrice - prev.data.vn30fRefPrice) / prev.data.vn30fRefPrice) * 100
          : prev.data.vn30fChangePct
      const nextBasis = Number.isFinite(prev.data.vn30Price)
        ? nextPrice - prev.data.vn30Price
        : prev.data.basis
      return {
        ...prev,
        data: {
          ...prev.data,
          vn30fPrice: nextPrice,
          vn30fChangePct: nextChangePct,
          basis: nextBasis,
          volumeContracts: nextVolume,
        },
      }
    },
  )

  // 5. futures_table all visible contracts
  queryClient.setQueriesData<AdaptedWidgetSnapshot<"futures_table">>(
    { queryKey: marketOverviewKeys.widgetPrefix("futures_table") },
    (prev) => {
      if (!prev) return prev
      let touched = false
      const nextGroups = prev.data.groups.map((group) => {
        let groupTouched = false
        const nextContracts = group.contracts.map((contract) => {
          const msg =
            frames.get(contract.code.toUpperCase()) ??
            (contract.displayCode.toUpperCase() === "VN30F1M"
              ? frames.get("VN30F1M")
              : undefined)
          if (!msg || !Number.isFinite(msg.price) || msg.price <= 0) return contract
          const nextPrice = normalizeTickPriceToMatchScale(msg.price, contract.price)
          const nextVolume =
            msg.total_volume > 0 ? msg.total_volume : contract.volumeContracts
          if (nextPrice === contract.price && nextVolume === contract.volumeContracts) {
            return contract
          }
          groupTouched = true
          touched = true
          const nextChangePct =
            Number.isFinite(contract.refPrice) && contract.refPrice > 0
              ? ((nextPrice - contract.refPrice) / contract.refPrice) * 100
              : contract.changePct
          const nextBasis = Number.isFinite(group.spotPrice)
            ? nextPrice - group.spotPrice
            : contract.basis
          return {
            ...contract,
            price: nextPrice,
            changePct: nextChangePct,
            basis: nextBasis,
            volumeContracts: nextVolume,
          }
        })
        return groupTouched ? { ...group, contracts: nextContracts } : group
      })
      if (!touched) return prev
      return { ...prev, data: { ...prev.data, groups: nextGroups } }
    },
  )

  // 6. vn30f_vs_vn30 front-month futures tick & intraday point
  const frontFuturesTick = findFrontFuturesTick(queryClient, frames)
  if (frontFuturesTick && Number.isFinite(frontFuturesTick.price) && frontFuturesTick.price > 0) {
    queryClient.setQueriesData<AdaptedWidgetSnapshot<"vn30f_vs_vn30">>(
      { queryKey: marketOverviewKeys.widgetPrefix("vn30f_vs_vn30") },
      (prev) => {
        if (!prev) return prev
        const nextVn30f = normalizeTickPriceToMatchScale(
          frontFuturesTick.price,
          prev.data.latestVn30f,
        )
        const nextBasis = Number.isFinite(prev.data.latestVn30)
          ? nextVn30f - prev.data.latestVn30
          : prev.data.latestBasis

        let nextPoints = prev.data.points
        if (prev.data.range === "intraday") {
          const hm = formatHmFromMessage(frontFuturesTick.time)
          if (hm && timeToCompressedSlot(hm, FUTURES_INTRADAY_BOUNDS) !== null) {
            const last = nextPoints[nextPoints.length - 1]
            if (!last || hm >= last.time) {
              const carriedVn30 = Number.isFinite(prev.data.latestVn30)
                ? prev.data.latestVn30
                : (last?.vn30 ?? null)
              const pointBasis =
                carriedVn30 !== null ? nextVn30f - carriedVn30 : null
              if (last && last.time === hm) {
                nextPoints = [
                  ...nextPoints.slice(0, -1),
                  {
                    ...last,
                    vn30f: nextVn30f,
                    basis:
                      last.vn30 !== null
                        ? nextVn30f - last.vn30
                        : pointBasis,
                  },
                ]
              } else {
                nextPoints = [
                  ...nextPoints,
                  {
                    time: hm,
                    vn30: carriedVn30,
                    vn30f: nextVn30f,
                    basis: pointBasis,
                  },
                ]
              }
            }
          }
        }

        return {
          ...prev,
          data: {
            ...prev.data,
            latestVn30f: nextVn30f,
            latestBasis: nextBasis,
            points: nextPoints,
          },
        }
      },
    )

    // 7. index_chart VN30F1M card & intraday active series
    queryClient.setQueriesData<AdaptedWidgetSnapshot<"index_chart">>(
      { queryKey: marketOverviewKeys.widgetPrefix("index_chart") },
      (prev) => {
        if (!prev) return prev
        let touched = false
        let resolvedPrice = frontFuturesTick.price

        const nextCards = prev.data.cards.map((card) => {
          if (card.code !== "VN30F1M") return card
          const nextPrice = normalizeTickPriceToMatchScale(frontFuturesTick.price, card.price)
          resolvedPrice = nextPrice
          const nextVol =
            frontFuturesTick.total_volume > 0 ? frontFuturesTick.total_volume : card.volume
          if (nextPrice === card.price && nextVol === card.volume) return card
          touched = true
          const nextChange =
            Number.isFinite(card.refPrice) && card.refPrice > 0
              ? nextPrice - card.refPrice
              : card.change
          const nextChangePct =
            Number.isFinite(card.refPrice) && card.refPrice > 0
              ? ((nextPrice - card.refPrice) / card.refPrice) * 100
              : card.changePct
          return {
            ...card,
            price: nextPrice,
            change: nextChange,
            changePct: nextChangePct,
            volume: nextVol,
          }
        })

        let nextSeries = prev.data.series
        if (prev.data.selectedIndex === "VN30F1M" && prev.data.range === "intraday") {
          const hm = formatHmFromMessage(frontFuturesTick.time)
          if (hm && Number.isFinite(resolvedPrice) && resolvedPrice > 0) {
            const updated = appendOrUpdateIndexSeries(
              nextSeries,
              hm,
              resolvedPrice,
              FUTURES_INTRADAY_BOUNDS,
            )
            if (updated.changed) {
              nextSeries = [...updated.series]
              touched = true
            }
          }
        }

        if (!touched) return prev
        return {
          ...prev,
          data: {
            ...prev.data,
            cards: nextCards,
            series: nextSeries,
          },
        }
      },
    )
  }
}

/**
 * Reuses the existing `/api/v2/market-data/ws` `RealtimeClient` protocol to stream
 * incremental updates for visible widgets on the active tab, flushing buffered deltas
 * into TanStack Query cache in 3-second batches (Spec Section 4.2).
 * Automatically disconnects off-hours or when disabled/unmounted.
 */
export function useMarketOverviewRealtime(
  activeItems: readonly GridItem[],
  queryClient: QueryClient,
  enabled: boolean,
): void {
  const activeSlugsKey = useMemo(() => {
    const slugs = Array.from(new Set(activeItems.map((item) => item.widget))).sort()
    return slugs.join(",")
  }, [activeItems])

  const activeSlugs = useMemo(
    () => new Set<WidgetSlug>(activeItems.map((item) => item.widget)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSlugsKey],
  )

  const [isMarketOpen, setIsMarketOpen] = useState<boolean>(() =>
    detectMarketOpenFromCache(queryClient),
  )
  const [tickSymbolsKey, setTickSymbolsKey] = useState<string>("")

  // Observe TanStack Query cache updates via deferred microtask so parent state never updates
  // synchronously while child ConnectedWidgetCardBase is rendering (fixes React setState-in-render).
  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let queued = false

    const syncFromCache = () => {
      queued = false
      if (disposed) return

      const open = detectMarketOpenFromCache(queryClient)
      setIsMarketOpen((prev) => (prev === open ? prev : open))

      const needsTicks =
        Array.from(STOCK_TICK_WIDGETS).some((slug) => activeSlugs.has(slug)) ||
        Array.from(DERIVATIVE_WIDGETS).some((slug) => activeSlugs.has(slug))

      const nextTicks = needsTicks
        ? collectVisibleStockSymbols(queryClient, activeSlugs).join(",")
        : ""
      setTickSymbolsKey((prev) => (prev === nextTicks ? prev : nextTicks))
    }

    const scheduleSync = () => {
      if (disposed || queued) return
      queued = true
      queueMicrotask(syncFromCache)
    }

    scheduleSync()
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "observerAdded" || event.type === "observerRemoved") {
        return
      }
      scheduleSync()
    })
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [enabled, queryClient, activeSlugs])

  const needsIndexChannel = useMemo(
    () => Array.from(INDEX_WIDGETS).some((slug) => activeSlugs.has(slug)),
    [activeSlugs],
  )

  const shouldConnect =
    enabled && isMarketOpen && (needsIndexChannel || tickSymbolsKey.length > 0)

  const clientRef = useRef<RealtimeClient | null>(null)
  const pendingIndexRef = useRef<Map<IndexChartSymbol, IndexMessage>>(new Map())
  const pendingTickRef = useRef<Map<string, TickMessage>>(new Map())

  // Lifecycle of socket connection & 3-second batch flusher.
  useEffect(() => {
    const pendingIndex = pendingIndexRef.current
    const pendingTick = pendingTickRef.current

    if (!shouldConnect || typeof WebSocket === "undefined") {
      if (clientRef.current) {
        clientRef.current.disconnect()
        clientRef.current = null
      }
      pendingIndex.clear()
      pendingTick.clear()
      return
    }

    const client = new RealtimeClient()
    clientRef.current = client
    client.connect()

    const flushTimer = window.setInterval(() => {
      if (pendingIndex.size > 0) {
        const indexBatch = new Map(pendingIndex)
        pendingIndex.clear()
        patchIndexFrames(queryClient, indexBatch)
      }
      if (pendingTick.size > 0) {
        const tickBatch = new Map(pendingTick)
        pendingTick.clear()
        patchTickFrames(queryClient, tickBatch)
      }
    }, BATCH_FLUSH_INTERVAL_MS)

    return () => {
      window.clearInterval(flushTimer)
      pendingIndex.clear()
      pendingTick.clear()
      client.disconnect()
      if (clientRef.current === client) {
        clientRef.current = null
      }
    }
  }, [shouldConnect, queryClient])

  // Subscribe ONLY to needed channels for the currently visible widgets.
  useEffect(() => {
    if (!shouldConnect) return
    const client = clientRef.current
    if (!client) return

    const unsubscribers: Array<() => void> = []

    const handleMessage = (message: RealtimeMessage) => {
      if (message.type === "index") {
        const code = normalizeIndexCode(message.code)
        if (code) {
          pendingIndexRef.current.set(code, message)
        }
      } else if (message.type === "tick") {
        pendingTickRef.current.set(message.symbol.toUpperCase(), message)
      }
    }

    if (needsIndexChannel) {
      for (const indexCode of VN_INDEX_CHANNELS) {
        unsubscribers.push(client.on(indexCode, "index", handleMessage))
      }
    }

    if (tickSymbolsKey.length > 0) {
      const symbols = tickSymbolsKey.split(",").filter(Boolean)
      for (const sym of symbols) {
        unsubscribers.push(client.on(sym, "tick", handleMessage))
      }
    }

    return () => {
      for (const unsub of unsubscribers) {
        unsub()
      }
    }
  }, [shouldConnect, needsIndexChannel, tickSymbolsKey])
}
