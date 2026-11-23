import { AVATAR_STYLE_PRESETS } from "@/lib/chibi-3d/types.ts"

import type { OfficeHudCollapseState } from "./types.ts"

export const OFFICE_HUD_STORAGE_KEY = "iqx.office.hud.mini.v1"

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000
const DATE_YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH_YM_RE = /^(\d{4})-(\d{2})$/
const DAY_MS = 86_400_000

const VI_WEEKDAYS = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
] as const

const FEMALE_NAME_HINTS = new Set([
  "thi",
  "ngoc",
  "phuong",
  "huong",
  "hanh",
  "linh",
  "ly",
  "trang",
  "anh",
  "mai",
  "lan",
  "hoa",
  "thao",
  "nhi",
  "vy",
  "my",
  "quynh",
  "trinh",
  "thu",
  "ha",
  "yen",
  "nhung",
  "van",
  "chau",
  "uyen",
  "ngan",
  "suong",
  "loan",
])

const MALE_AVATARS = ["male01", "male02", "male03", "male04", "male05"] as const
const FEMALE_AVATARS = [
  "female01",
  "female02",
  "female03",
  "female04",
  "female05",
] as const

const pad2 = (value: number): string => String(value).padStart(2, "0")

export interface DateYmd {
  readonly year: number
  readonly month: number
  readonly day: number
}

export interface OfficeTenureParts {
  readonly years: number
  readonly months: number
  readonly days: number
  readonly label: string
}

/** Case- and Vietnamese diacritic-insensitive normalization for search. */
export function normalizeVi(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim()
}

/** Strict calendar parsing for `YYYY-MM-DD` without local/UTC timezone drift. */
export function parseDateYmd(isoDate: string): DateYmd | null {
  const match = DATE_YMD_RE.exec(isoDate.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const check = new Date(Date.UTC(year, month - 1, day))
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null
  }
  return { year, month, day }
}

function toIctDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getTime() + ICT_OFFSET_MS)
}

/** Current Vietnam (UTC+7) calendar date formatted `YYYY-MM-DD`. */
export function formatTodayIct(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + ICT_OFFSET_MS)
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`
}

/** Current Vietnam (UTC+7) period month formatted `YYYY-MM`. */
export function formatMonthIct(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + ICT_OFFSET_MS)
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}`
}

/** True on Monday–Friday in Vietnam timezone (UTC+7). */
export function isWorkdayToday(nowOrIso: Date | string = new Date()): boolean {
  if (typeof nowOrIso === "string") {
    const parsed = parseDateYmd(nowOrIso)
    if (parsed) {
      const weekday = new Date(
        Date.UTC(parsed.year, parsed.month - 1, parsed.day)
      ).getUTCDay()
      return weekday !== 0 && weekday !== 6
    }
    const shifted = toIctDate(nowOrIso)
    if (!shifted) return false
    const weekday = shifted.getUTCDay()
    return weekday !== 0 && weekday !== 6
  }
  const shifted = new Date(nowOrIso.getTime() + ICT_OFFSET_MS)
  const weekday = shifted.getUTCDay()
  return weekday !== 0 && weekday !== 6
}

/**
 * Computes exact calendar tenure from integer `(Y, M, D)` without UTC drift.
 * Uses clamped calendar month anchoring and omits zero units (`"2 năm 3 tháng"`, `"9 ngày"`).
 */
export function computeTenureParts(
  joinDate: string,
  todayDate: string
): OfficeTenureParts {
  const start = parseDateYmd(joinDate)
  const end = parseDateYmd(todayDate)
  if (!start || !end || joinDate >= todayDate) {
    return { years: 0, months: 0, days: 0, label: "0 ngày" }
  }

  const endUtcMs = Date.UTC(end.year, end.month - 1, end.day)
  const anchorUtcMs = (addMonths: number): number => {
    const totalMonths = start.year * 12 + (start.month - 1) + addMonths
    const y = Math.floor(totalMonths / 12)
    const m = (totalMonths % 12) + 1
    const maxDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return Date.UTC(y, m - 1, Math.min(start.day, maxDay))
  }

  let totalMonths = (end.year - start.year) * 12 + (end.month - start.month)
  if (anchorUtcMs(totalMonths) > endUtcMs) {
    totalMonths -= 1
  }
  totalMonths = Math.max(0, totalMonths)

  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  const days = Math.max(
    0,
    Math.round((endUtcMs - anchorUtcMs(totalMonths)) / DAY_MS)
  )

  const chunks: string[] = []
  if (years > 0) chunks.push(`${years} năm`)
  if (months > 0) chunks.push(`${months} tháng`)
  if (days > 0) chunks.push(`${days} ngày`)

  return {
    years,
    months,
    days,
    label: chunks.length > 0 ? chunks.join(" ") : "0 ngày",
  }
}

/** Exact `{y} năm {m} tháng {d} ngày` omitting zero units, zero UTC drift. */
export function formatTenureVi(joinDate: string, todayDate: string): string {
  return computeTenureParts(joinDate, todayDate).label
}

/** Formats `YYYY-MM-DD` or ISO timestamp into `dd/mm` (UTC+7). */
export function formatDayMonth(isoDate: string): string {
  const parsed = parseDateYmd(isoDate)
  if (parsed) {
    return `${pad2(parsed.day)}/${pad2(parsed.month)}`
  }
  const shifted = toIctDate(isoDate)
  if (!shifted) return isoDate
  return `${pad2(shifted.getUTCDate())}/${pad2(shifted.getUTCMonth() + 1)}`
}

/** Formats `YYYY-MM-DD` or ISO timestamp into `dd/mm/yyyy` (UTC+7). */
export function formatFullDate(isoDate: string): string {
  const parsed = parseDateYmd(isoDate)
  if (parsed) {
    return `${pad2(parsed.day)}/${pad2(parsed.month)}/${parsed.year}`
  }
  const shifted = toIctDate(isoDate)
  if (!shifted) return isoDate
  return `${pad2(shifted.getUTCDate())}/${pad2(shifted.getUTCMonth() + 1)}/${shifted.getUTCFullYear()}`
}

/** Formats an ISO timestamp into `HH:mm` in Vietnam timezone (UTC+7). */
export function formatHm(isoTimestamp: string): string {
  const shifted = toIctDate(isoTimestamp)
  if (!shifted) return ""
  return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`
}

/** Formats meeting start time & platform for wall screen / meeting modal in UTC+7. */
export function formatMeetingScheduleVi(
  startsAt: string,
  durationMinutes?: number,
  platform?: string
): string {
  const shifted = toIctDate(startsAt)
  if (!shifted) return platform ?? ""
  const weekday = VI_WEEKDAYS[shifted.getUTCDay()] ?? ""
  const datePart = `${pad2(shifted.getUTCDate())}/${pad2(shifted.getUTCMonth() + 1)}`
  const startHm = `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`
  let timePart = startHm
  if (durationMinutes && durationMinutes > 0) {
    const endShifted = new Date(shifted.getTime() + durationMinutes * 60_000)
    const endHm = `${pad2(endShifted.getUTCHours())}:${pad2(endShifted.getUTCMinutes())}`
    timePart = `${startHm}–${endHm}`
  }
  const parts = [`${weekday} ${datePart}`, timePart]
  if (platform?.trim()) parts.push(platform.trim())
  return parts.join(" · ")
}

/** Formats byte counts into readable B / KB / MB strings. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const kb = bytes / 1024
  if (kb < 1024) {
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  }
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/**
 * Computes the `dd/mm` next-month reset label for `periodMonth` (`YYYY-MM`),
 * handling December → January year rollover cleanly (`"2026-12" -> "01/01"`).
 */
export function nextMonthResetLabel(periodMonth: string): string {
  const match = MONTH_YM_RE.exec(periodMonth.trim())
  if (!match) return "01/01"
  const month = Number(match[2])
  if (month < 1 || month > 12) return "01/01"
  const nextMonth = month === 12 ? 1 : month + 1
  return `01/${pad2(nextMonth)}`
}

/** Extracts 1–12 month number from `YYYY-MM`. */
export function monthNumberFromPeriod(periodMonth: string): number {
  const match = MONTH_YM_RE.exec(periodMonth.trim())
  if (!match) return new Date(Date.now() + ICT_OFFSET_MS).getUTCMonth() + 1
  const month = Number(match[2])
  return month >= 1 && month <= 12 ? month : 1
}

/** Returns the last calendar date `YYYY-MM-DD` of `periodMonth` (`YYYY-MM`). */
export function monthEndDate(periodMonth: string): string {
  const match = MONTH_YM_RE.exec(periodMonth.trim())
  if (!match) return formatTodayIct()
  const year = Number(match[1])
  const month = Number(match[2])
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${pad2(month)}-${pad2(lastDay)}`
}

/** Computes 1–2 uppercase initials for Vietnamese names. */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0] ?? ""}${words[words.length - 1][0] ?? ""}`.toUpperCase()
}

/** Reads persisted HUD card collapse map (`localStorage["iqx.office.hud.mini.v1"]`). */
export function readHudCollapseState(): OfficeHudCollapseState {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(OFFICE_HUD_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }
    const result: OfficeHudCollapseState = {}
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (typeof value === "boolean") {
        result[key] = value
      }
    }
    return result
  } catch {
    return {}
  }
}

/** Persists HUD card collapse map to `localStorage["iqx.office.hud.mini.v1"]`. */
export function writeHudCollapseState(map: OfficeHudCollapseState): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(OFFICE_HUD_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Ignore storage quota or private browsing errors.
  }
}

function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Resolves a member's 3D Chibi avatar preset ID from their Trading Floor avatar
 * or deterministically assigns one consistent with Vietnamese name hints.
 */
export function resolveOfficeAvatarId(
  userId: string,
  avatar: string | null | undefined,
  displayName?: string,
  isBoss = false
): string {
  if (avatar && avatar in AVATAR_STYLE_PRESETS) {
    return avatar
  }
  if (isBoss) return "male04"
  const words = displayName ? normalizeVi(displayName).split(/\s+/) : []
  const likelyFemale = words.some((word, idx) =>
    idx > 0 ? FEMALE_NAME_HINTS.has(word) : false
  )
  const pool = likelyFemale ? FEMALE_AVATARS : MALE_AVATARS
  return pool[hashString(userId) % pool.length] ?? "male02"
}
