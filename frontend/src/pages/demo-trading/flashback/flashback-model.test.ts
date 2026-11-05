import { describe, expect, it } from "vitest"

import type { FlashbackHistoryItem, FlashbackPlayer, FlashbackPosition, FlashbackResultProgress } from "./flashback-api"
import {
  HISTORY_DAY_FILTERS,
  HISTORY_RESULT_FILTERS,
  HISTORY_RESULT_LABEL,
  LEADERBOARD_LIMIT,
  LEADERBOARD_NOTE,
  QTY_QUICK_ADD,
  REACTION_BUBBLE_MS,
  REACTION_COOLDOWN_MS,
  REACTION_EMOJIS,
  REACTION_TOO_FAST,
  ROOM_FORM_DEFAULTS,
  ROOM_PLAYER_OPTIONS,
  addQty,
  avatarTone,
  clockText,
  finishedCount,
  formatDateTime,
  formatMatchDate,
  formatSignedMoney,
  formatSignedPercent,
  historyRankLine,
  historyRoomLine,
  historyXuLine,
  indicatorColor,
  initialOf,
  instanceShortLabel,
  isRoomCode,
  leaderIds,
  levelPercent,
  maxBuyQty,
  orderCashChange,
  orderError,
  orderPlayers,
  orderPreview,
  playerStatus,
  pointsLabel,
  progressLine,
  roomSlotCount,
  sellableQty,
  sessionLabel,
  signTone,
  validateRoomForm,
  type RoomForm,
} from "./flashback-model"

const form = (overrides: Partial<RoomForm> = {}): RoomForm => ({ ...ROOM_FORM_DEFAULTS, ...overrides })

function failure(overrides: Partial<RoomForm>, balance: number | null = null): string {
  const checked = validateRoomForm(form(overrides), balance)
  if (checked.ok) throw new Error("Hộp tạo phòng đáng lẽ phải báo lỗi")
  return checked.message
}

describe("validateRoomForm (spec §3)", () => {
  it("giá trị mặc định hợp lệ: 60 xem, 30 chơi, 10 phút, 4 người, cược 100, không mật khẩu", () => {
    expect(validateRoomForm(form(), null)).toEqual({
      ok: true,
      body: { view_bars: 60, play_bars: 30, minutes: 10, max_players: 4, stake_xu: 100, password: null, chat_enabled: true },
    })
  })

  it("báo đúng một dòng lỗi theo thứ tự của server", () => {
    expect(failure({ viewBars: "29" })).toBe("Số phiên xem phải từ 30 đến 120")
    expect(failure({ viewBars: "121" })).toBe("Số phiên xem phải từ 30 đến 120")
    expect(failure({ viewBars: "" })).toBe("Số phiên xem phải từ 30 đến 120")
    expect(failure({ viewBars: "45.5" })).toBe("Số phiên xem phải từ 30 đến 120")
    expect(failure({ playBars: "29" })).toBe("Số phiên chơi phải từ 30 đến 120")
    expect(failure({ playBars: "200" })).toBe("Số phiên chơi phải từ 30 đến 120")
    expect(failure({ minutes: "12" })).toBe("Thời gian chơi phải là 5, 10, 15, 20, 30, 45 hoặc 60 phút")
    expect(failure({ maxPlayers: "31" })).toBe("Số người tối đa phải từ 1 đến 30")
    expect(failure({ maxPlayers: "0" })).toBe("Số người tối đa phải từ 1 đến 30")
    expect(failure({ maxPlayers: "2.5" })).toBe("Số người tối đa phải từ 1 đến 30")
    expect(failure({ stake: "5" })).toBe("Số xu cược tối thiểu 10, là bội số của 10")
    expect(failure({ stake: "15" })).toBe("Số xu cược tối thiểu 10, là bội số của 10")
    expect(failure({ stake: "" })).toBe("Số xu cược tối thiểu 10, là bội số của 10")
    expect(failure({ password: "abc" })).toBe("Mật khẩu từ 4 đến 12 ký tự")
    expect(failure({ password: "a".repeat(13) })).toBe("Mật khẩu từ 4 đến 12 ký tự")
    // Nhiều lỗi cùng lúc: chỉ báo lỗi đầu tiên.
    expect(failure({ viewBars: "1", playBars: "1", stake: "3", password: "x" })).toBe("Số phiên xem phải từ 30 đến 120")
  })

  it("biên hợp lệ: 30 và 120 phiên, cược 10, mật khẩu 4 và 12 ký tự", () => {
    const checked = validateRoomForm(form({ viewBars: "30", playBars: "120", stake: "10", password: "abcd" }), null)
    expect(checked.ok && checked.body).toMatchObject({ view_bars: 30, play_bars: 120, stake_xu: 10, password: "abcd" })
    expect(validateRoomForm(form({ password: "a".repeat(12) }), null).ok).toBe(true)
  })

  it("báo Bạn chỉ có n xu khi cược vượt số xu đang có, và bỏ qua khi chưa biết số xu", () => {
    expect(failure({ stake: "500" }, 120)).toBe("Bạn chỉ có 120 xu")
    expect(failure({ stake: "2000" }, 1000)).toBe("Bạn chỉ có 1.000 xu")
    expect(validateRoomForm(form({ stake: "500" }), null).ok).toBe(true)
    expect(validateRoomForm(form({ stake: "120" }), 120).ok).toBe(true)
  })

  it("v2.1 §1: chọn được từ 1 đến 30 người, mặc định 4", () => {
    expect(ROOM_PLAYER_OPTIONS[0]).toBe(1)
    expect(ROOM_PLAYER_OPTIONS[ROOM_PLAYER_OPTIONS.length - 1]).toBe(30)
    expect(ROOM_PLAYER_OPTIONS).toHaveLength(30)
    expect(ROOM_FORM_DEFAULTS.maxPlayers).toBe("4")
    for (const count of [2, 5, 9, 29, 30]) {
      const checked = validateRoomForm(form({ maxPlayers: String(count) }), null)
      expect(checked.ok && checked.body.max_players).toBe(count)
    }
  })

  it("v2.1 §1: phòng chờ có số ô bằng số người tối đa, tối thiểu 4 ô", () => {
    expect([1, 2, 4, 5, 8, 9, 30].map(roomSlotCount)).toEqual([4, 4, 4, 5, 8, 9, 30])
  })

  it("1 người: ván chơi một mình không cược, ô cược bị bỏ qua và gửi stake_xu null", () => {
    const checked = validateRoomForm(form({ maxPlayers: "1", stake: "7" }), 0)
    expect(checked).toEqual({
      ok: true,
      body: { view_bars: 60, play_bars: 30, minutes: 10, max_players: 1, stake_xu: null, password: null, chat_enabled: true },
    })
  })

  it("mật khẩu được cắt khoảng trắng hai đầu", () => {
    const checked = validateRoomForm(form({ password: "  1234  " }), null)
    expect(checked.ok && checked.body.password).toBe("1234")
  })
})

describe("isRoomCode", () => {
  it("chỉ nhận đúng 6 chữ số", () => {
    expect(isRoomCode("482913")).toBe(true)
    expect(isRoomCode("48291")).toBe(false)
    expect(isRoomCode("4829134")).toBe(false)
    expect(isRoomCode("48291a")).toBe(false)
    expect(isRoomCode("")).toBe(false)
    expect(isRoomCode(" 482913")).toBe(false)
  })
})

describe("tiền, phí và thuế của lệnh", () => {
  it("Mua tối đa dùng cùng công thức số nguyên với server", () => {
    expect(maxBuyQty(10_000_000, 28_800)).toBe(346)
    expect(maxBuyQty(0, 28_800)).toBe(0)
    expect(maxBuyQty(10_000_000, 0)).toBe(0)
    expect(maxBuyQty(28_000, 28_800)).toBe(0)
  })

  it("mua 150 cp ở 28.800: giá trị 4.320.000, phí 6.480, tổng trả 4.326.480", () => {
    expect(orderPreview("buy", 150, 28_800)).toEqual({ value: 4_320_000, fee: 6_480, tax: 0, total: 4_326_480 })
  })

  it("bán 100 cp ở 28.800: phí 0,15% và thuế 0,1%, tiền nhận về là phần còn lại", () => {
    expect(orderPreview("sell", 100, 28_800)).toEqual({ value: 2_880_000, fee: 4_320, tax: 2_880, total: 2_872_800 })
  })

  it("dòng tiền mặt của lệnh đã khớp: mua trừ giá trị và phí, bán cộng giá trị trừ phí và thuế", () => {
    expect(orderCashChange({ side: "buy", amount: "4320000", fee: "6480", tax: "0" })).toBe(-4_326_480)
    expect(orderCashChange({ side: "sell", amount: "2880000", fee: "4320", tax: "2880" })).toBe(2_872_800)
    expect(formatSignedMoney(-4_326_480)).toBe("−4.326.480")
    expect(formatSignedMoney(2_872_800)).toBe("+2.872.800")
    expect(formatSignedMoney(0)).toBe("0")
    expect(formatSignedMoney(null)).toBe("—")
  })

  it("định dạng phần trăm có dấu theo kiểu Việt Nam", () => {
    expect(formatSignedPercent(2.5)).toBe("+2,50%")
    expect(formatSignedPercent(-0.75)).toBe("−0,75%")
    expect(formatSignedPercent(0)).toBe("0,00%")
    expect(formatSignedPercent(undefined)).toBe("—")
  })
})

describe("orderError: ba câu của spec", () => {
  const settled: FlashbackPosition = {
    pnl_pct: 0,
    price: "28800",
    qty: 100,
    sellable_step: 2,
    sessions_left: 0,
    status: "settled",
    step: 0,
    value: "2880000",
  }
  const pending: FlashbackPosition = { ...settled, qty: 50, sellable_step: 9, sessions_left: 2, status: "pending" }

  it("mua quá tiền mặt thì Không đủ tiền mặt", () => {
    expect(orderError("buy", 347, 28_800, 10_000_000, [], 0)).toBe("Không đủ tiền mặt")
    expect(orderError("buy", 346, 28_800, 10_000_000, [], 0)).toBeNull()
  })

  it("bán cổ phiếu chưa đủ T+2 thì báo chưa bán được, bán quá số đang có thì Vượt số cổ phiếu đang có", () => {
    expect(orderError("sell", 120, 28_800, 0, [settled, pending], 3)).toBe("Cổ phiếu mua chưa đủ T+2, chưa bán được")
    expect(orderError("sell", 140, 28_800, 0, [settled, pending], 3)).toBe("Cổ phiếu mua chưa đủ T+2, chưa bán được")
    expect(orderError("sell", 151, 28_800, 0, [settled, pending], 3)).toBe("Vượt số cổ phiếu đang có")
    expect(orderError("sell", 100, 28_800, 0, [settled, pending], 3)).toBeNull()
  })

  it("chưa nhập số cổ phiếu thì không báo lỗi", () => {
    expect(orderError("buy", 0, 28_800, 0, [], 0)).toBeNull()
    expect(sellableQty([settled, pending], 3)).toBe(100)
    expect(sellableQty([settled, pending], 9)).toBe(150)
  })
})

describe("addQty: ô cộng nhanh số cổ phiếu (v2.1 §9)", () => {
  it("hai ô +10 và +100", () => {
    expect([...QTY_QUICK_ADD]).toEqual([10, 100])
  })

  it("cộng thêm vào số đang có, ô trống coi như 0: +10, +10 ra 20, +100 ra 120", () => {
    expect(addQty("", 10)).toBe("10")
    expect(addQty(addQty("", 10), 10)).toBe("20")
    expect(addQty("20", 100)).toBe("120")
  })

  it("giá trị không phải số hoặc âm coi như 0, số lẻ lấy phần nguyên", () => {
    expect(addQty("abc", 100)).toBe("100")
    expect(addQty("-5", 10)).toBe("10")
    expect(addQty("7.9", 10)).toBe("17")
  })
})

describe("đồng hồ, dẫn đầu, nhãn trục và ngày", () => {
  it("clockText: mm:ss, làm tròn lên và không bao giờ âm", () => {
    expect(clockText(600_000)).toBe("10:00")
    expect(clockText(59_000)).toBe("00:59")
    expect(clockText(59_001)).toBe("01:00")
    expect(clockText(0)).toBe("00:00")
    expect(clockText(-5_000)).toBe("00:00")
    expect(clockText(3_599_000)).toBe("59:59")
  })

  const player = (id: string, pnl: number | null, overrides: Partial<FlashbackPlayer> = {}): FlashbackPlayer => ({
    avatar_url: null,
    crown: null,
    finished: false,
    is_me: false,
    level: 1,
    name: id,
    pnl_pct: pnl === null ? null : pnl / 100,
    pnl_percent: pnl,
    step: 0,
    user_id: id,
    ...overrides,
  })

  it("người dẫn đầu chỉ có nghĩa từ hai người; hoà trong 0,005 điểm % thì cùng dẫn đầu", () => {
    expect(leaderIds([player("a", 5)]).size).toBe(0)
    expect([...leaderIds([player("a", 5), player("b", 3)])]).toEqual(["a"])
    expect([...leaderIds([player("a", 0), player("b", 0)])].sort()).toEqual(["a", "b"])
    expect([...leaderIds([player("a", 1.2), player("b", 1.2004), player("c", -2)])].sort()).toEqual(["a", "b"])
  })

  it("trong lúc chơi server không trả % nên không ai dẫn đầu (v2.1 §6.2)", () => {
    expect(leaderIds([player("a", null), player("b", null)]).size).toBe(0)
    expect(leaderIds([player("a", 5), player("b", null)]).size).toBe(0)
  })

  it("playerStatus: Đang chơi · phiên/tổng, ✓ Đã xong, và chỉ khi hết ván mới là % lợi nhuận", () => {
    expect(playerStatus(player("a", null, { step: 7 }), 30)).toEqual({ kind: "playing", text: "Đang chơi · 7/30" })
    expect(playerStatus(player("a", null, { step: 0 }), 45)).toEqual({ kind: "playing", text: "Đang chơi · 0/45" })
    expect(playerStatus(player("a", null, { step: 30, finished: true }), 30)).toEqual({ kind: "done", text: "✓ Đã xong" })
    expect(playerStatus(player("a", 2.5, { finished: true }), 30)).toEqual({ kind: "result", text: "+2,50%", percent: 2.5 })
    expect(playerStatus(player("a", -1, { finished: true }), 30)).toMatchObject({ kind: "result", text: "−1,00%" })
    expect(playerStatus(player("a", 0), 30)).toMatchObject({ kind: "result", text: "0,00%" })
  })

  it("sessionLabel: n phiên trước, Phiên 0 ở nến xem cuối, rồi Phiên 1 trở đi", () => {
    expect(sessionLabel(0, 60)).toBe("59 phiên trước")
    expect(sessionLabel(58, 60)).toBe("1 phiên trước")
    expect(sessionLabel(59, 60)).toBe("Phiên 0")
    expect(sessionLabel(60, 60)).toBe("Phiên 1")
    expect(sessionLabel(89, 60)).toBe("Phiên 30")
  })

  it("formatMatchDate đổi ngày ISO sang dd/mm/yyyy không lệch múi giờ", () => {
    expect(formatMatchDate("2026-01-31")).toBe("31/01/2026")
    expect(formatMatchDate("2026-12-01T17:00:00.000Z")).toBe("01/12/2026")
    expect(formatMatchDate("không phải ngày")).toBe("không phải ngày")
  })
})

describe("avatar và chỉ báo", () => {
  it("initialOf lấy chữ cái đầu của tên, hoa, và có dự phòng", () => {
    expect(initialOf("linh")).toBe("L")
    expect(initialOf("Hòa")).toBe("H")
    expect(initialOf("  ?x")).toBe("X")
    expect(initialOf("")).toBe("?")
  })

  it("avatarTone ổn định theo từng người và chỉ dùng màu biểu đồ", () => {
    expect(avatarTone("user-1")).toBe(avatarTone("user-1"))
    for (const seed of ["user-1", "user-2", "user-3", "user-4", "a", "b"]) {
      expect(avatarTone(seed)).toMatch(/^bg-chart-\d\/25$/)
    }
  })

  it("indicatorColor đổi màu theo từng instance cùng chỉ báo và quay vòng", () => {
    expect(indicatorColor("ma", 0)).toBe("var(--chart-2)")
    expect(indicatorColor("ma", 1)).toBe("var(--chart-8)")
    expect(indicatorColor("ma", 4)).toBe("var(--chart-2)")
    expect(indicatorColor("khong-co", 3)).toBe("var(--chart-1)")
  })

  it("instanceShortLabel ghép tên với tham số, bỏ ngưỡng", () => {
    expect(instanceShortLabel({ id: "ma", params: { period: 20 } })).toBe("ma 20")
    expect(instanceShortLabel({ id: "rsi", params: { period: 14, level: { lower: 30, upper: 70 } } })).toBe("rsi 14")
    expect(instanceShortLabel({ id: "obv", params: {} })).toBe("obv")
  })
})

describe("cấp và điểm (v2.1 §3)", () => {
  const progress = (overrides: Partial<FlashbackResultProgress> = {}): FlashbackResultProgress => ({
    level: 3,
    level_base: 50,
    leveled_up: false,
    next_level_points: 90,
    points: 10,
    previous_level: 3,
    remaining_points: 15,
    total_points: 75,
    ...overrides,
  })

  it("levelPercent: phần đã đi được trong cấp hiện tại, chặn trong 0 đến 100", () => {
    expect(levelPercent({ points: 50, level_base: 50, next_level_points: 90 })).toBe(0)
    expect(levelPercent({ points: 70, level_base: 50, next_level_points: 90 })).toBe(50)
    expect(levelPercent({ points: 89, level_base: 50, next_level_points: 90 })).toBe(98)
    expect(levelPercent({ points: 120, level_base: 50, next_level_points: 90 })).toBe(100)
    expect(levelPercent({ points: 10, level_base: 50, next_level_points: 90 })).toBe(0)
    expect(levelPercent({ points: 5, level_base: 0, next_level_points: 0 })).toBe(0)
  })

  it('pointsLabel: "+10 điểm" và "+3 điểm"; ván chơi 1 mình hoặc 0 điểm thì để trống', () => {
    expect(pointsLabel(10, false)).toBe("+10 điểm")
    expect(pointsLabel(3, false)).toBe("+3 điểm")
    expect(pointsLabel(10, true)).toBe("")
    expect(pointsLabel(0, false)).toBe("")
  })

  it("progressLine: ba kiểu dòng tiến độ của mình ở cửa sổ kết quả", () => {
    expect(progressLine({ solo: false, progress: progress() })).toEqual({
      kind: "progress",
      text: "Điểm +10 · Cấp 3 · 75 điểm · còn 15 điểm lên cấp 4",
    })
    expect(
      progressLine({
        solo: false,
        progress: progress({ level: 4, level_base: 90, leveled_up: true, previous_level: 3, remaining_points: 50, total_points: 95 }),
      }),
    ).toEqual({ kind: "level-up", text: "🎉 Lên cấp 4! Bạn có 95 điểm." })
    expect(progressLine({ solo: true, progress: progress({ points: 0 }) })).toEqual({
      kind: "solo",
      text: "Chơi 1 mình không tính điểm cấp.",
    })
    // Ván chơi 1 mình không bao giờ báo lên cấp, dù số liệu của server có gì.
    expect(progressLine({ solo: true, progress: progress({ leveled_up: true }) }).kind).toBe("solo")
  })

  it("bảng xếp hạng: dòng luật điểm và giới hạn top 50", () => {
    expect(LEADERBOARD_NOTE).toBe("Thắng +10 điểm · Thua +3 điểm · Chơi 1 mình không tính điểm")
    expect(LEADERBOARD_LIMIT).toBe(50)
  })
})

describe("thanh người chơi (v2.1 §6.1)", () => {
  const row = (id: string, isMe: boolean, finished = false) => ({ id, is_me: isMe, finished })

  it("orderPlayers: mình đứng đầu, người còn lại giữ nguyên thứ tự vào phòng và không sửa mảng gốc", () => {
    const source = [row("a", false), row("b", false), row("me", true), row("c", false)]
    expect(orderPlayers(source).map((player) => player.id)).toEqual(["me", "a", "b", "c"])
    expect(source.map((player) => player.id)).toEqual(["a", "b", "me", "c"])
    expect(orderPlayers([row("a", false), row("b", false)]).map((player) => player.id)).toEqual(["a", "b"])
    expect(orderPlayers([])).toEqual([])
  })

  it("finishedCount: số người đã bấm Hoàn thành", () => {
    expect(finishedCount([])).toBe(0)
    expect(finishedCount([row("a", false), row("b", true, true), row("c", false, true)])).toBe(2)
  })
})

describe("biểu cảm (v2.1 §6.4)", () => {
  it("12 biểu cảm theo đúng thứ tự bảng chọn, không trùng nhau", () => {
    expect([...REACTION_EMOJIS]).toEqual(["😂", "😎", "🚀", "📉", "😭", "🔥", "👏", "🤡", "💸", "🙏", "😱", "🤑"])
    expect(new Set(REACTION_EMOJIS).size).toBe(12)
  })

  it("mỗi người 1 biểu cảm mỗi 1,5 giây; bong bóng hiện khoảng 2,5 giây; câu báo gửi quá nhanh", () => {
    expect(REACTION_COOLDOWN_MS).toBe(1_500)
    expect(REACTION_BUBBLE_MS).toBe(2_500)
    expect(REACTION_TOO_FAST).toBe("Từ từ thôi 😄")
  })
})

describe("lịch sử đấu (v2.1 §5)", () => {
  const item = (overrides: Partial<FlashbackHistoryItem> = {}) => ({
    room_id: "123456",
    player_count: 4,
    view_bars: 60,
    play_bars: 30,
    minutes: 10,
    result: "win" as const,
    rank: 1,
    stake_xu: 100,
    xu: 300,
    ...overrides,
  })

  it("bộ lọc kết quả và thời gian đúng nhãn của spec", () => {
    expect(HISTORY_RESULT_FILTERS.map((filter) => [filter.id, filter.label])).toEqual([
      ["all", "Tất cả"],
      ["win", "Thắng"],
      ["lose", "Thua"],
      ["solo", "Chơi 1 mình"],
    ])
    expect(HISTORY_DAY_FILTERS.map((filter) => [filter.id, filter.label])).toEqual([
      ["7", "7 ngày"],
      ["30", "30 ngày"],
      ["all", "Tất cả"],
    ])
    expect(HISTORY_RESULT_LABEL).toEqual({ win: "Thắng", tie: "Hoà", lose: "Thua", solo: "Chơi 1 mình" })
  })

  it("formatDateTime: dd/mm/yyyy hh:mm theo giờ máy, và giữ nguyên chuỗi không phải ngày", () => {
    expect(formatDateTime(new Date(2026, 9, 31, 9, 5).toISOString())).toBe("31/10/2026 09:05")
    expect(formatDateTime(new Date(2026, 0, 2, 23, 59).toISOString())).toBe("02/01/2026 23:59")
    expect(formatDateTime("không phải ngày")).toBe("không phải ngày")
  })

  it('historyRoomLine: "Phòng {ID} · {n} người · {xem}/{chơi} phiên · {m} phút"', () => {
    expect(historyRoomLine(item())).toBe("Phòng 123456 · 4 người · 60/30 phiên · 10 phút")
    expect(historyRoomLine(item({ room_id: "000987", player_count: 1, view_bars: 45, play_bars: 40, minutes: 5 }))).toBe(
      "Phòng 000987 · 1 người · 45/40 phiên · 5 phút",
    )
  })

  it('historyRankLine: "Hạng {h}/{n}"; ván chơi 1 mình bỏ trống', () => {
    expect(historyRankLine(item({ rank: 2, player_count: 5, result: "lose" }))).toBe("Hạng 2/5")
    expect(historyRankLine(item({ rank: 1, player_count: 3, result: "tie" }))).toBe("Hạng 1/3")
    expect(historyRankLine(item({ rank: 1, player_count: 1, result: "solo" }))).toBe("")
  })

  it('historyXuLine: "+x xu", "−x xu" hoặc "Không cược"', () => {
    expect(historyXuLine(item({ xu: 300 }))).toBe("+300 xu")
    expect(historyXuLine(item({ xu: -100 }))).toBe("−100 xu")
    expect(historyXuLine(item({ xu: 1_500, stake_xu: 1_000 }))).toBe("+1.500 xu")
    expect(historyXuLine(item({ xu: 0, stake_xu: 0 }))).toBe("Không cược")
  })

  it("signTone: lãi xanh, lỗ đỏ, bằng 0 hoặc không có thì chữ thường", () => {
    expect(signTone(2.5)).toBe("up")
    expect(signTone(-0.01)).toBe("down")
    expect(signTone(0)).toBe("flat")
    expect(signTone(null)).toBe("flat")
    expect(signTone(undefined)).toBe("flat")
    expect(signTone(Number.NaN)).toBe("flat")
  })
})
