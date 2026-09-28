/**
 * Pure client-side math for the analysis panel.
 *
 * Only the blocks the legacy screens computed on the client live here: Cấp 1's
 * ①②③④ + its mẫu block, the shared per-reason table/coverage reused by every
 * level, and the two "phát hiện" sentences of Cấp 3 (their numbers are the
 * server's `by_confidence` rows). Everything else - ⑤⑥⑦ of Cấp 2, ⑨⑩⑪ of Cấp 4,
 * ⑫⑬ of Cấp 5, ⑭⑮ of Cấp 6 - is server-owned and never recomputed here.
 *
 * Rule 1 applies everywhere: a missing value is `null` and renders "-"; only a
 * real measurement prints 0.
 */
import { LY_DO_OPTIONS } from "./copy"
import type { Cap1Progress, ConfidenceRow, TradeRow } from "./api"

export const KHOI2_MIN_TRADES = 5
export const CAP1_TOTAL_TASKS = 5
export const TASK3_THRESHOLD = 5
export const TASK4_THRESHOLD = 3
export const TASK5_THRESHOLD = 10

export const MAU1_MIN_TRADES = 5
export const MAU1_MIN_WIN_RATE = 65
export const MAU2_MIN_TRADES = 3
export const MAU2_MAX_WIN_RATE = 35
export const MAU3_MIN_GROUP = 3
export const MAU3_MIN_GAP = 15
export const MAX_MAU_SHOWN = 2

export const KHOI7_MIN_TRADES_PER_MUC = 3
export const KHOI7_WIN_RATE_GAP_PCT = 15
export const KHOI8_MIN_TRADES_PER_MUC = KHOI7_MIN_TRADES_PER_MUC
export const KHOI8_MIN_RATIO = 1.15

export const MUC_TU_TIN_ORDER: readonly number[] = [3, 2, 1]
export const MUC_TU_TIN_LABEL: Record<number, string> = { 3: "Cao", 2: "Vừa", 1: "Thấp" }
export const CACH_KHOI_LUONG_LABEL: Record<string, string> = {
  linh_hoat: "Khẩu vị × tự tin",
  ky_luat: "Chia đều theo khẩu vị",
}

const fmtInt = (value: number) => Math.round(value).toLocaleString("vi-VN")

/* ── Per-reason statistics (shared by Cấp 1 ②③ and every higher level) ──── */

export type ReasonStat = {
  value: string
  count: number
  wins: number
  /** `null` when the reason has no trade - an unknown rate is NOT 0%. */
  winRate: number | null
  totalPnlVnd: number
}

export function reasonStats(trades: TradeRow[]): ReasonStat[] {
  return LY_DO_OPTIONS.map((def) => {
    const group = trades.filter((trade) => trade.lyDo === def.lop)
    const wins = group.filter((trade) => trade.pnl_vnd > 0).length
    return {
      value: def.lop,
      count: group.length,
      wins,
      winRate: group.length > 0 ? Math.round((wins / group.length) * 100) : null,
      totalPnlVnd: group.reduce((sum, trade) => sum + trade.pnl_vnd, 0),
    }
  })
}

/** Rows sorted by total P&L descending (stable ⇒ ties keep the spec order). */
export function reasonRowsByPnl(trades: TradeRow[]): ReasonStat[] {
  return [...reasonStats(trades)].sort((a, b) => b.totalPnlVnd - a.totalPnlVnd)
}

export type ReasonTone = "good" | "bad" | "warn" | null

/** ✅ → good · ❌ → bad · ⚠ → warn. Evaluated good → bad → warn, as legacy does. */
export function reasonBadge(count: number, winRate: number | null): ReasonTone {
  if (count < 3 || winRate == null) return null
  if (winRate >= 65 && count >= 5) return "good"
  if (winRate <= 35 && count >= 3) return "bad"
  if (winRate > 35 && winRate <= 50 && count >= 5) return "warn"
  return null
}

/** Which of the five reasons the user actually used (from the closed-trade log). */
export function reasonCoverage(trades: TradeRow[]): Record<string, boolean> {
  return Object.fromEntries(LY_DO_OPTIONS.map((def) => [def.lop, trades.some((trade) => trade.lyDo === def.lop)]))
}

export function usedReasonCount(trades: TradeRow[]): number {
  const coverage = reasonCoverage(trades)
  return LY_DO_OPTIONS.filter((def) => coverage[def.lop] === true).length
}

/* ── Cấp 1 - ① ② ③ ④ ──────────────────────────────────────────────────── */

export type Cap1TaskRow = { no: number; label: string; done: boolean; progressText: string }

export type Cap1Blocks = {
  totalTrades: number
  wins: number
  losses: number
  winRate: number | null
  preferredLyDo: string | null
  preferredLyDoCount: number
  rows: ReasonStat[]
  usedReasons: number
  coverage: Record<string, boolean>
  soLenhUngHo: number
  task4Done: boolean
  tasks: Cap1TaskRow[]
  tasksDone: number
  readyToGraduate: boolean
  summaryLine: string | null
}

const CAP1_TASK_LABELS: readonly string[] = [
  "Lệnh đầu có kế hoạch",
  "Kết sổ đầu tiên",
  "Đủ 5 lý do",
  "3 lệnh lý do Ủng hộ",
  "10 lệnh",
]

export function computeCap1Blocks(trades: TradeRow[], progress: Cap1Progress | null): Cap1Blocks {
  const totalTrades = trades.length
  const wins = trades.filter((trade) => trade.pnl_vnd > 0).length
  const losses = totalTrades - wins
  const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : null

  const stats = reasonStats(trades)
  let preferredLyDo: string | null = null
  let preferredLyDoCount = 0
  for (const stat of stats) {
    if (stat.count > preferredLyDoCount) {
      preferredLyDo = stat.value
      preferredLyDoCount = stat.count
    }
  }

  const coverage = reasonCoverage(trades)
  const usedReasons = LY_DO_OPTIONS.filter((def) => coverage[def.lop] === true).length
  const soLenhUngHo = progress?.so_lenh_ly_do_ung_ho ?? 0
  const soLenhThucChien = progress?.so_lenh_thuc_chien ?? totalTrades
  const soLyDo = progress?.so_ly_do_da_dung ?? 0

  const done: boolean[] = [
    progress?.task_1_done_at != null,
    progress?.task_2_done_at != null,
    progress?.task_3_done_at != null,
    progress?.task_4_done_at != null,
    progress?.task_5_done_at != null,
  ]
  const progressTexts = ["", "", `${Math.min(soLyDo, TASK3_THRESHOLD)}/${TASK3_THRESHOLD}`, `${Math.min(soLenhUngHo, TASK4_THRESHOLD)}/${TASK4_THRESHOLD}`, `${Math.min(soLenhThucChien, TASK5_THRESHOLD)}/${TASK5_THRESHOLD}`]

  const tasks: Cap1TaskRow[] = CAP1_TASK_LABELS.map((label, index) => ({
    no: index + 1,
    label,
    done: done[index],
    progressText: progressTexts[index],
  }))
  const tasksDone = tasks.filter((task) => task.done).length
  const readyToGraduate = tasksDone === CAP1_TOTAL_TASKS

  const parts: string[] = []
  if (!done[0]) parts.push("① lệnh đầu có kế hoạch")
  if (!done[1]) parts.push("② kết sổ đầu tiên")
  if (!done[2] && TASK3_THRESHOLD - soLyDo > 0) parts.push(`${TASK3_THRESHOLD - soLyDo} lý do`)
  if (!done[4] && TASK5_THRESHOLD - soLenhThucChien > 0) parts.push(`${TASK5_THRESHOLD - soLenhThucChien} lệnh nữa`)

  return {
    totalTrades,
    wins,
    losses,
    winRate,
    preferredLyDo,
    preferredLyDoCount,
    rows: reasonRowsByPnl(trades),
    usedReasons,
    coverage,
    soLenhUngHo,
    task4Done: done[3],
    tasks,
    tasksDone,
    readyToGraduate,
    summaryLine: parts.length > 0 ? `Còn ${parts.join(" · ")} để lên Cấp 2.` : null,
  }
}

/* ── Cấp 1 - 🔍 mẫu hệ thống phát hiện (về lý do) ───────────────────────── */

export type MauPattern = { id: string; title: string; tone: "good" | "info"; text: string }

export function computeMauLyDo(trades: TradeRow[]): { patterns: MauPattern[]; note: string | null } {
  const stats = reasonStats(trades)
  const withRate = stats.map((stat) => ({ ...stat, rate: stat.count > 0 ? (stat.wins / stat.count) * 100 : 0 }))
  const patterns: MauPattern[] = []

  const vuKhi = withRate
    .filter((stat) => stat.count >= MAU1_MIN_TRADES && stat.rate >= MAU1_MIN_WIN_RATE)
    .sort((a, b) => b.rate - a.rate || b.count - a.count)[0]
  if (vuKhi) {
    const def = LY_DO_OPTIONS.find((option) => option.lop === vuKhi.value)
    patterns.push({
      id: "vu_khi_rieng",
      title: "Vũ khí riêng",
      tone: "good",
      text: `Bạn thắng nhiều nhất khi mua vì ${def?.label ?? vuKhi.value} - ${vuKhi.wins}/${vuKhi.count} lãi. Cách chọn phù hợp với bạn nhất.`,
    })
  }

  const diemMu = withRate
    .filter((stat) => stat.count >= MAU2_MIN_TRADES && stat.rate <= MAU2_MAX_WIN_RATE)
    .sort((a, b) => a.rate - b.rate || b.count - a.count)[0]
  if (diemMu) {
    const def = LY_DO_OPTIONS.find((option) => option.lop === diemMu.value)
    patterns.push({
      id: "diem_mu",
      title: "Điểm mù",
      tone: "info",
      text: `Bạn thua nhiều nhất khi mua vì ${def?.label ?? diemMu.value} - ${diemMu.count - diemMu.wins}/${diemMu.count} lỗ. Có thể hoãn cách chọn này đến khi thành thạo hơn.`,
    })
  }

  const groupA = trades.filter((trade) => trade.trangThai_luc_dat === "ung_ho")
  const groupB = trades.filter((trade) => trade.trangThai_luc_dat !== "ung_ho")
  if (groupA.length >= MAU3_MIN_GROUP && groupB.length >= MAU3_MIN_GROUP) {
    const rateA = (groupA.filter((trade) => trade.pnl_vnd > 0).length / groupA.length) * 100
    const rateB = (groupB.filter((trade) => trade.pnl_vnd > 0).length / groupB.length) * 100
    if (rateA - rateB >= MAU3_MIN_GAP) {
      patterns.push({
        id: "co_so_dang_gia",
        title: "Cơ sở đáng giá",
        tone: "info",
        text: `Lệnh chọn lý do Ủng hộ: tỷ lệ thắng ${Math.round(rateA)}%. Lệnh lý do khác: tỷ lệ thắng ${Math.round(rateB)}%. Chọn lý do có cơ sở đang cho kết quả tốt hơn.`,
      })
    }
  }

  const shown = patterns.slice(0, MAX_MAU_SHOWN)
  if (shown.length > 0) return { patterns: shown, note: null }
  const note =
    trades.length < 3
      ? `Còn ${3 - trades.length} lệnh nữa để hệ thống tìm mẫu riêng của bạn.`
      : "Chưa phát hiện mẫu hành vi rõ rệt ở cách chọn lý do của bạn."
  return { patterns: [], note }
}

/* ── Cấp 3 - ⑦ tự tin → kết quả, ⑧ khối lượng theo tự tin ──────────────── */

export type Khoi7Row = {
  mucTuTin: number
  label: string
  count: number
  winRate: number | null
  avgPnlPct: number | null
  insufficient: boolean
}

export type Khoi7 = { rows: Khoi7Row[]; totalTrades: number; phatHien: string | null; insufficientNote: string | null }

/** Rows are the server's `by_confidence` buckets; only the sentence is local. */
export function computeKhoi7(rows: ConfidenceRow[]): Khoi7 {
  const mapped: Khoi7Row[] = MUC_TU_TIN_ORDER.map((muc) => {
    const row = rows.find((item) => item.muc_tu_tin === muc)
    const count = row?.count ?? 0
    return {
      mucTuTin: muc,
      label: MUC_TU_TIN_LABEL[muc],
      count,
      winRate: row?.win_rate ?? null,
      avgPnlPct: row?.avg_pnl_pct ?? null,
      insufficient: count < KHOI7_MIN_TRADES_PER_MUC,
    }
  })
  const totalTrades = mapped.reduce((sum, row) => sum + row.count, 0)
  const cao = mapped[0]
  const thap = mapped[2]

  if (totalTrades === 0) {
    return {
      rows: mapped,
      totalTrades,
      phatHien: null,
      insufficientNote: "Chưa có lệnh Thực chiến nào đã đóng ở Cấp 3 - chưa thể đối chiếu mức tự tin với kết quả.",
    }
  }
  if (cao.count < KHOI7_MIN_TRADES_PER_MUC || thap.count < KHOI7_MIN_TRADES_PER_MUC || cao.winRate == null || thap.winRate == null) {
    return {
      rows: mapped,
      totalTrades,
      phatHien: null,
      insufficientNote: `Cần ít nhất ${KHOI7_MIN_TRADES_PER_MUC} lệnh ở CẢ mức ${MUC_TU_TIN_LABEL[3]} và ${MUC_TU_TIN_LABEL[1]} để so sánh (hiện: Cao ${cao.count}, Thấp ${thap.count}).`,
    }
  }

  const gap = cao.winRate - thap.winRate
  const phatHien =
    gap >= KHOI7_WIN_RATE_GAP_PCT
      ? `Tự tin của bạn đáng tin - lệnh bạn chấm ${MUC_TU_TIN_LABEL[3]} thắng ${cao.winRate}%, cao hơn hẳn lệnh ${MUC_TU_TIN_LABEL[1]} (${thap.winRate}%). Trực giác đã qua rèn luyện của bạn có cơ sở.`
      : gap <= -KHOI7_WIN_RATE_GAP_PCT
        ? `Cẩn thận - lệnh bạn tự tin cao lại thắng ít hơn (${MUC_TU_TIN_LABEL[3]} ${cao.winRate}% so với ${MUC_TU_TIN_LABEL[1]} ${thap.winRate}%). Có thể bạn đang quá tự tin ở những mã không nên. Xem lại lý do các lệnh ${MUC_TU_TIN_LABEL[3]}.`
        : `Tỷ lệ thắng của lệnh ${MUC_TU_TIN_LABEL[3]} (${cao.winRate}%) chưa khác biệt rõ so với ${MUC_TU_TIN_LABEL[1]} (${thap.winRate}%) - chưa đủ cơ sở để nói mức tự tin của bạn dự báo được kết quả.`
  return { rows: mapped, totalTrades, phatHien, insufficientNote: null }
}

export type Khoi8Row = {
  mucTuTin: number
  label: string
  count: number
  avgKhoiLuong: number | null
  avgPctVon: number | null
  cachHayDungLabel: string | null
  insufficient: boolean
}

export type Khoi8 = { rows: Khoi8Row[]; theoTuTin: boolean | null; phatHien: string | null; insufficientNote: string | null }

/** The most-used sizing mode per bucket; ties prefer `linh_hoat` (spec §6.3 order). */
function modeCach(list: TradeRow[]): string | null {
  if (list.length === 0) return null
  const linhHoat = list.filter((trade) => trade.cach_khoi_luong === "linh_hoat").length
  return linhHoat >= list.length - linhHoat ? "linh_hoat" : "ky_luat"
}

export function computeKhoi8(rows: ConfidenceRow[], trades: TradeRow[]): Khoi8 {
  const mapped: Khoi8Row[] = MUC_TU_TIN_ORDER.map((muc) => {
    const row = rows.find((item) => item.muc_tu_tin === muc)
    const group = trades.filter((trade) => trade.muc_tu_tin === muc)
    const count = row?.count ?? 0
    const cach = modeCach(group)
    return {
      mucTuTin: muc,
      label: MUC_TU_TIN_LABEL[muc],
      count,
      avgKhoiLuong: row?.avg_khoi_luong ?? null,
      avgPctVon: row?.avg_pct_von ?? null,
      cachHayDungLabel: cach ? (CACH_KHOI_LUONG_LABEL[cach] ?? cach) : null,
      insufficient: count < KHOI8_MIN_TRADES_PER_MUC,
    }
  })

  const cao = mapped[0]
  const vua = mapped[1]
  const thap = mapped[2]
  if (cao.count < KHOI8_MIN_TRADES_PER_MUC || thap.count < KHOI8_MIN_TRADES_PER_MUC || cao.avgPctVon == null || thap.avgPctVon == null) {
    return {
      rows: mapped,
      theoTuTin: null,
      phatHien: null,
      insufficientNote: `Cần ít nhất ${KHOI8_MIN_TRADES_PER_MUC} lệnh ở CẢ mức ${MUC_TU_TIN_LABEL[3]} và ${MUC_TU_TIN_LABEL[1]} để biết khối lượng có đi theo tự tin không (hiện: Cao ${cao.count}, Thấp ${thap.count}).`,
    }
  }

  const tangTheoCuc = cao.avgPctVon >= thap.avgPctVon * KHOI8_MIN_RATIO
  const vuaDuDuLieu = vua.count >= KHOI8_MIN_TRADES_PER_MUC && vua.avgPctVon != null
  const donDieu = vuaDuDuLieu ? thap.avgPctVon <= (vua.avgPctVon as number) && (vua.avgPctVon as number) <= cao.avgPctVon : true
  const theoTuTin = tangTheoCuc && donDieu
  const soSanh = `${Math.round(cao.avgPctVon)}% vs ${Math.round(thap.avgPctVon)}% vốn · ${cao.avgKhoiLuong == null ? "-" : fmtInt(cao.avgKhoiLuong)} vs ${thap.avgKhoiLuong == null ? "-" : fmtInt(thap.avgKhoiLuong)} cp`

  return {
    rows: mapped,
    theoTuTin,
    phatHien: theoTuTin
      ? `Bạn đang quản lý vốn đúng hướng - tự tin càng cao, khối lượng càng lớn (${soSanh}). Bạn thưởng cho lệnh chắc chắn, phòng thủ ở lệnh mơ hồ.`
      : `Khối lượng của bạn chưa đi theo tự tin (${soSanh}). Cân nhắc dùng Cách 1 (khẩu vị × tự tin) để khối lượng phản ánh niềm tin.`,
    insufficientNote: null,
  }
}
