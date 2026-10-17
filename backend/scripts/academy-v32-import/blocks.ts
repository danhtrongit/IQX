import type { Block, LessonFile, Section } from '../../src/modules/academy/content/v3/schema.js';
import { EXAM_LEAD_SUFFIX, examIntro } from './catalog-table.js';
import { attr, children, classes, describe, hasClass, isText } from './dom.js';
import type { Element, Node } from './dom.js';
import { exCards, flow4, roles, simpleCards, vvca } from './extractors/cards.js';
import type { Ctx, Extractor } from './extractors/context.js';
import { fail } from './extractors/context.js';
import { advRows, chartGrid, gauges, hero, stats } from './extractors/data.js';
import { figure } from './extractors/figures.js';
import { checklist, cz, roleplay, workpad } from './extractors/interactive.js';
import { heading, note, paragraph } from './extractors/prose.js';
import { funnel, objection, quote, samplePost } from './extractors/sales.js';
import { inlineOf } from './inline.js';
import type { TextNormalizer } from './inline.js';
import type { SourceArticle } from './source.js';

/** Dispatch table: `tag.class.class` (exact class set) -> extractor. */
const DISPATCH_TABLE: Readonly<Record<string, Extractor>> = {
  p: paragraph,
  'span.assume': note,
  'div.fig': figure,
  'div.fig.tl': figure,
  'div.roles': roles,
  'div.ex2': exCards,
  'div.ex2.r4': exCards,
  'div.ex2.r3': exCards,
  'div.ex3': exCards,
  'div.three': simpleCards(3, 'tip'),
  'div.mis': simpleCards(2, 'mistake'),
  'div.vvca': vvca,
  'div.flow4': flow4,
  'div.three3': hero,
  'div.mini3': stats('chip'),
  'div.big3': stats('big'),
  'div.st3': gauges,
  'div.st4': chartGrid(2),
  'div.pat': chartGrid(5),
  'div.say': quote,
  'div.say.g': quote,
  'div.say.r': quote,
  'div.obj': objection,
  'div.fun': funnel,
  'div.post': samplePost,
  'div.cz': cz,
  'div.todo': checklist,
  'div.todo.audit': checklist,
  'div.pad': workpad,
  'div.sc6': roleplay,
};

const norm = (tag: string, cls: string[]) => [tag, ...[...cls].sort()].join('.');
const keyOf = (el: Element) => norm(el.tagName, classes(el));
const DISPATCH: Readonly<Record<string, Extractor>> = Object.fromEntries(
  Object.entries(DISPATCH_TABLE).map(([k, v]) => {
    const [tag = '', ...cls] = k.split('.');
    return [norm(tag, cls), v];
  }),
);

/** Section children with class-less `div` wrappers unwrapped (any depth). */
function flatten(el: Element): Element[] {
  for (const n of el.childNodes as Node[])
    if (isText(n) && n.value.trim())
      throw new Error(`${describe(el)}: loose text "${n.value.trim().slice(0, 40)}"`);
  return children(el).flatMap((c) =>
    c.tagName === 'div' && classes(c).length === 0 ? flatten(c) : [c],
  );
}

/** Walk a run of block elements (after the title has been removed). */
function walk(ctx: Ctx, els: Element[]): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < els.length; i++) {
    const el = els[i] as Element;
    if (el.tagName === 'h2') {
      out.push(...heading(ctx, el));
      continue;
    }
    if (keyOf(el) === 'div.adv') {
      const run: Element[] = [];
      while (i < els.length && keyOf(els[i] as Element) === 'div.adv')
        run.push(els[i++] as Element);
      i--;
      out.push(...advRows(ctx, run));
      continue;
    }
    const ex = DISPATCH[keyOf(el)];
    if (!ex) fail(ctx, el, 'no extractor for this element');
    out.push(...ex(ctx, el));
  }
  return out;
}

export interface LessonDraft {
  lesson: Omit<LessonFile, 'format' | 'lesson_key' | 'kind' | 'order'>;
  /** Raw DOM counts for the manifest. */
  counts: {
    sections: number;
    intro_blocks: number;
    summary: number;
    blocks: Record<string, number>;
  };
}

const isSection = (el: Element) => hasClass(el, 'sec') && hasClass(el, 'blk');

/** One lesson or practice article -> lesson file body. */
export function extractLesson(norm: TextNormalizer, art: SourceArticle): LessonDraft {
  const { row, el } = art;
  const chapter = Number(row.id.slice(2, 4));
  const ctx: Ctx = {
    norm,
    itemId: row.id,
    chapter,
    charts: {},
    path: describe(el),
  };
  norm.context = row.id;
  norm.warnQuestions = chapter === 1 || chapter === 4 || chapter === 5;

  const top = children(el);
  const col = top[0];
  if (!col || keyOf(col) !== 'div.col') fail(ctx, el, 'first child must be div.col');
  const { title, lead } = header(ctx, col, row.name);

  const intro: Block[] = [];
  const sections: Section[] = [];
  let summary: string[] | undefined;
  for (const blk of top.slice(1)) {
    if (!hasClass(blk, 'blk')) fail(ctx, blk, 'article child without .blk');
    for (const c of classes(blk))
      if (!['col', 'wide', 'sec', 'first', 'blk'].includes(c))
        fail(ctx, blk, `unknown block class ${c}`);
    if (!isSection(blk)) {
      if (sections.length || summary) fail(ctx, blk, 'non-section block after a section');
      ctx.path = `${describe(el)} > intro`;
      intro.push(...walk(ctx, children(blk)));
      continue;
    }
    const kids = flatten(blk);
    const h2 = kids.findIndex((k) => k.tagName === 'h2');
    if (h2 !== 0) fail(ctx, blk, 'section must start with h2');
    const sTitle = norm.plain(kids[0] as Element);
    ctx.path = `${describe(el)} > "${sTitle}"`;
    if (summary) fail(ctx, blk, 'section after the summary');
    if (sTitle === 'Tóm tắt') {
      summary = takeaways(ctx, kids.slice(1));
      continue;
    }
    const blocks = walk(ctx, kids.slice(1));
    if (!blocks.length) fail(ctx, blk, 'empty section');
    sections.push({ id: `s${sections.length + 1}`, title: sTitle, blocks });
  }
  if (!summary) fail(ctx, el, 'no Tóm tắt section');

  const all = [...intro, ...sections.flatMap((s) => s.blocks)];
  const blocks: Record<string, number> = {};
  for (const b of all) blocks[b.type] = (blocks[b.type] ?? 0) + 1;
  return {
    lesson: {
      id: row.id,
      chapter,
      title,
      lead,
      intro_blocks: intro,
      sections,
      summary,
      charts: ctx.charts,
    },
    counts: {
      sections: sections.length,
      intro_blocks: intro.length,
      summary: summary.length,
      blocks,
    },
  };
}

function header(
  ctx: Ctx,
  col: Element,
  name: string,
): { title: string; lead: string; leadEl: Element } {
  const kids = children(col);
  const h1 = kids.find((k) => k.tagName === 'h1');
  const leadEl = kids.find((k) => k.tagName === 'p' && hasClass(k, 'lead'));
  if (!h1 || !leadEl) fail(ctx, col, 'header needs h1 and p.lead');
  const title = ctx.norm.plain(h1);
  if (title !== name) fail(ctx, h1, `h1 "${title}" differs from catalog name "${name}"`);
  return { title, lead: inlineOf(ctx.norm, leadEl), leadEl };
}

/** "Tóm tắt": `.take > div > span` -> summary; `.done` dropped. */
function takeaways(ctx: Ctx, els: Element[]): string[] {
  const out: string[] = [];
  for (const el of els) {
    if (keyOf(el) === 'div.done') continue;
    if (keyOf(el) !== 'div.take') fail(ctx, el, 'unexpected element in summary');
    for (const d of children(el)) {
      const span = children(d);
      if (span.length !== 1 || span[0]?.tagName !== 'span')
        fail(ctx, d, 'take item must be div > span');
      out.push(inlineOf(ctx.norm, span[0]));
    }
  }
  if (!out.length) fail(ctx, els[0], 'empty summary');
  return out;
}

/** Exam article: only checks (h1 = catalog name, lead = intro + suffix); exams have no lesson file. */
export function checkExam(norm: TextNormalizer, art: SourceArticle): void {
  const { row, el } = art;
  const chapter = Number(row.id.slice(2, 4));
  const ctx: Ctx = {
    norm,
    itemId: row.id,
    chapter,
    charts: {},
    path: describe(el),
  };
  norm.context = row.id;
  norm.warnQuestions = false;
  const top = children(el);
  if (top.length !== 1 || keyOf(top[0] as Element) !== 'div.col')
    fail(ctx, el, 'exam article must be one div.col');
  const { leadEl } = header(ctx, top[0] as Element, row.name);
  const lead = norm.plain(leadEl);
  const want = `${examIntro(chapter)} ${EXAM_LEAD_SUFFIX}`;
  if (lead !== want) fail(ctx, leadEl, `exam lead "${lead}" differs from "${want}"`);
  const done = children(top[0] as Element).find((k) => keyOf(k) === 'div.done');
  if (!done || attr(children(done)[0] as Element, 'data-i') === undefined)
    fail(ctx, el, 'exam without start button');
}
