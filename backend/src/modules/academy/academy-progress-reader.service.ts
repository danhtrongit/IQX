import { Inject, Injectable, Optional } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import {
  adminConfig,
  buildAcademyProgram,
  displayName,
  fullConfigData,
  itemLabel,
  type AcademyConfigSource,
  type AcademyProgram,
  type ResolvedAcademyConfig,
} from './academy.config.js';
import {
  ACADEMY_CONTENT,
  type AcademyContent,
  type AcademyContentSource,
  type AcademyItem,
} from './academy.content.types.js';
import { ACADEMY_CONFIG, type AcademyConfigPort } from './academy.ports.js';
import {
  chapterIdOf,
  currentItemId,
  type AcademyAccessMode,
  type ItemKind,
} from './content/v4/schema.js';

/**
 * Read-only Học viện progress of other users, for the admin and team-lead user views (admin
 * spec v1.1 §5.1.3 / §5.1.4, Học viện spec v4 §4.1 / §7, v4.1 §8.4). It is exported from AcademyModule
 * and is NOT behind AcademyEnabledGuard: staff can see what a member learned even while the Academy
 * is hidden.
 *
 * Everything is shown in the user's OWN program (v4.1 §1, §2): the chapters of the Academy config of
 * his group, numbered again from 1 ("Chương 2 · Thương hiệu cá nhân"), and his access mode. Every
 * chapter shows its lessons, its chapter exam and, for the Thương hiệu cá nhân chapter, the optional
 * practice (Phòng tập thực chiến). Totals (`completed / total`, x / N) count the required lessons of
 * the program's chapters only: exams are reported through `chapter_exams` and `exam_passed`, and the
 * optional practice never counts. A chapter removed from his config no longer counts anywhere, but
 * what he passed there is kept and listed after the program's chapters (`in_program: false`, no
 * `display_no`), so the history stays visible to staff (v4.1 §7, §8.4).
 *
 * A completion of any catalog version passes an item (the durable lesson key). In `free` mode
 * nothing is locked; in `sequential` mode an item is `locked` until the required items before it in
 * the user's chain are passed (v4.1 §3.2). "Bài đang học" is the lesson or exam the learner opened
 * last (`academy_last_opened`, found by its durable key) while it is in his chain and not locked; a
 * learner who never opened one has the first required item still to pass (`currentItemId`), which
 * can be a chapter exam. A user with no completion on a program item, no attempt in the current
 * catalog and no opened item has not started (no current item).
 */

export type AcademyLessonStatus = 'completed' | 'in_progress' | 'failed' | 'not_started' | 'locked';

export type AcademyLessonRef = {
  lesson_id: string;
  /** Fixed id of the lesson's chapter (`ch03`). */
  chapter_id: string;
  /** The chapter number the user sees (his `display_no`). */
  chapter_display_no: number;
  order: number;
  name: string;
  /** "Chương c · Bài n: tên bài", "Bài thi Chương c" or "Chương c · Phòng tập thực chiến", with the user's c. */
  label: string;
};

export type AcademyCurrentItemRef = AcademyLessonRef & {
  /** The current item is always required: a lesson or a chapter exam. */
  kind: Exclude<ItemKind, 'practice'>;
};

export type AcademyProgressSummary = {
  started: boolean;
  /** Passed required lessons of the user's chapters. */
  completed: number;
  /** N: required lessons of the user's chapters. */
  total: number;
  /** Every required item (lessons and chapter exams) of the user's chapters is passed. */
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
  chapter_id: string;
  /** The number the user sees; null for a chapter that is no longer in his config. */
  display_no: number | null;
  /** The chapter is in the user's config (counts in x / N). */
  in_program: boolean;
  title: string;
  /** Required lessons of the chapter. */
  total: number;
  /** Passed required lessons of the chapter. */
  completed: number;
  exam_passed: boolean;
  lessons: AcademyLessonProgress[];
};

/** The Academy config that applies to the user (v4.1 §1.1, §8.2). */
export type AcademyProgressConfig = {
  source: AcademyConfigSource;
  mode: AcademyAccessMode;
  chapter_count: number;
  chapter_total: number;
};

export type AcademyProgressDetail = AcademyProgressSummary & {
  catalog_version: string;
  config: AcademyProgressConfig;
  /** One exam per chapter of the user's config. */
  chapter_exams: { total: number; passed: number };
  last_completion:
    (AcademyLessonRef & { completed_at: string; reward_coins: number | null }) | null;
  /** Learning coins credited for completions (Shop reward hook), whatever the chapter; 0 without rewards. */
  learning_coins: number;
  /** The user's chapters in his order, then removed chapters in which he has passed something or tried. */
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

/** The item the learner opened last (`academy_last_opened`), by its durable lesson key. */
export type AcademyLastOpenedFact = {
  lesson_key: string;
  opened_at: Date | string;
};

export type AcademyUserFacts = {
  completions: AcademyCompletionFact[];
  attempts: AcademyAttemptFact[];
  last_opened?: AcademyLastOpenedFact | null;
};

const EMPTY_FACTS: AcademyUserFacts = { completions: [], attempts: [] };

@Injectable()
export class AcademyProgressReader {
  constructor(
    private readonly database: DatabaseService,
    @Inject(ACADEMY_CONTENT) private readonly content: AcademyContentSource,
    /** Config of each user; without a provider every user is shown with every chapter, free. */
    @Optional() @Inject(ACADEMY_CONFIG) private readonly configs?: AcademyConfigPort,
  ) {}

  async summaries(userIds: readonly string[]): Promise<Map<string, AcademyProgressSummary>> {
    const content = this.content();
    const [facts, configs] = await Promise.all([
      this.facts(userIds, content),
      this.configsOf(userIds, content),
    ]);
    return new Map(
      userIds.map((id) => [
        id,
        summarize(
          buildAcademyProgress(
            content,
            programOf(content, configs.get(id)),
            facts.get(id),
            configs.get(id),
          ),
        ),
      ]),
    );
  }

  async detail(userId: string): Promise<AcademyProgressDetail> {
    const content = this.content();
    const [facts, configs] = await Promise.all([
      this.facts([userId], content),
      this.configsOf([userId], content),
    ]);
    const config = configs.get(userId);
    return buildAcademyProgress(content, programOf(content, config), facts.get(userId), config);
  }

  /** The config of every user (v4.1 §8.2); without a provider, every chapter and `free` for everybody. */
  private async configsOf(
    userIds: readonly string[],
    content: AcademyContent,
  ): Promise<Map<string, ResolvedAcademyConfig>> {
    if (this.configs) return this.configs.configsOf(userIds);
    const full: ResolvedAcademyConfig = {
      ...fullConfigData(content),
      source: 'default',
      config_id: null,
    };
    return new Map(userIds.map((id) => [id, full]));
  }

  private async facts(
    userIds: readonly string[],
    content: AcademyContent,
  ): Promise<Map<string, AcademyUserFacts>> {
    const result = new Map<string, AcademyUserFacts>();
    if (userIds.length === 0) return result;
    const [completions, attempts, lastOpened] = await Promise.all([
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
      this.database.query<AcademyLastOpenedFact & { user_id: string }>(
        `select user_id, lesson_key, opened_at
           from academy_last_opened where user_id = any($1::uuid[])`,
        [userIds],
      ),
    ]);
    const entry = (userId: string): AcademyUserFacts => {
      let facts = result.get(userId);
      if (!facts) {
        facts = { completions: [], attempts: [], last_opened: null };
        result.set(userId, facts);
      }
      return facts;
    };
    for (const row of lastOpened)
      entry(row.user_id).last_opened = { lesson_key: row.lesson_key, opened_at: row.opened_at };
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


/** The user's program: his resolved config, or every chapter when nothing resolved. */
function programOf(
  content: AcademyContent,
  config: ResolvedAcademyConfig | undefined,
): AcademyProgram {
  return buildAcademyProgram(content, config ?? adminConfig(content));
}

function itemRef(item: AcademyItem, chapterId: string, displayNo: number): AcademyLessonRef {
  return {
    lesson_id: item.id,
    chapter_id: chapterId,
    chapter_display_no: displayNo,
    order: item.order,
    name: displayName(item, displayNo),
    label: itemLabel(item, displayNo),
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

/**
 * Pure progress view of one user over the chapters of his program (the chapters of his config, numbered from 1), plus
 * the chapters he no longer has when he did something there.
 */
export function buildAcademyProgress(
  content: AcademyContent,
  program: AcademyProgram,
  facts: AcademyUserFacts = EMPTY_FACTS,
  config: Pick<ResolvedAcademyConfig, 'source'> = { source: 'default' },
): AcademyProgressDetail {
  const programItems = program.chapters.flatMap((chapter) => chapter.items);
  const programKeys = new Set(programItems.map((item) => item.lesson_key));

  // Everything the user ever did, by durable lesson key; the program decides what counts.
  const doneByKey = new Map(facts.completions.map((row) => [row.lesson_key, row]));
  const attemptByKey = new Map(facts.attempts.map((row) => [row.lesson_key, row]));
  const completions = new Map([...doneByKey].filter(([key]) => programKeys.has(key)));
  const attempts = new Map([...attemptByKey].filter(([key]) => programKeys.has(key)));

  const states = program.states(new Set(completions.keys()));
  // The item opened last, when it is still a required item of the user's chain (the optional practice never is "current").
  const opened = facts.last_opened
    ? content.itemsByKey.get(facts.last_opened.lesson_key)
    : undefined;
  const openedId =
    opened && !opened.optional && program.chapterOf(opened.id) !== undefined ? opened.id : null;
  const started = completions.size > 0 || attempts.size > 0 || openedId !== null;
  const currentId = currentItemId(program.sequence, states, openedId);
  const current = started && currentId !== null ? content.items.get(currentId) : undefined;
  const isRequiredLesson = (item: AcademyItem) => item.kind === 'lesson' && !item.optional;
  const passedLessons = (items: readonly AcademyItem[], done: ReadonlyMap<string, unknown>) =>
    items.filter((item) => isRequiredLesson(item) && done.has(item.lesson_key)).length;
  const exams = programItems.filter((item) => item.kind === 'chapter_exam');

  let last: { item: AcademyItem; completion: AcademyCompletionFact } | null = null;
  for (const item of programItems) {
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

  const lessonProgress = (
    item: AcademyItem,
    name: string,
    locked: boolean,
  ): AcademyLessonProgress => {
    const completion = doneByKey.get(item.lesson_key);
    const attempt = attemptByKey.get(item.lesson_key);
    const status: AcademyLessonStatus = completion
      ? 'completed'
      : locked
        ? 'locked'
        : attempt?.open_at
          ? 'in_progress'
          : (attempt?.attempts ?? 0) > 0
            ? 'failed'
            : 'not_started';
    return {
      lesson_id: item.id,
      order: item.order,
      name,
      kind: item.kind,
      optional: item.optional,
      status,
      attempts: attempt?.attempts ?? 0,
      latest_score: attempt?.latest_score ?? null,
      max_score: item.question_count,
      completed_at: completion ? iso(completion.completed_at) : null,
      is_current: current?.id === item.id,
    };
  };

  const programChapters: AcademyChapterProgress[] = program.chapters.map((chapter) => ({
    chapter_id: chapter.chapter_id,
    display_no: chapter.display_no,
    in_program: true,
    title: chapter.title,
    total: chapter.items.filter(isRequiredLesson).length,
    completed: passedLessons(chapter.items, completions),
    exam_passed: chapter.items.some(
      (item) => item.kind === 'chapter_exam' && completions.has(item.lesson_key),
    ),
    lessons: chapter.items.map((item) =>
      lessonProgress(item, displayName(item, chapter.display_no), states.get(item.id) === 'locked'),
    ),
  }));

  // Chapters outside the config keep what the user did there, so staff still see the history (v4.1 §8.4). They have no
  // number for him: an exam there is named after its chapter.
  const removedChapters: AcademyChapterProgress[] = content.catalog.chapters.flatMap((chapter) => {
    const chapterId = chapterIdOf(chapter.no);
    if (!chapter.published || program.chapters.some((entry) => entry.chapter_id === chapterId))
      return [];
    const items = chapter.items.flatMap((entry) => {
      const item = content.items.get(entry.id);
      return item ? [item] : [];
    });
    if (!items.some((item) => doneByKey.has(item.lesson_key) || attemptByKey.has(item.lesson_key)))
      return [];
    return [
      {
        chapter_id: chapterId,
        display_no: null,
        in_program: false,
        title: chapter.title,
        total: items.filter(isRequiredLesson).length,
        completed: passedLessons(items, doneByKey),
        exam_passed: items.some(
          (item) => item.kind === 'chapter_exam' && doneByKey.has(item.lesson_key),
        ),
        lessons: items.map((item) =>
          lessonProgress(
            item,
            item.kind === 'chapter_exam' ? `Bài thi · ${chapter.title}` : item.name,
            false,
          ),
        ),
      },
    ];
  });

  const refOf = (item: AcademyItem) => {
    const chapter = program.chapterOf(item.id);
    return itemRef(item, chapter?.chapter_id ?? chapterIdOf(item.chapter), chapter?.display_no ?? 0);
  };

  return {
    catalog_version: content.catalog.catalog_version,
    started,
    completed: passedLessons(programItems, completions),
    total: program.requiredTotal,
    // Done = no required item left to pass (what the learner opened last does not matter).
    all_done: currentItemId(program.sequence, states) === null,
    current_lesson:
      current && current.kind !== 'practice' ? { ...refOf(current), kind: current.kind } : null,
    config: {
      source: config.source,
      mode: program.mode,
      chapter_count: program.chapters.length,
      chapter_total: content.catalog.chapters.filter((chapter) => chapter.published).length,
    },
    chapter_exams: {
      total: exams.length,
      passed: exams.filter((item) => completions.has(item.lesson_key)).length,
    },
    last_completion: last
      ? {
          ...refOf(last.item),
          completed_at: iso(last.completion.completed_at),
          reward_coins: creditedCoins(last.completion.reward),
        }
      : null,
    learning_coins: learningCoins,
    chapters: [...programChapters, ...removedChapters],
  };
}
