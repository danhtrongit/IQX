import { z } from 'zod';

const sessionDate = z.iso.date();
const ticker = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9._-]+$/)
  .transform((value) => value.toUpperCase());
const strategySource = z.enum(['iqx', 'user']);
const strategyId = z.string().trim().min(1).max(64);

/** PUT /bot/schedule/next (§6.3, §10.4): `user` follows the latest version, `iqx` is pinned. */
export const putNextSchema = z.strictObject({
  source: strategySource,
  id: strategyId,
  version: z.number().int().min(1).optional(),
  expected_next_session: sessionDate,
  confirm_due_positions: z.array(ticker).max(200).optional(),
});
export type PutNextInput = z.infer<typeof putNextSchema>;

/** POST /bot/schedule/next/keep-last (§5.3). */
export const keepLastSchema = z.strictObject({
  expected_next_session: sessionDate,
  confirm_due_positions: z.array(ticker).max(200).optional(),
});
export type KeepLastInput = z.infer<typeof keepLastSchema>;

/** GET /bot/schedule/next/impact (§6.5). */
export const impactQuerySchema = z.strictObject({
  source: strategySource,
  id: strategyId,
  version: z.coerce.number().int().min(1).optional(),
});
export type ImpactQuery = z.infer<typeof impactQuerySchema>;

// Response schemas (documentation; the service builds these shapes).
const usage = z.object({ last: z.boolean(), next: z.boolean() });

const entry = z.object({
  session_date: sessionDate,
  source: strategySource.nullable(),
  id: z.string().nullable(),
  name: z.string().nullable(),
  version: z.number().int().nullable(),
  /** `bản dd/mm HH:mm` (user) or `v{n}` (IQX). */
  version_label: z.string().nullable(),
  /** IQX template hidden by an admin ("IQX đã ngừng cung cấp"). */
  hidden: z.boolean(),
  deleted: z.boolean(),
  max_holding: z.number().int(),
  universe_label: z.string().nullable(),
  content: z.record(z.string(), z.unknown()).nullable(),
});

export const scheduleViewSchema = z.object({
  last: entry.nullable(),
  next: entry.extend({ follow_latest: z.boolean(), cutoff_at: z.iso.datetime() }),
  iqx_update: z
    .object({ latest_version: z.number().int(), content: z.record(z.string(), z.unknown()) })
    .nullable(),
});

export const dueImpactSchema = z.object({
  next_session: sessionDate,
  n_current: z.number().int(),
  n_new: z.number().int(),
  positions: z.array(
    z.object({ symbol: z.string(), counted: z.number().int(), sell_session: sessionDate }),
  ),
});

export const strategyOptionsSchema = z.object({
  iqx: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      version: z.number().int(),
      universe_label: z.string(),
      max_holding: z.number().int(),
      hidden: z.boolean(),
      on_bot: usage,
    }),
  ),
  mine: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      latest_version: z.number().int(),
      latest_saved_at: z.iso.datetime().nullable(),
      on_bot: usage,
    }),
  ),
});
