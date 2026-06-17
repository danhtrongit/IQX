import type { RiskInput } from "../types"

interface Props {
  risk: RiskInput
  onChange: (patch: Partial<RiskInput>) => void
}

const labelCls = "mb-1 block text-[11px] text-[var(--color-text-3)]"
const fieldCls =
  "w-full rounded border border-[var(--color-border-2)] bg-[var(--color-bg-1)] px-2 py-1.5 text-[12px] text-[var(--color-text-1)] outline-none focus:border-[rgb(var(--primary-6))]"

/** Encode/decode the stop-loss preset into a single <select> value. */
function stopValue(r: RiskInput): string {
  if (r.stop_loss === "none") return "none"
  if (r.stop_loss === "fixed") return `fixed:${r.stop_fixed_pct}`
  return `atr:${r.stop_atr_mult}`
}

export function RiskConfig({ risk, onChange }: Props) {
  return (
    <div className="rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
        Quản trị rủi ro
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-3.5 md:grid-cols-3">
        <div>
          <label className={labelCls}>Cắt lỗ (Stop loss)</label>
          <select
            className={fieldCls}
            value={stopValue(risk)}
            onChange={(e) => {
              const v = e.target.value
              if (v === "none") onChange({ stop_loss: "none" })
              else if (v.startsWith("fixed:")) onChange({ stop_loss: "fixed", stop_fixed_pct: Number(v.split(":")[1]) })
              else onChange({ stop_loss: "atr", stop_atr_mult: Number(v.split(":")[1]) })
            }}
          >
            <option value="atr:2">2.0× ATR</option>
            <option value="atr:1.5">1.5× ATR</option>
            <option value="atr:3">3.0× ATR</option>
            <option value="fixed:0.05">Cố định 5%</option>
            <option value="none">Không có</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Chốt lời (Take profit)</label>
          <select
            className={fieldCls}
            value={risk.take_profit_pct == null ? "null" : String(risk.take_profit_pct)}
            onChange={(e) =>
              onChange({ take_profit_pct: e.target.value === "null" ? null : Number(e.target.value) })
            }
          >
            <option value="null">Không (theo signal)</option>
            <option value="0.1">10%</option>
            <option value="0.15">15%</option>
            <option value="0.2">20%</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Max holding (phiên)</label>
          <input
            type="number"
            className={fieldCls}
            value={risk.max_holding ?? ""}
            onChange={(e) =>
              onChange({ max_holding: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </div>
        <div>
          <label className={labelCls}>Khối lượng lệnh</label>
          <select
            className={fieldCls}
            value={risk.position_size}
            onChange={(e) => onChange({ position_size: e.target.value as RiskInput["position_size"] })}
          >
            <option value="all">100% vốn còn lại</option>
            <option value="half">50% vốn còn lại</option>
            <option value="fixed">Cố định 10tr/lệnh</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Phí giao dịch</label>
          <select
            className={fieldCls}
            value={risk.fee}
            onChange={(e) => onChange({ fee: e.target.value as RiskInput["fee"] })}
          >
            <option value="standard">Chuẩn (0.15% + 0.1%)</option>
            <option value="low">Thấp (0.10%)</option>
          </select>
        </div>
      </div>
    </div>
  )
}
