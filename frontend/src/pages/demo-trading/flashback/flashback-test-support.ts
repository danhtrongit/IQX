/**
 * Backend giả của Flashback v2 "Phòng chơi": sảnh, một phòng (chờ rồi chơi), một ván và kết quả.
 *
 * Đủ gần server thật để màn hình chạy trọn luồng: tạo hoặc vào phòng, bắt đầu, phiên tiếp, đặt lệnh,
 * hoàn thành, kết quả và chơi lại. Test chỉnh `state` trực tiếp để giả lập người khác (vào phòng,
 * hoàn thành, hết giờ) và dùng `fail` để ép một lỗi của server. Mọi lời gọi được ghi lại.
 */
import { ApiError } from "@/lib/api"

import type {
  FlashbackBar,
  FlashbackIndicatorMeta,
  FlashbackIndicatorParamMeta,
  FlashbackMatchResult,
  FlashbackMatchState,
  FlashbackMe,
  FlashbackOrder,
  FlashbackPlayer,
  FlashbackPosition,
  FlashbackRoom,
  FlashbackRoomListItem,
  FlashbackSnapshot,
} from "./flashback-api"

export const INITIAL_CASH = 10_000_000
/** Giá đóng cửa của mọi nến giả: giá khớp của mọi lệnh. */
export const MATCH_PRICE = 28_800
export const ROOM_CODE = "482913"
/** ID ván thứ `n` của phòng (mỗi lần bắt đầu là một ván mới, đúng như server). */
export const matchIdOf = (n: number) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`
export const MATCH_ID = matchIdOf(1)

export type Person = { user_id: string; name: string; avatar_url: string | null }

export const ME: Person = { user_id: "user-1", name: "Linh", avatar_url: null }
export const MINH: Person = { user_id: "user-2", name: "Minh", avatar_url: null }
export const HOA: Person = { user_id: "user-3", name: "Hòa", avatar_url: null }

export type Call = { method: string; path: string; body?: Record<string, unknown> }
export type Failure = { status: number; code: string; message: string }

export type RoomSettings = {
  view_bars: number
  play_bars: number
  minutes: number
  max_players: number
  stake_xu: number
}

export const DEFAULT_SETTINGS: RoomSettings = { view_bars: 60, play_bars: 30, minutes: 10, max_players: 4, stake_xu: 100 }

type Rival = { person: Person; pnl: number; finished: boolean }

type MatchSim = {
  id: string
  status: "playing" | "ended"
  endReason: "all_finished" | "timeout"
  step: number
  finished: boolean
  cash: number
  holdings: number
  orders: FlashbackOrder[]
  positions: FlashbackPosition[]
  /** Mốc kết thúc theo đồng hồ của server giả: còn lại = `deadline - Date.now()`. */
  deadline: number
  rivals: Rival[]
  sequence: number
}

type RoomSim = {
  code: string
  owner: Person
  members: Person[]
  settings: RoomSettings
  password: string | null
  status: "waiting" | "playing"
  match: MatchSim | null
}

export type BackendOptions = {
  /** Phòng đang ở lúc vào màn hình. */
  room?: Partial<Pick<RoomSim, "code" | "owner" | "members" | "password" | "status">> & { settings?: Partial<RoomSettings> }
  /** Ván đang dở của phòng (bước đã chơi...) khi `room.status` là "playing". */
  match?: Partial<Pick<MatchSim, "step" | "finished" | "cash" | "holdings" | "status">> & {
    /** Còn bao nhiêu mili giây lúc vào ván. */
    remainingMs?: number
    rivals?: Rival[]
  }
  /** Các dòng ở sảnh. */
  listing?: FlashbackRoomListItem[]
  /** Mật khẩu của các phòng ở sảnh, theo ID. */
  passwords?: Record<string, string>
  notice?: string | null
  indicators?: FlashbackIndicatorMeta[]
}

// ------------------------------------------------------------------ chỉ báo

const integer = (key: string, label: string, min: number, max: number, value: number): FlashbackIndicatorParamMeta => ({
  key,
  label,
  type: "integer",
  min,
  max,
  step: 1,
  unit: "phiên",
  default: value,
  lower: null,
  upper: null,
})

const levels = (key: string, label: string, lower: number, upper: number): FlashbackIndicatorParamMeta => ({
  key,
  label,
  type: "number",
  min: -200,
  max: 200,
  step: 1,
  unit: "",
  default: lower,
  lower: { min: -200, max: upper - 1, default: lower, label: "Ngưỡng dưới" },
  upper: { min: lower + 1, max: 200, default: upper, label: "Ngưỡng trên" },
})

function meta(id: string, name: string, params: FlashbackIndicatorParamMeta[], warmup: number, cross = false): FlashbackIndicatorMeta {
  return {
    id,
    name,
    chapter: 4,
    lesson_id: null,
    params,
    cross_fields: cross ? [{ left: "fast", op: "<", right: "slow" }] : [],
    warmup_sessions: warmup,
  }
}

/** Đủ 16 chỉ báo, không khoá theo Học viện: 1 khối lượng, 5 vẽ trên giá, 10 có ô riêng. */
export const INDICATOR_METAS: FlashbackIndicatorMeta[] = [
  meta("volume", "Khối lượng", [integer("lookback", "Số phiên trung bình", 5, 60, 20)], 20),
  meta("ma", "MA / SMA", [integer("period", "Chu kỳ SMA", 5, 200, 20)], 20),
  meta("ema", "EMA", [integer("period", "Chu kỳ EMA", 5, 200, 20)], 20),
  meta("ma_cross", "MA cắt MA", [integer("fast", "SMA nhanh", 5, 100, 20), integer("slow", "SMA chậm", 10, 200, 50)], 50, true),
  meta("bollinger", "Bollinger Bands", [integer("period", "Chu kỳ", 5, 100, 20)], 20),
  meta("donchian", "Donchian Channel", [integer("period", "Chu kỳ", 5, 100, 20)], 20),
  meta("rsi", "RSI", [integer("period", "Chu kỳ RSI", 5, 50, 14), levels("level", "Ngưỡng RSI", 30, 70)], 14),
  meta(
    "macd",
    "MACD",
    [integer("fast", "Chu kỳ EMA nhanh", 2, 50, 12), integer("slow", "Chu kỳ EMA chậm", 5, 100, 26), integer("signal", "Chu kỳ tín hiệu", 2, 30, 9)],
    26,
    true,
  ),
  meta("dmi", "DMI", [integer("period", "Chu kỳ DMI", 5, 50, 14)], 14),
  meta("stochastic", "Stochastic", [integer("k", "Chu kỳ %K", 5, 50, 14), integer("d", "Chu kỳ %D", 2, 20, 3), integer("smooth", "Làm mượt", 1, 10, 3)], 20),
  meta("cci", "CCI", [integer("period", "Chu kỳ CCI", 5, 100, 20), levels("level", "Ngưỡng CCI", -100, 100)], 20),
  meta("roc", "ROC", [integer("period", "Chu kỳ ROC", 2, 100, 12), levels("level", "Ngưỡng ROC", -10, 10)], 12),
  meta("williams_r", "Williams %R", [integer("period", "Chu kỳ", 5, 50, 14), levels("level", "Ngưỡng %R", -80, -20)], 14),
  meta("obv", "OBV", [integer("baseline", "Chu kỳ đường tín hiệu", 5, 100, 20)], 20),
  meta("mfi", "MFI", [integer("period", "Chu kỳ MFI", 5, 50, 14), levels("level", "Ngưỡng MFI", 20, 80)], 14),
  meta("cmf", "CMF", [integer("period", "Chu kỳ CMF", 5, 100, 20)], 20),
]

// ------------------------------------------------------------------ nến

/** Nến xem: bước nhẹ quanh giá khớp, nến cuối đóng đúng giá khớp. */
export function historyBars(count: number): FlashbackBar[] {
  const bars: FlashbackBar[] = []
  let close = MATCH_PRICE - 400
  for (let index = 0; index < count; index += 1) {
    const open = close
    close = MATCH_PRICE - 400 + index * 6
    bars.push({
      session: index,
      open,
      high: Math.max(open, close) + 120,
      low: Math.min(open, close) - 120,
      close,
      volume: 1_000_000 + index * 1_000,
    })
  }
  const last = bars[bars.length - 1]
  last.close = MATCH_PRICE
  last.high = MATCH_PRICE + 150
  last.low = MATCH_PRICE - 150
  return bars
}

/** Nến chơi: giá đi ngang quanh giá khớp để các phép tính dễ kiểm chứng. */
export function playedBar(viewBars: number, index: number): FlashbackBar {
  return {
    session: viewBars + index,
    open: MATCH_PRICE,
    high: MATCH_PRICE + 200,
    low: MATCH_PRICE - 200,
    close: MATCH_PRICE,
    volume: 1_200_000,
  }
}

// ------------------------------------------------------------------ dòng ở sảnh

export function listingRow(overrides: Partial<FlashbackRoomListItem> & { id: string }): FlashbackRoomListItem {
  return {
    created_at: "2026-10-30T01:00:00.000Z",
    full: false,
    locked: false,
    max_players: 4,
    member_count: 1,
    minutes: 10,
    owner: { name: "Minh", avatar_url: null },
    play_bars: 30,
    stake_xu: 100,
    status: "waiting",
    view_bars: 60,
    ...overrides,
  }
}

// ------------------------------------------------------------------ backend

export function createFlashbackBackend(options: BackendOptions = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...options.room?.settings }
  const state = {
    listing: options.listing ?? ([] as FlashbackRoomListItem[]),
    passwords: options.passwords ?? ({} as Record<string, string>),
    notice: options.notice ?? null,
    indicators: options.indicators ?? INDICATOR_METAS,
    /** Người bị đưa ra khỏi phòng lúc bắt đầu (thiếu xu). */
    removedOnStart: [] as { message: string; name: string; user_id: string }[],
    room: null as RoomSim | null,
    matchSeq: 0,
    failures: [] as { key: string; failure: Failure }[],
  }

  if (options.room) {
    const owner = options.room.owner ?? ME
    state.room = {
      code: options.room.code ?? ROOM_CODE,
      owner,
      members: options.room.members ?? [owner],
      settings,
      password: options.room.password ?? null,
      status: options.room.status ?? "waiting",
      match: null,
    }
    if (state.room.status === "playing") state.room.match = newMatch(options.match)
  }

  const calls: Call[] = []

  function newMatch(from?: BackendOptions["match"]): MatchSim {
    state.matchSeq += 1
    return {
      id: matchIdOf(state.matchSeq),
      status: from?.status ?? "playing",
      endReason: "all_finished",
      step: from?.step ?? 0,
      finished: from?.finished ?? false,
      cash: from?.cash ?? INITIAL_CASH,
      holdings: from?.holdings ?? 0,
      orders: [],
      positions: [],
      deadline: Date.now() + (from?.remainingMs ?? 600_000),
      rivals: from?.rivals ?? [{ person: MINH, pnl: 0, finished: false }],
      sequence: 0,
    }
  }

  function currentRoom(): RoomSim {
    if (!state.room) throw new ApiError("Bạn chưa ở trong phòng nào", 403, "NOT_IN_ROOM")
    return state.room
  }

  function currentMatch(): { room: RoomSim; match: MatchSim } {
    const room = currentRoom()
    if (!room.match) throw new ApiError("Không tìm thấy ván", 404, "MATCH_NOT_FOUND")
    return { room, match: room.match }
  }

  const remaining = (match: MatchSim) => Math.max(0, match.deadline - Date.now())
  const totalAssets = (match: MatchSim) => match.cash + match.holdings * MATCH_PRICE
  const pnlPercent = (match: MatchSim) => ((totalAssets(match) - INITIAL_CASH) / INITIAL_CASH) * 100

  function me(room: RoomSim, match: MatchSim): FlashbackMe {
    const positions = match.positions.map((position) => {
      const settled = position.sellable_step <= match.step
      return { ...position, status: settled ? ("settled" as const) : ("pending" as const), sessions_left: Math.max(0, position.sellable_step - match.step) }
    })
    const sellable = positions.filter((position) => position.status === "settled").reduce((sum, position) => sum + position.qty, 0)
    return {
      auto_finished: false,
      cash: String(match.cash),
      finished: match.finished || match.status === "ended",
      holdings: match.holdings,
      max_buy_qty: Math.floor(match.cash / (MATCH_PRICE * 1.0015)),
      orders: match.orders,
      play_bars: room.settings.play_bars,
      pnl_pct: pnlPercent(match) / 100,
      pnl_percent: pnlPercent(match),
      positions,
      price: String(MATCH_PRICE),
      sellable,
      step: match.step,
      total_assets: String(totalAssets(match)),
    }
  }

  function players(match: MatchSim): FlashbackPlayer[] {
    const mine: FlashbackPlayer = {
      avatar_url: null,
      finished: match.finished,
      is_me: true,
      name: ME.name,
      pnl_pct: pnlPercent(match) / 100,
      pnl_percent: pnlPercent(match),
      user_id: ME.user_id,
    }
    const others = match.rivals.map<FlashbackPlayer>((rival) => ({
      avatar_url: rival.person.avatar_url,
      finished: rival.finished,
      is_me: false,
      name: rival.person.name,
      pnl_pct: rival.pnl / 100,
      pnl_percent: rival.pnl,
      user_id: rival.person.user_id,
    }))
    return [mine, ...others]
  }

  const playingCount = (match: MatchSim) =>
    match.status === "ended" ? 0 : players(match).filter((player) => !player.finished).length

  function roomView(room: RoomSim): FlashbackRoom {
    return {
      auto_close_at: null,
      created_at: "2026-10-30T01:00:00.000Z",
      id: room.code,
      is_owner: room.owner.user_id === ME.user_id,
      locked: room.password !== null,
      match: room.match
        ? {
            ends_at: "2026-10-30T01:10:00.000Z",
            id: room.match.id,
            joined: true,
            started_at: "2026-10-30T01:00:00.000Z",
            status: room.match.status,
          }
        : null,
      max_players: room.settings.max_players,
      members: room.members.map((person) => ({
        avatar_url: person.avatar_url,
        is_me: person.user_id === ME.user_id,
        is_owner: person.user_id === room.owner.user_id,
        joined_at: "2026-10-30T01:00:00.000Z",
        name: person.name,
        user_id: person.user_id,
      })),
      minutes: room.settings.minutes,
      owner_id: room.owner.user_id,
      play_bars: room.settings.play_bars,
      server_now: "2026-10-30T01:00:30.000Z",
      stake_xu: room.settings.stake_xu,
      status: room.status,
      view_bars: room.settings.view_bars,
    }
  }

  function snapshot(room: RoomSim, match: MatchSim): FlashbackSnapshot {
    const view = room.settings.view_bars
    return {
      ends_at: "2026-10-30T01:10:00.000Z",
      history_bars: historyBars(view),
      initial_cash: String(INITIAL_CASH),
      match_id: match.id,
      me: me(room, match),
      minutes: room.settings.minutes,
      my_finished: match.finished,
      my_step: match.step,
      play_bars: room.settings.play_bars,
      played_bars: Array.from({ length: match.step }, (_, index) => playedBar(view, index)),
      players: players(match),
      playing_count: playingCount(match),
      pot_xu: room.settings.stake_xu * room.members.length,
      remaining_ms: remaining(match),
      room_id: room.code,
      server_now: "2026-10-30T01:00:30.000Z",
      stake_xu: room.members.length > 1 ? room.settings.stake_xu : 0,
      started_at: "2026-10-30T01:00:00.000Z",
      status: match.status,
      view_bars: view,
      warmup_bars: [],
    }
  }

  function matchState(room: RoomSim, match: MatchSim): FlashbackMatchState {
    return {
      ends_at: "2026-10-30T01:10:00.000Z",
      match_id: match.id,
      my_finished: match.finished || match.status === "ended",
      my_step: match.step,
      players: players(match),
      playing_count: playingCount(match),
      remaining_ms: match.status === "ended" ? 0 : remaining(match),
      room_id: room.code,
      server_now: "2026-10-30T01:00:30.000Z",
      started_at: "2026-10-30T01:00:00.000Z",
      status: match.status,
    }
  }

  function result(room: RoomSim, match: MatchSim): FlashbackMatchResult {
    if (match.status !== "ended") throw new ApiError("Ván chưa kết thúc", 409, "RESULT_NOT_READY")
    const everyone = players(match).sort((left, right) => right.pnl_percent - left.pnl_percent)
    const best = everyone[0].pnl_percent
    const solo = everyone.length === 1
    const winners = everyone.filter((player) => Math.abs(player.pnl_percent - best) < 0.005)
    const stake = solo ? 0 : room.settings.stake_xu
    const pot = stake * everyone.length
    const refund = pot > 0 && best === 0 && winners.length === everyone.length
    const share = pot > 0 ? Math.floor(pot / winners.length) : 0
    const mineWon = winners.some((player) => player.is_me)
    const title = solo ? "Kết quả" : winners.length > 1 ? "Hoà" : mineWon ? "Bạn thắng" : `${winners[0].name} thắng`
    return {
      end_date: "2026-03-31",
      end_reason: match.endReason,
      match_id: match.id,
      played_bars: Array.from({ length: room.settings.play_bars }, (_, index) => playedBar(room.settings.view_bars, index)),
      pot_xu: pot,
      refund,
      room_id: room.code,
      rows: everyone.map((player) => {
        const isWinner = !solo && winners.includes(player)
        return {
          avatar_url: player.avatar_url,
          final_nav: String(Math.round(INITIAL_CASH * (1 + player.pnl_percent / 100))),
          is_me: player.is_me,
          is_winner: isWinner,
          name: player.name,
          pnl_pct: player.pnl_pct,
          pnl_percent: player.pnl_percent,
          rank: 1 + everyone.filter((other) => other.pnl_percent - player.pnl_percent > 0.005).length,
          refund_xu: refund ? stake : 0,
          user_id: player.user_id,
          win_xu: !refund && isWinner ? share : 0,
          xu_label: isWinner && pot > 0 ? (refund ? "Hoàn xu cược" : `+${share} xu`) : null,
        }
      }),
      solo,
      stake_xu: stake,
      start_date: "2026-01-02",
      symbol: "VNM",
      title,
    }
  }

  /** Mọi người đã xong thì ván kết thúc; hoặc hết giờ. */
  function settle(match: MatchSim) {
    if (match.status === "ended") return
    if (remaining(match) <= 0) {
      match.status = "ended"
      match.endReason = "timeout"
      match.finished = true
      for (const rival of match.rivals) rival.finished = true
      return
    }
    if (match.finished && match.rivals.every((rival) => rival.finished)) {
      match.status = "ended"
      match.endReason = "all_finished"
    }
  }

  function placeOrder(room: RoomSim, match: MatchSim, body: { side: "buy" | "sell"; qty: number }) {
    if (match.status === "ended") throw new ApiError("Ván đã kết thúc", 409, "MATCH_ENDED")
    if (match.finished) throw new ApiError("Bạn đã hoàn thành", 409, "ALREADY_FINISHED")
    const amount = MATCH_PRICE * body.qty
    const fee = Math.round(amount * 0.0015)
    const tax = body.side === "sell" ? Math.round(amount * 0.001) : 0
    if (body.side === "buy") {
      if (amount + fee > match.cash) throw new ApiError("Không đủ tiền mặt", 422, "INSUFFICIENT_CASH")
      match.cash -= amount + fee
      match.holdings += body.qty
      match.positions.push({
        pnl_pct: 0,
        price: String(MATCH_PRICE),
        qty: body.qty,
        sellable_step: match.step + 2,
        sessions_left: 2,
        status: "pending",
        step: match.step,
        value: String(amount),
      })
    } else {
      const available = me(room, match).sellable
      if (body.qty > available) throw new ApiError("Cổ phiếu chưa đủ T+2", 422, "NOT_SETTLED_YET")
      match.cash += amount - fee - tax
      match.holdings -= body.qty
      let remaining = body.qty
      for (const position of match.positions) {
        if (remaining <= 0) break
        if (position.sellable_step > match.step) continue
        const taken = Math.min(position.qty, remaining)
        position.qty -= taken
        remaining -= taken
      }
      match.positions = match.positions.filter((position) => position.qty > 0)
    }
    match.sequence += 1
    const order: FlashbackOrder = {
      amount: String(amount),
      created_at: "2026-10-30T01:01:00.000Z",
      fee: String(fee),
      id: `order-${match.sequence}`,
      price: String(MATCH_PRICE),
      qty: body.qty,
      side: body.side,
      step: match.step,
      tax: String(tax),
    }
    match.orders.push(order)
    return { order, me: me(room, match) }
  }

  function normalize(path: string): string {
    return path
      .split("?")[0]
      .replace(/\/flashback\/rooms\/\d{6}/, "/flashback/rooms/:code")
      .replace(/\/flashback\/matches\/[0-9a-f-]{36}/, "/flashback/matches/:id")
  }

  function route(call: Call): unknown {
    const key = `${call.method} ${normalize(call.path)}`
    const pending = state.failures.findIndex((entry) => entry.key === key)
    if (pending >= 0) {
      const [{ failure }] = state.failures.splice(pending, 1)
      throw new ApiError(failure.message, failure.status, failure.code)
    }

    switch (key) {
      case "GET /flashback/rooms": {
        const wanted = new URLSearchParams(call.path.split("?")[1] ?? "").get("status") ?? "all"
        return { rooms: state.listing.filter((row) => wanted === "all" || row.status === wanted) }
      }
      case "GET /flashback/rooms/me": {
        const notice = state.notice
        state.notice = null
        return { room: state.room ? roomView(state.room) : null, notice }
      }
      case "POST /flashback/rooms": {
        const body = call.body as {
          view_bars: number
          play_bars: number
          minutes: number
          max_players: number
          stake_xu: number | null
          password: string | null
        }
        state.room = {
          code: ROOM_CODE,
          owner: ME,
          members: [ME],
          settings: {
            view_bars: body.view_bars,
            play_bars: body.play_bars,
            minutes: body.minutes,
            max_players: body.max_players,
            stake_xu: body.stake_xu ?? 0,
          },
          password: body.password,
          status: "waiting",
          match: null,
        }
        return roomView(state.room)
      }
      case "POST /flashback/rooms/random-join": {
        const row = state.listing.find((candidate) => candidate.status === "waiting" && !candidate.locked && !candidate.full)
        if (!row) throw new ApiError("Chưa có phòng mở phù hợp, hãy tạo phòng", 404, "NO_ROOM_AVAILABLE")
        return joinListed(row.id, undefined)
      }
      case "GET /flashback/rooms/:code": {
        const room = currentRoom()
        if (!call.path.includes(`/${room.code}`)) throw new ApiError("Bạn không ở trong phòng này", 403, "NOT_IN_ROOM")
        return roomView(room)
      }
      case "POST /flashback/rooms/:code/join": {
        const code = /\/flashback\/rooms\/(\d{6})/.exec(call.path)?.[1] ?? ""
        return joinListed(code, (call.body as { password?: string } | undefined)?.password)
      }
      case "POST /flashback/rooms/:code/leave": {
        state.room = null
        return { left: true }
      }
      case "POST /flashback/rooms/:code/start": {
        const room = currentRoom()
        if (room.owner.user_id !== ME.user_id) throw new ApiError("Chỉ chủ phòng được bắt đầu", 403, "NOT_ROOM_OWNER")
        const removed = state.removedOnStart
        if (removed.length > 0) room.members = room.members.filter((person) => !removed.some((gone) => gone.user_id === person.user_id))
        room.status = "playing"
        room.match = newMatch()
        room.match.rivals = room.members
          .filter((person) => person.user_id !== ME.user_id)
          .map((person) => ({ person, pnl: 0, finished: false }))
        return { match: snapshot(room, room.match), room: roomView(room), removed }
      }
      case "POST /flashback/rooms/:code/replay": {
        const room = currentRoom()
        room.status = "waiting"
        room.match = null
        return roomView(room)
      }
      case "GET /flashback/indicators":
        return { indicators: state.indicators }
      default:
        break
    }

    const { room, match } = key.includes("/flashback/matches/") ? currentMatch() : { room: null, match: null }
    if (room && match) {
      settle(match)
      switch (key) {
        case "GET /flashback/matches/:id":
          return snapshot(room, match)
        case "GET /flashback/matches/:id/state":
          return matchState(room, match)
        case "GET /flashback/matches/:id/result":
          return result(room, match)
        case "POST /flashback/matches/:id/next": {
          if (match.status === "ended") throw new ApiError("Ván đã kết thúc", 409, "MATCH_ENDED")
          if (match.finished) throw new ApiError("Bạn đã hoàn thành", 409, "ALREADY_FINISHED")
          if (match.step >= room.settings.play_bars) throw new ApiError("Đã ở phiên cuối", 409, "AT_LAST_BAR")
          match.step += 1
          return { bar: playedBar(room.settings.view_bars, match.step - 1), me: me(room, match) }
        }
        case "POST /flashback/matches/:id/orders":
          return placeOrder(room, match, call.body as { side: "buy" | "sell"; qty: number })
        case "POST /flashback/matches/:id/finish": {
          if (match.status !== "ended" && match.step < room.settings.play_bars) {
            throw new ApiError("Chưa tới phiên cuối", 409, "NOT_AT_END")
          }
          match.finished = true
          settle(match)
          return { ended: match.status === "ended", me: me(room, match), playing_count: playingCount(match) }
        }
        default:
          break
      }
    }
    throw new Error(`Fake Flashback backend: chưa có route ${key}`)
  }

  function joinListed(code: string, password: string | undefined): FlashbackRoom {
    const row = state.listing.find((candidate) => candidate.id === code)
    if (!row) throw new ApiError("Không tìm thấy phòng", 404, "ROOM_NOT_FOUND")
    const secret = state.passwords[code]
    if (secret && !password) throw new ApiError("Phòng có mật khẩu", 403, "PASSWORD_REQUIRED")
    if (secret && password !== secret) throw new ApiError("Mật khẩu không đúng", 403, "WRONG_PASSWORD")
    if (row.status === "playing") throw new ApiError("Phòng đang chơi, chưa vào được", 409, "ROOM_PLAYING")
    if (row.full) throw new ApiError("Phòng đã đủ người", 409, "ROOM_FULL")
    const owner: Person = { user_id: "owner-" + code, name: row.owner.name, avatar_url: row.owner.avatar_url }
    state.room = {
      code,
      owner,
      members: [owner, ME],
      settings: {
        view_bars: row.view_bars,
        play_bars: row.play_bars,
        minutes: row.minutes,
        max_players: row.max_players,
        stake_xu: row.stake_xu,
      },
      password: secret ?? null,
      status: "waiting",
      match: null,
    }
    return roomView(state.room)
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
    /** Lần gọi kế tiếp tới `METHOD /đường/dẫn/:code` sẽ trả lỗi này (một lần). */
    fail: (key: string, failure: Failure) => state.failures.push({ key, failure }),
    /** Người khác vào phòng chờ. */
    addMember: (person: Person) => {
      const room = currentRoom()
      if (!room.members.some((member) => member.user_id === person.user_id)) room.members.push(person)
    },
    removeMember: (userId: string) => {
      const room = currentRoom()
      room.members = room.members.filter((member) => member.user_id !== userId)
    },
    /** Chủ phòng khác bắt đầu ván (người chơi còn lại sang màn chơi khi phòng được tải lại). */
    startByOwner: () => {
      const room = currentRoom()
      room.status = "playing"
      room.match = newMatch()
      room.match.rivals = room.members
        .filter((person) => person.user_id !== ME.user_id)
        .map((person) => ({ person, pnl: 0, finished: false }))
    },
    /** Một người khác bấm Chơi lại: phòng về trạng thái chờ. */
    replayByOther: () => {
      const room = currentRoom()
      room.status = "waiting"
      room.match = null
    },
    /** Người khác hoàn thành ván với mức lãi lỗ này. */
    rivalFinishes: (userId: string, pnl: number) => {
      const { match } = currentMatch()
      const rival = match.rivals.find((candidate) => candidate.person.user_id === userId)
      if (rival) {
        rival.pnl = pnl
        rival.finished = true
      }
    },
    setRivalPnl: (userId: string, pnl: number) => {
      const { match } = currentMatch()
      const rival = match.rivals.find((candidate) => candidate.person.user_id === userId)
      if (rival) rival.pnl = pnl
    },
    /** Đồng hồ của ván: còn bao nhiêu mili giây (0 là hết giờ). */
    setRemaining: (remainingMs: number) => {
      currentMatch().match.deadline = Date.now() + remainingMs
    },
    match: () => currentMatch().match,
  }
}

export type FlashbackBackend = ReturnType<typeof createFlashbackBackend>
