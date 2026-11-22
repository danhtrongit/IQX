/**
 * Confirmation of a change to the Bot's next session (spec Bot và Chiến lược v2.0 §6.3–§6.5):
 * Dùng, Giữ như phiên gần nhất, Cập nhật IQX (Bot) and Dùng / Lưu và áp dụng phiên tới (Backtest).
 *
 * When Giữ tối đa drops, the server lists the positions that become due at the next session; the
 * confirm button stays off until "Tôi hiểu…" is ticked and the exact list is sent back. A race
 * with the cutoff (409 `SCHEDULE_SESSION_LOCKED`) reloads the schedule and recomputes the list for
 * the new session; a changed list (409 `DUE_POSITIONS_CHANGED`, 422 `DUE_CONFIRM_REQUIRED`) is
 * shown again before anything is written.
 */
import { useId, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"

import {
  duePositionsOf,
  duePositionsText,
  lockedNextSession,
  SCHEDULE_ERRORS,
  scheduleKeys,
  sessionLabel,
  useBotSchedule,
  useScheduleImpact,
  type DuePosition,
  type ScheduleGuard,
  type ScheduleTarget,
} from "./bot-schedule"
import { DialogShell } from "./dialog-shell"
import { errorMessage, isApiError } from "./errors"

/**
 * `{k} vị thế sẽ được bán ở phiên {Thứ 2 09/11} vì đã giữ từ {N} phiên trở lên: {HDB (12 phiên), …}.`
 * + `Tôi hiểu các vị thế trên sẽ được bán.` Renders nothing for an empty list.
 */
export function DueImpactBlock({
  positions,
  nextSession,
  maxHolding,
  confirmed,
  onConfirmedChange,
}: {
  positions: readonly DuePosition[]
  nextSession: string
  /** The new Giữ tối đa; omitted when unknown (the sentence then drops "từ N phiên trở lên"). */
  maxHolding?: number | null
  confirmed: boolean
  onConfirmedChange: (checked: boolean) => void
}) {
  const id = useId()
  if (positions.length === 0) return null
  return (
    <div data-testid="due-impact" className="space-y-2.5 rounded-md border border-status-warning/50 bg-status-warning/10 p-3 text-xs leading-5 text-foreground">
      <p className="flex gap-2">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-status-warning" />
        <span className="min-w-0 break-words">
          <strong>{positions.length} vị thế sẽ được bán ở phiên {sessionLabel(nextSession)}</strong>
          {maxHolding ? ` vì đã giữ từ ${maxHolding} phiên trở lên` : " vì đã đến hạn giữ tối đa"}: {duePositionsText(positions)}.
        </span>
      </p>
      <label htmlFor={id} className="flex cursor-pointer items-center gap-2 font-medium">
        <Checkbox id={id} checked={confirmed} onCheckedChange={(value) => onConfirmedChange(value === true)} />
        Tôi hiểu các vị thế trên sẽ được bán.
      </label>
    </div>
  )
}

export type ScheduleChangeDialogProps = {
  title: string
  /** Body sentences; gets the label of the next session (`Thứ 2 09/11`). */
  body: (nextSessionLabel: string) => ReactNode
  confirmLabel: string
  /**
   * What the server would run instead (impact of §6.5). `null` when the change is not a saved
   * version yet (Backtest "Lưu và áp dụng"): the list then only comes from a 422/409 answer.
   */
  impactTarget: ScheduleTarget | null
  /** The write, with the race guards; rejects with the API error. */
  submit: (guard: ScheduleGuard) => Promise<unknown>
  /** Toast after success, e.g. `Bot dùng {tên} từ phiên {…}.` */
  successText: (nextSessionLabel: string) => string
  onClose: () => void
  onDone?: () => void
  /** A second action left of the confirm button (Backtest §4.4.2 "Lưu thành chiến lược mới"). */
  secondary?: { label: string; onClick: () => void }
}

/** Confirmation layer of every schedule change; see the module comment. */
export function ScheduleChangeDialog({ title, body, confirmLabel, impactTarget, submit, successText, onClose, onDone, secondary }: ScheduleChangeDialogProps) {
  const queryClient = useQueryClient()
  const schedule = useBotSchedule()
  const [sessionOverride, setSessionOverride] = useState<string | null>(null)
  const nextSession = sessionOverride ?? schedule.data?.next.session_date
  const impact = useScheduleImpact(impactTarget, nextSession)
  const [positionsOverride, setPositionsOverride] = useState<DuePosition[] | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const positions = positionsOverride ?? impact.data?.positions ?? []
  const maxHolding = impact.data?.n_new ?? null
  const loading = schedule.isPending || (impactTarget !== null && impact.isPending)
  const blocked = !nextSession || loading || busy || (positions.length > 0 && !confirmed)

  async function refreshImpact() {
    await queryClient.invalidateQueries({ queryKey: ["bot", "schedule"] })
  }

  async function confirm() {
    if (!nextSession) return
    setBusy(true)
    setNotice(null)
    try {
      await submit({ expected_next_session: nextSession, ...(positions.length > 0 ? { confirm_due_positions: positions.map((position) => position.symbol) } : {}) })
      await Promise.all(scheduleKeys.affected.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      toast.success(successText(sessionLabel(nextSession)))
      onDone?.()
      onClose()
    } catch (error) {
      const locked = isApiError(error, 409, SCHEDULE_ERRORS.locked)
      const due = duePositionsOf(error)
      if (locked) {
        const moved = lockedNextSession(error)
        setPositionsOverride(null)
        setConfirmed(false)
        if (moved) setSessionOverride(moved)
        const reloaded = await schedule.refetch()
        const fresh = moved ?? reloaded.data?.next.session_date ?? null
        if (!moved && fresh) setSessionOverride(fresh)
        const text = `Phiên ${sessionLabel(nextSession)} vừa chốt.${fresh ? ` Thay đổi áp dụng từ phiên ${sessionLabel(fresh)}.` : ""}`
        setNotice(text)
        toast.warning(text)
      } else if (isApiError(error, undefined, SCHEDULE_ERRORS.dueChanged) || isApiError(error, undefined, SCHEDULE_ERRORS.dueRequired)) {
        setConfirmed(false)
        if (due) setPositionsOverride(due)
        else {
          setPositionsOverride(null)
          await refreshImpact()
        }
        setNotice("Danh sách vị thế đến hạn vừa thay đổi. Kiểm tra lại trước khi xác nhận.")
      } else {
        setNotice(errorMessage(error))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      title={title}
      size="sm"
      busy={busy}
      onClose={onClose}
      footer={({ requestClose }) => (
        <>
          <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>Hủy</Button>
          {secondary && <Button type="button" variant="outline" disabled={busy} onClick={secondary.onClick}>{secondary.label}</Button>}
          <Button type="button" disabled={blocked} onClick={() => void confirm()}>{confirmLabel}</Button>
        </>
      )}
    >
      {schedule.isError ? (
        <p role="alert" className="text-sm leading-6 text-destructive">Không tải được lịch phiên của Bot. {errorMessage(schedule.error)}</p>
      ) : !nextSession ? (
        <Skeleton className="h-16 w-full" aria-label="Đang tải lịch phiên" />
      ) : (
        <div className="space-y-2 text-sm leading-6 text-foreground">{body(sessionLabel(nextSession))}</div>
      )}
      {impactTarget !== null && impact.isPending && nextSession && <Skeleton className="h-10 w-full" aria-label="Đang kiểm tra vị thế đến hạn" />}
      {impact.isError && <p role="alert" className="text-xs leading-5 text-destructive">Chưa kiểm tra được vị thế đến hạn. {errorMessage(impact.error)}</p>}
      {nextSession && (
        <DueImpactBlock
          key={`${nextSession}:${positions.map((position) => position.symbol).join(",")}`}
          positions={positions}
          nextSession={nextSession}
          maxHolding={maxHolding}
          confirmed={confirmed}
          onConfirmedChange={setConfirmed}
        />
      )}
      {notice && <p role="status" className="rounded-md border border-status-warning/50 bg-status-warning/10 p-2.5 text-xs leading-5 text-foreground">{notice}</p>}
    </DialogShell>
  )
}
