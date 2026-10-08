import { ArrowLeft, ArrowRight, FastForward, LoaderCircle, Lock, Play, RotateCcw, RefreshCw } from "lucide-react"
import { useEffect, useId, useRef } from "react"

import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useWorkspaceFrame } from "@/components/layout/workspace-frame-context"
import { cn } from "@/lib/utils"
import { HOLD_MAX, HOLD_MIN, PRACTICE_TOTAL, type PracticeFormField, type PracticeFormRule, type Side } from "./practice-api"
import { PracticeFailureNotice } from "./practice-failure"
import { usePractice } from "./practice-context"
import { SIDES, SIDE_LABEL, ruleSideLabels, formatInt } from "./practice-model"
import { useExitPractice } from "./practice-nav"

const pad2 = (value: number) => String(value).padStart(2, "0")

function ParamField({
  side,
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  side: Side
  field: PracticeFormField
  value: string
  error: string | undefined
  disabled: boolean
  onChange: (text: string) => void
}) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">
        {field.label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode={field.type === "integer" ? "numeric" : "decimal"}
          min={field.min}
          max={field.max}
          step={field.step}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? hintId : undefined}
          data-side={side}
          data-param={field.key}
          className={cn("h-9 tabular-nums", field.unit && "pr-14")}
          onChange={(event) => onChange(event.target.value)}
        />
        {field.unit && (
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] text-muted-foreground">{field.unit}</span>
        )}
      </div>
      {error && (
        <p id={hintId} className="text-[11px] leading-snug text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function RuleRow({
  index,
  rule,
  left,
  right,
  op,
  disabled,
  onOp,
}: {
  index: number
  rule: PracticeFormRule
  left: string
  right: string
  op: string
  disabled: boolean
  onOp: (op: PracticeFormRule["allowed_ops"][number]) => void
}) {
  return (
    <li data-rule-id={rule.rule_id}>
      {rule.kind === "cross" && <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Giao cắt giữa hai phiên</span>}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2.5 text-xs">
        <span className="break-words">{left}</span>
        <select
          aria-label={`Dấu điều kiện ${index + 1}`}
          value={op}
          disabled={disabled}
          onChange={(event) => onOp(event.target.value as PracticeFormRule["allowed_ops"][number])}
          className="h-8 rounded-sm border border-input bg-background px-2 text-sm font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {rule.allowed_ops.map((allowed) => (
            <option key={allowed} value={allowed}>
              {allowed}
            </option>
          ))}
        </select>
        <span className="break-words text-right">{right}</span>
      </div>
    </li>
  )
}

function DraftStatusLine() {
  const { draftStatus, locked } = usePractice()
  if (locked || draftStatus === "idle") return <span aria-live="polite" />
  return (
    <span aria-live="polite" className={cn("text-[11px]", draftStatus === "error" ? "text-destructive" : "text-muted-foreground")}>
      {draftStatus === "saving" ? "Đang lưu bản nháp…" : draftStatus === "saved" ? "Đã lưu bản nháp" : "Chưa lưu được bản nháp. Cấu hình vẫn dùng được để bắt đầu."}
    </span>
  )
}

function Editor() {
  const practice = usePractice()
  const holdId = useId()
  const { form, spec, validation, locked, side, setSide, indicatorId, indicatorName } = practice
  if (!form || !spec || !validation) return null
  const sideSpec = spec[side]
  const sideForm = form[side]
  const indicator = { id: indicatorId, name: indicatorName }
  const disabled = locked
  const holdError = validation.holdError
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate font-heading text-sm font-bold">{indicatorName}</h3>
        {locked ? (
          <Badge variant="secondary" className="gap-1">
            <Lock aria-hidden="true" />
            Đã khóa
          </Badge>
        ) : (
          <Button type="button" variant="ghost" size="xs" onClick={practice.resetSide} aria-label={`Mặc định điều kiện ${SIDE_LABEL[side]}`}>
            <RotateCcw aria-hidden="true" />
            Mặc định
          </Button>
        )}
      </div>

      <div role="group" aria-label="Phía điều kiện đang chỉnh" className="grid grid-cols-2 gap-2">
        {SIDES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={side === item}
            data-side-tab={item}
            onClick={() => setSide(item)}
            className={cn(
              "relative min-h-9 rounded-sm border px-2 text-xs font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              side === item
                ? item === "buy"
                  ? "border-price-up/60 bg-price-up/15 text-price-up"
                  : "border-price-down/60 bg-price-down/15 text-price-down"
                : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
            )}
          >
            Điều kiện {SIDE_LABEL[item]}
            {validation.sideHasIssue[item] && !locked && (
              <>
                <span aria-hidden="true" className="absolute top-1 right-1.5 size-1.5 rounded-full bg-destructive" />
                <span className="sr-only"> (có lỗi)</span>
              </>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <span className="text-xs font-medium">Sử dụng điều kiện {SIDE_LABEL[side]}</span>
        <Switch
          checked={sideForm.enabled}
          disabled={disabled}
          aria-label={`Bật ${SIDE_LABEL[side]}`}
          onCheckedChange={(checked) => practice.editEnabled(side, checked)}
        />
      </div>
      {side === "buy" && !sideForm.enabled && !locked && <p className="-mt-2 text-[11px] text-destructive">Bật điều kiện Mua để bắt đầu.</p>}
      {side === "sell" && !sideForm.enabled && (
        <p className="-mt-2 text-[11px] text-muted-foreground">Bán tắt: lượt chỉ thoát khi hết thời gian giữ tối đa.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {sideSpec.fields.map((field) => (
          <ParamField
            key={`${side}-${field.key}`}
            side={side}
            field={field}
            value={sideForm.params[field.key] ?? ""}
            error={locked ? undefined : validation.byPath[`${side}.params.${field.key}`]}
            disabled={disabled}
            onChange={(text) => practice.editParam(side, field.key, text)}
          />
        ))}
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Điều kiện</p>
        <ul className="divide-y divide-border rounded-md border border-border bg-card/50">
          {sideSpec.rules.map((rule, index) => {
            const labels = ruleSideLabels(rule, indicator, sideSpec.fields, sideForm.params)
            return (
              <RuleRow
                key={rule.rule_id}
                index={index}
                rule={rule}
                left={labels.left}
                right={labels.right}
                op={sideForm.ops[rule.rule_id] ?? rule.default_op}
                disabled={disabled}
                onOp={(op) => practice.editOp(side, rule.rule_id, op)}
              />
            )
          })}
        </ul>
      </div>

      <div className="space-y-1 border-t border-border pt-3">
        <label htmlFor={holdId} className="block text-xs font-medium text-muted-foreground">
          Thời gian giữ tối đa
        </label>
        <div className="relative">
          <Input
            id={holdId}
            type="number"
            inputMode="numeric"
            min={HOLD_MIN}
            max={HOLD_MAX}
            step={1}
            value={form.hold}
            disabled={disabled}
            aria-invalid={holdError && !locked ? true : undefined}
            aria-describedby={`${holdId}-hint`}
            className="h-9 pr-14 tabular-nums"
            onChange={(event) => practice.editHold(event.target.value)}
          />
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] text-muted-foreground">phiên</span>
        </div>
        <p id={`${holdId}-hint`} role={holdError && !locked ? "alert" : undefined} className={cn("text-[11px] leading-snug", holdError && !locked ? "text-destructive" : "text-muted-foreground")}>
          {holdError && !locked ? holdError : `Mua xong, vị thế tự thoát sau tối đa ${formatInt(Number(form.hold))} phiên nếu điều kiện Bán chưa đạt.`}
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
        <span className="text-muted-foreground">Vốn mỗi lần mua</span>
        <b>100% vốn</b>
      </div>
      <DraftStatusLine />
    </div>
  )
}

function ActionBar() {
  const practice = usePractice()
  const frame = useWorkspaceFrame()
  const { phase, validation, state } = practice
  // On narrow screens the panel is a layer: close it once a run is locked so the replay is visible.
  const closeLayer = (started: boolean) => {
    if (started && frame?.overlay) frame.setOpen(false)
  }
  const bar = {
    start: async () => closeLayer(await practice.start()),
    retry: async () => closeLayer(await practice.retryStart()),
    next: () => void practice.next(),
  }

  const startError = practice.startFailure
  const issue = validation && !validation.valid && phase === "ready" ? validation.issues[0] : undefined
  return (
    <div className="space-y-2">
      {startError && (phase === "ready" || phase === "starting") && (
        <PracticeFailureNotice failure={startError} indicatorId={practice.indicatorId} onRetry={startError.kind === "stale" ? practice.reload : bar.start} />
      )}
      {practice.nextFailure && (
        <PracticeFailureNotice failure={practice.nextFailure} indicatorId={practice.indicatorId} onRetry={practice.nextFailure.kind === "stale" ? practice.reload : bar.next} />
      )}
      {phase === "failed" && (
        <PracticeFailureNotice
          failure={practice.runFailure ?? { kind: "compute_failed", message: "Không tính được kết quả lượt này. Lượt vẫn được giữ để thử lại." }}
          indicatorId={practice.indicatorId}
        />
      )}
      {issue && (
        <p role="alert" className="text-[11px] leading-snug text-destructive" data-testid="start-blocker">
          {issue.message}
        </p>
      )}
      {phase === "viewing_past" ? (
        <Button type="button" variant="outline" className="h-10 w-full" disabled={!practice.actionsArmed} onClick={() => practice.viewRun(null)}>
          <ArrowLeft aria-hidden="true" />
          Về lượt hiện tại
        </Button>
      ) : phase === "ready" || phase === "starting" ? (
        <Button type="button" className="h-10 w-full" disabled={!validation?.valid || practice.startPending || !practice.actionsArmed} onClick={bar.start}>
          {practice.startPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
          {practice.startPending ? "Đang khóa cấu hình…" : "Bắt đầu"}
        </Button>
      ) : phase === "failed" || phase === "computing" ? (
        <Button type="button" className="h-10 w-full" disabled={!state?.can_retry || practice.startPending || !practice.actionsArmed} onClick={bar.retry}>
          <RefreshCw aria-hidden="true" />
          Thử lại
        </Button>
      ) : phase === "replaying" ? (
        <Button type="button" variant="outline" className="h-10 w-full" disabled={!practice.actionsArmed} onClick={() => practice.playbackControls?.finish()}>
          <FastForward aria-hidden="true" />
          Xem kết quả ngay
        </Button>
      ) : phase === "completed" ? (
        <Button type="button" className="h-10 w-full" disabled={!practice.canNext || practice.nextPending || !practice.actionsArmed} onClick={bar.next}>
          Tập luyện tiếp
          <ArrowRight aria-hidden="true" />
        </Button>
      ) : phase === "set_completed" ? (
        <Button type="button" className="h-10 w-full" disabled>
          Đã hết {PRACTICE_TOTAL} lượt
        </Button>
      ) : null}
    </div>
  )
}

/** Right panel: the indicator's conditions, the hold time and the one action that fits the phase. */
export function PracticePanel() {
  const practice = usePractice()
  const exit = useExitPractice()
  // Like the approved sample, entering a practice on a narrow screen closes the panel layer so the
  // chart comes first; the panel stays reachable from the toggle.
  const frame = useWorkspaceFrame()
  const frameRef = useRef(frame)
  useEffect(() => {
    frameRef.current = frame
  })
  const { indicatorId } = practice
  useEffect(() => {
    const current = frameRef.current
    if (current?.overlay) current.setOpen(false)
  }, [indicatorId])
  const { state, phase, loadFailure } = practice
  const ordinal = state?.ordinal ?? 1
  const shownOrdinal = practice.viewingPast && practice.run ? practice.run.ordinal : ordinal
  return (
    <SidebarPanel
      title={`Luyện tập ${practice.indicatorName}`}
      description={`Lượt ${pad2(shownOrdinal)} / ${state?.total ?? PRACTICE_TOTAL} · Điều kiện Mua / Bán`}
      footer={state ? <ActionBar /> : undefined}
    >
      <Button type="button" variant="ghost" size="xs" className="-ml-1 text-muted-foreground" onClick={exit}>
        <ArrowLeft aria-hidden="true" />
        Chỉ báo của Bot
      </Button>
      {phase === "loading" && (
        <div className="space-y-3" aria-busy="true" aria-label="Đang tải cấu hình luyện tập">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {phase === "error" && loadFailure && (
        <PracticeFailureNotice failure={loadFailure} indicatorId={practice.indicatorId} onRetry={practice.reload} />
      )}
      {state && <Editor />}
    </SidebarPanel>
  )
}
