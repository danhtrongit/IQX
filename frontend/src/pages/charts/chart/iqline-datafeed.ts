/**
 * Datafeed của IQLine (docs/iqline-design.md §6, §8): chuyển logic từ `datafeed.ts` sang hợp đồng `IQLineDatafeed`.
 *
 * Khác `datafeed.ts` (TradingView, mili giây): thời gian nến ở đây là Unix GIÂY. API OHLCV chỉ nhận `start` và `end`
 * theo ngày Việt Nam, không có `countBack` và không phân trang (một yêu cầu 1 phút có thể nặng 3,5 MB), nên `getBars`
 * đổi `countBack` sang một khoảng ngày ngắn theo khung rồi lọc lại ở phía client. Giá cổ phiếu tính theo nghìn đồng
 * (58 là 58.000đ), giá chỉ số là điểm chỉ số.
 */
import { api } from "@/lib/api"
import { formatVi } from "@/lib/iqline/core"
import type { ChartMark, ColorToken, IQLineDatafeed, Interval, TimedBar } from "@/lib/iqline/types"

import { INDEX_SYMBOLS } from "./market-symbols"
import { fetchNewsMarks, type NewsMarkGroup } from "./news-marks"
import { formatVietnamDateKey, getVietnamDateStartTimestamp } from "./timezone"

/** Khung của IQLine sang khung API (cùng bảng với `RESOLUTION_MAP` của `datafeed.ts`). */
const API_INTERVAL: Readonly<Record<Interval, string>> = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1H",
  D: "1D",
  W: "1W",
  M: "1M",
}

/** Mốc nhỏ nhất, 2000-01-01 UTC. */
const MIN_TIMESTAMP = 946_684_800
const DAY = 86_400
/** Khung trong ngày chỉ về tới 5 năm trước. */
const INTRADAY_HISTORY_SECONDS = 5 * 365 * DAY
/** Phiên giao dịch 0900-1130 và 1300-1445: 150 + 105 phút. */
const TRADING_MINUTES_PER_DAY = 255
/** Số lần liền không có nến thì coi như hết lịch sử. */
const EMPTY_STREAK_LIMIT = 3
const POLL_INTERVAL_MS = 15_000

const INTRADAY_MINUTES: Readonly<Partial<Record<Interval, number>>> = { "1": 1, "5": 5, "15": 15, "30": 30, "60": 60 }

function abortError(): DOMException {
  return new DOMException("Yêu cầu đã bị huỷ.", "AbortError")
}

// ------------------------------------------------------------------ chuẩn hoá nến

/** Giây, mili giây, chuỗi số hoặc ISO về Unix giây; NaN nếu không đọc được. */
function toEpochSeconds(raw: unknown): number {
  const numeric =
    typeof raw === "number" ? raw : typeof raw === "string" && /^\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : Number.NaN
  if (Number.isFinite(numeric)) return numeric > 1e11 ? Math.round(numeric / 1000) : Math.round(numeric)
  const parsed = new Date(String(raw ?? "")).getTime()
  return Number.isNaN(parsed) ? Number.NaN : Math.round(parsed / 1000)
}

function positive(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : Number.NaN
}

type RawBar = Record<string, unknown>

/**
 * Bỏ nến lỗi (thời gian hoặc giá không hữu hạn hoặc không dương), sửa `high` và `low` cho khớp, khối lượng lỗi về 0,
 * sắp xếp tăng dần theo thời gian và loại nến trùng thời gian (giữ nến đến sau).
 */
function normalizeBars(payload: unknown): TimedBar[] {
  const items = payload && typeof payload === "object" && "data" in payload ? payload.data : payload
  if (!Array.isArray(items)) throw new Error("Dữ liệu OHLCV không hợp lệ.")

  const bars: TimedBar[] = []
  for (const item of items) {
    if (item == null || typeof item !== "object") continue
    const raw = item as RawBar
    const time = toEpochSeconds(raw.time ?? raw.date ?? raw.timestamp)
    const open = positive(raw.open)
    const high = positive(raw.high)
    const low = positive(raw.low)
    const close = positive(raw.close)
    if (!(time > 0) || Number.isNaN(open + high + low + close)) continue
    const volume = Number(raw.volume)
    bars.push({
      time,
      open,
      high: Math.max(open, high, low, close),
      low: Math.min(open, high, low, close),
      close,
      volume: Number.isFinite(volume) && volume > 0 ? volume : 0,
    })
  }

  // `sort` ổn định nên trong các nến trùng thời gian, nến đến sau vẫn nằm sau.
  bars.sort((a, b) => a.time - b.time)
  const unique: TimedBar[] = []
  for (const bar of bars) {
    if (unique.length > 0 && unique[unique.length - 1].time === bar.time) unique[unique.length - 1] = bar
    else unique.push(bar)
  }
  return unique
}

async function requestBars(symbol: string, interval: Interval, startKey: string, endKey: string, signal?: AbortSignal): Promise<TimedBar[]> {
  const params = new URLSearchParams({ interval: API_INTERVAL[interval], start: startKey, end: endKey })
  const payload = await api<unknown>(`/market-data/quotes/${encodeURIComponent(symbol.toUpperCase())}/ohlcv?${params.toString()}`, { signal })
  return normalizeBars(payload)
}

// ------------------------------------------------------------------ khoảng ngày theo khung

/** Số nến mỗi phiên của khung trong ngày: 255, 51, 17, 9, 5 cho 1, 5, 15, 30, 60 phút. */
function barsPerSession(minutes: number): number {
  return Math.ceil(TRADING_MINUTES_PER_DAY / minutes)
}

/**
 * Số ngày lịch cần xin để có khoảng `countBack` nến. Nhân 7/5 cho cuối tuần và cộng đệm cho ngày lễ.
 * Cố ý ngắn: API không phân trang, và thiếu nến thì biểu đồ sẽ xin tiếp.
 */
export function spanDaysFor(interval: Interval, countBack: number): number {
  const count = Math.max(1, Math.ceil(Number.isFinite(countBack) ? countBack : 1))
  const minutes = INTRADAY_MINUTES[interval]
  if (minutes !== undefined) return Math.ceil((Math.ceil(count / barsPerSession(minutes)) * 7) / 5) + 4
  if (interval === "D") return Math.ceil((count * 7) / 5) + 10
  if (interval === "W") return count * 7 + 14
  return count * 31 + 31
}

// ------------------------------------------------------------------ thăm dò nến mới

type PulseSubscriber = {
  symbol: string
  interval: Interval
  lastBar: TimedBar | null
  onBar: (bar: TimedBar) => void
}

/** Thăm dò 15 giây dùng chung cho mọi biểu đồ trong trang; hết người nghe thì dừng bộ hẹn giờ. */
class DataPulse {
  private readonly subscribers = new Map<number, PulseSubscriber>()
  private timer: ReturnType<typeof setInterval> | undefined
  private polling = false
  private nextId = 1

  subscribe(subscriber: PulseSubscriber): () => void {
    const id = this.nextId++
    this.subscribers.set(id, subscriber)
    if (this.timer === undefined) this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
    return () => {
      this.subscribers.delete(id)
      if (this.subscribers.size === 0 && this.timer !== undefined) {
        clearInterval(this.timer)
        this.timer = undefined
      }
    }
  }

  private async poll(): Promise<void> {
    // Lần thăm dò trước chưa xong thì bỏ lượt này, tránh chồng yêu cầu khi mạng chậm.
    if (this.polling) return
    this.polling = true
    try {
      for (const [id, sub] of [...this.subscribers]) {
        try {
          const now = Math.floor(Date.now() / 1000)
          const from = sub.lastBar ? sub.lastBar.time - 60 : now - DAY
          const bars = await requestBars(sub.symbol, sub.interval, formatVietnamDateKey(new Date(from * 1000)), formatVietnamDateKey(new Date(now * 1000)))
          const latest = bars[bars.length - 1]
          // Người nghe có thể đã huỷ trong lúc chờ; không gửi nến cũ hơn nến đã gửi.
          if (latest && this.subscribers.has(id) && (!sub.lastBar || latest.time >= sub.lastBar.time)) {
            sub.lastBar = latest
            sub.onBar(latest)
          }
        } catch {
          // Nuốt lỗi: lần thăm dò sau thử lại.
        }
      }
    } finally {
      this.polling = false
    }
  }
}

const pulse = new DataPulse()

// ------------------------------------------------------------------ dấu tin

const SENTIMENT_TOKEN: Readonly<Record<NewsMarkGroup["dominantSentiment"], ColorToken>> = {
  positive: "price-up",
  negative: "price-down",
  neutral: "price-ref",
}

function toMarks(groups: readonly NewsMarkGroup[]): ChartMark[] {
  const marks: ChartMark[] = []
  for (const group of groups) {
    const time = group.timestamp || getVietnamDateStartTimestamp(group.dateKey)
    if (!Number.isFinite(time)) continue
    marks.push({
      id: group.dateKey,
      time,
      label: String(group.items.length),
      token: SENTIMENT_TOKEN[group.dominantSentiment],
      count: group.items.length,
    })
  }
  return marks.sort((a, b) => a.time - b.time)
}

// ------------------------------------------------------------------ datafeed

/**
 * Datafeed cho biểu đồ `market`. Mỗi instance có bộ đếm "lần rỗng liền nhau" riêng theo từng cặp mã và khung;
 * thăm dò nến mới và bộ nhớ đệm tin dùng chung trong module.
 */
export function createIQLineDatafeed(): IQLineDatafeed {
  const emptyStreaks = new Map<string, number>()

  return {
    async getBars({ symbol, interval, to: requestedTo, countBack, signal }) {
      if (signal.aborted) throw abortError()

      const now = Math.floor(Date.now() / 1000)
      // Biểu đồ có thể truyền mốc rất xa trong tương lai (hoặc không hữu hạn) để lấy nến mới nhất.
      const to = Math.min(Number.isFinite(requestedTo) ? requestedTo : Number.POSITIVE_INFINITY, now + DAY)
      const intraday = INTRADAY_MINUTES[interval] !== undefined
      const floor = intraday ? Math.max(MIN_TIMESTAMP, now - INTRADAY_HISTORY_SECONDS) : MIN_TIMESTAMP
      // Đã ở sát hoặc dưới mốc cũ nhất thì không còn gì để xin.
      if (!(to > floor)) return { bars: [], noMoreHistory: true }

      const key = `${symbol.toUpperCase()}|${interval}`
      const streak = emptyStreaks.get(key) ?? 0
      // Mỗi lần rỗng liền nhau mở rộng khoảng gấp đôi, để một đợt nghỉ lễ dài không làm kẹt biểu đồ.
      const spanSeconds = spanDaysFor(interval, countBack) * DAY * 2 ** streak
      const startTs = Math.max(floor, to - spanSeconds)
      const reachedFloor = startTs <= floor

      let fetched: TimedBar[]
      try {
        fetched = await requestBars(symbol, interval, formatVietnamDateKey(new Date(startTs * 1000)), formatVietnamDateKey(new Date((to - 1) * 1000)), signal)
      } catch (error) {
        // Kết quả về muộn hoặc lỗi do huỷ đều là AbortError, không phải lỗi mạng.
        if (signal.aborted) throw abortError()
        throw error
      }
      if (signal.aborted) throw abortError()

      const bars = fetched.filter((bar) => bar.time < to)
      if (bars.length === 0) emptyStreaks.set(key, streak + 1)
      else emptyStreaks.delete(key)

      // Ít nến hơn mong muốn mà nến cũ nhất còn cách đầu khoảng xin rất xa: phía trước không còn dữ liệu.
      // Ngưỡng rộng (nửa khoảng, tối thiểu 30 ngày) để một đợt tạm ngừng giao dịch không bị hiểu là hết lịch sử.
      const leadingGap = bars.length > 0 ? bars[0].time - startTs : 0
      const dataStartsInside = bars.length > 0 && bars.length < countBack && leadingGap > Math.max(30 * DAY, spanSeconds / 2)

      return {
        bars,
        noMoreHistory: reachedFloor || dataStartsInside || (emptyStreaks.get(key) ?? 0) >= EMPTY_STREAK_LIMIT,
      }
    },

    subscribeBars(symbol, interval, onBar) {
      return pulse.subscribe({ symbol, interval, lastBar: null, onBar })
    },

    async getMarks({ symbol, from, to, signal }) {
      if (signal.aborted) throw abortError()
      const groups = await fetchNewsMarks(symbol, from, to, signal)
      // `fetchNewsMarks` nuốt lỗi và trả mảng rỗng; huỷ thì phải báo là huỷ chứ không phải "không có tin".
      if (signal.aborted) throw abortError()
      return toMarks(groups)
    },
  }
}

// ------------------------------------------------------------------ định dạng giá

/**
 * Cùng độ chính xác với TradingView đang hiện (`pricescale` 100 cho chỉ số, 1000 cho cổ phiếu): 2 và 3 chữ số thập
 * phân, kiểu Việt Nam. Giá cổ phiếu tính theo nghìn đồng nên 58,123 là 58.123đ.
 */
export function iqlinePriceFormatter(symbol: string): (price: number) => string {
  const decimals = INDEX_SYMBOLS[symbol.toUpperCase()] === true ? 2 : 3
  return (price) => formatVi(price, decimals)
}
