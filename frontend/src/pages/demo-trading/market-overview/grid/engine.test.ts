import { createElement } from "react"
import { QueryClient } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { AdaptedWidgetSnapshot } from "../api"
import { marketOverviewKeys } from "../hooks"
import {
  collectVisibleStockSymbols,
  formatHmFromMessage,
  patchIndexFrames,
  patchTickFrames,
} from "../realtime-bridge"
import {
  CATALOG_GROUPS,
  CATALOG_GROUP_LABELS,
  MARKET_TEMPLATE_FALLBACK,
  WIDGET_CATALOG,
  WIDGET_LIST,
  matchesWidgetSearch,
  normalizeVi,
} from "../catalog"
import {
  UNICODE_MINUS,
  buildDuplicatePageName,
  formatBillion,
  formatExpiryRemaining,
  formatFuturesPrice,
  formatIndexPrice,
  formatInt,
  formatNum,
  formatPct,
  formatRelativeTimeVi,
  formatSessionLabel,
  formatSigned,
  formatStockPrice,
  nextDefaultPageName,
  priceTone,
  signedTone,
} from "../format"
import {
  INTRADAY_CHART_EPOCH_BASE,
  VN_AFTERNOON_END_MIN,
  VN_EXTENDED_AFTERNOON_END_MIN,
  VN_FUTURES_START_MIN,
  VN_MORNING_START_MIN,
  buildIntradayHistogramData,
  buildIntradaySeriesData,
  chartTimeToSlot,
  compressedSlotToLabel,
  formatIntradayChartTime,
  isWhitespaceData,
  timeToChartCoord,
  timeToCompressedSlot,
} from "../charts/intraday-axis"
import { RrgSvg } from "../charts/rrg-svg"
import { SparklineSvg } from "../charts/sparkline-svg"
import {
  layoutSectorTreemap,
  layoutStockTreemap,
  resolveHeatmapTone,
  squarify,
} from "../charts/treemap-layout"
import type {
  GridItem,
  GridRect,
  HeatmapSectorGroup,
  RrgSectorTrail,
} from "../types"
import {
  GRID_COLS,
  MAX_WIDGET_HEIGHT,
  compactLayout,
  computeScaleK,
  expandWidgetIntoHole,
  findEmptyHoles,
  findExpandableNeighbor,
  firstFitPosition,
  getGridMaxY,
  getRowPruneOrder,
  packLayout,
  placeInEmptySlot,
  rectsOverlap,
  sortFuturesGroups,
} from "./engine"

function assertNoOverlaps(items: readonly GridRect[]) {
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      expect(rectsOverlap(items[i], items[j])).toBe(false)
    }
  }
}

function makeItem(
  uid: string,
  x: number,
  y: number,
  w: number,
  h: number,
  widget: GridItem["widget"] = "market_breadth",
): GridItem {
  return {
    uid,
    widget,
    x,
    y,
    w,
    h,
    state: {},
  } as GridItem
}

describe("market-overview grid engine", () => {
  it("enforces zero-overlap invariant and gravity pull-up in compactLayout", () => {
    const raw: GridItem[] = [
      makeItem("a", 0, 5, 6, 3), // floating down at y=5 -> should pull up to y=0
      makeItem("b", 0, 6, 6, 4), // overlapping a -> pushed below a, pulls to y=3
      makeItem("c", 6, 10, 6, 2), // right side floating -> pulls up to y=0
    ]

    const compacted = compactLayout(raw)
    assertNoOverlaps(compacted)

    const byUid = new Map(compacted.map((it) => [it.uid, it]))
    expect(byUid.get("a")?.y).toBe(0)
    expect(byUid.get("b")?.y).toBe(3)
    expect(byUid.get("c")?.y).toBe(0)

    // Input must remain immutable
    expect(raw[0].y).toBe(5)
  })

  it("keeps fixedUid anchored while pushing colliding items down without jumping over", () => {
    const raw: GridItem[] = [
      makeItem("top", 0, 0, 6, 3),
      makeItem("moved", 0, 2, 6, 4), // dragged to overlap "top"
      makeItem("below", 0, 4, 6, 3),
    ]

    const compacted = compactLayout(raw, "moved")
    assertNoOverlaps(compacted)

    const byUid = new Map(compacted.map((it) => [it.uid, it]))
    expect(byUid.get("moved")?.y).toBe(2)
    expect(byUid.get("top")?.y).toBe(6)
    expect(byUid.get("below")?.y).toBe(9)
  })

  it("fixes HTML right-edge narrow hole bug in placeInEmptySlot (clamps x=8, w=4 for minW=4)", () => {
    const existing: GridItem[] = [
      makeItem("left", 0, 0, 10, 4, "index_chart"),
    ]
    const narrowRightHole = { x: 10, y: 0, w: 2, h: 4 }
    const meta = WIDGET_CATALOG.market_heatmap // minW: 4, minH: 4

    const result = placeInEmptySlot(existing, narrowRightHole, meta, "new_heat")
    assertNoOverlaps(result)

    const placed = result.find((it) => it.uid === "new_heat")
    expect(placed).toBeDefined()
    expect(placed!.w).toBe(4)
    expect(placed!.w).toBeGreaterThanOrEqual(meta.minW)
    expect(placed!.x).toBe(8)
    expect(placed!.x + placed!.w).toBeLessThanOrEqual(GRID_COLS)
    expect(placed!.h).toBe(4)
    expect(placed!.h).toBeLessThanOrEqual(MAX_WIDGET_HEIGHT)
  })

  it("handles placeInEmptySlot on bottom end slot using default size", () => {
    const existing: GridItem[] = [makeItem("a", 0, 0, 12, 4)]
    const result = placeInEmptySlot(
      existing,
      { x: 0, y: 4, w: 12, h: 2, isEnd: true },
      WIDGET_CATALOG.sector_rotation,
      "rrg_1",
    )
    assertNoOverlaps(result)
    const placed = result.find((it) => it.uid === "rrg_1")
    expect(placed).toMatchObject({ x: 0, y: 4, w: 6, h: 7 })
  })

  it("detects maximal empty holes with area >= 2, finds expandable neighbor, and expands cleanly", () => {
    const items: GridItem[] = [
      makeItem("left", 0, 0, 4, 6),
      makeItem("bottom", 0, 6, 12, 3),
    ]

    const holes = findEmptyHoles(items)
    expect(holes).toEqual([{ x: 4, y: 0, w: 8, h: 6 }])

    const neighbor = findExpandableNeighbor(items, holes[0])
    expect(neighbor).not.toBeNull()
    expect(neighbor!.item.uid).toBe("left")
    expect(neighbor!.nextRect).toEqual({ x: 0, w: 12 })

    const expanded = expandWidgetIntoHole(items, "left", holes[0])
    assertNoOverlaps(expanded)
    expect(findEmptyHoles(expanded)).toEqual([])
    expect(expanded.find((it) => it.uid === "left")).toMatchObject({ x: 0, y: 0, w: 12, h: 6 })
  })

  it("ignores 1x1 holes and finds right-adjacent expandable neighbors", () => {
    const items: GridItem[] = [
      makeItem("a", 0, 0, 5, 1),
      makeItem("b", 6, 0, 6, 1), // leaves a 1x1 gap at x=5, y=0 -> area 1 < 2
      makeItem("right", 4, 1, 8, 4), // leaves 4x4 hole on left at x=0, y=1
    ]

    const holes = findEmptyHoles(items)
    expect(holes).toEqual([{ x: 0, y: 1, w: 4, h: 4 }])

    const neighbor = findExpandableNeighbor(items, holes[0])
    expect(neighbor).not.toBeNull()
    expect(neighbor!.item.uid).toBe("right")
    expect(neighbor!.nextRect).toEqual({ x: 0, w: 12 })

    const expanded = expandWidgetIntoHole(items, "right", holes[0])
    assertNoOverlaps(expanded)
    expect(expanded.find((it) => it.uid === "right")).toMatchObject({ x: 0, y: 1, w: 12, h: 4 })
  })

  it("packLayout eliminates all internal holes while preserving widget sizes", () => {
    const sparse: GridItem[] = [
      makeItem("a", 0, 0, 4, 4),
      makeItem("b", 8, 0, 4, 4), // 4x4 hole in middle
      makeItem("c", 0, 4, 4, 4),
      makeItem("d", 4, 4, 6, 4),
      makeItem("e", 0, 8, 6, 4),
    ]

    expect(findEmptyHoles(sparse).length).toBeGreaterThan(0)

    const packed = packLayout(sparse)
    assertNoOverlaps(packed)
    expect(findEmptyHoles(packed)).toEqual([])

    const sizeMap = new Map(sparse.map((it) => [it.uid, `${it.w}x${it.h}`]))
    for (const item of packed) {
      expect(`${item.w}x${item.h}`).toBe(sizeMap.get(item.uid))
    }
  })

  it("validates MARKET_TEMPLATE_FALLBACK is 13 widgets, 12x38, zero overlaps, zero holes", () => {
    const items = MARKET_TEMPLATE_FALLBACK.items
    expect(items).toHaveLength(13)
    expect(getGridMaxY(items)).toBe(38)
    assertNoOverlaps(items)
    expect(findEmptyHoles(items)).toEqual([])
    expect(firstFitPosition(items, 4, 3)).toEqual({ x: 0, y: 38 })
  })

  it("computes computeScaleK cleanly for desktop and narrow modes", () => {
    expect(computeScaleK(300, 300, 4, 4, 80, true)).toBe(1)
    // Exact default size -> k = 1
    const cellW = 100
    const defW = 4 * cellW + 3 * 12
    const defH = 4 * 56 + 3 * 12
    expect(computeScaleK(defW, defH, 4, 4, cellW, false)).toBeCloseTo(1, 5)
    // Very tiny box -> clamped at 0.86
    expect(computeScaleK(100, 100, 8, 8, cellW, false)).toBe(0.86)
    // Huge box -> clamped at 1.25
    expect(computeScaleK(2000, 2000, 4, 4, cellW, false)).toBe(1.25)
  })

  it("computes getRowPruneOrder for vnindex_impact, sector_performance, futures_table, and generic", () => {
    // vnindex_impact: symmetric smallest-impact from both ends (8 gainers + 8 decliners)
    const impactOrder = getRowPruneOrder("vnindex_impact", 16, {
      gainerCount: 8,
      declinerCount: 8,
    })
    expect(impactOrder.slice(0, 4)).toEqual([7, 8, 6, 9])
    expect(impactOrder.slice(-2)).toEqual([0, 15])

    // sector_performance (price tab): middle-ranked first keeping extremes
    const sectorPriceOrder = getRowPruneOrder("sector_performance", 6, { tab: "price" })
    expect(sectorPriceOrder.slice(0, 2)).toEqual([2, 3])
    expect(sectorPriceOrder.slice(-2)).toEqual([0, 5])

    // sector_performance (flow tab): bottom-up
    expect(getRowPruneOrder("sector_performance", 5, { tab: "flow" })).toEqual([4, 3, 2, 1, 0])

    // futures_table: VN100 contracts -> VN100 header -> VN30F2Q -> VN30F1Q -> VN30F2M -> VN30F1M
    const futuresOrder = getRowPruneOrder("futures_table", 7, {
      futuresRows: [
        { underlying: "VN30", maturity: "1M" },
        { underlying: "VN30", maturity: "2M" },
        { underlying: "VN30", maturity: "1Q" },
        { underlying: "VN30", maturity: "2Q" },
        { underlying: "VN100", isGroupHeader: true },
        { underlying: "VN100", maturity: "1M" },
        { underlying: "VN100", maturity: "2M" },
      ],
    })
    expect(futuresOrder).toEqual([6, 5, 4, 3, 2, 1, 0])

    // generic table: bottom-up
    expect(getRowPruneOrder("featured_stocks", 4)).toEqual([3, 2, 1, 0])
  })
})

describe("market-overview catalog and Vietnamese search", () => {
  it("exposes 16 canonical widgets across 6 ordered groups", () => {
    expect(WIDGET_LIST).toHaveLength(16)
    expect(CATALOG_GROUPS.map((g) => g.label)).toEqual([
      "Chỉ số",
      "Cổ phiếu",
      "Ngành",
      "Phái sinh",
      "Thế giới",
      "Sự kiện và tin",
    ])
    expect(WIDGET_LIST.filter((w) => w.inMarketTemplate)).toHaveLength(13)
  })

  it("normalizes Vietnamese diacritics and đ/Đ accurately", () => {
    expect(normalizeVi("Độ rộng thị trường")).toBe("do rong thi truong")
    expect(normalizeVi("Khối ngoại và Tự doanh")).toBe("khoi ngoai va tu doanh")
    expect(normalizeVi("Hàng hoá & tỷ giá")).toBe("hang hoa & ty gia")
  })

  it("matches widget search queries including fixed foreign/tự doanh aliases, basis, and vàng", () => {
    const search = (q: string) =>
      WIDGET_LIST.filter((w) =>
        matchesWidgetSearch(w, CATALOG_GROUP_LABELS[w.group], q),
      ).map((w) => w.id)

    expect(search("khoi ngoai")).toContain("foreign_flow")
    expect(search("tu doanh")).toContain("foreign_flow")
    expect(search("basis")).toEqual(
      expect.arrayContaining(["derivatives_summary", "vn30f_vs_vn30", "futures_table"]),
    )
    expect(search("vang")).toContain("commodities_fx")
    expect(search("do rong")).toEqual(["market_breadth"])
    expect(search("khong-ton-tai-xyz")).toEqual([])
  })
})

describe("market-overview Vietnamese formatting & page naming", () => {
  it("formats Vietnamese numbers, Unicode minus, prices, percentages, and expiry copy", () => {
    expect(formatNum(1703.01, 2)).toBe("1.703,01")
    expect(formatNum(-23.71, 2)).toBe(`${UNICODE_MINUS}23,71`)
    expect(formatNum(-0.001, 2)).toBe("0,00")
    expect(formatSigned(5.84, 2)).toBe("+5,84")
    expect(formatSigned(-5.84, 2)).toBe(`${UNICODE_MINUS}5,84`)
    expect(formatSigned(0, 2)).toBe("0,00")
    expect(formatPct(-1.73)).toBe(`${UNICODE_MINUS}1,73%`)
    expect(formatPct(1.35)).toBe("+1,35%")
    expect(formatBillion(17454, 0)).toBe("17.454 tỷ")
    expect(formatBillion(-215.3)).toBe(`${UNICODE_MINUS}215,3 tỷ`)
    expect(formatIndexPrice(1806.54)).toBe("1.806,54")
    expect(formatStockPrice(20.35)).toBe("20,35")
    expect(formatFuturesPrice(1800.7)).toBe("1.800,7")
    expect(formatInt(212400)).toBe("212.400")
    expect(formatSessionLabel("2026-11-18")).toBe("Phiên 18/11")
    expect(formatExpiryRemaining(0)).toBe("hôm nay")
    expect(formatExpiryRemaining(-1)).toBe("hôm nay")
    expect(formatExpiryRemaining(12)).toBe("12")

    const now = Date.parse("2026-11-19T10:00:00+07:00")
    expect(formatRelativeTimeVi("2026-11-19T09:59:30+07:00", now)).toBe("Vừa xong")
    expect(formatRelativeTimeVi("2026-11-19T09:45:00+07:00", now)).toBe("15 phút")
    expect(formatRelativeTimeVi("2026-11-19T07:00:00+07:00", now)).toBe("3 giờ")
  })

  it("determines priceTone and signedTone accurately", () => {
    expect(priceTone(55.6, 52.0, 55.6, 48.4)).toBe("ce")
    expect(priceTone(48.4, 52.0, 55.6, 48.4)).toBe("fl")
    expect(priceTone(53.0, 52.0, 55.6, 48.4)).toBe("up")
    expect(priceTone(51.3, 52.0, 55.6, 48.4)).toBe("dn")
    expect(priceTone(52.0, 52.0, 55.6, 48.4)).toBe("ref")

    expect(signedTone(0.1)).toBe("up")
    expect(signedTone(-0.1)).toBe("dn")
    expect(signedTone(0)).toBe("ref")
  })

  it("truncates duplicate page names to <= 30 chars and finds lowest unused Trang N", () => {
    expect(buildDuplicatePageName("Trang 1")).toBe("Trang 1 (bản sao)")
    const longName = "Theo dõi danh mục ngân hàng và chứng khoán"
    const duplicated = buildDuplicatePageName(longName)
    expect(Array.from(duplicated).length).toBeLessThanOrEqual(30)
    expect(duplicated.endsWith(" (bản sao)")).toBe(true)

    expect(nextDefaultPageName([])).toBe("Trang 1")
    expect(nextDefaultPageName(["Trang 1", "Trang 3"])).toBe("Trang 2")
    expect(nextDefaultPageName(["Trang 1", "Trang 2"])).toBe("Trang 3")
  })
})

describe("market-overview intraday axis compression & whitespace gaps", () => {
  it("compresses 11:30 -> 13:00 monotonically with exact 30-min afternoon alignment and supports 08:45 / 15:00 bounds", () => {
    const slot1130 = timeToCompressedSlot("11:30")
    const slot1300 = timeToCompressedSlot("13:00")
    expect(slot1130).toBe(150)
    expect(slot1300).toBe(151)
    expect(timeToCompressedSlot("12:15")).toBeNull()

    const coord0900 = timeToChartCoord("09:00")!
    const coord1130 = timeToChartCoord("11:30")!
    const coord1300 = timeToChartCoord("13:00")!
    const coord1330 = timeToChartCoord("13:30")!
    const coord1400 = timeToChartCoord("14:00")!
    const coord1430 = timeToChartCoord("14:30")!
    const coord1445 = timeToChartCoord("14:45")!

    // Strict monotonicity across lunch with zero visual gap (1s separation)
    expect(coord1130 - INTRADAY_CHART_EPOCH_BASE).toBe(150 * 60)
    expect(coord1300 - coord1130).toBe(1)
    // Afternoon 30-min ticks land on exact 1800s multiples (zero 13:29 / 13:59 / 14:29 drift!)
    expect(coord1330 - INTRADAY_CHART_EPOCH_BASE).toBe(180 * 60)
    expect(coord1400 - INTRADAY_CHART_EPOCH_BASE).toBe(210 * 60)
    expect(coord1430 - INTRADAY_CHART_EPOCH_BASE).toBe(240 * 60)
    expect(coord1445 - INTRADAY_CHART_EPOCH_BASE).toBe(255 * 60)

    expect(coord0900).toBe(INTRADAY_CHART_EPOCH_BASE)
    expect(chartTimeToSlot(coord1300)).toBe(151)
    expect(chartTimeToSlot(coord1330)).toBe(181)
    expect(formatIntradayChartTime(coord1130)).toBe("11:30")
    expect(formatIntradayChartTime(coord1300)).toBe("13:00")
    expect(formatIntradayChartTime(coord1330)).toBe("13:30")
    expect(formatIntradayChartTime(coord1400)).toBe("14:00")
    expect(formatIntradayChartTime(coord1430)).toBe("14:30")
    expect(formatIntradayChartTime(coord1445)).toBe("14:45")
    expect(compressedSlotToLabel(0)).toBe("09:00")
    expect(compressedSlotToLabel(256)).toBe("14:45")

    // Futures 08:45..08:59 pre-open & HNX/UPCOM 14:46..15:00 extended close
    const futuresBounds = { startMin: VN_FUTURES_START_MIN, endMin: VN_AFTERNOON_END_MIN }
    expect(timeToCompressedSlot("08:45")).toBeNull()
    expect(timeToCompressedSlot("08:45", futuresBounds)).toBe(-15)
    const coord0845 = timeToChartCoord("08:45", futuresBounds)!
    expect(coord0845 - INTRADAY_CHART_EPOCH_BASE).toBe(-15 * 60)
    expect(formatIntradayChartTime(coord0845)).toBe("08:45")
    expect(chartTimeToSlot(coord0845)).toBe(-15)

    const extendedBounds = { startMin: VN_MORNING_START_MIN, endMin: VN_EXTENDED_AFTERNOON_END_MIN }
    expect(timeToCompressedSlot("15:00")).toBeNull()
    expect(timeToCompressedSlot("15:00", extendedBounds)).toBe(271)
    const coord1500 = timeToChartCoord("15:00", extendedBounds)!
    expect(coord1500 - INTRADAY_CHART_EPOCH_BASE).toBe(270 * 60)
    expect(formatIntradayChartTime(coord1500)).toBe("15:00")
    expect(chartTimeToSlot(coord1500)).toBe(271)
  })

  it("inserts Lightweight Charts whitespace points for missing interior minutes without lunch gap", () => {
    const series = buildIntradaySeriesData([
      { time: "09:00", value: 1700 },
      { time: "09:01", value: 1701 },
      { time: "09:04", value: 1704 },
    ])

    expect(series).toHaveLength(5) // 09:00, 09:01, 09:02 (ws), 09:03 (ws), 09:04
    expect(isWhitespaceData(series[0])).toBe(false)
    expect(isWhitespaceData(series[1])).toBe(false)
    expect(isWhitespaceData(series[2])).toBe(true)
    expect(isWhitespaceData(series[3])).toBe(true)
    expect(isWhitespaceData(series[4])).toBe(false)
    expect(formatIntradayChartTime(Number(series[2].time))).toBe("09:02")

    // Adjacent across lunch -> NO whitespace injected between 11:30 and 13:00
    const acrossLunch = buildIntradaySeriesData([
      { time: "11:29", value: 1710 },
      { time: "11:30", value: 1711 },
      { time: "13:00", value: 1712 },
      { time: "13:01", value: 1713 },
    ])
    expect(acrossLunch).toHaveLength(4)
    expect(acrossLunch.every((pt) => !isWhitespaceData(pt))).toBe(true)

    // Pre-open futures points retained when startMin = 08:45
    const futuresSeries = buildIntradaySeriesData(
      [
        { time: "08:45", value: 1800.1 },
        { time: "09:00", value: 1802.0 },
      ],
      { startMin: VN_FUTURES_START_MIN, stepMinutes: 15 },
    )
    expect(futuresSeries).toHaveLength(2)
    expect(formatIntradayChartTime(Number(futuresSeries[0].time))).toBe("08:45")

    // Histogram also inserts whitespace gaps
    const hist = buildIntradayHistogramData([
      { time: "10:00", value: 500, color: "var(--mo-up)" },
      { time: "10:02", value: 600, color: "var(--mo-dn)" },
    ])
    expect(hist).toHaveLength(3)
    expect(isWhitespaceData(hist[1])).toBe(true)
  })
})

describe("market-overview realtime WS ICT parsing & cache patchers ([H1], [H2], [H5])", () => {
  it("converts ISO UTC timestamps to ICT (+7h) and only accepts bare anchored HH:mm", () => {
    // 03:30 UTC === 10:30 ICT (must NOT match "03:30" via unanchored regex!)
    expect(formatHmFromMessage("2026-11-23T03:30:00.000Z")).toBe("10:30")
    expect(formatHmFromMessage("2026-11-23T07:45:00Z")).toBe("14:45")
    expect(formatHmFromMessage("2026-11-23T10:15:00+07:00")).toBe("10:15")
    expect(formatHmFromMessage("09:15")).toBe("09:15")
    expect(formatHmFromMessage("13:05:30")).toBe("13:05")
    expect(formatHmFromMessage(null)).toBeNull()
    expect(formatHmFromMessage("not-a-time")).toBeNull()
  })

  it("patches index_chart (ignoring out-of-order frames), vnindex_impact, vn30f_vs_vn30, and futures_table without corrupting market_breadth", () => {
    const qc = new QueryClient()
    const baseMeta = {
      asOf: "2026-11-23T10:00:00+07:00",
      sessionDate: "2026-11-23",
      isMarketOpen: true,
      stale: false,
    }

    const breadthSnap: AdaptedWidgetSnapshot<"market_breadth"> = {
      widget: "market_breadth",
      meta: baseMeta,
      data: {
        sessionDate: "2026-11-23",
        exchanges: [
          { exchange: "HOSE", advancing: 210, unchanged: 50, declining: 100, ceiling: 15, floor: 3, total: 360 },
        ],
      },
    }
    const indexSnap: AdaptedWidgetSnapshot<"index_chart"> = {
      widget: "index_chart",
      meta: baseMeta,
      data: {
        selectedIndex: "VNINDEX",
        range: "intraday",
        sessionDate: "2026-11-23",
        isMarketOpen: true,
        refPrice: 1690,
        cards: [
          { code: "VNINDEX", name: "VN-Index", price: 1700, refPrice: 1690, change: 10, changePct: 0.59, volume: 100, valueBillion: 1000, sparkline: [] },
          { code: "VN30F1M", name: "VN30F1M", price: 1800, refPrice: 1790, change: 10, changePct: 0.56, volume: 50_000, valueBillion: 9000, sparkline: [] },
        ],
        series: [{ time: "10:20", value: 1700, volume: 100 }],
      },
    }
    const impactSnap: AdaptedWidgetSnapshot<"vnindex_impact"> = {
      widget: "vnindex_impact",
      meta: baseMeta,
      data: {
        sessionDate: "2026-11-23",
        indexChange: 10,
        totalPositiveImpact: 12,
        totalNegativeImpact: -2,
        gainers: [],
        decliners: [],
      },
    }
    const fvsSnap: AdaptedWidgetSnapshot<"vn30f_vs_vn30"> = {
      widget: "vn30f_vs_vn30",
      meta: baseMeta,
      data: {
        sessionDate: "2026-11-23",
        range: "intraday",
        latestVn30: 1800,
        latestVn30f: 1805,
        latestBasis: 5,
        points: [{ time: "10:20", vn30: 1800, vn30f: 1805, basis: 5 }],
      },
    }
    const futuresSnap: AdaptedWidgetSnapshot<"futures_table"> = {
      widget: "futures_table",
      meta: baseMeta,
      data: {
        sessionDate: "2026-11-23",
        groups: [
          {
            underlying: "VN30",
            spotPrice: 1800,
            contracts: [
              {
                code: "VN30F2612",
                displayCode: "VN30F2M",
                underlying: "VN30",
                maturity: "2M",
                expiryDate: "2026-12-17",
                remainingSessions: 15,
                price: 1808,
                refPrice: 1800,
                changePct: 0.44,
                basis: 8,
                volumeContracts: 1000,
                valueBillion: 180,
                foreignNetBillion: 2,
              },
              {
                code: "VN30F2611",
                displayCode: "VN30F1M",
                underlying: "VN30",
                maturity: "1M",
                expiryDate: "2026-11-19",
                remainingSessions: 1,
                price: 1805,
                refPrice: 1795,
                changePct: 0.56,
                basis: 5,
                volumeContracts: 50_000,
                valueBillion: 9000,
                foreignNetBillion: 10,
              },
            ],
          },
        ],
      },
    }

    qc.setQueryData(marketOverviewKeys.widget("market_breadth", "default"), breadthSnap)
    qc.setQueryData(marketOverviewKeys.widget("index_chart", "index=VNINDEX&range=intraday"), indexSnap)
    qc.setQueryData(marketOverviewKeys.widget("vnindex_impact", "default"), impactSnap)
    qc.setQueryData(marketOverviewKeys.widget("vn30f_vs_vn30", "range=intraday"), fvsSnap)
    qc.setQueryData(marketOverviewKeys.widget("futures_table", "default"), futuresSnap)

    // Verify canonical futures ordering shared between registry and widget ([H5])
    const sorted = sortFuturesGroups(futuresSnap.data.groups)
    expect(sorted[0].contracts.map((c) => c.maturity)).toEqual(["1M", "2M"])

    // Verify collectVisibleStockSymbols picks up all futures_table contract codes
    const symbols = collectVisibleStockSymbols(qc, new Set(["futures_table", "vn30f_vs_vn30"]))
    expect(symbols).toEqual(expect.arrayContaining(["VN30F2611", "VN30F2612", "VN30F1M"]))

    // Patch index frames: VNINDEX with 03:30Z (= 10:30 ICT) + VN30 spot update
    patchIndexFrames(
      qc,
      new Map([
        [
          "VNINDEX",
          {
            type: "index",
            code: "VNINDEX",
            value: 1708.5,
            change: 18.5,
            change_percent: 1.09,
            total_volume: 500_000,
            total_value: 12_000_000_000_000,
            advances: 999,
            declines: 1,
            nochange: 0,
            time: "2026-11-23T03:30:00.000Z",
          },
        ],
        [
          "VN30",
          {
            type: "index",
            code: "VN30",
            value: 1810,
            change: 15,
            change_percent: 0.84,
            total_volume: 200_000,
            total_value: 5_000_000_000_000,
            advances: 20,
            declines: 5,
            nochange: 5,
            time: "2026-11-23T03:30:00.000Z",
          },
        ],
      ]),
    )

    // market_breadth MUST stay untouched (no DNSE raw ETF/CW corruption!)
    const afterBreadth = qc.getQueryData<AdaptedWidgetSnapshot<"market_breadth">>(
      marketOverviewKeys.widget("market_breadth", "default"),
    )!
    expect(afterBreadth.data.exchanges[0]).toMatchObject({ advancing: 210, declining: 100, ceiling: 15, floor: 3 })

    // index_chart appended 10:30 ICT point
    const afterIndex = qc.getQueryData<AdaptedWidgetSnapshot<"index_chart">>(
      marketOverviewKeys.widget("index_chart", "index=VNINDEX&range=intraday"),
    )!
    expect(afterIndex.data.series.at(-1)).toMatchObject({ time: "10:30", value: 1708.5 })

    // Out-of-order earlier frame (10:15 ICT = 03:15Z) MUST be ignored!
    patchIndexFrames(
      qc,
      new Map([
        [
          "VNINDEX",
          {
            type: "index",
            code: "VNINDEX",
            value: 1699,
            change: 9,
            change_percent: 0.53,
            total_volume: 400_000,
            total_value: 10_000_000_000_000,
            advances: 100,
            declines: 100,
            nochange: 10,
            time: "2026-11-23T03:15:00.000Z",
          },
        ],
      ]),
    )
    const afterOutOfOrder = qc.getQueryData<AdaptedWidgetSnapshot<"index_chart">>(
      marketOverviewKeys.widget("index_chart", "index=VNINDEX&range=intraday"),
    )!
    expect(afterOutOfOrder.data.series).toHaveLength(2)
    expect(afterOutOfOrder.data.series.at(-1)?.time).toBe("10:30")

    // vnindex_impact headline updated from VNINDEX frame
    const afterImpact = qc.getQueryData<AdaptedWidgetSnapshot<"vnindex_impact">>(
      marketOverviewKeys.widget("vnindex_impact", "default"),
    )!
    expect(afterImpact.data.indexChange).toBe(9)

    // Tick patch for VN30F2611 & VN30F2612 updates futures_table, vn30f_vs_vn30, and index_chart VN30F1M card
    patchTickFrames(
      qc,
      new Map([
        [
          "VN30F2611",
          {
            type: "tick",
            symbol: "VN30F2611",
            price: 1814.5,
            volume: 10,
            side: "B",
            total_volume: 61_200,
            time: "2026-11-23T03:35:00.000Z",
          },
        ],
        [
          "VN30F2612",
          {
            type: "tick",
            symbol: "VN30F2612",
            price: 1817.0,
            volume: 5,
            side: "B",
            total_volume: 1_500,
            time: "2026-11-23T03:35:00.000Z",
          },
        ],
      ]),
    )

    const afterFutures = qc.getQueryData<AdaptedWidgetSnapshot<"futures_table">>(
      marketOverviewKeys.widget("futures_table", "default"),
    )!
    const f1m = afterFutures.data.groups[0].contracts.find((c) => c.code === "VN30F2611")!
    const f2m = afterFutures.data.groups[0].contracts.find((c) => c.code === "VN30F2612")!
    expect(f1m.price).toBe(1814.5)
    expect(f1m.basis).toBeCloseTo(4.5, 2)
    expect(f1m.volumeContracts).toBe(61_200)
    expect(f2m.price).toBe(1817.0)
    expect(f2m.basis).toBeCloseTo(7.0, 2)

    const afterFvs = qc.getQueryData<AdaptedWidgetSnapshot<"vn30f_vs_vn30">>(
      marketOverviewKeys.widget("vn30f_vs_vn30", "range=intraday"),
    )!
    expect(afterFvs.data.latestVn30).toBe(1810)
    expect(afterFvs.data.latestVn30f).toBe(1814.5)
    expect(afterFvs.data.latestBasis).toBeCloseTo(4.5, 2)
    expect(afterFvs.data.points.at(-1)).toMatchObject({ time: "10:35", vn30f: 1814.5 })

    const afterIndexTick = qc.getQueryData<AdaptedWidgetSnapshot<"index_chart">>(
      marketOverviewKeys.widget("index_chart", "index=VNINDEX&range=intraday"),
    )!
    const vn30fCard = afterIndexTick.data.cards.find((c) => c.code === "VN30F1M")!
    expect(vn30fCard.price).toBe(1814.5)
    expect(vn30fCard.volume).toBe(61_200)
  })
})

describe("market-overview squarified treemap & theme heatmap tones", () => {
  const sampleSectors: HeatmapSectorGroup[] = [
    {
      icbCode: "8300",
      name: "Ngân hàng",
      marketCapBillion: 1500000,
      valueBillion: 6200,
      changePct: 1.4,
      stocks: [
        {
          symbol: "VCB",
          sectorCode: "8300",
          sectorName: "Ngân hàng",
          exchange: "HOSE",
          price: 92.5,
          refPrice: 91.0,
          ceilingPrice: 97.3,
          floorPrice: 84.7,
          changePct: 1.65,
          isCeiling: false,
          isFloor: false,
          marketCapBillion: 520000,
          valueBillion: 1200,
          volume: 13000000,
        },
        {
          symbol: "BID",
          sectorCode: "8300",
          sectorName: "Ngân hàng",
          exchange: "HOSE",
          price: 49.0,
          refPrice: 48.5,
          ceilingPrice: 51.8,
          floorPrice: 45.2,
          changePct: 1.03,
          isCeiling: false,
          isFloor: false,
          marketCapBillion: 280000,
          valueBillion: 900,
          volume: 18000000,
        },
      ],
    },
    {
      icbCode: "8600",
      name: "Bất động sản",
      marketCapBillion: 700000,
      valueBillion: 3400,
      changePct: -2.1,
      stocks: [
        {
          symbol: "VHM",
          sectorCode: "8600",
          sectorName: "Bất động sản",
          exchange: "HOSE",
          price: 42.1,
          refPrice: 43.0,
          ceilingPrice: 46.0,
          floorPrice: 40.0,
          changePct: -2.09,
          isCeiling: false,
          isFloor: false,
          marketCapBillion: 180000,
          valueBillion: 1400,
          volume: 32000000,
        },
      ],
    },
  ]

  it("produces non-overlapping rectangles covering exact container bounds", () => {
    const W = 600
    const H = 400
    const rects = squarify(
      [
        { item: "A", weight: 6 },
        { item: "B", weight: 6 },
        { item: "C", weight: 4 },
        { item: "D", weight: 3 },
        { item: "E", weight: 2 },
        { item: "F", weight: 1 },
      ],
      { x: 0, y: 0, w: W, h: H },
    )

    expect(rects).toHaveLength(6)
    let areaSum = 0
    for (let i = 0; i < rects.length; i += 1) {
      const a = rects[i]
      expect(a.x).toBeGreaterThanOrEqual(-1e-6)
      expect(a.y).toBeGreaterThanOrEqual(-1e-6)
      expect(a.x + a.w).toBeLessThanOrEqual(W + 1e-6)
      expect(a.y + a.h).toBeLessThanOrEqual(H + 1e-6)
      areaSum += a.w * a.h

      for (let j = i + 1; j < rects.length; j += 1) {
        const b = rects[j]
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        expect(overlapX > 1e-4 && overlapY > 1e-4).toBe(false)
      }
    }
    expect(areaSum).toBeCloseTo(W * H, 2)
  })

  it("lays out both stock (grouped with headers) and sector modes cleanly", () => {
    const stockLayout = layoutStockTreemap(sampleSectors, "market_cap", 600, 400)
    expect(stockLayout.groups).toHaveLength(2)
    expect(stockLayout.tiles).toHaveLength(3)
    expect(stockLayout.groups.every((g) => g.showHeader)).toBe(true)

    const sectorTiles = layoutSectorTreemap(sampleSectors, "value", 600, 400)
    expect(sectorTiles).toHaveLength(2)
    const totalArea = sectorTiles.reduce((sum, t) => sum + t.w * t.h, 0)
    expect(totalArea).toBeCloseTo(600 * 400, 2)
  })

  it("maps heatmap tones using theme CSS variables with strict ceiling/floor tokens", () => {
    expect(resolveHeatmapTone(6.9, true, false)).toMatchObject({
      tone: "ce",
      background: "var(--mo-ce)",
    })
    expect(resolveHeatmapTone(-6.9, false, true)).toMatchObject({
      tone: "fl",
      background: "var(--mo-fl)",
    })
    expect(resolveHeatmapTone(0, false, false).tone).toBe("ref")

    const mildUp = resolveHeatmapTone(1.5)
    const strongUp = resolveHeatmapTone(6.5)
    expect(mildUp.tone).toBe("up")
    expect(mildUp.background).toContain("var(--mo-up)")
    expect(strongUp.intensity).toBeGreaterThan(mildUp.intensity)

    const down = resolveHeatmapTone(-3.5)
    expect(down.tone).toBe("dn")
    expect(down.background).toContain("var(--mo-dn)")
  })
})

describe("market-overview SVG chart primitives", () => {
  const sampleTrails: RrgSectorTrail[] = [
    {
      icbCode: "8300",
      name: "Ngân hàng",
      quadrant: "leading",
      points: [
        { date: "2026-10-16", rsRatio: 100.5, rsMomentum: 100.8 },
        { date: "2026-10-23", rsRatio: 101.2, rsMomentum: 101.5 },
        { date: "2026-10-30", rsRatio: 102.0, rsMomentum: 102.2 },
        { date: "2026-11-06", rsRatio: 102.8, rsMomentum: 102.6 },
        { date: "2026-11-13", rsRatio: 103.5, rsMomentum: 103.1 },
      ],
    },
    {
      icbCode: "8600",
      name: "Bất động sản",
      quadrant: "lagging",
      points: [
        { date: "2026-10-16", rsRatio: 98.2, rsMomentum: 99.1 },
        { date: "2026-10-23", rsRatio: 97.6, rsMomentum: 98.4 },
        { date: "2026-10-30", rsRatio: 97.0, rsMomentum: 97.8 },
        { date: "2026-11-06", rsRatio: 96.4, rsMomentum: 97.2 },
        { date: "2026-11-13", rsRatio: 95.8, rsMomentum: 96.6 },
      ],
    },
  ]

  it("renders RrgSvg with 4 CSS-tokenized quadrants, trails, head dots, and hover tooltip", () => {
    const { container } = render(
      createElement(RrgSvg, { sectors: sampleTrails, width: 560, height: 340 }),
    )

    // 4 quadrant labels
    expect(screen.getByText("Dẫn dắt")).toBeTruthy()
    expect(screen.getByText("Suy yếu")).toBeTruthy()
    expect(screen.getByText("Tụt hậu")).toBeTruthy()
    expect(screen.getByText("Cải thiện")).toBeTruthy()

    // 4 themed quadrant rects
    expect(container.querySelector('[data-quadrant="leading"]')?.getAttribute("fill")).toBe(
      "var(--mo-rrg-lead)",
    )
    expect(container.querySelector('[data-quadrant="weakening"]')?.getAttribute("fill")).toBe(
      "var(--mo-rrg-weak)",
    )
    expect(container.querySelector('[data-quadrant="lagging"]')?.getAttribute("fill")).toBe(
      "var(--mo-rrg-lag)",
    )
    expect(container.querySelector('[data-quadrant="improving"]')?.getAttribute("fill")).toBe(
      "var(--mo-rrg-imp)",
    )

    // Sector trails & 5.5px head dots
    const bankGroup = container.querySelector('[data-sector="8300"]')
    expect(bankGroup).not.toBeNull()
    expect(bankGroup!.querySelector("path")?.getAttribute("d")).toContain("C")
    const circles = bankGroup!.querySelectorAll("circle")
    expect(circles).toHaveLength(5)
    expect(circles[4].getAttribute("r")).toBe("5.5")

    // Hover tooltip shows sector name, quadrant, RS-Ratio, RS-Momentum & 5-week path
    fireEvent.mouseEnter(bankGroup!)
    const tooltip = screen.getByRole("tooltip")
    expect(tooltip.textContent).toContain("Ngân hàng")
    expect(tooltip.textContent).toContain("Dẫn dắt")
    expect(tooltip.textContent).toContain("103,50")
    expect(tooltip.textContent).toContain("103,10")
    expect(tooltip.textContent).toContain("16/10")
  })

  it("renders SparklineSvg with reference line and semantic tone stroke", () => {
    const { container } = render(
      createElement(SparklineSvg, {
        values: [1700, 1705, 1712, 1718],
        refValue: 1705,
        ariaLabel: "VN-Index sparkline",
      }),
    )

    const svg = container.querySelector("svg")
    expect(svg).not.toBeNull()
    expect(svg!.querySelector("line")?.getAttribute("stroke-dasharray")).toBe("3 3")
    expect(svg!.querySelector("path")?.getAttribute("stroke")).toBe("var(--mo-up, var(--price-up))")
  })
})
