import { Select } from "@arco-design/web-react"
import type { RiskInput } from "../types"

interface Props {
  risk: RiskInput
  onChange: (patch: Partial<RiskInput>) => void
}

const labelCls = "mb-1 block text-[11px] text-[var(--color-text-3)]"

const STOP_OPTIONS = [
  { label: "3% (chặt)", value: "0.03" },
  { label: "5% (cân bằng)", value: "0.05" },
  { label: "8% (rộng)", value: "0.08" },
  { label: "10% (rất rộng)", value: "0.10" },
]

const TP_OPTIONS = [
  { label: "10%", value: "0.10" },
  { label: "15%", value: "0.15" },
  { label: "20%", value: "0.20" },
  { label: "30%", value: "0.30" },
  { label: "Theo tín hiệu", value: "null" },
]

const HOLDING_OPTIONS = [
  { label: "1 tháng", value: "20" },
  { label: "3 tháng", value: "60" },
  { label: "6 tháng", value: "120" },
  { label: "Không giới hạn", value: "null" },
]

const SIZE_OPTIONS = [
  { label: "10% (an toàn)", value: "tenth" },
  { label: "25%", value: "quarter" },
  { label: "50% (cân bằng)", value: "half" },
  { label: "100% (mạo hiểm)", value: "all" },
]

const FEE_OPTIONS = [
  { label: "Chuẩn theo CTCK", value: "standard" },
  { label: "Không phí", value: "none" },
]

export function RiskConfig({ risk, onChange }: Props) {
  const stopValue = String(risk.stop_fixed_pct ?? 0.05)
  const tpValue = risk.take_profit_pct == null ? "null" : String(risk.take_profit_pct)
  const holdingValue = risk.max_holding == null ? "null" : String(risk.max_holding)

  return (
    <div className="rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
        Quản trị rủi ro
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-3.5 md:grid-cols-3">
        <div>
          <label className={labelCls}>Cắt lỗ khi giá giảm</label>
          <Select
            value={stopValue}
            options={STOP_OPTIONS}
            onChange={(v: string) =>
              onChange({ stop_loss: "fixed", stop_fixed_pct: Number(v) })
            }
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label className={labelCls}>Chốt lời khi giá tăng</label>
          <Select
            value={tpValue}
            options={TP_OPTIONS}
            onChange={(v: string) =>
              onChange({ take_profit_pct: v === "null" ? null : Number(v) })
            }
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label className={labelCls}>Thời gian giữ tối đa</label>
          <Select
            value={holdingValue}
            options={HOLDING_OPTIONS}
            onChange={(v: string) =>
              onChange({ max_holding: v === "null" ? null : Number(v) })
            }
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label className={labelCls}>Số vốn mỗi lệnh</label>
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
      <p className="mt-3 flex items-center gap-1 text-[11px] text-[var(--color-text-3)]">
        <span aria-hidden="true">ⓘ</span>
        Hệ thống đã tự động tính phí, thuế và quy định T+2.5 của TTCK Việt Nam
      </p>
    </div>
  )
}
