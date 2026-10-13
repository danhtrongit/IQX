// Zod schemas of the three research AI outputs. Envelopes only check the top-level shape (a
// failure there rejects the whole response); items are validated one by one by the service so
// a single bad claim/match never fails a report.
import { z } from 'zod';
import { CLAIM_TYPES } from './research.types.js';

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value ?? '');

export const directionSchema = z.enum(['positive', 'negative', 'neutral', 'mixed']);

export const claimNumberSchema = z.object({
  metric: text(200),
  value: z.number().finite(),
  unit: optionalText(40),
  period: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((value) => (value ? value : undefined)),
});

export const extractedClaimSchema = z.object({
  subject: text(300),
  driver: text(400),
  mechanism: text(400),
  outcome: text(400),
  direction: directionSchema,
  time_horizon: optionalText(100),
  claim_type: z.enum(CLAIM_TYPES as [string, ...string[]]),
  summary: text(1000),
  numbers: z
    .array(claimNumberSchema)
    .max(20)
    .nullish()
    .transform((value) => value ?? []),
  source_page: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((value) => value ?? null),
});

export const extractTargetSchema = z.object({
  target_price: z.union([z.number(), z.string()]),
  unit: z.string().trim().max(40).nullish(),
  horizon: z.string().trim().max(100).nullish(),
});

export const extractEnvelopeSchema = z.object({
  claims: z.array(z.unknown()),
  target: z.unknown().optional(),
});

export const matchItemSchema = z.object({
  claim_id: text(100),
  relationship: z.enum(['SUPPORT', 'UPDATE', 'CONTRADICT', 'REPLACE', 'NEW_THESIS', 'IRRELEVANT']),
  thesis_id: z.string().trim().min(1).nullish(),
  new_thesis_key: z.string().trim().min(1).max(60).nullish(),
  invalidates_thesis: z.boolean().nullish(),
  match: z.object({
    driver: z.boolean(),
    mechanism: z.boolean(),
    direction: z.boolean(),
    reason: z
      .string()
      .trim()
      .max(600)
      .nullish()
      .transform((value) => value ?? ''),
  }),
});

export const newThesisDraftSchema = z.object({
  key: text(60),
  canonical_driver: text(400),
  canonical_mechanism: text(400),
  canonical_outcome: text(400),
  direction: directionSchema,
  is_risk: z.boolean().nullish().transform((value) => value ?? false),
});

export const disagreementItemSchema = z.object({
  thesis_ref: text(100),
  dimension: z.enum(['timeline', 'size', 'forecast', 'margin', 'growth', 'other']).catch('other'),
  note: z
    .string()
    .trim()
    .max(600)
    .nullish()
    .transform((value) => value ?? ''),
  values: z.array(
    z.object({
      broker: text(80),
      value: z.union([z.string(), z.number()]).transform((value) => String(value).trim()),
    }),
  ),
});

export const matchEnvelopeSchema = z.object({
  matches: z.array(z.unknown()),
  new_theses: z.array(z.unknown()).nullish(),
  disagreements: z.array(z.unknown()).nullish(),
});

export const builtThesisSchema = z.object({
  thesis_id: text(100),
  title: text(300),
  summary: text(2000),
  materiality: z
    .number()
    .finite()
    .transform((value) => Math.min(5, Math.max(1, Math.round(value)))),
});

export const buildEnvelopeSchema = z.object({
  theses: z.array(z.unknown()),
});
