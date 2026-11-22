import { z } from 'zod';

/**
 * content/v5/import-manifest.json: provenance and frozen gate counts. Never loaded by the server. No timestamps, so a
 * rerun on the same source and the same content/v4 base is byte-identical.
 */
export const MANIFEST_FORMAT = 'iqx-academy-import-manifest-v5';

const countMap = z.record(z.string(), z.number().int().min(0));
const sha = z.string().regex(/^[0-9a-f]{64}$/);

export const manifestSchema = z.strictObject({
  format: z.literal(MANIFEST_FORMAT),
  source: z.strictObject({ file: z.string(), sha256: sha, bytes: z.number().int().positive() }),
  /** sha256 of the content/v4 catalog the frozen lessons and banks were copied from. */
  base: z.strictObject({ dir: z.literal('content/v4'), catalog_sha256: sha }),
  gates: z.strictObject({
    source_sha256: z.literal(true),
    catalog_titles: z.literal(true),
    fig_ids: z.literal(true),
    rep_ids: z.literal(true),
    schema: z.literal(true),
    dashes_resolved: z.literal(true),
    overrides_used: z.literal(true),
  }),
  counts: z.strictObject({
    chapters: z.number().int(),
    required_lessons: z.number().int(),
    lesson_files: z.number().int(),
    exams: z.number().int(),
    banks: z.number().int(),
    questions: z.number().int(),
    /** Lessons per origin: `v4` copied, `v4+patch` (Chương 8/9 "Ở các ngành"), `v5` extracted from the mockup. */
    origins: countMap,
    figures: z.number().int(),
    rep_charts: z.number().int(),
    figure_kinds: countMap,
    /** Blocks of the 87 v5 lessons by type. */
    blocks: countMap,
  }),
  lessons: z.record(
    z.string(),
    z.strictObject({
      origin: z.enum(['v4', 'v4+patch', 'v5']),
      order: z.number().int(),
      sections: z.number().int(),
      charts: z.number().int(),
      questions: z.number().int(),
    }),
  ),
  banks: z.record(
    z.string(),
    z.strictObject({ origin: z.enum(['v4', 'v5']), questions: z.number().int() }),
  ),
  /** sha256 of every output file except this manifest, keyed by path relative to content/v5. */
  outputs: z.record(z.string(), sha),
  warnings: z.array(z.string()),
});
export type Manifest = z.infer<typeof manifestSchema>;
