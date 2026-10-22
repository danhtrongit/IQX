import type { Block, ChartModel } from '../../../src/modules/academy/content/v3/schema.js';
import { describe } from '../dom.js';
import type { Element } from '../dom.js';
import type { TextNormalizer } from '../inline.js';

/** Per-lesson extraction state shared by every extractor. */
export interface Ctx {
  norm: TextNormalizer;
  itemId: string;
  chapter: number;
  /** Charts referenced so far (chart id -> model). */
  charts: Record<string, ChartModel>;
  /** Charts of the mockup that are not part of the content (id -> reason). */
  dropped: Record<string, string>;
  /** Path prefix for error messages. */
  path: string;
}

export function fail(ctx: Ctx, el: Element | undefined, msg: string): never {
  throw new Error(`${ctx.itemId} ${ctx.path}${el ? ` > ${describe(el)}` : ''}: ${msg}`);
}

export type Extractor = (ctx: Ctx, el: Element) => Block[];
