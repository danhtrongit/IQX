import { z } from 'zod';

/**
 * Typed lesson blocks served by `GET academy/lessons/:id` (the renderer contract).
 *
 * Content packages (`content/packages/chNN`) already use this vocabulary; legacy lessons
 * (`{ title, html }` sections of chapters 5-13) are normalised to one `html` block. Containers
 * (`callout`, `details`) hold leaf blocks only: a container inside a container is rejected at load,
 * which keeps the renderer and the OpenAPI schema non-recursive. All strings other than `html`
 * block bodies, `steps[].html` and table cells are plain text.
 */
const htmlBlockSchema = z.strictObject({ type: z.literal('html'), html: z.string().min(1) });

const tableBlockSchema = z.strictObject({
  type: z.literal('table'),
  /** Cells hold inline HTML (allowlist v2 inline subset). */
  head: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())).min(1),
  /** Column alignment (`l`/`r`/`c`), present only when a column is not left-aligned. */
  align: z.array(z.enum(['l', 'r', 'c'])).optional(),
  aria_label: z.string().min(1).optional(),
  /** Cells computed at import time from a chart model (chapter 1). */
  source: z
    .strictObject({
      kind: z.literal('computed'),
      hook: z.enum(['macd-seed', 'application']),
      chart_id: z.string().min(1).optional(),
    })
    .optional(),
});

const chartBlockSchema = z.strictObject({
  type: z.literal('chart'),
  /** Key of `LessonResponse.charts`. */
  chart_id: z.string().min(1),
  title: z.string().min(1),
  caption: z.string().min(1).optional(),
  /** Show the "Dữ liệu minh họa" tag. */
  illustrative: z.boolean().optional(),
  /** Offer the "Xem bảng số liệu của biểu đồ" toggle. */
  table_toggle: z.boolean(),
});

const imageBlockSchema = z.strictObject({
  type: z.literal('image'),
  asset_id: z.string().min(1),
  /** Public URL, `/assets/academy/chNN/<asset_id>.<sha8>.webp`. */
  src: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().min(1),
  /** Heading shown above the figure. */
  title: z.string().min(1),
  caption: z.string().min(1).optional(),
  /** Title shown in the lightbox. */
  zoom_title: z.string().min(1),
  /** Figure max width in CSS px. */
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

const leafBlockSchema = z.discriminatedUnion('type', [
  htmlBlockSchema,
  tableBlockSchema,
  chartBlockSchema,
  imageBlockSchema,
  stepsBlockSchema,
]);

const calloutBlockSchema = z.strictObject({
  type: z.literal('callout'),
  variant: z.enum(['notice', 'worked', 'signal-buy', 'signal-sell', 'filter-example']),
  title: z.string().min(1).optional(),
  aria_label: z.string().min(1).optional(),
  blocks: z.array(leafBlockSchema).min(1),
});

const detailsBlockSchema = z.strictObject({
  type: z.literal('details'),
  summary: z.string().min(1),
  blocks: z.array(leafBlockSchema).min(1),
});

export const lessonBlockSchema = z.discriminatedUnion('type', [
  htmlBlockSchema,
  tableBlockSchema,
  chartBlockSchema,
  imageBlockSchema,
  stepsBlockSchema,
  calloutBlockSchema,
  detailsBlockSchema,
]);

export type AcademyBlock = z.infer<typeof lessonBlockSchema>;
export type AcademyTableBlock = z.infer<typeof tableBlockSchema>;
export type AcademySection = { id: string; title: string; blocks: AcademyBlock[] };

/** Ids of the chart blocks of a block list, nested containers included, in reading order. */
export function chartIdsOf(blocks: readonly AcademyBlock[]): string[] {
  return blocks.flatMap((block): string[] => {
    if (block.type === 'chart') return [block.chart_id];
    if (block.type === 'callout' || block.type === 'details') return chartIdsOf(block.blocks);
    return [];
  });
}

/** Chart ids that computed tables were derived from (not rendered, but must exist). */
export function computedTableChartIdsOf(blocks: readonly AcademyBlock[]): string[] {
  return blocks.flatMap((block): string[] => {
    if (block.type === 'table') return block.source?.chart_id ? [block.source.chart_id] : [];
    if (block.type === 'callout' || block.type === 'details')
      return computedTableChartIdsOf(block.blocks);
    return [];
  });
}

/** Image blocks of a block list, nested containers included. */
export function imageBlocksOf(
  blocks: readonly AcademyBlock[],
): Extract<AcademyBlock, { type: 'image' }>[] {
  return blocks.flatMap((block): Extract<AcademyBlock, { type: 'image' }>[] => {
    if (block.type === 'image') return [block];
    if (block.type === 'callout' || block.type === 'details') return imageBlocksOf(block.blocks);
    return [];
  });
}
