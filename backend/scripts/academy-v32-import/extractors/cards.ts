import type { Block } from '../../../src/modules/academy/content/v3/schema.js';
import { children, classes, isText } from '../dom.js';
import type { Element, Node } from '../dom.js';
import { cardToneOf, inlineOf } from '../inline.js';
import type { CardTone } from '../inline.js';
import type { Ctx } from './context.js';
import { fail } from './context.js';

type CardsBlock = Extract<Block, { type: 'cards' }>;
type Card = CardsBlock['items'][number];

/** Children of an item, each tag at most once except the listed repeatable ones. */
function parts(ctx: Ctx, el: Element, allowed: readonly string[]): Map<string, Element> {
  const out = new Map<string, Element>();
  for (const n of el.childNodes as Node[])
    if (isText(n) && n.value.trim()) fail(ctx, el, `loose text "${n.value.trim().slice(0, 40)}"`);
  for (const c of children(el)) {
    const key = c.tagName;
    if (!allowed.includes(key)) fail(ctx, c, `unexpected ${key} (allowed ${allowed.join(', ')})`);
    if (out.has(key)) fail(ctx, c, `duplicate ${key}`);
    out.set(key, c);
  }
  return out;
}

/** `.roles` -> definitions. */
export function roles(ctx: Ctx, el: Element): Block[] {
  const items = children(el).map((d) => {
    const p = parts(ctx, d, ['b', 'span']);
    const b = p.get('b');
    const span = p.get('span');
    if (!b || !span) fail(ctx, d, 'role needs b and span');
    const tone = cardToneOf(b);
    return { term: ctx.norm.plain(b), text: inlineOf(ctx.norm, span), ...(tone ? { tone } : {}) };
  });
  return [{ type: 'definitions', items }];
}

const ITEM_TONE: Readonly<Record<string, CardTone>> = {
  on: 'highlight',
  up: 'pos',
  dn: 'neg',
  good: 'good',
  no: 'bad',
};

/** `.ex2`, `.ex2.r4`, `.ex2.r3`, `.ex3` -> cards (style card). */
export function exCards(ctx: Ctx, el: Element): Block[] {
  const cls = classes(el);
  const columns: CardsBlock['columns'] = cls.includes('ex3') || cls.includes('r3') ? 3 : 2;
  const items = children(el).map((d): Card => {
    const ic = classes(d);
    if (ic.length > 1 || (ic[0] && !ITEM_TONE[ic[0]]))
      fail(ctx, d, `unknown card class ${ic.join('.')}`);
    const tone = ic[0] ? ITEM_TONE[ic[0]] : undefined;
    const p = parts(ctx, d, ['b', 'small', 'p', 'ul', 'dl']);
    const b = p.get('b');
    if (!b) fail(ctx, d, 'card without b');
    const titleTone = cardToneOf(b);
    const small = p.get('small');
    const para = p.get('p');
    const ul = p.get('ul');
    const dl = p.get('dl');
    const card: Card = {
      title: ctx.norm.plain(b),
      ...(titleTone ? { title_tone: titleTone } : {}),
      ...(small ? { subtitle: ctx.norm.plain(small) } : {}),
      ...(para ? { text: inlineOf(ctx.norm, para) } : {}),
      ...(ul
        ? {
            bullets: children(ul).map((li) => {
              if (li.tagName !== 'li') fail(ctx, li, 'ul child must be li');
              return inlineOf(ctx.norm, li);
            }),
          }
        : {}),
      ...(dl ? { facts: facts(ctx, dl) } : {}),
      ...(tone ? { tone } : {}),
    };
    return card;
  });
  return [{ type: 'cards', columns, style: 'card', items }];
}

function facts(ctx: Ctx, dl: Element): { label: string; value: string }[] {
  const kids = children(dl);
  const out: { label: string; value: string }[] = [];
  for (let i = 0; i < kids.length; i += 2) {
    const dt = kids[i];
    const dd = kids[i + 1];
    if (dt?.tagName !== 'dt' || dd?.tagName !== 'dd') fail(ctx, dl, 'dl must alternate dt/dd');
    out.push({ label: ctx.norm.plain(dt), value: ctx.norm.plain(dd) });
  }
  return out;
}

/** b + span cards: `.three` (tip, 3), `.mis` (mistake, 2), `.st4` without svgs (card, 2). */
export function simpleCards(columns: 2 | 3, style: CardsBlock['style']) {
  return (ctx: Ctx, el: Element): Block[] => {
    const items = children(el).map((d): Card => {
      if (classes(d).length) fail(ctx, d, 'unexpected class on card');
      const p = parts(ctx, d, ['b', 'span']);
      const b = p.get('b');
      const span = p.get('span');
      if (!b || !span) fail(ctx, d, 'card needs b and span');
      return { title: ctx.norm.plain(b), text: inlineOf(ctx.norm, span) };
    });
    return [{ type: 'cards', columns, style, items }];
  };
}

/** `.vvca` -> cards (4 columns, small -> eyebrow). */
export function vvca(ctx: Ctx, el: Element): Block[] {
  const items = children(el).map((d): Card => {
    const p = parts(ctx, d, ['small', 'b', 'span']);
    const b = p.get('b');
    const small = p.get('small');
    const span = p.get('span');
    if (!b || !small || !span) fail(ctx, d, 'vvca item needs small, b, span');
    return {
      eyebrow: ctx.norm.plain(small),
      title: ctx.norm.plain(b),
      text: inlineOf(ctx.norm, span),
    };
  });
  return [{ type: 'cards', columns: 4, style: 'card', items }];
}

/** `.flow4` -> steps. */
export function flow4(ctx: Ctx, el: Element): Block[] {
  const items = children(el).map((d) => {
    const p = parts(ctx, d, ['small', 'b', 'span']);
    const b = p.get('b');
    const small = p.get('small');
    const span = p.get('span');
    if (!b) fail(ctx, d, 'step without b');
    return {
      ...(small ? { label: ctx.norm.plain(small) } : {}),
      title: ctx.norm.plain(b),
      ...(span ? { text: inlineOf(ctx.norm, span) } : {}),
    };
  });
  return [{ type: 'steps', items }];
}
