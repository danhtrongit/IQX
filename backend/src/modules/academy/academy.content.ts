import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INDICATOR_CAPABILITY_PREFIX, METRIC_CAPABILITY_PREFIX } from './academy.capabilities.js';
import type { AcademyContent, AcademyContentFiles, AcademyItem } from './academy.content.types.js';
import { canonicalHash, deepFreeze } from './academy.hash.js';
import {
  bankFileSchema,
  buildSequence,
  catalogFileSchema,
  lessonFileSchema,
  retiredLessonsFileSchema,
  scenarioOf,
  type BankFile,
  type LessonFile,
} from './content/v3/schema.js';

export type {
  AcademyContent,
  AcademyContentFiles,
  AcademyContentSource,
  AcademyItem,
} from './academy.content.types.js';
export { ACADEMY_CONTENT } from './academy.content.types.js';

/**
 * Học viện v3.3 content loader (design §1.2). `content/v3` holds the catalog (13 chapters, all
 * published), one public lesson file per lesson and practice, one PRIVATE question bank per
 * quizzable item and the names of retired lesson keys. Everything is validated against
 * `content/v3/schema.ts` and cross-checked here; any inconsistency stops the boot.
 * Banks never leave the server: only `toPublicQuestion` projections are served.
 */
export const ACADEMY_CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'content', 'v3');

function fail(message: string): never {
  throw new Error(`Invalid academy content: ${message}`);
}

/** Pure: validates the raw files and joins them into the loader output. Throws on any inconsistency. */
export function buildAcademyContent(files: AcademyContentFiles): AcademyContent {
  const catalog = deepFreeze(catalogFileSchema.parse(files.catalog));
  const retiredFile = retiredLessonsFileSchema.parse(files.retired);

  const lessons = new Map<string, LessonFile>();
  for (const raw of files.lessons) {
    const file = deepFreeze(lessonFileSchema.parse(raw));
    if (lessons.has(file.id)) fail(`lesson file ${file.id} is duplicated`);
    lessons.set(file.id, file);
  }
  const banks = new Map<string, BankFile>();
  for (const raw of files.banks) {
    const file = deepFreeze(bankFileSchema.parse(raw));
    if (banks.has(file.item_id)) fail(`bank ${file.item_id} is duplicated`);
    banks.set(file.item_id, file);
  }

  const items = new Map<string, AcademyItem>();
  const itemsByKey = new Map<string, AcademyItem>();
  let requiredTotal = 0;
  for (const chapter of catalog.chapters) {
    if (!chapter.published) continue;
    let position = 0;
    for (const entry of chapter.items) {
      const bank = banks.get(entry.id);
      if (!bank) fail(`${entry.id} has no question bank`);
      if (bank.questions.length !== entry.question_count)
        fail(
          `${entry.id} bank has ${bank.questions.length} questions, catalog says ${entry.question_count}`,
        );
      const file = lessons.get(entry.id);
      if (entry.kind === 'chapter_exam') {
        if (file) fail(`${entry.id} is a chapter exam and must not have a lesson file`);
      } else {
        if (!file) fail(`${entry.id} has no lesson file`);
        const mismatch = (
          [
            ['lesson_key', file.lesson_key, entry.lesson_key],
            ['kind', file.kind, entry.kind],
            ['chapter', file.chapter, chapter.no],
            ['order', file.order, entry.order],
            ['title', file.title, entry.name],
          ] as const
        ).find(([, actual, expected]) => actual !== expected);
        if (mismatch)
          fail(`${entry.id} lesson file ${mismatch[0]} ${String(mismatch[1])} != catalog`);
        if (entry.has_scenario !== (scenarioOf(file) !== null))
          fail(`${entry.id} has_scenario does not match its lesson file`);
      }
      for (const question of bank.questions)
        if (question.chart_id && !(file && question.chart_id in file.charts))
          fail(`${question.id} chart_id ${question.chart_id} is not a chart of ${entry.id}`);
      if (entry.kind === 'lesson') requiredTotal += 1;
      const item: AcademyItem = {
        ...entry,
        chapter: chapter.no,
        chapter_title: chapter.title,
        position: entry.kind === 'lesson' ? (position += 1) : null,
        capabilities: entry.unlock
          ? [
              `${
                entry.unlock.kind === 'technical'
                  ? INDICATOR_CAPABILITY_PREFIX
                  : METRIC_CAPABILITY_PREFIX
              }${entry.unlock.id}`,
            ]
          : [],
        lesson: file ? { file, content_version: canonicalHash(file).slice(0, 16) } : null,
        bank: { questions: bank.questions, version: canonicalHash(bank) },
      };
      deepFreeze(item);
      items.set(item.id, item);
      itemsByKey.set(item.lesson_key, item);
    }
  }
  for (const id of lessons.keys())
    if (!items.has(id)) fail(`lesson file ${id} is not a published catalog item`);
  for (const id of banks.keys())
    if (!items.has(id)) fail(`bank ${id} is not a published catalog item`);

  const catalogKeys = new Set(
    catalog.chapters.flatMap((chapter) =>
      chapter.published ? chapter.items.map((item) => item.lesson_key) : [],
    ),
  );
  const retired = new Map<string, string>();
  for (const entry of retiredFile.lessons) {
    if (catalogKeys.has(entry.lesson_key)) fail(`retired key ${entry.lesson_key} is a catalog key`);
    if (retired.has(entry.lesson_key)) fail(`retired key ${entry.lesson_key} is duplicated`);
    retired.set(entry.lesson_key, entry.name);
  }

  return deepFreeze({
    catalog,
    sequence: buildSequence(catalog),
    items,
    itemsByKey,
    requiredTotal,
    retired,
  });
}

const readJson = (...parts: string[]): unknown =>
  JSON.parse(readFileSync(join(ACADEMY_CONTENT_DIR, ...parts), 'utf8')) as unknown;

const jsonFiles = (directory: string, suffix: string): unknown[] =>
  readdirSync(join(ACADEMY_CONTENT_DIR, directory))
    .filter((name) => name.endsWith(suffix))
    .sort()
    .map((name) => readJson(directory, name));

/** Reads `content/v3` from disk (no memo). */
export function readAcademyContentFiles(): AcademyContentFiles {
  return {
    catalog: readJson('catalog.json'),
    lessons: jsonFiles('lessons', '.vi.json'),
    banks: jsonFiles('questions', '.private.json'),
    retired: readJson('retired-lessons.json'),
  };
}

let cached: AcademyContent | null = null;

/** Memoized `content/v3` (the default `ACADEMY_CONTENT` provider). */
export function loadAcademyContent(): AcademyContent {
  cached ??= buildAcademyContent(readAcademyContentFiles());
  return cached;
}
