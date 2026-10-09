import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

import {
  PACKAGE_FORMAT_VERSION,
  assetsManifestSchema,
  chartsFileSchema,
  importManifestSchema,
  packageLessonsFileSchema,
  privateQuestionsFileSchema,
} from '../../src/modules/academy/content/packages/package.schema.js';
import type {
  AssetEntry,
  Block,
  ChartModel,
  HtmlBlock,
  ImportManifest,
  PackageLesson,
  PrivateQuestion,
  TableBlock,
} from '../../src/modules/academy/content/packages/package.schema.js';
import { convertSection, countBlocks, blocksText, sourceSectionText } from './blocks.js';
import type { ConvertContext, HookResolver, ImageMeta } from './blocks.js';
import {
  RawNumber,
  canonicalHash,
  canonicalPlainHash,
  opaqueOptionId,
  parseRawJson,
  sha256Hex,
  stableStringify,
} from './canonical.js';
import type { RawJson } from './canonical.js';
import { buildHooks, buildLessonCharts, questionChartModel } from './ch1-math.js';
import type { ApplicationHook, Ch1Data, ComputedTable, QuestionChartSource } from './ch1-math.js';
import {
  C1_CHART_WINDOWS,
  C3_LESSON_CHART_IDS,
  C3_METRIC_ALIASES,
  CHAPTERS,
  CHAPTER_GATES,
} from './gates.js';
import type { ChapterGate, ChapterNo, LessonGate } from './gates.js';
import {
  INLINE_TAGS,
  firstDifference,
  isElement,
  isText,
  sanitizeHtml,
  scanForbidden,
  ANSWER_KEYS,
} from './sanitize-allow.js';
import { chapterDirName, defaultLocations } from './paths.js';
import type { Locations } from './paths.js';
import { readWebpInfo } from './webp.js';

/**
 * Deterministic extractor for the approved chapter 1-4 content packages.
 *
 *   node dist/scripts/academy-import/extract.js <sourceDir> [--check] [--chapters 1,2]
 *
 * The source HTML files are read, gated on the whole-file and payload hashes published in the
 * chapter specs, converted to typed blocks and written to `content/packages/chNN/` (JSON) and
 * `frontend/public/assets/academy/chNN/` (images, bytes unchanged). Nothing is read from the
 * network and no timestamp is written, so a re-run is byte-identical. The source HTML is never
 * committed.
 */

type Rec = Record<string, unknown>;

const rec = (v: unknown, where: string): Rec => {
  if (v === null || typeof v !== 'object' || Array.isArray(v))
    throw new Error(`${where}: object expected`);
  return v as Rec;
};
const arr = (v: unknown, where: string): unknown[] => {
  if (!Array.isArray(v)) throw new Error(`${where}: array expected`);
  return v;
};
const str = (v: unknown, where: string): string => {
  if (typeof v !== 'string' || v.length === 0)
    throw new Error(`${where}: non-empty string expected`);
  return v;
};
const num = (v: unknown, where: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${where}: number expected`);
  return v;
};
const numArr = (v: unknown, where: string, length?: number): number[] => {
  const a = arr(v, where).map((x, i) => num(x, `${where}[${i}]`));
  if (length !== undefined && a.length !== length)
    throw new Error(`${where}: expected ${length} values, got ${a.length}`);
  return a;
};

/* ------------------------------------------------------------------ source loading */

export interface SourceBundle {
  gate: ChapterGate;
  htmlFile: string;
  htmlBytes: number;
  htmlSha256: string;
  payloadText: string;
  payloadSha256: string;
  plain: Rec;
  raw: RawJson;
  /** Names of every gate that passed (stored in the manifest). */
  gates: string[];
  lessonHashes: Record<string, string>;
  objectHashes: Record<string, string>;
  /** Raw text of the learning-module script (cross-checks of hard-coded UI constants only). */
  moduleText: string;
}

type ParseNode = DefaultTreeAdapterMap['node'];

function scriptText(root: ParseNode, id: string): string | null {
  const stack: ParseNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop() as ParseNode;
    if (isElement(node)) {
      if (node.tagName === 'script' && node.attrs.some((a) => a.name === 'id' && a.value === id))
        return node.childNodes.map((c) => (isText(c) ? c.value : '')).join('');
    }
    const kids = (node as { childNodes?: ParseNode[] }).childNodes;
    if (kids) for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i] as ParseNode);
  }
  return null;
}

function rawAt(raw: RawJson, key: string): RawJson {
  if (key === '$') return raw;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || raw instanceof RawNumber)
    throw new Error(`raw payload is not an object (looking for ${key})`);
  const v = (raw as { [k: string]: RawJson })[key];
  if (v === undefined) throw new Error(`payload has no "${key}"`);
  return v;
}

function mismatch(what: string, expected: string | number, actual: string | number): never {
  throw new Error(`GATE FAILED: ${what}\n  expected ${expected}\n  actual   ${actual}`);
}

export function loadSource(chapter: ChapterNo, sourceDir: string): SourceBundle {
  const gate = CHAPTER_GATES[chapter];
  const file = gate.html_files.map((f) => join(sourceDir, f)).find((f) => existsSync(f));
  if (!file)
    throw new Error(
      `chapter ${chapter}: none of ${gate.html_files.join(', ')} found in ${sourceDir}`,
    );
  const buf = readFileSync(file);
  const gates: string[] = [];
  if (buf.length !== gate.html_bytes)
    mismatch(`C${chapter} html size`, gate.html_bytes, buf.length);
  gates.push('html_bytes');
  const htmlSha256 = sha256Hex(buf);
  if (htmlSha256 !== gate.html_sha256)
    mismatch(`C${chapter} html sha256`, gate.html_sha256, htmlSha256);
  gates.push('html_sha256');

  const doc = parse(buf.toString('utf8'));
  const payloadText = scriptText(doc, gate.script_id);
  if (payloadText === null) throw new Error(`C${chapter}: script#${gate.script_id} not found`);
  const payloadSha256 = sha256Hex(Buffer.from(payloadText, 'utf8'));
  if (payloadSha256 !== gate.payload_text_sha256)
    mismatch(`C${chapter} payload text sha256`, gate.payload_text_sha256, payloadSha256);
  gates.push(gate.payload_text_in_spec ? 'payload_text_sha256' : 'payload_text_sha256(pinned)');
  const moduleText = scriptText(doc, `ch${chapter}-learning-module`) ?? '';

  const plain = rec(JSON.parse(payloadText), `C${chapter} payload`);
  const raw = parseRawJson(payloadText);
  if (plain.version !== gate.payload_version)
    mismatch(`C${chapter} payload version`, gate.payload_version, String(plain.version));
  gates.push('payload_version');

  const objectHashes: Record<string, string> = {};
  for (const [key, expected] of Object.entries(gate.object_hashes)) {
    const actual = canonicalHash(rawAt(raw, key));
    if (actual !== expected) mismatch(`C${chapter} object hash "${key}"`, expected, actual);
    objectHashes[key] = actual;
    gates.push(`object:${key}`);
  }

  const lessons = arr(plain.lessons, `C${chapter} lessons`);
  const rawLessons = rawAt(raw, 'lessons') as RawJson[];
  const lessonHashes: Record<string, string> = {};
  gate.lessons.forEach((lg) => {
    const idx = lessons.findIndex((l) => rec(l, 'lesson').id === lg.source_id);
    if (idx < 0) throw new Error(`C${chapter}: lesson ${lg.source_id} missing from payload`);
    const actual = canonicalHash(rawLessons[idx] as RawJson);
    if (lg.object_sha256 !== null) {
      if (actual !== lg.object_sha256)
        mismatch(`C${chapter} lesson ${lg.id}`, lg.object_sha256, actual);
      gates.push(`lesson:${lg.id}`);
    }
    lessonHashes[lg.id] = actual;
  });
  return {
    gate,
    htmlFile: file.slice(file.lastIndexOf('/') + 1),
    htmlBytes: buf.length,
    htmlSha256,
    payloadText,
    payloadSha256,
    plain,
    raw,
    gates,
    lessonHashes,
    objectHashes,
    moduleText,
  };
}

/* ------------------------------------------------------------------ build result */

export interface ChapterBuild {
  chapter: ChapterNo;
  lessons: PackageLesson[];
  questions?: PrivateQuestion[];
  charts?: Record<string, ChartModel>;
  assets?: Record<string, AssetEntry>;
  /** Image files relative to frontend/public. */
  images: { file: string; bytes: Buffer }[];
  manifest: Omit<ImportManifest, 'outputs'>;
}

/* ------------------------------------------------------------------ lesson shell */

type LessonShell = Omit<PackageLesson, 'sections'>;

function sectionsOf(
  lg: LessonGate,
  payloadLesson: Rec,
  ctxBase: Omit<
    ConvertContext,
    'where' | 'usedCharts' | 'usedImages' | 'generated' | 'droppedLegends'
  >,
  tally: Tally,
): PackageLesson['sections'] {
  const sections = arr(payloadLesson.sections, `${lg.id} sections`);
  if (sections.length !== 4)
    throw new Error(`${lg.id}: expected 4 sections, got ${sections.length}`);
  return sections.map((s, i) => {
    const sec = rec(s, `${lg.id} section ${i + 1}`);
    const where = `${lg.id}/s${i + 1}`;
    const html = str(sec.html, `${where} html`);
    const ctx: ConvertContext = {
      ...ctxBase,
      where,
      usedCharts: tally.charts,
      usedImages: tally.images,
      generated: new Set<Block>(),
      droppedLegends: 0,
    };
    const blocks = convertSection(html, ctx);
    tally.droppedLegends += ctx.droppedLegends;
    const expected = sourceSectionText(html);
    const actual = blocksText(blocks, ctx.generated);
    tally.sectionsChecked += 1;
    if (expected.length < 40) throw new Error(`${where}: suspiciously short source text`);
    if (expected !== actual) {
      throw new Error(
        `${where}: text differs from the source section (${firstDifference(expected, actual)})`,
      );
    }
    tally.sectionsMatched += 1;
    if (blocks.length === 0) throw new Error(`${where}: empty section`);
    return {
      id: `s${i + 1}` as 's1' | 's2' | 's3' | 's4',
      title: str(sec.title, `${where} title`),
      blocks,
    };
  });
}

interface Tally {
  charts: string[];
  images: string[];
  sectionsChecked: number;
  sectionsMatched: number;
  droppedLegends: number;
}

const newTally = (): Tally => ({
  charts: [],
  images: [],
  sectionsChecked: 0,
  sectionsMatched: 0,
  droppedLegends: 0,
});

function lessonShell(
  src: SourceBundle,
  lg: LessonGate,
  order: number,
  fields: { name: string; title: string; lead: string; nav: [string, string, string, string] },
): LessonShell {
  const version = src.gate.payload_version.replace(/-preview$/, '');
  if (fields.name !== lg.name)
    throw new Error(`${lg.id}: payload name "${fields.name}" differs from catalogue "${lg.name}"`);
  return {
    id: lg.id,
    chapter: src.gate.chapter,
    order,
    lesson_key: lg.lesson_key,
    kind: lg.kind,
    name: fields.name,
    title: fields.title,
    lead: fields.lead,
    nav_labels: fields.nav,
    completion: src.gate.completion,
    content_version: src.gate.content_version,
    source: {
      package: src.gate.package,
      package_version: version,
      payload_sha256: src.payloadSha256,
      object_sha256: src.lessonHashes[lg.id] as string,
    },
    config_id: lg.config_id,
    fixture: {},
  };
}

function inlineCell(cell: string, where: string): string {
  const clean = sanitizeHtml(cell, { strict: true, tags: INLINE_TAGS });
  if (clean !== cell) throw new Error(`${where}: computed cell is not allowlisted ("${cell}")`);
  return cell;
}

function computedTable(
  table: ComputedTable,
  source: NonNullable<TableBlock['source']>,
  where: string,
): TableBlock {
  return {
    type: 'table',
    head: table.head.map((c) => inlineCell(c, where)),
    rows: table.rows.map((r) => r.map((c) => inlineCell(c, where))),
    source,
  };
}

/* ---------------------------------------------------------------------- questions */

interface QuestionInput {
  lesson: LessonGate;
  qid: string;
  source: Rec;
}

function buildQuestion(
  input: QuestionInput,
  figure: PrivateQuestion['figure'] | undefined,
): PrivateQuestion {
  const { qid, source, lesson } = input;
  const sourceId = str(source.id, `${qid} id`);
  const options = arr(source.options, `${qid} options`).map((o, i) => {
    const opt = rec(o, `${qid} option ${i}`);
    const oid = str(opt.id, `${qid} option id`);
    return {
      id: opaqueOptionId(qid, oid),
      source_id: oid,
      text: str(opt.text, `${qid}/${oid} text`),
      explanation: str(opt.explanation, `${qid}/${oid} explanation`),
    };
  });
  const correctSource = str(source.correct, `${qid} correct`);
  const correct = options.find((o) => o.source_id === correctSource);
  if (!correct) throw new Error(`${qid}: correct option ${correctSource} is not among the options`);
  // The approved bank lists the key first for every chapter 3 question (all `o1`); storing the
  // options in opaque-id order keeps the position of the key out of the data as well.
  options.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const section = num(source.section, `${qid} section`);
  if (![1, 2, 3, 4].includes(section)) throw new Error(`${qid}: bad section ${section}`);
  const hint = source.hint;
  return {
    id: qid,
    source_id: sourceId,
    lesson_id: lesson.id,
    topic: str(source.topic, `${qid} topic`),
    section: section as 1 | 2 | 3 | 4,
    ...(typeof hint === 'string' && hint.length > 0 ? { hint } : {}),
    prompt: str(source.question, `${qid} question`),
    ...(figure ? { figure } : {}),
    options,
    correct_option_id: correct.id,
  };
}

function groupQuestions(
  src: SourceBundle,
  lessonOf: (q: Rec) => string,
): { lesson: LessonGate; items: Rec[] }[] {
  const all = arr(src.plain.questions, 'questions').map((q, i) => rec(q, `question ${i}`));
  const used = new Set<Rec>();
  const groups = src.gate.lessons.map((lesson) => {
    const items = all.filter((q) => lessonOf(q) === lesson.source_id);
    items.forEach((q) => used.add(q));
    if (items.length !== lesson.counts.questions)
      throw new Error(
        `${lesson.id}: ${items.length} questions, expected ${lesson.counts.questions}`,
      );
    return { lesson, items };
  });
  if (used.size !== all.length) throw new Error('questions that belong to no lesson');
  return groups;
}

function qid(lesson: LessonGate, index: number): string {
  return `${lesson.id}-q${String(index + 1).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ C1 + C3 builds */

function checkQuestionSet(qs: PrivateQuestion[], gate: ChapterGate): void {
  if (qs.length !== gate.totals.questions)
    throw new Error(`expected ${gate.totals.questions} questions, built ${qs.length}`);
  const ids = new Set(qs.map((q) => q.id));
  if (ids.size !== qs.length) throw new Error('duplicate question ids');
  for (const q of qs) {
    const texts = [q.prompt, q.topic, ...(q.hint ? [q.hint] : [])];
    for (const t of texts)
      if (/[<][a-z/]/i.test(t)) throw new Error(`${q.id}: markup in plain text`);
  }
}

function buildChapter1(src: SourceBundle): ChapterBuild {
  const gate = src.gate;
  const p = src.plain;
  const data: Ch1Data = {
    prices: numArr(p.prices, 'prices', 177),
    volumes: numArr(p.volumes, 'volumes', 177),
    examPrices: numArr(p.examPrices, 'examPrices', 126),
    examVolumes: numArr(p.examVolumes, 'examVolumes', 126),
    datasets: {
      bbBuy: numArr(rec(p.datasets, 'datasets').bbBuy, 'datasets.bbBuy', 22),
      bbSell: numArr(rec(p.datasets, 'datasets').bbSell, 'datasets.bbSell', 22),
    },
  };
  const lessonCharts = buildLessonCharts(data);
  if (lessonCharts.length !== 16)
    throw new Error(`expected 16 lesson charts, built ${lessonCharts.length}`);
  const hooks = buildHooks(data);
  const chartIds = new Set(lessonCharts.map((c) => c.id));
  const resolver: HookResolver = {
    macdSeed: () => {
      const table = computedTable(
        hooks.macdSeed.table,
        { kind: 'computed', hook: 'macd-seed' },
        'macd-seed',
      );
      const summary: HtmlBlock = { type: 'html', html: hooks.macdSeed.summaryHtml };
      return { blocks: [table, summary], generated: [table, summary] };
    },
    application: (name) => {
      const entry = hooks.application[name as ApplicationHook];
      if (!entry) throw new Error(`unknown data-application hook "${name}"`);
      const table = computedTable(
        entry.table,
        { kind: 'computed', hook: 'application', chart_id: entry.chartId },
        `application:${name}`,
      );
      return { blocks: [table], generated: [table] };
    },
  };

  const payloadLessons = arr(p.lessons, 'lessons').map((l, i) => rec(l, `lesson ${i}`));
  const tally = newTally();
  const lessons: PackageLesson[] = gate.lessons.map((lg, idx) => {
    const pl = payloadLessons.find((l) => l.id === lg.source_id);
    if (!pl) throw new Error(`lesson ${lg.source_id} missing`);
    const toc = arr(pl.toc, `${lg.id} toc`).map((t, i) => str(t, `${lg.id} toc ${i}`));
    if (toc.length !== 4) throw new Error(`${lg.id}: toc must have 4 labels`);
    const shell = lessonShell(src, lg, idx + 1, {
      name: str(pl.name, `${lg.id} name`),
      title: str(pl.full, `${lg.id} full`),
      lead: str(pl.lead, `${lg.id} lead`),
      nav: toc as [string, string, string, string],
    });
    const sections = sectionsOf(lg, pl, { chartIds, hooks: resolver }, tally);
    return { ...shell, sections };
  });

  // Lesson chart coverage: blocks reference exactly the 16 expected ids, in lesson order.
  const expectedOrder = lessonCharts.map((c) => c.id);
  if (JSON.stringify(tally.charts) !== JSON.stringify(expectedOrder))
    throw new Error(
      `chart blocks ${JSON.stringify(tally.charts)} differ from the expected ${JSON.stringify(expectedOrder)}`,
    );

  // Questions.
  const questions: PrivateQuestion[] = [];
  const charts: Record<string, ChartModel> = {};
  for (const c of lessonCharts) charts[c.id] = c.model;
  let questionCharts = 0;
  let questionTables = 0;
  for (const { lesson, items } of groupQuestions(src, (q) => str(q.lesson, 'question lesson'))) {
    items.forEach((q, i) => {
      const id = qid(lesson, i);
      const sourceId = str(q.id, `${id} id`);
      if (sourceId !== `${lesson.source_id}-q${i + 1}`)
        throw new Error(`${id}: source id ${sourceId} is out of order`);
      const chart = q.chart === null || q.chart === undefined ? null : rec(q.chart, `${id} chart`);
      let figure: PrivateQuestion['figure'];
      if (chart && chart.kind === 'matrix') {
        const head = arr(chart.head, `${id} head`).map((h, k) => str(h, `${id} head ${k}`));
        const rows = arr(chart.rows, `${id} rows`).map((r, k) =>
          arr(r, `${id} row ${k}`).map((c, j) => str(c, `${id} cell ${k}.${j}`)),
        );
        figure = { type: 'table', head, rows };
        questionTables += 1;
      } else if (chart) {
        const source: QuestionChartSource = {
          kind: str(chart.kind, `${id} chart kind`),
          start: num(chart.start, `${id} start`),
          end: num(chart.end, `${id} end`),
          ...(Array.isArray(chart.marks)
            ? {
                marks: chart.marks.map((m, k) =>
                  typeof m === 'number'
                    ? m
                    : {
                        i: num(rec(m, `${id} mark ${k}`).i, `${id} mark i`),
                        label: str(rec(m, `${id} mark ${k}`).label, `${id} mark label`),
                      },
                ),
              }
            : {}),
          ...(typeof chart.dataset === 'string' ? { dataset: chart.dataset } : {}),
          ...(typeof chart.mult === 'number' ? { mult: chart.mult } : {}),
        };
        charts[id] = questionChartModel(data, lesson.source_id, source);
        figure = { type: 'chart', chart_id: id };
        questionCharts += 1;
      }
      questions.push(buildQuestion({ lesson, qid: id, source: q }, figure));
    });
  }
  checkQuestionSet(questions, gate);
  // Windows and A/B marks must equal the ones the spec lists (index 0-based, absolute).
  if (JSON.stringify(Object.keys(charts)) !== JSON.stringify(Object.keys(C1_CHART_WINDOWS)))
    throw new Error('chapter 1 chart ids differ from the spec inventory');
  for (const [id, expect] of Object.entries(C1_CHART_WINDOWS)) {
    const m = charts[id];
    if (!m || m.kind !== 'series_panels')
      throw new Error(`chart ${id} is not a series_panels model`);
    const got = JSON.stringify([m.x.start, m.x.end, m.marks.map((k) => [k.i, k.label])]);
    const want = JSON.stringify([expect.start, expect.end, expect.marks]);
    if (got !== want) throw new Error(`chart ${id}: window/marks ${got} differ from ${want}`);
  }
  if (questionCharts !== 10 || questionTables !== 2)
    throw new Error(
      `expected 10 chart + 2 matrix questions, got ${questionCharts} + ${questionTables}`,
    );
  const hints = questions.filter((q) => q.hint !== undefined).length;
  if (hints !== 9) throw new Error(`expected 9 hints, got ${hints}`);

  return finish(src, {
    lessons,
    questions,
    charts,
    images: [],
    tally,
    extraCounts: {
      chart_models: Object.keys(charts).length,
      question_charts: questionCharts,
      question_tables: questionTables,
      hints,
      explanations: questions.length * 4,
      hooks_macd_seed: 1,
      hooks_application: 5,
    },
  });
}

/** Evaluate the QA-only `proof` oracle of a chapter 3 question (not copied to the package). */
export function evaluateProof(proof: Rec, where: string): number {
  const op = str(proof.op, `${where} op`);
  const args = proof.args;
  const n = (v: unknown, w: string): number => num(v, `${where} ${w}`);
  const list = arr(args, `${where} args`);
  switch (op) {
    case 'subtract':
      return n(list[0], 'a') - n(list[1], 'b');
    case 'growth':
      return (n(list[0], 'cur') / n(list[1], 'prev') - 1) * 100;
    case 'eps':
      return (n(list[0], 'profit') / n(list[1], 'shares')) * 1000;
    case 'weighted':
      return list.reduce<number>((s, pair, i) => {
        const [v, w] = arr(pair, `${where} pair ${i}`);
        return s + n(v, 'value') * n(w, 'weight');
      }, 0);
    case 'eps_growth': {
      const cur = n(list[0], 'profit') / n(list[1], 'shares');
      const prev = n(list[2], 'profit_prev') / n(list[3], 'shares_prev');
      return (cur / prev - 1) * 100;
    }
    case 'gross_margin':
      return ((n(list[0], 'revenue') - n(list[1], 'cost')) / n(list[0], 'revenue')) * 100;
    case 'ratio_sums': {
      const top = numArr(list[0], `${where} numerators`).reduce((a, b) => a + b, 0);
      const bottom = numArr(list[1], `${where} denominators`).reduce((a, b) => a + b, 0);
      return (top / bottom) * 100;
    }
    case 'ratio':
      return (n(list[0], 'a') / n(list[1], 'b')) * 100;
    case 'roe':
      return (n(list[0], 'profit') / ((n(list[1], 'equity0') + n(list[2], 'equity1')) / 2)) * 100;
    default:
      throw new Error(`${where}: unknown proof op "${op}"`);
  }
}

function buildChapter3(src: SourceBundle, locations: Locations): ChapterBuild {
  const gate = src.gate;
  const p = src.plain;
  const rawCharts = rec(p.charts, 'charts');
  const charts = chartsFileSchema.parse(JSON.parse(JSON.stringify(rawCharts))) as Record<
    string,
    ChartModel
  >;
  if (Object.keys(charts).length !== 14) throw new Error('expected 14 chart definitions');
  // The definitions are copied verbatim: the schema pass must not add, drop or change any value.
  const chartsCopyHash = canonicalPlainHash(charts);
  if (chartsCopyHash !== canonicalPlainHash(rawCharts))
    throw new Error('chart definitions changed while copying');

  const registry = JSON.parse(readFileSync(locations.fundamentalRegistry, 'utf8')) as {
    id: string;
  }[];
  const metricIds = new Set(registry.map((m) => m.id));

  const payloadLessons = arr(p.lessons, 'lessons').map((l, i) => rec(l, `lesson ${i}`));
  const tally = newTally();
  const lessons: PackageLesson[] = gate.lessons.map((lg, idx) => {
    const pl = payloadLessons.find((l) => l.id === lg.source_id);
    if (!pl) throw new Error(`lesson ${lg.source_id} missing`);
    const alias = str(pl.key, `${lg.id} key`);
    if (C3_METRIC_ALIASES[alias] !== lg.config_id)
      throw new Error(`${lg.id}: payload key ${alias} does not map to ${lg.config_id}`);
    if (!lg.config_id || !metricIds.has(lg.config_id))
      throw new Error(`${lg.id}: ${lg.config_id} is not in the fundamental registry`);
    const name = str(pl.name, `${lg.id} name`);
    const shell = lessonShell(src, lg, idx + 1, {
      name,
      title: name,
      lead: str(pl.lead, `${lg.id} lead`),
      nav: gate.nav_labels,
    });
    const sections = sectionsOf(lg, pl, { chartIds: new Set(Object.keys(charts)) }, tally);
    return { ...shell, sections };
  });
  const navLiteral = `['${gate.nav_labels.join("','")}']`;
  if (src.moduleText && !src.moduleText.includes(navLiteral))
    throw new Error('chapter 3 section navigation labels differ from the handoff module');

  // The 13 data-chart markers equal the ids the spec lists, each exactly once.
  if (JSON.stringify([...tally.charts].sort()) !== JSON.stringify([...C3_LESSON_CHART_IDS].sort()))
    throw new Error(`chart markers ${tally.charts.join(',')} differ from the spec list`);

  const questions: PrivateQuestion[] = [];
  let questionCharts = 0;
  let questionTables = 0;
  let proofs = 0;
  const chartsInQuestions = new Set<string>();
  for (const { lesson, items } of groupQuestions(src, (q) => str(q.lesson, 'question lesson'))) {
    items.forEach((q, i) => {
      const id = qid(lesson, i);
      let figure: PrivateQuestion['figure'];
      if (typeof q.chart === 'string') {
        if (!(q.chart in charts)) throw new Error(`${id}: unknown chart ${q.chart}`);
        figure = { type: 'chart', chart_id: q.chart };
        chartsInQuestions.add(q.chart);
        questionCharts += 1;
      } else if (q.table !== undefined) {
        const t = rec(q.table, `${id} table`);
        figure = {
          type: 'table',
          head: arr(t.head, `${id} head`).map((h, k) => str(h, `${id} head ${k}`)),
          rows: arr(t.rows, `${id} rows`).map((r, k) =>
            arr(r, `${id} row ${k}`).map((c, j) => str(c, `${id} cell ${k}.${j}`)),
          ),
        };
        questionTables += 1;
      }
      if (q.proof !== undefined) {
        const proof = rec(q.proof, `${id} proof`);
        const got = evaluateProof(proof, id);
        const want = num(proof.expected, `${id} expected`);
        if (Math.abs(got - want) > 1e-9 * Math.max(1, Math.abs(want)))
          throw new Error(`${id}: proof ${String(proof.op)} gives ${got}, expected ${want}`);
        proofs += 1;
      }
      questions.push(buildQuestion({ lesson, qid: id, source: q }, figure));
    });
  }
  checkQuestionSet(questions, gate);
  if (questionCharts !== 10 || questionTables !== 8)
    throw new Error(
      `expected 10 chart + 8 table questions, got ${questionCharts} + ${questionTables}`,
    );
  if (proofs !== 16) throw new Error(`expected 16 recomputed proofs, got ${proofs}`);
  const hints = questions.filter((q) => q.hint !== undefined).length;
  if (hints !== 1) throw new Error(`expected 1 hint, got ${hints}`);
  const sourceCorrect = new Set(
    arr(p.questions, 'questions').map((q) => rec(q, 'q').correct as string),
  );
  const opaqueCorrect = new Set(questions.map((q) => q.correct_option_id));
  const positions = new Set(
    questions.map((q) => q.options.findIndex((o) => o.id === q.correct_option_id)),
  );
  if (sourceCorrect.size !== 1 || opaqueCorrect.size !== questions.length || positions.size < 3)
    throw new Error(
      'expected a constant source key re-keyed to distinct opaque ids at varied positions',
    );
  for (const id of Object.keys(charts)) {
    const used = tally.charts.includes(id) || chartsInQuestions.has(id);
    if (!used) throw new Error(`chart definition ${id} is referenced nowhere`);
  }

  return finish(src, {
    lessons,
    questions,
    charts,
    images: [],
    tally,
    copied: { charts: chartsCopyHash },
    extraCounts: {
      chart_models: Object.keys(charts).length,
      question_charts: questionCharts,
      question_tables: questionTables,
      hints,
      explanations: questions.length * 4,
      proofs_recomputed: proofs,
    },
  });
}

/* --------------------------------------------------------------- C2 + C4 (guides) */

function decodeImages(src: SourceBundle): {
  metas: Record<string, ImageMeta>;
  assets: Record<string, AssetEntry>;
  files: ChapterBuild['images'];
} {
  const gate = src.gate;
  const dir = `assets/academy/${chapterDirName(gate.chapter)}`;
  const table = rec(src.plain.images, 'images');
  const ids = Object.keys(table).sort();
  const expected = Object.keys(gate.images).sort();
  if (JSON.stringify(ids) !== JSON.stringify(expected))
    throw new Error(`image ids differ from the spec table: ${ids.join(',')}`);
  const metas: Record<string, ImageMeta> = {};
  const assets: Record<string, AssetEntry> = {};
  const files: ChapterBuild['images'] = [];
  for (const id of ids) {
    const item = rec(table[id], `image ${id}`);
    const uri = str(item.src, `image ${id} src`);
    const prefix = 'data:image/webp;base64,';
    if (!uri.startsWith(prefix)) throw new Error(`image ${id}: not a webp data URI`);
    const b64 = uri.slice(prefix.length);
    const bytes = Buffer.from(b64, 'base64');
    if (bytes.toString('base64') !== b64) throw new Error(`image ${id}: base64 is not canonical`);
    const sha = sha256Hex(bytes);
    const want = gate.images[id] as NonNullable<ChapterGate['images'][string]>;
    if (sha !== str(item.sha256, `image ${id} sha256`))
      mismatch(`image ${id} sha256 vs payload`, item.sha256 as string, sha);
    if (sha !== want.sha256) mismatch(`image ${id} sha256 vs spec`, want.sha256, sha);
    const info = readWebpInfo(bytes);
    if (info.width !== want.width || info.height !== want.height)
      mismatch(
        `image ${id} RIFF dimensions`,
        `${want.width}x${want.height}`,
        `${info.width}x${info.height}`,
      );
    if (
      num(item.width, `image ${id} width`) !== info.width ||
      num(item.height, `image ${id} height`) !== info.height
    )
      throw new Error(`image ${id}: payload dimensions differ from the RIFF header`);
    const fileName = `${id}.${sha.slice(0, 8)}.webp`;
    const caption = str(item.caption, `image ${id} caption`);
    metas[id] = { src: `/${dir}/${fileName}`, width: info.width, height: info.height, caption };
    const marks = arr(item.marks, `image ${id} marks`).map((m, i) => {
      const mark = rec(m, `image ${id} mark ${i}`);
      return {
        number: num(mark.number, 'mark number'),
        selector: str(mark.selector, 'mark selector'),
      };
    });
    assets[id] = {
      file: `${dir}/${fileName}`,
      sha256: sha,
      bytes: bytes.length,
      width: info.width,
      height: info.height,
      mime: 'image/webp',
      alt: caption,
      marks,
    };
    files.push({ file: `${dir}/${fileName}`, bytes });
  }
  src.gates.push(`images:${ids.length}`);
  return { metas, assets: assetsManifestSchema.parse(assets), files };
}

function buildGuideChapter(src: SourceBundle): ChapterBuild {
  const gate = src.gate;
  const p = src.plain;
  const { metas, assets, files } = decodeImages(src);
  if ('questions' in p) throw new Error(`C${gate.chapter}: guide payload must not carry questions`);
  const family = gate.package;
  const payloadLessons = arr(p.lessons, 'lessons').map((l, i) => rec(l, `lesson ${i}`));
  const tally = newTally();
  const lessons: PackageLesson[] = gate.lessons.map((lg, idx) => {
    const pl = payloadLessons.find((l) => l.id === lg.source_id);
    if (!pl) throw new Error(`lesson ${lg.source_id} missing`);
    if (pl.type !== 'guide' || pl.capability_id !== null)
      throw new Error(`${lg.id}: guide lessons must have type guide and capability_id null`);
    const completion = rec(pl.completion, `${lg.id} completion`);
    if (
      completion.type !== 'manual' ||
      completion.button_label !== (gate.completion as { button_label: string }).button_label
    )
      throw new Error(`${lg.id}: completion differs from the manual button contract`);
    if (pl.stable_key !== `${family}/${lg.id}`)
      throw new Error(
        `${lg.id}: stable key ${String(pl.stable_key)} differs from ${family}/${lg.id}`,
      );
    if (num(pl.order, `${lg.id} order`) !== idx + 1) throw new Error(`${lg.id}: unexpected order`);
    const name = str(pl.name, `${lg.id} name`);
    const shell = lessonShell(src, lg, idx + 1, {
      name,
      title: name,
      lead: str(pl.lead, `${lg.id} lead`),
      nav: gate.nav_labels,
    });
    const sections = sectionsOf(lg, pl, { chartIds: new Set<string>(), images: metas }, tally);
    return { ...shell, sections };
  });
  const navLiteral = `['${gate.nav_labels.join("','")}']`;
  if (src.moduleText && !src.moduleText.includes(navLiteral))
    throw new Error(
      `chapter ${gate.chapter} section navigation labels differ from the handoff module`,
    );

  // Every image is referenced exactly once; nothing dangles.
  const used = [...tally.images].sort();
  const all = Object.keys(assets).sort();
  if (JSON.stringify(used) !== JSON.stringify(all))
    throw new Error(
      `image references differ from the image table (${used.length} vs ${all.length})`,
    );
  if (new Set(used).size !== used.length) throw new Error('an image is referenced twice');

  return finish(src, {
    lessons,
    assets,
    images: files,
    tally,
    extraCounts: { asset_bytes: files.reduce((s, f) => s + f.bytes.length, 0) },
  });
}

/* ------------------------------------------------------------------ finishing */

interface FinishInput {
  lessons: PackageLesson[];
  questions?: PrivateQuestion[];
  charts?: Record<string, ChartModel>;
  assets?: Record<string, AssetEntry>;
  images: ChapterBuild['images'];
  tally: Tally;
  /** JS-canonical hashes of sub-trees copied verbatim (verify recomputes them from the output). */
  copied?: Record<string, string>;
  extraCounts: Record<string, number>;
}

function finish(src: SourceBundle, input: FinishInput): ChapterBuild {
  const gate = src.gate;
  const lessons = packageLessonsFileSchema.parse(input.lessons);
  const per_lesson: ImportManifest['per_lesson'] = {};
  const total = { charts: 0, images: 0, tables: 0, computed: 0, html: 0 };
  lessons.forEach((l, i) => {
    const lg = gate.lessons[i] as LessonGate;
    const c = countBlocks(l.sections.flatMap((s) => s.blocks));
    const questions = input.questions?.filter((q) => q.lesson_id === l.id).length ?? 0;
    per_lesson[l.id] = {
      charts: c.chart,
      images: c.image,
      tables: c.table - c.computed_table,
      computed_tables: c.computed_table,
      questions,
    };
    const got = per_lesson[l.id] as ImportManifest['per_lesson'][string];
    for (const key of ['charts', 'images', 'tables', 'questions'] as const) {
      if (got[key] !== lg.counts[key])
        throw new Error(`${l.id}: ${key} = ${got[key]}, expected ${lg.counts[key]}`);
    }
    total.charts += c.chart;
    total.images += c.image;
    total.tables += got.tables;
    total.computed += c.computed_table;
    total.html += c.html;
  });
  if (
    total.images !== gate.totals.images ||
    total.charts !== gate.totals.charts ||
    total.tables !== gate.totals.tables
  )
    throw new Error(
      `totals charts/images/tables = ${total.charts}/${total.images}/${total.tables}, expected ${gate.totals.charts}/${gate.totals.images}/${gate.totals.tables}`,
    );

  // Public data must not carry answers or shell leftovers.
  const publicFindings = [
    ...scanForbidden(lessons, { where: 'lessons' }),
    ...scanForbidden(lessons, { keys: ANSWER_KEYS, where: 'lessons' }),
    ...(input.charts ? scanForbidden(input.charts, { where: 'charts' }) : []),
    ...(input.charts ? scanForbidden(input.charts, { keys: ANSWER_KEYS, where: 'charts' }) : []),
    ...(input.assets ? scanForbidden(stripMarks(input.assets), { where: 'assets' }) : []),
  ];
  if (input.questions) {
    const pub = input.questions.map((q) => ({
      ...q,
      correct_option_id: undefined,
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
    }));
    publicFindings.push(...scanForbidden(pub, { where: 'questions(public view)' }));
  }
  if (publicFindings.length > 0)
    throw new Error(`do-not-copy scan failed:\n  ${publicFindings.slice(0, 20).join('\n  ')}`);

  if (input.questions) privateQuestionsFileSchema.parse(input.questions);
  if (input.charts) chartsFileSchema.parse(input.charts);

  const counts: Record<string, number> = {
    lessons: lessons.length,
    sections: lessons.reduce((n, l) => n + l.sections.length, 0),
    lesson_charts: total.charts,
    images: total.images,
    tables: total.tables,
    computed_tables: total.computed,
    html_blocks: total.html,
    questions: input.questions?.length ?? 0,
    legends_dropped: input.tally.droppedLegends,
    ...input.extraCounts,
  };
  const lessonsInSpec = gate.lessons.every((l) => l.object_sha256 !== null);
  const manifest: Omit<ImportManifest, 'outputs'> = {
    format: PACKAGE_FORMAT_VERSION,
    chapter: gate.chapter,
    package: gate.package,
    package_version: gate.payload_version.replace(/-preview$/, ''),
    content_version: gate.content_version,
    source: {
      html_file: src.htmlFile,
      html_bytes: src.htmlBytes,
      html_sha256: src.htmlSha256,
      payload_script_id: gate.script_id,
      payload_text_sha256: src.payloadSha256,
      payload_text_in_spec: gate.payload_text_in_spec,
      objects: src.objectHashes,
      lessons: src.lessonHashes,
      lessons_in_spec: lessonsInSpec,
      copied: input.copied ?? {},
      gates: src.gates,
    },
    counts,
    per_lesson,
    text_equivalence: {
      sections_checked: input.tally.sectionsChecked,
      matched: input.tally.sectionsMatched,
    },
  };
  return {
    chapter: gate.chapter,
    lessons,
    ...(input.questions ? { questions: input.questions } : {}),
    ...(input.charts ? { charts: input.charts } : {}),
    ...(input.assets ? { assets: input.assets } : {}),
    images: input.images,
    manifest,
  };
}

/** Selectors of the capture are QA metadata; they contain CSS ids, not learner text. */
function stripMarks(assets: Record<string, AssetEntry>): unknown {
  return Object.fromEntries(Object.entries(assets).map(([k, v]) => [k, { ...v, marks: [] }]));
}

export function buildChapter(src: SourceBundle, locations: Locations): ChapterBuild {
  switch (src.gate.chapter) {
    case 1:
      return buildChapter1(src);
    case 3:
      return buildChapter3(src, locations);
    default:
      return buildGuideChapter(src);
  }
}

/* --------------------------------------------------------------------- output */

/** Serialised JSON outputs of a build, keyed by file name inside `chNN/`. */
export function serializeBuild(build: ChapterBuild): Map<string, string> {
  const files = new Map<string, string>();
  files.set('lessons.vi.json', stableStringify(build.lessons));
  if (build.questions) files.set('questions.vi.private.json', stableStringify(build.questions));
  if (build.charts) files.set('charts.vi.json', stableStringify(build.charts));
  if (build.assets) files.set('assets.manifest.json', stableStringify(build.assets));
  const outputs: ImportManifest['outputs'] = {};
  for (const [name, text] of files) {
    outputs[name] = {
      sha256: sha256Hex(Buffer.from(text, 'utf8')),
      bytes: Buffer.byteLength(text),
    };
  }
  const manifest = importManifestSchema.parse({ ...build.manifest, outputs });
  files.set('import-manifest.json', stableStringify(manifest));
  return files;
}

export interface ExtractOptions {
  sourceDir: string;
  chapters?: readonly ChapterNo[];
  /** Compare with the committed files instead of writing. */
  check?: boolean;
  locations?: Locations;
  log?: (line: string) => void;
}

export interface ExtractResult {
  chapter: ChapterNo;
  files: { path: string; bytes: number; changed: boolean }[];
}

export function runExtraction(opts: ExtractOptions): ExtractResult[] {
  const locations = opts.locations ?? defaultLocations();
  const log = opts.log ?? (() => undefined);
  const results: ExtractResult[] = [];
  for (const chapter of opts.chapters ?? CHAPTERS) {
    const src = loadSource(chapter, opts.sourceDir);
    log(`C${chapter}: source gates passed (${src.gates.length})`);
    const build = buildChapter(src, locations);
    const json = serializeBuild(build);
    const dir = join(locations.packagesDir, chapterDirName(chapter));
    const entries: { path: string; data: string | Buffer }[] = [
      ...[...json].map(([name, text]) => ({ path: join(dir, name), data: text })),
      ...build.images.map((img) => ({
        path: join(locations.publicDir, img.file),
        data: img.bytes,
      })),
    ];
    const result: ExtractResult = { chapter, files: [] };
    for (const entry of entries) {
      const data = typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : entry.data;
      const current = existsSync(entry.path) ? readFileSync(entry.path) : null;
      const changed = current === null || !current.equals(data);
      if (!opts.check) {
        mkdirSync(dirname(entry.path), { recursive: true });
        if (changed) writeFileSync(entry.path, data);
      }
      result.files.push({ path: entry.path, bytes: data.length, changed });
    }
    log(
      `C${chapter}: ${result.files.length} files, ${result.files.filter((f) => f.changed).length} ${opts.check ? 'differ' : 'written'}`,
    );
    results.push(result);
  }
  return results;
}

/* ------------------------------------------------------------------------ CLI */

function main(): void {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const chaptersFlag = args.findIndex((a) => a === '--chapters');
  const chapters =
    chaptersFlag >= 0
      ? ((args[chaptersFlag + 1] ?? '').split(',').map(Number) as ChapterNo[])
      : undefined;
  const positional = args.filter(
    (a, i) => !a.startsWith('--') && !(chaptersFlag >= 0 && i === chaptersFlag + 1),
  );
  const sourceDir = positional[0];
  if (!sourceDir) {
    console.error('usage: extract.js <sourceDir> [--check] [--chapters 1,2,3,4]');
    process.exit(2);
  }
  try {
    const results = runExtraction({
      sourceDir: resolve(sourceDir),
      ...(chapters ? { chapters } : {}),
      check,
      log: (line) => console.log(line),
    });
    if (check && results.some((r) => r.files.some((f) => f.changed))) {
      console.error('extraction output differs from the committed files');
      process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
