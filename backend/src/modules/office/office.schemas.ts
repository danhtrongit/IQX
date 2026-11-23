import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import {
  OFFICE_ALLOWED_DOC_EXTS,
  OFFICE_APPROVE_SKIP_CODES,
  OFFICE_ATTENDANCE_DISPLAY_STATES,
  OFFICE_ATTENDANCE_STATES,
  OFFICE_PROPOSAL_STATUSES,
  OFFICE_ROLES,
  OFFICE_STICKY_COLORS,
  OFFICE_TASK_KINDS,
  OFFICE_TASK_STATUSES,
} from './office.types.js';

export const officeOpenApi = (schema: z.ZodType): SchemaObject =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

// ───────────── common params / queries ─────────────

export const officeUuidParamSchema = z.uuid();

export const officePeriodQuerySchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Kỳ tháng phải có định dạng YYYY-MM')
    .optional(),
});
export type OfficePeriodQuery = z.infer<typeof officePeriodQuerySchema>;

export const officeMembersQuerySchema = z.object({
  q: z.string().max(100).default(''),
});
export type OfficeMembersQuery = z.infer<typeof officeMembersQuerySchema>;

export const officeDownloadQuerySchema = z.object({
  token: z.string().min(1).max(2048),
});
export type OfficeDownloadQuery = z.infer<typeof officeDownloadQuerySchema>;

// ───────────── request bodies ─────────────

const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có định dạng YYYY-MM-DD');

export const createAssignmentBodySchema = z.strictObject({
  kind: z.enum(OFFICE_TASK_KINDS),
  title: z.string().trim().min(1, 'Nhập tên nhiệm vụ').max(120, 'Tên nhiệm vụ tối đa 120 ký tự'),
  points: z.coerce
    .number()
    .int('Điểm phải là số nguyên')
    .min(1, 'Nhập điểm cho nhiệm vụ')
    .max(1000, 'Điểm tối đa 1.000'),
  repeatDaily: z.boolean().optional(),
  dueDate: isoDateString.nullable().optional(),
  userIds: z.array(z.uuid()).min(1, 'Chọn người nhận').max(200),
});
export type CreateAssignmentBody = z.infer<typeof createAssignmentBodySchema>;

export const updateAssignmentBodySchema = z
  .strictObject({
    title: z
      .string()
      .trim()
      .min(1, 'Nhập tên nhiệm vụ')
      .max(120, 'Tên nhiệm vụ tối đa 120 ký tự')
      .optional(),
    points: z.coerce.number().int().min(1).max(1000).optional(),
    dueDate: isoDateString.nullable().optional(),
    repeatDaily: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.title !== undefined ||
      body.points !== undefined ||
      body.dueDate !== undefined ||
      body.repeatDaily !== undefined,
    { message: 'Cần ít nhất một trường để cập nhật' },
  );
export type UpdateAssignmentBody = z.infer<typeof updateAssignmentBodySchema>;

export const submitTaskBodySchema = z.strictObject({
  note: z.string().max(500, 'Ghi chú tối đa 500 ký tự').optional().default(''),
});
export type SubmitTaskBody = z.infer<typeof submitTaskBodySchema>;

export const approveTasksBodySchema = z.strictObject({
  ids: z.array(z.uuid()).min(1, 'Chọn ít nhất một nhiệm vụ').max(100),
});
export type ApproveTasksBody = z.infer<typeof approveTasksBodySchema>;

export const returnTaskBodySchema = z.strictObject({
  reason: z.string().trim().min(1, 'Ghi lý do trả lại').max(300, 'Lý do trả lại tối đa 300 ký tự'),
});
export type ReturnTaskBody = z.infer<typeof returnTaskBodySchema>;

export const createProposalBodySchema = z.strictObject({
  content: z
    .string()
    .trim()
    .min(1, 'Nhập nội dung đề xuất')
    .max(1000, 'Đề xuất tối đa 1.000 ký tự'),
});
export type CreateProposalBody = z.infer<typeof createProposalBodySchema>;

export const replyProposalBodySchema = z.strictObject({
  reply: z
    .string()
    .trim()
    .min(1, 'Nhập nội dung trả lời')
    .max(1000, 'Câu trả lời tối đa 1.000 ký tự'),
});
export type ReplyProposalBody = z.infer<typeof replyProposalBodySchema>;

export const createStickyNoteBodySchema = z.strictObject({
  color: z.enum(OFFICE_STICKY_COLORS).default('y'),
  content: z.string().max(300, 'Ghi chú tối đa 300 ký tự').default(''),
});
export type CreateStickyNoteBody = z.infer<typeof createStickyNoteBodySchema>;

export const updateStickyNoteBodySchema = z
  .strictObject({
    color: z.enum(OFFICE_STICKY_COLORS).optional(),
    content: z.string().max(300, 'Ghi chú tối đa 300 ký tự').optional(),
  })
  .refine((body) => body.color !== undefined || body.content !== undefined, {
    message: 'Cần color hoặc content để cập nhật',
  });
export type UpdateStickyNoteBody = z.infer<typeof updateStickyNoteBodySchema>;

export const updateMemberProfileBodySchema = z.strictObject({
  joinDate: isoDateString,
});
export type UpdateMemberProfileBody = z.infer<typeof updateMemberProfileBodySchema>;

export const createMemberNoteBodySchema = z.strictObject({
  content: z
    .string()
    .trim()
    .min(1, 'Nhập nội dung ghi chú')
    .max(1000, 'Ghi chú tối đa 1.000 ký tự'),
});
export type CreateMemberNoteBody = z.infer<typeof createMemberNoteBodySchema>;

const httpUrlSchema = z
  .string()
  .trim()
  .min(1, 'Nhập đường dẫn cuộc họp')
  .max(1000)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'Đường dẫn cuộc họp phải bắt đầu bằng https:// hoặc http://');

export const createMeetingBodySchema = z.strictObject({
  title: z.string().trim().min(1, 'Nhập tên cuộc họp').max(120, 'Tên cuộc họp tối đa 120 ký tự'),
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.coerce.number().int().min(5).max(480).default(60),
  platform: z.string().trim().min(1).max(60).default('Google Meet'),
  meetingUrl: httpUrlSchema,
  agenda: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  recurrenceWeekly: z.boolean().default(false),
});
export type CreateMeetingBody = z.infer<typeof createMeetingBodySchema>;

export const updateMeetingBodySchema = z
  .strictObject({
    title: z.string().trim().min(1).max(120).optional(),
    startsAt: z.iso.datetime({ offset: true }).optional(),
    durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
    platform: z.string().trim().min(1).max(60).optional(),
    meetingUrl: httpUrlSchema.optional(),
    agenda: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    recurrenceWeekly: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.title !== undefined ||
      body.startsAt !== undefined ||
      body.durationMinutes !== undefined ||
      body.platform !== undefined ||
      body.meetingUrl !== undefined ||
      body.agenda !== undefined ||
      body.recurrenceWeekly !== undefined,
    { message: 'Cần ít nhất một trường để cập nhật cuộc họp' },
  );
export type UpdateMeetingBody = z.infer<typeof updateMeetingBodySchema>;

// ───────────── response schemas ─────────────

const teamSummarySchema = z.object({
  id: z.string(),
  bossUserId: z.string(),
  bossName: z.string(),
  name: z.string(),
  checkinOnTimeCutoff: z.string(),
  checkinLockCutoff: z.string(),
});

const memberSummarySchema = z.object({
  id: z.string(),
  userId: z.string(),
  role: z.enum(OFFICE_ROLES),
  displayName: z.string(),
  avatar: z.string().nullable(),
  avatarColor: z.string().nullable(),
  deskIndex: z.number().int().nullable(),
  accentColor: z.string(),
  online: z.boolean(),
});

const bossHudSchema = z.object({
  kind: z.literal('boss'),
  pendingCount: z.number().int(),
  newProposalsCount: z.number().int(),
  todayDoneCount: z.number().int(),
  todayTotalCount: z.number().int(),
  staffCount: z.number().int(),
  latestStaffName: z.string().nullable(),
});

const staffHudSchema = z.object({
  kind: z.literal('staff'),
  returnedCount: z.number().int(),
  todayDoneCount: z.number().int(),
  todayTotalCount: z.number().int(),
  pendingCount: z.number().int(),
  monthlyPoints: z.number().int(),
  myAttendanceStatus: z.enum(OFFICE_ATTENDANCE_DISPLAY_STATES),
  myCheckedInAt: z.string().nullable(),
});

export const officeMeResponseSchema = z.object({
  member: z.boolean(),
  role: z.enum(['boss', 'staff', 'none']),
  serverTime: z.string(),
  todayDate: z.string(),
  periodMonth: z.string(),
  isWorkday: z.boolean(),
  isAttendanceLocked: z.boolean(),
  cutoffs: z.object({ onTime: z.string(), lock: z.string() }),
  team: teamSummarySchema.nullable(),
  self: memberSummarySchema.nullable(),
  members: z.array(memberSummarySchema),
  onlineUserIds: z.array(z.string()),
  onlineCount: z.number().int(),
  hud: z.union([bossHudSchema, staffHudSchema]).nullable(),
});

export const officeTaskItemSchema = z.object({
  id: z.string(),
  assignmentId: z.string(),
  userId: z.string(),
  kind: z.enum(OFFICE_TASK_KINDS),
  title: z.string(),
  points: z.number().int(),
  pointsSnapshot: z.number().int().nullable(),
  repeatDaily: z.boolean(),
  taskDate: z.string(),
  dueDate: z.string().nullable(),
  periodMonth: z.string(),
  status: z.enum(OFFICE_TASK_STATUSES),
  overdue: z.boolean(),
  submitNote: z.string().nullable(),
  submittedAt: z.string().nullable(),
  returnReason: z.string().nullable(),
  returnedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const officeMyTasksResponseSchema = z.object({
  todayDate: z.string(),
  periodMonth: z.string(),
  monthlyPoints: z.number().int(),
  day: z.array(officeTaskItemSchema),
  month: z.array(officeTaskItemSchema),
  kpi: z.array(officeTaskItemSchema),
});

export const officeAssignmentItemSchema = z.object({
  id: z.string(),
  kind: z.enum(OFFICE_TASK_KINDS),
  title: z.string(),
  points: z.number().int(),
  repeatDaily: z.boolean(),
  dueDate: z.string().nullable(),
  periodMonth: z.string(),
  targetUserIds: z.array(z.string()),
  targetCount: z.number().int(),
  isAllTeam: z.boolean(),
  doneCount: z.number().int(),
  activeCount: z.number().int(),
  createdAt: z.string(),
});

export const officeAssignmentsListResponseSchema = z.object({
  items: z.array(officeAssignmentItemSchema),
});

export const officeDeleteAssignmentResponseSchema = z.object({
  ok: z.literal(true),
  deletedTaskCount: z.number().int(),
  retainedDoneCount: z.number().int(),
});

export const officeReviewItemSchema = z.object({
  id: z.string(),
  assignmentId: z.string(),
  userId: z.string(),
  staffName: z.string(),
  staffAccentColor: z.string(),
  kind: z.enum(OFFICE_TASK_KINDS),
  title: z.string(),
  points: z.number().int(),
  taskDate: z.string(),
  dueDate: z.string().nullable(),
  submitNote: z.string().nullable(),
  submittedAt: z.string(),
});

export const officeReviewListResponseSchema = z.object({
  items: z.array(officeReviewItemSchema),
});

export const officeApproveTasksResponseSchema = z.object({
  approved: z.array(
    z.object({
      taskId: z.string(),
      userId: z.string(),
      staffName: z.string(),
      title: z.string(),
      points: z.number().int(),
      totalMonthlyPoints: z.number().int(),
    }),
  ),
  skipped: z
    .array(
      z.object({
        taskId: z.string(),
        code: z.enum(OFFICE_APPROVE_SKIP_CODES),
        reason: z.string(),
      }),
    )
    .optional(),
});

export const officeProgressItemSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  accentColor: z.string(),
  dayDone: z.number().int(),
  dayTotal: z.number().int(),
  monthDone: z.number().int(),
  monthTotal: z.number().int(),
  kpiDone: z.number().int(),
  kpiTotal: z.number().int(),
  pendingCount: z.number().int(),
  points: z.number().int(),
});

export const officeProgressResponseSchema = z.object({
  todayDate: z.string(),
  periodMonth: z.string(),
  items: z.array(officeProgressItemSchema),
});

export const officeAttendanceCheckInResponseSchema = z.object({
  workDate: z.string(),
  status: z.enum(OFFICE_ATTENDANCE_STATES),
  checkedInAt: z.string(),
  timeLabel: z.string(),
});

const attendanceEntrySchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  accentColor: z.string(),
  status: z.enum(OFFICE_ATTENDANCE_DISPLAY_STATES),
  checkedInAt: z.string().nullable(),
  timeLabel: z.string().nullable(),
  isSelf: z.boolean(),
});

export const officeAttendanceTodayResponseSchema = z.object({
  workDate: z.string(),
  isWorkday: z.boolean(),
  isLocked: z.boolean(),
  cutoffs: z.object({ onTime: z.string(), lock: z.string() }),
  counts: z.object({
    ok: z.number().int(),
    late: z.number().int(),
    absent: z.number().int(),
    total: z.number().int(),
  }),
  myStatus: z.enum(OFFICE_ATTENDANCE_DISPLAY_STATES).nullable(),
  myCheckedInAt: z.string().nullable(),
  showDotsForAll: z.boolean(),
  roster: z.object({
    ok: z.array(attendanceEntrySchema),
    late: z.array(attendanceEntrySchema),
    absent: z.array(attendanceEntrySchema),
  }),
});

export const officeLeaderboardResponseSchema = z.object({
  periodMonth: z.string(),
  monthNumber: z.number().int(),
  nextResetLabel: z.string(),
  nextResetDate: z.string(),
  teamName: z.string(),
  bossName: z.string(),
  top3: z.array(
    z.object({
      rank: z.number().int(),
      userId: z.string(),
      displayName: z.string(),
      accentColor: z.string(),
      points: z.number().int(),
      reachedAt: z.string(),
    }),
  ),
  myRank: z
    .object({
      rank: z.number().int().nullable(),
      points: z.number().int(),
    })
    .nullable(),
  totalRanked: z.number().int(),
});

export const officeProposalItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  staffName: z.string(),
  staffAccentColor: z.string(),
  content: z.string(),
  status: z.enum(OFFICE_PROPOSAL_STATUSES),
  seenAt: z.string().nullable(),
  reply: z.string().nullable(),
  repliedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const officeProposalsListResponseSchema = z.object({
  items: z.array(officeProposalItemSchema),
  unreadCount: z.number().int(),
});

export const officeStickyNoteItemSchema = z.object({
  id: z.string(),
  color: z.enum(OFFICE_STICKY_COLORS),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const officeStickyNotesListResponseSchema = z.object({
  items: z.array(officeStickyNoteItemSchema),
  maxNotes: z.number().int(),
});

export const officeBossNoteItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.string(),
});

export const officeTenureSchema = z.object({
  years: z.number().int(),
  months: z.number().int(),
  days: z.number().int(),
  label: z.string(),
});

export const officeMemberListItemSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  accentColor: z.string(),
  joinDate: z.string(),
  tenure: officeTenureSchema,
});

export const officeMembersListResponseSchema = z.object({
  todayDate: z.string(),
  items: z.array(officeMemberListItemSchema),
});

export const officeMemberProfileResponseSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  email: z.string(),
  accentColor: z.string(),
  bossName: z.string(),
  joinDate: z.string(),
  todayDate: z.string(),
  tenure: officeTenureSchema,
  stats: z.object({
    monthlyPoints: z.number().int(),
    tasksDone: z.number().int(),
    tasksTotal: z.number().int(),
    pendingCount: z.number().int(),
    attendanceOk: z.number().int(),
    attendanceLate: z.number().int(),
    attendanceAbsent: z.number().int(),
  }),
  notes: z.array(officeBossNoteItemSchema),
});

export const officeMemberNotesListResponseSchema = z.object({
  items: z.array(officeBossNoteItemSchema),
});

export const officeMeetingItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  startsAt: z.string(),
  durationMinutes: z.number().int(),
  platform: z.string(),
  meetingUrl: z.string(),
  agenda: z.array(z.string()),
  recurrenceWeekly: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const officeMeetingsListResponseSchema = z.object({
  todayDate: z.string(),
  today: z.array(officeMeetingItemSchema),
  upcoming: z.array(officeMeetingItemSchema),
  nextWallMeeting: officeMeetingItemSchema.nullable(),
});

export const officeDocumentItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  fileName: z.string(),
  fileExt: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  downloadUrl: z.string(),
  createdAt: z.string(),
});

export const officeDocumentsListResponseSchema = z.object({
  items: z.array(officeDocumentItemSchema),
  maxSizeBytes: z.number().int(),
  allowedExts: z.array(z.enum(OFFICE_ALLOWED_DOC_EXTS)),
});

export const officeOkResponseSchema = z.object({
  ok: z.literal(true),
});

// Pre-computed OpenAPI 3.0 schema objects
export const OFFICE_ME_SCHEMA = officeOpenApi(officeMeResponseSchema);
export const OFFICE_MY_TASKS_SCHEMA = officeOpenApi(officeMyTasksResponseSchema);
export const OFFICE_TASK_SCHEMA = officeOpenApi(officeTaskItemSchema);
export const OFFICE_ASSIGNMENT_SCHEMA = officeOpenApi(officeAssignmentItemSchema);
export const OFFICE_ASSIGNMENTS_LIST_SCHEMA = officeOpenApi(officeAssignmentsListResponseSchema);
export const OFFICE_DELETE_ASSIGNMENT_SCHEMA = officeOpenApi(officeDeleteAssignmentResponseSchema);
export const OFFICE_REVIEW_LIST_SCHEMA = officeOpenApi(officeReviewListResponseSchema);
export const OFFICE_APPROVE_TASKS_SCHEMA = officeOpenApi(officeApproveTasksResponseSchema);
export const OFFICE_PROGRESS_SCHEMA = officeOpenApi(officeProgressResponseSchema);
export const OFFICE_ATTENDANCE_CHECKIN_SCHEMA = officeOpenApi(
  officeAttendanceCheckInResponseSchema,
);
export const OFFICE_ATTENDANCE_TODAY_SCHEMA = officeOpenApi(officeAttendanceTodayResponseSchema);
export const OFFICE_LEADERBOARD_SCHEMA = officeOpenApi(officeLeaderboardResponseSchema);
export const OFFICE_PROPOSAL_SCHEMA = officeOpenApi(officeProposalItemSchema);
export const OFFICE_PROPOSALS_LIST_SCHEMA = officeOpenApi(officeProposalsListResponseSchema);
export const OFFICE_STICKY_NOTE_SCHEMA = officeOpenApi(officeStickyNoteItemSchema);
export const OFFICE_STICKY_NOTES_LIST_SCHEMA = officeOpenApi(officeStickyNotesListResponseSchema);
export const OFFICE_MEMBERS_LIST_SCHEMA = officeOpenApi(officeMembersListResponseSchema);
export const OFFICE_MEMBER_PROFILE_SCHEMA = officeOpenApi(officeMemberProfileResponseSchema);
export const OFFICE_MEMBER_NOTE_SCHEMA = officeOpenApi(officeBossNoteItemSchema);
export const OFFICE_MEMBER_NOTES_LIST_SCHEMA = officeOpenApi(officeMemberNotesListResponseSchema);
export const OFFICE_MEETING_SCHEMA = officeOpenApi(officeMeetingItemSchema);
export const OFFICE_MEETINGS_LIST_SCHEMA = officeOpenApi(officeMeetingsListResponseSchema);
export const OFFICE_DOCUMENT_SCHEMA = officeOpenApi(officeDocumentItemSchema);
export const OFFICE_DOCUMENTS_LIST_SCHEMA = officeOpenApi(officeDocumentsListResponseSchema);
export const OFFICE_OK_SCHEMA = officeOpenApi(officeOkResponseSchema);
