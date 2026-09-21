import {
  computeCap1PortfolioAnalysis,
  type Cap1PortfolioAnalysisResult,
  type ReasonRow,
} from "@/features/cap1/portfolioAnalysis"
import type { Cap1TradeRecord } from "@/features/cap1/tradeLog"
import { LY_DO_OPTIONS } from "@/features/cap1/types"
import type { Cap2Progress, Cap2TradeHistory, XepLoai } from "./types"

/**
 * Cấp 2 Phân tích danh mục — pure fallback compute cho các khối §12. UI dùng
 * `GET /cap2/analysis` làm nguồn chính; phép tính ở đây giữ màn hữu dụng trong
 * lúc refetch và cho các host cấp cao tương thích.
 *
 *   ① Hồ sơ tổng quan            — Cấp 1 + 2 ô «Đã đặt CL/CL» và «Thực hiện đúng»
 *   ② Thắng / thua theo 5 lý do  — giữ từ Cấp 1
 *   ③ Độ phủ 5 lý do             — giữ từ Cấp 1
 *   ④ Bạn đã dùng cơ chế cắt lỗ / chốt lời thế nào — MỚI ở Cấp 2
 *
 * **Delegation, not duplication:** ①②③ 100% uỷ quyền cho
 * `computeCap1PortfolioAnalysis` — module này không viết lại phép tính đó.
 * `progress` cố tình truyền `null` cho lời gọi ấy: khối 1/2/3 của Cấp 1 không
 * đọc `progress` (chỉ khối 4 của nó đọc, và Cấp 2 không dùng khối đó), nên an
 * toàn và không đòi một `Cap1Progress` mà người gọi Cấp 2 không có.
 *
 * **Nguồn số của khối ④ là SERVER**, không phải nhật ký cục bộ: `Cap2Progress`
 * mang sẵn `so_lan_cat_lo_dung` (🛑) / `so_lan_chot_loi_dung` (🎯) /
 * `so_lan_thuc_hien_dung` (✅), và server bảo đảm ✅ = 🛑 + 🎯. Nhật ký trên
 * trình duyệt (`tradeLogCap2.ts`) chỉ đủ cho khối ②③ (thắng/thua + độ phủ theo
 * lý do) — nó per-browser và không backfill được, nên không được phép làm nguồn
 * cho một con số server đã có.
 *
 * ★★ **Ba con số của khối ④ là số MÔ TẢ, KHÔNG phải nhiệm vụ.** Cấp 2 chỉ còn
 * ĐÚNG MỘT nhiệm vụ — «10 lệnh Thực chiến có đặt cắt lỗ / chốt lời». Nhiệm vụ
 * ② «Thực hiện đúng khi giá chạm mốc» đã bỏ hẳn, nên khối ④ chỉ được TƯỜNG
 * THUẬT ("bạn đã dùng cơ chế tới đâu"), tuyệt đối KHÔNG kèm mẫu số/mốc phải
 * đạt («x/2», «còn n lần», «hoàn thành nhiệm vụ ②»). Mockup
 * `iqx-cap2-phantich-danhmuc.html` vẽ đúng như vậy: ba con số trần, không mẫu số.
 *
 * **Trung thực hơn số đẹp:** khi chưa có lần nào giá chạm mốc, khối ④ trả
 * `emptyNote` chứ không bịa một nhận xét từ 0/0.
 */

// ── Cấp 2 trade record (client-side closed-trade log analogue) ──────────────

/**
 * A closed Cấp 2 order — Cấp 1's `Cap1TradeRecord` fields (lý do, P&L, …) plus
 * the 4 vi phạm flags `order_ketso` carries and the optional "ghi chú nhìn lại"
 * text captured in Kết sổ.
 *
 * Bốn cờ vi phạm + ghi chú được `KetsoModalCap2` ghi và tạo nguồn cho cửa sổ
 * 20 lệnh, bảng theo tuần, reflection insights và mẫu 9–12.
 */
export interface Cap2TradeRecord extends Cap1TradeRecord {
  chamSlKhongCat: boolean
  chamTpGiuLamHut: boolean
  banSomKhiLoNhe: boolean
  nhoiLenhKhiLo: boolean
  ghiChuNhinLai?: string | null
}

export function cap2TradeFromHistory(row: Cap2TradeHistory): Cap2TradeRecord {
  return {
    orderId: row.sell_order_id,
    lyDo: row.lyDo,
    trangThaiLucDat: row.trangThai_luc_dat,
    pnlPct: row.pnl_pct,
    pnlVnd: row.pnl_vnd,
    closedAt: row.closed_at,
    chamSlKhongCat: row.cham_SL_khong_cat,
    chamTpGiuLamHut: row.cham_TP_giu_lam_hut,
    banSomKhiLoNhe: row.ban_som_khi_lo_nhe,
    nhoiLenhKhiLo: row.nhoi_lenh_khi_lo,
    ghiChuNhinLai: row.ghi_chu_nhin_lai,
  }
}

/** One day's điểm kỷ luật, as returned by `GET /cap2/diem-ky-luat?ngay=`. */
export interface Cap2DailyScoreRecord {
  /** YYYY-MM-DD. */
  ngay: string
  diem: number
  xepLoai: XepLoai
}

/** 4 hành vi vi phạm kỷ luật mà `order_ketso` ghi lại. */
export type ViPhamLoai = "cat_lo_cham" | "chot_loi_hut" | "ban_som_khi_lo" | "nhoi_lenh"

export const VI_PHAM_LOAI_LABELS: Record<ViPhamLoai, string> = {
  cat_lo_cham: "Cắt lỗ chậm",
  chot_loi_hut: "Chốt lời hụt",
  ban_som_khi_lo: "Bán sớm khi lỗ nhẹ",
  nhoi_lenh: "Nhồi lệnh khi lỗ",
}

const VI_PHAM_KEYS: Record<ViPhamLoai, keyof Cap2TradeRecord> = {
  cat_lo_cham: "chamSlKhongCat",
  chot_loi_hut: "chamTpGiuLamHut",
  ban_som_khi_lo: "banSomKhiLoNhe",
  nhoi_lenh: "nhoiLenhKhiLo",
}

function isViolated(trade: Cap2TradeRecord): boolean {
  return Object.values(VI_PHAM_KEYS).some((key) => Boolean(trade[key]))
}

function atStartOfDay(value: Date): Date {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function withinDays(iso: string, now: Date, days: number): boolean {
  const time = new Date(iso).getTime()
  const today = atStartOfDay(now).getTime()
  const cutoff = today - (days - 1) * 86_400_000
  return Number.isFinite(time) && time >= cutoff && time < today + 86_400_000
}

export interface Cap2ScoreSummary {
  points: Cap2DailyScoreRecord[]
  average30: number | null
  average7: number | null
  distribution: Record<XepLoai, number>
}

export interface Cap2WeeklyViolation {
  label: string
  counts: Record<ViPhamLoai, number>
  total: number
}

export interface Cap2WindowItem {
  orderId: string
  violated: boolean
}

export type Cap2PatternId = "mau_9" | "mau_10" | "mau_11" | "mau_12"

export interface Cap2Pattern {
  id: Cap2PatternId
  positive: boolean
  text: string
}

export type ReflectionPatternId =
  | "loss_aversion"
  | "chi_so_hoa"
  | "fomo"
  | "tin_tuc"
  | "khong_tin_phan_tich"
  | "cam_xuc_manh"

export interface ReflectionInsight {
  id: ReflectionPatternId
  count: number
  text: string
}

const REFLECTION_PATTERNS: Array<{
  id: ReflectionPatternId
  terms: string[]
  text: string
}> = [
  {
    id: "loss_aversion",
    terms: ["sợ mất", "tiếc", "không muốn thua", "chờ hồi"],
    text: "Bạn thường chần chừ vì sợ biến một khoản lỗ hoặc phần lãi đã có thành kết quả thật. Cấp 3 sẽ giúp tách quyết định khỏi kết quả.",
  },
  {
    id: "chi_so_hoa",
    terms: ["vn-index", "vnindex", "thị trường", "toàn thị trường"],
    text: "Bạn có xu hướng phản ứng với chỉ số chung hơn là kế hoạch của chính mã đang giữ.",
  },
  {
    id: "fomo",
    terms: ["sợ bỏ lỡ", "mọi người mua", "hot", "sốt"],
    text: "Nỗi sợ bỏ lỡ đang chen vào lúc bạn cân nhắc có giữ đúng kế hoạch hay không.",
  },
  {
    id: "tin_tuc",
    terms: ["tin", "báo", "công bố"],
    text: "Tin tức xuất hiện nhiều trong lý do bạn bẻ kế hoạch; hãy đối chiếu lại mốc đã đặt trước khi phản ứng.",
  },
  {
    id: "khong_tin_phan_tich",
    terms: ["không chắc", "nghi ngờ", "không tin"],
    text: "Bạn thường nghi ngờ phân tích sau khi đã vào lệnh. Cấp 3 sẽ giúp lượng hóa mức tự tin trước khi mua.",
  },
  {
    id: "cam_xuc_manh",
    terms: ["hoảng", "sợ", "tức", "buồn"],
    text: "Cảm xúc mạnh xuất hiện lặp lại quanh các lần vi phạm; ghi nhận nó trước khi hành động là bước đầu để kiểm soát.",
  },
]

export function reflectionInsightText(id: ReflectionPatternId): string {
  return (
    REFLECTION_PATTERNS.find((pattern) => pattern.id === id)?.text ??
    "Mẫu này lặp lại trong các ghi chú nhìn lại gần đây."
  )
}

function computeScoreSummary(
  dailyScores: Cap2DailyScoreRecord[],
  now: Date,
): Cap2ScoreSummary {
  const points = dailyScores
    .filter((score) => withinDays(`${score.ngay}T23:59:59`, now, 30))
    .sort((a, b) => a.ngay.localeCompare(b.ngay))
  const last7 = points.filter((score) => withinDays(`${score.ngay}T23:59:59`, now, 7))
  const average = (items: Cap2DailyScoreRecord[]) =>
    items.length ? Math.round(items.reduce((sum, item) => sum + item.diem, 0) / items.length) : null
  return {
    points,
    average30: average(points),
    average7: average(last7),
    distribution: {
      xanh: points.filter((point) => point.xepLoai === "xanh").length,
      vang: points.filter((point) => point.xepLoai === "vang").length,
      do: points.filter((point) => point.xepLoai === "do").length,
    },
  }
}

function computeWeeklyViolations(
  trades: Cap2TradeRecord[],
  now: Date,
): Cap2WeeklyViolation[] {
  const today = atStartOfDay(now)
  const monday = new Date(today)
  const weekday = (monday.getDay() + 6) % 7
  monday.setDate(monday.getDate() - weekday)
  return Array.from({ length: 4 }, (_, reverseIndex) => {
    const weeksAgo = 3 - reverseIndex
    const start = new Date(monday)
    start.setDate(start.getDate() - weeksAgo * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    const rows = trades.filter((trade) => {
      const closed = new Date(trade.closedAt)
      return closed >= start && closed < end
    })
    const counts = Object.fromEntries(
      (Object.keys(VI_PHAM_KEYS) as ViPhamLoai[]).map((type) => [
        type,
        rows.filter((trade) => Boolean(trade[VI_PHAM_KEYS[type]])).length,
      ]),
    ) as Record<ViPhamLoai, number>
    return {
      label: weeksAgo === 0 ? "Tuần này" : `${weeksAgo} tuần trước`,
      counts,
      total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    }
  })
}

function computeReflectionInsights(
  trades: Cap2TradeRecord[],
  now: Date,
): { noteCount: number; insights: ReflectionInsight[] } {
  const notes = trades
    .filter((trade) => withinDays(trade.closedAt, now, 28) && isViolated(trade))
    .map((trade) => trade.ghiChuNhinLai?.trim().toLocaleLowerCase("vi") ?? "")
    .filter(Boolean)
  if (notes.length < 3) return { noteCount: notes.length, insights: [] }
  const insights = REFLECTION_PATTERNS.map((pattern) => ({
    id: pattern.id,
    count: notes.filter((note) => pattern.terms.some((term) => note.includes(term))).length,
    text: pattern.text,
  }))
    .filter((pattern) => pattern.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
  return { noteCount: notes.length, insights }
}

function computeCap2Patterns(
  trades: Cap2TradeRecord[],
  score: Cap2ScoreSummary,
  now: Date,
): Cap2Pattern[] {
  const recent = trades.filter((trade) => withinDays(trade.closedAt, now, 30))
  const candidates: Cap2Pattern[] = []

  const violationCounts = Object.fromEntries(
    (Object.keys(VI_PHAM_KEYS) as ViPhamLoai[]).map((type) => [
      type,
      recent.filter((trade) => Boolean(trade[VI_PHAM_KEYS[type]])).length,
    ]),
  ) as Record<ViPhamLoai, number>
  const totalViolations = Object.values(violationCounts).reduce((sum, value) => sum + value, 0)
  const common = (Object.keys(violationCounts) as ViPhamLoai[]).sort(
    (a, b) => violationCounts[b] - violationCounts[a],
  )[0]
  if (common && totalViolations >= 5 && violationCounts[common] / totalViolations >= 0.5) {
    candidates.push({
      id: "mau_9",
      positive: false,
      text: `Vi phạm phổ biến nhất: ${VI_PHAM_LOAI_LABELS[common]} (${Math.round((violationCounts[common] / totalViolations) * 100)}% tổng). Đây là điểm yếu chính cần khắc phục.`,
    })
  }

  const reasonStats = LY_DO_OPTIONS.map((option) => {
    const group = recent.filter((trade) => trade.lyDo === option.value)
    const violations = group.filter(isViolated).length
    return { option, count: group.length, rate: group.length ? (violations / group.length) * 100 : 0 }
  }).filter((stat) => stat.count >= 5 && stat.rate >= 30)
  const worstReason = reasonStats.sort((a, b) => b.rate - a.rate)[0]
  if (worstReason) {
    const others = recent.filter((trade) => trade.lyDo !== worstReason.option.value)
    const otherRate = others.length ? (others.filter(isViolated).length / others.length) * 100 : 0
    candidates.push({
      id: "mau_10",
      positive: false,
      text: `Với lý do ${worstReason.option.icon} ${worstReason.option.label}, bạn vi phạm ${Math.round(worstReason.rate)}% lệnh. Các lý do khác là ${Math.round(otherRate)}%. Có phải nhóm lệnh này làm bạn nghi ngờ nhiều hơn?`,
    })
  }

  const violatedTrades = recent.filter(isViolated)
  if (violatedTrades.length >= 5) {
    const byDay = new Map<number, number>()
    for (const trade of violatedTrades) {
      const day = new Date(trade.closedAt).getDay()
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
    }
    const [day, count] = [...byDay].sort((a, b) => b[1] - a[1])[0]
    if (count / violatedTrades.length >= 0.6) {
      const label = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"][day]
      candidates.push({
        id: "mau_11",
        positive: false,
        text: `${count}/${violatedTrades.length} vi phạm gần nhất rơi vào ${label}.${day === 5 ? " Có phải bạn muốn chốt sổ cuối tuần nên dễ bốc đồng?" : " Hãy để ý nhịp quyết định của ngày này."}`,
      })
    }
  }

  if (score.points.length >= 14 && score.average7 != null && score.average30 != null) {
    const gap = score.average7 - score.average30
    if (Math.abs(gap) >= 5) {
      candidates.push({
        id: "mau_12",
        positive: gap > 0,
        text: `Điểm kỷ luật 7 ngày ${score.average7} — ${gap > 0 ? "cao" : "thấp"} hơn trung bình 30 ngày (${score.average30}). Kỷ luật đang ${gap > 0 ? "cải thiện" : "đi xuống"}.`,
      })
    }
  }

  return candidates
    .sort((a, b) => {
      const priority = (pattern: Cap2Pattern) =>
        pattern.id === "mau_12" && pattern.positive ? 0 : pattern.id === "mau_9" ? 1 : pattern.id === "mau_10" ? 2 : pattern.id === "mau_11" ? 3 : 4
      return priority(a) - priority(b)
    })
    .slice(0, 3)
}

// ── Khối ④ — «Bạn đã dùng cơ chế cắt lỗ / chốt lời thế nào» ──────────────────

/** Mẫu số của ô «Đã đặt CL/CL» ở khối ① — cùng mốc 10 lệnh của nhiệm vụ DUY
 *  NHẤT của Cấp 2. Đây là mẫu số HỢP LỆ duy nhất trong module này. */
export const SL_TP_ORDERS_TARGET = 10

export interface Cap2SlTpUsage {
  /** 🛑 số lần giá chạm cắt lỗ và user cắt ngay trong phiên. */
  catLoDung: number
  /** 🎯 số lần giá chạm chốt lời và user bán theo kế hoạch. */
  chotLoiDung: number
  /** ✅ tổng lần thực hiện đúng (server bảo đảm = `catLoDung + chotLoiDung`).
   *  Số MÔ TẢ — không có mẫu số, không có mốc phải đạt. */
  tongDung: number
  /** Số lệnh đã đặt cắt lỗ/chốt lời, đã chặn trần ở `SL_TP_ORDERS_TARGET`. */
  soLenhCoSlTp: number
  soLenhCoSlTpTarget: number
  /** Nhận xét `.pat.good` của mockup — `null` khi chưa có lần nào để nhận xét. */
  patternNote: string | null
  /** Trạng thái rỗng trung thực — `null` khi đã có ít nhất 1 lần. */
  emptyNote: string | null
  /** Câu nền `.pat.info` — luôn hiện. `**đậm**` theo quy ước renderer inline. */
  scopeNote: string
}

/** Nguyên văn `.pat.info` của mockup — luôn hiện, kể cả khi chưa có số nào. */
const SCOPE_NOTE =
  "Cấp 2 chỉ giúp bạn **làm quen cơ chế** đặt và thực hiện cắt lỗ / chốt lời. Rèn kỷ luật sâu hơn — bám kế hoạch qua thời gian — sẽ đến ở các cấp sau."

/**
 * Khối ④ — đọc THẲNG từ `progress` (server). Câu nhận xét bám sát nguyên văn
 * `.pat.good` của mockup ("Bạn đã làm quen cả hai cơ chế — … cắt lỗ chặn thua,
 * … chốt lời khóa lãi.") nhưng để CON SỐ tự nói, thay vì chốt cứng "một lần …
 * một lần" như bản vẽ tĩnh: cùng một câu phải đúng ở mọi giá trị.
 */
export function computeSlTpUsageCap2(progress: Cap2Progress | null): Cap2SlTpUsage {
  const catLoDung = progress?.so_lan_cat_lo_dung ?? 0
  const chotLoiDung = progress?.so_lan_chot_loi_dung ?? 0
  const tongDung = progress?.so_lan_thuc_hien_dung ?? 0
  const soLenhCoSlTp = Math.min(progress?.so_lenh_co_cl_tp ?? 0, SL_TP_ORDERS_TARGET)

  let patternNote: string | null = null
  let emptyNote: string | null = null

  if (catLoDung > 0 && chotLoiDung > 0) {
    patternNote = `Bạn đã làm quen cả hai cơ chế — ${catLoDung} lần cắt lỗ chặn thua, ${chotLoiDung} lần chốt lời khóa lãi. Đây là hai công cụ cơ bản nhất của việc thoát lệnh có kế hoạch.`
  } else if (catLoDung > 0) {
    patternNote = `Bạn mới dùng cơ chế cắt lỗ (${catLoDung} lần) — chưa lần nào giá chạm chốt lời để bạn thực hiện. Hai cơ chế bổ cho nhau: một cái chặn thua, một cái khóa lãi.`
  } else if (chotLoiDung > 0) {
    patternNote = `Bạn mới dùng cơ chế chốt lời (${chotLoiDung} lần) — chưa lần nào giá chạm cắt lỗ để bạn thực hiện. Hai cơ chế bổ cho nhau: một cái khóa lãi, một cái chặn thua.`
  } else {
    emptyNote =
      "Chưa có lần nào giá chạm mốc cắt lỗ hoặc chốt lời để bạn thực hiện. Con số này chỉ lên khi thị trường thật sự chạm mốc bạn đã cam kết — không phải việc bạn cố làm cho có."
  }

  return {
    catLoDung,
    chotLoiDung,
    tongDung,
    soLenhCoSlTp,
    soLenhCoSlTpTarget: SL_TP_ORDERS_TARGET,
    patternNote,
    emptyNote,
    scopeNote: SCOPE_NOTE,
  }
}

// ── top-level ─────────────────────────────────────────────────────────────

export interface Cap2PortfolioAnalysisResult {
  /** ① — uỷ quyền Cấp 1. */
  khoi1: Cap1PortfolioAnalysisResult["khoi1"]
  hideKhoi2: boolean
  khoi2HiddenNote: string | null
  /** ② — uỷ quyền Cấp 1. */
  khoi2: ReasonRow[]
  /** ③ — uỷ quyền Cấp 1 (độ phủ 5 lý do). */
  khoi3: Cap1PortfolioAnalysisResult["khoi3"]
  /** ④ — mới ở Cấp 2. */
  khoi4: Cap2SlTpUsage
  khoi5: Cap2ScoreSummary
  khoi6: Cap2WeeklyViolation[]
  khoi7: { noteCount: number; insights: ReflectionInsight[] }
  window20: Cap2WindowItem[]
  mauPhatHien: Cap2Pattern[]
}

/**
 * Cấp 2 Phân tích danh mục — xem docstring module cho luật uỷ quyền/trung thực.
 *
 * `dailyScores`/`now` cung cấp fallback cho khối 30 ngày khi server analysis
 * đang refetch; kết quả authoritative vẫn do backend trả về.
 */
export function computeCap2PortfolioAnalysis(
  trades: Cap2TradeRecord[],
  dailyScores: Cap2DailyScoreRecord[],
  progress: Cap2Progress | null,
  now: Date = new Date(),
): Cap2PortfolioAnalysisResult {
  const cap1Result = computeCap1PortfolioAnalysis(trades, null)
  const khoi5 = computeScoreSummary(dailyScores, now)

  return {
    khoi1: cap1Result.khoi1,
    hideKhoi2: cap1Result.hideKhoi2,
    khoi2HiddenNote: cap1Result.khoi2HiddenNote,
    khoi2: cap1Result.khoi2,
    khoi3: cap1Result.khoi3,
    khoi4: computeSlTpUsageCap2(progress),
    khoi5,
    khoi6: computeWeeklyViolations(trades, now),
    khoi7: computeReflectionInsights(trades, now),
    window20: [...trades]
      .sort((a, b) => b.closedAt.localeCompare(a.closedAt))
      .slice(0, 20)
      .map((trade) => ({ orderId: trade.orderId, violated: isViolated(trade) })),
    mauPhatHien: computeCap2Patterns(trades, khoi5, now),
  }
}
