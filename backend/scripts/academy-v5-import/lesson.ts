import { attr, children, classes, describe, hasClass, isText } from '../academy-v4-import/dom.js';
import type { Element, Node } from '../academy-v4-import/dom.js';
import { exCards, roles, simpleCards } from '../academy-v4-import/extractors/cards.js';
import type { Ctx, Extractor } from '../academy-v4-import/extractors/context.js';
import { fail } from '../academy-v4-import/extractors/context.js';
import { heading, paragraph } from '../academy-v4-import/extractors/prose.js';
import { table } from '../academy-v4-import/extractors/tables.js';
import { inlineOf } from '../academy-v4-import/inline.js';
import type { TextNormalizer } from '../academy-v4-import/inline.js';
import type {
  Block,
  ChartModel,
  LessonFile,
  Nganh,
  Section,
} from '../../src/modules/academy/content/v5/schema.js';
import { NGANH_CHAPTER, nganhSchema } from '../../src/modules/academy/content/v5/schema.js';
import { CATALOG_ROWS, chapterOf } from './catalog-table.js';
import { figureModel, repModel } from './figures.js';
import type { FigCall, RepData, SourceArticle } from './source.js';

/** Extraction state of one v5 article. `v4` is the context the reused v4 extractors see (they never add charts). */
export interface V5Ctx {
  v4: Ctx;
  charts: Record<string, ChartModel>;
  figs: ReadonlyMap<string, FigCall>;
  repd: Readonly<Record<string, RepData>>;
  /** FIG svg ids consumed (gate: every FIG.draw id is used exactly once). */
  usedFigs: Set<string>;
  usedReps: Set<string>;
  /** `C<ch>N<pos>`: the mockup id prefix of this article. */
  mockKey: string;
  /** `c<ch>l<n>`: chart id prefix (n = item id number, not the position, for the frozen chapters 10-12). */
  chartPrefix: string;
}

type V5Extractor = (ctx: V5Ctx, el: Element) => Block[];
/** Reuse a v4 extractor (its blocks are a subset of the v5 block union). */
const v4 =
  (ex: Extractor): V5Extractor =>
  (ctx, el) =>
    ex(ctx.v4, el);

const keyOf = (el: Element) => [el.tagName, ...[...classes(el)].sort()].join('.');

/** Dispatch: `tag.class.class` (sorted exact class set) -> extractor. Only the patterns of the v5 articles. */
const DISPATCH: Readonly<Record<string, V5Extractor>> = {
  p: (ctx, el) => (hasLinks(el) ? lessonLinks(ctx, el) : paragraph(ctx.v4, el)),
  'div.three': v4(simpleCards(3, 'tip')),
  'div.three.two': v4(simpleCards(2, 'tip')),
  'div.ex2': v4(exCards),
  'div.roles': v4(roles),
  'div.fig.tl': figure,
  'div.fig.rep.tl': representative,
};

/** Section children with class-less `div` wrappers unwrapped (any depth). */
function flatten(el: Element): Element[] {
  for (const n of el.childNodes as Node[])
    if (isText(n) && n.value.trim())
      throw new Error(`${describe(el)}: loose text "${n.value.trim().slice(0, 40)}"`);
  return children(el).flatMap((c) =>
    c.tagName === 'div' && classes(c).length === 0 ? flatten(c) : [c],
  );
}

function walk(ctx: V5Ctx, els: Element[]): Block[] {
  const out: Block[] = [];
  for (const el of els) {
    if (el.tagName === 'h2') {
      out.push(...heading(ctx.v4, el));
      continue;
    }
    const ex = DISPATCH[keyOf(el)];
    if (!ex) fail(ctx.v4, el, `no v5 extractor for ${keyOf(el)}`);
    out.push(...ex(ctx, el));
  }
  return out;
}

/** `div.fig.tl`: a FIG drawing (`svg[id]`) or a `table.cmp`. */
function figure(ctx: V5Ctx, el: Element): Block[] {
  const kids = children(el);
  if (kids.length !== 1) fail(ctx.v4, el, 'figure must hold exactly one svg or table');
  const c = kids[0] as Element;
  if (c.tagName === 'table') return table(ctx.v4, c);
  if (c.tagName !== 'svg') fail(ctx.v4, c, 'unexpected child in figure');
  if (children(c).length) fail(ctx.v4, c, 'FIG svg must be empty (drawn by the page script)');
  const svgId = attr(c, 'id') ?? '';
  const m = /^C(\d+)N(\d+)-([a-z0-9]+)$/.exec(svgId);
  if (!m || `C${m[1]}N${m[2]}` !== ctx.mockKey)
    fail(ctx.v4, c, `svg ${svgId} does not belong to ${ctx.mockKey}`);
  const call = ctx.figs.get(svgId);
  if (!call) fail(ctx.v4, c, `no FIG.draw for ${svgId}`);
  if (ctx.usedFigs.has(svgId)) fail(ctx.v4, c, `FIG ${svgId} used twice`);
  ctx.usedFigs.add(svgId);
  const id = `${ctx.chartPrefix}-${(m[3] as string).toLowerCase()}`;
  if (ctx.charts[id]) fail(ctx.v4, c, `chart ${id} twice`);
  ctx.charts[id] = figureModel(ctx.v4.norm, call);
  return [{ type: 'chart', chart_id: id }];
}

/** `div.fig.tl.rep[data-rep]`: the representative chart, drawn live from `REPD` (spec v5 §2.4). */
function representative(ctx: V5Ctx, el: Element): Block[] {
  if (children(el).length) fail(ctx.v4, el, 'rep figure must be empty');
  const key = attr(el, 'data-rep') ?? '';
  if (key !== ctx.mockKey) fail(ctx.v4, el, `data-rep ${key} != ${ctx.mockKey}`);
  const d = ctx.repd[key];
  if (!d) fail(ctx.v4, el, `REPD ${key} missing`);
  if (ctx.usedReps.has(key)) fail(ctx.v4, el, `REPD ${key} used twice`);
  ctx.usedReps.add(key);
  const id = `${ctx.chartPrefix}-rep`;
  const model = repModel(ctx.v4.norm, key, d);
  ctx.charts[id] = model;
  return [{ type: 'chart', chart_id: id, title: model.chart.name }];
}

const isLink = (n: Node): n is Element =>
  !isText(n) && (n as Element).tagName === 'a' && hasClass(n as Element, 'lk');
const hasLinks = (el: Element) => (el.childNodes as Node[]).some(isLink);

/** Fake element so `inlineOf` can render a run of child nodes. */
const fragment = (el: Element, nodes: Node[]): Element => ({ ...el, childNodes: nodes }) as Element;

/** Lesson a `#bai=<name>&nganh=<code>` link opens (spec v5 §6.2 rule, inside the industry chapter only). */
export function resolveLink(
  name: string,
  nganh: Nganh,
): { metric_key: string; title: string } | null {
  const chapter = NGANH_CHAPTER[nganh];
  const row = CATALOG_ROWS.find(
    (r) =>
      r.kind === 'lesson' &&
      chapterOf(r.id) === chapter &&
      (r.name === name || r.name.startsWith(`${name} ·`)),
  );
  return row?.metric_key ? { metric_key: row.metric_key, title: row.name } : null;
}

/**
 * `p` holding `a.lk` links -> `lesson_links` (spec v5 §1.3 "Có bài riêng", §1.4 "Ở các ngành"). Everything before the
 * first link is `lead`, after the last link `tail`; links are separated by ", ". The renderer joins
 * `lead + " " + links.join(", ") + tail`.
 */
function lessonLinks(ctx: V5Ctx, el: Element): Block[] {
  const nodes = el.childNodes as Node[];
  const first = nodes.findIndex(isLink);
  const last = nodes.length - 1 - [...nodes].reverse().findIndex(isLink);
  const links = [];
  for (let i = first; i <= last; i++) {
    const n = nodes[i] as Node;
    if (!isLink(n)) {
      if (!(isText(n) && n.value === ', ')) fail(ctx.v4, el, 'links must be separated by ", "');
      continue;
    }
    const href = attr(n, 'href') ?? '';
    const q = new URLSearchParams(href.replace(/^#/, ''));
    const bai = q.get('bai');
    const ng = nganhSchema.safeParse(q.get('nganh'));
    if (!bai || !ng.success) fail(ctx.v4, n, `bad lesson link ${href}`);
    const hit = resolveLink(bai, ng.data);
    const label = ctx.v4.norm.plain(n);
    if (!hit) fail(ctx.v4, n, `link ${href} resolves to no lesson`);
    if (hit.title !== label) fail(ctx.v4, n, `link text "${label}" != lesson "${hit.title}"`);
    links.push({ label, metric_key: hit.metric_key, nganh: ng.data });
  }
  const lead = inlineOf(ctx.v4.norm, fragment(el, nodes.slice(0, first)));
  const tail = inlineOf(ctx.v4.norm, fragment(el, nodes.slice(last + 1)));
  if (!lead) fail(ctx.v4, el, 'lesson links without a lead');
  return [{ type: 'lesson_links', lead, links, ...(tail ? { tail } : {}) }];
}

export interface Draft {
  lesson: Omit<LessonFile, 'format' | 'lesson_key' | 'kind' | 'order'>;
  blocks: Record<string, number>;
}

function newCtx(
  norm: TextNormalizer,
  art: SourceArticle,
  figs: ReadonlyMap<string, FigCall>,
  repd: Readonly<Record<string, RepData>>,
  used: { figs: Set<string>; reps: Set<string> },
): V5Ctx {
  const chapter = chapterOf(art.row.id);
  norm.context = art.row.id;
  norm.warnQuestions = false;
  return {
    v4: { norm, itemId: art.row.id, chapter, charts: {}, dropped: {}, path: describe(art.el) },
    charts: {},
    figs,
    repd,
    usedFigs: used.figs,
    usedReps: used.reps,
    mockKey: `C${chapter}N${art.position}`,
    chartPrefix: `c${chapter}l${Number(art.row.id.slice(6))}`,
  };
}

const isSection = (el: Element) => hasClass(el, 'sec') && hasClass(el, 'blk');

/** Header `div.col > h1 + p.lead`; the h1 must equal the catalog name. */
function header(ctx: V5Ctx, col: Element, name: string): { title: string; lead: string } {
  const kids = children(col);
  const h1 = kids.find((k) => k.tagName === 'h1');
  const leadEl = kids.find((k) => k.tagName === 'p' && hasClass(k, 'lead'));
  if (!h1 || !leadEl) fail(ctx.v4, col, 'header needs h1 and p.lead');
  const title = ctx.v4.norm.plain(h1);
  if (title !== name) fail(ctx.v4, h1, `h1 "${title}" differs from catalog name "${name}"`);
  return { title, lead: inlineOf(ctx.v4.norm, leadEl) };
}

/** "Tóm tắt": `.take > div > span` -> summary; `.done` dropped. */
function takeaways(ctx: V5Ctx, els: Element[]): string[] {
  const out: string[] = [];
  for (const el of els) {
    if (keyOf(el) === 'div.done') continue;
    if (keyOf(el) !== 'div.take') fail(ctx.v4, el, 'unexpected element in summary');
    for (const d of children(el)) {
      const span = children(d);
      if (span.length !== 1 || span[0]?.tagName !== 'span')
        fail(ctx.v4, d, 'take item must be div > span');
      out.push(inlineOf(ctx.v4.norm, span[0]));
    }
  }
  return out;
}

/** A whole v5 article (the 87 added lessons). */
export function extractNewLesson(
  norm: TextNormalizer,
  art: SourceArticle,
  figs: ReadonlyMap<string, FigCall>,
  repd: Readonly<Record<string, RepData>>,
  used: { figs: Set<string>; reps: Set<string> },
): Draft {
  const ctx = newCtx(norm, art, figs, repd, used);
  const top = children(art.el);
  const col = top[0];
  if (!col || keyOf(col) !== 'div.col') fail(ctx.v4, art.el, 'first child must be div.col');
  const { title, lead } = header(ctx, col, art.row.name);
  const sections: Section[] = [];
  let summary: string[] | undefined;
  for (const blk of top.slice(1)) {
    if (!isSection(blk)) fail(ctx.v4, blk, 'article child must be a section');
    const kids = flatten(blk);
    if (kids[0]?.tagName !== 'h2') fail(ctx.v4, blk, 'section must start with h2');
    const sTitle = norm.plain(kids[0]);
    ctx.v4.path = `${describe(art.el)} > "${sTitle}"`;
    if (summary) fail(ctx.v4, blk, 'section after the summary');
    if (sTitle === 'Tóm tắt') {
      summary = takeaways(ctx, kids.slice(1));
      continue;
    }
    const blocks = walk(ctx, kids.slice(1));
    if (!blocks.length) fail(ctx.v4, blk, 'empty section');
    sections.push({ id: `s${sections.length + 1}`, title: sTitle, blocks });
  }
  if (!summary?.length) fail(ctx.v4, art.el, 'no Tóm tắt section');
  const counts: Record<string, number> = {};
  for (const b of sections.flatMap((s) => s.blocks)) counts[b.type] = (counts[b.type] ?? 0) + 1;
  return {
    lesson: {
      id: art.row.id,
      chapter: chapterOf(art.row.id),
      title,
      lead,
      intro_blocks: [],
      sections,
      summary,
      charts: ctx.charts,
    },
    blocks: counts,
  };
}

/** The "Ở các ngành" section of a Chương 8/9 article (patched into the frozen v4 lesson file). */
export function extractIndustriesSection(
  norm: TextNormalizer,
  art: SourceArticle,
  title: string,
): Block[] | null {
  const ctx = newCtx(norm, art, new Map(), {}, { figs: new Set(), reps: new Set() });
  for (const blk of children(art.el).slice(1)) {
    if (!isSection(blk)) continue;
    const kids = flatten(blk);
    if (kids[0]?.tagName !== 'h2' || norm.plain(kids[0]) !== title) continue;
    ctx.v4.path = `${describe(art.el)} > "${title}"`;
    return walk(ctx, kids.slice(1));
  }
  return null;
}
