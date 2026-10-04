/**
 * Phạm vi và điều kiện của Bộ lọc: thị trường / ngành / kỳ dữ liệu, rồi danh
 * sách điều kiện `>`/`<` nối bằng AND. Ngưỡng nhập theo đơn vị hiển thị.
 */
import { X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { SCOPE_ALL, type DraftRule, type FilterOperator, type FilterPeriod, type FilterScope, type ScreenerMetric } from "./types"
import { parseDisplayInput } from "./units"

const MARKETS = [
  { value: SCOPE_ALL, label: "Tất cả" },
  { value: "HOSE", label: "HOSE" },
  { value: "HNX", label: "HNX" },
  { value: "UPCOM", label: "UPCOM" },
] as const

const PERIODS: { value: FilterPeriod; label: string }[] = [
  { value: "TTM", label: "TTM / kỳ phù hợp chỉ tiêu" },
  { value: "annual", label: "Năm gần nhất" },
  { value: "quarter", label: "Quý gần nhất" },
]

export function ScopeBar({
  scope,
  sectors,
  onChange,
}: {
  scope: FilterScope
  sectors: string[]
  onChange: (scope: FilterScope) => void
}) {
  const sectorOptions = scope.sector !== SCOPE_ALL && !sectors.includes(scope.sector) ? [scope.sector, ...sectors] : sectors
  return (
    <section className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3" aria-label="Phạm vi lọc">
      <div className="space-y-1.5">
        <Label htmlFor="filter-market" className="text-xs text-muted-foreground">
          Thị trường
        </Label>
        <Select value={scope.market} onValueChange={(market) => onChange({ ...scope, market })}>
          <SelectTrigger id="filter-market" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MARKETS.map((market) => (
              <SelectItem key={market.value} value={market.value}>
                {market.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-sector" className="text-xs text-muted-foreground">
          Ngành
        </Label>
        <Select value={scope.sector} onValueChange={(sector) => onChange({ ...scope, sector })}>
          <SelectTrigger id="filter-sector" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SCOPE_ALL}>Tất cả</SelectItem>
            {sectorOptions.map((sector) => (
              <SelectItem key={sector} value={sector}>
                {sector}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-period" className="text-xs text-muted-foreground">
          Kỳ dữ liệu
        </Label>
        <Select value={scope.period} onValueChange={(period) => onChange({ ...scope, period: period as FilterPeriod })}>
          <SelectTrigger id="filter-period" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((period) => (
              <SelectItem key={period.value} value={period.value}>
                {period.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  )
}

function RuleRow({
  rule,
  metric,
  onChange,
  onRemove,
}: {
  rule: DraftRule
  metric: ScreenerMetric | undefined
  onChange: (rule: DraftRule) => void
  onRemove: () => void
}) {
  const name = metric?.name ?? rule.metric_id
  const invalid = rule.displayValue.trim() !== "" && parseDisplayInput(rule.displayValue) === null
  const locked = metric ? !metric.learned || !metric.supported : true
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
      <div className="min-w-[140px] flex-1 text-sm font-semibold">
        {name}
        {locked && (
          <Badge variant="destructive" className="ml-2 h-4 px-1.5 text-[10px]">
            {metric && !metric.supported ? "Chưa hỗ trợ" : "Chưa học"}
          </Badge>
        )}
      </div>
      <Select value={rule.operator} onValueChange={(operator) => onChange({ ...rule, operator: operator as FilterOperator })}>
        <SelectTrigger className="w-16" aria-label={`Toán tử ${name}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value=">">&gt;</SelectItem>
          <SelectItem value="<">&lt;</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="text"
        inputMode="decimal"
        value={rule.displayValue}
        onChange={(event) => onChange({ ...rule, displayValue: event.target.value })}
        placeholder="Ngưỡng"
        aria-label={`Ngưỡng ${name}`}
        aria-invalid={invalid || undefined}
        className="h-8 w-28 text-right tabular-nums"
      />
      <span className="w-12 text-xs text-muted-foreground">{metric?.unit ?? ""}</span>
      <Button type="button" size="icon" variant="ghost" className="size-7" onClick={onRemove} aria-label={`Bỏ ${name}`}>
        <X className="size-4" />
      </Button>
    </div>
  )
}

export function RulesEditor({
  rules,
  metricsById,
  onChange,
}: {
  rules: DraftRule[]
  metricsById: ReadonlyMap<string, ScreenerMetric>
  onChange: (rules: DraftRule[]) => void
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-label="Điều kiện lọc">
      <header className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-wide uppercase">Điều kiện lọc</h2>
        <Badge variant="outline" className="ml-auto">
          Tất cả điều kiện (AND)
        </Badge>
      </header>
      {rules.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          Chưa có điều kiện — chỉ lọc theo phạm vi. Thêm chỉ tiêu đã học từ thư viện.
        </div>
      ) : (
        <div className="grid gap-2 xl:grid-cols-2">
          {rules.map((rule, index) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              metric={metricsById.get(rule.metric_id)}
              onChange={(next) => onChange(rules.map((item, i) => (i === index ? next : item)))}
              onRemove={() => onChange(rules.filter((_, i) => i !== index))}
            />
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Dấu &gt;/&lt; là so sánh nghiêm ngặt; bằng ngưỡng không đạt. Mã thiếu dữ liệu hoặc không áp dụng không bao giờ đạt.
      </p>
    </section>
  )
}
