import { describe, expect, it } from "vitest"

import type { FlashbackPlayer, FlashbackPosition } from "./flashback-api"
import {
  ROOM_FORM_DEFAULTS,
  avatarTone,
  clockText,
  formatMatchDate,
  formatSignedMoney,
  formatSignedPercent,
  indicatorColor,
  initialOf,
  instanceShortLabel,
  isRoomCode,
  leaderIds,
  maxBuyQty,
  orderCashChange,
  orderError,
  orderPreview,
  sellableQty,
  sessionLabel,
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
      body: { view_bars: 60, play_bars: 30, minutes: 10, max_players: 4, stake_xu: 100, password: null },
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
    expect(failure({ maxPlayers: "5" })).toBe("Số người tối đa phải từ 1 đến 4")
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

  it("1 người: ván chơi một mình không cược, ô cược bị bỏ qua và gửi stake_xu null", () => {
    const checked = validateRoomForm(form({ maxPlayers: "1", stake: "7" }), 0)
    expect(checked).toEqual({
      ok: true,
      body: { view_bars: 60, play_bars: 30, minutes: 10, max_players: 1, stake_xu: null, password: null },
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

describe("đồng hồ, dẫn đầu, nhãn trục và ngày", () => {
  it("clockText: mm:ss, làm tròn lên và không bao giờ âm", () => {
    expect(clockText(600_000)).toBe("10:00")
    expect(clockText(59_000)).toBe("00:59")
    expect(clockText(59_001)).toBe("01:00")
    expect(clockText(0)).toBe("00:00")
    expect(clockText(-5_000)).toBe("00:00")
    expect(clockText(3_599_000)).toBe("59:59")
  })

  const player = (id: string, pnl: number): FlashbackPlayer => ({
    avatar_url: null,
    finished: false,
    is_me: false,
    name: id,
    pnl_pct: pnl / 100,
    pnl_percent: pnl,
    user_id: id,
  })

  it("người dẫn đầu chỉ có nghĩa từ hai người; hoà trong 0,005 điểm % thì cùng dẫn đầu", () => {
    expect(leaderIds([player("a", 5)]).size).toBe(0)
    expect([...leaderIds([player("a", 5), player("b", 3)])]).toEqual(["a"])
    expect([...leaderIds([player("a", 0), player("b", 0)])].sort()).toEqual(["a", "b"])
    expect([...leaderIds([player("a", 1.2), player("b", 1.2004), player("c", -2)])].sort()).toEqual(["a", "b"])
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
