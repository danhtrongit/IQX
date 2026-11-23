import type {
  OfficeApproveTasksResponse,
  OfficeCreateAssignmentData,
  OfficeCreateMeetingData,
  OfficeCreateStickyNoteData,
  OfficeDeleteAssignmentResponse,
  OfficeGetMemberProfileResponse,
  OfficeLeaderboardResponse,
  OfficeListAssignmentsResponse,
  OfficeListDocumentsResponse,
  OfficeListMeetingsResponse,
  OfficeListMembersResponse,
  OfficeListMyProposalsResponse,
  OfficeListMyTasksResponse,
  OfficeListReviewResponse,
  OfficeListStickyNotesResponse,
  OfficeMeResponse,
  OfficeProgressResponse,
  OfficeAttendanceCheckInResponse,
  OfficeAttendanceTodayResponse,
  OfficeUpdateAssignmentData,
  OfficeUpdateMeetingData,
  OfficeUpdateStickyNoteData,
} from "@/lib/generated/backend-v2"

export type OfficeRole = "boss" | "staff"
export type OfficeEffectiveRole = "boss" | "staff" | "none"
export type OfficeTaskKind = "day" | "month" | "kpi"
export type OfficeTaskStatus = "todo" | "pending" | "returned" | "done" | "expired"
export type OfficeAttendanceState = "ok" | "late"
export type OfficeAttendanceDisplayState = "ok" | "late" | "absent"
export type OfficeProposalStatus = "sent" | "seen" | "replied"
export type OfficeStickyColor = "y" | "p" | "b" | "g"
export type OfficeAllowedDocExt = "pdf" | "docx" | "xlsx" | "pptx" | "png" | "jpg"
export type OfficeFacing = "up" | "down" | "left" | "right"

export type OfficeSyncScope =
  | "tasks"
  | "attendance"
  | "proposals"
  | "meetings"
  | "documents"
  | "members"
  | "leaderboard"
  | "notifications"

export type OfficeModalId = "mine" | "mgr" | "prof" | "meet" | "docs" | "stand"
export type OfficeStationId = "boss" | "meet" | "docs" | "stand" | "mydesk"

export type OfficeMe = OfficeMeResponse
export type OfficeTeam = NonNullable<OfficeMeResponse["team"]>
export type OfficeMember = OfficeMeResponse["members"][number]
export type OfficeBossHud = Extract<NonNullable<OfficeMeResponse["hud"]>, { kind: "boss" }>
export type OfficeStaffHud = Extract<NonNullable<OfficeMeResponse["hud"]>, { kind: "staff" }>

export type OfficeMyTasksResponse = OfficeListMyTasksResponse
export type OfficeTask = OfficeListMyTasksResponse["day"][number]

export type OfficeAssignmentsResponse = OfficeListAssignmentsResponse
export type OfficeAssignment = OfficeListAssignmentsResponse["items"][number]
export type OfficeDeleteAssignmentResult = OfficeDeleteAssignmentResponse

export type OfficeReviewResponse = OfficeListReviewResponse
export type OfficeReviewItem = OfficeListReviewResponse["items"][number]
export type OfficeApproveTasksResult = OfficeApproveTasksResponse

export type OfficeProgressListResponse = OfficeProgressResponse
export type OfficeProgressRow = OfficeProgressResponse["items"][number]

export type OfficeAttendanceCheckInResult = OfficeAttendanceCheckInResponse
export type OfficeAttendanceToday = OfficeAttendanceTodayResponse
export type OfficeAttendanceEntry = OfficeAttendanceTodayResponse["roster"]["ok"][number]

export type OfficeProposalsResponse = OfficeListMyProposalsResponse
export type OfficeProposal = OfficeListMyProposalsResponse["items"][number]

export type OfficeStickyNotesResponse = OfficeListStickyNotesResponse
export type OfficeStickyNote = OfficeListStickyNotesResponse["items"][number]

export type OfficeMembersListResponse = OfficeListMembersResponse
export type OfficeMemberListItem = OfficeListMembersResponse["items"][number]
export type OfficeTenure = OfficeMemberListItem["tenure"]
export type OfficeMemberDetail = OfficeGetMemberProfileResponse
export type OfficeBossNote = OfficeGetMemberProfileResponse["notes"][number]

export type OfficeMeetingsResponse = OfficeListMeetingsResponse
export type OfficeMeeting = OfficeListMeetingsResponse["today"][number]

export type OfficeDocumentsResponse = OfficeListDocumentsResponse
export type OfficeDocument = OfficeListDocumentsResponse["items"][number]

export type OfficeLeaderboard = OfficeLeaderboardResponse
export type OfficeLeaderboardEntry = OfficeLeaderboardResponse["top3"][number]

export type CreateAssignmentInput = OfficeCreateAssignmentData["body"]
export type UpdateAssignmentInput = OfficeUpdateAssignmentData["body"]
export type CreateStickyNoteInput = OfficeCreateStickyNoteData["body"]
export type UpdateStickyNoteInput = OfficeUpdateStickyNoteData["body"]
export type CreateMeetingInput = OfficeCreateMeetingData["body"]
export type UpdateMeetingInput = OfficeUpdateMeetingData["body"]

export type OfficeHudCollapseState = Record<string, boolean>

export interface OfficeOnlinePeer {
  peerId?: string
  userId: string
  name: string
  role: OfficeRole
  avatarId: string
  avatarColor?: string | null
  accentColor: string
  deskIndex?: number | null
  x: number
  y: number
  facing: OfficeFacing
  moving: boolean
}

export interface OfficeSelfStatePayload {
  x: number
  y: number
  facing: OfficeFacing
  moving: boolean
}

export interface OfficeStationAction {
  station: OfficeStationId
  modal: OfficeModalId
  focusProposal?: boolean
}
