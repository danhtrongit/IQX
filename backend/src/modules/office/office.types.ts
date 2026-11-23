export const OFFICE_WORLD_WIDTH = 2400;
export const OFFICE_WORLD_HEIGHT = 1560;
export const OFFICE_DESK_COLS = 6;
export const OFFICE_DESK_W = 190;
export const OFFICE_DESK_START_X = 150;
export const OFFICE_DESK_COL_STEP = 270;
export const OFFICE_DESK_START_Y = 720;
export const OFFICE_DESK_ROW_STEP = 330;

/** Computes dynamic office world height matching frontend `computeOfficeDimensions`. */
export function computeOfficeWorldHeight(staffCount: number): number {
  const safeCount = Math.max(0, Math.floor(staffCount));
  const rows = Math.max(2, Math.ceil(Math.max(1, safeCount) / OFFICE_DESK_COLS));
  return OFFICE_WORLD_HEIGHT + Math.max(0, rows - 2) * OFFICE_DESK_ROW_STEP;
}

export const OFFICE_DEFAULT_ON_TIME_CUTOFF = '08:30';
export const OFFICE_DEFAULT_LOCK_CUTOFF = '12:00';

export const OFFICE_MAX_STICKY_NOTES = 50;
export const OFFICE_MAX_DOC_SIZE_BYTES = 20 * 1024 * 1024;
export const OFFICE_DOC_TOKEN_TTL_SECONDS = 300;

export const OFFICE_TASK_KINDS = ['day', 'month', 'kpi'] as const;
export type OfficeTaskKind = (typeof OFFICE_TASK_KINDS)[number];

export const OFFICE_TASK_STATUSES = ['todo', 'pending', 'returned', 'done', 'expired'] as const;
export type OfficeTaskStatus = (typeof OFFICE_TASK_STATUSES)[number];

export const OFFICE_ATTENDANCE_STATES = ['ok', 'late'] as const;
export type OfficeAttendanceState = (typeof OFFICE_ATTENDANCE_STATES)[number];

export const OFFICE_ATTENDANCE_DISPLAY_STATES = ['ok', 'late', 'absent'] as const;
export type OfficeAttendanceDisplayState = (typeof OFFICE_ATTENDANCE_DISPLAY_STATES)[number];

export const OFFICE_PROPOSAL_STATUSES = ['sent', 'seen', 'replied'] as const;
export type OfficeProposalStatus = (typeof OFFICE_PROPOSAL_STATUSES)[number];

export const OFFICE_STICKY_COLORS = ['y', 'p', 'b', 'g'] as const;
export type OfficeStickyColor = (typeof OFFICE_STICKY_COLORS)[number];

export const OFFICE_ROLES = ['boss', 'staff'] as const;
export type OfficeRole = (typeof OFFICE_ROLES)[number];

export const OFFICE_FACINGS = ['up', 'down', 'left', 'right'] as const;
export type OfficeFacing = (typeof OFFICE_FACINGS)[number];

export const OFFICE_SYNC_SCOPES = [
  'tasks',
  'attendance',
  'proposals',
  'meetings',
  'documents',
  'members',
  'leaderboard',
  'notifications',
] as const;
export type OfficeSyncScope = (typeof OFFICE_SYNC_SCOPES)[number];

export const OFFICE_ALLOWED_DOC_EXTS = ['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg'] as const;
export type OfficeAllowedDocExt = (typeof OFFICE_ALLOWED_DOC_EXTS)[number];

export const OFFICE_STAFF_ACCENT_PALETTE = [
  '#1D6FE8',
  '#C2417D',
  '#0E9F6E',
  '#7C3AED',
  '#0E8FA8',
  '#E07B16',
  '#2F9E44',
  '#C53030',
  '#4F6BD6',
  '#B83280',
  '#2C7A7B',
  '#D97706',
] as const;

export const OFFICE_BOSS_ACCENT_COLOR = '#B7791F';

export interface OfficeTeamRow {
  readonly id: string;
  readonly bossUserId: string;
  readonly bossName: string;
  readonly name: string;
  readonly checkinOnTimeCutoff: string;
  readonly checkinLockCutoff: string;
}

export interface OfficeMemberRow {
  readonly id: string;
  readonly teamId: string;
  readonly userId: string;
  readonly role: OfficeRole;
  readonly displayName: string;
  readonly email: string;
  readonly avatar: string | null;
  readonly avatarColor: string | null;
  readonly deskIndex: number | null;
  readonly joinDate: string;
  readonly accentColor: string;
  readonly active: boolean;
}

export interface OfficeAccessContext {
  readonly member: true;
  readonly role: OfficeRole;
  readonly team: OfficeTeamRow;
  readonly self: OfficeMemberRow;
  readonly members: readonly OfficeMemberRow[];
}

export interface OfficeNoAccessContext {
  readonly member: false;
  readonly role: 'none';
  readonly team: null;
  readonly self: null;
  readonly members: readonly [];
}

export type OfficeResolvedAccess = OfficeAccessContext | OfficeNoAccessContext;

export interface OfficePeer {
  readonly peerId: string;
  readonly userId: string;
  readonly role: OfficeRole;
  readonly name: string;
  readonly avatar: string | null;
  readonly avatarColor: string | null;
  readonly accentColor: string;
  readonly deskIndex: number | null;
  x: number;
  y: number;
  facing: OfficeFacing;
  moving: boolean;
}

export const OFFICE_TASK_KIND_LABEL: Record<OfficeTaskKind, string> = {
  day: 'ngày',
  month: 'tháng',
  kpi: 'KPI',
};
