import type { Block } from '../../../src/modules/academy/content/v3/schema.js';
import { tone } from '../charts/tones.js';
import { children, classes, hasClass, styleProp } from '../dom.js';
import type { Element } from '../dom.js';
import { inlineOf } from '../inline.js';
import type { Ctx } from './context.js';
import { fail } from './context.js';

function child(ctx: Ctx, el: Element, pred: (e: Element) => boolean, what: string): Element {
  const hits = children(el).filter(pred);
  if (hits.length !== 1) fail(ctx, el, `expected one ${what}`);
  return hits[0] as Element;
}

/** `.say` (Mẫu), `.say.g` (Nên), `.say.r` (Không nên). */
export function quote(ctx: Ctx, el: Element): Block[] {
  const cls = classes(el).filter((c) => c !== 'say');
  const t = cls[0];
  if (cls.length > 1 || (t && t !== 'g' && t !== 'r')) fail(ctx, el, 'say class');
  const small = child(ctx, el, (e) => e.tagName === 'small', 'small');
  return [
    {
      type: 'quote',
      label: ctx.norm.plain(small),
      text: inlineOf(ctx.norm, el, { skip: (e) => e === small }),
      tone: t === 'g' ? 'good' : t === 'r' ? 'bad' : 'neutral',
    },
  ];
}

/** `.obj` objection + response. */
export function objection(ctx: Ctx, el: Element): Block[] {
  return [
    {
      type: 'objection',
      objection: ctx.norm.plain(child(ctx, el, (e) => e.tagName === 'h3', 'h3')),
      response: inlineOf(
        ctx.norm,
        child(ctx, el, (e) => e.tagName === 'p', 'p'),
      ),
    },
  ];
}

/** `.fun` funnel bars. */
export function funnel(ctx: Ctx, el: Element): Block[] {
  const items = children(el).map((d) => {
    const w = Number((styleProp(d, 'width') ?? '').replace('%', ''));
    const bg = styleProp(d, 'background');
    if (!Number.isFinite(w) || !bg) fail(ctx, d, 'funnel bar style');
    const small = children(d).find((c) => c.tagName === 'small');
    return {
      label: ctx.norm.plain(child(ctx, d, (e) => e.tagName === 'span', 'span')),
      ...(small ? { note: ctx.norm.plain(small) } : {}),
      pct: w,
      tone: tone(bg),
    };
  });
  return [{ type: 'funnel', items }];
}

/** `.post` sample social post. */
export function samplePost(ctx: Ctx, el: Element): Block[] {
  const by = (c: string) => child(ctx, el, (e) => hasClass(e, c), `.${c}`);
  const head = by('post-h');
  const who = child(ctx, head, (e) => e.tagName === 'div', 'author block');
  return [
    {
      type: 'sample_post',
      kicker: ctx.norm.plain(by('post-t')),
      author: ctx.norm.plain(child(ctx, who, (e) => e.tagName === 'b', 'b')),
      audience: ctx.norm.plain(child(ctx, who, (e) => e.tagName === 'small', 'small')),
      body: ctx.norm.lines(by('post-b')),
      why: inlineOf(ctx.norm, by('post-w')),
    },
  ];
}
