/**
 * Backtest v2 editor: learned-indicator library + independent Mua/Bán tabs.
 *
 * Only indicators in `granted_indicators` are listed. Each side has its own
 * enable switch, params (registry field meta merged with the side override)
 * and operator selects limited to the rule's `allowed_ops`. Every change goes
 * to the draft reducer; nothing here writes to the server.
 */
import { useMemo, useState, type Dispatch } from "react"
import { Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { sideField, type Side, type TechnicalIndicator } from "@/lib/shared-config"

import { isSideActive, type DraftAction, type IndicatorMap } from "./draft"
import { OPERATOR_LABELS, operandLabel, ruleRhsLabel, SIDE_LABEL } from "./format"

export function IndicatorLibrary({
  indicators,
  draft,
  dispatch,
}: {
  indicators: TechnicalIndicator[]
  draft: IndicatorMap
  dispatch: Dispatch<DraftAction>
}) {
  const [query, setQuery] = useState("")
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi-VN")
    return needle ? indicators.filter((item) => item.name.toLocaleLowerCase("vi-VN").includes(needle)) : indicators
  }, [indicators, query])

  return (
    <aside className="flex min-h-0 flex-col gap-3 rounded-lg bg-card p-4" aria-label="Chỉ báo đã mở">
      <h2 className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">Chỉ báo đã mở</h2>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Tìm chỉ báo…"
        aria-label="Tìm chỉ báo"
      />
      {indicators.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Chưa có chỉ báo nào được mở. Hoàn thành bài học trong Học viện để dùng chỉ báo trong Backtest.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-xs text-muted-foreground">Không có chỉ báo phù hợp.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((item) => (
            <li key={item.id} className="rounded-md border border-border p-2.5" data-testid={`library-${item.id}`}>
              <div className="text-xs font-semibold text-foreground">{item.name}</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {(["buy", "sell"] as const).map((side) => {
                  const used = isSideActive(draft[item.id], side)
                  return (
                    <Button
                      key={side}
                      type="button"
                      size="sm"
                      variant={used ? "secondary" : "outline"}
                      disabled={used || !draft[item.id]}
                      onClick={() => dispatch({ type: "add", id: item.id, side })}
                      aria-label={`Thêm ${item.name} vào ${SIDE_LABEL[side]}`}
                    >
                      {SIDE_LABEL[side]} {used ? "✓" : <Plus className="size-3" />}
                    </Button>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

/** Numeric input that keeps the typed text (e.g. "1.") while the draft holds numbers. */
function ParamInput({
  id,
  value,
  min,
  max,
  step,
  label,
  invalid,
  onChange,
}: {
  id: string
  value: number | undefined
  min: number
  max: number
  step: number
  label: string
  invalid: boolean
  onChange: (value: number) => void
}) {
  const external = typeof value === "number" && Number.isFinite(value) ? String(value) : ""
  const [text, setText] = useState(external)
  const [synced, setSynced] = useState(external)
  if (synced !== external) {
    setSynced(external)
    if (Number(text) !== value || text === "") setText(external)
  }
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step}
      aria-label={label}
      aria-invalid={invalid || undefined}
      className="font-mono tabular-nums"
      onChange={(event) => {
        setText(event.target.value)
        onChange(event.target.value.trim() === "" ? Number.NaN : Number(event.target.value))
      }}
    />
  )
}

function IndicatorSideCard({
  indicator,
  config,
  side,
  errors,
  dispatch,
}: {
  indicator: TechnicalIndicator
  config: IndicatorMap[string]
  side: Side
  errors: Record<string, string>
  dispatch: Dispatch<DraftAction>
}) {
  const sideConfig = config[side]
  const enabled = sideConfig.enabled
  const switchId = `bt2-${indicator.id}-${side}-enabled`
  const cardErrors = Object.entries(errors)
    .filter(([key]) => key.startsWith(`${indicator.id}.${side}.`))
    .map(([, message]) => message)

  return (
    <div className="rounded-md border border-border bg-background p-3" data-testid={`card-${side}-${indicator.id}`}>
      <div className="flex items-center gap-2">
        <strong className="text-sm">{indicator.name}</strong>
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor={switchId} className="text-[11px] text-muted-foreground">
            Dùng cho {SIDE_LABEL[side]}
          </label>
          <Switch
            id={switchId}
            checked={enabled}
            onCheckedChange={(checked) => dispatch({ type: "set_enabled", id: indicator.id, side, enabled: checked })}
            aria-label={`Bật ${indicator.name} cho ${SIDE_LABEL[side]}`}
          />
          {enabled && (
            <button
              type="button"
              aria-label={`Bỏ ${indicator.name} khỏi ${SIDE_LABEL[side]}`}
              onClick={() => dispatch({ type: "set_enabled", id: indicator.id, side, enabled: false })}
              className="text-muted-foreground transition-colors hover:text-price-down"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {!enabled ? (
        <p className="mt-2 text-xs text-muted-foreground">Chưa dùng cho {SIDE_LABEL[side]}. Tham số của phía này được giữ nguyên.</p>
      ) : (
        <>
          {Object.keys(sideConfig.params).length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.keys(sideConfig.params).map((key) => {
                const field = sideField(indicator, side, key)
                const inputId = `bt2-${indicator.id}-${side}-${key}`
                const label = field?.label ?? key
                return (
                  <div key={key} className="space-y-1">
                    <label htmlFor={inputId} className="text-[11px] text-muted-foreground">
                      {label}
                      {field?.unit ? ` (${field.unit})` : ""}
                    </label>
                    <ParamInput
                      id={inputId}
                      value={sideConfig.params[key]}
                      min={field?.min ?? Number.NEGATIVE_INFINITY}
                      max={field?.max ?? Number.POSITIVE_INFINITY}
                      step={field?.step ?? 1}
                      label={`${label} · ${indicator.name} · ${SIDE_LABEL[side]}`}
                      invalid={!!errors[`${indicator.id}.${side}.${key}`]}
                      onChange={(value) => dispatch({ type: "param", id: indicator.id, side, key, value })}
                    />
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2">
            {sideConfig.rules.map((rule, index) => (
              <div key={rule.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                <div className="rounded-md bg-muted px-2 py-1.5 text-center">
                  {operandLabel(rule.lhs, indicator, sideConfig.params)}
                </div>
                <select
                  value={rule.op}
                  aria-label={`Toán tử điều kiện ${index + 1} · ${indicator.name} · ${SIDE_LABEL[side]}`}
                  onChange={(event) =>
                    dispatch({ type: "op", id: indicator.id, side, ruleIndex: index, op: event.target.value as typeof rule.op })
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 font-mono text-sm"
                >
                  {rule.allowed_ops.map((op) => (
                    <option key={op} value={op}>
                      {OPERATOR_LABELS[op] ?? op}
                    </option>
                  ))}
                </select>
                <div className="rounded-md bg-muted px-2 py-1.5 text-center">
                  {ruleRhsLabel(rule, indicator, sideConfig.params)}
                </div>
              </div>
            ))}
          </div>

          {cardErrors.length > 0 && (
            <ul className="mt-2 text-xs text-price-down" role="alert">
              {cardErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

export function SideEditor({
  side,
  indicators,
  draft,
  errors,
  dispatch,
}: {
  side: Side
  indicators: TechnicalIndicator[]
  draft: IndicatorMap
  errors: Record<string, string>
  dispatch: Dispatch<DraftAction>
}) {
  const inUse = indicators.filter((item) => {
    const config = draft[item.id]
    return !!config?.master_enabled && (config.buy.enabled || config.sell.enabled)
  })
  const activeCount = inUse.filter((item) => isSideActive(draft[item.id], side)).length

  return (
    <section
      className="flex flex-col gap-3"
      aria-label={`Điều kiện ${SIDE_LABEL[side]}`}
      data-testid={`side-editor-${side}`}
    >
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-semibold tracking-wide text-foreground uppercase">Điều kiện {SIDE_LABEL[side]}</span>
        <span className="ml-auto">{activeCount} chỉ báo</span>
        <span className="rounded border border-border px-1.5 py-0.5 font-mono">AND</span>
      </div>
      {inUse.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Chưa có điều kiện {SIDE_LABEL[side]}. Thêm chỉ báo đã học từ thư viện.
        </p>
      ) : (
        inUse.map((item) => (
          <IndicatorSideCard
            key={item.id}
            indicator={item}
            config={draft[item.id]!}
            side={side}
            errors={errors}
            dispatch={dispatch}
          />
        ))
      )}
    </section>
  )
}
