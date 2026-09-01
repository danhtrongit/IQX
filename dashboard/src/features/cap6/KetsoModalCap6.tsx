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
import { composeCoachCap5, splitEmphasis, type CoachSituationCap5 } from "@/features/cap5/coachTemplateCap5"
import type { KetsoDataCap5 } from "@/features/cap5/KetsoModalCap5"
import { useCap6Events } from "./Cap6Context"
import { useKehoachMauThuanCap6 } from "./hooks"
import {
  COACH_NHAT_QUAN_CAP6,
  NhanDinhKetsoBlock,
  mergeNhanDinhCap6,
  type NhanDinhKetsoCap6,
} from "./NhanDinhKetsoBlock"
import { useCap6TradeLog, type Cap6TradeRecord } from "./tradeLogCap6"
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
 *  - Cấp 6 renders its own server-derived conflict evidence; the shared
 *    `composeCoachCap5` chain remains responsible for prior-level context.
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
 */

/**
 * Cấp 6 adds only its server-owned conflict snapshot to the inherited settlement
 * data. The retired Đối chiếu evidence is not carried through this boundary.
 */
export interface KetsoDataCap6 extends KetsoDataCap5 {
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
   * (`useCap6TradeLog`); callback này để caller ghi thêm vào nhật ký Cấp 1-5.
   */
  onRecorded?: (record: Cap6TradeRecord) => void
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
  const { record: recordCap6Trade } = useCap6TradeLog()
  const [emotion, setEmotion] = useState<CamXuc | null>(null)
  const [displayPct, setDisplayPct] = useState(0)
  const [closing, setClosing] = useState(false)
  /**
   * Chồng khối Cấp 1-5 THU GỌN mặc định (mockup `iqx-cap6-ketso.html` vẽ đúng
   * một thanh `.collapsed` thay cho cả chồng đó).
   *
   * ★ "Thu gọn", KHÔNG phải "bỏ": spec §8 nói "các khối Cấp 1-5 GIỮ NGUYÊN (thu
   * gọn)". Ở Cấp 6 màn Kết sổ đã dài tới mức khối MỚI của cấp bị đẩy khỏi tầm
   * mắt; gấp phần kế thừa lại là cách mockup giải quyết. Một cú bấm là mở ra đủ.
   *
   * ★ Khối cảm xúc của Cấp 1 và toàn bộ chồng coach nằm NGOÀI phần gấp: cảm xúc
   * là một ô user phải nhập, và coach là phần dạy của màn.
   */
  const [moKeThua, setMoKeThua] = useState(false)

  /**
   * The authoritative Cấp 6 conflict record is re-read from the server; local
   * event data remains only as an honest fallback while it loads.
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
    nhanDinh: nhanDinhLocal,
  } = data
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
  const cap5Situation: CoachSituationCap5 | null = data.huntNguonChuaBiet
    ? null
    : {
        huntFilter: data.huntFilter,
        huntSoPhienCho: data.huntSoPhienCho,
        huntSoLopLucVao: data.huntSoLopLucVao,
        pnlPct,
      }
  const coach = composeCoachCap5(
    cap1Situation,
    cap1Params,
    cap2Situation,
    cap3Situation,
    cap4Situation,
    cap5Situation,
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

  /** Bản ghi Cấp 6 giữ nguyên dữ liệu tích lũy từ Cấp 1-5. */
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

      {/* Thanh thu gọn (mockup `.collapsed`) — một cú bấm mở cả chồng Cấp 1-5. */}
      <button
        type="button"
        className="cap6-ketso-kethua"
        aria-expanded={moKeThua}
        data-testid="cap6-ketso-kethua-toggle"
        onClick={() => setMoKeThua((v) => !v)}
      >
        <span>{"Đối chiếu kế hoạch · Quản lý vốn · Đọc 5 lớp (giữ từ Cấp 1-5)"}</span>
        <span className="cap6-ketso-kethua-chev">{moKeThua ? "▾" : "▸"}</span>
      </button>

      {moKeThua && (
        <div data-testid="cap6-ketso-kethua">
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
        </div>
      )}

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
