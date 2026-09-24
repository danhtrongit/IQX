import { z } from 'zod';

import { JOURNEY_LAYER_KEYS } from '../core/index.js';
import { MASCOT_RULES_VERSION } from './identity.classification.js';

export const datasetRequestSchema = z
  .object({
    symbol: z
      .string()
      .regex(/^[A-Za-z0-9]{1,10}$/)
      .transform((value) => value.toUpperCase()),
  })
  .strict();

const assessmentValueSchema = z.enum(['ok', 'neu', 'bad']);
export const assessmentRequestSchema = z
  .object({
    dataset_id: z.uuid(),
    answers: z
      .object(
        Object.fromEntries(JOURNEY_LAYER_KEYS.map((key) => [key, assessmentValueSchema])) as {
          [Key in (typeof JOURNEY_LAYER_KEYS)[number]]: typeof assessmentValueSchema;
        },
      )
      .strict(),
  })
  .strict();

export const uiEventRequestSchema = z
  .object({
    event: z.enum([
      'level_seen',
      'hatch_seen',
      'reveal_seen',
      'greet_seen',
      'bot_run_updated_seen',
    ]),
    mascot_rules_version: z.literal(MASCOT_RULES_VERSION).default(MASCOT_RULES_VERSION),
    level: z.number().int().min(0).max(6).nullish(),
    run_id: z.uuid().nullish(),
    local_date: z.iso.date().nullish(),
  })
  .strict();

export const qaGrantRequestSchema = z
  .object({
    user_id: z.uuid(),
    mascot_id: z.enum(['bach_ho', 'thanh_long', 'loc_huou', 'phung_hoang', 'kim_quy']),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export type DatasetRequest = z.infer<typeof datasetRequestSchema>;
export type AssessmentRequest = z.infer<typeof assessmentRequestSchema>;
export type UIEventRequest = z.infer<typeof uiEventRequestSchema>;
export type QaGrantRequest = z.infer<typeof qaGrantRequestSchema>;
