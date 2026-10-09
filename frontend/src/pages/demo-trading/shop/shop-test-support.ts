/**
 * Test support for the Shop screens: an in-memory stand-in for `/api/v2/shop/**`
 * (+ the Học viện and workspace reads the Shop makes), behind the mocked `api()`
 * transport, with call recording and per-request fault injection.
 */
import { createElement, type ReactElement, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router"

import { ApiError } from "@/lib/api"
import type { LedgerItem, ShopState } from "./shop-api"

export const CATALOG_VERSION = "iqx-mascot-shop-v1"

const CATALOG = [
  ["bach_ho", "Bạch Hổ", 0, false, true, 1, "bach-ho"],
  ["thanh_long", "Thanh Long", 500, true, false, 2, "thanh-long"],
  ["loc_huou", "Lộc Hươu", 500, true, false, 3, "loc-huou"],
  ["phung_hoang", "Phụng Hoàng", 500, true, false, 4, "phung-hoang"],
  ["kim_quy", "Kim Quy", 500, true, false, 5, "kim-quy"],
] as const

export type Call = { method: string; path: string; body?: Record<string, unknown> }

type Rule = {
  match: (call: Call) => boolean
  respond: (call: Call) => unknown
  once: boolean
}

export type BackendOptions = {
  balance?: number
  owned?: string[]
  active?: string
  revision?: number
  lessons?: number
  ledger?: LedgerItem[]
  price?: number
}

export function ledgerItem(seq: number, overrides: Partial<LedgerItem> = {}): LedgerItem {
  return {
    id: `ledger-${seq}`,
    seq,
    kind: "lesson_first_completion",
    delta: 100,
    balance_after: seq * 100,
    created_at: new Date(Date.UTC(2026, 9, 8, 2, seq % 60)).toISOString(),
    label: { lesson_key: null, lesson_id: `ch01-l0${(seq % 5) + 1}`, mascot_id: null, mascot_name: null },
    ...overrides,
  }
}

export function apiError(status: number, code: string, message: string, details?: unknown[]): ApiError {
  return new ApiError(message, status, { code, details })
}

export function createShopBackend(options: BackendOptions = {}) {
  const state = {
    balance: options.balance ?? 500,
    owned: [...(options.owned ?? ["bach_ho"])],
    active: options.active ?? "bach_ho",
    revision: options.revision ?? 1,
    lessons: options.lessons ?? 5,
    price: options.price ?? 500,
    seq: options.ledger?.length ?? 0,
    ledger: [...(options.ledger ?? [])],
    purchases: new Map<string, { mascot_id: string; price_xu: number }>(),
  }
  const calls: Call[] = []
  const rules: Rule[] = []

  const wallet = () => ({ balance: state.balance, last_seq: state.seq })
  const ownedView = () => state.owned.map((mascot_id) => ({ mascot_id, source: mascot_id === "bach_ho" ? "default" : "purchase", acquired_at: null }))
  const activeView = () => ({ mascot_id: state.active, revision: state.revision, updated_at: null })

  function shopState(): ShopState {
    return {
      catalog_version: CATALOG_VERSION,
      catalog: CATALOG.map(([mascot_id, name, price, for_sale, is_default, sort_order, slug]) => ({
        mascot_id, name, price_xu: for_sale ? state.price : price, for_sale, is_default, sort_order,
        asset_slug: slug, asset_root: `/assets/mascots-2d/v2/${slug}`,
      })),
      wallet: wallet(),
      totals: {
        earned_xu: state.ledger.filter((item) => item.delta > 0).reduce((sum, item) => sum + item.delta, 0),
        spent_xu: -state.ledger.filter((item) => item.delta < 0).reduce((sum, item) => sum + item.delta, 0),
        lessons_rewarded: state.lessons,
      },
      owned: ownedView(),
      owned_count: state.owned.length,
      total_count: 5,
      active: activeView(),
      provisioned: true,
    } as ShopState
  }

  function purchase(call: Call) {
    const body = call.body as { mascot_id: string; expected_price_xu: number; catalog_version: string; idempotency_key: string }
    const previous = state.purchases.get(body.idempotency_key)
    const done = (status: "purchased" | "already_owned", replayed: boolean) => ({
      status, replayed,
      purchase: status === "purchased" ? { id: "p-1", mascot_id: body.mascot_id, price_xu: 500, catalog_version: CATALOG_VERSION, idempotency_key: body.idempotency_key, ledger_id: "l-1", created_at: "2026-10-08T03:00:00.000Z" } : null,
      wallet: wallet(), owned: ownedView(), active: activeView(), catalog_version: CATALOG_VERSION,
    })
    if (previous) return done("purchased", true)
    if (body.catalog_version !== CATALOG_VERSION) throw apiError(409, "CATALOG_CHANGED", "Danh mục đã đổi", [{ catalog_version: CATALOG_VERSION }])
    if (body.expected_price_xu !== state.price) throw apiError(409, "PRICE_CHANGED", "Giá đã đổi", [{ current_price_xu: state.price, catalog_version: CATALOG_VERSION }])
    if (state.owned.includes(body.mascot_id)) return done("already_owned", false)
    if (state.balance < state.price) {
      throw apiError(409, "INSUFFICIENT_XU", "Chưa đủ xu", [{ balance_xu: state.balance, price_xu: state.price, shortfall_xu: state.price - state.balance }])
    }
    commitPurchase(body.mascot_id, body.idempotency_key)
    return done("purchased", false)
  }

  /** Commits a purchase as the server would, without answering (used to simulate a lost response). */
  function commitPurchase(mascotId: string, key: string) {
    state.balance -= state.price
    state.seq += 1
    state.owned.push(mascotId)
    state.purchases.set(key, { mascot_id: mascotId, price_xu: state.price })
    state.ledger.push(ledgerItem(state.seq, {
      kind: "mascot_purchase", delta: -state.price, balance_after: state.balance,
      label: { lesson_key: null, lesson_id: null, mascot_id: mascotId, mascot_name: null },
    }))
  }

  function route(call: Call): unknown {
    const url = new URL(call.path, "http://x")
    const path = url.pathname
    if (path === "/shop" && call.method === "GET") return shopState()
    if (path === "/shop/coin-ledger") {
      const limit = Number(url.searchParams.get("limit") ?? 20)
      const cursor = url.searchParams.get("cursor")
      const sorted = [...state.ledger].sort((a, b) => b.seq - a.seq)
      const start = cursor ? sorted.findIndex((item) => String(item.seq) === cursor) + 1 : 0
      const items = sorted.slice(start, start + limit)
      const more = start + limit < sorted.length
      return { items, next_cursor: more ? String(items[items.length - 1].seq) : null }
    }
    if (path === "/shop/purchases" && call.method === "POST") return purchase(call)
    if (path.startsWith("/shop/purchases/") && call.method === "GET") {
      const key = decodeURIComponent(path.slice("/shop/purchases/".length))
      const found = state.purchases.get(key)
      return {
        idempotency_key: key,
        status: found ? "completed" : "not_found",
        purchase: found ? { id: "p-1", mascot_id: found.mascot_id, price_xu: found.price_xu, catalog_version: CATALOG_VERSION, idempotency_key: key, ledger_id: "l-1", created_at: "2026-10-08T03:00:00.000Z" } : null,
        wallet: wallet(),
      }
    }
    if (path === "/shop/active-mascot" && call.method === "PUT") {
      const body = call.body as { mascot_id: string; expected_revision: number }
      if (!state.owned.includes(body.mascot_id)) throw apiError(409, "MASCOT_NOT_OWNED", "Bạn chưa sở hữu linh thú này")
      if (state.active === body.mascot_id) return { changed: false, active: activeView() }
      if (body.expected_revision !== state.revision) {
        throw apiError(409, "REVISION_CONFLICT", "Đã đổi ở nơi khác", [{ current_revision: state.revision, active_mascot_id: state.active }])
      }
      state.active = body.mascot_id
      state.revision += 1
      return { changed: true, active: activeView() }
    }
    if (path === "/academy/progress") {
      return { catalog_version: "v", chapters: [], completed: [], completed_lesson_ids: [], course_done: state.lessons, course_total: 71, granted_capabilities: [], progress_revision: 1 }
    }
    if (path === "/academy/catalog") {
      const lessons = ["RSI", "MACD", "MA / SMA", "Bollinger Bands", "Khối lượng"].map((name, index) => ({
        id: `ch01-l0${index + 1}`, lesson_key: `technical:l${index + 1}`, name, order: index + 1, chapter: 1, kind: "technical",
      }))
      return { catalog_version: "v", chapter_count: 1, lesson_count: 5, chapters: [{ no: 1, title: "Chỉ báo", type: "technical", lessons }] }
    }
    if (path === "/workspace/state") {
      return { mascot: { active_mascot_id: state.active, revision: state.revision, provisioned: true }, wallet: { balance: state.balance, provisioned: true } }
    }
    return {}
  }

  async function handle(path: string, init?: RequestInit): Promise<unknown> {
    const method = init?.method ?? "GET"
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined
    const call: Call = { method, path, body }
    calls.push(call)
    const index = rules.findIndex((rule) => rule.match(call))
    if (index >= 0) {
      const rule = rules[index]
      if (rule.once) rules.splice(index, 1)
      return rule.respond(call)
    }
    return route(call)
  }

  return {
    state,
    calls,
    handle,
    /** Answers (or throws for) the next matching request instead of the in-memory server. */
    intercept(match: (call: Call) => boolean, respond: (call: Call) => unknown, once = true) {
      rules.push({ match, respond, once })
    },
    commitPurchase,
    callsTo: (method: string, prefix: string) => calls.filter((call) => call.method === method && call.path.startsWith(prefix)),
  }
}

export type ShopBackend = ReturnType<typeof createShopBackend>

export function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

export function renderWithProviders(ui: ReactElement, client: QueryClient = newQueryClient()) {
  const wrap = (children: ReactNode) =>
    createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, children))
  const view = render(wrap(ui))
  return { ...view, client, rerenderUi: (next: ReactElement) => view.rerender(wrap(next)) }
}
