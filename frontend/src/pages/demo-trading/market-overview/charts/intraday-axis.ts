import type { HistogramData, LineData, UTCTimestamp, WhitespaceData } from "lightweight-charts"
import type { IndexChartSymbol } from "../types"

/** VN session bounds in minutes from midnight (ICT, UTC+7). */
export const VN_FUTURES_START_MIN = 8 * 60 + 45 // 08:45 = 525
export const VN_MORNING_START_MIN = 9 * 60 // 09:00 = 540
export const VN_MORNING_END_MIN = 11 * 60 + 30 // 11:30 = 690
export const VN_AFTERNOON_START_MIN = 13 * 60 // 13:00 = 780
export const VN_AFTERNOON_END_MIN = 14 * 60 + 45 // 14:45 = 885
export const VN_EXTENDED_AFTERNOON_END_MIN = 15 * 60 // 15:00 = 900

export const VN_MORNING_SLOTS = VN_MORNING_END_MIN - VN_MORNING_START_MIN + 1 // 151 (0..150)
export const VN_AFTERNOON_SLOTS = VN_AFTERNOON_END_MIN - VN_AFTERNOON_START_MIN + 1 // 106 (151..256)
export const VN_INTRADAY_SLOTS = VN_MORNING_SLOTS + VN_AFTERNOON_SLOTS // 257 (0..256)

const MIN_SUPPORTED_START_MIN = VN_FUTURES_START_MIN // 08:45 -> slot -15
const MAX_SUPPORTED_END_MIN = VN_EXTENDED_AFTERNOON_END_MIN // 15:00 -> slot 271
const MIN_SUPPORTED_SLOT = MIN_SUPPORTED_START_MIN - VN_MORNING_START_MIN // -15
const MAX_SUPPORTED_SLOT = VN_MORNING_SLOTS + (MAX_SUPPORTED_END_MIN - VN_AFTERNOON_START_MIN) // 271

/** Fixed synthetic UTC epoch anchor (2024-01-01T00:00:00Z, exact multiple of 3600s) for compressed LWC coords. */
export const INTRADAY_CHART_EPOCH_BASE = 1_704_067_200
export const INTRADAY_SLOT_SECONDS = 60
const MORNING_END_SLOT = VN_MORNING_SLOTS - 1 // 150 (11:30)
const AFTERNOON_OPEN_SLOT = VN_MORNING_SLOTS // 151 (13:00)
const AFTERNOON_OPEN_REL_SEC = MORNING_END_SLOT * INTRADAY_SLOT_SECONDS + 1 // 9001s (1s after 11:30)

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000
const HHMM_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/

export interface IntradayBounds {
  /** Session start in ICT minutes from midnight (default 09:00 = 540; futures 08:45 = 525). */
  startMin?: number
  /** Session end in ICT minutes from midnight (default 14:45 = 885; HNX/UPCOM 15:00 = 900). */
  endMin?: number
}

export interface IntradayRawPoint {
  time: string | number
  value: number | null | undefined
}

export interface IntradayHistogramRawPoint extends IntradayRawPoint {
  color?: string
}

export interface IntradaySeriesOptions extends IntradayBounds {
  /** Sampling cadence in minutes (default `1`). Interior missing intervals become whitespace. */
  stepMinutes?: number
  /** If true, appends whitespace entries up to `endMin` so full session width stays reserved. */
  padToSessionEnd?: boolean
}

export type IntradayLinePoint = LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>
export type IntradayHistogramPoint = HistogramData<UTCTimestamp> | WhitespaceData<UTCTimestamp>

export function getIntradayBoundsForSymbol(symbol: IndexChartSymbol): Required<IntradayBounds> {
  if (symbol === "VN30F1M") {
    return { startMin: VN_FUTURES_START_MIN, endMin: VN_AFTERNOON_END_MIN }
  }
  if (symbol === "HNX" || symbol === "UPCOM") {
    return { startMin: VN_MORNING_START_MIN, endMin: VN_EXTENDED_AFTERNOON_END_MIN }
  }
  return { startMin: VN_MORNING_START_MIN, endMin: VN_AFTERNOON_END_MIN }
}

function resolveBounds(bounds?: IntradayBounds): { startMin: number; endMin: number } {
  const startMin = Math.max(
    MIN_SUPPORTED_START_MIN,
    Math.min(VN_MORNING_END_MIN, bounds?.startMin ?? VN_MORNING_START_MIN),
  )
  const endMin = Math.max(
    VN_AFTERNOON_START_MIN,
    Math.min(MAX_SUPPORTED_END_MIN, bounds?.endMin ?? VN_AFTERNOON_END_MIN),
  )
  return { startMin, endMin }
}

function formatMinutesAsHm(mins: number): string {
  const hh = String(Math.floor(mins / 60)).padStart(2, "0")
  const mm = String(mins % 60).padStart(2, "0")
  return `${hh}:${mm}`
}

/**
 * Parses `"HH:MM"`, `"HH:MM:SS"`, ISO timestamps, or epoch seconds/milliseconds
 * into Vietnam (UTC+7) minutes since midnight.
 */
export function parseTimeToVnMinutes(input: string | number): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null
    const ms = Math.abs(input) < 1e12 ? input * 1000 : input
    const vnDate = new Date(ms + ICT_OFFSET_MS)
    return vnDate.getUTCHours() * 60 + vnDate.getUTCMinutes()
  }

  const trimmed = input.trim()
  if (!trimmed) return null

  const hhmm = HHMM_RE.exec(trimmed)
  if (hhmm) {
    const h = Number(hhmm[1])
    const m = Number(hhmm[2])
    if (h < 0 || h > 23 || m < 0 || m > 59) return null
    return h * 60 + m
  }

  const parsedMs = Date.parse(trimmed)
  if (!Number.isFinite(parsedMs)) return null
  const vnDate = new Date(parsedMs + ICT_OFFSET_MS)
  return vnDate.getUTCHours() * 60 + vnDate.getUTCMinutes()
}

/**
 * Maps a VN trading timestamp to its compressed 1-minute slot index:
 * - `08:45..11:30` -> `-15..150` (`09:00` = `0`, `11:30` = `150`)
 * - `13:00..15:00` -> `151..271` (zero lunch dead zone; `11:30` and `13:00` are 1 slot apart)
 * Returns `null` outside the configured session bounds (including lunch `11:31..12:59`).
 */
export function timeToCompressedSlot(
  input: string | number,
  bounds?: IntradayBounds,
): number | null {
  const mins = parseTimeToVnMinutes(input)
  if (mins === null) return null

  const { startMin, endMin } = resolveBounds(bounds)

  if (mins >= startMin && mins <= VN_MORNING_END_MIN) {
    return mins - VN_MORNING_START_MIN
  }
  if (mins >= VN_AFTERNOON_START_MIN && mins <= endMin) {
    return VN_MORNING_SLOTS + (mins - VN_AFTERNOON_START_MIN)
  }
  return null
}

/** Converts a compressed slot index (`-15..271`) back to `"HH:MM"`. */
export function compressedSlotToLabel(slot: number): string {
  if (!Number.isFinite(slot)) return ""
  const idx = Math.round(slot)
  if (idx < MIN_SUPPORTED_SLOT || idx > MAX_SUPPORTED_SLOT) return ""

  const mins =
    idx <= MORNING_END_SLOT
      ? VN_MORNING_START_MIN + idx
      : VN_AFTERNOON_START_MIN + (idx - AFTERNOON_OPEN_SLOT)

  return formatMinutesAsHm(mins)
}

/**
 * Maps a compressed slot index to a strictly monotonic Lightweight Charts `UTCTimestamp` (seconds):
 * - Morning (`08:45..11:30`, slot `-15..150`): `BASE + slot * 60` (`08:45` = `-15*60`, `09:00` = `0`, `11:30` = `150*60`)
 * - Afternoon open (`13:00`, slot `151`): `BASE + 150 * 60 + 1` (1s after `11:30`, zero lunch gap)
 * - Afternoon (`13:01..15:00`, slot `152..271`): `BASE + (slot - 1) * 60`
 *   so `13:30` = `180*60`, `14:00` = `210*60`, `14:30` = `240*60`, `14:45` = `255*60`, `15:00` = `270*60`
 *   — exact 30-minute multiples for clean LWC axis ticks with zero off-by-one drift.
 */
export function slotToChartTime(slot: number): UTCTimestamp {
  const idx = Math.round(slot)
  if (idx <= MORNING_END_SLOT) {
    return (INTRADAY_CHART_EPOCH_BASE + idx * INTRADAY_SLOT_SECONDS) as UTCTimestamp
  }
  if (idx === AFTERNOON_OPEN_SLOT) {
    return (INTRADAY_CHART_EPOCH_BASE + AFTERNOON_OPEN_REL_SEC) as UTCTimestamp
  }
  return (INTRADAY_CHART_EPOCH_BASE + (idx - 1) * INTRADAY_SLOT_SECONDS) as UTCTimestamp
}

export function chartTimeToSlot(chartTime: number): number {
  const relSec = Math.round(chartTime - INTRADAY_CHART_EPOCH_BASE)
  if (relSec === AFTERNOON_OPEN_REL_SEC) {
    return AFTERNOON_OPEN_SLOT
  }
  const offsetMin = Math.round(relSec / INTRADAY_SLOT_SECONDS)
  if (offsetMin <= MORNING_END_SLOT) {
    return offsetMin
  }
  return offsetMin + 1
}

export function timeToChartCoord(
  input: string | number,
  bounds?: IntradayBounds,
): UTCTimestamp | null {
  const slot = timeToCompressedSlot(input, bounds)
  return slot === null ? null : slotToChartTime(slot)
}

/** Formats a compressed chart coordinate (`UTCTimestamp`) back to `"HH:MM"` for axis ticks/tooltips. */
export function formatIntradayChartTime(chartTime: number): string {
  if (!Number.isFinite(chartTime)) return ""
  return compressedSlotToLabel(chartTimeToSlot(chartTime))
}

export function isWhitespaceData(
  point: IntradayLinePoint | IntradayHistogramPoint,
): point is WhitespaceData<UTCTimestamp> {
  return !("value" in point)
}

function buildSlotGrid(
  presentSlots: readonly number[],
  step: number,
  endSlotLimit: number,
  padToSessionEnd: boolean,
): number[] {
  const firstSlot = presentSlots[0]
  const lastSlot = padToSessionEnd
    ? Math.max(presentSlots[presentSlots.length - 1], endSlotLimit)
    : presentSlots[presentSlots.length - 1]

  const slotGrid = new Set<number>(presentSlots)

  if (step <= 1) {
    for (let slot = firstSlot; slot <= lastSlot; slot += 1) {
      slotGrid.add(slot)
    }
  } else {
    // Keep morning (<= 150) and afternoon (>= 151) aligned separately so the 1-slot lunch boundary
    // (11:30 -> 13:00) never shifts afternoon grid multiples (13:00, 13:15, 13:30...) off-grid.
    if (firstSlot <= MORNING_END_SLOT) {
      const morningLimit = Math.min(MORNING_END_SLOT, lastSlot)
      for (let slot = firstSlot; slot <= morningLimit; slot += step) {
        slotGrid.add(slot)
      }
    }
    if (lastSlot >= AFTERNOON_OPEN_SLOT) {
      const firstAfternoon =
        presentSlots.find((s) => s >= AFTERNOON_OPEN_SLOT) ?? AFTERNOON_OPEN_SLOT
      const afternoonStart =
        firstSlot >= AFTERNOON_OPEN_SLOT ? firstSlot : Math.min(firstAfternoon, AFTERNOON_OPEN_SLOT)
      for (let slot = afternoonStart; slot <= lastSlot; slot += step) {
        slotGrid.add(slot)
      }
    }
  }

  return Array.from(slotGrid).sort((a, b) => a - b)
}

/**
 * Builds an ordered Lightweight Charts line/area series on the compressed VN intraday timeline.
 * Missing interior minutes (or explicit null/NaN values) become `{ time }` whitespace points
 * so rendered lines never bridge across missing minute gaps, while lunch (`11:30 -> 13:00`) is compressed.
 */
export function buildIntradaySeriesData(
  points: readonly IntradayRawPoint[],
  options?: IntradaySeriesOptions,
): IntradayLinePoint[] {
  const step = Math.max(1, Math.trunc(options?.stepMinutes ?? 1))
  const bounds = resolveBounds(options)
  const endSlotLimit = VN_MORNING_SLOTS + (bounds.endMin - VN_AFTERNOON_START_MIN)
  const bySlot = new Map<number, number | null>()

  for (const pt of points) {
    const slot = timeToCompressedSlot(pt.time, bounds)
    if (slot === null) continue
    const val = pt.value != null && Number.isFinite(pt.value) ? pt.value : null
    bySlot.set(slot, val)
  }

  if (bySlot.size === 0) return []

  const presentSlots = Array.from(bySlot.keys()).sort((a, b) => a - b)
  const orderedSlots = buildSlotGrid(
    presentSlots,
    step,
    endSlotLimit,
    Boolean(options?.padToSessionEnd),
  )
  const out: IntradayLinePoint[] = []

  for (const slot of orderedSlots) {
    const time = slotToChartTime(slot)
    const value = bySlot.get(slot)
    if (value != null) {
      out.push({ time, value })
    } else {
      out.push({ time })
    }
  }

  return out
}

/**
 * Builds an ordered Lightweight Charts histogram series (volume/basis bars) on the compressed
 * VN intraday timeline with whitespace gaps for missing interior slots.
 */
export function buildIntradayHistogramData(
  points: readonly IntradayHistogramRawPoint[],
  options?: IntradaySeriesOptions,
): IntradayHistogramPoint[] {
  const step = Math.max(1, Math.trunc(options?.stepMinutes ?? 1))
  const bounds = resolveBounds(options)
  const endSlotLimit = VN_MORNING_SLOTS + (bounds.endMin - VN_AFTERNOON_START_MIN)
  const bySlot = new Map<number, { value: number; color?: string } | null>()

  for (const pt of points) {
    const slot = timeToCompressedSlot(pt.time, bounds)
    if (slot === null) continue
    if (pt.value != null && Number.isFinite(pt.value)) {
      bySlot.set(slot, { value: pt.value, color: pt.color })
    } else {
      bySlot.set(slot, null)
    }
  }

  if (bySlot.size === 0) return []

  const presentSlots = Array.from(bySlot.keys()).sort((a, b) => a - b)
  const orderedSlots = buildSlotGrid(
    presentSlots,
    step,
    endSlotLimit,
    Boolean(options?.padToSessionEnd),
  )
  const out: IntradayHistogramPoint[] = []

  for (const slot of orderedSlots) {
    const time = slotToChartTime(slot)
    const entry = bySlot.get(slot)
    if (entry != null) {
      out.push(
        entry.color !== undefined
          ? { time, value: entry.value, color: entry.color }
          : { time, value: entry.value },
      )
    } else {
      out.push({ time })
    }
  }

  return out
}
