import {
  coachTemplateCap1,
  type CoachParamsCap1,
  type CoachSituationCap1,
} from "@/features/cap1/coachTemplateCap1"
import type { KetsoInputCap2, PhuongPhapSlTp } from "./types"

/**
 * Cấp 2 Kết sổ coach — exit-discipline layer (spec `IQX-Cap2-Spec.md` §1 + §5.6).
 *
 * Cấp 1's coach (`coachTemplateCap1`) already covers the lý-do/kết-quả grid
 * (A-F). Cấp 2 does NOT replace it — it ADDS a second, independent paragraph
 * about whether the user honoured their own cắt lỗ/chốt lời commitment.
 * `composeCoachCap2` below calls BOTH and returns them side by side so the
 * modal can render two "layers" (spec's cumulative principle).
 *
 * Rule-based, NOT AI — same convention as Cấp 1/Cấp 0's coach templates.
 */

export type CoachIdCap2 =
  | "cat_lo_cham"
  | "chot_loi_hut"
  | "ban_som_khi_lo_nhe"
  | "nhoi_lenh_khi_lo"
  | "moc_bi_quet"
  | "cach_dat_tot"

/** Only the fields `pickCoachIdCap2` actually needs out of `KetsoInputCap2`. */
export type CoachFlagsCap2 = Pick<
  KetsoInputCap2,
  | "cham_SL_khong_cat"
  | "cham_SL_cat_dung_phien_ke"
  | "giu_cham_SL_bao_nhieu_phien"
  | "cham_TP_giu_lam_hut"
  | "ban_som_khi_lo_nhe"
  | "nhoi_lenh_khi_lo"
>

export interface CoachSituationCap2 {
  phuongPhapSlTp: PhuongPhapSlTp
  /** Cắt lỗ cam kết (`order_kehoach.cat_lo`). */
  catLo: number
  /** Chốt lời cam kết (`order_kehoach.chot_loi`). */
  chotLoi: number
  flags: CoachFlagsCap2
  /**
   * Giá cao nhất quan sát được SAU KHI cắt lỗ đúng phiên (spec §5.6 "mốc bị
   * quét"). `null`/omitted when not observed — the "mốc bị quét" nhắc simply
   * doesn't trigger without it (graceful degrade, no crash).
   */
  giaSauKhiCat?: number | null
}

export interface CoachResultCap2 {
  id: CoachIdCap2
  text: string
}

/** "Bật lên mạnh" threshold for spec §5.6's "mốc bị quét" (% above cắt lỗ). */
const MOC_BI_QUET_REBOUND_PCT = 5

function isMocBiQuet(situation: CoachSituationCap2): boolean {
  const { flags, catLo, giaSauKhiCat } = situation
  if (!flags.cham_SL_cat_dung_phien_ke) return false
  if (giaSauKhiCat == null || !catLo) return false
  const reboundPct = ((giaSauKhiCat - catLo) / catLo) * 100
  return reboundPct >= MOC_BI_QUET_REBOUND_PCT
}

/**
 * Picks exactly 1 of the 6 situations, in the priority order the task brief
 * lists them (which also matches spec §1's severity order for the first 4):
 *
 *   1. cắt lỗ chậm       — chạm SL, chưa cắt đúng phiên (§1's most direct vi phạm)
 *   2. chốt lời hụt       — chạm TP, giữ lại thành hụt
 *   3. bán sớm khi lỗ nhẹ — bán trước khi chạm SL, panic-sell
 *   4. nhồi lệnh khi lỗ   — averaging down
 *   5. mốc bị quét        — cắt ĐÚNG (không vi phạm) nhưng giá hồi mạnh sau đó
 *                           (advisory, not a violation — ranked below the 4
 *                           actual vi phạm but above the generic "tốt" case)
 *   6. cách đặt tốt       — fallback: no vi phạm, no mốc-bị-quét situation —
 *                           respected the commitment, short praise.
 *
 * The 4 vi phạm are checked independently (NOT mutually exclusive in the raw
 * flags — a real closed order could in principle have more than one true),
 * so this is a deliberate, total ordering: the first matching id wins.
 */
export function pickCoachIdCap2(situation: CoachSituationCap2): CoachIdCap2 {
  const { flags } = situation
  if (flags.cham_SL_khong_cat) return "cat_lo_cham"
  if (flags.cham_TP_giu_lam_hut) return "chot_loi_hut"
  if (flags.ban_som_khi_lo_nhe) return "ban_som_khi_lo_nhe"
  if (flags.nhoi_lenh_khi_lo) return "nhoi_lenh_khi_lo"
  if (isMocBiQuet(situation)) return "moc_bi_quet"
  return "cach_dat_tot"
}

const METHOD_LABEL: Record<PhuongPhapSlTp, string> = {
  ho_tro_khang_cu: "Hỗ trợ/Kháng cự",
  bien_do_dao_dong: "Biên độ dao động",
}

function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

function templateCatLoCham(catLo: number, soPhien: number | null | undefined): string {
  const chiTiet =
    soPhien != null && soPhien > 0
      ? `giữ thêm ${soPhien} phiên mới cắt`
      : "chưa cắt đúng phiên chạm"
  return (
    `Giá đã chạm cắt lỗ cam kết (${fmtVnd(catLo)}) nhưng bạn ${chiTiet}. ` +
    `Cắt chậm thường khiến lỗ nặng hơn kế hoạch ban đầu — cắt đúng phiên chạm là cách bảo toàn vốn tốt nhất.`
  )
}

function templateChotLoiHut(chotLoi: number): string {
  return (
    `Giá đã chạm chốt lời cam kết (${fmtVnd(chotLoi)}) nhưng bạn giữ lại kỳ vọng thêm — thành ` +
    `"chốt lời hụt", cuối cùng bán thấp hơn kế hoạch. Chốt đúng lúc chạm mốc là cách khóa lãi chắc chắn nhất.`
  )
}

function templateBanSomKhiLoNhe(catLo: number): string {
  return (
    `Bạn bán khi đang lỗ nhẹ, giá CHƯA chạm cắt lỗ cam kết (${fmtVnd(catLo)}). Bán sớm vì hoảng ` +
    `thường khiến bạn bỏ lỡ nhịp hồi — nếu kế hoạch cắt lỗ đã có cơ sở, hãy để nó chạy đến đúng ngưỡng.`
  )
}

function templateNhoiLenhKhiLo(): string {
  return (
    `Bạn nhồi thêm lệnh khi vị thế đang lỗ. Nhồi lệnh khi lỗ (averaging down) thường khiến lỗ ` +
    `nặng hơn nếu giá tiếp tục giảm — cắt lỗ đúng kế hoạch quan trọng hơn gỡ giá vốn.`
  )
}

function templateMocBiQuet(method: PhuongPhapSlTp, catLo: number, giaSauKhiCat: number): string {
  return (
    `Bạn cắt lỗ theo ${METHOD_LABEL[method]} tại ${fmtVnd(catLo)}, đúng cam kết — nhưng giá sau đó ` +
    `bật lên ${fmtVnd(giaSauKhiCat)}. Có thể mốc này hơi chặt — lần sau thử đối chiếu thêm với Biên độ dao động.`
  )
}

function templateCachDatTot(method: PhuongPhapSlTp, catLo: number, chotLoi: number): string {
  return (
    `Lệnh này bạn tôn trọng đúng cam kết cắt lỗ/chốt lời theo ${METHOD_LABEL[method]} ` +
    `(${fmtVnd(catLo)} / ${fmtVnd(chotLoi)}). Giữ vững kỷ luật này — đây chính xác là điều Cấp 2 muốn rèn.`
  )
}

/** Chọn + render Cấp 2's discipline paragraph for the just-closed order. */
export function pickCoachCap2(situation: CoachSituationCap2): CoachResultCap2 {
  const id = pickCoachIdCap2(situation)
  const { phuongPhapSlTp, catLo, chotLoi, flags, giaSauKhiCat } = situation
  switch (id) {
    case "cat_lo_cham":
      return { id, text: templateCatLoCham(catLo, flags.giu_cham_SL_bao_nhieu_phien) }
    case "chot_loi_hut":
      return { id, text: templateChotLoiHut(chotLoi) }
    case "ban_som_khi_lo_nhe":
      return { id, text: templateBanSomKhiLoNhe(catLo) }
    case "nhoi_lenh_khi_lo":
      return { id, text: templateNhoiLenhKhiLo() }
    case "moc_bi_quet":
      // `isMocBiQuet` already guarantees `giaSauKhiCat` is non-null here.
      return { id, text: templateMocBiQuet(phuongPhapSlTp, catLo, giaSauKhiCat as number) }
    case "cach_dat_tot":
      return { id, text: templateCachDatTot(phuongPhapSlTp, catLo, chotLoi) }
  }
}

export interface ComposedCoachCap2 {
  /** Cấp 1's A-F lý-do/kết-quả paragraph, delegated verbatim. */
  cap1Text: string
  /** Cấp 2's exit-discipline paragraph (added layer). */
  cap2: CoachResultCap2
}

/**
 * Composes BOTH coach layers for `KetsoModalCap2`: Cấp 1's grid text
 * (delegated to `coachTemplateCap1` — never re-implemented) + Cấp 2's own
 * discipline nhắc. The modal renders both paragraphs.
 */
export function composeCoachCap2(
  cap1Situation: CoachSituationCap1,
  cap1Params: CoachParamsCap1,
  cap2Situation: CoachSituationCap2,
): ComposedCoachCap2 {
  return {
    cap1Text: coachTemplateCap1(cap1Situation, cap1Params),
    cap2: pickCoachCap2(cap2Situation),
  }
}
