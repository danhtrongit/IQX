/**
 * Cấp 1 «Học việc» — shared types.
 *
 * Wire shapes mirror the backend `Cap1*` schemas 1:1 (`backend/app/schemas/cap1.py`).
 * `lyDo` / `trangThai_luc_dat` intentionally keep the spec's exact (mixed-case)
 * wire field names — see that module's docstring.
 */

export type LyDo = "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia"
export type TrangThaiLucDat = "ung_ho" | "trung_tinh" | "can_chu_y" | "nguoc_chieu"
export type CamXuc = "binh_tinh" | "so" | "hoi_tiec" | "khong_ro"

/** Behaviour-progress row for the current user's Cấp 1 (one per user). */
export interface Cap1Progress {
  id: string
  user_id: string
  entered_at: string
  da_xem_tour: boolean
  task_1_done_at: string | null
  task_2_done_at: string | null
  task_3_done_at: string | null
  task_4_done_at: string | null
  /** ⑤ «10 lệnh Thực chiến» — auto-derived from `so_lenh_thuc_chien >= 10`. */
  task_5_done_at: string | null
  /** ③ làm quen 5 lý do — 0..5 distinct `lyDo` used so far. */
  so_ly_do_da_dung: number
  /** ④ chọn lý do có cơ sở — count of orders whose `trangThai_luc_dat` was `ung_ho`. */
  so_lenh_ly_do_ung_ho: number
  /** ⑤ tổng số lệnh Thực chiến. */
  so_lenh_thuc_chien: number
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

export interface KehoachInput {
  order_id: string
  /** spec §9 verbatim field name (mixed-case, matches the BE wire contract). */
  lyDo: LyDo
  /** spec §9 verbatim field name (mixed-case, matches the BE wire contract). */
  trangThai_luc_dat: TrangThaiLucDat
  vung_mua: number
  co_bam_doc_chi_tiet: boolean
  snapshot?: Record<string, unknown> | null
}

export interface OrderKehoach {
  id: string
  order_id: string
  /** spec §9 verbatim field name (mixed-case, matches the BE wire contract). */
  lyDo: LyDo
  /** spec §9 verbatim field name (mixed-case, matches the BE wire contract). */
  trangThai_luc_dat: TrangThaiLucDat
  vung_mua: number
  co_bam_doc_chi_tiet: boolean
  snapshot_lop_du_lieu: Record<string, unknown> | null
}

export interface KetsoInput {
  order_id: string
  cam_xuc?: CamXuc | null
}

export interface OrderKetso {
  id: string
  order_id: string
  gia_ra: number
  so_phien_giu: number
  so_ngay_lich: number
  pnl_pct: number
  pnl_vnd: number
  cam_xuc: CamXuc | null
  closed_at: string
}

/** spec §4 Trường 1 — the 5 lý do, in the spec table's exact order. */
export interface LyDoOption {
  value: LyDo
  icon: string
  label: string
  /** "Nguồn dữ liệu (dev lấy từ đây)" column, spec §4. */
  source: string
}

export const LY_DO_OPTIONS: readonly LyDoOption[] = [
  { value: "ky_thuat", icon: "🎯", label: "Kỹ thuật", source: "AI Insight · L1 Xu hướng" },
  {
    value: "dong_tien",
    icon: "💰",
    label: "Dòng tiền",
    source: "AI Insight · L3 Dòng tiền (khối ngoại + tự doanh)",
  },
  { value: "noi_bo", icon: "👤", label: "Nội bộ", source: "AI Insight · L4 Nội bộ (lãnh đạo mua)" },
  { value: "tin_tuc", icon: "📰", label: "Tin tức", source: "AI Insight · L5 Tin tức" },
  {
    value: "dinh_gia",
    icon: "💎",
    label: "Định giá",
    source: "AI Phân tích BCTC · KHỐI 02 Giá đắt hay rẻ",
  },
] as const

/**
 * spec §4 "Cổng cứng": nút ĐẶT LỆNH MUA disabled nếu thiếu Lý do mua hoặc
 * Vùng mua. Hợp lệ: Lý do đã chọn 1/5 · Vùng mua là số > 0.
 */
export function isKehoachValid(lyDo: LyDo | null, vungMua: number | null): boolean {
  return lyDo != null && vungMua != null && vungMua > 0
}

/**
 * How many of the 5 Cấp 1 tasks are complete (mirrors `cap0/types.ts`'s
 * `countTasksDone`) — used by `JourneyPanelCap1` (ring progress + checklist
 * header "x/5") and `GraduationModalCap1` (`isGraduationReadyCap1`).
 *
 * ★ Hành trình Cấp 1 rút từ 6 xuống 5 nhiệm vụ (mockup
 * `iqx-cap1-hanhtrinh.html`): «Xem lại danh mục — mở Phân tích danh mục 3 lần
 * khác ngày» bị bỏ hẳn, «10 lệnh Thực chiến» dời từ ⑥ về ⑤. Một wire shape cũ
 * còn sót `task_6_done_at` KHÔNG được cộng vào đây — nó đã không còn là nhiệm
 * vụ (đúng bài học `cap0/types.ts` đã ghi cho lần rút nhiệm vụ của Cấp 0).
 */
export function countCap1TasksDone(progress: Cap1Progress | null | undefined): number {
  if (!progress) return 0
  return (
    [
      progress.task_1_done_at,
      progress.task_2_done_at,
      progress.task_3_done_at,
      progress.task_4_done_at,
      progress.task_5_done_at,
    ].filter((t) => t != null).length
  )
}
