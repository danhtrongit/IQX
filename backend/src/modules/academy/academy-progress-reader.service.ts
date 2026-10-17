import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import { loadAcademyContent } from './academy.content.js';
import type { AcademyContent, AcademyItem } from './academy.content.types.js';
import type { ItemKind } from './content/v3/schema.js';

/*
 * Stopgap on the v3.2 loader (P1): required lessons of the published chapters only, exams
 * counted in `chapter_exams`. P3 rewrites this reader per design §8 (exam and practice rows,
 * locked status, ACADEMY_CONTENT provider).
 */

/**
 * Read-only Academy progress of other users, for the admin and team-lead user views (admin
 * spec v1.1 §5.1.3 / §5.1.4). It is exported from AcademyModule and is NOT behind
 * AcademyEnabledGuard: staff can see what a member learned even while the Academy is hidden.
 *
 * Only the CURRENT catalog counts, and only its published lessons and chapters. The catalog
 * defines no chapter exams, so none are reported (`chapter_exams.total` is 0).
 *
 * "Bài đang học" is not stored: it is the not-yet-completed lesson with the most recent open
 * quiz attempt, else the first not-yet-completed published lesson in catalog order. A user with
 * no completion and no attempt in this catalog has not started (no current lesson).
 */

export type AcademyLessonStatus = 'completed' | 'in_progress' | 'failed' | 'not_started';

export type AcademyLessonRef = {
  lesson_id: string;
  chapter: number;
  order: number;
  name: string;
  /** "Chương c · Bài n: tên bài". */
  label: string;
};

export type AcademyProgressSummary = {
  started: boolean;
  completed: number;
  total: number;
  all_done: boolean;
  current_lesson: AcademyLessonRef | null;
};

export type AcademyLessonProgress = {
  lesson_id: string;
  order: number;
  name: string;
  kind: ItemKind;
  completion_mode: 'quiz' | 'guide';
  status: AcademyLessonStatus;
  /** Submitted quiz attempts in this catalog. */
  attempts: number;
  latest_score: number | null;
  max_score: number | null;
  completed_at: string | null;
  is_current: boolean;
};

export type AcademyChapterProgress = {
  no: number;
  title: string;
  total: number;
  completed: number;
  lessons: AcademyLessonProgress[];
};

export type AcademyProgressDetail = AcademyProgressSummary & {
  catalog_version: string;
  chapter_exams: { total: number; passed: number };
  last_completion:
    (AcademyLessonRef & { completed_at: string; reward_coins: number | null }) | null;
  /** Learning coins credited for completions (Shop reward hook); 0 without rewards. */
  learning_coins: number;
  chapters: AcademyChapterProgress[];
};

export type AcademyCompletionFact = {
  lesson_key: string;
  completed_at: Date | string;
  reward: unknown;
};

export type AcademyAttemptFact = {
  lesson_key: string;
  attempts: number;
  latest_score: number | null;
  open_at: Date | string | null;
};

export type AcademyUserFacts = {
  completions: AcademyCompletionFact[];
  attempts: AcademyAttemptFact[];
};

const EMPTY_FACTS: AcademyUserFacts = { completions: [], attempts: [] };

@Injectable()
export class AcademyProgressReader {
  protected readonly content: () => AcademyContent = loadAcademyContent;

  constructor(private readonly database: DatabaseService) {}

  async summaries(userIds: readonly string[]): Promise<Map<string, AcademyProgressSummary>> {
    const content = this.content();
    const facts = await this.facts(userIds, content);
    return new Map(
      userIds.map((id) => [id, summarize(buildAcademyProgress(content, facts.get(id)))]),
    );
  }

  async detail(userId: string): Promise<AcademyProgressDetail> {
    const content = this.content();
    const facts = await this.facts([userId], content);
    return buildAcademyProgress(content, facts.get(userId));
  }

  private async facts(
    userIds: readonly string[],
    content: AcademyContent,
  ): Promise<Map<string, AcademyUserFacts>> {
    const result = new Map<string, AcademyUserFacts>();
    if (userIds.length === 0) return result;
    const [completions, attempts] = await Promise.all([
      this.database.query<AcademyCompletionFact & { user_id: string }>(
        `select user_id, lesson_key, completed_at, source->'reward' as reward
           from academy_completions where user_id = any($1::uuid[])`,
        [userIds],
      ),
      this.database.query<{
        user_id: string;
        lesson_key: string;
        attempts: number;
        latest_score: number | null;
        open_at: Date | string | null;
      }>(
        `select user_id, lesson_key,
                (count(*) filter (where status = 'submitted'))::int as attempts,
                (array_agg(score order by submitted_at desc, id desc)
                   filter (where status = 'submitted'))[1] as latest_score,
                max(created_at) filter (where status = 'open') as open_at
           from academy_attempts
          where user_id = any($1::uuid[]) and lesson_key is not null and catalog_version = $2
          group by user_id, lesson_key`,
        [userIds, content.catalog.catalog_version],
      ),
    ]);
    const entry = (userId: string): AcademyUserFacts => {
      let facts = result.get(userId);
      if (!facts) {
        facts = { completions: [], attempts: [] };
        result.set(userId, facts);
      }
      return facts;
    };
    for (const row of completions) entry(row.user_id).completions.push(row);
    for (const row of attempts)
      entry(row.user_id).attempts.push({
        lesson_key: row.lesson_key,
        attempts: Number(row.attempts),
        latest_score: row.latest_score === null ? null : Number(row.latest_score),
        open_at: row.open_at,
      });
    return result;
  }
}

function lessonRef(lesson: AcademyItem): AcademyLessonRef {
  return {
    lesson_id: lesson.id,
    chapter: lesson.chapter,
    order: lesson.order,
    name: lesson.name,
    label: `Chương ${lesson.chapter} · Bài ${lesson.order}: ${lesson.name}`,
  };
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function creditedCoins(reward: unknown): number | null {
  if (!reward || typeof reward !== 'object') return null;
  const record = reward as Record<string, unknown>;
  if (record.status !== 'credited') return null;
  const delta = Number(record.delta);
  return Number.isFinite(delta) ? delta : null;
}

function summarize(detail: AcademyProgressDetail): AcademyProgressSummary {
  return {
    started: detail.started,
    completed: detail.completed,
    total: detail.total,
    all_done: detail.all_done,
    current_lesson: detail.current_lesson,
  };
}

/** Pure progress view of one user over the published part of the current catalog. */
export function buildAcademyProgress(
  content: AcademyContent,
  facts: AcademyUserFacts = EMPTY_FACTS,
): AcademyProgressDetail {
  const chapters = content.catalog.chapters.flatMap((chapter) =>
    chapter.published
      ? [
          {
            chapter,
            lessons: chapter.items
              .filter((entry) => entry.kind === 'lesson')
              .map((entry) => content.items.get(entry.id))
              .filter((lesson): lesson is AcademyItem => lesson !== undefined),
          },
        ]
      : [],
  );
  const examKeys = new Set(
    [...content.items.values()]
      .filter((item) => item.kind === 'chapter_exam')
      .map((item) => item.lesson_key),
  );
  const published = chapters.flatMap((entry) => entry.lessons);
  const publishedKeys = new Set(published.map((lesson) => lesson.lesson_key));

  const completions = new Map<string, AcademyCompletionFact>();
  for (const row of facts.completions)
    if (publishedKeys.has(row.lesson_key)) completions.set(row.lesson_key, row);
  const attempts = new Map<string, AcademyAttemptFact>();
  for (const row of facts.attempts)
    if (publishedKeys.has(row.lesson_key)) attempts.set(row.lesson_key, row);

  const openLesson = published
    .filter((lesson) => !completions.has(lesson.lesson_key))
    .map((lesson) => ({ lesson, openAt: attempts.get(lesson.lesson_key)?.open_at ?? null }))
    .filter((entry) => entry.openAt !== null)
    .sort(
      (a, b) => new Date(b.openAt as Date).getTime() - new Date(a.openAt as Date).getTime(),
    )[0]?.lesson;
  const started = completions.size > 0 || attempts.size > 0;
  const current =
    started && completions.size < published.length
      ? (openLesson ?? published.find((lesson) => !completions.has(lesson.lesson_key)) ?? null)
      : null;

  let last: { lesson: AcademyItem; completion: AcademyCompletionFact } | null = null;
  for (const lesson of published) {
    const completion = completions.get(lesson.lesson_key);
    if (
      completion &&
      (!last ||
        new Date(completion.completed_at).getTime() >
          new Date(last.completion.completed_at).getTime())
    )
      last = { lesson, completion };
  }
  const learningCoins = facts.completions.reduce(
    (sum, row) => sum + (creditedCoins(row.reward) ?? 0),
    0,
  );

  return {
    catalog_version: content.catalog.catalog_version,
    started,
    completed: completions.size,
    total: published.length,
    all_done: published.length > 0 && completions.size === published.length,
    current_lesson: current ? lessonRef(current) : null,
    chapter_exams: {
      total: examKeys.size,
      passed: facts.completions.filter((row) => examKeys.has(row.lesson_key)).length,
    },
    last_completion: last
      ? {
          ...lessonRef(last.lesson),
          completed_at: iso(last.completion.completed_at),
          reward_coins: creditedCoins(last.completion.reward),
        }
      : null,
    learning_coins: learningCoins,
    chapters: chapters.map(({ chapter, lessons }) => ({
      no: chapter.no,
      title: chapter.title,
      total: lessons.length,
      completed: lessons.filter((lesson) => completions.has(lesson.lesson_key)).length,
      lessons: lessons.map((lesson): AcademyLessonProgress => {
        const completion = completions.get(lesson.lesson_key);
        const attempt = attempts.get(lesson.lesson_key);
        const status: AcademyLessonStatus = completion
          ? 'completed'
          : attempt?.open_at
            ? 'in_progress'
            : (attempt?.attempts ?? 0) > 0
              ? 'failed'
              : 'not_started';
        return {
          lesson_id: lesson.id,
          order: lesson.order,
          name: lesson.name,
          kind: lesson.kind,
          completion_mode: 'quiz',
          status,
          attempts: attempt?.attempts ?? 0,
          latest_score: attempt?.latest_score ?? null,
          max_score: lesson.question_count,
          completed_at: completion ? iso(completion.completed_at) : null,
          is_current: current?.id === lesson.id,
        };
      }),
    })),
  };
}
