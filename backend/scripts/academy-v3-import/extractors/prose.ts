import type { Block } from '../../../src/modules/academy/content/v3/schema.js';
import { children } from '../dom.js';
import type { Element } from '../dom.js';
import { inlineOf } from '../inline.js';
import type { Ctx } from './context.js';
import { fail } from './context.js';

/** `p` -> paragraph. */
export function paragraph(ctx: Ctx, el: Element): Block[] {
  const text = inlineOf(ctx.norm, el);
  if (!text) fail(ctx, el, 'empty paragraph');
  return [{ type: 'paragraph', text }];
}

/** A second `h2` inside one section -> heading. */
export function heading(ctx: Ctx, el: Element): Block[] {
  return [{ type: 'heading', text: ctx.norm.plain(el) }];
}

/** `span.assume` outside a figure -> note (the schema allows notes in chapter 2 only). */
export function note(ctx: Ctx, el: Element): Block[] {
  if (children(el).length) fail(ctx, el, 'assume note with markup');
  return [{ type: 'note', text: ctx.norm.plain(el) }];
}
