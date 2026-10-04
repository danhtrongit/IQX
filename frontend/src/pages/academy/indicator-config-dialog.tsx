import { useId, useState } from "react"
import { RefreshCw, X } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { IndicatorConfig, RuleOp, Side, TechnicalIndicator } from "@/lib/shared-config"

import {
  buildIndicatorConfig,
  createDraft,
  draftErrors,
  fieldErrorFor,
  resetDraftSide,
  SIDES,
  sideFields,
  type ConfigFieldError,
  type IndicatorDraft,
} from "./config-draft"
import type { SaveIndicatorOutcome } from "./hooks"
import { numericParams, operandLabel } from "./rule-labels"

const SIDE_TAB_LABEL: Record<Side, string> = { buy: "Mua", sell: "Bán" }
const SIDE_SIGNAL_LABEL: Record<Side, string> = { buy: "Tín hiệu Mua", sell: "Tín hiệu Bán" }

type ConflictState = { currentRevision: number | null; reloadedRevision: number | null }

export type IndicatorConfigDialogProps = {
  indicator: TechnicalIndicator
  /** Latest saved record of this indicator (registry template when never saved). */
  saved: IndicatorConfig
  savedRevision: number
  initialSide: Side
  /** Opened from the master switch while both sides were OFF: saving turns master ON. */
  activate: boolean
  saving: boolean
  onSave: (config: IndicatorConfig) => Promise<SaveIndicatorOutcome>
  onReload: () => Promise<{ saved_revision: number } | undefined>
  onClose: () => void
}

/** Per-indicator Buy/Sell config panel: draft → Hủy / Đặt lại (current tab) / Lưu (PATCH this indicator only). */
export function IndicatorConfigDialog({
  indicator,
  saved,
  savedRevision,
  initialSide,
  activate,
  saving,
  onSave,
  onReload,
  onClose,
}: IndicatorConfigDialogProps) {
  const baseId = useId()
  const [side, setSide] = useState<Side>(initialSide)
  const [draft, setDraft] = useState<IndicatorDraft>(() => {
    const initial = createDraft(saved)
    return activate ? { ...initial, [initialSide]: { ...initial[initialSide], enabled: true } } : initial
  })
  const [serverErrors, setServerErrors] = useState<ConfigFieldError[]>([])
  const [serverMessage, setServerMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [reloading, setReloading] = useState(false)

  const localErrors = draftErrors(indicator, draft)
  const hasLocalErrors = SIDES.some(item => Object.keys(localErrors[item]).length > 0)
  const bothOff = !draft.buy.enabled && !draft.sell.enabled
  const blockedByConflict = !!conflict && conflict.reloadedRevision === null
  const canSave = !saving && !reloading && !hasLocalErrors && !blockedByConflict

  const updateSide = (target: Side, patch: Partial<IndicatorDraft[Side]>) => {
    setDraft(previous => ({ ...previous, [target]: { ...previous[target], ...patch } }))
  }

  const save = async () => {
    setServerErrors([])
    setServerMessage(null)
    const outcome = await onSave(buildIndicatorConfig(saved, draft, activate))
    if (outcome.ok) {
      toast.success(`Đã lưu cấu hình ${indicator.name} (bản #${outcome.result.revision}).`)
      onClose()
      return
    }
    if (outcome.reason === "conflict") {
      setConflict({ currentRevision: outcome.currentRevision, reloadedRevision: null })
      return
    }
    if (outcome.reason === "invalid") setServerErrors(outcome.errors)
    setServerMessage(outcome.message)
  }

  const reload = async () => {
    setReloading(true)
    try {
      const latest = await onReload()
      setConflict(previous => previous && { ...previous, reloadedRevision: latest?.saved_revision ?? null })
    } finally {
      setReloading(false)
    }
  }

  const generalErrors = serverErrors.filter(error => !SIDES.some(item =>
    sideFields(indicator, item).some(field => fieldErrorFor([error], item, field.key))))

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto bg-card p-0 text-card-foreground sm:max-w-[560px]">
        <DialogHeader className="flex-row items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0 space-y-1">
            <DialogTitle className="font-heading text-lg">Cấu hình {indicator.name}</DialogTitle>
            <DialogDescription>
              Dựa trên bản đã lưu #{savedRevision}. Mua và Bán độc lập: tham số của phía này không dùng cho phía kia.
            </DialogDescription>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Đóng cấu hình" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </DialogHeader>

        <div className="space-y-4 p-4">
          {conflict && (
            <Alert variant="destructive">
              <AlertTitle>Cấu hình đã thay đổi ở nơi khác</AlertTitle>
              <AlertDescription>
                {conflict.reloadedRevision === null
                  ? `Bản nháp của bạn vẫn được giữ, chưa có gì được ghi${conflict.currentRevision !== null ? ` (bản hiện tại #${conflict.currentRevision})` : ""}. Tải lại bản mới nhất rồi kiểm tra trước khi lưu.`
                  : `Đã tải bản #${conflict.reloadedRevision}. Bản nháp vẫn giữ nguyên, kiểm tra lại rồi bấm Lưu.`}
              </AlertDescription>
              {conflict.reloadedRevision === null && (
                <div className="col-start-2 mt-2">
                  <Button variant="outline" size="sm" onClick={() => void reload()} disabled={reloading}>
                    <RefreshCw aria-hidden="true" className={reloading ? "animate-spin" : undefined} />
                    Tải lại
                  </Button>
                </div>
              )}
            </Alert>
          )}

          <p className="text-xs leading-5 text-muted-foreground">
            {activate
              ? "Lưu sẽ bật công tắc tổng của chỉ báo này với phía đã chọn."
              : saved.master_enabled
                ? "Công tắc tổng đang bật."
                : "Công tắc tổng đang tắt: chỉ báo không tham gia tín hiệu. Lưu tham số không tự bật công tắc tổng."}
            {bothOff && " Cả hai phía đều tắt: sau khi lưu, công tắc tổng sẽ tắt."}
          </p>

          <Tabs value={side} onValueChange={value => setSide(value as Side)} className="gap-3">
            <TabsList className="grid w-full grid-cols-2" aria-label="Phía tín hiệu">
              {SIDES.map(item => (
                <TabsTrigger key={item} value={item} className="uppercase">{SIDE_TAB_LABEL[item]}</TabsTrigger>
              ))}
            </TabsList>
            {SIDES.map(item => {
              const sideDraft = draft[item]
              const params = numericParams(sideDraft.params)
              const switchId = `${baseId}-${item}-enabled`
              return (
                <TabsContent key={item} value={item} className="space-y-4">
                  <div className="flex items-center justify-between gap-3 rounded-sm border border-border p-3">
                    <Label htmlFor={switchId} className="font-semibold">{SIDE_SIGNAL_LABEL[item]}</Label>
                    <Switch
                      id={switchId}
                      checked={sideDraft.enabled}
                      onCheckedChange={checked => updateSide(item, { enabled: checked })}
                    />
                  </div>
                  {!sideDraft.enabled && (
                    <p className="text-xs text-muted-foreground">Phía này đang tắt, tham số và điều kiện vẫn được giữ.</p>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    {sideFields(indicator, item).map(field => {
                      const inputId = `${baseId}-${item}-${field.key}`
                      const hintId = `${inputId}-hint`
                      const error = localErrors[item][field.key] ?? fieldErrorFor(serverErrors, item, field.key)
                      return (
                        <div key={field.key} className="space-y-1.5">
                          <Label htmlFor={inputId}>
                            {field.label}{field.unit ? <span className="font-normal text-muted-foreground"> ({field.unit})</span> : null}
                          </Label>
                          <Input
                            id={inputId}
                            type="number"
                            inputMode="decimal"
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            value={sideDraft.params[field.key] ?? ""}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={hintId}
                            onChange={event => updateSide(item, { params: { ...sideDraft.params, [field.key]: event.target.value } })}
                          />
                          <p id={hintId} className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                            {error ?? `Từ ${field.min} đến ${field.max}, bước ${field.step}.`}
                          </p>
                        </div>
                      )
                    })}
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Điều kiện</h3>
                    {saved[item].rules.length === 0 && <p className="text-xs text-muted-foreground">Không có điều kiện.</p>}
                    <ul className="space-y-2">
                      {saved[item].rules.map((rule, index) => (
                        <li key={rule.id} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm">
                          <span className="truncate rounded-sm border border-border px-2 py-1.5" title={operandLabel(rule.lhs, indicator, params)}>
                            {operandLabel(rule.lhs, indicator, params)}
                          </span>
                          <select
                            aria-label={`Toán tử điều kiện ${index + 1} (${SIDE_TAB_LABEL[item]})`}
                            className="h-8 rounded-sm border border-input bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30"
                            value={sideDraft.ops[rule.id] ?? rule.op}
                            onChange={event => updateSide(item, { ops: { ...sideDraft.ops, [rule.id]: event.target.value as RuleOp } })}
                          >
                            {(rule.allowed_ops as RuleOp[]).map(op => <option key={op} value={op}>{op}</option>)}
                          </select>
                          <span className="truncate rounded-sm border border-border px-2 py-1.5" title={operandLabel(rule.rhs, indicator, params)}>
                            {operandLabel(rule.rhs, indicator, params)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </TabsContent>
              )
            })}
          </Tabs>

          {(serverMessage || generalErrors.length > 0) && (
            <div role="alert" className="space-y-1 text-sm text-destructive">
              {serverMessage && <p>{serverMessage}</p>}
              {generalErrors.length > 0 && (
                <ul className="list-disc pl-5">
                  {generalErrors.map(error => <li key={`${error.path}-${error.message}`}>{error.message}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row flex-wrap justify-end gap-2 border-t border-border p-4">
          <Button variant="outline" onClick={() => setDraft(previous => resetDraftSide(previous, saved, side))}>
            Đặt lại
          </Button>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => void save()} disabled={!canSave}>{saving ? "Đang lưu…" : "Lưu"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
