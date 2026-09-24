/**
 * The cumulative BUY commitment (`journey_plan`) the backend validates before
 * it touches cash or positions, plus the client-side hard gates that keep the
 * form from ever submitting a body the server would reject.
 *
 * Level semantics are server-owned (`JourneyPlanService.placeOrderWithPlan`):
 *
 * | Cấp | bắt buộc                                                      |
 * |-----|---------------------------------------------------------------|
 * | 0   | `ly_do_doi_thuong` (slug)                                     |
 * | 1+  | `lyDo` + `trangThai_luc_dat` + `vung_mua` (> 0, nguyên)       |
 * | 2+  | `phuong_phap_sl_tp` + `cat_lo` + `chot_loi` (> 0, nguyên)     |
 * | 3+  | `khau_vi` + `muc_tu_tin` + `cach_khoi_luong`                   |
 * | 4–5 | `doc_5_lop` chấm đủ **đúng 5 lớp**                             |
 * | 6   | không thêm gì — bảng mâu thuẫn thay ô tự chấm 5 lớp           |
 *
 * Outside the journey (`level === null`) a BUY carries no `journey_plan` at
 * all; a SELL never carries one.
 */
import type {
  CachKhoiLuong,
  CachKhoiLuongWire,
  ConflictLevel,
  Lop5Partial,
  LyDo,
  MucTuTin,
  PhuongPhapSlTp,
  TrangThaiLucDat,
  Verdict,
  KhauViLoai,
} from "./plan-math"
import {
  cachKhoiLuongWire,
  deriveLyDoForCap1,
  isDoc5LopComplete,
  isKehoachValid,
  isKhoiLuongValid,
  isSlTpValid,
  lyDoTuMauThuan,
  verdictToTrangThai,
} from "./plan-math"
import type { MauThuanCap6 } from "./plan-math"

/** Wire body for `POST /virtual-trading/orders.journey_plan`. */
export type JourneyPlanInput = {
  ly_do_doi_thuong?: string
  lyDo?: LyDo
  trangThai_luc_dat?: TrangThaiLucDat
  vung_mua?: number
  co_bam_doc_chi_tiet?: boolean
  snapshot?: Record<string, unknown> | null
  phuong_phap_sl_tp?: PhuongPhapSlTp
  cat_lo?: number
  chot_loi?: number
  nhoi_lenh_alert_id?: string
  khau_vi?: KhauViLoai
  muc_tu_tin?: MucTuTin
  cach_khoi_luong?: CachKhoiLuongWire
  doc_5_lop?: Lop5Partial
  conflict_level?: ConflictLevel
}

/**
 * Everything the panel collected for THIS buy. All of it is per-decision state:
 * the panel is remounted on a symbol change so nothing carries over to a
 * different stock's order.
 */
export type PlanDraft = {
  /** Cấp 0 chip slug (`cong_ty_toi_biet` …). */
  reason: string | null
  /** Cấp 1 field ① — `null` at Cấp 4+ where the 5-layer block replaces it. */
  lyDo: LyDo | null
  /** Cấp 1 field ② — defaults to giá hiện tại, user-editable. */
  vungMua: number | null | undefined
  /** "Đọc chi tiết lớp này →" was pressed for this order's lý do. */
  docChiTiet: boolean
  slTpMethod: PhuongPhapSlTp | null
  catLo: number | null
  chotLoi: number | null
  /** An accepted `proceed_buy` alert bound to this exact draft. */
  alertId: string | null
  khauVi: KhauViLoai | null
  mucTuTin: MucTuTin | null
  cachKhoiLuong: CachKhoiLuong | null
  doc5Lop: Lop5Partial
  conflictLevel: ConflictLevel | null
}

export function emptyPlanDraft(): PlanDraft {
  return {
    reason: null,
    lyDo: null,
    // `undefined` = untouched → the vùng mua field follows giá hiện tại;
    // `null` = the user cleared it, which the gate must see as missing.
    vungMua: undefined,
    docChiTiet: false,
    slTpMethod: null,
    catLo: null,
    chotLoi: null,
    alertId: null,
    khauVi: null,
    mucTuTin: null,
    cachKhoiLuong: null,
    doc5Lop: {},
    conflictLevel: null,
  }
}

/**
 * The lý do actually sent/used. Cấp 4 derives it from the five ratings (its
 * own picker is gone but `order_kehoach.lyDo` is NOT NULL); Cấp 6 derives it
 * from the SERVER's five-layer read, and falls back to `null` — which makes
 * Cấp 1's own field reappear — rather than stamping a default lớp onto the
 * order's permanent record.
 */
export function effectiveLyDo(params: {
  level: number
  draft: PlanDraft
  ai5Lop: Lop5Partial | null
  mauThuan: MauThuanCap6 | null | undefined
}): LyDo | null {
  const { level, draft, ai5Lop, mauThuan } = params
  if (level >= 6) return lyDoTuMauThuan(mauThuan)
  if (level >= 4) return deriveLyDoForCap1(draft.doc5Lop, ai5Lop)
  return draft.lyDo
}

/**
 * Everything the gates and the body builder read, in one object so the two can
 * never disagree about which lý do / verdict / ratings an order carries.
 */
export type PlanContext = {
  /** The journey level the buy is placed at (`null` = outside the journey). */
  level: number | null
  draft: PlanDraft
  /** `effectiveLyDo(...)` — already derived for Cấp 4/6. */
  lyDo: LyDo | null
  verdict: Verdict | null
  snapshot: Record<string, unknown> | null
  /** Cấp 0 always requires the durable reason chip. */
  requiresReason: boolean
}

export type PlanGate = { ok: true } | { ok: false; reason: string; message: string }

/**
 * Client mirror of the server's cumulative validation — the submit button's
 * disabled state and its tooltip both come from here, and `submit` re-checks it
 * as belt-and-suspenders (a programmatic click or Enter key must not skip it).
 */
export function planGate(context: PlanContext): PlanGate {
  const { level, draft, lyDo } = context
  if (level === null) return { ok: true }
  if (level === 0) {
    if (!draft.reason) {
      return {
        ok: false,
        reason: "reason",
        message: "Chọn một lý do ở khối Kế hoạch trước khi đặt lệnh MUA.",
      }
    }
    return { ok: true }
  }
  if (!isKehoachValid(lyDo, draft.vungMua)) {
    return {
      ok: false,
      reason: "kehoach",
      message:
        level >= 4 && lyDo != null
          ? "Nhập vùng mua mới đặt được lệnh."
          : "Chọn lý do mua và vùng mua mới đặt được lệnh.",
    }
  }
  if (level >= 2 && !isSlTpValid(draft.slTpMethod, draft.catLo, draft.chotLoi, draft.vungMua)) {
    return {
      ok: false,
      reason: "sl_tp",
      message: "Giá cắt lỗ, vùng mua và chốt lời phải tăng dần.",
    }
  }
  if (level >= 3 && !isKhoiLuongValid(draft.mucTuTin, draft.cachKhoiLuong)) {
    return {
      ok: false,
      reason: "khoi_luong",
      message: "Chấm mức tự tin và chọn cách tính khối lượng mới đặt được lệnh.",
    }
  }
  if (level >= 4 && level <= 5 && !isDoc5LopComplete(draft.doc5Lop)) {
    return { ok: false, reason: "doc_5_lop", message: "Chấm đủ cả 5 lớp mới đặt được lệnh." }
  }
  return { ok: true }
}

/**
 * The body actually POSTed. Returns `null` when the buy is not inside the
 * journey (no level) — the server accepts a plain BUY then.
 */
export function buildJourneyPlan(context: PlanContext): JourneyPlanInput | null {
  const { level, draft, lyDo, verdict, snapshot } = context
  if (level === null) return null
  if (level === 0) {
    return draft.reason ? { ly_do_doi_thuong: draft.reason } : null
  }
  const plan: JourneyPlanInput = {
    lyDo: lyDo ?? undefined,
    trangThai_luc_dat: verdictToTrangThai(verdict ?? "trung_tinh"),
    vung_mua: draft.vungMua == null ? undefined : Math.round(draft.vungMua),
    co_bam_doc_chi_tiet: draft.docChiTiet,
    snapshot,
  }
  if (level >= 2 && draft.slTpMethod && draft.catLo != null && draft.chotLoi != null) {
    plan.phuong_phap_sl_tp = draft.slTpMethod
    plan.cat_lo = Math.round(draft.catLo)
    plan.chot_loi = Math.round(draft.chotLoi)
    if (draft.alertId) plan.nhoi_lenh_alert_id = draft.alertId
  }
  if (level >= 3 && draft.khauVi && draft.mucTuTin != null && draft.cachKhoiLuong) {
    plan.khau_vi = draft.khauVi
    plan.muc_tu_tin = draft.mucTuTin
    plan.cach_khoi_luong = cachKhoiLuongWire(draft.cachKhoiLuong)
  }
  if (level >= 4 && level <= 5 && isDoc5LopComplete(draft.doc5Lop)) {
    plan.doc_5_lop = draft.doc5Lop
  }
  if (level >= 6 && draft.conflictLevel) plan.conflict_level = draft.conflictLevel
  return plan
}
