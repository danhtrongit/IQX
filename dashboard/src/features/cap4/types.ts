import type { LyDo, TrangThaiLucDat } from "@/features/cap1/types"
import type { PhuongPhapSlTp } from "@/features/cap2/types"
import type {
  CachKhoiLuongWire,
  KhauViLoai,
  MucTuTin,
} from "@/features/cap3/types"

/**
 * Cấp 4 «Thuần thục» — shared types.
 *
 * Wire shapes mirror the backend `Cap4*` schemas 1:1
 * (`backend/app/schemas/cap4.py`), whose own `LopLiteral`/`NhanDinhLiteral`
 * come from `backend/app/models/cap4.py`.
 */

/**
 * spec §5.1 — the 5 lớp (L1 Kỹ thuật · L3 Dòng tiền · L4 Nội bộ · L5 Tin tức ·
 * Định giá).
 *
 * They are EXACTLY Cấp 1's 5 `LyDo` keys, so this is an alias rather than a
 * re-declared union — the backend does the same (`LOP_KEYS` is derived from
 * `LyDo` "so the two can never drift", see `app/models/cap4.py`). Cấp 4
 * replaces "pick 1 of 5 lý do" with "rate all 5 lớp", so the vocabulary is
 * deliberately identical.
 */
export type Lop = LyDo

/** spec §5.1/§8 — the 3 mức each lớp is rated at (user's OR AI's, reduced). */
export type NhanDinhLop = "ok" | "neu" | "bad"

/** All 5 lớp rated. */
export type Lop5Map = Record<Lop, NhanDinhLop>

/** Some (possibly zero) lớp rated — the in-progress shape while reading. */
export type Lop5Partial = Partial<Record<Lop, NhanDinhLop>>

/** spec §7 khối ⑨ — a lớp's label after enough evidence (≥3 closed lệnh). */
export type NhanVuKhi = "vu_khi" | "diem_mu" | "chua_du_du_lieu"

/**
 * Số nhiệm vụ của Cấp 4 — MỘT. Mockup `iqx-cap4-hanhtrinh.html`: `.jbar`
 * "CẤP 4 · 0/1" và `.ck-head` "Trước khi lên Cấp 5 · 0/1".
 */
export const CAP4_TOTAL_TASKS = 1

/**
 * Ngưỡng của nhiệm vụ duy nhất — «Đọc và chấm đủ 5 lớp qua 10 lệnh»
 * (`Cap4Service._TASK1_SO_LENH_MIN`). FE chỉ dùng để VẼ tiến độ `n/10`; server
 * mới là nơi quyết định `task_1_done_at`.
 */
export const CAP4_SO_LENH_TARGET = 10

/**
 * Progress row for the current user's Cấp 4 (one per user).
 *
 * ★ Hình dạng MỚI — 1 nhiệm vụ. `task_2_done_at`/`task_3_done_at`/
 * `ty_le_thang_dong_thuan_cao` đã bị gỡ khỏi cả DB lẫn wire (migration
 * `a3f7c1d9e2b8`); đừng dựng lại chúng ở FE.
 */
export interface Cap4Progress {
  id: string
  user_id: string
  entered_at: string
  /** Nhiệm vụ DUY NHẤT — «Đọc và chấm đủ 5 lớp qua 10 lệnh». */
  task_1_done_at: string | null
  /** Số lệnh đã đọc + tự chấm đủ cả 5 lớp — tử số của `n/10`. */
  so_lenh_doc_du_5lop: number
  /**
   * Lớp bạn đọc chuẩn nhất — `null` = CHƯA ĐỦ DỮ LIỆU để kết luận (cần ≥3 lệnh
   * đã đóng cho lớp đó), KHÔNG phải "không có". Không còn là điều kiện tốt
   * nghiệp; vẫn hiện ở Phân tích danh mục (khối ⑨) + màn tốt nghiệp.
   */
  vu_khi_lop: Lop | null
  /** Lớp cần cải thiện — cùng quy ước `null` như `vu_khi_lop`. */
  diem_mu_lop: Lop | null
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

/**
 * How many of the Cấp 4 nhiệm vụ are complete — 0 hoặc 1 (mirrors
 * `cap3/types.ts#countCap3TasksDone`). Dùng cho checklist `JourneyPanelCap4`
 * + điều kiện mở `GraduationModalCap4`.
 */
export function countCap4TasksDone(progress: Cap4Progress | null | undefined): number {
  if (!progress) return 0
  return progress.task_1_done_at != null ? 1 : 0
}

/**
 * `POST /cap4/kehoach` — the khối "Đọc 5 lớp" appended to the `order_kehoach`
 * row Cấp 1 already created for this BUY.
 *
 * Atomic journey-plan contract accepts only the user's committed self-rating.
 * The server owns the AI snapshot and derives both comparison counters; the
 * client must never submit those fields as claimed evidence.
 */
export interface KehoachInputCap4 {
  order_id: string
  doc_5_lop: Lop5Partial
}

/** Cấp 4's view of `order_kehoach` — Cấp 1's fields + the đọc-5-lớp block. */
export interface OrderKehoachCap4 {
  id: string
  order_id: string
  vung_mua: number
  doc_5_lop: Lop5Partial | null
  ai_5_lop: Lop5Partial | null
  so_lop_dong_thuan: number | null
  so_lop_khac_ai: number | null
}

/** Complete server-owned BUY commitment used to restore Kết sổ after reload. */
export interface Cap4PlanWire {
  id: string
  order_id: string
  symbol: string
  quantity: number
  bought_at: string
  gia_vao: number
  lyDo: LyDo
  trangThai_luc_dat: TrangThaiLucDat
  vung_mua: number
  phuong_phap_sl_tp: PhuongPhapSlTp | null
  cat_lo: number | null
  chot_loi: number | null
  khau_vi: KhauViLoai | null
  muc_tu_tin: MucTuTin | null
  cach_khoi_luong: CachKhoiLuongWire | null
  khoi_luong: number | null
  pct_von: number | null
  doc_5_lop: Lop5Partial | null
  ai_5_lop: Lop5Partial | null
  so_lop_dong_thuan: number | null
  so_lop_khac_ai: number | null
}

/**
 * One lớp's REAL win rate when the user self-rated it Ủng hộ (spec §7 khối ⑨).
 * §C12c: `n_orders`/`n_wins` are the raw counts behind `win_rate`, and
 * `giai_thich` spells the whole thing out in plain Vietnamese.
 */
export interface LopWinRate {
  lop: Lop
  ten: string
  n_orders: number
  n_wins: number
  win_rate: number | null
  nhan: NhanVuKhi | null
  giai_thich: string
}

/** Response for `GET /cap4/vu-khi-diem-mu` — per-lớp rows sorted by win rate. */
export interface VuKhiDiemMuCap4 {
  lop: LopWinRate[]
  vu_khi_lop: Lop | null
  diem_mu_lop: Lop | null
  so_lenh_toi_thieu: number
  nguong_vu_khi: number
  nguong_diem_mu: number
  giai_thich: string
}

export type DongThuanBandCap4 = "cao" | "vua" | "thap"

export interface PhanTichKhoi10RowCap4 {
  band: DongThuanBandCap4
  label: string
  count: number
  wins: number
  win_rate: number | null
  insufficient: boolean
}

export interface PhanTichKhoi10Cap4 {
  rows: PhanTichKhoi10RowCap4[]
  total_trades: number
  excluded_no_ai: number
  hieu_qua: boolean | null
  phat_hien: string | null
  insufficient_note: string | null
  giai_thich: string
}

export interface PhanTichKhoi11Cap4 {
  so_lan_khac_ai: number
  so_lan_ban_dung: number
  so_lan_ai_dung: number
  phat_hien: string | null
  insufficient_note: string | null
  giai_thich: string
}

/** Authoritative cross-device response for portfolio-analysis blocks ⑩/⑪. */
export interface PhanTichCap4 {
  khoi_10: PhanTichKhoi10Cap4
  khoi_11: PhanTichKhoi11Cap4
}
