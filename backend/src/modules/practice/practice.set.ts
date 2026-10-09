import { z } from 'zod';

import setDefinition from './practice-set.json' with { type: 'json' };
import { PRACTICE_CASE_COUNT } from './practice.constants.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * A practice set: observation window, 24-month test window, the 30 distinct hidden symbols and
 * the data/calculation/execution/comment versions. The symbol list and every date are SERVER-ONLY
 * data; nothing in this object may be serialised to a client.
 */
export const practiceSetSchema = z
  .strictObject({
    set_version: z.string().min(1).max(64),
    title: z.string().min(1),
    /** `pending` until the product owner approves the 30 symbols and the periods (SPEC §18.1). */
    owner_confirmation: z.enum(['pending', 'confirmed']),
    observation: z.strictObject({ from: isoDate, to: isoDate }),
    test: z.strictObject({ from: isoDate, to: isoDate, months: z.literal(24) }),
    window_bars: z.number().int().min(20).max(400),
    warmup: z.strictObject({
      sessions_requested: z.number().int().min(1).max(2_000),
      sessions_required: z.number().int().min(1).max(2_000),
      rationale: z.string().min(1),
    }),
    min_sessions: z.strictObject({
      observation: z.number().int().min(1),
      test: z.number().int().min(1),
    }),
    versions: z.strictObject({
      data: z.string().min(1).max(64),
      calculation: z.string().min(1).max(32),
      execution: z.string().min(1).max(64),
      comment: z.string().min(1).max(64),
      profile: z.string().min(1).max(64),
    }),
    symbols: z.array(z.string().regex(/^[A-Z0-9]{3,5}$/)).length(PRACTICE_CASE_COUNT),
  })
  .superRefine((set, ctx) => {
    if (new Set(set.symbols).size !== set.symbols.length)
      ctx.addIssue({ code: 'custom', path: ['symbols'], message: 'symbols must be distinct' });
    if (!(set.observation.from < set.observation.to))
      ctx.addIssue({ code: 'custom', path: ['observation'], message: 'observation range invalid' });
    if (!(set.observation.to < set.test.from && set.test.from < set.test.to))
      ctx.addIssue({ code: 'custom', path: ['test'], message: 'test range invalid' });
    if (set.warmup.sessions_required > set.warmup.sessions_requested)
      ctx.addIssue({ code: 'custom', path: ['warmup'], message: 'required exceeds requested' });
  });

export type PracticeSet = z.infer<typeof practiceSetSchema>;

/** Nest injection token of the active set (overridable in tests). */
export const PRACTICE_SET = Symbol('PRACTICE_SET');

let memoized: PracticeSet | undefined;

/** Parse + validate (once) the bundled set definition. */
export function loadPracticeSet(): PracticeSet {
  memoized ??= Object.freeze(practiceSetSchema.parse(setDefinition)) as PracticeSet;
  return memoized;
}
