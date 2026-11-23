import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"

import { notificationKeys } from "@/pages/notifications/api.ts"

import { officeApi } from "./api.ts"
import type {
  CreateAssignmentInput,
  CreateMeetingInput,
  CreateStickyNoteInput,
  OfficeSyncScope,
  UpdateAssignmentInput,
  UpdateMeetingInput,
  UpdateStickyNoteInput,
} from "./types.ts"

export const officeKeys = {
  all: ["office"] as const,
  me: () => ["office", "me"] as const,
  tasks: () => ["office", "tasks"] as const,
  assignments: () => ["office", "assignments"] as const,
  review: () => ["office", "review"] as const,
  progress: () => ["office", "progress"] as const,
  attendance: () => ["office", "attendance"] as const,
  proposals: () => ["office", "proposals", "mine"] as const,
  teamProposals: () => ["office", "proposals", "team"] as const,
  notes: () => ["office", "notes"] as const,
  membersRoot: () => ["office", "members"] as const,
  members: (q = "") => ["office", "members", q] as const,
  memberDetailRoot: () => ["office", "member"] as const,
  memberDetail: (userId: string) => ["office", "member", userId] as const,
  memberNotes: (userId: string) =>
    ["office", "member", userId, "notes"] as const,
  meetings: () => ["office", "meetings"] as const,
  documents: () => ["office", "documents"] as const,
  leaderboardRoot: () => ["office", "leaderboard"] as const,
  leaderboard: (period?: string) =>
    ["office", "leaderboard", period ?? "current"] as const,
}

/** Invalidates query caches matching a real-time `office:sync` scope. */
export function invalidateOfficeScope(
  queryClient: QueryClient,
  scope: OfficeSyncScope,
  userId?: string
): void {
  switch (scope) {
    case "tasks":
      void queryClient.invalidateQueries({ queryKey: officeKeys.me() })
      void queryClient.invalidateQueries({ queryKey: officeKeys.tasks() })
      void queryClient.invalidateQueries({ queryKey: officeKeys.assignments() })
      void queryClient.invalidateQueries({ queryKey: officeKeys.review() })
      void queryClient.invalidateQueries({ queryKey: officeKeys.progress() })
      void queryClient.invalidateQueries({
        queryKey: officeKeys.leaderboardRoot(),
      })
      void queryClient.invalidateQueries({
        queryKey: officeKeys.memberDetailRoot(),
      })
      break
    case "attendance":
      void queryClient.invalidateQueries({ queryKey: officeKeys.me() })
      void queryClient.invalidateQueries({ queryKey: officeKeys.attendance() })
      void queryClient.invalidateQueries({
        queryKey: officeKeys.memberDetailRoot(),
      })
      break
    case "proposals":
      void queryClient.invalidateQueries({ queryKey: officeKeys.me() })
      void queryClient.invalidateQueries({ queryKey: officeKeys.proposals() })
      void queryClient.invalidateQueries({
        queryKey: officeKeys.teamProposals(),
      })
      break
    case "meetings":
      void queryClient.invalidateQueries({ queryKey: officeKeys.meetings() })
      break
    case "documents":
      void queryClient.invalidateQueries({ queryKey: officeKeys.documents() })
      break
    case "members":
      void queryClient.invalidateQueries({ queryKey: officeKeys.me() })
      void queryClient.invalidateQueries({ queryKey: officeKeys.membersRoot() })
      void queryClient.invalidateQueries({
        queryKey: officeKeys.memberDetailRoot(),
      })
      void queryClient.invalidateQueries({ queryKey: officeKeys.progress() })
      break
    case "leaderboard":
      void queryClient.invalidateQueries({
        queryKey: officeKeys.leaderboardRoot(),
      })
      void queryClient.invalidateQueries({ queryKey: officeKeys.me() })
      void queryClient.invalidateQueries({ queryKey: officeKeys.tasks() })
      break
    case "notifications":
      if (userId) {
        void queryClient.invalidateQueries({
          queryKey: notificationKeys.all(userId),
        })
      } else {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] })
      }
      break
  }
}

// ───────────── Query Hooks ─────────────

export function useOfficeMe(enabled = true) {
  return useQuery({
    queryKey: officeKeys.me(),
    queryFn: ({ signal }) => officeApi.me(signal),
    enabled,
    staleTime: 20_000,
    retry: false,
  })
}

export function useOfficeTasks(enabled = true) {
  return useQuery({
    queryKey: officeKeys.tasks(),
    queryFn: ({ signal }) => officeApi.listMyTasks(signal),
    enabled,
    staleTime: 10_000,
  })
}

export function useOfficeAssignments(enabled = true) {
  return useQuery({
    queryKey: officeKeys.assignments(),
    queryFn: ({ signal }) => officeApi.listAssignments(signal),
    enabled,
    staleTime: 10_000,
  })
}

export function useOfficeReview(enabled = true) {
  return useQuery({
    queryKey: officeKeys.review(),
    queryFn: ({ signal }) => officeApi.listReview(signal),
    enabled,
    staleTime: 10_000,
  })
}

export function useOfficeProgress(enabled = true) {
  return useQuery({
    queryKey: officeKeys.progress(),
    queryFn: ({ signal }) => officeApi.progress(signal),
    enabled,
    staleTime: 10_000,
  })
}

export function useOfficeAttendanceToday(enabled = true) {
  return useQuery({
    queryKey: officeKeys.attendance(),
    queryFn: ({ signal }) => officeApi.attendanceToday(signal),
    enabled,
    staleTime: 15_000,
  })
}

export function useOfficeMyProposals(enabled = true) {
  return useQuery({
    queryKey: officeKeys.proposals(),
    queryFn: ({ signal }) => officeApi.listMyProposals(signal),
    enabled,
    staleTime: 15_000,
  })
}

export function useOfficeTeamProposals(enabled = true) {
  return useQuery({
    queryKey: officeKeys.teamProposals(),
    queryFn: ({ signal }) => officeApi.listTeamProposals(signal),
    enabled,
    staleTime: 15_000,
  })
}

export function useOfficeStickyNotes(enabled = true) {
  return useQuery({
    queryKey: officeKeys.notes(),
    queryFn: ({ signal }) => officeApi.listStickyNotes(signal),
    enabled,
    staleTime: 15_000,
  })
}

export function useOfficeMembers(q = "", enabled = true) {
  return useQuery({
    queryKey: officeKeys.members(q),
    queryFn: ({ signal }) => officeApi.listMembers(q || undefined, signal),
    enabled,
    staleTime: 20_000,
  })
}

export function useOfficeMemberDetail(
  userId: string | null,
  enabled = true
) {
  return useQuery({
    queryKey: officeKeys.memberDetail(userId ?? ""),
    queryFn: ({ signal }) => officeApi.getMemberProfile(userId!, signal),
    enabled: enabled && Boolean(userId),
    staleTime: 10_000,
  })
}

export function useOfficeMemberNotes(userId: string | null, enabled = true) {
  return useQuery({
    queryKey: officeKeys.memberNotes(userId ?? ""),
    queryFn: ({ signal }) => officeApi.listMemberNotes(userId!, signal),
    enabled: enabled && Boolean(userId),
    staleTime: 10_000,
  })
}

export function useOfficeMeetings(enabled = true) {
  return useQuery({
    queryKey: officeKeys.meetings(),
    queryFn: ({ signal }) => officeApi.listMeetings(signal),
    enabled,
    staleTime: 30_000,
  })
}

export function useOfficeDocuments(enabled = true) {
  return useQuery({
    queryKey: officeKeys.documents(),
    queryFn: ({ signal }) => officeApi.listDocuments(signal),
    enabled,
    staleTime: 30_000,
  })
}

export function useOfficeLeaderboard(period?: string, enabled = true) {
  return useQuery({
    queryKey: officeKeys.leaderboard(period),
    queryFn: ({ signal }) => officeApi.leaderboard(period, signal),
    enabled,
    staleTime: 20_000,
  })
}

// ───────────── Mutation Hooks ─────────────

export function useCheckInAttendance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => officeApi.checkIn(),
    onSuccess: () => {
      invalidateOfficeScope(queryClient, "attendance")
    },
  })
}

export function useSubmitTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      officeApi.submitTask(id, note ?? ""),
    onSuccess: () => {
      invalidateOfficeScope(queryClient, "tasks")
    },
  })
}

export function useApproveTasks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => officeApi.approveTasks(ids),
    onSuccess: () => {
      invalidateOfficeScope(queryClient, "tasks")
      invalidateOfficeScope(queryClient, "leaderboard")
    },
  })
}

export function useReturnTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      officeApi.returnTask(id, reason),
    onSuccess: () => {
      invalidateOfficeScope(queryClient, "tasks")
    },
  })
}

export function useCreateAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateAssignmentInput) =>
      officeApi.createAssignment(body),
    onSuccess: () => {
      invalidateOfficeScope(queryClient, "tasks")
    },
  })
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAssignmentInput }) =>
      officeApi.updateAssignment(id, body),
    onSuccess: () => {
      invalidateOfficeScope(queryClient, "tasks")
    },
  })
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => officeApi.deleteAssignment(id),
    onSuccess: () => {
      invalidateOfficeScope(queryClient, "tasks")
    },
  })
}

export function useCreateProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => officeApi.createProposal(content),
    onSuccess: () => {
      invalidateOfficeScope(queryClient, "proposals")
    },
  })
}

export function useMarkProposalSeen() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => officeApi.markProposalSeen(id),
    onSuccess: () => {
      invalidateOfficeScope(queryClient, "proposals")
    },
  })
}

export function useReplyProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reply }: { id: string; reply: string }) =>
      officeApi.replyProposal(id, reply),
    onSuccess: () => {
      invalidateOfficeScope(queryClient, "proposals")
    },
  })
}

export function useCreateStickyNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateStickyNoteInput = {}) =>
      officeApi.createStickyNote(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: officeKeys.notes() })
    },
  })
}

export function useUpdateStickyNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateStickyNoteInput }) =>
      officeApi.updateStickyNote(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: officeKeys.notes() })
    },
  })
}

export function useDeleteStickyNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => officeApi.deleteStickyNote(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: officeKeys.notes() })
    },
  })
}

export function useUpdateMemberProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, joinDate }: { userId: string; joinDate: string }) =>
      officeApi.updateMemberProfile(userId, joinDate),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: officeKeys.memberDetail(vars.userId),
      })
      invalidateOfficeScope(queryClient, "members")
    },
  })
}

export function useCreateMemberNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, content }: { userId: string; content: string }) =>
      officeApi.createMemberNote(userId, content),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: officeKeys.memberDetail(vars.userId),
      })
      void queryClient.invalidateQueries({
        queryKey: officeKeys.memberNotes(vars.userId),
      })
    },
  })
}

export function useDeleteMemberNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, noteId }: { userId: string; noteId: string }) =>
      officeApi.deleteMemberNote(userId, noteId),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: officeKeys.memberDetail(vars.userId),
      })
      void queryClient.invalidateQueries({
        queryKey: officeKeys.memberNotes(vars.userId),
      })
    },
  })
}

export function useCreateMeeting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateMeetingInput) => officeApi.createMeeting(body),
    onSuccess: () => {
      invalidateOfficeScope(queryClient, "meetings")
    },
  })
}

export function useUpdateMeeting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMeetingInput }) =>
      officeApi.updateMeeting(id, body),
    onSuccess: () => {
      invalidateOfficeScope(queryClient, "meetings")
    },
  })
}

export function useDeleteMeeting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => officeApi.deleteMeeting(id),
    onSuccess: () => {
      invalidateOfficeScope(queryClient, "meetings")
    },
  })
}

export function useUploadOfficeDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, title }: { file: File; title?: string }) =>
      officeApi.uploadDocument(file, title),
    onSuccess: () => {
      invalidateOfficeScope(queryClient, "documents")
    },
  })
}

export function useDeleteOfficeDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => officeApi.deleteDocument(id),
    onSuccess: () => {
      invalidateOfficeScope(queryClient, "documents")
    },
  })
}
