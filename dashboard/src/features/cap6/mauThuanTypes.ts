import type { Lop } from "@/features/cap4/types"

/**
 * Cấp 6 «Bậc thầy» — kiểu dữ liệu của **bảng mâu thuẫn** (spec `demo-trading/
 * LEVEL 6/IQX-Cap6-Spec.md` §5-§11).
 *
 * ★ Đây là bộ hợp đồng wire MỚI của Cấp 6. Bộ «Đối chiếu» cũ (kiểu cổ phiếu +
 * trọng số gợi ý) nằm trong `types.ts` và CHƯA bị gỡ vì Cấp 7/8 vẫn đọc nó —
 * xem ghi chú ở đầu `types.ts`.
 *
 * Mọi số/nhãn ở đây do SERVER quyết. FE không có bảng phân loại lớp phủ quyết
 * riêng, không tự suy "bậc rất xấu", và KHÔNG hard-code mục tiêu nhiệm vụ:
 * `muc_tieu_nhat_quan`/`muc_tieu_veto` đi trên wire chính vì thế.
 */

/**
 * 4 mức nhận định mâu thuẫn user tự chọn (spec §6).
 *
 * ★ Thuần NHẬN ĐỊNH: không khoá nút, không chỉnh khối lượng hộ user (spec §4.2).
 * Giá trị của nó là data để Kết sổ + Phân tích danh mục đối chiếu về sau.
 */
export type ConflictLevel = "nhe" | "ngai" | "nghiem" | "chua_ro"

/** Một lớp ở phe "Ủng hộ mua" (spec §5.2). */
export interface LopUngHoCap6 {
  lop: Lop
  /** Nhãn hiển thị của server, VD "Mạnh" / "Ủng hộ" — in NGUYÊN VĂN (§C12c). */
  nhan: string
  /**
   * Bậc trên thang 5 bậc của AI Insight.
   *
   * ★ FE KHÔNG diễn giải trường này (không so sánh, không tô màu theo nó): phía
   * ủng hộ/ngược và cờ phủ quyết đều do server chốt. Nó chỉ được gắn nguyên vào
   * `data-bac` để debug/QA đối chiếu được với bản đọc AI — vì thế kiểu để rộng.
   */
  bac: string | number | null
}

/** Một lớp ở phe "Ngược chiều" — thêm cờ phủ quyết (spec §5.2/§5.3). */
export interface LopNguocCap6 extends LopUngHoCap6 {
  /**
   * Lớp này có thuộc nhóm PHỦ QUYẾT không (📰 Tin tức · 👤 Nội bộ theo khung
   * tham khảo của IQX). ★ SERVER quyết — khung phân loại là quan điểm đầu tư
   * (spec §12.1 còn để mở), nên FE không giữ bản sao thứ hai của nó.
   */
  la_phu_quyet: boolean
}

/** Một lớp trung tính — không thuộc phe nào (spec §5.2 dòng tóm tắt). */
export interface LopTrungTinhCap6 {
  lop: Lop
  nhan: string
}

/**
 * `GET /cap6/mau-thuan/{symbol}` — bức tranh 5 lớp của một mã, đã chia phe.
 *
 * ★★ `chua_du_du_lieu === true` KHÔNG phải "không mâu thuẫn": nó là "chưa đọc đủ
 * 5 lớp cho mã này" (spec §11 "Nguồn dữ liệu mâu thuẫn" — AI Insight KHÔNG chạy
 * cho mã user chưa từng xem). Hai trạng thái đó có hai câu khác nhau; gộp lại là
 * nói với user rằng một mã chưa phân tích là mã sạch mâu thuẫn.
 */
export interface MauThuanCap6 {
  /** Server chốt có mâu thuẫn hay không. FE còn kiểm thêm hai phe có thật. */
  co_mau_thuan: boolean
  ung_ho: LopUngHoCap6[]
  nguoc: LopNguocCap6[]
  trung_tinh: LopTrungTinhCap6[]
  /** ≥1 lớp phủ quyết đang ở bậc RẤT xấu (spec §5.3). */
  phu_quyet_kich_hoat: boolean
  /** Những lớp phủ quyết đang xấu — nguồn của `cap6_conflict_shown`. */
  lop_phu_quyet_xau: Lop[]
  /** Dòng cảnh báo của server — in NGUYÊN VĂN (§C12c). `null` → không có dòng. */
  canh_bao: string | null
  /** `true` = chưa đọc đủ 5 lớp cho mã này (KHÁC "không có mâu thuẫn"). */
  chua_du_du_lieu: boolean
  /** Câu server tự giải thích vì sao chưa đủ — in NGUYÊN VĂN. */
  ly_do_chua_du: string | null
}

/** `POST /cap6/kehoach` — ghi mức nhận định lên hàng kế hoạch của lệnh mua. */
export interface KehoachMauThuanInput {
  order_id: string
  conflict_level: ConflictLevel
}

/** `POST /cap6/skip` — ghi quyết định "Không mua lần này" (spec §7). */
export interface SkipCap6Input {
  symbol: string
  conflict_level: ConflictLevel
}

/** Một hàng của khối ⑭ — mức nhận định × khối lượng trung bình (spec §9). */
export interface Khoi14RowCap6 {
  muc: ConflictLevel
  so_lenh: number
  /** Khối lượng TB tính theo % vốn. `null` = nhóm chưa có lệnh nào. */
  kl_tb_pct_von: number | null
  /**
   * Hành động có tương xứng nhận định không. ★ `null` = CHƯA XÉT ĐƯỢC (chưa đủ
   * lệnh để so), KHÔNG phải "lệch" — hai chuyện khác nhau, hai câu khác nhau.
   */
  khop: boolean | null
}

/** Khối ⑭ «Nhận định có khớp hành động không» — server tính, FE trình bày. */
export interface Khoi14Cap6 {
  rows: Khoi14RowCap6[]
  /** Đủ mẫu để nói gì chưa. `false` → khối nói thẳng là chưa đủ. */
  du_mau: boolean
  /** Nhận xét của server — in NGUYÊN VĂN (§C12c). */
  nhan_xet: string
}

/** Một hàng của khối ⑮ — mức nhận định × tỷ lệ thắng (spec §9). */
export interface Khoi15RowCap6 {
  muc: ConflictLevel
  so_lenh: number
  /** `null` = nhóm chưa có lệnh đã đóng nào — KHÔNG phải thắng 0%. */
  ty_le_thang_pct: number | null
  du_mau: boolean
}

/** Khối ⑮ «Kết quả theo mức nhận định» + số lần đứng ngoài (spec §9). */
export interface Khoi15Cap6 {
  rows: Khoi15RowCap6[]
  /** "Nghiêm trọng → không mua: N lần" — hành động có kỷ luật, không phải điểm trừ. */
  so_lan_nghiem_khong_mua: number
  nhan_xet: string
}

/** `GET /cap6/phan-tich` — hai khối mới của Phân tích danh mục Cấp 6. */
export interface PhanTichCap6 {
  khoi_14: Khoi14Cap6
  khoi_15: Khoi15Cap6
}
