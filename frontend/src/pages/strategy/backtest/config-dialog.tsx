import { useId, useMemo, useState } from "react"
import { RefreshCw, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isShownInSide, sideOfError, type ConfigFieldError } from "@/pages/demo-trading/bot/config/api"
import { ConditionSideEditor } from "@/pages/demo-trading/bot/config/condition-side"
import {
  buildIndicatorConfig,
  createDraft,
  draftErrors,
  hasDraftErrors,
  isDraftDirty,
  rebaseDraft,
  resetDraftSide,
  sameIndicatorConfig,
  savedIndicatorConfig,
  SIDE_LABEL,
  SIDES,
  type IndicatorDraft,
} from "@/pages/demo-trading/bot/config/draft"
import { effectiveText } from "@/pages/demo-trading/bot/config/summary"
import type { Side, TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"
import type { BotConfigController } from "@/pages/demo-trading/bot/config/use-bot-config"
import { cn } from "@/lib/utils"

import { DialogShell } from "../shared/dialog-shell"

type Conflict = { reloaded: boolean; currentRevision: number | null }

const TAB_STYLE: Record<Side, string> = {
  buy: "data-active:border-price-up/50! data-active:bg-price-up/10! data-active:text-price-up! dark:data-active:border-price-up/50! dark:data-active:bg-price-up/10! dark:data-active:text-price-up!",
  sell: "data-active:border-price-down/50! data-active:bg-price-down/10! data-active:text-price-down! dark:data-active:border-price-down/50! dark:data-active:bg-price-down/10! dark:data-active:text-price-down!",
}

/**
 * Per-indicator Mua/Bán form of the Backtest. There is ONE saved configuration: saving here changes
 * what the Bot uses too (from its effective session), so the dialog says so. Until Lưu, everything is
 * a draft: Hủy/Escape ask before discarding, Đặt lại only resets the open tab's condition rows, both
 * tabs are validated before Lưu (SPEC V3 §4), and a 409 keeps the draft and offers a reload that
 * keeps what the user changed.
 */
export function ConfigDialog({
  indicator,
  controller,
  initialSide,
  adding,
  onClose,
}: {
  indicator: TechnicalIndicator
  controller: BotConfigController
  initialSide: Side
  /** Opened from the library: the chosen side joins the saved configuration only when saved. */
  adding: boolean
  onClose: () => void
}) {
  const baseId = useId()
  const [base, setBase] = useState(() => ({
    config: savedIndicatorConfig(controller.state, indicator),
    revision: controller.state?.saved_revision ?? 0,
  }))
  const initialDraft = useMemo<IndicatorDraft>(() => {
    const draft = createDraft(base.config)
    return adding ? { ...draft, [initialSide]: { ...draft[initialSide], enabled: true } } : draft
  }, [base, adding, initialSide])
  const [draft, setDraft] = useState<IndicatorDraft>(initialDraft)
  const [side, setSide] = useState<Side>(initialSide)
  const [serverErrors, setServerErrors] = useState<ConfigFieldError[]>([])
  const [serverMessage, setServerMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [reloading, setReloading] = useState(false)

  const errors = draftErrors(indicator, draft)
  const dirty = isDraftDirty(initialDraft, draft)
  const unresolvedConflict = !!conflict && !conflict.reloaded
  const busy = controller.saving || reloading
  const canSave = !busy && !hasDraftErrors(errors) && !unresolvedConflict
  const updateSide = (target: Side, patch: Partial<IndicatorDraft[Side]>) =>
    setDraft((previous) => ({ ...previous, [target]: { ...previous[target], ...patch } }))

  async function submit() {
    setServerErrors([])
    setServerMessage(null)
    const next = buildIndicatorConfig(indicator, base.config, draft, adding)
    if (sameIndicatorConfig(base.config, next)) {
      toast.info("Không có thay đổi để lưu.")
      onClose()
      return
    }
    const outcome = await controller.save(indicator.id, next, base.revision)
    if (outcome.ok) {
      const when = effectiveText(outcome.result.status, outcome.result.effective_session)
      toast.success(`Đã lưu cấu hình ${indicator.name} (bản ${outcome.result.revision}). Bot cũng dùng bản này${when ? `: ${when}` : " từ phiên hiệu lực"}.`)
      onClose()
      return
    }
    if (outcome.reason === "conflict") {
      setConflict({ reloaded: false, currentRevision: outcome.currentRevision })
      return
    }
    if (outcome.reason === "invalid") {
      setServerErrors(outcome.errors)
      // The messages sit under their rows: open the tab that has them.
      const failing = outcome.errors.map(sideOfError).filter((target): target is Side => target !== null)
      if (failing.length > 0 && !failing.includes(side)) setSide(failing[0] as Side)
    }
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

  const generalErrors = serverErrors.filter((error) => error.message !== serverMessage && !SIDES.some((item) => isShownInSide(error, indicator, item)))
  const sideHasError = (target: Side) =>
    errors[target].rows.length > 0 || Object.keys(errors[target].fields).length > 0 || serverErrors.some((error) => sideOfError(error) === target)
  const dismissServerErrors = (match: (error: ConfigFieldError) => boolean) => setServerErrors((previous) => previous.filter((error) => !match(error)))

  return (
    <DialogShell
      title={`Cấu hình chung · ${indicator.name}`}
      description={`Dựa trên bản đã lưu ${base.revision > 0 ? `#${base.revision}` : "(chưa lưu lần nào)"}. Mua và Bán độc lập nhau.`}
      dirty={dirty && !busy}
      busy={busy}
      onClose={onClose}
      footer={({ requestClose }) => (
        <>
          <Button type="button" variant="outline" className="mr-auto" onClick={() => setDraft((previous) => resetDraftSide(previous, indicator, side))}>Đặt lại</Button>
          <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>Hủy</Button>
          <Button type="button" onClick={() => void submit()} disabled={!canSave}>{controller.saving ? "Đang lưu…" : "Lưu"}</Button>
        </>
      )}
    >
      <p className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-5" data-testid="shared-config-note">
        <strong className="block text-foreground">Cấu hình này dùng chung với Bot.</strong>
        <span className="text-muted-foreground">
          Lưu ở đây đổi cấu hình mà Bot cũng dùng, từ phiên giao dịch hợp lệ kế tiếp; Bot không dùng bản mới trước phiên đó. Chạy hoặc xem kết quả backtest không ghi cấu hình.
        </span>
      </p>

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

      <Tabs value={side} onValueChange={(value) => setSide(value as Side)} className="gap-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0" aria-label="Phía điều kiện">
          {SIDES.map((item) => (
            <TabsTrigger key={item} value={item} className={cn("min-h-9 rounded-md border border-border bg-input/30 text-xs font-semibold text-muted-foreground", TAB_STYLE[item])}>
              Điều kiện {SIDE_LABEL[item]}
              {sideHasError(item) && (
                <>
                  <TriangleAlert aria-hidden="true" className="size-3.5 text-destructive" />
                  <span className="sr-only"> (có lỗi)</span>
                </>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {SIDES.map((item) => {
          const sideDraft = draft[item]
          const switchId = `${baseId}-${item}-enabled`
          const label = `Sử dụng điều kiện ${SIDE_LABEL[item]}`
          return (
            <TabsContent key={item} value={item} className="space-y-4">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
                <Label htmlFor={switchId} className="text-sm font-medium">{label}</Label>
                <Switch id={switchId} checked={sideDraft.enabled} aria-label={label} onCheckedChange={(checked) => updateSide(item, { enabled: checked })} />
              </div>
              {!sideDraft.enabled && <p className="-mt-2 text-xs text-muted-foreground">Phía này đang tắt. Tham số và dấu vẫn được giữ.</p>}

              <ConditionSideEditor
                indicator={indicator}
                side={item}
                draft={sideDraft}
                saved={base.config}
                errors={errors[item]}
                serverErrors={serverErrors}
                idPrefix={baseId}
                onChange={(patch) => updateSide(item, patch)}
                dismissServerErrors={dismissServerErrors}
              />
            </TabsContent>
          )
        })}
      </Tabs>

      {(serverMessage || generalErrors.length > 0) && (
        <div role="alert" className="space-y-1 text-xs text-destructive">
          {serverMessage && <p>{serverMessage}</p>}
          {generalErrors.length > 0 && <ul className="list-disc pl-5">{generalErrors.map((error) => <li key={`${error.path}-${error.message}`}>{error.message}</li>)}</ul>}
        </div>
      )}
    </DialogShell>
  )
}
