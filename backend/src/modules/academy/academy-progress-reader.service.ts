import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import {
  ACADEMY_CONTENT,
  type AcademyContent,
  type AcademyContentSource,
  type AcademyItem,
} from './academy.content.types.js';
import { currentItemId, itemStates, type ItemKind } from './content/v3/schema.js';

/**
 * Read-only Học viện progress of other users, for the admin and team-lead user views (admin
 * spec v1.1 §5.1.3 / §5.1.4, Học viện spec v3.2 §5). It is exported from AcademyModule and is
 * NOT behind AcademyEnabledGuard: staff can see what a member learned even while the Academy is
 * hidden.
 *
 * Only published chapters of the current catalog are listed. Every chapter shows its lessons,
 * its chapter exam and, for chapter 3, the optional practice (Phòng tập thực chiến). Totals
 * (`completed / total`, x / 43) count required lessons only: exams are reported through
 * `chapter_exams` and `exam_passed`, and the optional practice never counts.
 *
 * Item states follow the learner's prefix rule (`itemStates` in content/v3/schema.ts): a
 * completion of any catalog version passes an item; an item is open only when every earlier
 * required item is passed, else locked. "Bài đang học" is the first open required item
 * (`currentItemId`), which can be a chapter exam. A user with no completion on a catalog item and
 * no attempt in the current catalog has not started (no current item).
 */

export type AcademyLessonStatus = 'completed' | 'in_progress' | 'failed' | 'not_started' | 'locked';

export type AcademyLessonRef = {
  lesson_id: string;
  chapter: number;
  order: number;
  name: string;
  /** "Chương c · Bài n: tên bài", "Bài thi Chương c" or "Chương 3 · Phòng tập thực chiến". */
  label: string;
};

export type AcademyCurrentItemRef = AcademyLessonRef & {
  /** The current item is always required: a lesson or a chapter exam. */
  kind: Exclude<ItemKind, 'practice'>;
};

export type AcademyProgressSummary = {
  started: boolean;
  /** Passed required lessons of published chapters. */
  completed: number;
  /** Required lessons of published chapters (43). */
  total: number;
  /** Every required item (lessons and chapter exams) of the published chapters is passed. */
  all_done: boolean;
  current_lesson: AcademyCurrentItemRef | null;
};

export type AcademyLessonProgress = {
  lesson_id: string;
  order: number;
  name: string;
  kind: ItemKind;
  /** Practice (Phòng tập thực chiến): never counted in totals. */
  optional: boolean;
  status: AcademyLessonStatus;
  /** Submitted quiz attempts in this catalog. */
  attempts: number;
  latest_score: number | null;
  /** Question count of the item (3, 5, 20 or 30). */
  max_score: number;
  completed_at: string | null;
  is_current: boolean;
};

export type AcademyChapterProgress = {
  no: number;
  title: string;
  /** Required lessons of the chapter. */
  total: number;
  /** Passed required lessons of the chapter. */
  completed: number;
  exam_passed: boolean;
  lessons: AcademyLessonProgress[];
};

export type AcademyProgressDetail = AcademyProgressSummary & {
  catalog_version: string;
  /** One exam per published chapter. */
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

/** Attempts of one item in the CURRENT catalog only. */
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
  constructor(
    private readonly database: DatabaseService,
    @Inject(ACADEMY_CONTENT) private readonly content: AcademyContentSource,
  ) {}

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
      // lesson_key identifies the item (and so its kind) within the current catalog.
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

function itemLabel(item: AcademyItem): string {
  if (item.kind === 'chapter_exam') return `Bài thi Chương ${item.chapter}`;
  if (item.kind === 'practice') return `Chương ${item.chapter} · ${item.name}`;
  return `Chương ${item.chapter} · Bài ${item.position ?? item.order}: ${item.name}`;
}

function itemRef(item: AcademyItem): AcademyLessonRef {
  return {
    lesson_id: item.id,
    chapter: item.chapter,
    order: item.order,
    name: item.name,
    label: itemLabel(item),
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

/** Pure progress view of one user over the published chapters of the current catalog. */
export function buildAcademyProgress(
  content: AcademyContent,
  facts: AcademyUserFacts = EMPTY_FACTS,
): AcademyProgressDetail {
  const chapters = content.catalog.chapters.flatMap((chapter) => {
    if (!chapter.published) return [];
    const items = chapter.items.map((entry) => {
      const item = content.items.get(entry.id);
      if (!item) throw new Error(`academy content has no item ${entry.id}`);
      return item;
    });
    return [{ no: chapter.no, title: chapter.title, items }];
  });
  const published = chapters.flatMap((chapter) => chapter.items);
  const publishedKeys = new Set(published.map((item) => item.lesson_key));

  const completions = new Map<string, AcademyCompletionFact>();
  for (const row of facts.completions)
    if (publishedKeys.has(row.lesson_key)) completions.set(row.lesson_key, row);
  const attempts = new Map<string, AcademyAttemptFact>();
  for (const row of facts.attempts)
    if (publishedKeys.has(row.lesson_key)) attempts.set(row.lesson_key, row);

  const states = itemStates(content.sequence, new Set(completions.keys()));
  const started = completions.size > 0 || attempts.size > 0;
  const currentId = currentItemId(content.sequence, states);
  const current = started && currentId !== null ? content.items.get(currentId) : undefined;
  const isRequiredLesson = (item: AcademyItem) => item.kind === 'lesson' && !item.optional;
  const passedLessons = (items: readonly AcademyItem[]) =>
    items.filter((item) => isRequiredLesson(item) && completions.has(item.lesson_key)).length;
  const exams = published.filter((item) => item.kind === 'chapter_exam');

  let last: { item: AcademyItem; completion: AcademyCompletionFact } | null = null;
  for (const item of published) {
    const completion = completions.get(item.lesson_key);
    if (
      completion &&
      (!last ||
        new Date(completion.completed_at).getTime() >
          new Date(last.completion.completed_at).getTime())
    )
      last = { item, completion };
  }
  const learningCoins = facts.completions.reduce(
    (sum, row) => sum + (creditedCoins(row.reward) ?? 0),
    0,
  );

  return {
    catalog_version: content.catalog.catalog_version,
    started,
    completed: passedLessons(published),
    total: content.requiredTotal,
    all_done: currentId === null,
    current_lesson:
      current && current.kind !== 'practice' ? { ...itemRef(current), kind: current.kind } : null,
    chapter_exams: {
      total: exams.length,
      passed: exams.filter((item) => completions.has(item.lesson_key)).length,
    },
    last_completion: last
      ? {
          ...itemRef(last.item),
          completed_at: iso(last.completion.completed_at),
          reward_coins: creditedCoins(last.completion.reward),
        }
      : null,
    learning_coins: learningCoins,
    chapters: chapters.map(({ no, title, items }) => ({
      no,
      title,
      total: items.filter(isRequiredLesson).length,
      completed: passedLessons(items),
      exam_passed: items.some(
        (item) => item.kind === 'chapter_exam' && completions.has(item.lesson_key),
      ),
      lessons: items.map((item): AcademyLessonProgress => {
        const completion = completions.get(item.lesson_key);
        const attempt = attempts.get(item.lesson_key);
        const status: AcademyLessonStatus = completion
          ? 'completed'
          : states.get(item.id) === 'locked'
            ? 'locked'
            : attempt?.open_at
              ? 'in_progress'
              : (attempt?.attempts ?? 0) > 0
                ? 'failed'
                : 'not_started';
        return {
          lesson_id: item.id,
          order: item.order,
          name: item.name,
          kind: item.kind,
          optional: item.optional,
          status,
          attempts: attempt?.attempts ?? 0,
          latest_score: attempt?.latest_score ?? null,
          max_score: item.question_count,
          completed_at: completion ? iso(completion.completed_at) : null,
          is_current: current?.id === item.id,
        };
      }),
    })),
  };
}
