/**
 * Lưu ▾ of tab Chỉ báo (spec v2.0 §4.4): the four items, the name dialog (§4.4.1), the "Lưu bản mới cho chiến
 * lược đang dùng trên Bot" dialog (§4.4.2), "Đổi chiến lược của Bot?" (§6.3) and the due-positions block (§6.5).
 * Only a draft that ran successfully after its last edit can be saved; the server re-checks `from_run_id`.
 */
import { useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronDown, LoaderCircle, Save } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/use-auth"

import { ErrorLine } from "../shared/controls"
import { DialogShell } from "../shared/dialog-shell"
import { isApiError } from "../shared/errors"
import { createStrategy, createVersion, type SaveResult, type StrategyContent, type VersionDetail, type VersionItem } from "./api"
import { fetchScheduleImpact, putScheduleNext, scheduleKeys, sessionLabel, type BotSchedule, type ScheduleImpact as DueImpact } from "../shared/bot-schedule"
import { DueImpactBlock } from "../shared/due-confirm"
import { stampLabel } from "./draft"
import { useRefreshAfterSave } from "./hooks"
import { LIMIT_TEXT, NOT_RAN, saveErrorText } from "./save-errors"
import { dueImpactOf } from "./schedule"
import { SUB_TEXT } from "./ui"

export const UNCHANGED = "Chưa có thay đổi so với bản đang mở."
export const ALREADY_NEXT = "Đã là chiến lược của Bot ở phiên tới."

/** The user strategy open in the form. */
export type UserOrigin = { id: string; name: string; version: number; latest: number; content: StrategyContent; created_at: string }

export type Saved = { origin: UserOrigin; applied: boolean }


const versionOf = (result: SaveResult): Pick<VersionItem, "version" | "created_at"> => result.version as VersionItem | VersionDetail

/** A confirm dialog that may carry the due-positions block; the primary button waits for the tick. */
export function ApplyDialog({
  title,
  children,
  impact,
  impactLoading = false,
  pending,
  error,
  actions,
  onClose,
}: {
  title: string
  children: ReactNode
  impact: DueImpact | null
  impactLoading?: boolean
  pending: boolean
  error: string | null
  actions: { label: string; primary?: boolean; onClick: (confirm: string[] | undefined) => void }[]
  onClose: () => void
}) {
  const key = impact?.positions.map((item) => item.symbol).join(",") ?? ""
  // The tick belongs to one list: a new list (409 DUE_POSITIONS_CHANGED) must be ticked again.
  const [checkedFor, setCheckedFor] = useState<string | null>(null)
  const checked = checkedFor === key
  const setChecked = (value: boolean) => setCheckedFor(value ? key : null)
  const needsTick = !!impact && impact.positions.length > 0
  const confirm = needsTick ? impact.positions.map((item) => item.symbol) : undefined
  return (
    <DialogShell
      title={title}
      size="md"
      busy={pending}
      onClose={onClose}
      footer={({ requestClose }) => (
        <>
          <Button type="button" variant="outline" disabled={pending} onClick={requestClose}>Hủy</Button>
          {actions.map((action) => (
            <Button
              key={action.label}
              type="button"
              variant={action.primary ? "default" : "outline"}
              disabled={pending || impactLoading || (action.primary === true && needsTick && !checked)}
              onClick={() => action.onClick(action.primary ? confirm : undefined)}
            >
              {pending && action.primary && <LoaderCircle aria-hidden="true" className="animate-spin" />}
              {action.label}
            </Button>
          ))}
        </>
      )}
    >
      <div className="space-y-2 text-sm leading-6">{children}</div>
      {impactLoading && <p className={`text-xs ${SUB_TEXT}`}>Đang kiểm tra vị thế đến hạn…</p>}
      {impact && impact.positions.length > 0 && (
        <DueImpactBlock positions={impact.positions} nextSession={impact.next_session} maxHolding={impact.n_new || null} confirmed={checked} onConfirmedChange={setChecked} />
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </DialogShell>
  )
}

/** Hộp đặt tên (§4.4.1). */
export function NameDialog({
  title,
  suggested,
  savedList,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  title: string
  suggested: string
  savedList: boolean
  pending: boolean
  error: string | null
  onSubmit: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(suggested)
  const [local, setLocal] = useState<string | null>(null)
  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return setLocal("Nhập tên chiến lược.")
    if ([...trimmed].length > 40) return setLocal("Tên chiến lược tối đa 40 ký tự.")
    setLocal(null)
    onSubmit(trimmed)
  }
  return (
    <DialogShell
      title={title}
      size="sm"
      busy={pending}
      dirty={name !== suggested}
      onClose={onClose}
      footer={({ requestClose }) => (
        <>
          <Button type="button" variant="outline" disabled={pending} onClick={requestClose}>Hủy</Button>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Save aria-hidden="true" />}
            Lưu
          </Button>
        </>
      )}
    >
      <form className="space-y-1.5" onSubmit={(event) => { event.preventDefault(); submit() }}>
        <Label htmlFor="strategy-name">Tên chiến lược (tối đa 40 ký tự)</Label>
        <Input id="strategy-name" autoFocus maxLength={40} value={name} onChange={(event) => setName(event.target.value)} aria-invalid={!!(local ?? error)} />
      </form>
      {(local ?? error) && <ErrorLine>{local ?? error}</ErrorLine>}
      <p className={`text-xs leading-5 ${SUB_TEXT}`}>
        Lưu: rổ mã{savedList ? " (chép danh sách mã hiện tại)" : ""}, Điều kiện Mua, Bán và Giữ tối đa. Lần chạy vừa rồi được gắn với bản này.
      </p>
    </DialogShell>
  )
}

type Step =
  | { kind: "name"; thenUse: boolean; suggested: string }
  | { kind: "version"; thenUse: boolean }
  | { kind: "use"; impact: DueImpact | null; loading: boolean }
  | { kind: "new-due"; name: string; impact: DueImpact }
  | null

/**
 * `Lưu ▾` and its dialogs. `ran` = the successful run whose content equals the draft (null: not runnable to
 * save). `origin` = the Chiến lược của tôi open in the form (null: a new strategy).
 */
export function SaveControls({
  content,
  ran,
  origin,
  changed,
  count,
  limit,
  schedule,
  onSaved,
}: {
  content: StrategyContent | null
  ran: { runId: string } | null
  origin: UserOrigin | null
  /** The draft differs from the open version (always true for a new strategy with rows). */
  changed: boolean
  count: number
  limit: number
  schedule: BotSchedule | undefined
  onSaved: (saved: Saved) => void
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const refresh = useRefreshAfterSave()
  const [step, setStep] = useState<Step>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dueFromServer, setDueFromServer] = useState<DueImpact | null>(null)

  const nextSession = schedule?.next.session_date ?? null
  const isBotNext = !!origin && schedule?.next.source === "user" && schedule.next.id === origin.id
  const full = count >= limit
  const notRan = !ran || !content
  const isLatest = !!origin && origin.version === origin.latest

  function close() {
    if (pending) return
    setStep(null)
    setError(null)
    setDueFromServer(null)
  }

  async function handle(errorValue: unknown, onDue: (impact: DueImpact) => void) {
    const due = dueImpactOf(errorValue)
    if (due) {
      onDue({ ...due, next_session: due.next_session || nextSession || "" })
      setError(isApiError(errorValue, 409) ? "Danh sách vị thế đến hạn vừa thay đổi. Kiểm tra lại rồi xác nhận." : null)
      return
    }
    if (isApiError(errorValue, 409, "SCHEDULE_SESSION_LOCKED")) await queryClient.invalidateQueries({ queryKey: scheduleKeys.schedule(user?.id) })
    // A save made straight from the menu has no dialog to show the error in.
    if (step === null) toast.error(saveErrorText(errorValue, schedule))
    else setError(saveErrorText(errorValue, schedule))
  }

  const applyFields = (apply: boolean, confirm?: string[]) =>
    apply ? { apply_next: true, ...(nextSession ? { expected_next_session: nextSession } : {}), ...(confirm ? { confirm_due_positions: confirm } : {}) } : {}

  async function saveVersion(apply: boolean, confirm?: string[]) {
    if (!origin || !content || !ran) return
    setPending(true)
    setError(null)
    try {
      const result = await createVersion(origin.id, { content, from_run_id: ran.runId, expected_latest_version: origin.latest, ...applyFields(apply, confirm) })
      const version = versionOf(result)
      refresh(origin.id)
      setStep(null)
      setDueFromServer(null)
      const applied = apply || isBotNext
      toast.success(applied && nextSession ? `Đã lưu bản ${stampLabel(version.created_at)}. Bot dùng bản này từ phiên ${sessionLabel(nextSession)}.` : `Đã lưu bản ${stampLabel(version.created_at)}.`)
      onSaved({ origin: { ...origin, version: version.version, latest: version.version, content, created_at: version.created_at }, applied: apply })
    } catch (caught) {
      await handle(caught, setDueFromServer)
    } finally {
      setPending(false)
    }
  }

  async function createNew(name: string, apply: boolean, confirm?: string[]) {
    if (!content || !ran) return
    setPending(true)
    setError(null)
    try {
      const result = await createStrategy({ name, content, from_run_id: ran.runId, ...applyFields(apply, confirm) })
      const version = versionOf(result)
      refresh(result.strategy.id)
      setStep(null)
      toast.success(apply && nextSession ? `Đã lưu "${name}". Bot dùng từ phiên ${sessionLabel(nextSession)}.` : `Đã lưu "${name}" · bản ${stampLabel(version.created_at)}.`)
      onSaved({ origin: { id: result.strategy.id, name: result.strategy.name ?? name, version: version.version, latest: version.version, content, created_at: version.created_at }, applied: apply })
    } catch (caught) {
      await handle(caught, (impact) => setStep({ kind: "new-due", name, impact }))
    } finally {
      setPending(false)
    }
  }

  async function openUse() {
    if (!origin) return
    setError(null)
    setStep({ kind: "use", impact: null, loading: true })
    try {
      const impact = await fetchScheduleImpact({ source: "user", id: origin.id })
      setStep({ kind: "use", impact, loading: false })
    } catch {
      // The server checks again when it writes; the dialog still opens.
      setStep({ kind: "use", impact: null, loading: false })
    }
  }

  async function applyToBot(confirm?: string[]) {
    if (!origin || !nextSession) return
    setPending(true)
    setError(null)
    try {
      await putScheduleNext({ source: "user", id: origin.id }, { expected_next_session: nextSession, ...(confirm ? { confirm_due_positions: confirm } : {}) })
      refresh(origin.id)
      setStep(null)
      toast.success(`Bot dùng ${origin.name} từ phiên ${sessionLabel(nextSession)}.`)
    } catch (caught) {
      await handle(caught, (impact) => setStep({ kind: "use", impact, loading: false }))
    } finally {
      setPending(false)
    }
  }

  const item = (label: string, disabled: string | null, onSelect: () => void, sub?: string, testId?: string) => (
    <DropdownMenuItem
      disabled={disabled !== null}
      data-testid={testId}
      className="flex-col items-start gap-0.5 whitespace-normal"
      onSelect={() => onSelect()}
    >
      <span className="font-medium">{label}</span>
      {(disabled ?? sub) && <span className={`text-[11px] leading-4 ${SUB_TEXT}`}>{disabled ?? sub}</span>}
    </DropdownMenuItem>
  )

  const nextText = nextSession ? `Áp dụng từ phiên ${sessionLabel(nextSession)}.` : undefined
  const savedList = content?.universe.type === "saved_list"

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" data-testid="save-menu-trigger">
            <Save aria-hidden="true" />
            Lưu
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[min(340px,calc(100vw-2rem))]" data-testid="save-menu">
          {origin && item(`Lưu thành bản mới của "${origin.name}"`, notRan ? NOT_RAN : !changed ? UNCHANGED : null, () => (isBotNext ? setStep({ kind: "version", thenUse: false }) : void saveVersion(false)), undefined, "save-version")}
          {item("Lưu thành chiến lược mới…", notRan ? NOT_RAN : full ? LIMIT_TEXT : null, () => setStep({ kind: "name", thenUse: false, suggested: origin ? `${origin.name} (2)` : "" }), undefined, "save-new")}
          {origin && isLatest && !changed
            ? item("Dùng chiến lược này cho Bot", notRan ? NOT_RAN : isBotNext ? ALREADY_NEXT : !nextSession ? "Chưa tải được Lịch phiên của Bot." : null, () => void openUse(), nextText, "save-use")
            : item("Lưu và dùng cho Bot…", notRan ? NOT_RAN : !origin && full ? LIMIT_TEXT : !nextSession ? "Chưa tải được Lịch phiên của Bot." : null, () => (origin ? setStep({ kind: "version", thenUse: true }) : setStep({ kind: "name", thenUse: true, suggested: "" })), nextText, "save-use")}
        </DropdownMenuContent>
      </DropdownMenu>

      {step?.kind === "name" && (
        <NameDialog
          title={step.thenUse ? "Lưu và dùng cho Bot" : "Lưu thành chiến lược mới"}
          suggested={step.suggested}
          savedList={savedList}
          pending={pending}
          error={error}
          onSubmit={(name) => void createNew(name, step.thenUse)}
          onClose={close}
        />
      )}

      {step?.kind === "version" && origin && (isBotNext || step.thenUse) && (
        <ApplyDialog
          title="Lưu bản mới cho chiến lược đang dùng trên Bot"
          impact={dueFromServer}
          pending={pending}
          error={error}
          onClose={close}
          actions={[
            {
              label: "Lưu thành chiến lược mới",
              onClick: () => {
                setError(null)
                setDueFromServer(null)
                setStep({ kind: "name", thenUse: false, suggested: `${origin.name} (2)` })
              },
            },
            { label: "Lưu và áp dụng phiên tới", primary: true, onClick: (confirm) => void saveVersion(true, confirm) },
          ]}
        >
          <p>Chiến lược <b>{origin.name}</b> {isBotNext ? "đang được Bot dùng" : "sẽ được đặt cho Bot"}.</p>
          <p>
            Bản này sẽ được Bot dùng từ phiên <b>{sessionLabel(nextSession)}</b>. Phiên gần nhất{schedule?.last ? ` (${sessionLabel(schedule.last.session_date)})` : ""} vẫn ghi nhận bản cũ.
          </p>
          <p className="text-xs leading-5">
            Lưu trước giờ chốt dữ liệu của phiên {sessionLabel(nextSession)} thì áp dụng cho phiên đó. Mã đang giữ bán theo điều kiện Bán và Giữ tối đa của bản mới; số phiên đã giữ vẫn tính tiếp.
          </p>
        </ApplyDialog>
      )}
      {step?.kind === "use" && origin && (
        <ApplyDialog
          title="Đổi chiến lược của Bot?"
          impact={step.impact}
          impactLoading={step.loading}
          pending={pending}
          error={error}
          onClose={close}
          actions={[{ label: "Dùng cho Bot", primary: true, onClick: (confirm) => void applyToBot(confirm) }]}
        >
          <p>Từ phiên <b>{sessionLabel(nextSession)}</b>, Bot dùng <b>{origin.name}</b>.</p>
          <p className="text-xs leading-5">Mã đang giữ bán theo điều kiện Bán và Giữ tối đa của chiến lược mới.</p>
        </ApplyDialog>
      )}

      {step?.kind === "new-due" && (
        <ApplyDialog
          title="Đổi chiến lược của Bot?"
          impact={step.impact}
          pending={pending}
          error={error}
          onClose={close}
          actions={[{ label: "Lưu và dùng cho Bot", primary: true, onClick: (confirm) => void createNew(step.name, true, confirm) }]}
        >
          <p>Từ phiên <b>{sessionLabel(step.impact.next_session || nextSession)}</b>, Bot dùng <b>{step.name}</b>.</p>
          <p className="text-xs leading-5">Mã đang giữ bán theo điều kiện Bán và Giữ tối đa của chiến lược mới.</p>
        </ApplyDialog>
      )}
    </>
  )
}
