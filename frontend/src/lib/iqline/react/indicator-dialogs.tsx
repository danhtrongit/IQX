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

const KIND_LABEL: Record<IndicatorKind, string> = {
  over: "Vẽ chồng trên giá",
  vol: "Khối lượng",
  pane: "Ô riêng bên dưới",
}
const KIND_ORDER: readonly IndicatorKind[] = ["over", "vol", "pane"]

function AddDialog({ indicators, limit, onChange, onClose }: Omit<IndicatorDialogsProps, "state">) {
  const [query, setQuery] = useState("")
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const all = listIndicators().filter((definition) => !needle || definition.name.toLowerCase().includes(needle) || definition.id.includes(needle))
    return KIND_ORDER.map((kind) => ({ kind, items: all.filter((definition) => definition.kind === kind) })).filter((group) => group.items.length > 0)
  }, [query])
  const full = indicators.length >= (limit ?? MAX_INDICATORS)
  const add = (definition: IndicatorDefinition) => {
    if (full) return
    onChange([...indicators, { key: newIndicatorKey(definition.id, indicators), id: definition.id, params: {} }])
    onClose()
  }
  return (
    <DialogContent className="max-h-[85dvh] gap-3 sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Thêm chỉ báo</DialogTitle>
        <DialogDescription>Chọn một chỉ báo để thêm vào biểu đồ. Tham số chỉnh được sau khi thêm.</DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Tìm chỉ báo" placeholder="Tìm chỉ báo" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-8" />
      </div>
      {full ? <p role="status" className="text-xs text-destructive">Đã đạt tối đa {limit ?? MAX_INDICATORS} chỉ báo. Xoá bớt một chỉ báo để thêm mới.</p> : null}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        {groups.length === 0 ? <p className="text-sm text-muted-foreground">Không có chỉ báo nào khớp.</p> : null}
        {groups.map((group) => (
          <section key={group.kind} aria-label={KIND_LABEL[group.kind]} className="flex flex-col gap-1">
            <h3 className="text-xs font-medium text-muted-foreground">{KIND_LABEL[group.kind]}</h3>
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {group.items.map((definition) => (
                <li key={definition.id}>
                  <Button type="button" variant="outline" size="sm" disabled={full} className="w-full justify-start" onClick={() => add(definition)}>
                    {definition.name}
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
                    <SelectContent>{spec.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
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
