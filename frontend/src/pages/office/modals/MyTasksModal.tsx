import { Check, Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  useCheckInAttendance,
  useCreateProposal,
  useCreateStickyNote,
  useDeleteStickyNote,
  useOfficeAttendanceToday,
  useOfficeMyProposals,
  useOfficeStickyNotes,
  useOfficeTasks,
  useSubmitTask,
  useUpdateStickyNote,
} from "../hooks.ts"
import type {
  OfficeMe,
  OfficeStickyColor,
  OfficeStickyNote,
  OfficeTask,
} from "../types.ts"
import {
  formatDayMonth,
  formatFullDate,
  formatHm,
  monthNumberFromPeriod,
} from "../utils.ts"
import { ModalShell, OfficeQueryError } from "./ModalShell.tsx"

const STICKY_COLORS: readonly {
  key: OfficeStickyColor
  label: string
  hex: string
}[] = [
  { key: "y", label: "Vàng nhạt", hex: "#FFE9A0" },
  { key: "p", label: "Hồng nhạt", hex: "#FFC9D6" },
  { key: "b", label: "Xanh dương nhạt", hex: "#BFE3FF" },
  { key: "g", label: "Xanh lá nhạt", hex: "#C8F0C2" },
]

const MAX_SUBMIT_NOTE = 500
const MAX_PROPOSAL = 1000
const MAX_STICKY_NOTE = 300
const STICKY_SAVE_DEBOUNCE_MS = 500

export interface MyTasksModalProps {
  me: OfficeMe
  autoFocusProposal?: boolean
  onClose: () => void
  onToast: (message: string) => void
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

interface StickyNoteCardProps {
  note: OfficeStickyNote
  autoFocus?: boolean
  onFocused?: () => void
  onUpdate: (
    id: string,
    body: { content?: string; color?: OfficeStickyColor }
  ) => void
  onDelete: (id: string) => void
}

function StickyNoteCard({
  note,
  autoFocus = false,
  onFocused,
  onUpdate,
  onDelete,
}: StickyNoteCardProps) {
  const [draft, setDraft] = useState(note.content)
  const [saving, setSaving] = useState(false)
  const lastSavedRef = useRef(note.content)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftRef = useRef(draft)
  const onUpdateRef = useRef(onUpdate)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus()
      onFocused?.()
    }
  }, [autoFocus, onFocused])

  useEffect(() => {
    if (note.content !== lastSavedRef.current && timerRef.current === null) {
      setDraft(note.content)
      lastSavedRef.current = note.content
    }
  }, [note.content])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        if (draftRef.current !== lastSavedRef.current) {
          lastSavedRef.current = draftRef.current
          onUpdateRef.current(note.id, { content: draftRef.current })
        }
      }
    }
  }, [note.id])

  const flushSave = (value: string) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (value === lastSavedRef.current) {
      setSaving(false)
      return
    }
    lastSavedRef.current = value
    setSaving(false)
    onUpdate(note.id, { content: value })
  }

  const handleChange = (value: string) => {
    const clamped = value.slice(0, MAX_STICKY_NOTE)
    setDraft(clamped)
    setSaving(true)
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (clamped !== lastSavedRef.current) {
        lastSavedRef.current = clamped
        onUpdate(note.id, { content: clamped })
      }
      setSaving(false)
    }, STICKY_SAVE_DEBOUNCE_MS)
  }

  return (
    <div
      className={`of-note c-${note.color}`}
      data-testid={`office-sticky-note-${note.id}`}
    >
      <textarea
        ref={textareaRef}
        value={draft}
        maxLength={MAX_STICKY_NOTE}
        placeholder="Viết ghi chú nhanh..."
        aria-label="Nội dung ghi chú"
        onChange={(event) => handleChange(event.target.value)}
        onBlur={() => flushSave(draft)}
      />
      <div className="of-note-foot">
        <div className="of-note-mini-dots" role="group" aria-label="Màu ghi chú">
          {STICKY_COLORS.map((swatch) => (
            <button
              key={swatch.key}
              type="button"
              className={`of-note-mini-dot${note.color === swatch.key ? " is-on" : ""}`}
              style={{ background: swatch.hex }}
              aria-label={`Đổi sang màu ${swatch.label}`}
              aria-pressed={note.color === swatch.key}
              onClick={() => {
                if (note.color !== swatch.key) {
                  onUpdate(note.id, { color: swatch.key })
                }
              }}
            />
          ))}
        </div>
        <span className="of-note-date">
          {saving ? "Đang lưu…" : formatDayMonth(note.createdAt)}
        </span>
        <button
          type="button"
          className="of-note-del"
          aria-label="Xoá ghi chú"
          onClick={() => onDelete(note.id)}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

interface TaskColumnProps {
  title: string
  subtitle: string
  tasks: readonly OfficeTask[]
  emptyText: string
  isError: boolean
  onRetry: () => void
  activeSubmitId: string | null
  noteDraft: string
  submitting: boolean
  onOpenSubmit: (task: OfficeTask) => void
  onCancelSubmit: () => void
  onChangeNote: (value: string) => void
  onConfirmSubmit: (task: OfficeTask) => void
}

function TaskColumn({
  title,
  subtitle,
  tasks,
  emptyText,
  isError,
  onRetry,
  activeSubmitId,
  noteDraft,
  submitting,
  onOpenSubmit,
  onCancelSubmit,
  onChangeNote,
  onConfirmSubmit,
}: TaskColumnProps) {
  return (
    <section className="of-fr">
      <div className="of-fh">
        <h3>{title}</h3>
        <span className="of-fh-sub">{subtitle}</span>
      </div>
      <div className="of-fb">
        {isError ? (
          <OfficeQueryError onRetry={onRetry} />
        ) : tasks.length === 0 ? (
          <p className="of-empty">{emptyText}</p>
        ) : (
          tasks.map((task) => {
            const isOpen = activeSubmitId === task.id
            const canSubmit =
              task.status === "todo" || task.status === "returned"
            return (
              <div
                key={task.id}
                className={`of-tk st-${task.status}`}
                data-testid={`office-task-${task.id}`}
              >
                <div className="of-tk-row">
                  <span className="of-tk-ck" aria-hidden="true">
                    {task.status === "done" && <Check size={13} strokeWidth={3} />}
                  </span>
                  <div className="of-tk-tt">
                    <b>{task.title}</b>
                    <div className="of-tk-meta">
                      {task.repeatDaily && (
                        <span className="of-tag t-blue">Lặp mỗi ngày</span>
                      )}
                      {task.dueDate && task.kind !== "day" && (
                        <span
                          className={
                            task.overdue && task.status !== "done"
                              ? "of-tag t-bad"
                              : "of-tag t-neutral"
                          }
                        >
                          {task.overdue && task.status !== "done"
                            ? `Quá hạn ${formatDayMonth(task.dueDate)}`
                            : `Hạn ${formatDayMonth(task.dueDate)}`}
                        </span>
                      )}
                      {task.status === "pending" && (
                        <span className="of-tag t-warn">
                          {task.kind === "day"
                            ? "Chờ sếp xác nhận · trong hôm nay"
                            : "Chờ sếp xác nhận"}
                        </span>
                      )}
                      {task.status === "returned" && (
                        <span className="of-tag t-bad">Cần làm lại</span>
                      )}
                      {task.status === "done" && (
                        <span className="of-tag t-ok">Đã duyệt</span>
                      )}
                    </div>
                  </div>
                  <span className="of-tk-pt">
                    +{task.pointsSnapshot ?? task.points}
                  </span>
                  {canSubmit && !isOpen && (
                    <button
                      type="button"
                      className="of-btn is-gold"
                      onClick={() => onOpenSubmit(task)}
                    >
                      Hoàn thành
                    </button>
                  )}
                </div>

                {task.status === "returned" && task.returnReason && (
                  <div className="of-quote is-reason">
                    Lý do trả lại: {task.returnReason}
                  </div>
                )}

                {task.status === "pending" &&
                  (task.submitNote || task.submittedAt) && (
                    <div className="of-quote">
                      {task.submitNote
                        ? `Ghi chú đã gửi: ${task.submitNote}`
                        : "Đã gửi xác nhận"}
                      {task.submittedAt
                        ? ` · gửi ${formatHm(task.submittedAt)}`
                        : ""}
                    </div>
                  )}

                {isOpen && (
                  <form
                    className="of-inline-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      onConfirmSubmit(task)
                    }}
                  >
                    <textarea
                      className="of-textarea"
                      maxLength={MAX_SUBMIT_NOTE}
                      value={noteDraft}
                      placeholder="Ghi chú kết quả thực hiện (tuỳ chọn)..."
                      aria-label={`Ghi chú hoàn thành cho ${task.title}`}
                      onChange={(event) =>
                        onChangeNote(event.target.value.slice(0, MAX_SUBMIT_NOTE))
                      }
                    />
                    <div className="of-form-acts">
                      <span
                        className="of-fh-sub"
                        style={{ marginRight: "auto" }}
                      >
                        {noteDraft.length}/{MAX_SUBMIT_NOTE}
                      </span>
                      <button
                        type="button"
                        className="of-btn is-ghost"
                        onClick={onCancelSubmit}
                      >
                        Huỷ
                      </button>
                      <button
                        type="submit"
                        className="of-btn is-gold"
                        disabled={submitting}
                      >
                        Gửi sếp xác nhận
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

export function MyTasksModal({
  me,
  autoFocusProposal = false,
  onClose,
  onToast,
}: MyTasksModalProps) {
  const tasksQuery = useOfficeTasks(true)
  const attendanceQuery = useOfficeAttendanceToday(true)
  const proposalsQuery = useOfficeMyProposals(true)
  const notesQuery = useOfficeStickyNotes(true)

  const checkInMutation = useCheckInAttendance()
  const submitTaskMutation = useSubmitTask()
  const createProposalMutation = useCreateProposal()
  const createNoteMutation = useCreateStickyNote()
  const updateNoteMutation = useUpdateStickyNote()
  const deleteNoteMutation = useDeleteStickyNote()

  const [clockState, setClockState] = useState<{
    anchor: string
    elapsedMs: number
  }>(() => ({ anchor: me.serverTime, elapsedMs: 0 }))
  const [activeSubmitId, setActiveSubmitId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState("")
  const [proposalDraft, setProposalDraft] = useState("")
  const [proposalError, setProposalError] = useState<string | null>(null)
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null)

  const proposalInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const startMs = Date.now()
    const anchor = me.serverTime
    const timer = setInterval(() => {
      setClockState({ anchor, elapsedMs: Date.now() - startMs })
    }, 15_000)
    return () => clearInterval(timer)
  }, [me.serverTime])

  const parsedServerMs = Date.parse(me.serverTime)
  const clockElapsedMs =
    clockState.anchor === me.serverTime ? clockState.elapsedMs : 0
  const nowHm = Number.isFinite(parsedServerMs)
    ? formatHm(new Date(parsedServerMs + clockElapsedMs).toISOString())
    : ""

  useEffect(() => {
    if (autoFocusProposal) {
      proposalInputRef.current?.focus()
    }
  }, [autoFocusProposal])

  const staffHud = me.hud?.kind === "staff" ? me.hud : null
  const periodMonth = tasksQuery.data?.periodMonth ?? me.periodMonth
  const monthNum = monthNumberFromPeriod(periodMonth)
  const monthlyPoints =
    tasksQuery.data?.monthlyPoints ?? staffHud?.monthlyPoints ?? 0

  const isWorkday = attendanceQuery.data?.isWorkday ?? me.isWorkday
  const isLocked = attendanceQuery.data?.isLocked ?? me.isAttendanceLocked
  const lockCutoff = attendanceQuery.data?.cutoffs.lock ?? me.cutoffs.lock
  const checkedAt =
    attendanceQuery.data?.myCheckedInAt ?? staffHud?.myCheckedInAt ?? null
  const myStatus =
    attendanceQuery.data?.myStatus ?? staffHud?.myAttendanceStatus ?? "absent"

  const dayTasks = tasksQuery.data?.day ?? []
  const monthTasks = tasksQuery.data?.month ?? []
  const kpiTasks = tasksQuery.data?.kpi ?? []
  const dayDone = dayTasks.filter((task) => task.status === "done").length
  const monthDone = monthTasks.filter((task) => task.status === "done").length
  const kpiDone = kpiTasks.filter((task) => task.status === "done").length

  const sortedProposals = useMemo(() => {
    const items = proposalsQuery.data?.items ?? []
    return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [proposalsQuery.data?.items])

  const notes = notesQuery.data?.items ?? []
  const maxNotes = notesQuery.data?.maxNotes ?? 50
  const atNoteLimit = notes.length >= maxNotes

  const handleCheckIn = async () => {
    try {
      const result = await checkInMutation.mutateAsync()
      onToast(
        result.status === "ok"
          ? `Đã điểm danh đúng giờ · ${result.timeLabel}`
          : `Đã điểm danh trễ · ${result.timeLabel}`
      )
    } catch (error) {
      onToast(getErrorMessage(error, "Không thể điểm danh lúc này."))
    }
  }

  const handleConfirmSubmit = async (task: OfficeTask) => {
    try {
      await submitTaskMutation.mutateAsync({
        id: task.id,
        note: noteDraft.trim(),
      })
      setActiveSubmitId(null)
      setNoteDraft("")
      onToast("Đã gửi sếp xác nhận.")
    } catch (error) {
      onToast(getErrorMessage(error, "Không thể gửi xác nhận nhiệm vụ."))
    }
  }

  const handleSendProposal = async (event: React.FormEvent) => {
    event.preventDefault()
    const content = proposalDraft.trim()
    if (!content) {
      setProposalError("Vui lòng nhập nội dung đề xuất.")
      return
    }
    setProposalError(null)
    try {
      await createProposalMutation.mutateAsync(content)
      setProposalDraft("")
      onToast("Đã gửi đề xuất tới trưởng nhóm.")
    } catch (error) {
      setProposalError(getErrorMessage(error, "Không thể gửi đề xuất."))
    }
  }

  const handleAddNote = async (color: OfficeStickyColor) => {
    if (atNoteLimit || createNoteMutation.isPending) return
    try {
      const created = await createNoteMutation.mutateAsync({
        color,
        content: "",
      })
      if (created?.id) {
        setFocusNoteId(created.id)
      }
    } catch (error) {
      onToast(getErrorMessage(error, "Không thể tạo ghi chú mới."))
    }
  }

  const handleUpdateNote = (
    id: string,
    body: { content?: string; color?: OfficeStickyColor }
  ) => {
    updateNoteMutation.mutate(
      { id, body },
      {
        onError: (error) =>
          onToast(getErrorMessage(error, "Không thể lưu ghi chú.")),
      }
    )
  }

  const handleDeleteNote = (id: string) => {
    deleteNoteMutation.mutate(id, {
      onError: (error) =>
        onToast(getErrorMessage(error, "Không thể xoá ghi chú.")),
    })
  }

  const headerExtra = (
    <>
      {isWorkday &&
        (checkedAt ? (
          <span
            className={
              myStatus === "ok" ? "of-bh-chk" : "of-bh-chk is-late"
            }
            data-testid="office-checkin-status"
          >
            {myStatus === "ok"
              ? `✓ Đã điểm danh · ${formatHm(checkedAt)} · Đúng giờ`
              : `✓ Đã điểm danh · ${formatHm(checkedAt)} · Trễ`}
          </span>
        ) : !isLocked ? (
          <button
            type="button"
            className="of-bh-btn"
            data-testid="office-checkin-btn"
            disabled={checkInMutation.isPending}
            onClick={() => void handleCheckIn()}
          >
            Điểm danh · {nowHm || "08:00"}
          </button>
        ) : (
          <span
            className="of-bh-chk is-abs"
            data-testid="office-checkin-status"
          >
            Hết giờ điểm danh ({lockCutoff}) · hôm nay tính vắng
          </span>
        ))}
      <span className="of-bh-pts">
        {monthlyPoints} điểm tháng {monthNum}
      </span>
    </>
  )

  return (
    <ModalShell
      title="NHIỆM VỤ CỦA TÔI"
      subtitle={`${me.self?.displayName ?? ""} · SACO`}
      headerExtra={headerExtra}
      bodyClassName="of-bb-mine"
      testId="office-modal-mine"
      onClose={onClose}
    >
      <TaskColumn
        title="NHIỆM VỤ NGÀY"
        subtitle={`${dayDone}/${dayTasks.length} xong · reset 0:00`}
        tasks={dayTasks}
        emptyText={
          tasksQuery.isLoading
            ? "Đang tải nhiệm vụ ngày..."
            : "Hôm nay chưa có nhiệm vụ ngày."
        }
        isError={tasksQuery.isError}
        onRetry={() => void tasksQuery.refetch()}
        activeSubmitId={activeSubmitId}
        noteDraft={noteDraft}
        submitting={submitTaskMutation.isPending}
        onOpenSubmit={(task) => {
          setActiveSubmitId(task.id)
          setNoteDraft(task.submitNote ?? "")
        }}
        onCancelSubmit={() => {
          setActiveSubmitId(null)
          setNoteDraft("")
        }}
        onChangeNote={setNoteDraft}
        onConfirmSubmit={(task) => void handleConfirmSubmit(task)}
      />

      <TaskColumn
        title="NHIỆM VỤ THÁNG"
        subtitle={`${monthDone}/${monthTasks.length} xong · tháng ${monthNum}`}
        tasks={monthTasks}
        emptyText={
          tasksQuery.isLoading
            ? "Đang tải nhiệm vụ tháng..."
            : "Chưa có nhiệm vụ tháng."
        }
        isError={tasksQuery.isError}
        onRetry={() => void tasksQuery.refetch()}
        activeSubmitId={activeSubmitId}
        noteDraft={noteDraft}
        submitting={submitTaskMutation.isPending}
        onOpenSubmit={(task) => {
          setActiveSubmitId(task.id)
          setNoteDraft(task.submitNote ?? "")
        }}
        onCancelSubmit={() => {
          setActiveSubmitId(null)
          setNoteDraft("")
        }}
        onChangeNote={setNoteDraft}
        onConfirmSubmit={(task) => void handleConfirmSubmit(task)}
      />

      <TaskColumn
        title="KPI"
        subtitle={`${kpiDone}/${kpiTasks.length} xong · tháng ${monthNum}`}
        tasks={kpiTasks}
        emptyText={
          tasksQuery.isLoading ? "Đang tải KPI..." : "Chưa có mục tiêu KPI."
        }
        isError={tasksQuery.isError}
        onRetry={() => void tasksQuery.refetch()}
        activeSubmitId={activeSubmitId}
        noteDraft={noteDraft}
        submitting={submitTaskMutation.isPending}
        onOpenSubmit={(task) => {
          setActiveSubmitId(task.id)
          setNoteDraft(task.submitNote ?? "")
        }}
        onCancelSubmit={() => {
          setActiveSubmitId(null)
          setNoteDraft("")
        }}
        onChangeNote={setNoteDraft}
        onConfirmSubmit={(task) => void handleConfirmSubmit(task)}
      />

      <section className="of-fr">
        <div className="of-fh">
          <h3>ĐỀ XUẤT</h3>
          <span className="of-fh-sub">Gửi trưởng nhóm</span>
        </div>
        <div className="of-fb">
          <form className="of-compose" onSubmit={(e) => void handleSendProposal(e)}>
            <textarea
              ref={proposalInputRef}
              className="of-textarea"
              maxLength={MAX_PROPOSAL}
              value={proposalDraft}
              placeholder="Viết đề xuất gửi trưởng nhóm..."
              aria-label="Nội dung đề xuất"
              onChange={(event) => {
                setProposalDraft(event.target.value.slice(0, MAX_PROPOSAL))
                if (proposalError) setProposalError(null)
              }}
            />
            {proposalError && (
              <div className="of-err" role="alert">
                {proposalError}
              </div>
            )}
            <div className="of-compose-acts">
              <span>
                {proposalDraft.length}/{MAX_PROPOSAL}
              </span>
              <button
                type="submit"
                className="of-btn is-gold"
                disabled={createProposalMutation.isPending}
              >
                Gửi đề xuất
              </button>
            </div>
          </form>

          {proposalsQuery.isError ? (
            <div style={{ marginTop: 10 }}>
              <OfficeQueryError onRetry={() => void proposalsQuery.refetch()} />
            </div>
          ) : sortedProposals.length === 0 ? (
            <p className="of-empty">Chưa có đề xuất nào được gửi.</p>
          ) : (
            sortedProposals.map((proposal) => (
              <div key={proposal.id} className="of-msg">
                <div className="of-msg-head">
                  <span>
                    {formatFullDate(proposal.createdAt)} ·{" "}
                    {formatHm(proposal.createdAt)}
                  </span>
                  {proposal.status === "sent" && (
                    <span className="of-tag t-neutral">Đã gửi</span>
                  )}
                  {proposal.status === "seen" && (
                    <span className="of-tag t-blue">Sếp đã xem</span>
                  )}
                  {proposal.status === "replied" && (
                    <span className="of-tag t-ok">Sếp đã trả lời</span>
                  )}
                </div>
                <p style={{ margin: 0 }}>{proposal.content}</p>
                {proposal.reply && (
                  <div className="of-msg-rep">
                    <b>
                      Sếp trả lời
                      {proposal.repliedAt
                        ? ` · ${formatFullDate(proposal.repliedAt)}`
                        : ""}
                    </b>
                    {proposal.reply}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="of-fr of-f-note">
        <div className="of-fh">
          <h3>GHI CHÚ</h3>
          <span className="of-fh-sub">
            Riêng tư · {notes.length}/{maxNotes}
          </span>
        </div>
        <div className="of-fb">
          {notesQuery.isError ? (
            <OfficeQueryError onRetry={() => void notesQuery.refetch()} />
          ) : (
            <div className="of-notes-grid">
              {notes.map((note) => (
                <StickyNoteCard
                  key={note.id}
                  note={note}
                  autoFocus={focusNoteId === note.id}
                  onFocused={() => setFocusNoteId(null)}
                  onUpdate={handleUpdateNote}
                  onDelete={handleDeleteNote}
                />
              ))}

              <div className="of-add-note">
                <span>+ Thêm ghi chú</span>
                <div
                  className="of-note-colors"
                  role="group"
                  aria-label="Chọn màu để thêm ghi chú mới"
                >
                  {STICKY_COLORS.map((swatch) => (
                    <button
                      key={swatch.key}
                      type="button"
                      className="of-note-swatch"
                      style={{ background: swatch.hex }}
                      aria-label={swatch.label}
                      title={`Thêm ghi chú màu ${swatch.label}`}
                      disabled={atNoteLimit || createNoteMutation.isPending}
                      onClick={() => void handleAddNote(swatch.key)}
                    />
                  ))}
                </div>
                {atNoteLimit && (
                  <span style={{ fontSize: 11.5 }}>
                    Đã đạt tối đa {maxNotes} ghi chú
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </ModalShell>
  )
}
