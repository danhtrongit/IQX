/**
 * Lịch giao dịch Việt Nam cho thang thời gian `market` (docs/iqline-design.md §7).
 *
 * Trục cách đều theo nến nên chỉ cần lịch để ngoại suy ngoài hai đầu dữ liệu: phiên `0900-1130,1300-1445`,
 * bỏ thứ bảy và chủ nhật, giờ `Asia/Ho_Chi_Minh` (UTC+7, không có giờ mùa hè nên tính bằng số học).
 * Ngày lễ chưa biết trước, nên nến tương lai có thể lệch tới khi có nến thật; `time` đã lưu không đổi.
 * Thuần: không chạm DOM, không dùng `Intl`, không dùng `Date`.
 */
import type { Interval } from "../types"

export const ICT_OFFSET = 7 * 3600
const DAY = 86400

/** Phiên khớp lệnh theo phút trong ngày: 09:00-11:30 và 13:00-14:45. */
export const TRADING_SESSIONS: readonly (readonly [number, number])[] = [
  [9 * 60, 11 * 60 + 30],
  [13 * 60, 14 * 60 + 45],
]

/** Số giây của một nến, dùng làm bước khi nội suy trong khoảng giữa hai nến. */
export const INTERVAL_SECONDS: Record<Interval, number> = {
  "1": 60,
  "5": 300,
  "15": 900,
  "30": 1800,
  "60": 3600,
  D: DAY,
  W: 7 * DAY,
  M: 30 * DAY,
}

export function isIntraday(interval: Interval): boolean {
  return interval !== "D" && interval !== "W" && interval !== "M"
}

/** Số ngày kể từ 1970-01-01 của ngày dương lịch (thuật toán Howard Hinnant). */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

export type Civil = { year: number; month: number; day: number }

/** Ngược lại của `daysFromCivil`; `month` từ 1 đến 12. */
export function civilFromDays(days: number): Civil {
  const z = days + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1
  const month = mp < 10 ? mp + 3 : mp - 9
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day }
}

export function daysInMonth(year: number, month: number): number {
  return daysFromCivil(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1) - daysFromCivil(year, month, 1)
}

/** Số ngày (giờ Việt Nam) kể từ 1970-01-01, nhanh hơn `ictParts` khi chỉ cần so ngày. */
export function ictDay(time: number): number {
  return Math.floor((time + ICT_OFFSET) / DAY)
}

export type IctParts = {
  /** Số ngày (giờ Việt Nam) kể từ 1970-01-01. */
  day: number
  /** Giây trong ngày, 0 đến 86399. */
  second: number
  /** Phút trong ngày, có phần lẻ. */
  minute: number
  year: number
  month: number
  date: number
  /** 0 là thứ hai, 6 là chủ nhật. */
  weekday: number
}

export function ictParts(time: number): IctParts {
  const local = time + ICT_OFFSET
  const day = Math.floor(local / DAY)
  const second = local - day * DAY
  const civil = civilFromDays(day)
  return { day, second, minute: second / 60, year: civil.year, month: civil.month, date: civil.day, weekday: (((day + 3) % 7) + 7) % 7 }
}

/** Thứ tự ngày giao dịch: số ngày thứ hai đến thứ sáu đứng trước `day`. Thứ bảy, chủ nhật trùng thứ hai kế tiếp. */
export function weekdayOrdinal(day: number): number {
  const shifted = day + 3
  const week = Math.floor(shifted / 7)
  return week * 5 + Math.min(shifted - week * 7, 5)
}

/** Ngược lại của `weekdayOrdinal`: số ngày của ngày giao dịch thứ `ordinal`. */
export function dayOfWeekdayOrdinal(ordinal: number): number {
  const week = Math.floor(ordinal / 5)
  return week * 7 + (ordinal - week * 5) - 3
}

/** Lưới ô thời gian dùng để ngoại suy. Số nguyên là đầu ô; phần lẻ là vị trí trong ô. */
export type SlotGrid = {
  ordinalOf(time: number): number
  timeOf(ordinal: number): number
  /** Số ô trong một ngày giao dịch (nến trong ngày), 1 với D, W, M. */
  perDay: number
}

/** Phút bắt đầu của từng ô trong một ngày, theo bước `stepMinutes`. */
export function intradayStarts(stepMinutes: number): number[] {
  const starts: number[] = []
  for (const [open, close] of TRADING_SESSIONS) for (let minute = open; minute < close; minute += stepMinutes) starts.push(minute)
  return starts
}

function intradayGrid(stepMinutes: number): SlotGrid {
  const starts = intradayStarts(stepMinutes)
  const perDay = starts.length
  // Số ô trước mỗi phiên, để đổi phút trong ngày sang vị trí lẻ.
  const before: number[] = []
  let total = 0
  for (const [open, close] of TRADING_SESSIONS) {
    before.push(total)
    total += Math.ceil((close - open) / stepMinutes)
  }
  const lengths = TRADING_SESSIONS.map(([open, close]) => Math.ceil((close - open) / stepMinutes))
  // Vị trí lẻ trong ngày. Phút ngoài phiên (nghỉ trưa, sau đóng cửa: VNINDEX có nến 12:00 và 15:00) dồn về ô
  // cuối của phiên đứng trước, để ô kế tiếp ngoại suy ra đúng là đầu phiên sau.
  const position = (minute: number): number => {
    for (let index = 0; index < TRADING_SESSIONS.length; index += 1) {
      const [open, close] = TRADING_SESSIONS[index]
      if (minute < open) return index === 0 ? 0 : before[index - 1] + lengths[index - 1] - 1
      if (minute < close) return before[index] + (minute - open) / stepMinutes
    }
    return perDay - 1
  }
  return {
    perDay,
    ordinalOf(time) {
      const parts = ictParts(time)
      // Thứ bảy và chủ nhật trùng đầu thứ hai.
      return weekdayOrdinal(parts.day) * perDay + (parts.weekday >= 5 ? 0 : position(parts.minute))
    },
    timeOf(ordinal) {
      const whole = Math.floor(ordinal)
      const fraction = ordinal - whole
      const dayIndex = Math.floor(whole / perDay)
      const slot = whole - dayIndex * perDay
      return dayOfWeekdayOrdinal(dayIndex) * DAY + (starts[slot] + fraction * stepMinutes) * 60 - ICT_OFFSET
    },
  }
}

function dailyGrid(reference: number): SlotGrid {
  // Nến ngày có thể ở 00:00 UTC (07:00 giờ Việt Nam): giữ nguyên giờ trong ngày của nến tham chiếu.
  const offset = ictParts(reference).second
  return {
    perDay: 1,
    ordinalOf(time) {
      const parts = ictParts(time)
      return weekdayOrdinal(parts.day) + (parts.weekday >= 5 ? 0 : (parts.second - offset) / DAY)
    },
    timeOf(ordinal) {
      const whole = Math.floor(ordinal)
      return dayOfWeekdayOrdinal(whole) * DAY + offset - ICT_OFFSET + (ordinal - whole) * DAY
    },
  }
}

function weeklyGrid(): SlotGrid {
  const week = 7 * DAY
  return { perDay: 1, ordinalOf: (time) => time / week, timeOf: (ordinal) => ordinal * week }
}

function monthlyGrid(): SlotGrid {
  const month = (time: number) => {
    const parts = ictParts(time)
    return parts.year * 12 + parts.month - 1
  }
  const monthStart = (index: number) => {
    const year = Math.floor(index / 12)
    return daysFromCivil(year, (index - year * 12) + 1, 1) * DAY - ICT_OFFSET
  }
  return {
    perDay: 1,
    ordinalOf(time) {
      const index = month(time)
      const start = monthStart(index)
      return index + (time - start) / (monthStart(index + 1) - start)
    },
    timeOf(ordinal) {
      const index = Math.floor(ordinal)
      const start = monthStart(index)
      return start + (ordinal - index) * (monthStart(index + 1) - start)
    },
  }
}

/**
 * Lưới ô cho một khung. `reference` là thời gian của một nến thật, để nến ngày giữ nguyên giờ trong ngày
 * (00:00 UTC, tức 07:00 giờ Việt Nam).
 */
export function createSlotGrid(interval: Interval, reference: number): SlotGrid {
  if (interval === "D") return dailyGrid(reference)
  if (interval === "W") return weeklyGrid()
  if (interval === "M") return monthlyGrid()
  return intradayGrid(Number(interval))
}
