import { Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

import {
  useCreateMemberNote,
  useDeleteMemberNote,
  useOfficeMemberDetail,
  useOfficeMembers,
  useUpdateMemberProfile,
} from "../hooks.ts"
import type { OfficeMe } from "../types.ts"
import {
  formatFullDate,
  formatTenureVi,
  getInitials,
  monthNumberFromPeriod,
  normalizeVi,
} from "../utils.ts"
import { ModalShell, OfficeQueryError } from "./ModalShell.tsx"

const MAX_BOSS_NOTE = 1000

export interface StaffProfileModalProps {
  me: OfficeMe
  initialUserId: string | null
  onClose: () => void
  onToast: (message: string) => void
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

export function StaffProfileModal({
  me,
  initialUserId,
  onClose,
  onToast,
}: StaffProfileModalProps) {
  const membersQuery = useOfficeMembers("", true)
  const [search, setSearch] = useState("")
  const [selectedUserId, setSelectedUserId] = useState<string | null>(
    initialUserId
  )
  const [joinDateOverride, setJoinDateOverride] = useState<{
    userId: string
    value: string
  } | null>(null)
  const [joinDateError, setJoinDateError] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState("")
  const [noteError, setNoteError] = useState<string | null>(null)

  const updateProfileMutation = useUpdateMemberProfile()
  const createNoteMutation = useCreateMemberNote()
  const deleteNoteMutation = useDeleteMemberNote()

  const members = useMemo(
    () => membersQuery.data?.items ?? [],
    [membersQuery.data?.items]
  )
  const todayDate = membersQuery.data?.todayDate ?? me.todayDate
  const monthNum = monthNumberFromPeriod(me.periodMonth)

  const filteredMembers = useMemo(() => {
    const q = normalizeVi(search)
    if (!q) return members
    return members.filter((item) => normalizeVi(item.displayName).includes(q))
  }, [members, search])

  const activeUserId = useMemo(() => {
    if (selectedUserId && members.some((m) => m.userId === selectedUserId)) {
      return selectedUserId
    }
    if (initialUserId && members.some((m) => m.userId === initialUserId)) {
      return initialUserId
    }
    return filteredMembers[0]?.userId ?? members[0]?.userId ?? null
  }, [filteredMembers, initialUserId, members, selectedUserId])

  const detailQuery = useOfficeMemberDetail(activeUserId, Boolean(activeUserId))
  const detail = detailQuery.data ?? null

  const joinDateDraft =
    detail && joinDateOverride?.userId === detail.userId
      ? joinDateOverride.value
      : (detail?.joinDate ?? "")

  const sortedNotes = useMemo(() => {
    const notes = detail?.notes ?? []
    return [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [detail?.notes])

  const handleJoinDateChange = async (value: string) => {
    if (!detail) return
    setJoinDateOverride({ userId: detail.userId, value })
    setJoinDateError(null)
    if (!value) return
    if (value > todayDate) {
      setJoinDateError("Ngày vào làm không được lớn hơn hôm nay.")
      return
    }
    if (value === detail.joinDate) return
    try {
      await updateProfileMutation.mutateAsync({
        userId: detail.userId,
        joinDate: value,
      })
      setJoinDateOverride(null)
      onToast("Đã cập nhật ngày vào làm.")
    } catch (error) {
      setJoinDateError(
        getErrorMessage(error, "Không thể cập nhật ngày vào làm.")
      )
    }
  }

  const handleAddBossNote = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!detail) return
    const content = noteDraft.trim()
    if (!content) {
      setNoteError("Vui lòng nhập nội dung ghi chú.")
      return
    }
    setNoteError(null)
    try {
      await createNoteMutation.mutateAsync({
        userId: detail.userId,
        content,
      })
      setNoteDraft("")
      onToast("Đã lưu ghi chú của sếp.")
    } catch (error) {
      setNoteError(getErrorMessage(error, "Không thể lưu ghi chú."))
    }
  }

  const handleDeleteBossNote = async (noteId: string) => {
    if (!detail) return
    try {
      await deleteNoteMutation.mutateAsync({
        userId: detail.userId,
        noteId,
      })
      onToast("Đã xoá ghi chú.")
    } catch (error) {
      onToast(getErrorMessage(error, "Không thể xoá ghi chú."))
    }
  }

  return (
    <ModalShell
      title="HỒ SƠ NHÂN VIÊN"
      subtitle={`Nhóm ${me.team?.bossName ?? ""} · ${members.length} nhân viên`}
      bodyClassName="of-bb-prof"
      testId="office-modal-prof"
      onClose={onClose}
    >
      {/* Left Sidebar: Diacritic-insensitive Search & Staff Roster */}
      <aside className="of-fr of-plist" aria-label="Danh sách nhân viên">
        <div className="of-plist-srch">
          <input
            type="search"
            className="of-inp"
            value={search}
            placeholder="Tìm nhân viên..."
            aria-label="Tìm nhân viên"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="of-plist-items">
          {membersQuery.isError ? (
            <div style={{ padding: "12px" }}>
              <OfficeQueryError onRetry={() => void membersQuery.refetch()} />
            </div>
          ) : filteredMembers.length === 0 ? (
            <p className="of-empty" style={{ padding: "14px 12px" }}>
              {membersQuery.isLoading
                ? "Đang tải danh sách nhân viên..."
                : "Không tìm thấy nhân viên phù hợp."}
            </p>
          ) : (
            filteredMembers.map((member) => {
              const isSelected = member.userId === activeUserId
              return (
                <button
                  key={member.userId}
                  type="button"
                  className={isSelected ? "of-pi is-on" : "of-pi"}
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => {
                    setSelectedUserId(member.userId)
                    setJoinDateOverride(null)
                    setJoinDateError(null)
                    setNoteDraft("")
                    setNoteError(null)
                  }}
                >
                  <span
                    className="of-avatar"
                    style={{ background: member.accentColor }}
                    aria-hidden="true"
                  >
                    {getInitials(member.displayName)}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <b>{member.displayName}</b>
                    <small>
                      Đã làm {formatTenureVi(member.joinDate, todayDate)}
                    </small>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* Right Detail Pane */}
      <section className="of-fr of-prof" aria-label="Chi tiết hồ sơ nhân viên">
        {detailQuery.isError ? (
          <OfficeQueryError onRetry={() => void detailQuery.refetch()} />
        ) : !detail ? (
          <p className="of-empty">
            {detailQuery.isLoading
              ? "Đang tải hồ sơ nhân viên..."
              : "Chọn một nhân viên để xem hồ sơ chi tiết."}
          </p>
        ) : (
          <>
            <div className="of-ph">
              <span
                className="of-avatar"
                style={{ background: detail.accentColor }}
                aria-hidden="true"
              >
                {getInitials(detail.displayName)}
              </span>
              <div>
                <h4>{detail.displayName}</h4>
                <p>SACO · Nhóm {detail.bossName}</p>
              </div>
            </div>

            <div className="of-stats">
              <div>
                <span>Điểm tháng {monthNum}</span>
                <b style={{ color: "var(--of-gold2)" }}>
                  {detail.stats.monthlyPoints}
                </b>
              </div>
              <div>
                <span>Nhiệm vụ đã xong</span>
                <b>
                  {detail.stats.tasksDone}
                  <small>/{detail.stats.tasksTotal}</small>
                </b>
              </div>
              <div>
                <span>Chờ xác nhận</span>
                <b>{detail.stats.pendingCount}</b>
              </div>
              <div>
                <span>Điểm danh tháng {monthNum}</span>
                <b>
                  {detail.stats.attendanceOk}{" "}
                  <small>
                    đúng · {detail.stats.attendanceLate} trễ ·{" "}
                    {detail.stats.attendanceAbsent} vắng
                  </small>
                </b>
              </div>
            </div>

            <div className="of-sect">
              <h5>NGÀY VÀO LÀM</h5>
              <div className="of-jd">
                <input
                  type="date"
                  className="of-inp"
                  max={todayDate}
                  value={joinDateDraft}
                  aria-label="Ngày vào làm"
                  disabled={updateProfileMutation.isPending}
                  onChange={(event) =>
                    void handleJoinDateChange(event.target.value)
                  }
                />
                <div className="of-jd-ten" data-testid="office-profile-tenure">
                  Đã làm{" "}
                  {formatTenureVi(
                    joinDateDraft && joinDateDraft <= todayDate
                      ? joinDateDraft
                      : detail.joinDate,
                    todayDate
                  )}
                  <small>tính tới {formatFullDate(todayDate)}</small>
                </div>
              </div>
              {joinDateError && (
                <div className="of-err" role="alert" style={{ marginTop: 8 }}>
                  {joinDateError}
                </div>
              )}
            </div>

            <div className="of-sect">
              <h5>GHI CHÚ CỦA SẾP</h5>
              <form
                className="of-compose"
                style={{ paddingTop: 0 }}
                onSubmit={(event) => void handleAddBossNote(event)}
              >
                <textarea
                  className="of-textarea"
                  maxLength={MAX_BOSS_NOTE}
                  value={noteDraft}
                  placeholder="Ghi chú riêng của trưởng nhóm về nhân viên này..."
                  aria-label="Ghi chú của sếp"
                  onChange={(event) => {
                    setNoteDraft(event.target.value.slice(0, MAX_BOSS_NOTE))
                    if (noteError) setNoteError(null)
                  }}
                />
                {noteError && (
                  <div className="of-err" role="alert">
                    {noteError}
                  </div>
                )}
                <div className="of-compose-acts">
                  <span>
                    Riêng tư · {noteDraft.length}/{MAX_BOSS_NOTE}
                  </span>
                  <button
                    type="submit"
                    className="of-btn is-gold"
                    disabled={createNoteMutation.isPending}
                  >
                    Lưu ghi chú
                  </button>
                </div>
              </form>

              {sortedNotes.length === 0 ? (
                <p className="of-empty">Chưa có ghi chú nào cho nhân viên này.</p>
              ) : (
                sortedNotes.map((note) => (
                  <div
                    key={note.id}
                    className="of-boss-note"
                    data-testid={`office-boss-note-${note.id}`}
                  >
                    <span className="of-boss-note-date">
                      {formatFullDate(note.createdAt)}
                    </span>
                    <p>{note.content}</p>
                    <button
                      type="button"
                      className="of-btn is-red"
                      aria-label="Xoá ghi chú của sếp"
                      disabled={deleteNoteMutation.isPending}
                      onClick={() => void handleDeleteBossNote(note.id)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </section>
    </ModalShell>
  )
}
