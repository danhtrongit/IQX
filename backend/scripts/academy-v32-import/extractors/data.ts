import type { Block } from '../../../src/modules/academy/content/v3/schema.js';
import { ICONS } from '../charts/index.js';
import { attr, children, classes, hasClass, styleProp } from '../dom.js';
import type { Element } from '../dom.js';
import { cardToneOf, inlineOf } from '../inline.js';
import type { Ctx } from './context.js';
import { fail } from './context.js';
import { useChart } from './figures.js';
import { simpleCards } from './cards.js';

function only(ctx: Ctx, el: Element, tag: string): Element {
  const hits = children(el).filter((c) => c.tagName === tag);
  if (hits.length !== 1) fail(ctx, el, `expected one ${tag}`);
  return hits[0] as Element;
}

/** `.three3 > .p3` -> stats hero (Lucide icons for the three svgs). */
export function hero(ctx: Ctx, el: Element): Block[] {
  const items = children(el).map((p) => {
    if (!hasClass(p, 'p3')) fail(ctx, p, 'expected .p3');
    const svg = only(ctx, p, 'svg');
    const icon = ICONS[attr(svg, 'id') ?? ''];
    if (!icon) fail(ctx, svg, 'unknown hero icon');
    const b = only(ctx, p, 'b');
    const tone = cardToneOf(b);
    return {
      label: ctx.norm.plain(only(ctx, p, 'span')),
      value: ctx.norm.plain(b),
      note: ctx.norm.plain(only(ctx, p, 'small')),
      icon,
      ...(hasClass(p, 'on') ? { highlight: true as const } : {}),
      ...(tone ? { tone } : {}),
    };
  });
  return [{ type: 'stats', variant: 'hero', items }];
}

/** `.mini3` (chip) and `.big3` (big): span label + b value. */
export function stats(variant: 'chip' | 'big') {
  return (ctx: Ctx, el: Element): Block[] => {
    const items = children(el).map((d) => ({
      label: ctx.norm.plain(only(ctx, d, 'span')),
      value: ctx.norm.plain(only(ctx, d, 'b')),
    }));
    return [{ type: 'stats', variant, items }];
  };
}

/** `.st3` margin gauges. */
export function gauges(ctx: Ctx, el: Element): Block[] {
  const items = children(el).map((d) => {
    const c = classes(d)[0];
    if (c !== 'ok' && c !== 'warn' && c !== 'bad') return fail(ctx, d, 'gauge class');
    const tone: 'ok' | 'warn' | 'bad' = c;
    const w = styleProp(only(ctx, d, 'i'), '--w');
    const pct = Number((w ?? '').replace('%', ''));
    if (!w || !Number.isFinite(pct)) fail(ctx, d, 'gauge width');
    return {
      label: ctx.norm.plain(only(ctx, d, 'small')),
      value: ctx.norm.plain(only(ctx, d, 'b')),
      pct,
      caption: ctx.norm.plain(only(ctx, d, 'span')),
      badge: ctx.norm.plain(only(ctx, d, 'em')),
      tone,
    };
  });
  return [{ type: 'gauges', items }];
}

/** Consecutive `.adv` rows -> one chart_grid (rows, 2 columns). */
export function advRows(ctx: Ctx, els: Element[]): Block[] {
  const items = els.map((a) => {
    const svg = only(ctx, a, 'svg');
    const body = only(ctx, a, 'div');
    return {
      chart_id: useChart(ctx, svg),
      title: ctx.norm.plain(only(ctx, body, 'h3')),
      text: inlineOf(ctx.norm, only(ctx, body, 'p')),
    };
  });
  return [{ type: 'chart_grid', layout: 'rows', columns: 2, items }];
}

/** `.st4` (2x2) and `.pat` (5): svg + b title + span text. `.st4` without svgs -> cards. */
export function chartGrid(columns: 2 | 5) {
  return (ctx: Ctx, el: Element): Block[] => {
    const kids = children(el);
    if (columns === 2 && kids.every((d) => !children(d).some((c) => c.tagName === 'svg')))
      return simpleCards(2, 'card')(ctx, el);
    const items = kids.map((d) => ({
      chart_id: useChart(ctx, only(ctx, d, 'svg')),
      title: ctx.norm.plain(only(ctx, d, 'b')),
      text: inlineOf(ctx.norm, only(ctx, d, 'span')),
    }));
    return [{ type: 'chart_grid', layout: 'grid', columns, items }];
  };
}
