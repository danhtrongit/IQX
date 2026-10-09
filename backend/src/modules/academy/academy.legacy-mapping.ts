import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { loadAcademyContent, type AcademyContent } from './academy.content.js';

/**
 * Legacy (18-chapter / 125-lesson) -> current (13-chapter / 71-lesson) lesson mapping.
 *
 * It is keyed by capability, never by position: technical lessons by indicator id, fundamental
 * lessons by metric id, plus Hợp lưu. Chapter 2/4 guides have no legacy source and removed
 * lessons map to nothing. The same mapping is written, as an explicit VALUES list, in migration
 * 0014; a unit test keeps the two identical.
 */
export type LegacyMappingRow = {
  legacy_lesson_id: string;
  lesson_key: string;
  lesson_id: string;
};

/** Mapped legacy lessons ordered by legacy id (the order of the migration VALUES list). */
export function legacyMappingRows(
  content: AcademyContent = loadAcademyContent(),
): LegacyMappingRow[] {
  return [...content.lessonsByLegacyId.entries()]
    .map(([legacy, lesson]) => ({
      legacy_lesson_id: legacy,
      lesson_key: lesson.lesson_key,
      lesson_id: lesson.id,
    }))
    .sort((left, right) => (left.legacy_lesson_id < right.legacy_lesson_id ? -1 : 1));
}

const removedLessonsSchema = z.object({
  legacy_catalog_version: z.string(),
  removed_lessons: z.array(
    z.object({
      legacy_lesson_id: z.string().regex(/^ch\d{2}-l\d{2}$/),
      name: z.string(),
      chapter: z.number().int(),
      kind: z.string(),
      config_id: z.string().nullable(),
      folder: z.string(),
    }),
  ),
});
export type RemovedLegacyLesson = z.infer<typeof removedLessonsSchema>['removed_lessons'][number];

/** Legacy lessons that have no place in the current catalog (history only, never mapped). */
export function loadRemovedLegacyLessons(): RemovedLegacyLesson[] {
  const file = join(
    dirname(fileURLToPath(import.meta.url)),
    'content',
    'legacy',
    'removed-lessons.json',
  );
  return removedLessonsSchema.parse(JSON.parse(readFileSync(file, 'utf8'))).removed_lessons;
}

/** Why a legacy lesson is not carried over, for the dry-run report. */
export function unmappedReason(lesson: RemovedLegacyLesson): string {
  if (lesson.chapter === 2 || lesson.chapter === 4)
    return 'tool lesson of the old Backtest/Filter chapters: replaced by 6 new guides, no completion is copied';
  if (lesson.kind === 'system') return 'advanced system chapter removed from the product';
  return `removed indicator ${lesson.config_id ?? lesson.name}`;
}

/**
 * Reads the (legacy lesson id, lesson key, lesson id) triples of the VALUES list in the
 * migration text, so a test can prove the SQL and the catalog agree.
 */
export function parseMigrationMapping(sql: string): LegacyMappingRow[] {
  const rows: LegacyMappingRow[] = [];
  const pattern =
    /\(\s*'(ch\d{2}-l\d{2})'\s*,\s*'([a-z]+:[a-z0-9_-]+)'\s*,\s*'(ch\d{2}-l\d{2})'\s*\)/g;
  for (const match of sql.matchAll(pattern))
    rows.push({ legacy_lesson_id: match[1]!, lesson_key: match[2]!, lesson_id: match[3]! });
  return rows;
}
