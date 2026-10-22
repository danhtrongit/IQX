/**
 * Backend giả cho màn chơi Flashback: một đề 60 phiên lịch sử + 60 phiên chơi, không có tên mã
 * và không có ngày thật, đúng như server thật.
 *
 * Mọi lời gọi được ghi lại để test kiểm tra thân yêu cầu và số nến nhận được.
 */
import type {
  FlashbackBar,
  FlashbackEntry,
  FlashbackIndicatorInstance,
  FlashbackIndicatorMeta,
  FlashbackOrder,
  FlashbackPosition,
} from "./flashback-api"

export const FLASHBACK_ENTRY_ID = "11111111-1111-4111-8111-111111111111"
export const FLASHBACK_ROUND_ID = "22222222-2222-4222-8222-222222222222"
export const FLASHBACK_INITIAL_CASH = 10_000_000
export const HISTORY_SESSIONS = 60
export const PLAY_SESSIONS = 60
/** Giá đóng cửa của phiên lịch sử cuối cùng: giá khớp của mọi lệnh. */
export const MATCH_PRICE = 28_800

export type Call = { method: string; path: string; body?: Record<string, unknown> }

export type BackendOptions = {
  /** Đã tham gia đề hay chưa. */
  joined?: boolean
  /** Lần tham gia đầu tiên (miễn phí) hay không. */
  firstJoinFree?: boolean
  /** Số phiên đã chơi. */
  step?: number
  status?: "playing" | "finished"
  cash?: number
  holdings?: number
  positions?: FlashbackPosition[]
  warmupBars?: FlashbackBar[]
  /** Chỉ báo người dùng đã mở. */
  indicators?: FlashbackIndicatorMeta[]
  /** Chỉ báo đã lưu trong lượt chơi. */
  savedIndicators?: FlashbackIndicatorInstance[]
  feeXu?: number
  playerCount?: number
}

export const RSI_META: FlashbackIndicatorMeta = {
  id: "rsi",
  name: "RSI",
  chapter: 4,
  lesson_id: "ch04-l06",
  params: [
    { key: "period", label: "Chu kỳ RSI", type: "integer", min: 5, max: 50, step: 1, unit: "phiên", default: 14, lower: null, upper: null },
    { key: "level", label: "Ngưỡng RSI", type: "number", min: 10, max: 90, step: 1, unit: "", default: 30, lower: { min: 10, max: 49, default: 30, label: "Ngưỡng quá bán" }, upper: { min: 51, max: 90, default: 70, label: "Ngưỡng quá mua" } },
  ],
  cross_fields: [],
  warmup_sessions: 14,
}

export const MACD_META: FlashbackIndicatorMeta = {
  id: "macd",
  name: "MACD",
  chapter: 4,
  lesson_id: "ch04-l07",
  params: [
    { key: "fast", label: "Chu kỳ EMA nhanh", type: "integer", min: 2, max: 50, step: 1, unit: "phiên", default: 12, lower: null, upper: null },
    { key: "slow", label: "Chu kỳ EMA chậm", type: "integer", min: 5, max: 100, step: 1, unit: "phiên", default: 26, lower: null, upper: null },
    { key: "signal", label: "Chu kỳ đường tín hiệu", type: "integer", min: 2, max: 30, step: 1, unit: "phiên", default: 9, lower: null, upper: null },
  ],
  cross_fields: [{ left: "fast", op: "<", right: "slow" }],
  warmup_sessions: 26,
}

export const MA_META: FlashbackIndicatorMeta = {
  id: "ma",
  name: "MA / SMA",
  chapter: 4,
  lesson_id: "ch04-l05",
  params: [
    { key: "period", label: "Chu kỳ SMA", type: "integer", min: 5, max: 200, step: 1, unit: "phiên", default: 20, lower: null, upper: null },
  ],
  cross_fields: [],
  warmup_sessions: 20,
}

/** Nến lịch sử giả: bước nhẹ quanh giá khớp, nến cuối đóng đúng giá khớp. */
export function historyBars(): FlashbackBar[] {
  const bars: FlashbackBar[] = []
  let close = MATCH_PRICE - 400
  for (let index = 0; index < HISTORY_SESSIONS; index += 1) {
    const open = close
    close = MATCH_PRICE - 400 + index * 6
    const high = Math.max(open, close) + 120
    const low = Math.min(open, close) - 120
    bars.push({ session: index, open, high, low, close, volume: 1_000_000 + index * 1_000 })
  }
  const last = bars[bars.length - 1]
  last.close = MATCH_PRICE
  last.high = MATCH_PRICE + 150
  last.low = MATCH_PRICE - 150
  return bars
}

/** Nến chơi: giá đi ngang quanh giá khớp để các phép tính dễ kiểm chứng. */
export function playedBar(step: number): FlashbackBar {
  return {
    session: HISTORY_SESSIONS + step,
    open: MATCH_PRICE,
    high: MATCH_PRICE + 200,
    low: MATCH_PRICE - 200,
    close: MATCH_PRICE,
    volume: 1_200_000,
  }
}

export function createFlashbackBackend(options: BackendOptions = {}) {
  const state = {
    joined: options.joined ?? false,
    firstJoinFree: options.firstJoinFree ?? true,
    step: options.step ?? 0,
    status: options.status,
    cash: options.cash ?? FLASHBACK_INITIAL_CASH,
    holdings: options.holdings ?? 0,
    positions: options.positions ?? ([] as FlashbackPosition[]),
    warmupBars: options.warmupBars ?? ([] as FlashbackBar[]),
    orders: [] as FlashbackOrder[],
    indicators: options.indicators ?? [],
    savedIndicators: options.savedIndicators ?? [],
    feeXu: options.feeXu ?? 100,
    playerCount: options.playerCount ?? 12,
    sequence: 0,
  }
  const calls: Call[] = []
  const history = historyBars()

  function entry(): FlashbackEntry {
    const lastClose = state.step > 0 ? MATCH_PRICE : MATCH_PRICE
    return {
      id: FLASHBACK_ENTRY_ID,
      step: state.step,
      cash: String(state.cash),
      holdings: state.holdings,
      total_assets: String(state.cash + state.holdings * lastClose),
      pnl_pct: state.cash + state.holdings * lastClose - FLASHBACK_INITIAL_CASH,
      pnl_percent: ((state.cash + state.holdings * lastClose - FLASHBACK_INITIAL_CASH) / FLASHBACK_INITIAL_CASH) * 100,
      max_drawdown: 0,
      max_drawdown_percent: 0,
      status: state.status ?? (state.step >= PLAY_SESSIONS ? "finished" : "playing"),
      joined_at: "2026-10-22T00:00:00.000Z",
      finished_at: null,
      final_nav: state.step >= PLAY_SESSIONS ? String(state.cash + state.holdings * lastClose) : null,
      rank: state.step >= PLAY_SESSIONS ? 3 : null,
      reward_xu: state.step >= PLAY_SESSIONS ? 500 : 0,
      indicator_params: state.savedIndicators,
      positions: state.positions,
      orders: state.orders,
    }
  }

  function current() {
    return {
      round_id: FLASHBACK_ROUND_ID,
      round_no: 7,
      closes_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      player_count: state.playerCount,
      fee_xu: state.feeXu,
      first_join_free: state.firstJoinFree,
      reward_table: [
        { from_rank: 1, to_rank: 1, xu: 1_000 },
        { from_rank: 2, to_rank: 3, xu: 500 },
        { from_rank: 4, to_rank: 10, xu: 200 },
        { from_rank: 11, to_rank: 50, xu: 100 },
        { from_rank: 51, to_rank: null, xu: 0 },
      ],
      joined: state.joined,
      my_entry: state.joined ? entry() : null,
      bars: history,
      played_bars: Array.from({ length: state.step }, (_, index) => playedBar(index)),
      warmup_bars: state.warmupBars,
      history_sessions: HISTORY_SESSIONS,
      play_sessions: PLAY_SESSIONS,
      total_sessions: HISTORY_SESSIONS + PLAY_SESSIONS,
    }
  }

  function placeOrder(body: { side: "buy" | "sell"; qty: number }) {
    const amount = MATCH_PRICE * body.qty
    const fee = Math.round(amount * 0.0015)
    const tax = body.side === "sell" ? Math.round(amount * 0.001) : 0
    if (body.side === "buy") {
      if (amount + fee > state.cash) throw new Error("INSUFFICIENT_CASH")
      state.cash -= amount + fee
      state.holdings += body.qty
      state.positions.push({
        qty: body.qty,
        price: String(MATCH_PRICE),
        step: state.step,
        sellable_step: state.step + 2,
        status: "pending",
        sessions_left: 2,
        pnl_pct: 0,
        value: String(amount),
      })
    } else {
      const sellable = state.positions.filter((position) => position.sellable_step <= state.step).reduce((sum, position) => sum + position.qty, 0)
      if (body.qty > sellable) throw new Error("NOT_SETTLED_YET")
      state.cash += amount - fee - tax
      state.holdings -= body.qty
      state.positions = state.positions.filter((position) => position.qty > 0)
    }
    state.sequence += 1
    const order: FlashbackOrder = {
      id: `order-${state.sequence}`,
      side: body.side,
      qty: body.qty,
      price: String(MATCH_PRICE),
      step: state.step,
      amount: String(amount),
      fee: String(fee),
      tax: String(tax),
      created_at: "2026-10-22T01:00:00.000Z",
    }
    state.orders.push(order)
    return {
      order,
      cash: String(state.cash),
      holdings: state.holdings,
      total_assets: String(state.cash + state.holdings * MATCH_PRICE),
      pnl_pct: 0,
      pnl_percent: 0,
      max_drawdown: 0,
    }
  }

  function route(call: Call): unknown {
    const path = call.path.split("?")[0]
    if (path === "/flashback/current" && call.method === "GET") return current()
    if (path === "/flashback/current/join" && call.method === "POST") {
      state.joined = true
      return {
        entry_id: FLASHBACK_ENTRY_ID,
        round_id: FLASHBACK_ROUND_ID,
        first_join: state.firstJoinFree,
        fee_xu: state.firstJoinFree ? 0 : state.feeXu,
        cash: String(state.cash),
        joined_at: "2026-10-22T00:00:00.000Z",
      }
    }
    if (path === "/flashback/current/leaderboard" && call.method === "GET") {
      return {
        scope: "all",
        rows: [
          { rank: 1, user_id: "u1", username: "ngoclan.vo", pnl_pct: 12, pnl_percent: 12, max_drawdown: 3, status: "finished", step: 60, reward_xu: 1000, is_me: false },
          { rank: 2, user_id: "u2", username: "minhkhoa", pnl_pct: 8, pnl_percent: 8, max_drawdown: 4, status: "finished", step: 60, reward_xu: 500, is_me: false },
        ],
        me: { rank: 0, user_id: "me", username: "nguyenvana", pnl_pct: 3, pnl_percent: 3, max_drawdown: 2, status: "playing", step: state.step, reward_xu: 0, is_me: true },
        total_players: 12,
      }
    }
    if (path === "/flashback/indicators" && call.method === "GET") return { indicators: state.indicators }
    const entryMatch = /^\/flashback\/entries\/([^/]+)\/(\w+)$/.exec(path)
    if (entryMatch && call.method === "POST") {
      const action = entryMatch[2]
      if (action === "next") {
        state.step += 1
        return {
          entry_id: FLASHBACK_ENTRY_ID,
          step: state.step,
          bar: playedBar(state.step - 1),
          cash: String(state.cash),
          holdings: state.holdings,
          pnl_pct: 0,
          pnl_percent: 0,
          max_drawdown: 0,
        }
      }
      if (action === "orders") {
        const body = call.body as { side: "buy" | "sell"; qty: number }
        return placeOrder(body)
      }
      if (action === "finish") {
        state.step = PLAY_SESSIONS
        state.status = "finished"
        return {
          final_nav: String(state.cash + state.holdings * MATCH_PRICE),
          pnl_pct: 0,
          pnl_percent: ((state.cash + state.holdings * MATCH_PRICE - FLASHBACK_INITIAL_CASH) / FLASHBACK_INITIAL_CASH) * 100,
          max_drawdown: 0,
          max_drawdown_percent: 0,
          rank: 3,
          reward_xu: 500,
          status: "finished",
        }
      }
    }
    if (entryMatch && entryMatch[2] === "indicators" && call.method === "PUT") {
      const body = call.body as { indicators: FlashbackIndicatorInstance[] }
      state.savedIndicators = body.indicators
      return { entry_id: FLASHBACK_ENTRY_ID, indicators: body.indicators, warmup_required: 26 }
    }
    return {}
  }

  async function handle(path: string, init?: RequestInit): Promise<unknown> {
    const method = init?.method ?? "GET"
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined
    const call: Call = { method, path, body }
    calls.push(call)
    return route(call)
  }

  return {
    state,
    calls,
    handle,
    callsTo: (method: string, prefix: string) => calls.filter((call) => call.method === method && call.path.startsWith(prefix)),
  }
}

export type FlashbackBackend = ReturnType<typeof createFlashbackBackend>
