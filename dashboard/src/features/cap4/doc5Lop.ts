import {
  verdictFromStatusLevel,
  verdictFromValuation,
  type Verdict,
} from "@/features/cap1/verdict"
import type { Lop, Lop5Partial, NhanDinhLop } from "./types"

/**
 * Khối "Đọc 5 lớp" — PURE helpers (spec §5).
 *
 * Everything the block needs that isn't rendering or fetching lives here so it
 * can be unit-tested without React: the 5 lớp definitions, the AI's 5-bậc →
 * 3-mức reduction, the (neutral) counts, the cổng-cứng predicate and the
 * `lyDo` derivation Cấp 1's NOT-NULL column still needs.
 *
 * ★ Nothing in this module scores the user đúng/sai against AI (spec §4.2/§9).
 * `countKhacAi` is a NEUTRAL count of "góc nhìn khác AI" — the arbiter of
 * reading quality is the REAL market outcome, measured server-side.
 */

/** spec §5.1 — canonical lớp order (identical to the BE's `LOP_KEYS`). */
export const LOP_KEYS: readonly Lop[] = [
  "ky_thuat",
  "dong_tien",
  "noi_bo",
  "tin_tuc",
  "dinh_gia",
] as const

/** Which real data source backs one lớp's up-front detail. */
export interface LopDef {
  lop: Lop
  icon: string
  label: string
  /** "Nguồn dữ liệu (dev lấy từ đây)" — shown for §C12c provenance. */
  source: string
  /**
   * AI Insight v2 layer key backing this lớp, or `null` for 💎 Định giá (BCTC
   * KHỐI 02 — not an AI Insight layer, so it has no 5-bậc `statusLevel`).
   */
  layer: "L1" | "L3" | "L4" | "L5" | null
}

/**
 * spec §5.1 — the 5 lớp, in the spec's order. Sources are exactly Cấp 1's
 * (`cap1/types.ts#LY_DO_OPTIONS` + `cap1/AiThanhTra.tsx`'s `LAYER_BY_REASON`):
 * Cấp 4 reads the SAME layers, it just reads all 5 instead of one.
 */
export const LOP_DEFS: readonly LopDef[] = [
  {
    lop: "ky_thuat",
    icon: "🎯",
    label: "Kỹ thuật",
    source: "AI Insight · L1 Xu hướng",
    layer: "L1",
  },
  {
    lop: "dong_tien",
    icon: "💰",
    label: "Dòng tiền",
    source: "AI Insight · L3 Dòng tiền (khối ngoại + tự doanh)",
    layer: "L3",
  },
  {
    lop: "noi_bo",
    icon: "👤",
    label: "Nội bộ",
    source: "AI Insight · L4 Nội bộ (lãnh đạo mua)",
    layer: "L4",
  },
  { lop: "tin_tuc", icon: "📰", label: "Tin tức", source: "AI Insight · L5 Tin tức", layer: "L5" },
  {
    lop: "dinh_gia",
    icon: "💎",
    label: "Định giá",
    source: "AI Phân tích BCTC · KHỐI 02 Giá đắt hay rẻ",
    layer: null,
  },
] as const

/** spec §5.1 — the 3 self-rating buttons, in the spec's order. */
export const NHAN_DINH_OPTIONS: readonly { value: NhanDinhLop; label: string }[] = [
  { value: "ok", label: "Ủng hộ" },
  { value: "neu", label: "Trung tính" },
  { value: "bad", label: "Ngược chiều" },
] as const

export const NHAN_DINH_LABEL: Record<NhanDinhLop, string> = {
  ok: "Ủng hộ",
  neu: "Trung tính",
  bad: "Ngược chiều",
}

const NHAN_DINH_VALUES: readonly string[] = ["ok", "neu", "bad"]

/**
 * spec §5.3 — "User chấm 3 mức, AI đánh giá theo thang 5 bậc thật rồi rút về 3
 * mức để đối chiếu":
 *
 * | Thang 5 bậc thật (Cấp 1's `Verdict`)        | 3 mức Cấp 4  |
 * |----------------------------------------------|--------------|
 * | ✅ Ủng hộ mạnh · ✅ Ủng hộ                     | Ủng hộ (ok)  |
 * | ⚪ Trung tính                                 | Trung tính   |
 * | ⚠ Cần chú ý · ❌ Ngược chiều                  | Ngược chiều  |
 *
 * Reuses Cấp 1's already-proven 5-bậc mapping (`cap1/verdict.ts`) rather than
 * re-deriving it from Vietnamese status strings, so the two cấp can never drift.
 */
export function nhanDinhFromVerdict(verdict: Verdict): NhanDinhLop {
  switch (verdict) {
    case "ung_ho_manh":
    case "ung_ho":
      return "ok"
    case "trung_tinh":
      return "neu"
    case "can_chu_y":
    case "nguoc_chieu":
    default:
      return "bad"
  }
}

/**
 * Where a lớp's AI rating comes from: an AI Insight layer's real 5-bậc
 * `statusLevel` (L1/L3/L4/L5), or 💎 Định giá's price-vs-vùng-giá-trị read.
 */
export type AiRatingSource =
  | { kind: "statusLevel"; statusLevel: 1 | 2 | 3 | 4 | 5 }
  | {
      kind: "valuation"
      currentPrice: number
      median: number
      rangeLow: number
      rangeHigh: number
    }

/** spec §5.3 — one lớp's AI đánh giá, reduced to the 3 mức used for đối chiếu. */
export function deriveAiRating(source: AiRatingSource): NhanDinhLop {
  if (source.kind === "statusLevel") {
    return nhanDinhFromVerdict(verdictFromStatusLevel(source.statusLevel))
  }
  return nhanDinhFromVerdict(
    verdictFromValuation({
      currentPrice: source.currentPrice,
      median: source.median,
      rangeLow: source.rangeLow,
      rangeHigh: source.rangeHigh,
    }),
  )
}

/**
 * Số lớp được đánh giá **Ủng hộ** trong một bản chấm 5 lớp.
 *
 * Called with `ai_5_lop` for spec §5.2's "Đồng thuận: X/5 lớp AI đánh giá Ủng
 * hộ" line — which is also exactly how the backend re-derives
 * `order_kehoach.so_lop_dong_thuan` (see `Cap4Service.record_kehoach`), so FE
 * and BE never show different numbers. Works identically on `doc_5_lop` when a
 * caller wants the user's own Ủng hộ count.
 */
export function countDongThuan(lop5: Lop5Partial | null | undefined): number {
  if (!lop5) return 0
  return LOP_KEYS.filter((lop) => lop5[lop] === "ok").length
}

/**
 * Số lớp user đọc KHÁC AI — a NEUTRAL count (spec §4.2: "Lệch AI = 'góc nhìn
 * khác', KHÔNG phải 'sai'"). Only lớp present in BOTH maps are compared, so a
 * lớp whose real data failed to load is never counted as a disagreement.
 *
 * Mirrors the backend's own derivation of `so_lop_khac_ai`.
 */
export function countKhacAi(
  doc5Lop: Lop5Partial | null | undefined,
  ai5Lop: Lop5Partial | null | undefined,
): number {
  if (!doc5Lop || !ai5Lop) return 0
  return LOP_KEYS.filter(
    (lop) => doc5Lop[lop] != null && ai5Lop[lop] != null && doc5Lop[lop] !== ai5Lop[lop],
  ).length
}

/** Số lớp user và AI cùng góc nhìn — the "Y/5" half of spec §5.2's summary. */
export function countCungGocNhin(
  doc5Lop: Lop5Partial | null | undefined,
  ai5Lop: Lop5Partial | null | undefined,
): number {
  if (!doc5Lop || !ai5Lop) return 0
  return LOP_KEYS.filter(
    (lop) => doc5Lop[lop] != null && ai5Lop[lop] != null && doc5Lop[lop] === ai5Lop[lop],
  ).length
}

/**
 * spec §5.2 cổng cứng — "chưa chấm đủ 5 lớp → nút ĐẶT LỆNH MUA khóa", and the
 * same predicate gates the AI đối chiếu reveal ("chống nhìn bài").
 */
export function isDoc5LopComplete(doc5Lop: Lop5Partial | null | undefined): boolean {
  if (!doc5Lop) return false
  return LOP_KEYS.every((lop) => NHAN_DINH_VALUES.includes(doc5Lop[lop] as string))
}

/** AI-support strength used to rank the user's Ủng hộ lớp (higher = stronger). */
const AI_SUPPORT_RANK: Record<NhanDinhLop, number> = { ok: 2, neu: 1, bad: 0 }

/**
 * Cấp 4 REPLACES Cấp 1's "chọn 1 lý do" field with the khối "Đọc 5 lớp" — but
 * `order_kehoach.lyDo` is still **NOT NULL** on the backend (Cấp 1's column,
 * and `/cap1/kehoach` is what creates the row all four cấp extend). So a Cấp 4
 * BUY still has to send SOME `lyDo`; this derives one from the 5 ratings
 * instead of inventing a sentinel, keeping Cấp 1's own per-lý-do analytics
 * (`so_ly_do_da_dung`, `Cap1PortfolioAnalysis`) meaningful rather than skewed.
 *
 * Rule, in order:
 *  1. Among the lớp the user rated **Ủng hộ**, the one AI supports most
 *     strongly (`ok` > `neu` > `bad`/absent) — i.e. the reading most likely to
 *     be the real driver of the buy. Ties break by canonical lớp order.
 *  2. No AI đối chiếu yet → step 1 degenerates to the FIRST Ủng hộ lớp.
 *  3. No lớp rated Ủng hộ at all → the first RATED lớp (still something the
 *     user actually read).
 *  4. Nothing rated → `"ky_thuat"`, a stable default (never random, so the
 *     value is reproducible in tests and in support conversations).
 *
 * NOTE: this is a storage-compat choice, NOT a judgement — nothing in Cấp 4
 * reads this field back, and it never affects the "đúng/sai" ban.
 */
export function deriveLyDoForCap1(
  doc5Lop: Lop5Partial | null | undefined,
  ai5Lop?: Lop5Partial | null,
): Lop {
  const rated = LOP_KEYS.filter((lop) => doc5Lop?.[lop] != null)
  const ungHo = rated.filter((lop) => doc5Lop?.[lop] === "ok")

  if (ungHo.length > 0) {
    let best = ungHo[0]
    let bestRank = -1
    for (const lop of ungHo) {
      const aiMuc = ai5Lop?.[lop]
      const rank = aiMuc ? AI_SUPPORT_RANK[aiMuc] : -1
      // Strict `>` keeps the canonical-order tie-break (LOP_KEYS order).
      if (rank > bestRank) {
        best = lop
        bestRank = rank
      }
    }
    return best
  }

  return rated[0] ?? "ky_thuat"
}
