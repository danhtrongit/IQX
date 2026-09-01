import type { Lop, Lop5Partial } from "@/features/cap4/types"

/**
 * Cấp 6 «Đối chiếu» — shared types.
 *
 * Wire shapes mirror the backend `Cap6*` schemas 1:1
 * (`backend/app/schemas/cap6.py`), whose `KieuLiteral` comes from
 * `backend/app/models/cap6.py#KieuCoPhieu` and whose `LopLiteral` is Cấp 4's
 * `LOP_KEYS`. Cấp 6 keeps Cấp 5's panel 100% intact and INSERTS one step — the
 * bước "Đối chiếu" that only appears when the user's own 5 lớp CONFLICT.
 */

/**
 * spec §5 — the 6 kiểu cổ phiếu whose trọng số decides which lớp is worth
 * prioritising when the lớp disagree. The server derives this from the symbol's
 * ngành and its value WINS on write; a client value is only ever used when the
 * server cannot classify (see `GoiYCap6.kieu === null`).
 */
export type KieuCoPhieu =
  | "ngan_hang"
  | "tang_truong"
  | "chu_ky"
  | "phong_thu"
  | "bat_dong_san"
  | "dau_co_nho"

/** Re-exported so Cấp 6 consumers never re-declare Cấp 4's lớp vocabulary. */
export type { Lop, Lop5Partial }

export interface Cap6Progress {
  entered_at: string
  /**
   * ★★ CẤP 6 «BẬC THẦY» — nhiệm vụ THUẦN HÀNH VI (spec đợt 7 §2/§11).
   *
   * Số lần gặp một lệnh CÓ mâu thuẫn mà nhận định user đọc KHỚP hành động
   * (nghiêm trọng → mua nhỏ/không mua · nhẹ → vào bình thường). Server đếm.
   */
  so_lan_xu_ly_nhat_quan: number
  /** Trong đó, số lần lệnh còn có lớp phủ quyết (Tin tức/Nội bộ) ở bậc rất xấu. */
  so_lan_xu_ly_veto_nhat_quan: number
  /**
   * Mục tiêu duy nhất do server công bố cho hành trình Cấp 6.
   *
   * Giá trị hiện hành cố định là 3, nhưng client vẫn hiển thị đúng hợp đồng
   * response thay vì tự nhận một thành tích từ dữ liệu cục bộ.
   */
  muc_tieu_nhat_quan: number
  /**
   * Σ(lãi/lỗ VND mọi lệnh đã đóng sau khi vào Cấp 6) ÷ Σ(vốn các lệnh đó).
   *
   * ★★ CHỈ để HIỂN THỊ ở Kết sổ/Phân tích danh mục (spec §11) — **KHÔNG phải cổng
   * tốt nghiệp** và KHÔNG xuất hiện ở màn tốt nghiệp: spec §2 dành nguyên một
   * đoạn giải thích vì sao lãi bị bỏ hoàn toàn khỏi cổng. `null` = chưa có lệnh
   * đã đóng nào ⇒ có câu riêng, TUYỆT ĐỐI không vẽ thành 0%.
   */
  tong_lai_lenh_cap6_pct: number | null
  /** Cờ tour «Xử lý mâu thuẫn» (spec §10) — công cụ học, KHÔNG phải cổng lên cấp. */
  da_xem_tour_mauthuan: boolean
  graduated_at: string | null

  // ─────────────────────────────────────────────────────────────────────────
  // ★ DI SẢN «Đối chiếu» (bản Cấp 6 trước đợt 7). Wire mới KHÔNG gửi các trường
  //   này nữa, nhưng Cấp 7/8 còn truyền `Cap6Progress` xuyên qua
  //   `computeCap6PortfolioAnalysis`, nên chúng ở lại dưới dạng OPTIONAL cho tới
  //   khi hai cấp đó được dựng lại trên Cấp 6 mới. Mọi chỗ đọc PHẢI chịu được
  //   `undefined` (không `!`, không `?? 0` cho một tỷ lệ).
  // ─────────────────────────────────────────────────────────────────────────
  /** @deprecated di sản «Đối chiếu» */
  id?: string
  /** @deprecated di sản «Đối chiếu» */
  user_id?: string
  /** @deprecated di sản «Đối chiếu» — ③ đk 1. */
  so_lenh_doi_chieu?: number
  /** @deprecated di sản «Đối chiếu» — ③ đk 2. */
  so_kieu_da_gap?: number
  /**
   * @deprecated di sản «Đối chiếu»
   *
   * ③ đk 3 — % thắng của nhóm lệnh KHỚP trọng số gợi ý.
   *
   * ★★ **`null` ≠ `0`.** `null` = nhóm này CHƯA CÓ lệnh đã đóng nào, nên chưa có
   * tỷ lệ để nói; `0.0` là một KẾT QUẢ THẬT (có lệnh đã đóng, không lệnh nào
   * thắng). Backend đổi hai trường này thành nullable ở commit `4b01918` chính vì
   * `0.0` đã trở thành một câu trả lời hợp lệ. Mọi tầng render PHẢI phân biệt hai
   * trạng thái đó — **không `?? 0` ở bất kỳ đâu**: gộp lại là nói với người dùng
   * rằng họ thắng 0% ở một nhóm họ chưa từng có lệnh nào.
   */
  ty_le_thang_khop?: number | null
  /**
   * @deprecated di sản «Đối chiếu»
   *
   * % thắng của nhóm lệnh LỆCH trọng số gợi ý. ★ Con số này KHÔNG phải một lời
   * phán về người dùng (spec §5/§10): lệch gợi ý là một sự thật trung tính.
   *
   * ★★ Nullable với đúng nghĩa như `ty_le_thang_khop` ở trên.
   */
  ty_le_thang_lech?: number | null
  /** @deprecated di sản «Đối chiếu» */
  time_to_graduate_hours?: number | null
}

/**
 * `GET /cap6/goi-y?symbol=` — the kiểu cổ phiếu of a symbol + which lớp to
 * prioritise for it + **why**.
 *
 * ★ `kieu === null` means "chưa phân loại" (ngành missing or deliberately
 * unmapped — e.g. `icb_lv1 == "Tài chính"`, and the market-cap-based
 * `dau_co_nho`, which is not derivable from ngành at all). Then `lop_uu_tien` /
 * `lop_it_tin` come back empty and `giai_thich` says so honestly — the FE still
 * lets the user pick a lớp quyết định (spec §4/§10), and that is the ONLY case
 * where a client-picked `kieu_co_phieu` is used.
 *
 * `giai_thich` is rendered **VERBATIM** (§C12c: never a bare suggestion).
 */
export interface GoiYCap6 {
  symbol: string
  /** The ICB ngành the kiểu was derived FROM (provenance; null when unknown). */
  nganh: string | null
  kieu: KieuCoPhieu | null
  kieu_ten: string | null
  lop_uu_tien: Lop[]
  lop_uu_tien_ten: string[]
  lop_it_tin: Lop[]
  lop_it_tin_ten: string[]
  giai_thich: string
}

/**
 * `POST /cap6/kehoach` — the Đối chiếu block appended to the `order_kehoach`
 * row Cấp 1 already created for this BUY (Cấp 2/3/4 fill their own blocks on
 * the same row first).
 *
 * `ly_do_doi_chieu` is REQUIRED (the server 422s on a blank one — the FE mirrors
 * that rule in `isDoiChieuValid` so the user never sees a raw error).
 * `kieu_co_phieu` is only honoured when the server cannot classify the symbol.
 * `lop_mau_thuan` is a FALLBACK: the server prefers the row's persisted
 * `doc_5_lop`. `trong_so_goi_y` / `khop_goi_y` are NEVER sent — the server
 * derives both from its own kiểu table.
 */
export interface KehoachInputCap6 {
  order_id: string
  lop_quyet_dinh: Lop
  ly_do_doi_chieu: string
  kieu_co_phieu: KieuCoPhieu | null
  lop_mau_thuan: Lop5Partial | null
}

/** Cấp 6's view of `order_kehoach` — the Đối chiếu block + its labels. */
export interface OrderKehoachCap6 {
  id: string
  order_id: string
  kieu_co_phieu: KieuCoPhieu | null
  kieu_ten: string | null
  lop_mau_thuan: Record<string, unknown> | null
  trong_so_goi_y: Record<string, unknown> | null
  lop_quyet_dinh: Lop | null
  lop_quyet_dinh_ten: string | null
  /**
   * ★ `false` is a NEUTRAL FACT (spec §5/§10), never "sai". `null` = kiểu chưa
   * phân loại, so there was no suggestion to match in the first place.
   */
  khop_goi_y: boolean | null
  ly_do_doi_chieu: string | null
}

/**
 * `GET /cap6/kehoach/{order_id}` — the Đối chiếu block **RECORDED on one order**,
 * plus every label the Kết sổ renders. Mirrors `KehoachCap6DetailOut`.
 *
 * ★ WHY THIS EXISTS NEXT TO `GoiYCap6`: `/cap6/goi-y` re-derives the kiểu from
 * the symbol's ngành *now*, so for a symbol the server cannot classify it keeps
 * answering "chưa phân loại" — even for an order whose kiểu came from the client
 * and whose `khop_goi_y` the server DID record. This endpoint reads the stored
 * columns instead, so the Kết sổ can show khớp/lệch honestly.
 *
 * `co_du_lieu === false` marks an order with no Cấp 6 data at all (placed before
 * the level existed, or the 5 lớp never conflicted so the step never appeared).
 * That is a normal 200, **not** an error — every other field is then null/empty.
 *
 * ★ `khop_goi_y` keeps its three states: `true` khớp · `false` lệch (a NEUTRAL
 * fact, never "sai") · `null` kiểu chưa phân loại, so no suggestion existed to
 * match. `null` must NEVER be rendered as lệch.
 *
 * The endpoint **404s unless the user has a Cấp 6 progress row**, so callers must
 * gate it on `isCap6Active` and degrade silently on any error.
 */
export interface KehoachDetailCap6 extends Omit<OrderKehoachCap6, "id"> {
  /** `null` only when the order has no `order_kehoach` row at all. */
  id: string | null
  symbol: string
  /** ICB ngành recorded in `trong_so_goi_y` (provenance; null when unknown). */
  nganh: string | null
  /** Read out of the STORED `trong_so_goi_y`, never re-derived. */
  lop_uu_tien: Lop[]
  lop_uu_tien_ten: string[]
  lop_it_tin: Lop[]
  lop_it_tin_ten: string[]
  /** "Khớp gợi ý" / "Lệch gợi ý" / null. Neither label says đúng or sai. */
  khop_goi_y_ten: string | null
  /** `false` = lệnh này không có dữ liệu Cấp 6 (KHÔNG phải lỗi). */
  co_du_lieu: boolean
  /** §C12c — shown VERBATIM; never a bare khớp/lệch badge. */
  giai_thich: string
}

/** One of the 3 sub-conditions of nhiệm vụ ③ (§C12c: value + explanation). */
export interface ThachThucDieuKienCap6 {
  ten: string
  gia_tri_hien_tai: number
  muc_tieu: number
  dat: boolean
  /** `false` = chưa đủ dữ liệu để xét — không tính là chưa đạt của người dùng. */
  du_du_lieu: boolean
  giai_thich: string
}

/** One side of the khớp-vs-lệch comparison (spec §7 khối ⑮). */
export interface NhomDoiChieuCap6 {
  khop: boolean
  ten: string
  so_lenh: number
  so_thang: number
  ty_le_thang: number | null
  du_du_lieu: boolean
  so_lenh_toi_thieu: number
  giai_thich: string
}

/** `GET /cap6/thach-thuc` — 3 điều kiện của nhiệm vụ ③ + 2 nhóm so sánh. */
export interface ThachThucCap6 {
  dat_ca_3: boolean
  so_lenh_doi_chieu: ThachThucDieuKienCap6
  so_kieu_da_gap: ThachThucDieuKienCap6
  doi_chieu_giup_ich: ThachThucDieuKienCap6
  nhom_khop: NhomDoiChieuCap6
  nhom_lech: NhomDoiChieuCap6
}

/**
 * spec §5 — the 6 kiểu, in the spec's table order, with the spec's icons. The
 * `label` values are exactly the backend's `KIEU_CO_PHIEU[...]["ten"]`, so the
 * picker and the server can never show different names for the same kiểu.
 *
 * This list is used ONLY for the client-side fallback picker (`kieu === null`)
 * and for icons next to the server's own `kieu_ten` — the mapping ngành → kiểu
 * itself lives server-side (spec §10: "Kiểu cổ phiếu do user tự gán tay —
 * KHÔNG").
 */
export const KIEU_OPTIONS: readonly { value: KieuCoPhieu; icon: string; label: string }[] = [
  { value: "ngan_hang", icon: "🏦", label: "Ngân hàng" },
  { value: "tang_truong", icon: "🚀", label: "Tăng trưởng / công nghệ" },
  { value: "chu_ky", icon: "🏭", label: "Chu kỳ / công nghiệp" },
  { value: "phong_thu", icon: "🛡️", label: "Phòng thủ / tiêu dùng" },
  { value: "bat_dong_san", icon: "🏢", label: "Bất động sản" },
  { value: "dau_co_nho", icon: "🎲", label: "Đầu cơ / vốn hóa nhỏ" },
] as const

export const KIEU_ICON: Record<KieuCoPhieu, string> = {
  ngan_hang: "🏦",
  tang_truong: "🚀",
  chu_ky: "🏭",
  phong_thu: "🛡️",
  bat_dong_san: "🏢",
  dau_co_nho: "🎲",
}

/** Số nhiệm vụ Cấp 6 đã xong — cổng duy nhất là 3 lần xử lý nhất quán. */
export function countCap6TasksDone(progress: Cap6Progress | null | undefined): number {
  if (!progress) return 0
  return progress.so_lan_xu_ly_nhat_quan >= progress.muc_tieu_nhat_quan ? 1 : 0
}
