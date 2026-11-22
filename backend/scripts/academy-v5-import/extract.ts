import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { buildBank, ensureSalts } from '../academy-v4-import/banks.js';
import { checkExam, extractLesson as extractV4Lesson } from '../academy-v4-import/blocks.js';
import { children, hasClass } from '../academy-v4-import/dom.js';
import type { Element, Node } from '../academy-v4-import/dom.js';
import { TextNormalizer } from '../academy-v4-import/inline.js';
import { importerDir as v4ImporterDir } from '../academy-v4-import/paths.js';
import { pruneJson, sha256, stableJson, writeJson } from '../academy-v4-import/write.js';
import {
  bankFileSchema,
  catalogFileSchema,
  lessonFileSchema,
  retiredLessonsFileSchema,
} from '../../src/modules/academy/content/v5/schema.js';
import type {
  BankFile,
  Block,
  CatalogFile,
  LessonFile,
  RetiredLessonsFile,
} from '../../src/modules/academy/content/v5/schema.js';
import {
  buildCatalog,
  CATALOG_ROWS,
  CHAPTER_TITLES,
  chapterOf,
  INDUSTRIES_SECTION,
  OLD_INDUSTRIES_SECTION,
} from './catalog-table.js';
import { extractIndustriesSection, extractNewLesson } from './lesson.js';
import { MANIFEST_FORMAT, manifestSchema } from './manifest.js';
import type { Manifest } from './manifest.js';
import { bankFileName, importerDir, lessonFileName, OUTPUT_FILES, outDir, v4Dir } from './paths.js';
import { readSource } from './source.js';
import type { SourceArticle } from './source.js';

export interface ExtractResult {
  manifest: Manifest;
  /** Output text per path relative to content/v5 (manifest included). */
  files: Record<string, string>;
}

function parseOrThrow<T>(
  what: string,
  schema: {
    safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: unknown[] } };
  },
  v: unknown,
): T {
  const r = schema.safeParse(v);
  if (!r.success)
    throw new Error(
      `${what} does not parse:\n${JSON.stringify(r.error?.issues.slice(0, 8), null, 2)}`,
    );
  return r.data as T;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const readJsonOr = <T>(path: string, fallback: T): T =>
  existsSync(path) ? readJson<T>(path) : fallback;

const sectionTitle = (norm: TextNormalizer, blk: Element): string | null => {
  if (!(hasClass(blk, 'sec') && hasClass(blk, 'blk'))) return null;
  const h2 = children(blk).find((k) => k.tagName === 'h2');
  return h2 ? norm.plain(h2) : null;
};

/**
 * D11: re-extract a kept lesson from the v5 mockup with the v4 extractor (v4 text overrides) and compare it with the
 * frozen v4 file. The v4 file stays the content; a difference is only reported as a manifest warning. The Chương 8/9
 * "Ở các ngành" section is left out (it is patched in from the mockup on purpose).
 */
function driftOf(v4Norm: TextNormalizer, art: SourceArticle, frozen: LessonFile): string | null {
  const el: Element = {
    ...art.el,
    childNodes: (art.el.childNodes as Node[]).filter(
      (n) => !('tagName' in n && sectionTitle(v4Norm, n as Element) === INDUSTRIES_SECTION),
    ),
  } as Element;
  let fresh: ReturnType<typeof extractV4Lesson>['lesson'];
  try {
    fresh = extractV4Lesson(v4Norm, { index: art.index, row: art.row, el }).lesson;
  } catch (e) {
    return `${art.row.id}: the v4 extractor fails on the v5 article (${(e as Error).message.split('\n')[0]})`;
  }
  const parts = (
    l: Pick<LessonFile, 'title' | 'lead' | 'intro_blocks' | 'sections' | 'summary' | 'charts'>,
  ) => ({
    title: l.title,
    lead: l.lead,
    intro_blocks: l.intro_blocks,
    sections: l.sections.filter((s) => s.title !== OLD_INDUSTRIES_SECTION),
    summary: l.summary,
    charts: l.charts,
  });
  const diff = Object.entries(parts(frozen)).flatMap(([k, v]) =>
    stableJson(v) === stableJson((parts(fresh as LessonFile) as Record<string, unknown>)[k])
      ? []
      : [k],
  );
  return diff.length
    ? `${art.row.id}: v5 mockup text differs from the live v4 file in ${diff.join(', ')} (v4 file kept)`
    : null;
}

/** Chương 8: rename the industries section and append the "Có bài riêng" links (spec v5 §1.3). */
function patchChapter8(lesson: LessonFile, v5Blocks: Block[], warnings: string[]): LessonFile {
  const idx = lesson.sections.findIndex((s) => s.title === OLD_INDUSTRIES_SECTION);
  if (idx < 0) throw new Error(`${lesson.id}: no "${OLD_INDUSTRIES_SECTION}" section to rename`);
  const old = lesson.sections[idx] as LessonFile['sections'][number];
  const links = v5Blocks.filter((b) => b.type === 'lesson_links');
  const rest = v5Blocks.filter((b) => b.type !== 'lesson_links');
  if (stableJson(rest) !== stableJson(old.blocks))
    warnings.push(
      `${lesson.id}: "${INDUSTRIES_SECTION}" cards differ from the live v4 cards (v4 cards kept)`,
    );
  if (links.length > 1) throw new Error(`${lesson.id}: ${links.length} link paragraphs`);
  const sections = [...lesson.sections];
  sections[idx] = { ...old, title: INDUSTRIES_SECTION, blocks: [...old.blocks, ...links] };
  return { ...lesson, sections };
}

/** Chương 9: add the "Ở các ngành" section as the last section, right before Tóm tắt (spec v5 §1.4). */
function patchChapter9(lesson: LessonFile, v5Blocks: Block[]): LessonFile {
  if (lesson.sections.some((s) => s.title === INDUSTRIES_SECTION))
    throw new Error(`${lesson.id}: section exists`);
  if (!v5Blocks.some((b) => b.type === 'lesson_links'))
    throw new Error(`${lesson.id}: industries section without links`);
  return {
    ...lesson,
    sections: [
      ...lesson.sections,
      { id: `s${lesson.sections.length + 1}`, title: INDUSTRIES_SECTION, blocks: v5Blocks },
    ],
  };
}

type Origin = 'v4' | 'v4+patch' | 'v5';

/**
 * Build every content/v5 output from the frozen content/v4 files and the v5 mockup. `write: false` (tests) touches
 * nothing on disk and requires every bank salt to exist already; `write: true` writes content/v5 and adds missing salts
 * to overrides/salts.json.
 */
export function extract(sourcePath: string, opts: { write: boolean }): ExtractResult {
  const dir = outDir();
  const base = v4Dir();
  const overridesDir = join(importerDir(), 'overrides');
  const source = readSource(sourcePath);
  const warnings: string[] = [];

  /* chapter titles: catalog table == mockup `const CH` */
  for (let no = 1; no <= 17; no += 1)
    if (source.chapters[String(no)] !== CHAPTER_TITLES[no])
      throw new Error(
        `chapter ${no}: mockup title "${source.chapters[String(no)]}" != "${CHAPTER_TITLES[no]}"`,
      );

  const norm = new TextNormalizer(
    readJsonOr<Record<string, string>>(join(overridesDir, 'text.json'), {}),
  );
  const v4Norm = new TextNormalizer(
    readJsonOr<Record<string, string>>(join(v4ImporterDir(), 'overrides', 'text.json'), {}),
  );

  const catalog: CatalogFile = parseOrThrow('catalog', catalogFileSchema, buildCatalog());
  const orderOf = new Map(
    catalog.chapters.flatMap((c) => c.items.map((i) => [i.id, i.order] as const)),
  );
  const v4CatalogText = readFileSync(join(base, OUTPUT_FILES.catalog), 'utf8');

  /* lessons */
  const figs = new Map(source.figs.map((f) => [f.svgId, f] as const));
  if (figs.size !== source.figs.length) throw new Error('duplicate FIG.draw ids');
  const used = { figs: new Set<string>(), reps: new Set<string>() };
  const lessons: LessonFile[] = [];
  const origin = new Map<string, Origin>();
  const blockTotals: Record<string, number> = {};
  for (const art of source.articles) {
    const { row } = art;
    const ch = chapterOf(row.id);
    if (row.kind === 'chapter_exam') {
      checkExam(norm, art);
      continue;
    }
    const order = orderOf.get(row.id) ?? 0;
    if (row.added) {
      const draft = extractNewLesson(norm, art, figs, source.repd, used);
      for (const [t, n] of Object.entries(draft.blocks)) blockTotals[t] = (blockTotals[t] ?? 0) + n;
      lessons.push({
        format: 'iqx-academy-lesson-v3',
        lesson_key: row.lesson_key,
        kind: 'lesson',
        order,
        ...draft.lesson,
      });
      origin.set(row.id, 'v5');
      continue;
    }
    let lesson = readJson<LessonFile>(join(base, OUTPUT_FILES.lessonsDir, lessonFileName(row.id)));
    if (lesson.lesson_key !== row.lesson_key || lesson.id !== row.id)
      throw new Error(`${row.id}: v4 file key/id differs`);
    const drift = driftOf(v4Norm, art, lesson);
    if (drift) warnings.push(drift);
    lesson = { ...lesson, order };
    let o: Origin = 'v4';
    if (ch === 8 || ch === 9) {
      const blocks = extractIndustriesSection(norm, art, INDUSTRIES_SECTION);
      if (ch === 8) {
        if (!blocks)
          throw new Error(`${row.id}: v5 article has no "${INDUSTRIES_SECTION}" section`);
        lesson = patchChapter8(lesson, blocks, warnings);
        o = 'v4+patch';
      } else if (blocks) {
        lesson = patchChapter9(lesson, blocks);
        o = 'v4+patch';
      }
    }
    lessons.push(lesson);
    origin.set(row.id, o);
  }
  const unusedFigs = [...figs.keys()].filter((id) => !used.figs.has(id));
  if (unusedFigs.length)
    throw new Error(`FIG.draw ids not used by any article: ${unusedFigs.join(', ')}`);
  const unusedReps = Object.keys(source.repd).filter((k) => !used.reps.has(k));
  if (unusedReps.length)
    throw new Error(`REPD entries not used by any article: ${unusedReps.join(', ')}`);

  /* banks: v4 banks copied for every v4 lesson and the Chương 1-9 exams; rebuilt from IT for the rest */
  const saltsPath = join(overridesDir, 'salts.json');
  const salts = readJsonOr<Record<string, string>>(saltsPath, {});
  const rebuild = CATALOG_ROWS.filter(
    (r) => r.added || (r.kind === 'chapter_exam' && chapterOf(r.id) >= 10),
  );
  const seeded = (() => {
    const v4Salts = readJson<Record<string, string>>(
      join(v4ImporterDir(), 'overrides', 'salts.json'),
    );
    let added = false;
    for (const r of rebuild) {
      const s = v4Salts[r.id];
      if (!salts[r.id] && s) {
        salts[r.id] = s; // ch10-12 exams keep their v4 salt: unchanged questions keep their option ids
        added = true;
      }
    }
    return added;
  })();
  const generated = ensureSalts(
    salts,
    rebuild.map((r) => r.id),
  );
  if (seeded || generated) {
    if (!opts.write) throw new Error('bank salts missing from overrides/salts.json');
    writeFileSync(saltsPath, stableJson(salts));
  }
  const bankOrigin = new Map<string, 'v4' | 'v5'>();
  const banks: BankFile[] = CATALOG_ROWS.map((row, g) => {
    if (rebuild.includes(row)) {
      bankOrigin.set(row.id, 'v5');
      return buildBank(
        norm,
        row,
        source.items[g] as (typeof source.items)[number],
        salts[row.id] as string,
      );
    }
    bankOrigin.set(row.id, 'v4');
    return readJson<BankFile>(join(base, OUTPUT_FILES.questionsDir, bankFileName(row.id)));
  });

  /* text gates */
  if (norm.missing.length)
    throw new Error(
      `en/em dashes need an entry in overrides/text.json:\n  ${[...new Set(norm.missing)].join('\n  ')}`,
    );
  const unused = norm.unusedOverrides();
  if (unused.length)
    throw new Error(`unused overrides in overrides/text.json:\n  ${unused.join('\n  ')}`);

  /* schema gate before anything is written */
  for (const l of lessons) parseOrThrow(`lesson ${l.id}`, lessonFileSchema, l);
  for (const b of banks) parseOrThrow(`bank ${b.item_id}`, bankFileSchema, b);
  const liveKeys = new Set(CATALOG_ROWS.map((r) => r.lesson_key));
  const storedRetired = readJson<RetiredLessonsFile>(join(base, OUTPUT_FILES.retired));
  const retired = parseOrThrow<RetiredLessonsFile>('retired lessons', retiredLessonsFileSchema, {
    format: storedRetired.format,
    lessons: storedRetired.lessons.filter((l) => !liveKeys.has(l.lesson_key)),
  });

  /* write */
  const outputs: Record<string, string> = {};
  const files: Record<string, string> = {};
  const put = (rel: string, value: unknown) => {
    const text = opts.write ? writeJson(join(dir, rel), value) : stableJson(value);
    files[rel] = text;
    outputs[rel] = sha256(text);
  };
  put(OUTPUT_FILES.catalog, catalog);
  put(OUTPUT_FILES.retired, retired);
  for (const l of lessons) put(`${OUTPUT_FILES.lessonsDir}/${lessonFileName(l.id)}`, l);
  for (const b of banks) put(`${OUTPUT_FILES.questionsDir}/${bankFileName(b.item_id)}`, b);
  if (opts.write) {
    pruneJson(
      join(dir, OUTPUT_FILES.lessonsDir),
      new Set(lessons.map((l) => lessonFileName(l.id))),
    );
    pruneJson(
      join(dir, OUTPUT_FILES.questionsDir),
      new Set(banks.map((b) => bankFileName(b.item_id))),
    );
  }

  const figureKinds: Record<string, number> = {};
  let figures = 0;
  let reps = 0;
  for (const l of lessons)
    for (const m of Object.values(l.charts)) {
      if (m.kind === 'figure') {
        figures += 1;
        figureKinds[m.fig] = (figureKinds[m.fig] ?? 0) + 1;
      }
    }
  for (const l of lessons)
    if (origin.get(l.id) === 'v5')
      reps += Object.keys(l.charts).filter((id) => id.endsWith('-rep')).length;
  const origins: Record<string, number> = {};
  for (const o of origin.values()) origins[o] = (origins[o] ?? 0) + 1;
  const sortedOutputs: Record<string, string> = {};
  for (const k of Object.keys(outputs).sort()) sortedOutputs[k] = outputs[k] as string;
  const manifest: Manifest = {
    format: MANIFEST_FORMAT,
    source: { file: basename(sourcePath), sha256: source.sha256, bytes: source.bytes },
    base: { dir: 'content/v4', catalog_sha256: sha256(v4CatalogText) },
    gates: {
      source_sha256: true,
      catalog_titles: true,
      fig_ids: true,
      rep_ids: true,
      schema: true,
      dashes_resolved: true,
      overrides_used: true,
    },
    counts: {
      chapters: catalog.chapters.length,
      required_lessons: catalog.chapters.reduce((s, c) => s + c.lesson_count, 0),
      lesson_files: lessons.length,
      exams: catalog.chapters.length,
      banks: banks.length,
      questions: banks.reduce((s, b) => s + b.questions.length, 0),
      origins,
      figures,
      rep_charts: reps,
      figure_kinds: figureKinds,
      blocks: blockTotals,
    },
    lessons: Object.fromEntries(
      lessons.map((l) => [
        l.id,
        {
          origin: origin.get(l.id) as Origin,
          order: l.order,
          sections: l.sections.length,
          charts: Object.keys(l.charts).length,
          questions: banks.find((b) => b.item_id === l.id)?.questions.length ?? 0,
        },
      ]),
    ),
    banks: Object.fromEntries(
      banks.map((b) => [
        b.item_id,
        { origin: bankOrigin.get(b.item_id) as 'v4' | 'v5', questions: b.questions.length },
      ]),
    ),
    outputs: sortedOutputs,
    warnings: [...new Set([...warnings, ...norm.warnings])],
  };
  parseOrThrow('manifest', manifestSchema, manifest);
  files[OUTPUT_FILES.manifest] = opts.write
    ? writeJson(join(dir, OUTPUT_FILES.manifest), manifest)
    : stableJson(manifest);
  return { manifest, files };
}
