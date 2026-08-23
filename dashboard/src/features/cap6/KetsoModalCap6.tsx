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
import { splitEmphasis, type CoachSituationCap5 } from "@/features/cap5/coachTemplateCap5"
import type { KetsoDataCap5 } from "@/features/cap5/KetsoModalCap5"
import { composeCoachCap6, type CoachSituationCap6 } from "./coachTemplateCap6"
import { useCap6Events } from "./Cap6Context"
import { useCompleteCap6Task, useKehoachCap6, useKehoachMauThuanCap6 } from "./hooks"
import {
  COACH_NHAT_QUAN_CAP6,
  NhanDinhKetsoBlock,
  mergeNhanDinhCap6,
  type NhanDinhKetsoCap6,
} from "./NhanDinhKetsoBlock"
import { useCap6TradeLog, type Cap6TradeRecord } from "./tradeLogCap6"
import type { KehoachDetailCap6, KieuCoPhieu, Lop } from "./types"
// Kết sổ Cấp 6 = Kết sổ Cấp 5's content (đối chiếu Cấp 1 + CAM KẾT vs THỰC TẾ Cấp
// 2 + Quản lý vốn Cấp 3 + Đọc 5 lớp Cấp 4 + khối cảm xúc + 4 lớp coach + HỒ SƠ +
// count-up) — CỘNG khối "Đối chiếu — nhìn lại" và lớp coach "ĐỐI CHIẾU VS KẾT
// QUẢ". Dùng lại đúng bộ CSS shell Cấp 0-4 đã dựng, chỉ thêm `cap6-ketso.css`.
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
 *  - Coach: `composeCoachCap6` → `composeCoachCap5` → Cấp 4 → 3 → 2 → 1. Cấp 6
 *    chỉ thêm đoạn của chính nó.
 *  - Hai phía của mâu thuẫn: `lopUngHo`/`lopNguocChieu` của FE1 chấm trên CHÍNH
 *    `doc5Lop` của lệnh — cùng nguồn mà bước Đối chiếu đã đọc lúc đặt lệnh, nên
 *    Kết sổ không bao giờ hiện một mâu thuẫn khác với panel.
 *  - Helper thuần của Cấp 1/4 + `splitEmphasis` của Cấp 5.
 *
 * ★★ **CỔNG PHÂN LOẠI 4 Ô CỦA CẤP 5 ĐÃ NGHỈ HƯU CÙNG CẤP 5 CŨ.** Cấp 5 mới dạy
 * SĂN MÃ, nên `PhanLoai4O` / `GET /cap5/verdict` / `POST /cap5/ketso` /
 * `deriveO4` / `O4_LABEL` không còn tồn tại. Cùng với chúng, modal này gỡ: cổng
 * "phải chốt verdict mới đóng được", ghi chú cổng, LỐI RA "chưa phân loại được"
 * (nó chỉ tồn tại để cứu user khỏi cổng đó), lớp coach "QUYẾT ĐỊNH VS KẾT QUẢ",
 * và 3 trường `o4`/`verdictHe`/`verdictUser` của bản ghi. `Đóng kết sổ ✓` giờ mở
 * ngay — không còn thứ gì cần chốt trước.
 *
 * ★★ **ĐOẠN COACH SĂN MÃ CỦA CẤP 5 CÓ Ở ĐÂY** — và đây là bản SỬA một khẳng
 * định SAI. Docstring cũ viết "trang Cấp 6 KHÔNG có màn Săn mã": không đúng.
 * `Cap6TradingPage` bọc `Cap5Provider` (nguyên tắc cộng dồn) ⇒ `isCap5Active ===
 * true` ⇒ `RightToolbar`/`RightSidebar` mọc đủ nút «Săn mã» + «Watchlist» ở Cấp
 * 6/7/8, và backend VẪN đóng dấu `order_kehoach.hunt_filter` cho lệnh đó. Điền
 * `huntFilter: null` cứng vì thế không phải "sự thật" mà là hai nguồn nói khác
 * nhau về cùng một lệnh — và `coachTemplateCap5` đọc `null` thành câu khẳng định
 * "Mã này KHÔNG đến từ săn mã".
 *
 * Nay `KetsoDataCap6` mang đủ 3 trường nguồn săn + cờ `huntNguonChuaBiet`, do
 * `Cap6TradingPage` đọc từ `GET /cap5/nguon-san/{symbol}` (helper dùng chung
 * `cap5/nguonSanKetso.ts`). Chỉ khi KHÔNG lấy được nguồn (`huntNguonChuaBiet`)
 * thì `cap5Situation` mới là `null` ⇒ vắng đoạn coach — đúng ngoại lệ mà
 * `KetsoModalCap5` đã ghi.
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
  /**
   * §C12c — câu "vì sao" của server cho CHÍNH lệnh này
   * (`GET /cap6/kehoach/{order_id}`), hiện NGUYÊN VĂN. Vắng mặt khi khối được
   * dựng từ sự kiện lệnh (FE không có câu nào để hiện, và không được bịa).
   */
  giaiThich?: string | null
}

/**
 * Khối Đối chiếu để RENDER = khối server đã ghi cho lệnh, nếu đọc được; nếu
 * không thì đúng khối cũ dựng từ sự kiện lệnh.
 *
 * ★ Vì sao phải ưu tiên server: `/cap6/goi-y` suy lại kiểu từ ngành *bây giờ*,
 * nên với mã hệ không phân loại được nó mãi trả "chưa phân loại" — trong khi
 * `POST /cap6/kehoach` ĐÃ ghi `khop_goi_y` cho lệnh đó. Chỉ hàng đã lưu mới nói
 * được sự thật.
 *
 * ★ FAIL-CLOSED, KHÔNG BAO GIỜ FAIL-LOUD: `detail` là `undefined` khi query
 * đang chạy, 404 (user chưa ở Cấp 6 / lệnh không phải của user) hoặc lỗi mạng →
 * trả lại y nguyên `local`, tức đúng hành vi cũ. Modal `closable={false}` nên
 * một exception ở đây sẽ nhốt user.
 *
 * ★ `co_du_lieu === false` KHÔNG phải lỗi và cũng KHÔNG phải lý do để xoá khối:
 * nó chỉ nói hàng `order_kehoach` không có bước Đối chiếu. Giữ `local`.
 *
 * ★ `khop_goi_y === null` đi thẳng vào `khopGoiY` — TUYỆT ĐỐI không `?? false`:
 * "chưa phân loại" và "lệch gợi ý" là hai chuyện khác nhau.
 */
export function mergeDoiChieuCap6(
  local: DoiChieuKetsoCap6 | null,
  detail: KehoachDetailCap6 | null | undefined,
): DoiChieuKetsoCap6 | null {
  if (!detail || !detail.co_du_lieu) return local
  return {
    kieu: detail.kieu_co_phieu,
    kieuTen: detail.kieu_ten,
    nganh: detail.nganh,
    lopQuyetDinh: detail.lop_quyet_dinh,
    lopUuTien: detail.lop_uu_tien,
    khopGoiY: detail.khop_goi_y,
    lyDo: detail.ly_do_doi_chieu,
    giaiThich: detail.giai_thich,
  }
}

/**
 * Cấp 6 thêm ĐÚNG một trường vào dữ liệu Kết sổ: khối Đối chiếu của lệnh.
 * `null` = lệnh không có mâu thuẫn (hoặc lệnh mở trước khi Cấp 6 ship, cả 6 cột
 * đều null) → khối Đối chiếu bị bỏ hẳn, im lặng.
 *
 * ★★ **MANG ĐỦ 3 trường săn mã của `KetsoDataCap5`** (cộng cờ
 * `huntNguonChuaBiet`) — `Omit` cũ đã bị BỎ. Lý do của `Omit` ("trang Cấp 6
 * không đi qua màn Săn mã") là một khẳng định SAI: nguyên tắc cộng dồn giữ
 * `Cap5Provider` ở Cấp 6/7/8 nên nút «Săn mã»/«Watchlist» vẫn có, user vẫn săn,
 * và `order_kehoach.hunt_filter` vẫn được đóng dấu. `Cap6TradingPage` đọc nguồn
 * săn THẬT của lệnh (`GET /cap5/nguon-san/{symbol}`) và truyền vào đây.
 */
export interface KetsoDataCap6 extends KetsoDataCap5 {
  doiChieu: DoiChieuKetsoCap6 | null
  /**
   * ★ CẤP 6 «BẬC THẦY» (spec §8) — khối "nhận định có khớp hành động không".
   *
   * OPTIONAL vì `KetsoDataCap7`/`KetsoDataCap8` mở rộng chính interface này và
   * hai cấp đó còn dựng trên Cấp 6 «Đối chiếu» cũ (chúng không có trường này).
   * `null`/vắng = lệnh không có bảng mâu thuẫn ⇒ khối bị bỏ hẳn, im lặng.
   */
  nhanDinh?: NhanDinhKetsoCap6 | null
}

export interface KetsoModalCap6Props {
  /** `null` → modal đóng/không mount. */
  data: KetsoDataCap6 | null
  /** Hồ sơ Cấp 1 — cho 3 dòng "HỒ SƠ CỦA BẠN" (giữ nguyên). */
  progress: Cap1Progress | null
  /** Nhật ký lệnh đã đóng (Cấp 1) — cho dòng thống kê theo lý do (giữ nguyên). */
  trades: Cap1TradeRecord[]
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

const TARGET_ORDERS = 10
const MIN_TRADES_FOR_STAT = 2
const COUNT_UP_MS = 1000
const COUNT_UP_STEP_MS = 40

export function KetsoModalCap6({
  data,
  progress,
  trades,
  onClose,
  onRecorded,
}: KetsoModalCap6Props) {
  const { isCap6Active } = useCap6Events()
  const recordKetsoCap1 = useRecordKetso()
  const recordKetsoCap2 = useRecordKetsoCap2()
  const completeCap6Task = useCompleteCap6Task()
  const { record: recordCap6Trade } = useCap6TradeLog()
  const [emotion, setEmotion] = useState<CamXuc | null>(null)
  const [displayPct, setDisplayPct] = useState(0)
  const [closing, setClosing] = useState(false)

  /**
   * `GET /cap6/kehoach/{order_id}` — khối Đối chiếu ĐÃ GHI của chính lệnh này.
   *
   * ★ Chỉ gọi khi user THẬT SỰ đang ở Cấp 6 (`isCap6Active`): endpoint 404 khi
   * chưa có hàng tiến độ Cấp 6, và một 404 vô ích mỗi lần mở Kết sổ là tiếng ồn.
   * Lỗi (404/mạng/500) KHÔNG bao giờ nổi lên UI — `mergeDoiChieuCap6` trả lại
   * khối cũ, y hệt hành vi trước khi có endpoint này.
   */
  const kehoachQuery = useKehoachCap6(data?.orderId ?? null, isCap6Active)
  /**
   * `GET /cap6/kehoach/{order_id}` — hàng Cấp 6 «Bậc thầy» ĐÃ LƯU của lệnh này.
   *
   * ★ ĐỌC LẠI SERVER, KHÔNG suy lại ở client: suy lại thì mỗi lần mở Kết sổ ra
   * một con số khác (đúng lỗ mà Cấp 6/7 bản trước phải thêm per-order re-read để
   * vá). Lỗi/404 KHÔNG bao giờ nổi lên UI — `mergeNhanDinhCap6` trả lại khối
   * dựng từ sự kiện lệnh.
   */
  const nhanDinhQuery = useKehoachMauThuanCap6(data?.orderId ?? null, isCap6Active)

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
    nhanDinh: nhanDinhLocal,
  } = data
  // Hàng đã lưu của server thắng khối dựng từ sự kiện lệnh — xem
  // `mergeDoiChieuCap6`. Query lỗi/chưa về → nguyên khối cũ.
  const doiChieu = mergeDoiChieuCap6(doiChieuLocal, kehoachQuery.data)
  // Hàng đã lưu thắng khối dựng từ sự kiện lệnh — xem `mergeNhanDinhCap6`.
  const nhanDinh = mergeNhanDinhCap6(nhanDinhLocal, nhanDinhQuery.data)
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
  // Đoạn coach Cấp 5 (săn mã) có ở mọi lệnh mà ta BIẾT nguồn săn — kể cả mã
  // không đến từ săn mã (mẫu `khong_san` nói thẳng điều đó, và lúc đó ta ĐÃ hỏi
  // server). NGOẠI LỆ DUY NHẤT: `huntNguonChuaBiet` ⇒ `null` ⇒ vắng đoạn coach,
  // vì in "Mã này KHÔNG đến từ săn mã" khi chưa biết nguồn là bịa đặt.
  const cap5Situation: CoachSituationCap5 | null = data.huntNguonChuaBiet
    ? null
    : {
        huntFilter: data.huntFilter,
        huntSoPhienCho: data.huntSoPhienCho,
        huntSoLopLucVao: data.huntSoLopLucVao,
        pnlPct,
      }
  const coach = composeCoachCap6(
    cap1Situation,
    cap1Params,
    cap2Situation,
    cap3Situation,
    cap4Situation,
    cap5Situation,
    cap6Situation,
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
   *
   * ★★ 3 trường săn mã của Cấp 5 đi từ NGUỒN SĂN THẬT của lệnh (`data.hunt*`,
   * do `Cap6TradingPage` đọc từ `GET /cap5/nguon-san/{symbol}`) — KHÔNG còn
   * `null` cứng. `null` cứng ở đây từng kèm docstring "trang Cấp 6 KHÔNG có màn
   * Săn mã", mà điều đó SAI: `Cap6TradingPage` bọc `Cap5Provider` nên nút «Săn
   * mã»/«Watchlist» vẫn mọc ở Cấp 6/7/8 và backend vẫn đóng dấu
   * `order_kehoach.hunt_filter`. Ghi `null` là để bản ghi FE nói ngược lại
   * server về cùng một lệnh.
   */
  const buildRecord = (): Cap6TradeRecord => ({
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
    huntFilter: data.huntFilter,
    huntSoPhienCho: data.huntSoPhienCho,
    huntSoLopLucVao: data.huntSoLopLucVao,
    kieuCoPhieu: doiChieu?.kieu ?? null,
    lopQuyetDinh: doiChieu?.lopQuyetDinh ?? null,
    khopGoiY: doiChieu?.khopGoiY ?? null,
  })

  /**
   * ★ KHÔNG còn "lối ra" nào ở đây — nó chỉ tồn tại để cứu user khỏi cổng verdict
   * fail-closed của Cấp 5 cũ (modal `closable={false}` + `GET /cap5/verdict` lỗi =
   * kẹt vĩnh viễn). Cổng đã nghỉ hưu ⇒ `Đóng kết sổ ✓` luôn mở ⇒ không còn cách
   * nào kẹt, và một nút "đóng — chưa phân loại được" giờ chỉ nói về một bước
   * user không hề đi qua.
   */
  const handleClose = async () => {
    if (closing) return
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

    // Cấp 6 KHÔNG có endpoint kết sổ riêng: cả 3 nhiệm vụ được suy ra server-side
    // từ `order_kehoach` JOIN `order_ketso`. `PATCH /cap6/task` là cách kích hoạt
    // lại phép tính đó NGAY (nhiệm vụ ② "Kết sổ đầu Cấp 6" vừa đủ điều kiện) và
    // đồng thời invalidate cache Cấp 6 để tab Hành trình cập nhật. Idempotent, và
    // fire-and-forget: một lỗi ở đây tuyệt đối không được chặn việc đóng modal.
    completeCap6Task.mutate(2)

    const record = buildRecord()
    recordCap6Trade(record)
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

      {/* ── NHÌN LẠI: NHẬN ĐỊNH CÓ KHỚP HÀNH ĐỘNG KHÔNG? (Cấp 6 «Bậc thầy»,
          spec §8) ─────────────────────────────────────────────────────────────
          Đặt dưới mọi khối kế thừa, TRÊN chồng coach — đúng vị trí mockup
          `iqx-cap6-ketso.html` vẽ, và vẫn đứng trước đoạn coach Cấp 6.

          ★★ THAY khối "ĐỐI CHIẾU — NHÌN LẠI" của bản Cấp 6 cũ: bản đó nói về kiểu
          cổ phiếu + trọng số gợi ý, những thứ Cấp 6 «Bậc thầy» không còn dạy.

          ★ Chỉ render khi lệnh THỰC SỰ có bảng mâu thuẫn. Lệnh không mâu thuẫn
          (hoặc mở trước khi Cấp 6 đợt 7 ship) → bỏ khối, IM LẶNG, không dựng một
          khối rỗng để user phải đoán. */}
      {nhanDinh && <NhanDinhKetsoBlock nhanDinh={nhanDinh} pnlPct={pnlPct} />}

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

      {/* Lớp coach 5 — Cấp 5 (SĂN MÃ). ★ Trước bản vá này khối này KHÔNG tồn tại
          ở Cấp 6/7/8 vì `cap5Situation` bị truyền `null` cứng với lý do "cấp này
          không có màn Săn mã" — một khẳng định SAI (nguyên tắc cộng dồn giữ
          `Cap5Provider`, nút «Săn mã» vẫn có). Mẫu "vào lệnh khi mã chưa chín"
          mang style cảnh báo: nó KHÔNG phải lời khen. */}
      {coach.cap5 && (
        <div
          className={cn("cap5-ketso-coach", coach.cap5.canhBao && "cap5-coach--canhbao")}
          data-testid="cap5-ketso-coach"
        >
          <div className="cap5-ketso-coach-tag">NHÌN LẠI · SĂN MÃ</div>
          <p className="cap5-ketso-coach-body">
            {splitEmphasis(coach.cap5.text, coach.cap5.nhanManh).map((part, i) =>
              part.strong ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>,
            )}
          </p>
        </div>
      )}

      {/* Lớp coach 6 — Cấp 6 «Bậc thầy» (SỰ NHẤT QUÁN), spec §8.
          ★ Đoạn này chỉ hiện khi lệnh CÓ bảng mâu thuẫn: không có mâu thuẫn thì
          không có sự nhất quán nào để nhìn lại. Chữ VERBATIM mockup
          `iqx-cap6-ketso.html`, và nó nhắc đúng hai thứ hệ đo (khối lượng + mức
          tự tin) cộng câu "không mua cũng là một lựa chọn" (spec §8 «Coach»). */}
      {nhanDinh && (
        <div className="cap6-ketso-coach" data-testid="cap6-ketso-coach">
          <div className="cap6-ketso-coach-tag">{"NHÌN LẠI · SỰ NHẤT QUÁN"}</div>
          <p className="cap6-ketso-coach-body">{COACH_NHAT_QUAN_CAP6}</p>
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

      {/* KHÔNG CÒN CỔNG: cổng duy nhất của màn này là phân loại 4 ô của Cấp 5, và
          nó đã nghỉ hưu. `disabled` chỉ còn chống double-submit. */}
      <button
        type="button"
        className="cap0-debrief-close"
        disabled={closing}
        onClick={handleClose}
        data-testid="cap6-ketso-close"
      >
        Đóng kết sổ ✓
      </button>
    </Modal>
  )
}
