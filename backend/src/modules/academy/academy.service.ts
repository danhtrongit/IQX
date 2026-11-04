import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
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
import {
  buildAcademyProgram,
  displayIntro,
  displayName,
  fullConfigData,
  type AcademyProgram,
  type ProgramChapter,
} from './academy.config.js';
import { canonicalHash } from './academy.hash.js';
import { ACADEMY_CONFIG, type AcademyConfigPort } from './academy.ports.js';
import {
  AcademyRepository,
  type AcademyStore,
  type AcademyStoreProvider,
  type AttemptRow,
  type AttemptStats,
  type CompletionRow,
  type DraftRow,
  type LastOpenedRow,
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
  LinkResponse,
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
  nextRequiredItemId,
  NOTES_TOTAL_MAX_BYTES,
  scenarioOf,
  type BankQuestion,
  type ItemState,
  type ScenarioBlock,
} from './content/v4/schema.js';

/**
 * Học viện v4 (spec §3-§6): 12 chapters of lessons, a chapter exam per chapter and the optional
 * chapter 3 practice. Học viện v4.1 gives every learner a PROGRAM (`AcademyProgram`): the chapters of
 * the Academy config of his group, numbered again from 1, and the access mode of that config. `free`
 * opens every item (spec v4 §4.1); `sequential` is the v3.3 prefix rule over the learner's chain
 * (v4.1 §3.2). The program is resolved from the learner's group on every call (`ACADEMY_CONFIG`), so a
 * config edit or a change of group applies at once (§7); completions are never touched by it. Every
 * state is computed here from the learner's completions; quizzes are graded server-side against
 * private banks and only the score is ever returned (no answer key, no explanation, no review).
 */
@Injectable()
export class AcademyService implements OnModuleInit {
  private readonly logger = new Logger(AcademyService.name);
  protected readonly content: AcademyContentSource = loadAcademyContent;
  /** Source of the per-attempt question and option shuffles (overridden by seeded tests). */
  protected readonly random: RandomInt = secureRandomInt;

  constructor(
    @Inject(AcademyRepository) private readonly repository: AcademyStoreProvider,
    /** Learning-coin hook (Shop module); absent or failing hooks never change completion rules. */
    @Optional() @Inject(LESSON_REWARD_PORT) private readonly rewards?: LessonRewardPort,
    /**
     * Config of each learner (v4.1 §8.2). Without a provider everybody gets the rollout default (Học tự do, every
     * chapter). A failing lookup fails the request: it never falls back to another config.
     */
    @Optional() @Inject(ACADEMY_CONFIG) private readonly configs?: AcademyConfigPort,
  ) {}

  /** Content is validated at boot: broken content stops the API, not a learner's request. */
  onModuleInit(): void {
    this.content();
  }

  /**
   * The chapters of the learner's program, numbered again from 1 (`display_no`), with their items, the mode and N
   * (v4.1 §8.3), plus retired lesson names. Never carries a bank.
   */
  async catalog(userId: string): Promise<CatalogResponse> {
    const content = this.content();
    const program = await this.programOf(userId);
    return {
      catalog_version: content.catalog.catalog_version,
      mode: program.mode,
      required_total: program.requiredTotal,
      chapters: program.chapters.map((chapter) => ({
        chapter_id: chapter.chapter_id,
        display_no: chapter.display_no,
        title: chapter.title,
        audience: chapter.audience,
        lesson_count: chapter.lesson_count,
        items: chapter.items.map((item) => catalogItemView(item, chapter)),
      })),
      retired_lessons: retiredLessons(content, program),
    };
  }

  /**
   * Server-computed states of every item of the learner's chapters; `course_done` / `course_total` count passed /
   * all required lessons of those chapters only (x / N). The current item ("bài đang học") is the one the learner
   * opened last; `next_item_id` is where "Học tiếp" goes.
   */
  async progress(userId: string): Promise<ProgressResponse> {
    const content = this.content();
    const program = await this.programOf(userId);
    const store = this.repository.store();
    const [completions, stats, lastOpened] = await Promise.all([
      store.completions(userId),
      store.attemptStatsAll(userId, content.catalog.catalog_version),
      store.lastOpened(userId),
    ]);
    return buildProgress(content, program, completions, stats, lastOpened);
  }

  /**
   * Deep link (spec §6, v4.1 §4): the lesson of the learner's chapters that teaches a metric, by `metric_key`, else
   * by exact lesson title, else by a title starting with `name + " ·"`. `locked` is true when the learner's
   * sequential chain has not reached it (the front-end shows the lock frame, never the lesson). Never an error: when
   * nothing matches (the metric's chapter is not in the learner's config included) the answer is `found: false` with
   * the lesson the learner was last on, so the front-end opens that.
   */
  async link(userId: string, metric: string): Promise<LinkResponse> {
    const content = this.content();
    const program = await this.programOf(userId);
    const store = this.repository.store();
    const [completions, lastOpened] = await Promise.all([
      store.completions(userId),
      store.lastOpened(userId),
    ]);
    const states = program.states(new Set(completions.map((row) => row.lesson_key)));
    const hit = resolveMetricLink(content, program, metric);
    if (hit) {
      const chapter = program.chapterOf(hit.item.id);
      return {
        found: true,
        metric,
        lesson_id: hit.item.id,
        locked: states.get(hit.item.id) === 'locked',
        lesson_key: hit.item.lesson_key,
        metric_key: hit.item.metric_key,
        chapter_id: chapter?.chapter_id ?? null,
        chapter_display_no: chapter?.display_no ?? null,
        title: hit.item.name,
        matched_by: hit.matchedBy,
        url: itemUrl(hit.item.id),
      };
    }
    const current = currentOf(content, program, states, lastOpened);
    return {
      found: false,
      metric,
      lesson_id: current,
      locked: false,
      lesson_key: null,
      metric_key: null,
      chapter_id: null,
      chapter_display_no: null,
      title: null,
      matched_by: null,
      url: current ? itemUrl(current) : ITEMS_URL,
    };
  }

  /**
   * A lesson or practice (typed blocks, chart models, summary, scenario choice) or an exam intro, in the learner's
   * chapter numbering. 404 ACADEMY_ITEM_NOT_IN_PROGRAM when its chapter is not in his config; 403 ACADEMY_ITEM_LOCKED
   * only in `sequential` mode while an earlier required item is not passed (no content is returned then). Opening an
   * item remembers it as the learner's current lesson.
   */
  async lesson(userId: string, lessonId: string): Promise<ItemResponse> {
    const content = this.content();
    const item = requireItem(content, lessonId);
    const program = await this.programOf(userId);
    const chapter = requireInProgram(program, item);
    const store = this.repository.store();
    const completions = await store.completions(userId);
    const state = stateOf(program, completions, item);
    await this.rememberOpened(store, userId, content, item);
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
    const base = catalogItemView(item, chapter);
    if (!item.lesson)
      return {
        ...base,
        ...status,
        kind: 'chapter_exam',
        intro: base.intro ?? '',
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
    await this.assertOpen(userId, store, item);
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
    await this.assertOpen(userId, store, item);
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
    await this.assertOpen(userId, this.repository.store(), item);

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
    const program = await this.programOf(userId);

    const existing = await store.attemptByIdempotencyKey(userId, input.idempotency_key);
    if (existing) return this.replayAttempt(content, program, existing, input);

    const item = requireItem(content, input.lesson_id);
    await this.assertOpen(userId, store, item, program);
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
    return this.replayAttempt(content, program, winner, input);
  }

  /**
   * Resumes the learner's latest OPEN attempt of the item under the current catalog: the same
   * public projection as starting one plus the saved draft. `attempt` is null when there is
   * nothing to resume (none open, or its bank changed: the learner starts a new attempt).
   */
  async resumeAttempt(userId: string, lessonId: string): Promise<ResumeResponse> {
    const content = this.content();
    const item = requireItem(content, lessonId);
    requireInProgram(await this.programOf(userId), item);
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
  async saveDraft(
    userId: string,
    attemptId: string,
    input: DraftSaveRequest,
  ): Promise<DraftSaveResponse> {
    const content = this.content();
    // Resolved before the transaction: a lookup inside it would need a second pooled connection.
    const program = await this.programOf(userId);
    return this.repository.transaction(async (store) => {
      const attempt = await store.lockAttempt(userId, attemptId);
      if (!attempt) throw attemptNotFound();
      if (attempt.status !== 'open')
        throw new ConflictException({
          code: 'ATTEMPT_ALREADY_SUBMITTED',
          message: 'Lượt làm bài đã được nộp, không thể sửa lựa chọn.',
        });
      const item = pinnedItem(content, attempt);
      requireInProgram(program, item);

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
    requireInProgram(await this.programOf(userId), item);
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
   *
   * An attempt left open when the learner's config changes (v4.1 §7) is graded as usual while its chapter is still in
   * the learner's program, whatever the mode (an item that was open when the attempt started is not re-checked); when
   * the chapter was removed the submit is refused with 404 ACADEMY_ITEM_NOT_IN_PROGRAM and nothing is recorded.
   */
  async submit(userId: string, attemptId: string, input: SubmitRequest): Promise<SubmitResponse> {
    const content = this.content();
    // Resolved before the transaction: a lookup inside it would need a second pooled connection.
    const program = await this.programOf(userId);
    return this.repository.transaction(async (store, tx) => {
      const attempt = await store.lockAttempt(userId, attemptId);
      if (!attempt) throw attemptNotFound();
      if (attempt.status === 'submitted') return this.storedResult(content, program, store, attempt);
      const item = pinnedItem(content, attempt);
      requireInProgram(program, item);
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
        return this.storedResult(content, program, store, current);
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
      return this.storedResult(content, program, store, submitted);
    });
  }

  /**
   * The learner's program: the chapters and mode of the Academy config of his group (v4.1 §8.2), resolved now. A failing
   * lookup fails the request (there is no fallback config). Without a config provider: every chapter, `free`.
   */
  private async programOf(userId: string): Promise<AcademyProgram> {
    const content = this.content();
    const config = this.configs ? await this.configs.configOf(userId) : fullConfigData(content);
    return buildAcademyProgram(content, config);
  }

  /**
   * 404 ACADEMY_ITEM_NOT_IN_PROGRAM when the item's chapter is not in the learner's config; 403 ACADEMY_ITEM_LOCKED when
   * the item is locked for him. `free` mode never locks, so it reads no completions; `sequential` mode needs them.
   * Returns the program so a caller that needs it next does not resolve it twice.
   */
  private async assertOpen(
    userId: string,
    store: AcademyStore,
    item: AcademyItem,
    resolved?: AcademyProgram,
  ): Promise<AcademyProgram> {
    const program = resolved ?? (await this.programOf(userId));
    requireInProgram(program, item);
    if (program.mode === 'sequential') stateOf(program, await store.completions(userId), item);
    return program;
  }

  /**
   * Remembers the required item the learner opened (their "bài đang học", spec §4.1). Best effort:
   * a failed write never fails the page. The optional practice does not replace the current lesson.
   */
  private async rememberOpened(
    store: AcademyStore,
    userId: string,
    content: AcademyContent,
    item: AcademyItem,
  ): Promise<void> {
    if (item.optional) return;
    try {
      await store.recordOpened({
        user_id: userId,
        lesson_key: item.lesson_key,
        lesson_id: item.id,
        catalog_version: content.catalog.catalog_version,
      });
    } catch (error) {
      this.logger.warn(`could not record the opened item ${item.id}: ${String(error)}`);
    }
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
    program: AcademyProgram,
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
      // The numbers are the learner's: "Đã hoàn thành Chương c" counts his own chapters (v4.1 §2.2).
      chapter_completed:
        item && passed && item.kind === 'chapter_exam'
          ? (program.chapterOf(item.id)?.display_no ?? null)
          : null,
      next_item_id: item && passed ? nextRequiredItemId(program.sequence, item.id) : null,
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
    program: AcademyProgram,
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
    const item = pinnedItem(content, attempt);
    requireInProgram(program, item);
    return attemptView(item, attempt);
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

/** Front-end location of the Học viện tool; `/hoc-vien/<item id>` opens one item (the workspace redirect keeps the id). */
const ITEMS_URL = '/hoc-vien';
const itemUrl = (itemId: string) => `${ITEMS_URL}/${itemId}`;

/** Case-, accent-form- and whitespace-insensitive comparison key of a metric or lesson name. */
const nameKey = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Finds the lesson of a metric among the learner's own lessons (spec §6, v4.1 §4): `metric_key` first, then a lesson
 * title equal to the name, then a title that starts with `name + " ·"`. The dashboard metric lessons (chapters 8-12)
 * are searched before every other lesson, in the learner's chapter order. A lesson of a chapter that is not in the
 * learner's config never resolves.
 */
function resolveMetricLink(
  content: AcademyContent,
  program: AcademyProgram,
  metric: string,
): { item: AcademyItem; matchedBy: LinkResponse['matched_by'] } | null {
  const query = nameKey(metric);
  if (!query) return null;
  const byKey = content.itemsByMetricKey.get(query);
  if (byKey && program.chapterOf(byKey.id)) return { item: byKey, matchedBy: 'metric_key' };
  const lessons = program.chapters
    .flatMap((chapter) => chapter.items)
    .filter((item) => item.kind === 'lesson');
  const ordered = [
    ...lessons.filter((item) => item.metric_key !== null),
    ...lessons.filter((item) => item.metric_key === null),
  ];
  const exact = ordered.find((item) => nameKey(item.name) === query);
  if (exact) return { item: exact, matchedBy: 'title' };
  const prefixed = ordered.find((item) => nameKey(item.name).startsWith(`${query} ·`));
  return prefixed ? { item: prefixed, matchedBy: 'title_prefix' } : null;
}

/**
 * "Bài đang học": the item opened last (found by its durable lesson key, so a pick made under an older catalog still
 * resolves) while it is in the learner's chain and not locked, else the first required item still to pass.
 */
function currentOf(
  content: AcademyContent,
  program: AcademyProgram,
  states: ReadonlyMap<string, ItemState>,
  lastOpened: Pick<LastOpenedRow, 'lesson_key'> | null,
): string | null {
  const opened = lastOpened ? content.itemsByKey.get(lastOpened.lesson_key) : undefined;
  return currentItemId(program.sequence, states, opened?.id ?? null);
}

/**
 * Names the Shop ledger may need: keys that left the catalog, plus the lessons of chapters outside the learner's
 * program, which he may have passed before a config change (his history and coins stay, v4.1 §7). An exam of such a
 * chapter has no number for him, so it is named after its chapter.
 */
function retiredLessons(
  content: AcademyContent,
  program: AcademyProgram,
): CatalogResponse['retired_lessons'] {
  const names = new Map(content.retired);
  const inProgram = new Set(program.chapters.flatMap((chapter) => chapter.items.map((item) => item.id)));
  for (const item of content.items.values()) {
    if (inProgram.has(item.id) || names.has(item.lesson_key)) continue;
    names.set(item.lesson_key, item.kind === 'chapter_exam' ? `Bài thi · ${item.chapter_title}` : item.name);
  }
  return [...names].map(([lesson_key, name]) => ({ lesson_key, name }));
}

/**
 * Catalog metadata of one item in the learner's numbering, field by field (an item also holds its private bank). An
 * exam's name and intro are templates; the learner's chapter number fills them in (v4.1 §2.3).
 */
export function catalogItemView(
  item: AcademyItem,
  chapter: Pick<ProgramChapter, 'chapter_id' | 'display_no'>,
): CatalogItemResponse {
  return {
    id: item.id,
    kind: item.kind,
    lesson_key: item.lesson_key,
    chapter_id: chapter.chapter_id,
    chapter_display_no: chapter.display_no,
    order: item.order,
    position: item.position,
    name: displayName(item, chapter.display_no),
    optional: item.optional,
    question_count: item.question_count,
    metric_key: item.metric_key,
    has_scenario: item.has_scenario,
    intro: displayIntro(item, chapter.display_no),
    content_version: item.lesson?.content_version ?? null,
  };
}

/**
 * Progress of one learner over his program: states from completions (any catalog, so a completion of a chapter that is
 * not in the program counts nowhere), stats of the current catalog. `course_done` / `course_total` are x / N of the
 * program's chapters (v4.1 §2.4). `current_item_id` is the item opened last, else the first required item still to
 * pass; `next_item_id` ("Học tiếp") is always that first required item.
 */
export function buildProgress(
  content: AcademyContent,
  program: AcademyProgram,
  completions: readonly CompletionRow[],
  stats: ReadonlyMap<string, AttemptStats> = new Map(),
  lastOpened: Pick<LastOpenedRow, 'lesson_key'> | null = null,
): ProgressResponse {
  const byKey = new Map(completions.map((row) => [row.lesson_key, row]));
  const states = program.states(new Set(byKey.keys()));
  const passed = (id: string) => states.get(id) === 'passed';
  const items = program.sequence.map((entry) => {
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
  const chapters = program.chapters.map((chapter) => {
    const lessons = chapter.items.filter((entry) => entry.kind === 'lesson');
    const exam = chapter.items.find((entry) => entry.kind === 'chapter_exam');
    return {
      chapter_id: chapter.chapter_id,
      display_no: chapter.display_no,
      done: lessons.filter((entry) => passed(entry.id)).length,
      total: lessons.length,
      exam_passed: exam ? passed(exam.id) : false,
    };
  });
  return {
    catalog_version: content.catalog.catalog_version,
    progress_revision: completions.length,
    course_done: chapters.reduce((sum, chapter) => sum + chapter.done, 0),
    course_total: program.requiredTotal,
    current_item_id: currentOf(content, program, states, lastOpened),
    next_item_id: currentItemId(program.sequence, states),
    access_mode: program.mode,
    items,
    chapters,
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

/**
 * The chapter of the learner's program the item belongs to; 404 ACADEMY_ITEM_NOT_IN_PROGRAM when the item's chapter is
 * not in his Academy config (v4.1 §7, §8.3): such an item is as good as unknown to him.
 */
function requireInProgram(program: AcademyProgram, item: AcademyItem): ProgramChapter {
  const chapter = program.chapterOf(item.id);
  if (!chapter)
    throw new NotFoundException({
      code: 'ACADEMY_ITEM_NOT_IN_PROGRAM',
      message: 'Bài này không còn trong chương trình học của bạn.',
    });
  return chapter;
}

/**
 * The item's state for this learner under his program's mode; 403 ACADEMY_ITEM_LOCKED when locked (only possible in
 * `sequential` mode: `free` never locks). The item must be in the program already (`requireInProgram`).
 */
function stateOf(
  program: AcademyProgram,
  completions: readonly Pick<CompletionRow, 'lesson_key'>[],
  item: AcademyItem,
): ItemState {
  const state =
    program.states(new Set(completions.map((row) => row.lesson_key))).get(item.id) ?? 'locked';
  if (state === 'locked')
    throw new ForbiddenException({
      code: 'ACADEMY_ITEM_LOCKED',
      message: 'Học lần lượt để mở bài này.',
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
