import { z } from 'zod';

/** Admin spec v1.1 §4.3 `team/*` request schemas. The group is always the caller's own. */

export const teamMemberIdSchema = z.string().uuid();

/** Roles a member can have: a member is never an admin or a team lead. */
export const TEAM_MEMBER_ROLES = ['user', 'premium'] as const;

export const TEAM_USER_SORTS = [
  'username',
  'role',
  'demo_pnl_pct',
  'bot_pnl_pct',
  'academy_progress',
  'created_at',
] as const;

/**
 * The 4 dashboard shortcuts (§5.1.2): new in the last 7 days, email not verified, on a trial
 * now, and no sign-in for 14 days (or never).
 */
export const TEAM_USER_SEGMENTS = [
  'new_7d',
  'email_unverified',
  'trialing',
  'inactive_14d',
] as const;

export const teamUserListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(320).optional(),
  role: z.enum(TEAM_MEMBER_ROLES).optional(),
  segment: z.enum(TEAM_USER_SEGMENTS).optional(),
  sort_by: z.enum(TEAM_USER_SORTS).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export const teamRevenueQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const teamLoginHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
});

export const teamMemberRemoveSchema = z
  .object({ reason: z.string().trim().min(1).max(1000) })
  .strict();

export type TeamUserListQuery = z.infer<typeof teamUserListQuerySchema>;
export type TeamRevenueQuery = z.infer<typeof teamRevenueQuerySchema>;
export type TeamLoginHistoryQuery = z.infer<typeof teamLoginHistoryQuerySchema>;
export type TeamMemberRemoveInput = z.infer<typeof teamMemberRemoveSchema>;
