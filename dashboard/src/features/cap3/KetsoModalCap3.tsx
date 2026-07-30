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
import type { KetsoDataCap2 } from "@/features/cap2/KetsoModalCap2"
import type { Cap2Progress, PhuongPhapSlTp } from "@/features/cap2/types"
import { composeCoachCap3, MUC_TU_TIN_LABEL, type CoachSituationCap3 } from "./coachTemplateCap3"
import { useCompleteCap3Task } from "./hooks"
import { KHAU_VI_PCT } from "./khoiLuong"
import { CACH_KHOI_LUONG_LABEL } from "./portfolioAnalysisCap3"
import { useCap3TradeLog, type Cap3TradeRecord } from "./tradeLogCap3"
import type { CachKhoiLuong, KhauViLoai, MucTuTin } from "./types"
// Kết sổ Cấp 3 = Kết sổ Cấp 2's content (đối chiếu + CAM KẾT vs THỰC TẾ + khối
// cảm xúc + 2 lớp coach + HỒ SƠ CỦA BẠN + count-up) — chính nó đã giữ 100%
// Kết sổ Cấp 1 — CỘNG khối "Quản lý vốn" và lớp coach "TỰ TIN VS KẾT QUẢ".
// Dùng lại đúng bộ CSS shell Cấp 0/1/2 đã dựng, chỉ thêm `cap3-ketso.css`.
import "@/features/cap0/cap0.css"
import "@/features/cap1/cap1.css"
import "@/features/cap2/cap2-ketso.css"
import "./cap3-ketso.css"

/**
 * Màn Kết sổ Cấp 3 (spec `IQX-Cap3-Spec.md` §7).
 *
 * DESIGN DECISION — **mirror, KHÔNG compose `KetsoModalCap2` làm con** (đọc
 * file đó rồi mới quyết): `KetsoModalCap2` render một `<Modal>` TRỌN GÓI (tag
 * header, %lãi lỗ count-up, bảng đối chiếu, CAM KẾT vs THỰC TẾ, 2 coach, HỒ SƠ,
 * nút đóng — cùng 1 cây JSX, không export mảnh nào, không có chỗ cắm slot).
 * Bọc nó làm con sẽ thành 2 `<Modal>` lồng nhau (2 overlay/backdrop, focus-trap
 * vỡ) và khối "Quản lý vốn" của Cấp 3 phải nằm GIỮA thân modal (dưới CAM KẾT,
 * trên coach) — bất khả thi từ ngoài. Đây đúng là tiền lệ mà chính Cấp 2 đã ghi
 * khi nó KHÔNG bọc `KetsoModalCap1` (và Cấp 1 KHÔNG bọc `DebriefModal` của Cấp
 * 0): mirror cùng khung JSX + import lại CSS dùng chung.
 *
 * PHẦN LOGIC THÌ TÁI SỬ DỤNG THẬT (không mirror):
 *  - Coach: `composeCoachCap3` → `composeCoachCap2` → `coachTemplateCap1`. Cả
 *    3 lớp text đều do các module cấp dưới sinh ra, Cấp 3 chỉ thêm lớp 3.
 *  - Helper thuần đã export của Cấp 1: `countTradingSessions`,
 *    `countCalendarDays`, `isLenhCoChuyen`.
 *  - Kiểu dữ liệu: `KetsoDataCap3 extends KetsoDataCap2 extends KetsoDataCap1`.
 *  - Nhãn: `MUC_TU_TIN_LABEL` (dùng chung với coach) + `CACH_KHOI_LUONG_LABEL`
 *    (dùng chung với khối ⑧) + `KHAU_VI_PCT` (dùng chung với panel đặt lệnh).
 *
 * Cấp 3 KHÔNG có endpoint kết sổ riêng (§10: không thêm cột `order_ketso`), nên
 * lúc đóng modal vẫn post đúng 2 call như Cấp 2 (`/cap1/ketso` cam xúc +
 * `/cap2/ketso` 7 cờ kỷ luật) rồi gọi thêm `PATCH /cap3/task` (idempotent
 * recompute — nhiệm vụ ② "Kết sổ lệnh đầu Cấp 3" được server suy ra từ
 * `order_ketso`, call này chỉ kích hoạt recompute + invalidate cache Cấp 3).
 */
export interface KetsoDataCap3 extends KetsoDataCap2 {
  /** Khẩu vị rủi ro LÚC ĐẶT lệnh (`order_kehoach.khau_vi`). */
  khauVi: KhauViLoai
  /** Mức tự tin user tự chấm lúc đặt (`order_kehoach.muc_tu_tin`). */
  mucTuTin: MucTuTin
  /** Cách tính khối lượng đã chọn (`order_kehoach.cach_khoi_luong`). */
  cachKhoiLuong: CachKhoiLuong
  /** Khối lượng đã ghi hồ sơ lúc đặt (`order_kehoach.khoi_luong`). */
  khoiLuong: number
  /** % vốn thực tế lúc đặt (`order_kehoach.pct_von`). */
  pctVon: number
}

export interface KetsoModalCap3Props {
  /** `null` → modal đóng/không mount. */
  data: KetsoDataCap3 | null
  /** Hồ sơ Cấp 1 — cho 3 dòng "HỒ SƠ CỦA BẠN" (giữ nguyên). */
  progress: Cap1Progress | null
  /** Nhật ký lệnh đã đóng (Cấp 1) — cho dòng thống kê theo lý do (giữ nguyên). */
  trades: Cap1TradeRecord[]
  /** Hồ sơ Cấp 2 — cho dòng tác động chuỗi kỷ luật (giá trị TRƯỚC kết sổ này). */
  cap2Progress: Cap2Progress | null
  onClose: () => void
  /**
   * Gọi 1 lần với bản ghi Cấp 3 của lệnh này. Modal ĐÃ tự ghi vào nhật ký Cấp 3
   * (`useCap3TradeLog`); callback này để caller ghi thêm vào nhật ký Cấp 1/Cấp 2
   * (bản ghi Cấp 3 là siêu tập của cả hai nên truyền thẳng được).
   */
  onRecorded?: (record: Cap3TradeRecord) => void
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

/** `+6.1%` / `−11.0%` / `0.0%` — dấu trừ typographic "−" (U+2212), như Cấp 0/1/2. */
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
function hasViPham(flags: KetsoDataCap3["flags"]): boolean {
  return Boolean(
    flags.cham_SL_khong_cat ||
      flags.cham_TP_giu_lam_hut ||
      flags.ban_som_khi_lo_nhe ||
      flags.nhoi_lenh_khi_lo,
  )
}

/** "Thực tế" của hàng cắt lỗ trong CAM KẾT vs THỰC TẾ (giữ nguyên Cấp 2). */
function describeSlThucTe(
  flags: KetsoDataCap3["flags"],
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

/** "Thực tế" của hàng chốt lời trong CAM KẾT vs THỰC TẾ (giữ nguyên Cấp 2). */
function describeTpThucTe(
  flags: KetsoDataCap3["flags"],
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
/** Nhiệm vụ ② Cấp 3 — "Kết sổ lệnh đầu Cấp 3" (spec §2②). */
const CAP3_TASK_KETSO = 2

export function KetsoModalCap3({
  data,
  progress,
  trades,
  cap2Progress,
  onClose,
  onRecorded,
}: KetsoModalCap3Props) {
  const recordKetsoCap1 = useRecordKetso()
  const recordKetsoCap2 = useRecordKetsoCap2()
  const completeCap3Task = useCompleteCap3Task()
  const { record: recordCap3Trade } = useCap3TradeLog()
  const [emotion, setEmotion] = useState<CamXuc | null>(null)
  const [displayPct, setDisplayPct] = useState(0)

  const entryPrice = data?.entryPrice ?? 0
  const exitPrice = data?.exitPrice ?? 0
  const quantity = data?.quantity ?? 0
  const pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0
  const pnlVnd = (exitPrice - entryPrice) * quantity

  // Reset + count-up ~1s mỗi khi MỘT kết sổ mới mở (giữ nguyên Cấp 1/2).
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
  const coach = composeCoachCap3(cap1Situation, cap1Params, cap2Situation, cap3Situation)

  const viPham = hasViPham(flags)
  const slThucTe = describeSlThucTe(flags, exitPrice, catLo)
  const tpThucTe = describeTpThucTe(flags, exitPrice, chotLoi)

  // ── Tác động lên chuỗi kỷ luật (Cấp 2 §6, giữ nguyên) ──────────────────
  const chuoiTruocDo = cap2Progress?.chuoi_current ?? 0
  const chuoiImpactText = viPham
    ? `Lệnh này làm đứt chuỗi kỷ luật — chuỗi về 0 (trước đó: ${chuoiTruocDo} lệnh liên tiếp).`
    : `Lệnh này giữ chuỗi kỷ luật — tăng lên ${chuoiTruocDo + 1} lệnh liên tiếp không vi phạm.`

  // ── Khối Quản lý vốn (Cấp 3 THÊM MỚI, spec §7) ─────────────────────────
  // Tiền thực tế = khối lượng đã ghi hồ sơ × giá vào thật (§C12c: luôn cho thấy
  // con số đến từ đâu, không chỉ hiện %).
  const tienThucTe = khoiLuong * entryPrice

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
    // Cấp 1 (cam xúc) → Cấp 2 (7 cờ kỷ luật) → Cấp 3 (recompute nhiệm vụ) —
    // cùng quy ước "Cấp 1 trước, rồi Cấp 2" mà `TradingPanel` dùng ở phía mua.
    recordKetsoCap1.mutate({ order_id: orderId, cam_xuc: emotion })
    recordKetsoCap2.mutate({ ...flags, order_id: orderId })
    completeCap3Task.mutate(CAP3_TASK_KETSO)

    const record: Cap3TradeRecord = {
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
    }
    recordCap3Trade(record)
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

      <table className="cap0-debrief-table" data-testid="cap3-ketso-doichieu">
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

      {/* ── CAM KẾT vs THỰC TẾ (giữ nguyên Cấp 2, spec §5.6/§6) ──────────── */}
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

      {/* ── QUẢN LÝ VỐN (Cấp 3 THÊM MỚI, spec §7) ────────────────────────── */}
      <div className="cap3-ketso-quanlyvon" data-testid="cap3-ketso-quanlyvon">
        <div className="cap3-ketso-quanlyvon-head">
          <span className="cap3-ketso-quanlyvon-title">QUẢN LÝ VỐN</span>
          <span className="cap3-ketso-badge">mới ở Cấp 3</span>
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

      {/* Lớp coach 3 — Cấp 3 (tự tin vs kết quả), THÊM MỚI: đứng CẠNH 2 lớp
          trên chứ không thay thế (nguyên tắc cộng dồn). */}
      <div className="cap3-ketso-coach" data-testid="cap3-ketso-coach">
        <div className="cap3-ketso-coach-tag">TỰ TIN VS KẾT QUẢ</div>
        <p className="cap3-ketso-coach-body">{coach.cap3.text}</p>
      </div>

      <div className="cap1-ketso-profile" data-testid="cap3-ketso-profile">
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
