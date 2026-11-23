import { ExternalLink, Plus } from "lucide-react"
import { useState } from "react"

import {
  useCreateMeeting,
  useDeleteMeeting,
  useOfficeMeetings,
  useUpdateMeeting,
} from "../hooks.ts"
import type { OfficeMe, OfficeMeeting } from "../types.ts"
import { formatHm, formatMeetingScheduleVi } from "../utils.ts"
import { ModalShell, OfficeQueryError } from "./ModalShell.tsx"

const MAX_MEET_TITLE = 120
const MIN_DURATION = 5
const MAX_DURATION = 480
const MAX_AGENDA_ITEMS = 20
const MAX_AGENDA_LINE = 200

export interface MeetingRoomModalProps {
  me: OfficeMe
  onClose: () => void
  onToast: (message: string) => void
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

function extractIctDatePart(isoTimestamp: string, fallback: string): string {
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) return fallback
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const d = String(shifted.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function isSafeHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim())
}

export function MeetingRoomModal({
  me,
  onClose,
  onToast,
}: MeetingRoomModalProps) {
  const meetingsQuery = useOfficeMeetings(true)
  const createMutation = useCreateMeeting()
  const updateMutation = useUpdateMeeting()
  const deleteMutation = useDeleteMeeting()

  const isBoss = me.role === "boss"
  const todayDate = meetingsQuery.data?.todayDate ?? me.todayDate

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [datePart, setDatePart] = useState(todayDate)
  const [timePart, setTimePart] = useState("09:00")
  const [durationStr, setDurationStr] = useState("60")
  const [platform, setPlatform] = useState("Google Meet")
  const [meetingUrl, setMeetingUrl] = useState("")
  const [agendaText, setAgendaText] = useState("")
  const [recurrenceWeekly, setRecurrenceWeekly] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const openCreateForm = () => {
    setEditingId(null)
    setTitle("")
    setDatePart(todayDate)
    setTimePart("09:00")
    setDurationStr("60")
    setPlatform("Google Meet")
    setMeetingUrl("")
    setAgendaText("")
    setRecurrenceWeekly(false)
    setFormError(null)
    setFormOpen(true)
  }

  const openEditForm = (meeting: OfficeMeeting) => {
    setEditingId(meeting.id)
    setTitle(meeting.title)
    setDatePart(extractIctDatePart(meeting.startsAt, todayDate))
    setTimePart(formatHm(meeting.startsAt) || "09:00")
    setDurationStr(String(meeting.durationMinutes))
    setPlatform(meeting.platform)
    setMeetingUrl(meeting.meetingUrl)
    setAgendaText(meeting.agenda.join("\n"))
    setRecurrenceWeekly(meeting.recurrenceWeekly)
    setFormError(null)
    setFormOpen(true)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const cleanTitle = title.trim()
    const cleanUrl = meetingUrl.trim()
    const durationMinutes = Number(durationStr)
    if (!cleanTitle) {
      setFormError("Vui lòng nhập tiêu đề cuộc họp.")
      return
    }
    if (!datePart || !timePart) {
      setFormError("Vui lòng chọn ngày và giờ họp.")
      return
    }
    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < MIN_DURATION ||
      durationMinutes > MAX_DURATION
    ) {
      setFormError(
        `Thời lượng phải là số nguyên từ ${MIN_DURATION} đến ${MAX_DURATION} phút.`
      )
      return
    }
    if (!isSafeHttpUrl(cleanUrl)) {
      setFormError("Đường dẫn phòng họp phải bắt đầu bằng https:// hoặc http://.")
      return
    }
    const rawAgendaLines = agendaText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    if (rawAgendaLines.length > MAX_AGENDA_ITEMS) {
      setFormError(`Nội dung cuộc họp tối đa ${MAX_AGENDA_ITEMS} mục.`)
      return
    }
    if (rawAgendaLines.some((line) => line.length > MAX_AGENDA_LINE)) {
      setFormError(`Mỗi mục nội dung họp tối đa ${MAX_AGENDA_LINE} ký tự.`)
      return
    }
    setFormError(null)

    const startsAt = `${datePart}T${timePart}:00+07:00`
    const agenda = rawAgendaLines

    const payload = {
      title: cleanTitle,
      startsAt,
      durationMinutes,
      platform: platform.trim() || "Google Meet",
      meetingUrl: cleanUrl,
      agenda,
      recurrenceWeekly,
    }

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, body: payload })
        onToast("Đã cập nhật lịch họp.")
      } else {
        await createMutation.mutateAsync(payload)
        onToast("Đã tạo lịch họp mới.")
      }
      setFormOpen(false)
      setEditingId(null)
    } catch (error) {
      setFormError(getErrorMessage(error, "Không thể lưu lịch họp."))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id)
      setConfirmDeleteId(null)
      onToast("Đã xoá lịch họp.")
    } catch (error) {
      onToast(getErrorMessage(error, "Không thể xoá lịch họp."))
    }
  }

  const renderMeetingCard = (meeting: OfficeMeeting) => {
    const safeUrl = isSafeHttpUrl(meeting.meetingUrl)
      ? meeting.meetingUrl.trim()
      : null
    const isDeleting = confirmDeleteId === meeting.id

    return (
      <article
        key={meeting.id}
        className="of-meet-card"
        data-testid={`office-meeting-${meeting.id}`}
      >
        <div className="of-meet-head">
          <div>
            <h4 className="of-meet-title">{meeting.title}</h4>
            <div className="of-meet-sub">
              {formatMeetingScheduleVi(
                meeting.startsAt,
                meeting.durationMinutes,
                meeting.platform
              )}
            </div>
          </div>
          {meeting.recurrenceWeekly && (
            <span className="of-tag t-blue">Hằng tuần</span>
          )}
        </div>

        {meeting.agenda.length > 0 && (
          <ol className="of-meet-agenda">
            {meeting.agenda.map((point, idx) => (
              <li key={`${meeting.id}-ag-${idx}`}>{point}</li>
            ))}
          </ol>
        )}

        <div className="of-meet-acts">
          {safeUrl && (
            <a
              className="of-btn is-gold"
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Vào họp
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}
          {isBoss && !isDeleting && (
            <>
              <button
                type="button"
                className="of-btn is-ghost"
                onClick={() => openEditForm(meeting)}
              >
                Sửa
              </button>
              <button
                type="button"
                className="of-btn is-red"
                onClick={() => setConfirmDeleteId(meeting.id)}
              >
                Xoá
              </button>
            </>
          )}
        </div>

        {isBoss && isDeleting && (
          <div className="of-confirm-inline">
            <span>Xác nhận xoá lịch họp &ldquo;{meeting.title}&rdquo;?</span>
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
                disabled={deleteMutation.isPending}
                onClick={() => void handleDelete(meeting.id)}
              >
                Xác nhận xoá
              </button>
            </div>
          </div>
        )}
      </article>
    )
  }

  const todayMeetings = meetingsQuery.data?.today ?? []
  const upcomingMeetings = meetingsQuery.data?.upcoming ?? []

  return (
    <ModalShell
      title="PHÒNG HỌP"
      subtitle={`Nhóm ${me.team?.bossName ?? ""}`}
      size="small"
      bodyClassName="of-bb-sm"
      testId="office-modal-meet"
      headerExtra={
        isBoss ? (
          <button
            type="button"
            className="of-bh-btn"
            onClick={() => (formOpen ? setFormOpen(false) : openCreateForm())}
          >
            {formOpen ? (
              "Đóng biểu mẫu"
            ) : (
              <>
                <Plus
                  size={14}
                  aria-hidden="true"
                  style={{ display: "inline", marginRight: 4, verticalAlign: -2 }}
                />
                Tạo lịch họp
              </>
            )}
          </button>
        ) : undefined
      }
      onClose={onClose}
    >
      {isBoss && formOpen && (
        <section className="of-sect">
          <h5>{editingId ? "CẬP NHẬT LỊCH HỌP" : "TẠO LỊCH HỌP MỚI"}</h5>
          <form
            className="of-form"
            style={{ padding: 0 }}
            noValidate
            onSubmit={(event) => void handleSubmit(event)}
          >
            <div className="of-fl">
              <label htmlFor="of-meet-title">
                Tiêu đề ({title.length}/{MAX_MEET_TITLE})
              </label>
              <input
                id="of-meet-title"
                type="text"
                className="of-inp"
                maxLength={MAX_MEET_TITLE}
                value={title}
                placeholder="Họp giao ban đầu tuần"
                onChange={(e) => setTitle(e.target.value.slice(0, MAX_MEET_TITLE))}
              />
            </div>

            <div className="of-grid2">
              <div className="of-fl">
                <label htmlFor="of-meet-date">Ngày họp</label>
                <input
                  id="of-meet-date"
                  type="date"
                  className="of-inp"
                  value={datePart}
                  onChange={(e) => setDatePart(e.target.value)}
                />
              </div>
              <div className="of-fl">
                <label htmlFor="of-meet-time">Giờ bắt đầu</label>
                <input
                  id="of-meet-time"
                  type="time"
                  className="of-inp"
                  value={timePart}
                  onChange={(e) => setTimePart(e.target.value)}
                />
              </div>
            </div>

            <div className="of-grid2">
              <div className="of-fl">
                <label htmlFor="of-meet-dur">Thời lượng (phút)</label>
                <input
                  id="of-meet-dur"
                  type="number"
                  className="of-inp"
                  min={MIN_DURATION}
                  max={MAX_DURATION}
                  value={durationStr}
                  onChange={(e) => setDurationStr(e.target.value)}
                />
              </div>
              <div className="of-fl">
                <label htmlFor="of-meet-plat">Nền tảng</label>
                <input
                  id="of-meet-plat"
                  type="text"
                  className="of-inp"
                  maxLength={60}
                  value={platform}
                  placeholder="Google Meet"
                  onChange={(e) => setPlatform(e.target.value.slice(0, 60))}
                />
              </div>
            </div>

            <div className="of-fl">
              <label htmlFor="of-meet-url">Đường dẫn phòng họp</label>
              <input
                id="of-meet-url"
                type="url"
                className="of-inp"
                value={meetingUrl}
                placeholder="https://meet.google.com/abc-defg-hij"
                onChange={(e) => setMeetingUrl(e.target.value)}
              />
            </div>

            <div className="of-fl">
              <label htmlFor="of-meet-agenda">
                Nội dung cuộc họp (mỗi dòng 1 mục, tối đa {MAX_AGENDA_LINE} ký
                tự/mục)
              </label>
              <textarea
                id="of-meet-agenda"
                className="of-textarea"
                value={agendaText}
                placeholder={"Tổng kết tuần trước\nKế hoạch tuần mới"}
                onChange={(e) => {
                  setAgendaText(e.target.value)
                  if (formError) setFormError(null)
                }}
              />
            </div>

            <label className="of-cb">
              <input
                type="checkbox"
                checked={recurrenceWeekly}
                onChange={(e) => setRecurrenceWeekly(e.target.checked)}
              />
              <span>Lặp lại hằng tuần</span>
            </label>

            {formError && (
              <div className="of-err" role="alert">
                {formError}
              </div>
            )}

            <div className="of-form-acts">
              <button
                type="button"
                className="of-btn is-ghost"
                onClick={() => {
                  setFormOpen(false)
                  setEditingId(null)
                }}
              >
                Huỷ
              </button>
              <button
                type="submit"
                className="of-btn is-gold"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingId ? "Lưu lịch họp" : "Tạo lịch họp"}
              </button>
            </div>
          </form>
        </section>
      )}

      {meetingsQuery.isError ? (
        <OfficeQueryError onRetry={() => void meetingsQuery.refetch()} />
      ) : (
        <>
          <div>
            <h3 className="of-sec-title">CUỘC HỌP HÔM NAY</h3>
            {todayMeetings.length === 0 ? (
              <p className="of-empty">
                {meetingsQuery.isLoading
                  ? "Đang tải lịch họp..."
                  : "Hôm nay chưa có lịch họp nào."}
              </p>
            ) : (
              todayMeetings.map(renderMeetingCard)
            )}
          </div>

          <div style={{ marginTop: 14 }}>
            <h3 className="of-sec-title">LỊCH HỌP TIẾP THEO</h3>
            {upcomingMeetings.length === 0 ? (
              <p className="of-empty">Chưa có lịch họp sắp tới.</p>
            ) : (
              upcomingMeetings.map(renderMeetingCard)
            )}
          </div>
        </>
      )}
    </ModalShell>
  )
}
