import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  bankFileSchema,
  catalogFileSchema,
  chartModelSchema,
  lessonFileSchema,
  retiredLessonsFileSchema,
} from '../../src/modules/academy/content/v3/schema.js';
import type {
  BankFile,
  CatalogFile,
  ChartModel,
  LessonFile,
} from '../../src/modules/academy/content/v3/schema.js';
import { optionId } from './banks.js';
import { buildChart, CHART_BUILDERS, TEXT_FIGURES } from './charts/index.js';
import { c4l6Worked, c4l7Worked, c4l9Worked } from './charts/ch4.js';
import { c5l1Example } from './charts/ch5.js';
import { fmtVi } from './charts/math.js';
import { manifestSchema } from './manifest.js';
import type { Manifest } from './manifest.js';
import { bankFileName, lessonFileName, OUTPUT_FILES, outDir } from './paths.js';
import { sha256, stableJson } from './write.js';

/** Gate counts from design §6.5 (fixed by the spec, not by the DOM). */
export const EXPECTED = {
  lessons: 44,
  banks: 49,
  questions: 280,
  sections: 252,
  intro_blocks: 2,
  summaries: 44,
  charts: 114,
  retired: 66,
  blocks: {
    scenario: 19,
    checklist: 13,
    workpad: 18,
    practice_case: 4,
    roleplay_score: 1,
    income_calculator: 1,
    sample_post: 5,
    objection: 6,
    quote: 17,
  },
  self_check: 2,
} as const;

const CH2_EXAM_REPLACEMENTS = [
  'tiết kiệm sắp đáo hạn',
  'về bàn với vợ',
  'gọi ký quỹ',
  'tin đồn chưa xác thực',
];

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

type Model<K extends ChartModel['kind']> = Extract<ChartModel, { kind: K }>;
function chartOf<K extends ChartModel['kind']>(
  lessons: Map<string, LessonFile>,
  id: string,
  kind: K,
): Model<K> {
  const lesson = lessons.get(`ch0${id[1]}-l${id.slice(3, id.indexOf('-')).padStart(2, '0')}`);
  const m = lesson?.charts[id];
  if (!m || m.kind !== kind) throw new Error(`golden: ${id} is not a ${kind}`);
  return m as Model<K>;
}

/** No-source checks over the committed output (design §6.5). Returns a list of problems. */
export function verify(dir: string = outDir()): string[] {
  const errors: string[] = [];
  const check = (ok: boolean, msg: string) => {
    if (!ok) errors.push(msg);
  };
  const parse = <T>(
    what: string,
    schema: {
      safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: unknown[] } };
    },
    v: unknown,
  ): T | undefined => {
    const r = schema.safeParse(v);
    if (!r.success) {
      errors.push(`${what}: ${JSON.stringify(r.error?.issues.slice(0, 5))}`);
      return undefined;
    }
    return r.data;
  };

  /* ---- catalog */
  const catalog = parse<CatalogFile>(
    'catalog',
    catalogFileSchema,
    readJson(join(dir, OUTPUT_FILES.catalog)),
  );
  if (!catalog) return errors;
  const items = catalog.chapters.flatMap((c) =>
    c.published ? c.items.map((i) => ({ ...i, chapter: c.no })) : [],
  );
  const lessonItems = items.filter((i) => i.kind !== 'chapter_exam');
  check(catalog.chapters.filter((c) => c.published).length === 5, 'catalog: 5 published chapters');
  check(items.filter((i) => i.kind === 'lesson').length === 43, 'catalog: 43 required lessons');
  check(items.filter((i) => i.kind === 'chapter_exam').length === 5, 'catalog: 5 exams');

  /* ---- lessons */
  const lessons = new Map<string, LessonFile>();
  const lessonDir = join(dir, OUTPUT_FILES.lessonsDir);
  const lessonNames = existsSync(lessonDir)
    ? readdirSync(lessonDir).filter((n) => n.endsWith('.json'))
    : [];
  check(
    lessonNames.length === EXPECTED.lessons,
    `lessons: ${lessonNames.length} files, expected ${EXPECTED.lessons}`,
  );
  for (const it of lessonItems) {
    const path = join(lessonDir, lessonFileName(it.id));
    if (!existsSync(path)) {
      errors.push(`lesson file missing: ${it.id}`);
      continue;
    }
    const l = parse<LessonFile>(`lesson ${it.id}`, lessonFileSchema, readJson(path));
    if (!l) continue;
    check(
      l.id === it.id &&
        l.lesson_key === it.lesson_key &&
        l.kind === it.kind &&
        l.order === it.order &&
        l.chapter === it.chapter,
      `lesson ${it.id}: header differs from the catalog`,
    );
    check(l.title === it.name, `lesson ${it.id}: title differs from catalog name`);
    lessons.set(it.id, l);
  }

  /* ---- block and chart counts */
  const blocks: Record<string, number> = {};
  let sections = 0;
  let intro = 0;
  let summaries = 0;
  let selfCheck = 0;
  const chartIds: string[] = [];
  for (const l of lessons.values()) {
    sections += l.sections.length;
    intro += l.intro_blocks.length;
    summaries += 1;
    if (l.intro_blocks.length) check(l.id === 'ch01-l01', `${l.id}: intro_blocks only in ch01-l01`);
    for (const b of [...l.intro_blocks, ...l.sections.flatMap((s) => s.blocks)]) {
      blocks[b.type] = (blocks[b.type] ?? 0) + 1;
      if (b.type === 'checklist' && b.mode === 'self_check') selfCheck += 1;
    }
    const prefix = `c${l.chapter}l${Number(l.id.slice(6))}-`;
    for (const [id, model] of Object.entries(l.charts)) {
      chartIds.push(id);
      check(id.startsWith(prefix), `${l.id}: chart ${id} does not start with ${prefix}`);
      check(chartModelSchema.safeParse(model).success, `${l.id}: chart ${id} does not parse`);
      if (!CHART_BUILDERS[id]) {
        errors.push(`${l.id}: chart ${id} has no builder`);
        continue;
      }
      check(
        stableJson(buildChart(id)) === stableJson(model),
        `${l.id}: chart ${id} differs from its builder`,
      );
    }
  }
  check(sections === EXPECTED.sections, `sections: ${sections}, expected ${EXPECTED.sections}`);
  check(
    intro === EXPECTED.intro_blocks,
    `intro_blocks: ${intro}, expected ${EXPECTED.intro_blocks}`,
  );
  check(
    summaries === EXPECTED.summaries,
    `summaries: ${summaries}, expected ${EXPECTED.summaries}`,
  );
  check(
    selfCheck === EXPECTED.self_check,
    `self_check checklists: ${selfCheck}, expected ${EXPECTED.self_check}`,
  );
  for (const [type, n] of Object.entries(EXPECTED.blocks))
    check((blocks[type] ?? 0) === n, `${type} blocks: ${blocks[type] ?? 0}, expected ${n}`);
  check(
    chartIds.length === EXPECTED.charts,
    `charts: ${chartIds.length}, expected ${EXPECTED.charts}`,
  );
  check(new Set(chartIds).size === chartIds.length, 'chart ids repeat across lessons');
  for (const id of Object.keys(CHART_BUILDERS))
    check(chartIds.includes(id), `builder ${id} is never used`);
  for (const id of Object.keys(TEXT_FIGURES))
    check(!chartIds.includes(id), `text figure ${id} emitted as a chart`);

  /* ---- banks */
  const banks = new Map<string, BankFile>();
  const qDir = join(dir, OUTPUT_FILES.questionsDir);
  const bankNames = existsSync(qDir) ? readdirSync(qDir).filter((n) => n.endsWith('.json')) : [];
  check(
    bankNames.length === EXPECTED.banks,
    `banks: ${bankNames.length} files, expected ${EXPECTED.banks}`,
  );
  for (const it of items) {
    const path = join(qDir, bankFileName(it.id));
    if (!existsSync(path)) {
      errors.push(`bank missing: ${it.id}`);
      continue;
    }
    const b = parse<BankFile>(`bank ${it.id}`, bankFileSchema, readJson(path));
    if (!b) continue;
    check(b.item_id === it.id, `bank ${it.id}: item_id`);
    check(
      b.questions.length === it.question_count,
      `bank ${it.id}: ${b.questions.length} questions, expected ${it.question_count}`,
    );
    for (const q of b.questions)
      q.options.forEach((o, j) => {
        check(o.id === optionId(b.salt, q.id, j), `${q.id}: option ${j} id is not the salted HMAC`);
        for (let k = 0; k < 3; k++)
          check(
            o.id !== sha256(`${q.id}|${k}`).slice(0, 10),
            `${q.id}: option id derivable without the salt`,
          );
      });
    banks.set(it.id, b);
  }
  const allQ = [...banks.values()].flatMap((b) => b.questions);
  check(
    allQ.length === EXPECTED.questions,
    `questions: ${allQ.length}, expected ${EXPECTED.questions}`,
  );
  const prompts = allQ.map((q) => q.prompt);
  check(new Set(prompts).size === prompts.length, 'question prompts repeat across banks');
  check(new Set([...banks.values()].map((b) => b.salt)).size === banks.size, 'bank salts repeat');
  const ch2 = banks.get('ch02-exam')?.questions.map((q) => q.prompt) ?? [];
  for (const s of CH2_EXAM_REPLACEMENTS)
    check(
      ch2.some((p) => p.includes(s)),
      `ch02-exam: no question about "${s}"`,
    );

  /* ---- retired */
  const retiredPath = join(dir, OUTPUT_FILES.retired);
  if (!existsSync(retiredPath)) errors.push('retired-lessons.json missing');
  else {
    const r = parse<{ lessons: { lesson_key: string }[] }>(
      'retired',
      retiredLessonsFileSchema,
      readJson(retiredPath),
    );
    if (r) {
      check(
        r.lessons.length === EXPECTED.retired,
        `retired: ${r.lessons.length}, expected ${EXPECTED.retired}`,
      );
      const live = new Set(items.map((i) => i.lesson_key));
      for (const x of r.lessons)
        check(!live.has(x.lesson_key), `retired key ${x.lesson_key} is still in the catalog`);
    }
  }

  /* ---- manifest */
  const manifestPath = join(dir, OUTPUT_FILES.manifest);
  const manifest = existsSync(manifestPath)
    ? parse<Manifest>('manifest', manifestSchema, readJson(manifestPath))
    : undefined;
  if (!manifest) errors.push('manifest missing or invalid');
  else {
    const files = [
      OUTPUT_FILES.catalog,
      OUTPUT_FILES.retired,
      ...lessonNames.map((n) => `${OUTPUT_FILES.lessonsDir}/${n}`),
      ...bankNames.map((n) => `${OUTPUT_FILES.questionsDir}/${n}`),
    ].sort();
    check(
      stableJson(Object.keys(manifest.outputs).sort()) === stableJson(files),
      'manifest: output file list differs',
    );
    for (const f of files)
      if (existsSync(join(dir, f)))
        check(
          manifest.outputs[f] === sha256(readFileSync(join(dir, f))),
          `manifest: ${f} changed after import`,
        );
    check(manifest.counts.charts === chartIds.length, 'manifest: chart count');
    check(manifest.counts.sections === sections, 'manifest: section count');
    check(
      stableJson(manifest.counts.blocks) === stableJson(blocks),
      'manifest: block counts differ from the output',
    );
  }

  /* ---- math goldens */
  try {
    errors.push(...goldens(lessons));
  } catch (e) {
    errors.push((e as Error).message);
  }
  return errors;
}

function goldens(lessons: Map<string, LessonFile>): string[] {
  const out: string[] = [];
  const eq = (a: unknown, b: unknown, what: string) => {
    if (stableJson(a) !== stableJson(b))
      out.push(`golden ${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  };
  const w6 = c4l6Worked();
  eq(
    [w6.k, w6.e, (w6.r[w6.k] as number).toFixed(2), (w6.r[w6.e] as number).toFixed(2)],
    [119, 120, '42.42', '50.16'],
    'C4L6-g5',
  );
  const g5 = chartOf(lessons, 'c4l6-g5', 'series_panels');
  eq(g5.points?.find((p) => p.label === 'Mua')?.i, 120, 'C4L6-g5 buy mark');
  const w7 = c4l7Worked();
  eq([w7.e, w7.m.toFixed(3)], [124, '0.342'], 'C4L7-g6');
  eq(
    chartOf(lessons, 'c4l7-g6', 'series_panels').points?.find((p) => p.label === 'Mua')?.i,
    124,
    'C4L7-g6 buy mark',
  );
  const w9 = c4l9Worked();
  eq([w9.a, w9.b, w9.k, w9.e, w9.ret.toFixed(4)], [9, 44, 59, 60, '0.6000'], 'C4L9-g4');
  const g94 = chartOf(lessons, 'c4l9-g4', 'series_panels');
  eq([g94.panels[0]?.fib?.lo.i, g94.panels[0]?.fib?.hi.i], [9, 44], 'C4L9-g4 fib');
  eq(chartOf(lessons, 'c5l1-g3', 'category').end_labels?.slice(0, 2), ['+5%', '+36%'], 'C5L1-g3');
  const m2 = chartOf(lessons, 'c5l2-m2', 'series_panels');
  eq(
    [m2.panels[0]?.levels?.find((l) => l.role === 'avg')?.label, m2.points?.[0]?.label],
    ['Trung bình 14,3', 'Hiện tại 12,0'],
    'C5L2-m2',
  );
  const m3 = chartOf(lessons, 'c5l2-m3', 'series_panels');
  eq(
    [m3.panels[0]?.levels?.find((l) => l.role === 'avg')?.label, m3.points?.[0]?.label],
    ['Trung bình 1,8', 'Hiện tại 1,6'],
    'C5L2-m3',
  );
  const big5 = chartOf(lessons, 'c5l3-g2', 'compare');
  eq(
    big5.items.slice(1).map((i) => (i.model.kind === 'category' ? i.model.caption_value : '')),
    ['+12%/năm', '+13%/năm', '+11%/năm', '+12%/năm'],
    'C5L3-g2',
  );
  const rsi = chartOf(lessons, 'c4l6-g0', 'compare');
  eq(
    rsi.items.map((i) => (i.model.kind === 'category' ? i.model.caption_value : '')),
    ['RSI ≈ 81', 'RSI ≈ 50', 'RSI ≈ 19'],
    'C4L6-g0',
  );
  const sc = chartOf(lessons, 'c2l1-g1', 'category');
  eq(
    sc.series.map((s) => Math.round(s.values[s.values.length - 1] ?? 0)),
    [23, 51],
    'c2l1-g1',
  );
  eq(
    chartOf(lessons, 'c1l1-g1', 'category').end_labels,
    ['308 triệu', '179 triệu', '74 triệu'],
    'C1L1-g1',
  );
  const ex = c5l1Example();
  const quoted = [
    fmtVi(ex.total),
    fmtVi(Math.round(ex.avg)),
    `${fmtVi(ex.value / 1e6, 2)} triệu`,
    `+${fmtVi(ex.gain, 1)}%`,
  ];
  eq(quoted, ['1.070', '16.822', '26,75 triệu', '+48,6%'], 'C5L1-g2');
  const prose = stableJson(lessons.get('ch05-l01')?.sections ?? []);
  for (const q of ['1.070', '16.822', '26,75 triệu', '48,6%'])
    if (!prose.includes(q)) out.push(`golden C5L1-g2: "${q}" not in the ch05-l01 prose`);
  return out;
}
