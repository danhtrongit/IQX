import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sha256, stableJson } from '../academy-v4-import/write.js';
import {
  bankFileSchema,
  catalogFileSchema,
  LITERAL_CHAPTER_NO,
  lessonFileSchema,
  retiredLessonsFileSchema,
} from '../../src/modules/academy/content/v5/schema.js';
import type {
  BankFile,
  CatalogFile,
  ChartModel,
  LessonFile,
} from '../../src/modules/academy/content/v5/schema.js';
import {
  buildCatalog,
  CATALOG_ROWS,
  chapterOf,
  INDUSTRIES_SECTION,
  INDUSTRY_PART,
  OLD_INDUSTRIES_SECTION,
} from './catalog-table.js';
import { extract } from './extract.js';
import { manifestSchema } from './manifest.js';
import {
  bankFileName,
  defaultSource,
  lessonFileName,
  OUTPUT_FILES,
  outDir,
  v4Dir,
} from './paths.js';

/** Frozen numbers of spec v5 §1 / §10 (acceptance 1-6, 8, 10). */
export const EXPECTED = {
  chapters: 17,
  required: 203,
  lessonCounts: [10, 10, 9, 10, 4, 4, 7, 17, 16, 15, 14, 11, 19, 15, 13, 15, 14],
  practice: 1,
  exams: 17,
  lessonFiles: 204,
  newLessons: 87,
  retaught: 46,
  figures: 190,
  repCharts: 87,
  ch8Links: 8,
  ch9Sections: 9,
} as const;

/** §2.1 sections every v5 lesson has, in this order. */
export const REQUIRED_SECTIONS = [
  'Biểu đồ đại diện',
  'Đọc chỉ tiêu',
  'Cách sử dụng',
  'Ví dụ cụ thể',
  'Sai lầm thường gặp',
];

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/** Every visible string of a JSON value (keys skipped). */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}

/** The v4 file a kept lesson was built from: undo the order change and the Chương 8/9 patches. */
function unpatch(l: LessonFile, v4Order: number): LessonFile {
  let sections = l.sections;
  if (l.chapter === 8)
    sections = sections.map((s) =>
      s.title === INDUSTRIES_SECTION
        ? {
            ...s,
            title: OLD_INDUSTRIES_SECTION,
            blocks: s.blocks.filter((b) => b.type !== 'lesson_links'),
          }
        : s,
    );
  if (l.chapter === 9) sections = sections.filter((s) => s.title !== INDUSTRIES_SECTION);
  return { ...l, order: v4Order, sections };
}

/** No-source checks over content/v5 (plus a byte-identical re-extract when the mockup is present). */
export function verify(dir: string = outDir(), opts: { reextract?: boolean } = {}): string[] {
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
  ): T | null => {
    const r = schema.safeParse(v);
    if (!r.success) {
      errors.push(`${what}: ${JSON.stringify(r.error?.issues.slice(0, 5))}`);
      return null;
    }
    return r.data as T;
  };

  /* catalog */
  const catalog = parse<CatalogFile>(
    'catalog.json',
    catalogFileSchema,
    readJson(join(dir, OUTPUT_FILES.catalog)),
  );
  if (!catalog) return errors;
  check(
    stableJson(catalog) === stableJson(buildCatalog()),
    'catalog.json differs from catalog-table.ts',
  );
  check(catalog.chapters.length === EXPECTED.chapters, 'chapter count');
  check(
    stableJson(catalog.chapters.map((c) => c.lesson_count)) === stableJson(EXPECTED.lessonCounts),
    `lesson counts ${catalog.chapters.map((c) => c.lesson_count).join(',')}`,
  );
  const items = catalog.chapters.flatMap((c) => c.items);
  check(
    catalog.chapters.reduce((s, c) => s + c.lesson_count, 0) === EXPECTED.required,
    'required total',
  );
  check(items.filter((i) => i.kind === 'practice').length === EXPECTED.practice, 'practice count');
  check(items.filter((i) => i.kind === 'chapter_exam').length === EXPECTED.exams, 'exam count');
  const byId = new Map(items.map((i) => [i.id, i] as const));

  /* every v4 (id, lesson_key, metric_key) is kept (completions, rewards and notes carry over) */
  const v4 = readJson(join(v4Dir(), OUTPUT_FILES.catalog)) as CatalogFile;
  for (const it of v4.chapters.flatMap((c) => c.items)) {
    const now = byId.get(it.id);
    check(
      !!now && now.lesson_key === it.lesson_key && now.kind === it.kind,
      `v4 item ${it.id} (${it.lesson_key}) not kept`,
    );
    check(!now || now.metric_key === it.metric_key, `v4 item ${it.id}: metric_key changed`);
  }
  const v4MetricKeys = new Set(
    v4.chapters
      .flatMap((c) => c.items)
      .map((i) => i.metric_key)
      .filter(Boolean),
  );
  /* re-taught = a lesson added in v5 for a metric that v4 already teaches (spec v5 §2.2) */
  const retaught = CATALOG_ROWS.filter(
    (r) => r.added && r.metric_key && v4MetricKeys.has(r.metric_key),
  );
  check(retaught.length === EXPECTED.retaught, `re-taught lessons ${retaught.length}`);
  for (const i of retaught) check(/^.+ · ở .+$/.test(i.name), `${i.id}: re-taught title`);

  /* lesson files */
  const lessonIds = items.filter((i) => i.kind !== 'chapter_exam').map((i) => i.id);
  const files = new Set(readdirSync(join(dir, OUTPUT_FILES.lessonsDir)));
  check(files.size === EXPECTED.lessonFiles, `lesson files ${files.size}`);
  const lessons = new Map<string, LessonFile>();
  for (const id of lessonIds) {
    const path = join(dir, OUTPUT_FILES.lessonsDir, lessonFileName(id));
    if (!existsSync(path)) {
      errors.push(`lesson file missing: ${id}`);
      continue;
    }
    const l = parse<LessonFile>(`lesson ${id}`, lessonFileSchema, readJson(path));
    if (!l) continue;
    lessons.set(id, l);
    const it = byId.get(id);
    check(
      l.order === it?.order && l.lesson_key === it.lesson_key && l.chapter === chapterOf(id),
      `${id}: order/key/chapter`,
    );
    check(
      !strings({
        t: l.title,
        l: l.lead,
        i: l.intro_blocks,
        s: l.sections,
        m: l.summary,
        c: l.charts,
      }).some((s) => LITERAL_CHAPTER_NO.test(s)),
      `${id}: literal chapter number`,
    );
  }

  /* kept lessons = v4 file (except order and the Chương 8/9 industries section) */
  const v4Order = new Map(v4.chapters.flatMap((c) => c.items.map((i) => [i.id, i.order] as const)));
  let ch8Links = 0;
  let ch9Sections = 0;
  for (const row of CATALOG_ROWS) {
    if (row.added || row.kind === 'chapter_exam') continue;
    const l = lessons.get(row.id);
    if (!l) continue;
    const frozen = readJson(join(v4Dir(), OUTPUT_FILES.lessonsDir, lessonFileName(row.id)));
    check(
      stableJson(unpatch(l, v4Order.get(row.id) ?? 0)) === stableJson(frozen),
      `${row.id}: differs from content/v4 beyond order and the industries section`,
    );
    if (l.chapter === 8) {
      check(
        l.sections.some((s) => s.title === INDUSTRIES_SECTION) &&
          !l.sections.some((s) => s.title === OLD_INDUSTRIES_SECTION),
        `${row.id}: industries section not renamed`,
      );
      if (l.sections.some((s) => s.blocks.some((b) => b.type === 'lesson_links'))) ch8Links += 1;
    }
    if (l.chapter === 9 && l.sections.at(-1)?.title === INDUSTRIES_SECTION) ch9Sections += 1;
  }
  check(ch8Links === EXPECTED.ch8Links, `Chương 8 lessons with "Có bài riêng": ${ch8Links}`);
  check(
    ch9Sections === EXPECTED.ch9Sections,
    `Chương 9 lessons with "${INDUSTRIES_SECTION}": ${ch9Sections}`,
  );

  /* lesson links resolve to a catalog lesson of the link's industry chapter */
  const pairs = new Set(items.filter((i) => i.metric_key).map((i) => `${i.metric_key}|${i.nganh}`));
  for (const l of lessons.values())
    for (const b of l.sections.flatMap((s) => s.blocks))
      if (b.type === 'lesson_links')
        for (const k of b.links)
          check(
            pairs.has(`${k.metric_key}|${k.nganh}`),
            `${l.id}: link ${k.metric_key}/${k.nganh} has no lesson`,
          );

  /* the 87 v5 lessons: §2.1 sections, one representative chart */
  let figures = 0;
  let reps = 0;
  for (const row of CATALOG_ROWS) {
    if (!row.added || row.kind !== 'lesson') continue;
    const l = lessons.get(row.id);
    if (!l) continue;
    const ch = chapterOf(row.id);
    const titles = l.sections.map((s) => s.title);
    const at = REQUIRED_SECTIONS.map((t) => titles.indexOf(t));
    check(
      at.every((k, i) => k >= 0 && (i === 0 || k > (at[i - 1] as number))),
      `${row.id}: §2.1 sections ${titles.join(' / ')}`,
    );
    if (v4MetricKeys.has(row.metric_key ?? ''))
      check(
        titles[0] === 'Nhắc lại công thức',
        `${row.id}: re-taught lesson must start with "Nhắc lại công thức"`,
      );
    const part = INDUSTRY_PART[ch];
    if (part)
      check(titles.at(-1) === part.title, `${row.id}: last section must be "${part.title}"`);
    check(l.summary.length === 4, `${row.id}: summary has ${l.summary.length} items`);
    const repIds = Object.keys(l.charts).filter((id) => id.endsWith('-rep'));
    reps += repIds.length;
    check(
      repIds.length === 1 && l.charts[repIds[0] as string]?.kind === 'fundamental',
      `${row.id}: exactly one representative chart`,
    );
    const repSection = l.sections.find((s) => s.title === 'Biểu đồ đại diện');
    check(
      !!repSection?.blocks.some((b) => b.type === 'chart' && b.chart_id === repIds[0]),
      `${row.id}: representative chart outside its section`,
    );
    figures += Object.values(l.charts).filter((m) => m.kind === 'figure').length;
  }
  check(figures === EXPECTED.figures, `figures ${figures}`);
  check(reps === EXPECTED.repCharts, `representative charts ${reps}`);

  /* §10.8: ROE in nh/ck/bh has 2 lines; gross margin in dk/vl is quarterly with stacked bars */
  const repOf = (
    mk: string,
    ng: string,
  ): Extract<ChartModel, { kind: 'fundamental' }> | undefined => {
    const it = items.find((i) => i.metric_key === mk && i.nganh === ng);
    const l = it ? lessons.get(it.id) : undefined;
    return Object.values(l?.charts ?? {}).find(
      (m): m is Extract<ChartModel, { kind: 'fundamental' }> => m.kind === 'fundamental',
    );
  };
  for (const ng of ['nh', 'ck', 'bh'])
    check(repOf('roe', ng)?.chart.main.length === 2, `ROE ${ng}: 2 lines`);
  for (const ng of ['dk', 'vl']) {
    const c = repOf('gross_margin', ng)?.chart;
    check(
      c?.main[0]?.name === 'Biên gộp quý' && c.sub?.type === 'stacked',
      `gross margin ${ng}: quarterly, stacked`,
    );
  }

  /* banks */
  const quizzable = items.map((i) => i.id);
  for (const id of quizzable) {
    const path = join(dir, OUTPUT_FILES.questionsDir, bankFileName(id));
    if (!existsSync(path)) {
      errors.push(`bank missing: ${id}`);
      continue;
    }
    const b = parse<BankFile>(`bank ${id}`, bankFileSchema, readJson(path));
    if (!b) continue;
    check(
      b.questions.length === byId.get(id)?.question_count,
      `${id}: ${b.questions.length} questions`,
    );
    check(
      !strings(b.questions).some((s) => LITERAL_CHAPTER_NO.test(s)),
      `${id}: literal chapter number in questions`,
    );
    const l = lessons.get(id);
    for (const q of b.questions)
      if (q.chart_id)
        check(!!l && q.chart_id in l.charts, `${q.id}: chart ${q.chart_id} not in the lesson`);
    const row = CATALOG_ROWS.find((r) => r.id === id);
    if (row && !row.added && !(row.kind === 'chapter_exam' && chapterOf(id) >= 10)) {
      const frozen = readFileSync(
        join(v4Dir(), OUTPUT_FILES.questionsDir, bankFileName(id)),
        'utf8',
      );
      check(readFileSync(path, 'utf8') === frozen, `${id}: bank differs from content/v4`);
    }
  }
  check(
    readdirSync(join(dir, OUTPUT_FILES.questionsDir)).length === quizzable.length,
    'stray bank files',
  );

  parse(
    'retired-lessons.json',
    retiredLessonsFileSchema,
    readJson(join(dir, OUTPUT_FILES.retired)),
  );

  /* manifest: output hashes match the files on disk */
  const manifest = parse(
    'import-manifest.json',
    manifestSchema,
    readJson(join(dir, OUTPUT_FILES.manifest)),
  );
  if (manifest) {
    for (const [rel, h] of Object.entries(manifest.outputs)) {
      const p = join(dir, rel);
      check(
        existsSync(p) && sha256(readFileSync(p)) === h,
        `${rel}: sha256 differs from the manifest`,
      );
    }
    check(
      Object.keys(manifest.outputs).length === 2 + lessonIds.length + quizzable.length,
      'manifest output count',
    );
  }

  /* byte-identical rerun */
  const src = defaultSource();
  if (opts.reextract !== false && errors.length === 0 && existsSync(src)) {
    try {
      const { files: fresh } = extract(process.env.ACADEMY_V5_SOURCE ?? src, { write: false });
      for (const [rel, text] of Object.entries(fresh)) {
        const p = join(dir, rel);
        check(
          existsSync(p) && readFileSync(p, 'utf8') === text,
          `${rel}: a rerun of extract is not byte-identical`,
        );
      }
    } catch (e) {
      errors.push(`re-extract failed: ${(e as Error).message}`);
    }
  }
  return errors;
}
