import type { Block } from '../../../src/modules/academy/content/v3/schema.js';
import { attr, children, classes, hasClass } from '../dom.js';
import type { Element } from '../dom.js';
import { cardToneOf, inlineOf } from '../inline.js';
import type { Ctx } from './context.js';
import { fail } from './context.js';

type TableBlock = Extract<Block, { type: 'table' }>;
type Cell = TableBlock['rows'][number]['cells'][number];

/** `table.cmp` (grid), `.cmp.two` (rows), `.cmp.step` (grouped); `.bad` tones column 2. */
export function table(ctx: Ctx, el: Element): Block[] {
  const cls = classes(el);
  if (!cls.includes('cmp')) fail(ctx, el, 'table without .cmp');
  for (const c of cls)
    if (!['cmp', 'two', 'step', 'bad'].includes(c)) fail(ctx, el, `unknown table class ${c}`);
  const variant: TableBlock['variant'] = cls.includes('step')
    ? 'grouped'
    : cls.includes('two')
      ? 'rows'
      : 'grid';
  const body = children(el).filter((c) => c.tagName === 'tbody');
  if (body.length !== 1) fail(ctx, el, 'expected one tbody');
  const trs = children(body[0] as Element);
  const head = trs[0];
  if (!head || !children(head).every((c) => c.tagName === 'th'))
    fail(ctx, el, 'first row must be th');
  const columns: TableBlock['columns'] = children(head).map((th, k) => {
    for (const c of classes(th)) if (c !== 'ck') fail(ctx, th, `unknown th class ${c}`);
    return {
      label: ctx.norm.plain(th),
      ...(hasClass(th, 'ck') ? { highlight: true as const } : {}),
      ...(cls.includes('bad') && k === 1 ? { tone: 'bad' as const } : {}),
    };
  });

  const rows: TableBlock['rows'] = [];
  let groupLeft = 0;
  for (const tr of trs.slice(1)) {
    const tds = children(tr);
    if (!tds.every((c) => c.tagName === 'td')) fail(ctx, tr, 'body row with th');
    let group: TableBlock['rows'][number]['group'];
    let cellsEls = tds;
    if (variant === 'grouped' && groupLeft === 0) {
      // First cell opens a group: `td.sx[rowspan]`, or a plain first cell (span 1).
      const g = tds[0] as Element;
      const span = Number(attr(g, 'rowspan') ?? '1');
      group = { label: ctx.norm.plain(g), span };
      groupLeft = span;
      cellsEls = tds.slice(1);
    }
    groupLeft -= variant === 'grouped' ? 1 : 0;
    rows.push({ ...(group ? { group } : {}), cells: cellsEls.map((td) => cell(ctx, td)) });
  }
  return [{ type: 'table', variant, columns, rows }];
}

function cell(ctx: Ctx, td: Element): Cell {
  for (const c of classes(td)) if (c !== 'ck' && c !== 'sx') fail(ctx, td, `unknown td class ${c}`);
  const kids = children(td);
  const rating =
    kids.length === 1 && kids[0]?.tagName === 'span' && hasClass(kids[0], 'r')
      ? kids[0]
      : undefined;
  if (rating) {
    const r = classes(rating).find((c) => c !== 'r');
    const map = { g: 'good', m: 'mid', b: 'bad' } as const;
    if (r !== 'g' && r !== 'm' && r !== 'b') fail(ctx, rating, 'rating class');
    return { rating: map[r], text: ctx.norm.plain(rating) };
  }
  const text = inlineOf(ctx.norm, td);
  const colspan = attr(td, 'colspan');
  const tone = cardToneOf(td);
  if (colspan)
    return {
      text,
      colspan: Number(colspan),
      ...(hasClass(td, 'ck') ? { highlight: true as const } : {}),
    };
  if (tone) return { text, tone };
  return text;
}
