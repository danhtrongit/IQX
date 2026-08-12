import { useEffect, useState } from "react"
import { Modal } from "@arco-design/web-react"
import { cn } from "@/shared/lib/cn"
import { useCap1Events } from "./Cap1Context"
import { useCompleteCap1Task, useRecordKetso } from "./hooks"
import { coachTemplateCap1 } from "./coachTemplateCap1"
import { LY_DO_OPTIONS, type CamXuc, type Cap1Progress, type LyDo, type TrangThaiLucDat } from "./types"
import type { Cap1TradeRecord } from "./tradeLog"
// Kết sổ Cấp 1 is spec §6's "nâng cấp từ Cấp 0" — deliberately reuses the Cấp 0
// debrief's own styles so the two levels look like one continuous product
// rather than two visually unrelated modals.
import "@/features/cap0/cap0.css"
import "./cap1.css"

/**
 * Màn Kết sổ Cấp 1 (spec §6) — opens when a Thực-chiến lệnh is sold.
 *
 * Upgrade over Cấp 0's `DebriefModal`: đối chiếu **lý do + vùng mua + kết quả**
 * (Cấp 1 has no cắt lỗ/chốt lời — that's Cấp 2), a khối cảm xúc shown only for
 * lệnh "có chuyện", a 6-template coach (A-F, `coachTemplateCap1`) and the
 * 3-dòng "HỒ SƠ CỦA BẠN" personalisation block.
 */
export interface KetsoDataCap1 {
  /** Kết sổ # (spec "KẾT SỔ LỆNH · #{n}"). */
  n: number
  /** `virtual_orders.id` of the SELL order — the key `POST /cap1/ketso` takes. */
  orderId: string
  symbol: string
  quantity: number
  /** Giá vào thật (khớp lệnh mua). */
  entryPrice: number
  /** Giá ra thật (khớp lệnh bán). */
  exitPrice: number
  /** Vùng mua đã cam kết ở Form Kế hoạch (`order_kehoach.vung_mua`). */
  vungMua: number
  lyDo: LyDo
  /** AI Thanh tra verdict captured at BUY time (`order_kehoach.trangThai_luc_dat`). */
  trangThaiLucDat: TrangThaiLucDat
  /** `YYYY-MM-DD` (ngày khớp lệnh mua). */
  buyDate: string
  /** `YYYY-MM-DD` (ngày khớp lệnh bán). */
  sellDate: string
}

export interface KetsoModalCap1Props {
  /** `null` → modal is closed/unmounted. */
  data: KetsoDataCap1 | null
  /** Progress row, for the "HỒ SƠ CỦA BẠN" tiến-trình lines. */
  progress: Cap1Progress | null
  /** Closed-trade history (`useCap1TradeLog`), for the per-lý-do stat line. */
  trades: Cap1TradeRecord[]
  onClose: () => void
  /** Called once with this order's record so the caller can append it to the trade log. */
  onRecorded?: (record: Cap1TradeRecord) => void
}

const MS_PER_DAY = 86_400_000

function parseYmd(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`)
}

/**
 * Số phiên giữ lệnh — trading days (Mon-Fri) strictly AFTER the buy date up to
 * and including the sell date, so a same-day round trip is 0 phiên (spec §6's
 * "bán trong vòng 1 phiên sau mua"). Mirrors the backend's Mon-Fri-only rule
 * (no VN holiday calendar wired in yet — see the BE1 report).
 */
export function countTradingSessions(buyDate: string, sellDate: string): number {
  const start = parseYmd(buyDate).getTime()
  const end = parseYmd(sellDate).getTime()
  let sessions = 0
  for (let t = start + MS_PER_DAY; t <= end; t += MS_PER_DAY) {
    const day = new Date(t).getUTCDay()
    if (day !== 0 && day !== 6) sessions += 1
  }
  return sessions
}

/** Số ngày lịch giữa mua và bán (calendar days, not trading days). */
export function countCalendarDays(buyDate: string, sellDate: string): number {
  const diff = parseYmd(sellDate).getTime() - parseYmd(buyDate).getTime()
  return Math.max(0, Math.round(diff / MS_PER_DAY))
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

function lyDoLabel(lyDo: LyDo): string {
  const opt = LY_DO_OPTIONS.find((o) => o.value === lyDo)
  return opt ? `${opt.icon} ${opt.label}` : lyDo
}

function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/** `+1.9%` / `−11.0%` / `0.0%` — typographic minus "−" (U+2212), as Cấp 0. */
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

/** spec §6 "có chuyện": lỗ >−7% · giữ >10 phiên · bán trong vòng 1 phiên sau mua. */
export function isLenhCoChuyen(params: { pnlPct: number; soPhienGiu: number }): boolean {
  return params.pnlPct < -7 || params.soPhienGiu > 10 || params.soPhienGiu < 1
}

/** Tổng số lệnh Thực chiến cần để xét tốt nghiệp Cấp 1 (nhiệm vụ ⑤). */
const TARGET_ORDERS = 10

/**
 * Nhiệm vụ gửi kèm cú ping tính lại sau khi kết sổ (xem `handleClose`).
 * `PATCH /cap1/task` giờ là recompute THUẦN — mọi `task_no` 1-5 đều chạy cùng
 * một phép tính — nhưng gửi đúng cái đang lệch (⑤ «10 lệnh Thực chiến») thì log
 * server đọc mới có nghĩa.
 */
const NHIEM_VU_CAN_TINH_LAI = 5
/** Số lệnh cùng một lý do cần có trước khi dòng 3 nêu thống kê riêng. */
const MIN_TRADES_FOR_STAT = 2

const COUNT_UP_MS = 1000
const COUNT_UP_STEP_MS = 40

export function KetsoModalCap1({
  data,
  progress,
  trades,
  onClose,
  onRecorded,
}: KetsoModalCap1Props) {
  const recordKetso = useRecordKetso()
  const markTask = useCompleteCap1Task()
  const { isCap1Active } = useCap1Events()
  const [emotion, setEmotion] = useState<CamXuc | null>(null)
  const [displayPct, setDisplayPct] = useState(0)

  const entryPrice = data?.entryPrice ?? 0
  const exitPrice = data?.exitPrice ?? 0
  const quantity = data?.quantity ?? 0
  const pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0
  const pnlVnd = (exitPrice - entryPrice) * quantity

  // Reset per-order state + run the ~1s count-up whenever a NEW kết sổ opens.
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
    // Only when a genuinely new kết sổ opens (pnlPct is derived from `data`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.n, data?.orderId])

  if (!data) return null

  const { n, orderId, symbol, vungMua, lyDo, trangThaiLucDat, buyDate, sellDate } = data
  const soPhienGiu = countTradingSessions(buyDate, sellDate)
  const pnlPositive = pnlVnd > 0
  const tax = Math.round(exitPrice * quantity * 0.001)
  const coChuyen = isLenhCoChuyen({ pnlPct, soPhienGiu })

  const coach = coachTemplateCap1(
    { pnlPositive, trangThaiLucDat, soPhienGiu },
    { pnlPct, lyDo, soPhienGiu, emotion },
  )

  // ── 3 dòng "HỒ SƠ CỦA BẠN" (spec §6) ──────────────────────────────────────
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
    // ★★ Kích hoạt lại phép tính của server SAU KHI kết sổ ★★
    // `Cap1Service.record_ketso` KHÔNG gọi `_recompute_counters` (chỉ
    // `record_kehoach` và `mark_task` gọi), trong khi `so_lenh_thuc_chien` đếm
    // MỌI lệnh Thực chiến đã khớp — kể cả lệnh BÁN vừa rồi. Thiếu cú ping này
    // thì nhiệm vụ ⑤ «10 lệnh Thực chiến» trễ đúng một lệnh bán: người bán lệnh
    // thứ 10 vẫn thấy 9/10 và màn tốt nghiệp chỉ mở ra khi họ tình cờ đặt thêm
    // một lệnh MUA nữa.
    //
    // Ping nằm trong `onSettled` chứ KHÔNG bắn song song: nhiệm vụ ② («Kết sổ
    // đầu tiên») suy từ chính dòng ketso, nên recompute chạy TRƯỚC khi POST
    // ketso kịp ghi là đếm hụt nó — hai mutate cạnh nhau không có thứ tự đảm
    // bảo (test đã bắt được đúng ca đảo). `onSettled` (không phải `onSuccess`)
    // để cú ping vẫn chạy kể cả khi POST ketso hỏng — recompute thuần, vô hại.
    // Vẫn là fire-and-forget với modal: `mutate` không chặn việc đóng.
    recordKetso.mutate(
      { order_id: orderId, cam_xuc: emotion },
      { onSettled: () => { if (isCap1Active) markTask.mutate(NHIEM_VU_CAN_TINH_LAI) } },
    )
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

      <div className="cap1-ketso-section-label">Đối chiếu kế hoạch với thực tế</div>

      <table className="cap0-debrief-table">
        <thead>
          <tr>
            <th></th>
            <th>Kế hoạch</th>
            <th>Thực tế</th>
          </tr>
        </thead>
        <tbody>
          {/* Lý do + Trạng thái không có vế "Thực tế" (spec §6 bảng: cột phải là
              "—") → trải ngang 2 cột như mockup thay vì vẽ một ô "—" trống. */}
          <tr>
            <td>Lý do</td>
            <td colSpan={2}>{lyDoLabel(lyDo)}</td>
          </tr>
          <tr>
            <td>Trạng thái lớp lúc đặt</td>
            <td colSpan={2}>{TRANG_THAI_LABEL[trangThaiLucDat]}</td>
          </tr>
          <tr>
            <td>Vùng mua</td>
            <td>{fmtVnd(vungMua)}</td>
            <td>{fmtVnd(entryPrice)}</td>
          </tr>
          <tr>
            <td>Giá ra · thuế</td>
            <td>—</td>
            <td>
              {fmtVnd(exitPrice)} · <span className="text-down">{fmtVnd(tax)}</span>
            </td>
          </tr>
          <tr>
            <td>Thời gian giữ</td>
            <td>—</td>
            <td>{`${soPhienGiu} phiên`}</td>
          </tr>
        </tbody>
      </table>

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
        <p className="cap0-debrief-coach-body">{coach}</p>
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
