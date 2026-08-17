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
import type { KetsoDataCap3 } from "@/features/cap3/KetsoModalCap3"
import { KHAU_VI_PCT } from "@/features/cap3/khoiLuong"
import { CACH_KHOI_LUONG_LABEL } from "@/features/cap3/portfolioAnalysisCap3"
import type { KhauViLoai } from "@/features/cap3/types"
import {
  composeCoachCap4,
  lopKhacAiCap4,
  lopLabelCap4,
  type CoachSituationCap4,
} from "./coachTemplateCap4"
import {
  countCungGocNhin,
  countDongThuan,
  countKhacAi,
  LOP_KEYS,
  NHAN_DINH_LABEL,
} from "./doc5Lop"
import { useCompleteCap4Task } from "./hooks"
import { useCap4TradeLog, type Cap4TradeRecord } from "./tradeLogCap4"
import type { Lop5Partial } from "./types"
// Kết sổ Cấp 4 = Kết sổ Cấp 3's content (đối chiếu Cấp 1 + CAM KẾT vs THỰC TẾ
// Cấp 2 + Quản lý vốn Cấp 3 + khối cảm xúc + 3 lớp coach + HỒ SƠ + count-up) —
// CỘNG bảng "Đọc 5 lớp — nhìn lại" và lớp coach "GÓC NHÌN KHÁC AI".
// Dùng lại đúng bộ CSS shell Cấp 0/1/2/3 đã dựng, chỉ thêm `cap4-ketso.css`.
import "@/features/cap0/cap0.css"
import "@/features/cap1/cap1.css"
import "@/features/cap2/cap2-ketso.css"
import "@/features/cap3/cap3-ketso.css"
import "./cap4-ketso.css"

/**
 * Màn Kết sổ Cấp 4 (spec `IQX-Cap4-Spec.md` §6).
 *
 * DESIGN DECISION — **mirror, KHÔNG compose `KetsoModalCap3` làm con** (đọc file
 * đó rồi mới quyết, đúng như task brief yêu cầu): `KetsoModalCap3` render một
 * `<Modal>` TRỌN GÓI (tag header, %lãi lỗ count-up, bảng đối chiếu, CAM KẾT vs
 * THỰC TẾ, Quản lý vốn, khối cảm xúc, 3 coach, HỒ SƠ, nút "Đóng kết sổ ✓" — cùng
 * 1 cây JSX, không export mảnh nào, không có chỗ cắm slot) và nút đóng của nó
 * tự `mutate` + tự ghi nhật ký Cấp 3 rồi gọi `onClose`. Bọc nó làm con sẽ:
 *  1. tạo 2 `<Modal>` lồng nhau (2 overlay/backdrop, focus-trap vỡ);
 *  2. không đặt được bảng "Đọc 5 lớp" vào GIỮA thân modal (spec/mockup đặt nó
 *     dưới các khối kế thừa, TRÊN coach) — bất khả thi từ ngoài;
 *  3. ghi 1 bản ghi vào nhật ký Cấp 3 và gọi `PATCH /cap3/task` cho một lệnh
 *     Cấp 4 — sai cấp.
 * Đây đúng là tiền lệ mà Cấp 3 đã ghi khi nó KHÔNG bọc `KetsoModalCap2` (và Cấp
 * 2 KHÔNG bọc `KetsoModalCap1`): mirror cùng khung JSX + import lại CSS chung.
 *
 * PHẦN LOGIC THÌ TÁI SỬ DỤNG THẬT (không mirror):
 *  - Coach: `composeCoachCap4` → `composeCoachCap3` → `composeCoachCap2` →
 *    `coachTemplateCap1`. CẢ 4 đoạn text đều do module cấp dưới sinh ra, Cấp 4
 *    chỉ thêm đoạn 4.
 *  - Helper thuần đã export của Cấp 1: `countTradingSessions`,
 *    `countCalendarDays`, `isLenhCoChuyen`.
 *  - Đếm 5 lớp: `countDongThuan` / `countKhacAi` / `countCungGocNhin` +
 *    `lopKhacAiCap4` — CÙNG hàm mà panel đặt lệnh (`Doc5LopBlock`) dùng, nên số
 *    ở Kết sổ không bao giờ lệch số user vừa thấy lúc đặt.
 *  - Kiểu dữ liệu: `KetsoDataCap4 extends KetsoDataCap3 extends KetsoDataCap2
 *    extends KetsoDataCap1`.
 *  - Nhãn: `MUC_TU_TIN_LABEL`, `CACH_KHOI_LUONG_LABEL`, `KHAU_VI_PCT`,
 *    `NHAN_DINH_LABEL`, `lopLabelCap4` — dùng chung với panel/khối khác.
 *
 * Cấp 4 KHÔNG có endpoint kết sổ riêng (spec §8 chỉ thêm cột `order_kehoach`),
 * nên lúc đóng modal vẫn post đúng 2 call như Cấp 2/3 (`/cap1/ketso` cảm xúc +
 * `/cap2/ketso` 7 cờ kỷ luật) rồi gọi `PATCH /cap4/task` (idempotent recompute —
 * nhiệm vụ ② "Kết sổ lệnh đầu Cấp 4" được server suy ra từ `order_ketso`, call
 * này chỉ kích hoạt recompute + invalidate cache Cấp 4).
 */
export interface KetsoDataCap4 extends KetsoDataCap3 {
  /**
   * Bản tự chấm 5 lớp lúc đặt lệnh (`order_kehoach.doc_5_lop`).
   *
   * camelCase ở đây (khác 4 trường snake_case của `Cap4TradeRecord`) vì đây là
   * props của component, cùng quy ước với `Doc5LopBlock`'s `doc5Lop`; `handleClose`
   * dịch sang tên cột DB đúng một lần khi ghi nhật ký.
   */
  doc5Lop: Lop5Partial
  /** Đánh giá AI 5 lớp lúc đặt — `null` khi AI chưa bao giờ được lộ. */
  ai5Lop: Lop5Partial | null
}

export interface KetsoModalCap4Props {
  /** `null` → modal đóng/không mount. */
  data: KetsoDataCap4 | null
  /** Hồ sơ Cấp 1 — cho 3 dòng "HỒ SƠ CỦA BẠN" (giữ nguyên). */
  progress: Cap1Progress | null
  /** Nhật ký lệnh đã đóng (Cấp 1) — cho dòng thống kê theo lý do (giữ nguyên). */
  trades: Cap1TradeRecord[]
  onClose: () => void
  /**
   * Gọi 1 lần với bản ghi Cấp 4 của lệnh này. Modal ĐÃ tự ghi vào nhật ký Cấp 4
   * (`useCap4TradeLog`); callback này để caller ghi thêm vào nhật ký Cấp 1/2/3
   * (bản ghi Cấp 4 là siêu tập của cả ba nên truyền thẳng được).
   */
  onRecorded?: (record: Cap4TradeRecord) => void
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

/** `+5.3%` / `−4.2%` / `0.0%` — dấu trừ typographic "−" (U+2212), như Cấp 0-3. */
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

/** "Thực tế" của hàng cắt lỗ trong CAM KẾT vs THỰC TẾ (giữ nguyên Cấp 2/3). */
function describeSlThucTe(
  flags: KetsoDataCap4["flags"],
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

/** "Thực tế" của hàng chốt lời trong CAM KẾT vs THỰC TẾ (giữ nguyên Cấp 2/3). */
function describeTpThucTe(
  flags: KetsoDataCap4["flags"],
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
/** Nhiệm vụ ② Cấp 4 — "Kết sổ lệnh đầu Cấp 4" (spec §2②). */
const CAP4_TASK_KETSO = 2

export function KetsoModalCap4({
  data,
  progress,
  trades,
  onClose,
  onRecorded,
}: KetsoModalCap4Props) {
  const recordKetsoCap1 = useRecordKetso()
  const recordKetsoCap2 = useRecordKetsoCap2()
  const completeCap4Task = useCompleteCap4Task()
  const { record: recordCap4Trade } = useCap4TradeLog()
  const [emotion, setEmotion] = useState<CamXuc | null>(null)
  const [displayPct, setDisplayPct] = useState(0)

  const entryPrice = data?.entryPrice ?? 0
  const exitPrice = data?.exitPrice ?? 0
  const quantity = data?.quantity ?? 0
  const pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0
  const pnlVnd = (exitPrice - entryPrice) * quantity

  // Reset + count-up ~1s mỗi khi MỘT kết sổ mới mở (giữ nguyên Cấp 1/2/3).
  useEffect(() => {
    if (!data) {
      setDisplayPct(0)
      return
    }
    setEmotion(null)
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
  const coach = composeCoachCap4(
    cap1Situation,
    cap1Params,
    cap2Situation,
    cap3Situation,
    cap4Situation,
  )

  const slThucTe = describeSlThucTe(flags, exitPrice, catLo)
  const tpThucTe = describeTpThucTe(flags, exitPrice, chotLoi)

  // ── Khối Quản lý vốn (Cấp 3 §7, giữ nguyên) ────────────────────────────
  const tienThucTe = khoiLuong * entryPrice

  // ── Bảng "Đọc 5 lớp — nhìn lại" (Cấp 4 THÊM MỚI, spec §6) ──────────────
  // Cùng 4 hàm đếm mà panel đặt lệnh dùng → số ở đây luôn khớp số user vừa thấy.
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

  const handleClose = () => {
    // Cấp 1 (cảm xúc) → Cấp 2 (7 cờ kỷ luật) → Cấp 4 (recompute nhiệm vụ) —
    // cùng quy ước "cấp dưới trước" mà `TradingPanel` dùng ở phía mua. KHÔNG gọi
    // `PATCH /cap3/task`: lệnh này thuộc Cấp 4, Cấp 3 đã tốt nghiệp.
    recordKetsoCap1.mutate({ order_id: orderId, cam_xuc: emotion })
    recordKetsoCap2.mutate({ ...flags, order_id: orderId })
    completeCap4Task.mutate(CAP4_TASK_KETSO)

    const record: Cap4TradeRecord = {
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
      // Chưa lộ AI → để NULL đúng như backend (`so_lop_dong_thuan` NULL), KHÔNG
      // quy về 0: "0 lớp AI ủng hộ" là một sự thật khác với "chưa đo".
      so_lop_dong_thuan: ai5Lop ? soDongThuan : null,
      so_lop_khac_ai: ai5Lop ? soKhacAi : null,
    }
    recordCap4Trade(record)
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

      <table className="cap0-debrief-table" data-testid="cap4-ketso-doichieu">
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

      {/* ── ĐỌC 5 LỚP — NHÌN LẠI (Cấp 4 THÊM MỚI, spec §6) ────────────────── */}
      <div className="cap4-ketso-doc5lop" data-testid="cap4-ketso-doc5lop">
        <div className="cap4-ketso-doc5lop-head">
          <span className="cap4-ketso-doc5lop-title">ĐỌC 5 LỚP — NHÌN LẠI</span>
          <span className="cap4-ketso-badge">mới ở Cấp 4</span>
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

      {/* Lớp coach 4 — Cấp 4 (góc nhìn khác AI), THÊM MỚI: đứng CẠNH 3 lớp trên
          chứ không thay thế (nguyên tắc cộng dồn). */}
      <div className="cap4-ketso-coach" data-testid="cap4-ketso-coach">
        <div className="cap4-ketso-coach-tag">NHÌN LẠI · GÓC NHÌN KHÁC AI</div>
        <p className="cap4-ketso-coach-body">{coach.cap4.text}</p>
      </div>

      <div className="cap1-ketso-profile" data-testid="cap4-ketso-profile">
        <div className="cap0-debrief-coach-tag">📊 HỒ SƠ CỦA BẠN SAU LỆNH NÀY</div>
        <ul className="cap1-ketso-profile-list">
          <li>{line1}</li>
          <li>{line2}</li>
          <li>{line3}</li>
        </ul>
      </div>

      <button type="button" className="cap0-debrief-close" onClick={handleClose}>
        Đóng kết sổ ✓
      </button>
    </Modal>
  )
}
