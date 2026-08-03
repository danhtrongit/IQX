import { useEffect, useState } from "react"
import { Modal } from "@arco-design/web-react"
import { cn } from "@/shared/lib/cn"
import { useCompleteTask } from "./hooks"
import { coachTemplate } from "./coachTemplate"
import "./cap0.css"

/**
 * Everything the debrief needs about the just-closed order (spec §5). `sl`/
 * `tp` are the Kế hoạch values shown/typed at BUY time — `undefined` when
 * unknown (defensive: e.g. a sell with no captured prior buy in this
 * session), rendered as "—" rather than a crash.
 */
export interface DebriefData {
  /** Kết sổ # (spec "KẾT SỔ LỆNH · #{n}") — 1-based, per Cấp 0 session. */
  n: number
  symbol: string
  quantity: number
  entryPrice: number
  exitPrice: number
  sl?: number
  tp?: number
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
  return `${sign}${fmtVnd(Math.abs(rounded))} ₫`
}

/** Splits on the spec's own `**bold**` markers and renders them as `<strong>`. */
function renderInlineBold(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

const COUNT_UP_MS = 1000
const COUNT_UP_STEP_MS = 40

/**
 * Màn Kết sổ Cấp 0 (spec §5) — opened by `Gbar` when a SELL order fills
 * (nhiệm vụ ⑥). Header + big count-up P&L + Kế hoạch/Thực tế table (giá
 * vào/cắt lỗ/chốt lời/giá ra + thuế bán 0,1%) + 1-of-4 rule-based coach block
 * + "Đóng kết sổ ✓" (cổng chất lượng 2 → `completeTask(6, "debrief")`).
 * KHÔNG hỏi cảm xúc (spec, explicit).
 */
export function DebriefModal({ data, onClose }: DebriefModalProps) {
  const completeTask = useCompleteTask()
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

  const { n, symbol, sl, tp } = data
  const pnlPositive = pnlVnd > 0
  const hitSL = sl != null && exitPrice <= sl
  const hitTP = tp != null && exitPrice >= tp
  const tax = Math.round(exitPrice * quantity * 0.001)
  // `slKnown: sl != null` — with no recorded cắt lỗ, template D ("Bán khi chưa
  // chạm cắt lỗ") would accuse the user about a threshold we have no data for.
  // See `coachTemplate`'s `slKnown` docstring and `retroDebrief.ts`.
  const coach = coachTemplate({ pnlPositive, hitSL, hitTP, slKnown: sl != null }, n)
  const slPct = sl != null && entryPrice > 0 ? ((sl - entryPrice) / entryPrice) * 100 : null
  const tpPct = tp != null && entryPrice > 0 ? ((tp - entryPrice) / entryPrice) * 100 : null

  const handleClose = () => {
    completeTask.mutate({ taskNo: 6, gate: "debrief" })
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
        {`${fmtVndSigned(pnlVnd)} · MUA ${quantity} ${symbol} → BÁN`}
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
            <td>Giá vào</td>
            <td>{fmtVnd(entryPrice)}</td>
            <td>{fmtVnd(entryPrice)}</td>
          </tr>
          {/* "Thực tế" only ever states a verdict about a threshold we ACTUALLY
              have. With no Kế hoạch recorded, "không chạm" / "chưa tới — bán
              tay" would assert that a stop/target existed and the user missed
              it — false for a Kết sổ rebuilt from order history, where sl/tp
              are genuinely unknown (the trading backend never persists them).
              See `retroDebrief.ts`. */}
          <tr>
            <td>Cắt lỗ</td>
            <td>{sl != null ? `${fmtVnd(sl)} · ${fmtPct(slPct ?? 0)}` : "—"}</td>
            <td>{sl != null ? (hitSL ? "chạm" : "không chạm") : "không ghi nhận"}</td>
          </tr>
          <tr>
            <td>Chốt lời</td>
            <td>{tp != null ? `${fmtVnd(tp)} · ${fmtPct(tpPct ?? 0)}` : "—"}</td>
            <td>
              {tp != null ? (hitTP ? "chạm mục tiêu ✓" : "chưa tới — bán tay") : "không ghi nhận"}
            </td>
          </tr>
          <tr>
            <td>Giá ra · thuế bán 0,1%</td>
            <td>—</td>
            <td>
              {fmtVnd(exitPrice)} · <span className="text-down">{fmtVnd(tax)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="cap0-debrief-coach">
        <div className="cap0-debrief-coach-tag">NHÌN LẠI</div>
        <p className="cap0-debrief-coach-body">{renderInlineBold(coach)}</p>
      </div>

      <button type="button" className="cap0-debrief-close" onClick={handleClose}>
        Đóng kết sổ ✓
      </button>
    </Modal>
  )
}
