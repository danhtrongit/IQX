import type { Block } from '../../../src/modules/academy/content/v3/schema.js';
import { attr, children, find, findAll, hasClass, isElement, isText } from '../dom.js';
import type { Element, Node } from '../dom.js';
import { inlineOf } from '../inline.js';
import { roles } from './cards.js';
import type { Ctx } from './context.js';
import { fail } from './context.js';

function one(ctx: Ctx, el: Element, pred: (e: Element) => boolean, what: string): Element {
  const hits = children(el).filter(pred);
  if (hits.length !== 1) fail(ctx, el, `expected one ${what}, found ${hits.length}`);
  return hits[0] as Element;
}
const cls = (c: string) => (e: Element) => hasClass(e, c);
const tag = (t: string) => (e: Element) => e.tagName === t;

/** Split an element's text on `<br>` into trimmed, non-empty lines. */
function brLines(ctx: Ctx, el: Element): string[] {
  const parts: string[] = [''];
  for (const n of el.childNodes as Node[]) {
    if (isText(n)) parts[parts.length - 1] += n.value;
    else if (isElement(n) && n.tagName === 'br') parts.push('');
    else fail(ctx, el, 'unexpected markup in prompt list');
  }
  return parts.map((p) => ctx.norm.plain(p)).filter(Boolean);
}

/** `.cz`: scenario (`data-a`), income calculator ("TỰ TÍNH") or practice case ("CASE n"). */
export function cz(ctx: Ctx, el: Element): Block[] {
  const head = one(ctx, el, cls('cz-h'), '.cz-h');
  const kind = ctx.norm.plain(one(ctx, head, tag('span'), 'cz-h span'));
  const title = ctx.norm.plain(one(ctx, head, tag('b'), 'cz-h b'));
  const a = attr(el, 'data-a');
  if (a !== undefined) return [scenario(ctx, el, title, a)];
  if (kind === 'TỰ TÍNH') return [calculator(ctx, el, title)];
  if (/^CASE \d$/.test(kind)) return [practiceCase(ctx, el, title)];
  return fail(ctx, el, `unknown .cz kind "${kind}"`);
}

function scenario(ctx: Ctx, el: Element, title: string, a: string): Block {
  const best = Number(a);
  if (best !== 0 && best !== 1 && best !== 2) fail(ctx, el, `data-a ${a}`);
  for (const c of children(el))
    if (!(
      hasClass(c, 'cz-h') ||
      c.tagName === 'p' ||
      ['cz-q', 'cz-o', 'cz-x'].some((k) => hasClass(c, k))
    ))
      fail(ctx, c, 'unexpected child in scenario');
  const story = children(el)
    .filter(tag('p'))
    .map((p) => inlineOf(ctx.norm, p));
  const buttons = children(one(ctx, el, cls('cz-o'), '.cz-o'));
  if (buttons.length !== 3 || !buttons.every(tag('button')))
    fail(ctx, el, 'scenario needs 3 buttons');
  const [o0, o1, o2] = buttons.map((b) => ctx.norm.plain(b)) as [string, string, string];
  return {
    type: 'scenario',
    title,
    story,
    question: ctx.norm.plain(one(ctx, el, cls('cz-q'), '.cz-q')),
    options: [o0, o1, o2],
    best_option: best,
    debrief: inlineOf(ctx.norm, one(ctx, el, cls('cz-x'), '.cz-x')),
  };
}

function calculator(ctx: Ctx, el: Element, title: string): Block {
  const labels = children(one(ctx, el, cls('calc'), '.calc'));
  if (labels.length !== 2 || !labels.every(tag('label')))
    fail(ctx, el, 'calculator needs 2 inputs');
  const input = (l: Element) => {
    const i = one(ctx, l, tag('input'), 'input');
    return { label: ctx.norm.plain(l), default: Number(attr(i, 'value')) };
  };
  const [clients, value] = labels.map(input) as [
    ReturnType<typeof input>,
    ReturnType<typeof input>,
  ];
  if (clients.default !== 20 || value.default !== 200) fail(ctx, el, 'calculator defaults changed');
  const out = one(ctx, el, cls('calc-out'), '.calc-out');
  return {
    type: 'income_calculator',
    title,
    fee_rate: 0.0015,
    share_rate: 0.7,
    clients,
    monthly_value_million: value,
    result_label: ctx.norm.plain(one(ctx, out, tag('span'), 'calc-out span')),
  };
}

function practiceCase(ctx: Ctx, el: Element, title: string): Block {
  const cols = children(one(ctx, el, cls('prof'), '.prof'));
  if (cols.length !== 3) fail(ctx, el, 'profile needs 3 columns');
  const list = (c: Element) => {
    const ul = one(ctx, c, tag('ul'), 'ul');
    return children(ul).map((li) => ctx.norm.plain(li));
  };
  const quoteEl = find(cols[2] as Element, (e) => e.tagName === 'p' && hasClass(e, 'q'));
  if (!quoteEl) fail(ctx, el, 'profile quote');
  const pad = one(ctx, el, cls('pad'), '.pad');
  const ta = one(ctx, pad, tag('textarea'), 'textarea');
  const id = attr(ta, 'data-k');
  if (!id) fail(ctx, ta, 'textarea without data-k');
  const prompts = brLines(ctx, one(ctx, pad, tag('small'), 'pad small'));
  const placeholder = attr(ta, 'placeholder');
  const hidden = one(ctx, el, cls('cz-x'), '.cz-x');
  const defs = roles(ctx, one(ctx, hidden, cls('roles'), '.roles'))[0];
  if (defs?.type !== 'definitions') fail(ctx, hidden, 'hints');
  return {
    type: 'practice_case',
    id,
    title,
    pad_title: ctx.norm.plain(one(ctx, pad, tag('b'), 'pad b')),
    profile: {
      info: list(cols[0] as Element),
      mindset: list(cols[1] as Element),
      quote: ctx.norm.plain(quoteEl),
    },
    prompts,
    ...(placeholder ? { placeholder: ctx.norm.plain(placeholder) } : {}),
    hints: defs.items.map((d) => ({ term: d.term, text: d.text })),
  };
}

/** `.todo` / `.todo.audit` -> checklist. */
export function checklist(ctx: Ctx, el: Element): Block[] {
  const audit = hasClass(el, 'audit');
  let id = '';
  const items: { id: string; text: string }[] = [];
  let resultLabel: string | undefined;
  for (const c of children(el)) {
    if (c.tagName === 'h3') continue;
    if (c.tagName === 'label') {
      const input = one(ctx, c, tag('input'), 'checkbox');
      const k = attr(input, 'data-k') ?? '';
      const m = /^([a-z0-9_]+)-([a-z0-9_]+)$/.exec(k);
      if (!m) fail(ctx, input, `checkbox key ${k}`);
      if (id && id !== m[1]) fail(ctx, input, 'mixed checklist ids');
      id = m[1] as string;
      items.push({ id: m[2] as string, text: ctx.norm.plain(one(ctx, c, tag('span'), 'span')) });
      continue;
    }
    if (audit && hasClass(c, 'audit-out')) {
      resultLabel = ctx.norm.plain(one(ctx, c, tag('span'), 'audit-out span'));
      continue;
    }
    fail(ctx, c, 'unexpected child in checklist');
  }
  if (audit && resultLabel !== 'Số mục đã đạt') fail(ctx, el, 'audit counter label');
  return [
    {
      type: 'checklist',
      id,
      mode: audit ? 'self_check' : 'todo',
      title: ctx.norm.plain(one(ctx, el, tag('h3'), 'h3')),
      items,
      ...(resultLabel ? { result_label: resultLabel } : {}),
    },
  ];
}

/** Standalone `.pad` -> workpad. The "lưu trên trình duyệt" `em` is dropped. */
export function workpad(ctx: Ctx, el: Element): Block[] {
  for (const c of children(el))
    if (!['b', 'small', 'textarea', 'em'].includes(c.tagName))
      fail(ctx, c, 'unexpected child in pad');
  const em = children(el).find(tag('em'));
  if (em && ctx.norm.plain(em) !== '') fail(ctx, em, 'pad em is not the storage notice');
  const ta = one(ctx, el, tag('textarea'), 'textarea');
  const id = attr(ta, 'data-k');
  if (!id) fail(ctx, ta, 'textarea without data-k');
  const placeholder = attr(ta, 'placeholder');
  return [
    {
      type: 'workpad',
      id,
      title: ctx.norm.plain(one(ctx, el, tag('b'), 'b')),
      prompts: brLines(ctx, one(ctx, el, tag('small'), 'small')),
      ...(placeholder ? { placeholder: ctx.norm.plain(placeholder) } : {}),
    },
  ];
}

/** `.sc6` -> roleplay_score (6 sliders 0..10, default 5; bands from the page script). */
export function roleplay(ctx: Ctx, el: Element): Block[] {
  const rows = children(el).filter((c) => !hasClass(c, 'verdict'));
  if (rows.length !== 6) fail(ctx, el, 'roleplay needs 6 criteria');
  const criteria = rows.map((r) => {
    const span = one(ctx, r, tag('span'), 'span');
    const small = one(ctx, span, tag('small'), 'small');
    const input = one(ctx, r, tag('input'), 'range');
    if (attr(input, 'max') !== '10' || attr(input, 'value') !== '5')
      fail(ctx, input, 'range attributes');
    const titleText = (span.childNodes as Node[])
      .filter(isText)
      .map((t) => t.value)
      .join('');
    return { title: ctx.norm.plain(titleText), hint: ctx.norm.plain(small) };
  });
  if (findAll(el, (e) => hasClass(e, 'verdict')).length !== 1) fail(ctx, el, 'verdict');
  return [
    {
      type: 'roleplay_score',
      id: attr(el, 'id') ?? fail(ctx, el, 'sc6 without id'),
      title: ctx.sectionTitle,
      max: 10,
      default: 5,
      criteria,
      bands: [
        { min: 48, label: 'Sẵn sàng gặp khách thật', tone: 'good' },
        { min: 36, label: 'Cần luyện thêm', tone: 'warn' },
        { min: 0, label: 'Cần học lại', tone: 'bad' },
      ],
    },
  ];
}
