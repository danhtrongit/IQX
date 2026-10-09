/**
 * Scope (market, sector) and the conditions of the Bộ lọc. Every condition has its own period,
 * operator and threshold; there is no filter-wide period. One metric appears once.
 */
import { useId } from "react"
import { X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { NativeSelect } from "../shared/controls"
import { FIELD_LABEL } from "../shared/ui-text"
import { SCOPE_ALL, type DraftRule, type FilterOperator, type FilterPeriod, type FilterScope, type MetricId, type ScreenerMetric } from "./types"

const MARKETS = [
  { value: SCOPE_ALL, label: "Tất cả" },
  { value: "HOSE", label: "HOSE" },
  { value: "HNX", label: "HNX" },
  { value: "UPCOM", label: "UPCOM" },
] as const

/** Thị trường and Ngành only: the period lives on each condition. */
export function ScopeBar({
  scope,
  sectors,
  onChange,
}: {
  scope: FilterScope
  sectors: readonly string[]
  onChange: (scope: FilterScope) => void
}) {
  const id = useId()
  const sectorValue = scope.sector === SCOPE_ALL ? "" : scope.sector
  return (
    <section className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2" aria-label="Phạm vi lọc">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-market`} className={FIELD_LABEL}>Thị trường</Label>
        <NativeSelect id={`${id}-market`} value={scope.market.toLowerCase() === SCOPE_ALL ? SCOPE_ALL : scope.market.toUpperCase()} onChange={(event) => onChange({ ...scope, market: event.target.value })}>
          {MARKETS.map((market) => <option key={market.value} value={market.value}>{market.label}</option>)}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-sector`} className={FIELD_LABEL}>Ngành</Label>
        <Input
          id={`${id}-sector`}
          list={`${id}-sectors`}
          value={sectorValue}
          placeholder="Tất cả ngành"
          autoComplete="off"
          maxLength={200}
          onChange={(event) => onChange({ ...scope, sector: event.target.value.trim() === "" ? SCOPE_ALL : event.target.value })}
        />
        <datalist id={`${id}-sectors`}>
          {sectors.map((sector) => <option key={sector} value={sector} />)}
        </datalist>
      </div>
    </section>
  )
}

export function RulesEditor({
  rules,
  metricsById,
  onChange,
}: {
  rules: readonly DraftRule[]
  metricsById: ReadonlyMap<MetricId, ScreenerMetric>
  onChange: (rules: DraftRule[]) => void
}) {
  const baseId = useId()
  const update = (id: string, patch: Partial<DraftRule>) => onChange(rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)))

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-label="Điều kiện lọc">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-sm font-bold uppercase">Điều kiện lọc</h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{rules.length} chỉ tiêu</span>
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono font-semibold">AND</span>
        </div>
      </div>
      {rules.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-border p-4 text-center text-xs leading-5 text-muted-foreground">
          Chưa áp tiêu chí nào: kết quả là toàn bộ doanh nghiệp trong phạm vi. Thêm chỉ tiêu từ thư viện để lọc.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 lg:grid-cols-2">
          {rules.map((rule) => {
            const metric = metricsById.get(rule.metric_id)
            if (!metric) return null
            const rowId = `${baseId}-${rule.id}`
            const unit = metric.unit
            return (
              <li key={rule.id} className="rounded-md border border-border bg-background/40 p-3" data-testid={`rule-${rule.metric_id}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold break-words">{metric.name}</h3>
                  <button
                    type="button"
                    aria-label={`Bỏ điều kiện ${metric.name}`}
                    className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => onChange(rules.filter((item) => item.id !== rule.id))}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </div>
                <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,6.5rem)] items-end gap-2 max-sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="space-y-1.5 max-sm:col-span-2">
                    <Label htmlFor={`${rowId}-period`} className={FIELD_LABEL}>Kỳ tính</Label>
                    <NativeSelect
                      id={`${rowId}-period`}
                      value={rule.period ?? ""}
                      aria-invalid={rule.period === null || undefined}
                      onChange={(event) => update(rule.id, { period: event.target.value as FilterPeriod, review: null })}
                    >
                      {rule.period === null && <option value="" disabled>Chọn kỳ tính…</option>}
                      {metric.allowed_periods.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${rowId}-op`} className={FIELD_LABEL}>Dấu</Label>
                    <NativeSelect
                      id={`${rowId}-op`}
                      value={rule.operator}
                      className="text-center text-base font-bold text-primary"
                      onChange={(event) => update(rule.id, { operator: event.target.value as FilterOperator })}
                    >
                      {metric.operators.map((op) => <option key={op} value={op}>{op}</option>)}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${rowId}-value`} className={FIELD_LABEL}>Ngưỡng</Label>
                    <div className="relative">
                      <Input
                        id={`${rowId}-value`}
                        inputMode="decimal"
                        value={rule.displayValue}
                        placeholder="0"
                        autoComplete="off"
                        className={`tabular-nums ${unit ? "pr-12" : ""}`}
                        onChange={(event) => update(rule.id, { displayValue: event.target.value })}
                      />
                      {unit && <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-muted-foreground">{unit}</span>}
                    </div>
                  </div>
                </div>
                {rule.review && <p role="alert" className="mt-2 text-[11px] leading-4 text-destructive">{rule.review}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
