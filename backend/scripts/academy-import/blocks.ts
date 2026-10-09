import { parseFragment } from 'parse5';

import type {
  Block,
  CalloutBlock,
  ChartBlock,
  ImageBlock,
  StepsBlock,
  TableAlign,
  TableBlock,
} from '../../src/modules/academy/content/packages/package.schema.js';
import { ILLUSTRATIVE_TAG } from './gates.js';
import {
  INLINE_TAGS,
  classList,
  getAttr,
  hasClass,
  isElement,
  isText,
  plainText,
  serializeSanitized,
  squash,
  squashedText,
} from './sanitize-allow.js';
import type { ParseChild, ParseElement } from './sanitize-allow.js';

/**
 * Converts the section HTML of an approved handoff into typed blocks.
 *
 * Top-level nodes are classified: figures, tables, steps lists, details, callouts and the
 * chapter 1 data hooks become typed blocks; everything else is sanitised (strict) into `html`
 * blocks. Anything unexpected throws, so the importer can never silently lose content.
 */

export interface ImageMeta {
  src: string;
  width: number;
  height: number;
  /** Lightbox title (images[id].caption of the payload). */
  caption: string;
}

export interface HookResolver {
  macdSeed(): { blocks: Block[]; generated: Block[] };
  application(name: string): { blocks: Block[]; generated: Block[] };
}

export interface ConvertContext {
  /** `ch01-l02/s2`, used in error messages. */
  where: string;
  /** Chart ids a chart block may reference. */
  chartIds: ReadonlySet<string>;
  images?: Readonly<Record<string, ImageMeta>>;
  hooks?: HookResolver;
  /** Appended with every chart / image id emitted (for coverage checks). */
  usedCharts: string[];
  usedImages: string[];
  /** Blocks produced by hooks (excluded from the text-equivalence comparison). */
  generated: Set<Block>;
  /** Dropped static legends, counted for the manifest. */
  droppedLegends: number;
}

const fail = (ctx: ConvertContext, msg: string): never => {
  throw new Error(`${ctx.where}: ${msg}`);
};

const childElements = (el: ParseElement): ParseElement[] => el.childNodes.filter(isElement);

function plainOnly(el: ParseElement, ctx: ConvertContext, what: string): string {
  const parts: string[] = [];
  for (const c of el.childNodes) {
    if (!isText(c)) fail(ctx, `${what} must contain plain text only`);
    else parts.push(c.value);
  }
  return parts.join('').trim();
}

function flowHtml(
  nodes: readonly ParseChild[],
  ctx: ConvertContext,
  tags?: ReadonlySet<string>,
): string {
  const violations: string[] = [];
  const html = serializeSanitized(nodes, { strict: true, ...(tags ? { tags } : {}) }, violations);
  if (violations.length > 0) fail(ctx, [...new Set(violations)].join('; '));
  return html;
}

const inlineHtml = (nodes: readonly ParseChild[], ctx: ConvertContext): string =>
  flowHtml(nodes, ctx, INLINE_TAGS).trim();

function parseAlign(style: string | undefined, ctx: ConvertContext): TableAlign | null {
  if (style === undefined) return null;
  const m = /^\s*text-align\s*:\s*(left|right|center)\s*;?\s*$/.exec(style);
  if (!m) return fail(ctx, `unsupported cell style "${style}"`);
  return m[1] === 'right' ? 'r' : m[1] === 'center' ? 'c' : 'l';
}

function tableFrom(
  wrapper: ParseElement | null,
  table: ParseElement,
  ctx: ConvertContext,
): TableBlock {
  const sections = childElements(table);
  const thead = sections.find((e) => e.tagName === 'thead');
  const tbody = sections.find((e) => e.tagName === 'tbody');
  if (!thead || !tbody || sections.length !== 2) fail(ctx, 'table must have thead + tbody only');
  const headRows = childElements(thead as ParseElement);
  if (headRows.length !== 1) fail(ctx, 'table head must have exactly one row');
  const aligns: (TableAlign | null)[][] = [];
  const readRow = (tr: ParseElement, cellTag: 'th' | 'td'): string[] => {
    const cells = childElements(tr);
    const row: string[] = [];
    const rowAlign: (TableAlign | null)[] = [];
    for (const cell of cells) {
      if (cell.tagName !== cellTag) fail(ctx, `unexpected <${cell.tagName}> in table row`);
      for (const a of cell.attrs) {
        if (a.name === 'scope' && cellTag === 'th' && a.value === 'col') continue;
        if (a.name === 'style') continue;
        fail(ctx, `unsupported attribute ${a.name} on <${cellTag}>`);
      }
      rowAlign.push(parseAlign(getAttr(cell, 'style'), ctx));
      row.push(inlineHtml(cell.childNodes, ctx));
    }
    aligns.push(rowAlign);
    return row;
  };
  const head = readRow(headRows[0] as ParseElement, 'th');
  const rows: string[][] = [];
  for (const tr of childElements(tbody as ParseElement)) {
    if (tr.tagName !== 'tr') fail(ctx, 'tbody must contain rows only');
    const row = readRow(tr, 'td');
    if (row.length !== head.length)
      fail(ctx, `table row has ${row.length} cells, head has ${head.length}`);
    rows.push(row);
  }
  if (rows.length === 0) fail(ctx, 'table without rows');
  // Column alignment must be consistent over head and body.
  const align: TableAlign[] = head.map((_, col) => {
    const set = new Set(
      aligns.map((r) => r[col] ?? null).filter((v): v is TableAlign => v !== null),
    );
    if (set.size > 1) fail(ctx, `column ${col} has mixed alignment`);
    return [...set][0] ?? 'l';
  });
  const out: TableBlock = { type: 'table', head, rows };
  if (align.some((a) => a !== 'l')) out.align = align;
  if (wrapper) {
    const label = getAttr(wrapper, 'aria-label');
    if (label !== undefined) out.aria_label = label;
    for (const a of wrapper.attrs) {
      const ok =
        a.name === 'class' ||
        a.name === 'aria-label' ||
        (a.name === 'role' && a.value === 'region') ||
        (a.name === 'tabindex' && a.value === '0');
      if (!ok) fail(ctx, `unsupported attribute ${a.name} on table wrapper`);
    }
  }
  return out;
}

function chartFrom(fig: ParseElement, ctx: ConvertContext): ChartBlock {
  let title: string | null = null;
  let illustrative = false;
  let mountId: string | null = null;
  let caption: string | undefined;
  for (const child of childElements(fig)) {
    if (child.tagName === 'div' && hasClass(child, 'chart-heading')) {
      for (const h of childElements(child)) {
        if (h.tagName === 'h3') title = plainOnly(h, ctx, 'chart title');
        else if (h.tagName === 'span' && hasClass(h, 'data-tag')) {
          if (plainOnly(h, ctx, 'chart tag') !== ILLUSTRATIVE_TAG)
            fail(ctx, 'unexpected chart tag');
          illustrative = true;
        } else fail(ctx, `unexpected <${h.tagName}> in chart heading`);
      }
    } else if (child.tagName === 'div' && hasClass(child, 'chart-legend')) {
      ctx.droppedLegends += 1; // duplicates the legend the renderer draws from the model
    } else if (
      child.tagName === 'div' &&
      (hasClass(child, 'chart-mount') || hasClass(child, 'fund-chart'))
    ) {
      mountId = getAttr(child, 'data-chart') ?? getAttr(child, 'id') ?? null;
      const id = getAttr(child, 'id');
      if (id !== undefined && mountId !== id)
        fail(ctx, `chart mount id ${id} != data-chart ${mountId}`);
      if (child.childNodes.length > 0) fail(ctx, `chart mount ${mountId} is not empty`);
    } else if (child.tagName === 'figcaption') {
      caption = plainOnly(child, ctx, 'chart caption');
    } else fail(ctx, `unexpected <${child.tagName}> in chart figure`);
  }
  if (!title || !mountId) return fail(ctx, 'chart figure without title or mount');
  if (!ctx.chartIds.has(mountId)) fail(ctx, `unknown chart id ${mountId}`);
  ctx.usedCharts.push(mountId);
  return {
    type: 'chart',
    chart_id: mountId,
    title,
    ...(caption ? { caption } : {}),
    ...(illustrative ? { illustrative: true } : {}),
    table_toggle: true,
  };
}

function imageFrom(fig: ParseElement, ctx: ConvertContext): ImageBlock {
  if (!ctx.images) return fail(ctx, 'image figure without an image table');
  let title: string | null = null;
  let caption: string | undefined;
  const linkIds: string[] = [];
  let alt: string | null = null;
  let srcId: string | null = null;
  let imgW: number | null = null;
  let imgH: number | null = null;
  let maxWidth: number | undefined;
  const style = getAttr(fig, 'style');
  if (style !== undefined) {
    const m = /^\s*max-width\s*:\s*(\d+)px\s*;?\s*$/.exec(style);
    if (!m) fail(ctx, `unsupported figure style "${style}"`);
    maxWidth = Number((m as RegExpExecArray)[1]);
  }
  for (const child of childElements(fig)) {
    if (child.tagName === 'div' && hasClass(child, 'guide-figure-head')) {
      for (const h of childElements(child)) {
        if (h.tagName === 'h3') title = plainOnly(h, ctx, 'image title');
        else if (h.tagName === 'button' && hasClass(h, 'image-link')) {
          linkIds.push(getAttr(h, 'data-image') ?? '');
        } else fail(ctx, `unexpected <${h.tagName}> in figure head`);
      }
    } else if (child.tagName === 'button' && hasClass(child, 'guide-image')) {
      linkIds.push(getAttr(child, 'data-image') ?? '');
      const imgs = childElements(child);
      if (imgs.length !== 1 || imgs[0]?.tagName !== 'img')
        fail(ctx, 'image button must wrap one <img>');
      const img = imgs[0] as ParseElement;
      if (getAttr(img, 'src') !== undefined) fail(ctx, 'source <img> must not carry a src');
      if (getAttr(img, 'loading') !== 'lazy') fail(ctx, '<img> without loading=lazy');
      alt = getAttr(img, 'alt') ?? null;
      srcId = getAttr(img, 'data-image-src') ?? null;
      const w = getAttr(img, 'width');
      const h = getAttr(img, 'height');
      imgW = w === undefined ? null : Number(w);
      imgH = h === undefined ? null : Number(h);
    } else if (child.tagName === 'figcaption') {
      caption = plainOnly(child, ctx, 'image caption');
    } else fail(ctx, `unexpected <${child.tagName}> in image figure`);
  }
  if (!title || !alt || !srcId) return fail(ctx, 'incomplete image figure');
  if (linkIds.length !== 2 || linkIds.some((id) => id !== srcId))
    fail(ctx, `image ids disagree: ${linkIds.join(',')} vs ${srcId}`);
  const meta = ctx.images[srcId];
  if (!meta) return fail(ctx, `image ${srcId} is not in the payload image table`);
  if (imgW !== null && imgW !== meta.width)
    fail(ctx, `image ${srcId}: width attribute differs from metadata`);
  if (imgH !== null && imgH !== meta.height)
    fail(ctx, `image ${srcId}: height attribute differs from metadata`);
  ctx.usedImages.push(srcId);
  return {
    type: 'image',
    asset_id: srcId,
    src: meta.src,
    width: meta.width,
    height: meta.height,
    alt,
    title,
    ...(caption ? { caption } : {}),
    zoom_title: meta.caption,
    ...(maxWidth !== undefined ? { max_width: maxWidth } : {}),
  };
}

function stepsFrom(ol: ParseElement, ctx: ConvertContext): StepsBlock {
  const items: StepsBlock['items'] = [];
  for (const li of childElements(ol)) {
    if (li.tagName !== 'li') fail(ctx, 'steps list must contain <li> only');
    const [no, body, ...extra] = childElements(li);
    if (!no || !body || extra.length > 0) return fail(ctx, 'step must be span.step-no + div');
    if (no.tagName !== 'span' || !hasClass(no, 'step-no') || body.tagName !== 'div')
      fail(ctx, 'step must be span.step-no + div');
    const kids = body.childNodes.filter((n) => !(isText(n) && n.value.trim() === ''));
    const head = kids[0];
    if (!head || !isElement(head) || head.tagName !== 'h3')
      return fail(ctx, 'step body must start with h3');
    items.push({
      no: plainOnly(no, ctx, 'step number'),
      title: plainOnly(head, ctx, 'step title'),
      html: flowHtml(kids.slice(1), ctx),
    });
  }
  if (items.length === 0) fail(ctx, 'empty steps list');
  return { type: 'steps', items };
}

function calloutFrom(
  el: ParseElement,
  variant: CalloutBlock['variant'],
  titleTag: 'h3' | 'b' | null,
  ctx: ConvertContext,
): CalloutBlock {
  const kids = el.childNodes.filter((n) => !(isText(n) && n.value.trim() === ''));
  let title: string | undefined;
  let rest = kids;
  const first = kids[0];
  if (titleTag && first && isElement(first) && first.tagName === titleTag) {
    title = plainOnly(first, ctx, 'callout title');
    rest = kids.slice(1);
  }
  for (const a of el.attrs)
    if (a.name !== 'class' && a.name !== 'aria-label')
      fail(ctx, `unsupported attribute ${a.name} on callout`);
  // The filter chip is a run of inline elements: serialise it contiguously (no joining whitespace).
  const blocks: Block[] =
    variant === 'filter-example'
      ? [{ type: 'html', html: flowHtml(rest, ctx) }]
      : convertNodes(rest, ctx);
  const ariaLabel = getAttr(el, 'aria-label');
  return {
    type: 'callout',
    variant,
    ...(title !== undefined ? { title } : {}),
    ...(ariaLabel !== undefined ? { aria_label: ariaLabel } : {}),
    blocks,
  };
}

function detailsFrom(el: ParseElement, ctx: ConvertContext): Block {
  const kids = childElements(el);
  const summary = kids.find((k) => k.tagName === 'summary');
  const bodies = kids.filter((k) => k.tagName !== 'summary');
  if (!summary || bodies.length !== 1 || bodies[0]?.tagName !== 'div')
    return fail(ctx, 'details must be summary + one div');
  for (const a of el.attrs)
    if (a.name !== 'class') fail(ctx, `unsupported attribute ${a.name} on details`);
  const blocks = convertNodes((bodies[0] as ParseElement).childNodes, ctx);
  return { type: 'details', summary: plainOnly(summary, ctx, 'details summary'), blocks };
}

/** Convert a list of sibling nodes to blocks (recursive for containers). */
export function convertNodes(nodes: readonly ParseChild[], ctx: ConvertContext): Block[] {
  const blocks: Block[] = [];
  const pending: string[] = [];
  const flush = (): void => {
    if (pending.length > 0) {
      blocks.push({ type: 'html', html: pending.join('\n') });
      pending.length = 0;
    }
  };
  for (const node of nodes) {
    if (isText(node)) {
      if (node.value.trim() !== '')
        fail(ctx, `stray top-level text "${node.value.trim().slice(0, 40)}"`);
      continue;
    }
    if (!isElement(node)) {
      if (node.nodeName === '#comment') fail(ctx, 'comment node');
      continue;
    }
    const tag = node.tagName;
    const classes = classList(node);
    if (tag === 'figure' && classes.includes('chart-card')) {
      flush();
      blocks.push(chartFrom(node, ctx));
    } else if (tag === 'figure' && classes.includes('guide-figure')) {
      flush();
      blocks.push(imageFrom(node, ctx));
    } else if (tag === 'div' && classes.includes('table-scroll')) {
      flush();
      const inner = childElements(node);
      if (inner.length !== 1 || inner[0]?.tagName !== 'table')
        fail(ctx, 'table-scroll must wrap one table');
      blocks.push(tableFrom(node, inner[0] as ParseElement, ctx));
    } else if (tag === 'table') {
      flush();
      blocks.push(tableFrom(null, node, ctx));
    } else if (tag === 'div' && getAttr(node, 'data-macd-seed') !== undefined) {
      flush();
      if (!ctx.hooks) fail(ctx, 'data-macd-seed hook without a resolver');
      if (node.childNodes.length > 0) fail(ctx, 'data-macd-seed hook is not empty');
      const produced = (ctx.hooks as HookResolver).macdSeed();
      blocks.push(...produced.blocks);
      for (const b of produced.generated) ctx.generated.add(b);
    } else if (tag === 'div' && getAttr(node, 'data-application') !== undefined) {
      flush();
      if (!ctx.hooks) fail(ctx, 'data-application hook without a resolver');
      if (node.childNodes.length > 0) fail(ctx, 'data-application hook is not empty');
      const produced = (ctx.hooks as HookResolver).application(
        getAttr(node, 'data-application') as string,
      );
      blocks.push(...produced.blocks);
      for (const b of produced.generated) ctx.generated.add(b);
    } else if (tag === 'details' && classes.includes('guide-extra')) {
      flush();
      blocks.push(detailsFrom(node, ctx));
    } else if (tag === 'ol' && classes.includes('guide-steps')) {
      flush();
      blocks.push(stepsFrom(node, ctx));
    } else if (tag === 'div' && classes.includes('guide-notice')) {
      flush();
      blocks.push(calloutFrom(node, 'notice', 'b', ctx));
    } else if (tag === 'div' && classes.includes('worked')) {
      flush();
      blocks.push(calloutFrom(node, 'worked', 'h3', ctx));
    } else if (tag === 'div' && classes.includes('filter-example')) {
      flush();
      blocks.push(calloutFrom(node, 'filter-example', null, ctx));
    } else if (tag === 'div' && classes.includes('signal-pair')) {
      flush();
      for (const box of childElements(node)) {
        if (box.tagName !== 'div' || !hasClass(box, 'signal-box'))
          fail(ctx, 'signal-pair must hold signal-box only');
        const buy = hasClass(box, 'buy');
        const sell = hasClass(box, 'sell');
        if (buy === sell) fail(ctx, 'signal-box must be exactly one of buy/sell');
        blocks.push(calloutFrom(box, buy ? 'signal-buy' : 'signal-sell', 'h3', ctx));
      }
    } else {
      pending.push(flowHtml([node], ctx));
    }
  }
  flush();
  return blocks;
}

/** Convert one `sections[].html` string. */
export function convertSection(html: string, ctx: ConvertContext): Block[] {
  return convertNodes(parseFragment(html).childNodes, ctx);
}

/** Squashed text of the source section, ignoring UI chrome the blocks replace. */
export function sourceSectionText(html: string): string {
  return squashedText(parseFragment(html).childNodes, {
    skipTags: new Set(['button', 'script', 'style']),
    skipClasses: new Set(['chart-legend']),
  });
}

/** Squashed text carried by blocks (hook-generated blocks excluded). */
export function blocksText(blocks: readonly Block[], generated: ReadonlySet<Block>): string {
  const parts: string[] = [];
  const walk = (list: readonly Block[]): void => {
    for (const b of list) {
      if (generated.has(b)) continue;
      switch (b.type) {
        case 'html':
          parts.push(plainText(b.html));
          break;
        case 'table':
          for (const cell of [...b.head, ...b.rows.flat()]) parts.push(plainText(cell));
          break;
        case 'chart':
          parts.push(b.title);
          if (b.illustrative) parts.push(ILLUSTRATIVE_TAG);
          if (b.caption) parts.push(b.caption);
          break;
        case 'image':
          parts.push(b.title);
          if (b.caption) parts.push(b.caption);
          break;
        case 'steps':
          for (const s of b.items) parts.push(s.no, s.title, plainText(s.html));
          break;
        case 'callout':
          if (b.title) parts.push(b.title);
          walk(b.blocks);
          break;
        case 'details':
          parts.push(b.summary);
          walk(b.blocks);
          break;
      }
    }
  };
  walk(blocks);
  return squash(parts.join(''));
}

/** Structural counters over a block tree. */
export interface BlockCounts {
  html: number;
  table: number;
  computed_table: number;
  chart: number;
  image: number;
  steps: number;
  step_items: number;
  callout: number;
  details: number;
}

export function countBlocks(blocks: readonly Block[], acc?: BlockCounts): BlockCounts {
  const c: BlockCounts = acc ?? {
    html: 0,
    table: 0,
    computed_table: 0,
    chart: 0,
    image: 0,
    steps: 0,
    step_items: 0,
    callout: 0,
    details: 0,
  };
  for (const b of blocks) {
    if (b.type === 'html') c.html += 1;
    else if (b.type === 'table') {
      c.table += 1;
      if (b.source) c.computed_table += 1;
    } else if (b.type === 'chart') c.chart += 1;
    else if (b.type === 'image') c.image += 1;
    else if (b.type === 'steps') {
      c.steps += 1;
      c.step_items += b.items.length;
    } else if (b.type === 'callout') {
      c.callout += 1;
      countBlocks(b.blocks, c);
    } else {
      c.details += 1;
      countBlocks(b.blocks, c);
    }
  }
  return c;
}
