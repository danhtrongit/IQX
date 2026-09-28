/**
 * Hai panel điều kiện MUA / BÁN của backtest — port từ
 * `dashboard/src/features/backtest/components/SignalPanels.tsx`.
 *
 * Mỗi panel có bộ liên kết AND/OR riêng và danh sách chỉ tiêu đã chọn; chỉ tiêu
 * dạng `num` cho chỉnh ngưỡng ngay tại chỗ (giá trị phần trăm được đổi qua lại
 * giữa dạng hiển thị và dạng backend lưu).
 */
import { ArrowDown, ArrowUp, Info, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import { toDisplayValue, toStoredValue } from "../format"
import { IndicatorInfoPopover } from "../indicators/indicator-info-popover"
import type { Factor, Logic, Selection, Side } from "../types"

function LogicToggle({ value, onChange }: { value: Logic; onChange: (logic: Logic) => void }) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={value}
      onValueChange={(next) => next && onChange(next as Logic)}
    >
      {(["AND", "OR"] as Logic[]).map((logic) => (
        <ToggleGroupItem
          key={logic}
          value={logic}
          className="px-2 font-mono text-[10px] font-semibold data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          {logic}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function IndicatorRow({
  factor,
  selection,
  side,
  onValueChange,
  onRemove,
}: {
  factor: Factor
  selection: Selection
  side: Side
  onValueChange: (side: Side, id: string, stored: number) => void
  onRemove: (side: Side, id: string) => void
}) {
  const stored = selection.value ?? (typeof factor.default === "number" ? factor.default : 0)
  const editable = factor.kind === "num" && factor.editable

  return (
    <div className="mb-2 flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-mono text-[12.5px] font-semibold text-foreground">
            {factor.label}
          </span>
          <IndicatorInfoPopover indicatorId={factor.indicator} label={factor.label}>
            <button
              type="button"
              aria-label={`Thông tin chỉ báo ${factor.label}`}
              className="shrink-0 text-muted-foreground transition-colors duration-150 hover:text-primary"
            >
              <Info className="size-3.5" />
            </button>
          </IndicatorInfoPopover>
        </div>

        {factor.kind === "bin" ? (
          <div className="mt-1 text-[11px] text-muted-foreground italic">
            {factor.desc || "Tín hiệu sẵn có (không ngưỡng)"}
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono font-semibold text-primary">
              {factor.op}
            </span>
            {editable ? (
              <>
                <Input
                  type="number"
                  aria-label={`Ngưỡng ${factor.label}`}
                  value={toDisplayValue(factor, stored)}
                  min={factor.min != null ? toDisplayValue(factor, factor.min) : undefined}
                  max={factor.max != null ? toDisplayValue(factor, factor.max) : undefined}
                  step={
                    factor.step != null ? (factor.isPercent ? factor.step * 100 : factor.step) : "any"
                  }
                  onChange={(event) =>
                    onValueChange(side, factor.id, toStoredValue(factor, Number(event.target.value)))
                  }
                  className="h-6 w-16 px-1.5 font-mono text-[11.5px] tabular-nums"
                />
                {factor.unit && <span className="text-[11px] italic">{factor.unit}</span>}
              </>
            ) : (
              <span className="font-mono tabular-nums">{String(factor.default ?? "—")}</span>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onRemove(side, factor.id)}
        title="Xóa chỉ tiêu"
        aria-label={`Xóa ${factor.label}`}
        className="shrink-0 text-muted-foreground transition-colors duration-150 hover:text-price-down"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

function Panel({
  side,
  selections,
  logic,
  factorsById,
  onLogicChange,
  onValueChange,
  onRemove,
}: {
  side: Side
  selections: Selection[]
  logic: Logic
  factorsById: Record<string, Factor>
  onLogicChange: (side: Side, logic: Logic) => void
  onValueChange: (side: Side, id: string, stored: number) => void
  onRemove: (side: Side, id: string) => void
}) {
  const isBuy = side === "buy"
  const Icon = isBuy ? ArrowUp : ArrowDown

  return (
    <div className="overflow-hidden rounded-lg bg-card">
      <div
        className={`flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 ${
          isBuy ? "bg-price-up/10" : "bg-price-down/10"
        }`}
      >
        <span
          className={`flex items-center gap-1.5 text-[12px] font-bold tracking-wide ${
            isBuy ? "text-price-up" : "text-price-down"
          }`}
        >
          <Icon className="size-3.5" />
          ĐIỀU KIỆN {isBuy ? "MUA" : "BÁN"}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {selections.length} chỉ tiêu
          </span>
          <LogicToggle value={logic} onChange={(next) => onLogicChange(side, next)} />
        </div>
      </div>

      <div className="min-h-[140px] p-3">
        {selections.length === 0 ? (
          <div className="px-3 py-7 text-center text-xs text-muted-foreground italic">
            Chọn chỉ tiêu trong nhóm {isBuy ? "MUA" : "BÁN"} ở thư viện bên trái để thêm
          </div>
        ) : (
          selections.map((selection) => {
            const factor = factorsById[selection.id]
            if (!factor) return null
            return (
              <IndicatorRow
                key={selection.id}
                factor={factor}
                selection={selection}
                side={side}
                onValueChange={onValueChange}
                onRemove={onRemove}
              />
            )
          })
        )}
      </div>
    </div>
  )
}

export function SignalPanels({
  factorsById,
  buy,
  sell,
  buyLogic,
  sellLogic,
  onLogicChange,
  onValueChange,
  onRemove,
}: {
  factorsById: Record<string, Factor>
  buy: Selection[]
  sell: Selection[]
  buyLogic: Logic
  sellLogic: Logic
  onLogicChange: (side: Side, logic: Logic) => void
  onValueChange: (side: Side, id: string, stored: number) => void
  onRemove: (side: Side, id: string) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel
        side="buy"
        selections={buy}
        logic={buyLogic}
        factorsById={factorsById}
        onLogicChange={onLogicChange}
        onValueChange={onValueChange}
        onRemove={onRemove}
      />
      <Panel
        side="sell"
        selections={sell}
        logic={sellLogic}
        factorsById={factorsById}
        onLogicChange={onLogicChange}
        onValueChange={onValueChange}
        onRemove={onRemove}
      />
    </div>
  )
}
