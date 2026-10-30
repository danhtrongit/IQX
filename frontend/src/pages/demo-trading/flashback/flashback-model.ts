/**
 * Quy tắc thuần của Flashback v2 "Phòng chơi" (spec v2 §3, §6, §7).
 *
 * Không có mạng, không có React: mọi phép tính tiền, phí, thuế, kiểm tra hộp tạo phòng, đồng hồ và
 * định dạng ngày đều ở đây để màn hình chỉ hiển thị.
 */
import type {
  FlashbackCreateRoomBody,
  FlashbackIndicatorInstance,
  FlashbackIndicatorMeta,
  FlashbackOrder,
  FlashbackOrderSide,
  FlashbackPlayer,
  FlashbackPosition,
} from "./flashback-api"

/** Vốn mỗi người mỗi ván (§6.3). */
export const FLASHBACK_INITIAL_CASH = 10_000_000
/** Phí 0,15% giá trị lệnh, cả khi mua lẫn khi bán. */
export const FLASHBACK_FEE_RATE = 0.0015
/** Thuế 0,1% giá trị lệnh, chỉ khi bán. */
export const FLASHBACK_TAX_RATE = 0.001
/** Còn dưới 1 phút thì đồng hồ chuyển màu đỏ (§6.1). */
export const FLASHBACK_LOW_TIME_MS = 60_000

const numberFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })
const moneyFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })

export function formatNumber(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : numberFormat.format(value)
}

export function formatMoney(value: number | string | null | undefined): string {
  const amount = typeof value === "string" ? Number(value) : value
  return amount == null || !Number.isFinite(amount) ? "—" : moneyFormat.format(amount)
}

/** Số tiền có dấu: "+1.000" khi nhận về, "−1.000" khi trả ra. */
export function formatSignedMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const sign = value > 0 ? "+" : value < 0 ? "−" : ""
  return `${sign}${formatMoney(Math.abs(value))}`
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return `${value.toFixed(digits).replace(".", ",")}%`
}

export function formatSignedPercent(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const sign = value > 0 ? "+" : value < 0 ? "−" : ""
  return `${sign}${formatPercent(Math.abs(value), digits)}`
}

/** Phí 0,15% theo điểm cơ bản, như server (`FLASHBACK_FEE_BPS`). */
const FLASHBACK_FEE_BPS = 15n
/** Thuế 0,1% theo điểm cơ bản, như server (`FLASHBACK_TAX_BPS`). */
const FLASHBACK_TAX_BPS = 10n

/** Làm tròn theo điểm cơ bản, nửa lên: giống `roundBasisPoints` của server. */
function roundBasisPoints(amount: bigint, bps: bigint): bigint {
  return (amount * bps + 5_000n) / 10_000n
}

function toWholeDong(value: number): bigint {
  return Number.isFinite(value) && value > 0 ? BigInt(Math.floor(value)) : 0n
}

/**
 * "Mua tối đa": cùng công thức số nguyên với server
 * (`backend/src/modules/flashback/flashback.service.ts`): `floor(cash × 10000 / (price × 10015))`,
 * rồi chỉnh ±1 theo phí làm tròn của lệnh mua.
 */
export function maxBuyQty(cash: number, price: number): number {
  const money = toWholeDong(cash)
  const unit = toWholeDong(price)
  if (unit <= 0n || money <= 0n) return 0
  const affordable = (qty: bigint) => unit * qty + roundBasisPoints(unit * qty, FLASHBACK_FEE_BPS) <= money
  let qty = (money * 10_000n) / (unit * (10_000n + FLASHBACK_FEE_BPS))
  while (qty > 0n && !affordable(qty)) qty -= 1n
  while (affordable(qty + 1n)) qty += 1n
  return Number(qty)
}

/** "Bán được": tổng cổ phiếu đã về (đủ T+2) của người chơi. */
export function sellableQty(positions: readonly FlashbackPosition[], step: number): number {
  return positions.reduce((sum, position) => (position.sellable_step <= step ? sum + position.qty : sum), 0)
}

/** Tổng cổ phiếu đang giữ, kể cả phần chưa về. */
function heldQty(positions: readonly FlashbackPosition[]): number {
  return positions.reduce((sum, position) => sum + position.qty, 0)
}

export type OrderPreview = {
  value: number
  fee: number
  tax: number
  /** Tiền phải trả khi mua, tiền nhận về khi bán. */
  total: number
}

/** Giá trị lệnh, phí, thuế và tổng tiền của một lệnh. */
export function orderPreview(side: FlashbackOrderSide, qty: number, price: number): OrderPreview {
  const value = qty * price
  const amount = toWholeDong(value)
  const fee = Number(roundBasisPoints(amount, FLASHBACK_FEE_BPS))
  const tax = side === "sell" ? Number(roundBasisPoints(amount, FLASHBACK_TAX_BPS)) : 0
  return { value, fee, tax, total: side === "buy" ? value + fee : value - fee - tax }
}

/** Dòng tiền mặt của một lệnh đã khớp: mua trừ (giá trị + phí), bán cộng (giá trị trừ phí và thuế). */
export function orderCashChange(order: Pick<FlashbackOrder, "side" | "amount" | "fee" | "tax">): number {
  const amount = Number(order.amount)
  const fee = Number(order.fee)
  const tax = Number(order.tax)
  return order.side === "buy" ? -(amount + fee) : amount - fee - tax
}

/** Lý do một lệnh không được đặt, theo đúng ba câu của spec v1.1 §2.6. */
export function orderError(
  side: FlashbackOrderSide,
  qty: number,
  price: number,
  cash: number,
  positions: readonly FlashbackPosition[],
  step: number,
): string | null {
  if (qty < 1) return null
  if (side === "buy") {
    return qty > maxBuyQty(cash, price) ? "Không đủ tiền mặt" : null
  }
  const held = heldQty(positions)
  const sellable = sellableQty(positions, step)
  if (qty > sellable) {
    return qty <= held ? "Cổ phiếu mua chưa đủ T+2, chưa bán được" : "Vượt số cổ phiếu đang có"
  }
  return null
}

/**
 * Nhãn phiên của một nến: phần xem ghi "n phiên trước", nến xem cuối là "Phiên 0", phần chơi là
 * "Phiên 1".."Phiên n".
 */
export function sessionLabel(index: number, viewBars: number): string {
  if (index < viewBars - 1) return `${viewBars - 1 - index} phiên trước`
  if (index === viewBars - 1) return "Phiên 0"
  return `Phiên ${index - viewBars + 1}`
}

// ------------------------------------------------------------------ sảnh và hộp tạo phòng

export const ROOM_CODE_ERROR = "ID phòng gồm 6 chữ số"

/** ID phòng là đúng 6 chữ số (§2.1). */
export function isRoomCode(value: string): boolean {
  return /^\d{6}$/.test(value)
}

export const ROOM_BARS_MIN = 30
export const ROOM_BARS_MAX = 120
export const ROOM_MINUTE_OPTIONS = [5, 10, 15, 20, 30, 45, 60] as const
export const ROOM_PLAYER_OPTIONS = [1, 2, 3, 4] as const
export const ROOM_STAKE_MIN = 10
export const ROOM_STAKE_STEP = 10
export const ROOM_PASSWORD_MIN = 4
export const ROOM_PASSWORD_MAX = 12

/** Giá trị trong hộp tạo phòng: ô nhập giữ chuỗi thô, chỉ chốt thành số khi bấm "Tạo phòng". */
export type RoomForm = {
  viewBars: string
  playBars: string
  minutes: string
  maxPlayers: string
  stake: string
  password: string
}

/** Mặc định của hộp tạo phòng (§3). */
export const ROOM_FORM_DEFAULTS: RoomForm = {
  viewBars: "60",
  playBars: "30",
  minutes: "10",
  maxPlayers: "4",
  stake: "100",
  password: "",
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}

/**
 * Kiểm tra hộp tạo phòng theo §3, báo đúng một dòng lỗi và theo đúng thứ tự của server
 * (`validateRoomSettings`). `balance` là số xu đang có nếu đã biết; chưa biết thì để server báo.
 */
export function validateRoomForm(
  form: RoomForm,
  balance: number | null,
): { ok: true; body: FlashbackCreateRoomBody } | { ok: false; message: string } {
  const viewBars = Number(form.viewBars)
  const playBars = Number(form.playBars)
  const minutes = Number(form.minutes)
  const maxPlayers = Number(form.maxPlayers)
  const rawStake = Number(form.stake)
  const password = form.password.trim()
  const solo = maxPlayers === 1
  const stake = solo ? 0 : rawStake

  if (form.viewBars.trim() === "" || !inRange(viewBars, ROOM_BARS_MIN, ROOM_BARS_MAX)) {
    return { ok: false, message: "Số phiên xem phải từ 30 đến 120" }
  }
  if (form.playBars.trim() === "" || !inRange(playBars, ROOM_BARS_MIN, ROOM_BARS_MAX)) {
    return { ok: false, message: "Số phiên chơi phải từ 30 đến 120" }
  }
  if (!(ROOM_MINUTE_OPTIONS as readonly number[]).includes(minutes)) {
    return { ok: false, message: "Thời gian chơi phải là 5, 10, 15, 20, 30, 45 hoặc 60 phút" }
  }
  if (!inRange(maxPlayers, 1, 4)) {
    return { ok: false, message: "Số người tối đa phải từ 1 đến 4" }
  }
  if (!solo && (form.stake.trim() === "" || !Number.isInteger(stake) || stake < ROOM_STAKE_MIN || stake % ROOM_STAKE_STEP !== 0)) {
    return { ok: false, message: "Số xu cược tối thiểu 10, là bội số của 10" }
  }
  if (balance !== null && stake > balance) {
    return { ok: false, message: `Bạn chỉ có ${formatNumber(balance)} xu` }
  }
  if (password && (password.length < ROOM_PASSWORD_MIN || password.length > ROOM_PASSWORD_MAX)) {
    return { ok: false, message: "Mật khẩu từ 4 đến 12 ký tự" }
  }
  return {
    ok: true,
    body: {
      view_bars: viewBars,
      play_bars: playBars,
      minutes,
      max_players: maxPlayers,
      stake_xu: solo ? null : stake,
      password: password || null,
    },
  }
}

// ------------------------------------------------------------------ màn chơi

/** "mm:ss" của thời gian còn lại; không bao giờ âm. */
export function clockText(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0")
  const rest = String(seconds % 60).padStart(2, "0")
  return `${minutes}:${rest}`
}

/** Những người đang dẫn đầu: chỉ có nghĩa khi từ hai người trở lên, hoà trong 0,005 điểm % (§6.1). */
export function leaderIds(players: readonly FlashbackPlayer[]): ReadonlySet<string> {
  if (players.length < 2) return new Set()
  const best = Math.max(...players.map((player) => player.pnl_percent))
  return new Set(players.filter((player) => Math.abs(player.pnl_percent - best) < 0.005).map((player) => player.user_id))
}

/** "2026-01-31" thành "31/01/2026", không qua múi giờ nên không lệch ngày. */
export function formatMatchDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

/** Chữ cái đầu của tên, dùng khi người chơi chưa có ảnh đại diện. */
export function initialOf(name: string): string {
  const letter = /\p{L}|\p{N}/u.exec(name)
  return letter ? letter[0].toUpperCase() : "?"
}

/** Nền nhạt của avatar theo từng người; chỉ dùng các màu biểu đồ, không dùng màu thị trường. */
const AVATAR_TONES = [
  "bg-chart-1/25",
  "bg-chart-6/25",
  "bg-chart-7/25",
  "bg-chart-8/25",
  "bg-chart-5/25",
] as const

export function avatarTone(seed: string): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  return AVATAR_TONES[hash % AVATAR_TONES.length]
}

/** Màu của một instance chỉ báo: cùng id dùng các màu khác nhau, đúng như TradingView. */
const INDICATOR_COLORS: Record<string, string[]> = {
  volume: ["var(--chart-2)"],
  ma: ["var(--chart-2)", "var(--chart-8)", "var(--chart-6)", "var(--chart-4)"],
  rsi: ["var(--chart-7)", "var(--chart-6)"],
  macd: ["var(--chart-1)"],
  bollinger: ["var(--chart-6)", "var(--chart-7)"],
  ema: ["var(--chart-6)", "var(--chart-2)", "var(--chart-4)"],
  ma_cross: ["var(--chart-2)", "var(--chart-7)"],
  dmi: ["var(--price-up)", "var(--price-down)"],
  donchian: ["var(--chart-6)"],
  stochastic: ["var(--chart-1)", "var(--chart-2)"],
  cci: ["var(--chart-2)"],
  roc: ["var(--chart-6)"],
  williams_r: ["var(--chart-7)"],
  obv: ["var(--chart-1)", "var(--chart-2)"],
  mfi: ["var(--price-up)"],
  cmf: ["var(--chart-2)"],
}

/** Màu của instance thứ `index` trong nhóm các instance cùng chỉ báo. */
export function indicatorColor(indicatorId: string, index: number): string {
  const palette = INDICATOR_COLORS[indicatorId] ?? ["var(--chart-1)"]
  return palette[index % palette.length]
}

/** Nhãn rút gọn của một chỉ báo (dùng trên ô biểu đồ). */
export function instanceShortLabel(instance: FlashbackIndicatorInstance, meta?: FlashbackIndicatorMeta): string {
  const name = meta?.name ?? instance.id
  const values = Object.entries(instance.params)
    .filter(([key]) => !["level"].includes(key))
    .map(([, value]) => (typeof value === "number" ? value : value.lower))
  return values.length ? `${name} ${values.join(" ")}` : name
}
