/**
 * Independent Playwright E2E & Visual WebGL Verification Suite for:
 *  - Upgraded 3D Procedural Chibi Khu giao dịch (`/khu-giao-dich`)
 *  - New 3D Procedural Chibi Khu Văn phòng (`/van-phong`)
 *
 * Strictly zero production edits; all REST & WebSocket frames are schema-exact mocks.
 */
import { mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import type { Locator, Page, Route } from "@playwright/test"

import { expect, test } from "./fixtures"

test.describe.configure({ mode: "default", timeout: 90_000 })

// Enable real hardware Metal WebGL on macOS instead of CPU SwiftShader (0.5 FPS on 2048px shadows)
if (process.platform === "darwin") {
  test.use({
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=metal", "--ignore-gpu-blocklist"],
    },
  })
}

const SCREENSHOT_DIR =
  process.env.CHIBI_SCREENSHOT_DIR ||
  path.join(os.tmpdir(), "iqx-chibi-3d-screenshots")
mkdirSync(SCREENSHOT_DIR, { recursive: true })

const shot = (name: string) => path.join(SCREENSHOT_DIR, name)

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

/* ============================================================================
 * Error & Asset Watchers + Real WebGL Composited Pixel Verification
 * ========================================================================== */

interface PageWatchers {
  consoleErrors: string[]
  pageErrors: string[]
  forbiddenAssets: string[]
  failedRequests: string[]
  assertClean: () => void
}

function attachWatchers(
  page: Page,
  options: { forbidTradingFloorWebp?: boolean } = {}
): PageWatchers {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const forbiddenAssets: string[] = []
  const failedRequests: string[] = []

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text())
    }
  })
  page.on("pageerror", (err) => {
    pageErrors.push(`${err.name}: ${err.message}`)
  })
  page.on("request", (req) => {
    const url = req.url()
    if (
      options.forbidTradingFloorWebp &&
      (/\/trading-floor\/assets\//i.test(url) ||
        (/trading-floor/i.test(url) && /\.webp(\?|$)/i.test(url)))
    ) {
      forbiddenAssets.push(url)
    }
  })
  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("/api/v2/auth/me")) {
      failedRequests.push(`${res.status()} ${res.url()}`)
    }
  })

  return {
    consoleErrors,
    pageErrors,
    forbiddenAssets,
    failedRequests,
    assertClean() {
      expect(forbiddenAssets, "Forbidden 2D .webp / trading-floor/assets requests").toEqual([])
      expect(pageErrors, "Uncaught page errors").toEqual([])
      expect(consoleErrors, "Console errors").toEqual([])
      expect(failedRequests, "Unexpected HTTP >= 400 responses").toEqual([])
    },
  }
}

/**
 * Verifies a Three.js WebGL `<canvas>` actually rendered non-blank, multi-color 3D content
 * by inspecting the real composited Chromium screenshot bytes inside an offscreen 2D canvas.
 * (Works accurately even when `preserveDrawingBuffer: false`.)
 */
async function assertCanvasNonBlank(
  page: Page,
  canvas: Locator,
  options: {
    minWidth: number
    minHeight: number
    bgRgb: [number, number, number]
    minNonBgRatio?: number
    minDistinctColors?: number
  }
) {
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  const box = await canvas.boundingBox()
  expect(box, "Canvas must have a bounding box").not.toBeNull()
  expect(box!.width).toBeGreaterThan(options.minWidth)
  expect(box!.height).toBeGreaterThan(options.minHeight)

  // Allow WebGL frames + shadows + textures to finish settling
  await page.waitForTimeout(450)
  const pngBuffer = await canvas.screenshot({ type: "png" })
  expect(pngBuffer.byteLength).toBeGreaterThan(2000)

  const b64 = pngBuffer.toString("base64")
  const stats = await page.evaluate(
    async ({ base64, bg }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${base64}`
      await img.decode()
      const sampleW = 160
      const sampleH = 100
      const c = document.createElement("canvas")
      c.width = sampleW
      c.height = sampleH
      const ctx = c.getContext("2d")!
      ctx.drawImage(img, 0, 0, sampleW, sampleH)
      const data = ctx.getImageData(0, 0, sampleW, sampleH).data
      let nonBg = 0
      const colors = new Set<string>()
      const total = sampleW * sampleH
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]!
        const g = data[i + 1]!
        const b = data[i + 2]!
        const a = data[i + 3]!
        if (a < 20) continue
        const diff =
          Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2])
        if (diff > 24) nonBg += 1
        // Quantize to 5-bit buckets to count rich visual variety
        colors.add(`${r >> 3},${g >> 3},${b >> 3}`)
      }
      return {
        nonBgRatio: nonBg / total,
        distinctColors: colors.size,
      }
    },
    { base64: b64, bg: options.bgRgb }
  )

  expect(
    stats.nonBgRatio,
    `Canvas appears blank (nonBgRatio=${stats.nonBgRatio.toFixed(3)})`
  ).toBeGreaterThan(options.minNonBgRatio ?? 0.15)
  expect(
    stats.distinctColors,
    `Canvas lacks multi-color 3D geometry (distinctColors=${stats.distinctColors})`
  ).toBeGreaterThanOrEqual(options.minDistinctColors ?? 12)
}

async function assertNoHorizontalOverflow(page: Page, contextLabel: string) {
  const metrics = await page.evaluate(() => ({
    docScrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    bodyScrollW: document.body.scrollWidth,
  }))
  expect(
    metrics.docScrollW,
    `Horizontal overflow (${contextLabel}): scrollWidth=${metrics.docScrollW} > innerWidth=${metrics.innerW}`
  ).toBeLessThanOrEqual(metrics.innerW + 1)
  expect(
    metrics.bodyScrollW,
    `Body horizontal overflow (${contextLabel}): bodyScrollW=${metrics.bodyScrollW} > innerWidth=${metrics.innerW}`
  ).toBeLessThanOrEqual(metrics.innerW + 1)
}

/* ============================================================================
 * Shared Auth, Shop, Market & Notification Helpers
 * ========================================================================== */

interface MockAuthUser {
  id: string
  email: string
  username: string
  full_name: string
  role: "user" | "team_lead" | "admin"
}

const DEFAULT_STAFF_USER: MockAuthUser = {
  id: "u-staff-1",
  email: "hanh@iqx.vn",
  username: "hanh",
  full_name: "Lê Ngọc Hạnh",
  role: "user",
}

const DEFAULT_BOSS_USER: MockAuthUser = {
  id: "u-boss",
  email: "huy@iqx.vn",
  username: "lehuy",
  full_name: "Lê Huy",
  role: "team_lead",
}

const DEFAULT_OUTSIDER_USER: MockAuthUser = {
  id: "u-outsider",
  email: "outsider@iqx.vn",
  username: "outsider",
  full_name: "Người ngoài nhóm",
  role: "user",
}

function makeShopState() {
  return {
    catalog_version: "iqx-mascot-shop-v1",
    catalog: [
      {
        mascot_id: "bach_ho",
        name: "Bạch Hổ",
        price_xu: 0,
        for_sale: false,
        is_default: true,
        sort_order: 1,
        asset_slug: "bach-ho",
        asset_root: "/assets/mascots-2d/v2/bach-ho",
      },
    ],
    wallet: { balance: 1500, last_seq: 4 },
    totals: { earned_xu: 1500, spent_xu: 0, lessons_rewarded: 3 },
    owned: [{ mascot_id: "bach_ho", source: "default", acquired_at: null }],
    owned_count: 1,
    total_count: 1,
    active: { mascot_id: "bach_ho", revision: 1, updated_at: null },
    provisioned: true,
    pet_levels: [],
  }
}

const VN30_SYMBOLS = [
  "ACB", "BCM", "BID", "BVH", "CTG", "FPT", "GAS", "GVR", "HDB", "HPG",
  "MBB", "MSN", "MWG", "PLX", "POW", "SAB", "SHB", "SSB", "SSI", "STB",
  "TCB", "TPB", "VCB", "VHM", "VIB", "VIC", "VJC", "VNM", "VPB", "VRE",
]

function makeMarketIndicesPayload() {
  return {
    data: [
      {
        symbol: "VNINDEX",
        price: 1295.42,
        ref_price: 1283.1,
        change: 12.32,
        change_percent: 0.96,
        total_shares: 842_000_000,
        total_value_million_vnd: 21_450_000,
        total_stock_increase: 290,
        total_stock_decline: 112,
        total_stock_no_change: 48,
        total_stock_ceiling: 18,
        total_stock_floor: 2,
        time: "2026-11-23T08:00:00Z",
      },
      {
        symbol: "VN30",
        price: 1362.18,
        ref_price: 1347.5,
        change: 14.68,
        change_percent: 1.09,
        total_shares: 325_000_000,
        total_value_million_vnd: 10_280_000,
        total_stock_increase: 22,
        total_stock_decline: 5,
        total_stock_no_change: 3,
        total_stock_ceiling: 2,
        total_stock_floor: 0,
        time: "2026-11-23T08:00:00Z",
      },
      {
        symbol: "HNXIndex",
        price: 231.45,
        ref_price: 230.1,
        change: 1.35,
        change_percent: 0.59,
        total_shares: 95_000_000,
        total_value_million_vnd: 1_850_000,
        total_stock_increase: 90,
        total_stock_decline: 55,
        total_stock_no_change: 45,
        total_stock_ceiling: 6,
        total_stock_floor: 1,
        time: "2026-11-23T08:00:00Z",
      },
    ],
    meta: { as_of: "2026-11-23T08:00:00Z" },
  }
}

function makePriceBoardPayload(symbols: string[]) {
  return {
    data: symbols.map((symbol, idx) => {
      const ref = 25 + (idx % 10) * 10
      const pct = idx % 5 === 0 ? 6.9 : idx % 4 === 0 ? -1.8 : idx % 3 === 0 ? 0 : 1.9
      const close = Number((ref * (1 + pct / 100)).toFixed(2))
      return {
        symbol,
        exchange: "HOSE",
        reference_price: ref,
        close_price: close,
        ceiling_price: Number((ref * 1.07).toFixed(2)),
        floor_price: Number((ref * 0.93).toFixed(2)),
        open_price: ref,
        high_price: Math.max(ref, close),
        low_price: Math.min(ref, close),
        price_change: Number((close - ref).toFixed(2)),
        percent_change: pct,
        total_volume: 1_500_000 + idx * 120_000,
        total_value: 85_000_000_000,
        bid_prices: [],
        ask_prices: [],
        foreign_buy_volume: 120_000,
        foreign_sell_volume: 75_000,
      }
    }),
    meta: { as_of: "2026-11-23T08:00:00Z" },
  }
}

async function seedAuthTokens(
  page: Page,
  extraInit?: { theme?: "light" | "dark"; thanTaiAutoDate?: string }
) {
  await page.addInitScript((opts) => {
    sessionStorage.setItem("iqx.v2.access_token", "e2e-member-token")
    sessionStorage.setItem("iqx.v2.refresh_token", "e2e-refresh-token")
    sessionStorage.setItem("iqx.v2.remember", "false")
    if (opts?.theme) {
      localStorage.setItem("theme", opts.theme)
    }
    if (opts?.thanTaiAutoDate) {
      localStorage.setItem("iqx.floor.thantai.auto", opts.thanTaiAutoDate)
    }
  }, extraInit ?? {})
}

/* ============================================================================
 * Trading Floor Mock Setup
 * ========================================================================== */

interface TradingFloorMockOptions {
  initialProfile: { name: string; avatar: string; color: string } | null
  user?: MockAuthUser
}

async function setupTradingFloorMocks(
  page: Page,
  options: TradingFloorMockOptions
) {
  const authUser = options.user ?? {
    id: "u-tf-1",
    email: "minhanh@iqx.vn",
    username: "member",
    full_name: "Minh Anh",
    role: "user" as const,
  }
  let profile = options.initialProfile

  // Compute today's VN date so ThanTai doesn't auto-pop over our initial 3D floor inspection
  const todayVn = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
  await seedAuthTokens(page, { thanTaiAutoDate: todayVn })

  // Silence market-data WS
  await page.routeWebSocket("**/api/v2/market-data/ws*", () => {})

  // Interactive Trading Floor WS mock with live SACO peer + bot peer + peer emote
  await page.routeWebSocket("**/api/v2/trading-floor/ws*", (ws) => {
    ws.onMessage((raw) => {
      if (typeof raw !== "string") return
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw) as Record<string, unknown>
      } catch {
        return
      }
      if (msg.type === "auth") {
        ws.send(
          JSON.stringify({
            type: "ready",
            userId: authUser.id,
            guest: false,
          })
        )
        return
      }
      if (msg.type === "hello") {
        const selfName = profile?.name ?? "Minh Anh"
        const selfAvatar = profile?.avatar ?? "male01"
        const selfColor = profile?.color ?? "default"
        ws.send(
          JSON.stringify({
            type: "welcome",
            self: {
              id: "conn-self",
              name: selfName,
              avatar: selfAvatar,
              color: selfColor,
              x: typeof msg.x === "number" ? msg.x : 1024,
              y: typeof msg.y === "number" ? msg.y : 540,
              facing: typeof msg.facing === "string" ? msg.facing : "n",
              moving: false,
            },
            peers: [
              {
                id: "conn-saco-1",
                name: "SACO Ngọc Lan",
                avatar: "female05",
                color: "teal",
                x: 1180,
                y: 590,
                facing: "w",
                moving: false,
                saco: true,
                sacoId: "saco-1",
              },
              {
                id: "conn-peer-2",
                name: "Hoàng Quân",
                avatar: "male04",
                color: "navy",
                x: 880,
                y: 620,
                facing: "ne",
                moving: false,
              },
            ],
            rains: [],
          })
        )
        // Push a quick peer emote so QuickChat history renders cleanly on floor
        setTimeout(() => {
          try {
            ws.send(
              JSON.stringify({
                type: "peer:emote",
                id: "conn-saco-1",
                text: "Chào mừng cả nhà đến Khu Giao Dịch 3D!",
              })
            )
          } catch {
            // Socket closed
          }
        }, 250)
        return
      }
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }))
      }
    })
  })

  await page.route("**/api/v2/**", async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const p = url.pathname.replace(/^.*\/api\/v2/, "")
    const method = req.method()

    if (p === "/auth/me") return json(route, authUser)
    if (p === "/premium/me") return json(route, { is_premium: false })
    if (p === "/shop") return json(route, makeShopState())
    if (p === "/me/notifications/unread-count")
      return json(route, { unread_count: 0 })
    if (p === "/me/notifications")
      return json(route, { items: [], unread_count: 0 })

    // Market data for HUD + LED wall + MarketPanel
    if (p === "/market-data/overview/market-index") {
      return json(route, makeMarketIndicesPayload())
    }
    if (p === "/market-data/reference/groups/VN30/symbols") {
      return json(route, {
        data: VN30_SYMBOLS.map((symbol) => ({ symbol })),
        meta: { as_of: "2026-11-23T08:00:00Z" },
      })
    }
    if (p === "/market-data/trading/price-board") {
      const parsed = (req.postDataJSON() ?? {}) as { symbols?: string[] }
      return json(
        route,
        makePriceBoardPayload(parsed.symbols ?? VN30_SYMBOLS)
      )
    }
    if (p === "/market-data/reference/symbols") {
      return json(route, {
        data: VN30_SYMBOLS.map((symbol) => ({
          symbol,
          exchange: "HOSE",
          asset_type: "stock",
          name: `Công ty ${symbol}`,
        })),
        meta: { as_of: "2026-11-23T08:00:00Z" },
      })
    }

    // Trading Floor REST
    if (p === "/trading-floor/me" && method === "GET") {
      return json(route, {
        profile,
        suggestedName: "Minh Anh",
        saco: null,
        guest: false,
      })
    }
    if (p === "/trading-floor/profile" && method === "PUT") {
      const body = req.postDataJSON() as {
        name: string
        avatar: string
        color: string
      }
      profile = {
        name: body.name,
        avatar: body.avatar,
        color: body.color,
      }
      return json(route, profile)
    }
    if (p === "/trading-floor/chat/inbox") {
      return json(route, {
        saco: null,
        asUser: [],
        asSaco: [],
        matchedConvId: null,
      })
    }
    if (p === "/trading-floor/posts/today") {
      return json(route, {
        date: todayVn,
        items: [
          {
            id: "post-1",
            sacoId: "saco-1",
            sacoName: "SACO Ngọc Lan",
            headline: "VN-Index giữ vững mốc 1.290, dòng tiền lan tỏa nhóm ngân hàng",
            publishedAt: Date.now() - 1_800_000,
            editedAt: null,
            hearts: 24,
            comments: 5,
            hearted: false,
          },
          {
            id: "post-2",
            sacoId: "saco-2",
            sacoName: "SACO Minh Khôi",
            headline: "Nhóm công nghệ dẫn sóng với FPT bứt phá đỉnh ngắn hạn",
            publishedAt: Date.now() - 3_600_000,
            editedAt: null,
            hearts: 17,
            comments: 2,
            hearted: false,
          },
        ],
      })
    }
    if (p === "/trading-floor/than-tai/leaderboard") {
      return json(route, {
        month: "2026-11",
        scoredDays: 14,
        rows: [
          {
            rank: 1,
            name: "Huy Hoàng",
            avatar: "male04",
            color: "gold",
            correct: 12,
            total: 14,
          },
          {
            rank: 2,
            name: "Ngọc Lan",
            avatar: "female03",
            color: "burgundy",
            correct: 11,
            total: 14,
          },
          {
            rank: 3,
            name: "Minh Tuấn",
            avatar: "male02",
            color: "cobalt",
            correct: 10,
            total: 14,
          },
        ],
        me: null,
        asOf: Date.now(),
      })
    }
    if (p === "/trading-floor/than-tai/today") {
      const nowMs = Date.now()
      return json(route, {
        status: "chua_khan",
        step: 1,
        serverTime: nowMs,
        deadline: nowMs + 3_600_000,
        day: {
          date: todayVn,
          canChi: "Giáp Thìn",
          napAm: "Phú Đăng Hoả",
          hanh: "hoa",
          hanhLabel: "Hành Hoả",
          hop: [{ hanh: "moc", label: "Mộc sinh Hoả", nganh: ["Công nghệ", "Bán lẻ"] }],
          kieng: [{ hanh: "thuy", label: "Thuỷ khắc Hoả", nganh: ["Thuỷ sản"] }],
          mau: [
            { ten: "Đỏ son", hex: "#C53030" },
            { ten: "Vàng kim", hex: "#E9B949" },
          ],
          huong: "Đông Nam",
        },
        vnindexRef: 1283.1,
        la: null,
        prediction: null,
        tickers: null,
      })
    }

    return route.fallback()
  })
}

/* ============================================================================
 * Khu Văn phòng (Office) Rich Schema-Exact Fixtures & Stateful Mock Server
 * ========================================================================== */

const OFFICE_STAFF_ROSTER = [
  {
    id: "m-1",
    userId: "u-staff-1",
    role: "staff" as const,
    displayName: "Lê Ngọc Hạnh",
    email: "hanh@iqx.vn",
    avatar: "female01",
    avatarColor: null,
    deskIndex: 0,
    accentColor: "#C2417D",
    online: true,
    joinDate: "2024-05-10",
    tenure: { years: 2, months: 6, days: 13, label: "2 năm 6 tháng 13 ngày" },
  },
  {
    id: "m-2",
    userId: "u-staff-2",
    role: "staff" as const,
    displayName: "Nguyễn Văn An",
    email: "an@iqx.vn",
    avatar: "male01",
    avatarColor: "cobalt",
    deskIndex: 1,
    accentColor: "#1D6FE8",
    online: true,
    joinDate: "2025-02-01",
    tenure: { years: 1, months: 9, days: 22, label: "1 năm 9 tháng 22 ngày" },
  },
  {
    id: "m-3",
    userId: "u-staff-3",
    role: "staff" as const,
    displayName: "Trần Thị Bình",
    email: "binh@iqx.vn",
    avatar: "female03",
    avatarColor: "forest",
    deskIndex: 2,
    accentColor: "#0E9F6E",
    online: true,
    joinDate: "2025-06-15",
    tenure: { years: 1, months: 5, days: 8, label: "1 năm 5 tháng 8 ngày" },
  },
  {
    id: "m-4",
    userId: "u-staff-4",
    role: "staff" as const,
    displayName: "Phạm Minh Cường",
    email: "cuong@iqx.vn",
    avatar: "male02",
    avatarColor: "plum",
    deskIndex: 3,
    accentColor: "#7C3AED",
    online: false,
    joinDate: "2025-09-01",
    tenure: { years: 1, months: 2, days: 22, label: "1 năm 2 tháng 22 ngày" },
  },
  {
    id: "m-5",
    userId: "u-staff-5",
    role: "staff" as const,
    displayName: "Đặng Phúc",
    email: "phuc@iqx.vn",
    avatar: "male03",
    avatarColor: "teal",
    deskIndex: 4,
    accentColor: "#0E8FA8",
    online: true,
    joinDate: "2026-01-12",
    tenure: { years: 0, months: 10, days: 11, label: "10 tháng 11 ngày" },
  },
  {
    id: "m-6",
    userId: "u-staff-6",
    role: "staff" as const,
    displayName: "Dương Hương",
    email: "huong@iqx.vn",
    avatar: "female04",
    avatarColor: "gold",
    deskIndex: 5,
    accentColor: "#E07B16",
    online: false,
    joinDate: "2026-07-01",
    tenure: { years: 0, months: 4, days: 22, label: "4 tháng 22 ngày" },
  },
] as const

const OFFICE_BOSS_MEMBER = {
  id: "m-boss",
  userId: "u-boss",
  role: "boss" as const,
  displayName: "Lê Huy",
  avatar: "male04",
  avatarColor: "navy",
  deskIndex: null,
  accentColor: "#B7791F",
  online: true,
}

interface OfficeMockOptions {
  role: "staff" | "boss" | "none"
  theme?: "light" | "dark"
  notifications?: Array<{
    id: string
    type: string
    trade_date: string
    title: string
    body: string
    link: string
    read_at: string | null
    created_at: string
  }>
}

async function setupOfficeMocks(page: Page, options: OfficeMockOptions) {
  const authUser =
    options.role === "boss"
      ? DEFAULT_BOSS_USER
      : options.role === "staff"
        ? DEFAULT_STAFF_USER
        : DEFAULT_OUTSIDER_USER

  await seedAuthTokens(page, { theme: options.theme })

  // Silence market-data WS
  await page.routeWebSocket("**/api/v2/market-data/ws*", () => {})

  // Office WS mock with realistic online peers
  await page.routeWebSocket("**/api/v2/office/ws*", (ws) => {
    ws.onMessage((raw) => {
      if (typeof raw !== "string") return
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw) as Record<string, unknown>
      } catch {
        return
      }
      if (msg.type === "auth" && options.role !== "none") {
        const isBoss = options.role === "boss"
        const selfPeer = isBoss
          ? {
              peerId: "p-boss",
              userId: "u-boss",
              role: "boss",
              name: "Lê Huy",
              avatar: "male04",
              avatarColor: "navy",
              accentColor: "#B7791F",
              deskIndex: null,
              x: 440,
              y: 340,
              facing: "down",
              moving: false,
            }
          : {
              peerId: "p-staff-1",
              userId: "u-staff-1",
              role: "staff",
              name: "Lê Ngọc Hạnh",
              avatar: "female01",
              avatarColor: null,
              accentColor: "#C2417D",
              deskIndex: 0,
              x: 245,
              y: 870,
              facing: "down",
              moving: false,
            }
        const allOnline = [
          {
            peerId: "p-boss",
            userId: "u-boss",
            role: "boss",
            name: "Lê Huy",
            avatar: "male04",
            avatarColor: "navy",
            accentColor: "#B7791F",
            deskIndex: null,
            x: 440,
            y: 310,
            facing: "down",
            moving: false,
          },
          {
            peerId: "p-staff-1",
            userId: "u-staff-1",
            role: "staff",
            name: "Lê Ngọc Hạnh",
            avatar: "female01",
            avatarColor: null,
            accentColor: "#C2417D",
            deskIndex: 0,
            x: 245,
            y: 870,
            facing: "down",
            moving: false,
          },
          {
            peerId: "p-staff-2",
            userId: "u-staff-2",
            role: "staff",
            name: "Nguyễn Văn An",
            avatar: "male01",
            avatarColor: "cobalt",
            accentColor: "#1D6FE8",
            deskIndex: 1,
            x: 515,
            y: 870,
            facing: "down",
            moving: false,
          },
          {
            peerId: "p-staff-3",
            userId: "u-staff-3",
            role: "staff",
            name: "Trần Thị Bình",
            avatar: "female03",
            avatarColor: "forest",
            accentColor: "#0E9F6E",
            deskIndex: 2,
            x: 785,
            y: 960,
            facing: "down",
            moving: false,
          },
          {
            peerId: "p-staff-5",
            userId: "u-staff-5",
            role: "staff",
            name: "Đặng Phúc",
            avatar: "male03",
            avatarColor: "teal",
            accentColor: "#0E8FA8",
            deskIndex: 4,
            x: 1325,
            y: 870,
            facing: "down",
            moving: false,
          },
        ]
        ws.send(
          JSON.stringify({
            type: "welcome",
            self: selfPeer,
            peers: allOnline.filter((p) => p.userId !== selfPeer.userId),
            onlineCount: allOnline.length,
          })
        )
        return
      }
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }))
      }
    })
  })

  // Stateful data stores so interactive flows persist during tests
  let selfCheckedInAt: string | null = null
  const notifications = [...(options.notifications ?? [])]
  let markReadCalls = 0

  const myTasks = {
    periodMonth: "2026-11",
    todayDate: "2026-11-23",
    monthlyPoints: 260,
    day: [
      {
        id: "t-day-todo",
        assignmentId: "asg-1",
        userId: "u-staff-1",
        kind: "day",
        title: "Cập nhật báo cáo thị trường đầu phiên",
        points: 10,
        pointsSnapshot: null,
        status: "todo",
        repeatDaily: true,
        dueDate: null,
        overdue: false,
        periodMonth: "2026-11",
        taskDate: "2026-11-23",
        submitNote: null,
        submittedAt: null,
        returnReason: null,
        returnedAt: null,
        approvedAt: null,
        createdAt: "2026-11-23T00:00:00.000Z",
      },
      {
        id: "t-day-pending",
        assignmentId: "asg-2",
        userId: "u-staff-1",
        kind: "day",
        title: "Gọi chăm sóc 8 khách hàng VIP",
        points: 15,
        pointsSnapshot: null,
        status: "pending",
        repeatDaily: true,
        dueDate: null,
        overdue: false,
        periodMonth: "2026-11",
        taskDate: "2026-11-23",
        submitNote: "Đã liên hệ đủ 8/8 khách, 3 khách chốt nâng NAV.",
        submittedAt: "2026-11-23T02:10:00.000Z",
        returnReason: null,
        returnedAt: null,
        approvedAt: null,
        createdAt: "2026-11-23T00:00:00.000Z",
      },
      {
        id: "t-day-done",
        assignmentId: "asg-3",
        userId: "u-staff-1",
        kind: "day",
        title: "Gửi bản tin sáng vào nhóm Zalo",
        points: 10,
        pointsSnapshot: 10,
        status: "done",
        repeatDaily: true,
        dueDate: null,
        overdue: false,
        periodMonth: "2026-11",
        taskDate: "2026-11-23",
        submitNote: "Đã đăng lúc 08:15",
        submittedAt: "2026-11-23T01:15:00.000Z",
        returnReason: null,
        returnedAt: null,
        approvedAt: "2026-11-23T01:30:00.000Z",
        createdAt: "2026-11-23T00:00:00.000Z",
      },
    ],
    month: [
      {
        id: "t-month-returned",
        assignmentId: "asg-4",
        userId: "u-staff-1",
        kind: "month",
        title: "Hoàn thiện hồ sơ phân tích ngành Ngân hàng",
        points: 40,
        pointsSnapshot: null,
        status: "returned",
        repeatDaily: false,
        dueDate: "2026-11-28",
        overdue: false,
        periodMonth: "2026-11",
        taskDate: "2026-11-01",
        submitNote: "Đã gửi bản nháp lần 1",
        submittedAt: "2026-11-21T03:00:00.000Z",
        returnReason: "Bổ sung thêm so sánh NIM quý 3 của VCB và TCB.",
        returnedAt: "2026-11-22T02:00:00.000Z",
        approvedAt: null,
        createdAt: "2026-11-01T00:00:00.000Z",
      },
      {
        id: "t-month-done",
        assignmentId: "asg-5",
        userId: "u-staff-1",
        kind: "month",
        title: "Tổng hợp phản hồi khách hàng tháng 11",
        points: 40,
        pointsSnapshot: 40,
        status: "done",
        repeatDaily: false,
        dueDate: "2026-11-30",
        overdue: false,
        periodMonth: "2026-11",
        taskDate: "2026-11-01",
        submitNote: "Đã gửi bảng tổng hợp",
        submittedAt: "2026-11-18T03:00:00.000Z",
        returnReason: null,
        returnedAt: null,
        approvedAt: "2026-11-18T05:00:00.000Z",
        createdAt: "2026-11-01T00:00:00.000Z",
      },
    ],
    kpi: [
      {
        id: "t-kpi-todo",
        assignmentId: "asg-6",
        userId: "u-staff-1",
        kind: "kpi",
        title: "Mở mới 15 tài khoản giao dịch kích hoạt",
        points: 100,
        pointsSnapshot: null,
        status: "todo",
        repeatDaily: false,
        dueDate: "2026-11-30",
        overdue: false,
        periodMonth: "2026-11",
        taskDate: "2026-11-01",
        submitNote: null,
        submittedAt: null,
        returnReason: null,
        returnedAt: null,
        approvedAt: null,
        createdAt: "2026-11-01T00:00:00.000Z",
      },
    ],
  }

  const proposals = [
    {
      id: "prop-1",
      userId: "u-staff-1",
      staffName: "Lê Ngọc Hạnh",
      staffAccentColor: "#C2417D",
      content: "Đề xuất họp nhanh 15 phút đầu tuần rà soát danh mục khuyến nghị.",
      status: "sent" as "sent" | "seen" | "replied",
      seenAt: null as string | null,
      reply: null as string | null,
      repliedAt: null as string | null,
      createdAt: "2026-11-23T01:45:00.000Z",
    },
    {
      id: "prop-2",
      userId: "u-staff-1",
      staffName: "Lê Ngọc Hạnh",
      staffAccentColor: "#C2417D",
      content: "Cập nhật mẫu slide tư vấn mới cho khách hàng tổ chức.",
      status: "replied" as "sent" | "seen" | "replied",
      seenAt: "2026-11-21T03:00:00.000Z",
      reply: "Đồng ý, gửi bản mẫu vào Phòng tài liệu thứ Tư này nhé!",
      repliedAt: "2026-11-21T03:20:00.000Z",
      createdAt: "2026-11-21T02:00:00.000Z",
    },
  ]

  const stickyNotes = [
    {
      id: "sn-1",
      color: "y" as const,
      content: "Gọi anh Minh lúc 10:30 trao đổi nhóm ngân hàng",
      createdAt: "2026-11-23T01:00:00.000Z",
      updatedAt: "2026-11-23T01:00:00.000Z",
    },
    {
      id: "sn-2",
      color: "p" as const,
      content: "Kiểm tra số liệu NIM Q3 của VCB, TCB, MBB",
      createdAt: "2026-11-23T01:10:00.000Z",
      updatedAt: "2026-11-23T01:10:00.000Z",
    },
    {
      id: "sn-3",
      color: "b" as const,
      content: "Chuẩn bị câu hỏi cho buổi họp nhóm 09:00",
      createdAt: "2026-11-23T01:20:00.000Z",
      updatedAt: "2026-11-23T01:20:00.000Z",
    },
    {
      id: "sn-4",
      color: "g" as const,
      content: "Gửi lịch đào tạo nội bộ cho nhóm",
      createdAt: "2026-11-23T01:30:00.000Z",
      updatedAt: "2026-11-23T01:30:00.000Z",
    },
  ]

  const assignments = [
    {
      id: "asg-1",
      kind: "day" as const,
      title: "Cập nhật báo cáo thị trường đầu phiên",
      points: 10,
      repeatDaily: true,
      dueDate: null as string | null,
      periodMonth: "2026-11",
      isAllTeam: true,
      targetCount: 6,
      activeCount: 4,
      doneCount: 2,
      targetUserIds: OFFICE_STAFF_ROSTER.map((s) => s.userId),
      createdAt: "2026-11-20T01:00:00.000Z",
    },
    {
      id: "asg-4",
      kind: "month" as const,
      title: "Hoàn thiện hồ sơ phân tích ngành Ngân hàng",
      points: 40,
      repeatDaily: false,
      dueDate: "2026-11-28" as string | null,
      periodMonth: "2026-11",
      isAllTeam: false,
      targetCount: 2,
      activeCount: 1,
      doneCount: 1,
      targetUserIds: ["u-staff-1", "u-staff-2"],
      createdAt: "2026-11-05T01:00:00.000Z",
    },
  ]

  const reviewItems = [
    {
      id: "rev-1",
      assignmentId: "asg-1",
      userId: "u-staff-1",
      staffName: "Lê Ngọc Hạnh",
      staffAccentColor: "#C2417D",
      kind: "day" as const,
      title: "Gọi chăm sóc 8 khách hàng VIP",
      points: 15,
      taskDate: "2026-11-23",
      dueDate: null,
      submitNote: "Đã liên hệ đủ 8/8 khách, 3 khách chốt nâng NAV.",
      submittedAt: "2026-11-23T01:30:00.000Z",
    },
    {
      id: "rev-2",
      assignmentId: "asg-4",
      userId: "u-staff-2",
      staffName: "Nguyễn Văn An",
      staffAccentColor: "#1D6FE8",
      kind: "month" as const,
      title: "Hoàn thiện hồ sơ phân tích ngành Ngân hàng",
      points: 40,
      taskDate: "2026-11-23",
      dueDate: "2026-11-28",
      submitNote: "Đã cập nhật đủ bảng so sánh 6 ngân hàng.",
      submittedAt: "2026-11-23T02:05:00.000Z",
    },
  ]

  const createdAssignments: unknown[] = []

  function buildMe() {
    if (options.role === "none") {
      return {
        member: false,
        role: "none",
        serverTime: "2026-11-23T01:20:00.000Z",
        todayDate: "2026-11-23",
        periodMonth: "2026-11",
        isWorkday: true,
        isAttendanceLocked: false,
        cutoffs: { onTime: "08:30", lock: "12:00" },
        onlineCount: 0,
        onlineUserIds: [],
        team: null,
        self: null,
        members: [],
        hud: null,
      }
    }
    const members = [
      OFFICE_BOSS_MEMBER,
      ...OFFICE_STAFF_ROSTER.map((item) =>
        Object.fromEntries(
          Object.entries(item).filter(
            ([key]) => key !== "email" && key !== "joinDate" && key !== "tenure"
          )
        )
      ),
    ]
    const isBoss = options.role === "boss"
    return {
      member: true,
      role: options.role,
      serverTime: "2026-11-23T01:20:00.000Z",
      todayDate: "2026-11-23",
      periodMonth: "2026-11",
      isWorkday: true,
      isAttendanceLocked: false,
      cutoffs: { onTime: "08:30", lock: "12:00" },
      onlineCount: 5,
      onlineUserIds: ["u-boss", "u-staff-1", "u-staff-2", "u-staff-3", "u-staff-5"],
      team: {
        id: "team-1",
        name: "Nhóm Lê Huy",
        bossUserId: "u-boss",
        bossName: "Lê Huy",
        checkinOnTimeCutoff: "08:30",
        checkinLockCutoff: "12:00",
      },
      self: isBoss ? members[0] : members[1],
      members,
      hud: isBoss
        ? {
            kind: "boss",
            pendingCount: reviewItems.length,
            newProposalsCount: proposals.filter((p) => p.status === "sent").length,
            todayDoneCount: 8,
            todayTotalCount: 18,
            staffCount: OFFICE_STAFF_ROSTER.length,
            latestStaffName: "Dương Hương",
          }
        : {
            kind: "staff",
            todayDoneCount: myTasks.day.filter((t) => t.status === "done").length,
            todayTotalCount: myTasks.day.length,
            pendingCount: myTasks.day.filter((t) => t.status === "pending").length,
            returnedCount: myTasks.month.filter((t) => t.status === "returned").length,
            monthlyPoints: myTasks.monthlyPoints,
            myAttendanceStatus: selfCheckedInAt ? "ok" : "absent",
            myCheckedInAt: selfCheckedInAt,
          },
    }
  }

  function buildAttendance() {
    const okList = [
      {
        userId: "u-staff-2",
        displayName: "Nguyễn Văn An",
        accentColor: "#1D6FE8",
        status: "ok" as const,
        checkedInAt: "2026-11-23T01:12:00.000Z",
        timeLabel: "08:12",
        isSelf: false,
      },
      {
        userId: "u-staff-3",
        displayName: "Trần Thị Bình",
        accentColor: "#0E9F6E",
        status: "ok" as const,
        checkedInAt: "2026-11-23T01:18:00.000Z",
        timeLabel: "08:18",
        isSelf: false,
      },
      ...(selfCheckedInAt
        ? [
            {
              userId: "u-staff-1",
              displayName: "Lê Ngọc Hạnh",
              accentColor: "#C2417D",
              status: "ok" as const,
              checkedInAt: selfCheckedInAt,
              timeLabel: "08:25",
              isSelf: options.role === "staff",
            },
          ]
        : []),
    ]
    const lateList = [
      {
        userId: "u-staff-5",
        displayName: "Đặng Phúc",
        accentColor: "#0E8FA8",
        status: "late" as const,
        checkedInAt: "2026-11-23T01:44:00.000Z",
        timeLabel: "08:44",
        isSelf: false,
      },
    ]
    const absentList = [
      ...(!selfCheckedInAt
        ? [
            {
              userId: "u-staff-1",
              displayName: "Lê Ngọc Hạnh",
              accentColor: "#C2417D",
              status: "absent" as const,
              checkedInAt: null,
              timeLabel: null,
              isSelf: options.role === "staff",
            },
          ]
        : []),
      {
        userId: "u-staff-4",
        displayName: "Phạm Minh Cường",
        accentColor: "#7C3AED",
        status: "absent" as const,
        checkedInAt: null,
        timeLabel: null,
        isSelf: false,
      },
      {
        userId: "u-staff-6",
        displayName: "Dương Hương",
        accentColor: "#E07B16",
        status: "absent" as const,
        checkedInAt: null,
        timeLabel: null,
        isSelf: false,
      },
    ]

    return {
      workDate: "2026-11-23",
      isWorkday: true,
      isLocked: false,
      cutoffs: { onTime: "08:30", lock: "12:00" },
      showDotsForAll: options.role === "boss",
      myStatus: selfCheckedInAt ? "ok" : "absent",
      myCheckedInAt: selfCheckedInAt,
      counts: {
        ok: okList.length,
        late: lateList.length,
        absent: absentList.length,
        total: OFFICE_STAFF_ROSTER.length,
      },
      roster: {
        ok: okList,
        late: lateList,
        absent: absentList,
      },
    }
  }

  await page.route("**/api/v2/**", async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const p = url.pathname.replace(/^.*\/api\/v2/, "")
    const method = req.method()

    if (p === "/auth/me") return json(route, authUser)
    if (p === "/premium/me") return json(route, { is_premium: false })
    if (p === "/shop") return json(route, makeShopState())

    // Notifications
    if (p === "/me/notifications/unread-count") {
      return json(route, {
        unread_count: notifications.filter((n) => !n.read_at).length,
      })
    }
    if (p === "/me/notifications" && method === "GET") {
      return json(route, {
        items: notifications,
        unread_count: notifications.filter((n) => !n.read_at).length,
      })
    }
    if (p === "/me/notifications/read" && method === "POST") {
      markReadCalls += 1
      const body = (req.postDataJSON() ?? {}) as { id?: string; all?: boolean }
      const nowIso = new Date().toISOString()
      for (const n of notifications) {
        if (body.all || n.id === body.id) {
          n.read_at = nowIso
        }
      }
      return json(route, {
        unread_count: notifications.filter((n) => !n.read_at).length,
      })
    }

    // Office REST endpoints
    if (p === "/office/me" && method === "GET") {
      return json(route, buildMe())
    }
    if (p === "/office/attendance/today" && method === "GET") {
      return json(route, buildAttendance())
    }
    if (p === "/office/attendance/check-in" && method === "POST") {
      selfCheckedInAt = "2026-11-23T01:25:00.000Z"
      return json(route, {
        status: "ok",
        checkedInAt: selfCheckedInAt,
        timeLabel: "08:25",
        workDate: "2026-11-23",
      })
    }
    if (p === "/office/leaderboard" && method === "GET") {
      return json(route, {
        periodMonth: "2026-11",
        monthNumber: 11,
        nextResetDate: "2026-12-01",
        nextResetLabel: "01/12",
        teamName: "Nhóm Lê Huy",
        bossName: "Lê Huy",
        totalRanked: 6,
        top3: [
          {
            rank: 1,
            userId: "u-staff-1",
            displayName: "Lê Ngọc Hạnh",
            accentColor: "#C2417D",
            points: 260,
            reachedAt: "2026-11-22T08:00:00.000Z",
          },
          {
            rank: 2,
            userId: "u-staff-2",
            displayName: "Nguyễn Văn An",
            accentColor: "#1D6FE8",
            points: 215,
            reachedAt: "2026-11-22T09:10:00.000Z",
          },
          {
            rank: 3,
            userId: "u-staff-3",
            displayName: "Trần Thị Bình",
            accentColor: "#0E9F6E",
            points: 190,
            reachedAt: "2026-11-22T10:30:00.000Z",
          },
        ],
        myRank: options.role === "staff" ? { rank: 1, points: 260 } : null,
      })
    }
    if (p === "/office/tasks" && method === "GET") {
      return json(route, myTasks)
    }
    if (p.startsWith("/office/tasks/") && p.endsWith("/submit") && method === "POST") {
      const taskId = p.slice("/office/tasks/".length, -"/submit".length)
      const body = (req.postDataJSON() ?? {}) as { note?: string }
      const allLists = [myTasks.day, myTasks.month, myTasks.kpi]
      for (const list of allLists) {
        const found = list.find((t) => t.id === taskId)
        if (found) {
          found.status = "pending"
          found.submitNote = body.note ?? ""
          found.submittedAt = "2026-11-23T02:20:00.000Z"
          return json(route, found)
        }
      }
      return json(route, { error: { message: "Not found" } }, 404)
    }
    if (p === "/office/proposals" && method === "GET") {
      return json(route, {
        items: proposals,
        unreadCount: proposals.filter((item) => item.status === "sent").length,
      })
    }
    if (p === "/office/proposals" && method === "POST") {
      const body = (req.postDataJSON() ?? {}) as { content: string }
      const created = {
        id: `prop-${proposals.length + 1}`,
        userId: "u-staff-1",
        staffName: "Lê Ngọc Hạnh",
        staffAccentColor: "#C2417D",
        content: body.content,
        status: "sent" as const,
        seenAt: null,
        reply: null,
        repliedAt: null,
        createdAt: "2026-11-23T02:30:00.000Z",
      }
      proposals.unshift(created)
      return json(route, created, 201)
    }
    if (p === "/office/proposals/team" && method === "GET") {
      return json(route, {
        items: proposals,
        unreadCount: proposals.filter((item) => item.status === "sent").length,
      })
    }
    if (p === "/office/notes" && method === "GET") {
      return json(route, { items: stickyNotes, maxNotes: 50 })
    }
    if (p === "/office/notes" && method === "POST") {
      const body = (req.postDataJSON() ?? {}) as {
        color?: "y" | "p" | "b" | "g"
        content?: string
      }
      const created = {
        id: `sn-${stickyNotes.length + 1}`,
        color: body.color ?? "y",
        content: body.content ?? "",
        createdAt: "2026-11-23T02:35:00.000Z",
        updatedAt: "2026-11-23T02:35:00.000Z",
      }
      stickyNotes.push(created)
      return json(route, created, 201)
    }
    if (p === "/office/meetings" && method === "GET") {
      const todayMeeting = {
        id: "meet-1",
        title: "Họp nhóm tuần",
        startsAt: "2026-11-23T02:00:00.000Z",
        durationMinutes: 60,
        platform: "Google Meet",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        agenda: [
          "Tổng kết tiến độ KPI tháng 11",
          "Định hướng danh mục khuyến nghị tuần mới",
        ],
        recurrenceWeekly: true,
        createdAt: "2026-11-20T01:00:00.000Z",
        updatedAt: "2026-11-20T01:00:00.000Z",
      }
      return json(route, {
        todayDate: "2026-11-23",
        nextWallMeeting: todayMeeting,
        today: [todayMeeting],
        upcoming: [
          {
            id: "meet-2",
            title: "Đào tạo phân tích kỹ thuật nội bộ",
            startsAt: "2026-11-25T07:00:00.000Z",
            durationMinutes: 45,
            platform: "Zoom",
            meetingUrl: "https://zoom.us/j/987654321",
            agenda: ["Mẫu hình dòng tiền VN30"],
            recurrenceWeekly: false,
            createdAt: "2026-11-20T02:00:00.000Z",
            updatedAt: "2026-11-20T02:00:00.000Z",
          },
        ],
      })
    }
    if (p === "/office/documents" && method === "GET") {
      return json(route, {
        maxSizeBytes: 20 * 1024 * 1024,
        allowedExts: ["pdf", "docx", "xlsx", "pptx", "png", "jpg"],
        items: [
          {
            id: "doc-1",
            title: "Sổ tay quy trình tư vấn SACO 2026",
            fileName: "so-tay-saco-2026.pdf",
            fileExt: "pdf",
            mimeType: "application/pdf",
            sizeBytes: 1_572_864,
            downloadUrl: "/api/v2/office/documents/doc-1/download?token=signed1",
            createdAt: "2026-11-20T03:00:00.000Z",
          },
          {
            id: "doc-2",
            title: "Bảng theo dõi KPI quý 4",
            fileName: "kpi-q4.xlsx",
            fileExt: "xlsx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            sizeBytes: 420_000,
            downloadUrl: "/api/v2/office/documents/doc-2/download?token=signed2",
            createdAt: "2026-11-18T03:00:00.000Z",
          },
        ],
      })
    }
    if (p === "/office/assignments" && method === "GET") {
      return json(route, { items: assignments })
    }
    if (p === "/office/assignments" && method === "POST") {
      const body = req.postDataJSON() as {
        kind: "day" | "month" | "kpi"
        title: string
        points: number
        repeatDaily?: boolean
        dueDate?: string | null
        userIds: string[]
      }
      createdAssignments.push(body)
      const created = {
        id: `asg-new-${assignments.length + 1}`,
        kind: body.kind,
        title: body.title,
        points: body.points,
        repeatDaily: Boolean(body.repeatDaily),
        dueDate: body.dueDate ?? null,
        periodMonth: "2026-11",
        isAllTeam: body.userIds.length >= OFFICE_STAFF_ROSTER.length,
        targetCount: body.userIds.length,
        activeCount: body.userIds.length,
        doneCount: 0,
        targetUserIds: body.userIds,
        createdAt: new Date().toISOString(),
      }
      assignments.unshift(created)
      return json(route, created, 201)
    }
    if (p === "/office/review" && method === "GET") {
      return json(route, { items: reviewItems })
    }
    if (p === "/office/progress" && method === "GET") {
      return json(route, {
        periodMonth: "2026-11",
        todayDate: "2026-11-23",
        items: [
          {
            userId: "u-staff-1",
            displayName: "Lê Ngọc Hạnh",
            accentColor: "#C2417D",
            dayDone: 2,
            dayTotal: 3,
            monthDone: 1,
            monthTotal: 2,
            kpiDone: 0,
            kpiTotal: 1,
            pendingCount: 1,
            points: 260,
          },
          {
            userId: "u-staff-2",
            displayName: "Nguyễn Văn An",
            accentColor: "#1D6FE8",
            dayDone: 2,
            dayTotal: 3,
            monthDone: 1,
            monthTotal: 2,
            kpiDone: 0,
            kpiTotal: 1,
            pendingCount: 1,
            points: 215,
          },
          {
            userId: "u-staff-3",
            displayName: "Trần Thị Bình",
            accentColor: "#0E9F6E",
            dayDone: 1,
            dayTotal: 3,
            monthDone: 1,
            monthTotal: 2,
            kpiDone: 0,
            kpiTotal: 1,
            pendingCount: 0,
            points: 190,
          },
          {
            userId: "u-staff-4",
            displayName: "Phạm Minh Cường",
            accentColor: "#7C3AED",
            dayDone: 1,
            dayTotal: 3,
            monthDone: 0,
            monthTotal: 2,
            kpiDone: 0,
            kpiTotal: 1,
            pendingCount: 0,
            points: 140,
          },
          {
            userId: "u-staff-5",
            displayName: "Đặng Phúc",
            accentColor: "#0E8FA8",
            dayDone: 1,
            dayTotal: 3,
            monthDone: 0,
            monthTotal: 2,
            kpiDone: 0,
            kpiTotal: 1,
            pendingCount: 0,
            points: 110,
          },
          {
            userId: "u-staff-6",
            displayName: "Dương Hương",
            accentColor: "#E07B16",
            dayDone: 0,
            dayTotal: 3,
            monthDone: 0,
            monthTotal: 2,
            kpiDone: 0,
            kpiTotal: 1,
            pendingCount: 0,
            points: 80,
          },
        ],
      })
    }
    if (p === "/office/members" && method === "GET") {
      return json(route, {
        todayDate: "2026-11-23",
        items: OFFICE_STAFF_ROSTER.map((s) => ({
          userId: s.userId,
          displayName: s.displayName,
          accentColor: s.accentColor,
          joinDate: s.joinDate,
          tenure: s.tenure,
        })),
      })
    }
    if (/^\/office\/members\/[^/]+$/.test(p) && method === "GET") {
      const uid = p.slice("/office/members/".length)
      const staff =
        OFFICE_STAFF_ROSTER.find((s) => s.userId === uid) ??
        OFFICE_STAFF_ROSTER[0]!
      return json(route, {
        userId: staff.userId,
        displayName: staff.displayName,
        email: staff.email,
        bossName: "Lê Huy",
        accentColor: staff.accentColor,
        joinDate: staff.joinDate,
        todayDate: "2026-11-23",
        tenure: staff.tenure,
        stats: {
          monthlyPoints: staff.userId === "u-staff-1" ? 260 : 180,
          tasksDone: 8,
          tasksTotal: 10,
          pendingCount: 1,
          attendanceOk: 16,
          attendanceLate: 1,
          attendanceAbsent: 0,
        },
        notes: [
          {
            id: "bn-1",
            content: "Tư vấn khách hàng bài bản, phản hồi nhanh.",
            createdAt: "2026-11-20T02:00:00.000Z",
          },
        ],
      })
    }

    return route.fallback()
  })

  return {
    getCreatedAssignments: () => createdAssignments,
    getMarkReadCalls: () => markReadCalls,
  }
}

/* ============================================================================
 * TEST 1 — Khu giao dịch JoinScreen + 3D Chibi Canvas + Zero `.webp` (1440×900)
 * ========================================================================== */

test("Test 1 — Khu giao dịch JoinScreen + 3D Chibi Canvas + Zero .webp (1440×900)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const watchers = attachWatchers(page, { forbidTradingFloorWebp: true })
  await setupTradingFloorMocks(page, { initialProfile: null })

  await page.goto("/khu-giao-dich", { waitUntil: "domcontentloaded" })

  // 1. JoinScreen opens with live 3D Chibi preview + 10 public avatars (5 Nam + 5 Nữ) + 10 outfit colors
  const joinForm = page.locator("form.join")
  await expect(joinForm).toBeVisible({ timeout: 30_000 })

  const previewStage = joinForm.locator(".preview-stage-3d")
  await expect(previewStage).toBeVisible()
  // Live Three.js WebGL preview canvas inside ChibiAvatar3DPreview
  const previewCanvas = previewStage.locator("canvas")
  await expect(previewCanvas).toBeVisible({ timeout: 25_000 })
  const previewBox = await previewCanvas.boundingBox()
  expect(previewBox!.width).toBeGreaterThanOrEqual(150)
  expect(previewBox!.height).toBeGreaterThanOrEqual(150)

  // Verify 10 outfit color swatches
  const swatches = joinForm.getByRole("radiogroup", { name: "Màu trang phục" }).getByRole("radio")
  await expect(swatches).toHaveCount(10)

  // Verify 5 Nam + 5 Nữ = 10 avatar portrait buttons (all data-URL chibi portraits, zero .webp)
  const maleTab = joinForm.getByRole("tab", { name: /Nam \(5\)/ })
  const femaleTab = joinForm.getByRole("tab", { name: /Nữ \(5\)/ })
  await expect(maleTab).toHaveAttribute("aria-selected", "true")
  const maleCards = joinForm.locator(".avatars .avatar-card")
  await expect(maleCards).toHaveCount(5)
  for (let i = 0; i < 5; i += 1) {
    const src = await maleCards.nth(i).locator("img").getAttribute("src")
    expect(src).toMatch(/^data:image\//)
  }

  // Switch to Nữ tab -> 5 female avatar cards, select female03 + switch color to "Đỏ rượu"
  await femaleTab.click()
  await expect(femaleTab).toHaveAttribute("aria-selected", "true")
  const femaleCards = joinForm.locator(".avatars .avatar-card")
  await expect(femaleCards).toHaveCount(5)
  for (let i = 0; i < 5; i += 1) {
    const src = await femaleCards.nth(i).locator("img").getAttribute("src")
    expect(src).toMatch(/^data:image\//)
  }
  await femaleCards.nth(2).click() // female03: Đầm tài chính hiện đại
  const burgundySwatch = joinForm.getByRole("radio", { name: "Đỏ rượu" })
  await burgundySwatch.click()
  await expect(burgundySwatch).toHaveAttribute("aria-checked", "true")
  await expect(previewStage.locator('[role="img"]')).toHaveAttribute(
    "aria-label",
    /Đầm tài chính hiện đại.*Đỏ rượu/
  )

  await page.waitForTimeout(300)
  await page.screenshot({ path: shot("01-trading-floor-join-1440.png") })

  // 2. Enter Trading Floor
  await joinForm.getByRole("button", { name: "Vào khu giao dịch" }).click()
  await expect(joinForm).toBeHidden({ timeout: 10_000 })

  // 3. Verify 3D WebGL Canvas mounts with >800×500 and rich non-blank rendered pixels
  const floorCanvas = page.locator(".tf-game canvas").first()
  await assertCanvasNonBlank(page, floorCanvas, {
    minWidth: 800,
    minHeight: 500,
    bgRgb: [12, 17, 27],
    minNonBgRatio: 0.25,
    minDistinctColors: 18,
  })

  // 4. Verify HUD, FxBar, QuickChat, PostsBoard & projected crisp Vietnamese nameplates
  await expect(page.locator(".hud .chip.brand")).toContainText("Khu Giao Dịch")
  await expect(page.locator(".hud .chip.me")).toContainText("Minh Anh")
  const fxBar = page.getByRole("toolbar", { name: "Hành động" })
  await expect(fxBar).toBeVisible()
  await expect(fxBar.getByRole("button", { name: /Xả xui/ })).toBeVisible()
  await expect(fxBar.getByRole("button", { name: /Gáy/ })).toBeVisible()
  await expect(fxBar.getByRole("button", { name: /Khấn/ })).toBeVisible()
  await expect(fxBar.getByRole("button", { name: /Tán lộc/ })).toBeVisible()

  // QuickChat renders incoming peer emote line
  const quickChat = page.getByRole("region", { name: "Trò chuyện trên sàn" })
  await expect(quickChat).toBeVisible({ timeout: 5_000 })
  await expect(quickChat).toContainText("Chào mừng cả nhà đến Khu Giao Dịch 3D!")

  // Projected crisp Vietnamese nameplates: self nameplate, SACO peer nameplate, & Thần Tài hint/greeting
  const selfPlate = page.locator('.tf-nameplate[data-kind="self"]')
  await expect(selfPlate).toBeVisible({ timeout: 5_000 })
  await expect(selfPlate).toContainText("Minh Anh")

  const peerPlates = page.locator('.tf-nameplate[data-kind="peer"]')
  await expect(peerPlates.filter({ hasText: "SACO Ngọc Lan" }).first()).toBeVisible()

  // Receptionist NPC nameplate exists in DOM overlay layer (projected when in camera frustum)
  const receptionPlate = page
    .locator('.tf-nameplate[data-kind="npc"]')
    .filter({ hasText: "Lễ tân IQX" })
  await expect(receptionPlate).toHaveCount(1)

  // Thần Tài greeting speech bubble & proximity hint near spawn
  await expect(page.locator(".hud .hint")).toContainText("Thần Tài")
  await expect(page.locator(".tf-bubble-right")).toBeVisible({ timeout: 5_000 })

  await page.screenshot({ path: shot("02-trading-floor-3d-1440.png") })

  // 5. Open & Escape-close MarketPanel, ThanTaiPanel, PostsLayer, LeaderboardPanel, ReceptionPanel
  // (a) MarketPanel
  await page.getByRole("button", { name: "Mở bảng thị trường" }).click()
  const marketDialog = page.getByRole("dialog", { name: "Thị trường" })
  await expect(marketDialog).toBeVisible()
  await expect(marketDialog.locator(".heat-tile").first()).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(marketDialog).toBeHidden()

  // (b) ThanTaiPanel (player spawns right at Thần Tài access point -> opens immediately)
  await page.locator(".shortcuts button", { hasText: "Thần Tài" }).click()
  const thanTaiDialog = page.getByRole("dialog", { name: "Thần Tài" })
  await expect(thanTaiDialog).toBeVisible({ timeout: 10_000 })
  await page.keyboard.press("Escape")
  await expect(thanTaiDialog).toBeHidden()

  // (c) PostsLayer (SACO NHẬN ĐỊNH slide-over)
  await page.locator(".tf-posts-board").click()
  const postsDialog = page.getByRole("dialog", { name: "SACO nhận định hôm nay" })
  await expect(postsDialog).toBeVisible()
  await expect(postsDialog).toContainText("SACO Ngọc Lan")
  await page.keyboard.press("Escape")
  await expect(postsDialog).toBeHidden()

  // (d) LeaderboardPanel (walks to Hall of Fame podium -> opens sheet -> assert Chibi avatars render!)
  await page.locator(".shortcuts button", { hasText: "Vinh danh" }).click()
  const lbDialog = page.getByRole("dialog", { name: "Vinh danh Top dự đoán" })
  await expect(lbDialog).toBeVisible({ timeout: 15_000 })
  const lbAvatars = lbDialog.locator("img.lb-avatar")
  await expect(lbAvatars).toHaveCount(3)
  for (let i = 0; i < 3; i += 1) {
    const img = lbAvatars.nth(i)
    await expect(img).toBeVisible()
    const info = await img.evaluate((el: HTMLImageElement) => ({
      src: el.getAttribute("src") ?? "",
      naturalWidth: el.naturalWidth,
    }))
    expect(info.src).toMatch(/^data:image\//)
    expect(info.naturalWidth).toBeGreaterThan(0)
  }
  await page.keyboard.press("Escape")
  await expect(lbDialog).toBeHidden()

  // (e) ReceptionPanel: walk SW toward Lễ tân IQX so her projected nameplate & desk are cleanly clear of bottom-left FxBar/QuickChat
  await page.keyboard.down("ArrowDown")
  await page.keyboard.down("ArrowLeft")
  await expect(receptionPlate).toBeVisible({ timeout: 12_000 })
  await expect
    .poll(
      async () => {
        const b = await receptionPlate.boundingBox()
        return Boolean(b && b.x > 240 && b.y < 680)
      },
      { timeout: 10_000 }
    )
    .toBe(true)
  await page.keyboard.up("ArrowDown")
  await page.keyboard.up("ArrowLeft")

  // Click directly on the Receptionist NPC / desk just below her projected nameplate to walk up & open ReceptionPanel
  const recBox = await receptionPlate.boundingBox()
  expect(recBox).not.toBeNull()
  await page.mouse.click(recBox!.x + recBox!.width / 2, recBox!.y + recBox!.height + 42)
  const receptionDialog = page.getByRole("dialog", { name: "Lễ tân · Hướng dẫn" })
  await expect(receptionDialog).toBeVisible({ timeout: 15_000 })
  await expect(receptionDialog).toContainText("Chào mừng tới")
  await page.keyboard.press("Escape")
  await expect(receptionDialog).toBeHidden()

  watchers.assertClean()
})

/* ============================================================================
 * TEST 2 — Khu giao dịch Mobile (390×844)
 * ========================================================================== */

test("Test 2 — Khu giao dịch Mobile (390×844) zero overflow & reachable controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const watchers = attachWatchers(page, { forbidTradingFloorWebp: true })
  await setupTradingFloorMocks(page, {
    initialProfile: { name: "Minh Anh", avatar: "female03", color: "burgundy" },
  })

  await page.goto("/khu-giao-dich", { waitUntil: "domcontentloaded" })

  const floorCanvas = page.locator(".tf-game canvas").first()
  await assertCanvasNonBlank(page, floorCanvas, {
    minWidth: 320,
    minHeight: 400,
    bgRgb: [12, 17, 27],
    minNonBgRatio: 0.25,
    minDistinctColors: 16,
  })

  // Zero horizontal overflow
  await assertNoHorizontalOverflow(page, "Trading Floor mobile 390x844")

  // Verify key controls are visible and inside viewport bounds (x in [0, 390])
  const checks: Locator[] = [
    page.locator(".hud .chip.brand"),
    page.locator(".hud .chip.me"),
    page.getByRole("toolbar", { name: "Hành động" }),
    page.locator(".shortcuts"),
    page.locator(".chat-pill"),
  ]
  for (const loc of checks) {
    await expect(loc).toBeVisible()
    const box = await loc.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(-1)
    expect(box!.x + box!.width).toBeLessThanOrEqual(391)
  }

  await page.screenshot({ path: shot("03-trading-floor-mobile-390.png") })
  watchers.assertClean()
})

/* ============================================================================
 * TEST 3 — Khu Văn phòng Non-Member Gate (1440×900)
 * ========================================================================== */

test("Test 3 — Khu Văn phòng Non-Member Gate exact Spec §2 copy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const watchers = attachWatchers(page)
  await setupOfficeMocks(page, { role: "none" })

  await page.goto("/van-phong", { waitUntil: "domcontentloaded" })

  await expect(
    page.getByText(
      "Bạn chưa thuộc nhóm nào. Liên hệ trưởng nhóm để được thêm vào văn phòng."
    )
  ).toBeVisible({ timeout: 30_000 })

  // Ensure no Office 3D stage / HUD rendered for non-member
  await expect(page.getByTestId("office-page")).toHaveCount(0)

  watchers.assertClean()
})

/* ============================================================================
 * TEST 4 — Khu Văn phòng Staff 3D World, HUD & NHIỆM VỤ CỦA TÔI (1440×900)
 * ========================================================================== */

test("Test 4 — Khu Văn phòng Staff 3D World, HUD, NHIỆM VỤ CỦA TÔI & Shared Modals (1440×900)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const watchers = attachWatchers(page)
  await setupOfficeMocks(page, { role: "staff" })

  await page.goto("/van-phong", { waitUntil: "domcontentloaded" })

  // 1. Verify Three.js 4-zone Office <canvas> mounts with non-blank multi-color 3D pixels
  const officeCanvas = page.locator(".of-canvas-host canvas").first()
  await assertCanvasNonBlank(page, officeCanvas, {
    minWidth: 800,
    minHeight: 500,
    bgRgb: [27, 23, 19],
    minNonBgRatio: 0.3,
    minDistinctColors: 18,
  })

  // Verify self projected nameplate
  const selfNameplate = page.locator('.of-nameplate[data-self="1"]')
  await expect(selfNameplate).toBeVisible({ timeout: 8_000 })
  await expect(selfNameplate).toContainText("Lê Ngọc Hạnh (bạn)")

  // Verify title pill + online count pill
  await expect(page.getByTestId("office-title-pill")).toContainText(
    "Văn phòng · Nhóm Lê Huy"
  )
  await expect(page.getByTestId("office-online-pill")).toContainText("5 trực tuyến")

  // 2. Verify Staff HUD cards (NHIỆM VỤ CỦA TÔI & ĐIỂM DANH)
  const mineCard = page.getByTestId("office-hud-card-mine")
  const attCard = page.getByTestId("office-hud-card-att")
  await expect(mineCard).toBeVisible()
  await expect(attCard).toBeVisible()
  await expect(mineCard).toContainText("1 cần làm lại")
  await expect(mineCard).toContainText("260")

  // STRICT: ZERO check-in button inside ĐIỂM DANH HUD card!
  await expect(attCard.getByTestId("office-checkin-btn")).toHaveCount(0)
  await expect(
    attCard.getByRole("button", { name: /^Điểm danh ·/ })
  ).toHaveCount(0)

  await page.screenshot({ path: shot("04-office-3d-staff-1440.png") })

  // Filter tiles aria-pressed toggles inline roster
  const okTile = attCard.getByRole("button", { name: /Đúng giờ/ })
  const lateTile = attCard.getByRole("button", { name: /Trễ/ })
  const absTile = attCard.getByRole("button", { name: /Vắng/ })
  await expect(okTile).toHaveAttribute("aria-pressed", "false")
  await okTile.click()
  await expect(okTile).toHaveAttribute("aria-pressed", "true")
  const roster = attCard.getByTestId("office-attendance-roster")
  await expect(roster).toBeVisible()
  await expect(roster).toContainText("Nguyễn Văn An")
  await expect(roster).toContainText("08:12")

  await lateTile.click()
  await expect(lateTile).toHaveAttribute("aria-pressed", "true")
  await expect(okTile).toHaveAttribute("aria-pressed", "false")
  await expect(roster).toContainText("Đặng Phúc")

  await absTile.click()
  await expect(absTile).toHaveAttribute("aria-pressed", "true")
  await expect(roster).toContainText("Lê Ngọc Hạnh")
  await expect(roster).toContainText("(bạn)")
  await absTile.click()
  await expect(roster).toBeHidden()

  // HUD collapse persists across reload
  const attHeaderBtn = attCard.locator("button.of-hc-head")
  await expect(attHeaderBtn).toHaveAttribute("aria-expanded", "true")
  await attHeaderBtn.click()
  await expect(attHeaderBtn).toHaveAttribute("aria-expanded", "false")

  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("office-hud-card-att").locator("button.of-hc-head")).toHaveAttribute(
    "aria-expanded",
    "false",
    { timeout: 25_000 }
  )
  // Expand back cleanly
  await page.getByTestId("office-hud-card-att").locator("button.of-hc-head").click()
  await expect(page.getByTestId("office-hud-card-att").locator("button.of-hc-head")).toHaveAttribute(
    "aria-expanded",
    "true"
  )

  // 3. Open NHIỆM VỤ CỦA TÔI modal -> verify 5-frame layout, header check-in, inline submit, proposal, pastel sticky notes
  await page
    .getByTestId("office-hud-card-mine")
    .getByRole("button", { name: /Mở nhiệm vụ của tôi/ })
    .click()
  const mineModal = page.getByTestId("office-modal-mine")
  await expect(mineModal).toBeVisible()

  // 5-frame layout
  await expect(mineModal.locator("section.of-fr")).toHaveCount(5)
  await expect(mineModal.getByRole("heading", { name: "NHIỆM VỤ NGÀY" })).toBeVisible()
  await expect(mineModal.getByRole("heading", { name: "NHIỆM VỤ THÁNG" })).toBeVisible()
  await expect(mineModal.getByRole("heading", { name: "KPI" })).toBeVisible()
  await expect(mineModal.getByRole("heading", { name: "ĐỀ XUẤT" })).toBeVisible()
  await expect(mineModal.getByRole("heading", { name: "GHI CHÚ" })).toBeVisible()

  // Header check-in button present inside NHIỆM VỤ CỦA TÔI
  const headerCheckIn = mineModal.getByTestId("office-checkin-btn")
  await expect(headerCheckIn).toBeVisible()

  // Pastel sticky notes (4 colors: y, p, b, g)
  await expect(mineModal.locator(".of-note.c-y")).toBeVisible()
  await expect(mineModal.locator(".of-note.c-p")).toBeVisible()
  await expect(mineModal.locator(".of-note.c-b")).toBeVisible()
  await expect(mineModal.locator(".of-note.c-g")).toBeVisible()

  // Proposal composer & history
  await expect(mineModal.getByLabel("Nội dung đề xuất")).toBeVisible()
  await expect(mineModal).toContainText("Sếp đã trả lời")

  // Open inline task submit form on todo daily task
  const todoTask = mineModal.getByTestId("office-task-t-day-todo")
  await todoTask.getByRole("button", { name: "Hoàn thành" }).click()
  const submitNoteArea = todoTask.getByLabel(
    "Ghi chú hoàn thành cho Cập nhật báo cáo thị trường đầu phiên"
  )
  await expect(submitNoteArea).toBeVisible()
  await submitNoteArea.fill("Đã cập nhật VN-Index & VN30 đầy đủ lúc 08:20")

  // Capture 5-frame modal screenshot with inline submit form, header check-in, proposals, pastel notes
  await page.screenshot({ path: shot("05-office-modal-mine-1440.png") })

  // Submit task + check-in + send proposal
  await todoTask.getByRole("button", { name: "Gửi sếp xác nhận" }).click()
  await expect(page.getByTestId("office-toast")).toContainText("Đã gửi sếp xác nhận")

  await headerCheckIn.click()
  await expect(page.getByTestId("office-toast")).toContainText("Đã điểm danh đúng giờ · 08:25")
  await expect(mineModal.getByTestId("office-checkin-status")).toContainText("Đã điểm danh · 08:25")

  await mineModal.getByLabel("Nội dung đề xuất").fill("Bổ sung checklist kiểm tra lệnh cuối phiên")
  await mineModal.getByRole("button", { name: "Gửi đề xuất" }).click()
  await expect(page.getByTestId("office-toast")).toContainText("Đã gửi đề xuất tới trưởng nhóm")

  await page.keyboard.press("Escape")
  await expect(mineModal).toBeHidden()

  // 4. Open shared modals: PHÒNG HỌP, PHÒNG TÀI LIỆU, THÀNH TÍCH THÁNG cleanly
  await page.goto("/van-phong?modal=meet", { waitUntil: "domcontentloaded" })
  const meetModal = page.getByTestId("office-modal-meet")
  await expect(meetModal).toBeVisible({ timeout: 10_000 })
  await expect(meetModal).toContainText("Họp nhóm tuần")
  await expect(meetModal).toContainText("Vào họp")
  await page.keyboard.press("Escape")
  await expect(meetModal).toBeHidden()

  await page.goto("/van-phong?modal=docs", { waitUntil: "domcontentloaded" })
  const docsModal = page.getByTestId("office-modal-docs")
  await expect(docsModal).toBeVisible({ timeout: 10_000 })
  await expect(docsModal).toContainText("Sổ tay quy trình tư vấn SACO 2026")
  await expect(docsModal).toContainText("Bảng theo dõi KPI quý 4")
  await page.keyboard.press("Escape")
  await expect(docsModal).toBeHidden()

  await page.goto("/van-phong?modal=stand", { waitUntil: "domcontentloaded" })
  const standModal = page.getByTestId("office-modal-stand")
  await expect(standModal).toBeVisible({ timeout: 10_000 })
  await expect(standModal).toContainText("THÀNH TÍCH THÁNG 11")
  await expect(standModal.getByTestId("office-lb-rank-1")).toContainText("Lê Ngọc Hạnh")
  await expect(standModal.getByTestId("office-lb-rank-2")).toContainText("Nguyễn Văn An")
  await expect(standModal.getByTestId("office-lb-rank-3")).toContainText("Trần Thị Bình")
  await expect(standModal.getByTestId("office-lb-my-rank")).toContainText("#1")
  await page.keyboard.press("Escape")
  await expect(standModal).toBeHidden()

  watchers.assertClean()
})

/* ============================================================================
 * TEST 5 — Khu Văn phòng Boss HUD, QUẢN LÝ & HỒ SƠ NHÂN VIÊN (1440×900)
 * ========================================================================== */

test("Test 5 — Khu Văn phòng Boss HUD, QUẢN LÝ & HỒ SƠ NHÂN VIÊN (1440×900)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const watchers = attachWatchers(page)
  const server = await setupOfficeMocks(page, { role: "boss" })

  await page.goto("/van-phong", { waitUntil: "domcontentloaded" })

  // Verify Boss HUD cards (QUẢN LÝ, HỒ SƠ NHÂN VIÊN, ĐIỂM DANH) & no Staff card
  const mgrCard = page.getByTestId("office-hud-card-mgr")
  const profCard = page.getByTestId("office-hud-card-prof")
  const attCard = page.getByTestId("office-hud-card-att")
  await expect(mgrCard).toBeVisible({ timeout: 30_000 })
  await expect(profCard).toBeVisible()
  await expect(attCard).toBeVisible()
  await expect(page.getByTestId("office-hud-card-mine")).toHaveCount(0)

  await expect(mgrCard).toContainText("QUẢN LÝ")
  await expect(profCard).toContainText("6 người")

  // Open QUẢN LÝ 2×2 modal
  await mgrCard.getByRole("button", { name: /Mở bảng Quản lý/ }).click()
  const mgrModal = page.getByTestId("office-modal-mgr")
  await expect(mgrModal).toBeVisible()
  await expect(mgrModal.locator("section.of-fr")).toHaveCount(4)
  await expect(mgrModal.getByRole("heading", { name: "GIAO NHIỆM VỤ" })).toBeVisible()
  await expect(mgrModal.getByRole("heading", { name: "CHỜ XÁC NHẬN" })).toBeVisible()
  await expect(mgrModal.getByRole("heading", { name: "ĐỀ XUẤT" })).toBeVisible()
  await expect(mgrModal.getByRole("heading", { name: "TIẾN ĐỘ NHÂN VIÊN" })).toBeVisible()

  await page.screenshot({ path: shot("06-office-modal-mgr-1440.png") })

  // Assign a new monthly task (verify typed title preserved when switching type -> points default 40)
  const titleInput = mgrModal.getByLabel(/^Tiêu đề/)
  await titleInput.fill("Rà soát danh mục khuyến nghị VN30")
  await mgrModal.getByRole("button", { name: "Tháng", exact: true }).click()
  await expect(titleInput).toHaveValue("Rà soát danh mục khuyến nghị VN30")
  await expect(mgrModal.getByLabel("Điểm thưởng (1–1000)")).toHaveValue("40")
  await mgrModal.getByRole("button", { name: "Giao nhiệm vụ" }).click()
  await expect(page.getByTestId("office-toast")).toContainText("Đã giao nhiệm vụ cho 6 nhân viên")
  expect(server.getCreatedAssignments()).toHaveLength(1)

  // Switch Giao mới <-> Đã giao
  const sentTab = mgrModal.getByRole("tab", { name: /Đã giao/ })
  const newTab = mgrModal.getByRole("tab", { name: "Giao mới" })
  await sentTab.click()
  await expect(sentTab).toHaveAttribute("aria-selected", "true")
  await expect(mgrModal).toContainText("Rà soát danh mục khuyến nghị VN30")
  await expect(mgrModal).toContainText("Cập nhật báo cáo thị trường đầu phiên")
  await newTab.click()
  await expect(newTab).toHaveAttribute("aria-selected", "true")

  // Click staff row in TIẾN ĐỘ NHÂN VIÊN -> opens HỒ SƠ NHÂN VIÊN
  await mgrModal
    .locator("table.of-tbl tbody tr", { hasText: "Lê Ngọc Hạnh" })
    .click()
  const profModal = page.getByTestId("office-modal-prof")
  await expect(profModal).toBeVisible()
  await expect(profModal.locator(".of-ph h4")).toHaveText("Lê Ngọc Hạnh")

  // Test Vietnamese diacritic-insensitive search: "hanh" matches "Lê Ngọc Hạnh" and filters out others
  const searchInput = profModal.getByLabel("Tìm nhân viên")
  await searchInput.fill("hanh")
  const listItems = profModal.locator(".of-plist-items button.of-pi")
  await expect(listItems).toHaveCount(1)
  await expect(listItems.first()).toContainText("Lê Ngọc Hạnh")

  await page.keyboard.press("Escape")
  await expect(profModal).toBeHidden()

  watchers.assertClean()
})

/* ============================================================================
 * TEST 6 — Khu Văn phòng IQX Light-Theme Invariance (1440×900)
 * ========================================================================== */

test("Test 6 — Khu Văn phòng IQX Light-Theme Invariance (1440×900)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const watchers = attachWatchers(page)
  await setupOfficeMocks(page, { role: "staff", theme: "light" })

  await page.goto("/van-phong", { waitUntil: "domcontentloaded" })

  // Verify IQX app really is in html.light mode
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("light"))
    )
    .toBe(true)

  const mineCard = page.getByTestId("office-hud-card-mine")
  await expect(mineCard).toBeVisible({ timeout: 30_000 })
  await assertCanvasNonBlank(page, page.locator(".of-canvas-host canvas").first(), {
    minWidth: 800,
    minHeight: 500,
    bgRgb: [27, 23, 19],
    minNonBgRatio: 0.3,
    minDistinctColors: 18,
  })
  await page.screenshot({ path: shot("07-office-3d-light-theme-1440.png") })

  // Verify Office HUD card stays dark navy + gold gradient header + zero gray text!
  const styles = await mineCard.evaluate((card) => {
    const cs = getComputedStyle(card)
    const head = card.querySelector(".of-hc-head")!
    const headCs = getComputedStyle(head)
    const textColors: Array<{ tag: string; text: string; color: string }> = []
    for (const el of card.querySelectorAll(".of-hc-body span, .of-hc-body b, .of-hc-body p")) {
      const txt = (el.textContent ?? "").trim()
      if (!txt) continue
      textColors.push({
        tag: el.tagName,
        text: txt,
        color: getComputedStyle(el).color,
      })
    }
    return {
      cardBg: cs.backgroundColor,
      headBgImage: headCs.backgroundImage,
      headColor: headCs.color,
      textColors,
    }
  })

  // Dark navy rgba(14, 24, 48, 0.95) or rgb(14, 24, 48)
  expect(styles.cardBg).toMatch(/^rgba?\(14,\s*24,\s*48/)
  // Gold header gradient (#F3CD6A -> #D9A03A => rgb(243, 205, 106) -> rgb(217, 160, 58))
  expect(styles.headBgImage).toContain("linear-gradient")
  expect(styles.headBgImage).toContain("243, 205, 106")
  expect(styles.headBgImage).toContain("217, 160, 58")
  expect(styles.headColor).toBe("rgb(42, 28, 0)")

  // Zero gray text on dark HUD body: every text pixel must have high brightness (max RGB >= 200)
  expect(styles.textColors.length).toBeGreaterThan(0)
  for (const entry of styles.textColors) {
    const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(entry.color)
    expect(match, `Unexpected color format for "${entry.text}": ${entry.color}`).not.toBeNull()
    const [r, g, b] = [Number(match![1]), Number(match![2]), Number(match![3])]
    const maxChan = Math.max(r, g, b)
    const minChan = Math.min(r, g, b)
    const isMuddyGray = maxChan < 195 && Math.abs(maxChan - minChan) < 25
    expect(
      isMuddyGray,
      `Detected gray text inside dark Office HUD ("${entry.text}": ${entry.color})`
    ).toBe(false)
  }

  watchers.assertClean()
})

/* ============================================================================
 * TEST 7 — Khu Văn phòng Responsive Tablet (900×900) & Mobile (390×844)
 * ========================================================================== */

test("Test 7 — Khu Văn phòng Responsive Tablet (900×900) & Mobile (390×844)", async ({
  page,
}) => {
  const watchers = attachWatchers(page)
  await setupOfficeMocks(page, { role: "staff" })

  // 1. Tablet 900×900
  await page.setViewportSize({ width: 900, height: 900 })
  await page.goto("/van-phong", { waitUntil: "domcontentloaded" })
  const mineCardTablet = page.getByTestId("office-hud-card-mine")
  await expect(mineCardTablet).toBeVisible({ timeout: 30_000 })
  const tabletCardBox = await mineCardTablet.boundingBox()
  expect(tabletCardBox!.width).toBeLessThanOrEqual(292)
  await assertNoHorizontalOverflow(page, "Office tablet 900x900 stage")

  // 2. Mobile 390×844 (Staff): HUD cards MUST start collapsed + zero horizontal overflow on stage & inside NHIỆM VỤ CỦA TÔI
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/van-phong", { waitUntil: "domcontentloaded" })

  const mineCardMob = page.getByTestId("office-hud-card-mine")
  const attCardMob = page.getByTestId("office-hud-card-att")
  await expect(mineCardMob).toBeVisible({ timeout: 30_000 })
  await expect(mineCardMob.locator("button.of-hc-head")).toHaveAttribute(
    "aria-expanded",
    "false"
  )
  await expect(attCardMob.locator("button.of-hc-head")).toHaveAttribute(
    "aria-expanded",
    "false"
  )
  await expect(page.locator(".of-hint")).toBeHidden()
  await expect(page.getByTestId("office-self-pill")).toBeHidden()
  await assertNoHorizontalOverflow(page, "Office mobile 390x844 stage")

  await page.waitForTimeout(350)
  await page.screenshot({ path: shot("08-office-mobile-390.png") })

  // Expand NHIỆM VỤ CỦA TÔI card -> open modal -> assert zero horizontal overflow inside modal
  await mineCardMob.locator("button.of-hc-head").click()
  await mineCardMob.getByRole("button", { name: /Mở nhiệm vụ của tôi/ }).click()
  const mineModal = page.getByTestId("office-modal-mine")
  await expect(mineModal).toBeVisible()
  await assertNoHorizontalOverflow(page, "Office mobile 390x844 NHIỆM VỤ CỦA TÔI")
  const mineOverflow = await mineModal.evaluate((el) => ({
    scrollW: el.scrollWidth,
    clientW: el.clientWidth,
  }))
  expect(mineOverflow.scrollW).toBeLessThanOrEqual(mineOverflow.clientW + 1)

  // 3. Mobile 390×844 (Boss): open QUẢN LÝ modal -> assert zero horizontal overflow
  await setupOfficeMocks(page, { role: "boss" })
  await page.goto("/van-phong?modal=mgr", { waitUntil: "domcontentloaded" })
  const mgrModal = page.getByTestId("office-modal-mgr")
  await expect(mgrModal).toBeVisible({ timeout: 25_000 })
  await assertNoHorizontalOverflow(page, "Office mobile 390x844 QUẢN LÝ")
  const mgrOverflow = await mgrModal.evaluate((el) => ({
    scrollW: el.scrollWidth,
    clientW: el.clientWidth,
  }))
  expect(mgrOverflow.scrollW).toBeLessThanOrEqual(mgrOverflow.clientW + 1)

  watchers.assertClean()
})

/* ============================================================================
 * TEST 8 — Notification Bell Click-to-Open-Modal (1440×900)
 * ========================================================================== */

test("Test 8 — Notification Bell click-to-open-modal navigates to /van-phong?modal=mine", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const watchers = attachWatchers(page)
  const server = await setupOfficeMocks(page, {
    role: "staff",
    notifications: [
      {
        id: "00000000-0000-4000-8000-000000000901",
        type: "office_task_assigned",
        trade_date: "2026-11-23",
        title: "Nhiệm vụ mới từ Sếp Lê Huy",
        body: 'Sếp giao nhiệm vụ ngày "Cập nhật báo cáo thị trường đầu phiên"',
        link: "/van-phong?modal=mine",
        read_at: null,
        created_at: "2026-11-23T01:20:00.000Z",
      },
    ],
  })

  // Start on a non-office route with the IQX top navigation header
  await page.goto("/about", { waitUntil: "domcontentloaded" })

  const bell = page.getByTestId("notification-bell")
  await expect(bell).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId("notification-badge")).toHaveText("1")

  await bell.click()

  // Verify badge label "Giao nhiệm vụ"
  const typeLabel = page.getByTestId("notification-type-label").first()
  await expect(typeLabel).toBeVisible()
  await expect(typeLabel).toHaveText("Giao nhiệm vụ")

  // Click notification item -> navigates to /van-phong?modal=mine and opens NHIỆM VỤ CỦA TÔI
  await page
    .locator('button[data-notification-type="office_task_assigned"]')
    .first()
    .click()

  await expect(page).toHaveURL(/\/van-phong\?modal=mine/)
  await expect(page.getByTestId("office-modal-mine")).toBeVisible({
    timeout: 12_000,
  })
  expect(server.getMarkReadCalls()).toBeGreaterThanOrEqual(1)

  watchers.assertClean()
})
