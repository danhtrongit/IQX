/**
 * Quy tắc thuần của màn chơi Flashback (spec v1.1 §2.4 - §2.9).
 *
 * Không có mạng, không có React: mọi phép tính tiền, phí, thuế, số phiên và câu chữ chia sẻ
 * đều ở đây để màn hình chỉ hiển thị.
 */
import type {
  FlashbackEntry,
  FlashbackIndicatorInstance,
  FlashbackIndicatorMeta,
  FlashbackOrderSide,
  FlashbackPosition,
} from "./flashback-api"

/** Vốn ban đầu của một lượt chơi. */
export const FLASHBACK_INITIAL_CASH = 10_000_000
/** Số phiên lịch sử đi kèm mỗi đề. */
const FLASHBACK_HISTORY_SESSIONS = 60
/** Số phiên chơi được. */
export const FLASHBACK_PLAY_SESSIONS = 60
/** Phí 0,15% giá trị lệnh, cả khi mua lẫn khi bán. */
export const FLASHBACK_FEE_RATE = 0.0015
/** Thuế 0,1% giá trị lệnh, chỉ khi bán. */
export const FLASHBACK_TAX_RATE = 0.001

const numberFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })
const moneyFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })

export function formatNumber(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : numberFormat.format(value)
}

export function formatMoney(value: number | string | null | undefined): string {
  const amount = typeof value === "string" ? Number(value) : value
  return amount == null || !Number.isFinite(amount) ? "—" : moneyFormat.format(amount)
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

/** "Mua tối đa": số nguyên lớn nhất sao cho số cp × giá × (1 + phí) ≤ tiền mặt. */
export function maxBuyQty(cash: number, price: number): number {
  if (price <= 0) return 0
  return Math.max(0, Math.floor(cash / (price * (1 + FLASHBACK_FEE_RATE))))
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
  const fee = Math.round(value * FLASHBACK_FEE_RATE)
  const tax = side === "sell" ? Math.round(value * FLASHBACK_TAX_RATE) : 0
  return { value, fee, tax, total: side === "buy" ? value + fee : value - fee - tax }
}

/** Lý do một lệnh không được đặt, theo đúng ba câu của spec §2.6. */
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
 * Nhãn phiên của một nến: phần lịch sử ghi "n phiên trước", nến lịch sử cuối là "Phiên 0",
 * phần chơi là "Phiên 1".."Phiên 60".
 */
export function sessionLabel(index: number, historySessions = FLASHBACK_HISTORY_SESSIONS): string {
  if (index < historySessions - 1) return `${historySessions - 1 - index} phiên trước`
  if (index === historySessions - 1) return "Phiên 0"
  return `Phiên ${index - historySessions + 1}`
}

/** "Đóng sau d ngày hh:mm:ss". */
export function countdownText(closesAt: string, now = Date.now()): string {
  const end = new Date(closesAt).getTime()
  if (!Number.isFinite(end)) return "—"
  const seconds = Math.max(0, Math.floor((end - now) / 1000))
  const days = Math.floor(seconds / 86_400)
  const hours = String(Math.floor((seconds % 86_400) / 3600)).padStart(2, "0")
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")
  const rest = String(seconds % 60).padStart(2, "0")
  return `${days} ngày ${hours}:${minutes}:${rest}`
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

/** Nhãn hạng của một mức thưởng. */
export function rewardLabel(rank: number | null): string {
  if (rank == null) return "Chưa xếp hạng"
  if (rank === 1) return "Hạng 1"
  if (rank <= 3) return "Hạng 2-3"
  if (rank <= 10) return "Hạng 4-10"
  if (rank <= 50) return "Hạng 11-50"
  return "Ngoài top 50"
}

/** Ký hiệu dải màu của kết quả: xanh tăng, đỏ giảm, xám không giữ cổ phiếu. */
export type StripTone = "up" | "down" | "flat"

export const STRIP_EMOJI: Record<StripTone, string> = { up: "🟩", down: "🟥", flat: "⬜" }

/** Đoạn chữ chia sẻ kết quả (spec §2.8). */
export function shareText(tones: readonly StripTone[], pnlPct: number, rank: number | null, totalPlayers: number): string {
  const strip = tones.map((tone) => STRIP_EMOJI[tone]).join("")
  const pnl = `${pnlPct > 0 ? "+" : pnlPct < 0 ? "−" : ""}${formatPercent(Math.abs(pnlPct))}`
  const place = rank == null ? "—" : `${formatNumber(rank)}/${formatNumber(totalPlayers)}`
  return `IQX Flashback\n${strip}\nLợi nhuận ${pnl} · Hạng ${place}\niqx.vn/flashback`
}

/** Số lượng mua và bán của một lượt chơi. */
export function orderCounts(entry: FlashbackEntry | null): { buys: number; sells: number } {
  const orders = entry?.orders ?? []
  return {
    buys: orders.filter((order) => order.side === "buy").length,
    sells: orders.filter((order) => order.side === "sell").length,
  }
}

/**
 * Dải 10 ô màu của kết quả: mỗi ô 6 phiên chơi, xanh khi tài sản tăng, đỏ khi giảm, xám khi
 * không giữ cổ phiếu. `nav` và `held` dài bằng lịch sử + các phiên chơi.
 */
export function resultStrip(
  nav: readonly number[],
  held: readonly number[],
  historySessions: number,
  playSessions: number,
): StripTone[] {
  const blocks = 10
  const size = playSessions / blocks
  const tones: StripTone[] = []
  for (let block = 0; block < blocks; block += 1) {
    const from = historySessions - 1 + block * size
    const to = historySessions - 1 + (block + 1) * size
    const hasHolding = held.slice(from + 1, to + 1).some((qty) => qty > 0)
    const change = nav[to] - nav[from]
    if (!hasHolding && Math.abs(change) < 1) tones.push("flat")
    else tones.push(change > 0 ? "up" : change < 0 ? "down" : "flat")
  }
  return tones
}

/**
 * Tài sản và cổ phiếu đang giữ sau từng phiên, dựng lại từ các lệnh đã khớp: mua thì trừ
 * tiền mặt, bán thì cộng tiền nhận về, lô bán theo thứ tự mua trước bán trước.
 */
export function navSeriesOf(
  orders: readonly { side: "buy" | "sell"; qty: number; amount: string; fee: string; tax: string; step: number }[],
  closes: readonly number[],
  historySessions: number,
  playSessions: number,
  initialCash: number,
): { nav: number[]; held: number[] } {
  const nav = new Array<number>(closes.length).fill(initialCash)
  const held = new Array<number>(closes.length).fill(0)
  let cash = initialCash
  const lots: { qty: number }[] = []
  for (let session = 0; session <= playSessions; session += 1) {
    for (const order of orders.filter((candidate) => candidate.step === session)) {
      const amount = Number(order.amount)
      const fee = Number(order.fee)
      const tax = Number(order.tax)
      if (order.side === "buy") {
        cash -= amount + fee
        lots.push({ qty: order.qty })
        continue
      }
      cash += amount - fee - tax
      let rest = order.qty
      for (const lot of lots) {
        if (rest <= 0) break
        const take = Math.min(lot.qty, rest)
        lot.qty -= take
        rest -= take
      }
      for (let index = lots.length - 1; index >= 0; index -= 1) {
        if (lots[index].qty <= 0) lots.splice(index, 1)
      }
    }
    const index = historySessions - 1 + session
    if (index < 0 || index >= closes.length) continue
    const shares = lots.reduce((sum, lot) => sum + lot.qty, 0)
    held[index] = shares
    nav[index] = cash + shares * closes[index]
  }
  return { nav, held }
}
