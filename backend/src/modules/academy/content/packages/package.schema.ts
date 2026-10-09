import { z } from 'zod';

/**
 * Typed content-package format for the chapter 1-4 Academy imports.
 *
 * Files (per chapter, under `content/packages/chNN/`):
 * - `lessons.vi.json`            public: `PackageLesson[]` (typed blocks, no answer data)
 * - `charts.vi.json`             public: `Record<chart_id, ChartModel>` (C1, C3)
 * - `questions.vi.private.json`  private: `PrivateQuestion[]` (C1, C3); the API serves only
 *                                `toPublicQuestion()` before submit
 * - `assets.manifest.json`       public: guide screenshots (C2, C4)
 * - `import-manifest.json`       provenance, counts and output hashes (never served)
 *
 * String conventions: `html` blocks, `steps[].html` and `table` cells hold HTML restricted to the
 * sanitiser allowlist v2 (see scripts/academy-import/sanitize-allow.ts; tables and cells allow the
 * inline subset only). Every other string (titles, captions, summaries, prompts, option text,
 * question-figure tables) is plain text and must be escaped by the renderer.
 */

export const PACKAGE_FORMAT_VERSION = 1;

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/* ----------------------------------------------------------------------- blocks */

export type SectionId = 's1' | 's2' | 's3' | 's4';
export type CalloutVariant = 'notice' | 'worked' | 'signal-buy' | 'signal-sell' | 'filter-example';
export type TableAlign = 'l' | 'r' | 'c';

export interface HtmlBlock {
  type: 'html';
  /** Sanitised flow HTML (allowlist v2: p, h3, h4, div, span, strong, b, em, i, sub, sup, code, br). */
  html: string;
}

export interface TableBlock {
  type: 'table';
  /** Inline HTML cells (allowlist inline tags only). */
  head: string[];
  rows: string[][];
  /** Column alignment, present only when some column is not left-aligned. */
  align?: TableAlign[];
  aria_label?: string;
  /** Present when the cells were computed at import time (chapter 1 dynamic hooks). */
  source?: { kind: 'computed'; hook: 'macd-seed' | 'application'; chart_id?: string };
}

export interface ChartBlock {
  type: 'chart';
  /** Key into the chapter's `charts.vi.json`. */
  chart_id: string;
  title: string;
  caption?: string;
  /** Show the "Dữ liệu minh họa" tag. */
  illustrative?: boolean;
  /** Offer the "Xem bảng số liệu của biểu đồ" toggle. */
  table_toggle: boolean;
}

export interface ImageBlock {
  type: 'image';
  asset_id: string;
  /** Public URL under /assets/academy/chNN/ (`<asset_id>.<sha8>.webp`). */
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Heading shown above the figure. */
  title: string;
  caption?: string;
  /** Title shown in the lightbox. */
  zoom_title: string;
  /** Figure max width in CSS px (from the approved layout). */
  max_width?: number;
}

export interface StepsBlock {
  type: 'steps';
  items: { no: string; title: string; /** inline/flow HTML */ html: string }[];
}

export interface CalloutBlock {
  type: 'callout';
  variant: CalloutVariant;
  title?: string;
  aria_label?: string;
  blocks: Block[];
}

export interface DetailsBlock {
  type: 'details';
  summary: string;
  blocks: Block[];
}

export type Block =
  HtmlBlock | TableBlock | ChartBlock | ImageBlock | StepsBlock | CalloutBlock | DetailsBlock;

const htmlBlockSchema = z.strictObject({ type: z.literal('html'), html: z.string().min(1) });

const tableBlockSchema = z
  .strictObject({
    type: z.literal('table'),
    head: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())).min(1),
    align: z.array(z.enum(['l', 'r', 'c'])).optional(),
    aria_label: z.string().min(1).optional(),
    source: z
      .strictObject({
        kind: z.literal('computed'),
        hook: z.enum(['macd-seed', 'application']),
        chart_id: z.string().min(1).optional(),
      })
      .optional(),
  })
  .superRefine((t, ctx) => {
    const cols = t.head.length;
    t.rows.forEach((r, i) => {
      if (r.length !== cols)
        ctx.addIssue({
          code: 'custom',
          message: `row ${i} has ${r.length} cells, expected ${cols}`,
        });
    });
    if (t.align && t.align.length !== cols)
      ctx.addIssue({ code: 'custom', message: 'align length differs from column count' });
  });

const chartBlockSchema = z.strictObject({
  type: z.literal('chart'),
  chart_id: z.string().min(1),
  title: z.string().min(1),
  caption: z.string().min(1).optional(),
  illustrative: z.boolean().optional(),
  table_toggle: z.boolean(),
});

const imageBlockSchema = z.strictObject({
  type: z.literal('image'),
  asset_id: z.string().min(1),
  src: z.string().regex(/^\/assets\/academy\/ch\d{2}\/[A-Za-z0-9._-]+\.[0-9a-f]{8}\.webp$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().min(1),
  title: z.string().min(1),
  caption: z.string().min(1).optional(),
  zoom_title: z.string().min(1),
  max_width: z.number().int().positive().optional(),
});

const stepsBlockSchema = z.strictObject({
  type: z.literal('steps'),
  items: z
    .array(
      z.strictObject({ no: z.string().min(1), title: z.string().min(1), html: z.string().min(1) }),
    )
    .min(1),
});

export const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.union([
    htmlBlockSchema,
    tableBlockSchema,
    chartBlockSchema,
    imageBlockSchema,
    stepsBlockSchema,
    z.strictObject({
      type: z.literal('callout'),
      variant: z.enum(['notice', 'worked', 'signal-buy', 'signal-sell', 'filter-example']),
      title: z.string().min(1).optional(),
      aria_label: z.string().min(1).optional(),
      blocks: z.array(blockSchema).min(1),
    }),
    z.strictObject({
      type: z.literal('details'),
      summary: z.string().min(1),
      blocks: z.array(blockSchema).min(1),
    }),
  ]),
);

/* ---------------------------------------------------------------------- lessons */

export type LessonKind = 'technical' | 'fundamental' | 'concept' | 'guide';

export interface PackageLesson {
  id: string;
  chapter: number;
  order: number;
  /** Stable key: technical:<indicator>, fundamental:<metric>, concept:hop_luu, guide:chNN-lMM. */
  lesson_key: string;
  kind: LessonKind;
  /** Catalogue / sidebar name. */
  name: string;
  /** Reader heading. */
  title: string;
  lead: string;
  nav_labels: [string, string, string, string];
  completion:
    | { mode: 'quiz'; question_count: 8; required_correct: 8 }
    | { mode: 'manual'; button_label: string };
  /** Repository version (<= 32 chars: attempts/grants use varchar(32)). */
  content_version: string;
  source: {
    package: string;
    package_version: string;
    payload_sha256: string;
    object_sha256: string;
  };
  sections: { id: SectionId; title: string; blocks: Block[] }[];
  config_id: string | null;
  fixture: Record<string, unknown>;
}

export const packageLessonSchema: z.ZodType<PackageLesson> = z
  .strictObject({
    id: z.string().regex(/^ch\d{2}-l\d{2}$/),
    chapter: z.number().int().min(1),
    order: z.number().int().min(1),
    lesson_key: z.string().regex(/^(technical|fundamental|concept|guide):[a-z0-9_-]+$/),
    kind: z.enum(['technical', 'fundamental', 'concept', 'guide']),
    name: z.string().min(1),
    title: z.string().min(1),
    lead: z.string().min(1),
    nav_labels: z.tuple([
      z.string().min(1),
      z.string().min(1),
      z.string().min(1),
      z.string().min(1),
    ]),
    completion: z.discriminatedUnion('mode', [
      z.strictObject({
        mode: z.literal('quiz'),
        question_count: z.literal(8),
        required_correct: z.literal(8),
      }),
      z.strictObject({ mode: z.literal('manual'), button_label: z.string().min(1) }),
    ]),
    content_version: z.string().min(1).max(32),
    source: z.strictObject({
      package: z.string().min(1),
      package_version: z.string().min(1),
      payload_sha256: sha256,
      object_sha256: sha256,
    }),
    sections: z
      .array(
        z.strictObject({
          id: z.enum(['s1', 's2', 's3', 's4']),
          title: z.string().min(1),
          blocks: z.array(blockSchema).min(1),
        }),
      )
      .length(4),
    config_id: z.string().min(1).nullable(),
    fixture: z.record(z.string(), z.unknown()),
  })
  .superRefine((l, ctx) => {
    l.sections.forEach((s, i) => {
      if (s.id !== `s${i + 1}`)
        ctx.addIssue({ code: 'custom', message: `section ${i} must have id s${i + 1}` });
    });
    const quiz = l.completion.mode === 'quiz';
    if (quiz !== (l.kind !== 'guide'))
      ctx.addIssue({
        code: 'custom',
        message: 'quiz completion belongs to non-guide lessons only',
      });
  });

export const packageLessonsFileSchema = z.array(packageLessonSchema);

/* ----------------------------------------------------------------------- charts */

export type SeriesRole = 'price' | 'p1' | 'p2' | 'p3' | 'pos' | 'neg';

const nullableNumber = z.number().nullable();

const modelSeriesSchema = z.strictObject({
  name: z.string().min(1),
  role: z.enum(['price', 'p1', 'p2', 'p3', 'pos', 'neg']),
  dash: z.literal(true).optional(),
  values: z.array(nullableNumber).min(1),
});

const modelPanelSchema = z
  .strictObject({
    title: z.string().min(1),
    bounds: z.tuple([z.number(), z.number()]).optional(),
    ticks: z.array(z.number()).optional(),
    digits: z.number().int().min(0).optional(),
    zero: z.literal(true).optional(),
    nonnegative: z.literal(true).optional(),
    levels: z
      .array(z.strictObject({ value: z.number(), role: z.enum(['buy', 'sell']) }))
      .optional(),
    band: z
      .strictObject({ upper: z.array(nullableNumber), lower: z.array(nullableNumber) })
      .optional(),
    series: z.array(modelSeriesSchema).min(1),
    bars: z
      .strictObject({
        name: z.string().min(1),
        values: z.array(nullableNumber),
        colors: z.array(z.enum(['pos', 'neg', 'neutral'])),
      })
      .optional(),
  })
  .superRefine((p, ctx) => {
    const n = p.series[0]?.values.length ?? 0;
    for (const s of p.series)
      if (s.values.length !== n)
        ctx.addIssue({ code: 'custom', message: `series ${s.name} length differs from panel` });
    if (p.bars && (p.bars.values.length !== n || p.bars.colors.length !== n))
      ctx.addIssue({ code: 'custom', message: 'bars length differs from panel' });
    if (p.band && (p.band.upper.length !== n || p.band.lower.length !== n))
      ctx.addIssue({ code: 'custom', message: 'band length differs from panel' });
  });

/** Chapter 1: pre-computed, windowed multi-panel series (x axis = observation index). */
export const seriesPanelsModelSchema = z
  .strictObject({
    kind: z.literal('series_panels'),
    x: z.strictObject({
      start: z.number().int().min(0),
      end: z.number().int().min(0),
      ticks: z.array(z.string()).optional(),
    }),
    marks: z.array(z.strictObject({ i: z.number().int().min(0), label: z.string().min(1) })),
    panels: z.array(modelPanelSchema).min(1),
  })
  .superRefine((m, ctx) => {
    const n = m.x.end - m.x.start + 1;
    if (n < 2) ctx.addIssue({ code: 'custom', message: 'empty window' });
    for (const p of m.panels)
      if ((p.series[0]?.values.length ?? 0) !== n)
        ctx.addIssue({ code: 'custom', message: `panel "${p.title}" is not window sized` });
    if (m.x.ticks && m.x.ticks.length !== n)
      ctx.addIssue({ code: 'custom', message: 'x.ticks length differs from window' });
    for (const mark of m.marks)
      if (mark.i < m.x.start || mark.i > m.x.end)
        ctx.addIssue({ code: 'custom', message: `mark ${mark.label} outside the window` });
  });

const categorySeries = z.strictObject({ name: z.string().min(1), values: z.array(nullableNumber) });

const categoryModelShape = {
  title: z.string().min(1),
  labels: z.array(z.string()).min(1),
  series: z.array(categorySeries).min(1),
  unit: z.string(),
};

const groupedModel = z.strictObject({ kind: z.literal('grouped'), ...categoryModelShape });
const lineModel = z.strictObject({ kind: z.literal('line'), ...categoryModelShape });
const stackedModel = z.strictObject({ kind: z.literal('stacked'), ...categoryModelShape });

/** Chapter 3 definitions are copied verbatim from the approved fixture. */
export const chartModelSchema = z.union([
  seriesPanelsModelSchema,
  groupedModel,
  lineModel,
  stackedModel,
  z.strictObject({
    kind: z.literal('timeline'),
    title: z.string().min(1),
    labels: z.array(z.string()).min(1),
    rows: z
      .array(
        z.strictObject({
          name: z.string().min(1),
          start: z.number().int().min(0),
          end: z.number().int().min(0),
          detail: z.string(),
        }),
      )
      .min(1),
  }),
  z.strictObject({
    kind: z.literal('waterfall'),
    title: z.string().min(1),
    unit: z.string(),
    steps: z
      .array(
        z.strictObject({
          name: z.string().min(1),
          value: z.number(),
          total: z.literal(true).optional(),
        }),
      )
      .min(1),
  }),
  z.strictObject({
    kind: z.literal('panels'),
    title: z.string().min(1),
    panels: z.array(z.union([groupedModel, lineModel, stackedModel])).min(1),
  }),
]);

export type ChartModel = z.infer<typeof chartModelSchema>;
export const chartsFileSchema = z.record(z.string().min(1), chartModelSchema);

/* -------------------------------------------------------------------- questions */

export const questionFigureSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('chart'), chart_id: z.string().min(1) }),
  z.strictObject({
    type: z.literal('table'),
    head: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())).min(1),
  }),
]);

export const privateQuestionSchema = z
  .strictObject({
    id: z.string().regex(/^ch\d{2}-l\d{2}-q\d{2}$/),
    source_id: z.string().min(1),
    lesson_id: z.string().regex(/^ch\d{2}-l\d{2}$/),
    topic: z.string().min(1),
    section: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    hint: z.string().min(1).optional(),
    prompt: z.string().min(1),
    figure: questionFigureSchema.optional(),
    options: z
      .array(
        z.strictObject({
          /** Opaque: first 10 hex of sha256(`${question id}|${source option id}`). */
          id: z.string().regex(/^[0-9a-f]{10}$/),
          source_id: z.string().min(1),
          text: z.string().min(1),
          /** Private: per-option explanation shown after submit. */
          explanation: z.string().min(1),
        }),
      )
      .length(4),
    /** Private. */
    correct_option_id: z.string().regex(/^[0-9a-f]{10}$/),
  })
  .superRefine((q, ctx) => {
    const ids = q.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'option ids must be unique' });
    if (!ids.includes(q.correct_option_id))
      ctx.addIssue({ code: 'custom', message: 'correct_option_id must be one of the options' });
    if (!q.id.startsWith(`${q.lesson_id}-q`))
      ctx.addIssue({ code: 'custom', message: 'question id must extend its lesson id' });
  });

export type PrivateQuestion = z.infer<typeof privateQuestionSchema>;
export const privateQuestionsFileSchema = z.array(privateQuestionSchema);

export const publicQuestionSchema = z.strictObject({
  id: z.string(),
  source_id: z.string(),
  lesson_id: z.string(),
  topic: z.string(),
  section: z.number().int().min(1).max(4),
  hint: z.string().optional(),
  prompt: z.string(),
  figure: questionFigureSchema.optional(),
  options: z.array(z.strictObject({ id: z.string(), text: z.string() })).length(4),
});
export type PublicQuestion = z.infer<typeof publicQuestionSchema>;

/** Projection served before submit: no correct option, no explanations. */
export function toPublicQuestion(q: PrivateQuestion): PublicQuestion {
  return {
    id: q.id,
    source_id: q.source_id,
    lesson_id: q.lesson_id,
    topic: q.topic,
    section: q.section,
    ...(q.hint !== undefined ? { hint: q.hint } : {}),
    prompt: q.prompt,
    ...(q.figure !== undefined ? { figure: q.figure } : {}),
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
  };
}

/* ----------------------------------------------------------------------- assets */

export const assetEntrySchema = z.strictObject({
  /** Path under frontend/public, `assets/academy/chNN/<asset_id>.<sha8>.webp`. */
  file: z.string().regex(/^assets\/academy\/ch\d{2}\/[A-Za-z0-9._-]+\.[0-9a-f]{8}\.webp$/),
  sha256,
  bytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mime: z.literal('image/webp'),
  /** Lightbox title / alt text. */
  alt: z.string().min(1),
  /** QA only: numbered annotation selectors of the capture. */
  marks: z.array(z.strictObject({ number: z.number().int().positive(), selector: z.string() })),
});
export type AssetEntry = z.infer<typeof assetEntrySchema>;
export const assetsManifestSchema = z.record(z.string().min(1), assetEntrySchema);

/* ------------------------------------------------------------- import manifest */

export const importManifestSchema = z.strictObject({
  format: z.literal(PACKAGE_FORMAT_VERSION),
  chapter: z.number().int().min(1).max(4),
  package: z.string().min(1),
  package_version: z.string().min(1),
  content_version: z.string().min(1).max(32),
  source: z.strictObject({
    html_file: z.string().min(1),
    html_bytes: z.number().int().positive(),
    html_sha256: sha256,
    payload_script_id: z.string().min(1),
    payload_text_sha256: sha256,
    /** False when the spec publishes no value and the hash is pinned from the supplied file. */
    payload_text_in_spec: z.boolean(),
    /** Spec object hashes of payload sub-trees (`$` is the whole payload). */
    objects: z.record(z.string(), sha256),
    /** Spec object hash per lesson, when the spec publishes one; always recomputed. */
    lessons: z.record(z.string(), sha256),
    lessons_in_spec: z.boolean(),
    /** JS-canonical hashes of sub-trees copied verbatim (recomputed from the output by verify). */
    copied: z.record(z.string(), sha256),
    /** Names of the gates the extractor passed. */
    gates: z.array(z.string()),
  }),
  counts: z.record(z.string(), z.union([z.number(), z.record(z.string(), z.number())])),
  per_lesson: z.record(
    z.string(),
    z.strictObject({
      charts: z.number().int(),
      images: z.number().int(),
      tables: z.number().int(),
      computed_tables: z.number().int(),
      questions: z.number().int(),
    }),
  ),
  text_equivalence: z.strictObject({
    sections_checked: z.number().int(),
    matched: z.number().int(),
  }),
  outputs: z.record(z.string(), z.strictObject({ sha256, bytes: z.number().int().positive() })),
});
export type ImportManifest = z.infer<typeof importManifestSchema>;
