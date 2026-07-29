import type { Cap1TradeRecord } from "./tradeLog"
import { LY_DO_OPTIONS, type Cap1Progress, type LyDo } from "./types"

/**
 * Cấp 1 Phân tích danh mục (spec §7) — pure compute over the client trade log
 * (`Cap1TradeRecord[]`, see `tradeLog.ts`'s doc for why per-lý-do
 * aggregates aren't sourced from a BE list endpoint) + the authoritative
 * `Cap1Progress` counters (Khối 3's ✅-count/nhiệm-vụ-④ and all of Khối 4 are
 * 100% server-sourced — no gap there).
 */

export type ReasonBadge = "✅" | "❌" | "⚠" | null

export interface ReasonRow {
  lyDo: LyDo
  count: number
  winRate: number | null
  totalPnlVnd: number
  badge: ReasonBadge
}

export interface Khoi4Task {
  no: number
  label: string
  done: boolean
  progressText: string
}

export type MauPhatHienId = "vu_khi_rieng" | "diem_mu" | "co_so_dang_gia"

export interface MauPhatHien {
  id: MauPhatHienId
  text: string
}

export interface Cap1PortfolioAnalysisResult {
  /** spec §7 "Ngưỡng hiển thị" — <5 lệnh ẩn Khối 2. */
  hideKhoi2: boolean
  khoi2HiddenNote: string | null
  khoi1: {
    totalTrades: number
    winRate: number | null
    wins: number
    losses: number
    preferredLyDo: LyDo | null
    preferredLyDoCount: number
  }
  khoi2: ReasonRow[]
  khoi3: {
    coverage: Record<LyDo, boolean>
    usedCount: number
    ungHoCount: number
    task4Done: boolean
  }
  khoi4: {
    tasksDone: number
    tasks: Khoi4Task[]
    readyToGraduate: boolean
  }
  mauPhatHien: MauPhatHien[]
  mauInsufficientNote: string | null
}

const KHOI2_MIN_TRADES = 5
const MAU1_MIN_TRADES = 5
const MAU1_MIN_WIN_RATE = 65
const MAU2_MIN_TRADES = 3
const MAU2_MAX_WIN_RATE = 35
const MAU3_MIN_GROUP = 3
const MAU3_MIN_GAP = 15
const MAX_MAU_SHOWN = 2

function lyDoLabel(lyDo: LyDo): string {
  const opt = LY_DO_OPTIONS.find((o) => o.value === lyDo)
  return opt ? `${opt.icon} ${opt.label}` : lyDo
}

function isWin(t: Cap1TradeRecord): boolean {
  return t.pnlVnd > 0
}

function round(n: number): number {
  return Math.round(n)
}

/** spec §7 Khối 2 badge thresholds. Checked ✅ → ❌ → ⚠ so the count>=5,
 * winRate exactly 35% edge (which satisfies both ❌'s "<=35%,>=3" and would
 * otherwise ALSO satisfy a naive "35-50%,>=5" ⚠ check) resolves to ❌. */
function reasonBadge(count: number, winRate: number | null): ReasonBadge {
  if (count < 3 || winRate == null) return null
  if (winRate >= MAU1_MIN_WIN_RATE && count >= 5) return "✅"
  if (winRate <= MAU2_MAX_WIN_RATE && count >= 3) return "❌"
  if (winRate > MAU2_MAX_WIN_RATE && winRate <= 50 && count >= 5) return "⚠"
  return null
}

function computeKhoi1(trades: Cap1TradeRecord[]): Cap1PortfolioAnalysisResult["khoi1"] {
  const totalTrades = trades.length
  if (totalTrades === 0) {
    return { totalTrades: 0, winRate: null, wins: 0, losses: 0, preferredLyDo: null, preferredLyDoCount: 0 }
  }
  const wins = trades.filter(isWin).length
  const losses = totalTrades - wins
  const winRate = round((wins / totalTrades) * 100)

  let preferredLyDo: LyDo | null = null
  let preferredLyDoCount = 0
  for (const opt of LY_DO_OPTIONS) {
    const count = trades.filter((t) => t.lyDo === opt.value).length
    if (count > preferredLyDoCount) {
      preferredLyDoCount = count
      preferredLyDo = opt.value
    }
  }

  return { totalTrades, winRate, wins, losses, preferredLyDo, preferredLyDoCount }
}

function computeKhoi2(trades: Cap1TradeRecord[]): ReasonRow[] {
  const rows = LY_DO_OPTIONS.map((opt): ReasonRow => {
    const forReason = trades.filter((t) => t.lyDo === opt.value)
    const count = forReason.length
    const wins = forReason.filter(isWin).length
    const winRate = count > 0 ? round((wins / count) * 100) : null
    const totalPnlVnd = forReason.reduce((sum, t) => sum + t.pnlVnd, 0)
    return { lyDo: opt.value, count, winRate, totalPnlVnd, badge: reasonBadge(count, winRate) }
  })
  return rows.sort((a, b) => b.totalPnlVnd - a.totalPnlVnd)
}

function computeKhoi3(
  trades: Cap1TradeRecord[],
  progress: Cap1Progress | null,
): Cap1PortfolioAnalysisResult["khoi3"] {
  const coverage = Object.fromEntries(
    LY_DO_OPTIONS.map((opt) => [opt.value, trades.some((t) => t.lyDo === opt.value)]),
  ) as Record<LyDo, boolean>
  const usedCount = Object.values(coverage).filter(Boolean).length
  return {
    coverage,
    usedCount,
    ungHoCount: progress?.so_lenh_ly_do_ung_ho ?? 0,
    task4Done: progress?.task_4_done_at != null,
  }
}

const TASK4_THRESHOLD = 3
const TASK5_THRESHOLD = 3
const TASK6_THRESHOLD = 10
const TASK3_THRESHOLD = 5

function khoi4Tasks(progress: Cap1Progress | null): Khoi4Task[] {
  const soLyDo = progress?.so_ly_do_da_dung ?? 0
  const soUngHo = progress?.so_lenh_ly_do_ung_ho ?? 0
  const soXem = progress?.so_lan_xem_danh_muc ?? 0
  const soLenh = progress?.so_lenh_thuc_chien ?? 0
  return [
    { no: 1, label: "Lệnh đầu có kế hoạch", done: progress?.task_1_done_at != null, progressText: "" },
    { no: 2, label: "Kết sổ đầu tiên", done: progress?.task_2_done_at != null, progressText: "" },
    {
      no: 3,
      label: "Đủ 5 lý do",
      done: progress?.task_3_done_at != null,
      progressText: `${Math.min(soLyDo, TASK3_THRESHOLD)}/${TASK3_THRESHOLD}`,
    },
    {
      no: 4,
      label: "3 lệnh lý do ✅",
      done: progress?.task_4_done_at != null,
      progressText: `${Math.min(soUngHo, TASK4_THRESHOLD)}/${TASK4_THRESHOLD}`,
    },
    {
      no: 5,
      label: "Xem lại danh mục",
      done: progress?.task_5_done_at != null,
      progressText: `${Math.min(soXem, TASK5_THRESHOLD)}/${TASK5_THRESHOLD}`,
    },
    {
      no: 6,
      label: "10 lệnh",
      done: progress?.task_6_done_at != null,
      progressText: `${Math.min(soLenh, TASK6_THRESHOLD)}/${TASK6_THRESHOLD}`,
    },
  ]
}

function computeKhoi4(progress: Cap1Progress | null): Cap1PortfolioAnalysisResult["khoi4"] {
  const tasks = khoi4Tasks(progress)
  const tasksDone = tasks.filter((t) => t.done).length
  return { tasksDone, tasks, readyToGraduate: tasksDone === 6 }
}

interface ReasonStat {
  lyDo: LyDo
  count: number
  wins: number
  winRate: number
}

function reasonStats(trades: Cap1TradeRecord[]): ReasonStat[] {
  return LY_DO_OPTIONS.map((opt) => {
    const forReason = trades.filter((t) => t.lyDo === opt.value)
    const count = forReason.length
    const wins = forReason.filter(isWin).length
    return { lyDo: opt.value, count, wins, winRate: count > 0 ? (wins / count) * 100 : 0 }
  })
}

function detectMauPhatHien(trades: Cap1TradeRecord[]): MauPhatHien[] {
  const candidates: MauPhatHien[] = []
  const stats = reasonStats(trades)

  // Mẫu 1 — Vũ khí riêng: best-qualifying lý do (highest win rate, tie→count).
  const mau1Candidates = stats.filter(
    (s) => s.count >= MAU1_MIN_TRADES && s.winRate >= MAU1_MIN_WIN_RATE,
  )
  if (mau1Candidates.length > 0) {
    const best = mau1Candidates.reduce((a, b) =>
      b.winRate > a.winRate || (b.winRate === a.winRate && b.count > a.count) ? b : a,
    )
    candidates.push({
      id: "vu_khi_rieng",
      text: `Bạn thắng nhiều nhất khi mua vì ${lyDoLabel(best.lyDo)} — ${best.wins}/${best.count} lãi. Cách chọn phù hợp với bạn nhất.`,
    })
  }

  // Mẫu 2 — Điểm mù: worst-qualifying lý do (lowest win rate, tie→count).
  const mau2Candidates = stats.filter(
    (s) => s.count >= MAU2_MIN_TRADES && s.winRate <= MAU2_MAX_WIN_RATE,
  )
  if (mau2Candidates.length > 0) {
    const worst = mau2Candidates.reduce((a, b) =>
      b.winRate < a.winRate || (b.winRate === a.winRate && b.count > a.count) ? b : a,
    )
    candidates.push({
      id: "diem_mu",
      text: `Bạn thua nhiều nhất khi mua vì ${lyDoLabel(worst.lyDo)} — ${worst.count - worst.wins}/${worst.count} lỗ. Có thể hoãn cách chọn này đến khi thành thạo hơn.`,
    })
  }

  // Mẫu 3 — Cơ sở đáng giá: ✅ group vs. the rest.
  const ungHo = trades.filter((t) => t.trangThaiLucDat === "ung_ho")
  const others = trades.filter((t) => t.trangThaiLucDat !== "ung_ho")
  if (ungHo.length >= MAU3_MIN_GROUP && others.length >= MAU3_MIN_GROUP) {
    const ungHoRate = (ungHo.filter(isWin).length / ungHo.length) * 100
    const othersRate = (others.filter(isWin).length / others.length) * 100
    if (ungHoRate - othersRate >= MAU3_MIN_GAP) {
      candidates.push({
        id: "co_so_dang_gia",
        text: `Lệnh chọn lý do ✅ Ủng hộ: tỷ lệ thắng ${round(ungHoRate)}%. Lệnh lý do khác: tỷ lệ thắng ${round(othersRate)}%. Chọn lý do có cơ sở đang cho kết quả tốt hơn.`,
      })
    }
  }

  return candidates.slice(0, MAX_MAU_SHOWN)
}

export function computeCap1PortfolioAnalysis(
  trades: Cap1TradeRecord[],
  progress: Cap1Progress | null,
): Cap1PortfolioAnalysisResult {
  const totalTrades = trades.length
  const hideKhoi2 = totalTrades < KHOI2_MIN_TRADES
  const mauPhatHien = detectMauPhatHien(trades)

  return {
    hideKhoi2,
    khoi2HiddenNote: hideKhoi2
      ? `Cần ≥5 lệnh để có phân tích thắng/thua đáng tin. Hiện có ${totalTrades}.`
      : null,
    khoi1: computeKhoi1(trades),
    khoi2: computeKhoi2(trades),
    khoi3: computeKhoi3(trades, progress),
    khoi4: computeKhoi4(progress),
    mauPhatHien,
    mauInsufficientNote:
      mauPhatHien.length > 0
        ? null
        : totalTrades < 3
          ? `Còn ${3 - totalTrades} lệnh nữa để hệ thống tìm mẫu riêng của bạn.`
          : "Chưa phát hiện mẫu hành vi rõ rệt ở cách chọn lý do của bạn.",
  }
}
