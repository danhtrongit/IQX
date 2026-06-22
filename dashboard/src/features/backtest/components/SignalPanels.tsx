import { IconClose } from "@arco-design/web-react/icon"
import { toDisplayValue, toStoredValue } from "../format"
import type { Factor, Logic, Selection, Side } from "../types"

export const BUY_TITLE = "▲ ĐIỀU KIỆN MUA"
export const SELL_TITLE = "▼ ĐIỀU KIỆN BÁN"

interface Props {
  factorsById: Record<string, Factor>
  buy: Selection[]
  sell: Selection[]
  buyLogic: Logic
  sellLogic: Logic
  onLogicChange: (side: Side, logic: Logic) => void
  onValueChange: (side: Side, id: string, stored: number) => void
  onRemove: (side: Side, id: string) => void
}

function LogicToggle({ value, onChange }: { value: Logic; onChange: (l: Logic) => void }) {
  return (
    <div className="flex overflow-hidden rounded border border-[var(--color-border-2)] text-[10px] font-semibold">
      {(["AND", "OR"] as Logic[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          className={`px-2 py-0.5 ${
            value === l
              ? "bg-[rgb(var(--primary-6))] text-white"
              : "bg-[var(--color-bg-1)] text-[var(--color-text-3)]"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

function IndicatorRow({
  factor,
  sel,
  side,
  onValueChange,
  onRemove,
}: {
  factor: Factor
  sel: Selection
  side: Side
  onValueChange: Props["onValueChange"]
  onRemove: Props["onRemove"]
}) {
  const stored = sel.value ?? (typeof factor.default === "number" ? factor.default : 0)
  const editable = factor.kind === "num" && factor.editable
  return (
    <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-[var(--color-border-2)] bg-[var(--color-fill-1)] px-3 py-2.5">
      <div className="min-w-0">
        <div className="truncate font-mono text-[12.5px] font-semibold text-[var(--color-text-1)]">
          {factor.label}
        </div>
        {factor.kind === "bin" ? (
          <div className="mt-1 text-[11px] italic text-[var(--color-text-3)]">
            {factor.desc} · tín hiệu sẵn có (không ngưỡng)
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-text-2)]">
            <span className="rounded bg-[rgba(79,141,239,0.1)] px-1.5 py-0.5 font-mono font-semibold text-[rgb(var(--primary-6))]">
              {factor.op}
            </span>
            {editable ? (
              <>
                <input
                  type="number"
                  value={toDisplayValue(factor, stored)}
                  min={factor.min != null ? toDisplayValue(factor, factor.min) : undefined}
                  max={factor.max != null ? toDisplayValue(factor, factor.max) : undefined}
                  step={
                    factor.step != null
                      ? factor.is_percent
                        ? factor.step * 100
                        : factor.step
                      : "any"
                  }
                  onChange={(e) => onValueChange(side, factor.id, toStoredValue(factor, Number(e.target.value)))}
                  className="w-16 rounded border border-[var(--color-border-2)] bg-[var(--color-bg-1)] px-1.5 py-0.5 font-mono text-[11.5px] text-[var(--color-text-1)] outline-none focus:border-[rgb(var(--primary-6))]"
                />
                <span className="text-[11px] italic text-[var(--color-text-3)]">{factor.unit}</span>
              </>
            ) : (
              <span className="font-mono">{factor.default as number}</span>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(side, factor.id)}
        className="shrink-0 text-[var(--color-text-3)] transition-colors hover:text-down"
        title="Xóa"
      >
        <IconClose />
      </button>
    </div>
  )
}

function Panel({
  side,
  title,
  selections,
  logic,
  factorsById,
  onLogicChange,
  onValueChange,
  onRemove,
}: {
  side: Side
  title: string
  selections: Selection[]
  logic: Logic
  factorsById: Record<string, Factor>
  onLogicChange: Props["onLogicChange"]
  onValueChange: Props["onValueChange"]
  onRemove: Props["onRemove"]
}) {
  const accent = side === "buy" ? "text-up" : "text-down"
  const headBg = side === "buy" ? "bg-up/10" : "bg-down/10"
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)]">
      <div className={`flex items-center justify-between border-b border-[var(--color-border-2)] px-4 py-2.5 ${headBg}`}>
        <span className={`text-[12px] font-bold tracking-wide ${accent}`}>{title}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-[var(--color-text-3)]">
            {selections.length} chỉ tiêu
          </span>
          <LogicToggle value={logic} onChange={(l) => onLogicChange(side, l)} />
        </div>
      </div>
      <div className="min-h-[140px] p-3">
        {selections.length === 0 ? (
          <div className="px-3 py-7 text-center text-xs italic text-[var(--color-text-3)]">
            Click chỉ tiêu trong nhóm {side === "buy" ? "MUA" : "BÁN"} bên trái để thêm
          </div>
        ) : (
          selections.map((sel) => {
            const factor = factorsById[sel.id]
            if (!factor) return null
            return (
              <IndicatorRow
                key={sel.id}
                factor={factor}
                sel={sel}
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

export function SignalPanels(props: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel
        side="buy"
        title={BUY_TITLE}
        selections={props.buy}
        logic={props.buyLogic}
        factorsById={props.factorsById}
        onLogicChange={props.onLogicChange}
        onValueChange={props.onValueChange}
        onRemove={props.onRemove}
      />
      <Panel
        side="sell"
        title={SELL_TITLE}
        selections={props.sell}
        logic={props.sellLogic}
        factorsById={props.factorsById}
        onLogicChange={props.onLogicChange}
        onValueChange={props.onValueChange}
        onRemove={props.onRemove}
      />
    </div>
  )
}
