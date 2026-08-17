import { useEffect, useState } from "react"
import { Modal } from "@arco-design/web-react"
import { cn } from "@/shared/lib/cn"
import { useRecordKetso } from "@/features/cap1/hooks"
import {
  countCalendarDays,
  countTradingSessions,
  isLenhCoChuyen,
  type KetsoDataCap1,
} from "@/features/cap1/KetsoModalCap1"
import type { CoachParamsCap1, CoachSituationCap1 } from "@/features/cap1/coachTemplateCap1"
import { LY_DO_OPTIONS, type CamXuc, type Cap1Progress, type LyDo, type TrangThaiLucDat } from "@/features/cap1/types"
import type { Cap1TradeRecord } from "@/features/cap1/tradeLog"
import { useRecordKetsoCap2 } from "./hooks"
import { composeCoachCap2, type CoachSituationCap2 } from "./coachTemplateCap2"
import type { KetsoInputCap2, PhuongPhapSlTp } from "./types"
// Kết sổ Cấp 2 = Kết sổ Cấp 1's content (đối chiếu table, khối cảm xúc, coach
// "NHÌN LẠI", 3-dòng HỒ SƠ CỦA BẠN, count-up) + the SL/TP discipline layer
// (spec §5.6/§6/§7). Reuses the SAME dark-editorial shell CSS Cấp 1 built on
// top of Cấp 0's, plus its own `cap2-ketso.css` for the 2 blocks Cấp 2 adds.
import "@/features/cap0/cap0.css"
import "@/features/cap1/cap1.css"
import "./cap2-ketso.css"

/**
 * Màn Kết sổ Cấp 2 (spec `IQX-Cap2-Spec.md` §5.6/§6/§7).
 *
 * DESIGN DECISION — mirror, don't compose `KetsoModalCap1` as a child:
 * `KetsoModalCap1` renders a full, self-contained `<Modal>` (header tag, big
 * P&L, đối chiếu table, coach, HỒ SƠ CỦA BẠN, close button all in one JSX
 * tree) — there is no seam to slot new blocks into without either nesting two
 * `<Modal>`s (double overlay/backdrop, broken focus-trap) or reaching into
 * its internals (which aren't exported). Cấp 1 itself set this precedent one
 * level down: it did NOT render Cấp 0's `DebriefModal` as a child either — it
 * mirrored the same JSX shape and re-imported `cap0.css` for the shared
 * classes (see `KetsoModalCap1.tsx`'s own top-of-file comment). This file
 * follows the identical pattern one level up: mirror Cấp 1's blocks verbatim
 * (same classes, same conditions), insert the 2 new Cấp-2-only blocks (CAM
 * KẾT vs THỰC TẾ + a 2nd "KỶ LUẬT" coach paragraph), and post to BOTH
 * `/cap1/ketso` (cam_xúc — unchanged Cấp 1 contract) and `/cap2/ketso` (the 7
 * discipline flags) on close — the same "Cấp 1 first, then Cấp 2" 2-call
 * convention `TradingPanel` already uses for the kehoach side (see
 * `cap2/api.ts`'s `recordKehoach` doc comment).
 *
 * Small private helpers Cấp 1 doesn't export (`fmtVnd`/`fmtPct`/
 * `fmtVndSigned`/`TRANG_THAI_LABEL`/`CAM_XUC_OPTIONS`/`lyDoLabel`) are
 * duplicated here rather than imported — same call `cap2/slTp.ts`'s
 * `roundToStep` already made ("cap2 must stay independent" — only
 * `KetsoModalCap1`'s EXPORTED pure helpers are reused).
 */
export interface KetsoDataCap2 extends KetsoDataCap1 {
  /** Cắt lỗ cam kết (`order_kehoach.cat_lo`, spec §5). */
  catLo: number
  /** Chốt lời cam kết (`order_kehoach.chot_loi`, spec §5). */
  chotLoi: number
  phuongPhapSlTp: PhuongPhapSlTp
  /**
   * The 7 discipline flags computed by the caller for THIS closed order
   * (spec §5.6/§6/§7) — posted verbatim (with `order_id` normalised to this
   * order's) via `useRecordKetsoCap2`.
   */
  flags: KetsoInputCap2
  /**
   * Giá cao nhất quan sát được SAU KHI cắt lỗ đúng phiên, nếu biết (spec §5.6
   * "mốc bị quét"). `null`/omitted → that nhắc simply never triggers.
   */
  giaSauKhiCat?: number | null
}

export interface KetsoModalCap2Props {
  /** `null` → modal is closed/unmounted. */
  data: KetsoDataCap2 | null
  /** Cấp 1 progress row, for the (unchanged) "HỒ SƠ CỦA BẠN" lines. */
  progress: Cap1Progress | null
  /** Closed-trade history, for the (unchanged) per-lý-do stat line. */
  trades: Cap1TradeRecord[]
  onClose: () => void
  /** Called once with this order's record so the caller can append it to the
   * (Cấp 1) trade log — same contract as `KetsoModalCap1Props.onRecorded`. */
  onRecorded?: (record: Cap1TradeRecord) => void
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

function lyDoLabel(lyDo: LyDo): string {
  const opt = LY_DO_OPTIONS.find((o) => o.value === lyDo)
  return opt ? `${opt.icon} ${opt.label}` : lyDo
}

function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/** `+1.9%` / `−11.0%` / `0.0%` — typographic minus "−" (U+2212), as Cấp 0/1. */
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

/** "Thực tế" description for the cắt lỗ row of CAM KẾT vs THỰC TẾ. */
function describeSlThucTe(flags: KetsoInputCap2, exitPrice: number, catLo: number): string {
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

/** "Thực tế" description for the chốt lời row of CAM KẾT vs THỰC TẾ. */
function describeTpThucTe(flags: KetsoInputCap2, exitPrice: number, chotLoi: number): string {
  const touched = Boolean(flags.cham_TP_giu_lam_hut || (chotLoi > 0 && exitPrice >= chotLoi))
  if (!touched) return "Chưa chạm chốt lời"
  if (flags.cham_TP_giu_lam_hut) return "Có chạm — giữ tiếp, hụt lời ⚠"
  return "Có chạm — chốt đúng ✅"
}

const TARGET_ORDERS = 10
const MIN_TRADES_FOR_STAT = 2
const COUNT_UP_MS = 1000
const COUNT_UP_STEP_MS = 40

export function KetsoModalCap2({
  data,
  progress,
  trades,
  onClose,
  onRecorded,
}: KetsoModalCap2Props) {
  const recordKetsoCap1 = useRecordKetso()
  const recordKetsoCap2 = useRecordKetsoCap2()
  const [emotion, setEmotion] = useState<CamXuc | null>(null)
  const [displayPct, setDisplayPct] = useState(0)

  const entryPrice = data?.entryPrice ?? 0
  const exitPrice = data?.exitPrice ?? 0
  const quantity = data?.quantity ?? 0
  const pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0
  const pnlVnd = (exitPrice - entryPrice) * quantity

  // Reset per-order state + run the ~1s count-up whenever a NEW kết sổ opens
  // (identical to `KetsoModalCap1`'s own effect).
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
  const coach = composeCoachCap2(cap1Situation, cap1Params, cap2Situation)

  const slThucTe = describeSlThucTe(flags, exitPrice, catLo)
  const tpThucTe = describeTpThucTe(flags, exitPrice, chotLoi)

  // ── 3 dòng "HỒ SƠ CỦA BẠN" (unchanged from Cấp 1, spec §6) ─────────────
  const soLenh = progress?.so_lenh_thuc_chien ?? 0
  const conLai = Math.max(0, TARGET_ORDERS - soLenh)
  const line1 =
    conLai > 0
      ? `Đây là lệnh Thực chiến thứ ${soLenh}/${TARGET_ORDERS} — còn ${conLai} lệnh nữa để xét tốt nghiệp Cấp 1.`
      : `Đây là lệnh Thực chiến thứ ${soLenh}/${TARGET_ORDERS} — bạn đã đủ số lệnh để xét tốt nghiệp Cấp 1.`

  const usedLyDo = new Set<LyDo>([...trades.map((t) => t.lyDo), lyDo])
  const missing = LY_DO_OPTIONS.filter((o) => !usedLyDo.has(o.value))
  const daDung = Math.max(progress?.so_ly_do_da_dung ?? 0, usedLyDo.size)
  const line2 =
    missing.length > 0
      ? `Bạn đã dùng ${daDung}/5 lý do. Chưa thử: ${missing.map((o) => `${o.icon} ${o.label}`).join(", ")}.`
      : `Bạn đã dùng đủ 5/5 lý do — nhiệm vụ ③ hoàn thành.`

  const sameLyDo = trades.filter((t) => t.lyDo === lyDo)
  const sameLyDoWins = sameLyDo.filter((t) => t.pnlPct > 0).length
  const line3 =
    sameLyDo.length >= MIN_TRADES_FOR_STAT
      ? `Với lý do ${lyDoLabel(lyDo)}, bạn có ${sameLyDoWins}/${sameLyDo.length} lệnh lãi.`
      : `Còn ${MIN_TRADES_FOR_STAT - sameLyDo.length} lệnh nữa để hệ thống tìm mẫu riêng của bạn.`

  const handleClose = () => {
    // Cấp 1 first (unchanged /cap1/ketso contract), then Cấp 2's discipline
    // flags — mirrors `TradingPanel`'s "Cấp 1 kehoach first, then Cấp 2
    // kehoach" 2-call convention on the buy side.
    recordKetsoCap1.mutate({ order_id: orderId, cam_xuc: emotion })
    recordKetsoCap2.mutate({ ...flags, order_id: orderId })
    onRecorded?.({
      orderId,
      lyDo,
      trangThaiLucDat,
      pnlPct,
      pnlVnd,
      closedAt: new Date(`${sellDate.slice(0, 10)}T00:00:00Z`).toISOString(),
    })
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

      <table className="cap0-debrief-table">
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

      {/* ── CAM KẾT vs THỰC TẾ (Cấp 2 THÊM MỚI, spec §5.6/§6) ────────────── */}
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

      <div className="cap0-debrief-coach">
        <div className="cap0-debrief-coach-tag">NHÌN LẠI</div>
        <p className="cap0-debrief-coach-body">{coach.cap1Text}</p>
      </div>

      {/* ── Lớp coach thứ 2 (Cấp 2 THÊM MỚI) — nhắc kỷ luật cắt lỗ/chốt lời,
          đứng CẠNH "NHÌN LẠI" chứ không thay thế (cumulative principle). ─── */}
      <div className="cap2-ketso-coach">
        <div className="cap2-ketso-coach-tag">KỶ LUẬT</div>
        <p className="cap2-ketso-coach-body">{coach.cap2.text}</p>
      </div>

      <div className="cap1-ketso-profile">
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
