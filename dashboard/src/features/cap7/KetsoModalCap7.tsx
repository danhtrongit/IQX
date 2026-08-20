import { useEffect, useState } from "react"
import { Modal } from "@arco-design/web-react"
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
import type { PhuongPhapSlTp } from "@/features/cap2/types"
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
import { splitEmphasis } from "@/features/cap5/coachTemplateCap5"
import { useCap6Events } from "@/features/cap6/Cap6Context"
import { COACH_CAP6_LABEL, type CoachSituationCap6 } from "@/features/cap6/coachTemplateCap6"
import { lopNguocChieu, lopUngHo } from "@/features/cap6/doiChieu"
import { useCompleteCap6Task, useKehoachCap6 } from "@/features/cap6/hooks"
import { mergeDoiChieuCap6, type KetsoDataCap6 } from "@/features/cap6/KetsoModalCap6"
import { KIEU_ICON, type Lop } from "@/features/cap6/types"
import { useCap7Events } from "./Cap7Context"
import {
  composeCoachCap7,
  COACH_CAP7_LABEL,
  COACH_CO_CAP7_LABEL,
  type CoachSituationCap7,
} from "./coachTemplateCap7"
import { useCompleteCap7Task, useKehoachCap7 } from "./hooks"
import { useCap7TradeLog, type Cap7TradeRecord } from "./tradeLogCap7"
import {
  HANH_VI_CO_LABEL,
  LUC_DOC_OPTIONS,
  type BandLuc,
  type HanhViCo,
  type KehoachDetailCap7,
  type LucDocUser,
} from "./types"
// Kết sổ Cấp 7 = Kết sổ Cấp 6's content (đối chiếu Cấp 1 + CAM KẾT vs THỰC TẾ Cấp
// 2 + Quản lý vốn Cấp 3 + Đọc 5 lớp Cấp 4 + khối cảm xúc + PHÂN LOẠI 4 Ô Cấp 5 +
// Đối chiếu Cấp 6 + 6 lớp coach + HỒ SƠ + count-up) — CỘNG khối "Đọc sổ lệnh —
// nhìn lại" và lớp coach "ĐỌC LỰC VS DIỄN BIẾN". Dùng lại đúng bộ CSS shell Cấp
// 0-6 đã dựng, chỉ thêm `cap7-ketso.css`.
import "@/features/cap0/cap0.css"
import "@/features/cap1/cap1.css"
import "@/features/cap2/cap2-ketso.css"
import "@/features/cap3/cap3-ketso.css"
import "@/features/cap4/cap4-ketso.css"
import "@/features/cap6/cap6-ketso.css"
import "./cap7-ketso.css"

/**
 * Màn Kết sổ Cấp 7 (spec `IQX-Cap7-Spec.md` §6).
 *
 * DESIGN DECISION — **mirror, KHÔNG compose `KetsoModalCap6` làm con**, đúng tiền
 * lệ Cấp 6 → 5 → 4 → 3 → 2 đã ghi: `KetsoModalCap6` render một `<Modal>` TRỌN GÓI
 * (không export mảnh nào, không có slot), nút đóng của nó tự `mutate` + tự ghi
 * nhật ký Cấp 6 rồi gọi `onClose`, và nó SỞ HỮU cổng `Đóng kết sổ ✓`. Bọc nó làm
 * con sẽ (1) lồng 2 `<Modal>`, (2) không đặt được khối "Đọc sổ lệnh — nhìn lại"
 * vào giữa thân modal, (3) ghi một bản ghi Cấp 6 cho lệnh Cấp 7 — sai cấp.
 *
 * PHẦN LOGIC THÌ TÁI SỬ DỤNG THẬT (không mirror):
 *  - Coach: `composeCoachCap7` → `composeCoachCap6` → Cấp 5 → 4 → 3 → 2 → 1. Mọi
 *    đoạn text đều do module cấp dưới sinh ra, Cấp 7 chỉ thêm đoạn 7.
 *  - Hai phía của mâu thuẫn: `lopUngHo`/`lopNguocChieu` của Cấp 6 chấm trên CHÍNH
 *    `doc5Lop` của lệnh.
 *  - Helper thuần của Cấp 1/4 + `splitEmphasis` của Cấp 5.
 *
 * ★★ **CỔNG PHÂN LOẠI 4 Ô CỦA CẤP 5 ĐÃ NGHỈ HƯU CÙNG CẤP 5 CŨ** (`PhanLoai4O` /
 * `GET /cap5/verdict` / `POST /cap5/ketso` / `deriveO4` / `O4_LABEL` không còn
 * tồn tại). Modal này vì thế gỡ: cổng "phải chốt verdict mới đóng được", ghi chú
 * cổng, LỐI RA "chưa phân loại được" (nó chỉ tồn tại để cứu user khỏi cổng đó),
 * lớp coach "QUYẾT ĐỊNH VS KẾT QUẢ", và 3 trường `o4`/`verdictHe`/`verdictUser`
 * của bản ghi. `Đóng kết sổ ✓` giờ mở ngay — Cấp 7 vốn là SOFT, không cổng cứng.
 *
 * ★ **ĐOẠN COACH SĂN MÃ CỦA CẤP 5 MỚI CHƯA CÓ Ở ĐÂY** (`cap5Situation` = `null`):
 * nó cần `huntFilter`/`huntSoPhienCho`/`huntSoLopLucVao` của chính lệnh, mà trang
 * Cấp 7 không đi qua màn Săn mã. Một `huntFilter: null` cứng KHÔNG phải "chưa
 * biết" — `coachTemplateCap5` đọc nó thành câu khẳng định "mã này KHÔNG đến từ
 * săn mã". Thà VẮNG đoạn coach còn hơn có một đoạn nói sai.
 *
 * ★★ **`docLucDung === null` KHÔNG PHẢI MỘT PHÁN QUYẾT** — nó là *chưa tới hạn
 * chấm* (hoặc chưa lấy được giá phiên đích). Dòng diễn biến nói đúng thế và
 * TUYỆT ĐỐI không hiện ĐÚNG/CHƯA ĐÚNG; `pickCoachCap7` cũng tự trả `null` nên
 * không có đoạn coach nào đoán hộ.
 *
 * ★★ **KHÔNG BAO GIỜ tuyên bố một lệnh treo là "lệnh giả"** (spec §9 loại việc
 * phát hiện lệnh giả ra khỏi phạm vi). Dòng cờ chỉ nói: có một mức treo lớn bất
 * thường, bạn đã chờ xác nhận hay mua đuổi. Mua đuổi được ghi lại TRUNG TÍNH —
 * spec §5 "không phạt cứng".
 */

/**
 * Khối Đọc sổ lệnh của MỘT lệnh, để Kết sổ nhìn lại (spec §6).
 *
 * Mọi trường tới từ các cột Cấp 7 của `order_kehoach` (bản authoritative mà
 * `POST /cap7/kehoach` trả về, hoặc `GET /cap7/cham` sau khi chấm) — **không
 * trường nào được suy đoán ở đây**. Thiếu trường nào thì khối NÓI THẲNG là hệ
 * chưa ghi lại được, chứ không đắp một con số hợp lý.
 */
export interface DocLucKetsoCap7 {
  /** `luc_chi_so` — tổng dư MUA / tổng dư BÁN lúc mua. `null` = hệ chưa ghi được. */
  lucChiSo: number | null
  lucBand: BandLuc | null
  /** `luc_band_ten` của server — hiện nguyên văn. */
  lucBandTen: string | null
  /** `luc_doc_user` — chính user đọc; hệ không bao giờ điền hộ. */
  lucDocUser: LucDocUser | null
  lucDocUserTen: string | null
  /** ★ `null` = CHƯA TỚI HẠN CHẤM, KHÔNG phải "đọc sai". */
  docLucDung: boolean | null
  /** % giá đóng cửa phiên đích so với giá khớp. */
  dienBienPct: number | null
  /** Số phiên "ngay sau" hệ dùng để chấm (`so_phien_cham`). */
  soPhienCham: number
  /** ±% coi như đứng yên (`quy_tac.dead_band_pct`) — cho câu coach nói đúng sự thật. */
  deadBandPct: number | null
  /** Cờ cảnh giác CÓ hiện lúc đặt lệnh hay không. */
  coCanhGiac: boolean
  /** ★ `mua_duoi_theo` là một sự thật TRUNG TÍNH, không phải điểm trừ. */
  hanhViCo: HanhViCo | null
  hanhViCoTen: string | null
  /** Giá của mức bị gắn cờ. `null` → câu copy bỏ hẳn cụm "ở {giá}". */
  giaCo: number | null
  /** §C12c — 1 câu của server, hiện NGUYÊN VĂN. */
  giaiThich: string | null
  /**
   * ★ `da_toi_han_cham` — CHỈ có ý nghĩa khi `docLucDung == null`, và nó tách
   * hai ca hoàn toàn khác nhau: `false`/vắng mặt = *chưa tới hạn chấm*; `true` =
   * *đã tới hạn nhưng hệ chưa lấy được giá phiên đích*. Cả hai đều KHÔNG phải
   * phán quyết. FE không tự tính được (cần lịch phiên + đồng hồ server), nên
   * vắng mặt nghĩa là "không biết" → giữ câu "chưa tới hạn chấm" như trước.
   */
  daToiHanCham?: boolean | null
}

/**
 * Khối Đọc sổ lệnh để RENDER = khối server đã ghi (và đã chấm) cho lệnh, nếu
 * đọc được; nếu không thì đúng khối cũ dựng từ dữ liệu lúc MUA.
 *
 * ★ Vì sao phải hỏi server: `docLucDung`/`dienBienPct` được chấm bằng giá đóng
 * cửa THẬT `so_phien_cham` phiên SAU khi mua — muộn hơn hẳn mọi thứ FE có lúc
 * đặt lệnh. Không đọc lại thì khối này mãi mãi nói "chưa tới hạn chấm" và đoạn
 * coach Cấp 7 KHÔNG BAO GIỜ hiện được.
 *
 * ★ FAIL-CLOSED: `detail` `undefined` (đang tải), 404 (chưa ở Cấp 7 / lệnh không
 * phải của user) hay lỗi mạng → trả lại `local` y nguyên, tức hành vi cũ. Modal
 * `closable={false}` nên một exception ở đây sẽ nhốt user.
 *
 * ★ `doc_luc_dung` đi THẲNG vào `docLucDung` — không `?? false`, không
 * `Boolean(...)`: `null` là "chưa chấm", `false` là "đọc sai"; gộp hai thứ đó
 * là nói với user rằng họ sai trong khi chưa có gì được chấm.
 *
 * `giaCo` lấy từ `local`: backend KHÔNG lưu mức nào của sổ đã kích cờ, nên đó là
 * nguồn duy nhất có thể có (thực tế luôn `null` — copy tự bỏ cụm "ở {giá}").
 */
export function mergeDocLucCap7(
  local: DocLucKetsoCap7 | null,
  detail: KehoachDetailCap7 | null | undefined,
): DocLucKetsoCap7 | null {
  if (!detail || !detail.co_du_lieu) return local
  return {
    lucChiSo: detail.luc_chi_so,
    lucBand: detail.luc_band,
    lucBandTen: detail.luc_band_ten,
    lucDocUser: detail.luc_doc_user,
    lucDocUserTen: detail.luc_doc_user_ten,
    docLucDung: detail.doc_luc_dung,
    dienBienPct: detail.dien_bien_pct,
    soPhienCham: detail.so_phien_cham,
    deadBandPct: detail.dead_band_pct,
    coCanhGiac: Boolean(detail.co_canh_giac_lenh_gia),
    hanhViCo: detail.hanh_vi_co,
    hanhViCoTen: detail.hanh_vi_co_ten,
    giaCo: local?.giaCo ?? null,
    giaiThich: detail.giai_thich,
    daToiHanCham: detail.da_toi_han_cham,
  }
}

/**
 * Dòng "Diễn biến ngay sau" — BA trạng thái, và trạng thái thứ ba lại tách làm
 * hai câu khác nhau. KHÔNG câu nào trong hai câu `null` là một phán quyết.
 */
function dienBienText(docLuc: DocLucKetsoCap7): string {
  if (docLuc.docLucDung == null) {
    if (docLuc.daToiHanCham === true) {
      return (
        `đã tới mốc ${docLuc.soPhienCham} phiên sau khi mua, nhưng hệ chưa lấy ` +
        "được giá đóng cửa của phiên đó nên chưa chấm được (và nó không bị tính " +
        "là đọc sai)"
      )
    }
    return (
      `chưa tới hạn chấm — hệ chấm bằng giá đóng cửa ${docLuc.soPhienCham} phiên ` +
      "sau khi mua, lệnh này chưa tới mốc đó nên chưa có kết quả (và nó không bị " +
      "tính là đọc sai)"
    )
  }
  const pct = docLuc.dienBienPct != null ? `: ${fmtPct(docLuc.dienBienPct)}` : ""
  return `${docLuc.soPhienCham} phiên${pct} → đọc lực ${
    docLuc.docLucDung ? "ĐÚNG ✓" : "CHƯA ĐÚNG"
  }`
}

/**
 * Cấp 7 thêm ĐÚNG một trường vào dữ liệu Kết sổ: khối Đọc sổ lệnh của lệnh.
 * `null` = lệnh không ghi bước đọc lực (mua ngoài giờ, sổ quá mỏng, hoặc lệnh mở
 * trước khi Cấp 7 ship) → khối bị bỏ hẳn, im lặng.
 */
export interface KetsoDataCap7 extends KetsoDataCap6 {
  docLuc: DocLucKetsoCap7 | null
}

export interface KetsoModalCap7Props {
  /** `null` → modal đóng/không mount. */
  data: KetsoDataCap7 | null
  /** Hồ sơ Cấp 1 — cho 3 dòng "HỒ SƠ CỦA BẠN" (giữ nguyên). */
  progress: Cap1Progress | null
  /** Nhật ký lệnh đã đóng (Cấp 1) — cho dòng thống kê theo lý do (giữ nguyên). */
  trades: Cap1TradeRecord[]
  onClose: () => void
  /**
   * Gọi 1 lần với bản ghi Cấp 7 của lệnh này. Modal ĐÃ tự ghi vào nhật ký Cấp 7
   * (`useCap7TradeLog`); callback này để caller ghi thêm vào nhật ký Cấp 1-6 (bản
   * ghi Cấp 7 là siêu tập của cả sáu nên truyền thẳng được).
   */
  onRecorded?: (record: Cap7TradeRecord) => void
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

/** `+5.3%` / `−4.2%` / `0.0%` — dấu trừ typographic "−" (U+2212), như Cấp 0-6. */
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

/** "Thực tế" của hàng cắt lỗ trong CAM KẾT vs THỰC TẾ (giữ nguyên Cấp 2-6). */
function describeSlThucTe(
  flags: KetsoDataCap7["flags"],
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

/** "Thực tế" của hàng chốt lời trong CAM KẾT vs THỰC TẾ (giữ nguyên Cấp 2-6). */
function describeTpThucTe(
  flags: KetsoDataCap7["flags"],
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

/** Dòng "khớp gợi ý hay khác gợi ý" của Cấp 6 — TRUNG TÍNH ở cả 3 trạng thái. */
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

/** `Cầu áp đảo (1.9:1)` — hoặc câu nói thẳng khi hệ chưa ghi được chỉ số. */
function lucText(docLuc: DocLucKetsoCap7): string {
  const chiSo = docLuc.lucChiSo
  if (chiSo == null || !Number.isFinite(chiSo) || chiSo <= 0) {
    return "hệ chưa ghi lại được chỉ số Lực của lệnh này"
  }
  const ten = docLuc.lucBandTen
  const ratio = `${chiSo.toFixed(1)}:1`
  return ten ? `${ten} (${ratio})` : ratio
}

/** Cách user tự đọc — nhãn server trước, nhãn picker sau, không bao giờ bịa. */
function docText(docLuc: DocLucKetsoCap7): string {
  if (docLuc.lucDocUserTen) return `"${docLuc.lucDocUserTen}"`
  const opt = LUC_DOC_OPTIONS.find((o) => o.value === docLuc.lucDocUser)
  return opt ? `"${opt.label}"` : "hệ chưa ghi lại được cách bạn đọc"
}

const TARGET_ORDERS = 10
const MIN_TRADES_FOR_STAT = 2
const COUNT_UP_MS = 1000
const COUNT_UP_STEP_MS = 40

export function KetsoModalCap7({
  data,
  progress,
  trades,
  onClose,
  onRecorded,
}: KetsoModalCap7Props) {
  const { isCap6Active } = useCap6Events()
  const { isCap7Active } = useCap7Events()
  const recordKetsoCap1 = useRecordKetso()
  const recordKetsoCap2 = useRecordKetsoCap2()
  const completeCap6Task = useCompleteCap6Task()
  const completeCap7Task = useCompleteCap7Task()
  const { record: recordCap7Trade } = useCap7TradeLog()
  const [emotion, setEmotion] = useState<CamXuc | null>(null)
  const [displayPct, setDisplayPct] = useState(0)
  const [closing, setClosing] = useState(false)

  /**
   * Hai endpoint đọc-lại-theo-lệnh: `GET /cap7/kehoach/{order_id}` (khối đọc lực
   * + KẾT QUẢ CHẤM — thứ FE không thể tự có) và `GET /cap6/kehoach/{order_id}`
   * (khối Đối chiếu đã ghi).
   *
   * ★ Mỗi cái chỉ được gọi khi user thật sự đang ở cấp đó — cả hai 404 khi thiếu
   * hàng tiến độ của cấp. Lỗi KHÔNG bao giờ nổi lên UI: hai hàm `merge*` trả lại
   * khối cũ, đúng hành vi trước khi có hai endpoint này.
   */
  const kehoachCap7Query = useKehoachCap7(data?.orderId ?? null, isCap7Active)
  const kehoachCap6Query = useKehoachCap6(data?.orderId ?? null, isCap6Active)

  const entryPrice = data?.entryPrice ?? 0
  const exitPrice = data?.exitPrice ?? 0
  const quantity = data?.quantity ?? 0
  const pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0
  const pnlVnd = (exitPrice - entryPrice) * quantity

  // Reset + count-up ~1s mỗi khi MỘT kết sổ mới mở (giữ nguyên Cấp 1-6).
  useEffect(() => {
    if (!data) {
      setDisplayPct(0)
      return
    }
    setEmotion(null)
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
    doiChieu: doiChieuLocal,
    docLuc: docLucLocal,
  } = data
  // Hàng đã lưu (và đã chấm) của server thắng khối dựng lúc mua — xem
  // `mergeDocLucCap7` / `mergeDoiChieuCap6`. Query lỗi/chưa về → nguyên khối cũ.
  const doiChieu = mergeDoiChieuCap6(doiChieuLocal, kehoachCap6Query.data)
  const docLuc = mergeDocLucCap7(docLucLocal, kehoachCap7Query.data)
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
  const cap6Situation: CoachSituationCap6 | null = doiChieu
    ? {
        khopGoiY: doiChieu.khopGoiY,
        pnlPct,
        lopQuyetDinh: doiChieu.lopQuyetDinh,
        kieuTen: doiChieu.kieuTen,
        lopUuTien: doiChieu.lopUuTien,
      }
    : null
  // Lớp coach 7 chỉ tồn tại khi lệnh CÓ đọc lực; `pickCoachCap7` tự trả `null`
  // khi lệnh chưa tới hạn chấm (`docLucDung == null`) — không đoán ô nào.
  const cap7Situation: CoachSituationCap7 | null = docLuc
    ? {
        docLucDung: docLuc.docLucDung,
        lucDocUser: docLuc.lucDocUser,
        lucDocUserTen: docLuc.lucDocUserTen,
        dienBienPct: docLuc.dienBienPct,
        soPhienCham: docLuc.soPhienCham,
        deadBandPct: docLuc.deadBandPct,
        coCanhGiac: docLuc.coCanhGiac,
        hanhViCo: docLuc.hanhViCo,
        giaCo: docLuc.giaCo,
      }
    : null
  const coach = composeCoachCap7(
    cap1Situation,
    cap1Params,
    cap2Situation,
    cap3Situation,
    cap4Situation,
    // Cấp 5 mới = SĂN MÃ, và trang Cấp 7 không có nguồn `huntFilter` của lệnh →
    // KHÔNG có đoạn coach Cấp 5. Xem doc đầu file.
    null,
    cap6Situation,
    cap7Situation,
  )

  const slThucTe = describeSlThucTe(flags, exitPrice, catLo)
  const tpThucTe = describeTpThucTe(flags, exitPrice, chotLoi)

  // ── Khối Quản lý vốn (Cấp 3 §7, giữ nguyên) ────────────────────────────
  const tienThucTe = khoiLuong * entryPrice

  // ── Bảng "Đọc 5 lớp — nhìn lại" (Cấp 4 §6, giữ nguyên) ─────────────────
  const lopKhacAi = new Set(lopKhacAiCap4(doc5Lop, ai5Lop))
  const soDongThuan = countDongThuan(ai5Lop)
  const soKhacAi = countKhacAi(doc5Lop, ai5Lop)
  const soCungGocNhin = countCungGocNhin(doc5Lop, ai5Lop)

  // ── Khối "Đối chiếu — nhìn lại" (Cấp 6 §6, giữ nguyên) ─────────────────
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
   * Bản ghi nhật ký Cấp 7 của lệnh này (siêu tập của Cấp 1-6).
   *
   * ★ Lệnh không đọc lực ghi CẢ 7 trường Cấp 7 là `null` — đặc biệt `docLucDung`
   * KHÔNG BAO GIỜ được quy về `false`: "chưa chấm" và "đọc sai" là hai chuyện
   * khác nhau, và khối ⑯⑰ dựa đúng vào sự phân biệt đó.
   */
  const buildRecord = (): Cap7TradeRecord => ({
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
    so_lop_dong_thuan: ai5Lop ? soDongThuan : null,
    so_lop_khac_ai: ai5Lop ? soKhacAi : null,
    // ★ 3 trường săn mã của Cấp 5 mới: `null` ở đây là SỰ THẬT, không phải chỗ
    // trống chờ điền — trang Cấp 7 không có màn Săn mã nên lệnh Cấp 7 thật sự
    // không đến từ bộ lọc nào (khối ⑫ đếm chúng riêng, KHÔNG gán bừa bộ lọc).
    huntFilter: null,
    huntSoPhienCho: null,
    huntSoLopLucVao: null,
    kieuCoPhieu: doiChieu?.kieu ?? null,
    lopQuyetDinh: doiChieu?.lopQuyetDinh ?? null,
    khopGoiY: doiChieu?.khopGoiY ?? null,
    lucChiSo: docLuc?.lucChiSo ?? null,
    lucBand: docLuc?.lucBand ?? null,
    lucDocUser: docLuc?.lucDocUser ?? null,
    docLucDung: docLuc?.docLucDung ?? null,
    dienBienPct: docLuc?.dienBienPct ?? null,
    coCanhGiac: docLuc?.coCanhGiac ?? null,
    hanhViCo: docLuc?.hanhViCo ?? null,
  })

  /**
   * ★ KHÔNG còn "lối ra" nào: nó chỉ tồn tại để cứu user khỏi cổng verdict
   * fail-closed của Cấp 5 cũ (modal `closable={false}` + `GET /cap5/verdict` lỗi
   * = kẹt vĩnh viễn). Cổng đã nghỉ hưu ⇒ `Đóng kết sổ ✓` luôn mở ⇒ không còn cách
   * nào kẹt, và một nút "đóng — chưa phân loại được" giờ chỉ nói về một bước user
   * không hề đi qua.
   */
  const handleClose = async () => {
    if (closing) return
    setClosing(true)

    try {
      await recordKetsoCap1.mutateAsync({ order_id: orderId, cam_xuc: emotion })
    } catch {
      // Đã kết sổ Cấp 1 trước đó — không có gì để sửa, đi tiếp.
    }
    recordKetsoCap2.mutate({ ...flags, order_id: orderId })

    // Cấp 6 và Cấp 7 KHÔNG có endpoint kết sổ riêng: nhiệm vụ của chúng được suy
    // ra server-side từ `order_kehoach` JOIN `order_ketso`. `PATCH /cap{6,7}/task`
    // là cách kích hoạt lại phép tính đó NGAY (nhiệm vụ ② "Kết sổ đầu tiên" vừa đủ
    // điều kiện) và đồng thời invalidate cache để tab Hành trình cập nhật. Cả hai
    // đều idempotent và fire-and-forget: lỗi ở đây tuyệt đối không chặn việc đóng.
    completeCap6Task.mutate(2)
    completeCap7Task.mutate(2)

    const record = buildRecord()
    recordCap7Trade(record)
    onRecorded?.(record)
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

      {/* ── ĐỐI CHIẾU — NHÌN LẠI (giữ nguyên Cấp 6) ───────────────────────── */}
      {doiChieu && (
        <div className="cap6-ketso-doichieu" data-testid="cap6-ketso-doichieu">
          <div className="cap6-ketso-doichieu-head">
            <span className="cap6-ketso-doichieu-title">ĐỐI CHIẾU — NHÌN LẠI</span>
            <span className="cap6-ketso-badge">giữ từ Cấp 6</span>
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
          {/* §C12c — câu của server cho CHÍNH lệnh này (`GET /cap6/kehoach/…`),
              hiện NGUYÊN VĂN. Vắng mặt khi khối dựng từ sự kiện lệnh. */}
          {doiChieu.giaiThich && (
            <p className="cap6-ketso-giaithich" data-testid="cap6-ketso-giaithich">
              {doiChieu.giaiThich}
            </p>
          )}
        </div>
      )}

      {/* ── ĐỌC SỔ LỆNH — NHÌN LẠI (Cấp 7 THÊM MỚI, spec §6) ───────────────────
          Đặt dưới mọi khối kế thừa, TRÊN chồng coach — đúng quy tắc vị trí mà Cấp
          5/6 đã lập cho khối mới của chúng.

          ★ Chỉ render khi lệnh THỰC SỰ có bước đọc lực. Lệnh mua ngoài giờ, sổ quá
          mỏng, hay lệnh mở trước khi Cấp 7 ship đều có `docLuc == null` → bỏ hẳn
          khối, im lặng, KHÔNG dựng một khối rỗng để user phải đoán. */}
      {docLuc && (
        <div className="cap7-ketso-docluc" data-testid="cap7-ketso-docluc">
          <div className="cap7-ketso-docluc-head">
            <span className="cap7-ketso-docluc-title">ĐỌC SỔ LỆNH — NHÌN LẠI</span>
            <span className="cap7-ketso-badge">mới ở Cấp 7</span>
          </div>
          <table className="cap0-debrief-table">
            <tbody>
              <tr>
                <td>Lúc mua</td>
                <td colSpan={2} data-testid="cap7-ketso-luc">
                  {`Lực = ${lucText(docLuc)} · Bạn đọc: ${docText(docLuc)}`}
                </td>
              </tr>
              <tr>
                <td>Diễn biến ngay sau</td>
                {/* ★ 3 trạng thái, và trạng thái thứ 3 KHÔNG phải một phán quyết. */}
                <td
                  colSpan={2}
                  className={`cap7-ketso-cham cap7-ketso-cham--${
                    docLuc.docLucDung === true
                      ? "dung"
                      : docLuc.docLucDung === false
                        ? "chua"
                        : "chuacham"
                  }`}
                  data-testid="cap7-ketso-dienbien"
                >
                  {dienBienText(docLuc)}
                </td>
              </tr>
              {/* Dòng cờ — chỉ khi cờ THỰC SỰ hiện lúc đặt lệnh. */}
              {docLuc.coCanhGiac && (
                <tr>
                  <td>Cờ cảnh giác</td>
                  <td colSpan={2} data-testid="cap7-ketso-co">
                    {`Có cờ lệnh treo lớn${
                      docLuc.giaCo != null && Number.isFinite(docLuc.giaCo)
                        ? ` ở ${fmtVnd(docLuc.giaCo)}`
                        : ""
                    } — bạn: ${
                      docLuc.hanhViCo
                        ? (docLuc.hanhViCoTen ?? HANH_VI_CO_LABEL[docLuc.hanhViCo]).toLowerCase()
                        : "hệ chưa ghi lại được bạn đã làm gì"
                    }`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {/* ★ Câu này là bắt buộc: cờ là HEURISTIC. IQX không biết một lệnh treo
              là thật hay không và không bao giờ được viết như thể nó biết. */}
          {docLuc.coCanhGiac && (
            <p className="cap7-ketso-co-note" data-testid="cap7-ketso-co-note">
              {
                "Một mức treo lớn bất thường chưa chắc là lực thật, cũng chưa chắc là không — chờ nó KHỚP THẬT rồi hãy tin. Cả hai lựa chọn đều chỉ được ghi lại để bạn tự so ở khối ⑰."
              }
            </p>
          )}
          {docLuc.giaiThich && (
            <p className="cap7-ketso-docluc-giaithich" data-testid="cap7-ketso-docluc-giaithich">
              {docLuc.giaiThich}
            </p>
          )}
        </div>
      )}

      {/* Lớp coach 1 — Cấp 1 (lưới lý do × kết quả), giữ nguyên.
          ★ `data-testid` để test "đủ 6 lớp coach Cấp 1-6" đếm được ĐÚNG 6 lớp:
          không có nó, hai lớp đầu vô hình với test và có thể biến mất lặng lẽ. */}
      <div className="cap0-debrief-coach" data-testid="cap1-ketso-coach">
        <div className="cap0-debrief-coach-tag">NHÌN LẠI</div>
        <p className="cap0-debrief-coach-body">{coach.cap1Text}</p>
      </div>

      {/* Lớp coach 2 — Cấp 2 (kỷ luật cắt lỗ/chốt lời), giữ nguyên. */}
      <div className="cap2-ketso-coach" data-testid="cap2-ketso-coach">
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

      {/* Lớp coach 6 — Cấp 6 (đối chiếu vs kết quả), giữ nguyên. */}
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

      {/* Lớp coach 7 — Cấp 7 (đọc lực vs diễn biến ngay sau), THÊM MỚI.
          KHÔNG có ô nào là cảnh báo: đọc trượt một chỉ số vốn chỉ đúng vài phút là
          chuyện bình thường, và mua đuổi không bị phạt (spec §5). Vắng mặt khi lệnh
          không đọc lực HOẶC chưa tới hạn chấm — không đoán một phán quyết. */}
      {coach.cap7 && (
        <div className="cap7-ketso-coach" data-testid="cap7-ketso-coach">
          <div className="cap7-ketso-coach-tag">
            {`ĐỌC LỰC VS DIỄN BIẾN · ${COACH_CAP7_LABEL[coach.cap7.id]}${
              coach.cap7.coId ? ` · ${COACH_CO_CAP7_LABEL[coach.cap7.coId]}` : ""
            }`}
          </div>
          <p className="cap7-ketso-coach-body">
            {splitEmphasis(coach.cap7.text, coach.cap7.nhanManh).map((part, i) =>
              part.strong ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>,
            )}
          </p>
        </div>
      )}

      <div className="cap1-ketso-profile" data-testid="cap7-ketso-profile">
        <div className="cap0-debrief-coach-tag">📊 HỒ SƠ CỦA BẠN SAU LỆNH NÀY</div>
        <ul className="cap1-ketso-profile-list">
          <li>{line1}</li>
          <li>{line2}</li>
          <li>{line3}</li>
        </ul>
      </div>

      {/* KHÔNG CÒN CỔNG: cổng duy nhất của màn này là phân loại 4 ô của Cấp 5, và
          nó đã nghỉ hưu. `disabled` chỉ còn chống double-submit. */}
      <button
        type="button"
        className="cap0-debrief-close"
        disabled={closing}
        onClick={handleClose}
        data-testid="cap7-ketso-close"
      >
        Đóng kết sổ ✓
      </button>
    </Modal>
  )
}
