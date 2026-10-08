import { useId, useMemo, useState } from "react"
import { RefreshCw, X } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

import { ConfirmDialog } from "../confirm-dialog"
import { fieldErrorFor, type ConfigFieldError } from "./api"
import {
  buildIndicatorConfig,
  createDraft,
  draftErrors,
  hasDraftErrors,
  isDraftDirty,
  rebaseDraft,
  resetDraftSide,
  savedIndicatorConfig,
  SIDE_LABEL,
  SIDES,
  sideFields,
  type IndicatorDraft,
} from "./draft"
import { CROSS_LABEL, numericParams, operandLabel } from "./labels"
import { effectiveText } from "./summary"
import type { RuleOp, Side, TechnicalIndicator } from "./types"
import type { BotConfigController } from "./use-bot-config"

type Conflict = { reloaded: boolean; currentRevision: number | null }

// `!` wins over the base tab styles (including their dark-mode variants).
const TAB_STYLE: Record<Side, string> = {
  buy: "data-active:border-price-up/50! data-active:bg-price-up/10! data-active:text-price-up! dark:data-active:border-price-up/50! dark:data-active:bg-price-up/10! dark:data-active:text-price-up!",
  sell: "data-active:border-price-down/50! data-active:bg-price-down/10! data-active:text-price-down! dark:data-active:border-price-down/50! dark:data-active:bg-price-down/10! dark:data-active:text-price-down!",
}

/**
 * Per-indicator Buy/Sell configuration. The form is a draft until Lưu:
 * Hủy / Escape / outside click ask before throwing a changed draft away, Đặt lại resets
 * only the open tab's params and operators to the registry defaults, and a 409 keeps the
 * draft and offers a reload that merges the newer saved values with the user's edits.
 */
export function ConfigModal({
  indicator,
  controller,
  activate,
  onClose,
}: {
  indicator: TechnicalIndicator
  controller: BotConfigController
  /** Opened from the master switch while both sides were OFF: saving with a side ON turns the master ON. */
  activate: boolean
  onClose: () => void
}) {
  const baseId = useId()
  const [base, setBase] = useState(() => ({
    config: savedIndicatorConfig(controller.state, indicator),
    revision: controller.state?.saved_revision ?? 0,
  }))
  const initialDraft = useMemo(() => createDraft(base.config), [base])
  const [draft, setDraft] = useState<IndicatorDraft>(initialDraft)
  const [side, setSide] = useState<Side>("buy")
  const [serverErrors, setServerErrors] = useState<ConfigFieldError[]>([])
  const [serverMessage, setServerMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [reloading, setReloading] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  const errors = draftErrors(indicator, draft)
  const dirty = isDraftDirty(initialDraft, draft)
  const bothOff = !draft.buy.enabled && !draft.sell.enabled
  const unresolvedConflict = !!conflict && !conflict.reloaded
  const busy = controller.saving || reloading
  const canSave = !busy && !hasDraftErrors(errors) && !unresolvedConflict

  const updateSide = (target: Side, patch: Partial<IndicatorDraft[Side]>) =>
    setDraft((previous) => ({ ...previous, [target]: { ...previous[target], ...patch } }))

  function requestClose() {
    if (controller.saving) return
    if (dirty) setConfirmingDiscard(true)
    else onClose()
  }

  async function submit() {
    setServerErrors([])
    setServerMessage(null)
    const next = buildIndicatorConfig(base.config, draft, activate)
    if (JSON.stringify(next) === JSON.stringify(base.config)) {
      toast.info("Không có thay đổi để lưu.")
      onClose()
      return
    }
    const outcome = await controller.save(indicator.id, next, base.revision)
    if (outcome.ok) {
      const when = effectiveText(outcome.result.status, outcome.result.effective_session)
      toast.success(`Đã lưu cấu hình ${indicator.name} (bản ${outcome.result.revision}).${when ? ` ${when}.` : ""}`)
      onClose()
      return
    }
    if (outcome.reason === "conflict") {
      setConflict({ reloaded: false, currentRevision: outcome.currentRevision })
      return
    }
    if (outcome.reason === "invalid") setServerErrors(outcome.errors)
    setServerMessage(outcome.message)
  }

  async function reload() {
    setReloading(true)
    try {
      const latest = await controller.reload()
      if (!latest) return
      const newBase = { config: savedIndicatorConfig(latest, indicator), revision: latest.saved_revision }
      setDraft((previous) => rebaseDraft(previous, base.config, newBase.config))
      setBase(newBase)
      setConflict({ reloaded: true, currentRevision: latest.saved_revision })
    } finally {
      setReloading(false)
    }
  }

  const sideSwitchLabel = (target: Side) => `Sử dụng điều kiện ${SIDE_LABEL[target]}`
  const generalErrors = serverErrors.filter(
    (error) => !SIDES.some((item) => sideFields(indicator, item).some((field) => fieldErrorFor([error], item, field.key))),
  )
  const masterNote = activate
    ? "Chọn phía muốn dùng. Lưu với ít nhất một phía bật sẽ bật chỉ báo cho Bot; Hủy thì chỉ báo vẫn tắt."
    : base.config.master_enabled
      ? "Chỉ báo đang bật cho Bot."
      : "Chỉ báo đang tắt: lưu tham số không tự bật chỉ báo."

  return (
    <>
    <Dialog open onOpenChange={(open) => { if (!open) requestClose() }}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-1.5rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden bg-card p-0 text-card-foreground sm:max-w-[600px]"
      >
        <DialogHeader className="flex-row items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0 space-y-1">
            <DialogTitle className="font-heading text-base font-bold">Cấu hình Bot · {indicator.name}</DialogTitle>
            <DialogDescription className="text-xs leading-5">
              Dựa trên bản đã lưu {base.revision > 0 ? `#${base.revision}` : "(chưa lưu lần nào)"}. Mua và Bán độc lập nhau. Cấu hình đã lưu dùng chung với Backtest; Bot chỉ dùng bản có hiệu lực từ phiên giao dịch kế tiếp.
            </DialogDescription>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Đóng cấu hình" onClick={requestClose}>
            <X aria-hidden="true" />
          </Button>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          {conflict && (
            <Alert variant="destructive">
              <AlertTitle>Cấu hình đã thay đổi ở nơi khác</AlertTitle>
              <AlertDescription>
                {conflict.reloaded
                  ? `Đã tải bản #${conflict.currentRevision}. Phần bạn đã sửa được giữ lại, phần còn lại theo bản mới. Kiểm tra rồi bấm Lưu.`
                  : "Bản nháp của bạn vẫn được giữ và chưa có gì được ghi. Tải lại bản mới nhất, kiểm tra rồi lưu."}
              </AlertDescription>
              {!conflict.reloaded && (
                <div className="col-start-2 mt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void reload()} disabled={reloading}>
                    <RefreshCw aria-hidden="true" className={reloading ? "animate-spin" : undefined} />
                    Tải lại
                  </Button>
                </div>
              )}
            </Alert>
          )}

          <p className="text-xs leading-5 text-muted-foreground">
            {masterNote}
            {bothOff && !activate && base.config.master_enabled && " Cả hai phía đều tắt: sau khi lưu, chỉ báo sẽ tắt."}
          </p>

          <Tabs value={side} onValueChange={(value) => setSide(value as Side)} className="gap-4">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0" aria-label="Phía điều kiện">
              {SIDES.map((item) => (
                <TabsTrigger
                  key={item}
                  value={item}
                  className={cn("min-h-9 rounded-md border border-border bg-input/30 text-xs font-semibold text-muted-foreground", TAB_STYLE[item])}
                >
                  Điều kiện {SIDE_LABEL[item]}
                </TabsTrigger>
              ))}
            </TabsList>
            {SIDES.map((item) => {
              const sideDraft = draft[item]
              const params = numericParams(sideDraft.params)
              const switchId = `${baseId}-${item}-enabled`
              const sideErrors = errors[item]
              return (
                <TabsContent key={item} value={item} className="space-y-4">
                  <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
                    <Label htmlFor={switchId} className="text-sm font-medium">{sideSwitchLabel(item)}</Label>
                    <Switch
                      id={switchId}
                      checked={sideDraft.enabled}
                      aria-label={sideSwitchLabel(item)}
                      onCheckedChange={(checked) => updateSide(item, { enabled: checked })}
                    />
                  </div>
                  {!sideDraft.enabled && (
                    <p className="-mt-2 text-xs text-muted-foreground">Phía này đang tắt. Tham số và dấu vẫn được giữ.</p>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    {sideFields(indicator, item).map((field) => {
                      const inputId = `${baseId}-${item}-${field.key}`
                      const hintId = `${inputId}-hint`
                      const error = sideErrors.fields[field.key] ?? fieldErrorFor(serverErrors, item, field.key)
                      return (
                        <div key={field.key} className="min-w-0 space-y-1.5">
                          <Label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">{field.label}</Label>
                          <div className="relative">
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
                              className={cn("h-9 tabular-nums", field.unit && "pr-14")}
                              onChange={(event) => updateSide(item, { params: { ...sideDraft.params, [field.key]: event.target.value } })}
                            />
                            {field.unit && (
                              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-muted-foreground">
                                {field.unit}
                              </span>
                            )}
                          </div>
                          <p id={hintId} className={cn("text-[11px] leading-4", error ? "text-destructive" : "text-muted-foreground")}>
                            {error ?? `Từ ${field.min} đến ${field.max}, bước ${field.step}`}
                          </p>
                        </div>
                      )
                    })}
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Điều kiện</h3>
                    <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-background/40">
                      {base.config[item].rules.map((rule, index) => (
                        <li key={rule.id}>
                          {rule.kind === "cross" && (
                            <span className="block bg-muted/60 px-3 py-1.5 text-[11px] text-muted-foreground">{CROSS_LABEL}</span>
                          )}
                          <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_minmax(0,1fr)] items-center gap-2 px-3 py-3 text-xs leading-5">
                            <span className="min-w-0 break-words">{operandLabel(rule.lhs, indicator, params)}</span>
                            <select
                              aria-label={`Dấu điều kiện ${index + 1} (${SIDE_LABEL[item]})`}
                              className="h-8 w-full rounded-sm border border-border bg-secondary text-center text-base font-bold text-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                              value={sideDraft.ops[rule.id] ?? rule.op}
                              onChange={(event) => updateSide(item, { ops: { ...sideDraft.ops, [rule.id]: event.target.value as RuleOp } })}
                            >
                              {(rule.allowed_ops as RuleOp[]).map((op) => <option key={op} value={op}>{op}</option>)}
                            </select>
                            <span className="min-w-0 text-right break-words">{operandLabel(rule.rhs, indicator, params)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {sideErrors.form && <p className="text-xs text-destructive" role="alert">{sideErrors.form}</p>}
                  </div>
                </TabsContent>
              )
            })}
          </Tabs>

          {(serverMessage || generalErrors.length > 0) && (
            <div role="alert" className="space-y-1 text-xs text-destructive">
              {serverMessage && <p>{serverMessage}</p>}
              {generalErrors.length > 0 && (
                <ul className="list-disc pl-5">
                  {generalErrors.map((error) => <li key={`${error.path}-${error.message}`}>{error.message}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="m-0 flex-row flex-wrap items-center justify-end gap-2 rounded-b-sm border-t border-border bg-card p-3">
          <Button type="button" variant="outline" className="mr-auto" onClick={() => setDraft((previous) => resetDraftSide(previous, indicator, side))}>
            Đặt lại
          </Button>
          <Button type="button" variant="outline" onClick={requestClose}>Hủy</Button>
          <Button type="button" onClick={() => void submit()} disabled={!canSave}>{controller.saving ? "Đang lưu…" : "Lưu"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <ConfirmDialog
        open={confirmingDiscard}
        title="Bỏ thay đổi chưa lưu?"
        description="Cấu hình Bot bạn vừa sửa chưa được lưu. Nếu bỏ, mọi thay đổi trong cửa sổ này sẽ mất."
        confirmLabel="Bỏ thay đổi"
        cancelLabel="Tiếp tục chỉnh sửa"
        onCancel={() => setConfirmingDiscard(false)}
        onConfirm={() => { setConfirmingDiscard(false); onClose() }}
      />
    </>
  )
}
