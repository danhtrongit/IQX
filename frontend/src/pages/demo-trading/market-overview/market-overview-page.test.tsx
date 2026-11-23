import { StrictMode } from "react"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  CATALOG_GROUPS,
  DEFAULT_ENABLED_WIDGET_LIST,
  MARKET_TEMPLATE_ITEMS,
  WIDGET_LIST,
} from "./catalog"
import { MarketOverviewPage } from "./market-overview-page"
import { resetMarketOverviewSessionMemory } from "./shell/use-pages-controller"
import type { WidgetSlug } from "./types"

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
  id: string
  name: string
  order: number
  version: number
  updatedAt: string
  items: ServerPageItem[]
}

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  isAuthenticated: true,
  openAuth: vi.fn(),
}))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: mocks.isAuthenticated ? { id: "user-1" } : null,
    isAuthenticated: mocks.isAuthenticated,
    isLoading: false,
    isPremium: false,
    sessionError: null,
    sessionExpired: false,
    openAuth: mocks.openAuth,
  }),
}))

vi.mock("@/lib/api", () => ({
  api: mocks.api,
  apiResponse: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Đã có lỗi xảy ra",
  ApiError: class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

function buildTemplatePayload(options?: { newsEnabled?: boolean; emptyCatalog?: boolean }) {
  const catalogSource = options?.emptyCatalog
    ? []
    : options?.newsEnabled
      ? WIDGET_LIST
      : DEFAULT_ENABLED_WIDGET_LIST
  return {
    id: "thi-truong" as const,
    name: "Thị trường",
    version: 1,
    readonly: true as const,
    updatedAt: "2026-11-18T15:00:00+07:00",
    items: MARKET_TEMPLATE_ITEMS.map((item) => ({
      uid: item.uid,
      widget: item.widget,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      state:
        item.widget === "foreign_flow"
          ? { exchange: "HOSE", tab: "foreign" }
          : item.widget === "market_heatmap"
            ? { mode: "stock", sizeBy: "market_cap" }
            : item.widget === "sector_performance"
              ? { period: "today", tab: "price" }
              : ({ ...(item.state as Record<string, string>) }),
    })),
    catalog: catalogSource.map((w) => ({
      slug: w.id,
      name: w.title,
      group: w.group,
      groupLabel: CATALOG_GROUPS.find((g) => g.id === w.group)?.label ?? "",
      defaultW: w.defaultW,
      defaultH: w.defaultH,
      minW: w.minW,
      minH: w.minH,
      inTemplate: w.inMarketTemplate,
      keywords: w.keywords.join(" "),
      defaultState: {},
    })),
    groups: CATALOG_GROUPS.map((g) => ({ id: g.id, label: g.label })),
    limits: {
      cols: 12,
      maxHeight: 18,
      maxPageNameLength: 30,
      maxPages: 8,
      maxWidgetsPerPage: 40,
    },
  }
}

function buildWidgetPayload(
  widget: WidgetSlug,
  query: URLSearchParams,
  options?: { isMarketOpen?: boolean; sessionDate?: string },
): Record<string, unknown> {
  const isMarketOpen = options?.isMarketOpen ?? false
  const sessionDate = options?.sessionDate ?? "2026-11-18"
  const base = {
    widget,
    asOf: "2026-11-18T15:00:00+07:00",
    sessionDate,
    isMarketOpen,
    stale: false,
  }

  switch (widget) {
    case "index_chart": {
      const selectedCode = (query.get("index") || "VNINDEX") as
        | "VNINDEX"
        | "VN30"
        | "HNX"
        | "UPCOM"
        | "VN30F1M"
      const range = (query.get("range") || "intraday") as "intraday" | "3m" | "1y"
      const cards = [
        {
          code: "VNINDEX",
          name: "VN-Index",
          price: 1703.01,
          refPrice: 1690.5,
          change: 12.51,
          changePct: 0.74,
          volume: 850_000_000,
          valueBillion: 21_450,
          sparkline: [1691, 1695, 1700, 1703.01],
        },
        {
          code: "VN30",
          name: "VN30",
          price: 1806.54,
          refPrice: 1792.0,
          change: 14.54,
          changePct: 0.81,
          volume: 320_000_000,
          valueBillion: 10_200,
          sparkline: [1792, 1798, 1804, 1806.54],
        },
        {
          code: "HNX",
          name: "HNX-Index",
          price: 251.4,
          refPrice: 250.0,
          change: 1.4,
          changePct: 0.56,
          volume: 95_000_000,
          valueBillion: 1_850,
          sparkline: [250, 250.5, 251.4],
        },
        {
          code: "UPCOM",
          name: "UPCoM",
          price: 98.2,
          refPrice: 98.5,
          change: -0.3,
          changePct: -0.3,
          volume: 60_000_000,
          valueBillion: 920,
          sparkline: [98.5, 98.3, 98.2],
        },
        {
          code: "VN30F1M",
          name: "VN30F1M",
          price: 1800.7,
          refPrice: 1790.0,
          change: 10.7,
          changePct: 0.6,
          volume: 212_400,
          valueBillion: 38_200,
          sparkline: [1790, 1796, 1800.7],
        },
      ]
      const chosen = cards.find((c) => c.code === selectedCode) ?? cards[0]
      return {
        ...base,
        data: {
          cards,
          selected: {
            ...chosen,
            range,
            points:
              range === "intraday"
                ? [
                    { t: "09:15", v: chosen.refPrice, vol: 120_000, isUp: true },
                    { t: "11:30", v: chosen.price - 2, vol: 200_000, isUp: true },
                    { t: "14:45", v: chosen.price, vol: 250_000, isUp: true },
                  ]
                : [
                    { t: "2026-10-18", v: chosen.price - 40, vol: 700_000_000, isUp: true },
                    { t: "2026-11-18", v: chosen.price, vol: 850_000_000, isUp: true },
                  ],
          },
        },
      }
    }

    case "market_breadth":
      return {
        ...base,
        data: {
          exchanges: [
            {
              exchange: "HOSE",
              advancing: 210,
              advancingTotal: 225,
              ceiling: 15,
              declining: 120,
              decliningTotal: 123,
              floor: 3,
              unchanged: 52,
              total: 400,
            },
            {
              exchange: "HNX",
              advancing: 85,
              advancingTotal: 90,
              ceiling: 5,
              declining: 60,
              decliningTotal: 62,
              floor: 2,
              unchanged: 48,
              total: 200,
            },
            {
              exchange: "UPCOM",
              advancing: 140,
              advancingTotal: 150,
              ceiling: 10,
              declining: 90,
              decliningTotal: 95,
              floor: 5,
              unchanged: 105,
              total: 350,
            },
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
          points: [
            { t: "09:15", today: 1_200, prev: 1_000, avg20: 1_100 },
            { t: "14:45", today: 17_454, prev: 15_580, avg20: 16_620 },
          ],
        },
      }

    case "foreign_flow": {
      const exchange = query.get("exchange") || "HOSE"
      const tab = query.get("tab") || "foreign"
      return {
        ...base,
        data: {
          exchange,
          tab,
          propSupported: exchange === "HOSE",
          netBillion: tab === "prop" ? 185.4 : -215.3,
          buyBillion: 1_450.2,
          sellBillion: 1_665.5,
          sessions: [
            { date: "2026-11-17", netBillion: 120.5, buyBillion: 1_200, sellBillion: 1_079.5 },
            { date: "2026-11-18", netBillion: -215.3, buyBillion: 1_450.2, sellBillion: 1_665.5 },
          ],
          topBuy: [{ symbol: "FPT", netBillion: 112.4 }],
          topSell: [{ symbol: "VHM", netBillion: -145.6 }],
        },
      }
    }

    case "vnindex_impact":
      return {
        ...base,
        data: {
          indexChange: 12.51,
          sumUp: 14.2,
          sumDn: -1.72,
          delta: 0.03,
          positive: [{ symbol: "VCB", impact: 3.45, price: 92.5, changePct: 1.65 }],
          negative: [{ symbol: "VHM", impact: -0.92, price: 42.1, changePct: -2.09 }],
        },
      }

    case "market_heatmap":
      return {
        ...base,
        data: {
          mode: query.get("mode") || "stock",
          sizeBy: query.get("sizeBy") || "market_cap",
          sectors: [
            {
              code: "8300",
              name: "Ngân hàng",
              changePct: 1.4,
              marketCapBillion: 1_500_000,
              valueBillion: 6_200,
              stocks: [
                {
                  symbol: "VCB",
                  exchange: "HOSE",
                  price: 92.5,
                  refPrice: 91.0,
                  ceilingPrice: 97.3,
                  floorPrice: 84.7,
                  changePct: 1.65,
                  isCeiling: false,
                  isFloor: false,
                  marketCapBillion: 520_000,
                  valueBillion: 1_200,
                },
              ],
            },
          ],
        },
      }

    case "featured_stocks":
      return {
        ...base,
        data: {
          tab: query.get("tab") || "gainers",
          rows: [
            {
              symbol: "FPT",
              exchange: "HOSE",
              price: 138.5,
              refPrice: 134.0,
              ceilingPrice: 143.3,
              floorPrice: 124.7,
              changePct: 3.36,
              valueBillion: 890.5,
              foreignNetBillion: 112.4,
              volRatio20d: 1.8,
            },
          ],
        },
      }

    case "sector_performance":
      return {
        ...base,
        data: {
          period: query.get("period") || "today",
          tab: query.get("tab") || "price",
          rows: [
            {
              code: "8300",
              name: "Ngân hàng",
              changePct: 1.4,
              advancing: 14,
              declining: 3,
              unchanged: 2,
              valueBillion: 6_200,
              valueSharePct: 35.5,
              valueRatio20d: 1.28,
            },
          ],
        },
      }

    case "sector_rotation":
      return {
        ...base,
        data: {
          weekEnding: "2026-11-14",
          domain: { minRatio: 96, maxRatio: 104, minMomentum: 96, maxMomentum: 104 },
          sectors: [
            {
              code: "8300",
              name: "Ngân hàng",
              quadrant: "leading",
              trail: [
                { week: "2026-11-07", rsRatio: 101.2, rsMomentum: 101.5 },
                { week: "2026-11-14", rsRatio: 102.5, rsMomentum: 102.1 },
              ],
            },
          ],
        },
      }

    case "derivatives_summary":
      return {
        ...base,
        data: {
          contract: "VN30F2611",
          expiryDate: "2026-11-19",
          remainingSessions: 1,
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
        },
      }

    case "vn30f_vs_vn30":
      return {
        ...base,
        data: {
          range: query.get("range") || "intraday",
          latestVn30: 1806.54,
          latestVn30f: 1800.7,
          latestBasis: -5.84,
          points: [
            { t: "09:15", vn30: 1795, vn30f: 1790, basis: -5 },
            { t: "14:45", vn30: 1806.54, vn30f: 1800.7, basis: -5.84 },
          ],
        },
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
                {
                  code: "VN30F2611",
                  displayCode: "VN30F1M",
                  expiryDate: "2026-11-18",
                  remainingSessions: 0,
                  price: 1800.7,
                  refPrice: 1790.0,
                  changePct: 0.6,
                  basis: -5.84,
                  volume: 212_400,
                  valueBillion: 38_200,
                  foreignNetBillion: 42.5,
                },
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
            {
              code: "DJI",
              name: "Dow Jones",
              country: "Mỹ",
              isOpen: false,
              price: 43_520.12,
              changePct: 0.45,
              updatedAt: "2026-11-18T05:00:00+07:00",
            },
          ],
        },
      }

    case "commodities_fx":
      return {
        ...base,
        data: {
          tab: query.get("tab") || "energy_metals",
          rows: [
            {
              code: "brent",
              name: "Dầu Brent",
              unit: "USD/thùng",
              price: 73.42,
              changePct: 1.15,
              mappedSectorName: "Dầu khí",
              mappedSectorChangePct: 1.8,
            },
          ],
        },
      }

    case "events_calendar":
      return {
        ...base,
        data: {
          filter: query.get("filter") || "all",
          rows: [
            {
              id: "ev_1",
              exDate: "2026-11-25",
              symbol: "VNM",
              title: "Cổ tức tiền mặt 1.500 đ/cp",
              eventType: "cash",
              cashPerShare: 1500,
              dividendYieldPct: 2.3,
              price: 65.2,
              changePct: 0.8,
            },
          ],
        },
      }

    case "market_news":
      return {
        ...base,
        data: {
          enabled: true,
          rows: [
            {
              id: "news_1",
              slug: "vn-index-tang-diem",
              category: "Thị trường",
              title: "VN-Index vượt mốc 1.700 điểm với thanh khoản cải thiện",
              publishedAt: "2026-11-18T14:00:00+07:00",
              source: "IQX",
              url: null,
            },
          ],
        },
      }
  }
}

interface MockServerOptions {
  initialPages?: ServerPage[]
  failingWidgets?: Set<WidgetSlug>
  isMarketOpen?: boolean
  sessionDate?: string
  newsEnabled?: boolean
  failTemplate?: boolean
  emptyCatalog?: boolean
}

function createMockServer(options: MockServerOptions = {}) {
  let pages: ServerPage[] = (options.initialPages ?? []).map((p) => ({
    ...p,
    items: p.items.map((it) => ({ ...it, state: { ...it.state } })),
  }))
  let lastActivePageId = "thi-truong"
  let nextId = 1
  const failingWidgets = new Set<WidgetSlug>(options.failingWidgets ?? [])
  const calls: Array<{ method: string; path: string; body?: unknown }> = []

  const handler = async (path: string, init?: RequestInit): Promise<unknown> => {
    const method = (init?.method ?? "GET").toUpperCase()
    const body =
      typeof init?.body === "string" && init.body.length > 0
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined
    calls.push({ method, path, body })

    const [pathname, search = ""] = path.split("?")
    const query = new URLSearchParams(search)

    if (method === "GET" && pathname === "/toan-canh/template") {
      if (options.failTemplate) {
        const { ApiError } = await import("@/lib/api")
        throw new ApiError("Template unavailable", 503)
      }
      return buildTemplatePayload({
        newsEnabled: options.newsEnabled,
        emptyCatalog: options.emptyCatalog,
      })
    }

    if (method === "GET" && pathname === "/toan-canh/pages") {
      return {
        pages,
        lastActivePageId,
        maxPages: 8,
      }
    }

    if (method === "POST" && pathname === "/toan-canh/pages") {
      const id = `pg_${nextId++}`
      const source =
        typeof body?.duplicateFromPageId === "string"
          ? pages.find((p) => p.id === body.duplicateFromPageId)
          : undefined
      const created: ServerPage = {
        id,
        name: typeof body?.name === "string" ? body.name : `Trang ${nextId}`,
        order: pages.length,
        version: 1,
        updatedAt: "2026-11-18T15:00:00+07:00",
        items: Array.isArray(body?.items)
          ? (body.items as ServerPageItem[])
          : source
            ? source.items.map((it, idx) => ({
                ...it,
                uid: `${it.uid}_dup_${idx}`,
                state: { ...it.state },
              }))
            : [],
      }
      pages = [...pages, created]
      lastActivePageId = id
      return created
    }

    if (method === "PUT" && pathname.startsWith("/toan-canh/pages/")) {
      const id = decodeURIComponent(pathname.slice("/toan-canh/pages/".length))
      const found = pages.find((p) => p.id === id)
      if (!found) {
        const { ApiError } = await import("@/lib/api")
        throw new ApiError("Not found", 404)
      }
      const updated: ServerPage = {
        ...found,
        name: typeof body?.name === "string" ? body.name : found.name,
        items: Array.isArray(body?.items)
          ? (body.items as ServerPageItem[])
          : found.items,
        updatedAt: "2026-11-18T15:05:00+07:00",
      }
      pages = pages.map((p) => (p.id === id ? updated : p))
      return updated
    }

    if (method === "DELETE" && pathname.startsWith("/toan-canh/pages/")) {
      const id = decodeURIComponent(pathname.slice("/toan-canh/pages/".length))
      pages = pages.filter((p) => p.id !== id)
      return { deleted: true, id, lastActivePageId: "thi-truong" }
    }

    if (method === "PATCH" && pathname === "/toan-canh/pages/order") {
      const ids = Array.isArray(body?.pageIds) ? (body.pageIds as string[]) : []
      const byId = new Map(pages.map((p) => [p.id, p]))
      pages = ids
        .map((id, idx) => {
          const found = byId.get(id)
          return found ? { ...found, order: idx } : null
        })
        .filter((p): p is ServerPage => p !== null)
      return { pages }
    }

    if (method === "PUT" && pathname === "/toan-canh/preferences") {
      if (typeof body?.lastActivePageId === "string") {
        lastActivePageId = body.lastActivePageId
      }
      return { lastActivePageId, updatedAt: "2026-11-18T15:05:00+07:00" }
    }

    if (method === "GET" && pathname.startsWith("/toan-canh/widgets/")) {
      const widget = pathname.slice("/toan-canh/widgets/".length) as WidgetSlug
      if (failingWidgets.has(widget)) {
        const { ApiError } = await import("@/lib/api")
        throw new ApiError("Upstream timeout", 503)
      }
      return buildWidgetPayload(widget, query, {
        isMarketOpen: options.isMarketOpen,
        sessionDate: options.sessionDate,
      })
    }

    return {}
  }

  return {
    handler,
    calls,
    failingWidgets,
    getPages: () => pages,
  }
}

function renderMarketOverview(initialUrl = "/luyen-tap?tool=toan-canh") {
  const router = createMemoryRouter(
    [{ path: "/luyen-tap", element: <MarketOverviewPage /> }],
    { initialEntries: [initialUrl] },
  )
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient, ...view }
}

beforeEach(() => {
  resetMarketOverviewSessionMemory()
  mocks.api.mockReset()
  mocks.isAuthenticated = true
  mocks.openAuth.mockReset()
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    },
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("MarketOverviewPage (Toàn cảnh thị trường)", () => {
  it("renders locked Thị trường tab with 13 widgets, zero edit chrome, off-hours Phiên dd/mm, and ephemeral internal controls", async () => {
    const server = createMockServer({ isMarketOpen: false, sessionDate: "2026-11-18" })
    mocks.api.mockImplementation(server.handler)
    const user = userEvent.setup()

    const { container } = renderMarketOverview()

    await waitFor(() => {
      expect(container.querySelectorAll(".mo-wg")).toHaveLength(13)
    })

    // Zero top-bar action buttons on Thị trường
    expect(screen.queryByRole("button", { name: "Xếp gọn" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Khoá bố cục/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "＋ Thêm widget" })).toBeNull()

    // Zero widget delete buttons, zero empty slots, zero resize handles
    expect(container.querySelectorAll(".mo-del")).toHaveLength(0)
    expect(container.querySelectorAll(".mo-slot")).toHaveLength(0)
    expect(container.querySelectorAll(".mo-rz, .mo-rzr, .mo-rzb")).toHaveLength(0)

    // Off-hours session label ("Phiên 18/11") displayed on VN widgets
    await waitFor(() => {
      expect(screen.getAllByText(/Phiên 18\/11/).length).toBeGreaterThan(0)
    })

    // Internal control switching works ephemerally without PUT /pages/{id}
    const indexCard = container.querySelector<HTMLElement>('.mo-wg[data-widget="index_chart"]')!
    await user.click(within(indexCard).getByRole("button", { name: "3 tháng" }))

    await waitFor(() => {
      expect(
        server.calls.some(
          (c) =>
            c.method === "GET" &&
            c.path.includes("/toan-canh/widgets/index_chart") &&
            c.path.includes("range=3m"),
        ),
      ).toBe(true)
    })

    expect(
      server.calls.filter((c) => c.method === "PUT" && c.path.startsWith("/toan-canh/pages/")),
    ).toHaveLength(0)
  })

  it("creates Trang 1, supports diacritic-insensitive search, adds 5 widgets consecutively without closing drawer, pulses, and undoes", async () => {
    const server = createMockServer()
    mocks.api.mockImplementation(server.handler)
    const user = userEvent.setup()

    const { container } = renderMarketOverview()
    await waitFor(() => {
      expect(container.querySelectorAll(".mo-wg")).toHaveLength(13)
    })

    // Click ＋ to create Trang 1
    await user.click(screen.getByRole("button", { name: "Thêm trang trống" }))

    await waitFor(() => {
      expect(screen.getByText("Trang trống")).toBeTruthy()
      expect(screen.getByRole("tab", { name: /Trang 1/ })).toBeTruthy()
    })

    const drawer = screen.getByLabelText("Kho widget")
    expect(drawer.getAttribute("aria-hidden")).toBe("false")

    // Search diacritic-insensitive: "khoi ngoai", "tu doanh", "basis", "vang", unknown
    const searchInput = within(drawer).getByPlaceholderText("Tìm widget")

    await user.type(searchInput, "khoi ngoai")
    expect(within(drawer).getByText("Khối ngoại và tự doanh")).toBeTruthy()

    await user.clear(searchInput)
    await user.type(searchInput, "tu doanh")
    expect(within(drawer).getByText("Khối ngoại và tự doanh")).toBeTruthy()

    await user.clear(searchInput)
    await user.type(searchInput, "basis")
    expect(within(drawer).getByText("Tổng quan phái sinh")).toBeTruthy()
    expect(within(drawer).getByText("VN30F1M so với VN30")).toBeTruthy()
    expect(within(drawer).getByText("Bảng hợp đồng tương lai")).toBeTruthy()

    await user.clear(searchInput)
    await user.type(searchInput, "vang")
    expect(within(drawer).getByText("Hàng hoá và tỷ giá")).toBeTruthy()

    await user.clear(searchInput)
    await user.type(searchInput, "khong-ton-tai-abc")
    expect(within(drawer).getByText("Không thấy widget phù hợp.")).toBeTruthy()

    // Clear search and add 5 widgets consecutively (including 2× index_chart) without closing drawer
    await user.clear(searchInput)
    await user.click(within(drawer).getByRole("button", { name: "Thêm Biểu đồ chỉ số vào trang" }))
    await user.click(within(drawer).getByRole("button", { name: "Thêm Biểu đồ chỉ số vào trang" }))
    await user.click(within(drawer).getByRole("button", { name: "Thêm Độ rộng thị trường vào trang" }))
    await user.click(within(drawer).getByRole("button", { name: "Thêm Thanh khoản thị trường vào trang" }))
    await user.click(within(drawer).getByRole("button", { name: "Thêm Khối ngoại và tự doanh vào trang" }))

    // Drawer stays open!
    expect(drawer.getAttribute("aria-hidden")).toBe("false")
    expect(container.querySelectorAll(".mo-wg")).toHaveLength(5)

    // Accurate checkmarks (✓ ×2 for duplicate index_chart, ✓ for singletons) & "4 đã thêm" unique types in Chỉ số
    expect(within(drawer).getByText("✓ ×2")).toBeTruthy()
    expect(within(drawer).getByText("4 đã thêm")).toBeTruthy()

    // Pulse highlight on most recently added widget + undo toast
    expect(container.querySelectorAll(".mo-wg.mo-just-added")).toHaveLength(1)
    expect(screen.getByText("Đã thêm “Khối ngoại và tự doanh”")).toBeTruthy()

    // Click Hoàn tác removes the 5th widget and updates unique count to "3 đã thêm"
    await user.click(screen.getByRole("button", { name: "Hoàn tác" }))
    expect(container.querySelectorAll(".mo-wg")).toHaveLength(4)
    expect(within(drawer).getByText("3 đã thêm")).toBeTruthy()
  })

  it("enforces 8-page limit, inline rename (1-30 chars, Esc cancel, blank revert), duplicate truncation, and Xếp gọn / Khoá bố cục", async () => {
    const existingPages: ServerPage[] = Array.from({ length: 7 }, (_, i) => ({
      id: `pg_init_${i + 1}`,
      name: i === 0 ? "Theo dõi danh mục ngân hàng 26" : `Trang ${i + 1}`,
      order: i,
      version: 1,
      updatedAt: "2026-11-18T12:00:00+07:00",
      items:
        i === 0
          ? [
              { uid: "w1", widget: "market_breadth", x: 0, y: 0, w: 4, h: 3, state: {} },
              { uid: "w2", widget: "market_liquidity", x: 8, y: 0, w: 4, h: 6, state: {} },
            ]
          : [],
    }))

    const server = createMockServer({ initialPages: existingPages })
    mocks.api.mockImplementation(server.handler)
    const user = userEvent.setup()

    const { container } = renderMarketOverview("/luyen-tap?tool=toan-canh&page=pg_init_1")

    await waitFor(() => {
      expect(container.querySelectorAll(".mo-wg")).toHaveLength(2)
    })

    // Duplicate the 30-char-named page -> brings count to 8 and truncates cleanly to <= 30 chars ending with " (bản sao)"
    const firstTab = screen.getByRole("tab", { name: /Theo dõi danh mục ngân hàng 26/ })
    await user.click(within(firstTab).getByRole("button", { name: "Tuỳ chọn trang" }))
    await user.click(screen.getByRole("menuitem", { name: "Nhân bản" }))

    await waitFor(() => {
      expect(screen.getByText("Đã nhân bản trang")).toBeTruthy()
    })
    const duplicateTab = screen
      .getAllByRole("tab")
      .find((tab) => tab.textContent?.includes("(bản sao)"))
    expect(duplicateTab).toBeTruthy()
    const duplicateLabel = duplicateTab!.querySelector(".mo-tn")!.textContent!
    expect(Array.from(duplicateLabel).length).toBeLessThanOrEqual(30)
    expect(duplicateLabel.endsWith(" (bản sao)")).toBe(true)

    // Attempt 9th page -> blocked with "Tối đa 8 trang"
    const postCountBefore = server.calls.filter((c) => c.method === "POST").length
    await user.click(screen.getByRole("button", { name: "Thêm trang trống" }))
    expect(screen.getByText("Tối đa 8 trang")).toBeTruthy()
    expect(server.calls.filter((c) => c.method === "POST")).toHaveLength(postCountBefore)

    // Inline rename: Esc cancels, blank reverts, Enter commits
    const tab2 = screen.getByRole("tab", { name: /Trang 2/ })
    await user.click(tab2)
    await user.dblClick(within(tab2).getByText("Trang 2"))
    let input = screen.getByLabelText("Đổi tên trang") as HTMLInputElement
    await user.clear(input)
    await user.type(input, "Tam bo{Escape}")
    expect(screen.getByRole("tab", { name: /Trang 2/ })).toBeTruthy()

    await user.dblClick(within(screen.getByRole("tab", { name: /Trang 2/ })).getByText("Trang 2"))
    input = screen.getByLabelText("Đổi tên trang") as HTMLInputElement
    await user.clear(input)
    await user.type(input, "   {Enter}")
    expect(screen.getByRole("tab", { name: /Trang 2/ })).toBeTruthy()

    await user.dblClick(within(screen.getByRole("tab", { name: /Trang 2/ })).getByText("Trang 2"))
    input = screen.getByLabelText("Đổi tên trang") as HTMLInputElement
    await user.clear(input)
    await user.type(input, "Phái sinh{Enter}")
    expect(screen.getByRole("tab", { name: /Phái sinh/ })).toBeTruthy()

    // Switch back to page 1 to test Xếp gọn & Khoá bố cục (resets on tab switch)
    await user.click(screen.getByRole("tab", { name: /Theo dõi danh mục ngân hàng 26/ }))
    await user.click(screen.getByRole("button", { name: "Xếp gọn" }))
    expect(screen.getByText("Đã xếp gọn bố cục")).toBeTruthy()

    // Unlocked shows delete buttons & slots
    expect(container.querySelectorAll(".mo-del").length).toBeGreaterThan(0)
    await user.click(screen.getByRole("button", { name: "Khoá bố cục" }))
    expect(screen.getByRole("button", { name: "Mở khoá bố cục" })).toBeTruthy()
    expect(container.querySelectorAll(".mo-del")).toHaveLength(0)

    // Switching tab resets Khoá bố cục back to unlocked
    await user.click(screen.getByRole("tab", { name: "Thị trường" }))
    await user.click(screen.getByRole("tab", { name: /Theo dõi danh mục ngân hàng 26/ }))
    expect(screen.getByRole("button", { name: "Khoá bố cục" })).toBeTruthy()
    expect(container.querySelectorAll(".mo-del").length).toBeGreaterThan(0)
  })

  it("delays DELETE API call for 5-second undo window and cancels on Hoàn tác", async () => {
    const server = createMockServer({
      initialPages: [
        {
          id: "pg_a",
          name: "Trang A",
          order: 0,
          version: 1,
          updatedAt: "2026-11-18T12:00:00+07:00",
          items: [],
        },
        {
          id: "pg_b",
          name: "Trang B",
          order: 1,
          version: 1,
          updatedAt: "2026-11-18T12:00:00+07:00",
          items: [],
        },
      ],
    })
    mocks.api.mockImplementation(server.handler)

    renderMarketOverview("/luyen-tap?tool=toan-canh&page=pg_b")

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Trang B/ })).toBeTruthy()
    })

    vi.useFakeTimers()

    // Delete Trang B -> immediately removed, active tab switches to left neighbor (Trang A), NO DELETE call yet
    const tabB = screen.getByRole("tab", { name: /Trang B/ })
    fireEvent.click(within(tabB).getByRole("button", { name: "Tuỳ chọn trang" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Xoá trang" }))

    expect(screen.queryByRole("tab", { name: /Trang B/ })).toBeNull()
    expect(screen.getByRole("tab", { name: /Trang A/ }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByText("Đã xoá “Trang B”")).toBeTruthy()
    expect(server.calls.filter((c) => c.method === "DELETE")).toHaveLength(0)

    // Advance 3s -> still NOT deleted, click Hoàn tác restores Trang B!
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(server.calls.filter((c) => c.method === "DELETE")).toHaveLength(0)

    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }))
    expect(screen.getByRole("tab", { name: /Trang B/ }).getAttribute("aria-selected")).toBe("true")

    // Advancing past 5s after Undo must NEVER send DELETE
    act(() => {
      vi.advanceTimersByTime(6_000)
    })
    expect(server.calls.filter((c) => c.method === "DELETE")).toHaveLength(0)

    // Delete again and let 5s window expire -> DELETE fires exactly once
    fireEvent.click(
      within(screen.getByRole("tab", { name: /Trang B/ })).getByRole("button", {
        name: "Tuỳ chọn trang",
      }),
    )
    fireEvent.click(screen.getByRole("menuitem", { name: "Xoá trang" }))
    expect(server.calls.filter((c) => c.method === "DELETE")).toHaveLength(0)

    await act(async () => {
      vi.advanceTimersByTime(5_100)
      await Promise.resolve()
    })

    expect(
      server.calls.filter((c) => c.method === "DELETE" && c.path === "/toan-canh/pages/pg_b"),
    ).toHaveLength(1)
  })

  it("isolates a single widget failure with Chưa tải được dữ liệu + Tải lại while sibling widgets stay healthy", async () => {
    const server = createMockServer({
      failingWidgets: new Set<WidgetSlug>(["world_indices"]),
    })
    mocks.api.mockImplementation(server.handler)
    const user = userEvent.setup()

    const { container } = renderMarketOverview()

    const worldCard = await waitFor(() => {
      const card = container.querySelector<HTMLElement>('.mo-wg[data-widget="world_indices"]')
      expect(card).not.toBeNull()
      expect(within(card!).getByText("Chưa tải được dữ liệu")).toBeTruthy()
      return card!
    })

    // Sibling widgets still loaded cleanly
    const breadthCard = container.querySelector<HTMLElement>(
      '.mo-wg[data-widget="market_breadth"]',
    )!
    expect(within(breadthCard).queryByText("Chưa tải được dữ liệu")).toBeNull()
    expect(within(breadthCard).getByText("HOSE")).toBeTruthy()

    // Recover and click Tải lại
    server.failingWidgets.delete("world_indices")
    await user.click(within(worldCard).getByRole("button", { name: "Tải lại" }))

    await waitFor(() => {
      expect(within(worldCard).getByText("Dow Jones")).toBeTruthy()
    })
  })

  it("prompts guest user to log in when clicking ＋ to create a custom page", async () => {
    mocks.isAuthenticated = false
    const server = createMockServer()
    mocks.api.mockImplementation(server.handler)
    const user = userEvent.setup()

    renderMarketOverview()
    await user.click(screen.getByRole("button", { name: "Thêm trang trống" }))
    expect(mocks.openAuth).toHaveBeenCalledWith("login")
  })

  it("handles 3 tháng switch safely while placeholderData holds intraday points (BUG-1), displays off-hours badges ([M9]), EOD prop date ([H8]), world date-only ([H9]), and gold/FX decimals ([L3])", async () => {
    const server = createMockServer({ isMarketOpen: false, sessionDate: "2026-11-23" })
    const deferred3m: { resolve: (() => void) | null } = { resolve: null }
    mocks.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.includes("/toan-canh/widgets/index_chart") && path.includes("range=3m")) {
        await new Promise<void>((resolve) => {
          deferred3m.resolve = resolve
        })
      }
      if (path.includes("/toan-canh/widgets/foreign_flow") && path.includes("tab=prop")) {
        return {
          widget: "foreign_flow",
          asOf: "2026-11-23T10:30:00+07:00",
          sessionDate: "2026-11-23",
          isMarketOpen: true,
          stale: false,
          data: {
            exchange: "HOSE",
            tab: "prop",
            propSupported: true,
            netBillion: 185.4,
            buyBillion: 642.8,
            sellBillion: 457.4,
            sessions: [
              { date: "2026-11-19", netBillion: -50, buyBillion: 400, sellBillion: 450 },
              { date: "2026-11-20", netBillion: 185.4, buyBillion: 642.8, sellBillion: 457.4 },
            ],
            topBuy: [{ symbol: "FPT", netBillion: 50 }],
            topSell: [{ symbol: "VHM", netBillion: -30 }],
          },
        }
      }
      if (path.includes("/toan-canh/widgets/world_indices")) {
        return {
          widget: "world_indices",
          asOf: "2026-11-23T10:30:00+07:00",
          sessionDate: "2026-11-23",
          isMarketOpen: false,
          stale: false,
          data: {
            rows: [
              { code: "SPX", name: "S&P 500", country: "Mỹ", isOpen: false, price: 5918.45, changePct: 0.5, updatedAt: "2026-11-20" },
              { code: "N225", name: "Nikkei 225", country: "Nhật Bản", isOpen: true, price: 38412.6, changePct: 1.1, updatedAt: "2026-11-23" },
            ],
          },
        }
      }
      if (path.includes("/toan-canh/widgets/commodities_fx") && path.includes("tab=gold_fx")) {
        return {
          widget: "commodities_fx",
          asOf: "2026-11-23T10:30:00+07:00",
          sessionDate: "2026-11-23",
          isMarketOpen: false,
          stale: false,
          data: {
            tab: "gold_fx",
            rows: [
              { code: "xau", name: "Vàng thế giới", unit: "USD/oz", price: 2685, changePct: 0.5, mappedSectorName: null, mappedSectorChangePct: null },
              { code: "usdvnd", name: "USD/VND", unit: "VND", price: 25485, changePct: -0.05, mappedSectorName: null, mappedSectorChangePct: null },
            ],
          },
        }
      }
      return server.handler(path, init)
    })

    const user = userEvent.setup()
    const { container } = renderMarketOverview()

    await waitFor(() => {
      expect(container.querySelectorAll(".mo-wg")).toHaveLength(13)
    })

    // [M9] Off-hours "Phiên 23/11" shown on vnindex_impact, market_heatmap, featured_stocks, sector_performance
    for (const slug of [
      "vnindex_impact",
      "market_heatmap",
      "featured_stocks",
      "sector_performance",
    ] as const) {
      const card = container.querySelector<HTMLElement>(`.mo-wg[data-widget="${slug}"]`)!
      await waitFor(() => {
        expect(within(card).getByText("Phiên 23/11")).toBeTruthy()
      })
    }

    // [H9] world_indices date-only string shows "20/11" & "Đóng cửa · 20/11", NEVER "07:00"
    const worldCard = container.querySelector<HTMLElement>('.mo-wg[data-widget="world_indices"]')!
    expect(worldCard.textContent).toContain("Đóng cửa · 20/11")
    expect(worldCard.textContent).toContain("Nhật Bản · 23/11")
    expect(worldCard.textContent).not.toContain("07:00")

    // [H8] foreign_flow Tự doanh shows EOD session date (20/11) instead of envelope sessionDate (23/11)
    const foreignCard = container.querySelector<HTMLElement>('.mo-wg[data-widget="foreign_flow"]')!
    await user.click(within(foreignCard).getByRole("tab", { name: "Tự doanh" }))
    await waitFor(() => {
      expect(within(foreignCard).getByText("Phiên 20/11")).toBeTruthy()
    })

    // [L3] commodities_fx gold_fx formats Vàng thế giới with 2 decimals (2.685,00) & USD/VND with 0 decimals (25.485)
    const commCard = container.querySelector<HTMLElement>('.mo-wg[data-widget="commodities_fx"]')!
    await user.click(within(commCard).getByRole("tab", { name: "Vàng, tỷ giá" }))
    await waitFor(() => {
      expect(within(commCard).getByText("2.685,00")).toBeTruthy()
      expect(within(commCard).getByText("25.485")).toBeTruthy()
    })

    // BUG-1: Click 3 tháng while 3m query is still pending (placeholderData holds intraday "09:15")
    const indexCard = container.querySelector<HTMLElement>('.mo-wg[data-widget="index_chart"]')!
    await user.click(within(indexCard).getByRole("button", { name: "3 tháng" }))
    expect(within(indexCard).getByRole("button", { name: "3 tháng" }).className).toContain("on")
    deferred3m.resolve?.()
    await waitFor(() => {
      expect(
        server.calls.some((c) => c.path.includes("/toan-canh/widgets/index_chart") && c.path.includes("range=3m")),
      ).toBe(true)
    })
  })

  it("preserves optimistic edits & tmp pages across server cache writes ([H4]), duplicates via duplicateFromPageId ([M7]), and toggles drawer overlay at 1000px vs push at 1440px ([H14])", async () => {
    const server = createMockServer({
      initialPages: [
        {
          id: "pg_existing",
          name: "Trang gốc",
          order: 0,
          version: 1,
          updatedAt: "2026-11-18T12:00:00+07:00",
          items: [
            { uid: "w_orig", widget: "market_breadth", x: 0, y: 0, w: 4, h: 3, state: {} },
          ],
        },
      ],
    })

    const deferredSecondCreate: { resolve: (() => void) | null } = { resolve: null }
    let postCount = 0
    mocks.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST" && path === "/toan-canh/pages") {
        postCount += 1
        if (postCount === 2) {
          await new Promise<void>((resolve) => {
            deferredSecondCreate.resolve = resolve
          })
        }
      }
      return server.handler(path, init)
    })

    // Mock ResizeObserver that lets us drive rootWidth/contentWidth dynamically across all observers
    const roCallbacks: Array<() => void> = []
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          roCallbacks.push(cb)
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )

    const user = userEvent.setup()
    const { container } = renderMarketOverview("/luyen-tap?tool=toan-canh&page=pg_existing")

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Trang gốc/ })).toBeTruthy()
    })

    // [M7] Duplicate persisted server page -> sends duplicateFromPageId
    const origTab = screen.getByRole("tab", { name: /Trang gốc/ })
    await user.click(within(origTab).getByRole("button", { name: "Tuỳ chọn trang" }))
    await user.click(screen.getByRole("menuitem", { name: "Nhân bản" }))

    await waitFor(() => {
      const dupPost = server.calls.find(
        (c) =>
          c.method === "POST" &&
          c.path === "/toan-canh/pages" &&
          (c.body as Record<string, unknown>)?.duplicateFromPageId === "pg_existing",
      )
      expect(dupPost).toBeDefined()
    })

    // [H4] Create an optimistic page while a prior mutation updates cache -> optimistic tmp_* page must NOT be wiped!
    await user.click(screen.getByRole("button", { name: "Thêm trang trống" }))
    expect(screen.getByRole("tab", { name: /Trang 1/ })).toBeTruthy()
    deferredSecondCreate.resolve?.()
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Trang 1/ })).toBeTruthy()
    })

    // [H14] Verify drawer uses overlay mode at 1000px (1000 - 400 = 600 <= 740) and push mode at 1440px (1440 - 400 = 1040 > 740)
    const rootEl = container.querySelector<HTMLElement>(".mo-root")!
    const contentEl = container.querySelector<HTMLElement>(".mo-content")!
    Object.defineProperty(rootEl, "clientWidth", { configurable: true, get: () => 1000 })
    Object.defineProperty(contentEl, "clientWidth", { configurable: true, get: () => 1000 })
    await act(async () => {
      for (const cb of roCallbacks) cb()
      await new Promise((r) => requestAnimationFrame(r))
    })
    const drawer = screen.getByLabelText("Kho widget")
    expect(drawer.className).toContain("mo-dr-overlay")
    expect(contentEl.className).not.toContain("mo-dr-push")

    Object.defineProperty(rootEl, "clientWidth", { configurable: true, get: () => 1440 })
    Object.defineProperty(contentEl, "clientWidth", { configurable: true, get: () => 1040 })
    await act(async () => {
      for (const cb of roCallbacks) cb()
      await new Promise((r) => requestAnimationFrame(r))
    })
    expect(drawer.className).not.toContain("mo-dr-overlay")
    expect(contentEl.className).toContain("mo-dr-push")
  })

  it("restores scrollTop reliably across unmount/remount under React StrictMode (BUG-3)", async () => {
    const server = createMockServer()
    mocks.api.mockImplementation(server.handler)

    const router1 = createMemoryRouter(
      [{ path: "/luyen-tap", element: <MarketOverviewPage /> }],
      { initialEntries: ["/luyen-tap?tool=toan-canh"] },
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view1 = render(
      <StrictMode>
        <QueryClientProvider client={qc}>
          <RouterProvider router={router1} />
        </QueryClientProvider>
      </StrictMode>,
    )

    await waitFor(() => {
      expect(view1.container.querySelectorAll(".mo-wg")).toHaveLength(13)
    })

    const content1 = view1.container.querySelector<HTMLElement>(".mo-content")!
    content1.scrollTop = 420
    fireEvent.scroll(content1)
    view1.unmount()

    // Remount under StrictMode (double mount/cleanup must NOT clobber 420 -> 0)
    const router2 = createMemoryRouter(
      [{ path: "/luyen-tap", element: <MarketOverviewPage /> }],
      { initialEntries: ["/luyen-tap?tool=toan-canh"] },
    )
    const view2 = render(
      <StrictMode>
        <QueryClientProvider client={qc}>
          <RouterProvider router={router2} />
        </QueryClientProvider>
      </StrictMode>,
    )

    const content2 = view2.container.querySelector<HTMLElement>(".mo-content")!
    Object.defineProperty(content2, "scrollHeight", { configurable: true, get: () => 2000 })
    Object.defineProperty(content2, "clientHeight", { configurable: true, get: () => 800 })

    await waitFor(() => {
      expect(content2.scrollTop).toBe(420)
    })
  })

  it("hides market_news (15 widget) by default and on template fallback, and dynamically exposes it (16 widget) when backend enables licensed news ([H11])", async () => {
    const user = userEvent.setup()

    // Case 1: /template fails (exercises DEFAULT_TEMPLATE_RESULT fallback -> 15 widgets, no Tin thị trường)
    const fallbackServer = createMockServer({ failTemplate: true })
    mocks.api.mockImplementation(fallbackServer.handler)
    const viewFallback = renderMarketOverview()
    await user.click(screen.getByRole("button", { name: "Thêm trang trống" }))
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Trang 1/ })).toBeTruthy()
    })
    const fallbackDrawer = screen.getByLabelText("Kho widget")
    expect(within(fallbackDrawer).getByText("15 widget")).toBeTruthy()
    const fallbackSearch = within(fallbackDrawer).getByPlaceholderText("Tìm widget")
    await user.type(fallbackSearch, "tin thi truong")
    expect(within(fallbackDrawer).queryByText("Tin thị trường")).toBeNull()
    expect(within(fallbackDrawer).getByText("Không thấy widget phù hợp.")).toBeTruthy()
    viewFallback.unmount()

    // Case 2: /template returns empty catalog (exercises fetchMarketOverviewTemplate fallback -> 15 widgets)
    resetMarketOverviewSessionMemory()
    const emptyCatalogServer = createMockServer({ emptyCatalog: true })
    mocks.api.mockImplementation(emptyCatalogServer.handler)
    const viewEmpty = renderMarketOverview()
    await user.click(screen.getByRole("button", { name: "Thêm trang trống" }))
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Trang 1/ })).toBeTruthy()
    })
    const emptyDrawer = screen.getByLabelText("Kho widget")
    expect(within(emptyDrawer).getByText("15 widget")).toBeTruthy()
    await user.click(within(emptyDrawer).getByRole("button", { name: /Sự kiện và tin/ }))
    expect(within(emptyDrawer).getByText("Lịch sự kiện")).toBeTruthy()
    expect(within(emptyDrawer).queryByText("Tin thị trường")).toBeNull()
    viewEmpty.unmount()

    // Case 3: /template returns market_news in catalog (MARKET_OVERVIEW_NEWS_ENABLED=true -> 16 widgets)
    resetMarketOverviewSessionMemory()
    const enabledServer = createMockServer({ newsEnabled: true })
    mocks.api.mockImplementation(enabledServer.handler)
    const { container } = renderMarketOverview()
    await waitFor(() => {
      expect(container.querySelectorAll(".mo-wg")).toHaveLength(13)
    })
    await user.click(screen.getByRole("button", { name: "Thêm trang trống" }))
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Trang 1/ })).toBeTruthy()
    })
    const enabledDrawer = screen.getByLabelText("Kho widget")
    await waitFor(() => {
      expect(within(enabledDrawer).getByText("16 widget")).toBeTruthy()
    })
    await user.click(within(enabledDrawer).getByRole("button", { name: /Sự kiện và tin/ }))
    expect(within(enabledDrawer).getByText("Tin thị trường")).toBeTruthy()
    await user.click(within(enabledDrawer).getByRole("button", { name: "Thêm Tin thị trường vào trang" }))
    await waitFor(() => {
      expect(
        screen.getByText("VN-Index vượt mốc 1.700 điểm với thanh khoản cải thiện"),
      ).toBeTruthy()
    })
  })

  it("flushes pending debounced PUT on source page before sending POST with duplicateFromPageId ([R2-M3])", async () => {
    const server = createMockServer({
      initialPages: [
        {
          id: "pg_dirty",
          name: "Trang đang sửa",
          order: 0,
          version: 1,
          updatedAt: "2026-11-18T12:00:00+07:00",
          items: [
            { uid: "w_one", widget: "market_breadth", x: 0, y: 0, w: 4, h: 3, state: {} },
          ],
        },
      ],
    })

    const callSequence: string[] = []
    const deferredPut: { resolve: (() => void) | null } = { resolve: null }
    mocks.api.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase()
      if (method === "PUT" && path === "/toan-canh/pages/pg_dirty") {
        callSequence.push("PUT:start")
        await new Promise<void>((resolve) => {
          deferredPut.resolve = resolve
        })
        const res = await server.handler(path, init)
        callSequence.push("PUT:done")
        return res
      }
      if (method === "POST" && path === "/toan-canh/pages") {
        callSequence.push("POST:start")
      }
      return server.handler(path, init)
    })

    const user = userEvent.setup()
    const { container } = renderMarketOverview("/luyen-tap?tool=toan-canh&page=pg_dirty")

    await waitFor(() => {
      expect(container.querySelectorAll(".mo-wg")).toHaveLength(1)
    })

    // Add a 2nd widget -> marks pg_dirty dirty with 1s debounced save (PUT has NOT fired yet)
    await user.click(screen.getAllByRole("button", { name: "＋ Thêm widget" })[0]!)
    const drawer = screen.getByLabelText("Kho widget")
    await user.click(
      within(drawer).getByRole("button", { name: "Thêm Thanh khoản thị trường vào trang" }),
    )
    expect(container.querySelectorAll(".mo-wg")).toHaveLength(2)
    expect(callSequence).toEqual([])

    // Immediately click Nhân bản within the 1s debounce window
    const dirtyTab = screen.getByRole("tab", { name: /Trang đang sửa/ })
    await user.click(within(dirtyTab).getByRole("button", { name: "Tuỳ chọn trang" }))
    await user.click(screen.getByRole("menuitem", { name: "Nhân bản" }))

    // PUT must start immediately while POST waits for PUT to finish
    await waitFor(() => {
      expect(callSequence).toEqual(["PUT:start"])
    })
    expect(
      server.calls.filter((c) => c.method === "POST" && c.path === "/toan-canh/pages"),
    ).toHaveLength(0)

    // Release PUT -> POST fires strictly after PUT finishes and clones the newly persisted 2 items
    deferredPut.resolve?.()

    await waitFor(() => {
      expect(callSequence).toEqual(["PUT:start", "PUT:done", "POST:start"])
      const dupPost = server.calls.find(
        (c) =>
          c.method === "POST" &&
          c.path === "/toan-canh/pages" &&
          (c.body as Record<string, unknown>)?.duplicateFromPageId === "pg_dirty",
      )
      expect(dupPost).toBeDefined()
    })

    // Server-reconciled duplicate tab retains BOTH widgets (recent edit was NOT lost)
    await waitFor(() => {
      expect(container.querySelectorAll(".mo-wg")).toHaveLength(2)
      expect(container.querySelector('.mo-wg[data-widget="market_breadth"]')).not.toBeNull()
      expect(container.querySelector('.mo-wg[data-widget="market_liquidity"]')).not.toBeNull()
    })
  })
})
