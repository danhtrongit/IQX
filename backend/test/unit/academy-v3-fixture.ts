import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  AcademyContent,
  AcademyContentSource,
  AcademyItem,
} from '../../src/modules/academy/academy.content.types.js';
import { canonicalHash } from '../../src/modules/academy/academy.hash.js';
import {
  bankFileSchema,
  buildSequence,
  catalogFileSchema,
  lessonFileSchema,
  retiredLessonsFileSchema,
  type BankFile,
  type LessonFile,
} from '../../src/modules/academy/content/v3/schema.js';

/**
 * Học viện v3.3 content for unit tests, built from the real `content/v3` files with the same
 * shape the runtime loader returns (design §1.2). Independent of `academy.content.ts`, so tests of
 * consumers (staff progress reader, grants) can run before and after the loader swap. Provide it
 * through the `ACADEMY_CONTENT` token: `{ provide: ACADEMY_CONTENT, useValue: academyV3Source }`.
 */
const V3_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/modules/academy/content/v3',
);

const readJson = (...parts: string[]): unknown =>
  JSON.parse(readFileSync(join(V3_DIR, ...parts), 'utf8')) as unknown;

function buildFixture(): AcademyContent {
  const catalog = catalogFileSchema.parse(readJson('catalog.json'));
  const lessons = new Map<string, LessonFile>();
  for (const name of readdirSync(join(V3_DIR, 'lessons'))) {
    const file = lessonFileSchema.parse(readJson('lessons', name));
    lessons.set(file.id, file);
  }
  const banks = new Map<string, BankFile>();
  for (const name of readdirSync(join(V3_DIR, 'questions'))) {
    const file = bankFileSchema.parse(readJson('questions', name));
    banks.set(file.item_id, file);
  }
  const retiredFile = retiredLessonsFileSchema.parse(readJson('retired-lessons.json'));

  const items = new Map<string, AcademyItem>();
  const itemsByKey = new Map<string, AcademyItem>();
  let requiredTotal = 0;
  for (const chapter of catalog.chapters) {
    if (!chapter.published) continue;
    let position = 0;
    for (const entry of chapter.items) {
      const bank = banks.get(entry.id);
      if (!bank) throw new Error(`fixture: no bank for ${entry.id}`);
      const lessonFile = lessons.get(entry.id);
      if (entry.kind !== 'chapter_exam' && !lessonFile)
        throw new Error(`fixture: no lesson file for ${entry.id}`);
      if (entry.kind === 'lesson') requiredTotal += 1;
      const item: AcademyItem = {
        ...entry,
        chapter: chapter.no,
        chapter_title: chapter.title,
        position: entry.kind === 'lesson' ? (position += 1) : null,
        capabilities: entry.unlock
          ? [`${entry.unlock.kind === 'technical' ? 'indicator:' : 'metric:'}${entry.unlock.id}`]
          : [],
        lesson:
          entry.kind === 'chapter_exam' || !lessonFile
            ? null
            : { file: lessonFile, content_version: canonicalHash(lessonFile).slice(0, 16) },
        bank: { questions: bank.questions, version: canonicalHash(bank) },
      };
      items.set(item.id, item);
      itemsByKey.set(item.lesson_key, item);
    }
  }

  return {
    catalog,
    sequence: buildSequence(catalog),
    items,
    itemsByKey,
    requiredTotal,
    retired: new Map(retiredFile.lessons.map((l) => [l.lesson_key, l.name] as const)),
  };
}

let cached: AcademyContent | null = null;

/** Memoized real v3.3 content (101 items, 87 required lessons). */
export function academyV3Fixture(): AcademyContent {
  cached ??= buildFixture();
  return cached;
}

/** `ACADEMY_CONTENT` provider value for tests. */
export const academyV3Source: AcademyContentSource = academyV3Fixture;
