import { z } from 'zod';

import { validateCombination } from '../quant/conditions.js';

export const alertSideSchema = z.enum(['buy', 'sell']);
export const alertKeySchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_]+$/);
export const alertRuleIdSchema = z.string().uuid();

export const conditionSchema = z.object({
  indicator: z.string().min(1).max(64),
  op: z.string().min(1).max(24),
  value: z.union([z.number().finite(), z.string().min(1).max(64), z.null()]).optional(),
  join: z.enum(['AND', 'OR']).nullable().optional(),
});

export const combinationSchema = z
  .object({
    logic: z.enum(['AND', 'OR']).default('AND'),
    conditions: z.array(conditionSchema).min(1).max(20),
  })
  .superRefine((combination, context) => {
    try {
      validateCombination(combination);
    } catch (error) {
      context.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Tổ hợp điều kiện không hợp lệ',
      });
    }
  });

export const userAlertRuleCreateSchema = z
  .object({
    signal_key: alertKeySchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    side: alertSideSchema.optional(),
    combination: combinationSchema.optional(),
    is_enabled: z.boolean().default(true),
  })
  .superRefine((body, context) => {
    if (body.signal_key) return;
    if (!body.name)
      context.addIssue({
        code: 'custom',
        path: ['name'],
        message: 'Cần name cho tín hiệu tùy chỉnh',
      });
    if (!body.side)
      context.addIssue({
        code: 'custom',
        path: ['side'],
        message: 'Cần side cho tín hiệu tùy chỉnh',
      });
    if (!body.combination)
      context.addIssue({
        code: 'custom',
        path: ['combination'],
        message: 'Cần combination cho tín hiệu tùy chỉnh',
      });
  });

export const userAlertRuleUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    combination: combinationSchema.optional(),
    is_enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Cần ít nhất một trường để cập nhật');

export const alertSignalCreateSchema = z.object({
  key: alertKeySchema,
  side: alertSideSchema,
  ta_name: z.string().trim().min(1).max(60),
  message_title: z.string().trim().min(1).max(200),
  combination: combinationSchema,
  is_enabled: z.boolean().default(true),
  sort_order: z.number().int().min(-10_000).max(10_000).default(0),
});

export const alertSignalUpdateSchema = alertSignalCreateSchema.omit({ key: true });
export const alertSeedQuerySchema = z.object({
  overwrite: z
    .preprocess((value) => value === 'true' || value === true, z.boolean())
    .default(false),
});

export type UserAlertRuleCreateInput = z.infer<typeof userAlertRuleCreateSchema>;
export type UserAlertRuleUpdateInput = z.infer<typeof userAlertRuleUpdateSchema>;
export type AlertSignalCreateInput = z.infer<typeof alertSignalCreateSchema>;
export type AlertSignalUpdateInput = z.infer<typeof alertSignalUpdateSchema>;
