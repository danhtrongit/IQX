import { z } from 'zod';

/**
 * import-manifest.json: provenance and frozen gate counts. Never loaded by the server. No timestamps, so a
 * rerun on the same source is byte-identical.
 */
export const MANIFEST_FORMAT = 'iqx-academy-import-manifest-v1';

const countMap = z.record(z.string(), z.number().int().min(0));

export const manifestSchema = z.strictObject({
  format: z.literal(MANIFEST_FORMAT),
  source: z.strictObject({
    file: z.string(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    bytes: z.number().int().positive(),
  }),
  /** Gates checked at extract time (all must be true for the output to be written). */
  gates: z.strictObject({
    source_sha256: z.literal(true),
    svg_ids: z.literal(true),
    schema: z.literal(true),
    dashes_resolved: z.literal(true),
    overrides_used: z.literal(true),
  }),
  /** DOM-derived counts frozen at extract time; `verify` recomputes them from the output. */
  counts: z.strictObject({
    lessons: z.number().int(),
    banks: z.number().int(),
    questions: z.number().int(),
    sections: z.number().int(),
    intro_blocks: z.number().int(),
    summaries: z.number().int(),
    charts: z.number().int(),
    text_figures: z.number().int(),
    svg_ids: z.number().int(),
    chart_kinds: countMap,
    blocks: countMap,
  }),
  lessons: z.record(
    z.string(),
    z.strictObject({
      sections: z.number().int(),
      blocks: z.number().int(),
      charts: z.number().int(),
      questions: z.number().int(),
    }),
  ),
  banks: z.record(z.string(), z.strictObject({ questions: z.number().int() })),
  /** sha256 of every output file except this manifest, keyed by path relative to content/v3. */
  outputs: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)),
  warnings: z.array(z.string()),
});
export type Manifest = z.infer<typeof manifestSchema>;
