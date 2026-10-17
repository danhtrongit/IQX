import { z } from 'zod';

/**
 * Học viện v3.2: the shared contract.
 *
 * One file holds everything that more than one package depends on:
 *   1. text conventions (plain text vs inline HTML) and the visible-copy bans
 *   2. chart models (precomputed by the importer; the browser only draws)
 *   3. lesson blocks (static + interactive) and the public lesson file
 *   4. the catalog file (14 chapters, ch1-5 published, ch6-14 stubs)
 *   5. the private question bank file and its public projection
 *   6. the HTTP wire shapes of `api/v2/academy/*` (also the OpenAPI source)
 *   7. pure helpers: the learning sequence + unlock states, interactive keys
 *
 * Files under `content/v3/` (copied to dist by scripts/copy-assets.ts):
 *   catalog.json                          CatalogFile
 *   lessons/<item id>.vi.json             LessonFile        public, one per lesson and practice
 *   questions/<item id>.private.json      BankFile          PRIVATE, one per quizzable item
 *   retired-lessons.json                  RetiredLessonsFile (old lesson_key -> name, shop ledger)
 *   import-manifest.json                  provenance, never loaded by the server
 *
 * Never import backend runtime code from here: this module only depends on zod.
 */

/* ============================================================== 1. text */

/** Visible copy rules (frontend/AGENTS.md §10, spec v3.2 §2.2): no en/em dash, no check glyph. */
const BANNED_VISIBLE = /[–—✓✔]/;
const BANNED_PHRASES = [/lưu trên trình duyệt/i];

function visible(s: string): boolean {
  return !BANNED_VISIBLE.test(s) && !BANNED_PHRASES.some((p) => p.test(s));
}

const VISIBLE_MSG = 'visible text must not contain en/em dashes, check glyphs or banned phrases';

/**
 * Every rendered string field goes through this helper (review: no plain `z.string()` on visible copy).
 * `allowEmpty` is for tick labels that may be blank.
 */
export function visibleString(max: number, opts: { allowEmpty?: boolean } = {}) {
  return z
    .string()
    .min(opts.allowEmpty ? 0 : 1)
    .max(max)
    .refine(visible, VISIBLE_MSG);
}

/** Plain visible text. The renderer escapes it. */
export const plainText = visibleString(4000);

/**
 * Chart text (labels, ticks, titles inside charts). Additionally bans arrow glyphs used as icons
 * (frontend/AGENTS.md): direction is drawn by the renderer (schematic axis arrowheads), never typed.
 */
const CHART_ARROWS = /[←→↑↓↗↘]/;
export function chartString(max: number, opts: { allowEmpty?: boolean } = {}) {
  return visibleString(max, opts).refine((s) => !CHART_ARROWS.test(s), 'chart text must not contain arrow glyphs');
}

/**
 * Inline HTML: the only markup allowed is
 *   <b> <strong> <em> <br> and <span class="tone-(pos|neg|warn|info|violet|accent|strong)">.
 * Text must escape `&`, `<`, `>` as entities. The importer maps the mockup's inline
 * `style="color:#…"` and `b.hl` to tone spans:
 *   #7fe0bd/#2bb886 -> pos, #f2a0a0/#e66767 -> neg, #e8c77d/#dfb969 -> warn,
 *   #7fb8ff/#5db8ff -> info, #c9a0f0/#b48cf2 -> violet, b.hl -> accent, #dbe7f3 -> strong.
 */
export const INLINE_TONES = ['pos', 'neg', 'warn', 'info', 'violet', 'accent', 'strong'] as const;
const INLINE_TAG =
  /<\/?(?:b|strong|em)>|<br\s*\/?>|<span class="tone-(?:pos|neg|warn|info|violet|accent|strong)">|<\/span>/g;
const ENTITY = /&(?:amp|lt|gt|quot|#39|nbsp);/g;

export function isInlineHtml(s: string): boolean {
  const rest = s.replace(INLINE_TAG, '').replace(ENTITY, '');
  return !/[<>&]/.test(rest);
}

export const inlineHtml = z
  .string()
  .min(1)
  .max(6000)
  .refine(isInlineHtml, 'inline HTML outside the allowlist')
  .refine(visible, VISIBLE_MSG);

/** Stable ids used as notes keys and React keys. Max 48, so a checklist key `${id}:${item}` is <= 97. */
const keyId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,47}$/);
/** Longest notes key: checklist `${keyId}:${keyId}`. */
export const NOTES_KEY_MAX = 97;

/* ============================================================== 2. charts */

/**
 * Colour roles, never hex. Frontend mapping (charts/chart-theme.ts):
 *   price -> foreground, p1 -> chart-1 (blue), p2 -> chart-2 (gold), p3 -> chart-5 (slate, lines only),
 *   p4 -> chart-7 (violet: RSI, ATO), p5 -> chart-8 or orange (MA200, EMA26, ATC),
 *   pos -> price-up, neg -> price-down, warn -> chart-2, info -> chart-6 (cyan), neutral -> border.
 * Mockup hex -> tone table lives in the importer (charts/tones.ts).
 */
export const chartToneSchema = z.enum([
  'price',
  'p1',
  'p2',
  'p3',
  'p4',
  'p5',
  'pos',
  'neg',
  'warn',
  'info',
  'neutral',
]);
export type ChartTone = z.infer<typeof chartToneSchema>;

/**
 * Tone for chart TEXT (labels, notes, tags). `p3` (slate) and `neutral` are grey and banned for text
 * (no grey text in lessons); an omitted text tone renders with `--academy-label`.
 */
export const chartTextToneSchema = z.enum(['price', 'p1', 'p2', 'p4', 'p5', 'pos', 'neg', 'warn', 'info']);

const num = z.number();
const nnum = z.number().nullable();
const pt = z.tuple([z.number(), z.number()]);
const label = chartString(400);
const pos4 = z.enum(['above', 'below', 'left', 'right']);
const legendSchema = z.array(z.strictObject({ tone: chartToneSchema, label })).min(1);
const vtick = z.strictObject({ v: num, label: chartString(40, { allowEmpty: true }) });

/**
 * K1: windowed multi-panel series. INDEX CONVENTION: every `i` / `from` / `to` / segment x / fib `i` /
 * note `i` / shade bound in a series_panels model is an ABSOLUTE observation index in [x.start, x.end];
 * array position k of a panel value corresponds to index x.start + k. All are checked in superRefine.
 * Series values are never null inside a drawn run unless the line is meant to break (C1L9-g3 is linearly
 * interpolated by the importer instead of emitting nulls).
 */
const panelSchema = z
  .strictObject({
    title: chartString(120, { allowEmpty: true }),
    bounds: z.tuple([num, num]).optional(),
    ticks: z.array(num).optional(),
    digits: z.number().int().min(0).max(6).optional(),
    zero: z.literal(true).optional(),
    nonnegative: z.literal(true).optional(),
    levels: z
      .array(
        z.strictObject({
          value: num,
          role: z.enum(['buy', 'sell', 'neutral', 'avg']),
          label: label.optional(),
        }),
      )
      .optional(),
    zones: z
      .array(z.strictObject({ from: num, to: num, tone: chartToneSchema, label: label.optional() }))
      .optional(),
    band: z
      .strictObject({ upper: z.array(nnum), lower: z.array(nnum), tone: chartToneSchema.optional() })
      .optional(),
    /** Fill between two series (indexes into `series`), coloured by sign of a - b. */
    fill_between: z
      .strictObject({
        a: z.number().int().min(0),
        b: z.number().int().min(0),
        above: chartToneSchema,
        below: chartToneSchema,
      })
      .optional(),
    candles: z
      .strictObject({
        open: z.array(nnum),
        high: z.array(nnum),
        low: z.array(nnum),
        close: z.array(nnum),
      })
      .optional(),
    series: z.array(
      z.strictObject({
        name: chartString(60),
        role: chartToneSchema,
        dash: z.literal(true).optional(),
        width: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
        values: z.array(nnum),
      }),
    ),
    bars: z
      .strictObject({
        name: chartString(60),
        values: z.array(nnum),
        colors: z.array(z.enum(['pos', 'neg', 'neutral'])),
      })
      .optional(),
    /** Straight segments in data space: [index, value]. `extend` lengthens past `to` by n bars. */
    segments: z
      .array(
        z.strictObject({
          from: pt,
          to: pt,
          tone: chartToneSchema,
          dash: z.literal(true).optional(),
          extend: z.number().min(0).optional(),
        }),
      )
      .optional(),
    fib: z
      .strictObject({
        lo: z.strictObject({ i: z.number().int(), v: num }),
        hi: z.strictObject({ i: z.number().int(), v: num }),
        dir: z.enum(['up', 'down']),
        levels: z.array(num).min(2),
        zone: z.tuple([num, num]).optional(),
      })
      .optional(),
    notes: z
      .array(z.strictObject({ i: z.number().int(), value: num, text: label, tone: chartTextToneSchema.optional() }))
      .optional(),
  })
  .superRefine((p, ctx) => {
    const lengths = [
      ...p.series.map((s) => s.values.length),
      ...(p.candles
        ? [p.candles.open.length, p.candles.high.length, p.candles.low.length, p.candles.close.length]
        : []),
      ...(p.bars ? [p.bars.values.length, p.bars.colors.length] : []),
      ...(p.band ? [p.band.upper.length, p.band.lower.length] : []),
    ];
    if (lengths.length === 0) ctx.addIssue({ code: 'custom', message: 'panel has no data' });
    if (new Set(lengths).size > 1) ctx.addIssue({ code: 'custom', message: 'panel arrays differ in length' });
    if (p.fill_between && (p.fill_between.a >= p.series.length || p.fill_between.b >= p.series.length))
      ctx.addIssue({ code: 'custom', message: 'fill_between index out of range' });
  });

function panelLength(p: z.infer<typeof panelSchema>): number {
  return (
    p.series[0]?.values.length ?? p.candles?.close.length ?? p.bars?.values.length ?? p.band?.upper.length ?? 0
  );
}

const seriesPanelsSchema = z
  .strictObject({
    kind: z.literal('series_panels'),
    x: z.strictObject({
      start: z.number().int().min(0),
      end: z.number().int().min(0),
      ticks: z.array(chartString(16, { allowEmpty: true })).optional(),
      shade: z
        .array(z.strictObject({ from: z.number().int(), to: z.number().int(), tone: chartToneSchema, label: label.optional() }))
        .optional(),
    }),
    /** false for thumbnails (C4L1-g4, C4L4-s1..s4). */
    axes: z.boolean().optional(),
    marks: z.array(z.strictObject({ i: z.number().int().min(0), label })),
    points: z
      .array(
        z.strictObject({
          i: z.number().int().min(0),
          panel: z.number().int().min(0),
          value: num,
          tone: chartToneSchema,
          shape: z.enum(['dot', 'ring']).optional(),
          label: label.optional(),
          pos: pos4.optional(),
        }),
      )
      .optional(),
    panels: z.array(panelSchema).min(1).max(4),
    alt: label.optional(),
  })
  .superRefine((m, ctx) => {
    const n = m.x.end - m.x.start + 1;
    if (n < 2) ctx.addIssue({ code: 'custom', message: 'empty window' });
    m.panels.forEach((p, k) => {
      if (panelLength(p) !== n) ctx.addIssue({ code: 'custom', message: `panel ${k} is not window sized` });
    });
    if (m.x.ticks && m.x.ticks.length !== n) ctx.addIssue({ code: 'custom', message: 'x.ticks length' });
    const inWindow = (i: number, what: string) => {
      if (i < m.x.start || i > m.x.end) ctx.addIssue({ code: 'custom', message: `${what} index ${i} outside window` });
    };
    for (const mk of m.marks) inWindow(mk.i, 'mark');
    for (const p of m.points ?? []) inWindow(p.i, 'point');
    for (const s of m.x.shade ?? []) {
      inWindow(s.from, 'shade.from');
      inWindow(s.to, 'shade.to');
    }
    m.panels.forEach((p, k) => {
      for (const s of p.segments ?? []) {
        inWindow(s.from[0], `panel ${k} segment.from`);
        inWindow(s.to[0], `panel ${k} segment.to`);
      }
      if (p.fib) {
        inWindow(p.fib.lo.i, `panel ${k} fib.lo`);
        inWindow(p.fib.hi.i, `panel ${k} fib.hi`);
      }
      for (const nt of p.notes ?? []) inWindow(nt.i, `panel ${k} note`);
    });
    for (const p of m.points ?? [])
      if (p.panel >= m.panels.length) ctx.addIssue({ code: 'custom', message: 'point panel out of range' });
  });

/** K2: category charts (grouped/stacked bars, category lines). */
const categorySchema = z
  .strictObject({
    kind: z.literal('category'),
    mode: z.enum(['grouped', 'stacked', 'line']),
    title: label.optional(),
    labels: z.array(chartString(24)).min(1),
    /** Second label per category drawn above the bar (C5L1-g2: the month's price). Same length as labels. */
    sublabels: z.array(chartString(24, { allowEmpty: true })).optional(),
    unit: chartString(24, { allowEmpty: true }),
    series: z
      .array(
        z.strictObject({
          name: chartString(60),
          values: z.array(nnum),
          tone: chartToneSchema.optional(),
          /** Colour each value by its sign instead of `tone` (C4L6-g0 price changes). */
          tone_by_sign: z.strictObject({ pos: chartToneSchema, neg: chartToneSchema }).optional(),
          dash: z.literal(true).optional(),
        }),
      )
      .min(1),
    orientation: z.enum(['v', 'h']).optional(),
    value_labels: z.enum(['all', 'last', 'none']).optional(),
    threshold: z
      .strictObject({
        value: num,
        label,
        tone_at_or_above: chartToneSchema.optional(),
        tone_below: chartToneSchema.optional(),
      })
      .optional(),
    end_labels: z.array(label).optional(),
    bounds: z.tuple([num, num]).optional(),
    ticks: z.array(num).optional(),
    /** One computed caption under the chart, e.g. "RSI ≈ 81" (C4L6-g0). */
    caption_value: label.optional(),
    /** Tone of `caption_value`, computed from the value (RSI >= 70 neg, <= 30 pos, else warn). */
    caption_tone: chartTextToneSchema.optional(),
    /** Stroke draw-in (C1L1-g1); renderer honours prefers-reduced-motion. */
    animate: z.literal('draw').optional(),
  })
  .superRefine((m, ctx) => {
    for (const s of m.series) {
      if (s.values.length !== m.labels.length)
        ctx.addIssue({ code: 'custom', message: `series ${s.name} length differs from labels` });
      if (s.tone && s.tone_by_sign) ctx.addIssue({ code: 'custom', message: `series ${s.name}: tone or tone_by_sign` });
    }
    if (m.sublabels && m.sublabels.length !== m.labels.length)
      ctx.addIssue({ code: 'custom', message: 'sublabels length differs from labels' });
    if (m.caption_tone && !m.caption_value) ctx.addIssue({ code: 'custom', message: 'caption_tone without caption_value' });
    if (m.end_labels && m.end_labels.length !== m.series.length)
      ctx.addIssue({ code: 'custom', message: 'end_labels must match series' });
  });

/** K3: horizontal stacked / proportion rows, optional pictogram. */
const segmentBarSchema = z.strictObject({
  kind: z.literal('segment_bar'),
  unit: chartString(24).optional(),
  max: z.number().positive(),
  rows: z
    .array(
      z.strictObject({
        label,
        sub: label.optional(),
        total: z.strictObject({ text: label, tone: chartToneSchema.optional() }).optional(),
        segments: z
          .array(
            z.strictObject({
              value: z.number().min(0),
              label: label.optional(),
              sub: label.optional(),
              tone: chartToneSchema,
              ghost: z.literal(true).optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
  brackets: z
    .array(
      z.strictObject({ row: z.number().int().min(0), from: num, to: num, label, tone: chartToneSchema }),
    )
    .optional(),
  legend: legendSchema.optional(),
  pictogram: z.strictObject({ per_unit: z.number().positive(), icon: z.literal('banknote') }).optional(),
  alt: label.optional(),
});

/** K4: 1-D scale with zones and markers (price band, risk scale, buy zones). */
const scaleSchema = z.strictObject({
  kind: z.literal('scale'),
  orientation: z.enum(['h', 'v']),
  domain: z.tuple([num, num]),
  ticks: z.array(vtick).optional(),
  gradient: z.array(chartToneSchema).min(2).optional(),
  zones: z
    .array(z.strictObject({ from: num, to: num, tone: chartToneSchema, label: label.optional() }))
    .optional(),
  ends: z.tuple([label, label]).optional(),
  markers: z
    .array(
      z.strictObject({
        v: num,
        label,
        sub: label.optional(),
        tone: chartToneSchema,
        side: z.enum(['a', 'b']).optional(),
      }),
    )
    .min(1),
  alt: label.optional(),
});

/** K5: value-domain sketch (trends, S/R, divergence, Elliott, cycles, payoff, scatter). y grows upward. */
const schematicLayerSchema = z.discriminatedUnion('t', [
  z.strictObject({
    t: z.literal('zone'),
    x: z.tuple([num, num]).optional(),
    y: z.tuple([num, num]).optional(),
    tone: chartToneSchema,
    label: label.optional(),
    panel: z.number().int().min(0).optional(),
  }),
  z.strictObject({
    t: z.literal('line'),
    pts: z.array(pt).min(2),
    tone: chartToneSchema,
    /** Per-segment colours (length pts-1): Elliott, four-phase cycle. */
    colors: z.array(chartToneSchema).optional(),
    width: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    dash: z.literal(true).optional(),
    panel: z.number().int().min(0).optional(),
  }),
  z.strictObject({
    t: z.literal('segment'),
    from: pt,
    to: pt,
    tone: chartToneSchema,
    dash: z.literal(true).optional(),
    arrow: z.literal(true).optional(),
    panel: z.number().int().min(0).optional(),
  }),
  z.strictObject({
    t: z.literal('point'),
    at: pt,
    tone: chartToneSchema,
    shape: z.enum(['dot', 'ring']).optional(),
    size: z.enum(['s', 'm', 'l']).optional(),
    label: label.optional(),
    pos: pos4.optional(),
    panel: z.number().int().min(0).optional(),
  }),
  z.strictObject({
    t: z.literal('tag'),
    at: pt,
    text: chartString(8),
    tone: chartTextToneSchema,
    pos: z.enum(['above', 'below']),
    panel: z.number().int().min(0).optional(),
  }),
  z.strictObject({
    t: z.literal('bracket'),
    x: z.tuple([num, num]),
    y: num,
    label,
    tone: chartToneSchema,
    panel: z.number().int().min(0).optional(),
  }),
  z.strictObject({
    t: z.literal('bars'),
    x: z.array(num).min(1),
    h: z.array(num).min(1),
    tones: z.array(chartToneSchema).min(1),
    base: num,
    panel: z.number().int().min(0).optional(),
  }),
  z.strictObject({
    t: z.literal('text'),
    at: pt,
    text: label,
    tone: chartTextToneSchema.optional(),
    anchor: z.enum(['start', 'middle', 'end']).optional(),
    panel: z.number().int().min(0).optional(),
  }),
]);

const schematicSchema = z.strictObject({
  kind: z.literal('schematic'),
  domain: z.strictObject({ x: z.tuple([num, num]), y: z.tuple([num, num]) }).optional(),
  axes: z
    .strictObject({
      /** `arrow: true` draws an arrowhead at the axis end (replaces typed "Rủi ro →" style glyphs). */
      x: z
        .strictObject({ title: label.optional(), ticks: z.array(vtick).optional(), arrow: z.literal(true).optional() })
        .optional(),
      y: z
        .strictObject({ title: label.optional(), ticks: z.array(vtick).optional(), arrow: z.literal(true).optional() })
        .optional(),
    })
    .optional(),
  /** Stacked sub-plots sharing x (price over indicator, C4L6-g4/C4L7-g5). */
  panels: z.array(z.strictObject({ title: label.optional(), y: z.tuple([num, num]) })).max(3).optional(),
  layers: z.array(schematicLayerSchema).min(1),
  alt: label,
});

/** K6a: multi-segment rows over a time or day domain (sessions, T+2 calendar, daily schedule). */
const ganttSchema = z.strictObject({
  kind: z.literal('gantt'),
  domain: z.tuple([num, num]),
  tick_format: z.enum(['hhmm', 'day', 'plain']),
  ticks: z.array(vtick).min(1),
  columns: z.array(z.strictObject({ label, dim: z.literal(true).optional() })).optional(),
  rows: z
    .array(
      z.strictObject({
        name: label,
        segments: z
          .array(
            z.strictObject({
              from: num,
              to: num,
              label: label.optional(),
              tone: chartToneSchema,
              muted: z.literal(true).optional(),
            }),
          )
          .min(1),
        markers: z.array(z.strictObject({ at: num, text: label, tone: chartToneSchema })).optional(),
        note: label.optional(),
      }),
    )
    .min(1),
  highlight: z.strictObject({ from: num, to: num, label: label.optional() }).optional(),
  legend: legendSchema.optional(),
  alt: label.optional(),
});

/** K6b: milestones on a 0..1 line with spans and a brace. Renderer: vertical layout below 560px. */
const milestonesSchema = z.strictObject({
  kind: z.literal('milestones'),
  points: z
    .array(
      z.strictObject({
        at: z.number().min(0).max(1),
        title: label,
        detail: z.array(label).optional(),
        tone: chartToneSchema,
      }),
    )
    .min(2),
  spans: z
    .array(
      z.strictObject({
        from: z.number().min(0).max(1),
        to: z.number().min(0).max(1),
        label,
        tone: chartToneSchema,
        side: z.enum(['above', 'below']),
      }),
    )
    .optional(),
  brace: z.strictObject({ from: z.number().min(0).max(1), to: z.number().min(0).max(1), label }).optional(),
  alt: label.optional(),
});

/** K7: axis-less candle illustrations (anatomy, variants, patterns). Tone: c >= o ? pos : neg. */
const candleGlyphsSchema = z.strictObject({
  kind: z.literal('candle_glyphs'),
  domain: z.tuple([num, num]),
  groups: z
    .array(
      z.strictObject({
        title: label.optional(),
        candles: z
          .array(
            z.strictObject({
              o: num,
              h: num,
              l: num,
              c: num,
              label: label.optional(),
              size: z.enum(['s', 'm', 'l']).optional(),
            }),
          )
          .min(1),
        annotate: z.literal('ohlc').optional(),
      }),
    )
    .min(1),
  join: chartString(4).optional(),
  alt: label,
});

/**
 * K8: boxes and arrows with fixed layouts. Renderer: a `row` with 4+ nodes switches to `column` below 560px;
 * labelled edges (C1L5-g1, C1L6-g1) render the label beside the arrow. Pure step sequences without branching
 * use the HTML `steps` block instead (C1L10-g4, C5L3-g3, C5L4-g0).
 */
const flowSchema = z.strictObject({
  kind: z.literal('flow'),
  layout: z.enum(['row', 'column', 'cycle']),
  header: z.strictObject({ text: label, tone: chartToneSchema }).optional(),
  nodes: z
    .array(
      z.strictObject({
        id: keyId,
        title: label,
        sub: label.optional(),
        value: label.optional(),
        tone: chartToneSchema.optional(),
        emph: z.literal(true).optional(),
        children: z
          .array(z.strictObject({ title: label, sub: label.optional(), tone: chartToneSchema.optional() }))
          .optional(),
        caption: label.optional(),
      }),
    )
    .min(2),
  edges: z
    .union([
      z.literal('sequential'),
      z.array(z.strictObject({ from: keyId, to: keyId, label: label.optional() })).min(1),
    ])
    .optional(),
  alt: label.optional(),
});

/** One-off pictures (11 ids): a tiny tone-classed shape list in a fixed viewBox. No raw SVG strings. */
const diagramShapeSchema = z.discriminatedUnion('t', [
  z.strictObject({
    t: z.literal('rect'),
    x: num,
    y: num,
    w: num,
    h: num,
    r: num.optional(),
    fill: chartToneSchema.optional(),
    stroke: chartToneSchema.optional(),
    opacity: z.number().min(0).max(1).optional(),
    dash: z.literal(true).optional(),
  }),
  z.strictObject({
    t: z.literal('circle'),
    cx: num,
    cy: num,
    r: num,
    fill: chartToneSchema.optional(),
    stroke: chartToneSchema.optional(),
    opacity: z.number().min(0).max(1).optional(),
  }),
  z.strictObject({
    t: z.literal('line'),
    x1: num,
    y1: num,
    x2: num,
    y2: num,
    stroke: chartToneSchema,
    width: num.optional(),
    dash: z.literal(true).optional(),
    arrow: z.enum(['end', 'both']).optional(),
  }),
  z.strictObject({
    t: z.literal('path'),
    /** Only M/L/Q/C/A/Z commands with numbers; validated below. */
    d: z.string().regex(/^[MLHVQCAZmlhvqcaz0-9.,\s-]+$/).max(4000),
    fill: chartToneSchema.optional(),
    stroke: chartToneSchema.optional(),
    width: num.optional(),
    opacity: z.number().min(0).max(1).optional(),
  }),
  z.strictObject({
    t: z.literal('text'),
    x: num,
    y: num,
    text: label,
    tone: chartTextToneSchema.optional(),
    size: z.enum(['s', 'm', 'l']).optional(),
    anchor: z.enum(['start', 'middle', 'end']).optional(),
    weight: z.enum(['normal', 'bold']).optional(),
  }),
]);

/**
 * Diagrams scale with the container, so text inside them shrinks on a phone. Text shapes are allowed only
 * when the view_box is at most DIAGRAM_TEXT_MAX_WIDTH wide (at 358px that keeps 11px text >= 11px).
 * Wider pictures with words must become flow / compare / funnel / segment_bar / steps instead.
 */
export const DIAGRAM_TEXT_MAX_WIDTH = 320;
const diagramSchema = z
  .strictObject({
    kind: z.literal('diagram'),
    view_box: z.tuple([z.number().positive(), z.number().positive()]),
    shapes: z.array(diagramShapeSchema).min(1).max(400),
    alt: label,
  })
  .superRefine((d, ctx) => {
    if (d.view_box[0] > DIAGRAM_TEXT_MAX_WIDTH && d.shapes.some((s) => s.t === 'text'))
      ctx.addIssue({ code: 'custom', message: `diagram with text must be <= ${DIAGRAM_TEXT_MAX_WIDTH} wide` });
  });

/** Every chart model except `compare` (keeps the schema and the renderer non-recursive). */
export const leafChartModelSchema = z.discriminatedUnion('kind', [
  seriesPanelsSchema,
  categorySchema,
  segmentBarSchema,
  scaleSchema,
  schematicSchema,
  ganttSchema,
  milestonesSchema,
  candleGlyphsSchema,
  flowSchema,
  diagramSchema,
]).meta({ id: 'AcademyLeafChartModel' });
export type LeafChartModel = z.infer<typeof leafChartModelSchema>;

/** Side by side (`row`, stacks below 560px) or stacked (`stack`) small multiples. */
const compareSchema = z.strictObject({
  kind: z.literal('compare'),
  layout: z.enum(['row', 'stack']),
  title: label.optional(),
  items: z
    .array(z.strictObject({ title: label.optional(), tone: chartToneSchema.optional(), model: leafChartModelSchema }))
    .min(2)
    .max(6),
});

export const chartModelSchema = z.discriminatedUnion('kind', [
  seriesPanelsSchema,
  categorySchema,
  segmentBarSchema,
  scaleSchema,
  schematicSchema,
  ganttSchema,
  milestonesSchema,
  candleGlyphsSchema,
  flowSchema,
  diagramSchema,
  compareSchema,
]).meta({ id: 'AcademyChartModel' });
export type ChartModel = z.infer<typeof chartModelSchema>;
export type ChartKind = ChartModel['kind'];

/** Chart ids: mockup svg id lowercased with an explicit chapter prefix (`L1-g1` in ch2 -> `c2l1-g1`). */
export const chartIdSchema = z.string().regex(/^c\d{1,2}l\d{1,2}-[a-z0-9-]{1,24}$/);

/* ============================================================== 3. blocks */

/** Block tones (text/cards), distinct from chart tones. */
/** `info` (#7fb8ff blue) and `violet` (#c9a0f0) carry the mockup's colour-coded groups (ch1 l8/l9, ch2 l1/l9). */
export const cardToneSchema = z.enum(['neutral', 'highlight', 'pos', 'neg', 'good', 'bad', 'warn', 'info', 'violet']);

/* --- prose --- */
const paragraphBlock = z.strictObject({ type: z.literal('paragraph'), text: inlineHtml });
/** A second heading inside one section (rare). */
const headingBlock = z.strictObject({ type: z.literal('heading'), text: plainText });
/** Disclaimer label ("Số liệu giả định để minh họa"); chapter 2 only (spec §2.2). */
const noteBlock = z.strictObject({ type: z.literal('note'), text: plainText });

/* --- figures --- */
const chartBlock = z.strictObject({
  type: z.literal('chart'),
  chart_id: chartIdSchema,
  title: plainText.optional(),
  legend: legendSchema.optional(),
  /** `span.assume` inside the figure. */
  note: plainText.optional(),
  /** Offer "Xem bảng số liệu" (data kinds only: series_panels, category, segment_bar). */
  table_toggle: z.boolean().optional(),
});

/**
 * `.st4` with svgs (2x2), `.pat` (5 patterns), `.adv` (icon rows: layout rows). A `.st4` without svgs
 * (ch05-l04 "Áp dụng tại Việt Nam") is a `cards{columns:2}` block instead. Renderer: grids keep at least
 * 2 columns on a phone with items capped near 180px; `rows` stacks text under the chart below 560px.
 */
const chartGridBlock = z.strictObject({
  type: z.literal('chart_grid'),
  layout: z.enum(['grid', 'rows']),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  items: z
    .array(z.strictObject({ chart_id: chartIdSchema, title: plainText, text: inlineHtml.optional() }))
    .min(2)
    .max(10),
});

const tableCellSchema = z.union([
  inlineHtml,
  z.strictObject({ rating: z.enum(['good', 'mid', 'bad']), text: plainText }),
  /** Styled or merged cell (ch03-l01 "Kết hợp" row: colspan 2 + highlight). */
  z.strictObject({
    text: inlineHtml,
    tone: cardToneSchema.optional(),
    colspan: z.number().int().min(2).max(8).optional(),
    highlight: z.literal(true).optional(),
  }),
]);
const cellSpan = (c: z.infer<typeof tableCellSchema>) => (typeof c === 'object' && 'colspan' in c ? (c.colspan ?? 1) : 1);

/** `table.cmp` (grid), `.cmp.two` (rows: first column is the row label), `.cmp.step` (grouped: rowspan). */
const tableBlock = z
  .strictObject({
    type: z.literal('table'),
    variant: z.enum(['grid', 'rows', 'grouped']),
    title: plainText.optional(),
    columns: z
      .array(
        z.strictObject({
          label: visibleString(80, { allowEmpty: true }),
          highlight: z.literal(true).optional(),
          tone: cardToneSchema.optional(),
          align: z.enum(['l', 'r', 'c']).optional(),
        }),
      )
      .min(1),
    rows: z
      .array(
        z.strictObject({
          group: z.strictObject({ label: plainText, span: z.number().int().min(1) }).optional(),
          cells: z.array(tableCellSchema).min(1),
        }),
      )
      .min(1),
    aria_label: plainText.optional(),
  })
  .superRefine((t, ctx) => {
    let groupLeft = 0;
    for (const r of t.rows) {
      if (r.group) {
        if (t.variant !== 'grouped') ctx.addIssue({ code: 'custom', message: 'group only in grouped tables' });
        groupLeft = r.group.span;
      }
      const width = r.cells.reduce((n, c) => n + cellSpan(c), 0) + (t.variant === 'grouped' ? 1 : 0);
      if (width !== t.columns.length) ctx.addIssue({ code: 'custom', message: 'row width differs from columns' });
      groupLeft -= 1;
    }
    if (groupLeft > 0) ctx.addIssue({ code: 'custom', message: 'group span past the last row' });
  });

/* --- cards and lists --- */
/** `.ex2` (2), `.ex2.r3`/`.ex3` (3), `.vvca` (4, eyebrow), `.three` (tip), `.mis` (mistake). */
const cardsBlock = z.strictObject({
  type: z.literal('cards'),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  style: z.enum(['card', 'tip', 'mistake']),
  items: z
    .array(
      z.strictObject({
        eyebrow: plainText.optional(),
        title: plainText,
        title_tone: cardToneSchema.optional(),
        subtitle: plainText.optional(),
        text: inlineHtml.optional(),
        bullets: z.array(inlineHtml).optional(),
        facts: z.array(z.strictObject({ label: plainText, value: plainText })).optional(),
        tone: cardToneSchema.optional(),
      }),
    )
    .min(1)
    .max(12),
});

/** `.flow4` and step flows drawn as SVG (C1L10-g4, C5L3-g3, C5L4-g0 are TEXT_FIGURES -> steps). Responsive HTML. */
const stepsBlock = z.strictObject({
  type: z.literal('steps'),
  items: z
    .array(
      z.strictObject({
        label: plainText.optional(),
        title: plainText,
        value: plainText.optional(),
        text: inlineHtml.optional(),
      }),
    )
    .min(2)
    .max(7),
});

/** `.roles` term lists; `marker: 'check'` for the read-only checklist card (C1L10-g5, Lucide Check). */
const definitionsBlock = z.strictObject({
  type: z.literal('definitions'),
  title: plainText.optional(),
  marker: z.literal('check').optional(),
  items: z
    .array(z.strictObject({ term: plainText, text: inlineHtml, tone: cardToneSchema.optional() }))
    .min(1)
    .max(16),
});

/** `.three3 > .p3` (hero, Lucide icon), `.mini3` (chip), `.big3` (big). */
const statsBlock = z.strictObject({
  type: z.literal('stats'),
  variant: z.enum(['hero', 'chip', 'big']),
  items: z
    .array(
      z.strictObject({
        label: plainText,
        value: plainText,
        note: plainText.optional(),
        icon: z.enum(['vault', 'landmark', 'chart-line']).optional(),
        highlight: z.literal(true).optional(),
        tone: cardToneSchema.optional(),
      }),
    )
    .min(2)
    .max(4),
});

/** `.st3` margin gauges. */
const gaugesBlock = z.strictObject({
  type: z.literal('gauges'),
  items: z
    .array(
      z.strictObject({
        label: plainText,
        value: plainText,
        pct: z.number().min(0).max(100),
        caption: plainText,
        badge: plainText,
        tone: z.enum(['ok', 'warn', 'bad']),
      }),
    )
    .min(2)
    .max(4),
});

/** Receipts / order ticket drawn as SVG (C1L3-g1, C1L4-g2). */
const kvCardsBlock = z.strictObject({
  type: z.literal('kv_cards'),
  items: z
    .array(
      z.strictObject({
        title: plainText,
        tone: cardToneSchema.optional(),
        rows: z.array(z.strictObject({ label: plainText, value: plainText })).min(1),
        total: z.strictObject({ label: plainText, value: plainText, tone: cardToneSchema.optional() }).optional(),
      }),
    )
    .min(1)
    .max(3),
});

/** `a ÷ b = c` rows (C5L2-g3). */
const formulaBlock = z.strictObject({
  type: z.literal('formula'),
  rows: z
    .array(
      z.strictObject({
        label: plainText,
        a: plainText,
        op: z.enum(['÷', '×', '+', '-']),
        b: plainText,
        result: plainText,
      }),
    )
    .min(1),
});

/** Big glyph tiles with optional group brackets (C4L9-g1, C5L3-g1, C5L4-g1). */
const tilesBlock = z.strictObject({
  type: z.literal('tiles'),
  items: z
    .array(
      z.strictObject({
        glyph: visibleString(12),
        title: plainText.optional(),
        sub: plainText.optional(),
        highlight: z.literal(true).optional(),
      }),
    )
    .min(2)
    .max(16),
  groups: z
    .array(z.strictObject({ from: z.number().int().min(0), to: z.number().int().min(0), label: plainText }))
    .optional(),
  /** Secondary row of ratio cards (C4L9-g1). */
  facts: z.array(z.strictObject({ label: plainText, value: plainText })).optional(),
});

/* --- sales chapters --- */
/** `.say` (g = Nên, r = Không nên, plain = Mẫu). */
const quoteBlock = z.strictObject({
  type: z.literal('quote'),
  label: plainText,
  text: inlineHtml,
  tone: z.enum(['good', 'bad', 'neutral']),
});
/** `.obj` objection + response. */
const objectionBlock = z.strictObject({ type: z.literal('objection'), objection: plainText, response: inlineHtml });
/** `.fun` funnel bars (widths in %). */
const funnelBlock = z.strictObject({
  type: z.literal('funnel'),
  items: z
    .array(z.strictObject({ label: plainText, note: plainText.optional(), pct: z.number().min(1).max(100), tone: chartToneSchema }))
    .min(2)
    .max(8),
});
/** `.post` social post mockup; `body` keeps line breaks (white-space: pre-line). */
const samplePostBlock = z.strictObject({
  type: z.literal('sample_post'),
  kicker: plainText,
  author: plainText,
  audience: plainText,
  body: z.string().min(1).max(4000).refine(visible, 'banned visible text'),
  why: inlineHtml,
});

/* --- interactive (chapter 2, chapter 3, practice only) --- */
/**
 * `.cz[data-a]`: exactly one per ch2/ch3 lesson. The best option and debrief are PUBLIC lesson content by
 * design (spec §2.3-5): the scenario is a teaching device, not graded. Field names deliberately avoid the
 * quiz words (`answer`, `correct`, `explanation`) so the "no answers in responses" key scan stays strict.
 */
const scenarioBlock = z.strictObject({
  type: z.literal('scenario'),
  title: plainText,
  story: z.array(inlineHtml).min(1),
  question: plainText,
  options: z.tuple([plainText, plainText, plainText]),
  best_option: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  debrief: inlineHtml,
});
/** `.todo` (todo) and `.todo.audit` (self_check, shows x/N). Notes key: `${id}:${item.id}`. */
const checklistBlock = z.strictObject({
  type: z.literal('checklist'),
  id: keyId,
  mode: z.enum(['todo', 'self_check']),
  title: plainText,
  items: z.array(z.strictObject({ id: keyId, text: plainText })).min(1).max(12),
  /** self_check only: the counter label ("Số mục đã đạt"), rendered as "{label}: x/N". */
  result_label: plainText.optional(),
});
/** `.pad` textarea. Prompts render one per line, 15px, foreground. Notes key: `id`. */
const workpadBlock = z.strictObject({
  type: z.literal('workpad'),
  id: keyId,
  title: plainText,
  prompts: z.array(plainText).max(6),
  placeholder: plainText.optional(),
});
/**
 * Chapter 2 lesson 1 "TỰ TÍNH". Policy numbers are content, not code. Not persisted.
 * Result = Math.round(max(0, clients) * max(0, value) * 1e6 * fee_rate * share_rate), formatted as VND.
 */
const incomeCalculatorBlock = z.strictObject({
  type: z.literal('income_calculator'),
  title: plainText,
  fee_rate: z.number().positive().max(0.05),
  share_rate: z.number().positive().max(1),
  clients: z.strictObject({ label: plainText, default: z.number().int().min(0) }),
  monthly_value_million: z.strictObject({ label: plainText, default: z.number().min(0) }),
  result_label: plainText,
  note: plainText.optional(),
});
/** Practice room case: profile, 4 prompts + pad (notes key `id`), reveal of hints. */
const practiceCaseBlock = z.strictObject({
  type: z.literal('practice_case'),
  id: keyId,
  title: plainText,
  /** Pad heading ("Bạn tự phân tích trước"). */
  pad_title: plainText,
  profile: z.strictObject({
    info: z.array(plainText).min(1),
    mindset: z.array(plainText).min(1),
    quote: plainText,
  }),
  prompts: z.array(plainText).length(4),
  placeholder: plainText.optional(),
  hints: z.array(z.strictObject({ term: plainText, text: inlineHtml })).min(1),
});
/** Practice room roleplay: 6 criteria x 0..max, bands by total. Persisted in notes.scores[id]. */
const roleplayScoreBlock = z.strictObject({
  type: z.literal('roleplay_score'),
  id: keyId,
  title: plainText,
  max: z.literal(10),
  /** Starting slider value before anything is stored (mockup: 5, i.e. 30/60). */
  default: z.number().int().min(0).max(10),
  criteria: z.array(z.strictObject({ title: plainText, hint: plainText })).length(6),
  bands: z
    .array(z.strictObject({ min: z.number().int().min(0), label: plainText, tone: z.enum(['good', 'warn', 'bad']) }))
    .min(2),
});

export const STATIC_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'note',
  'chart',
  'chart_grid',
  'table',
  'cards',
  'steps',
  'definitions',
  'stats',
  'gauges',
  'kv_cards',
  'formula',
  'tiles',
  'quote',
  'objection',
  'funnel',
  'sample_post',
] as const;
export const INTERACTIVE_BLOCK_TYPES = [
  'scenario',
  'checklist',
  'workpad',
  'income_calculator',
  'practice_case',
  'roleplay_score',
] as const;

export const blockSchema = z.discriminatedUnion('type', [
  paragraphBlock,
  headingBlock,
  noteBlock,
  chartBlock,
  chartGridBlock,
  tableBlock,
  cardsBlock,
  stepsBlock,
  definitionsBlock,
  statsBlock,
  gaugesBlock,
  kvCardsBlock,
  formulaBlock,
  tilesBlock,
  quoteBlock,
  objectionBlock,
  funnelBlock,
  samplePostBlock,
  scenarioBlock,
  checklistBlock,
  workpadBlock,
  incomeCalculatorBlock,
  practiceCaseBlock,
  roleplayScoreBlock,
]).meta({ id: 'AcademyBlock' });
export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block['type'];
export type InteractiveBlock = Extract<Block, { type: (typeof INTERACTIVE_BLOCK_TYPES)[number] }>;
export type StaticBlock = Exclude<Block, InteractiveBlock>;
export type ScenarioBlock = z.infer<typeof scenarioBlock>;

export function isInteractiveBlock(b: Block): b is InteractiveBlock {
  return (INTERACTIVE_BLOCK_TYPES as readonly string[]).includes(b.type);
}

/* ============================================================== 4. ids, keys, catalog */

export const ACADEMY_V3_CATALOG_VERSION = 'iqx-academy-v3.2-14ch-94lessons';
export const ACADEMY_V3_CHAPTER_COUNT = 14;
/** Sum of `lesson_count` over all 14 chapters (required lessons only). */
export const ACADEMY_V3_LESSON_COUNT = 94;

export const itemIdSchema = z.string().regex(/^ch\d{2}-(?:l\d{2}|exam|practice)$/);
export const lessonIdSchema = z.string().regex(/^ch\d{2}-(?:l\d{2}|practice)$/);
/** Same alphabet as DB check ck_academy_completions_key after migration 0026. */
export const lessonKeySchema = z.string().regex(/^(?:technical|fundamental|concept|guide|exam):[a-z0-9_-]{1,80}$/);

export const itemKindSchema = z.enum(['lesson', 'practice', 'chapter_exam']);
export type ItemKind = z.infer<typeof itemKindSchema>;
export const itemStateSchema = z.enum(['passed', 'open', 'locked']);
export type ItemState = z.infer<typeof itemStateSchema>;

/** Indicator unlocked by passing the lesson (ch04-l04..l08). capability = `indicator:<id>`. */
export const unlockSchema = z.strictObject({
  kind: z.literal('technical'),
  id: z.enum(['volume', 'ma', 'rsi', 'macd', 'bollinger']),
  label: plainText,
});

/** Lessons: 3 questions in ch1-3, 5 from ch4. Exams: 20 in ch1-3, 30 from ch4. Pass = all correct. */
export function questionCountFor(chapter: number, kind: ItemKind): number {
  if (kind === 'chapter_exam') return chapter <= 3 ? 20 : 30;
  return chapter <= 3 ? 3 : 5;
}

export const catalogItemSchema = z.strictObject({
  id: itemIdSchema,
  kind: itemKindSchema,
  lesson_key: lessonKeySchema,
  /** 1-based position inside the chapter: lessons 1..n, exam n+1, practice n+2. */
  order: z.number().int().min(1),
  name: plainText,
  optional: z.boolean(),
  question_count: z.number().int().min(1).max(30),
  unlock: unlockSchema.nullable(),
  has_scenario: z.boolean(),
  /** Exam intro sentence(s) (spec §3.3); null for lessons. */
  intro: plainText.nullable(),
});
export type CatalogItem = z.infer<typeof catalogItemSchema>;

const publishedChapterSchema = z.strictObject({
  no: z.number().int().min(1).max(ACADEMY_V3_CHAPTER_COUNT),
  title: plainText,
  published: z.literal(true),
  /** Reserved for limiting ch2-3 to team members later (spec §1.3-5). */
  audience: z.literal('all'),
  /** Required lessons only (practice and exam excluded). */
  lesson_count: z.number().int().min(1),
  items: z.array(catalogItemSchema).min(2),
});
const stubChapterSchema = z.strictObject({
  no: z.number().int().min(1).max(ACADEMY_V3_CHAPTER_COUNT),
  title: plainText,
  published: z.literal(false),
  lesson_count: z.number().int().min(1),
});
export const catalogChapterSchema = z.discriminatedUnion('published', [publishedChapterSchema, stubChapterSchema]);
export type CatalogChapter = z.infer<typeof catalogChapterSchema>;
export type PublishedChapter = z.infer<typeof publishedChapterSchema>;

const pad2 = (n: number) => String(n).padStart(2, '0');

export const catalogFileSchema = z
  .strictObject({
    format: z.literal('iqx-academy-catalog-v3'),
    catalog_version: z.literal(ACADEMY_V3_CATALOG_VERSION),
    chapters: z.array(catalogChapterSchema).length(ACADEMY_V3_CHAPTER_COUNT),
  })
  .superRefine((c, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    let total = 0;
    let seenStub = false;
    const ids = new Set<string>();
    const keys = new Set<string>();
    c.chapters.forEach((ch, idx) => {
      total += ch.lesson_count;
      if (ch.no !== idx + 1) issue(`chapter ${idx} must have no ${idx + 1}`);
      if (!ch.published) {
        seenStub = true;
        return;
      }
      if (seenStub) issue(`published chapter ${ch.no} after an unpublished one`);
      const cc = `ch${pad2(ch.no)}`;
      const lessons = ch.items.filter((i) => i.kind === 'lesson');
      const exams = ch.items.filter((i) => i.kind === 'chapter_exam');
      if (lessons.length !== ch.lesson_count) issue(`${cc}: lesson_count ${ch.lesson_count} != ${lessons.length}`);
      if (exams.length !== 1) issue(`${cc}: exactly one exam`);
      ch.items.forEach((it, k) => {
        if (it.order !== k + 1) issue(`${it.id}: order must be ${k + 1}`);
        if (ids.has(it.id) || keys.has(it.lesson_key)) issue(`${it.id}: duplicate id or key`);
        ids.add(it.id);
        keys.add(it.lesson_key);
        if (it.question_count !== questionCountFor(ch.no, it.kind)) issue(`${it.id}: question_count`);
        if (it.optional !== (it.kind === 'practice')) issue(`${it.id}: only practice is optional`);
        if (it.has_scenario !== (it.kind === 'lesson' && (ch.no === 2 || ch.no === 3)))
          issue(`${it.id}: has_scenario must be true exactly for ch2/ch3 lessons`);
        if ((it.intro !== null) !== (it.kind === 'chapter_exam')) issue(`${it.id}: intro only on exams`);
        if (it.unlock && !(it.lesson_key === `technical:${it.unlock.id}` && it.kind === 'lesson'))
          issue(`${it.id}: unlock requires lesson_key technical:${it.unlock.id}`);
        if (it.kind === 'lesson') {
          if (it.id !== `${cc}-l${pad2(k + 1)}`) issue(`${it.id}: lesson id must be ${cc}-l${pad2(k + 1)}`);
          if (!it.unlock && !it.lesson_key.startsWith('concept:')) issue(`${it.id}: non-indicator lessons use concept:`);
        }
        if (it.kind === 'chapter_exam') {
          if (it.id !== `${cc}-exam` || it.lesson_key !== `exam:${cc}`) issue(`${it.id}: exam id/key`);
          if (k !== lessons.length) issue(`${it.id}: exam must follow the last lesson`);
        }
        if (it.kind === 'practice') {
          if (it.id !== `${cc}-practice` || !it.lesson_key.startsWith('concept:')) issue(`${it.id}: practice id/key`);
          if (k <= lessons.length) issue(`${it.id}: practice must follow the exam`);
        }
      });
    });
    if (total !== ACADEMY_V3_LESSON_COUNT) issue(`sum of lesson_count must be ${ACADEMY_V3_LESSON_COUNT}, got ${total}`);
  });
export type CatalogFile = z.infer<typeof catalogFileSchema>;

/** Names of lesson keys that are no longer in the catalog (shop ledger history). */
export const retiredLessonsFileSchema = z.strictObject({
  format: z.literal('iqx-academy-retired-v3'),
  lessons: z.array(z.strictObject({ lesson_key: lessonKeySchema, name: z.string().min(1).max(200) })),
});
export type RetiredLessonsFile = z.infer<typeof retiredLessonsFileSchema>;

/* ============================================================== 3b. lesson file */

export const sectionSchema = z.strictObject({
  id: z.string().regex(/^s\d{1,2}$/),
  title: plainText,
  blocks: z.array(blockSchema).min(1),
});
export type Section = z.infer<typeof sectionSchema>;

export const lessonFileSchema = z
  .strictObject({
    format: z.literal('iqx-academy-lesson-v3'),
    id: lessonIdSchema,
    lesson_key: lessonKeySchema,
    kind: z.enum(['lesson', 'practice']),
    chapter: z.number().int().min(1).max(ACADEMY_V3_CHAPTER_COUNT),
    order: z.number().int().min(1),
    title: plainText,
    lead: inlineHtml,
    /**
     * Static blocks between the lead and section 1 that sit outside any `.sec` in the mockup
     * (ch01-l01: hero stats + C1L1-g1). Empty for every other lesson.
     */
    intro_blocks: z.array(blockSchema).max(6),
    /** Sections without the final "Tóm tắt"; the shell renders `summary` under that heading. */
    sections: z.array(sectionSchema).min(1).max(16),
    summary: z.array(inlineHtml).min(1).max(8),
    charts: z.record(chartIdSchema, chartModelSchema),
  })
  .superRefine((l, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message: `${l.id}: ${message}` });
    l.sections.forEach((s, i) => {
      if (s.id !== `s${i + 1}`) issue(`section ${i} must be s${i + 1}`);
    });
    if (l.intro_blocks.some(isInteractiveBlock)) issue('intro_blocks must be static');
    const blocks = [...l.intro_blocks, ...l.sections.flatMap((s) => s.blocks)];
    const interactiveAllowed = l.chapter === 2 || l.chapter === 3;
    const scenarios = blocks.filter((b) => b.type === 'scenario').length;
    const wantScenario = l.kind === 'lesson' && interactiveAllowed ? 1 : 0;
    if (scenarios !== wantScenario) issue(`expected ${wantScenario} scenario block(s), found ${scenarios}`);
    if (!interactiveAllowed && blocks.some(isInteractiveBlock)) issue('interactive blocks only in ch2/ch3');
    if (l.kind === 'practice' && l.chapter !== 3) issue('practice belongs to chapter 3');
    if (l.chapter !== 2 && blocks.some((b) => b.type === 'note')) issue('note blocks are chapter 2 only');
    const referenced = new Set<string>();
    for (const b of blocks) {
      if (b.type === 'chart') referenced.add(b.chart_id);
      if (b.type === 'chart_grid') b.items.forEach((i) => referenced.add(i.chart_id));
    }
    for (const id of referenced) if (!(id in l.charts)) issue(`chart ${id} is referenced but missing`);
    for (const id of Object.keys(l.charts)) if (!referenced.has(id)) issue(`chart ${id} is never referenced`);
    const keys = interactiveKeysOf(l);
    if (keys.duplicates.length) issue(`duplicate interactive keys: ${keys.duplicates.join(', ')}`);
  });
export type LessonFile = z.infer<typeof lessonFileSchema>;

/* ============================================================== 5. question bank */

const optionIdSchema = z.string().regex(/^[0-9a-f]{10}$/);

/**
 * Option ids MUST NOT be derivable from public data (question id + source index would leak the key:
 * 271 of 280 source answers are index 0). Importer:
 *   option id = HMAC-SHA256(key = bank.salt, `${question id}|${source index}`).hex.slice(0, 10)
 * `salt` is 32 random bytes (hex) per bank, generated once and kept in
 * scripts/academy-v32-import/overrides/salts.json (committed; same secrecy as the committed banks)
 * so reruns are deterministic. The salt lives only in the private bank file and is never served.
 */
export const bankSaltSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const bankQuestionSchema = z
  .strictObject({
    /** `${item_id}-qNN`, NN = 01..30. */
    id: z.string().regex(/^ch\d{2}-(?:l\d{2}|exam|practice)-q\d{2}$/),
    prompt: plainText,
    /** Exactly 3 options. Ids: salted HMAC, see bankSaltSchema; not recomputable by a client. */
    options: z.array(z.strictObject({ id: optionIdSchema, text: plainText })).length(3),
    correct_option_id: optionIdSchema,
    /** Kept for later use; never served (spec §3.2-6). */
    explanation: plainText.optional(),
  })
  .superRefine((q, ctx) => {
    const ids = q.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: `${q.id}: option ids` });
    if (!ids.includes(q.correct_option_id)) ctx.addIssue({ code: 'custom', message: `${q.id}: correct option` });
  });
export type BankQuestion = z.infer<typeof bankQuestionSchema>;

export const bankFileSchema = z
  .strictObject({
    format: z.literal('iqx-academy-bank-v3'),
    item_id: itemIdSchema,
    /** Secret per bank. Also part of the hashed content, so the server-side bank version is unguessable. */
    salt: bankSaltSchema,
    questions: z.array(bankQuestionSchema).min(3).max(30),
  })
  .superRefine((b, ctx) => {
    b.questions.forEach((q, i) => {
      if (q.id !== `${b.item_id}-q${pad2(i + 1)}`)
        ctx.addIssue({ code: 'custom', message: `${q.id}: must be ${b.item_id}-q${pad2(i + 1)}` });
    });
    const prompts = b.questions.map((q) => q.prompt);
    if (new Set(prompts).size !== prompts.length) ctx.addIssue({ code: 'custom', message: 'duplicate prompts' });
  });
export type BankFile = z.infer<typeof bankFileSchema>;

/** Public projection served before submit. Order comes from the attempt, never from the file. */
export const publicQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  options: z.array(z.object({ id: z.string(), text: z.string() })),
});
export type PublicQuestion = z.infer<typeof publicQuestionSchema>;

export function toPublicQuestion(q: BankQuestion, optionOrder: readonly string[]): PublicQuestion {
  const byId = new Map(q.options.map((o) => [o.id, o.text] as const));
  return {
    id: q.id,
    prompt: q.prompt,
    options: optionOrder.map((id) => {
      const text = byId.get(id);
      if (text === undefined) throw new Error(`option ${id} not in ${q.id}`);
      return { id, text };
    }),
  };
}

/* ============================================================== 6. HTTP wire shapes */

export const ACADEMY_ERROR_CODES = [
  'FEATURE_DISABLED', // 404
  'LESSON_NOT_FOUND', // 404 unknown or unpublished item id
  'ATTEMPT_NOT_FOUND', // 404
  'NOTES_NOT_AVAILABLE', // 404 item has no workpad/checklist/practice_case/roleplay_score
  'ACADEMY_ITEM_LOCKED', // 403 GET content, notes, scenario, attempts of a locked item
  'ACADEMY_SCENARIO_REQUIRED', // 403 POST attempts for a ch2/ch3 lesson without a stored choice
  'CATALOG_VERSION_MISMATCH', // 409
  'IDEMPOTENCY_KEY_REUSED', // 409
  'ASSESSMENT_VERSION_MISMATCH', // 409 pinned bank no longer available
  'ATTEMPT_ALREADY_SUBMITTED', // 409 draft save on a submitted attempt
  'DRAFT_REVISION_CONFLICT', // 409 details[0].draft
  'NOTES_REVISION_CONFLICT', // 409 details[0].notes
  'NO_SCENARIO', // 422 POST scenario on an item without one
  'INVALID_ANSWERS', // 422
  'INVALID_NOTES', // 422 unknown key or bad value
  'NOTES_TOO_LARGE', // 422 > 65536 bytes serialized
] as const;
export type AcademyErrorCode = (typeof ACADEMY_ERROR_CODES)[number];

const catalogVersionField = z.string().min(1).max(64);
const isoDate = z.string();

export const rewardResultSchema = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('credited'), delta: z.number().int(), balance_after: z.number().int() }),
    z.object({ status: z.literal('already_rewarded'), balance_after: z.number().int() }),
    z.object({ status: z.literal('unavailable') }),
  ])
  .nullable();
export type RewardResult = z.infer<typeof rewardResultSchema>;

/* GET catalog (static, not user specific; published chapters only) */
export const catalogItemResponseSchema = z.object({
  id: z.string(),
  kind: itemKindSchema,
  lesson_key: z.string(),
  chapter: z.number().int(),
  order: z.number().int(),
  /** 1..lesson_count for required lessons ("Bài n / m"), null for exam and practice. */
  position: z.number().int().nullable(),
  name: z.string(),
  optional: z.boolean(),
  question_count: z.number().int(),
  unlock: z.object({ kind: z.literal('technical'), id: z.string(), label: z.string(), capability_id: z.string() }).nullable(),
  has_scenario: z.boolean(),
  intro: z.string().nullable(),
  /** null for exams (no lesson content). */
  content_version: z.string().nullable(),
});
export type CatalogItemResponse = z.infer<typeof catalogItemResponseSchema>;

export const catalogResponseSchema = z.object({
  catalog_version: z.string(),
  /** 43 now: required lessons of published chapters. */
  required_total: z.number().int(),
  chapters: z.array(
    z.object({
      no: z.number().int(),
      title: z.string(),
      audience: z.literal('all'),
      lesson_count: z.number().int(),
      items: z.array(catalogItemResponseSchema),
    }),
  ),
  /** lesson_key -> name for keys no longer in the catalog (shop ledger labels). */
  retired_lessons: z.array(z.object({ lesson_key: z.string(), name: z.string() })),
});
export type CatalogResponse = z.infer<typeof catalogResponseSchema>;

/* GET progress (user specific; server-computed states) */
export const progressItemSchema = z.object({
  id: z.string(),
  state: itemStateSchema,
  completed_at: isoDate.nullable(),
  completion_method: z.enum(['quiz', 'legacy_migration']).nullable(),
  /** Current catalog version only. */
  best_score: z.number().int().nullable(),
  attempts_submitted: z.number().int(),
});
export const progressResponseSchema = z.object({
  catalog_version: z.string(),
  progress_revision: z.number().int(),
  /** Required published lessons passed / total (x / 43). Exams and practice excluded. */
  course_done: z.number().int(),
  course_total: z.number().int(),
  /** First required item that is open and not passed; null when everything published is done. */
  current_item_id: z.string().nullable(),
  items: z.array(progressItemSchema),
  chapters: z.array(
    z.object({ no: z.number().int(), done: z.number().int(), total: z.number().int(), exam_passed: z.boolean() }),
  ),
  granted_capabilities: z.array(z.string()),
});
export type ProgressResponse = z.infer<typeof progressResponseSchema>;

/* GET lessons/:itemId (lesson, practice or exam; 403 ACADEMY_ITEM_LOCKED when locked) */
const itemStatusFields = {
  catalog_version: z.string(),
  state: itemStateSchema,
  completed_at: isoDate.nullable(),
  best_score: z.number().int().nullable(),
  attempts_submitted: z.number().int(),
};
export const lessonContentResponseSchema = catalogItemResponseSchema.extend({
  kind: z.enum(['lesson', 'practice']),
  ...itemStatusFields,
  content_version: z.string(),
  title: z.string(),
  lead: z.string(),
  intro_blocks: z.array(blockSchema),
  sections: z.array(z.object({ id: z.string(), title: z.string(), blocks: z.array(blockSchema) })),
  summary: z.array(z.string()),
  charts: z.record(z.string(), chartModelSchema),
  /**
   * Stored choice, or null when none OR when the stored row's scenario_hash differs from the current scenario
   * (content changed): the UI then shows the choice again and POST scenario replaces that stale row once.
   * The quiz gate is satisfied by any stored row for the key, stale or not.
   */
  scenario_choice: z.object({ choice: z.number().int().min(0).max(2), chosen_at: isoDate }).nullable(),
  /** Reward of the first pass, if any (never for exams). */
  reward: rewardResultSchema,
});
export const examResponseSchema = catalogItemResponseSchema.extend({
  kind: z.literal('chapter_exam'),
  ...itemStatusFields,
  intro: z.string(),
  chapter_title: z.string(),
});
export const itemResponseSchema = z.discriminatedUnion('kind', [
  lessonContentResponseSchema,
  examResponseSchema,
]);
export type ItemResponse = z.infer<typeof itemResponseSchema>;

/* POST lessons/:itemId/scenario  (insert once; replay returns the stored row, 200) */
export const scenarioChoiceRequestSchema = z.strictObject({
  choice: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});
export const scenarioChoiceResponseSchema = z.object({
  lesson_id: z.string(),
  /** The stored choice: a second call with a different choice returns the first one. */
  choice: z.number().int().min(0).max(2),
  chosen_at: isoDate,
  created: z.boolean(),
});

/* GET / PUT lessons/:itemId/notes */
export const NOTES_TEXT_MAX = 4000;
export const NOTES_TOTAL_MAX_BYTES = 65536;
export const notesResponseSchema = z.object({
  lesson_id: z.string(),
  /** 0 when nothing is stored yet. */
  revision: z.number().int(),
  /** workpad.id / practice_case.id -> text */
  texts: z.record(z.string(), z.string()),
  /** `${checklist.id}:${item.id}` -> checked */
  checks: z.record(z.string(), z.boolean()),
  /** roleplay_score.id -> six integers 0..10 */
  scores: z.record(z.string(), z.array(z.number().int())),
  updated_at: isoDate.nullable(),
});
export type NotesResponse = z.infer<typeof notesResponseSchema>;
/**
 * NUL and unpaired UTF-16 surrogates pass JSON.parse but Postgres jsonb rejects them (22P05 / 22P02), which
 * would surface as a 500. Refuse them at the edge so the client gets a 422.
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const notesTextSchema = z
  .string()
  .max(NOTES_TEXT_MAX)
  .refine((text) => !text.includes('\u0000') && !LONE_SURROGATE.test(text), {
    message: 'Text must not contain NUL or unpaired surrogate characters',
  });
export const notesSaveRequestSchema = z.strictObject({
  texts: z.record(z.string().max(NOTES_KEY_MAX), notesTextSchema).optional(),
  checks: z.record(z.string().max(NOTES_KEY_MAX), z.boolean()).optional(),
  scores: z.record(z.string().max(NOTES_KEY_MAX), z.array(z.number().int().min(0).max(10)).length(6)).optional(),
  /**
   * Optimistic guard: the revision the client last saw. 0 = the client believes no row exists; any stored
   * row then conflicts. Omitted = last write wins. Mismatch -> 409 NOTES_REVISION_CONFLICT.
   */
  expected_revision: z.number().int().min(0).max(2_147_483_647).optional(),
});
export type NotesSaveRequest = z.infer<typeof notesSaveRequestSchema>;

/* Attempts */
const answerSchema = z.object({ question_id: z.string().min(1).max(64), option_id: z.string().min(1).max(64) });

export const attemptCreateRequestSchema = z.strictObject({
  /** Any item id: lesson, practice or exam. */
  lesson_id: itemIdSchema,
  catalog_version: catalogVersionField,
  idempotency_key: z.string().min(8).max(128),
});
export const attemptResponseSchema = z.object({
  attempt_id: z.string(),
  lesson_id: z.string(),
  lesson_key: z.string(),
  kind: z.enum(['lesson', 'chapter_exam']),
  catalog_version: z.string(),
  content_version: z.string().nullable(),
  /* No assessment_version: the bank version stays server side (review: it allowed offline key search). */
  status: z.enum(['open', 'submitted']),
  total: z.number().int(),
  /** Server-shuffled question and option order, frozen in the attempt. */
  questions: z.array(publicQuestionSchema),
});
export const draftStateSchema = z.object({
  revision: z.number().int(),
  answers: z.array(answerSchema),
  answered_count: z.number().int(),
  total: z.number().int(),
  updated_at: isoDate.nullable(),
});
export const resumeResponseSchema = z.object({
  lesson_id: z.string(),
  lesson_key: z.string(),
  catalog_version: z.string(),
  attempt: attemptResponseSchema.extend({ created_at: isoDate, draft: draftStateSchema }).nullable(),
});
export const draftSaveRequestSchema = z.object({
  answers: z.array(answerSchema).max(64),
  expected_revision: z.number().int().min(0).max(2_147_483_647).optional(),
});
export const draftSaveResponseSchema = draftStateSchema.extend({ attempt_id: z.string() });
export const submitRequestSchema = z.object({
  answers: z.array(answerSchema).max(64),
  idempotency_key: z.string().min(8).max(128).optional(),
});
/** Score only: no correct option, no per-question result, no explanation (spec §3.2-4, §7-7). */
export const submitResponseSchema = z.object({
  attempt_id: z.string(),
  lesson_id: z.string(),
  lesson_key: z.string(),
  kind: z.enum(['lesson', 'chapter_exam']),
  catalog_version: z.string(),
  score: z.number().int(),
  total: z.number().int(),
  passed: z.boolean(),
  submitted_at: isoDate,
  best_score: z.number().int(),
  attempts_submitted: z.number().int(),
  completion: z.object({
    completed: z.boolean(),
    newly_completed: z.boolean(),
    completed_at: isoDate.nullable(),
  }),
  granted_capabilities: z.array(z.string()),
  newly_granted: z.array(z.string()),
  /** "Đã mở chỉ báo X" labels, from the item's unlock when newly granted. */
  unlocked_labels: z.array(z.string()),
  /** Exam passed: "Đã hoàn thành Chương c". */
  chapter_completed: z.number().int().nullable(),
  /** Next required item in the sequence (after passing), else null. */
  next_item_id: z.string().nullable(),
  progress_revision: z.number().int(),
  /** Always null for chapter exams. */
  reward: rewardResultSchema,
});
export type SubmitResponse = z.infer<typeof submitResponseSchema>;
export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
export const historyResponseSchema = z.object({
  lesson_id: z.string(),
  lesson_key: z.string(),
  catalog_version: z.string(),
  items: z.array(
    z.object({
      attempt_id: z.string(),
      submitted_at: isoDate,
      score: z.number().int(),
      total: z.number().int(),
      passed: z.boolean(),
    }),
  ),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  next_offset: z.number().int().nullable(),
});

/* ============================================================== 7. pure helpers */

export interface SequenceItem {
  id: string;
  kind: ItemKind;
  lesson_key: string;
  chapter: number;
  order: number;
  optional: boolean;
  /** Position in the flat sequence (0-based). */
  index: number;
}

/**
 * The learning chain over published chapters (spec §4.1):
 * ch1 lessons -> ch1 exam -> ch2 ... -> ch3 exam -> ch3 practice (optional) -> ch4 l01 ... -> ch5 exam.
 * Catalog item order already places exam after lessons and practice after the exam.
 */
export function buildSequence(catalog: CatalogFile): SequenceItem[] {
  const out: SequenceItem[] = [];
  for (const ch of catalog.chapters) {
    if (!ch.published) continue;
    for (const it of ch.items)
      out.push({
        id: it.id,
        kind: it.kind,
        lesson_key: it.lesson_key,
        chapter: ch.no,
        order: it.order,
        optional: it.optional,
        index: out.length,
      });
  }
  return out;
}

/**
 * Prefix rule (owner decision): an item is open iff EVERY earlier required item is passed.
 * Optional items never block. A passed item is `passed` even when out of order (migrated
 * indicator lessons), so it stays reviewable while the chain before it is still locked.
 */
export function itemStates(seq: readonly SequenceItem[], completedKeys: ReadonlySet<string>): Map<string, ItemState> {
  const states = new Map<string, ItemState>();
  let prefixDone = true;
  for (const it of seq) {
    const passed = completedKeys.has(it.lesson_key);
    states.set(it.id, passed ? 'passed' : prefixDone ? 'open' : 'locked');
    if (!it.optional && !passed) prefixDone = false;
  }
  return states;
}

export function currentItemId(seq: readonly SequenceItem[], states: ReadonlyMap<string, ItemState>): string | null {
  return seq.find((it) => !it.optional && states.get(it.id) === 'open')?.id ?? null;
}

/** Next required item after `id` (practice and exam included as sources; result is never optional). */
export function nextRequiredItemId(seq: readonly SequenceItem[], id: string): string | null {
  const at = seq.findIndex((it) => it.id === id);
  if (at < 0) return null;
  return seq.slice(at + 1).find((it) => !it.optional)?.id ?? null;
}

/** Notes keys a lesson accepts. Anything else is INVALID_NOTES. */
export function interactiveKeysOf(lesson: Pick<LessonFile, 'sections'>): {
  texts: Set<string>;
  checks: Set<string>;
  scores: Set<string>;
  duplicates: string[];
} {
  const texts = new Set<string>();
  const checks = new Set<string>();
  const scores = new Set<string>();
  const checklistIds = new Set<string>();
  const duplicates: string[] = [];
  /* Duplicates are checked per namespace: a workpad `l3` and a checklist `l3` (keys `l3:0`) do not collide. */
  const claim = (set: Set<string>, k: string, ns: string) => {
    if (set.has(k)) duplicates.push(`${ns}:${k}`);
    set.add(k);
  };
  for (const b of lesson.sections.flatMap((s) => s.blocks)) {
    if (b.type === 'workpad' || b.type === 'practice_case') {
      claim(texts, b.id, 'texts');
    } else if (b.type === 'checklist') {
      claim(checklistIds, b.id, 'checklist');
      for (const i of b.items) claim(checks, `${b.id}:${i.id}`, 'checks');
    } else if (b.type === 'roleplay_score') {
      claim(scores, b.id, 'scores');
    }
  }
  return { texts, checks, scores, duplicates };
}

export function scenarioOf(lesson: Pick<LessonFile, 'sections'>): ScenarioBlock | null {
  for (const s of lesson.sections) for (const b of s.blocks) if (b.type === 'scenario') return b;
  return null;
}
