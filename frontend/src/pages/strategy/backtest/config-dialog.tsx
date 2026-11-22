import { useId, useMemo, useState } from "react"
import { TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConditionSideEditor } from "@/pages/demo-trading/bot/config/condition-side"
import {
  buildIndicatorConfig,
  createDraft,
  draftErrors,
  hasDraftErrors,
  isDraftDirty,
  resetDraftSide,
  sameIndicatorConfig,
  savedIndicatorConfig,
  SIDE_LABEL,
  SIDES,
  type IndicatorDraft,
} from "@/pages/demo-trading/bot/config/draft"
import type { IndicatorConfig, SharedConfigState, Side, TechnicalIndicator } from "@/pages/demo-trading/bot/config/types"
import { cn } from "@/lib/utils"

import { DialogShell } from "../shared/dialog-shell"
import type { Indicators } from "./draft"
import { SUB_TEXT } from "./ui"

const TAB_STYLE: Record<Side, string> = {
  buy: "data-active:border-price-up/50! data-active:bg-price-up/10! data-active:text-price-up! dark:data-active:border-price-up/50! dark:data-active:bg-price-up/10! dark:data-active:text-price-up!",
  sell: "data-active:border-price-down/50! data-active:bg-price-down/10! data-active:text-price-down! dark:data-active:border-price-down/50! dark:data-active:bg-price-down/10! dark:data-active:text-price-down!",
}

/** The indicator as the form edits it: the draft's own config, rows normalised to the registry. */
function draftIndicatorConfig(indicators: Indicators, indicator: TechnicalIndicator): IndicatorConfig {
  return savedIndicatorConfig({ config: { indicators } } as unknown as SharedConfigState, indicator)
}

/**
 * Per-indicator Mua/Bán form of the Backtest draft (Chỉ báo v3 form). "Lưu vào bản nháp" hands the indicator
 * back; nothing reaches the Bot or a saved strategy. Hủy/Escape ask before discarding; both tabs are
 * validated before saving.
 */
export function ConfigDialog({
  indicator,
  indicators,
  initialSide,
  adding,
  onClose,
  onSave,
}: {
  indicator: TechnicalIndicator
  indicators: Indicators
  initialSide: Side
  /** Opened from the library: the chosen side joins the draft only when saved. */
  adding: boolean
  onClose: () => void
  onSave: (indicatorId: string, config: IndicatorConfig) => void
}) {
  const baseId = useId()
  const [base] = useState(() => draftIndicatorConfig(indicators, indicator))
  const initialDraft = useMemo<IndicatorDraft>(() => {
    const draft = createDraft(base)
    return adding ? { ...draft, [initialSide]: { ...draft[initialSide], enabled: true } } : draft
  }, [base, adding, initialSide])
  const [draft, setDraft] = useState<IndicatorDraft>(initialDraft)
  const [side, setSide] = useState<Side>(initialSide)

  const errors = draftErrors(indicator, draft)
  const dirty = isDraftDirty(initialDraft, draft)
  const canSave = !hasDraftErrors(errors)
  const updateSide = (target: Side, patch: Partial<IndicatorDraft[Side]>) =>
    setDraft((previous) => ({ ...previous, [target]: { ...previous[target], ...patch } }))

  function submit() {
    const next = buildIndicatorConfig(indicator, base, draft, adding)
    if (sameIndicatorConfig(base, next)) {
      toast.info("Không có thay đổi để lưu.")
      onClose()
      return
    }
    onSave(indicator.id, next)
    onClose()
  }

  const sideHasError = (target: Side) => errors[target].rows.length > 0 || Object.keys(errors[target].fields).length > 0

  return (
    <DialogShell
      title={`${indicator.name} · bản nháp`}
      description="Chỉ đổi bản nháp của Backtest. Mua và Bán độc lập nhau; các dòng đang bật nối bằng AND."
      dirty={dirty}
      onClose={onClose}
      footer={({ requestClose }) => (
        <>
          <Button type="button" variant="outline" className="mr-auto" onClick={() => setDraft((previous) => resetDraftSide(previous, indicator, side))}>Đặt lại</Button>
          <Button type="button" variant="outline" onClick={requestClose}>Hủy</Button>
          <Button type="button" onClick={submit} disabled={!canSave}>Lưu vào bản nháp</Button>
        </>
      )}
    >
      <Tabs value={side} onValueChange={(value) => setSide(value as Side)} className="gap-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0" aria-label="Phía điều kiện">
          {SIDES.map((item) => (
            <TabsTrigger key={item} value={item} className={cn("min-h-9 rounded-md border border-border bg-input/30 text-xs font-semibold text-foreground", TAB_STYLE[item])}>
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
              {!sideDraft.enabled && <p className={`-mt-2 text-xs ${SUB_TEXT}`}>Phía này đang tắt. Tham số và dấu vẫn được giữ.</p>}

              <ConditionSideEditor
                indicator={indicator}
                side={item}
                draft={sideDraft}
                saved={base}
                errors={errors[item]}
                serverErrors={[]}
                idPrefix={baseId}
                onChange={(patch) => updateSide(item, patch)}
                dismissServerErrors={() => undefined}
              />
            </TabsContent>
          )
        })}
      </Tabs>
    </DialogShell>
  )
}
