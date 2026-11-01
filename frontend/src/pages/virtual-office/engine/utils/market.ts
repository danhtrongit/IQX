import type { BoardQuote, IndexSnapshot, MarketSnapshot, PricePalette } from "../types"

/** Office day, in simulated minutes since midnight. Drives the staff, not the market data. */
export const DAY = {
  start: 7 * 60 + 30, // first arrivals
  open: 9 * 60, // desks busy
  lunchStart: 11 * 60 + 30,
  lunchEnd: 13 * 60,
  atc: 14 * 60 + 30,
  close: 14 * 60 + 45,
  leave: 17 * 60 + 30, // staff start heading home
  night: 18 * 60 + 30, // office empty, cleaning
  end: 19 * 60 + 30, // jump to next morning
} as const
const MINUTES_PER_TICK = 2

/** Fallback LED colours (dark-theme `--price-*` tokens) until the page reads the live ones. */
export const DEFAULT_PALETTE: PricePalette = {
  up: "#32d74b",
  down: "#ff453a",
  ref: "#ffd60a",
  ceiling: "#bf5af2",
  floor: "#64d2ff",
}

/**
 * The office's view of the market. The clock is an accelerated, simulated office
 * day that only directs the people in the scene; every price, index value and
 * order-book level comes from the IQX market-data API through `setSnapshot`.
 * Nothing here invents a number: a missing value stays `null`.
 */
export class Market {
  /** Simulated minutes since midnight. Starts just before the first desks fill up. */
  time = 8 * 60 + 50
  day = 1
  snapshot: MarketSnapshot = { index: null, quotes: [], intraday: [], intradayRef: null, updatedAt: null }
  palette: PricePalette = DEFAULT_PALETTE
  private readonly listeners: Array<(m: Market) => void> = []
  private readonly dataListeners: Array<(m: Market) => void> = []

  onTick(fn: (m: Market) => void): void {
    this.listeners.push(fn)
  }

  /** Called whenever new market data lands. */
  onData(fn: (m: Market) => void): void {
    this.dataListeners.push(fn)
  }

  setSnapshot(snapshot: MarketSnapshot): void {
    this.snapshot = snapshot
    for (const fn of this.dataListeners) fn(this)
  }

  get index(): IndexSnapshot | null {
    return this.snapshot.index
  }

  get quotes(): BoardQuote[] {
    return this.snapshot.quotes
  }

  get clock(): string {
    const t = Math.floor(this.time)
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`
  }

  /** What the office is doing at the simulated time. */
  get phase(): string {
    const t = this.time
    if (t < DAY.open) return "Đầu giờ"
    if (t < DAY.lunchStart) return "Giờ làm việc"
    if (t < DAY.lunchEnd) return "Nghỉ trưa"
    if (t < DAY.close) return "Giờ làm việc"
    if (t < DAY.leave) return "Cuối phiên"
    if (t < DAY.night) return "Tan làm"
    return "Ban đêm"
  }

  get isLunch(): boolean {
    return this.time >= DAY.lunchStart && this.time < DAY.lunchEnd
  }

  /** Desks are busy (simulated office hours). */
  get trading(): boolean {
    return this.time >= DAY.open && this.time < DAY.close && !this.isLunch
  }

  /** Real VN-Index change in percent; 0 while unknown (only used for the staff's mood). */
  get indexPct(): number {
    return this.snapshot.index?.pct ?? 0
  }

  colorOf(q: BoardQuote): string {
    const p = this.palette
    if (q.price === null) return p.ref
    if (q.ceiling !== null && q.price >= q.ceiling) return p.ceiling
    if (q.floor !== null && q.price <= q.floor) return p.floor
    if (q.ref === null || Math.abs(q.price - q.ref) < 0.001) return p.ref
    return q.price > q.ref ? p.up : p.down
  }

  indexColor(): string {
    const change = this.snapshot.index?.change
    if (change === undefined || change === null || Math.abs(change) < 0.005) return this.palette.ref
    return change > 0 ? this.palette.up : this.palette.down
  }

  tick(): void {
    this.time += MINUTES_PER_TICK
    if (this.time >= DAY.end) {
      this.time = DAY.start
      this.day++
    }
    for (const fn of this.listeners) fn(this)
  }
}
