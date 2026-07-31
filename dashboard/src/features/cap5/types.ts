/**
 * Cấp 5 «Lão luyện» — shared types.
 *
 * Wire shapes mirror the backend `Cap5*` schemas 1:1
 * (`backend/app/schemas/cap5.py`). Cấp 5 adds NOTHING to the buy panel — it
 * adds a "đứng ngoài" decision log and a phân-loại-4-ô step inside Kết sổ.
 */

/** Verdict về CHẤT LƯỢNG QUYẾT ĐỊNH (quy trình), độc lập lãi/lỗ. */
export type Verdict = "dung" | "sai"

/** 4 ô = verdict × kết quả (spec §4). */
export type O4 = "dung_thang" | "dung_thua" | "sai_thang" | "sai_thua"

/** 5 lý do đứng ngoài (spec §5). */
export type LyDoDungNgoai =
  | "chua_du_co_so"
  | "dinh_gia_dat"
  | "cho_vung_mua_tot_hon"
  | "du_lieu_nguoc_chieu"
  | "du_vi_the_nhom"

/** Kết quả chấm một nước đứng ngoài sau 5 phiên (spec §5). */
export type KetQuaDungNgoai = "ne_dung" | "ne_hut" | "trung_tinh"

export interface Cap5Progress {
  id: string
  user_id: string
  entered_at: string
  task_1_done_at: string | null
  task_2_done_at: string | null
  task_3_done_at: string | null
  /** ① số lệnh đã phân loại 4 ô. */
  so_lenh_phan_loai: number
  /** ② số nước đứng ngoài ĐÃ tới hạn và đã chấm. */
  so_lan_dung_ngoai_da_cham: number
  /** ③ % lệnh có verdict "đúng" — đo QUY TRÌNH, không phải tỷ lệ thắng. */
  ty_le_quyet_dinh_dung: number
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

/**
 * Một tín hiệu đứng sau verdict hệ gợi ý. `dat === null` nghĩa là dữ liệu
 * nguồn của tín hiệu này CHƯA từng được ghi → báo "chưa rõ", KHÔNG âm thầm
 * tính là đạt (server loại tín hiệu chưa rõ khỏi verdict).
 */
export interface VerdictSignal {
  ma: string
  ten: string
  dat: boolean | null
  giai_thich: string
}

/**
 * `GET /cap5/verdict/{order_id}` — verdict hệ GỢI Ý + toàn bộ tín hiệu suy ra
 * nó (§C12c: FE phải hiện danh sách này nguyên văn, không hiện verdict trơ).
 * `pnl_pct`/`thang` chỉ để hiển thị — KHÔNG bao giờ ảnh hưởng `verdict`.
 */
export interface VerdictGoiY {
  order_id: string
  verdict: Verdict
  giai_thich: string
  signals: VerdictSignal[]
  pnl_pct: number
  thang: boolean
  o_4_du_kien: O4
}

/** `POST /cap5/ketso` — user chốt hoặc đảo verdict hệ. */
export interface KetsoInputCap5 {
  order_id: string
  verdict_user: Verdict
  /** BẮT BUỘC khi đảo khác verdict hệ (server trả 422 nếu thiếu). */
  ly_do_sua?: string | null
}

export interface OrderKetsoCap5 {
  id: string
  order_id: string
  pnl_pct: number
  verdict_he: Verdict | null
  verdict_user: Verdict | null
  verdict_provenance: Record<string, unknown> | null
  o_4: O4 | null
  ly_do_sua: string | null
}

/** `POST /cap5/dung-ngoai` — giá được chốt ở server, không nhận từ client. */
export interface DungNgoaiInput {
  symbol: string
  reason: LyDoDungNgoai
}

export interface DungNgoaiItem {
  id: string
  symbol: string
  decided_at: string
  reason: LyDoDungNgoai
  ly_do_ten: string
  gia_luc_dung_ngoai: number
  han_cham_date: string
  da_toi_han: boolean
  cham_at: string | null
  gia_sau_5_phien: number | null
  ket_qua: KetQuaDungNgoai | null
  ket_qua_ten: string | null
  pct_thay_doi: number | null
  giai_thich: string
}

export interface LyDoHayDung {
  ma: LyDoDungNgoai
  ten: string
  so_lan: number
}

/** `GET /cap5/dung-ngoai` — nhật ký + số liệu (khối ⑬). */
export interface DungNgoaiList {
  so_lan: number
  so_ne_dung: number
  so_ne_hut: number
  so_trung_tinh: number
  so_chua_toi_han: number
  so_lan_da_cham: number
  du_de_phan_tich: boolean
  so_lan_toi_thieu_phan_tich: number
  ly_do_hay_dung: LyDoHayDung | null
  so_phien_cham: number
  nguong_ne_dung_pct: number
  nguong_ne_hut_pct: number
  giai_thich: string
  items: DungNgoaiItem[]
}

/** `POST /cap5/dung-ngoai/cham`. */
export interface ChamDungNgoaiResult {
  so_moi_cham: number
  so_lan_da_cham: number
  so_chua_toi_han: number
  giai_thich: string
  items: DungNgoaiItem[]
}

export interface ThachThucDieuKienCap5 {
  ten: string
  gia_tri_hien_tai: number
  muc_tieu: number
  dat: boolean
  giai_thich: string
}

/** `GET /cap5/thach-thuc` — 3 điều kiện của nhiệm vụ ③. */
export interface ThachThucCap5 {
  dat_ca_3: boolean
  so_lenh_phan_loai: ThachThucDieuKienCap5
  so_lan_dung_ngoai_da_cham: ThachThucDieuKienCap5
  ty_le_quyet_dinh_dung: ThachThucDieuKienCap5
}

/** spec §5 — 5 lý do đứng ngoài, đúng thứ tự bảng trong spec. */
export const LY_DO_DUNG_NGOAI_OPTIONS: readonly { value: LyDoDungNgoai; label: string }[] = [
  { value: "chua_du_co_so", label: "Chưa đủ cơ sở (lớp chưa ủng hộ)" },
  { value: "dinh_gia_dat", label: "Định giá đang đắt" },
  { value: "cho_vung_mua_tot_hon", label: "Chờ vùng mua tốt hơn" },
  { value: "du_lieu_nguoc_chieu", label: "Dữ liệu ngược chiều — rủi ro cao" },
  { value: "du_vi_the_nhom", label: "Đã đủ vị thế nhóm này" },
] as const

/** Nhãn 4 ô (spec §4). */
export const O4_LABEL: Record<O4, string> = {
  dung_thang: "Đúng · Thắng",
  dung_thua: "Đúng · Thua",
  sai_thang: "Sai · Thắng",
  sai_thua: "Sai · Thua",
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  dung: "✅ QUYẾT ĐỊNH ĐÚNG",
  sai: "❌ QUYẾT ĐỊNH SAI",
}

/** Tổng số lệnh cần phân loại để xét nhiệm vụ ③ (spec §2③). */
export const TARGET_LENH_PHAN_LOAI = 20
/** Số nước đứng ngoài đã chấm cần có (spec §2③). */
export const TARGET_DUNG_NGOAI = 5
/** Ngưỡng tỷ lệ quyết định đúng (spec §2③). */
export const TARGET_TY_LE_QUYET_DINH_DUNG = 70

/** Số nhiệm vụ Cấp 5 đã xong (mirrors `cap4/types.ts#countCap4TasksDone`). */
export function countCap5TasksDone(progress: Cap5Progress | null | undefined): number {
  if (!progress) return 0
  return [progress.task_1_done_at, progress.task_2_done_at, progress.task_3_done_at].filter(
    (t) => t != null,
  ).length
}

/**
 * spec §4 — `Đóng kết sổ ✓` là CỔNG: chỉ mở khi verdict đã được chốt, và nếu
 * user đảo khác verdict hệ thì phải có lý do (mirror luật 422 của server để
 * user không bao giờ gặp lỗi thô).
 */
export function isPhanLoaiSettled(
  verdictHe: Verdict | null,
  verdictUser: Verdict | null,
  lyDoSua: string | null,
): boolean {
  if (verdictUser == null) return false
  if (verdictHe != null && verdictUser !== verdictHe) {
    return (lyDoSua ?? "").trim().length > 0
  }
  return true
}
