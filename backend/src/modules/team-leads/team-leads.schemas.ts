import { z } from 'zod';

/** Offer durations a policy may grant (admin spec v1.1 §3.1, ck_team_lead_policies_offer_days). */
export const TEAM_LEAD_OFFER_DAYS = [7, 30, 90, 180, 365] as const;
export const TEAM_LEAD_STATUSES = ['active', 'revoked'] as const;

export const teamLeadIdSchema = z.string().uuid();
export const memberIdSchema = z.string().uuid();

/** Every §3.2 / §3.4 mutation requires a reason (confirmation level Vừa or Cao). */
const reasonSchema = z.string().trim().min(1).max(1000);

/**
 * §3.1 policy shape: integer commission 0..100, and offer_days only (and always) for a
 * `days` offer.
 */
const policyFields = {
  commission_pct: z.number().int().min(0).max(100),
  offer_type: z.enum(['none', 'days', 'lifetime']),
  offer_days: z
    .union([z.literal(7), z.literal(30), z.literal(90), z.literal(180), z.literal(365)])
    .nullable()
    .optional(),
  reason: reasonSchema,
};

function refinePolicy(
  value: { offer_type: 'none' | 'days' | 'lifetime'; offer_days?: number | null },
  context: z.RefinementCtx,
): void {
  const hasDays = value.offer_days !== undefined && value.offer_days !== null;
  if (value.offer_type === 'days' && !hasDays) {
    context.addIssue({
      code: 'custom',
      path: ['offer_days'],
      message: '`offer_days` is required for a days offer',
    });
  }
  if (value.offer_type !== 'days' && hasDays) {
    context.addIssue({
      code: 'custom',
      path: ['offer_days'],
      message: '`offer_days` is only allowed for a days offer',
    });
  }
}

export const teamLeadPolicySchema = z.object(policyFields).strict().superRefine(refinePolicy);

export const teamLeadAppointSchema = z
  .object({ user_id: z.string().uuid(), ...policyFields })
  .strict()
  .superRefine(refinePolicy);

export const teamLeadRevokeSchema = z.object({ reason: reasonSchema }).strict();

export const teamLeadMemberAddSchema = z
  .object({ user_id: z.string().uuid(), reason: reasonSchema })
  .strict();

export const teamLeadMemberRemoveSchema = z.object({ reason: reasonSchema }).strict();

export const teamLeadListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(TEAM_LEAD_STATUSES).optional(),
  search: z.string().trim().max(320).optional(),
});

export const teamLeadMembersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(320).optional(),
});

/**
 * Lookup for the appoint and add-member dialogs: `q` is a username or an email. With
 * `lead_id`, add-member eligibility is judged against that group.
 */
export const teamLeadLookupQuerySchema = z.object({
  q: z.string().trim().min(1).max(320),
  lead_id: z.string().uuid().optional(),
});

export type TeamLeadPolicyInput = z.infer<typeof teamLeadPolicySchema>;
export type TeamLeadAppointInput = z.infer<typeof teamLeadAppointSchema>;
export type TeamLeadRevokeInput = z.infer<typeof teamLeadRevokeSchema>;
export type TeamLeadMemberAddInput = z.infer<typeof teamLeadMemberAddSchema>;
export type TeamLeadMemberRemoveInput = z.infer<typeof teamLeadMemberRemoveSchema>;
export type TeamLeadListQuery = z.infer<typeof teamLeadListQuerySchema>;
export type TeamLeadMembersQuery = z.infer<typeof teamLeadMembersQuerySchema>;
export type TeamLeadLookupQuery = z.infer<typeof teamLeadLookupQuerySchema>;
