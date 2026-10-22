import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import {
  bankFileSchema,
  catalogFileSchema,
  lessonFileSchema,
  retiredLessonsFileSchema,
} from '../../src/modules/academy/content/v3/schema.js';
import type {
  BankFile,
  LessonFile,
  RetiredLessonsFile,
} from '../../src/modules/academy/content/v3/schema.js';
import { buildBank, ensureSalts } from './banks.js';
import { checkExam, extractLesson } from './blocks.js';
import { buildCatalog, CATALOG_ROWS } from './catalog-table.js';
import { gateSvgIds, TEXT_FIGURES } from './charts/index.js';
import { attr, findAll } from './dom.js';
import { TextNormalizer } from './inline.js';
import { MANIFEST_FORMAT, manifestSchema } from './manifest.js';
import type { Manifest } from './manifest.js';
import { bankFileName, importerDir, lessonFileName, OUTPUT_FILES, outDir } from './paths.js';
import { readSource } from './source.js';
import { pruneJson, sha256, stableJson, writeJson } from './write.js';

export interface ExtractResult {
  manifest: Manifest;
  /** Output text per path relative to content/v3 (manifest included). */
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

/** Old 13-chapter catalog (`chapters[].lessons[]`) -> names of keys that are no longer live. */
function retiredFrom(path: string, liveKeys: ReadonlySet<string>): RetiredLessonsFile {
  const old = JSON.parse(readFileSync(path, 'utf8')) as {
    chapters?: { lessons?: { lesson_key: string; name: string }[] }[];
  };
  const lessons = (old.chapters ?? []).flatMap((c) => c.lessons ?? []);
  if (!lessons.length) throw new Error(`${path}: no chapters[].lessons[]`);
  const seen = new Set<string>();
  const out: RetiredLessonsFile['lessons'] = [];
  for (const l of lessons) {
    if (liveKeys.has(l.lesson_key) || seen.has(l.lesson_key)) continue;
    seen.add(l.lesson_key);
    out.push({ lesson_key: l.lesson_key, name: l.name });
  }
  return { format: 'iqx-academy-retired-v3', lessons: out };
}

function readJsonFile<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;
}

/**
 * Build every output from the source. `write: false` (tests) touches nothing on disk and requires the bank
 * salts to exist already; `write: true` writes content/v3 and adds missing salts to overrides/salts.json.
 */
export function extract(
  sourcePath: string,
  retiredPath: string | undefined,
  opts: { write: boolean },
): ExtractResult {
  const dir = outDir();
  const overridesDir = join(importerDir(), 'overrides');
  const source = readSource(sourcePath);

  const svgErrors = gateSvgIds(
    source.articles.flatMap((a) =>
      findAll(a.el, (e) => e.tagName === 'svg' && attr(e, 'id') !== undefined)
        .map((e) => attr(e, 'id') as string)
        .map((id) => ({ id, chapter: Number(a.row.id.slice(2, 4)) })),
    ),
  );
  if (svgErrors.length) throw new Error(`svg id gate failed:\n  ${svgErrors.join('\n  ')}`);

  const textOverrides = readJsonFile<Record<string, string>>(join(overridesDir, 'text.json'), {});
  const norm = new TextNormalizer(textOverrides);

  /* lessons */
  const catalog = parseOrThrow('catalog', catalogFileSchema, buildCatalog());
  const orderOf = new Map(
    catalog.chapters.flatMap((c) =>
      c.published ? c.items.map((i) => [i.id, i.order] as const) : [],
    ),
  );
  const lessons: LessonFile[] = [];
  const lessonCounts = new Map<string, { sections: number; blocks: number }>();
  const blockTotals: Record<string, number> = {};
  const droppedCharts: Record<string, string> = {};
  for (const art of source.articles) {
    if (art.row.kind === 'chapter_exam') {
      checkExam(norm, art);
      continue;
    }
    const draft = extractLesson(norm, art);
    Object.assign(droppedCharts, draft.dropped);
    const file = {
      format: 'iqx-academy-lesson-v3' as const,
      lesson_key: art.row.lesson_key,
      kind: art.row.kind as 'lesson' | 'practice',
      order: orderOf.get(art.row.id) ?? 0,
      ...draft.lesson,
    };
    lessons.push(file);
    const nBlocks = Object.values(draft.counts.blocks).reduce((s, n) => s + n, 0);
    lessonCounts.set(art.row.id, { sections: draft.counts.sections, blocks: nBlocks });
    for (const [t, n] of Object.entries(draft.counts.blocks))
      blockTotals[t] = (blockTotals[t] ?? 0) + n;
  }

  /* banks */
  const saltsPath = join(overridesDir, 'salts.json');
  const salts = readJsonFile<Record<string, string>>(saltsPath, {});
  if (
    ensureSalts(
      salts,
      CATALOG_ROWS.map((r) => r.id),
    )
  ) {
    if (!opts.write) throw new Error('bank salts missing from overrides/salts.json');
    writeFileSync(saltsPath, stableJson(salts));
  }
  const banks: BankFile[] = CATALOG_ROWS.map((row, g) =>
    buildBank(norm, row, source.items[g] as (typeof source.items)[number], salts[row.id] as string),
  );

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

  /* retired keys */
  const retiredFile = join(dir, OUTPUT_FILES.retired);
  const liveKeys = new Set(CATALOG_ROWS.map((r) => r.lesson_key));
  let retired: RetiredLessonsFile;
  if (retiredPath) retired = retiredFrom(retiredPath, liveKeys);
  else if (existsSync(retiredFile)) {
    /* Giữ key cũ còn dùng để hiển thị nhãn; key đã trở lại là bài của danh mục thì bỏ. */
    const stored = JSON.parse(readFileSync(retiredFile, 'utf8')) as RetiredLessonsFile;
    retired = {
      format: stored.format,
      lessons: stored.lessons.filter((l) => !liveKeys.has(l.lesson_key)),
    };
  } else
    throw new Error(
      `${retiredFile} does not exist yet: pass --retired-from <catalog-13ch.v1.json>`,
    );
  parseOrThrow('retired lessons', retiredLessonsFileSchema, retired);

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

  const chartKinds: Record<string, number> = {};
  for (const l of lessons)
    for (const m of Object.values(l.charts)) chartKinds[m.kind] = (chartKinds[m.kind] ?? 0) + 1;
  const sortedOutputs: Record<string, string> = {};
  for (const k of Object.keys(outputs).sort()) sortedOutputs[k] = outputs[k] as string;
  const manifest: Manifest = {
    format: MANIFEST_FORMAT,
    source: { file: basename(sourcePath), sha256: source.sha256, bytes: source.bytes },
    gates: {
      source_sha256: true,
      svg_ids: true,
      schema: true,
      dashes_resolved: true,
      overrides_used: true,
    },
    counts: {
      lessons: lessons.length,
      banks: banks.length,
      questions: banks.reduce((s, b) => s + b.questions.length, 0),
      sections: lessons.reduce((s, l) => s + l.sections.length, 0),
      intro_blocks: lessons.reduce((s, l) => s + l.intro_blocks.length, 0),
      summaries: lessons.filter((l) => l.summary.length).length,
      charts: lessons.reduce((s, l) => s + Object.keys(l.charts).length, 0),
      text_figures: Object.keys(TEXT_FIGURES).length,
      svg_ids: source.svgIds.length,
      chart_kinds: chartKinds,
      blocks: blockTotals,
    },
    lessons: Object.fromEntries(
      lessons.map((l) => [
        l.id,
        {
          ...(lessonCounts.get(l.id) as { sections: number; blocks: number }),
          charts: Object.keys(l.charts).length,
          questions: banks.find((b) => b.item_id === l.id)?.questions.length ?? 0,
        },
      ]),
    ),
    banks: Object.fromEntries(banks.map((b) => [b.item_id, { questions: b.questions.length }])),
    outputs: sortedOutputs,
    warnings: [
      ...new Set([
        ...norm.warnings,
        ...Object.entries(droppedCharts).map(([id, reason]) => `chart ${id} bị bỏ khỏi nội dung: ${reason}`),
      ]),
    ],
  };
  parseOrThrow('manifest', manifestSchema, manifest);
  files[OUTPUT_FILES.manifest] = opts.write
    ? writeJson(join(dir, OUTPUT_FILES.manifest), manifest)
    : stableJson(manifest);
  return { manifest, files };
}
