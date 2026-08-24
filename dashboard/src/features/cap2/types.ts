/**
 * Cấp 2 «Kỷ luật» — shared types.
 *
 * Wire shapes mirror the backend `Cap2*` schemas 1:1
 * (`backend/app/schemas/cap2.py`). The `cham_SL_*`/`cham_TP_*` fields
 * intentionally keep the spec's exact (mixed-case) wire field names — same
 * convention `cap1/types.ts`'s `lyDo`/`trangThai_luc_dat` already uses (see
 * `backend/app/schemas/cap2.py`'s own docstring for why).
 */

export type PhuongPhapSlTp = "ho_tro_khang_cu" | "bien_do_dao_dong"
export type XepLoai = "xanh" | "vang" | "do"

/**
 * Behaviour-progress row for the current user's Cấp 2 (one per user) — mô hình
 * **ĐÚNG MỘT nhiệm vụ** (mockup `iqx-cap2-hanhtrinh.html`, jbar `CẤP 2 · 0/1`):
 *
 *  ① «10 lệnh Thực chiến có đặt cắt lỗ / chốt lời» → `so_lenh_co_cl_tp` (n/10)
 *
 * Tốt nghiệp = 1/1.
 *
 * ★★ `task_2_done_at` KHÔNG còn tồn tại — nhiệm vụ ② «Thực hiện đúng khi giá
 * chạm mốc» đã bỏ hẳn (backend migration `9c3f7ad10b52` DROP cột đó), nên
 * payload `GET /cap2/progress` không bao giờ còn mang nó. Để nó ngoài kiểu wire
 * biến "đọc lại một trường đã chết" thành lỗi biên dịch — đúng cái bẫy
 * `chuoi_current` đã mắc một lần ở `Cap2ChuoiLegacy` bên dưới.
 */
export interface Cap2Progress {
  id: string
  user_id: string
  entered_at: string
  task_1_done_at: string | null
  /** Số lệnh Thực chiến đã ghi cam kết cắt lỗ/chốt lời — mẫu số 10 (nhiệm vụ ①). */
  so_lenh_co_cl_tp: number
  /**
   * ★ BA con số dưới đây là SỐ MÔ TẢ, KHÔNG phải nhiệm vụ. Chúng chỉ để khối ④
   * «Bạn đã dùng cơ chế cắt lỗ / chốt lời thế nào» của «Phân tích danh mục» vẽ
   * (mockup `iqx-cap2-phantich-danhmuc.html` — KHÔNG đổi khi Cấp 2 rút về 1
   * nhiệm vụ), và các trang Phân tích của Cấp 3-8 vẽ lại từ chính hàng này.
   * ⚠ KHÔNG được trình bày chúng kèm mẫu số/mốc phải đạt («x/2», «còn n lần»)
   * — không còn nhiệm vụ nào đo chúng.
   *
   * 🛑 Số lần giá chạm cắt lỗ và user cắt ngay trong phiên đó.
   */
  so_lan_cat_lo_dung: number
  /** 🎯 Số lần giá chạm chốt lời và user bán theo kế hoạch (không giữ làm hụt). */
  so_lan_chot_loi_dung: number
  /** ✅ Tổng lần thực hiện đúng. Server bảo đảm
   *  `so_lan_thuc_hien_dung === so_lan_cat_lo_dung + so_lan_chot_loi_dung`. */
  so_lan_thuc_hien_dung: number
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

/**
 * ── ★★ DI SẢN: "chuỗi lệnh kỷ luật" — KHÁI NIỆM ĐÃ BỊ GỠ KHỎI SẢN PHẨM ★★ ───
 *
 * Migration `8f1a5c7d2e64` DROP cả `chuoi_current`/`chuoi_record`/
 * `last_chuoi_reset_at` khỏi `cap2_progress`; `grep -rn "chuoi" backend/app/`
 * hôm nay trả về RỖNG. Nghĩa là payload `GET /cap2/progress` **không bao giờ
 * còn** chứa ba trường này.
 *
 * ★★ Vì thế chúng KHÔNG nằm trong `Cap2Progress` nữa. Trước đây chúng ở đó
 * dưới dạng optional, nên `KetsoModalCap2` đọc `cap2Progress?.chuoi_current ??
 * 0` mà `tsc -b` không kêu một tiếng — và MỌI user Cấp 2 đọc "tăng lên 1 lệnh
 * liên tiếp không vi phạm" ở mọi lệnh, mãi mãi. Để chúng ngoài kiểu wire biến
 * đúng lỗi đó thành lỗi biên dịch.
 *
 * Kiểu này chỉ còn để `ChuoiWidget.tsx` (di sản, KHÔNG được mount ở đâu) biên
 * dịch được. ⚠ **KHÔNG thêm chỗ đọc mới** — không nguồn nào cấp số cho nó.
 */
export interface Cap2ChuoiLegacy {
  chuoi_current?: number
  chuoi_record?: number
  last_chuoi_reset_at?: string | null
}

export interface KehoachInputCap2 {
  order_id: string
  phuong_phap_sl_tp: PhuongPhapSlTp
  cat_lo: number
  chot_loi: number
}

/** Cấp 2's view of `order_kehoach` — Cấp 1's fields + the SL/TP commitment. */
export interface OrderKehoachCap2 {
  id: string
  order_id: string
  vung_mua: number
  phuong_phap_sl_tp: PhuongPhapSlTp | null
  cat_lo: number | null
  chot_loi: number | null
}

export interface KetsoInputCap2 {
  order_id: string
  cham_SL_cuoi_phien?: boolean
  cham_SL_cat_dung_phien_ke?: boolean
  cham_SL_khong_cat?: boolean
  giu_cham_SL_bao_nhieu_phien?: number | null
  cham_TP_giu_lam_hut?: boolean
  ban_som_khi_lo_nhe?: boolean
  nhoi_lenh_khi_lo?: boolean
}

/** Cấp 2's view of `order_ketso` — Cấp 1's fields + the 7 discipline flags. */
export interface OrderKetsoCap2 {
  id: string
  order_id: string
  gia_ra: number
  pnl_pct: number
  pnl_vnd: number
  closed_at: string
  cham_SL_cuoi_phien: boolean
  cham_SL_cat_dung_phien_ke: boolean
  cham_SL_khong_cat: boolean
  giu_cham_SL_bao_nhieu_phien: number | null
  cham_TP_giu_lam_hut: boolean
  ban_som_khi_lo_nhe: boolean
  nhoi_lenh_khi_lo: boolean
}

/** Breakdown of the 0-100 điểm kỷ luật formula — §C12c "số đến từ đâu". */
export interface DiemKyLuatThanhPhan {
  ke_hoach: number
  ke_hoach_toi_da: number
  cat_lo_dung: number
  cat_lo_dung_toi_da: number
  khong_nhoi: number
  khong_nhoi_toi_da: number
  chot_loi_dung: number
  chot_loi_dung_toi_da: number
}

/** Response for `GET /cap2/diem-ky-luat` — score + explanation + breakdown. */
export interface DiemKyLuat {
  ngay: string
  co_giao_dich: boolean
  co_tinh_huong: boolean
  diem: number | null
  xep_loai: XepLoai | null
  giai_thich: string
  thanh_phan: DiemKyLuatThanhPhan | null
}

/**
 * spec §5.4 "cổng cứng": nút ĐẶT LỆNH MUA khóa cho đến khi chọn 1 trong 2
 * cách cắt lỗ/chốt lời. Hợp lệ: đã chọn 1 cách VÀ cat_lo/chot_loi > 0.
 */
export function isSlTpValid(
  phuongPhap: PhuongPhapSlTp | null,
  catLo: number | null,
  chotLoi: number | null,
): boolean {
  return phuongPhap != null && catLo != null && catLo > 0 && chotLoi != null && chotLoi > 0
}

/** Tổng số nhiệm vụ Cấp 2 — mẫu số DUY NHẤT cho jbar, `.ck-head`, vòng huy
 *  hiệu và điều kiện tốt nghiệp. Mockup `iqx-cap2-hanhtrinh.html`: `0/1`. */
export const CAP2_TOTAL_TASKS = 1

/**
 * How many of Cấp 2's nhiệm vụ are complete (mirrors `cap1/types.ts`'s
 * `countCap1TasksDone`) — used by `JourneyPanelCap2` + `GraduationModalCap2`.
 *
 * ★ Chỉ đếm ĐÚNG MỘT cột, `task_1_done_at`. Một wire shape cũ còn sót
 * `task_2/3/4/5_done_at` KHÔNG được tính thành nhiệm vụ thứ 2/3/4/5 — cùng cái
 * bẫy `cap0/types.ts` và `cap1/types.ts` đã ghi, và lần này chính `task_2` là
 * cột vừa bị xoá khỏi server.
 */
export function countCap2TasksDone(progress: Cap2Progress | null | undefined): number {
  if (!progress) return 0
  return [progress.task_1_done_at].filter((t) => t != null).length
}
