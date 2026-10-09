import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assetsManifestSchema,
  chartsFileSchema,
  importManifestSchema,
  packageLessonsFileSchema,
  privateQuestionsFileSchema,
  toPublicQuestion,
} from '../../src/modules/academy/content/packages/package.schema.js';
import type {
  AssetEntry,
  Block,
  ChartModel,
  ImportManifest,
  PackageLesson,
  PrivateQuestion,
} from '../../src/modules/academy/content/packages/package.schema.js';
import { countBlocks } from './blocks.js';
import type { BlockCounts } from './blocks.js';
import { canonicalPlainHash, opaqueOptionId, sha256Hex, stableStringify } from './canonical.js';
import {
  C1_CHART_WINDOWS,
  C3_LESSON_CHART_IDS,
  C3_METRIC_ALIASES,
  CHAPTERS,
  CHAPTER_GATES,
  INDICATOR_IDS,
} from './gates.js';
import type { ChapterGate, ChapterNo } from './gates.js';
import {
  ANSWER_KEYS,
  FORBIDDEN_KEYS,
  INLINE_TAGS,
  sanitizeHtml,
  scanForbidden,
} from './sanitize-allow.js';
import { chapterDirName, defaultLocations } from './paths.js';
import type { Locations } from './paths.js';
import { readWebpInfo } from './webp.js';

/**
 * Recomputes every checkable property of the committed chapter 1-4 packages from the committed
 * outputs, the import manifests and the spec constants in `gates.ts`. The source HTML is not
 * needed: the manifest hashes were gated against the supplied files at extraction time and are
 * compared here with the values the specs publish.
 *
 *   node dist/scripts/academy-import/verify.js
 */

export interface ChapterStats {
  chapter: ChapterNo;
  files: Record<string, number>;
  counts: Record<string, number>;
}

export interface VerifyReport {
  ok: boolean;
  errors: string[];
  chapters: ChapterStats[];
}

class Collector {
  readonly errors: string[] = [];
  constructor(private readonly prefix: string) {}
  check(condition: unknown, message: string): void {
    if (!condition) this.errors.push(`${this.prefix}: ${message}`);
  }
  fail(message: string): void {
    this.errors.push(`${this.prefix}: ${message}`);
  }
  eq<T>(actual: T, expected: T, what: string): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      this.fail(`${what} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

function readJson(path: string, c: Collector): { text: string; value: unknown } | null {
  if (!existsSync(path)) {
    c.fail(`missing file ${path}`);
    return null;
  }
  const text = readFileSync(path, 'utf8');
  try {
    return { text, value: JSON.parse(text) as unknown };
  } catch (error) {
    c.fail(`${path}: invalid JSON (${(error as Error).message})`);
    return null;
  }
}

function walkBlocks(blocks: readonly Block[], visit: (b: Block) => void): void {
  for (const b of blocks) {
    visit(b);
    if (b.type === 'callout' || b.type === 'details') walkBlocks(b.blocks, visit);
  }
}

function verifyChapter(
  chapter: ChapterNo,
  locations: Locations,
  fundamentalIds: ReadonlySet<string>,
): { errors: string[]; stats: ChapterStats } {
  const gate = CHAPTER_GATES[chapter];
  const c = new Collector(`C${chapter}`);
  const dir = join(locations.packagesDir, chapterDirName(chapter));
  const stats: ChapterStats = { chapter, files: {}, counts: {} };

  /* ---- manifest vs spec constants ---- */
  const manifestFile = readJson(join(dir, 'import-manifest.json'), c);
  if (!manifestFile) return { errors: c.errors, stats };
  const parsedManifest = importManifestSchema.safeParse(manifestFile.value);
  if (!parsedManifest.success) {
    c.fail(`import-manifest.json: ${parsedManifest.error.message.slice(0, 300)}`);
    return { errors: c.errors, stats };
  }
  const manifest: ImportManifest = parsedManifest.data;
  c.check(
    manifestFile.text === stableStringify(manifest),
    'import-manifest.json is not in canonical form',
  );
  c.eq(manifest.chapter, chapter, 'manifest chapter');
  c.eq(manifest.package, gate.package, 'manifest package');
  c.eq(
    manifest.package_version,
    gate.payload_version.replace(/-preview$/, ''),
    'manifest package_version',
  );
  c.eq(manifest.content_version, gate.content_version, 'manifest content_version');
  c.check(
    gate.html_files.includes(manifest.source.html_file),
    'manifest html_file is not an accepted source name',
  );
  c.eq(manifest.source.html_bytes, gate.html_bytes, 'source html bytes');
  c.eq(manifest.source.html_sha256, gate.html_sha256, 'source html sha256');
  c.eq(manifest.source.payload_script_id, gate.script_id, 'payload script id');
  c.eq(manifest.source.payload_text_sha256, gate.payload_text_sha256, 'payload text sha256');
  c.eq(manifest.source.payload_text_in_spec, gate.payload_text_in_spec, 'payload_text_in_spec');
  c.eq(manifest.source.objects, gate.object_hashes, 'spec object hashes');
  for (const lg of gate.lessons) {
    const have = manifest.source.lessons[lg.id];
    c.check(have !== undefined, `manifest lacks the object hash of ${lg.id}`);
    if (lg.object_sha256 !== null) c.eq(have, lg.object_sha256, `lesson object hash ${lg.id}`);
  }
  c.eq(Object.keys(manifest.source.lessons).length, gate.lessons.length, 'lesson hash count');
  c.eq(
    manifest.text_equivalence.matched,
    manifest.text_equivalence.sections_checked,
    'text equivalence',
  );
  c.eq(manifest.text_equivalence.sections_checked, 24, 'sections checked for text equivalence');

  /* ---- output hashes + canonical form ---- */
  const expectedFiles = ['lessons.vi.json'];
  if (gate.totals.questions > 0) expectedFiles.push('questions.vi.private.json');
  if (gate.chapter === 1 || gate.chapter === 3) expectedFiles.push('charts.vi.json');
  if (gate.totals.images > 0) expectedFiles.push('assets.manifest.json');
  c.eq(Object.keys(manifest.outputs).sort(), [...expectedFiles].sort(), 'manifest output list');
  const parsed: Record<string, unknown> = {};
  for (const name of expectedFiles) {
    const f = readJson(join(dir, name), c);
    if (!f) continue;
    parsed[name] = f.value;
    const out = manifest.outputs[name];
    const bytes = Buffer.from(f.text, 'utf8');
    stats.files[name] = bytes.length;
    c.eq(out ? sha256Hex(bytes) : null, out?.sha256 ?? null, `${name} sha256`);
    c.eq(out ? bytes.length : null, out?.bytes ?? null, `${name} size`);
    c.check(f.text === stableStringify(f.value), `${name} is not in canonical form (hand edited?)`);
  }
  stats.files['import-manifest.json'] = Buffer.byteLength(manifestFile.text);

  /* ---- lessons ---- */
  const lessonsParsed = packageLessonsFileSchema.safeParse(parsed['lessons.vi.json']);
  if (!lessonsParsed.success) {
    c.fail(`lessons.vi.json: ${lessonsParsed.error.message.slice(0, 400)}`);
    return { errors: c.errors, stats };
  }
  const lessons: PackageLesson[] = lessonsParsed.data;
  c.eq(lessons.length, 6, 'lesson count');
  c.eq(
    lessons.reduce((n, l) => n + l.sections.length, 0),
    24,
    'section count',
  );
  c.eq(new Set(lessons.map((l) => l.id)).size, lessons.length, 'unique lesson ids');
  c.eq(new Set(lessons.map((l) => l.lesson_key)).size, lessons.length, 'unique lesson keys');

  const charts = (parsed['charts.vi.json'] ?? {}) as Record<string, ChartModel>;
  const assets = (parsed['assets.manifest.json'] ?? {}) as Record<string, AssetEntry>;
  let chartIssues = 0;
  if (parsed['charts.vi.json'] !== undefined && !chartsFileSchema.safeParse(charts).success)
    chartIssues += 1;
  c.check(chartIssues === 0, 'charts.vi.json fails its schema');
  // Sub-trees copied verbatim from the source (chapter 3 chart definitions) still hash the same.
  c.eq(Object.keys(manifest.source.copied), chapter === 3 ? ['charts'] : [], 'copied sub-trees');
  if (chapter === 3)
    c.eq(manifest.source.copied.charts, canonicalPlainHash(charts), 'copied chart definitions');
  if (parsed['assets.manifest.json'] !== undefined)
    c.check(
      assetsManifestSchema.safeParse(assets).success,
      'assets.manifest.json fails its schema',
    );

  const totals: BlockCounts = {
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
  const chartRefs: string[] = [];
  const imageRefs: string[] = [];
  lessons.forEach((l, index) => {
    const lg = gate.lessons[index];
    if (!lg) return;
    c.eq(l.id, lg.id, `lesson #${index + 1} id`);
    c.eq(l.order, index + 1, `${l.id} order`);
    c.eq(l.chapter, chapter, `${l.id} chapter`);
    c.eq(l.lesson_key, lg.lesson_key, `${l.id} lesson_key`);
    c.eq(l.kind, lg.kind, `${l.id} kind`);
    c.eq(l.name, lg.name, `${l.id} name`);
    c.eq(l.config_id, lg.config_id, `${l.id} config_id`);
    c.eq(l.completion, gate.completion, `${l.id} completion`);
    c.eq(l.content_version, gate.content_version, `${l.id} content_version`);
    c.check(l.content_version.length <= 32, `${l.id} content_version exceeds varchar(32)`);
    c.eq(l.source.package, gate.package, `${l.id} source.package`);
    c.eq(l.source.package_version, manifest.package_version, `${l.id} source.package_version`);
    c.eq(l.source.payload_sha256, gate.payload_text_sha256, `${l.id} source.payload_sha256`);
    c.eq(l.source.object_sha256, manifest.source.lessons[l.id], `${l.id} source.object_sha256`);
    if (chapter === 2 || chapter === 4) c.eq(l.nav_labels, gate.nav_labels, `${l.id} nav labels`);
    if (chapter === 3) c.eq(l.nav_labels, gate.nav_labels, `${l.id} nav labels`);
    // Stable keys.
    if (lg.kind === 'technical') {
      const id = l.lesson_key.slice('technical:'.length);
      c.check(
        (INDICATOR_IDS as readonly string[]).includes(id),
        `${l.id}: ${id} is not one of the 16 indicators`,
      );
      c.eq(l.config_id, id, `${l.id} config_id`);
    }
    if (lg.kind === 'fundamental') {
      const id = l.lesson_key.slice('fundamental:'.length);
      c.check(fundamentalIds.has(id), `${l.id}: ${id} is not in the fundamental registry`);
      c.check(
        Object.values(C3_METRIC_ALIASES).includes(id),
        `${l.id}: ${id} is not a chapter 3 metric`,
      );
    }
    if (lg.kind === 'guide') c.eq(l.lesson_key, `guide:${l.id}`, `${l.id} guide key`);
    if (lg.kind === 'concept') c.eq(l.lesson_key, 'concept:hop_luu', `${l.id} concept key`);

    const lessonBlocks = l.sections.flatMap((s) => s.blocks);
    const counts = countBlocks(lessonBlocks);
    const per = manifest.per_lesson[l.id];
    const questionCount = (
      (parsed['questions.vi.private.json'] as PrivateQuestion[] | undefined) ?? []
    ).filter((q) => q.lesson_id === l.id).length;
    c.eq(counts.chart, lg.counts.charts, `${l.id} chart blocks`);
    c.eq(counts.image, lg.counts.images, `${l.id} image blocks`);
    c.eq(counts.table - counts.computed_table, lg.counts.tables, `${l.id} static tables`);
    c.eq(questionCount, lg.counts.questions, `${l.id} questions`);
    c.eq(
      per,
      {
        charts: counts.chart,
        images: counts.image,
        tables: counts.table - counts.computed_table,
        computed_tables: counts.computed_table,
        questions: questionCount,
      },
      `${l.id} manifest per_lesson`,
    );
    countBlocks(lessonBlocks, totals);

    walkBlocks(lessonBlocks, (b) => {
      if (b.type === 'html') {
        let clean: string | null = null;
        try {
          clean = sanitizeHtml(b.html, { strict: true });
        } catch (error) {
          c.fail(
            `${l.id}: html block is not allowlisted (${(error as Error).message.slice(0, 200)})`,
          );
        }
        if (clean !== null)
          c.check(clean === b.html, `${l.id}: html block changes when sanitised again`);
      } else if (b.type === 'table') {
        for (const cell of [...b.head, ...b.rows.flat()]) {
          try {
            c.check(
              sanitizeHtml(cell, { strict: true, tags: INLINE_TAGS }) === cell,
              `${l.id}: table cell changes when sanitised again: ${cell.slice(0, 60)}`,
            );
          } catch (error) {
            c.fail(
              `${l.id}: table cell is not allowlisted (${(error as Error).message.slice(0, 120)})`,
            );
          }
        }
        if (b.source?.hook === 'application' && b.source.chart_id)
          c.check(
            b.source.chart_id in charts,
            `${l.id}: application table references unknown chart ${b.source.chart_id}`,
          );
      } else if (b.type === 'chart') {
        chartRefs.push(b.chart_id);
        c.check(
          b.chart_id in charts,
          `${l.id}: chart block references unknown chart ${b.chart_id}`,
        );
        c.check(
          b.table_toggle === true,
          `${l.id}: lesson chart ${b.chart_id} lacks the data-table toggle`,
        );
      } else if (b.type === 'image') {
        imageRefs.push(b.asset_id);
        const asset = assets[b.asset_id];
        if (!asset) return c.fail(`${l.id}: image ${b.asset_id} is not in assets.manifest.json`);
        c.eq(b.src, `/${asset.file}`, `${l.id}/${b.asset_id} src`);
        c.eq([b.width, b.height], [asset.width, asset.height], `${l.id}/${b.asset_id} dimensions`);
        c.eq(b.zoom_title, asset.alt, `${l.id}/${b.asset_id} zoom_title`);
      }
    });
  });
  stats.counts = {
    lessons: lessons.length,
    sections: 24,
    html_blocks: totals.html,
    tables: totals.table - totals.computed_table,
    computed_tables: totals.computed_table,
    chart_blocks: totals.chart,
    image_blocks: totals.image,
    steps_blocks: totals.steps,
    step_items: totals.step_items,
    callouts: totals.callout,
    details: totals.details,
  };
  c.eq(totals.chart, gate.totals.charts, 'chart blocks (total)');
  c.eq(totals.image, gate.totals.images, 'image blocks (total)');
  c.eq(totals.table - totals.computed_table, gate.totals.tables, 'static tables (total)');

  /* ---- chapter specific ---- */
  if (chapter === 1) verifyChapter1(c, parsed, charts, chartRefs, totals, stats);
  if (chapter === 3) verifyChapter3(c, parsed, charts, chartRefs, stats);
  if (chapter === 2 || chapter === 4)
    verifyGuides(c, gate, assets, imageRefs, totals, locations, stats);
  if (parsed['questions.vi.private.json'] !== undefined)
    verifyQuestions(c, gate, parsed['questions.vi.private.json'], charts, stats);

  /* ---- do-not-copy scan over everything learner-facing ---- */
  const findings = [
    ...scanForbidden(lessons, { where: 'lessons' }),
    ...scanForbidden(lessons, { keys: ANSWER_KEYS, where: 'lessons' }),
    ...(parsed['charts.vi.json'] !== undefined
      ? [
          ...scanForbidden(charts, { where: 'charts' }),
          ...scanForbidden(charts, { keys: ANSWER_KEYS, where: 'charts' }),
        ]
      : []),
    ...(parsed['assets.manifest.json'] !== undefined
      ? scanForbidden(
          Object.fromEntries(Object.entries(assets).map(([k, v]) => [k, { ...v, marks: [] }])),
          { where: 'assets' },
        )
      : []),
  ];
  const privateQuestions = privateQuestionsFileSchema.safeParse(
    parsed['questions.vi.private.json'],
  );
  if (privateQuestions.success) {
    findings.push(
      ...scanForbidden(
        privateQuestions.data.map((q) => ({
          ...q,
          options: q.options.map((o) => ({ id: o.id, text: o.text, explanation: o.explanation })),
        })),
        { keys: FORBIDDEN_KEYS, where: 'questions' },
      ),
    );
  }
  for (const f of findings.slice(0, 15)) c.fail(`do-not-copy: ${f}`);
  if (findings.length > 15) c.fail(`do-not-copy: ${findings.length - 15} more findings`);
  return { errors: c.errors, stats };
}

/* ------------------------------------------------------------------ chapter 1 */

function verifyChapter1(
  c: Collector,
  parsed: Record<string, unknown>,
  charts: Record<string, ChartModel>,
  chartRefs: string[],
  totals: BlockCounts,
  stats: ChapterStats,
): void {
  const ids = Object.keys(C1_CHART_WINDOWS);
  c.eq(Object.keys(charts), ids, 'chart ids and order');
  const lessonIds = ids.slice(0, 16);
  c.eq(chartRefs, lessonIds, 'lesson chart blocks (ids and order)');
  c.eq(totals.computed_table, 6, 'dynamic-hook tables');
  for (const [id, expect] of Object.entries(C1_CHART_WINDOWS)) {
    const m = charts[id];
    if (!m || m.kind !== 'series_panels') {
      c.fail(`chart ${id} is not a series_panels model`);
      continue;
    }
    c.eq(
      [m.x.start, m.x.end, m.marks.map((k) => [k.i, k.label])],
      [expect.start, expect.end, expect.marks],
      `chart ${id} window and marks`,
    );
    c.check(m.x.end - m.x.start + 1 <= 60, `chart ${id} exceeds 60 points`);
  }
  // Hook tables: MACD seed (sessions 26-34) and the five application tables.
  const lessons = parsed['lessons.vi.json'] as PackageLesson[];
  const hooks: { hook: string; chart_id?: string; rows: number; head: number }[] = [];
  for (const l of lessons)
    walkBlocks(
      l.sections.flatMap((s) => s.blocks),
      (b) => {
        if (b.type === 'table' && b.source)
          hooks.push({
            hook: b.source.hook,
            ...(b.source.chart_id ? { chart_id: b.source.chart_id } : {}),
            rows: b.rows.length,
            head: b.head.length,
          });
      },
    );
  c.eq(
    hooks,
    [
      { hook: 'application', chart_id: 'rsi-application', rows: 2, head: 3 },
      { hook: 'macd-seed', rows: 9, head: 7 },
      { hook: 'application', chart_id: 'macd-application', rows: 3, head: 2 },
      { hook: 'application', chart_id: 'ma-application', rows: 2, head: 3 },
      { hook: 'application', chart_id: 'boll-application', rows: 3, head: 3 },
      { hook: 'application', chart_id: 'volume-application', rows: 2, head: 3 },
    ],
    'dynamic hook tables',
  );
  const seed = lessons[1]?.sections[1]?.blocks;
  const seedHtml: string[] = [];
  walkBlocks(seed ?? [], (b) => {
    if (b.type === 'html' && b.html.includes('Phiên 34')) seedHtml.push(b.html);
  });
  c.eq(seedHtml.length, 1, 'MACD "Phiên 34" sentence');
  stats.counts.chart_models = Object.keys(charts).length;
}

/* ------------------------------------------------------------------ chapter 3 */

function verifyChapter3(
  c: Collector,
  parsed: Record<string, unknown>,
  charts: Record<string, ChartModel>,
  chartRefs: string[],
  stats: ChapterStats,
): void {
  c.eq([...chartRefs].sort(), [...C3_LESSON_CHART_IDS].sort(), '13 data-chart positions');
  c.eq(Object.keys(charts).length, 14, 'chart definitions');
  const questions = (parsed['questions.vi.private.json'] ?? []) as PrivateQuestion[];
  const used = new Set([
    ...chartRefs,
    ...questions.flatMap((q) => (q.figure?.type === 'chart' ? [q.figure.chart_id] : [])),
  ]);
  for (const id of Object.keys(charts))
    c.check(used.has(id), `chart definition ${id} is referenced nowhere`);
  const lessons = parsed['lessons.vi.json'] as PackageLesson[];
  let filterExamples = 0;
  for (const l of lessons)
    walkBlocks(
      l.sections.flatMap((s) => s.blocks),
      (b) => {
        if (b.type === 'callout' && b.variant === 'filter-example') filterExamples += 1;
      },
    );
  c.eq(filterExamples, 6, 'filter-example callouts');
  stats.counts.chart_models = Object.keys(charts).length;
  stats.counts.filter_examples = filterExamples;
}

/* ---------------------------------------------------------------- guides (2, 4) */

function verifyGuides(
  c: Collector,
  gate: ChapterGate,
  assets: Record<string, AssetEntry>,
  imageRefs: string[],
  totals: BlockCounts,
  locations: Locations,
  stats: ChapterStats,
): void {
  c.eq(Object.keys(assets).sort(), Object.keys(gate.images).sort(), 'asset ids');
  c.eq(
    [...imageRefs].sort(),
    Object.keys(gate.images).sort(),
    'image references (none dangling, none unreferenced)',
  );
  const dir = join(locations.publicDir, 'assets/academy', chapterDirName(gate.chapter));
  const present = existsSync(dir) ? readdirSync(dir).sort() : [];
  const wanted: string[] = [];
  let bytes = 0;
  for (const [id, asset] of Object.entries(assets)) {
    const spec = gate.images[id];
    if (spec) {
      c.eq(asset.sha256, spec.sha256, `${id} sha256 vs spec`);
      c.eq([asset.width, asset.height], [spec.width, spec.height], `${id} dimensions vs spec`);
    }
    const name = asset.file.slice(asset.file.lastIndexOf('/') + 1);
    wanted.push(name);
    c.eq(
      asset.file,
      `assets/academy/${chapterDirName(gate.chapter)}/${id}.${asset.sha256.slice(0, 8)}.webp`,
      `${id} file name`,
    );
    const path = join(locations.publicDir, asset.file);
    if (!existsSync(path)) {
      c.fail(`image file missing: ${asset.file}`);
      continue;
    }
    const data = readFileSync(path);
    bytes += data.length;
    c.eq(sha256Hex(data), asset.sha256, `${id} file sha256`);
    c.eq(data.length, asset.bytes, `${id} file size`);
    try {
      const info = readWebpInfo(data);
      c.eq([info.width, info.height], [asset.width, asset.height], `${id} RIFF dimensions`);
    } catch (error) {
      c.fail(`${id}: ${(error as Error).message}`);
    }
  }
  c.eq(
    present,
    wanted.sort(),
    `files in frontend/public/assets/academy/${chapterDirName(gate.chapter)}`,
  );
  stats.counts.images = Object.keys(assets).length;
  stats.counts.image_bytes = bytes;
  if (gate.chapter === 2) {
    c.eq(totals.details, 4, 'details blocks');
    c.eq(totals.steps, 6, 'steps lists');
    c.eq(totals.step_items, 21, 'steps');
    c.eq(totals.callout, 3, 'notice callouts');
  }
}

/* -------------------------------------------------------------------- questions */

function verifyQuestions(
  c: Collector,
  gate: ChapterGate,
  value: unknown,
  charts: Record<string, ChartModel>,
  stats: ChapterStats,
): void {
  const parsed = privateQuestionsFileSchema.safeParse(value);
  if (!parsed.success) {
    c.fail(`questions.vi.private.json: ${parsed.error.message.slice(0, 400)}`);
    return;
  }
  const questions: PrivateQuestion[] = parsed.data;
  c.eq(questions.length, gate.totals.questions, 'question count');
  let chartFigures = 0;
  let tableFigures = 0;
  let hints = 0;
  let explanations = 0;
  const ids = new Set<string>();
  const correct = new Set<string>();
  for (const lg of gate.lessons) {
    const own = questions.filter((q) => q.lesson_id === lg.id);
    c.eq(own.length, 8, `${lg.id} questions`);
    c.eq(
      own.map((q) => q.id),
      Array.from({ length: own.length }, (_, i) => `${lg.id}-q${String(i + 1).padStart(2, '0')}`),
      `${lg.id} question ids and order`,
    );
  }
  for (const q of questions) {
    ids.add(q.id);
    correct.add(q.correct_option_id);
    for (const o of q.options) {
      c.eq(o.id, opaqueOptionId(q.id, o.source_id), `${q.id}/${o.source_id} opaque option id`);
      c.check(!/^o\d$/.test(o.id), `${q.id}: option id ${o.id} is not opaque`);
      explanations += 1;
    }
    c.eq(
      q.options.map((o) => o.id),
      [...q.options.map((o) => o.id)].sort(),
      `${q.id} option order (opaque id order)`,
    );
    c.check(
      q.options.some((o) => o.id === q.correct_option_id),
      `${q.id}: correct option missing`,
    );
    if (q.hint !== undefined) hints += 1;
    if (q.figure?.type === 'chart') {
      chartFigures += 1;
      c.check(
        q.figure.chart_id in charts,
        `${q.id}: figure references unknown chart ${q.figure.chart_id}`,
      );
    } else if (q.figure?.type === 'table') {
      tableFigures += 1;
      for (const row of q.figure.rows)
        c.eq(row.length, q.figure.head.length, `${q.id} figure row width`);
    }
    // The projection served before submit carries no answer data.
    const pub = JSON.stringify(toPublicQuestion(q));
    c.check(
      !pub.includes('"explanation"') && !pub.includes('"correct_option_id"'),
      `${q.id}: public projection leaks answer data`,
    );
    for (const o of q.options)
      c.check(!pub.includes(o.explanation), `${q.id}: public projection contains an explanation`);
  }
  c.eq(ids.size, questions.length, 'unique question ids');
  c.eq(correct.size, questions.length, 'distinct correct option ids (re-keyed)');
  if (gate.chapter === 1) {
    c.eq([chartFigures, tableFigures, hints], [10, 2, 9], 'chart figures / matrix figures / hints');
  } else {
    c.eq([chartFigures, tableFigures, hints], [10, 8, 1], 'chart figures / table figures / hints');
  }
  c.eq(explanations, questions.length * 4, 'per-option explanations');
  stats.counts.questions = questions.length;
  stats.counts.chart_questions = chartFigures;
  stats.counts.table_questions = tableFigures;
  stats.counts.hints = hints;
  stats.counts.explanations = explanations;
}

/* --------------------------------------------------------------------- entry */

export function verifyPackages(
  opts: { locations?: Locations; chapters?: readonly ChapterNo[] } = {},
): VerifyReport {
  const locations = opts.locations ?? defaultLocations();
  const registry = JSON.parse(readFileSync(locations.fundamentalRegistry, 'utf8')) as {
    id: string;
  }[];
  const fundamentalIds = new Set(registry.map((m) => m.id));
  const errors: string[] = [];
  const chapters: ChapterStats[] = [];
  for (const chapter of opts.chapters ?? CHAPTERS) {
    const result = verifyChapter(chapter, locations, fundamentalIds);
    errors.push(...result.errors);
    chapters.push(result.stats);
  }
  return { ok: errors.length === 0, errors, chapters };
}

function main(): void {
  const report = verifyPackages();
  for (const ch of report.chapters) {
    const files = Object.entries(ch.files)
      .map(([name, bytes]) => `${name}=${bytes}`)
      .join(' ');
    console.log(`C${ch.chapter}: ${files}`);
    console.log(`     ${JSON.stringify(ch.counts)}`);
  }
  if (!report.ok) {
    console.error(`\n${report.errors.length} problem(s):`);
    for (const e of report.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('academy packages: OK');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
