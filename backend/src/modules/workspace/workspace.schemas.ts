import { z } from 'zod';

import { MASCOT_IDS } from '../shop/shop.catalog.js';

const manualAccountSchema = z.object({
  exists: z.boolean(),
  account_id: z.string().nullable(),
  initial_cash_vnd: z.number().int().nullable(),
  cash_available_vnd: z.number().int().nullable(),
  total_cash_vnd: z.number().int().nullable(),
});

const botSchema = z.object({
  exists: z.boolean(),
  account_id: z.string().nullable(),
  instance_id: z.string().nullable(),
  cash_vnd: z.number().int().nullable(),
});

const mascotSchema = z.object({
  active_mascot_id: z.enum(MASCOT_IDS),
  revision: z.number().int(),
  provisioned: z.boolean(),
});

const walletSchema = z.object({
  balance: z.number().int(),
  provisioned: z.boolean(),
});

export const workspaceStateSchema = z.object({
  manual_account: manualAccountSchema,
  bot: botSchema,
  mascot: mascotSchema,
  wallet: walletSchema,
});

export const workspaceEnsureSchema = z.object({
  /** What this call created; all false on a repeated call. */
  created: z.object({
    manual_account: z.boolean(),
    bot: z.boolean(),
    mascot_profile: z.boolean(),
    wallet: z.boolean(),
  }),
  state: workspaceStateSchema,
});

export type WorkspaceState = z.output<typeof workspaceStateSchema>;
export type WorkspaceEnsureResult = z.output<typeof workspaceEnsureSchema>;
