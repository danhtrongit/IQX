/**
 * Independent E2E acceptance suite for "Toàn cảnh thị trường" (`market-overview`)
 * covering all Specification §4.5 acceptance criteria in real Chromium.
 */
import { mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import type { Locator, Page } from "@playwright/test"

import { expect, test } from "./fixtures"
import { json, mockMember } from "./u1911-support"

test.describe.configure({ timeout: 90_000 })

const SCREENSHOT_DIR =
  process.env.E2E_SCREENSHOT_DIR ||
  path.join(os.tmpdir(), "iqx-market-overview-screenshots")
mkdirSync(SCREENSHOT_DIR, { recursive: true })

type WidgetSlug =
  | "index_chart"
  | "market_breadth"
  | "market_liquidity"
  | "foreign_flow"
  | "vnindex_impact"
  | "market_heatmap"
  | "featured_stocks"
  | "sector_performance"
  | "sector_rotation"
  | "derivatives_summary"
  | "vn30f_vs_vn30"
  | "futures_table"
  | "world_indices"
  | "commodities_fx"
  | "events_calendar"
  | "market_news"

interface ServerPageItem {
  uid: string
  widget: WidgetSlug
  x: number
  y: number
  w: number
  h: number
  state: Record<string, string>
}

interface ServerPage {
  version: number
  id: string
  name: string
  order: number
  items: ServerPageItem[]
  updatedAt: string
}

interface ApiCall {
  method: string
  path: string
  search: string
  body: unknown
}

const TEMPLATE_ITEMS: ServerPageItem[] = [
  { uid: "tpl_index_chart", widget: "index_chart", x: 0, y: 0, w: 8, h: 9, state: { index: "VNINDEX", range: "intraday" } },
  { uid: "tpl_market_breadth", widget: "market_breadth", x: 8, y: 0, w: 4, h: 3, state: {} },
  { uid: "tpl_market_liquidity", widget: "market_liquidity", x: 8, y: 3, w: 4, h: 6, state: {} },
  { uid: "tpl_foreign_flow", widget: "foreign_flow", x: 0, y: 9, w: 4, h: 7, state: { exchange: "HOSE", tab: "foreign" } },
  { uid: "tpl_vnindex_impact", widget: "vnindex_impact", x: 4, y: 9, w: 4, h: 7, state: {} },
  { uid: "tpl_derivatives_summary", widget: "derivatives_summary", x: 8, y: 9, w: 4, h: 7, state: {} },
  { uid: "tpl_market_heatmap", widget: "market_heatmap", x: 0, y: 16, w: 8, h: 8, state: { mode: "stock", sizeBy: "market_cap" } },
  { uid: "tpl_featured_stocks", widget: "featured_stocks", x: 8, y: 16, w: 4, h: 8, state: { tab: "gainers" } },
  { uid: "tpl_sector_performance", widget: "sector_performance", x: 0, y: 24, w: 6, h: 7, state: { period: "today", tab: "price" } },
  { uid: "tpl_sector_rotation", widget: "sector_rotation", x: 6, y: 24, w: 6, h: 7, state: {} },
  { uid: "tpl_world_indices", widget: "world_indices", x: 0, y: 31, w: 4, h: 7, state: {} },
  { uid: "tpl_commodities_fx", widget: "commodities_fx", x: 4, y: 31, w: 4, h: 7, state: { tab: "energy_metals" } },
  { uid: "tpl_events_calendar", widget: "events_calendar", x: 8, y: 31, w: 4, h: 7, state: { filter: "all" } },
]

const GROUPS = [
  { id: "indices", label: "Chỉ số" },
  { id: "stocks", label: "Cổ phiếu" },
  { id: "sectors", label: "Ngành" },
  { id: "derivatives", label: "Phái sinh" },
  { id: "global", label: "Thế giới" },
  { id: "events_news", label: "Sự kiện và tin" },
] as const

const CATALOG = [
  { slug: "index_chart", name: "Biểu đồ chỉ số", group: "indices", groupLabel: "Chỉ số", defaultW: 8, defaultH: 9, minW: 5, minH: 5, inTemplate: true, keywords: "vnindex vn30 hnx upcom vn30f1m", defaultState: { index: "VNINDEX", range: "intraday" } },
  { slug: "market_breadth", name: "Độ rộng thị trường", group: "indices", groupLabel: "Chỉ số", defaultW: 4, defaultH: 3, minW: 3, minH: 3, inTemplate: true, keywords: "tăng giảm trần sàn hose hnx upcom", defaultState: {} },
  { slug: "market_liquidity", name: "Thanh khoản thị trường", group: "indices", groupLabel: "Chỉ số", defaultW: 4, defaultH: 6, minW: 3, minH: 3, inTemplate: true, keywords: "giá trị khớp gtgd tb20", defaultState: {} },
  { slug: "foreign_flow", name: "Khối ngoại và tự doanh", group: "indices", groupLabel: "Chỉ số", defaultW: 4, defaultH: 7, minW: 3, minH: 3, inTemplate: true, keywords: "nước ngoài NN tự doanh mua bán ròng", defaultState: { exchange: "HOSE", tab: "foreign" } },
  { slug: "vnindex_impact", name: "Tác động lên VN-Index", group: "indices", groupLabel: "Chỉ số", defaultW: 4, defaultH: 7, minW: 3, minH: 3, inTemplate: true, keywords: "kéo tăng kéo giảm điểm đóng góp", defaultState: {} },
  { slug: "market_heatmap", name: "Bản đồ nhiệt thị trường", group: "stocks", groupLabel: "Cổ phiếu", defaultW: 8, defaultH: 8, minW: 4, minH: 4, inTemplate: true, keywords: "heatmap ngành vốn hoá", defaultState: { mode: "stock", sizeBy: "market_cap" } },
  { slug: "featured_stocks", name: "Cổ phiếu nổi bật", group: "stocks", groupLabel: "Cổ phiếu", defaultW: 4, defaultH: 8, minW: 3, minH: 3, inTemplate: true, keywords: "đột biến khối lượng tăng giảm khối ngoại thanh khoản", defaultState: { tab: "gainers" } },
  { slug: "sector_performance", name: "Hiệu suất ngành", group: "sectors", groupLabel: "Ngành", defaultW: 6, defaultH: 7, minW: 4, minH: 4, inTemplate: true, keywords: "dòng tiền ngành biến động giá", defaultState: { period: "today", tab: "price" } },
  { slug: "sector_rotation", name: "Chu kỳ ngành", group: "sectors", groupLabel: "Ngành", defaultW: 6, defaultH: 7, minW: 4, minH: 4, inTemplate: true, keywords: "xoay vòng RRG dẫn dắt suy yếu tụt hậu cải thiện", defaultState: {} },
  { slug: "derivatives_summary", name: "Tổng quan phái sinh", group: "derivatives", groupLabel: "Phái sinh", defaultW: 4, defaultH: 7, minW: 3, minH: 3, inTemplate: true, keywords: "basis đáo hạn phái sinh vn30f1m", defaultState: {} },
  { slug: "vn30f_vs_vn30", name: "VN30F1M so với VN30", group: "derivatives", groupLabel: "Phái sinh", defaultW: 6, defaultH: 6, minW: 4, minH: 4, inTemplate: false, keywords: "basis phái sinh chênh lệch", defaultState: { range: "intraday" } },
  { slug: "futures_table", name: "Bảng hợp đồng tương lai", group: "derivatives", groupLabel: "Phái sinh", defaultW: 8, defaultH: 7, minW: 4, minH: 3, inTemplate: false, keywords: "VN30F VN100F phái sinh đáo hạn", defaultState: {} },
  { slug: "world_indices", name: "Chỉ số thế giới", group: "global", groupLabel: "Thế giới", defaultW: 4, defaultH: 7, minW: 3, minH: 3, inTemplate: true, keywords: "mỹ dow sp500 nasdaq nikkei hang seng", defaultState: {} },
  { slug: "commodities_fx", name: "Hàng hoá và tỷ giá", group: "global", groupLabel: "Thế giới", defaultW: 4, defaultH: 7, minW: 3, minH: 3, inTemplate: true, keywords: "vàng dầu thép urê cao su cà phê usd sjc tỷ giá dxy", defaultState: { tab: "energy_metals" } },
  { slug: "events_calendar", name: "Lịch sự kiện", group: "events_news", groupLabel: "Sự kiện và tin", defaultW: 4, defaultH: 7, minW: 3, minH: 3, inTemplate: true, keywords: "cổ tức GDKHQ đại hội cổ đông", defaultState: { filter: "all" } },
  { slug: "market_news", name: "Tin thị trường", group: "events_news", groupLabel: "Sự kiện và tin", defaultW: 4, defaultH: 7, minW: 3, minH: 3, inTemplate: false, keywords: "tin tức doanh nghiệp thế giới", defaultState: {} },
] as const

const INTRADAY_SLOTS = [
  "09:15", "09:30", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30",
  "13:00", "13:15", "13:30", "13:45", "14:00", "14:15", "14:30", "14:45",
]

function buildTemplateResponse(options?: { newsEnabled?: boolean; emptyCatalog?: boolean }) {
  const catalogEntries = options?.emptyCatalog
    ? []
    : options?.newsEnabled
      ? CATALOG
      : CATALOG.filter((c) => c.slug !== "market_news")
  return {
    version: 1,
    id: "thi-truong" as const,
    name: "Thị trường",
    readonly: true as const,
    items: TEMPLATE_ITEMS.map((item) => ({ ...item, state: { ...item.state } })),
    catalog: catalogEntries.map((c) => ({ ...c, defaultState: { ...c.defaultState } })),
    groups: GROUPS.map((g) => ({ ...g })),
    limits: {
      cols: 12,
      maxHeight: 18,
      maxPages: 8,
      maxWidgetsPerPage: 40,
      maxPageNameLength: 30,
    },
    updatedAt: "2026-11-18T15:00:00+07:00",
  }
}

function buildWidgetPayload(
  widget: WidgetSlug,
  query: URLSearchParams,
  options: { isMarketOpen: boolean; sessionDate: string },
): Record<string, unknown> {
  const base = {
    widget,
    asOf: "2026-11-18T15:00:00+07:00",
    sessionDate: options.sessionDate,
    isMarketOpen: options.isMarketOpen,
    stale: false,
  }

  switch (widget) {
    case "index_chart": {
      const selectedCode = (query.get("index") || "VNINDEX") as "VNINDEX" | "VN30" | "HNX" | "UPCOM" | "VN30F1M"
      const range = (query.get("range") || "intraday") as "intraday" | "3m" | "1y"
      const cards = [
        { code: "VNINDEX", name: "VN-Index", price: 1703.01, refPrice: 1690.5, change: 12.51, changePct: 0.74, volume: 852_400_000, valueBillion: 21_450, sparkline: [1690.5, 1693, 1691.2, 1696.4, 1700.1, 1703.01] },
        { code: "VN30", name: "VN30", price: 1806.54, refPrice: 1792.0, change: 14.54, changePct: 0.81, volume: 325_100_000, valueBillion: 10_280, sparkline: [1792, 1795, 1798.5, 1802, 1804.8, 1806.54] },
        { code: "HNX", name: "HNX-Index", price: 251.4, refPrice: 250.0, change: 1.4, changePct: 0.56, volume: 95_200_000, valueBillion: 1_850, sparkline: [250, 250.2, 250.7, 251.1, 251.4] },
        { code: "UPCOM", name: "UPCoM", price: 98.2, refPrice: 98.5, change: -0.3, changePct: -0.3, volume: 60_500_000, valueBillion: 920, sparkline: [98.5, 98.4, 98.35, 98.25, 98.2] },
        { code: "VN30F1M", name: "VN30F1M", price: 1800.7, refPrice: 1790.0, change: 10.7, changePct: 0.6, volume: 212_400, valueBillion: 38_200, sparkline: [1790, 1792.4, 1796.1, 1798.9, 1800.7] },
      ]
      const chosen = cards.find((c) => c.code === selectedCode) ?? cards[0]
      const points =
        range === "intraday"
          ? INTRADAY_SLOTS.map((t, i) => {
              const frac = i / (INTRADAY_SLOTS.length - 1)
              const isEndpoint = i === 0 || i === INTRADAY_SLOTS.length - 1
              const wobble = isEndpoint ? 0 : Math.sin(i * 0.7) * (chosen.price * 0.0012)
              const v = Number((chosen.refPrice + (chosen.price - chosen.refPrice) * frac + wobble).toFixed(2))
              return { t, v, vol: 25_000_000 + i * 3_500_000, isUp: v >= chosen.refPrice }
            })
          : Array.from({ length: 24 }, (_, idx) => {
              const day = new Date(Date.UTC(2026, 9, 1 + idx * 2)).toISOString().slice(0, 10)
              const v = Number((chosen.price - (23 - idx) * 2.1 + Math.sin(idx) * 4).toFixed(2))
              return { t: day, v, vol: 650_000_000 + idx * 9_000_000, isUp: idx % 3 !== 0 }
            })
      return { ...base, data: { cards, selected: { ...chosen, range, points } } }
    }

    case "market_breadth":
      return {
        ...base,
        data: {
          exchanges: [
            { exchange: "HOSE", ceiling: 15, advancing: 210, unchanged: 52, declining: 120, floor: 3, total: 400, advancingTotal: 225, decliningTotal: 123 },
            { exchange: "HNX", ceiling: 5, advancing: 85, unchanged: 48, declining: 60, floor: 2, total: 200, advancingTotal: 90, decliningTotal: 62 },
            { exchange: "UPCOM", ceiling: 10, advancing: 140, unchanged: 105, declining: 90, floor: 5, total: 350, advancingTotal: 150, decliningTotal: 95 },
          ],
        },
      }

    case "market_liquidity":
      return {
        ...base,
        data: {
          exchange: "HOSE",
          currentValueBillion: 17_454,
          pctVsPrevSameTime: 112,
          pctVsAvg20SameTime: 105,
          points: INTRADAY_SLOTS.map((t, i) => {
            const frac = (i + 1) / INTRADAY_SLOTS.length
            return {
              t,
              today: Math.round(17_454 * frac),
              prev: Math.round(15_580 * frac),
              avg20: Math.round(16_620 * frac),
            }
          }),
        },
      }

    case "foreign_flow": {
      const exchange = (query.get("exchange") || "HOSE") as "HOSE" | "HNX" | "UPCOM"
      const tab = (query.get("tab") || "foreign") as "foreign" | "prop"
      const isProp = tab === "prop"
      const sessions = Array.from({ length: 20 }, (_, idx) => {
        const date = new Date(Date.UTC(2026, 9, 22 + idx)).toISOString().slice(0, 10)
        const net = Number(((idx % 2 === 0 ? 1 : -1) * (110 + idx * 14.5) + (isProp ? 60 : -40)).toFixed(1))
        const buy = 1_250 + idx * 25
        return { date, netBillion: net, buyBillion: buy, sellBillion: Number((buy - net).toFixed(1)) }
      })
      return {
        ...base,
        data: {
          exchange,
          tab,
          propSupported: exchange === "HOSE",
          netBillion: isProp ? 185.4 : -215.3,
          buyBillion: isProp ? 642.8 : 1_450.2,
          sellBillion: isProp ? 457.4 : 1_665.5,
          sessions,
          topBuy: [
            { symbol: "FPT", netBillion: 112.4 },
            { symbol: "MWG", netBillion: 78.6 },
            { symbol: "TCB", netBillion: 54.2 },
          ],
          topSell: [
            { symbol: "VHM", netBillion: -145.6 },
            { symbol: "HPG", netBillion: -98.3 },
            { symbol: "SSI", netBillion: -61.5 },
          ],
        },
      }
    }

    case "vnindex_impact":
      return {
        ...base,
        data: {
          indexChange: 12.51,
          sumUp: 14.22,
          sumDn: -1.73,
          delta: 0.02,
          positive: [
            { symbol: "VCB", impact: 3.45, price: 92.5, changePct: 1.65 },
            { symbol: "BID", impact: 2.38, price: 48.2, changePct: 2.12 },
            { symbol: "FPT", impact: 2.15, price: 138.5, changePct: 3.36 },
            { symbol: "CTG", impact: 1.64, price: 36.8, changePct: 1.94 },
            { symbol: "TCB", impact: 1.42, price: 24.5, changePct: 2.08 },
            { symbol: "MBB", impact: 1.18, price: 25.4, changePct: 1.6 },
            { symbol: "GAS", impact: 1.05, price: 72.3, changePct: 1.4 },
            { symbol: "MWG", impact: 0.95, price: 66.8, changePct: 2.45 },
          ],
          negative: [
            { symbol: "VHM", impact: -0.62, price: 42.1, changePct: -2.09 },
            { symbol: "VIC", impact: -0.35, price: 41.0, changePct: -1.2 },
            { symbol: "VNM", impact: -0.22, price: 65.2, changePct: -0.91 },
            { symbol: "SAB", impact: -0.18, price: 56.4, changePct: -0.88 },
            { symbol: "PLX", impact: -0.12, price: 40.5, changePct: -0.74 },
            { symbol: "NVL", impact: -0.1, price: 11.2, changePct: -1.75 },
            { symbol: "BCM", impact: -0.08, price: 64.0, changePct: -0.62 },
            { symbol: "VRE", impact: -0.06, price: 18.4, changePct: -0.54 },
          ],
        },
      }

    case "market_heatmap":
      return {
        ...base,
        data: {
          mode: (query.get("mode") || "stock") as "stock" | "sector",
          sizeBy: (query.get("sizeBy") || "market_cap") as "market_cap" | "value",
          sectors: [
            {
              code: "8300",
              name: "Ngân hàng",
              changePct: 1.42,
              marketCapBillion: 1_850_000,
              valueBillion: 6_200,
              stocks: [
                { symbol: "VCB", exchange: "HOSE", price: 92.5, refPrice: 91.0, ceilingPrice: 97.3, floorPrice: 84.7, changePct: 1.65, marketCapBillion: 520_000, valueBillion: 1_200, isCeiling: false, isFloor: false },
                { symbol: "BID", exchange: "HOSE", price: 48.2, refPrice: 47.2, ceilingPrice: 50.5, floorPrice: 43.9, changePct: 2.12, marketCapBillion: 275_000, valueBillion: 840, isCeiling: false, isFloor: false },
                { symbol: "CTG", exchange: "HOSE", price: 36.8, refPrice: 36.1, ceilingPrice: 38.6, floorPrice: 33.6, changePct: 1.94, marketCapBillion: 198_000, valueBillion: 920, isCeiling: false, isFloor: false },
                { symbol: "TCB", exchange: "HOSE", price: 24.5, refPrice: 24.0, ceilingPrice: 25.65, floorPrice: 22.35, changePct: 2.08, marketCapBillion: 172_000, valueBillion: 1_150, isCeiling: false, isFloor: false },
                { symbol: "STB", exchange: "HOSE", price: 36.7, refPrice: 34.3, ceilingPrice: 36.7, floorPrice: 31.9, changePct: 7.0, marketCapBillion: 69_000, valueBillion: 780, isCeiling: true, isFloor: false },
              ],
            },
            {
              code: "8600",
              name: "Bất động sản",
              changePct: -0.95,
              marketCapBillion: 680_000,
              valueBillion: 3_100,
              stocks: [
                { symbol: "VHM", exchange: "HOSE", price: 42.1, refPrice: 43.0, ceilingPrice: 46.0, floorPrice: 40.0, changePct: -2.09, marketCapBillion: 183_000, valueBillion: 1_100, isCeiling: false, isFloor: false },
                { symbol: "VIC", exchange: "HOSE", price: 41.0, refPrice: 41.5, ceilingPrice: 44.4, floorPrice: 38.6, changePct: -1.2, marketCapBillion: 156_000, valueBillion: 650, isCeiling: false, isFloor: false },
                { symbol: "NVL", exchange: "HOSE", price: 10.7, refPrice: 11.5, ceilingPrice: 12.3, floorPrice: 10.7, changePct: -6.96, marketCapBillion: 21_000, valueBillion: 420, isCeiling: false, isFloor: true },
              ],
            },
            {
              code: "9500",
              name: "Công nghệ",
              changePct: 3.18,
              marketCapBillion: 245_000,
              valueBillion: 1_950,
              stocks: [
                { symbol: "FPT", exchange: "HOSE", price: 138.5, refPrice: 134.0, ceilingPrice: 143.3, floorPrice: 124.7, changePct: 3.36, marketCapBillion: 202_000, valueBillion: 1_650, isCeiling: false, isFloor: false },
                { symbol: "CMG", exchange: "HOSE", price: 54.0, refPrice: 54.0, ceilingPrice: 57.7, floorPrice: 50.3, changePct: 0.0, marketCapBillion: 11_500, valueBillion: 180, isCeiling: false, isFloor: false },
              ],
            },
            {
              code: "8700",
              name: "Chứng khoán",
              changePct: 1.85,
              marketCapBillion: 290_000,
              valueBillion: 2_850,
              stocks: [
                { symbol: "SSI", exchange: "HOSE", price: 27.8, refPrice: 27.2, ceilingPrice: 29.1, floorPrice: 25.3, changePct: 2.21, marketCapBillion: 54_000, valueBillion: 980, isCeiling: false, isFloor: false },
                { symbol: "VCI", exchange: "HOSE", price: 35.4, refPrice: 34.8, ceilingPrice: 37.2, floorPrice: 32.4, changePct: 1.72, marketCapBillion: 25_000, valueBillion: 540, isCeiling: false, isFloor: false },
                { symbol: "HCM", exchange: "HOSE", price: 29.2, refPrice: 28.8, ceilingPrice: 30.8, floorPrice: 26.8, changePct: 1.39, marketCapBillion: 21_000, valueBillion: 470, isCeiling: false, isFloor: false },
              ],
            },
          ],
        },
      }

    case "featured_stocks": {
      const tab = (query.get("tab") || "gainers") as "gainers" | "losers" | "liquidity" | "foreign" | "vol_spike"
      const rows = [
        { symbol: "FPT", exchange: "HOSE", price: 138.5, refPrice: 134.0, ceilingPrice: 143.3, floorPrice: 124.7, changePct: 3.36, valueBillion: 1_650.4, foreignNetBillion: 112.4, volRatio20d: 2.4 },
        { symbol: "STB", exchange: "HOSE", price: 36.7, refPrice: 34.3, ceilingPrice: 36.7, floorPrice: 31.9, changePct: 7.0, valueBillion: 780.2, foreignNetBillion: 42.1, volRatio20d: 3.1 },
        { symbol: "MWG", exchange: "HOSE", price: 66.8, refPrice: 65.2, ceilingPrice: 69.7, floorPrice: 60.7, changePct: 2.45, valueBillion: 620.8, foreignNetBillion: 78.6, volRatio20d: 1.9 },
        { symbol: "SSI", exchange: "HOSE", price: 27.8, refPrice: 27.2, ceilingPrice: 29.1, floorPrice: 25.3, changePct: 2.21, valueBillion: 980.0, foreignNetBillion: -61.5, volRatio20d: 1.7 },
        { symbol: "BID", exchange: "HOSE", price: 48.2, refPrice: 47.2, ceilingPrice: 50.5, floorPrice: 43.9, changePct: 2.12, valueBillion: 840.5, foreignNetBillion: 34.2, volRatio20d: 1.5 },
        { symbol: "TCB", exchange: "HOSE", price: 24.5, refPrice: 24.0, ceilingPrice: 25.65, floorPrice: 22.35, changePct: 2.08, valueBillion: 1_150.0, foreignNetBillion: 54.2, volRatio20d: 1.6 },
        { symbol: "CTG", exchange: "HOSE", price: 36.8, refPrice: 36.1, ceilingPrice: 38.6, floorPrice: 33.6, changePct: 1.94, valueBillion: 920.3, foreignNetBillion: 28.0, volRatio20d: 1.4 },
        { symbol: "VCB", exchange: "HOSE", price: 92.5, refPrice: 91.0, ceilingPrice: 97.3, floorPrice: 84.7, changePct: 1.65, valueBillion: 1_200.1, foreignNetBillion: 65.8, volRatio20d: 1.2 },
        { symbol: "MBB", exchange: "HOSE", price: 25.4, refPrice: 25.0, ceilingPrice: 26.75, floorPrice: 23.25, changePct: 1.6, valueBillion: 710.4, foreignNetBillion: 19.5, volRatio20d: 1.3 },
        { symbol: "HPG", exchange: "HOSE", price: 27.1, refPrice: 27.5, ceilingPrice: 29.4, floorPrice: 25.6, changePct: -1.45, valueBillion: 880.6, foreignNetBillion: -98.3, volRatio20d: 1.1 },
        { symbol: "VHM", exchange: "HOSE", price: 42.1, refPrice: 43.0, ceilingPrice: 46.0, floorPrice: 40.0, changePct: -2.09, valueBillion: 1_100.2, foreignNetBillion: -145.6, volRatio20d: 2.0 },
        { symbol: "NVL", exchange: "HOSE", price: 10.7, refPrice: 11.5, ceilingPrice: 12.3, floorPrice: 10.7, changePct: -6.96, valueBillion: 420.0, foreignNetBillion: -25.4, volRatio20d: 2.8 },
      ]
      return { ...base, data: { tab, rows } }
    }

    case "sector_performance":
      return {
        ...base,
        data: {
          period: (query.get("period") || "today") as "today" | "1w" | "1m" | "ytd",
          tab: (query.get("tab") || "price") as "price" | "flow",
          rows: [
            { code: "9500", name: "Công nghệ", changePct: 3.18, advancing: 11, declining: 2, unchanged: 1, valueSharePct: 9.8, valueRatio20d: 1.54, valueBillion: 1_950 },
            { code: "8700", name: "Chứng khoán", changePct: 1.85, advancing: 22, declining: 4, unchanged: 3, valueSharePct: 14.3, valueRatio20d: 1.32, valueBillion: 2_850 },
            { code: "8300", name: "Ngân hàng", changePct: 1.42, advancing: 19, declining: 3, unchanged: 5, valueSharePct: 31.2, valueRatio20d: 1.24, valueBillion: 6_200 },
            { code: "5300", name: "Bán lẻ", changePct: 1.15, advancing: 9, declining: 4, unchanged: 2, valueSharePct: 5.4, valueRatio20d: 1.12, valueBillion: 1_080 },
            { code: "0500", name: "Dầu khí", changePct: 0.94, advancing: 8, declining: 3, unchanged: 2, valueSharePct: 4.1, valueRatio20d: 1.05, valueBillion: 820 },
            { code: "1300", name: "Hoá chất", changePct: 0.62, advancing: 14, declining: 9, unchanged: 4, valueSharePct: 4.8, valueRatio20d: 0.98, valueBillion: 960 },
            { code: "2300", name: "Xây dựng và vật liệu", changePct: 0.25, advancing: 25, declining: 22, unchanged: 8, valueSharePct: 6.2, valueRatio20d: 0.91, valueBillion: 1_240 },
            { code: "3500", name: "Thực phẩm đồ uống", changePct: -0.18, advancing: 12, declining: 16, unchanged: 6, valueSharePct: 4.6, valueRatio20d: 0.85, valueBillion: 910 },
            { code: "1700", name: "Tài nguyên cơ bản", changePct: -0.54, advancing: 8, declining: 18, unchanged: 4, valueSharePct: 6.8, valueRatio20d: 0.74, valueBillion: 1_350 },
            { code: "8600", name: "Bất động sản", changePct: -0.95, advancing: 14, declining: 39, unchanged: 10, valueSharePct: 12.8, valueRatio20d: 0.68, valueBillion: 2_540 },
          ],
        },
      }

    case "sector_rotation":
      return {
        ...base,
        data: {
          weekEnding: "2026-11-14",
          domain: { minRatio: 95, maxRatio: 105, minMomentum: 95, maxMomentum: 105 },
          sectors: [
            { code: "8300", name: "Ngân hàng", quadrant: "leading", trail: [{ week: "2026-10-17", rsRatio: 100.4, rsMomentum: 100.8 }, { week: "2026-10-24", rsRatio: 101.0, rsMomentum: 101.2 }, { week: "2026-10-31", rsRatio: 101.6, rsMomentum: 101.7 }, { week: "2026-11-07", rsRatio: 102.1, rsMomentum: 102.0 }, { week: "2026-11-14", rsRatio: 102.8, rsMomentum: 102.3 }] },
            { code: "9500", name: "Công nghệ", quadrant: "leading", trail: [{ week: "2026-10-17", rsRatio: 100.9, rsMomentum: 101.5 }, { week: "2026-10-24", rsRatio: 101.4, rsMomentum: 102.0 }, { week: "2026-10-31", rsRatio: 102.0, rsMomentum: 102.4 }, { week: "2026-11-07", rsRatio: 102.7, rsMomentum: 102.9 }, { week: "2026-11-14", rsRatio: 103.4, rsMomentum: 103.1 }] },
            { code: "5300", name: "Bán lẻ", quadrant: "weakening", trail: [{ week: "2026-10-17", rsRatio: 102.4, rsMomentum: 101.0 }, { week: "2026-10-24", rsRatio: 102.2, rsMomentum: 100.3 }, { week: "2026-10-31", rsRatio: 101.8, rsMomentum: 99.6 }, { week: "2026-11-07", rsRatio: 101.4, rsMomentum: 99.0 }, { week: "2026-11-14", rsRatio: 101.1, rsMomentum: 98.4 }] },
            { code: "8600", name: "Bất động sản", quadrant: "lagging", trail: [{ week: "2026-10-17", rsRatio: 99.2, rsMomentum: 99.0 }, { week: "2026-10-24", rsRatio: 98.6, rsMomentum: 98.4 }, { week: "2026-10-31", rsRatio: 98.0, rsMomentum: 98.0 }, { week: "2026-11-07", rsRatio: 97.5, rsMomentum: 97.8 }, { week: "2026-11-14", rsRatio: 97.1, rsMomentum: 97.4 }] },
            { code: "8700", name: "Chứng khoán", quadrant: "improving", trail: [{ week: "2026-10-17", rsRatio: 97.2, rsMomentum: 99.2 }, { week: "2026-10-24", rsRatio: 97.6, rsMomentum: 100.1 }, { week: "2026-10-31", rsRatio: 98.1, rsMomentum: 101.0 }, { week: "2026-11-07", rsRatio: 98.7, rsMomentum: 101.8 }, { week: "2026-11-14", rsRatio: 99.3, rsMomentum: 102.4 }] },
          ],
        },
      }

    case "derivatives_summary":
      return {
        ...base,
        data: {
          contract: "VN30F2611",
          price: 1800.7,
          refPrice: 1790.0,
          change: 10.7,
          changePct: 0.6,
          vn30Price: 1806.54,
          vn30Change: 14.54,
          vn30ChangePct: 0.81,
          basis: -5.84,
          volume: 212_400,
          valueBillion: 38_200,
          foreignNetContracts: 1_240,
          expiryDate: "2026-11-19",
          remainingSessions: 1,
        },
      }

    case "vn30f_vs_vn30": {
      const range = (query.get("range") || "intraday") as "intraday" | "1m" | "3m"
      const points =
        range === "intraday"
          ? INTRADAY_SLOTS.map((t, i) => {
              const vn30 = Number((1792 + i * 0.85).toFixed(2))
              const vn30f = Number((1790 + i * 0.63 + Math.sin(i) * 0.8).toFixed(1))
              return { t, vn30, vn30f, basis: Number((vn30f - vn30).toFixed(2)) }
            })
          : Array.from({ length: 20 }, (_, i) => {
              const t = new Date(Date.UTC(2026, 9, 25 + i)).toISOString().slice(0, 10)
              const vn30 = Number((1760 + i * 2.4).toFixed(2))
              const vn30f = Number((vn30 - 3 + Math.sin(i) * 4).toFixed(1))
              return { t, vn30, vn30f, basis: Number((vn30f - vn30).toFixed(2)) }
            })
      return {
        ...base,
        data: { range, latestVn30: 1806.54, latestVn30f: 1800.7, latestBasis: -5.84, points },
      }
    }

    case "futures_table":
      return {
        ...base,
        data: {
          groups: [
            {
              underlying: "VN30",
              spotPrice: 1806.54,
              spotChangePct: 0.81,
              contracts: [
                { code: "VN30F2611", displayCode: "VN30F1M", expiryDate: "2026-11-19", remainingSessions: 0, price: 1800.7, refPrice: 1790.0, changePct: 0.6, basis: -5.84, volume: 212_400, valueBillion: 38_200, foreignNetBillion: 42.5 },
                { code: "VN30F2612", displayCode: "VN30F2M", expiryDate: "2026-12-17", remainingSessions: 8, price: 1804.2, refPrice: 1793.5, changePct: 0.6, basis: -2.34, volume: 18_600, valueBillion: 3_350, foreignNetBillion: 11.2 },
                { code: "VN30F2703", displayCode: "VN30F1Q", expiryDate: "2027-03-18", remainingSessions: 72, price: 1810.0, refPrice: 1801.0, changePct: 0.5, basis: 3.46, volume: 2_150, valueBillion: 389, foreignNetBillion: -3.4 },
                { code: "VN30F2706", displayCode: "VN30F2Q", expiryDate: "2027-06-17", remainingSessions: 136, price: 1815.5, refPrice: 1808.0, changePct: 0.41, basis: 8.96, volume: 640, valueBillion: 116, foreignNetBillion: 0.8 },
              ],
            },
            {
              underlying: "VN100",
              spotPrice: 1642.15,
              spotChangePct: 0.65,
              contracts: [
                { code: "VN100F2611", displayCode: "VN100F1M", expiryDate: "2026-11-19", remainingSessions: 0, price: 1639.0, refPrice: 1630.0, changePct: 0.55, basis: -3.15, volume: 3_420, valueBillion: 560, foreignNetBillion: 2.1 },
                { code: "VN100F2612", displayCode: "VN100F2M", expiryDate: "2026-12-17", remainingSessions: 8, price: 1643.5, refPrice: 1635.0, changePct: 0.52, basis: 1.35, volume: 890, valueBillion: 146, foreignNetBillion: -0.6 },
              ],
            },
          ],
        },
      }

    case "world_indices":
      return {
        ...base,
        data: {
          rows: [
            { code: "DJI", name: "Dow Jones", country: "Mỹ", isOpen: false, price: 43_520.12, changePct: 0.68, updatedAt: "2026-11-18T04:00:00+07:00" },
            { code: "SPX", name: "S&P 500", country: "Mỹ", isOpen: false, price: 5_918.45, changePct: -0.42, updatedAt: "2026-11-18T04:00:00+07:00" },
            { code: "IXIC", name: "Nasdaq", country: "Mỹ", isOpen: false, price: 18_972.3, changePct: 0.0, updatedAt: "2026-11-18T04:00:00+07:00" },
            { code: "N225", name: "Nikkei 225", country: "Nhật Bản", isOpen: true, price: 38_412.6, changePct: 1.12, updatedAt: "2026-11-18T14:55:00+07:00" },
            { code: "HSI", name: "Hang Seng", country: "Hồng Kông", isOpen: true, price: 19_654.2, changePct: -0.85, updatedAt: "2026-11-18T14:55:00+07:00" },
            { code: "SSEC", name: "Shanghai", country: "Trung Quốc", isOpen: false, price: 3_348.75, changePct: 0.24, updatedAt: "2026-11-18T14:00:00+07:00" },
            { code: "KS11", name: "KOSPI", country: "Hàn Quốc", isOpen: false, price: 2_472.1, changePct: -0.31, updatedAt: "2026-11-18T13:30:00+07:00" },
            { code: "GDAXI", name: "DAX", country: "Đức", isOpen: true, price: 19_215.4, changePct: 0.48, updatedAt: "2026-11-18T14:50:00+07:00" },
            { code: "FTSE", name: "FTSE 100", country: "Anh", isOpen: true, price: 8_112.9, changePct: -0.15, updatedAt: "2026-11-18T14:50:00+07:00" },
            { code: "FCHI", name: "CAC 40", country: "Pháp", isOpen: true, price: 7_285.3, changePct: 0.19, updatedAt: "2026-11-18T14:50:00+07:00" },
            { code: "AXJO", name: "ASX 200", country: "Úc", isOpen: false, price: 8_310.5, changePct: 0.35, updatedAt: "2026-11-18T12:00:00+07:00" },
            { code: "BSESN", name: "Sensex", country: "Ấn Độ", isOpen: true, price: 77_580.4, changePct: -0.22, updatedAt: "2026-11-18T14:55:00+07:00" },
          ],
        },
      }

    case "commodities_fx": {
      const tab = (query.get("tab") || "energy_metals") as "energy_metals" | "agri" | "gold_fx"
      const rowsByTab = {
        energy_metals: [
          { code: "brent", name: "Dầu Brent", unit: "USD/thùng", price: 73.42, changePct: 1.15, mappedSectorName: "Dầu khí", mappedSectorChangePct: 0.94 },
          { code: "wti", name: "Dầu WTI", unit: "USD/thùng", price: 69.28, changePct: -0.64, mappedSectorName: "Dầu khí", mappedSectorChangePct: 0.94 },
          { code: "ngas", name: "Khí tự nhiên", unit: "USD/MMBtu", price: 2.94, changePct: 0.0, mappedSectorName: "Dầu khí", mappedSectorChangePct: 0.94 },
          { code: "hrc", name: "Thép HRC", unit: "USD/tấn", price: 512.0, changePct: -0.82, mappedSectorName: "Thép", mappedSectorChangePct: -0.54 },
          { code: "iron", name: "Quặng sắt", unit: "USD/tấn", price: 101.5, changePct: 0.45, mappedSectorName: "Thép", mappedSectorChangePct: -0.54 },
          { code: "urea", name: "Urê", unit: "USD/tấn", price: 348.0, changePct: 0.72, mappedSectorName: "Phân bón", mappedSectorChangePct: 0.62 },
        ],
        agri: [
          { code: "rubber", name: "Cao su", unit: "JPY/kg", price: 362.5, changePct: 1.28, mappedSectorName: "Cao su tự nhiên", mappedSectorChangePct: 1.1 },
          { code: "sugar", name: "Đường", unit: "USc/lb", price: 21.84, changePct: -0.55, mappedSectorName: "Đường", mappedSectorChangePct: -0.3 },
          { code: "coffee", name: "Cà phê Robusta", unit: "USD/tấn", price: 4_720, changePct: 0.0, mappedSectorName: null, mappedSectorChangePct: null },
        ],
        gold_fx: [
          { code: "xau", name: "Vàng thế giới", unit: "USD/oz", price: 2_632.4, changePct: 0.85, mappedSectorName: null, mappedSectorChangePct: null },
          { code: "sjc", name: "Vàng SJC", unit: "triệu/lượng", price: 85.2, changePct: 0.35, mappedSectorName: null, mappedSectorChangePct: null },
          { code: "usdvnd", name: "USD/VND (VCB bán)", unit: "VND", price: 25_485, changePct: -0.08, mappedSectorName: null, mappedSectorChangePct: null },
          { code: "dxy", name: "Chỉ số DXY", unit: "điểm", price: 106.24, changePct: 0.0, mappedSectorName: null, mappedSectorChangePct: null },
        ],
      }
      return { ...base, data: { tab, rows: rowsByTab[tab] ?? rowsByTab.energy_metals } }
    }

    case "events_calendar": {
      const filter = (query.get("filter") || "all") as "all" | "cash" | "other"
      const allRows = [
        { id: "ev_1", exDate: "2026-11-21", symbol: "VNM", price: 65.2, changePct: 0.8, eventType: "cash", title: "Cổ tức tiền mặt 1.500 đ/cp", cashPerShare: 1500, dividendYieldPct: 2.3 },
        { id: "ev_2", exDate: "2026-11-24", symbol: "FPT", price: 138.5, changePct: 3.36, eventType: "cash", title: "Cổ tức tiền mặt 1.000 đ/cp", cashPerShare: 1000, dividendYieldPct: 0.7 },
        { id: "ev_3", exDate: "2026-11-25", symbol: "MBB", price: 25.4, changePct: 1.6, eventType: "other", title: "Cổ phiếu thưởng 15%", cashPerShare: null, dividendYieldPct: null },
        { id: "ev_4", exDate: "2026-11-27", symbol: "GAS", price: 72.3, changePct: 1.4, eventType: "cash", title: "Cổ tức tiền mặt 3.000 đ/cp", cashPerShare: 3000, dividendYieldPct: 4.1 },
        { id: "ev_5", exDate: "2026-11-29", symbol: "HPG", price: 27.1, changePct: -1.45, eventType: "other", title: "Đại hội cổ đông bất thường", cashPerShare: null, dividendYieldPct: null },
        { id: "ev_6", exDate: "2026-12-02", symbol: "DPM", price: 34.5, changePct: 0.58, eventType: "cash", title: "Cổ tức tiền mặt 2.000 đ/cp", cashPerShare: 2000, dividendYieldPct: 5.8 },
        { id: "ev_7", exDate: "2026-12-04", symbol: "SSI", price: 27.8, changePct: 2.21, eventType: "other", title: "Phát hành quyền mua 10:2", cashPerShare: null, dividendYieldPct: null },
        { id: "ev_8", exDate: "2026-12-08", symbol: "REE", price: 66.0, changePct: 0.0, eventType: "cash", title: "Cổ tức tiền mặt 1.000 đ/cp", cashPerShare: 1000, dividendYieldPct: 1.5 },
      ]
      const rows =
        filter === "cash"
          ? allRows.filter((r) => r.eventType === "cash")
          : filter === "other"
            ? allRows.filter((r) => r.eventType === "other")
            : allRows
      return { ...base, data: { filter, rows } }
    }

    case "market_news":
      return {
        ...base,
        data: {
          enabled: true,
          rows: [
            { id: "news_1", slug: "vn-index-vuot-1700", url: null, category: "Thị trường", title: "VN-Index vượt mốc 1.700 điểm với thanh khoản cải thiện tích cực", publishedAt: "2026-11-18T14:00:00+07:00", source: "IQX" },
            { id: "news_2", slug: "fed-giu-nguyen-lai-suat", url: null, category: "Thế giới", title: "Thị trường Mỹ tích cực trước dữ liệu lạm phát PCE tháng 11", publishedAt: "2026-11-18T12:30:00+07:00", source: "IQX" },
            { id: "news_3", slug: "fpt-tang-truong-loi-nhuan", url: null, category: "Doanh nghiệp", title: "FPT ghi nhận tăng trưởng doanh thu dịch vụ CNTT nước ngoài 28%", publishedAt: "2026-11-18T10:15:00+07:00", source: "IQX" },
            { id: "news_4", slug: "ngan-hang-tin-dung", url: null, category: "Thị trường", title: "Tăng trưởng tín dụng toàn ngành vượt 11% tính đến giữa tháng 11", publishedAt: "2026-11-18T09:05:00+07:00", source: "IQX" },
            { id: "news_5", slug: "gia-dau-brent-phuc-hoi", url: null, category: "Thế giới", title: "Giá dầu Brent tăng hơn 1% sau báo cáo tồn kho năng lượng", publishedAt: "2026-11-18T08:20:00+07:00", source: "IQX" },
            { id: "news_6", slug: "vcb-ke-hoach-co-tuc", url: null, category: "Doanh nghiệp", title: "Vietcombank công bố tiến độ tăng vốn điều lệ từ nguồn lợi nhuận giữ lại", publishedAt: "2026-11-17T16:45:00+07:00", source: "IQX" },
          ],
        },
      }
  }
}

interface MockServerOptions {
  initialPages?: ServerPage[]
  lastActivePageId?: string
  failingWidgets?: WidgetSlug[]
  isMarketOpen?: boolean
  sessionDate?: string
  newsEnabled?: boolean
  emptyCatalog?: boolean
}

async function setupMarketOverview(page: Page, options: MockServerOptions = {}) {
  await mockMember(page)

  // Prevent failed WebSocket proxy noise in console when switching to Giao dịch.
  await page.routeWebSocket("**/api/v2/market-data/ws*", () => {})

  let pages: ServerPage[] = (options.initialPages ?? []).map((p) => ({
    ...p,
    items: p.items.map((it) => ({ ...it, state: { ...it.state } })),
  }))
  let lastActivePageId = options.lastActivePageId ?? "thi-truong"
  let nextId = 1
  const calls: ApiCall[] = []
  const failingWidgets = new Set<WidgetSlug>(options.failingWidgets ?? [])
  const state = {
    isMarketOpen: options.isMarketOpen ?? false,
    sessionDate: options.sessionDate ?? "2026-11-18",
  }
  const templateOptions = {
    newsEnabled: options.newsEnabled ?? false,
    emptyCatalog: options.emptyCatalog ?? false,
  }

  await page.route("**/api/v2/toan-canh/**", async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const pathname = url.pathname.replace(/^.*\/api\/v2/, "")
    const method = req.method()
    let body: unknown = null
    const raw = req.postData()
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        body = raw
      }
    }
    calls.push({ method, path: pathname, search: url.search, body })

    if (method === "GET" && pathname === "/toan-canh/template") {
      return json(route, buildTemplateResponse(templateOptions))
    }

    if (method === "GET" && pathname === "/toan-canh/pages") {
      return json(route, {
        pages: [...pages].sort((a, b) => a.order - b.order),
        lastActivePageId,
        maxPages: 8,
      })
    }

    if (method === "POST" && pathname === "/toan-canh/pages") {
      if (pages.length >= 8) {
        return json(route, { error: { message: "Tối đa 8 trang" } }, 400)
      }
      const input = (body ?? {}) as {
        name?: string
        duplicateFromPageId?: string
        items?: ServerPageItem[]
      }
      const source = input.duplicateFromPageId
        ? pages.find((p) => p.id === input.duplicateFromPageId)
        : undefined
      const rawName = (input.name ?? `Trang ${pages.length + 1}`).trim()
      const name = Array.from(rawName).slice(0, 30).join("") || `Trang ${pages.length + 1}`
      const clonedItems = input.items
        ? input.items.map((it) => ({ ...it, state: { ...(it.state ?? {}) } }))
        : source
          ? source.items.map((it, idx) => ({
              ...it,
              uid: `${it.uid}_dup_${idx}`,
              state: { ...(it.state ?? {}) },
            }))
          : []
      const created: ServerPage = {
        version: 1,
        id: `pg_${nextId++}`,
        name,
        order: pages.length,
        items: clonedItems,
        updatedAt: new Date().toISOString(),
      }
      pages.push(created)
      lastActivePageId = created.id
      return json(route, created, 201)
    }

    if (method === "PATCH" && pathname === "/toan-canh/pages/order") {
      const { pageIds = [] } = (body ?? {}) as { pageIds?: string[] }
      const byId = new Map(pages.map((p) => [p.id, p]))
      const reordered: ServerPage[] = []
      for (const id of pageIds) {
        const found = byId.get(id)
        if (found) {
          reordered.push({ ...found, order: reordered.length })
          byId.delete(id)
        }
      }
      for (const rest of byId.values()) {
        reordered.push({ ...rest, order: reordered.length })
      }
      pages = reordered
      return json(route, { pages })
    }

    if (method === "PUT" && pathname.startsWith("/toan-canh/pages/")) {
      const id = decodeURIComponent(pathname.slice("/toan-canh/pages/".length))
      const input = (body ?? {}) as { name?: string; items?: ServerPageItem[] }
      const idx = pages.findIndex((p) => p.id === id)
      if (idx < 0) return json(route, { error: { message: "Không tìm thấy trang" } }, 404)
      const prev = pages[idx]!
      const updated: ServerPage = {
        ...prev,
        name: input.name !== undefined ? Array.from(input.name.trim()).slice(0, 30).join("") : prev.name,
        items: input.items !== undefined ? input.items.map((it) => ({ ...it, state: { ...(it.state ?? {}) } })) : prev.items,
        updatedAt: new Date().toISOString(),
      }
      pages[idx] = updated
      return json(route, updated)
    }

    if (method === "DELETE" && pathname.startsWith("/toan-canh/pages/")) {
      const id = decodeURIComponent(pathname.slice("/toan-canh/pages/".length))
      pages = pages.filter((p) => p.id !== id).map((p, i) => ({ ...p, order: i }))
      if (lastActivePageId === id) lastActivePageId = "thi-truong"
      return json(route, { deleted: true, id, lastActivePageId })
    }

    if (method === "PUT" && pathname === "/toan-canh/preferences") {
      const input = (body ?? {}) as { lastActivePageId?: string }
      lastActivePageId = input.lastActivePageId || "thi-truong"
      return json(route, { lastActivePageId, updatedAt: new Date().toISOString() })
    }

    if (method === "GET" && pathname.startsWith("/toan-canh/widgets/")) {
      const widget = pathname.slice("/toan-canh/widgets/".length) as WidgetSlug
      if (failingWidgets.has(widget)) {
        return json(route, { error: { message: "Upstream temporarily unavailable" } }, 503)
      }
      return json(route, buildWidgetPayload(widget, url.searchParams, state))
    }

    return route.fallback()
  })

  return {
    calls,
    failingWidgets,
    state,
    templateOptions,
    getPages: () => pages,
  }
}

function collectErrors(page: Page) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text())
  })
  page.on("pageerror", (err) => {
    pageErrors.push(err.message)
  })
  return { consoleErrors, pageErrors }
}

const rail = (page: Page) => page.getByRole("navigation", { name: "Công cụ theo trang" })
const tool = (page: Page, id: string) => rail(page).locator(`[data-tool="${id}"]`)
const frame = (page: Page) => page.getByTestId("workspace-frame")
const widgetCard = (page: Page, slug: WidgetSlug) => page.locator(`article.mo-wg[data-widget="${slug}"]`)

async function waitForAllWidgetsSettled(page: Page, expectedCount: number) {
  await expect(page.locator("article.mo-wg")).toHaveCount(expectedCount, { timeout: 20_000 })
  await expect(page.locator('article.mo-wg [role="status"][aria-label="Đang tải dữ liệu"]')).toHaveCount(0, {
    timeout: 20_000,
  })
  // Allow ResizeObserver + requestAnimationFrame row fitting and chart layout to settle.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 250))),
      ),
  )
}

async function assertZeroPairwiseOverlaps(cards: Locator) {
  const rects = await cards.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return {
        uid: el.getAttribute("data-uid") ?? "",
        widget: el.getAttribute("data-widget") ?? "",
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      }
    }),
  )
  const overlaps: string[] = []
  for (let i = 0; i < rects.length; i += 1) {
    const a = rects[i]!
    expect(a.width, `widget ${a.widget} width`).toBeGreaterThan(80)
    expect(a.height, `widget ${a.widget} height`).toBeGreaterThan(80)
    for (let j = i + 1; j < rects.length; j += 1) {
      const b = rects[j]!
      const intersects =
        a.left < b.right - 1 &&
        a.right > b.left + 1 &&
        a.top < b.bottom - 1 &&
        a.bottom > b.top + 1
      if (intersects) {
        overlaps.push(
          `${a.widget}(${Math.round(a.left)},${Math.round(a.top)},${Math.round(a.right)},${Math.round(a.bottom)}) overlaps ${b.widget}(${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)})`,
        )
      }
    }
  }
  expect(overlaps, "Pairwise widget bounding box overlaps").toEqual([])
  return rects
}

test.describe("Toàn cảnh thị trường (market-overview) · E2E Acceptance", () => {
  test("Test 1 — Shell & Navigation: rail placement, full-width, tool round-trip preserves active tab & scroll, zero console/page errors", async ({ page }) => {
    const errs = collectErrors(page)
    await setupMarketOverview(page, {
      initialPages: [
        {
          version: 1,
          id: "pg_saved",
          name: "Trang lưu sẵn",
          order: 0,
          updatedAt: "2026-11-18T15:00:00+07:00",
          items: [
            { uid: "w_1", widget: "index_chart", x: 0, y: 0, w: 12, h: 9, state: { index: "VNINDEX", range: "intraday" } },
            { uid: "w_2", widget: "market_heatmap", x: 0, y: 9, w: 12, h: 8, state: { mode: "stock", sizeBy: "market_cap" } },
            { uid: "w_3", widget: "sector_performance", x: 0, y: 17, w: 12, h: 7, state: { period: "today", tab: "price" } },
          ],
        },
      ],
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/luyen-tap")
    await expect(rail(page)).toBeVisible({ timeout: 20_000 })
    await expect(tool(page, "toan-canh")).toBeVisible({ timeout: 20_000 })

    // Verify Toàn cảnh thị trường is last in CÔNG CỤ rail.
    const toolIds = await rail(page)
      .locator("[data-tool]")
      .evaluateAll((items) => items.map((el) => el.getAttribute("data-tool")))
    expect(toolIds.at(-1)).toBe("toan-canh")
    await expect(tool(page, "toan-canh")).toHaveText("Toàn cảnh thị trường")

    // Open Toàn cảnh thị trường: full-width left of rail, no side collapse panel.
    await tool(page, "toan-canh").click()
    await expect(page).toHaveURL(/tool=toan-canh/)
    await expect(frame(page)).toHaveAttribute("data-panel-hidden", "true")
    await expect(page.getByTestId("market-overview-page")).toBeVisible()
    await waitForAllWidgetsSettled(page, 13)

    const metrics = await page.evaluate(() => {
      const main = document.querySelector(".workspace-main")!.getBoundingClientRect()
      const railEl = document.querySelector('nav[aria-label="Công cụ theo trang"]')!.getBoundingClientRect()
      return {
        mainLeft: Math.round(main.left),
        mainRight: Math.round(main.right),
        mainWidth: Math.round(main.width),
        railLeft: Math.round(railEl.left),
        railWidth: Math.round(railEl.width),
        viewportWidth: window.innerWidth,
      }
    })
    expect(metrics.mainLeft).toBe(0)
    expect(Math.abs(metrics.mainRight - metrics.railLeft)).toBeLessThanOrEqual(2)
    expect(Math.abs(metrics.mainWidth + metrics.railWidth - metrics.viewportWidth)).toBeLessThanOrEqual(2)

    // Switch to custom user tab and scroll down.
    const savedTab = page.locator('.mo-tb[data-page-id="pg_saved"]')
    await savedTab.click()
    await expect(savedTab).toHaveAttribute("aria-selected", "true")
    await waitForAllWidgetsSettled(page, 3)

    const targetScroll = 420
    await page.locator(".mo-content").evaluate((el, y) => {
      el.scrollTop = y
      el.dispatchEvent(new Event("scroll"))
    }, targetScroll)
    await expect
      .poll(() => page.locator(".mo-content").evaluate((el) => Math.round(el.scrollTop)))
      .toBeGreaterThanOrEqual(targetScroll - 20)

    // Switch to Giao dịch -> restores Demo Trading panels cleanly.
    await tool(page, "giao-dich").click()
    await expect(page).toHaveURL(/tool=giao-dich/)
    await expect(frame(page)).toHaveAttribute("data-panel-hidden", "false")
    await expect(page.getByRole("tablist", { name: "Nội dung giao dịch" }).getByRole("tab")).toHaveText([
      "Biểu đồ",
      "Bảng giá",
      "Thị trường",
    ])
    await expect(page.getByRole("complementary", { name: "Giao dịch" })).toBeVisible()

    // Switch back to Toàn cảnh thị trường -> restores active tab & scrollTop.
    await tool(page, "toan-canh").click()
    await expect(page.getByTestId("market-overview-page")).toBeVisible()
    await expect(page.locator('.mo-tb[data-page-id="pg_saved"]')).toHaveAttribute("aria-selected", "true")
    await expect
      .poll(() => page.locator(".mo-content").evaluate((el) => Math.round(el.scrollTop)))
      .toBeGreaterThanOrEqual(targetScroll - 25)

    expect(errs.consoleErrors, "Console errors").toEqual([])
    expect(errs.pageErrors, "Uncaught page errors").toEqual([])
  })

  test("Test 2 — Locked Thị trường tab: 13 widgets, 0 overlaps, zero edit chrome, internal switches work, ticker click navigates to /co-phieu/:symbol", async ({ page }) => {
    const errs = collectErrors(page)
    const server = await setupMarketOverview(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/luyen-tap?tool=toan-canh")
    await waitForAllWidgetsSettled(page, 13)

    // All 13 widgets rendered in template.
    const renderedSlugs = await page
      .locator("article.mo-wg")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-widget")))
    expect(renderedSlugs).toEqual(TEMPLATE_ITEMS.map((item) => item.widget))

    // Pairwise 0 overlaps check.
    await assertZeroPairwiseOverlaps(page.locator("article.mo-wg"))

    // Zero top-right action buttons, zero delete X, zero slots, zero resize handles.
    await expect(page.locator(".mo-tact")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Xếp gọn" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /Khoá bố cục/ })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /Thêm widget/ })).toHaveCount(0)
    await expect(page.locator(".mo-del")).toHaveCount(0)
    await expect(page.locator(".mo-slot")).toHaveCount(0)
    await expect(page.locator(".mo-rz, .mo-rzr, .mo-rzb")).toHaveCount(0)

    // Internal mode switches work cleanly without persisting PUT /pages/*.
    const indexWidget = widgetCard(page, "index_chart")
    await indexWidget.locator("button.mo-ixcard", { hasText: "VN30" }).first().click()
    await expect(indexWidget.locator("button.mo-ixcard.on")).toContainText("VN30")
    await expect(indexWidget.locator(".mo-ixv")).toContainText("1.806,54")

    const foreignWidget = widgetCard(page, "foreign_flow")
    await foreignWidget.getByRole("tab", { name: "Tự doanh" }).click()
    await expect(foreignWidget.getByRole("tab", { name: "Tự doanh" })).toHaveAttribute("aria-selected", "true")
    await expect(foreignWidget).toContainText("+185,4 tỷ")

    const heatWidget = widgetCard(page, "market_heatmap")
    await heatWidget.locator(".mo-seg button", { hasText: "Ngành" }).click()
    await expect(heatWidget.locator(".mo-seg button.on", { hasText: "Ngành" })).toBeVisible()

    const sectorWidget = widgetCard(page, "sector_performance")
    await sectorWidget.getByRole("tab", { name: "Dòng tiền" }).click()
    await expect(sectorWidget).toContainText("% GTGD")
    await expect(sectorWidget).toContainText("so TB20")

    const eventsWidget = widgetCard(page, "events_calendar")
    await eventsWidget.locator(".mo-seg button", { hasText: "Cổ tức tiền" }).click()
    await expect(eventsWidget.locator(".mo-seg button.on")).toHaveText("Cổ tức tiền")
    await expect(eventsWidget).not.toContainText("Đại hội cổ đông bất thường")

    // Template switches must be ephemeral (zero PUT /toan-canh/pages/*).
    expect(server.calls.filter((c) => c.method === "PUT" && c.path.startsWith("/toan-canh/pages/"))).toEqual([])

    // Clicking a stock ticker navigates to /co-phieu/:symbol.
    const featuredWidget = widgetCard(page, "featured_stocks")
    await featuredWidget.getByRole("link", { name: "FPT" }).first().click()
    await expect(page).toHaveURL(/\/co-phieu\/FPT$/)

    // Return to Thị trường and verify switching index_chart from Trong phiên -> 3 tháng.
    await page.goto("/luyen-tap?tool=toan-canh&page=thi-truong")
    await waitForAllWidgetsSettled(page, 13)
    const indexWidgetAfterReturn = widgetCard(page, "index_chart")
    await indexWidgetAfterReturn.locator("button.mo-ixcard", { hasText: "VN30" }).first().click()
    await indexWidgetAfterReturn.locator(".mo-seg button", { hasText: "3 tháng" }).click()
    await expect(indexWidgetAfterReturn.locator(".mo-seg button.on")).toHaveText("3 tháng")
    await expect
      .poll(() =>
        server.calls.some(
          (c) =>
            c.path === "/toan-canh/widgets/index_chart" &&
            c.search.includes("index=VN30") &&
            c.search.includes("range=3m"),
        ),
      )
      .toBe(true)

    expect(errs.consoleErrors, "Console errors").toEqual([])
    expect(errs.pageErrors, "Uncaught page errors").toEqual([])
  })

  test("Test 3 — Custom Pages CRUD, 400px Drawer, Search, 5 Consecutive Adds, 8-Page Limit, Rename, Duplicate & Undoable Delete", async ({ page }) => {
    const errs = collectErrors(page)
    const server = await setupMarketOverview(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/luyen-tap?tool=toan-canh")
    await waitForAllWidgetsSettled(page, 13)

    // 1. Click ＋ -> creates Trang 1 and opens 400px drawer (default 15 widgets; market_news hidden).
    await page.locator("button.mo-tadd").click()
    await expect(page.locator(".mo-tb.on .mo-tn")).toHaveText("Trang 1")
    const drawer = page.locator("aside.mo-dr.open")
    await expect(drawer).toBeVisible()
    await expect(drawer.locator(".mo-dr-tt .mo-note")).toHaveText("15 widget")
    const drawerBox = await drawer.boundingBox()
    expect(Math.round(drawerBox!.width)).toBe(400)

    // 2. Search Vietnamese diacritic-insensitive keywords.
    const searchInput = drawer.getByPlaceholder("Tìm widget")
    await searchInput.fill("khoi ngoai")
    await expect(drawer.locator(".mo-it .mo-nm", { hasText: "Khối ngoại và tự doanh" })).toBeVisible()
    await searchInput.fill("tu doanh")
    await expect(drawer.locator(".mo-it .mo-nm", { hasText: "Khối ngoại và tự doanh" })).toBeVisible()
    await searchInput.fill("basis")
    await expect(drawer.locator(".mo-it .mo-nm", { hasText: "Tổng quan phái sinh" })).toBeVisible()
    await expect(drawer.locator(".mo-it .mo-nm", { hasText: "VN30F1M so với VN30" })).toBeVisible()
    await expect(drawer.locator(".mo-it .mo-nm", { hasText: "Bảng hợp đồng tương lai" })).toBeVisible()
    await searchInput.fill("vang")
    await expect(drawer.locator(".mo-it .mo-nm", { hasText: "Hàng hoá và tỷ giá" })).toBeVisible()
    await searchInput.fill("")

    // 3. Add 5 widgets consecutively (including 1 duplicate) -> drawer stays open, counts & undo toast accurate, drawer doesn't obscure added widgets.
    await drawer.getByRole("button", { name: "Thêm Biểu đồ chỉ số vào trang" }).click()
    await expect(drawer).toBeVisible()
    await expect(page.locator(".mo-toast")).toContainText("Đã thêm “Biểu đồ chỉ số”")
    await expect(page.locator(".mo-toast button")).toHaveText("Hoàn tác")

    // Verify drawer push mode does NOT obscure newly added widget.
    await page.waitForTimeout(260) // allow 0.22s margin-right transition
    const firstWidgetBox = await page.locator("article.mo-wg").first().boundingBox()
    const liveDrawerBox = await drawer.boundingBox()
    expect(firstWidgetBox!.x + firstWidgetBox!.width).toBeLessThanOrEqual(liveDrawerBox!.x + 2)

    await drawer.getByRole("button", { name: "Thêm Độ rộng thị trường vào trang" }).click()
    await drawer.getByRole("button", { name: "Thêm Độ rộng thị trường vào trang" }).click() // duplicate -> ✓ ×2

    // Open Phái sinh group and add 2 more widgets (total 5 widgets added consecutively).
    await drawer.locator("button.mo-gh", { hasText: "Phái sinh" }).click()
    await drawer.getByRole("button", { name: "Thêm VN30F1M so với VN30 vào trang" }).click()
    await drawer.getByRole("button", { name: "Thêm Bảng hợp đồng tương lai vào trang" }).click()

    await expect(drawer).toBeVisible()
    await expect(page.locator("article.mo-wg")).toHaveCount(5)

    // Verify ✓, ✓ ×2, and "n đã thêm" (unique types per group).
    const idxRow = drawer.locator(".mo-it", { hasText: "Biểu đồ chỉ số" })
    await expect(idxRow.locator(".mo-hv")).toHaveText("✓")
    const breadthRow = drawer.locator(".mo-it", { hasText: "Độ rộng thị trường" })
    await expect(breadthRow.locator(".mo-hv")).toHaveText("✓ ×2")
    await expect(drawer.locator("button.mo-gh", { hasText: "Chỉ số" })).toContainText("2 đã thêm")
    await expect(drawer.locator("button.mo-gh", { hasText: "Phái sinh" })).toContainText("2 đã thêm")

    // Test 5s undo toast on widget add (add a 6th widget then immediately Undo).
    await drawer.getByRole("button", { name: "Thêm Thanh khoản thị trường vào trang" }).click()
    await expect(page.locator("article.mo-wg")).toHaveCount(6)
    await expect(page.locator(".mo-toast")).toContainText("Đã thêm “Thanh khoản thị trường”")
    await page.locator(".mo-toast button", { hasText: "Hoàn tác" }).click()
    await expect(page.locator("article.mo-wg")).toHaveCount(5)

    // Close drawer via Xong.
    await drawer.getByRole("button", { name: "Xong" }).click()
    await expect(page.locator("aside.mo-dr.open")).toHaveCount(0)

    // 4. Create pages up to 8 -> succeeds; 9th attempt shows "Tối đa 8 trang".
    for (let n = 2; n <= 8; n += 1) {
      await page.locator("button.mo-tadd").click()
      await expect(page.locator(".mo-tb.on .mo-tn")).toHaveText(`Trang ${n}`)
      // Close auto-opened drawer so tab strip interactions remain unobstructed.
      await page.keyboard.press("Escape")
    }
    // 1 system tab + 8 user tabs = 9 tabs total.
    await expect(page.locator(".mo-tb")).toHaveCount(9)

    await page.locator("button.mo-tadd").click()
    await expect(page.locator(".mo-toast")).toHaveText("Tối đa 8 trang")
    await expect(page.locator(".mo-tb")).toHaveCount(9)

    // 5. Rename Trang 8 to a long 28-char name (tests 1..30 chars + duplicate truncation <= 30 chars).
    const tab8 = page.locator(".mo-tb").nth(8)
    await tab8.click()
    await tab8.locator("button.mo-tm").click()
    await page.getByRole("menuitem", { name: "Đổi tên" }).click()
    const renameInput = page.locator("input.mo-tni")
    await expect(renameInput).toBeFocused()
    const longName = "Trang theo dõi thị trường VN" // 28 chars
    await renameInput.fill(longName)
    await renameInput.press("Enter")
    await expect(page.locator(".mo-tb.on .mo-tn")).toHaveText(longName)

    // 6. Undoable delete (Case A: Undo restores tab & sends ZERO DELETE API).
    const tab7 = page.locator(".mo-tb").nth(7)
    const tab7Name = (await tab7.locator(".mo-tn").textContent())!.trim()
    const tab7Id = (await tab7.getAttribute("data-page-id"))!
    await tab7.click()
    await tab7.locator("button.mo-tm").click()
    await page.getByRole("menuitem", { name: "Xoá trang" }).click()

    await expect(page.locator(".mo-tb")).toHaveCount(8)
    await expect(page.locator(".mo-toast")).toContainText(`Đã xoá “${tab7Name}”`)
    await page.locator(".mo-toast button", { hasText: "Hoàn tác" }).click()
    await expect(page.locator(".mo-tb")).toHaveCount(9)
    await expect(page.locator(".mo-tb").nth(7).locator(".mo-tn")).toHaveText(tab7Name)
    expect(server.calls.filter((c) => c.method === "DELETE" && c.path === `/toan-canh/pages/${tab7Id}`)).toEqual([])

    // 7. Undoable delete (Case B: Timer-expired sends DELETE API after 5s window).
    const deleteTarget = page.locator(".mo-tb").nth(7)
    const deleteId = (await deleteTarget.getAttribute("data-page-id"))!
    await deleteTarget.click()
    await deleteTarget.locator("button.mo-tm").click()
    await page.getByRole("menuitem", { name: "Xoá trang" }).click()

    await expect(page.locator(".mo-tb")).toHaveCount(8)
    // Immediately after deletion (within 5s window), DELETE must NOT have been sent yet.
    await page.waitForTimeout(400)
    expect(server.calls.filter((c) => c.method === "DELETE" && c.path === `/toan-canh/pages/${deleteId}`)).toHaveLength(0)

    // Wait for the 5-second undo timer to expire -> DELETE fires.
    await expect
      .poll(() => server.calls.filter((c) => c.method === "DELETE" && c.path === `/toan-canh/pages/${deleteId}`).length, {
        timeout: 8_000,
      })
      .toBe(1)

    // 8. Duplicate long-named page (now 7 pages -> 8 pages) and assert duplicate name length <= 30 chars.
    const longTab = page.locator(".mo-tb", { hasText: longName })
    await longTab.click()
    await longTab.locator("button.mo-tm").click()
    await page.getByRole("menuitem", { name: "Nhân bản" }).click()
    await expect(page.locator(".mo-toast")).toContainText("Đã nhân bản trang")
    const dupName = (await page.locator(".mo-tb.on .mo-tn").textContent())!.trim()
    expect(dupName.endsWith(" (bản sao)")).toBe(true)
    expect(Array.from(dupName).length).toBeLessThanOrEqual(30)

    expect(errs.consoleErrors, "Console errors").toEqual([])
    expect(errs.pageErrors, "Uncaught page errors").toEqual([])
  })

  test("Test 4 — Grid Drag, Resize with live w×h badge, Empty Slots & Giãn, Xếp gọn & Khoá bố cục", async ({ page }) => {
    const errs = collectErrors(page)
    await setupMarketOverview(page, {
      lastActivePageId: "pg_grid",
      initialPages: [
        {
          version: 1,
          id: "pg_grid",
          name: "Trang lưới",
          order: 0,
          updatedAt: "2026-11-18T15:00:00+07:00",
          items: [
            { uid: "w_breadth", widget: "market_breadth", x: 0, y: 0, w: 4, h: 3, state: {} },
            { uid: "w_deriv", widget: "derivatives_summary", x: 8, y: 0, w: 4, h: 3, state: {} },
          ],
        },
      ],
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/luyen-tap?tool=toan-canh&page=pg_grid")
    await waitForAllWidgetsSettled(page, 2)

    const breadthCard = page.locator('article.mo-wg[data-uid="w_breadth"]')
    const derivCard = page.locator('article.mo-wg[data-uid="w_deriv"]')

    // 1. Empty hole exists between w_breadth (0..4) and w_deriv (8..12) with "Giãn ... ra đây".
    const middleHole = page.locator('.mo-slot[data-slot-hole="4,0,4,3"]')
    await expect(middleHole).toBeVisible()
    const expandBtn = middleHole.locator("button[data-slotgrow]")
    await expect(expandBtn).toContainText("Giãn")
    await expect(expandBtn).toContainText("ra đây")

    const widthBeforeExpand = (await breadthCard.boundingBox())!.width
    await expandBtn.click()
    await expect(middleHole).toHaveCount(0)
    const widthAfterExpand = (await breadthCard.boundingBox())!.width
    expect(widthAfterExpand).toBeGreaterThan(widthBeforeExpand + 200)
    await assertZeroPairwiseOverlaps(page.locator("article.mo-wg"))

    // 2. Resize w_breadth narrower + taller via corner handle (.mo-rz) and verify live w×h badge.
    const cornerHandle = breadthCard.locator(".mo-rz")
    const handleBox = await cornerHandle.boundingBox()
    const startX = handleBox!.x + handleBox!.width / 2
    const startY = handleBox!.y + handleBox!.height / 2

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    // Drag left by ~320px (shrink w from 8 -> ~5) and down by ~140px (grow h from 3 -> 5).
    await page.mouse.move(startX - 320, startY + 140, { steps: 10 })

    const badge = breadthCard.locator(".mo-rbadge")
    await expect(badge).toBeVisible()
    const badgeText = (await badge.textContent())!.trim()
    expect(badgeText).toMatch(/^\d+×\d+$/)

    await page.mouse.up()
    await expect(badge).toHaveCount(0)

    const boxAfterResize = (await breadthCard.boundingBox())!
    expect(boxAfterResize.width).toBeLessThan(widthAfterExpand - 100)
    expect(boxAfterResize.height).toBeGreaterThan(220)
    await assertZeroPairwiseOverlaps(page.locator("article.mo-wg"))

    // 3. Drag w_deriv header to move it below w_breadth (creates internal gap).
    const derivBefore = (await derivCard.boundingBox())!
    const derivHeader = (await derivCard.locator(".mo-wh").boundingBox())!
    const dragStartX = derivHeader.x + 60
    const dragStartY = derivHeader.y + derivHeader.height / 2

    await page.mouse.move(dragStartX, dragStartY)
    await page.mouse.down()
    await page.mouse.move(dragStartX - 300, dragStartY + 380, { steps: 12 })
    await page.mouse.up()

    const derivAfter = (await derivCard.boundingBox())!
    expect(Math.hypot(derivAfter.x - derivBefore.x, derivAfter.y - derivBefore.y)).toBeGreaterThan(40)
    await assertZeroPairwiseOverlaps(page.locator("article.mo-wg"))

    // 4. Xếp gọn eliminates gaps and shows toast "Đã xếp gọn bố cục".
    // Make sure both widgets fit cleanly on row 0 (w_breadth <= 6, w_deriv = 4) or verify hole disappears after Xếp gọn.
    // First drag w_deriv to x=8, y=5 so there is a clear gap on the top-right / left before Xếp gọn.
    const holesBeforePack = await page.locator(".mo-slot:not(.end)").count()
    expect(holesBeforePack).toBeGreaterThan(0)
    await page.getByRole("button", { name: "Xếp gọn" }).click()
    await expect(page.locator(".mo-toast")).toContainText("Đã xếp gọn bố cục")
    await assertZeroPairwiseOverlaps(page.locator("article.mo-wg"))
    // Verify w_deriv compacted to y=0 (same top as w_breadth) after Xếp gọn.
    const bRect = (await breadthCard.boundingBox())!
    const dRect = (await derivCard.boundingBox())!
    expect(Math.abs(dRect.y - bRect.y)).toBeLessThanOrEqual(2)

    // 5. Khoá bố cục hides resize handles, ✕ buttons, and slots; resets on tab switch.
    await page.getByRole("button", { name: "Khoá bố cục" }).click()
    await expect(page.getByRole("button", { name: "Mở khoá bố cục" })).toBeVisible()
    await expect(page.locator(".mo-rz:visible, .mo-rzr:visible, .mo-rzb:visible")).toHaveCount(0)
    await expect(page.locator(".mo-del:visible")).toHaveCount(0)
    await expect(page.locator(".mo-slot:visible")).toHaveCount(0)

    // Switch to Thị trường and back -> lock resets to unlocked.
    await page.locator('.mo-tb[data-page-id="thi-truong"]').click()
    await expect(page.locator("article.mo-wg")).toHaveCount(13)
    await page.locator('.mo-tb[data-page-id="pg_grid"]').click()
    await expect(page.getByRole("button", { name: "Khoá bố cục" })).toBeVisible()
    await expect(page.locator(".mo-rz")).toHaveCount(2)
    await expect(page.locator(".mo-del")).toHaveCount(2)
    await expect(page.locator(".mo-slot.end")).toHaveCount(1)

    expect(errs.consoleErrors, "Console errors").toEqual([])
    expect(errs.pageErrors, "Uncaught page errors").toEqual([])
  })

  test("Test 5 — No Internal Scrollbars across all 16 widgets & Index Card (.mo-ixc) never overflows horizontally", async ({ page }) => {
    const errs = collectErrors(page)
    await setupMarketOverview(page, {
      initialPages: [
        {
          version: 1,
          id: "pg_extra3",
          name: "3 Widget bổ sung",
          order: 0,
          updatedAt: "2026-11-18T15:00:00+07:00",
          items: [
            { uid: "w_fvs", widget: "vn30f_vs_vn30", x: 0, y: 0, w: 6, h: 6, state: { range: "intraday" } },
            { uid: "w_news", widget: "market_news", x: 6, y: 0, w: 6, h: 6, state: {} },
            { uid: "w_fut", widget: "futures_table", x: 0, y: 6, w: 8, h: 7, state: {} },
            { uid: "w_ix_min", widget: "index_chart", x: 0, y: 13, w: 5, h: 5, state: { index: "VNINDEX", range: "intraday" } },
          ],
        },
      ],
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/luyen-tap?tool=toan-canh")
    await waitForAllWidgetsSettled(page, 13)

    // Check all 13 template widgets' .mo-wb scrollHeight/scrollWidth AND .mo-ixc horizontal overflow.
    const measureScrollViolations = async () =>
      page.evaluate(() => {
        const violations: string[] = []
        document.querySelectorAll<HTMLElement>("article.mo-wg").forEach((card) => {
          const slug = card.getAttribute("data-widget") ?? "unknown"
          const wb = card.querySelector<HTMLElement>(".mo-wb")
          if (!wb) return
          const dy = wb.scrollHeight - wb.clientHeight
          const dx = wb.scrollWidth - wb.clientWidth
          if (dy > 2 || dx > 2) {
            violations.push(
              `${slug}: scrollHeight=${wb.scrollHeight} clientHeight=${wb.clientHeight} (dy=${dy}), scrollWidth=${wb.scrollWidth} clientWidth=${wb.clientWidth} (dx=${dx})`,
            )
          }
        })
        const ixc = document.querySelector<HTMLElement>(".mo-ixc")
        const ixcOverflow = ixc ? ixc.scrollWidth - ixc.clientWidth : 0
        return { violations, ixcOverflow, ixcFound: Boolean(ixc) }
      })

    const templateCheck = await measureScrollViolations()
    expect(templateCheck.ixcFound).toBe(true)
    expect(templateCheck.ixcOverflow, ".mo-ixc horizontal overflow at 1440px").toBeLessThanOrEqual(1)
    expect(templateCheck.violations, "Template widget .mo-wb internal scrollbars").toEqual([])

    // Also check .mo-ixc at 1024px (narrower index card step-down).
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.waitForTimeout(300)
    const check1024 = await measureScrollViolations()
    expect(check1024.ixcOverflow, ".mo-ixc horizontal overflow at 1024px").toBeLessThanOrEqual(1)
    expect(check1024.violations, "Template widget .mo-wb internal scrollbars at 1024px").toEqual([])

    // Check the remaining 3 catalog widgets + min-size index_chart on custom tab at 1440px.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('.mo-tb[data-page-id="pg_extra3"]').click()
    await waitForAllWidgetsSettled(page, 4)
    const extraCheck = await measureScrollViolations()
    expect(extraCheck.ixcOverflow, "min-size index_chart .mo-ixc overflow").toBeLessThanOrEqual(1)
    expect(extraCheck.violations, "Extra 3 + min-size widgets .mo-wb internal scrollbars").toEqual([])

    expect(errs.consoleErrors, "Console errors").toEqual([])
    expect(errs.pageErrors, "Uncaught page errors").toEqual([])
  })

  test("Test 6 — Light & Dark Theme Parity, Semantic % Colors & Visual Screenshots", async ({ page }) => {
    const errs = collectErrors(page)
    await setupMarketOverview(page, {
      initialPages: [
        {
          version: 1,
          id: "pg_shot",
          name: "Trang cá nhân",
          order: 0,
          updatedAt: "2026-11-18T15:00:00+07:00",
          items: [
            { uid: "w_s1", widget: "index_chart", x: 0, y: 0, w: 8, h: 9, state: { index: "VNINDEX", range: "intraday" } },
            { uid: "w_s2", widget: "market_breadth", x: 8, y: 0, w: 4, h: 3, state: {} },
            { uid: "w_s3", widget: "derivatives_summary", x: 8, y: 3, w: 4, h: 6, state: {} },
          ],
        },
      ],
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/luyen-tap?tool=toan-canh")
    await waitForAllWidgetsSettled(page, 13)

    const readThemeTokens = () =>
      page.evaluate(() => {
        const root = document.querySelector<HTMLElement>(".mo-root")!
        const cs = getComputedStyle(root)
        return {
          isDark: document.documentElement.classList.contains("dark"),
          canvas: cs.getPropertyValue("--mo-canvas").trim(),
          panel: cs.getPropertyValue("--mo-panel").trim(),
          tx: cs.getPropertyValue("--mo-tx").trim(),
          up: cs.getPropertyValue("--mo-up").trim(),
          dn: cs.getPropertyValue("--mo-dn").trim(),
          ref: cs.getPropertyValue("--mo-ref").trim(),
        }
      })

    const darkTokens = await readThemeTokens()
    expect(darkTokens.isDark).toBe(true)
    expect(darkTokens.canvas.toUpperCase()).toBe("#0A1424")
    expect(darkTokens.panel.toUpperCase()).toBe("#0F1B2E")
    expect(darkTokens.tx.toUpperCase()).toBe("#EEF3FA")

    // Capture Dark 1440 screenshot (viewport + lower band).
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-market-dark-1440.png") })

    // Verify world_indices and commodities_fx semantic green/red/yellow % colors.
    const checkSemanticColors = async (slug: "world_indices" | "commodities_fx") => {
      const card = widgetCard(page, slug)
      const colors = await card.evaluate((el) => {
        const upEl = el.querySelector<HTMLElement>(".mo-rowit .r .mo-up")
        const dnEl = el.querySelector<HTMLElement>(".mo-rowit .r .mo-dn")
        const rfEl = el.querySelector<HTMLElement>(".mo-rowit .r .mo-rf")
        return {
          up: upEl ? getComputedStyle(upEl).color : null,
          dn: dnEl ? getComputedStyle(dnEl).color : null,
          rf: rfEl ? getComputedStyle(rfEl).color : null,
        }
      })
      expect(colors.up, `${slug} positive % green color`).toBeTruthy()
      expect(colors.dn, `${slug} negative % red color`).toBeTruthy()
      expect(colors.rf, `${slug} flat 0% yellow color`).toBeTruthy()
      expect(colors.up).not.toBe(colors.dn)
      expect(colors.up).not.toBe(colors.rf)
      expect(colors.dn).not.toBe(colors.rf)
      return colors
    }

    const darkWorldColors = await checkSemanticColors("world_indices")
    const darkCmdColors = await checkSemanticColors("commodities_fx")
    // In dark theme: --mo-up = rgb(31, 193, 107), --mo-dn = rgb(240, 69, 58), --mo-ref = rgb(245, 184, 0)
    expect(darkWorldColors.up).toBe("rgb(31, 193, 107)")
    expect(darkWorldColors.dn).toBe("rgb(240, 69, 58)")
    expect(darkWorldColors.rf).toBe("rgb(245, 184, 0)")
    expect(darkCmdColors).toEqual(darkWorldColors)

    // Switch to User Page + Open Drawer in Dark theme -> capture 03-user-page-drawer-dark-1440.png
    await page.locator('.mo-tb[data-page-id="pg_shot"]').click()
    await waitForAllWidgetsSettled(page, 3)
    await page.getByRole("button", { name: "＋ Thêm widget" }).first().click()
    await expect(page.locator("aside.mo-dr.open")).toBeVisible()
    await page.waitForTimeout(260)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-user-page-drawer-dark-1440.png") })
    await page.keyboard.press("Escape")

    // Switch back to Thị trường & toggle to Light theme.
    await page.locator('.mo-tb[data-page-id="thi-truong"]').click()
    await waitForAllWidgetsSettled(page, 13)
    await page.getByRole("button", { name: "Chế độ sáng" }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false)
    await page.waitForTimeout(250)

    const lightTokens = await readThemeTokens()
    expect(lightTokens.isDark).toBe(false)
    expect(lightTokens.canvas.toUpperCase()).toBe("#F3F6FA")
    expect(lightTokens.panel.toUpperCase()).toBe("#FFFFFF")
    expect(lightTokens.tx.toUpperCase()).toBe("#0F172A")
    expect(lightTokens.canvas).not.toBe(darkTokens.canvas)
    expect(lightTokens.panel).not.toBe(darkTokens.panel)
    expect(lightTokens.tx).not.toBe(darkTokens.tx)

    // Verify Light semantic colors too.
    const lightWorldColors = await checkSemanticColors("world_indices")
    expect(lightWorldColors.up).toBe("rgb(14, 159, 87)")
    expect(lightWorldColors.dn).toBe("rgb(224, 53, 43)")
    expect(lightWorldColors.rf).toBe("rgb(194, 142, 0)")

    // Capture Light 1440 screenshot.
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-market-light-1440.png") })

    expect(errs.consoleErrors, "Console errors").toEqual([])
    expect(errs.pageErrors, "Uncaught page errors").toEqual([])
  })

  test("Test 7 — Narrow <740px Responsive Mode (680×900 & 390×844): 1-col stack, 0 horizontal overflow, 0 resize handles or slots", async ({ page }) => {
    const errs = collectErrors(page)
    await setupMarketOverview(page, {
      initialPages: [
        {
          version: 1,
          id: "pg_narrow",
          name: "Trang di động",
          order: 0,
          updatedAt: "2026-11-18T15:00:00+07:00",
          items: [
            { uid: "wn_1", widget: "market_breadth", x: 0, y: 0, w: 4, h: 3, state: {} },
            { uid: "wn_2", widget: "derivatives_summary", x: 8, y: 0, w: 4, h: 7, state: {} },
          ],
        },
      ],
    })

    for (const vp of [
      { width: 680, height: 900, shotName: "04-narrow-680.png" as string | null },
      { width: 390, height: 844, shotName: null },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto("/luyen-tap?tool=toan-canh&page=thi-truong")
      await waitForAllWidgetsSettled(page, 13)

      // Zero horizontal overflow on document and .mo-content.
      const overflowCheck = await page.evaluate(() => {
        const content = document.querySelector<HTMLElement>(".mo-content")!
        return {
          docOverflow: document.documentElement.scrollWidth - window.innerWidth,
          contentOverflow: content.scrollWidth - content.clientWidth,
        }
      })
      expect(overflowCheck.docOverflow, `document horizontal overflow at ${vp.width}px`).toBeLessThanOrEqual(1)
      expect(overflowCheck.contentOverflow, `.mo-content horizontal overflow at ${vp.width}px`).toBeLessThanOrEqual(1)

      // Verify 1-column stack: identical lefts, strictly increasing tops.
      const rects = await assertZeroPairwiseOverlaps(page.locator("article.mo-wg"))
      const firstLeft = rects[0]!.left
      for (let i = 1; i < rects.length; i += 1) {
        expect(Math.abs(rects[i]!.left - firstLeft), `1-col left alignment idx=${i} at ${vp.width}px`).toBeLessThanOrEqual(2)
        expect(rects[i]!.top, `1-col vertical order idx=${i} at ${vp.width}px`).toBeGreaterThanOrEqual(rects[i - 1]!.bottom - 1)
      }

      if (vp.shotName) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, vp.shotName) })
      }

      // Switch to unlocked user page -> verify zero visible resize handles & zero visible empty slots!
      await page.locator('.mo-tb[data-page-id="pg_narrow"]').click()
      await waitForAllWidgetsSettled(page, 2)
      await expect(page.locator(".mo-rz:visible, .mo-rzr:visible, .mo-rzb:visible")).toHaveCount(0)
      await expect(page.locator(".mo-slot:visible")).toHaveCount(0)
    }

    expect(errs.consoleErrors, "Console errors").toEqual([])
    expect(errs.pageErrors, "Uncaught page errors").toEqual([])
  })

  test("Test 8 — Single-Widget Error Isolation (world_indices 503 + Retry recovery) & Off-Hours Phiên dd/mm badge", async ({ page }) => {
    const server = await setupMarketOverview(page, {
      failingWidgets: ["world_indices"],
      isMarketOpen: false,
      sessionDate: "2026-11-18",
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/luyen-tap?tool=toan-canh")

    await expect(page.locator("article.mo-wg")).toHaveCount(13)
    await expect(page.locator('article.mo-wg [role="status"][aria-label="Đang tải dữ liệu"]')).toHaveCount(0, {
      timeout: 15_000,
    })

    // world_indices shows isolated error + Retry button.
    const worldCard = widgetCard(page, "world_indices")
    await expect(worldCard.getByRole("alert")).toContainText("Chưa tải được dữ liệu")
    const retryBtn = worldCard.getByRole("button", { name: "Tải lại" })
    await expect(retryBtn).toBeVisible()

    // The other 12 widgets render normally with ZERO alert error states.
    await expect(page.locator('article.mo-wg:not([data-widget="world_indices"]) [role="alert"]')).toHaveCount(0)
    await expect(widgetCard(page, "index_chart")).toContainText("1.703,01")
    await expect(widgetCard(page, "market_breadth")).toContainText("HOSE")
    await expect(widgetCard(page, "derivatives_summary")).toContainText("1.800,7")
    await expect(widgetCard(page, "commodities_fx")).toContainText("Dầu Brent")

    // Verify off-hours "Phiên 18/11" badge renders cleanly across VN widgets (including [M9] 4 widgets).
    await expect(widgetCard(page, "index_chart").locator(".mo-ixdate")).toHaveText("Phiên 18/11")
    await expect(widgetCard(page, "foreign_flow")).toContainText("Phiên 18/11")
    await expect(widgetCard(page, "derivatives_summary")).toContainText("Phiên 18/11")
    await expect(widgetCard(page, "vnindex_impact")).toContainText("Phiên 18/11")
    await expect(widgetCard(page, "market_heatmap")).toContainText("Phiên 18/11")
    await expect(widgetCard(page, "featured_stocks")).toContainText("Phiên 18/11")
    await expect(widgetCard(page, "sector_performance")).toContainText("Phiên 18/11")

    // Recover world_indices -> click "Tải lại" -> loads cleanly.
    server.failingWidgets.delete("world_indices")
    await retryBtn.click()
    await expect(worldCard.getByRole("alert")).toHaveCount(0)
    await expect(worldCard).toContainText("Dow Jones")
    await expect(worldCard).toContainText("S&P 500")
  })

  test("Test 9 — [H11] Catalog fallback hides market_news (15 widget) by default and dynamically shows Tin thị trường (16 widget) when enabled", async ({ page }) => {
    const errs = collectErrors(page)

    // 1. Fallback when /template returns empty catalog -> DEFAULT_ENABLED_WIDGET_LIST (15 widget, no Tin thị trường)
    const server = await setupMarketOverview(page, { emptyCatalog: true })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/luyen-tap?tool=toan-canh")
    await waitForAllWidgetsSettled(page, 13)

    await page.locator("button.mo-tadd").click()
    const drawerFallback = page.locator("aside.mo-dr.open")
    await expect(drawerFallback).toBeVisible()
    await expect(drawerFallback.locator(".mo-dr-tt .mo-note")).toHaveText("15 widget")
    await drawerFallback.getByPlaceholder("Tìm widget").fill("tin thị trường")
    await expect(drawerFallback.locator(".mo-it .mo-nm", { hasText: "Tin thị trường" })).toHaveCount(0)
    await expect(drawerFallback).toContainText("Không thấy widget phù hợp.")

    // 2. When backend enables licensed feed (/template returns market_news in catalog) -> 16 widget + renders cleanly
    server.templateOptions.emptyCatalog = false
    server.templateOptions.newsEnabled = true
    await page.goto("/luyen-tap?tool=toan-canh&page=thi-truong")
    await waitForAllWidgetsSettled(page, 13)

    await page.locator("button.mo-tadd").click()
    const drawerEnabled = page.locator("aside.mo-dr.open")
    await expect(drawerEnabled).toBeVisible()
    await expect(drawerEnabled.locator(".mo-dr-tt .mo-note")).toHaveText("16 widget")
    await drawerEnabled.getByPlaceholder("Tìm widget").fill("tin thị trường")
    await expect(drawerEnabled.locator(".mo-it .mo-nm", { hasText: "Tin thị trường" })).toBeVisible()

    await drawerEnabled.getByRole("button", { name: "Thêm Tin thị trường vào trang" }).click()
    const newsCard = widgetCard(page, "market_news")
    await expect(newsCard).toBeVisible()
    await expect(newsCard).toContainText(
      "VN-Index vượt mốc 1.700 điểm với thanh khoản cải thiện tích cực",
    )

    expect(errs.consoleErrors, "Console errors").toEqual([])
    expect(errs.pageErrors, "Uncaught page errors").toEqual([])
  })
})
