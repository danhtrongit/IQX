import { useEffect, useState } from "react"
import { Modal } from "@arco-design/web-react"
import { cn } from "@/shared/lib/cn"
import { useCap0Kehoach, useCompleteTask } from "./hooks"
import "./cap0.css"

/**
 * Everything the debrief needs about the just-closed order (spec v3.0 §5).
 *
 * v2.2 also carried `sl`/`tp` — the Kế hoạch cắt lỗ/chốt lời shown or typed at
 * BUY time, which the trading backend never persists, so the FE ferried them
 * over the Cấp 0 event bus. v3.0 removes cắt lỗ/chốt lời from Cấp 0 entirely,
 * so there is nothing to ferry and nothing to reconcile: the Kết sổ compares
 * lý do + giá vào + giá ra + thời gian giữ (§5's own table).
 */
export interface DebriefData {
  /** Kết sổ # (spec "KẾT SỔ LỆNH · #{n}") — 1-based, per Cấp 0 session. */
  n: number
  symbol: string
  quantity: number
  entryPrice: number
  exitPrice: number
  /**
   * `virtual_orders.id` of the BUY that opened this round trip — the order
   * `entryPrice` came from, and the key the `Lý do mua` / `Thời gian giữ` rows
   * are read under (`GET /cap0/kehoach?order_id=`).
   *
   * ★ NOT the sell order (Cấp 1's `KetsoDataCap1.orderId` is its sell, because
   * `POST /cap1/ketso` keys on that; the Cấp 0 chip is filed at BUY time).
   * `null` when the buy is unknown — a live sell whose buy happened in an
   * earlier session, before `Gbar`'s per-symbol map was populated. Both rows
   * then read "—", which is the truth: nothing here can name that order.
   */
  buyOrderId: string | null
}

export interface DebriefModalProps {
  /** `null` → modal is closed/unmounted. */
  data: DebriefData | null
  onClose: () => void
}

function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/** `+10.0%` / `−5.0%` / `0.0%` — spec's literal minus glyph "−", not a hyphen. */
function fmtPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${Math.abs(rounded).toFixed(1)}%`
}

/**
 * Signed VND amount using the SAME typographic minus "−" (U+2212) as
 * `fmtPct` — `Number.prototype.toLocaleString`'s own negative formatting
 * uses a plain ASCII hyphen, which would otherwise read inconsistently next
 * to the P&L percentage's "−" right above it.
 */
function fmtVndSigned(n: number): string {
  const rounded = Math.round(n)
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${fmtVnd(Math.abs(rounded))}đ`
}

/** The table's own "we don't know / not applicable" glyph (spec §5's own `—`). */
const UNKNOWN = "—"

/**
 * `Thời gian giữ` in words (spec §5's `(số phiên)` column).
 *
 * ★ **0 is the COMMON case in Cấp 0**, not an edge case: Sân tập is T+0, so a
 * user who buys and sells in one sitting genuinely held the position for zero
 * completed phiên. Task 1's backend deliberately does not floor `so_phien_giu`
 * to 1 — that would be a fabricated number — so this must not print the
 * nonsense "0 phiên"/"Giữ 0 phiên" either. It says what actually happened.
 * `null`/`undefined` (no `cap0_order_kehoach` row) stays honestly unknown.
 */
function holdTimeText(soPhienGiu: number | null | undefined): string | null {
  if (soPhienGiu == null) return null
  return soPhienGiu > 0 ? `${soPhienGiu} phiên` : "Trong cùng phiên"
}

const COUNT_UP_MS = 1000
const COUNT_UP_STEP_MS = 40

/**
 * Màn Kết sổ Cấp 0 (spec v3.0 §5) — opened by `Gbar` when a SELL order fills
 * (nhiệm vụ ④). Header + big count-up P&L + Kế hoạch/Thực tế table (giá vào /
 * giá ra + thuế bán 0,1%) + "Đóng kết sổ ✓" — which fires
 * `completeTask(4, "debrief")`, **the single behaviour gate of the whole
 * level** ("4/4 nhiệm vụ + 1 cổng hành vi (④ đóng màn kết sổ)").
 * KHÔNG hỏi cảm xúc (spec, explicit).
 *
 * ★ Khối coach "NHÌN LẠI" (2 mẫu lãi/lỗ) đã bỏ theo yêu cầu điều chỉnh; Cấp 0
 * không còn `coachTemplate`. Cấp 1+ giữ lớp coach của riêng chúng.
 *
 * ★ Đây là nhiệm vụ ⑤ cũ; nó lùi về ④ khi Chặng 2 (ba tour sản phẩm) bị bỏ khỏi
 * Cấp 0. Gửi `taskNo: 5` bây giờ là gửi một nhiệm vụ không tồn tại.
 */
export function DebriefModal({ data, onClose }: DebriefModalProps) {
  const completeTask = useCompleteTask()
  // §5's `Lý do mua` + `Thời gian giữ` are the only two rows NOT derivable from
  // the sell fill itself — they come from the `cap0_order_kehoach` row written
  // at BUY time (`TradingPanel`), read back for THAT buy order. `null` (modal
  // closed, or an unknown buy) disables it.
  //
  // ★ Keyed on the order, not on `data.symbol`: the symbol-keyed read answered
  // with the mã's most recent buy, so a user who re-entered VNM after this round
  // trip saw the NEW order's chip and hold time next to THIS one's prices.
  const { data: kehoach } = useCap0Kehoach(data?.buyOrderId ?? null)
  const [displayPct, setDisplayPct] = useState(0)

  const entryPrice = data?.entryPrice ?? 0
  const exitPrice = data?.exitPrice ?? 0
  const quantity = data?.quantity ?? 0
  const pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0
  const pnlVnd = (exitPrice - entryPrice) * quantity

  // Count-up ~1s (spec "count-up nhẹ ~1s") — resets whenever a NEW debrief
  // (`data.n` changes) opens; skipped entirely once `data` is null.
  useEffect(() => {
    if (!data) {
      setDisplayPct(0)
      return
    }
    const start = Date.now()
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / COUNT_UP_MS)
      setDisplayPct(pnlPct * t)
      if (t < 1) timer = setTimeout(tick, COUNT_UP_STEP_MS)
    }
    tick()
    return () => clearTimeout(timer)
    // Only re-run when a genuinely new debrief opens, not on every pnlPct
    // recompute (pnlPct is derived from `data` itself every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.n])

  if (!data) return null

  const { n, symbol } = data
  const pnlPositive = pnlVnd > 0
  const tax = Math.round(exitPrice * quantity * 0.001)
  const holdText = holdTimeText(kehoach?.so_phien_giu)
  // Mockup sub-line: `+198.000đ · MUA 100 VNM → BÁN · Giữ 4 phiên`. The suffix
  // is dropped entirely when nothing was recorded — better a shorter true line
  // than a padded one.
  const holdSuffix =
    holdText == null ? "" : ` · ${(kehoach?.so_phien_giu ?? 0) > 0 ? `Giữ ${holdText}` : holdText}`

  const handleClose = () => {
    completeTask.mutate({ taskNo: 4, gate: "debrief" })
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
        width: 460,
        maxWidth: "calc(100vw - 32px)",
        background: "var(--bg2)",
        border: "1px solid var(--bd)",
        borderRadius: 16,
      }}
    >
      <div className="cap0-debrief-head">
        <div className="cap0-debrief-tag">{`KẾT SỔ LỆNH · #${n} · SÂN TẬP`}</div>

        <div
          className={cn(
            "cap0-display cap0-debrief-pnl tabular-nums",
            pnlPositive ? "text-up" : "text-down",
          )}
        >
          {fmtPct(displayPct)}
        </div>

        <div className="cap0-debrief-sub">
          {`${fmtVndSigned(pnlVnd)} · MUA ${quantity} ${symbol} → BÁN${holdSuffix}`}
        </div>
      </div>

      <div className="cap0-debrief-section-label">Đối chiếu</div>

      <table className="cap0-debrief-table">
        <thead>
          <tr>
            <th></th>
            <th>Kế hoạch</th>
            <th>Thực tế</th>
          </tr>
        </thead>
        <tbody>
          {/* `Lý do mua` spans Kế hoạch + Thực tế (mockup) — a reason has no
              "thực tế" counterpart, so a second cell could only ever hold a
              filler "—". `ly_do_label` is the verbatim §4 chip the user picked
              at BUY time; `—` when nothing was recorded, never a guess. */}
          <tr>
            <td>Lý do mua</td>
            <td colSpan={2}>{kehoach?.ly_do_label ?? UNKNOWN}</td>
          </tr>
          <tr>
            <td>Giá vào</td>
            <td>{fmtVnd(entryPrice)}</td>
            <td>{fmtVnd(entryPrice)}</td>
          </tr>
          {/* v2.2's "Cắt lỗ" / "Chốt lời" rows are DELETED here, not blanked:
              spec v3.0 §5's table is Lý do mua / Giá vào / Giá ra · thuế /
              Thời gian giữ. With no thresholds in Cấp 0 there is no verdict to
              state and no honest "không ghi nhận" fallback to need.
              The label is the SHORT form both mockups use (and the one Cấp 1's
              Kết sổ already ships). */}
          <tr>
            <td>Giá ra · thuế</td>
            <td>{UNKNOWN}</td>
            <td>
              {fmtVnd(exitPrice)} · <span className="text-down">{fmtVnd(tax)}</span>
            </td>
          </tr>
          <tr>
            <td>Thời gian giữ</td>
            <td>{UNKNOWN}</td>
            <td>{holdText ?? UNKNOWN}</td>
          </tr>
        </tbody>
      </table>

      <button type="button" className="cap0-debrief-close" onClick={handleClose}>
        Đóng kết sổ ✓
      </button>
    </Modal>
  )
}
