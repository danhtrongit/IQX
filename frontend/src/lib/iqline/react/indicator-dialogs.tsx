/**
 * Hộp thoại thêm và sửa chỉ báo của `market` (docs/iqline-design.md §9), tải khi cần (`React.lazy` ở `IQLine`). Danh sách lấy từ sổ đăng
 * ký chỉ báo (`listIndicators`), tham số kiểm bằng `validateIndicatorParams` nên không bao giờ đưa vào biểu đồ một tham số mà
 * chỉ báo từ chối. Chỉ là DOM; thay đổi đi ra qua `onChange` và trang quyết định lưu ở đâu.
 */
import { useMemo, useState } from "react"
import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import { INDICATOR_CATEGORIES, categoryOf } from "./indicator-categories"
import { MAX_INDICATORS, newIndicatorKey } from "./market-defaults"
import { getIndicator, listIndicators, resolveIndicatorParams, validateIndicatorParams } from "../indicators"
import type { ChartIndicatorInput, IndicatorDefinition, IndicatorKind, IndicatorParamSpec, IndicatorParams, IndicatorParamValue } from "../types"

export type IndicatorDialogState = { kind: "add" } | { kind: "edit"; key: string } | null

export type IndicatorDialogsProps = {
  state: IndicatorDialogState
  indicators: readonly ChartIndicatorInput[]
  /** Số chỉ báo tối đa trên một biểu đồ. */
  limit?: number
  onChange: (next: readonly ChartIndicatorInput[]) => void
  onClose: () => void
}

/** Nơi chỉ báo được vẽ, hiện nhỏ cạnh tên để người dùng biết nó nằm trên giá hay ở ô riêng. */
const KIND_LABEL: Record<IndicatorKind, string> = {
  over: "Trên giá",
  vol: "Khối lượng",
  pane: "Ô riêng",
}

/** Chữ thường, bỏ dấu tiếng Việt: "trung binh" tìm được "trung bình", "dao dong" tìm được "dao động". */
const fold = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase()

/** Tên đầy đủ hoặc tên gọi khác, để gõ "hull" ra HMA, "mây" ra Ichimoku: chỉ dùng cho tìm kiếm, không hiện ra. */
const ALIASES: Readonly<Record<string, string>> = {
  ma: "simple moving average sma trung binh don gian",
  ema: "exponential moving average trung binh mu",
  wma: "weighted moving average trung binh trong so",
  hma: "hull moving average",
  vwma: "volume weighted moving average trung binh theo khoi luong",
  vwap: "volume weighted average price gia trung binh theo khoi luong",
  ichimoku: "ichimoku kinko hyo may tenkan kijun senkou chikou",
  supertrend: "super trend",
  psar: "parabolic stop and reverse",
  pivot_points: "pivot standard diem xoay ho tro khang cu",
  envelope: "envelopes phong bao",
  std_dev: "standard deviation do lech chuan",
  volatility_ohlc: "volatility ohlc garman klass bien dong",
  accum_dist: "accumulation distribution ad line",
  atr: "average true range bien do thuc",
  rsi: "relative strength index",
  macd: "moving average convergence divergence",
  cci: "commodity channel index",
  mfi: "money flow index",
  obv: "on balance volume",
}

/** Chuỗi tìm kiếm của một chỉ báo: tên, id (gạch dưới thành khoảng trắng), tên gọi khác, nhóm và nơi vẽ. */
const searchText = (definition: IndicatorDefinition): string => {
  const category = INDICATOR_CATEGORIES.find((item) => item.id === categoryOf(definition.id))
  return fold(`${definition.name} ${definition.id.replace(/_/g, " ")} ${ALIASES[definition.id] ?? ""} ${category?.label ?? ""} ${KIND_LABEL[definition.kind]}`)
}

const ALL = "all"
/** Nhóm đang chọn: viền và chữ `primary` (DESIGN.md: `primary` đánh dấu trạng thái được chọn), không chỉ đổi nền rất nhạt. */
const CHIP = "data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"

function AddDialog({ indicators, limit, onChange, onClose }: Omit<IndicatorDialogsProps, "state">) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string>(ALL)
  const groups = useMemo(() => {
    const words = fold(query.trim()).split(/\s+/).filter(Boolean)
    const all = listIndicators().filter((definition) => {
      if (category !== ALL && categoryOf(definition.id) !== category) return false
      const haystack = searchText(definition)
      return words.every((word) => haystack.includes(word))
    })
    return INDICATOR_CATEGORIES.map((item) => ({ ...item, items: all.filter((definition) => categoryOf(definition.id) === item.id) })).filter((group) => group.items.length > 0)
  }, [query, category])
  const full = indicators.length >= (limit ?? MAX_INDICATORS)
  const add = (definition: IndicatorDefinition) => {
    if (full) return
    onChange([...indicators, { key: newIndicatorKey(definition.id, indicators), id: definition.id, params: {} }])
    onClose()
  }
  return (
    <DialogContent className="max-h-[85dvh] gap-3 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Thêm chỉ báo</DialogTitle>
        <DialogDescription>Chọn một chỉ báo để thêm vào biểu đồ. Tham số chỉnh được sau khi thêm.</DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Tìm chỉ báo" placeholder="Tìm theo tên hoặc nhóm" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-8" />
      </div>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={1}
        aria-label="Lọc theo nhóm"
        value={category}
        onValueChange={(value) => setCategory(value || ALL)}
        className="h-auto flex-wrap overflow-visible"
      >
        <ToggleGroupItem value={ALL} className={CHIP}>Tất cả</ToggleGroupItem>
        {INDICATOR_CATEGORIES.filter((item) => item.id !== "other" || listIndicators().some((definition) => categoryOf(definition.id) === "other")).map((item) => (
          <ToggleGroupItem key={item.id} value={item.id} className={CHIP}>{item.label}</ToggleGroupItem>
        ))}
      </ToggleGroup>
      {full ? <p role="status" className="text-xs text-destructive">Đã đạt tối đa {limit ?? MAX_INDICATORS} chỉ báo. Xoá bớt một chỉ báo để thêm mới.</p> : null}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        {groups.length === 0 ? <p className="text-sm text-muted-foreground">Không có chỉ báo nào khớp.</p> : null}
        {groups.map((group) => (
          <section key={group.id} aria-label={group.label} className="flex flex-col gap-1">
            <h3 className="text-xs font-medium text-muted-foreground">{group.label}</h3>
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {group.items.map((definition) => (
                <li key={definition.id}>
                  <Button type="button" variant="outline" size="sm" disabled={full} className="w-full justify-between" onClick={() => add(definition)}>
                    <span className="truncate">{definition.name}</span>
                    <span aria-hidden="true" className="shrink-0 text-[10px] font-normal text-muted-foreground">{KIND_LABEL[definition.kind]}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </DialogContent>
  )
}

const toDraft = (params: IndicatorParams): Record<string, string> => Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)]))

function parseParam(spec: IndicatorParamSpec, raw: string | undefined): IndicatorParamValue {
  if (typeof spec.default === "number") return raw === undefined || raw.trim() === "" ? Number.NaN : Number(raw.replace(",", "."))
  if (typeof spec.default === "boolean") return raw === "true"
  return raw ?? String(spec.default)
}

function EditForm({ definition, input, onSave, onClose }: { definition: IndicatorDefinition; input: ChartIndicatorInput; onSave: (params: IndicatorParams) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>(() => toDraft(resolveIndicatorParams(input.id, input.params) ?? input.params))
  const params = useMemo<IndicatorParams>(() => Object.fromEntries(definition.params.map((spec) => [spec.key, parseParam(spec, draft[spec.key])])), [definition, draft])
  const problem = useMemo(() => {
    const bad = definition.params.find((spec) => typeof spec.default === "number" && !Number.isFinite(params[spec.key] as number))
    if (bad) return `${bad.label ?? bad.key} phải là một số.`
    return validateIndicatorParams(definition.id, params)
  }, [definition, params])
  const set = (key: string, value: string) => setDraft((previous) => ({ ...previous, [key]: value }))
  return (
    <DialogContent className="max-h-[85dvh] gap-3 sm:max-w-sm">
      <form
        className="flex min-h-0 flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (!problem) onSave(params)
        }}
      >
        <DialogHeader>
          <DialogTitle>Cài đặt {definition.name}</DialogTitle>
          <DialogDescription>Đổi tham số của chỉ báo. Biểu đồ cập nhật ngay khi lưu.</DialogDescription>
        </DialogHeader>
        {definition.params.length === 0 ? <p className="text-sm text-muted-foreground">Chỉ báo này không có tham số.</p> : null}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-0.5">
          {definition.params.map((spec) => {
            const id = `iqline-param-${input.key}-${spec.key}`
            const label = spec.label ?? spec.key
            if (typeof spec.default === "boolean") {
              return (
                <div key={spec.key} className="flex items-center justify-between gap-3">
                  <Label htmlFor={id}>{label}</Label>
                  <Switch id={id} checked={draft[spec.key] === "true"} onCheckedChange={(checked) => set(spec.key, String(checked))} />
                </div>
              )
            }
            if (spec.options) {
              return (
                <div key={spec.key} className="flex flex-col gap-1.5">
                  <Label htmlFor={id}>{label}</Label>
                  <Select value={draft[spec.key] ?? String(spec.default)} onValueChange={(value) => set(spec.key, value)}>
                    <SelectTrigger id={id} size="sm" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{spec.options.map((option) => <SelectItem key={option} value={option}>{spec.optionLabels?.[option] ?? option}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )
            }
            return (
              <div key={spec.key} className="flex flex-col gap-1.5">
                <Label htmlFor={id}>{label}</Label>
                <Input id={id} type="number" inputMode="decimal" min={spec.min} max={spec.max} step={spec.step ?? "any"} value={draft[spec.key] ?? ""} onChange={(event) => set(spec.key, event.target.value)} aria-invalid={!Number.isFinite(params[spec.key] as number)} />
              </div>
            )
          })}
        </div>
        {problem ? <p role="alert" className="text-xs text-destructive">{problem}</p> : null}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => setDraft(toDraft(Object.fromEntries(definition.params.map((spec) => [spec.key, spec.default]))))}>Mặc định</Button>
          <span className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Huỷ</Button>
            <Button type="submit" disabled={problem !== null}>Lưu</Button>
          </span>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

export default function IndicatorDialogs(props: IndicatorDialogsProps) {
  const { state, indicators, onChange, onClose } = props
  const editing = state?.kind === "edit" ? indicators.find((item) => item.key === state.key) : undefined
  const definition = editing ? getIndicator(editing.id) : undefined
  return (
    <Dialog open={state !== null && (state.kind === "add" || (editing !== undefined && definition !== undefined))} onOpenChange={(open) => !open && onClose()}>
      {state?.kind === "add" ? <AddDialog indicators={indicators} limit={props.limit} onChange={onChange} onClose={onClose} /> : null}
      {editing && definition ? (
        <EditForm
          key={editing.key}
          definition={definition}
          input={editing}
          onClose={onClose}
          onSave={(params) => {
            onChange(indicators.map((item) => (item.key === editing.key ? { ...item, params } : item)))
            onClose()
          }}
        />
      ) : null}
    </Dialog>
  )
}
