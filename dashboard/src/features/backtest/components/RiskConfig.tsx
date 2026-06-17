import { InputNumber, Select } from "@arco-design/web-react"
import type { RiskInput } from "../types"

interface Props {
  risk: RiskInput
  onChange: (patch: Partial<RiskInput>) => void
}

const labelCls = "mb-1 block text-[11px] text-[var(--color-text-3)]"

const STOP_OPTIONS = [
  { label: "2.0× ATR", value: "atr:2" },
  { label: "1.5× ATR", value: "atr:1.5" },
  { label: "3.0× ATR", value: "atr:3" },
  { label: "Cố định 5%", value: "fixed:0.05" },
  { label: "Không có", value: "none" },
]
const TP_OPTIONS = [
  { label: "Không (theo signal)", value: "null" },
  { label: "10%", value: "0.1" },
  { label: "15%", value: "0.15" },
  { label: "20%", value: "0.2" },
]
const SIZE_OPTIONS = [
  { label: "100% vốn còn lại", value: "all" },
  { label: "50% vốn còn lại", value: "half" },
  { label: "Cố định 10tr/lệnh", value: "fixed" },
]
const FEE_OPTIONS = [
  { label: "Chuẩn (0.15% + 0.1%)", value: "standard" },
  { label: "Thấp (0.10%)", value: "low" },
]

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
          <Select
            value={stopValue(risk)}
            options={STOP_OPTIONS}
            onChange={(v: string) => {
              if (v === "none") onChange({ stop_loss: "none" })
              else if (v.startsWith("fixed:")) onChange({ stop_loss: "fixed", stop_fixed_pct: Number(v.split(":")[1]) })
              else onChange({ stop_loss: "atr", stop_atr_mult: Number(v.split(":")[1]) })
            }}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label className={labelCls}>Chốt lời (Take profit)</label>
          <Select
            value={risk.take_profit_pct == null ? "null" : String(risk.take_profit_pct)}
            options={TP_OPTIONS}
            onChange={(v: string) => onChange({ take_profit_pct: v === "null" ? null : Number(v) })}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label className={labelCls}>Max holding (phiên)</label>
          <InputNumber
            value={risk.max_holding ?? undefined}
            min={1}
            onChange={(v) => onChange({ max_holding: v == null ? null : Number(v) })}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label className={labelCls}>Khối lượng lệnh</label>
          <Select
            value={risk.position_size}
            options={SIZE_OPTIONS}
            onChange={(v: RiskInput["position_size"]) => onChange({ position_size: v })}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label className={labelCls}>Phí giao dịch</label>
          <Select
            value={risk.fee}
            options={FEE_OPTIONS}
            onChange={(v: RiskInput["fee"]) => onChange({ fee: v })}
            style={{ width: "100%" }}
          />
        </div>
      </div>
    </div>
  )
}
