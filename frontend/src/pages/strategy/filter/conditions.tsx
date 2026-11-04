/**
 * The conditions of the Bộ lọc: Thị trường (sàn, rổ, ngành, vốn hóa, GTGD bình quân, giá), the
 * fundamental conditions (each with its own period, operator and threshold, one metric once) and the
 * Kỹ thuật cards (the Bot's own condition rows, one card per indicator).
 */
import { useId, type ReactNode } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { ConditionRows } from "@/pages/demo-trading/bot/config/condition-rows"
import type { DraftRow } from "@/pages/demo-trading/bot/config/draft"
import type { TechnicalRegistry } from "@/pages/demo-trading/bot/config/types"
import { cn } from "@/lib/utils"

import { ErrorLine, NativeSelect } from "../shared/controls"
import { errorMessage } from "../shared/errors"
import { FIELD_LABEL } from "../shared/ui-text"
import { BASKET_OPTIONS, EXCHANGE_OPTIONS, GROUP_OPTIONS, marketErrors, sectorReviewNotice, toggleValue, type MarketDraft } from "./market"
import { metricName } from "./metric-names"
import {
  enabledRowTotal,
  indicatorGroup,
  indicatorName,
  rowsIndicatorOf,
  technicalProblems,
  VOLUME_OPS,
  volumeErrors,
  type TechnicalDraft,
  type VolumeDraft,
  type VolumeOp,
} from "./technical"
import type { DraftRule, FilterOperator, FilterPeriod, MetricId, ScreenerMetric } from "./types"

const CHIP =
  "inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: ReadonlyArray<{ value: string; label: string }>
  value: readonly string[]
  onChange: (next: string[]) => void
}) {
  const labelId = useId()
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className={FIELD_LABEL}>{label}</span>
        <Button type="button" variant="link" size="xs" className="h-auto p-0" aria-label={`Bỏ chọn ${label}`} onClick={() => onChange([])}>
          Bỏ chọn
        </Button>
      </div>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const on = value.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              className={cn(CHIP, on ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground hover:bg-muted")}
              onClick={() => onChange(toggleValue(value, option.value))}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function UnitInput({
  value,
  unit,
  label,
  invalid,
  describedBy,
  className,
  onChange,
}: {
  value: string
  unit: string
  label: string
  invalid: boolean
  describedBy?: string
  className?: string
  onChange: (value: string) => void
}) {
  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <Input
        value={value}
        inputMode="decimal"
        autoComplete="off"
        placeholder="—"
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? describedBy : undefined}
        className={cn("tabular-nums", unit.length > 5 ? "pr-14" : "pr-10")}
        onChange={(event) => onChange(event.target.value)}
      />
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-muted-foreground">{unit}</span>
    </div>
  )
}

function FieldError({ id, children }: { id: string; children?: string }) {
  return children ? <p id={id} className="text-[11px] leading-4 text-destructive">{children}</p> : null
}

/**
 * Thị trường: the scope of the filter. A list left empty or a bound left blank filters nothing; inside
 * one list the choices are OR, between the six items they are AND. Choosing, unchoosing or clearing a
 * Ngành chip (or "Lọc mọi ngành") answers the ICB sector a stored 3.0 filter still carries.
 */
export function MarketSection({ market, onChange }: { market: MarketDraft; onChange: (market: MarketDraft) => void }) {
  const id = useId()
  const errors = marketErrors(market)
  const set = (patch: Partial<MarketDraft>) => onChange({ ...market, ...patch })
  return (
    <section aria-label="Thị trường" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-heading text-sm font-bold">Thị trường</h3>
        <span className="text-xs text-muted-foreground">bỏ trống = không lọc</span>
      </div>
      {market.reviewSector !== null && (
        <div role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-destructive/40 p-3 text-xs leading-5 text-destructive">
          <span>{sectorReviewNotice(market.reviewSector)}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => set({ reviewSector: null })}>Lọc mọi ngành</Button>
        </div>
      )}
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
        <Chips label="Sàn" options={EXCHANGE_OPTIONS} value={market.exchanges} onChange={(exchanges) => set({ exchanges })} />
        <Chips label="Rổ chỉ số" options={BASKET_OPTIONS} value={market.baskets} onChange={(baskets) => set({ baskets })} />
        <Chips label="Ngành (nhóm báo cáo tài chính)" options={GROUP_OPTIONS} value={market.groups} onChange={(groups) => set({ groups, reviewSector: null })} />

        <div className="min-w-0 space-y-1.5">
          <Label className={FIELD_LABEL}>Vốn hóa</Label>
          <div className="flex items-center gap-2">
            <UnitInput value={market.capMin} unit="tỷ đ" label="Vốn hóa từ (tỷ đồng)" invalid={!!errors.cap} describedBy={`${id}-cap`} onChange={(capMin) => set({ capMin })} />
            <span className="text-xs text-muted-foreground">đến</span>
            <UnitInput value={market.capMax} unit="tỷ đ" label="Vốn hóa đến (tỷ đồng)" invalid={!!errors.cap} describedBy={`${id}-cap`} onChange={(capMax) => set({ capMax })} />
          </div>
          <FieldError id={`${id}-cap`}>{errors.cap}</FieldError>
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label className={FIELD_LABEL}>Giá trị giao dịch bình quân</Label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">TB</span>
            <UnitInput value={market.avgSessions} unit="phiên" label="Số phiên tính giá trị giao dịch bình quân" invalid={!!errors.avg} describedBy={`${id}-avg`} className="max-w-[6.5rem]" onChange={(avgSessions) => set({ avgSessions })} />
            <span className="text-xs text-muted-foreground">≥</span>
            <UnitInput value={market.avgMin} unit="tỷ đ" label="Giá trị giao dịch bình quân tối thiểu (tỷ đồng)" invalid={!!errors.avg} describedBy={`${id}-avg`} onChange={(avgMin) => set({ avgMin })} />
          </div>
          <FieldError id={`${id}-avg`}>{errors.avg}</FieldError>
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label className={FIELD_LABEL}>Giá đóng cửa</Label>
          <div className="flex items-center gap-2">
            <UnitInput value={market.priceMin} unit="nghìn đ" label="Giá đóng cửa từ (nghìn đồng)" invalid={!!errors.price} describedBy={`${id}-price`} onChange={(priceMin) => set({ priceMin })} />
            <span className="text-xs text-muted-foreground">đến</span>
            <UnitInput value={market.priceMax} unit="nghìn đ" label="Giá đóng cửa đến (nghìn đồng)" invalid={!!errors.price} describedBy={`${id}-price`} onChange={(priceMax) => set({ priceMax })} />
          </div>
          <FieldError id={`${id}-price`}>{errors.price}</FieldError>
        </div>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">
        Chọn nhiều trong một mục: mã thuộc một trong các lựa chọn là đạt. Các mục khác nhau: phải đạt tất cả. Giá, vốn hóa và giá trị giao dịch tính theo phiên đã đóng cửa gần nhất.
      </p>
    </section>
  )
}

/** Fundamental conditions: each has its own period, operator and threshold; a metric appears once. */
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
    <section aria-label="Chỉ tiêu tài chính" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-sm font-bold">Chỉ tiêu tài chính</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{rules.length} chỉ tiêu</span>
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono font-semibold">AND</span>
        </div>
      </div>
      {rules.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-xs leading-5 text-muted-foreground">
          Chưa có chỉ tiêu tài chính. Thêm từ Thư viện, tab Cơ bản.
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rules.map((rule) => {
            const metric = metricsById.get(rule.metric_id)
            if (!metric) return null
            const rowId = `${baseId}-${rule.id}`
            const unit = metric.unit
            const name = metricName(metric)
            return (
              <li key={rule.id} className="rounded-md border border-border bg-background/40 p-3" data-testid={`rule-${rule.metric_id}`}>
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold break-words">{name}</h4>
                  <button
                    type="button"
                    aria-label={`Bỏ điều kiện ${name}`}
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

/** The Cơ bản group: Thị trường on top, then the fundamental conditions. */
export function BasicSection({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Cơ bản" className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-heading text-sm font-bold uppercase">Cơ bản</h2>
        <span className="text-xs text-muted-foreground">Thị trường và chỉ tiêu tài chính · tất cả phải cùng đúng</span>
      </div>
      {children}
    </section>
  )
}

/* ── Kỹ thuật ────────────────────────────────────────────────────────────── */

function VolumeCard({ draft, idPrefix, onChange }: { draft: VolumeDraft; idPrefix: string; onChange: (draft: VolumeDraft) => void }) {
  const errors = volumeErrors(draft)
  const messages = [errors.sessions, errors.factor].flatMap((message) => (message ? [`Khối lượng · ${message}`] : []))
  const opSelect = (index: 0 | 1, label: string) => (
    <NativeSelect
      aria-label={label}
      value={draft.ops[index]}
      className="h-7 w-14 text-center text-sm font-bold text-primary"
      onChange={(event) => {
        const ops: [VolumeOp, VolumeOp] = [draft.ops[0], draft.ops[1]]
        ops[index] = event.target.value === "<" ? "<" : ">"
        onChange({ ...draft, ops })
      }}
    >
      {VOLUME_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
    </NativeSelect>
  )
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-sessions`} className={FIELD_LABEL}>Số phiên tham chiếu</Label>
          <div className="relative">
            <Input
              id={`${idPrefix}-sessions`}
              inputMode="numeric"
              autoComplete="off"
              value={draft.sessions}
              aria-invalid={!!errors.sessions || undefined}
              className="pr-12 tabular-nums"
              onChange={(event) => onChange({ ...draft, sessions: event.target.value })}
            />
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-muted-foreground">phiên</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-factor`} className={FIELD_LABEL}>Hệ số khối lượng</Label>
          <div className="relative">
            <Input
              id={`${idPrefix}-factor`}
              inputMode="decimal"
              autoComplete="off"
              value={draft.factor}
              aria-invalid={!!errors.factor || undefined}
              className="pr-10 tabular-nums"
              onChange={(event) => onChange({ ...draft, factor: event.target.value })}
            />
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-muted-foreground">lần</span>
          </div>
        </div>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">2 điều kiện luôn bật · Các điều kiện phải đồng thời thỏa mãn</p>
      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-background/40" aria-label="Điều kiện Khối lượng">
        <li className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-3 py-2.5 text-xs leading-7">
          <span>Giá đóng cửa</span>
          {opSelect(0, "Dấu so sánh giá đóng cửa")}
          <span>Giá đóng cửa phiên trước</span>
        </li>
        <li className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-3 py-2.5 text-xs leading-7">
          <span>Khối lượng</span>
          {opSelect(1, "Dấu so sánh khối lượng")}
          <strong className="font-semibold text-primary tabular-nums">{draft.factor.trim() || "?"} × TB {draft.sessions.trim() || "?"} phiên</strong>
        </li>
      </ul>
      {messages.length > 0 && (
        <ul role="alert" className="list-disc space-y-0.5 pl-5 text-xs text-destructive" data-testid="row-errors-volume">
          {messages.map((message) => <li key={message}>{message}</li>)}
        </ul>
      )}
    </div>
  )
}

function IndicatorCard({
  draft,
  registry,
  onChange,
  onRemove,
}: {
  draft: TechnicalDraft
  registry: TechnicalRegistry
  onChange: (draft: TechnicalDraft) => void
  onRemove: () => void
}) {
  const name = indicatorName(draft.indicator, registry)
  const indicator = rowsIndicatorOf(registry, draft.indicator)
  const problems = technicalProblems(draft, indicator)
  const wide = draft.kind === "rows" && (indicator?.rows.length ?? 0) > 1
  return (
    <li data-testid={`tech-${draft.indicator}`} className={cn("rounded-md border border-border bg-background/40 p-3", wide && "lg:col-span-2")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold break-words">{name}</h3>
          <p className="text-[11px] text-muted-foreground">{indicatorGroup(draft.indicator)}</p>
        </div>
        <button type="button" aria-label={`Bỏ ${name}`} className="rounded-sm p-1 text-muted-foreground hover:text-foreground" onClick={onRemove}>
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="mt-2.5">
        {draft.kind === "volume" ? (
          <VolumeCard draft={draft} idPrefix={`tech-${draft.indicator}`} onChange={onChange} />
        ) : indicator ? (
          <ConditionRows
            definitions={indicator.rows}
            side="buy"
            rows={draft.rows}
            idPrefix={`tech-${draft.indicator}`}
            invalid={problems.flagged}
            messages={problems.messages}
            labels={{
              list: `Điều kiện ${name}`,
              switchLabel: (row) => `Bật dòng ${row} của ${name}`,
              fieldLabel: (field, row) => `${field.label} (dòng ${row}, ${name})`,
              testId: draft.indicator,
            }}
            onRowChange={(index: number, row: DraftRow) => onChange({ ...draft, rows: draft.rows.map((item, at) => (at === index ? row : item)) })}
          />
        ) : (
          <p className="text-xs text-destructive">{name}: không còn trong danh mục chỉ báo, hãy bỏ thẻ này.</p>
        )}
      </div>
    </li>
  )
}

/** Kỹ thuật: one card per indicator added from the library, each indicator once. */
export function TechnicalSection({
  drafts,
  registry,
  loading,
  error,
  onRetry,
  onChange,
}: {
  drafts: readonly TechnicalDraft[]
  registry: TechnicalRegistry | undefined
  loading: boolean
  error: unknown
  onRetry: () => void
  onChange: (drafts: TechnicalDraft[]) => void
}) {
  const rowCount = enabledRowTotal(drafts)
  return (
    <section aria-label="Kỹ thuật" className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-heading text-sm font-bold uppercase">Kỹ thuật</h2>
        <span className="text-xs text-muted-foreground" data-testid="technical-count">
          {drafts.length} chỉ báo · {rowCount} dòng bật · AND · xét tại phiên đã đóng cửa gần nhất
        </span>
      </div>
      {error ? (
        <div className="space-y-2">
          <ErrorLine>{`Không tải được danh mục chỉ báo kỹ thuật: ${errorMessage(error)}`}</ErrorLine>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>Thử lại</Button>
        </div>
      ) : loading || !registry ? (
        <Skeleton className="h-16 w-full" aria-label="Đang tải danh mục chỉ báo kỹ thuật" />
      ) : drafts.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-xs leading-5 text-muted-foreground">
          Chưa có điều kiện kỹ thuật. Thêm từ Thư viện, tab Kỹ thuật. Mỗi chỉ báo thêm một lần, các dòng đang bật phải cùng đúng.
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {drafts.map((draft) => (
            <IndicatorCard
              key={draft.indicator}
              draft={draft}
              registry={registry}
              onChange={(next) => onChange(drafts.map((item) => (item.indicator === draft.indicator ? next : item)))}
              onRemove={() => onChange(drafts.filter((item) => item.indicator !== draft.indicator))}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
