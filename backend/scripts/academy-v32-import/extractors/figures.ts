import type { Block, ChartModel } from '../../../src/modules/academy/content/v3/schema.js';
import { buildChart, chartIdOf, SVG_LEGENDS, TEXT_FIGURES } from '../charts/index.js';
import { legendTone } from '../charts/tones.js';
import { attr, children, classes, find, hasClass, styleProp } from '../dom.js';
import type { Element } from '../dom.js';
import type { Ctx } from './context.js';
import { fail } from './context.js';
import { table } from './tables.js';

/** Data kinds get the "Xem bảng số liệu" toggle. */
const TABLE_KINDS: ReadonlySet<ChartModel['kind']> = new Set([
  'series_panels',
  'category',
  'segment_bar',
]);

/** Register a chart model for an `svg[id]` and return its id (text figures and icons are not charts). */
export function useChart(ctx: Ctx, svg: Element): string {
  const svgId = attr(svg, 'id');
  if (!svgId) fail(ctx, svg, 'svg without id');
  const id = chartIdOf(svgId, ctx.chapter);
  if (!/^c\d+l\d+-/.test(id) || !id.startsWith(`c${ctx.chapter}l${Number(ctx.itemId.slice(6))}-`))
    fail(ctx, svg, `chart ${id} does not belong to ${ctx.itemId}`);
  if (ctx.charts[id]) fail(ctx, svg, `chart ${id} used twice`);
  ctx.charts[id] = buildChart(id);
  return id;
}

/** `.fig` / `.fig.tl`: a chart (title, legend, assume note), a text figure, or a table. */
export function figure(ctx: Ctx, el: Element): Block[] {
  for (const c of classes(el))
    if (c !== 'fig' && c !== 'tl') fail(ctx, el, `unknown figure class ${c}`);
  let svg: Element | undefined;
  let tbl: Element | undefined;
  let title: string | undefined;
  let legend: { label: string; tone: ReturnType<typeof legendTone> }[] | undefined;
  let note: string | undefined;
  for (const c of children(el)) {
    if (c.tagName === 'svg') svg = c;
    else if (c.tagName === 'table') tbl = c;
    else if (c.tagName === 'div' && hasClass(c, 'ftitle')) title = ctx.norm.plain(c);
    else if (c.tagName === 'div' && hasClass(c, 'legend'))
      legend = children(c).map((s) => {
        const dot = find(s, (e) => e.tagName === 'i');
        const bg = dot ? styleProp(dot, 'background') : undefined;
        if (!bg) fail(ctx, s, 'legend entry without dot colour');
        return { label: ctx.norm.plain(s), tone: legendTone(bg) };
      });
    else if (c.tagName === 'span' && hasClass(c, 'assume')) note = ctx.norm.plain(c);
    else fail(ctx, c, 'unexpected child in figure');
  }
  if (tbl) {
    if (svg || title || legend || note) fail(ctx, el, 'table figure with chart parts');
    return table(ctx, tbl);
  }
  if (!svg) fail(ctx, el, 'figure without svg or table');
  const cid = chartIdOf(attr(svg, 'id') ?? '', ctx.chapter);
  const text = TEXT_FIGURES[cid];
  if (text) {
    if (title || legend) fail(ctx, el, 'text figure with title or legend');
    return [...text(), ...(note ? [{ type: 'note' as const, text: note }] : [])];
  }
  const id = useChart(ctx, svg);
  const model = ctx.charts[id] as ChartModel;
  const lg = legend ?? SVG_LEGENDS[id];
  return [
    {
      type: 'chart',
      chart_id: id,
      ...(title ? { title } : {}),
      ...(lg ? { legend: lg } : {}),
      ...(note ? { note } : {}),
      ...(TABLE_KINDS.has(model.kind) ? { table_toggle: true } : {}),
    },
  ];
}
