import { useMemo, useState } from "react"

import {
  useApproveTasks,
  useCreateAssignment,
  useDeleteAssignment,
  useMarkProposalSeen,
  useOfficeAssignments,
  useOfficeProgress,
  useOfficeReview,
  useOfficeTeamProposals,
  useReplyProposal,
  useReturnTask,
  useUpdateAssignment,
} from "../hooks.ts"
import type {
  OfficeAssignment,
  OfficeMe,
  OfficeProposal,
  OfficeTaskKind,
} from "../types.ts"
import {
  formatDayMonth,
  formatFullDate,
  formatHm,
  getInitials,
  monthEndDate,
} from "../utils.ts"
import { ModalShell, OfficeQueryError } from "./ModalShell.tsx"

const KIND_LABEL: Record<OfficeTaskKind, string> = {
  day: "Ngày",
  month: "Tháng",
  kpi: "KPI",
}

const TITLE_PLACEHOLDER: Record<OfficeTaskKind, string> = {
  day: "Ví dụ: Gọi chăm sóc 10 khách hàng tiềm năng",
  month: "Ví dụ: Hoàn thiện hồ sơ khách hàng VIP tháng này",
  kpi: "Ví dụ: Mở 20 tài khoản mới",
}

const DEFAULT_POINTS: Record<OfficeTaskKind, number> = {
  day: 10,
  month: 40,
  kpi: 100,
}

const MAX_TITLE = 120
const MAX_POINTS = 1000
const MAX_RETURN_REASON = 300
const MAX_REPLY = 1000

export interface ManagerModalProps {
  me: OfficeMe
  onClose: () => void
  onOpenProfile: (userId?: string) => void
  onToast: (message: string) => void
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

function ratioPercent(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)))
}

export function ManagerModal({
  me,
  onClose,
  onOpenProfile,
  onToast,
}: ManagerModalProps) {
  const assignmentsQuery = useOfficeAssignments(true)
  const reviewQuery = useOfficeReview(true)
  const proposalsQuery = useOfficeTeamProposals(true)
  const progressQuery = useOfficeProgress(true)

  const createAssignmentMutation = useCreateAssignment()
  const updateAssignmentMutation = useUpdateAssignment()
  const deleteAssignmentMutation = useDeleteAssignment()
  const approveTasksMutation = useApproveTasks()
  const returnTaskMutation = useReturnTask()
  const markSeenMutation = useMarkProposalSeen()
  const replyProposalMutation = useReplyProposal()

  const staffMembers = useMemo(
    () => me.members.filter((member) => member.role === "staff"),
    [me.members]
  )
  const allStaffIds = useMemo(
    () => staffMembers.map((member) => member.userId),
    [staffMembers]
  )
  const staffNameById = useMemo(
    () =>
      new Map(staffMembers.map((member) => [member.userId, member.displayName])),
    [staffMembers]
  )

  const periodMonth = progressQuery.data?.periodMonth ?? me.periodMonth
  const todayDate = progressQuery.data?.todayDate ?? me.todayDate
  const currentMonthEnd = monthEndDate(periodMonth)

  // Assignment panel state
  const [assignTab, setAssignTab] = useState<"new" | "sent">("new")
  const [kind, setKind] = useState<OfficeTaskKind>("day")
  const [title, setTitle] = useState("")
  const [pointsStr, setPointsStr] = useState("10")
  const [repeatDaily, setRepeatDaily] = useState(true)
  const [dueDate, setDueDate] = useState(currentMonthEnd)
  const [allTeam, setAllTeam] = useState(true)
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([])
  const [assignError, setAssignError] = useState<string | null>(null)

  // Inline edit / delete state on "Đã giao"
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editPointsStr, setEditPointsStr] = useState("10")
  const [editDueDate, setEditDueDate] = useState(currentMonthEnd)
  const [editRepeatDaily, setEditRepeatDaily] = useState(true)
  const [editError, setEditError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Review panel state
  const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([])
  const [returningId, setReturningId] = useState<string | null>(null)
  const [returnReason, setReturnReason] = useState("")
  const [returnError, setReturnError] = useState<string | null>(null)

  // Proposals panel state
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState("")
  const [replyError, setReplyError] = useState<string | null>(null)

  const assignments = useMemo(() => {
    const items = assignmentsQuery.data?.items ?? []
    return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [assignmentsQuery.data?.items])

  // Oldest-first pending queue (Spec §7.2)
  const reviewItems = useMemo(() => {
    const items = reviewQuery.data?.items ?? []
    return [...items].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
  }, [reviewQuery.data?.items])

  const activeSelectedReviewIds = useMemo(() => {
    const currentSet = new Set(reviewItems.map((item) => item.id))
    return selectedReviewIds.filter((id) => currentSet.has(id))
  }, [reviewItems, selectedReviewIds])

  const allReviewSelected =
    reviewItems.length > 0 &&
    activeSelectedReviewIds.length === reviewItems.length

  const proposals = useMemo(() => {
    const items = proposalsQuery.data?.items ?? []
    return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [proposalsQuery.data?.items])

  const unreadProposalsCount =
    proposalsQuery.data?.unreadCount ??
    proposals.filter((p) => p.status === "sent").length

  const progressRows = useMemo(() => {
    const items = progressQuery.data?.items ?? []
    return [...items].sort(
      (a, b) =>
        b.points - a.points || a.displayName.localeCompare(b.displayName, "vi")
    )
  }, [progressQuery.data?.items])

  const effectiveRecipientIds = allTeam ? allStaffIds : selectedStaffIds

  const formatRecipientSummary = (assignment: OfficeAssignment): string => {
    if (assignment.isAllTeam) {
      return `Cả nhóm (${assignment.targetCount} người)`
    }
    const resolvedNames = assignment.targetUserIds
      .map((id) => staffNameById.get(id))
      .filter((name): name is string => Boolean(name))
    if (resolvedNames.length === 0) {
      return `${assignment.targetCount} người`
    }
    if (resolvedNames.length <= 2) {
      return resolvedNames.join(", ")
    }
    return `${resolvedNames.slice(0, 2).join(", ")} +${resolvedNames.length - 2} người`
  }

  const handleKindChange = (nextKind: OfficeTaskKind) => {
    setKind(nextKind)
    setPointsStr(String(DEFAULT_POINTS[nextKind]))
    if (nextKind !== "day" && (!dueDate || dueDate < todayDate)) {
      setDueDate(currentMonthEnd)
    }
    setAssignError(null)
  }

  const handleToggleAllTeam = () => {
    setAssignError(null)
    if (allTeam) {
      setAllTeam(false)
      setSelectedStaffIds([])
    } else {
      setAllTeam(true)
      setSelectedStaffIds([])
    }
  }

  const handleToggleStaff = (userId: string) => {
    setAssignError(null)
    if (allTeam) {
      setAllTeam(false)
      setSelectedStaffIds(allStaffIds.filter((id) => id !== userId))
      return
    }
    setSelectedStaffIds((prev) => {
      const next = prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
      if (allStaffIds.length > 0 && next.length === allStaffIds.length) {
        setAllTeam(true)
        return []
      }
      return next
    })
  }

  const handleCreateAssignment = async (event: React.FormEvent) => {
    event.preventDefault()
    const cleanTitle = title.trim()
    const parsedPoints = Number(pointsStr)
    if (!cleanTitle) {
      setAssignError("Nhập tên nhiệm vụ")
      return
    }
    if (
      !Number.isInteger(parsedPoints) ||
      parsedPoints < 1 ||
      parsedPoints > MAX_POINTS
    ) {
      setAssignError("Nhập điểm cho nhiệm vụ")
      return
    }
    if (effectiveRecipientIds.length === 0) {
      setAssignError("Chọn người nhận")
      return
    }
    if (kind !== "day" && (!dueDate || dueDate < todayDate || dueDate > currentMonthEnd)) {
      setAssignError(
        `Hạn hoàn thành phải nằm từ hôm nay đến ${formatDayMonth(currentMonthEnd)}.`
      )
      return
    }
    setAssignError(null)
    try {
      await createAssignmentMutation.mutateAsync({
        kind,
        title: cleanTitle,
        points: parsedPoints,
        repeatDaily: kind === "day" ? repeatDaily : false,
        dueDate: kind === "day" ? null : dueDate,
        userIds: effectiveRecipientIds,
      })
      setTitle("")
      onToast(`Đã giao "${cleanTitle}" cho ${effectiveRecipientIds.length} người`)
    } catch (error) {
      setAssignError(getErrorMessage(error, "Không thể giao nhiệm vụ."))
    }
  }

  const handleReassign = (assignment: OfficeAssignment) => {
    setAssignTab("new")
    setKind(assignment.kind)
    setTitle(assignment.title)
    setPointsStr(String(assignment.points))
    setRepeatDaily(assignment.repeatDaily)
    if (assignment.kind !== "day") {
      const clampedDue =
        assignment.dueDate &&
        assignment.dueDate >= todayDate &&
        assignment.dueDate <= currentMonthEnd
          ? assignment.dueDate
          : currentMonthEnd
      setDueDate(clampedDue)
    }
    if (assignment.isAllTeam) {
      setAllTeam(true)
      setSelectedStaffIds([])
    } else {
      setAllTeam(false)
      setSelectedStaffIds(assignment.targetUserIds)
    }
    setAssignError(null)
    onToast("Đã điền sẵn, chỉnh rồi bấm Giao nhiệm vụ")
  }

  const startEditAssignment = (assignment: OfficeAssignment) => {
    setConfirmDeleteId(null)
    setEditingId(assignment.id)
    setEditTitle(assignment.title)
    setEditPointsStr(String(assignment.points))
    setEditRepeatDaily(assignment.repeatDaily)
    setEditDueDate(assignment.dueDate ?? currentMonthEnd)
    setEditError(null)
  }

  const handleSaveEdit = async (assignment: OfficeAssignment) => {
    const cleanTitle = editTitle.trim()
    const parsedPoints = Number(editPointsStr)
    if (!cleanTitle) {
      setEditError("Nhập tên nhiệm vụ")
      return
    }
    if (
      !Number.isInteger(parsedPoints) ||
      parsedPoints < 1 ||
      parsedPoints > MAX_POINTS
    ) {
      setEditError("Nhập điểm cho nhiệm vụ")
      return
    }
    if (
      assignment.kind !== "day" &&
      editDueDate &&
      (editDueDate < todayDate || editDueDate > currentMonthEnd)
    ) {
      setEditError(
        `Hạn hoàn thành phải từ hôm nay đến ${formatDayMonth(currentMonthEnd)}.`
      )
      return
    }
    setEditError(null)
    try {
      await updateAssignmentMutation.mutateAsync({
        id: assignment.id,
        body: {
          title: cleanTitle,
          points: parsedPoints,
          ...(assignment.kind === "day"
            ? { repeatDaily: editRepeatDaily }
            : { dueDate: editDueDate || null }),
        },
      })
      setEditingId(null)
      onToast("Đã cập nhật nhiệm vụ đã giao.")
    } catch (error) {
      setEditError(getErrorMessage(error, "Không thể cập nhật nhiệm vụ."))
    }
  }

  const handleConfirmDelete = async (id: string) => {
    try {
      await deleteAssignmentMutation.mutateAsync(id)
      setConfirmDeleteId(null)
      onToast("Đã xoá nhiệm vụ chưa hoàn thành.")
    } catch (error) {
      onToast(getErrorMessage(error, "Không thể xoá nhiệm vụ."))
    }
  }

  const handleApprove = async (ids: string[]) => {
    if (ids.length === 0) return
    try {
      const result = await approveTasksMutation.mutateAsync(ids)
      setSelectedReviewIds((prev) => prev.filter((id) => !ids.includes(id)))
      const approvedList = result.approved ?? []
      const skippedList = result.skipped ?? []
      const count = approvedList.length
      if (skippedList.length > 0) {
        const reasons = Array.from(new Set(skippedList.map((item) => item.reason)))
        onToast(
          `Đã duyệt ${count} mục · bỏ qua ${skippedList.length} mục: ${reasons.join(" · ")}`
        )
      } else if (count === 1) {
        const firstApproved = approvedList[0]
        const fallbackItem = reviewItems.find((item) => item.id === ids[0])
        const staffName = firstApproved?.staffName ?? fallbackItem?.staffName ?? ""
        const points = firstApproved?.points ?? fallbackItem?.points ?? 0
        onToast(`Đã duyệt · ${staffName} +${points} điểm`)
      } else {
        onToast(`Đã duyệt ${count} mục`)
      }
    } catch (error) {
      onToast(getErrorMessage(error, "Không thể duyệt nhiệm vụ."))
    }
  }

  const handleConfirmReturn = async (taskId: string) => {
    const reason = returnReason.trim()
    if (!reason) {
      setReturnError("Ghi lý do trả lại")
      return
    }
    setReturnError(null)
    try {
      await returnTaskMutation.mutateAsync({ id: taskId, reason })
      setReturningId(null)
      setReturnReason("")
      onToast("Đã trả lại nhiệm vụ cho nhân viên.")
    } catch (error) {
      setReturnError(getErrorMessage(error, "Không thể trả lại nhiệm vụ."))
    }
  }

  const handleOpenReply = (proposal: OfficeProposal) => {
    setReplyingId(proposal.id)
    setReplyDraft("")
    setReplyError(null)
    if (proposal.status === "sent") {
      markSeenMutation.mutate(proposal.id)
    }
  }

  const handleSubmitReply = async (proposalId: string) => {
    const reply = replyDraft.trim()
    if (!reply) {
      setReplyError("Vui lòng nhập nội dung trả lời.")
      return
    }
    setReplyError(null)
    try {
      await replyProposalMutation.mutateAsync({ id: proposalId, reply })
      setReplyingId(null)
      setReplyDraft("")
      onToast("Đã gửi phản hồi đề xuất.")
    } catch (error) {
      setReplyError(getErrorMessage(error, "Không thể gửi trả lời."))
    }
  }

  return (
    <ModalShell
      title="QUẢN LÝ"
      subtitle={`Nhóm ${me.team?.bossName ?? ""} · ${staffMembers.length} nhân viên`}
      headerExtra={
        <button
          type="button"
          className="of-bh-btn"
          onClick={() => onOpenProfile()}
        >
          Hồ sơ nhân viên
        </button>
      }
      bodyClassName="of-bb-mgr"
      testId="office-modal-mgr"
      onClose={onClose}
    >
      {/* Top-Left: GIAO NHIỆM VỤ */}
      <section className="of-fr">
        <div className="of-fh">
          <h3>GIAO NHIỆM VỤ</h3>
          <div className="of-seg is-compact" role="tablist" aria-label="Chế độ giao nhiệm vụ">
            <button
              type="button"
              role="tab"
              aria-selected={assignTab === "new"}
              className={assignTab === "new" ? "is-on" : undefined}
              onClick={() => setAssignTab("new")}
            >
              Giao mới
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={assignTab === "sent"}
              className={assignTab === "sent" ? "is-on" : undefined}
              onClick={() => setAssignTab("sent")}
            >
              Đã giao ({assignments.length})
            </button>
          </div>
        </div>

        <div className={assignTab === "new" ? "of-fb of-fb-assign" : "of-fb"}>
          {assignTab === "new" ? (
            <form
              className="of-form of-assign-form"
              noValidate
              onSubmit={(event) => void handleCreateAssignment(event)}
            >
              <div className="of-assign-fields">
                <div className="of-fl">
                  <label>Loại nhiệm vụ</label>
                  <div className="of-seg" role="group" aria-label="Loại nhiệm vụ">
                    {(["day", "month", "kpi"] as const).map((itemKind) => (
                      <button
                        key={itemKind}
                        type="button"
                        className={kind === itemKind ? "is-on" : undefined}
                        aria-pressed={kind === itemKind}
                        onClick={() => handleKindChange(itemKind)}
                      >
                        {KIND_LABEL[itemKind]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="of-fl">
                  <label htmlFor="of-asg-title">
                    Tiêu đề ({title.length}/{MAX_TITLE})
                  </label>
                  <input
                    id="of-asg-title"
                    type="text"
                    className="of-inp"
                    maxLength={MAX_TITLE}
                    value={title}
                    placeholder={TITLE_PLACEHOLDER[kind]}
                    onChange={(event) => {
                      setTitle(event.target.value.slice(0, MAX_TITLE))
                      if (assignError) setAssignError(null)
                    }}
                  />
                </div>

                <div className="of-grid2">
                  <div className="of-fl">
                    <label htmlFor="of-asg-pts">Điểm thưởng (1–1000)</label>
                    <input
                      id="of-asg-pts"
                      type="number"
                      className="of-inp"
                      min={1}
                      max={MAX_POINTS}
                      step={1}
                      value={pointsStr}
                      onChange={(event) => {
                        setPointsStr(event.target.value)
                        if (assignError) setAssignError(null)
                      }}
                    />
                  </div>

                  {kind === "day" ? (
                    <div className="of-fl" style={{ alignContent: "end" }}>
                      <label className="of-cb of-assign-cb">
                        <input
                          type="checkbox"
                          checked={repeatDaily}
                          onChange={(event) =>
                            setRepeatDaily(event.target.checked)
                          }
                        />
                        <span>Lặp mỗi ngày (T2–T6)</span>
                      </label>
                    </div>
                  ) : (
                    <div className="of-fl">
                      <label htmlFor="of-asg-due">Hạn hoàn thành</label>
                      <input
                        id="of-asg-due"
                        type="date"
                        className="of-inp"
                        min={todayDate}
                        max={currentMonthEnd}
                        value={dueDate}
                        onChange={(event) => {
                          setDueDate(event.target.value)
                          if (assignError) setAssignError(null)
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="of-fl">
                  <label>Người nhận ({effectiveRecipientIds.length})</label>
                  <div className="of-chips" role="group" aria-label="Người nhận nhiệm vụ">
                    <button
                      type="button"
                      className={`of-chip is-all${allTeam ? " is-on" : ""}`}
                      aria-pressed={allTeam}
                      onClick={handleToggleAllTeam}
                    >
                      Cả nhóm
                    </button>
                    {staffMembers.map((member) => {
                      const selected =
                        allTeam || selectedStaffIds.includes(member.userId)
                      return (
                        <button
                          key={member.userId}
                          type="button"
                          className={`of-chip${selected ? " is-on" : ""}`}
                          aria-pressed={selected}
                          onClick={() => handleToggleStaff(member.userId)}
                        >
                          {member.displayName}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="of-form-foot">
                {assignError && (
                  <div className="of-err of-err-inline" role="alert">
                    {assignError}
                  </div>
                )}
                <button
                  type="submit"
                  className="of-btn is-gold"
                  disabled={createAssignmentMutation.isPending}
                >
                  Giao nhiệm vụ
                </button>
              </div>
            </form>
          ) : assignmentsQuery.isError ? (
            <OfficeQueryError onRetry={() => void assignmentsQuery.refetch()} />
          ) : assignments.length === 0 ? (
            <p className="of-empty">Chưa có nhiệm vụ nào đã giao.</p>
          ) : (
            assignments.map((assignment) => {
              const isEditing = editingId === assignment.id
              const isDeleting = confirmDeleteId === assignment.id
              const isPastPeriod =
                assignment.kind !== "day" &&
                assignment.periodMonth < periodMonth
              return (
                <div
                  key={assignment.id}
                  className="of-asg"
                  data-testid={`office-assignment-${assignment.id}`}
                >
                  <div className="of-asg-head">
                    <div className="of-tk-tt">
                      <span className="of-asg-title">{assignment.title}</span>
                      <div className="of-tk-meta">
                        <span className="of-tag t-neutral">
                          {KIND_LABEL[assignment.kind]}
                        </span>
                        {assignment.repeatDaily && (
                          <span className="of-tag t-blue">Lặp mỗi ngày</span>
                        )}
                        {assignment.dueDate && assignment.kind !== "day" && (
                          <span className="of-tag t-neutral">
                            Hạn {formatDayMonth(assignment.dueDate)}
                          </span>
                        )}
                        {isPastPeriod && (
                          <span className="of-tag t-neutral">Tháng trước</span>
                        )}
                        <span className="of-tag t-ok">
                          {assignment.doneCount}/{assignment.targetCount} đã hoàn
                          thành
                        </span>
                      </div>
                      <div className="of-asg-sub">
                        Giao {formatDayMonth(assignment.createdAt)} ·{" "}
                        {formatHm(assignment.createdAt)} ·{" "}
                        {formatRecipientSummary(assignment)}
                      </div>
                    </div>
                    <span className="of-tk-pt">+{assignment.points}</span>
                  </div>

                  {!isEditing && !isDeleting && (
                    <div className="of-asg-acts">
                      <button
                        type="button"
                        className="of-btn is-ghost"
                        onClick={() => handleReassign(assignment)}
                      >
                        Giao lại
                      </button>
                      {!isPastPeriod && (
                        <button
                          type="button"
                          className="of-btn is-ghost"
                          onClick={() => startEditAssignment(assignment)}
                        >
                          Sửa
                        </button>
                      )}
                      <button
                        type="button"
                        className="of-btn is-red"
                        onClick={() => {
                          setEditingId(null)
                          setConfirmDeleteId(assignment.id)
                        }}
                      >
                        Xoá
                      </button>
                    </div>
                  )}

                  {isEditing && (
                    <div className="of-inline-form" style={{ marginLeft: 0 }}>
                      <div className="of-fl">
                        <label>Tiêu đề</label>
                        <input
                          type="text"
                          className="of-inp"
                          maxLength={MAX_TITLE}
                          value={editTitle}
                          aria-label="Sửa tiêu đề nhiệm vụ"
                          onChange={(e) =>
                            setEditTitle(e.target.value.slice(0, MAX_TITLE))
                          }
                        />
                      </div>
                      <div className="of-grid2">
                        <div className="of-fl">
                          <label>Điểm (1–1000)</label>
                          <input
                            type="number"
                            className="of-inp"
                            min={1}
                            max={MAX_POINTS}
                            value={editPointsStr}
                            aria-label="Sửa điểm thưởng"
                            onChange={(e) => setEditPointsStr(e.target.value)}
                          />
                        </div>
                        {assignment.kind === "day" ? (
                          <div className="of-fl" style={{ alignContent: "end" }}>
                            <label className="of-cb" style={{ padding: "8px 0" }}>
                              <input
                                type="checkbox"
                                checked={editRepeatDaily}
                                onChange={(e) =>
                                  setEditRepeatDaily(e.target.checked)
                                }
                              />
                              <span>Lặp T2–T6</span>
                            </label>
                          </div>
                        ) : (
                          <div className="of-fl">
                            <label>Hạn hoàn thành</label>
                            <input
                              type="date"
                              className="of-inp"
                              min={todayDate}
                              max={currentMonthEnd}
                              value={editDueDate}
                              aria-label="Sửa hạn hoàn thành"
                              onChange={(e) => setEditDueDate(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                      <span className="of-fh-sub">
                        Đổi điểm chỉ áp dụng cho người chưa hoàn thành. Người đã
                        được duyệt giữ điểm cũ.
                      </span>
                      {editError && (
                        <div className="of-err" role="alert">
                          {editError}
                        </div>
                      )}
                      <div className="of-form-acts">
                        <button
                          type="button"
                          className="of-btn is-ghost"
                          onClick={() => setEditingId(null)}
                        >
                          Huỷ
                        </button>
                        <button
                          type="button"
                          className="of-btn is-gold"
                          disabled={updateAssignmentMutation.isPending}
                          onClick={() => void handleSaveEdit(assignment)}
                        >
                          Lưu thay đổi
                        </button>
                      </div>
                    </div>
                  )}

                  {isDeleting && (
                    <div className="of-confirm-inline">
                      <span>
                        Xoá nhiệm vụ này khỏi{" "}
                        {Math.max(
                          0,
                          assignment.activeCount ??
                            assignment.targetCount - assignment.doneCount
                        )}{" "}
                        người chưa hoàn thành? Người đã được duyệt vẫn giữ điểm.
                      </span>
                      <div className="of-form-acts">
                        <button
                          type="button"
                          className="of-btn is-ghost"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Huỷ
                        </button>
                        <button
                          type="button"
                          className="of-btn is-red"
                          disabled={deleteAssignmentMutation.isPending}
                          onClick={() => void handleConfirmDelete(assignment.id)}
                        >
                          Xác nhận xoá
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </section>

      {/* Top-Right: CHỜ XÁC NHẬN */}
      <section className="of-fr">
        <div className="of-fh">
          <h3>CHỜ XÁC NHẬN</h3>
          <span className="of-fh-sub">{reviewItems.length} nhiệm vụ</span>
        </div>
        <div className="of-fb">
          {reviewItems.length > 0 && (
            <div className="of-bulk">
              <label className="of-cb">
                <input
                  type="checkbox"
                  checked={allReviewSelected}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setSelectedReviewIds(reviewItems.map((item) => item.id))
                    } else {
                      setSelectedReviewIds([])
                    }
                  }}
                />
                <span>Chọn tất cả</span>
              </label>
              <button
                type="button"
                className="of-btn is-ok"
                disabled={
                  activeSelectedReviewIds.length === 0 ||
                  approveTasksMutation.isPending
                }
                onClick={() => void handleApprove(activeSelectedReviewIds)}
              >
                Duyệt {activeSelectedReviewIds.length} mục
              </button>
            </div>
          )}

          {reviewQuery.isError ? (
            <OfficeQueryError onRetry={() => void reviewQuery.refetch()} />
          ) : reviewItems.length === 0 ? (
            <p className="of-empty">Không có nhiệm vụ nào chờ xác nhận.</p>
          ) : (
            reviewItems.map((item) => {
              const checked = activeSelectedReviewIds.includes(item.id)
              const isReturning = returningId === item.id
              return (
                <div
                  key={item.id}
                  className="of-ap"
                  data-testid={`office-review-${item.id}`}
                >
                  <div className="of-ap-row">
                    <label
                      className="of-cb"
                      style={{ marginTop: 4 }}
                      aria-label={`Chọn duyệt ${item.title}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setSelectedReviewIds((prev) =>
                            event.target.checked
                              ? [...new Set([...prev, item.id])]
                              : prev.filter((id) => id !== item.id)
                          )
                        }}
                      />
                    </label>
                    <span
                      className="of-avatar"
                      style={{ background: item.staffAccentColor }}
                      aria-hidden="true"
                    >
                      {getInitials(item.staffName)}
                    </span>
                    <div className="of-ap-tt">
                      <div className="of-ap-nm">
                        {item.staffName} · {KIND_LABEL[item.kind]} · gửi{" "}
                        {formatHm(item.submittedAt)}
                      </div>
                      <b>{item.title}</b>
                      {item.kind === "day" && (
                        <div className="of-warn-bar">
                          Duyệt trong hôm nay, qua 0:00 không tính điểm
                        </div>
                      )}
                      {item.submitNote && (
                        <div className="of-quote">{item.submitNote}</div>
                      )}
                    </div>
                    <span className="of-tk-pt">+{item.points}</span>
                  </div>

                  {!isReturning ? (
                    <div className="of-ap-acts">
                      <button
                        type="button"
                        className="of-btn is-ok"
                        disabled={approveTasksMutation.isPending}
                        onClick={() => void handleApprove([item.id])}
                      >
                        ✓ Duyệt hoàn thành
                      </button>
                      <button
                        type="button"
                        className="of-btn is-red"
                        onClick={() => {
                          setReturningId(item.id)
                          setReturnReason("")
                          setReturnError(null)
                        }}
                      >
                        Trả lại
                      </button>
                    </div>
                  ) : (
                    <form
                      className="of-inline-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void handleConfirmReturn(item.id)
                      }}
                    >
                      <textarea
                        className="of-textarea"
                        maxLength={MAX_RETURN_REASON}
                        value={returnReason}
                        placeholder="Lý do trả lại (nhân viên sẽ thấy)"
                        aria-label={`Lý do trả lại cho ${item.title}`}
                        onChange={(event) => {
                          setReturnReason(
                            event.target.value.slice(0, MAX_RETURN_REASON)
                          )
                          if (returnError) setReturnError(null)
                        }}
                      />
                      {returnError && (
                        <div className="of-err" role="alert">
                          {returnError}
                        </div>
                      )}
                      <div className="of-form-acts">
                        <span
                          className="of-fh-sub"
                          style={{ marginRight: "auto" }}
                        >
                          {returnReason.length}/{MAX_RETURN_REASON}
                        </span>
                        <button
                          type="button"
                          className="of-btn is-ghost"
                          onClick={() => {
                            setReturningId(null)
                            setReturnReason("")
                            setReturnError(null)
                          }}
                        >
                          Huỷ
                        </button>
                        <button
                          type="submit"
                          className="of-btn is-red"
                          disabled={returnTaskMutation.isPending}
                        >
                          Xác nhận trả lại
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

      {/* Bottom-Left: ĐỀ XUẤT */}
      <section className="of-fr">
        <div className="of-fh">
          <h3>ĐỀ XUẤT</h3>
          <span className="of-fh-sub">
            {unreadProposalsCount > 0
              ? `${unreadProposalsCount} mới`
              : `${proposals.length} mục`}
          </span>
        </div>
        <div className="of-fb" style={{ paddingLeft: 18 }}>
          {proposalsQuery.isError ? (
            <OfficeQueryError onRetry={() => void proposalsQuery.refetch()} />
          ) : proposals.length === 0 ? (
            <p className="of-empty">Chưa có đề xuất nào từ nhóm.</p>
          ) : (
            proposals.map((proposal) => {
              const isUnread = proposal.status === "sent"
              const isReplying = replyingId === proposal.id
              return (
                <div
                  key={proposal.id}
                  className={isUnread ? "of-msg is-unread" : "of-msg"}
                  data-testid={`office-team-proposal-${proposal.id}`}
                >
                  <div className="of-msg-head">
                    <span>
                      <strong style={{ color: "var(--of-tx)" }}>
                        {proposal.staffName}
                      </strong>{" "}
                      · {formatFullDate(proposal.createdAt)} ·{" "}
                      {formatHm(proposal.createdAt)}
                    </span>
                    {isUnread && <span className="of-tag t-warn">Mới</span>}
                    {proposal.status === "seen" && (
                      <span className="of-tag t-blue">Đã xem</span>
                    )}
                    {proposal.status === "replied" && (
                      <span className="of-tag t-ok">Đã trả lời</span>
                    )}
                  </div>
                  <p style={{ margin: 0 }}>{proposal.content}</p>

                  {proposal.reply ? (
                    <div className="of-msg-rep">
                      <b>
                        Bạn đã trả lời
                        {proposal.repliedAt
                          ? ` · ${formatFullDate(proposal.repliedAt)}`
                          : ""}
                      </b>
                      {proposal.reply}
                    </div>
                  ) : !isReplying ? (
                    <div className="of-ap-acts">
                      <button
                        type="button"
                        className="of-btn is-gold"
                        onClick={() => handleOpenReply(proposal)}
                      >
                        Trả lời
                      </button>
                      {isUnread && (
                        <button
                          type="button"
                          className="of-btn is-ghost"
                          disabled={markSeenMutation.isPending}
                          onClick={() => markSeenMutation.mutate(proposal.id)}
                        >
                          Đánh dấu đã xem
                        </button>
                      )}
                    </div>
                  ) : (
                    <form
                      className="of-inline-form"
                      style={{ marginLeft: 0 }}
                      onSubmit={(event) => {
                        event.preventDefault()
                        void handleSubmitReply(proposal.id)
                      }}
                    >
                      <textarea
                        className="of-textarea"
                        maxLength={MAX_REPLY}
                        value={replyDraft}
                        placeholder="Nhập nội dung trả lời đề xuất..."
                        aria-label={`Trả lời đề xuất của ${proposal.staffName}`}
                        onChange={(event) => {
                          setReplyDraft(
                            event.target.value.slice(0, MAX_REPLY)
                          )
                          if (replyError) setReplyError(null)
                        }}
                      />
                      {replyError && (
                        <div className="of-err" role="alert">
                          {replyError}
                        </div>
                      )}
                      <div className="of-form-acts">
                        <span
                          className="of-fh-sub"
                          style={{ marginRight: "auto" }}
                        >
                          {replyDraft.length}/{MAX_REPLY}
                        </span>
                        <button
                          type="button"
                          className="of-btn is-ghost"
                          onClick={() => {
                            setReplyingId(null)
                            setReplyDraft("")
                            setReplyError(null)
                          }}
                        >
                          Huỷ
                        </button>
                        <button
                          type="submit"
                          className="of-btn is-gold"
                          disabled={replyProposalMutation.isPending}
                        >
                          Gửi trả lời
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

      {/* Bottom-Right: TIẾN ĐỘ NHÂN VIÊN */}
      <section className="of-fr">
        <div className="of-fh">
          <h3>TIẾN ĐỘ NHÂN VIÊN</h3>
          <span className="of-fh-sub">bấm tên để mở hồ sơ</span>
        </div>
        <div className="of-fb">
          {progressQuery.isError ? (
            <OfficeQueryError onRetry={() => void progressQuery.refetch()} />
          ) : progressRows.length === 0 ? (
            <p className="of-empty">Chưa có dữ liệu tiến độ nhân viên.</p>
          ) : (
            <table className="of-tbl">
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  <th>Ngày</th>
                  <th>Tháng</th>
                  <th>KPI</th>
                  <th>Chờ</th>
                  <th>Điểm</th>
                </tr>
              </thead>
              <tbody>
                {progressRows.map((row) => (
                  <tr
                    key={row.userId}
                    className="is-click"
                    tabIndex={0}
                    aria-label={`Mở hồ sơ ${row.displayName}`}
                    onClick={() => onOpenProfile(row.userId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        onOpenProfile(row.userId)
                      }
                    }}
                  >
                    <td>
                      <span className="of-tbl-nm">
                        <i
                          style={{ background: row.accentColor }}
                          aria-hidden="true"
                        >
                          {getInitials(row.displayName)}
                        </i>
                        <span>{row.displayName}</span>
                      </span>
                    </td>
                    <td>
                      {row.dayDone}/{row.dayTotal}
                      <span className="of-mini-bar" aria-hidden="true">
                        <i
                          style={{
                            width: `${ratioPercent(row.dayDone, row.dayTotal)}%`,
                          }}
                        />
                      </span>
                    </td>
                    <td>
                      {row.monthDone}/{row.monthTotal}
                      <span className="of-mini-bar" aria-hidden="true">
                        <i
                          style={{
                            width: `${ratioPercent(row.monthDone, row.monthTotal)}%`,
                          }}
                        />
                      </span>
                    </td>
                    <td>
                      {row.kpiDone}/{row.kpiTotal}
                      <span className="of-mini-bar" aria-hidden="true">
                        <i
                          style={{
                            width: `${ratioPercent(row.kpiDone, row.kpiTotal)}%`,
                          }}
                        />
                      </span>
                    </td>
                    <td>
                      {row.pendingCount > 0 ? (
                        <span className="of-tag t-warn">{row.pendingCount}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td>
                      <b style={{ color: "var(--of-gold2)" }}>{row.points}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </ModalShell>
  )
}
