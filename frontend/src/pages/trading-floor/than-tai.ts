/**
 * Pure rules and wording of the Thần Tài v2 ritual that the browser needs. The server decides the
 * quẻ, the status and the 11:30 deadline; these helpers only turn its answers into screen text.
 * Contract: backend/docs/than-tai/CONTRACT.md · product spec: backend/docs/than-tai/SPEC.md.
 */
import { ApiError } from "@/lib/api"

import type { DirectoryEntry } from "./net/market/types.ts"
import type {
  Direction,
  Hang,
  Hanh,
  ThanTaiStatus,
  ThanTaiToday,
} from "./net/types.ts"

export const THAN_TAI = {
  /** Tickers each person may offer. */
  maxTickers: 3,
  /** Suggestions under the ticker search. */
  maxSuggestions: 8,
  /** Bamboo tube shake, ms. */
  shakeMs: 1500,
  /** Stick flying out of the tube, ms. */
  stickMs: 1000,
  /** Card flip, ms. */
  flipMs: 900,
  /** Coin rain, ms. */
  rainMs: 3000,
  /** A split-bar segment under this percentage prints no number. */
  minLabelPct: 10,
} as const

export const TICKER_RE = /^[A-Z0-9]{3}$/

export const LISTED_EXCHANGES: ReadonlySet<string> = new Set([
  "HOSE",
  "HNX",
  "UPCOM",
])

// ---------- labels and colours ----------

export interface HangMeta {
  label: string
  /** Seal colour. */
  color: string
  /** Two lines printed in the seal. */
  seal: [string, string]
  /** 1–5, how strongly Thần Tài celebrates on the floor. */
  luck: number
}

export const HANG_META: Readonly<Record<Hang, HangMeta>> = {
  dai_cat: {
    label: "Đại cát",
    color: "#C81E1E",
    seal: ["ĐẠI", "CÁT"],
    luck: 5,
  },
  thuong_cat: {
    label: "Thượng cát",
    color: "#C2410C",
    seal: ["THƯỢNG", "CÁT"],
    luck: 4,
  },
  trung_cat: {
    label: "Trung cát",
    color: "#15803D",
    seal: ["TRUNG", "CÁT"],
    luck: 3,
  },
  tieu_cat: {
    label: "Tiểu cát",
    color: "#0E7490",
    seal: ["TIỂU", "CÁT"],
    luck: 2,
  },
  than_trong: {
    label: "Thận trọng",
    color: "#6B5B95",
    seal: ["THẬN", "TRỌNG"],
    luck: 1,
  },
}

export const HANG_ORDER: readonly Hang[] = [
  "dai_cat",
  "thuong_cat",
  "trung_cat",
  "tieu_cat",
  "than_trong",
]

/** Badge colour of each element on the card's day line. */
export const HANH_COLOR: Readonly<Record<Hanh, string>> = {
  kim: "#94A3B8",
  moc: "#16A34A",
  thuy: "#2563EB",
  hoa: "#DC2626",
  tho: "#A16207",
}

export const HANH_LABEL: Readonly<Record<Hanh, string>> = {
  kim: "Kim",
  moc: "Mộc",
  thuy: "Thủy",
  hoa: "Hỏa",
  tho: "Thổ",
}

export const HANH_ORDER: readonly Hanh[] = ["kim", "moc", "thuy", "hoa", "tho"]

export interface DirectionMeta {
  label: string
  color: string
  hint: string
}

export const DIRECTION_META: Readonly<Record<Direction, DirectionMeta>> = {
  up: { label: "Tăng", color: "#16A34A", hint: "Đóng cửa cao hơn tham chiếu" },
  flat: { label: "Đi ngang", color: "#CA8A04", hint: "Thay đổi đúng bằng 0" },
  down: {
    label: "Giảm",
    color: "#DC2626",
    hint: "Đóng cửa thấp hơn tham chiếu",
  },
}

export const DIRECTIONS: readonly Direction[] = ["up", "flat", "down"]

export const STEP_LABELS = [
  "Gieo quẻ",
  "Dự đoán VNINDEX",
  "Cầu mã",
  "Kết quả",
] as const

// ---------- server time ----------

/** Milliseconds to add to the browser clock to read the server clock. */
export function serverOffset(serverTime: number, receivedAt: number): number {
  return Number.isFinite(serverTime) ? serverTime - receivedAt : 0
}

const VN_OFFSET_MS = 7 * 3_600_000

/** `HH:MM` of an instant in Vietnam time (UTC+7), whatever the browser's zone. */
export function vnClock(epochMs: number): string {
  const d = new Date(epochMs + VN_OFFSET_MS)
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mm = String(d.getUTCMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

/** `YYYY-MM-DD` of an instant in Vietnam time. */
export function vnDate(epochMs: number): string {
  return new Date(epochMs + VN_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * The status to show at `now` (server clock). The server's answer can go stale while the altar is
 * open: an unfinished ritual turns `het_gio` once 11:30 passes.
 */
export function effectiveStatus(
  today: Pick<ThanTaiToday, "status" | "deadline">,
  now: number
): ThanTaiStatus {
  if (
    (today.status === "chua_khan" || today.status === "dang_do") &&
    now >= today.deadline
  )
    return "het_gio"
  return today.status
}

// ---------- altar wording ----------

export interface AltarCopy {
  status: string
  button: string
  /** Gold main button, or the ghost one after 11:30. */
  primary: boolean
}

export function altarCopy(status: ThanTaiStatus, drawn: boolean): AltarCopy {
  switch (status) {
    case "chua_khan":
      return {
        status: "Mỗi ngày một lần, trước 11:30.",
        button: "Thành tâm khấn",
        primary: true,
      }
    case "dang_do":
      return {
        status: "Bạn đang khấn dở. Thành tâm làm tiếp nhé.",
        button: "Khấn tiếp",
        primary: true,
      }
    case "da_xong":
      return {
        status: "Lễ đã dâng. Lộc hôm nay đã về với bạn.",
        button: "Xem quẻ và kết quả hôm nay",
        primary: true,
      }
    case "het_gio":
      return {
        status: drawn
          ? "Đã qua 11:30, lượt khấn dở dang khép lại."
          : "Đã qua giờ khấn hôm nay. Hẹn bạn sáng mai.",
        button: "Xem kết quả cả sàn",
        primary: false,
      }
  }
}

/** The step the dialog opens on when the altar button is pressed. */
export function openingStep(
  status: ThanTaiStatus,
  step: ThanTaiToday["step"]
): 1 | 2 | 3 | 4 {
  if (status === "da_xong") return 1
  if (status === "het_gio") return 4
  return status === "chua_khan" ? 1 : step
}

// ---------- results ----------

export interface Segment {
  key: Direction
  count: number
  /** Share with one decimal; the three add up to 100 when anyone predicted. */
  pct: number
  /** Text printed inside the bar, null under 10%. */
  label: string | null
}

const viPct = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 })

/** Three-colour split of the VNINDEX predictions, rounded so the shares add up to 100%. */
export function splitSegments(counts: Record<Direction, number>): Segment[] {
  const total = DIRECTIONS.reduce((s, k) => s + Math.max(0, counts[k]), 0)
  if (!total)
    return DIRECTIONS.map((key) => ({ key, count: 0, pct: 0, label: null }))
  // Largest remainder over tenths of a percent.
  const raw = DIRECTIONS.map((k) => (Math.max(0, counts[k]) / total) * 1000)
  const tenths = raw.map(Math.floor)
  let left = 1000 - tenths.reduce((s, v) => s + v, 0)
  const order = raw
    .map((v, i) => [v - Math.floor(v), i] as const)
    .sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (left <= 0) break
    tenths[i] += 1
    left -= 1
  }
  return DIRECTIONS.map((key, i) => {
    const pct = tenths[i] / 10
    return {
      key,
      count: Math.max(0, counts[key]),
      pct,
      label: pct >= THAN_TAI.minLabelPct ? `${viPct.format(pct)}%` : null,
    }
  })
}

/** Bar width (0–100, % of the longest) of each top ticker. */
export function topWidths(rows: readonly { count: number }[]): number[] {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0)
  return rows.map((r) => (max > 0 ? (r.count / max) * 100 : 0))
}

// ---------- formatting ----------

const viRef = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const viInt = new Intl.NumberFormat("vi-VN")

/** "1.746,90". */
export function formatRef(value: number): string {
  return viRef.format(value)
}

/** "1.284". */
export function formatCount(value: number): string {
  return viInt.format(value)
}

// ---------- hexagram ----------

/** Six lines bottom first: true = yang (solid). Anything malformed reads as yin. */
export function hexLines(hao: string): boolean[] {
  return Array.from({ length: 6 }, (_, i) => hao[i] === "1")
}

// ---------- ticker search ----------

/** Listed stocks matching the search, minus those already chosen; `search` is `searchDirectory`. */
export function tickerSuggestions(
  found: readonly DirectoryEntry[],
  chosen: readonly string[]
): DirectoryEntry[] {
  return found
    .filter(
      (e) =>
        LISTED_EXCHANGES.has(e.exchange.toUpperCase()) &&
        TICKER_RE.test(e.symbol) &&
        !chosen.includes(e.symbol)
    )
    .slice(0, THAN_TAI.maxSuggestions)
}

/** Exchange as printed: "UPCoM" like the spec. */
export function exchangeLabel(exchange: string): string {
  const e = exchange.toUpperCase()
  return e === "UPCOM" ? "UPCoM" : e
}

// ---------- errors ----------

export const MSG_HET_GIO = "Đã qua 11:30, không khấn tiếp được"
export const MSG_NETWORK = "Chưa gửi được, bạn thử lại nhé"

const CODE_TEXT: Readonly<Record<string, string>> = {
  HET_GIO: MSG_HET_GIO,
  CHUA_GIEO_QUE: "Bạn chưa gieo quẻ hôm nay.",
  DA_DU_DOAN: "Bạn đã dự đoán VNINDEX hôm nay rồi.",
  CHUA_DU_DOAN: "Bạn cần dự đoán VNINDEX trước khi cầu mã.",
  DA_CAU: "Bạn đã dâng lễ cầu mã hôm nay rồi.",
  MA_KHONG_HOP_LE: "Có mã không hợp lệ. Chỉ nhận cổ phiếu HOSE, HNX, UPCoM.",
  QUA_3_MA: "Chỉ được cầu tối đa 3 mã.",
  KET_QUA_CHUA_MO: "Kết quả cả sàn mở sau 11:30, hoặc ngay khi bạn khấn xong.",
}

export type FailKind = "het_gio" | "network" | "known" | "other"

export interface Failure {
  kind: FailKind
  code: string | null
  text: string
}

/** Sorts an error of a Thần Tài call into what the screen should do and say. */
export function describeFailure(error: unknown): Failure {
  if (error instanceof ApiError) {
    const code = error.code ?? null
    if (code === "HET_GIO") return { kind: "het_gio", code, text: MSG_HET_GIO }
    if (error.status >= 500 || error.status === 0)
      return { kind: "network", code, text: MSG_NETWORK }
    if (code && CODE_TEXT[code])
      return { kind: "known", code, text: CODE_TEXT[code] }
    if (error.status === 429)
      return {
        kind: "other",
        code,
        text: "Bạn thao tác hơi nhanh, đợi chút rồi thử lại nhé.",
      }
    return {
      kind: "other",
      code,
      text: "Có lỗi xảy ra, bạn thử lại sau ít phút nhé.",
    }
  }
  return { kind: "network", code: null, text: MSG_NETWORK }
}

/** Codes that mean "this step is already done on the server": reload today and move on. */
export function isAlreadyDone(code: string | null): boolean {
  return code === "DA_DU_DOAN" || code === "DA_CAU"
}
