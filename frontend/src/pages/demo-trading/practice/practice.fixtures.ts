/**
 * Deterministic mock payloads of the practice API for tests and visual checks. Contains no symbol,
 * company or calendar date (the real payloads do not either). Type-only imports keep it loadable by
 * plain Node for screenshot scripts.
 */
import type {
  PracticeChart,
  PracticeConfig,
  PracticeEvent,
  PracticeEvidence,
  PracticeForm,
  PracticeHistory,
  PracticePlot,
  PracticeRun,
  PracticeState,
  PracticeTrade,
} from "./practice-api"

export const CASE_ID = "00000000-0000-4000-8000-0000000000c1"
export const RUN_ID = "00000000-0000-4000-8000-0000000000a1"

function rng(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Bars = { open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }

export function makeBars(count: number, seed = 7): Bars {
  const random = rng(seed)
  const bars: Bars = { open: [], high: [], low: [], close: [], volume: [] }
  let previous = 32000
  for (let i = 0; i < count; i += 1) {
    const target = 32000 + Math.sin(i / 17) * 5200 + Math.sin(i / 61) * 3800
    const open = Math.round((previous + (random() - 0.5) * 300) / 100) * 100
    const close = Math.round((open + (target - open) * 0.12 + (random() - 0.5) * 900) / 100) * 100
    const high = Math.round((Math.max(open, close) + random() * 400) / 100) * 100
    const low = Math.round((Math.min(open, close) - random() * 400) / 100) * 100
    bars.open.push(open)
    bars.high.push(high)
    bars.low.push(low)
    bars.close.push(close)
    bars.volume.push(Math.round(900000 + random() * 1600000 + (i % 40 === 0 ? 2400000 : 0)))
    previous = close
  }
  return bars
}

type Column = Array<number | null>

const sma = (values: number[], period: number): Column =>
  values.map((_, i) => (i + 1 < period ? null : values.slice(i + 1 - period, i + 1).reduce((a, b) => a + b, 0) / period))

function ema(values: Column, period: number): Column {
  const out: Column = values.map(() => null)
  const k = 2 / (period + 1)
  let previous: number | null = null
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]
    if (value === null || value === undefined) continue
    previous = previous === null ? value : value * k + previous * (1 - k)
    out[i] = i + 1 >= period ? previous : null
  }
  return out
}

function rsi(close: number[], period: number): Column {
  const out: Column = close.map(() => null)
  let gain = 0
  let loss = 0
  for (let i = 1; i < close.length; i += 1) {
    const change = close[i] - close[i - 1]
    const up = Math.max(0, change)
    const down = Math.max(0, -change)
    if (i <= period) {
      gain += up / period
      loss += down / period
    } else {
      gain = (gain * (period - 1) + up) / period
      loss = (loss * (period - 1) + down) / period
    }
    if (i >= period) out[i] = gain + loss === 0 ? null : (100 * gain) / (gain + loss)
  }
  return out
}

export function plotSpec(indicatorId: string, params: Record<string, number>): PracticePlot {
  const base: PracticePlot = { overlay: false, lines: [], histogram_key: null, volume_key: null, zero_line: false, nonnegative: false, bounds: null, threshold_levels: [], reference_levels: [] }
  switch (indicatorId) {
    case "ma":
      return { ...base, overlay: true, lines: [{ key: "value", label: `SMA ${params.period}` }] }
    case "bollinger":
      return {
        ...base,
        overlay: true,
        lines: [
          { key: "upper", label: "Dải trên" },
          { key: "middle", label: `SMA ${params.period}` },
          { key: "lower", label: "Dải dưới" },
        ],
      }
    case "macd":
      return { ...base, lines: [{ key: "value", label: "MACD" }, { key: "signal", label: "Đường tín hiệu" }], histogram_key: "histogram", zero_line: true }
    case "volume":
      return { ...base, lines: [{ key: "threshold", label: `${params.mult} × TB ${params.lookback}` }], volume_key: "volume", nonnegative: true }
    case "stochastic":
      return {
        ...base,
        lines: [{ key: "value", label: "%K" }, { key: "signal", label: "%D" }],
        bounds: [0, 100],
        threshold_levels: params.level === undefined ? [] : [params.level],
        reference_levels: [20, 80],
      }
    default:
      return {
        ...base,
        lines: [{ key: "value", label: `RSI ${params.period}` }],
        bounds: [0, 100],
        threshold_levels: params.level === undefined ? [] : [params.level],
        reference_levels: [50],
      }
  }
}

function seriesFor(indicatorId: string, bars: Bars, params: Record<string, number>): Record<string, Column> {
  switch (indicatorId) {
    case "ma":
      return { value: sma(bars.close, params.period) }
    case "bollinger": {
      const middle = sma(bars.close, params.period)
      const spread = bars.close.map((_, i) => {
        const mean = middle[i]
        if (mean === null) return null
        const window = bars.close.slice(i + 1 - params.period, i + 1)
        return params.k * Math.sqrt(window.reduce((a, b) => a + (b - mean) ** 2, 0) / params.period)
      })
      return {
        upper: middle.map((m, i) => (m === null || spread[i] === null ? null : m + (spread[i] as number))),
        middle,
        lower: middle.map((m, i) => (m === null || spread[i] === null ? null : m - (spread[i] as number))),
      }
    }
    case "macd": {
      const fast = ema(bars.close, params.fast)
      const slow = ema(bars.close, params.slow)
      const line: Column = fast.map((value, i) => (value === null || slow[i] === null ? null : value - (slow[i] as number)))
      const signal = ema(line, params.signal)
      return { value: line, signal, histogram: line.map((value, i) => (value === null || signal[i] === null ? null : value - (signal[i] as number))) }
    }
    case "volume": {
      const threshold: Column = bars.volume.map((_, i) =>
        i < params.lookback ? null : (params.mult * bars.volume.slice(i - params.lookback, i).reduce((a, b) => a + b, 0)) / params.lookback,
      )
      return { threshold, volume: bars.volume.slice() }
    }
    case "stochastic": {
      const k: Column = bars.close.map((close, i) => {
        if (i + 1 < params.period) return null
        const highs = bars.high.slice(i + 1 - params.period, i + 1)
        const lows = bars.low.slice(i + 1 - params.period, i + 1)
        const hi = Math.max(...highs)
        const lo = Math.min(...lows)
        return hi === lo ? null : (100 * (close - lo)) / (hi - lo)
      })
      const smooth = (column: Column, period: number): Column =>
        column.map((_, i) => {
          const slice = column.slice(i + 1 - period, i + 1)
          return i + 1 < period || slice.some((value) => value === null) ? null : (slice as number[]).reduce((a, b) => a + b, 0) / period
        })
      const percentK = smooth(k, params.smooth)
      return { value: percentK, signal: smooth(percentK, params.d) }
    }
    default:
      return { value: rsi(bars.close, params.period) }
  }
}

const round6 = (column: Column): Column => column.map((value) => (value === null ? null : Math.round(value * 1e6) / 1e6))

export const DEFAULT_PARAMS: Record<string, { buy: Record<string, number>; sell: Record<string, number> }> = {
  rsi: { buy: { period: 14, level: 30 }, sell: { period: 14, level: 70 } },
  ma: { buy: { period: 20 }, sell: { period: 20 } },
  bollinger: { buy: { period: 20, k: 2 }, sell: { period: 20, k: 2 } },
  macd: { buy: { fast: 12, slow: 26, signal: 9 }, sell: { fast: 12, slow: 26, signal: 9 } },
  volume: { buy: { lookback: 20, mult: 1.5 }, sell: { lookback: 20, mult: 1.5 } },
  stochastic: { buy: { period: 14, smooth: 3, d: 3, level: 25 }, sell: { period: 14, smooth: 3, d: 3, level: 75 } },
}

/**
 * Chart payload: `observation` bars (sessions -(observation-1)..0) followed by `test` bars
 * (sessions 1..test). With `test = 0` it is the pre-start preview.
 */
export function makeChart(input: {
  indicatorId?: string
  observation?: number
  test?: number
  params?: { buy: Record<string, number>; sell: Record<string, number> }
  seed?: number
}): PracticeChart {
  const indicatorId = input.indicatorId ?? "rsi"
  const observation = input.observation ?? 125
  const test = input.test ?? 0
  const params = input.params ?? DEFAULT_PARAMS[indicatorId] ?? DEFAULT_PARAMS.rsi
  const bars = makeBars(observation + test, input.seed ?? 7)
  const pick = (side: "buy" | "sell") => {
    const plot = plotSpec(indicatorId, params[side])
    const all = seriesFor(indicatorId, bars, params[side])
    const wanted = [...plot.lines.map((line) => line.key), ...(plot.histogram_key ? [plot.histogram_key] : []), ...(plot.volume_key ? [plot.volume_key] : [])]
    return { plot, series: Object.fromEntries(wanted.map((key) => [key, round6(all[key] ?? [])])) }
  }
  const buy = pick("buy")
  const sell = pick("sell")
  return {
    first_session: -(observation - 1),
    last_session: test,
    last_observed_session: 0,
    bars,
    series: { buy: buy.series, sell: sell.series },
    plot: { buy: buy.plot, sell: sell.plot },
  }
}

export function rsiForm(): PracticeForm {
  const field = (key: string, label: string, min: number, max: number, unit: string, type: "integer" | "number") => ({ key, label, type, min, max, step: 1, unit })
  const rules = (side: "buy" | "sell") => [
    {
      rule_id: "r1",
      kind: "compare" as const,
      default_op: side === "buy" ? ("<" as const) : (">" as const),
      allowed_ops: [">", "<"] as Array<">" | "<">,
      left_label: "RSI phiên trước",
      right_label: side === "buy" ? "30" : "70",
      lhs: { kind: "series" as const, key: "value", offset: -1 },
      rhs: { kind: "param" as const, key: "level" },
    },
    {
      rule_id: "r2",
      kind: "compare" as const,
      default_op: side === "buy" ? (">" as const) : ("<" as const),
      allowed_ops: [">", "<"] as Array<">" | "<">,
      left_label: "RSI",
      right_label: "RSI phiên trước",
      lhs: { kind: "series" as const, key: "value", offset: 0 },
      rhs: { kind: "series" as const, key: "value", offset: -1 },
    },
  ]
  return {
    indicator_id: "rsi",
    buy: { fields: [field("period", "Chu kỳ RSI", 5, 50, "phiên", "integer"), field("level", "Ngưỡng quá bán", 10, 49, "", "number")], rules: rules("buy") },
    sell: { fields: [field("period", "Chu kỳ RSI", 5, 50, "phiên", "integer"), field("level", "Ngưỡng quá mua", 51, 90, "", "number")], rules: rules("sell") },
    cross_fields: [],
    defaults: {
      buy: { enabled: true, params: { period: 14, level: 30 }, ops: { r1: "<", r2: ">" } },
      sell: { enabled: true, params: { period: 14, level: 70 }, ops: { r1: ">", r2: "<" } },
      hold_max_sessions: 60,
    },
  }
}

export function makeState(overrides: Partial<PracticeState> = {}): PracticeState {
  const form = rsiForm()
  return {
    set_version: "practice-set-test",
    indicator: { id: "rsi", name: "RSI" },
    status: "ready",
    ordinal: 1,
    total: 30,
    case: { case_id: CASE_ID, ordinal: 1, window_bars: 130 },
    draft: structuredClone(form.defaults),
    draft_revision: 1,
    validation: { valid: true, errors: [] },
    current_run: null,
    can_start: true,
    can_retry: false,
    can_next: false,
    completed_count: 0,
    runs: [],
    profile: { profile_version: "mini-profile-v1", capital: 100000000, lot: 100, buy_fee_rate: 0.0015, sell_cost_rate: 0.0025, verified: false },
    form,
    ...overrides,
  }
}

export type TradePlan = { buy: number; sell?: number; reason?: "indicator" | "max_holding" }

const evidence = (side: "buy" | "sell", signal: number, config: PracticeConfig, met: boolean): PracticeEvidence => ({
  side,
  signal_session: signal,
  enabled: true,
  result: met,
  params: { ...config[side].params },
  rules: [
    { rule_id: "r1", kind: "compare", op: config[side].ops.r1 ?? "<", left_label: "RSI phiên trước", right_label: String(config[side].params.level), lhs: side === "buy" ? 28.15 : 71.14, rhs: config[side].params.level, result: met, missing: false },
    { rule_id: "r2", kind: "compare", op: config[side].ops.r2 ?? ">", left_label: "RSI", right_label: "RSI phiên trước", lhs: side === "buy" ? 28.4 : 69.17, rhs: side === "buy" ? 28.15 : 71.14, result: met, missing: false, previous_lhs: 28.15, previous_rhs: 27.9 },
  ],
})

/** A locked, succeeded run with scripted trades (fills at the open of the planned session). */
export function makeRun(options: {
  runId?: string
  ordinal?: number
  caseId?: string
  config?: PracticeConfig
  plan?: TradePlan[]
  observation?: number
  test?: number
  valuation?: "ok" | "missing"
  indicatorId?: string
  holdMax?: number
} = {}): PracticeRun {
  const config = options.config ?? makeState().draft
  const test = options.test ?? 504
  const chart = makeChart({ indicatorId: options.indicatorId ?? "rsi", observation: options.observation ?? 125, test })
  const offset = chart.first_session
  const at = (series: number[], session: number) => series[session - offset]
  const plan = options.plan ?? [{ buy: 20, sell: 45, reason: "indicator" }, { buy: 100, sell: 160, reason: "max_holding" }, { buy: 400 }]
  const hold = options.holdMax ?? config.hold_max_sessions
  let cash = 100_000_000
  const trades: PracticeTrade[] = []
  const events: PracticeEvent[] = []
  plan.forEach((item, index) => {
    const price = at(chart.bars.open, item.buy)
    const qty = Math.floor(cash / (price * 1.0015) / 100) * 100
    const buyFee = Math.round(qty * price * 0.0015)
    const total = qty * price + buyFee
    cash -= total
    events.push({ side: "buy", session: item.buy, price, trade_ordinal: index + 1 })
    const buy = { signal_session: item.buy - 1, session: item.buy, price, fee: buyFee, total_cost: total, evidence: evidence("buy", item.buy - 1, config, true) }
    if (item.sell === undefined) {
      const markSession = test
      const mark = at(chart.bars.close, markSession)
      const pnl = qty * mark - total
      trades.push({ ordinal: index + 1, status: "open", qty, buy, sell: null, holding_sessions: markSession - item.buy, pnl_kind: "unrealized", pnl_vnd: pnl, pnl_ratio: pnl / total, mark: { session: markSession, price: mark, market_value: qty * mark } })
      return
    }
    const sellPrice = at(chart.bars.open, item.sell)
    const sellFee = Math.round(qty * sellPrice * 0.0025)
    const net = qty * sellPrice - sellFee
    cash += net
    const reason = item.reason ?? "indicator"
    events.push({ side: "sell", session: item.sell, price: sellPrice, trade_ordinal: index + 1, reason })
    trades.push({
      ordinal: index + 1,
      status: "closed",
      qty,
      buy,
      sell: {
        signal_session: item.sell - 1,
        session: item.sell,
        price: sellPrice,
        fee: sellFee,
        net_proceeds: net,
        reason,
        indicator_met: reason === "indicator",
        time_due: reason === "max_holding",
        evidence: evidence("sell", item.sell - 1, config, reason === "indicator"),
        time_exit: { hold_max_sessions: hold, held_sessions_at_signal: item.sell - item.buy, due: reason === "max_holding" },
      },
      holding_sessions: item.sell - item.buy,
      pnl_kind: "realized",
      pnl_vnd: net - total,
      pnl_ratio: (net - total) / total,
      mark: null,
    })
  })
  // NAV per session close.
  const nav: number[] = []
  let running = 100_000_000
  let position: { qty: number; session: number; total: number; sellAt: number } | null = null
  for (let session = 1; session <= test; session += 1) {
    for (const trade of trades) {
      if (trade.buy.session === session) {
        running -= trade.buy.total_cost
        position = { qty: trade.qty, session, total: trade.buy.total_cost, sellAt: trade.sell?.session ?? Number.POSITIVE_INFINITY }
      }
      if (trade.sell && trade.sell.session === session) {
        running += trade.sell.net_proceeds
        position = null
      }
    }
    nav.push(running + (position ? position.qty * at(chart.bars.close, session) : 0))
  }
  const openTrade = trades.find((trade) => trade.status === "open")
  const openValue = openTrade?.mark ? openTrade.mark.market_value : openTrade ? null : 0
  const navEnd = options.valuation === "missing" ? null : openValue === null ? null : cash + openValue
  const closed = trades.filter((trade) => trade.status === "closed")
  const timeExits = closed.filter((trade) => trade.sell?.reason === "max_holding").length
  const text = openTrade && closed.length === 0
    ? "Đã có Mua nhưng chưa có Bán. Tổng lợi nhuận bao gồm lãi/lỗ tạm tính của vị thế đang giữ."
    : `${navEnd !== null && navEnd > 100_000_000 ? "Danh mục kết thúc cao hơn vốn ban đầu." : "Danh mục kết thúc thấp hơn vốn ban đầu."} ${trades.length} lần Mua, ${closed.length} giao dịch đã bán.${timeExits ? ` ${timeExits} giao dịch được đóng do hết thời gian giữ, không phải do điều kiện RSI.` : ""}${openTrade ? " Kết quả còn bao gồm một vị thế chưa bán." : ""}`
  return {
    run_id: options.runId ?? RUN_ID,
    indicator_id: "rsi",
    ordinal: options.ordinal ?? 1,
    total: 30,
    case_id: options.caseId ?? CASE_ID,
    status: "succeeded",
    config,
    versions: { set_version: "s", data_version: "d", profile_version: "mini-profile-v1", calculation_version: "c", rule_version: "r", engine_version: "e", execution_version: "x", comment_version: "k" },
    locked_at: "2000-01-01T00:00:00.000Z",
    completed_at: "2000-01-01T00:00:01.000Z",
    attempts: 1,
    error: null,
    result: {
      first_session: 1,
      last_session: test,
      kpis: {
        capital_initial: 100_000_000,
        cash_end: cash,
        open_position_value: options.valuation === "missing" ? null : openValue,
        nav_end: navEnd,
        total_return: navEnd === null ? null : navEnd / 100_000_000 - 1,
        valuation: navEnd === null ? "missing" : "ok",
        buy_count: trades.length,
        closed_trade_count: closed.length,
        open_position: openTrade !== undefined,
        insufficient_cash_buys: 0,
      },
      trades,
      events,
      pending_orders: [],
      missed_buys: [],
      nav,
      comment: navEnd === null
        ? { status: "unavailable", rule_id: "unavailable_missing_valuation", version: "k", text: null, values: {} }
        : { status: "ok", rule_id: openTrade && closed.length === 0 ? "buy_open_without_sell" : "portfolio_result", version: "k", text, values: {} },
      data_notes: [],
    },
    chart,
  }
}

export function makeHistory(runs: PracticeRun[]): PracticeHistory {
  return {
    page: 1,
    page_size: 30,
    total: runs.length,
    items: runs
      .slice()
      .reverse()
      .map((run) => ({
        run_id: run.run_id,
        ordinal: run.ordinal,
        case_id: run.case_id,
        completed_at: run.completed_at,
        config: run.config,
        kpis: run.result
          ? { total_return: run.result.kpis.total_return, buy_count: run.result.kpis.buy_count, closed_trade_count: run.result.kpis.closed_trade_count, open_position: run.result.kpis.open_position, comment_rule_id: run.result.comment.rule_id }
          : null,
        versions: run.versions,
      })),
  }
}

export function briefOf(run: PracticeRun): PracticeState["runs"][number] {
  return {
    run_id: run.run_id,
    ordinal: run.ordinal,
    case_id: run.case_id,
    status: run.status,
    summary: run.result
      ? { total_return: run.result.kpis.total_return, buy_count: run.result.kpis.buy_count, closed_trade_count: run.result.kpis.closed_trade_count, open_position: run.result.kpis.open_position, comment_rule_id: run.result.comment.rule_id }
      : null,
  }
}
