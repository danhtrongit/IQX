import {
  computeCap1PortfolioAnalysis,
  type Cap1PortfolioAnalysisResult,
  type MauPhatHien,
  type ReasonRow,
} from "@/features/cap1/portfolioAnalysis"
import type { Cap1TradeRecord } from "@/features/cap1/tradeLog"
import { LY_DO_OPTIONS, type LyDo } from "@/features/cap1/types"
import type { Cap2Progress, XepLoai } from "./types"

/**
 * Cấp 2 Phân tích danh mục (spec `IQX-Cap2-Spec.md` §12) — pure compute.
 *
 * **Delegation, not duplication:** Khối 1 (hồ sơ tổng quan), Khối 2 (bảng
 * thắng/thua theo 5 lý do) and mẫu 1-3 (`vu_khi_rieng`/`diem_mu`/
 * `co_so_dang_gia`) are 100% delegated to `computeCap1PortfolioAnalysis` —
 * this module never re-implements that math. `progress` is intentionally
 * passed as `null` to that call: Cấp 1's khối1/khối2/mẫu1-3 never read
 * `progress` (only ITS khối3/khối4 do, which Cấp 2 replaces below), so this
 * is safe and avoids requiring a `Cap1Progress` the Cấp 2 caller doesn't have.
 *
 * **Known limitation (documented, not silently swallowed):**
 * `computeCap1PortfolioAnalysis` caps its OWN `mauPhatHien` at 2 internally
 * (not configurable, not exported as an uncapped list) — so when a 3rd Cấp-1
 * pattern (mẫu 1/2/3) would also qualify, Cấp 1's own cap may have already
 * hidden it before this module ever sees it. This module's own §12 priority
 * ordering + 3-mẫu cap therefore operates on "Cấp 1's already-capped ≤2" as
 * one opaque input, not a fully uncapped pool of 3 — acceptable since Cấp 1's
 * file is out of this task's ownership (cannot add an uncapped export there).
 *
 * **§12 adjustments to Cấp 1's Khối 3/Khối 4 (NOT delegated — replaced):**
 * per spec, Khối 3 becomes "danh sách vi phạm dùng 4 loại của Cấp 2" and Khối
 * 4 becomes "Cửa sổ 20 lệnh + điều kiện lên Cấp 3" — neither resembles Cấp
 * 1's original Khối3 (5-lý-do coverage grid) or Khối4 (6-nhiệm-vụ checklist),
 * so those two are computed fresh here from Cấp-2-specific data.
 *
 * **Honesty over fake data (per task brief):** the backend only exposes
 * TODAY's điểm kỷ luật (`GET /cap2/diem-ky-luat?ngay=`) — there is no
 * "list last 30 days" endpoint, and no BE endpoint lists closed
 * `order_kehoach`/`order_ketso` rows either (the exact same gap
 * `cap1/tradeLog.ts` already documents for Cấp 1). This module therefore
 * takes already-assembled `Cap2TradeRecord[]`/`Cap2DailyScoreRecord[]` as
 * plain parameters — pure compute, no fetching — and the caller is
 * responsible for accumulating that history (e.g. a Cấp-2 equivalent of
 * `useCap1TradeLog`/a daily-score log, out of this task's file-ownership
 * scope). Wherever the given history is too short to say something true
 * (< the thresholds below), every computed block returns an explicit
 * `note`/`insufficientNote` string instead of a fabricated number — the UI
 * renders that note, never a fake 0 or an invented average.
 */

// ── Cấp 2 trade record (client-side closed-trade log analogue) ──────────────

/**
 * A closed Cấp 2 order — Cấp 1's `Cap1TradeRecord` fields (lý do, P&L, …)
 * plus the 4 vi phạm flags `order_ketso` carries (spec §13) and the optional
 * "ghi chú nhìn lại" text captured in Kết sổ when a vi phạm happens (spec
 * §12 Khối 7). Field names mirror the wire's `cham_SL_khong_cat`-style
 * mixed-case convention via camelCase, same as `Cap1TradeRecord.lyDo`.
 */
export interface Cap2TradeRecord extends Cap1TradeRecord {
  chamSlKhongCat: boolean
  chamTpGiuLamHut: boolean
  banSomKhiLoNhe: boolean
  nhoiLenhKhiLo: boolean
  ghiChuNhinLai?: string | null
}

/** One day's điểm kỷ luật (spec §7), as returned by `GET /cap2/diem-ky-luat?ngay=`. */
export interface Cap2DailyScoreRecord {
  /** YYYY-MM-DD. */
  ngay: string
  diem: number
  xepLoai: XepLoai
}

export type ViPhamLoai = "cat_lo_cham" | "chot_loi_hut" | "ban_som_khi_lo" | "nhoi_lenh"

export const VI_PHAM_LOAI_LABELS: Record<ViPhamLoai, string> = {
  cat_lo_cham: "Cắt lỗ chậm",
  chot_loi_hut: "Chốt lời hụt",
  ban_som_khi_lo: "Bán sớm khi lỗ nhẹ",
  nhoi_lenh: "Nhồi lệnh khi lỗ",
}

const VI_PHAM_LOAI_ORDER: readonly ViPhamLoai[] = [
  "cat_lo_cham",
  "chot_loi_hut",
  "ban_som_khi_lo",
  "nhoi_lenh",
]

function viPhamLoaiOf(t: Cap2TradeRecord): ViPhamLoai[] {
  const out: ViPhamLoai[] = []
  if (t.chamSlKhongCat) out.push("cat_lo_cham")
  if (t.chamTpGiuLamHut) out.push("chot_loi_hut")
  if (t.banSomKhiLoNhe) out.push("ban_som_khi_lo")
  if (t.nhoiLenhKhiLo) out.push("nhoi_lenh")
  return out
}

function isViPham(t: Cap2TradeRecord): boolean {
  return viPhamLoaiOf(t).length > 0
}

function round(n: number): number {
  return Math.round(n)
}

// ── date helpers (epoch-ms arithmetic — TZ-safe; weekday uses UTC) ──────────

const MS_PER_DAY = 24 * 60 * 60 * 1000

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * MS_PER_DAY)
}

function withinDays(iso: string, now: Date, days: number): boolean {
  const t = new Date(iso).getTime()
  return t >= daysAgo(now, days).getTime() && t <= now.getTime()
}

// ── Khối 3 (§12 adjustment) — vi phạm theo 4 loại, cửa sổ 30 ngày ────────────

const KHOI3_WINDOW_DAYS = 30

export interface Khoi3ViPhamRow {
  loai: ViPhamLoai
  label: string
  count: number
  /** % of `totalViPham` (null when there are 0 vi phạm to divide by). */
  pct: number | null
}

export interface Cap2Khoi3 {
  windowDays: number
  totalTrades: number
  totalViPham: number
  rows: Khoi3ViPhamRow[]
  note: string | null
}

function computeKhoi3(trades30d: Cap2TradeRecord[]): Cap2Khoi3 {
  const counts: Record<ViPhamLoai, number> = {
    cat_lo_cham: 0,
    chot_loi_hut: 0,
    ban_som_khi_lo: 0,
    nhoi_lenh: 0,
  }
  let totalViPham = 0
  for (const t of trades30d) {
    for (const loai of viPhamLoaiOf(t)) {
      counts[loai]++
      totalViPham++
    }
  }
  const rows = VI_PHAM_LOAI_ORDER.map((loai) => ({
    loai,
    label: VI_PHAM_LOAI_LABELS[loai],
    count: counts[loai],
    pct: totalViPham > 0 ? round((counts[loai] / totalViPham) * 100) : null,
  }))
  return {
    windowDays: KHOI3_WINDOW_DAYS,
    totalTrades: trades30d.length,
    totalViPham,
    rows,
    note:
      trades30d.length === 0
        ? `Chưa có lệnh Thực chiến nào trong ${KHOI3_WINDOW_DAYS} ngày qua để phân tích vi phạm.`
        : null,
  }
}

// ── Khối 4 (§12 adjustment) — cửa sổ 20 lệnh + điều kiện lên Cấp 3 ───────────

const KHOI4_WINDOW_SIZE = 20
const KHOI4_MAX_VI_PHAM = 2

export interface Khoi4Cell {
  orderId: string
  viPham: boolean
}

export interface Cap2Khoi4 {
  windowSize: number
  hasFullWindow: boolean
  violationsInWindow: number
  cells: Khoi4Cell[]
  /** Server-authoritative (nhiệm vụ ⑤ = `progress.task_5_done_at`) — NOT
   * re-derived from the (best-effort, possibly-incomplete) client trade log. */
  readyToGraduate: boolean
  note: string
}

function computeKhoi4(trades: Cap2TradeRecord[], progress: Cap2Progress | null): Cap2Khoi4 {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime(),
  )
  const windowSize = Math.min(KHOI4_WINDOW_SIZE, sorted.length)
  const windowTrades = sorted.slice(sorted.length - windowSize)
  const cells: Khoi4Cell[] = windowTrades.map((t) => ({ orderId: t.orderId, viPham: isViPham(t) }))
  const violationsInWindow = cells.filter((c) => c.viPham).length
  const hasFullWindow = sorted.length >= KHOI4_WINDOW_SIZE
  const readyToGraduate = progress?.task_5_done_at != null

  const note = readyToGraduate
    ? "Đủ điều kiện lên Cấp 3 «Bản lĩnh» (theo hồ sơ máy chủ)."
    : !hasFullWindow
      ? `Cần đủ 20 lệnh Thực chiến để tính điều kiện lên Cấp 3 (nhật ký trên trình duyệt này hiện có ${sorted.length}/${KHOI4_WINDOW_SIZE}).`
      : `Cửa sổ 20 lệnh gần nhất: ${violationsInWindow} vi phạm — cần ≤${KHOI4_MAX_VI_PHAM} để đủ điều kiện lên Cấp 3.`

  return { windowSize, hasFullWindow, violationsInWindow, cells, readyToGraduate, note }
}

// ── Khối 5 — điểm kỷ luật 30 ngày ─────────────────────────────────────────────

const KHOI5_SERIES_DAYS = 30
const KHOI5_AVG7_DAYS = 7
const KHOI5_MIN_FOR_AVERAGES = 7

export interface Cap2Khoi5 {
  /** Chronological (oldest→newest), capped at the most recent 30 entries. */
  series: Cap2DailyScoreRecord[]
  avg7: number | null
  avg30: number | null
  distribution: { xanh: number; vang: number; do: number }
  insufficientNote: string | null
}

/** Khối 5 (spec §12) — pure compute over whatever daily điểm kỷ luật history
 * the caller has assembled (see module docstring on why the BE can't supply
 * a 30-day list directly). Never invents a day that isn't in `dailyScores`. */
export function computeKhoi5Cap2(dailyScores: Cap2DailyScoreRecord[]): Cap2Khoi5 {
  const sorted = [...dailyScores].sort((a, b) => a.ngay.localeCompare(b.ngay))
  const last30 = sorted.slice(-KHOI5_SERIES_DAYS)
  const last7 = sorted.slice(-KHOI5_AVG7_DAYS)

  const avg = (arr: Cap2DailyScoreRecord[]): number | null =>
    arr.length > 0 ? round(arr.reduce((sum, r) => sum + r.diem, 0) / arr.length) : null

  const distribution = { xanh: 0, vang: 0, do: 0 }
  for (const r of last30) distribution[r.xepLoai]++

  const insufficientNote =
    last30.length === 0
      ? "Chưa có ngày nào được chấm điểm kỷ luật."
      : last30.length < KHOI5_MIN_FOR_AVERAGES
        ? `Mới có ${last30.length} ngày dữ liệu điểm kỷ luật — cần thêm để tính trung bình 7/30 ngày đáng tin cậy.`
        : null

  return { series: last30, avg7: avg(last7), avg30: avg(last30), distribution, insufficientNote }
}

// ── Khối 6 — phân loại vi phạm theo tuần ──────────────────────────────────────

const KHOI6_WEEKS = 4
const KHOI6_WINDOW_DAYS = KHOI6_WEEKS * 7
const KHOI6_MIN_TRADES_FOR_TREND = 4

export interface Khoi6WeekRow {
  /** 0 = oldest week, 3 = most recent week. */
  weekIndex: number
  startDate: string
  endDate: string
  counts: Record<ViPhamLoai, number>
  total: number
}

export type Khoi6Trend = "cai_thien" | "xau_di" | "on_dinh" | "khong_du_du_lieu"

export interface Cap2Khoi6 {
  weeks: Khoi6WeekRow[]
  trend: Khoi6Trend
  trendNote: string
}

/** Khối 6 (spec §12) — groups the last 4 tuần (28 ngày) of trades into 4
 * weekly buckets x 4 loại vi phạm, then compares the 2 oldest weeks' total
 * against the 2 newest weeks' total for a directional "xu hướng" call. Needs
 * `now` explicitly (no implicit `Date.now()`) to stay deterministic/testable. */
export function computeKhoi6Cap2(trades: Cap2TradeRecord[], now: Date): Cap2Khoi6 {
  const windowTrades = trades.filter((t) => withinDays(t.closedAt, now, KHOI6_WINDOW_DAYS))

  const weeks: Khoi6WeekRow[] = []
  for (let w = 0; w < KHOI6_WEEKS; w++) {
    const daysAgoStart = KHOI6_WINDOW_DAYS - w * 7
    const daysAgoEnd = daysAgoStart - 7
    const start = daysAgo(now, daysAgoStart)
    const end = daysAgo(now, daysAgoEnd)
    const inWeek = windowTrades.filter((t) => {
      const ts = new Date(t.closedAt).getTime()
      return ts >= start.getTime() && ts < end.getTime()
    })
    const counts: Record<ViPhamLoai, number> = {
      cat_lo_cham: 0,
      chot_loi_hut: 0,
      ban_som_khi_lo: 0,
      nhoi_lenh: 0,
    }
    for (const t of inWeek) for (const loai of viPhamLoaiOf(t)) counts[loai]++
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    weeks.push({
      weekIndex: w,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      counts,
      total,
    })
  }

  const totalTrades = windowTrades.length
  let trend: Khoi6Trend
  let trendNote: string

  if (totalTrades < KHOI6_MIN_TRADES_FOR_TREND) {
    trend = "khong_du_du_lieu"
    trendNote = `Cần thêm dữ liệu (hiện ${totalTrades} lệnh trong ${KHOI6_WEEKS} tuần qua) để nhận định xu hướng.`
  } else {
    const olderHalf = weeks[0].total + weeks[1].total
    const newerHalf = weeks[2].total + weeks[3].total
    if (olderHalf === 0 && newerHalf === 0) {
      trend = "on_dinh"
      trendNote = "Không có vi phạm nào trong 4 tuần qua."
    } else if (newerHalf < olderHalf) {
      trend = "cai_thien"
      trendNote = `Vi phạm đang giảm: ${olderHalf} (2 tuần đầu) → ${newerHalf} (2 tuần gần đây). Xu hướng đang tốt lên.`
    } else if (newerHalf > olderHalf) {
      trend = "xau_di"
      trendNote = `Vi phạm đang tăng: ${olderHalf} (2 tuần đầu) → ${newerHalf} (2 tuần gần đây). Xu hướng đang xấu đi.`
    } else {
      trend = "on_dinh"
      trendNote = `Vi phạm ổn định quanh ${newerHalf} lần mỗi 2 tuần.`
    }
  }

  return { weeks, trend, trendNote }
}

// ── Khối 7 — phát hiện từ ghi chú (6 pattern nội tâm) ─────────────────────────

const KHOI7_MIN_NOTES = 3

export type ReflectionPatternId =
  | "loss_aversion"
  | "chi_so_hoa"
  | "fomo"
  | "tin_tuc"
  | "khong_tin_phan_tich"
  | "cam_xuc_manh"

interface ReflectionPatternDef {
  keywords: readonly string[]
  insight: string
}

/** spec §12 — 6 pattern nội tâm có sẵn, mỗi pattern 1 câu diễn giải + gợi ý cấp sau. */
const REFLECTION_PATTERNS: Record<ReflectionPatternId, ReflectionPatternDef> = {
  loss_aversion: {
    keywords: ["sợ mất", "tiếc", "không muốn thua", "chờ hồi"],
    insight: "Đây là loss aversion điển hình. Nghiên cứu: nỗi đau mất lãi ≈ 2× niềm vui giữ lãi.",
  },
  chi_so_hoa: {
    keywords: ["vn-index", "thị trường", "toàn thị trường"],
    insight:
      "Có phải bạn phản ứng với chỉ số hơn là với mã? Cấp 3 «Bản lĩnh» sẽ dạy tách quyết định khỏi kết quả.",
  },
  fomo: {
    keywords: ["sợ bỏ lỡ", "mọi người mua", "hot", "sốt"],
    insight: "Đây là FOMO — quyết định theo đám đông thay vì phân tích riêng của bạn.",
  },
  tin_tuc: {
    keywords: ["tin", "báo", "công bố"],
    insight: "Tin tức thay đổi nhanh — thử đối chiếu với kế hoạch gốc trước khi phản ứng theo tin.",
  },
  khong_tin_phan_tich: {
    keywords: ["không chắc", "nghi ngờ", "không tin"],
    insight: "Nếu không tin phân tích của chính mình, có thể cách chọn lý do (§4) cần cơ sở chắc hơn.",
  },
  cam_xuc_manh: {
    keywords: ["hoảng", "sợ", "tức", "buồn"],
    insight: "Cảm xúc mạnh lúc quyết định thường dẫn đến vi phạm kế hoạch — quan sát trạng thái trước khi đặt lệnh.",
  },
}

const REFLECTION_PATTERN_ORDER: readonly ReflectionPatternId[] = [
  "loss_aversion",
  "chi_so_hoa",
  "fomo",
  "tin_tuc",
  "khong_tin_phan_tich",
  "cam_xuc_manh",
]

export interface Khoi7Insight {
  patternId: ReflectionPatternId
  matchedCount: number
  totalNotes: number
  /** The most-frequently-matched keyword within this pattern's notes — the
   * "cụm từ" quoted in `text` (never a fabricated snippet). */
  keyword: string
  text: string
}

export interface Cap2Khoi7 {
  totalNotes: number
  insights: Khoi7Insight[]
  insufficientNote: string | null
}

/** Khối 7 (spec §12) — "4 tuần gần nhất" scan of ghi chú nhìn lại recorded
 * against vi-phạm trades (ghi chú on a clean trade is never scanned — the
 * spec's own trigger is "khi có vi phạm"). Requires >=3 non-empty ghi chú
 * before showing anything; otherwise an honest "chưa đủ ghi chú" note. */
export function computeKhoi7Cap2(trades: Cap2TradeRecord[], now: Date): Cap2Khoi7 {
  const windowTrades = trades.filter((t) => withinDays(t.closedAt, now, KHOI6_WINDOW_DAYS))
  const notes = windowTrades
    .filter((t) => isViPham(t) && !!t.ghiChuNhinLai && t.ghiChuNhinLai.trim().length > 0)
    .map((t) => t.ghiChuNhinLai!.trim())

  const totalNotes = notes.length
  if (totalNotes < KHOI7_MIN_NOTES) {
    return {
      totalNotes,
      insights: [],
      insufficientNote: `Cần ít nhất ${KHOI7_MIN_NOTES} ghi chú nhìn lại (ghi khi có vi phạm) để tìm mẫu nội tâm — hiện có ${totalNotes}.`,
    }
  }

  const insights: Khoi7Insight[] = []
  for (const patternId of REFLECTION_PATTERN_ORDER) {
    const { keywords, insight } = REFLECTION_PATTERNS[patternId]
    const keywordHitCounts: Record<string, number> = {}
    let matchedCount = 0
    for (const note of notes) {
      const lower = note.toLowerCase()
      const hit = keywords.find((kw) => lower.includes(kw))
      if (hit) {
        matchedCount++
        keywordHitCounts[hit] = (keywordHitCounts[hit] ?? 0) + 1
      }
    }
    if (matchedCount > 0) {
      const keyword = Object.entries(keywordHitCounts).sort((a, b) => b[1] - a[1])[0][0]
      insights.push({
        patternId,
        matchedCount,
        totalNotes,
        keyword,
        text: `${matchedCount}/${totalNotes} lần liên quan cụm từ "${keyword}". ${insight}`,
      })
    }
  }
  insights.sort((a, b) => b.matchedCount - a.matchedCount)

  return { totalNotes, insights, insufficientNote: null }
}

// ── mẫu 9-12 (§12) ────────────────────────────────────────────────────────────

const MAU9_MIN_TOTAL = 5
const MAU9_MIN_SHARE = 0.5
const MAU10_MIN_TRADES = 5
const MAU10_MIN_RATE = 0.3
const MAU11_MIN_TOTAL = 5
const MAU11_MIN_SHARE = 0.6
const MAU12_MIN_DAYS = 14
const MAU12_MIN_GAP = 5
const MAX_MAU_CAP2 = 3

export type MauPhatHienCap2Id =
  | "vu_khi_rieng"
  | "diem_mu"
  | "co_so_dang_gia"
  | "mau9_loai_pho_bien"
  | "mau10_ly_do_be_ke_hoach"
  | "mau11_ngay_trong_tuan"
  | "mau12_xu_huong"

export interface MauPhatHienCap2 {
  id: MauPhatHienCap2Id
  text: string
}

function detectMau9(khoi3: Cap2Khoi3): MauPhatHienCap2 | null {
  if (khoi3.totalViPham < MAU9_MIN_TOTAL) return null
  const top = khoi3.rows.reduce((a, b) => (b.count > a.count ? b : a))
  if (top.count === 0) return null
  const share = top.count / khoi3.totalViPham
  if (share < MAU9_MIN_SHARE) return null
  return {
    id: "mau9_loai_pho_bien",
    text: `Vi phạm phổ biến nhất: ${top.label} (${round(share * 100)}% tổng). Đây là điểm yếu chính cần khắc phục.`,
  }
}

interface LyDoViPhamStat {
  lyDo: LyDo
  total: number
  viPham: number
}

function lyDoViPhamStats(trades30d: Cap2TradeRecord[]): LyDoViPhamStat[] {
  return LY_DO_OPTIONS.map((opt) => {
    const forLyDo = trades30d.filter((t) => t.lyDo === opt.value)
    return { lyDo: opt.value, total: forLyDo.length, viPham: forLyDo.filter(isViPham).length }
  })
}

function detectMau10(trades30d: Cap2TradeRecord[]): MauPhatHienCap2 | null {
  const stats = lyDoViPhamStats(trades30d)
  const qualifying = stats.filter(
    (s) => s.total >= MAU10_MIN_TRADES && s.viPham / s.total >= MAU10_MIN_RATE,
  )
  if (qualifying.length === 0) return null
  const worst = qualifying.reduce((a, b) => (b.viPham / b.total > a.viPham / a.total ? b : a))
  const others = stats.filter((s) => s.lyDo !== worst.lyDo)
  const othersViPham = others.reduce((sum, o) => sum + o.viPham, 0)
  const othersTotal = others.reduce((sum, o) => sum + o.total, 0)
  const othersRate = othersTotal > 0 ? (othersViPham / othersTotal) * 100 : 0
  const opt = LY_DO_OPTIONS.find((o) => o.value === worst.lyDo)!
  return {
    id: "mau10_ly_do_be_ke_hoach",
    text: `Với lý do ${opt.icon} ${opt.label}, bạn vi phạm ${round((worst.viPham / worst.total) * 100)}% lệnh. Các lý do khác chỉ ${round(othersRate)}%. Có phải lệnh ${opt.label} làm bạn nghi ngờ nhiều hơn?`,
  }
}

const WEEKDAY_LABELS = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
]

/** Best-effort canned gợi ý per ngày trong tuần (spec only gives Thứ Sáu's
 * wording verbatim as an example — the rest follow the same tone). The DAY
 * itself is always real (from `closedAt`); only this phrasing is a template. */
const WEEKDAY_HINTS: Record<number, string> = {
  0: "cuối tuần khiến bạn lơ là kế hoạch?",
  1: "đầu tuần vội vào lệnh theo cảm xúc cuối tuần trước?",
  2: "áp lực bắt kịp xu hướng đầu tuần?",
  3: "giữa tuần dễ mất tập trung khỏi kế hoạch ban đầu?",
  4: "chuẩn bị tâm lý chốt sổ cuối tuần khiến bạn vội?",
  5: "muốn chốt sổ cuối tuần nên bốc đồng?",
  6: "giao dịch cuối tuần thường không theo kế hoạch kỹ càng?",
}

function detectMau11(trades30d: Cap2TradeRecord[]): MauPhatHienCap2 | null {
  const viPhamTrades = trades30d.filter(isViPham)
  const total = viPhamTrades.length
  if (total < MAU11_MIN_TOTAL) return null

  const byDay: Record<number, number> = {}
  for (const t of viPhamTrades) {
    const day = new Date(t.closedAt).getUTCDay()
    byDay[day] = (byDay[day] ?? 0) + 1
  }
  const [dayStr, count] = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0]
  const day = Number(dayStr)
  const share = count / total
  if (share < MAU11_MIN_SHARE) return null

  return {
    id: "mau11_ngay_trong_tuan",
    text: `${count}/${total} vi phạm gần nhất vào ${WEEKDAY_LABELS[day]}. Có phải ${WEEKDAY_HINTS[day]}`,
  }
}

function detectMau12(khoi5: Cap2Khoi5): MauPhatHienCap2 | null {
  if (khoi5.series.length < MAU12_MIN_DAYS) return null
  if (khoi5.avg7 == null || khoi5.avg30 == null) return null
  const gap = khoi5.avg7 - khoi5.avg30
  if (Math.abs(gap) < MAU12_MIN_GAP) return null
  const improving = gap > 0
  return {
    id: "mau12_xu_huong",
    text: `Điểm kỷ luật 7 ngày ${khoi5.avg7} — ${improving ? "cao" : "thấp"} hơn 30 ngày trước (${khoi5.avg30}). Kỷ luật đang ${improving ? "cải thiện" : "đi xuống"}.`,
  }
}

/**
 * Combines Cấp 1's mẫu 1-3 (`cap1MauPhatHien`, already ≤2 — see module
 * docstring) with the 4 new mẫu 9-12, applies the spec §12 priority order,
 * and caps the result at 3 total.
 *
 * **Priority order (this module's resolution of the spec's own internally
 * inconsistent §12 table — mẫu 4/5/6/7/8 referenced there don't exist in
 * this codebase; documented here rather than guessed silently):**
 * 1. mẫu 12 when "cải thiện" (positive trend)
 * 2. mẫu 9 (loại vi phạm phổ biến)
 * 3. mẫu 3 `co_so_dang_gia` (Cấp 1's "ngược chiều" bucket)
 * 4. mẫu 10 (cách chọn hay bẻ kế hoạch)
 * 5. mẫu 11 (ngày trong tuần)
 * 6. mẫu 1 `vu_khi_rieng`, mẫu 2 `diem_mu`
 * 7. mẫu 12 when "đi xuống" (a warning — "xếp mẫu tích cực trước, cảnh báo sau")
 */
function detectAllMauCap2(
  cap1MauPhatHien: MauPhatHien[],
  khoi3: Cap2Khoi3,
  trades30d: Cap2TradeRecord[],
  khoi5: Cap2Khoi5,
): MauPhatHienCap2[] {
  const cap1AsCap2: MauPhatHienCap2[] = cap1MauPhatHien.map((m) => ({
    id: m.id as MauPhatHienCap2Id,
    text: m.text,
  }))
  const byId = (id: MauPhatHienCap2Id): MauPhatHienCap2 | null =>
    cap1AsCap2.find((m) => m.id === id) ?? null

  const mau12 = detectMau12(khoi5)
  const mau12Improving = mau12 && mau12.text.includes("cải thiện") ? mau12 : null
  const mau12Declining = mau12 && mau12.text.includes("đi xuống") ? mau12 : null

  const ordered: (MauPhatHienCap2 | null)[] = [
    mau12Improving,
    detectMau9(khoi3),
    byId("co_so_dang_gia"),
    detectMau10(trades30d),
    detectMau11(trades30d),
    byId("vu_khi_rieng"),
    byId("diem_mu"),
    mau12Declining,
  ]

  return ordered.filter((m): m is MauPhatHienCap2 => m != null).slice(0, MAX_MAU_CAP2)
}

// ── top-level ─────────────────────────────────────────────────────────────

export interface Cap2PortfolioAnalysisResult {
  khoi1: Cap1PortfolioAnalysisResult["khoi1"]
  hideKhoi2: boolean
  khoi2HiddenNote: string | null
  khoi2: ReasonRow[]
  khoi3: Cap2Khoi3
  khoi4: Cap2Khoi4
  khoi5: Cap2Khoi5
  khoi6: Cap2Khoi6
  khoi7: Cap2Khoi7
  mauPhatHien: MauPhatHienCap2[]
  mauInsufficientNote: string | null
}

/**
 * Cấp 2 Phân tích danh mục (spec §12) — see module docstring for the
 * delegation/adjustment/honesty rules this composes.
 */
export function computeCap2PortfolioAnalysis(
  trades: Cap2TradeRecord[],
  dailyScores: Cap2DailyScoreRecord[],
  progress: Cap2Progress | null,
  now: Date = new Date(),
): Cap2PortfolioAnalysisResult {
  const cap1Result = computeCap1PortfolioAnalysis(trades, null)

  const trades30d = trades.filter((t) => withinDays(t.closedAt, now, KHOI3_WINDOW_DAYS))

  const khoi3 = computeKhoi3(trades30d)
  const khoi4 = computeKhoi4(trades, progress)
  const khoi5 = computeKhoi5Cap2(dailyScores)
  const khoi6 = computeKhoi6Cap2(trades, now)
  const khoi7 = computeKhoi7Cap2(trades, now)

  const mauPhatHien = detectAllMauCap2(cap1Result.mauPhatHien, khoi3, trades30d, khoi5)

  return {
    khoi1: cap1Result.khoi1,
    hideKhoi2: cap1Result.hideKhoi2,
    khoi2HiddenNote: cap1Result.khoi2HiddenNote,
    khoi2: cap1Result.khoi2,
    khoi3,
    khoi4,
    khoi5,
    khoi6,
    khoi7,
    mauPhatHien,
    mauInsufficientNote:
      mauPhatHien.length > 0
        ? null
        : (cap1Result.mauInsufficientNote ??
          "Chưa phát hiện mẫu hành vi kỷ luật rõ rệt trong 30 ngày qua."),
  }
}
