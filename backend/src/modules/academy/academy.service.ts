import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
  type OnModuleInit,
} from '@nestjs/common';

import type { SqlClient } from '../../platform/database/index.js';
import {
  LESSON_REWARD_PORT,
  type LessonRewardPort,
} from '../../platform/ports/lesson-reward.port.js';
import { sortedCapabilities } from './academy-grants.service.js';
import { INDICATOR_CAPABILITY_PREFIX, METRIC_CAPABILITY_PREFIX } from './academy.capabilities.js';
import { loadAcademyContent } from './academy.content.js';
import type { AcademyContent, AcademyContentSource, AcademyItem } from './academy.content.types.js';
import {
  attemptQuestionViews,
  buildAttemptOrder,
  findInvalidAnswers,
  findInvalidDraftAnswers,
  gradeAnswers,
  secureRandomInt,
  type RandomInt,
} from './academy.grading.js';
import { canonicalHash } from './academy.hash.js';
import {
  AcademyRepository,
  type AcademyStore,
  type AcademyStoreProvider,
  type AttemptRow,
  type AttemptStats,
  type CompletionRow,
  type DraftRow,
  type NotesPatch,
  type PracticeNotesRow,
} from './academy.repository.js';
import type {
  AttemptCreateRequest,
  AttemptResponse,
  CatalogItemResponse,
  CatalogResponse,
  DraftSaveRequest,
  DraftSaveResponse,
  DraftState,
  HistoryQuery,
  HistoryResponse,
  ItemResponse,
  NotesResponse,
  NotesSaveRequest,
  ProgressResponse,
  ResumeResponse,
  RewardResult,
  ScenarioChoiceRequest,
  ScenarioChoiceResponse,
  SubmitRequest,
  SubmitResponse,
} from './academy.schemas.js';
import {
  currentItemId,
  interactiveKeysOf,
  itemStates,
  nextRequiredItemId,
  NOTES_TOTAL_MAX_BYTES,
  scenarioOf,
  type BankQuestion,
  type ItemState,
  type ScenarioBlock,
} from './content/v3/schema.js';

/**
 * Học viện v3.2 (design §2-§4): 14 chapters (1-5 published) of lessons, a chapter exam per
 * chapter and the optional chapter 3 practice, in one prefix-unlocked chain. Every state is
 * computed here from the learner's completions; quizzes are graded server-side against private
 * banks and only the score is ever returned (no answer key, no explanation, no review).
 */
@Injectable()
export class AcademyService implements OnModuleInit {
  protected readonly content: AcademyContentSource = loadAcademyContent;
  /** Source of the per-attempt question and option shuffles (overridden by seeded tests). */
  protected readonly random: RandomInt = secureRandomInt;

  constructor(
    @Inject(AcademyRepository) private readonly repository: AcademyStoreProvider,
    /** Learning-coin hook (Shop module); absent or failing hooks never change completion rules. */
    @Optional() @Inject(LESSON_REWARD_PORT) private readonly rewards?: LessonRewardPort,
  ) {}

  /** Content is validated at boot: broken content stops the API, not a learner's request. */
  onModuleInit(): void {
    this.content();
  }

  /** Published chapters with their items, plus retired lesson names. Never carries a bank. */
  catalog(): CatalogResponse {
    const content = this.content();
    return {
      catalog_version: content.catalog.catalog_version,
      required_total: content.requiredTotal,
      chapters: content.catalog.chapters.flatMap((chapter) =>
        chapter.published
          ? [
              {
                no: chapter.no,
                title: chapter.title,
                audience: chapter.audience,
                lesson_count: chapter.lesson_count,
                items: chapter.items.map((entry) =>
                  catalogItemView(requireItem(content, entry.id)),
                ),
              },
            ]
          : [],
      ),
      retired_lessons: [...content.retired].map(([lesson_key, name]) => ({ lesson_key, name })),
    };
  }

  /** Server-computed states of every item; `course_done` counts passed required lessons only. */
  async progress(userId: string): Promise<ProgressResponse> {
    const content = this.content();
    const store = this.repository.store();
    const [completions, stats] = await Promise.all([
      store.completions(userId),
      store.attemptStatsAll(userId, content.catalog.catalog_version),
    ]);
    return buildProgress(content, completions, stats);
  }

  /**
   * A lesson or practice (typed blocks, chart models, summary, scenario choice) or an exam intro.
   * 403 ACADEMY_ITEM_LOCKED while an earlier required item is not passed.
   */
  async lesson(userId: string, lessonId: string): Promise<ItemResponse> {
    const content = this.content();
    const item = requireItem(content, lessonId);
    const store = this.repository.store();
    const completions = await store.completions(userId);
    const state = stateOf(content, completions, item);
    const completion = completions.find((row) => row.lesson_key === item.lesson_key) ?? null;
    const stats = await store.attemptStats(
      userId,
      item.lesson_key,
      content.catalog.catalog_version,
    );
    const status = {
      catalog_version: content.catalog.catalog_version,
      state,
      completed_at: completion?.completed_at.toISOString() ?? null,
      best_score: stats.best_score,
      attempts_submitted: stats.attempts_submitted,
    };
    const base = catalogItemView(item);
    if (!item.lesson)
      return {
        ...base,
        ...status,
        kind: 'chapter_exam',
        intro: item.intro ?? '',
        chapter_title: item.chapter_title,
      };

    const file = item.lesson.file;
    const scenario = scenarioOf(file);
    const choice = scenario ? await store.scenarioChoice(userId, item.lesson_key) : null;
    return {
      ...base,
      ...status,
      kind: item.kind === 'practice' ? 'practice' : 'lesson',
      content_version: item.lesson.content_version,
      title: file.title,
      lead: file.lead,
      intro_blocks: file.intro_blocks,
      sections: file.sections,
      summary: file.summary,
      charts: file.charts,
      scenario_choice:
        scenario && choice && choice.scenario_hash === scenarioHash(scenario)
          ? { choice: choice.choice, chosen_at: choice.created_at.toISOString() }
          : null,
      reward:
        completion && 'reward' in completion.source ? rewardFromSource(completion.source) : null,
    };
  }

  /**
   * Stores the learner's scenario choice once. A replay (any choice) returns the stored row; a row
   * stored for an older version of the scenario is replaced once.
   */
  async chooseScenario(
    userId: string,
    lessonId: string,
    input: ScenarioChoiceRequest,
  ): Promise<ScenarioChoiceResponse> {
    const content = this.content();
    const item = requireItem(content, lessonId);
    const store = this.repository.store();
    stateOf(content, await store.completions(userId), item);
    const scenario = item.has_scenario && item.lesson ? scenarioOf(item.lesson.file) : null;
    if (!scenario)
      throw new UnprocessableEntityException({
        code: 'NO_SCENARIO',
        message: 'Bài này không có phần Tình huống để chọn.',
      });
    const { row, created } = await store.insertScenarioChoice({
      user_id: userId,
      lesson_key: item.lesson_key,
      lesson_id: item.id,
      choice: input.choice,
      scenario_hash: scenarioHash(scenario),
      catalog_version: content.catalog.catalog_version,
    });
    return {
      lesson_id: item.id,
      choice: row.choice,
      chosen_at: row.created_at.toISOString(),
      created,
    };
  }

  /** The learner's saved workpads, checklists and roleplay scores (revision 0 when none). */
  async lessonNotes(userId: string, lessonId: string): Promise<NotesResponse> {
    const content = this.content();
    const item = requireItem(content, lessonId);
    notesKeys(item);
    const store = this.repository.store();
    stateOf(content, await store.completions(userId), item);
    return notesView(item, await store.practiceNotes(userId, item.lesson_key));
  }

  /**
   * Merges partial notes by key. Keys must belong to the lesson's interactive blocks; the merged
   * size is bounded in SQL. Notes never touch progress, completions or rewards.
   */
  async saveLessonNotes(
    userId: string,
    lessonId: string,
    input: NotesSaveRequest,
  ): Promise<NotesResponse> {
    const content = this.content();
    const item = requireItem(content, lessonId);
    const keys = notesKeys(item);
    stateOf(content, await this.repository.store().completions(userId), item);

    const patch: NotesPatch = {
      ...(input.texts ? { texts: input.texts } : {}),
      ...(input.checks ? { checks: input.checks } : {}),
      ...(input.scores ? { scores: input.scores } : {}),
    };
    const issues = (['texts', 'checks', 'scores'] as const).flatMap((field) =>
      Object.keys(patch[field] ?? {})
        .filter((key) => !keys[field].has(key))
        .map((key) => ({ field, key, reason: 'unknown_key' })),
    );
    if (issues.length)
      throw new UnprocessableEntityException({
        code: 'INVALID_NOTES',
        message: 'Ghi chú chỉ được lưu cho các ô của bài học này.',
        details: issues,
      });
    if (Buffer.byteLength(JSON.stringify(patch)) > NOTES_TOTAL_MAX_BYTES) throw notesTooLarge();

    return this.repository.transaction(async (store) => {
      const result = await store.savePracticeNotes(
        userId,
        item.lesson_key,
        item.id,
        patch,
        input.expected_revision,
      );
      if (result.status === 'too_large') throw notesTooLarge();
      if (result.status === 'conflict')
        throw new ConflictException({
          code: 'NOTES_REVISION_CONFLICT',
          message: 'Ghi chú đã được lưu ở nơi khác. Đã tải bản mới nhất.',
          // `details[0].notes` is the stored notes, so the client can adopt them without a re-read.
          details: [{ notes: notesView(item, result.current) }],
        });
      return notesView(item, result.row);
    });
  }

  /**
   * Starts an attempt: every question of the item's bank, shuffled once, each with its 3 options
   * shuffled once; both orders are stored on the attempt and never change. A retake is a new
   * attempt (new idempotency key).
   */
  async createAttempt(userId: string, input: AttemptCreateRequest): Promise<AttemptResponse> {
    const content = this.content();
    const catalogVersion = content.catalog.catalog_version;
    assertCatalogVersion(catalogVersion, input.catalog_version);
    const store = this.repository.store();

    const existing = await store.attemptByIdempotencyKey(userId, input.idempotency_key);
    if (existing) return this.replayAttempt(content, existing, input);

    const item = requireItem(content, input.lesson_id);
    stateOf(content, await store.completions(userId), item);
    if (item.has_scenario && !(await store.scenarioChoice(userId, item.lesson_key)))
      throw new ForbiddenException({
        code: 'ACADEMY_SCENARIO_REQUIRED',
        message: 'Chọn cách xử lý ở phần Tình huống trước khi làm bài kiểm tra.',
      });

    const order = buildAttemptOrder(item.bank.questions, this.random);
    const inserted = await store.insertAttempt({
      id: randomUUID(),
      user_id: userId,
      lesson_id: item.id,
      lesson_key: item.lesson_key,
      kind: item.kind === 'chapter_exam' ? 'chapter_exam' : 'lesson',
      catalog_version: catalogVersion,
      content_version: item.lesson?.content_version ?? null,
      questions_version: item.bank.version,
      question_ids: order.question_ids,
      option_orders: order.option_orders,
      idempotency_key: input.idempotency_key,
    });
    if (inserted) return attemptView(item, inserted);
    // A concurrent request with the same key won the insert; replay its attempt.
    const winner = await store.attemptByIdempotencyKey(userId, input.idempotency_key);
    if (!winner) throw new Error('Academy attempt insert returned no row');
    return this.replayAttempt(content, winner, input);
  }

  /**
   * Resumes the learner's latest OPEN attempt of the item under the current catalog: the same
   * public projection as starting one plus the saved draft. `attempt` is null when there is
   * nothing to resume (none open, or its bank changed: the learner starts a new attempt).
   */
  async resumeAttempt(userId: string, lessonId: string): Promise<ResumeResponse> {
    const content = this.content();
    const item = requireItem(content, lessonId);
    const base = {
      lesson_id: item.id,
      lesson_key: item.lesson_key,
      catalog_version: content.catalog.catalog_version,
    };
    const store = this.repository.store();
    const attempt = await store.latestOpenAttempt(
      userId,
      item.lesson_key,
      content.catalog.catalog_version,
    );
    if (
      !attempt ||
      attempt.lesson_id !== item.id ||
      attempt.questions_version !== item.bank.version
    )
      return { ...base, attempt: null };
    const views = attemptQuestionViews(
      item.bank.questions,
      attempt.question_ids,
      attempt.option_orders,
    );
    if (!views) return { ...base, attempt: null };
    const draft = await store.draft(attempt.id);
    return {
      ...base,
      attempt: {
        ...projection(item, attempt, views),
        created_at: attempt.created_at.toISOString(),
        draft: draftState(draft, item.bank.questions, attempt.question_ids),
      },
    };
  }

  /**
   * Saves the learner's current choices of an open attempt (partial, merged into the stored
   * draft). Never grades and never reveals correctness. Owner-checked and serialized with submit
   * by the attempt row lock.
   */
  saveDraft(
    userId: string,
    attemptId: string,
    input: DraftSaveRequest,
  ): Promise<DraftSaveResponse> {
    const content = this.content();
    return this.repository.transaction(async (store) => {
      const attempt = await store.lockAttempt(userId, attemptId);
      if (!attempt) throw attemptNotFound();
      if (attempt.status !== 'open')
        throw new ConflictException({
          code: 'ATTEMPT_ALREADY_SUBMITTED',
          message: 'Lượt làm bài đã được nộp, không thể sửa lựa chọn.',
        });
      const item = pinnedItem(content, attempt);

      const issues = findInvalidDraftAnswers(
        item.bank.questions,
        attempt.question_ids,
        input.answers,
      );
      if (issues.length)
        throw new UnprocessableEntityException({
          code: 'INVALID_ANSWERS',
          message:
            'Mỗi lựa chọn phải thuộc một câu của lượt làm bài, mỗi câu tối đa một đáp án hợp lệ.',
          // The v2 error filter forwards only `code`, `message` and array `details`.
          details: issues,
        });

      const current = await store.draft(attempt.id);
      const view = (row: DraftRow | null) =>
        draftState(row, item.bank.questions, attempt.question_ids);
      if (
        input.expected_revision !== undefined &&
        input.expected_revision !== (current?.revision ?? 0)
      )
        throw new ConflictException({
          code: 'DRAFT_REVISION_CONFLICT',
          message: 'Bản nháp đã được lưu ở nơi khác. Tải lại để xem lựa chọn mới nhất.',
          // `details[0].draft` is the stored draft, so the client can adopt it without a re-read.
          details: [{ draft: view(current) }],
        });

      const selections = Object.fromEntries(
        input.answers.map((answer) => [answer.question_id, answer.option_id]),
      );
      // Re-sending what is already stored changes nothing: no write, no new revision.
      const unchanged = Object.entries(selections).every(
        ([questionId, optionId]) => current?.selections[questionId] === optionId,
      );
      const saved = unchanged ? current : await store.saveDraft(attempt.id, selections);
      return { attempt_id: attempt.id, ...view(saved) };
    });
  }

  /** The owner's submitted attempts of an item in the current catalog: score only, newest first. */
  async attemptHistory(
    userId: string,
    lessonId: string,
    query: HistoryQuery,
  ): Promise<HistoryResponse> {
    const content = this.content();
    const catalogVersion = content.catalog.catalog_version;
    const item = requireItem(content, lessonId);
    const store = this.repository.store();
    const [rows, stats] = await Promise.all([
      store.submittedAttempts(userId, item.lesson_key, catalogVersion, query.limit, query.offset),
      store.attemptStats(userId, item.lesson_key, catalogVersion),
    ]);
    const next = query.offset + rows.length;
    return {
      lesson_id: item.id,
      lesson_key: item.lesson_key,
      catalog_version: catalogVersion,
      items: rows.map((attempt) => ({
        attempt_id: attempt.id,
        submitted_at: (attempt.submitted_at ?? attempt.created_at).toISOString(),
        score: attempt.score ?? 0,
        total: attempt.question_ids.length,
        passed: attempt.passed === true,
      })),
      total: stats.attempts_submitted,
      limit: query.limit,
      offset: query.offset,
      next_offset: rows.length === query.limit && next < stats.attempts_submitted ? next : null,
    };
  }

  /**
   * Grades the attempt against the bank it was created with and returns the score. All correct
   * records the completion once; the first pass of a lesson or the practice is rewarded, a
   * chapter exam never is. A replay returns the stored result.
   */
  submit(userId: string, attemptId: string, input: SubmitRequest): Promise<SubmitResponse> {
    const content = this.content();
    return this.repository.transaction(async (store, tx) => {
      const attempt = await store.lockAttempt(userId, attemptId);
      if (!attempt) throw attemptNotFound();
      if (attempt.status === 'submitted') return this.storedResult(content, store, attempt);
      const item = pinnedItem(content, attempt);
      const total = attempt.question_ids.length;

      const issues = findInvalidAnswers(item.bank.questions, attempt.question_ids, input.answers);
      if (issues.length)
        throw new UnprocessableEntityException({
          code: 'INVALID_ANSWERS',
          message: `Cần trả lời đủ ${total} câu của lượt làm bài, mỗi câu một đáp án hợp lệ.`,
          details: issues,
        });

      const graded = gradeAnswers(item.bank.questions, attempt.question_ids, input.answers);
      const submitted = await store.markSubmitted(attempt.id, graded.score, graded.passed);
      // Status guard lost a race (only possible without the row lock): keep the first result.
      if (!submitted) {
        const current = await store.lockAttempt(userId, attemptId);
        if (!current) throw new Error('Academy attempt disappeared during submit');
        return this.storedResult(content, store, current);
      }
      await store.insertAnswers(
        graded.results.map((result) => ({
          attempt_id: attempt.id,
          question_id: result.question_id,
          option_id: result.option_id,
          correct: result.correct,
        })),
      );
      // The graded rows are the record now; the working draft is not kept.
      await store.deleteDraft(attempt.id);

      // All correct: the completion, its reward and the capability derivation share this transaction.
      if (graded.passed) {
        await store.lockUser(userId);
        const created = await store.insertCompletion({
          user_id: userId,
          lesson_key: item.lesson_key,
          catalog_version: content.catalog.catalog_version,
          lesson_id: item.id,
          completion_method: 'quiz',
          attempt_id: attempt.id,
          request_id: null,
          // The version of the lesson text the learner studied when the attempt was created.
          content_version: attempt.content_version,
          source: { score: graded.score, total, kind: attempt.kind },
        });
        if (created && attempt.kind === 'lesson' && item.kind !== 'chapter_exam')
          await this.creditReward(store, tx, created);
      }
      // The committed state is the response, so a replay returns exactly this.
      return this.storedResult(content, store, submitted);
    });
  }

  /** Calls the optional reward hook in the caller's transaction and keeps its outcome with the evidence. */
  private async creditReward(
    store: AcademyStore,
    tx: SqlClient,
    completion: CompletionRow,
  ): Promise<Exclude<RewardResult, null>> {
    let view: Exclude<RewardResult, null> = { status: 'unavailable' };
    if (this.rewards) {
      const result = await this.rewards.creditFirstCompletion(tx, {
        userId: completion.user_id,
        lessonKey: completion.lesson_key,
        lessonId: completion.lesson_id,
        catalogVersion: completion.catalog_version,
        completionMethod: 'quiz',
        completedAt: completion.completed_at.toISOString(),
      });
      view =
        result.status === 'credited'
          ? { status: 'credited', delta: result.delta, balance_after: result.balanceAfter }
          : { status: 'already_rewarded', balance_after: result.balanceAfter };
    }
    await store.attachReward(completion.user_id, completion.lesson_key, view);
    return view;
  }

  /**
   * The committed, score-only outcome of a submitted attempt, rebuilt from the stored rows. It
   * never completes, rewards or re-grades anything. Catalog first: an attempt of an older catalog
   * answers with its stored score without looking its lesson id up in the current content (old
   * ids name different lessons now).
   */
  private async storedResult(
    content: AcademyContent,
    store: AcademyStore,
    attempt: AttemptRow,
  ): Promise<SubmitResponse> {
    const current = attempt.catalog_version === content.catalog.catalog_version;
    const item = current && attempt.lesson_key ? content.itemsByKey.get(attempt.lesson_key) : null;
    if (current && (!item || item.id !== attempt.lesson_id)) throw lessonNotFound();
    const lessonKey = attempt.lesson_key;
    const [completions, stats] = await Promise.all([
      store.completions(attempt.user_id),
      lessonKey
        ? store.attemptStats(attempt.user_id, lessonKey, attempt.catalog_version)
        : Promise.resolve<AttemptStats>({ best_score: null, attempts_submitted: 0 }),
    ]);
    const completion = lessonKey
      ? (completions.find((row) => row.lesson_key === lessonKey) ?? null)
      : null;

    const score = attempt.score ?? 0;
    const passed = attempt.passed === true;
    const created = completion !== null && completion.attempt_id === attempt.id;
    const newlyGranted = created && item ? [...item.capabilities] : [];
    return {
      attempt_id: attempt.id,
      lesson_id: attempt.lesson_id,
      lesson_key: lessonKey ?? '',
      kind: attempt.kind,
      catalog_version: attempt.catalog_version,
      score,
      total: attempt.question_ids.length,
      passed,
      submitted_at: (attempt.submitted_at ?? attempt.created_at).toISOString(),
      best_score: Math.max(stats.best_score ?? score, score),
      attempts_submitted: Math.max(stats.attempts_submitted, 1),
      completion: {
        completed: completion !== null,
        newly_completed: created,
        completed_at: completion?.completed_at.toISOString() ?? null,
      },
      granted_capabilities: sortedCapabilities(content, completions),
      newly_granted: newlyGranted,
      unlocked_labels: passed && item?.unlock ? [item.unlock.label] : [],
      chapter_completed: item && passed && item.kind === 'chapter_exam' ? item.chapter : null,
      next_item_id: item && passed ? nextRequiredItemId(content.sequence, item.id) : null,
      progress_revision: completions.length,
      reward:
        created && completion && attempt.kind === 'lesson'
          ? rewardFromSource(completion.source)
          : null,
    };
  }

  /** Idempotent replay of a create: only the same item in the current catalog is replayed. */
  private replayAttempt(
    content: AcademyContent,
    attempt: AttemptRow,
    input: AttemptCreateRequest,
  ): AttemptResponse {
    if (
      attempt.catalog_version !== content.catalog.catalog_version ||
      attempt.lesson_id !== input.lesson_id
    )
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Khóa idempotency đã được dùng cho một bài học khác.',
      });
    return attemptView(pinnedItem(content, attempt), attempt);
  }
}

const scenarioHashes = new WeakMap<ScenarioBlock, string>();

/** `canonicalHash` of the scenario block (memoized per frozen block). */
function scenarioHash(scenario: ScenarioBlock): string {
  let hash = scenarioHashes.get(scenario);
  if (!hash) {
    hash = canonicalHash(scenario);
    scenarioHashes.set(scenario, hash);
  }
  return hash;
}

/** Catalog metadata of one item, field by field (an item also holds its private bank). */
export function catalogItemView(item: AcademyItem): CatalogItemResponse {
  return {
    id: item.id,
    kind: item.kind,
    lesson_key: item.lesson_key,
    chapter: item.chapter,
    order: item.order,
    position: item.position,
    name: item.name,
    optional: item.optional,
    question_count: item.question_count,
    unlock: item.unlock
      ? {
          kind: item.unlock.kind,
          id: item.unlock.id,
          label: item.unlock.label,
          capability_id: `${
            item.unlock.kind === 'technical'
              ? INDICATOR_CAPABILITY_PREFIX
              : METRIC_CAPABILITY_PREFIX
          }${item.unlock.id}`,
        }
      : null,
    has_scenario: item.has_scenario,
    intro: item.intro,
    content_version: item.lesson?.content_version ?? null,
  };
}

/** Progress of one learner: states from completions (any catalog), stats of the current catalog. */
export function buildProgress(
  content: AcademyContent,
  completions: readonly CompletionRow[],
  stats: ReadonlyMap<string, AttemptStats> = new Map(),
): ProgressResponse {
  const byKey = new Map(completions.map((row) => [row.lesson_key, row]));
  const states = itemStates(content.sequence, new Set(byKey.keys()));
  const passed = (id: string) => states.get(id) === 'passed';
  const items = content.sequence.map((entry) => {
    const row = byKey.get(entry.lesson_key);
    const method = row?.completion_method;
    return {
      id: entry.id,
      state: states.get(entry.id) ?? 'locked',
      completed_at: row?.completed_at.toISOString() ?? null,
      completion_method: method === 'quiz' || method === 'legacy_migration' ? method : null,
      best_score: stats.get(entry.lesson_key)?.best_score ?? null,
      attempts_submitted: stats.get(entry.lesson_key)?.attempts_submitted ?? 0,
    };
  });
  const chapters = content.catalog.chapters.flatMap((chapter) => {
    if (!chapter.published) return [];
    const lessons = chapter.items.filter((entry) => entry.kind === 'lesson');
    const exam = chapter.items.find((entry) => entry.kind === 'chapter_exam');
    return [
      {
        no: chapter.no,
        done: lessons.filter((entry) => passed(entry.id)).length,
        total: lessons.length,
        exam_passed: exam ? passed(exam.id) : false,
      },
    ];
  });
  return {
    catalog_version: content.catalog.catalog_version,
    progress_revision: completions.length,
    course_done: chapters.reduce((sum, chapter) => sum + chapter.done, 0),
    course_total: content.requiredTotal,
    current_item_id: currentItemId(content.sequence, states),
    items,
    chapters,
    granted_capabilities: sortedCapabilities(content, completions),
  };
}

/** The public projection of an attempt: stored order, no key, no bank version. */
function projection(
  item: AcademyItem,
  attempt: AttemptRow,
  questions: AttemptResponse['questions'],
): AttemptResponse {
  return {
    attempt_id: attempt.id,
    lesson_id: item.id,
    lesson_key: item.lesson_key,
    kind: attempt.kind,
    catalog_version: attempt.catalog_version,
    content_version: attempt.content_version,
    status: attempt.status,
    total: attempt.question_ids.length,
    questions,
  };
}

function attemptView(item: AcademyItem, attempt: AttemptRow): AttemptResponse {
  const views = attemptQuestionViews(
    item.bank.questions,
    attempt.question_ids,
    attempt.option_orders,
  );
  if (!views) throw assessmentMismatch();
  return projection(item, attempt, views);
}

/**
 * The saved selections as served: in the attempt's question order, only choices that are still
 * valid for the pinned bank. Carries nothing about correctness.
 */
function draftState(
  draft: DraftRow | null,
  questions: readonly BankQuestion[],
  questionIds: readonly string[],
): DraftState {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const answers = questionIds.flatMap((questionId) => {
    const optionId = draft?.selections[questionId];
    const valid =
      optionId !== undefined &&
      byId.get(questionId)?.options.some((option) => option.id === optionId) === true;
    return valid ? [{ question_id: questionId, option_id: optionId }] : [];
  });
  return {
    revision: draft?.revision ?? 0,
    answers,
    answered_count: answers.length,
    total: questionIds.length,
    updated_at: draft?.updated_at.toISOString() ?? null,
  };
}

/** Notes keys of a lesson with interactive blocks; 404 NOTES_NOT_AVAILABLE otherwise. */
function notesKeys(item: AcademyItem) {
  const keys = item.lesson ? interactiveKeysOf(item.lesson.file) : null;
  if (!keys || keys.texts.size + keys.checks.size + keys.scores.size === 0)
    throw new NotFoundException({
      code: 'NOTES_NOT_AVAILABLE',
      message: 'Bài này không có phần ghi chú để lưu.',
    });
  return keys;
}

function notesView(item: AcademyItem, row: PracticeNotesRow | null): NotesResponse {
  return {
    lesson_id: item.id,
    revision: row?.revision ?? 0,
    texts: row ? { ...row.texts } : {},
    checks: row ? { ...row.checks } : {},
    scores: row ? { ...row.scores } : {},
    updated_at: row?.updated_at.toISOString() ?? null,
  };
}

function notesTooLarge() {
  return new UnprocessableEntityException({
    code: 'NOTES_TOO_LARGE',
    message: 'Ghi chú quá dài. Hãy rút gọn bớt nội dung.',
  });
}

/** Reads back the reward outcome stored with the completion that created it. */
function rewardFromSource(source: Record<string, unknown>): RewardResult {
  const reward = source.reward as Record<string, unknown> | undefined;
  if (reward?.status === 'credited')
    return {
      status: 'credited',
      delta: Number(reward.delta),
      balance_after: Number(reward.balance_after),
    };
  if (reward?.status === 'already_rewarded')
    return { status: 'already_rewarded', balance_after: Number(reward.balance_after) };
  return { status: 'unavailable' };
}

function lessonNotFound() {
  return new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Không tìm thấy bài học.' });
}

function attemptNotFound() {
  return new NotFoundException({
    code: 'ATTEMPT_NOT_FOUND',
    message: 'Không tìm thấy lượt làm bài.',
  });
}

function assessmentMismatch() {
  return new ConflictException({
    code: 'ASSESSMENT_VERSION_MISMATCH',
    message: 'Bộ câu hỏi đã được cập nhật. Vui lòng bắt đầu lượt làm bài mới.',
  });
}

/** Published item by id; unknown and unpublished ids are 404 LESSON_NOT_FOUND. */
function requireItem(content: AcademyContent, itemId: string): AcademyItem {
  const item = content.items.get(itemId);
  if (!item) throw lessonNotFound();
  return item;
}

/** The item's state for this learner; 403 ACADEMY_ITEM_LOCKED when locked. */
function stateOf(
  content: AcademyContent,
  completions: readonly Pick<CompletionRow, 'lesson_key'>[],
  item: AcademyItem,
): ItemState {
  const state =
    itemStates(content.sequence, new Set(completions.map((row) => row.lesson_key))).get(item.id) ??
    'locked';
  if (state === 'locked')
    throw new ForbiddenException({
      code: 'ACADEMY_ITEM_LOCKED',
      message: 'Bài này chưa mở. Hãy hoàn thành các bài trước đó.',
    });
  return state;
}

/**
 * The item an open attempt was created against. Catalog first: an attempt of another catalog is
 * never graded (its lesson id may name a different lesson now). The bank must be the one the
 * attempt pinned; banks change only with a catalog bump, so there is no archive.
 */
function pinnedItem(content: AcademyContent, attempt: AttemptRow): AcademyItem {
  if (attempt.catalog_version !== content.catalog.catalog_version || attempt.lesson_key === null)
    throw new ConflictException({
      code: 'CATALOG_VERSION_MISMATCH',
      message: 'Lượt làm bài thuộc danh mục cũ. Vui lòng bắt đầu lượt làm bài mới.',
    });
  const item = content.itemsByKey.get(attempt.lesson_key);
  if (!item || item.id !== attempt.lesson_id) throw lessonNotFound();
  if (attempt.questions_version !== item.bank.version) throw assessmentMismatch();
  return item;
}

function assertCatalogVersion(current: string, requested: string): void {
  if (requested !== current)
    throw new ConflictException({
      code: 'CATALOG_VERSION_MISMATCH',
      message: 'Danh mục Học viện đã được cập nhật. Vui lòng tải lại trang.',
    });
}
