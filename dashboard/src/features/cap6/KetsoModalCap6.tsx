import { useCallback, useEffect, useState } from "react"
import { Message, Modal } from "@arco-design/web-react"
import { getErrorMessage } from "@/shared/http/client"
import { cn } from "@/shared/lib/cn"
import { useRecordKetso } from "@/features/cap1/hooks"
import {
  countCalendarDays,
  countTradingSessions,
  isLenhCoChuyen,
} from "@/features/cap1/KetsoModalCap1"
import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import {
  LY_DO_OPTIONS,
  type CamXuc,
  type Cap1Progress,
  type LyDo,
  type TrangThaiLucDat,
} from "@/features/cap1/types"
import type { Cap1TradeRecord } from "@/features/cap1/tradeLog"
import { useRecordKetsoCap2 } from "@/features/cap2/hooks"
import type { CoachSituationCap2 } from "@/features/cap2/coachTemplateCap2"
import type { Cap2Progress, PhuongPhapSlTp } from "@/features/cap2/types"
import { MUC_TU_TIN_LABEL, type CoachSituationCap3 } from "@/features/cap3/coachTemplateCap3"
import { KHAU_VI_PCT } from "@/features/cap3/khoiLuong"
import { CACH_KHOI_LUONG_LABEL } from "@/features/cap3/portfolioAnalysisCap3"
import type { KhauViLoai } from "@/features/cap3/types"
import {
  lopKhacAiCap4,
  lopLabelCap4,
  type CoachSituationCap4,
} from "@/features/cap4/coachTemplateCap4"
import {
  countCungGocNhin,
  countDongThuan,
  countKhacAi,
  LOP_KEYS,
  NHAN_DINH_LABEL,
} from "@/features/cap4/doc5Lop"
import { useCap5Events } from "@/features/cap5/Cap5Context"
import {
  deriveO4,
  splitEmphasis,
  type CoachSituationCap5,
} from "@/features/cap5/coachTemplateCap5"
import { useRecordKetsoCap5, useVerdictGoiY } from "@/features/cap5/hooks"
import type { KetsoDataCap5 } from "@/features/cap5/KetsoModalCap5"
import { PhanLoai4O } from "@/features/cap5/PhanLoai4O"
import { O4_LABEL, type O4, type Verdict } from "@/features/cap5/types"
import {
  composeCoachCap6,
  COACH_CAP6_LABEL,
  type CoachSituationCap6,
} from "./coachTemplateCap6"
import { lopNguocChieu, lopUngHo } from "./doiChieu"
import { useCompleteCap6Task } from "./hooks"
import { useCap6TradeLog, type Cap6TradeRecord } from "./tradeLogCap6"
import { KIEU_ICON, type KieuCoPhieu, type Lop } from "./types"
// Kết sổ Cấp 6 = Kết sổ Cấp 5's content (đối chiếu Cấp 1 + CAM KẾT vs THỰC TẾ Cấp
// 2 + Quản lý vốn Cấp 3 + Đọc 5 lớp Cấp 4 + khối cảm xúc + PHÂN LOẠI 4 Ô Cấp 5 +
// 5 lớp coach + HỒ SƠ + count-up) — CỘNG khối "Đối chiếu — nhìn lại" và lớp coach
// "ĐỐI CHIẾU VS KẾT QUẢ". Dùng lại đúng bộ CSS shell Cấp 0-5 đã dựng, chỉ thêm
// `cap6-ketso.css`.
import "@/features/cap0/cap0.css"
import "@/features/cap1/cap1.css"
import "@/features/cap2/cap2-ketso.css"
import "@/features/cap3/cap3-ketso.css"
import "@/features/cap4/cap4-ketso.css"
import "@/features/cap5/cap5.css"
import "./cap6-ketso.css"

/**
 * Màn Kết sổ Cấp 6 (spec `IQX-Cap6-Spec.md` §6).
 *
 * DESIGN DECISION — **mirror, KHÔNG compose `KetsoModalCap5` làm con**, đúng tiền
 * lệ Cấp 5 → Cấp 4 → Cấp 3 → Cấp 2 đã ghi: `KetsoModalCap5` render một `<Modal>`
 * TRỌN GÓI (không export mảnh nào, không có slot), nút đóng của nó tự `mutate` +
 * tự ghi nhật ký Cấp 5 rồi gọi `onClose`, và nó SỞ HỮU cổng `Đóng kết sổ ✓`. Bọc
 * nó làm con sẽ (1) lồng 2 `<Modal>`, (2) không đặt được khối "Đối chiếu — nhìn
 * lại" vào giữa thân modal, (3) ghi một bản ghi Cấp 5 cho lệnh Cấp 6 — sai cấp.
 *
 * PHẦN LOGIC THÌ TÁI SỬ DỤNG THẬT (không mirror):
 *  - Coach: `composeCoachCap6` → `composeCoachCap5` → Cấp 4 → 3 → 2 → 1. CẢ 6 đoạn
 *    text đều do module cấp dưới sinh ra, Cấp 6 chỉ thêm đoạn 6.
 *  - Khối phân loại: `PhanLoai4O` của Cấp 5 NGUYÊN VẸN (nó sở hữu verdict hệ +
 *    provenance + luật `isPhanLoaiSettled`); modal này chỉ sở hữu CỔNG +
 *    `POST /cap5/ketso`.
 *  - Hai phía của mâu thuẫn: `lopUngHo`/`lopNguocChieu` của FE1 chấm trên CHÍNH
 *    `doc5Lop` của lệnh — cùng nguồn mà bước Đối chiếu đã đọc lúc đặt lệnh, nên
 *    Kết sổ không bao giờ hiện một mâu thuẫn khác với panel.
 *  - Helper thuần của Cấp 1/4 + `splitEmphasis` của Cấp 5.
 *
 * ★ **CỔNG CỦA CẤP 5 KHÔNG BỊ NỚI** (spec §6 "kế thừa nguyên vẹn"): `Đóng kết sổ ✓`
 * vẫn khoá tới khi `PhanLoai4O` báo đã chốt verdict, modal vẫn `closable={false}`,
 * và LỐI RA khi `GET /cap5/verdict` lỗi vẫn còn (không có nó, một lệnh verdict lỗi
 * sẽ khoá user trong màn không đóng được). Khối Đối chiếu của Cấp 6 KHÔNG thêm
 * cổng nào — nó chỉ nhìn lại một quyết định đã ghi lúc đặt lệnh.
 *
 * ★ **LỆCH GỢI Ý KHÔNG BAO GIỜ LÀ "SAI"** (spec §5/§10). Khối dưới nói "khớp gợi
 * ý" hoặc "khác gợi ý" — không màu cảnh báo, không icon cảnh báo, không chữ "sai".
 * `khopGoiY === null` (kiểu chưa phân loại) hiện là "chưa phân loại / không xét",
 * TUYỆT ĐỐI không hiện là lệch: không thể lệch một gợi ý chưa từng được đưa ra.
 */

/**
 * Khối Đối chiếu của MỘT lệnh, để Kết sổ nhìn lại (spec §6).
 *
 * Mọi trường tới từ các cột Cấp 6 của `order_kehoach` (bản authoritative mà
 * `POST /cap6/kehoach` trả về) hoặc từ `GET /cap6/goi-y` — **không trường nào
 * được suy đoán ở đây**. Thiếu trường nào thì khối bỏ hẳn dòng đó thay vì đắp.
 *
 * Hai phía của mâu thuẫn KHÔNG có trong interface này: chúng được chấm lại từ
 * `KetsoDataCap6.doc5Lop` (chính bản chấm 5 lớp của lệnh, cũng là nguồn của
 * `lop_mau_thuan` server lưu) nên không thể lệch với panel.
 */
export interface DoiChieuKetsoCap6 {
  /** `order_kehoach.kieu_co_phieu`. `null` = "chưa phân loại" (ngành thiếu/chưa map). */
  kieu: KieuCoPhieu | null
  /** `kieu_ten` của server — hiện nguyên văn. */
  kieuTen: string | null
  /** Ngành mà kiểu được suy ra TỪ (provenance §C12c). `null` → không hiện dòng. */
  nganh: string | null
  /** `order_kehoach.lop_quyet_dinh` — lớp user đã tin cho lệnh này. */
  lopQuyetDinh: Lop | null
  /** Nhóm lớp server gợi ý ưu tiên cho kiểu đó (`trong_so_goi_y.lop_uu_tien`). */
  lopUuTien: Lop[]
  /** ★ `order_kehoach.khop_goi_y` — `false` TRUNG TÍNH, `null` = chưa phân loại. */
  khopGoiY: boolean | null
  /** `order_kehoach.ly_do_doi_chieu` — 1 dòng vì sao user ghi lúc đặt. */
  lyDo: string | null
}

/**
 * Cấp 6 thêm ĐÚNG một trường vào dữ liệu Kết sổ: khối Đối chiếu của lệnh.
 * `null` = lệnh không có mâu thuẫn (hoặc lệnh mở trước khi Cấp 6 ship, cả 6 cột
 * đều null) → khối Đối chiếu bị bỏ hẳn, im lặng.
 */
export interface KetsoDataCap6 extends KetsoDataCap5 {
  doiChieu: DoiChieuKetsoCap6 | null
}

export interface KetsoModalCap6Props {
  /** `null` → modal đóng/không mount. */
  data: KetsoDataCap6 | null
  /** Hồ sơ Cấp 1 — cho 3 dòng "HỒ SƠ CỦA BẠN" (giữ nguyên). */
  progress: Cap1Progress | null
  /** Nhật ký lệnh đã đóng (Cấp 1) — cho dòng thống kê theo lý do (giữ nguyên). */
  trades: Cap1TradeRecord[]
  /** Hồ sơ Cấp 2 — cho dòng tác động chuỗi kỷ luật (giá trị TRƯỚC kết sổ này). */
  cap2Progress: Cap2Progress | null
  onClose: () => void
  /**
   * Gọi 1 lần với bản ghi Cấp 6 của lệnh này. Modal ĐÃ tự ghi vào nhật ký Cấp 6
   * (`useCap6TradeLog`); callback này để caller ghi thêm vào nhật ký Cấp 1-5 (bản
   * ghi Cấp 6 là siêu tập của cả năm nên truyền thẳng được).
   */
  onRecorded?: (record: Cap6TradeRecord) => void
}

const TRANG_THAI_LABEL: Record<TrangThaiLucDat, string> = {
  ung_ho: "✅ Ủng hộ",
  trung_tinh: "⚪ Trung tính",
  can_chu_y: "⚠ Cần chú ý",
  nguoc_chieu: "❌ Ngược chiều",
}

const CAM_XUC_OPTIONS: readonly { value: CamXuc; label: string }[] = [
  { value: "binh_tinh", label: "😌 Bình tĩnh" },
  { value: "so", label: "😰 Sợ" },
  { value: "hoi_tiec", label: "😔 Hối tiếc" },
  { value: "khong_ro", label: "🤔 Không rõ" },
] as const

const METHOD_LABEL: Record<PhuongPhapSlTp, string> = {
  ho_tro_khang_cu: "Hỗ trợ/Kháng cự",
  bien_do_dao_dong: "Biên độ dao động",
}

const KHAU_VI_LABEL: Record<KhauViLoai, string> = {
  than_trong: "Thận trọng",
  can_bang: "Cân bằng",
  tan_cong: "Tấn công",
}

function lyDoLabel(lyDo: LyDo): string {
  const opt = LY_DO_OPTIONS.find((o) => o.value === lyDo)
  return opt ? `${opt.icon} ${opt.label}` : lyDo
}

function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/** `+5.3%` / `−4.2%` / `0.0%` — dấu trừ typographic "−" (U+2212), như Cấp 0-5. */
function fmtPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

function fmtVndSigned(n: number): string {
  const rounded = Math.round(n)
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${fmtVnd(Math.abs(rounded))} ₫`
}

/** spec §1 (Cấp 2) — lệnh "vi phạm" khi bất kỳ 1 trong 4 hành vi đo được là true. */
function hasViPham(flags: KetsoDataCap6["flags"]): boolean {
  return Boolean(
    flags.cham_SL_khong_cat ||
      flags.cham_TP_giu_lam_hut ||
      flags.ban_som_khi_lo_nhe ||
      flags.nhoi_lenh_khi_lo,
  )
}

/** "Thực tế" của hàng cắt lỗ trong CAM KẾT vs THỰC TẾ (giữ nguyên Cấp 2-5). */
function describeSlThucTe(
  flags: KetsoDataCap6["flags"],
  exitPrice: number,
  catLo: number,
): string {
  const touched = Boolean(
    flags.cham_SL_cat_dung_phien_ke ||
      flags.cham_SL_khong_cat ||
      flags.cham_SL_cuoi_phien ||
      (catLo > 0 && exitPrice <= catLo),
  )
  if (!touched) return "Chưa chạm cắt lỗ"
  if (flags.cham_SL_khong_cat) {
    const n = flags.giu_cham_SL_bao_nhieu_phien
    return n != null && n > 0 ? `Có chạm — cắt trễ ${n} phiên ⚠` : "Có chạm — cắt trễ ⚠"
  }
  return "Có chạm — cắt đúng phiên ✅"
}

/** "Thực tế" của hàng chốt lời trong CAM KẾT vs THỰC TẾ (giữ nguyên Cấp 2-5). */
function describeTpThucTe(
  flags: KetsoDataCap6["flags"],
  exitPrice: number,
  chotLoi: number,
): string {
  const touched = Boolean(flags.cham_TP_giu_lam_hut || (chotLoi > 0 && exitPrice >= chotLoi))
  if (!touched) return "Chưa chạm chốt lời"
  if (flags.cham_TP_giu_lam_hut) return "Có chạm — giữ tiếp, hụt lời ⚠"
  return "Có chạm — chốt đúng ✅"
}

/** "🎯 Kỹ thuật · 💰 Dòng tiền", hoặc "—" khi không lớp nào ở phía đó. */
function lopList(lop: readonly Lop[]): string {
  return lop.length > 0 ? lop.map((l) => lopLabelCap4(l)).join(" · ") : "—"
}

/**
 * Dòng "khớp gợi ý hay khác gợi ý" — diễn đạt TRUNG TÍNH ở cả 3 trạng thái.
 *
 * ★ `null` là "chưa phân loại / không xét", KHÔNG phải lệch (spec §10): kiểu chưa
 * phân loại nghĩa là chưa có gợi ý nào để so.
 */
function khopText(khopGoiY: boolean | null): string {
  if (khopGoiY === true) return "khớp gợi ý cho kiểu này ✓"
  if (khopGoiY === false) {
    return (
      "khác gợi ý cho kiểu này — đây là một sự thật trung tính, " +
      "trọng tài cuối là kết quả thật của lệnh"
    )
  }
  return "kiểu cổ phiếu chưa phân loại nên lệnh này không xét khớp gợi ý"
}

const TARGET_ORDERS = 10
const MIN_TRADES_FOR_STAT = 2
const COUNT_UP_MS = 1000
const COUNT_UP_STEP_MS = 40

export function KetsoModalCap6({
  data,
  progress,
  trades,
  cap2Progress,
  onClose,
  onRecorded,
}: KetsoModalCap6Props) {
  const cap5Events = useCap5Events()
  const recordKetsoCap1 = useRecordKetso()
  const recordKetsoCap2 = useRecordKetsoCap2()
  const recordKetsoCap5 = useRecordKetsoCap5()
  const completeCap6Task = useCompleteCap6Task()
  const { record: recordCap6Trade } = useCap6TradeLog()
  const [emotion, setEmotion] = useState<CamXuc | null>(null)
  const [displayPct, setDisplayPct] = useState(0)
  // Trạng thái CHỐT của khối phân loại — nguồn duy nhất của cổng nút đóng.
  const [verdictUser, setVerdictUser] = useState<Verdict | null>(null)
  const [lyDoSua, setLyDoSua] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  // Cùng query key với `PhanLoai4O` (`cap5Keys.verdict(orderId)`) → không gọi thêm
  // request nào; modal cần `signals` để lớp coach thứ 5 nêu vi phạm CÓ THẬT (§C12c)
  // và `verdict` hệ để ghi `verdictHe` vào nhật ký.
  const verdictQuery = useVerdictGoiY(data?.orderId ?? null)
  const goiY = verdictQuery.data

  const entryPrice = data?.entryPrice ?? 0
  const exitPrice = data?.exitPrice ?? 0
  const quantity = data?.quantity ?? 0
  const pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0
  const pnlVnd = (exitPrice - entryPrice) * quantity

  // Reset + count-up ~1s mỗi khi MỘT kết sổ mới mở (giữ nguyên Cấp 1-5).
  useEffect(() => {
    if (!data) {
      setDisplayPct(0)
      return
    }
    setEmotion(null)
    setVerdictUser(null)
    setLyDoSua(null)
    setClosing(false)
    const start = Date.now()
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / COUNT_UP_MS)
      setDisplayPct(pnlPct * t)
      if (t < 1) timer = setTimeout(tick, COUNT_UP_STEP_MS)
    }
    tick()
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.n, data?.orderId])

  // LƯU MỌI lần báo, kể cả `(null, null)` — đó là cách cổng đóng lại khi user bỏ
  // chốt (xem doc của `PhanLoai4O`).
  const handleSettled = useCallback((verdict: Verdict | null, reason: string | null) => {
    setVerdictUser(verdict)
    setLyDoSua(reason)
  }, [])

  if (!data) return null

  const {
    n,
    orderId,
    symbol,
    vungMua,
    lyDo,
    trangThaiLucDat,
    buyDate,
    sellDate,
    catLo,
    chotLoi,
    phuongPhapSlTp,
    flags,
    giaSauKhiCat,
    khauVi,
    mucTuTin,
    cachKhoiLuong,
    khoiLuong,
    pctVon,
    doc5Lop,
    ai5Lop,
    doiChieu,
  } = data
  const soPhienGiu = countTradingSessions(buyDate, sellDate)
  const soNgayLich = countCalendarDays(buyDate, sellDate)
  const pnlPositive = pnlVnd > 0
  const tax = Math.round(exitPrice * quantity * 0.001)
  const coChuyen = isLenhCoChuyen({ pnlPct, soPhienGiu })

  const cap1Situation: CoachSituationCap1 = { pnlPositive, trangThaiLucDat, soPhienGiu }
  const cap1Params: CoachParamsCap1 = { pnlPct, lyDo, soPhienGiu, emotion }
  const cap2Situation: CoachSituationCap2 = {
    phuongPhapSlTp,
    catLo,
    chotLoi,
    flags,
    giaSauKhiCat,
  }
  const cap3Situation: CoachSituationCap3 = {
    mucTuTin,
    pnlPositive,
    pnlPct,
    cachKhoiLuong,
    khoiLuong,
    pctVon,
  }
  const cap4Situation: CoachSituationCap4 = { doc5Lop, ai5Lop, pnlPositive, pnlPct }
  // Ô 4 = verdict CỦA USER (đã chốt) × kết quả — verdict hệ chỉ là gợi ý.
  const o4 = verdictUser ? deriveO4(verdictUser, pnlPct) : null
  const cap5Situation: CoachSituationCap5 | null =
    verdictUser && o4
      ? { o4, verdict: verdictUser, pnlPct, signals: goiY?.signals ?? [] }
      : null
  // Lớp coach 6 chỉ tồn tại khi lệnh CÓ đối chiếu VÀ có gợi ý để so
  // (`khopGoiY != null`) — `pickCoachCap6` tự trả `null` cho trường hợp sau.
  const cap6Situation: CoachSituationCap6 | null = doiChieu
    ? {
        khopGoiY: doiChieu.khopGoiY,
        pnlPct,
        lopQuyetDinh: doiChieu.lopQuyetDinh,
        kieuTen: doiChieu.kieuTen,
        lopUuTien: doiChieu.lopUuTien,
      }
    : null
  const coach = composeCoachCap6(
    cap1Situation,
    cap1Params,
    cap2Situation,
    cap3Situation,
    cap4Situation,
    cap5Situation,
    cap6Situation,
  )

  const viPham = hasViPham(flags)
  const slThucTe = describeSlThucTe(flags, exitPrice, catLo)
  const tpThucTe = describeTpThucTe(flags, exitPrice, chotLoi)

  // ── Tác động lên chuỗi kỷ luật (Cấp 2 §6, giữ nguyên) ──────────────────
  const chuoiTruocDo = cap2Progress?.chuoi_current ?? 0
  const chuoiImpactText = viPham
    ? `Lệnh này làm đứt chuỗi kỷ luật — chuỗi về 0 (trước đó: ${chuoiTruocDo} lệnh liên tiếp).`
    : `Lệnh này giữ chuỗi kỷ luật — tăng lên ${chuoiTruocDo + 1} lệnh liên tiếp không vi phạm.`

  // ── Khối Quản lý vốn (Cấp 3 §7, giữ nguyên) ────────────────────────────
  const tienThucTe = khoiLuong * entryPrice

  // ── Bảng "Đọc 5 lớp — nhìn lại" (Cấp 4 §6, giữ nguyên) ─────────────────
  const lopKhacAi = new Set(lopKhacAiCap4(doc5Lop, ai5Lop))
  const soDongThuan = countDongThuan(ai5Lop)
  const soKhacAi = countKhacAi(doc5Lop, ai5Lop)
  const soCungGocNhin = countCungGocNhin(doc5Lop, ai5Lop)

  // ── Khối "Đối chiếu — nhìn lại" (Cấp 6 §6, THÊM MỚI) ───────────────────
  // Hai phía chấm lại từ CHÍNH bản chấm 5 lớp của lệnh — cùng nguồn với panel.
  const ungHo = lopUngHo(doc5Lop)
  const nguoc = lopNguocChieu(doc5Lop)

  // ── 3 dòng "HỒ SƠ CỦA BẠN" (giữ nguyên Cấp 1) ──────────────────────────
  const soLenh = progress?.so_lenh_thuc_chien ?? 0
  const conLai = Math.max(0, TARGET_ORDERS - soLenh)
  const line1 =
    conLai > 0
      ? `Đây là lệnh Thực chiến thứ ${soLenh}/${TARGET_ORDERS} — còn ${conLai} lệnh nữa để xét tốt nghiệp Cấp 1.`
      : `Đây là lệnh Thực chiến thứ ${soLenh} — bạn đã vượt mốc 10 lệnh của Cấp 1 từ lâu.`

  const usedLyDo = new Set<LyDo>([...trades.map((t) => t.lyDo), lyDo])
  const missing = LY_DO_OPTIONS.filter((o) => !usedLyDo.has(o.value))
  const daDung = Math.max(progress?.so_ly_do_da_dung ?? 0, usedLyDo.size)
  const line2 =
    missing.length > 0
      ? `Bạn đã dùng ${daDung}/5 lý do. Chưa thử: ${missing.map((o) => `${o.icon} ${o.label}`).join(", ")}.`
      : `Bạn đã dùng đủ 5/5 lý do.`

  const sameLyDo = trades.filter((t) => t.lyDo === lyDo)
  const sameLyDoWins = sameLyDo.filter((t) => t.pnlPct > 0).length
  const line3 =
    sameLyDo.length >= MIN_TRADES_FOR_STAT
      ? `Với lý do ${lyDoLabel(lyDo)}, bạn có ${sameLyDoWins}/${sameLyDo.length} lệnh lãi.`
      : `Còn ${MIN_TRADES_FOR_STAT - sameLyDo.length} lệnh nữa để hệ thống tìm mẫu riêng của bạn.`

  /**
   * Bản ghi nhật ký Cấp 6 của lệnh này (siêu tập của Cấp 1-5).
   *
   * 3 trường Cấp 6 đi thẳng từ khối Đối chiếu của lệnh; lệnh không có đối chiếu
   * ghi cả 3 là `null` — KHÔNG quy `khopGoiY` về `false` (đó sẽ là vu cho user
   * "lệch" một gợi ý chưa từng có).
   */
  const buildRecord = (
    o4Final: O4 | null,
    verdictHeFinal: Verdict | null,
    verdictUserFinal: Verdict | null,
  ): Cap6TradeRecord => ({
    orderId,
    lyDo,
    trangThaiLucDat,
    pnlPct,
    pnlVnd,
    closedAt: new Date(`${sellDate.slice(0, 10)}T00:00:00Z`).toISOString(),
    chamSlKhongCat: Boolean(flags.cham_SL_khong_cat),
    chamTpGiuLamHut: Boolean(flags.cham_TP_giu_lam_hut),
    banSomKhiLoNhe: Boolean(flags.ban_som_khi_lo_nhe),
    nhoiLenhKhiLo: Boolean(flags.nhoi_lenh_khi_lo),
    ghiChuNhinLai: null,
    khauVi,
    mucTuTin,
    cachKhoiLuong,
    khoiLuong,
    pctVon,
    doc_5_lop: doc5Lop,
    ai_5_lop: ai5Lop,
    // Chưa lộ AI → để NULL đúng như backend, KHÔNG quy về 0 (giữ nguyên Cấp 4/5).
    so_lop_dong_thuan: ai5Lop ? soDongThuan : null,
    so_lop_khac_ai: ai5Lop ? soKhacAi : null,
    o4: o4Final,
    verdictHe: verdictHeFinal,
    verdictUser: verdictUserFinal,
    kieuCoPhieu: doiChieu?.kieu ?? null,
    lopQuyetDinh: doiChieu?.lopQuyetDinh ?? null,
    khopGoiY: doiChieu?.khopGoiY ?? null,
  })

  /**
   * ★ Lối ra BẮT BUỘC, kế thừa nguyên vẹn từ Cấp 5: modal `closable={false}` + cổng
   * fail-closed, nên nếu `GET /cap5/verdict` lỗi thì KHÔNG có verdict để chốt → nút
   * "Đóng kết sổ ✓" khoá vĩnh viễn → user kẹt. Khi (và chỉ khi) query verdict LỖI,
   * hiện lối ra: ghi 7 cờ kỷ luật Cấp 2, ghi nhật ký với ô 4 = NULL (nhưng vẫn giữ
   * khối Đối chiếu — nó độc lập với verdict), rồi đóng. Đang tải KHÔNG hiện lối ra.
   */
  const escapeVisible = Boolean(verdictQuery.isError) && !verdictUser

  const handleEscape = () => {
    if (closing) return
    setClosing(true)
    recordKetsoCap2.mutate({ ...flags, order_id: orderId })
    const record = buildRecord(null, null, null)
    recordCap6Trade(record)
    onRecorded?.(record)
    onClose()
  }

  const handleClose = async () => {
    // Cổng: không có verdict đã chốt thì không đóng được (kể cả bấm bằng Enter).
    if (!verdictUser || !o4 || closing) return
    setClosing(true)

    // Cấp 1 (cảm xúc) — await TRƯỚC vì hàng `order_ketso` mà `/cap5/ketso` cần do
    // chính call này tạo. 409 "Lệnh này đã kết sổ" là trạng thái BÌNH THƯỜNG từ Cấp
    // 5 trở lên (trang đã kết sổ Cấp 1 ngay lúc lệnh bán khớp) nên bị bỏ qua.
    try {
      await recordKetsoCap1.mutateAsync({ order_id: orderId, cam_xuc: emotion })
    } catch {
      // Đã kết sổ Cấp 1 trước đó — không có gì để sửa, đi tiếp.
    }
    // Cấp 2 (7 cờ kỷ luật) — fire-and-forget đúng như Cấp 2-5 làm.
    recordKetsoCap2.mutate({ ...flags, order_id: orderId })

    // Cấp 5 (phân loại 4 ô) — call DUY NHẤT được phép chặn việc đóng.
    let ketso
    try {
      ketso = await recordKetsoCap5.mutateAsync({
        order_id: orderId,
        verdict_user: verdictUser,
        ly_do_sua: lyDoSua,
      })
    } catch (err) {
      Message.error(
        await getErrorMessage(
          err,
          "Chưa ghi được phân loại 4 ô của lệnh này. Thử bấm đóng lại — phân loại bạn vừa chốt vẫn còn.",
        ),
      )
      setClosing(false)
      return
    }

    // Cấp 6 KHÔNG có endpoint kết sổ riêng: cả 3 nhiệm vụ được suy ra server-side
    // từ `order_kehoach` JOIN `order_ketso`. `PATCH /cap6/task` là cách kích hoạt
    // lại phép tính đó NGAY (nhiệm vụ ② "Kết sổ đầu Cấp 6" vừa đủ điều kiện) và
    // đồng thời invalidate cache Cấp 6 để tab Hành trình cập nhật. Idempotent, và
    // fire-and-forget: một lỗi ở đây tuyệt đối không được chặn việc đóng modal.
    completeCap6Task.mutate(2)

    // Ưu tiên giá trị SERVER vừa trả (nó tự re-derive, là bản authoritative);
    // fallback về giá trị suy ra tại đây để nhật ký không bao giờ trống ô.
    const record = buildRecord(
      ketso?.o_4 ?? o4,
      ketso?.verdict_he ?? goiY?.verdict ?? null,
      ketso?.verdict_user ?? verdictUser,
    )
    recordCap6Trade(record)
    onRecorded?.(record)
    // Analytics `cap5_phan_loai` (Cấp 5 §8) — giữ nguyên: `daSua` là một sự thật
    // TRUNG TÍNH (user đảo verdict hệ), không phải điểm trừ.
    cap5Events.onVerdictSettled?.(verdictUser, lyDoSua != null)
    onClose()
  }

  return (
    <Modal
      visible
      footer={null}
      title={null}
      closable={false}
      maskClosable={false}
      escToExit={false}
      autoFocus={false}
      className="cap0"
      style={{
        width: 480,
        maxWidth: "calc(100vw - 32px)",
        background: "var(--bg2)",
        border: "1px solid var(--bd)",
        borderRadius: 16,
      }}
    >
      <div className="cap0-debrief-tag">{`KẾT SỔ LỆNH · #${n} · THỰC CHIẾN`}</div>

      <div
        className={cn(
          "cap0-display cap0-debrief-pnl tabular-nums",
          pnlPositive ? "text-up" : "text-down",
        )}
      >
        {fmtPct(displayPct)}
      </div>

      <div className="cap0-debrief-sub">
        {`${fmtVndSigned(pnlVnd)} · MUA ${quantity} ${symbol} → BÁN · Giữ ${soPhienGiu} phiên`}
      </div>

      <table className="cap0-debrief-table" data-testid="cap5-ketso-doichieu">
        <thead>
          <tr>
            <th></th>
            <th>Kế hoạch</th>
            <th>Thực tế</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Lý do</td>
            <td>{lyDoLabel(lyDo)}</td>
            <td>—</td>
          </tr>
          <tr>
            <td>Trạng thái lớp lúc đặt</td>
            <td>{TRANG_THAI_LABEL[trangThaiLucDat]}</td>
            <td>—</td>
          </tr>
          <tr>
            <td>Vùng mua</td>
            <td>{fmtVnd(vungMua)}</td>
            <td>{fmtVnd(entryPrice)}</td>
          </tr>
          <tr>
            <td>Giá ra · thuế bán 0,1%</td>
            <td>—</td>
            <td>
              {fmtVnd(exitPrice)} · <span className="text-down">{fmtVnd(tax)}</span>
            </td>
          </tr>
          <tr>
            <td>Thời gian giữ lệnh</td>
            <td>—</td>
            <td>{`${soPhienGiu} phiên · ${soNgayLich} ngày`}</td>
          </tr>
        </tbody>
      </table>

      {/* ── CAM KẾT vs THỰC TẾ (giữ nguyên Cấp 2) ─────────────────────────── */}
      <div className="cap2-ketso-camket" data-testid="cap2-ketso-camket">
        <div className="cap2-ketso-camket-title">CAM KẾT vs THỰC TẾ</div>
        <table className="cap0-debrief-table">
          <thead>
            <tr>
              <th></th>
              <th>Cam kết</th>
              <th>Thực tế</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Phương pháp</td>
              <td colSpan={2}>{METHOD_LABEL[phuongPhapSlTp]}</td>
            </tr>
            <tr>
              <td>Cắt lỗ</td>
              <td>{fmtVnd(catLo)}</td>
              <td>{slThucTe}</td>
            </tr>
            <tr>
              <td>Chốt lời</td>
              <td>{fmtVnd(chotLoi)}</td>
              <td>{tpThucTe}</td>
            </tr>
          </tbody>
        </table>

        <div
          className={cn("cap2-ketso-chuoi-impact", viPham && "cap2-ketso-chuoi-impact--broken")}
        >
          {chuoiImpactText}
        </div>
      </div>

      {/* ── QUẢN LÝ VỐN (giữ nguyên Cấp 3) ────────────────────────────────── */}
      <div className="cap3-ketso-quanlyvon" data-testid="cap3-ketso-quanlyvon">
        <div className="cap3-ketso-quanlyvon-head">
          <span className="cap3-ketso-quanlyvon-title">QUẢN LÝ VỐN</span>
          <span className="cap3-ketso-badge">giữ từ Cấp 3</span>
        </div>
        <table className="cap0-debrief-table">
          <tbody>
            <tr>
              <td>Khẩu vị rủi ro</td>
              <td colSpan={2}>{`${KHAU_VI_LABEL[khauVi]} (trần ${KHAU_VI_PCT[khauVi]}%)`}</td>
            </tr>
            <tr className="cap3-ketso-tutin-row">
              <td>Mức tự tin</td>
              <td colSpan={2}>{MUC_TU_TIN_LABEL[mucTuTin]}</td>
            </tr>
            <tr>
              <td>Cách tính KL</td>
              <td colSpan={2}>{CACH_KHOI_LUONG_LABEL[cachKhoiLuong]}</td>
            </tr>
            <tr>
              <td>Khối lượng</td>
              <td colSpan={2}>
                {`${fmtVnd(khoiLuong)} cp · ${pctVon.toFixed(1)}% vốn (${fmtVnd(tienThucTe)} ₫)`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── ĐỌC 5 LỚP — NHÌN LẠI (giữ nguyên Cấp 4) ───────────────────────── */}
      <div className="cap4-ketso-doc5lop" data-testid="cap4-ketso-doc5lop">
        <div className="cap4-ketso-doc5lop-head">
          <span className="cap4-ketso-doc5lop-title">ĐỌC 5 LỚP — NHÌN LẠI</span>
          <span className="cap4-ketso-badge">giữ từ Cấp 4</span>
        </div>
        <table className="cap0-debrief-table">
          <thead>
            <tr>
              <th>Lớp</th>
              <th>Bạn đọc</th>
              <th>AI đánh giá</th>
            </tr>
          </thead>
          <tbody>
            {LOP_KEYS.map((lop) => {
              const banMuc = doc5Lop[lop] ?? null
              const aiMuc = ai5Lop?.[lop] ?? null
              const diff = lopKhacAi.has(lop)
              return (
                <tr
                  key={lop}
                  className={cn(diff && "cap4-ketso-lr-row--diff")}
                  data-testid={`cap4-ketso-lr-${lop}`}
                  data-diff={diff ? "true" : "false"}
                >
                  <td>{lopLabelCap4(lop)}</td>
                  <td
                    className={cn(banMuc && `cap4-ketso-muc--${banMuc}`)}
                    data-testid={`cap4-ketso-lr-${lop}-ban`}
                  >
                    {banMuc ? NHAN_DINH_LABEL[banMuc] : "—"}
                  </td>
                  <td
                    className={cn(aiMuc && `cap4-ketso-muc--${aiMuc}`)}
                    data-testid={`cap4-ketso-lr-${lop}-ai`}
                  >
                    {aiMuc ? NHAN_DINH_LABEL[aiMuc] : "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {/* §C12c — mọi con số kèm nguồn gốc; và nói THẲNG khi chưa có đối chiếu. */}
        <p className="cap4-ketso-doc5lop-sum" data-testid="cap4-ketso-doc5lop-sum">
          {ai5Lop
            ? `Đồng thuận: ${soDongThuan}/5 lớp AI đánh giá Ủng hộ · Bạn đọc khác AI ở ${soKhacAi}/5 lớp · cùng góc nhìn ở ${soCungGocNhin}/5 lớp. Hàng nền tím là lớp bạn đọc khác AI — góc nhìn khác cần kiểm chứng bằng kết quả, không phải lỗi.`
            : "Lệnh này chưa có đối chiếu AI — AI chỉ lộ khi bạn chấm đủ 5 lớp lúc đặt lệnh."}
        </p>
      </div>

      {coChuyen && (
        <div className="cap1-ketso-emotion">
          <div className="cap0-debrief-coach-tag">💭 TRƯỚC KHI BẤM BÁN, BẠN THẤY THẾ NÀO?</div>
          <div className="cap1-ketso-emotion-row">
            {CAM_XUC_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "cap1-ketso-emotion-btn",
                  emotion === opt.value && "cap1-ketso-emotion-btn--on",
                )}
                aria-pressed={emotion === opt.value}
                onClick={() => setEmotion(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── PHÂN LOẠI 4 Ô (giữ nguyên Cấp 5, spec §4 của cấp đó) — DƯỚI mọi khối
          kế thừa, TRÊN chồng coach; `key` để mỗi lệnh mới bắt đầu lại từ "chưa
          chốt" thay vì kế thừa lựa chọn của lệnh trước. */}
      <PhanLoai4O key={orderId} orderId={orderId} onSettled={handleSettled} />

      {/* ── ĐỐI CHIẾU — NHÌN LẠI (Cấp 6 THÊM MỚI, spec §6) ─────────────────────
          Đặt ngay dưới khối mới của Cấp 5 (tức dưới mọi khối kế thừa, trên chồng
          coach) — đúng quy tắc vị trí Cấp 5 đã ghi cho khối mới của nó, và vẫn
          đứng TRƯỚC đoạn coach Cấp 6 như spec §6 mô tả.

          ★ Chỉ render khi lệnh THỰC SỰ có dữ liệu Cấp 6. Lệnh không mâu thuẫn (hoặc
          mở trước khi Cấp 6 ship) có cả 6 cột null → bỏ khối, im lặng, KHÔNG dựng
          một khối rỗng để user phải đoán. */}
      {doiChieu && (
        <div className="cap6-ketso-doichieu" data-testid="cap6-ketso-doichieu">
          <div className="cap6-ketso-doichieu-head">
            <span className="cap6-ketso-doichieu-title">ĐỐI CHIẾU — NHÌN LẠI</span>
            <span className="cap6-ketso-badge">mới ở Cấp 6</span>
          </div>
          <table className="cap0-debrief-table">
            <tbody>
              <tr>
                <td>Kiểu cổ phiếu</td>
                <td colSpan={2} data-testid="cap6-ketso-kieu">
                  {doiChieu.kieu
                    ? `${KIEU_ICON[doiChieu.kieu]} ${doiChieu.kieuTen ?? ""}`.trim()
                    : "chưa phân loại"}
                </td>
              </tr>
              <tr>
                <td>Lớp Ủng hộ lúc đặt</td>
                <td colSpan={2} data-testid="cap6-ketso-ungho">
                  {lopList(ungHo)}
                </td>
              </tr>
              <tr>
                <td>Lớp Ngược chiều lúc đặt</td>
                <td colSpan={2} data-testid="cap6-ketso-nguoc">
                  {lopList(nguoc)}
                </td>
              </tr>
              <tr>
                <td>Bạn tin</td>
                <td colSpan={2} data-testid="cap6-ketso-lop-tin">
                  {doiChieu.lopQuyetDinh
                    ? lopLabelCap4(doiChieu.lopQuyetDinh)
                    : "hệ chưa ghi lại được lớp quyết định"}
                </td>
              </tr>
              {doiChieu.lopUuTien.length > 0 && (
                <tr>
                  <td>IQX gợi ý ưu tiên</td>
                  <td colSpan={2} data-testid="cap6-ketso-goi-y">
                    {lopList(doiChieu.lopUuTien)}
                  </td>
                </tr>
              )}
              <tr>
                <td>Đối chiếu</td>
                {/* ★ Không class trạng thái nào ở đây là màu cảnh báo: khớp và
                    khác gợi ý được trình bày ngang nhau (spec §5/§10). */}
                <td
                  colSpan={2}
                  className={`cap6-ketso-khop cap6-ketso-khop--${
                    doiChieu.khopGoiY === true
                      ? "khop"
                      : doiChieu.khopGoiY === false
                        ? "khac"
                        : "chua"
                  }`}
                  data-testid="cap6-ketso-khop"
                >
                  {khopText(doiChieu.khopGoiY)}
                </td>
              </tr>
              <tr>
                <td>Kết quả</td>
                <td colSpan={2} data-testid="cap6-ketso-ketqua">
                  <span className={pnlPositive ? "text-up" : "text-down"}>{fmtPct(pnlPct)}</span>
                </td>
              </tr>
            </tbody>
          </table>
          {doiChieu.nganh && (
            <p className="cap6-ketso-nganh" data-testid="cap6-ketso-nganh">
              {`(Kiểu suy ra từ ngành của mã: ${doiChieu.nganh})`}
            </p>
          )}
          {doiChieu.lyDo && (
            <p className="cap6-ketso-lydo" data-testid="cap6-ketso-lydo">
              {`Vì sao bạn tin lớp đó (ghi lúc đặt): «${doiChieu.lyDo}»`}
            </p>
          )}
        </div>
      )}

      {/* Lớp coach 1 — Cấp 1 (lưới lý do × kết quả), giữ nguyên. */}
      <div className="cap0-debrief-coach">
        <div className="cap0-debrief-coach-tag">NHÌN LẠI</div>
        <p className="cap0-debrief-coach-body">{coach.cap1Text}</p>
      </div>

      {/* Lớp coach 2 — Cấp 2 (kỷ luật cắt lỗ/chốt lời), giữ nguyên. */}
      <div className="cap2-ketso-coach">
        <div className="cap2-ketso-coach-tag">KỶ LUẬT</div>
        <p className="cap2-ketso-coach-body">{coach.cap2.text}</p>
      </div>

      {/* Lớp coach 3 — Cấp 3 (tự tin vs kết quả), giữ nguyên. */}
      <div className="cap3-ketso-coach" data-testid="cap3-ketso-coach">
        <div className="cap3-ketso-coach-tag">TỰ TIN VS KẾT QUẢ</div>
        <p className="cap3-ketso-coach-body">{coach.cap3.text}</p>
      </div>

      {/* Lớp coach 4 — Cấp 4 (góc nhìn khác AI), giữ nguyên. */}
      <div className="cap4-ketso-coach" data-testid="cap4-ketso-coach">
        <div className="cap4-ketso-coach-tag">NHÌN LẠI · GÓC NHÌN KHÁC AI</div>
        <p className="cap4-ketso-coach-body">{coach.cap4.text}</p>
      </div>

      {/* Lớp coach 5 — Cấp 5 (quyết định vs kết quả), giữ nguyên: chỉ hiện KHI đã
          chốt verdict. Ô Sai-Thắng mang style cảnh báo của Cấp 5. */}
      {coach.cap5 && (
        <div
          className={cn("cap5-ketso-coach", coach.cap5.canhBao && "cap5-coach--canhbao")}
          data-testid="cap5-ketso-coach"
        >
          <div className="cap5-ketso-coach-tag">
            {`QUYẾT ĐỊNH VS KẾT QUẢ · ${O4_LABEL[coach.cap5.id]}`}
          </div>
          <p className="cap5-ketso-coach-body">
            {splitEmphasis(coach.cap5.text, coach.cap5.nhanManh).map((part, i) =>
              part.strong ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>,
            )}
          </p>
        </div>
      )}

      {/* Lớp coach 6 — Cấp 6 (đối chiếu vs kết quả), THÊM MỚI. KHÔNG có ô nào là
          cảnh báo: cả 4 ô đều trung tính (spec §5/§10), nên khối này không có biến
          thể `--canhbao` như Cấp 5. Vắng mặt khi lệnh không có đối chiếu HOẶC kiểu
          chưa phân loại (không có gợi ý nào để so). */}
      {coach.cap6 && (
        <div className="cap6-ketso-coach" data-testid="cap6-ketso-coach">
          <div className="cap6-ketso-coach-tag">
            {`ĐỐI CHIẾU VS KẾT QUẢ · ${COACH_CAP6_LABEL[coach.cap6.id]}`}
          </div>
          <p className="cap6-ketso-coach-body">
            {splitEmphasis(coach.cap6.text, coach.cap6.nhanManh).map((part, i) =>
              part.strong ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>,
            )}
          </p>
        </div>
      )}

      <div className="cap1-ketso-profile" data-testid="cap5-ketso-profile">
        <div className="cap0-debrief-coach-tag">📊 HỒ SƠ CỦA BẠN SAU LỆNH NÀY</div>
        <ul className="cap1-ketso-profile-list">
          <li>{line1}</li>
          <li>{line2}</li>
          <li>{line3}</li>
        </ul>
      </div>

      {/* CỔNG (kế thừa Cấp 5 §4): khoá tới khi verdict được chốt. Nhắc lý do ngay
          tại nút để user không phải đoán vì sao nó mờ. */}
      <button
        type="button"
        className="cap0-debrief-close"
        disabled={!verdictUser || closing}
        onClick={handleClose}
        data-testid="cap6-ketso-close"
      >
        Đóng kết sổ ✓
      </button>
      {!verdictUser && !escapeVisible && (
        <p className="cap5-ketso-gate-note" data-testid="cap6-ketso-gate-note">
          Chốt phân loại 4 ô ở trên mới đóng được kết sổ — đó là bước biến lệnh này
          thành dữ liệu «tỷ lệ quyết định đúng» của bạn.
        </p>
      )}

      {/* Lối ra khi hệ KHÔNG lấy được verdict — xem `handleEscape`. */}
      {escapeVisible && (
        <>
          <button
            type="button"
            className="cap5-ketso-escape"
            onClick={handleEscape}
            disabled={closing}
            data-testid="cap6-ketso-escape"
          >
            Đóng kết sổ — chưa phân loại được
          </button>
          <p className="cap5-ketso-escape-note" data-testid="cap6-ketso-escape-note">
            Hệ chưa lấy được verdict của lệnh này nên lệnh sẽ vào nhật ký mà{" "}
            <strong>chưa được phân loại 4 ô</strong> — nó không tính vào «tỷ lệ quyết định đúng».
            Khối Đối chiếu ở trên vẫn được ghi. Bạn không bị kẹt ở đây: đóng lại và thử ở lệnh sau.
          </p>
        </>
      )}
    </Modal>
  )
}
