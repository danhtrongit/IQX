import { z } from 'zod';

import {
  adminUserCreateSchema,
  adminUserUpdateSchema,
  userUpdateSchema,
} from '../auth/auth.schemas.js';
import { USER_ROLES, USER_STATUSES } from '../auth/auth.types.js';

export { adminUserCreateSchema, adminUserUpdateSchema, userUpdateSchema };

export const userIdSchema = z.string().uuid();
export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(320).optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  sort_by: z
    .enum(['created_at', 'updated_at', 'email', 'full_name', 'role', 'status', 'last_login_at'])
    .default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export const bulkUpdateSchema = z
  .object({
    user_ids: z.array(z.string().uuid()).min(1).max(500),
    op: z.enum(['set_role', 'set_status', 'soft_delete']),
    value: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.op !== 'soft_delete' && !value.value) {
      context.addIssue({ code: 'custom', path: ['value'], message: '`value` is required' });
    }
    if (
      value.op === 'set_role' &&
      value.value &&
      !USER_ROLES.includes(value.value as (typeof USER_ROLES)[number])
    ) {
      context.addIssue({ code: 'custom', path: ['value'], message: 'invalid role' });
    }
    if (
      value.op === 'set_status' &&
      value.value &&
      !USER_STATUSES.includes(value.value as (typeof USER_STATUSES)[number])
    ) {
      context.addIssue({ code: 'custom', path: ['value'], message: 'invalid status' });
    }
  });

export const loginHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
});

export const userExportQuerySchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  search: z.string().trim().max(320).optional(),
  last_login_from: z.string().datetime({ offset: true }).optional(),
  last_login_to: z.string().datetime({ offset: true }).optional(),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type BulkUpdateInput = z.infer<typeof bulkUpdateSchema>;
export type LoginHistoryQuery = z.infer<typeof loginHistoryQuerySchema>;
export type UserExportQuery = z.infer<typeof userExportQuerySchema>;
