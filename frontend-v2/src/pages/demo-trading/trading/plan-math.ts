/**
 * Pure math + vocabulary for the Demo Trading order panel (Cấp 0–6).
 *
 * Everything here is side-effect free and framework-free so the panel and the
 * Kết sổ stay thin render shells around it. Ported from the legacy dashboard's
 * per-level helpers (`features/cap{0..6}/*.ts`) with the arithmetic unchanged —
 * these are the rules the backend validates against, so they must not drift.
 *
 * Conventions carried over verbatim:
 * - money is raw VND (integers, no thousands multiplier),
 * - wire field names stay snake_case,
 * - "chưa biết" is `null`, never 0.
 */

/* ── vocabulary ──────────────────────────────────────────────────────────── */

export type LyDo = "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia"
export type TrangThaiLucDat = "ung_ho" | "trung_tinh" | "can_chu_y" | "nguoc_chieu"
export type CamXuc = "binh_tinh" | "so" | "hoi_tiec" | "khong_ro"
export type PhuongPhapSlTp = "ho_tro_khang_cu" | "bien_do_dao_dong"
export type KhauViLoai = "than_trong" | "can_bang" | "tan_cong"
export type MucTuTin = 1 | 2 | 3
export type CachKhoiLuong = "linh_hoat" | "ky_luat"
/** The backend's wire names for the two sizing ways (`khau_vi_tu_tin` = linh hoạt). */
export type CachKhoiLuongWire = "khau_vi_tu_tin" | "chia_deu"
export type Lop = LyDo
export type NhanDinhLop = "ok" | "neu" | "bad"
export type Lop5Partial = Partial<Record<Lop, NhanDinhLop>>
export type ConflictLevel = "nhe" | "ngai" | "nghiem" | "chua_ro"
export type AlertLevel = "thuong" | "greyed5s" | "typeToConfirm"

/* ── Cấp 0: lý do đời thường (slug + nhãn) ───────────────────────────────── */

export const CAP0_REASONS: readonly { slug: string; label: string }[] = [
  { slug: "cong_ty_toi_biet", label: "Công ty tôi biết" },
  { slug: "nguoi_quen_gioi_thieu", label: "Người quen giới thiệu" },
  { slug: "thay_tren_mang", label: "Thấy trên mạng" },
  { slug: "gia_dang_tang", label: "Giá đang tăng" },
  { slug: "thu_cho_biet", label: "Thử cho biết" },
]

/* ── Cấp 1: form kế hoạch ────────────────────────────────────────────────── */

export const LY_DO_OPTIONS: readonly { value: LyDo; label: string; source: string }[] = [
  { value: "ky_thuat", label: "Kỹ thuật", source: "AI Insight · L1 Xu hướng" },
  { value: "dong_tien", label: "Dòng tiền", source: "AI Insight · L3 Dòng tiền" },
  { value: "noi_bo", label: "Nội bộ", source: "AI Insight · L4 Nội bộ" },
  { value: "tin_tuc", label: "Tin tức", source: "AI Insight · L5 Tin tức" },
  { value: "dinh_gia", label: "Định giá", source: "BCTC · KHỐI 02 Giá đắt hay rẻ" },
]

export function lyDoLabel(value: LyDo | null | undefined): string {
  return LY_DO_OPTIONS.find((option) => option.value === value)?.label ?? "—"
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  ung_ho_manh: "Ủng hộ mạnh",
  ung_ho: "Ủng hộ",
  trung_tinh: "Trung tính",
  can_chu_y: "Cần chú ý",
  nguoc_chieu: "Ngược chiều",
}

export const TRANG_THAI_LABEL: Record<TrangThaiLucDat, string> = {
  ung_ho: "Ủng hộ",
  trung_tinh: "Trung tính",
  can_chu_y: "Cần chú ý",
  nguoc_chieu: "Ngược chiều",
}

export const CAM_XUC_OPTIONS: readonly { value: CamXuc; label: string }[] = [
  { value: "binh_tinh", label: "Bình tĩnh" },
  { value: "so", label: "Sợ" },
  { value: "hoi_tiec", label: "Hối tiếc" },
  { value: "khong_ro", label: "Không rõ" },
]

export function camXucLabel(value: CamXuc | null | undefined): string {
  return CAM_XUC_OPTIONS.find((option) => option.value === value)?.label ?? "chưa rõ"
}

/** spec §4 "cổng cứng": lý do + vùng mua > 0 (`undefined` = untouched field). */
export function isKehoachValid(lyDo: LyDo | null, vungMua: number | null | undefined): boolean {
  return lyDo != null && vungMua != null && vungMua > 0
}

/* ── AI Thanh tra: 5-bậc verdict ─────────────────────────────────────────── */

/**
 * AI Thanh tra's verdict — one tier richer than the wire's 4-state
 * `trangThai_luc_dat` ("ủng hộ mạnh" collapses into "ủng hộ" on the wire).
 */
export type Verdict = "ung_ho_manh" | "ung_ho" | "trung_tinh" | "can_chu_y" | "nguoc_chieu"

/** AI Insight's own 5-bậc `statusLevel` → verdict (1 = rất yếu … 5 = rất mạnh). */
export function verdictFromStatusLevel(level: 1 | 2 | 3 | 4 | 5): Verdict {
  switch (level) {
    case 5:
      return "ung_ho_manh"
    case 4:
      return "ung_ho"
    case 3:
      return "trung_tinh"
    case 2:
      return "can_chu_y"
    default:
      return "nguoc_chieu"
  }
}

/**
 * 💎 Định giá has no `statusLevel` (BCTC KHỐI 02 isn't an AI Insight layer), so
 * its verdict is price vs vùng giá trị: below the whole range → ủng hộ mạnh,
 * above it → ngược chiều, ±5% around the median → trung tính.
 */
export function verdictFromValuation(params: {
  currentPrice: number
  median: number
  rangeLow: number
  rangeHigh: number
}): Verdict {
  const { currentPrice, median, rangeLow, rangeHigh } = params
  if (currentPrice > rangeHigh) return "nguoc_chieu"
  if (currentPrice < rangeLow) return "ung_ho_manh"
  if (currentPrice < median * 0.95) return "ung_ho"
  if (currentPrice > median * 1.05) return "can_chu_y"
  return "trung_tinh"
}

export function verdictToTrangThai(verdict: Verdict): TrangThaiLucDat {
  return verdict === "ung_ho_manh" ? "ung_ho" : verdict
}

/* ── Cấp 4: đọc 5 lớp ───────────────────────────────────────────────────── */

export const LOP_KEYS: readonly Lop[] = [
  "ky_thuat",
  "dong_tien",
  "noi_bo",
  "tin_tuc",
  "dinh_gia",
]

/** The 5 lớp with their real data source — the đọc-5-lớp block's own rows. */
export const LOP_DEFS: readonly { lop: Lop; label: string; source: string; layer: "L1" | "L3" | "L4" | "L5" | null }[] = [
  { lop: "ky_thuat", label: "Kỹ thuật", source: "AI Insight · L1 Xu hướng", layer: "L1" },
  { lop: "dong_tien", label: "Dòng tiền", source: "AI Insight · L3 Dòng tiền", layer: "L3" },
  { lop: "noi_bo", label: "Nội bộ", source: "AI Insight · L4 Nội bộ", layer: "L4" },
  { lop: "tin_tuc", label: "Tin tức", source: "AI Insight · L5 Tin tức", layer: "L5" },
  { lop: "dinh_gia", label: "Định giá", source: "BCTC KHỐI 02 Giá đắt hay rẻ", layer: null },
]

export function lopLabel(lop: Lop): string {
  return LOP_DEFS.find((def) => def.lop === lop)?.label ?? lop
}

export const NHAN_DINH_OPTIONS: readonly { value: NhanDinhLop; label: string }[] = [
  { value: "ok", label: "Ủng hộ" },
  { value: "neu", label: "Trung tính" },
  { value: "bad", label: "Ngược chiều" },
]

export function nhanDinhLabel(value: NhanDinhLop | null | undefined): string {
  return NHAN_DINH_OPTIONS.find((option) => option.value === value)?.label ?? "—"
}

/** 5-bậc verdict → the 3 mức the five-layer comparison uses. */
export function nhanDinhFromVerdict(verdict: Verdict): NhanDinhLop {
  switch (verdict) {
    case "ung_ho_manh":
    case "ung_ho":
      return "ok"
    case "trung_tinh":
      return "neu"
    default:
      return "bad"
  }
}

export function countDongThuan(lop5: Lop5Partial | null | undefined): number {
  if (!lop5) return 0
  return LOP_KEYS.filter((lop) => lop5[lop] === "ok").length
}

/** Số lớp user đọc KHÁC AI — a neutral count, never a "wrong" score. */
export function countKhacAi(
  doc5Lop: Lop5Partial | null | undefined,
  ai5Lop: Lop5Partial | null | undefined,
): number {
  if (!doc5Lop || !ai5Lop) return 0
  return LOP_KEYS.filter(
    (lop) => doc5Lop[lop] != null && ai5Lop[lop] != null && doc5Lop[lop] !== ai5Lop[lop],
  ).length
}

export function isDoc5LopComplete(doc5Lop: Lop5Partial | null | undefined): boolean {
  if (!doc5Lop) return false
  return LOP_KEYS.every((lop) => doc5Lop[lop] === "ok" || doc5Lop[lop] === "neu" || doc5Lop[lop] === "bad")
}

const AI_SUPPORT_RANK: Record<NhanDinhLop, number> = { ok: 2, neu: 1, bad: 0 }

/**
 * Cấp 4 replaces Cấp 1's lý-do picker, but `order_kehoach.lyDo` is NOT NULL —
 * so a Cấp 4 BUY derives it from the five ratings instead of inventing one.
 * Rule: the Ủng hộ lớp AI supports most strongly; ties in canonical order.
 */
export function deriveLyDoForCap1(
  doc5Lop: Lop5Partial | null | undefined,
  ai5Lop?: Lop5Partial | null,
): Lop {
  const rated = LOP_KEYS.filter((lop) => doc5Lop?.[lop] != null)
  const ungHo = rated.filter((lop) => doc5Lop?.[lop] === "ok")
  if (ungHo.length > 0) {
    let best = ungHo[0]
    let bestRank = -1
    for (const lop of ungHo) {
      const aiMuc = ai5Lop?.[lop]
      const rank = aiMuc ? AI_SUPPORT_RANK[aiMuc] : -1
      if (rank > bestRank) {
        best = lop
        bestRank = rank
      }
    }
    return best
  }
  return rated[0] ?? "ky_thuat"
}

/* ── Cấp 2: cắt lỗ / chốt lời ───────────────────────────────────────────── */

export interface OhlcvBar {
  high?: number | null
  low?: number | null
  close?: number | null
}

export interface SlTpResult {
  catLo: number
  chotLoi: number
  catLoPct: number
  chotLoiPct: number
}

/** Round to the nearest VND tick (the board's price step). */
export function roundToStep(value: number, step = 100): number {
  return Math.round(value / step) * step
}

function pctAway(value: number, giaVao: number): number {
  if (!giaVao) return 0
  return ((value - giaVao) / giaVao) * 100
}

/** Cách 1 — cắt lỗ ngay dưới hỗ trợ 1%, chốt lời ngay dưới kháng cự 1%. */
export function computeHoTroKhangCuSlTp(
  hoTro: number | null,
  khangCu: number | null,
  giaVao: number,
): SlTpResult | null {
  if (hoTro == null || khangCu == null || !giaVao) return null
  const catLo = roundToStep(hoTro * 0.99)
  const chotLoi = roundToStep(khangCu * 0.99)
  return { catLo, chotLoi, catLoPct: pctAway(catLo, giaVao), chotLoiPct: pctAway(chotLoi, giaVao) }
}

/** "Biên độ dao động" — average true range over the last `period` bars. */
export function computeBienDoDaoDong(
  ohlcv: readonly OhlcvBar[] | null | undefined,
  period = 14,
): number | null {
  if (!ohlcv || ohlcv.length < period + 1) return null
  const bars = ohlcv.slice(-(period + 1))
  const trueRanges: number[] = []
  for (let index = 1; index < bars.length; index += 1) {
    const current = bars[index]
    const previousClose = bars[index - 1].close
    if (current.high == null || current.low == null || previousClose == null) return null
    trueRanges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previousClose),
        Math.abs(current.low - previousClose),
      ),
    )
  }
  if (trueRanges.length === 0) return null
  const average = trueRanges.reduce((sum, value) => sum + value, 0) / trueRanges.length
  return average > 0 ? average : null
}

/** Cách 2 — cắt lỗ = giá vào − biên độ × 2, chốt lời = giá vào + biên độ × 4. */
export function computeBienDoSlTp(bienDo: number | null, giaVao: number): SlTpResult | null {
  if (bienDo == null || !giaVao) return null
  const catLo = Math.round(giaVao - bienDo * 2)
  const chotLoi = Math.round(giaVao + bienDo * 4)
  return { catLo, chotLoi, catLoPct: pctAway(catLo, giaVao), chotLoiPct: pctAway(chotLoi, giaVao) }
}

/** spec §5.4 "cổng cứng": một cách đã chọn VÀ cả hai mức > 0. */
export function isSlTpValid(
  phuongPhap: PhuongPhapSlTp | null,
  catLo: number | null,
  chotLoi: number | null,
  vungMua: number | null = null,
): boolean {
  return (
    phuongPhap != null &&
    catLo != null &&
    catLo > 0 &&
    chotLoi != null &&
    chotLoi > 0 &&
    catLo < chotLoi &&
    (vungMua == null || (catLo < vungMua && vungMua < chotLoi))
  )
}

/** Ngưỡng "bán sớm khi lỗ nhẹ" (spec §1) — a loss strictly between 0% and −2%. */
export const BAN_SOM_LOSS_CEILING_PCT = -2

export interface KetsoFlagsCap2 {
  cham_SL_cuoi_phien: boolean
  cham_SL_cat_dung_phien_ke: boolean
  cham_SL_khong_cat: boolean
  giu_cham_SL_bao_nhieu_phien?: number
  cham_TP_giu_lam_hut: boolean
  ban_som_khi_lo_nhe: boolean
  nhoi_lenh_khi_lo: boolean
}

/**
 * Best-effort client-side approximation of the 4 hành vi vi phạm kỷ luật from
 * what a single sell fill knows. `cham_TP_giu_lam_hut` and `nhoi_lenh_khi_lo`
 * both need observation this fill doesn't have (intraday high after touching
 * chốt lời; every BUY placed during the holding period) and stay `false`
 * rather than guessing — the same documented limitation the legacy helper had.
 * `cham_SL_cuoi_phien` is about a still-held position at market close, so it
 * never applies to a closed round trip.
 */
export function computeKetsoFlagsCap2(input: {
  entryPrice: number
  exitPrice: number
  catLo: number
  soPhienGiu: number
}): KetsoFlagsCap2 {
  const { entryPrice, exitPrice, catLo, soPhienGiu } = input
  const pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0
  const touchedSl = catLo > 0 && exitPrice <= catLo
  const cutSameSession = soPhienGiu <= 1
  const cham_SL_khong_cat = touchedSl && !cutSameSession
  return {
    cham_SL_cuoi_phien: false,
    cham_SL_cat_dung_phien_ke: touchedSl && cutSameSession,
    cham_SL_khong_cat,
    giu_cham_SL_bao_nhieu_phien: cham_SL_khong_cat ? Math.max(1, soPhienGiu - 1) : undefined,
    cham_TP_giu_lam_hut: false,
    ban_som_khi_lo_nhe: !touchedSl && pnlPct < 0 && pnlPct > BAN_SOM_LOSS_CEILING_PCT,
    nhoi_lenh_khi_lo: false,
  }
}

/* ── Cấp 3: quản lý vốn ─────────────────────────────────────────────────── */

export const KHAU_VI_PCT: Record<KhauViLoai, number> = {
  than_trong: 10,
  can_bang: 20,
  tan_cong: 30,
}

export const KHAU_VI_OPTIONS: readonly { value: KhauViLoai; label: string; desc: string }[] = [
  { value: "than_trong", label: "Thận trọng", desc: "Tối đa 10% vốn cho một lệnh" },
  { value: "can_bang", label: "Cân bằng", desc: "Tối đa 20% vốn cho một lệnh" },
  { value: "tan_cong", label: "Tấn công", desc: "Tối đa 30% vốn cho một lệnh" },
]

/** Hệ số tự tin — Cách 1 (linh hoạt) only; Cách 2 never multiplies by it. */
export const MUC_TU_TIN_HE_SO: Record<MucTuTin, number> = { 1: 50, 2: 75, 3: 100 }

export const MUC_TU_TIN_OPTIONS: readonly { value: MucTuTin; label: string }[] = [
  { value: 1, label: "Thấp" },
  { value: 2, label: "Vừa" },
  { value: 3, label: "Cao" },
]

export const CACH_KHOI_LUONG_OPTIONS: readonly {
  value: CachKhoiLuong
  label: string
  desc: string
}[] = [
  {
    value: "linh_hoat",
    label: "Linh hoạt — theo mức tự tin",
    desc: "Trần khẩu vị × hệ số tự tin (50/75/100%) × vốn ÷ giá",
  },
  {
    value: "ky_luat",
    label: "Kỷ luật — luôn đúng mức trần",
    desc: "Trần khẩu vị × vốn ÷ giá, không để cảm xúc chi phối",
  },
]

/** Board lot: every VN order quantity is a multiple of 100 shares. */
export const BOARD_LOT = 100

/** Round to the nearest board lot (ties round up, matching the legacy rule). */
export function roundToLo(shares: number, lo: number = BOARD_LOT): number {
  if (!Number.isFinite(shares) || shares <= 0) return 0
  return Math.round(shares / lo) * lo
}

export interface KhoiLuongResult {
  khoiLuong: number
  pctVon: number
  tienDuKien: number
}

/** Khối lượng = trần khẩu vị (± hệ số tự tin) × vốn ÷ giá, rounded to lô 100. */
export function computeKhoiLuong(input: {
  khauViPct: number
  mucTuTin: MucTuTin
  cachKhoiLuong: CachKhoiLuong
  vonBanDau: number
  giaVao: number
}): KhoiLuongResult {
  const { khauViPct, mucTuTin, cachKhoiLuong, vonBanDau, giaVao } = input
  if (!khauViPct || khauViPct <= 0 || !vonBanDau || vonBanDau <= 0 || !giaVao || giaVao <= 0) {
    return { khoiLuong: 0, pctVon: 0, tienDuKien: 0 }
  }
  const heSo = cachKhoiLuong === "linh_hoat" ? (MUC_TU_TIN_HE_SO[mucTuTin] ?? 100) : 100
  const tienDuKien =
    cachKhoiLuong === "linh_hoat"
      ? vonBanDau * (khauViPct / 100) * (heSo / 100)
      : vonBanDau * (khauViPct / 100)
  const khoiLuong = roundToLo(tienDuKien / giaVao)
  return { khoiLuong, pctVon: ((khoiLuong * giaVao) / vonBanDau) * 100, tienDuKien }
}

/** spec §6.4 "cổng cứng": mức tự tin (always mandatory) + một cách khối lượng. */
export function isKhoiLuongValid(
  mucTuTin: MucTuTin | null,
  cachKhoiLuong: CachKhoiLuong | null,
): boolean {
  return mucTuTin != null && cachKhoiLuong != null
}

export function cachKhoiLuongWire(cach: CachKhoiLuong): CachKhoiLuongWire {
  return cach === "linh_hoat" ? "khau_vi_tu_tin" : "chia_deu"
}

/**
 * % vốn THỰC TẾ of the accepted order (the Cấp 3 evidence the server stores) —
 * the user may edit the suggested quantity, and a market order fills at its
 * own price, so this never reuses the pre-fill suggestion.
 */
export function actualCapitalPct(
  quantity: number,
  acceptedPrice: number,
  initialCapital: number | null | undefined,
): number | null {
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(acceptedPrice) ||
    acceptedPrice <= 0 ||
    initialCapital == null ||
    !Number.isFinite(initialCapital) ||
    initialCapital <= 0
  ) {
    return null
  }
  return ((quantity * acceptedPrice) / initialCapital) * 100
}

/* ── Cấp 6: mâu thuẫn ───────────────────────────────────────────────────── */

export interface LopUngHoCap6 {
  lop: Lop
  nhan: string
  bac: string | number | null
}

export interface LopNguocCap6 extends LopUngHoCap6 {
  la_phu_quyet: boolean
}

export interface LopTrungTinhCap6 {
  lop: Lop
  nhan: string
}

export interface MauThuanCap6 {
  co_mau_thuan: boolean
  ung_ho: LopUngHoCap6[]
  nguoc: LopNguocCap6[]
  trung_tinh: LopTrungTinhCap6[]
  phu_quyet_kich_hoat: boolean
  lop_phu_quyet_xau: Lop[]
  canh_bao: string | null
  chua_du_du_lieu: boolean
  ly_do_chua_du: string | null
}

export const CONFLICT_LEVEL_OPTIONS: readonly {
  value: ConflictLevel
  title: string
  desc: string
}[] = [
  {
    value: "nhe",
    title: "Mâu thuẫn nhẹ",
    desc: "Các lớp ủng hộ đáng tin hơn, lớp ngược không nghiêm trọng",
  },
  {
    value: "ngai",
    title: "Đáng ngại — cần thận trọng",
    desc: "Có rủi ro thật, phải cân nhắc kỹ",
  },
  {
    value: "nghiem",
    title: "Nghiêm trọng",
    desc: "Lớp phủ quyết quá xấu, lấn át mọi tín hiệu tốt",
  },
  { value: "chua_ro", title: "Chưa rõ", desc: "Cần thêm thông tin/thời gian mới đánh giá được" },
]

const CONFLICT_LABEL: Record<ConflictLevel, string> = {
  nhe: "Mâu thuẫn nhẹ",
  ngai: "Đáng ngại",
  nghiem: "Nghiêm trọng",
  chua_ro: "Chưa rõ",
}

export function conflictLevelLabel(level: ConflictLevel | null | undefined): string {
  return level ? CONFLICT_LABEL[level] : "—"
}

/** Câu chốt của bảng mâu thuẫn (spec §5.2). */
export const CAU_CHOT_MAU_THUAN =
  "IQX chỉ ra mâu thuẫn — nhận định của bạn được ghi lại để nhìn lại khi kết sổ. Quyết định vẫn là của bạn."

export const CHU_THICH_PHU_QUYET =
  "Lớp phủ quyết: Tin tức · Nội bộ — khi rất xấu, có thể phủ định mọi lớp khác."
export const CHU_THICH_DIEM_TRU =
  "Lớp điểm trừ: Kỹ thuật · Dòng tiền · Định giá — xấu thì trừ điểm, không phủ định."
export const CHU_THICH_KHUNG_THAM_KHAO = "(Khung tham khảo của IQX, không phải quy tắc bắt buộc.)"

/**
 * Phản hồi ngắn sau khi user chọn một mức (spec §6). It only ever mentions
 * khối lượng + mức tự tin — Cấp 6 never gains a claim about cắt lỗ, because
 * nothing measures that.
 */
export function feedbackNhanDinh(level: ConflictLevel): string {
  switch (level) {
    case "nhe":
      return 'Bạn đọc đây là mâu thuẫn nhẹ. Nhận định này được ghi lại — khi kết sổ, bạn sẽ thấy những lần đọc "nhẹ" của mình có chính xác không.'
    case "ngai":
      return "Bạn đọc đây là đáng ngại. Ghi nhận rồi. Cân nhắc để khối lượng và mức tự tin ở phần bên dưới khớp với mức thận trọng này."
    case "nghiem":
      return "Bạn đọc đây là nghiêm trọng — lớp phủ quyết lấn át. Nếu vậy, hãy để hành động (khối lượng, mức tự tin, hoặc đứng ngoài) khớp với nhận định. Kết sổ sẽ soi sự nhất quán này."
    default:
      return "Bạn thấy chưa rõ. Ghi nhận. Nếu chưa đủ tự tin, chờ thêm phiên cũng là một lựa chọn hợp lý với mâu thuẫn có lớp phủ quyết."
  }
}

/**
 * spec §5.1 — the conflict table only exists with ≥1 ủng hộ AND ≥1 ngược chiều.
 * `chua_du_du_lieu` blocks everything: "chưa đọc đủ 5 lớp" is NOT "no conflict".
 */
export function coBangMauThuan(mauThuan: MauThuanCap6 | null | undefined): boolean {
  if (!mauThuan) return false
  if (mauThuan.chua_du_du_lieu) return false
  return mauThuan.co_mau_thuan && mauThuan.ung_ho.length > 0 && mauThuan.nguoc.length > 0
}

/**
 * Lý do vào lệnh SUY RA from the server's five-layer read — fills Cấp 1's NOT
 * NULL `lyDo` at Cấp 6, where the user no longer rates layers. `null` means
 * "can't read anything": the caller must fall back to letting the user pick.
 */
export function lyDoTuMauThuan(mauThuan: MauThuanCap6 | null | undefined): Lop | null {
  if (!mauThuan) return null
  return mauThuan.ung_ho[0]?.lop ?? mauThuan.trung_tinh[0]?.lop ?? mauThuan.nguoc[0]?.lop ?? null
}

/* ── Kết sổ: holding time + "có chuyện" ─────────────────────────────────── */

const MS_PER_DAY = 86_400_000

function parseYmd(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`)
}

/**
 * Số phiên giữ — trading days (Mon–Fri) strictly AFTER the buy date up to and
 * including the sell date, so a same-day round trip is 0 phiên (Sân tập is
 * T+0, where 0 is the common case). Mirrors the backend's Mon–Fri-only rule.
 */
export function countTradingSessions(buyDate: string, sellDate: string): number {
  const start = parseYmd(buyDate).getTime()
  const end = parseYmd(sellDate).getTime()
  let sessions = 0
  for (let time = start + MS_PER_DAY; time <= end; time += MS_PER_DAY) {
    const day = new Date(time).getUTCDay()
    if (day !== 0 && day !== 6) sessions += 1
  }
  return sessions
}

export function countCalendarDays(buyDate: string, sellDate: string): number {
  const diff = parseYmd(sellDate).getTime() - parseYmd(buyDate).getTime()
  return Math.max(0, Math.round(diff / MS_PER_DAY))
}

/** spec §6 "có chuyện": lỗ > 7% · giữ > 10 phiên · bán trong vòng 1 phiên. */
export function isLenhCoChuyen(params: { pnlPct: number; soPhienGiu: number }): boolean {
  return params.pnlPct < -7 || params.soPhienGiu > 10 || params.soPhienGiu < 1
}

/** The table's own "we don't know / not applicable" glyph. */
export const UNKNOWN = "—"

/** `null` ⇢ unknown (never "0 phiên": Sân tập genuinely closes same-session). */
export function holdTimeText(soPhienGiu: number | null | undefined): string | null {
  if (soPhienGiu == null) return null
  return soPhienGiu > 0 ? `${soPhienGiu} phiên` : "Trong cùng phiên"
}

/* ── Kết sổ: coach (rule-based, never AI) ───────────────────────────────── */

export interface CoachSituationCap1 {
  pnlPositive: boolean
  trangThaiLucDat: TrangThaiLucDat
  soPhienGiu: number
}

export function pickCoachLetterCap1(situation: CoachSituationCap1): "A" | "B" | "C" | "D" | "E" | "F" {
  const { pnlPositive, trangThaiLucDat, soPhienGiu } = situation
  if (soPhienGiu > 10) return "E"
  if (soPhienGiu < 1) return "F"
  if (pnlPositive) return trangThaiLucDat === "ung_ho" ? "A" : "B"
  return trangThaiLucDat === "ung_ho" ? "C" : "D"
}

function fmtPctText(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

/** Cấp 0's "NHÌN LẠI" — only knows lãi/lỗ. `**bold**` markers rendered by the caller. */
export function coachTemplateCap0(params: { pnlPositive: boolean; orderNo: number }): string {
  const { pnlPositive, orderNo } = params
  if (pnlPositive) {
    return `Lệnh ${orderNo} khép trọn vòng đời: mua — nắm giữ — theo dõi — bán — và giờ là nhìn lại. Lệnh lãi. Điều đáng giá hơn con số: **bạn đã đi đủ một vòng giao dịch hoàn chỉnh** — nhiều người mua cổ phiếu còn không biết mình đang nắm gì. Chú ý dòng thuế bán 0,1% — bán luôn tốn thêm một khoản, mua bán liên tục là phí + thuế ăn dần tài khoản.`
  }
  return `Lệnh ${orderNo} lỗ — nhưng đây là Sân tập, tiền không thật, và bạn vừa đi trọn một vòng giao dịch. **Cái bạn thu được là kinh nghiệm, không phải con số.** Ở Cấp 1 bạn sẽ học chọn lý do mua có cơ sở; Cấp 2 học đặt cắt lỗ/chốt lời để biết khi nào nên thoát. Chú ý dòng thuế bán 0,1%.`
}

/**
 * Cấp 1's 6-template coach (spec §6) — E/F (holding-time behaviour) are checked
 * before the {lãi/lỗ} × {trạng thái} grid, otherwise they'd be unreachable.
 */
export function coachTemplateCap1(
  situation: CoachSituationCap1,
  params: { pnlPct: number; lyDo: LyDo; soPhienGiu: number; emotion: CamXuc | null },
): string {
  const letter = pickCoachLetterCap1(situation)
  const pct = fmtPctText(params.pnlPct)
  const lyDo = lyDoLabel(params.lyDo)
  const trangThai = TRANG_THAI_LABEL[situation.trangThaiLucDat]
  switch (letter) {
    case "A":
      return `Lệnh lãi ${pct}. Bạn chọn lý do ${lyDo} lúc lớp đó Ủng hộ — chọn lý do có cơ sở đã cho kết quả tốt. Ghi lại như mẫu chuẩn.`
    case "B":
      return `Lệnh lãi ${pct}. Lý do ${lyDo} lúc đặt chỉ ${trangThai} — kết quả tốt nhưng chưa chắc do phán đoán đúng. Thử ưu tiên lệnh có lý do Ủng hộ.`
    case "C":
      return `Lệnh lỗ ${pct} dù lý do ${lyDo} lúc đặt Ủng hộ. Có dữ liệu ủng hộ vẫn có thể lỗ — thị trường không chắc chắn. Đây không phải lỗi chọn lý do.`
    case "D":
      return `Lệnh lỗ ${pct}. Lúc đặt, lớp ${lyDo} đã Ngược chiều — bạn vẫn mua. Khi dữ liệu cảnh báo ngược, thị trường thường đúng.`
    case "E":
      return `Bạn giữ lệnh ${params.soPhienGiu} phiên. Ở Cấp 2 bạn sẽ học đặt chốt lời/cắt lỗ để biết khi nào nên thoát — không giữ mãi theo cảm tính.`
    default:
      return `Bạn bán chỉ sau ${params.soPhienGiu} phiên. Cảm xúc ${camXucLabel(params.emotion)}. Ở Cấp 2 bạn sẽ học đặt vùng thoát trước, tránh bán theo phản ứng nhất thời.`
  }
}

/* ── number formatting (VND, vi-VN) ─────────────────────────────────────── */

export function fmtVnd(value: number): string {
  return Math.round(value).toLocaleString("vi-VN")
}

/** `+10.0%` / `−5.0%` / `0.0%` — typographic minus (U+2212), never a hyphen. */
export function fmtPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

export function fmtVndSigned(value: number): string {
  const rounded = Math.round(value)
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${fmtVnd(Math.abs(rounded))}đ`
}
