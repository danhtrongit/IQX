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
  FlashbackChat,
  FlashbackChatMessage,
  FlashbackCrown,
  FlashbackHistoryItem,
  FlashbackIndicatorMeta,
  FlashbackIndicatorParamMeta,
  FlashbackLeaderboardRow,
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

/** `level` mặc định 1 và `crown` mặc định không có (người chưa ở top 3). */
export type Person = {
  user_id: string
  name: string
  avatar_url: string | null
  level?: number
  crown?: FlashbackCrown
}

export const ME: Person = { user_id: "user-1", name: "Linh", avatar_url: null }
export const MINH: Person = { user_id: "user-2", name: "Minh", avatar_url: null }
export const HOA: Person = { user_id: "user-3", name: "Hòa", avatar_url: null }

const badge = (person: Pick<Person, "level" | "crown">) => ({ level: person.level ?? 1, crown: person.crown ?? null })

/** Tổng điểm để đạt cấp L (v2.1 §3.2), giống server. */
export const levelBase = (level: number) => 5 * (level - 1) * (level + 2)
export function levelOf(points: number): number {
  let level = 1
  while (levelBase(level + 1) <= points) level += 1
  return level
}

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

/** `step` là phiên hiện tại của người này; mặc định 0, người đã xong thì ở phiên cuối. */
type Rival = { person: Person; pnl: number; finished: boolean; step?: number }

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
  /** user_id của những người không phải chủ phòng đang bấm "Sẵn sàng". */
  ready: Set<string>
  settings: RoomSettings
  password: string | null
  chatEnabled: boolean
  status: "waiting" | "playing"
  match: MatchSim | null
}

export type BackendOptions = {
  /** Phòng đang ở lúc vào màn hình. */
  room?: Partial<Pick<RoomSim, "code" | "owner" | "members" | "password" | "status" | "chatEnabled">> & {
    settings?: Partial<RoomSettings>
    /** Những người (không phải chủ phòng) đã sẵn sàng lúc vào màn hình. */
    ready?: string[]
  }
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
  /** Cấp và vương miện của chính mình (mặc định cấp 1, không có vương miện). */
  me?: Pick<Person, "level" | "crown">
  /** Điểm, hạng và số ván của mình lúc vào màn hình (thẻ cấp; điểm này cũng là mốc trước ván ở kết quả). */
  progress?: { points?: number; rank?: number | null; games?: number; wins?: number }
  /** Bảng xếp hạng toàn hệ thống: các dòng từ hạng 1 và dòng của mình nếu ngoài top. */
  leaderboard?: { rows: FlashbackLeaderboardRow[]; me?: FlashbackLeaderboardRow | null }
  /** Lịch sử đấu của mình, mới nhất trước. */
  history?: FlashbackHistoryItem[]
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

export function listingRow(
  overrides: Partial<Omit<FlashbackRoomListItem, "owner">> & {
    id: string
    owner?: { name: string; avatar_url: string | null; level?: number; crown?: FlashbackCrown }
  },
): FlashbackRoomListItem {
  const { owner, ...rest } = overrides
  return {
    created_at: "2026-10-30T01:00:00.000Z",
    full: false,
    locked: false,
    max_players: 4,
    member_count: 1,
    minutes: 10,
    owner: { name: "Minh", avatar_url: null, level: 1, crown: null, ...owner },
    play_bars: 30,
    stake_xu: 100,
    status: "waiting",
    view_bars: 60,
    ...rest,
  }
}

// ------------------------------------------------------------------ bảng xếp hạng và lịch sử

export function leaderboardRow(
  overrides: Partial<FlashbackLeaderboardRow> & { rank: number; name: string },
): FlashbackLeaderboardRow {
  const points = overrides.points ?? Math.max(0, 200 - overrides.rank * 10)
  return {
    user_id: `rank-${overrides.rank}`,
    avatar_url: null,
    crown: overrides.rank <= 3 ? (overrides.rank as 1 | 2 | 3) : null,
    games: 20,
    is_me: false,
    level: levelOf(points),
    points,
    wins: 8,
    ...overrides,
  }
}

/** Một ván trong lịch sử đấu của mình: thắng giữa hai người, có hai lệnh. */
export function historyItem(overrides: Partial<FlashbackHistoryItem> & { match_id: string }): FlashbackHistoryItem {
  return {
    cash_percent: 42,
    end_date: "2026-03-31",
    ended_at: "2026-10-31T09:05:00.000Z",
    minutes: 10,
    orders: [
      { id: "o1", step: 3, side: "buy", qty: 100, price: "28800", fee: "4320", tax: "0", amount: "2880000" },
      { id: "o2", step: 12, side: "sell", qty: 100, price: "29500", fee: "4425", tax: "2950", amount: "2950000" },
    ],
    play_bars: 30,
    player_count: 2,
    players: [
      { user_id: "user-1", name: "Linh", avatar_url: null, crown: null, level: 3, is_me: true, pnl_pct: 0.0234, pnl_percent: 2.34, points: 10, rank: 1, xu: 100 },
      { user_id: "user-2", name: "Minh", avatar_url: null, crown: 2, level: 7, is_me: false, pnl_pct: -0.01, pnl_percent: -1, points: 3, rank: 2, xu: -100 },
    ],
    pnl_pct: 0.0234,
    pnl_percent: 2.34,
    points: 10,
    rank: 1,
    result: "win",
    room_id: "123456",
    stake_xu: 100,
    start_date: "2026-01-02",
    symbol: "VNM",
    view_bars: 60,
    xu: 100,
    ...overrides,
  }
}

// ------------------------------------------------------------------ backend

export function createFlashbackBackend(options: BackendOptions = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...options.room?.settings }
  const self: Person = { ...ME, ...options.me }
  const state = {
    listing: options.listing ?? ([] as FlashbackRoomListItem[]),
    passwords: options.passwords ?? ({} as Record<string, string>),
    notice: options.notice ?? null,
    /** Thông báo `notice` kế tiếp là do bị chủ phòng đuổi (cờ `kicked` của `rooms/me`). */
    kicked: false,
    indicators: options.indicators ?? INDICATOR_METAS,
    /** Điểm, hạng và số ván của mình trước ván đang chơi. */
    points: options.progress?.points ?? 0,
    rank: options.progress?.rank === undefined ? null : options.progress.rank,
    games: options.progress?.games ?? 0,
    wins: options.progress?.wins ?? 0,
    leaderboard: options.leaderboard ?? { rows: [] as FlashbackLeaderboardRow[], me: null },
    history: options.history ?? ([] as FlashbackHistoryItem[]),
    /** Biểu cảm đã gửi trong ván (của mình và của người khác); server giả giữ 4 giây như server thật. */
    reactions: [] as { id: string; user_id: string; emoji: string; at: number }[],
    reactionSeq: 0,
    chat: [] as FlashbackChatMessage[],
    chatMuted: new Set<string>(),
    chatSeq: 0,
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
      ready: new Set(options.room.ready ?? []),
      settings,
      password: options.room.password ?? null,
      chatEnabled: options.room.chatEnabled ?? true,
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

  /** Bảng xếp hạng đầy đủ của server giả (có % thật); chỉ dùng để chốt kết quả khi ván kết thúc. */
  function standings(room: RoomSim, match: MatchSim) {
    const mine = {
      avatar_url: null,
      ...badge(self),
      finished: match.finished,
      is_me: true,
      name: self.name,
      pnl_pct: pnlPercent(match) / 100,
      pnl_percent: pnlPercent(match),
      step: match.step,
      user_id: self.user_id,
    }
    const others = match.rivals.map((rival) => ({
      avatar_url: rival.person.avatar_url,
      ...badge(rival.person),
      finished: rival.finished,
      is_me: false,
      name: rival.person.name,
      pnl_pct: rival.pnl / 100,
      pnl_percent: rival.pnl,
      step: rival.step ?? (rival.finished ? room.settings.play_bars : 0),
      user_id: rival.person.user_id,
    }))
    return [mine, ...others]
  }

  /** Biểu cảm còn trong cửa sổ 4 giây của server thật. */
  function recentReactions() {
    const now = Date.now()
    state.reactions = state.reactions.filter((reaction) => now - reaction.at < 4_000)
    return state.reactions.map((reaction) => ({
      id: reaction.id,
      user_id: reaction.user_id,
      emoji: reaction.emoji,
      age_ms: now - reaction.at,
    }))
  }

  /** Như server thật (v2.1 §6.2): trong lúc chơi chỉ có phiên và trạng thái xong, % là null. */
  function players(room: RoomSim, match: MatchSim): FlashbackPlayer[] {
    const ended = match.status === "ended"
    return standings(room, match).map((player) =>
      ended ? player : { ...player, pnl_pct: null, pnl_percent: null },
    )
  }

  const playingCount = (room: RoomSim, match: MatchSim) =>
    match.status === "ended" ? 0 : standings(room, match).filter((player) => !player.finished).length

  function roomView(room: RoomSim): FlashbackRoom {
    return {
      auto_close_at: null,
      chat_enabled: room.chatEnabled,
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
        ...badge(person.user_id === ME.user_id ? self : person),
        is_me: person.user_id === ME.user_id,
        is_owner: person.user_id === room.owner.user_id,
        joined_at: "2026-10-30T01:00:00.000Z",
        name: person.name,
        // Như server: chủ phòng luôn được tính là sẵn sàng.
        ready: person.user_id === room.owner.user_id || room.ready.has(person.user_id),
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
      cards: [],
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
      players: players(room, match),
      playing_count: playingCount(room, match),
      pot_xu: room.settings.stake_xu * room.members.length,
      reactions: recentReactions(),
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
      players: players(room, match),
      playing_count: playingCount(room, match),
      reactions: recentReactions(),
      remaining_ms: match.status === "ended" ? 0 : remaining(match),
      room_id: room.code,
      server_now: "2026-10-30T01:00:30.000Z",
      started_at: "2026-10-30T01:00:00.000Z",
      status: match.status,
    }
  }

  function result(room: RoomSim, match: MatchSim): FlashbackMatchResult {
    if (match.status !== "ended") throw new ApiError("Ván chưa kết thúc", 409, "RESULT_NOT_READY")
    const everyone = standings(room, match).sort((left, right) => right.pnl_percent - left.pnl_percent)
    const best = everyone[0].pnl_percent
    const solo = everyone.length === 1
    const winners = everyone.filter((player) => Math.abs(player.pnl_percent - best) < 0.005)
    const stake = solo ? 0 : room.settings.stake_xu
    const pot = stake * everyone.length
    const refund = pot > 0 && best === 0 && winners.length === everyone.length
    const share = pot > 0 ? Math.floor(pot / winners.length) : 0
    const mineWon = winners.some((player) => player.is_me)
    const title = solo ? "Kết quả" : winners.length > 1 ? "Hoà" : mineWon ? "Bạn thắng" : `${winners[0].name} thắng`
    // Điểm ván (v2.1 §3.1): thắng +10 (kể cả hoà hạng 1), thua +3, chơi 1 mình 0.
    const earned = solo ? 0 : mineWon ? 10 : 3
    const total = state.points + earned
    const levelBefore = levelOf(state.points)
    const levelAfter = levelOf(total)
    return {
      end_date: "2026-03-31",
      end_reason: match.endReason,
      match_id: match.id,
      played_bars: Array.from({ length: room.settings.play_bars }, (_, index) => playedBar(room.settings.view_bars, index)),
      pot_xu: pot,
      progress: {
        level: levelAfter,
        level_base: levelBase(levelAfter),
        leveled_up: levelAfter > levelBefore,
        next_level_points: levelBase(levelAfter + 1),
        points: earned,
        previous_level: levelBefore,
        remaining_points: levelBase(levelAfter + 1) - total,
        total_points: total,
      },
      refund,
      room_id: room.code,
      rows: everyone.map((player) => {
        const isWinner = !solo && winners.includes(player)
        return {
          avatar_url: player.avatar_url,
          crown: player.crown,
          final_nav: String(Math.round(INITIAL_CASH * (1 + player.pnl_percent / 100))),
          is_me: player.is_me,
          is_winner: isWinner,
          level: player.level,
          name: player.name,
          pnl_pct: player.pnl_pct,
          pnl_percent: player.pnl_percent,
          points: solo ? 0 : isWinner ? 10 : 3,
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

  /** Lịch sử đã lọc như server: Thắng gồm cả Hoà, thời gian tính từ lúc ván kết thúc. */
  function historyFiltered(result: string, days: string): FlashbackHistoryItem[] {
    const since = days === "all" ? 0 : Date.now() - Number(days) * 86_400_000
    return state.history.filter((item) => {
      if (new Date(item.ended_at).getTime() < since) return false
      if (result === "win") return item.result === "win" || item.result === "tie"
      return result === "all" || item.result === result
    })
  }

  function normalize(path: string): string {
    return path
      .split("?")[0]
      .replace(/\/flashback\/rooms\/\d{6}/, "/flashback/rooms/:code")
      .replace(/\/flashback\/matches\/[0-9a-f-]{36}/, "/flashback/matches/:id")
  }

  /** Như server (v2.4 §3.4): tin của ván đang chơi chỉ tới khi mình đã tới phiên của tin. */
  function chatView(room: RoomSim): FlashbackChat {
    if (!room.chatEnabled) return { enabled: false, messages: [], muted: [] }
    const live = room.status === "playing" && room.match?.status === "playing" ? room.match : null
    const messages = state.chat.filter((message) => {
      if (state.chatMuted.has(message.user_id)) return false
      if (message.waiting || message.is_me || !live) return true
      return (live.finished ? room.settings.play_bars : live.step) >= message.phien
    })
    const muted = [...state.chatMuted].map((id) => ({
      user_id: id,
      name: room.members.find((person) => person.user_id === id)?.name ?? "Người chơi",
    }))
    return { enabled: true, messages, muted }
  }

  function pushChat(room: RoomSim, person: Person, text: string, phien?: number): FlashbackChatMessage {
    state.chatSeq += 1
    const live = room.status === "playing" && room.match ? room.match : null
    const message: FlashbackChatMessage = {
      created_at: new Date(Date.now()).toISOString(),
      id: `chat-${state.chatSeq}`,
      is_me: person.user_id === ME.user_id,
      name: person.name,
      phien: phien ?? (live ? live.step : 0),
      text,
      user_id: person.user_id,
      waiting: live === null,
    }
    state.chat.push(message)
    return message
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
        const kicked = state.kicked && notice !== null
        state.notice = null
        state.kicked = false
        return { room: state.room ? roomView(state.room) : null, notice, kicked }
      }
      case "POST /flashback/rooms": {
        const body = call.body as {
          view_bars: number
          play_bars: number
          minutes: number
          max_players: number
          stake_xu: number | null
          password: string | null
          chat_enabled?: boolean
        }
        state.room = {
          code: ROOM_CODE,
          owner: ME,
          members: [ME],
          ready: new Set(),
          settings: {
            view_bars: body.view_bars,
            play_bars: body.play_bars,
            minutes: body.minutes,
            max_players: body.max_players,
            stake_xu: body.stake_xu ?? 0,
          },
          password: body.password,
          chatEnabled: body.chat_enabled ?? true,
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
      case "POST /flashback/rooms/:code/ready": {
        const room = currentRoom()
        if (room.status !== "waiting") throw new ApiError("Phòng đang chơi", 409, "ROOM_PLAYING")
        const wanted = (call.body as { ready: boolean }).ready
        if (room.owner.user_id !== ME.user_id) {
          if (wanted) room.ready.add(ME.user_id)
          else room.ready.delete(ME.user_id)
        }
        return roomView(room)
      }
      case "GET /flashback/rooms/:code/chat":
        return chatView(currentRoom())
      case "POST /flashback/rooms/:code/chat":
        return pushChat(currentRoom(), ME, (call.body as { text: string }).text)
      case "POST /flashback/rooms/:code/chat/mute": {
        const body = call.body as { user_id: string; muted: boolean }
        if (body.muted) state.chatMuted.add(body.user_id)
        else state.chatMuted.delete(body.user_id)
        return { muted: chatView(currentRoom()).muted }
      }
      case "POST /flashback/rooms/:code/chat/report":
        return { reported: true }
      case "POST /flashback/rooms/:code/kick": {
        const room = currentRoom()
        const targetId = (call.body as { user_id: string }).user_id
        if (room.owner.user_id !== ME.user_id) throw new ApiError("Chỉ chủ phòng được mời người ra khỏi phòng", 403, "NOT_ROOM_OWNER")
        if (room.status !== "waiting") throw new ApiError("Đang chơi, chưa mời người ra khỏi phòng được", 409, "ROOM_PLAYING")
        if (targetId === ME.user_id) throw new ApiError("Bạn không thể tự mời mình ra khỏi phòng", 409, "FB_KICK_SELF")
        if (!room.members.some((person) => person.user_id === targetId)) {
          throw new ApiError("Người chơi này không còn ở trong phòng", 404, "FB_MEMBER_NOT_FOUND")
        }
        room.members = room.members.filter((person) => person.user_id !== targetId)
        room.ready.delete(targetId)
        return roomView(room)
      }
      case "POST /flashback/rooms/:code/start": {
        const room = currentRoom()
        if (room.owner.user_id !== ME.user_id) throw new ApiError("Chỉ chủ phòng được bắt đầu", 403, "NOT_ROOM_OWNER")
        const waiting = room.members.filter((person) => person.user_id !== room.owner.user_id && !room.ready.has(person.user_id)).length
        if (waiting > 0) throw new ApiError(`Còn ${waiting} người chơi chưa sẵn sàng`, 409, "FB_PLAYERS_NOT_READY")
        const removed = state.removedOnStart
        if (removed.length > 0) room.members = room.members.filter((person) => !removed.some((gone) => gone.user_id === person.user_id))
        room.status = "playing"
        room.ready.clear()
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
        room.ready.clear()
        return roomView(room)
      }
      case "GET /flashback/indicators":
        return { indicators: state.indicators }
      case "GET /flashback/me/level": {
        const level = levelOf(state.points)
        return {
          games: state.games,
          level,
          level_base: levelBase(level),
          next_level_points: levelBase(level + 1),
          points: state.points,
          rank: state.rank,
          remaining_points: levelBase(level + 1) - state.points,
          wins: state.wins,
        }
      }
      case "GET /flashback/leaderboard":
        return { rows: state.leaderboard.rows, me: state.leaderboard.me ?? null }
      case "GET /flashback/me/history": {
        const query = new URLSearchParams(call.path.split("?")[1] ?? "")
        const filtered = historyFiltered(query.get("result") ?? "all", query.get("days") ?? "all")
        const total = Math.min(filtered.length, 200)
        const pages = Math.max(1, Math.ceil(total / 20))
        const page = Math.max(1, Math.min(pages, Number(query.get("page") ?? 1) || 1))
        return { items: filtered.slice(0, 200).slice((page - 1) * 20, page * 20), page, page_size: 20, pages, total }
      }
      case "GET /flashback/me/history/summary": {
        const query = new URLSearchParams(call.path.split("?")[1] ?? "")
        const items = historyFiltered("all", query.get("days") ?? "all")
        const solo = items.filter((item) => item.result === "solo").length
        const multi = items.length - solo
        const wins = items.filter((item) => item.result === "win" || item.result === "tie").length
        const average = items.length ? items.reduce((sum, item) => sum + item.pnl_percent, 0) / items.length : 0
        const best = items.reduce<FlashbackHistoryItem | null>((top, item) => (!top || item.pnl_percent > top.pnl_percent ? item : top), null)
        return {
          avg_pnl_pct: average / 100,
          avg_pnl_percent: average,
          best_pnl_pct: best ? best.pnl_percent / 100 : null,
          best_pnl_percent: best ? best.pnl_percent : null,
          best_symbol: best ? best.symbol : null,
          games: items.length,
          multi_games: multi,
          points: items.reduce((sum, item) => sum + item.points, 0),
          solo_games: solo,
          win_rate: multi > 0 ? wins / multi : 0,
          wins,
          xu_net: items.reduce((sum, item) => sum + item.xu, 0),
        }
      }
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
        case "POST /flashback/matches/:id/reactions": {
          if (match.status === "ended") throw new ApiError("Ván đã kết thúc", 409, "MATCH_ENDED")
          const emoji = (call.body as { emoji?: string } | undefined)?.emoji ?? ""
          state.reactionSeq += 1
          const sent = { id: `reaction-${state.reactionSeq}`, user_id: ME.user_id, emoji, at: Date.now() }
          state.reactions.push(sent)
          return { id: sent.id, user_id: sent.user_id, emoji }
        }
        case "POST /flashback/matches/:id/finish": {
          if (match.status !== "ended" && match.step < room.settings.play_bars) {
            throw new ApiError("Chưa tới phiên cuối", 409, "NOT_AT_END")
          }
          match.finished = true
          settle(match)
          return { ended: match.status === "ended", me: me(room, match), playing_count: playingCount(room, match) }
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
      ready: new Set(),
      settings: {
        view_bars: row.view_bars,
        play_bars: row.play_bars,
        minutes: row.minutes,
        max_players: row.max_players,
        stake_xu: row.stake_xu,
      },
      password: secret ?? null,
      chatEnabled: true,
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
      room.ready.delete(userId)
    },
    /** Một người khác gửi tin chat; `phien` là phiên của họ lúc gửi (bỏ trống ở phòng chờ). */
    rivalChats: (person: Person, text: string, phien?: number) => pushChat(currentRoom(), person, text, phien),
    /** Người khác (không phải chủ phòng) bấm Sẵn sàng hoặc Huỷ sẵn sàng. */
    setReady: (userId: string, ready = true) => {
      const room = currentRoom()
      if (ready) room.ready.add(userId)
      else room.ready.delete(userId)
    },
    /** Chủ phòng khác đuổi mình: mình không còn trong phòng, `rooms/me` báo `kicked` kèm thông báo một lần. */
    kickedByOwner: () => {
      state.room = null
      state.notice = "Bạn đã bị chủ phòng mời ra khỏi phòng."
      state.kicked = true
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
      room.ready.clear()
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
    /** Một người khác gửi biểu cảm: tới máy này ở lần hỏi trạng thái kế tiếp, kèm tuổi `ageMs`. */
    rivalReacts: (userId: string, emoji: string, ageMs = 0) => {
      state.reactionSeq += 1
      state.reactions.push({ id: `reaction-${state.reactionSeq}`, user_id: userId, emoji, at: Date.now() - ageMs })
    },
    match: () => currentMatch().match,
  }
}

export type FlashbackBackend = ReturnType<typeof createFlashbackBackend>
