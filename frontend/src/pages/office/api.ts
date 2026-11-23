import { API_BASE } from "@/lib/api"
import {
  requestOperation,
  requestOperationResponse,
} from "@/lib/contract-client"

import type {
  CreateAssignmentInput,
  CreateMeetingInput,
  CreateStickyNoteInput,
  OfficeApproveTasksResult,
  OfficeAssignment,
  OfficeAssignmentsResponse,
  OfficeAttendanceCheckInResult,
  OfficeAttendanceToday,
  OfficeBossNote,
  OfficeDeleteAssignmentResult,
  OfficeDocument,
  OfficeDocumentsResponse,
  OfficeLeaderboard,
  OfficeMe,
  OfficeMeeting,
  OfficeMeetingsResponse,
  OfficeMemberDetail,
  OfficeMembersListResponse,
  OfficeMyTasksResponse,
  OfficeProgressListResponse,
  OfficeProposal,
  OfficeProposalsResponse,
  OfficeReviewResponse,
  OfficeStickyNote,
  OfficeStickyNotesResponse,
  OfficeTask,
  UpdateAssignmentInput,
  UpdateMeetingInput,
  UpdateStickyNoteInput,
} from "./types.ts"

/** Resolves a server-returned relative `/api/v2/office/documents/...` download path against `API_BASE`. */
export function resolveOfficeDownloadUrl(downloadUrl: string): string {
  const trimmed = downloadUrl.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith("/api/v2/")) {
    return `${API_BASE}${trimmed.slice("/api/v2".length)}`
  }
  if (trimmed.startsWith("/")) {
    return `${API_BASE}${trimmed}`
  }
  return trimmed
}

/** Triggers a browser file download using the server-issued HMAC-signed `downloadUrl`. */
export function triggerOfficeDocumentDownload(
  doc: Pick<OfficeDocument, "downloadUrl" | "fileName">
): void {
  if (typeof document === "undefined") return
  const href = resolveOfficeDownloadUrl(doc.downloadUrl)
  const anchor = document.createElement("a")
  anchor.href = href
  anchor.download = doc.fileName
  anchor.rel = "noopener noreferrer"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export const officeApi = {
  // ───────────── Bootstrap & Shared ─────────────

  me: (signal?: AbortSignal): Promise<OfficeMe> =>
    requestOperation("GET /api/v2/office/me", {}, { signal }),

  attendanceToday: (signal?: AbortSignal): Promise<OfficeAttendanceToday> =>
    requestOperation("GET /api/v2/office/attendance/today", {}, { signal }),

  checkIn: (): Promise<OfficeAttendanceCheckInResult> =>
    requestOperation("POST /api/v2/office/attendance/check-in", {}),

  leaderboard: (
    period?: string,
    signal?: AbortSignal
  ): Promise<OfficeLeaderboard> =>
    requestOperation(
      "GET /api/v2/office/leaderboard",
      period ? { query: { period } } : {},
      { signal }
    ),

  // ───────────── Staff Tasks ─────────────

  listMyTasks: (signal?: AbortSignal): Promise<OfficeMyTasksResponse> =>
    requestOperation("GET /api/v2/office/tasks", {}, { signal }),

  submitTask: (id: string, note = ""): Promise<OfficeTask> =>
    requestOperation("POST /api/v2/office/tasks/{id}/submit", {
      path: { id },
      body: { note },
    }),

  // ───────────── Boss Assignments, Review & Progress ─────────────

  listAssignments: (signal?: AbortSignal): Promise<OfficeAssignmentsResponse> =>
    requestOperation("GET /api/v2/office/assignments", {}, { signal }),

  createAssignment: (body: CreateAssignmentInput): Promise<OfficeAssignment> =>
    requestOperation("POST /api/v2/office/assignments", { body }),

  updateAssignment: (
    id: string,
    body: UpdateAssignmentInput
  ): Promise<OfficeAssignment> =>
    requestOperation("PATCH /api/v2/office/assignments/{id}", {
      path: { id },
      body,
    }),

  deleteAssignment: (id: string): Promise<OfficeDeleteAssignmentResult> =>
    requestOperation("DELETE /api/v2/office/assignments/{id}", {
      path: { id },
    }),

  listReview: (signal?: AbortSignal): Promise<OfficeReviewResponse> =>
    requestOperation("GET /api/v2/office/review", {}, { signal }),

  approveTasks: (ids: string[]): Promise<OfficeApproveTasksResult> =>
    requestOperation("POST /api/v2/office/tasks/approve", { body: { ids } }),

  returnTask: (id: string, reason: string): Promise<OfficeTask> =>
    requestOperation("POST /api/v2/office/tasks/{id}/return", {
      path: { id },
      body: { reason },
    }),

  progress: (signal?: AbortSignal): Promise<OfficeProgressListResponse> =>
    requestOperation("GET /api/v2/office/progress", {}, { signal }),

  // ───────────── Proposals ─────────────

  listMyProposals: (signal?: AbortSignal): Promise<OfficeProposalsResponse> =>
    requestOperation("GET /api/v2/office/proposals", {}, { signal }),

  createProposal: (content: string): Promise<OfficeProposal> =>
    requestOperation("POST /api/v2/office/proposals", { body: { content } }),

  listTeamProposals: (signal?: AbortSignal): Promise<OfficeProposalsResponse> =>
    requestOperation("GET /api/v2/office/proposals/team", {}, { signal }),

  markProposalSeen: (id: string): Promise<OfficeProposal> =>
    requestOperation("POST /api/v2/office/proposals/{id}/seen", {
      path: { id },
    }),

  replyProposal: (id: string, reply: string): Promise<OfficeProposal> =>
    requestOperation("POST /api/v2/office/proposals/{id}/reply", {
      path: { id },
      body: { reply },
    }),

  // ───────────── Staff Private Sticky Notes ─────────────

  listStickyNotes: (signal?: AbortSignal): Promise<OfficeStickyNotesResponse> =>
    requestOperation("GET /api/v2/office/notes", {}, { signal }),

  createStickyNote: (
    body: CreateStickyNoteInput = {}
  ): Promise<OfficeStickyNote> =>
    requestOperation("POST /api/v2/office/notes", { body }),

  updateStickyNote: (
    id: string,
    body: UpdateStickyNoteInput
  ): Promise<OfficeStickyNote> =>
    requestOperation("PATCH /api/v2/office/notes/{id}", {
      path: { id },
      body,
    }),

  deleteStickyNote: (id: string): Promise<{ ok: true }> =>
    requestOperation("DELETE /api/v2/office/notes/{id}", {
      path: { id },
    }),

  // ───────────── Boss Staff Profiles & Private Notes ─────────────

  listMembers: (
    q?: string,
    signal?: AbortSignal
  ): Promise<OfficeMembersListResponse> =>
    requestOperation(
      "GET /api/v2/office/members",
      q ? { query: { q } } : {},
      { signal }
    ),

  getMemberProfile: (
    userId: string,
    signal?: AbortSignal
  ): Promise<OfficeMemberDetail> =>
    requestOperation(
      "GET /api/v2/office/members/{userId}",
      { path: { userId } },
      { signal }
    ),

  updateMemberProfile: (
    userId: string,
    joinDate: string
  ): Promise<OfficeMemberDetail> =>
    requestOperation("PATCH /api/v2/office/members/{userId}", {
      path: { userId },
      body: { joinDate },
    }),

  listMemberNotes: (
    userId: string,
    signal?: AbortSignal
  ): Promise<{ items: OfficeBossNote[] }> =>
    requestOperation(
      "GET /api/v2/office/members/{userId}/notes",
      { path: { userId } },
      { signal }
    ),

  createMemberNote: (
    userId: string,
    content: string
  ): Promise<OfficeBossNote> =>
    requestOperation("POST /api/v2/office/members/{userId}/notes", {
      path: { userId },
      body: { content },
    }),

  deleteMemberNote: (
    userId: string,
    noteId: string
  ): Promise<{ ok: true }> =>
    requestOperation("DELETE /api/v2/office/members/{userId}/notes/{noteId}", {
      path: { userId, noteId },
    }),

  // ───────────── Meeting Room ─────────────

  listMeetings: (signal?: AbortSignal): Promise<OfficeMeetingsResponse> =>
    requestOperation("GET /api/v2/office/meetings", {}, { signal }),

  createMeeting: (body: CreateMeetingInput): Promise<OfficeMeeting> =>
    requestOperation("POST /api/v2/office/meetings", { body }),

  updateMeeting: (
    id: string,
    body: UpdateMeetingInput
  ): Promise<OfficeMeeting> =>
    requestOperation("PATCH /api/v2/office/meetings/{id}", {
      path: { id },
      body,
    }),

  deleteMeeting: (id: string): Promise<{ ok: true }> =>
    requestOperation("DELETE /api/v2/office/meetings/{id}", {
      path: { id },
    }),

  // ───────────── Document Library ─────────────

  listDocuments: (signal?: AbortSignal): Promise<OfficeDocumentsResponse> =>
    requestOperation("GET /api/v2/office/documents", {}, { signal }),

  /**
   * Multipart upload through the typed contract client.
   * Places `title` before `file` so `@fastify/multipart`'s `req.file()` receives `fields.title`
   * ahead of the binary stream.
   */
  uploadDocument: (file: File, title?: string): Promise<OfficeDocument> => {
    const trimmed = title?.trim()
    const body = trimmed ? { title: trimmed, file } : { file }
    return requestOperation("POST /api/v2/office/documents", { body })
  },

  deleteDocument: (id: string): Promise<{ ok: true }> =>
    requestOperation("DELETE /api/v2/office/documents/{id}", {
      path: { id },
    }),

  downloadDocumentResponse: (
    id: string,
    token: string,
    signal?: AbortSignal
  ): Promise<Response> =>
    requestOperationResponse(
      "GET /api/v2/office/documents/{id}/download",
      { path: { id }, query: { token } },
      { signal }
    ),
}

export const uploadOfficeDocument = officeApi.uploadDocument
