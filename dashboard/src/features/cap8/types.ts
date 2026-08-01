/**
 * Cấp 8 «Quản trị rủi ro danh mục» — shared types.
 *
 * Wire shapes mirror the backend `Cap8*` schemas 1:1
 * (`backend/app/schemas/cap8.py`); the two enum unions are
 * `backend/app/models/cap8.py`'s `HanhViCanhBao` / `LoaiCanhBao`.
 *
 * Cấp 8 keeps Cấp 7's panel 100% intact and inserts ONE pre-confirm step before
 * MUA. It **NEVER gates MUA** (spec §9/§C8: cảnh báo MỀM) — nothing in this
 * module may ever end up in the panel's `disabled` chain.
 *
 * ★ EVERY "chưa tính được" state on the wire is an explicit `null` + a
 * `*_du_lieu: boolean`, never a `0`. Cấp 8's whole subject is that an UNKNOWN
 * risk is not a ZERO risk, so the FE must render those nulls as "chưa tính
 * được" and never as a comfortable-looking zero.
 */

/** What the user did at the Kiểm tra danh mục step (spec §4). */
export type HanhViCanhBao = "van_mua" | "giam_kl" | "chon_ma_khac" | "khong_canh_bao"

/** The three things the check can warn about (spec §4). */
export type LoaiCanhBao = "don_nganh" | "tuong_quan" | "tong_rui_ro"

export interface Cap8Progress {
  id: string
  user_id: string
  entered_at: string
  task_1_done_at: string | null
  task_2_done_at: string | null
  task_3_done_at: string | null
  /** ③ đk 1 — số lệnh MUA đã qua bước Kiểm tra danh mục. */
  so_lenh_kiem_tra: number
  /** ★ LIFETIME. Điều kiện ② dùng `bat_chap_gan_day` (cửa sổ trượt) bên dưới. */
  so_lan_mua_bat_chap_canh_bao: number
  /**
   * ★ `null` = CHƯA TÍNH ĐƯỢC, không phải 0. `/cap8/progress` cố ý không định
   * giá lại danh mục, nên hai trường này là ảnh chụp của lần `/kiem-tra` hoặc
   * `/thach-thuc` gần nhất — và là `null` cho tới khi có lần đầu tiên. Hiện `0`
   * ở đây là nói với người dùng rằng danh mục hoàn toàn an toàn trong khi thật
   * ra chưa có gì được tính.
   */
  don_nganh_max_pct: number | null
  tong_rui_ro_pct: number | null
  graduated_at: string | null
  time_to_graduate_hours: number | null

  // ── derived server-side (never stored) ──
  so_lan_co_canh_bao: number
  /** ★ Cửa sổ TRƯỢT của điều kiện ② — khác `so_lan_mua_bat_chap_canh_bao`. */
  bat_chap_gan_day: number
  cua_so_gan_day: number
  so_lenh_da_ket_so: number
}

/**
 * Every Cấp 8 threshold, published by the SERVER.
 *
 * ★★ The FE renders THESE values and never invents its own cut-offs. A
 * hardcoded 40 or 0.7 here would silently drift the day the backend retunes,
 * and the user would see a warning that contradicts how graduation is judged.
 */
export interface QuyTacCap8 {
  /** Ngành chiếm hơn ngần này % NAV sau lệnh → cảnh báo dồn ngành. */
  nguong_don_nganh_pct: number
  /** Hệ số tương quan trên mức này với một vị thế ĐÁNG KỂ → cảnh báo. */
  nguong_tuong_quan: number
  /** Tỷ trọng tối thiểu để một vị thế được coi là "đáng kể". */
  tuong_quan_min_ty_trong_pct: number
  /** Số phiên tối thiểu trước khi một hệ số tương quan được báo ra. */
  tuong_quan_min_phien: number
  so_phien_lich_su: number
  /** khẩu vị → trần %. ★ Trần này vốn đặt cho MỘT lệnh (Cấp 3). */
  khau_vi_tran_pct: Record<string, number>
  cua_so_bat_chap: number
  bat_chap_toi_da: number
  so_lenh_kiem_tra_min: number
  /** Spec §9 — Cấp 8 KHÔNG dựng lại báo cáo Người quản lý danh mục. */
  cross_ref_pm: string
}

/**
 * The highest-correlation ĐÁNG KỂ partner of the candidate.
 *
 * ★ Absent (`null`) means "chưa tính được / chưa đủ dữ liệu" — see
 * `KiemTraCap8.tuong_quan_du_lieu`. It NEVER means "hệ số bằng 0".
 */
export interface TuongQuanCap8 {
  symbol: string
  he_so: number
}

/** One warning that ACTUALLY fired, with the copy the FE shows verbatim. */
export interface CanhBaoCap8 {
  ma: LoaiCanhBao
  ten: string
  text: string
}

/**
 * §C12c — every measure ships with its own plain-Vietnamese explanation stating
 * the number AND where it came from. The FE renders these VERBATIM and invents
 * no wording of its own.
 */
export interface GiaiThichKiemTraCap8 {
  don_nganh: string
  tuong_quan: string
  tong_rui_ro: string
  /** ★ Spells out that the khẩu vị ceiling means two different things. */
  tran_khau_vi: string
}

/** `GET /cap8/kiem-tra` — the whole pre-trade check in ONE response (spec §4). */
export interface KiemTraCap8 {
  symbol: string
  khoi_luong: number
  gia: number
  cat_lo: number | null
  gia_tri_lenh_vnd: number
  nav_vnd: number

  so_vi_the: number
  /** ★ Vị thế bị LOẠI khỏi tổng vì rủi ro của chúng CHƯA BIẾT (không phải 0). */
  so_vi_the_thieu_cat_lo: number
  so_vi_the_thieu_gia: number

  /** `null` = chưa xác định được ngành ICB của mã (KHÔNG đoán). */
  nganh: string | null
  don_nganh_pct_truoc: number | null
  don_nganh_pct_sau: number | null
  don_nganh_canh_bao: boolean

  tuong_quan: TuongQuanCap8 | null
  tuong_quan_canh_bao: boolean
  /** `false` = chưa tính được — KHÔNG phải "hai mã không đi cùng nhịp". */
  tuong_quan_du_lieu: boolean

  tong_rui_ro_pct_truoc: number | null
  tong_rui_ro_pct_sau: number | null
  tong_rui_ro_canh_bao: boolean

  khau_vi: string | null
  khau_vi_ten: string | null
  tran_khau_vi_pct: number | null

  /** ★ Chỉ chứa cảnh báo THẬT SỰ bật. Rỗng = lệnh sạch. */
  canh_bao: CanhBaoCap8[]
  giai_thich: GiaiThichKiemTraCap8
  cross_ref_pm: string
  quy_tac: QuyTacCap8
}

/** The four inputs `GET /cap8/kiem-tra` needs (`catLo` optional per Cấp 2). */
export interface KiemTraInputCap8 {
  symbol: string
  khoiLuong: number
  /** Giá dự kiến khớp, đơn vị ĐỒNG. */
  gia: number
  /**
   * Cắt lỗ của CHÍNH lệnh này (Cấp 2). `null` ⇒ phần đóng góp của lệnh vào tổng
   * vốn ở rủi ro là CHƯA BIẾT — server trả `tong_rui_ro_pct_sau = null` kèm lý
   * do, chứ không lặng lẽ coi là 0.
   */
  catLo: number | null
}

/**
 * `POST /cap8/kehoach` — the Kiểm tra danh mục block appended to the
 * `order_kehoach` row Cấp 1 already created for this BUY.
 *
 * ★ Only `hanh_vi_canh_bao` matters: the server DISCARDS any measure the client
 * sends and recomputes all four from the real portfolio (otherwise a client
 * could post an empty warning list and keep its "mua bất chấp" count clean).
 * `hanh_vi_canh_bao` must AGREE with what actually fired — see
 * `hanhViCanhBaoToSend`.
 */
export interface KehoachInputCap8 {
  order_id: string
  hanh_vi_canh_bao: HanhViCanhBao
}

/** Cấp 8's view of `order_kehoach` — the Kiểm tra danh mục block. */
export interface OrderKehoachCap8 {
  id: string
  order_id: string
  don_nganh_pct: number | null
  /** ★ `null` = không tính được / không có cặp nào vượt ngưỡng. NEVER "0". */
  tuong_quan_cao_voi: TuongQuanCap8 | null
  tong_rui_ro_pct: number | null
  /** `[]` = đã kiểm tra và KHÔNG có cảnh báo; `null` = lệnh chưa qua bước này. */
  danh_muc_canh_bao: LoaiCanhBao[] | null
  danh_muc_canh_bao_ten: string[] | null
  canh_bao_text: string
  hanh_vi_canh_bao: HanhViCanhBao | null
  hanh_vi_canh_bao_ten: string | null
  /** §C12c — one sentence, shown verbatim. */
  giai_thich: string
}

/** One of the 3 sub-conditions of nhiệm vụ ③ (§C12c: value + explanation). */
export interface ThachThucDieuKienCap8 {
  ten: string
  gia_tri_hien_tai: number
  muc_tieu: number
  dat: boolean
  /** `false` = chưa đủ dữ liệu để xét — không tính ngược lại cho người dùng. */
  du_du_lieu: boolean
  giai_thich: string
}

/** One bucket of khối ⑱'s PHÂN BỔ NGÀNH line (tiền mặt là một ô riêng). */
export interface PhanBoNganhCap8 {
  nganh: string
  pct: number
}

export interface DonNganhMaxCap8 {
  nganh: string
  pct: number
}

/** A high-correlation pair among the ĐÁNG KỂ positions (khối ⑱). */
export interface CapTuongQuanCap8 {
  a: string
  b: string
  he_so: number
}

/** The closing-state block khối ⑱ renders (`GET /cap8/thach-thuc`). */
export interface DanhMucCap8 {
  nav_vnd: number
  so_vi_the: number
  so_vi_the_thieu_cat_lo: number
  so_vi_the_thieu_gia: number
  phan_bo_nganh: PhanBoNganhCap8[]
  don_nganh_max: DonNganhMaxCap8 | null
  tong_rui_ro_pct: number | null
  khau_vi: string | null
  khau_vi_ten: string | null
  tran_khau_vi_pct: number | null
  cap_tuong_quan_cao: CapTuongQuanCap8[]
  /** ★ `false` = chưa đủ dữ liệu, KHÔNG "không có cặp nào tương quan cao". */
  tuong_quan_du_lieu: boolean
  /** ★ "{N} vị thế chưa có cắt lỗ" — hiện ở MỌI nơi có tổng rủi ro. */
  caveat: string
  cross_ref_pm: string
}

/** `GET /cap8/thach-thuc` — 3 điều kiện của nhiệm vụ ③, tính lại server-side. */
export interface ThachThucCap8 {
  dat_ca_3: boolean
  so_lenh_kiem_tra: ThachThucDieuKienCap8
  mua_bat_chap: ThachThucDieuKienCap8
  danh_muc_an_toan: ThachThucDieuKienCap8
  so_lenh_da_ket_so: number
  so_lan_co_canh_bao: number
  so_lan_mua_bat_chap_canh_bao: number
  cua_so_gan_day: number
  /** `null` = chưa định giá được danh mục — một "chưa tính được" tường minh. */
  danh_muc: DanhMucCap8 | null
}

/** Backend `HANH_VI_CANH_BAO_LABELS`, mirrored so both sides use one wording. */
export const HANH_VI_CANH_BAO_LABEL: Record<HanhViCanhBao, string> = {
  van_mua: "Vẫn mua",
  giam_kl: "Giảm khối lượng",
  chon_ma_khac: "Chọn mã khác",
  khong_canh_bao: "Không có cảnh báo",
}

/** Backend `LOAI_CANH_BAO_LABELS`. */
export const LOAI_CANH_BAO_LABEL: Record<LoaiCanhBao, string> = {
  don_nganh: "Dồn ngành",
  tuong_quan: "Tương quan cao",
  tong_rui_ro: "Tổng vốn ở rủi ro vượt trần khẩu vị",
}

/**
 * spec §4's action row — `[ Vẫn mua ] [ Giảm khối lượng ] [ Chọn mã khác ]`, in
 * that order.
 *
 * ★ "Vẫn mua" leads deliberately. It is a first-class, unpenalised choice
 * (§C8: hệ không quyết thay user) and must never be styled as the wrong answer.
 */
export const HANH_VI_OPTIONS: readonly {
  value: Exclude<HanhViCanhBao, "khong_canh_bao">
  label: string
}[] = [
  { value: "van_mua", label: "Vẫn mua" },
  { value: "giam_kl", label: "Giảm khối lượng" },
  { value: "chon_ma_khac", label: "Chọn mã khác" },
] as const

/** Lô giao dịch tối thiểu của sàn — Cấp 3's rule, reused here unchanged. */
export const LO_CO_PHIEU = 100

/**
 * "Giảm khối lượng" — halve the order and round DOWN to a whole lô 100, never
 * below one lô.
 *
 * Rounding down (not to nearest) is deliberate: the button's promise is *less*
 * exposure, and 250 → 200 would be a smaller cut than the user asked for while
 * 250 → 100 is never more than they asked for. Never returns 0: a "reduced"
 * order that can no longer be placed would trap the user at exactly the moment
 * they tried to do the safer thing.
 */
export function giamKhoiLuong(khoiLuong: number): number {
  if (!Number.isFinite(khoiLuong) || khoiLuong <= 0) return LO_CO_PHIEU
  const nua = Math.floor(khoiLuong / 2 / LO_CO_PHIEU) * LO_CO_PHIEU
  return Math.max(LO_CO_PHIEU, nua)
}

/**
 * What `POST /cap8/kehoach` must carry for this order.
 *
 * ★★ THE 400-AVOIDANCE RULE. The server cross-checks this value against the
 * warnings it re-derives itself and rejects the contradiction rather than
 * normalising it (`service.record_kehoach`):
 *   · `khong_canh_bao` while warnings ARE present → 400;
 *   · `van_mua`/`giam_kl`/`chon_ma_khac` while NONE are → 400.
 *
 * So the answer is decided by `coCanhBao` (the check the user actually saw),
 * not by whatever button is still selected in component state:
 *   · nothing fired ⇒ `khong_canh_bao`, whatever `chon` says;
 *   · something fired and the user pressed nothing ⇒ `van_mua` — they saw the
 *     warning and bought anyway, which is exactly what `van_mua` records. It is
 *     a legitimate, unpenalised choice (§C8), not a violation.
 */
export function hanhViCanhBaoToSend(
  coCanhBao: boolean,
  chon: HanhViCanhBao | null,
): HanhViCanhBao {
  if (!coCanhBao) return "khong_canh_bao"
  if (chon == null || chon === "khong_canh_bao") return "van_mua"
  return chon
}

/** Số nhiệm vụ Cấp 8 đã xong (mirrors `cap7/types.ts#countCap7TasksDone`). */
export function countCap8TasksDone(progress: Cap8Progress | null | undefined): number {
  if (!progress) return 0
  return [progress.task_1_done_at, progress.task_2_done_at, progress.task_3_done_at].filter(
    (t) => t != null,
  ).length
}
