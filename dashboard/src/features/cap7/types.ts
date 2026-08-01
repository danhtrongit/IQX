/**
 * Cấp 7 «Đọc sổ lệnh» — shared types.
 *
 * Wire shapes mirror the backend `Cap7*` schemas 1:1
 * (`backend/app/schemas/cap7.py`); the three enum unions are
 * `backend/app/models/cap7.py`'s `LucDocUser` / `HanhViCo` / `BandLuc`.
 *
 * Cấp 7 keeps Cấp 6's panel 100% intact and adds ONE reading overlay on the
 * bid/ask book that has been visible since Cấp 2 — it never rebuilds the book
 * and it NEVER gates MUA (spec §9: soft, chỉ nhiệm vụ ① cần ghi ≥ 1 lần).
 */

/** User's own reading of the book at buy time — the system never fills it in. */
export type LucDocUser = "manh" | "can" | "yeu"

/**
 * What the user did after the cờ cảnh giác appeared.
 *
 * ★ `mua_duoi_theo` is **not a violation** (spec §5 "không phạt cứng") — it is
 * recorded so Kết sổ can remind gently and so the two groups can be compared.
 */
export type HanhViCo = "cho_xac_nhan" | "mua_duoi_theo"

/** The 3 gauge bands of the chỉ số Lực — DERIVED from the server's cut-offs. */
export type BandLuc = "cau_ap_dao" | "can_bang" | "cung_ap_dao"

export interface Cap7Progress {
  id: string
  user_id: string
  entered_at: string
  task_1_done_at: string | null
  task_2_done_at: string | null
  task_3_done_at: string | null
  /** ③ đk 1 — số lệnh MUA đã ghi bước đọc lực. */
  so_lenh_doc_luc: number
  /** ③ đk 2 — số lần gặp cờ và CHỜ XÁC NHẬN thay vì mua đuổi. */
  so_lan_khong_duoi_theo_co: number
  /** ③ đk 3 — % đọc lực đúng, tính trên các lệnh ĐÃ CHẤM mà thôi. */
  ty_le_doc_luc_dung: number
  graduated_at: string | null
  time_to_graduate_hours: number | null

  // ── derived server-side (never stored) ──
  /**
   * ★ From the SERVER's own `is_trading_session()`. The FE must NEVER compute
   * market-open from the browser clock — a user in another timezone would get
   * the wrong answer.
   */
  trong_phien: boolean
  so_lenh_da_cham: number
  /**
   * ★ Part of the contract, not decoration: `ty_le_doc_luc_dung` is computed
   * over SCORED readings only, so this count must be visible or the rate would
   * look like it was computed over everything.
   */
  so_lenh_chua_cham: number
  so_lan_gap_co: number
  so_lan_mua_duoi_theo: number
  so_phien_cham: number
}

/** One gauge band + the "vì sao" the FE shows VERBATIM (§C12c). */
export interface BandCap7 {
  ma: BandLuc
  ten: string
  /** The band's cut-off in the SERVER's own words, e.g. `Lực ≥ 1.50 : 1`. */
  dieu_kien_text: string
  giai_thich: string
}

/**
 * Every Cấp 7 constant the reading block needs, published by the SERVER.
 *
 * ★★ The FE renders THESE values and never invents its own cut-offs. That is
 * the only way the gauge the user sees, the copy that explains it and the
 * server-side chấm can be guaranteed to agree — a hardcoded 1.5 here would
 * silently drift the day the backend retunes its bands, and the user would see
 * a band that contradicts how their reading was actually scored.
 */
export interface QuyTacCap7 {
  /** Ratio ≥ this → Cầu áp đảo. */
  nguong_cau_ap_dao: number
  /** Ratio ≤ this → Cung áp đảo (the reciprocal of the above). */
  nguong_cung_ap_dao: number
  bands: BandCap7[]
  /** One level's volume > this × the mean of the remaining levels → cờ. */
  co_canh_giac_he_so: number
  /** Below this many levels the rule stays silent rather than crying wolf. */
  co_canh_giac_min_muc: number
  /** The cờ copy — heuristic and honest. NEVER a detection claim (spec §9). */
  co_canh_giac_copy: string
  /** Trading sessions after the buy that count as "diễn biến ngay sau". */
  so_phien_cham: number
  /** |%| inside which the price counts as unchanged (makes `can` falsifiable). */
  dead_band_pct: number
  /** How `doc_luc_dung` is decided, in one plain-Vietnamese sentence. */
  cham_giai_thich: string
}

/**
 * `GET /cap7/phien` — cheap and re-fetchable (the panel can stay open across
 * the 11:30 boundary, so `trong_phien` must refresh independently of progress).
 */
export interface PhienCap7 {
  trong_phien: boolean
  gio_giao_dich_text: string
  /** Server copy, shown VERBATIM — the ngoài-giờ note IS this sentence. */
  giai_thich: string
  quy_tac: QuyTacCap7
}

/**
 * `POST /cap7/kehoach` — the đọc-lực block appended to the `order_kehoach` row
 * Cấp 1 already created for this BUY (Cấp 2/3/4/6 fill their blocks first).
 *
 * `luc_chi_so` must be finite and > 0 — when the book is too thin to read, the
 * step is SKIPPED entirely rather than sending 0/Infinity. `hanh_vi_co` is
 * non-null **if and only if** `co_canh_giac_lenh_gia` is true (the server
 * rejects the inconsistent combination with 400 rather than normalising it).
 */
export interface KehoachInputCap7 {
  order_id: string
  luc_chi_so: number
  luc_doc_user: LucDocUser
  co_canh_giac_lenh_gia: boolean
  hanh_vi_co: HanhViCo | null
}

/** Cấp 7's view of `order_kehoach` — the đọc-lực block + its labels. */
export interface OrderKehoachCap7 {
  id: string
  order_id: string
  luc_chi_so: number | null
  /** `null` when the ratio is missing/unreadable — never a fabricated band. */
  luc_band: BandLuc | null
  luc_band_ten: string | null
  luc_doc_user: LucDocUser | null
  luc_doc_user_ten: string | null
  /** `null` = chưa tới hạn chấm (or price unavailable) — NEVER a verdict. */
  doc_luc_dung: boolean | null
  dien_bien_pct: number | null
  co_canh_giac_lenh_gia: boolean | null
  hanh_vi_co: HanhViCo | null
  hanh_vi_co_ten: string | null
  so_phien_cham: number
  /** §C12c — one sentence, shown verbatim. */
  giai_thich: string
}

/**
 * `GET /cap7/kehoach/{order_id}` — the đọc-lực block recorded on ONE order plus
 * the scoring context the Kết sổ needs. Mirrors `KehoachCap7DetailOut`.
 *
 * ★ Reading this endpoint RUNS the server's lazy chấm pass, so an order whose
 * `so_phien_cham` sessions have elapsed comes back **SCORED**. Without it the
 * Kết sổ could only ever say "chưa tới hạn chấm": `doc_luc_dung` is decided
 * 1-3 trading sessions after the buy, long after the FE's own in-session data
 * was captured.
 *
 * ★★ `doc_luc_dung` has THREE meanings and they must never be collapsed:
 * `true` đọc đúng · `false` đọc sai · `null` CHƯA CHẤM. `null` is NOT "sai" —
 * the deadline has not arrived, or the price for that session is unavailable.
 * `da_toi_han_cham` is the only way to tell those two `null` cases apart (it
 * needs trading-day arithmetic + the server's clock, which the FE does not have).
 *
 * `co_du_lieu === false` marks an order with no Cấp 7 data at all — a normal
 * 200, and never a shortcoming: reading the book is never required to buy.
 *
 * The endpoint **404s unless the user has a Cấp 7 progress row**, so callers must
 * gate it on `isCap7Active` and degrade silently on any error.
 */
export interface KehoachDetailCap7 extends Omit<OrderKehoachCap7, "id"> {
  /** `null` only when the order has no `order_kehoach` row at all. */
  id: string | null
  symbol: string
  /** `false` = lệnh này không có dữ liệu Cấp 7 (KHÔNG phải lỗi, không phải thiếu sót). */
  co_du_lieu: boolean
  /** |%| inside which the close counts as unchanged — the SERVER's threshold. */
  dead_band_pct: number
  /** The trading session this reading is (or will be) judged against (`YYYY-MM-DD`). */
  han_cham_ngay: string | null
  /**
   * ★ Has that session arrived? `doc_luc_dung === null` + `false` = chưa tới hạn;
   * `doc_luc_dung === null` + `true` = tới hạn nhưng chưa lấy được giá. Two
   * different honest sentences — never a verdict either way.
   */
  da_toi_han_cham: boolean
}

/** `POST /cap7/cham` — the lazy scoring pass, exposed explicitly (idempotent). */
export interface ChamCap7 {
  so_moi_cham: number
  so_lenh_doc_luc: number
  so_lenh_da_cham: number
  so_lenh_chua_cham: number
  ty_le_doc_luc_dung: number
  so_phien_cham: number
  giai_thich: string
}

/** One of the 3 sub-conditions of nhiệm vụ ③ (§C12c: value + explanation). */
export interface ThachThucDieuKienCap7 {
  ten: string
  gia_tri_hien_tai: number
  muc_tieu: number
  dat: boolean
  /** `false` = chưa đủ dữ liệu để xét — không tính ngược lại cho người dùng. */
  du_du_lieu: boolean
  giai_thich: string
}

/** `GET /cap7/thach-thuc` — 3 điều kiện của nhiệm vụ ③, tính lại server-side. */
export interface ThachThucCap7 {
  dat_ca_3: boolean
  so_lenh_doc_luc: ThachThucDieuKienCap7
  so_lan_khong_duoi_theo_co: ThachThucDieuKienCap7
  ty_le_doc_luc_dung: ThachThucDieuKienCap7
  so_lenh_da_cham: number
  so_lenh_chua_cham: number
  so_lan_gap_co: number
  so_lan_mua_duoi_theo: number
  so_phien_cham: number
}

/**
 * spec §4's picker — `[ Cầu mạnh ] [ Cân bằng ] [ Cầu yếu ]`, in that order.
 * The labels are exactly the backend's `LUC_DOC_LABELS`, so the picker and the
 * Kết sổ can never call the same reading two different names.
 */
export const LUC_DOC_OPTIONS: readonly { value: LucDocUser; label: string }[] = [
  { value: "manh", label: "Cầu mạnh" },
  { value: "can", label: "Cân bằng" },
  { value: "yeu", label: "Cầu yếu" },
] as const

/** Backend `HANH_VI_CO_LABELS`, mirrored so both sides read the same words. */
export const HANH_VI_CO_LABEL: Record<HanhViCo, string> = {
  cho_xac_nhan: "Chờ xác nhận (chờ khớp thật)",
  mua_duoi_theo: "Mua đuổi vào lệnh treo lớn",
}

/** Số nhiệm vụ Cấp 7 đã xong (mirrors `cap6/types.ts#countCap6TasksDone`). */
export function countCap7TasksDone(progress: Cap7Progress | null | undefined): number {
  if (!progress) return 0
  return [progress.task_1_done_at, progress.task_2_done_at, progress.task_3_done_at].filter(
    (t) => t != null,
  ).length
}
