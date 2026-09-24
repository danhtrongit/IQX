/**
 * Quản trị rủi ro của backtest — port từ
 * `dashboard/src/features/backtest/components/RiskConfig.tsx`, mở rộng cho đủ
 * các preset mà `GET /backtest/catalog` trả về.
 *
 * Thứ tự ưu tiên: nhãn và mức của preset API (`risk_presets`) đứng trước, sau đó
 * bổ sung các mức mà bản dashboard cũ vẫn cho chọn nhưng preset API không có
 * (cắt lỗ 3%/8%/10%, chốt lời 30%, vị thế 10%/25%, không phí). Nếu cấu hình
 * đang mở (ví dụ từ mẫu chiến lược) mang giá trị ngoài danh sách, giá trị đó
 * vẫn được hiển thị nguyên trạng thay vì bị đổi ngầm.
 */
import { Info } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { parseMoney } from "../format"
import type { RiskInput, RiskPresetOption, RiskPresets } from "../types"

type Option = { value: string; label: string }

const LABEL_CLASS = "text-[11px] text-muted-foreground"

/** Mức bổ sung của bản dashboard cũ, dùng khi preset API không phủ. */
const LEGACY_STOP: Option[] = [
  { value: "fixed:0.03", label: "3% (chặt)" },
  { value: "fixed:0.05", label: "5% (cân bằng)" },
  { value: "fixed:0.08", label: "8% (rộng)" },
  { value: "fixed:0.1", label: "10% (rất rộng)" },
]

const LEGACY_TAKE_PROFIT: Option[] = [
  { value: "0.3", label: "30%" },
  { value: "null", label: "Theo tín hiệu" },
]

const LEGACY_POSITION_SIZE: Option[] = [
  { value: "tenth", label: "10% (an toàn)" },
  { value: "quarter", label: "25%" },
  { value: "half", label: "50% (cân bằng)" },
  { value: "all", label: "100% (mạo hiểm)" },
]

const LEGACY_FEE: Option[] = [{ value: "none", label: "Không phí" }]

const HOLDING_OPTIONS: Option[] = [
  { value: "20", label: "1 tháng (20 phiên)" },
  { value: "60", label: "3 tháng (60 phiên)" },
  { value: "120", label: "6 tháng (120 phiên)" },
  { value: "null", label: "Không giới hạn" },
]

/**
 * Gộp preset API với mức bổ sung, giữ nguyên thứ tự API và không lặp giá trị.
 * `encode` biến một preset API thành giá trị chọn được; preset không mã hoá được
 * (thiếu tham số) bị bỏ qua vì UI không thể gửi đúng cấu hình đó.
 */
function mergeOptions(
  presets: RiskPresetOption[],
  encode: (preset: RiskPresetOption) => Option | null,
  legacy: Option[],
): Option[] {
  const options: Option[] = []
  const seen = new Set<string>()
  const push = (option: Option) => {
    if (seen.has(option.value)) return
    seen.add(option.value)
    options.push(option)
  }
  for (const preset of presets) {
    const option = encode(preset)
    if (option) push(option)
  }
  for (const option of legacy) push(option)
  return options
}

/** Giá trị đang chọn luôn phải có trong danh sách để Select hiển thị đúng. */
function withCurrent(options: Option[], current: string, label: string): Option[] {
  return options.some((option) => option.value === current)
    ? options
    : [{ value: current, label }, ...options]
}

function stopLossValue(risk: RiskInput): string {
  if (risk.stopLoss === "none") return "none"
  if (risk.stopLoss === "atr") return `atr:${risk.stopAtrMult}`
  return `fixed:${risk.stopFixedPct}`
}

function stopLossLabel(risk: RiskInput): string {
  if (risk.stopLoss === "atr") return `${risk.stopAtrMult}× ATR`
  if (risk.stopLoss === "none") return "Không cắt lỗ"
  return `${(risk.stopFixedPct * 100).toFixed(1)}%`
}

/** `atr:2` / `fixed:0.05` / `none` → patch cho `RiskInput`. */
function stopLossPatch(value: string): Partial<RiskInput> {
  if (value === "none") return { stopLoss: "none" }
  const [mode, parameter] = value.split(":")
  if (mode === "atr") return { stopLoss: "atr", stopAtrMult: Number(parameter) }
  return { stopLoss: "fixed", stopFixedPct: Number(parameter) }
}

export function RiskConfig({
  risk,
  presets,
  onChange,
}: {
  risk: RiskInput
  presets: RiskPresets
  onChange: (patch: Partial<RiskInput>) => void
}) {
  const stopOptions = withCurrent(
    mergeOptions(
      presets.stopLoss,
      (preset) =>
        preset.value === "atr" && preset.mult != null
          ? { value: `atr:${preset.mult}`, label: preset.label }
          : preset.value === "fixed" && preset.pct != null
            ? { value: `fixed:${preset.pct}`, label: preset.label }
            : preset.value === "none"
              ? { value: "none", label: preset.label }
              : null,
      LEGACY_STOP,
    ),
    stopLossValue(risk),
    stopLossLabel(risk),
  )

  const takeProfitOptions = withCurrent(
    mergeOptions(
      presets.takeProfit,
      (preset) =>
        preset.value === null
          ? { value: "null", label: preset.label }
          : typeof preset.value === "number"
            ? { value: String(preset.value), label: preset.label }
            : null,
      LEGACY_TAKE_PROFIT,
    ),
    risk.takeProfitPct == null ? "null" : String(risk.takeProfitPct),
    risk.takeProfitPct == null ? "Theo tín hiệu" : `${(risk.takeProfitPct * 100).toFixed(1)}%`,
  )

  const holdingOptions = withCurrent(
    HOLDING_OPTIONS,
    risk.maxHolding == null ? "null" : String(risk.maxHolding),
    risk.maxHolding == null ? "Không giới hạn" : `${risk.maxHolding} phiên`,
  )

  const sizeOptions = withCurrent(
    mergeOptions(
      presets.positionSize,
      (preset) =>
        typeof preset.value === "string" ? { value: preset.value, label: preset.label } : null,
      LEGACY_POSITION_SIZE,
    ),
    risk.positionSize,
    risk.positionSize === "fixed" ? "Cố định mỗi lệnh" : risk.positionSize,
  )

  const feeOptions = withCurrent(
    mergeOptions(
      presets.fee,
      (preset) =>
        typeof preset.value === "string" ? { value: preset.value, label: preset.label } : null,
      LEGACY_FEE,
    ),
    risk.fee,
    risk.fee,
  )

  return (
    <div className="rounded-lg bg-card p-4">
      <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Quản trị rủi ro
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-3.5 md:grid-cols-3">
        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Cắt lỗ khi giá giảm</Label>
          <Select value={stopLossValue(risk)} onValueChange={(value) => onChange(stopLossPatch(value))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stopOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Chốt lời khi giá tăng</Label>
          <Select
            value={risk.takeProfitPct == null ? "null" : String(risk.takeProfitPct)}
            onValueChange={(value) =>
              onChange({ takeProfitPct: value === "null" ? null : Number(value) })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {takeProfitOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Thời gian giữ tối đa</Label>
          <Select
            value={risk.maxHolding == null ? "null" : String(risk.maxHolding)}
            onValueChange={(value) =>
              onChange({ maxHolding: value === "null" ? null : Number(value) })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {holdingOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Số vốn mỗi lệnh</Label>
          <Select
            value={risk.positionSize}
            onValueChange={(value) => onChange({ positionSize: value as RiskInput["positionSize"] })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sizeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className={LABEL_CLASS}>Phí giao dịch</Label>
          <Select
            value={risk.fee}
            onValueChange={(value) => onChange({ fee: value as RiskInput["fee"] })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {feeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {risk.stopLoss === "atr" && (
          <div className="space-y-1">
            <Label className={LABEL_CLASS}>Bội số ATR</Label>
            <Input
              type="number"
              inputMode="decimal"
              step={0.1}
              min={0.1}
              value={risk.stopAtrMult}
              onChange={(event) => onChange({ stopAtrMult: Number(event.target.value) })}
              className="font-mono tabular-nums"
            />
          </div>
        )}

        {risk.stopLoss === "fixed" && (
          <div className="space-y-1">
            <Label className={LABEL_CLASS}>Cắt lỗ cố định (%)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step={0.5}
              min={0}
              value={Number((risk.stopFixedPct * 100).toFixed(2))}
              onChange={(event) => onChange({ stopFixedPct: Number(event.target.value) / 100 })}
              className="font-mono tabular-nums"
            />
          </div>
        )}

        {risk.positionSize === "fixed" && (
          <div className="space-y-1">
            <Label className={LABEL_CLASS}>Vốn cố định mỗi lệnh (VND)</Label>
            <Input
              inputMode="numeric"
              value={
                risk.positionFixedAmount > 0 ? risk.positionFixedAmount.toLocaleString("en-US") : ""
              }
              onChange={(event) =>
                onChange({ positionFixedAmount: parseMoney(event.target.value) })
              }
              className="font-mono tabular-nums"
            />
          </div>
        )}
      </div>

      <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Info className="size-3.5 shrink-0" />
        Hệ thống đã tự động tính phí, thuế và quy định T+2.5 của TTCK Việt Nam
      </p>
    </div>
  )
}
