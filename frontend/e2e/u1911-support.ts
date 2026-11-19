/**
 * Mocks for the update 19-11 acceptance spec (`update-1911-acceptance.spec.ts`): a signed-in member with a
 * Demo account, a Shop, Candle Dojo, Học viện and, for Chiến lược / Bot, the in-memory fake of the unit tests
 * (`src/pages/strategy/test-support.ts`) running inside the page through the Vite dev server.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { Page, Route } from "@playwright/test"

import { CD_CARDS, CD_CARD_COUNT, CD_TIER_INFO } from "../src/lib/candle-dojo/cards"
import { CD_CATALOG_VERSION, CD_DOJOS, CD_LESSONS, cdLesson } from "../src/lib/candle-dojo/lessons"
import { buildCatalog, buildProgress, catalogItemsOf } from "../src/pages/academy/test-fixtures"

const here = path.dirname(fileURLToPath(import.meta.url))
const BACKEND = path.resolve(here, "../../backend")
export const EVIDENCE = path.resolve(BACKEND, "docs/update-19-11/evidence")

const T = "2026-11-19T03:00:00.000Z"

export async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
}

/* ── Shop (FLASHBACK → Shop). The server still sending the retired Premium / exchange fields must not bring them back. ── */

const MASCOTS = [
  ["bach_ho", "Bạch Hổ", 0, false, true, 1, "bach-ho"],
  ["thanh_long", "Thanh Long", 500, true, false, 2, "thanh-long"],
  ["loc_huou", "Lộc Hươu", 500, true, false, 3, "loc-huou"],
] as const

export const XU = 1250

function shopState() {
  return {
    catalog_version: "iqx-mascot-shop-v1",
    catalog: MASCOTS.map(([mascot_id, name, price_xu, for_sale, is_default, sort_order, slug]) => ({
      mascot_id, name, price_xu, for_sale, is_default, sort_order, asset_slug: slug, asset_root: `/assets/mascots-2d/v2/${slug}`,
    })),
    wallet: { balance: XU, last_seq: 4 },
    totals: { earned_xu: 1500, spent_xu: 250, lessons_rewarded: 3 },
    owned: [{ mascot_id: "bach_ho", source: "default", acquired_at: null }],
    owned_count: 1,
    total_count: MASCOTS.length,
    active: { mascot_id: "bach_ho", revision: 1, updated_at: null },
    provisioned: true,
    pet_levels: [],
    premium_price_xu: 3000,
    premium_duration_days: 30,
    exchange: { cash_per_xu: 10_000, min_exchange_cash_vnd: 10_000 },
  }
}

function cardsState() {
  const owned = new Set(["doji", "bua"])
  return {
    catalog_version: CD_CATALOG_VERSION,
    wallet: { balance: XU },
    total_count: CD_CARD_COUNT,
    owned_count: owned.size,
    items: CD_CARDS.map((card) => ({
      card_id: card.id, name: card.name, tier: card.tier, price_xu: CD_TIER_INFO[card.tier].priceXu, lesson_id: card.lessonId,
      lesson_title: cdLesson(card.lessonId)?.title ?? card.lessonId, dojo: card.dojo, owned: owned.has(card.id),
      acquired_at: owned.has(card.id) ? T : null, seen: false, unlocked: true,
    })),
  }
}

/* ── Candle Dojo (default tool of LUYỆN TẬP) ── */

function dojoState() {
  const dojo1 = CD_LESSONS.filter((lesson) => lesson.dojo === 1)
  return {
    catalog_version: "iqx-candle-dojo-v1",
    wallet: { balance: XU },
    progress: { belt: 0, belt_name: "Đai trắng", intro_completed: true, streak_days: 1, best_streak: 1, drills_total: 0, drill_unlocked: false, drill_done_today: false },
    lessons: dojo1.map((lesson) => ({ lesson_id: lesson.id, dojo: 1, stars: 1, hunt_star: false, twin_star: false, attempts: 1, completed_at: T })),
    open_lessons: dojo1.map((lesson) => lesson.id),
    dojos: CD_DOJOS.filter((dojo) => dojo.n >= 1).map((dojo) => ({
      n: dojo.n, unlocked: dojo.n === 1, lessons_total: CD_LESSONS.filter((lesson) => lesson.dojo === dojo.n).length,
      lessons_done: dojo.n === 1 ? dojo1.length : 0, exam_ready: false, passed: false,
    })),
    cards: { total: 47, owned_count: 2, owned: ["doji", "bua"].map((card_id) => ({ card_id, acquired_at: T, seen_at: null })) },
    rewards: { intro_xu: 100, lesson_xu: 100, belt_xu: 300, drill_xu: 20 },
  }
}

/* ── Demo account (new account: 100.000.000đ, layout v1.3 §8) ── */

export const DEMO_ACCOUNT = {
  id: "acc-1", user_id: "member-1", status: "active", initial_cash_vnd: 100_000_000, cash_available_vnd: 100_000_000,
  cash_reserved_vnd: 0, cash_pending_vnd: 0, total_cash_vnd: 100_000_000, net_deposited_cash_vnd: 100_000_000, activated_at: T, reset_at: null, created_at: T,
}

const PORTFOLIO = {
  account: DEMO_ACCOUNT, positions: [], total_market_value_vnd: 0, nav_vnd: 100_000_000, total_unrealized_pnl_vnd: 0, return_pct: 0, refresh_warnings: [],
}

const quote = (symbol: string) => ({
  symbol, close_price: 62_000, reference_price: 61_500, ceiling_price: 65_800, floor_price: 57_200, high_price: 62_400, low_price: 61_200,
  total_volume: 1_250_000, bid_prices: [], ask_prices: [],
})

/* ── Bộ lọc IQX / Chiến lược IQX from the backend seed, as the user list serves them ── */

type SeedItem = { slug: string; content: { name: string; pair_slug?: string | null } & Record<string, unknown> }
const SEED = JSON.parse(readFileSync(path.join(BACKEND, "src/modules/iqx-templates/iqx-templates.seed.json"), "utf8")) as { filter: SeedItem[]; strategy: SeedItem[] }
/** Same ids as `iqxId` of the unit-test fake, so both sides agree. */
const iqxId = (kind: "filter" | "strategy", index: number) => `${kind === "filter" ? "c" : "e"}0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
export const IQX_STRATEGIES = SEED.strategy.map((item, index) => ({ id: iqxId("strategy", index), kind: "strategy", slug: item.slug, version: 1, content: item.content }))
export const IQX_FILTERS = SEED.filter.map((item, index) => {
  const pair = IQX_STRATEGIES.find((entry) => entry.slug === item.content.pair_slug)
  return { id: iqxId("filter", index), kind: "filter", slug: item.slug, version: 1, content: item.content, pair: pair ? { id: pair.id, slug: pair.slug, name: pair.content.name, version: 1 } : null }
})
const SEED_JSON = readFileSync(path.join(BACKEND, "src/modules/iqx-templates/iqx-templates.seed.json"), "utf8")
const REGISTRY_JSON = readFileSync(path.join(BACKEND, "src/modules/quant/v2/registry/technical-registry.json"), "utf8")

/** What the user list of tab IQX serves; a test may hide or reorder items (what the admin did) and reload. */
export type IqxList = { filter: typeof IQX_FILTERS; strategy: typeof IQX_STRATEGIES }

export type MemberOptions = { premium?: boolean; role?: "user" | "admin" | "team_lead"; iqx?: IqxList; calls?: { method: string; path: string; body: unknown }[] }

/**
 * The unit-test fake runs in the page (it uses Vite's `import.meta.glob`); its two JSON imports live outside the
 * Vite root, so they are served here. Every /strategy, /bot and /instruments call goes through it.
 */
const FAKE_BRIDGE = `
window.__iqxCall = async (path, method, body) => {
  if (!window.__iqxFake) {
    window.__iqxFake = import("/src/pages/strategy/test-support.ts").then((m) => {
      const world = m.createStrategyWorld()
      for (const id of ["macd", "ma"]) {
        const config = world.indicators[id]
        config.master_enabled = true
        config.buy.enabled = true
        config.sell.enabled = true
      }
      window.__iqxWorld = world
      window.__iqxRunResponse = m.runResponse
      return m.createStrategyApi(world)
    })
  }
  const fake = await window.__iqxFake
  try {
    const value = await fake(path, { method, body: body ?? undefined })
    return { ok: true, value: value === undefined ? null : value }
  } catch (error) {
    return { ok: false, status: error.status ?? 500, message: String(error.message), code: error.code ?? null }
  }
}`

export async function mockMember(page: Page, options: MemberOptions = {}) {
  const role = options.role ?? "user"
  const calls = options.calls
  const iqx = options.iqx
  await page.addInitScript(({ isPremium }) => {
    sessionStorage.setItem("iqx.v2.access_token", "e2e-member-token")
    sessionStorage.setItem("iqx.v2.refresh_token", "e2e-refresh-token")
    sessionStorage.setItem("iqx.v2.remember", "false")
    ;(window as unknown as { __IQX_E2E_PREMIUM__?: boolean }).__IQX_E2E_PREMIUM__ = isPremium
  }, { isPremium: options.premium ?? false })
  await page.addInitScript(FAKE_BRIDGE)
  await page.route(/\/(backend\/src\/modules\/[^?]+\.json)(\?.*)?$/, (route) => {
    const file = route.request().url()
    const body = file.includes("iqx-templates.seed.json") ? SEED_JSON : REGISTRY_JSON
    return route.fulfill({ status: 200, contentType: "text/javascript", body: `export default ${body}` })
  })
  await page.route("**/api/v2/**", async (route) => {
    const url = new URL(route.request().url())
    const p = url.pathname.replace(/^.*\/api\/v2/, "")
    const method = route.request().method()
    const raw = route.request().postData()
    let body: unknown = null
    try { body = raw ? JSON.parse(raw) : null } catch { body = raw }
    calls?.push({ method, path: p, body })

    if (p === "/auth/me") {
      const names = { user: "Nhà đầu tư thử nghiệm", admin: "Quản trị IQX", team_lead: "Trưởng nhóm" }
      return json(route, { id: "member-1", email: "member@example.com", username: "member", full_name: names[role], role })
    }
    if (p === "/premium/me") return json(route, { is_premium: options.premium ?? false })
    if (p === "/shop" && method === "GET") return json(route, shopState())
    if (p === "/shop/coin-ledger") return json(route, { items: [], next_cursor: null })
    if (p === "/candle-dojo/cards") return json(route, cardsState())
    if (p === "/candle-dojo/state") return json(route, dojoState())
    if (p === "/virtual-trading/account") return json(route, DEMO_ACCOUNT)
    if (p === "/virtual-trading/portfolio") return json(route, PORTFOLIO)
    if (p.startsWith("/virtual-trading/orders")) return json(route, { items: [], total: 0, page: 1, page_size: 20, total_pages: 0 })
    if (p === "/watchlists" && method === "GET") return json(route, { items: [{ id: "w1", symbol: "VNM", sortOrder: 0, createdAt: T }, { id: "w2", symbol: "HPG", sortOrder: 1, createdAt: T }] })
    if (p === "/market-data/trading/price-board") {
      const symbols = (body as { symbols?: string[] } | null)?.symbols ?? []
      return json(route, symbols.map(quote))
    }
    if (p.startsWith("/academy/")) {
      const catalog = buildCatalog()
      const items = catalogItemsOf(catalog)
      if (p === "/academy/catalog") return json(route, catalog)
      if (p === "/academy/progress") return json(route, buildProgress(new Set(items.slice(0, 3).map((item) => item.lesson_key)), catalog))
      return json(route, {})
    }
    if (p === "/strategy/iqx-templates" && method === "GET" && iqx) {
      const kind = url.searchParams.get("kind")
      return json(route, { items: kind === "strategy" ? iqx.strategy : kind === "filter" ? iqx.filter : [...iqx.filter, ...iqx.strategy] })
    }
    if (/^\/(strategy|bot|instruments)(\/|$)/.test(p)) {
      type Result = { ok: true; value: unknown } | { ok: false; status: number; message: string; code: string | null }
      let result: Result
      try {
        result = await page.evaluate(
          ([target, verb, payload]) => (window as unknown as { __iqxCall: (a: string, b: string, c: string | null) => Promise<unknown> }).__iqxCall(target, verb, payload),
          [`${p}${url.search}`, method, raw] as [string, string, string | null],
        ) as Result
      } catch {
        // The page navigated away while the call was in flight: nobody reads this answer any more.
        return route.abort().catch(() => undefined)
      }
      if (result.ok) return json(route, result.value)
      return json(route, { error: { message: result.message, code: result.code } }, result.status)
    }
    return route.fallback()
  })
}

/** Page wider than the viewport? */
export const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
