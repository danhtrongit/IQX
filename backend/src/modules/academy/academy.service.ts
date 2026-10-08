import { randomUUID } from 'node:crypto';

import {
  ConflictException,
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
import { capabilitiesFromCompletions } from './academy-grants.service.js';
import type { LessonAssessment } from './academy.banks.js';
import {
  loadAcademyContent,
  QUESTIONS_PER_LESSON,
  resolveAssessment,
  type AcademyContent,
  type AcademyLesson,
} from './academy.content.js';
import {
  attemptQuestionViews,
  buildAttemptOrder,
  buildReview,
  findInvalidAnswers,
  gradeAnswers,
  secureRandomInt,
  type GradedAnswer,
  type RandomInt,
} from './academy.grading.js';
import {
  AcademyRepository,
  type AcademyStore,
  type AcademyStoreProvider,
  type AttemptRow,
  type AttemptStats,
  type CompletionRow,
} from './academy.repository.js';
import type {
  AttemptCreateInput,
  AttemptResponse,
  AttemptSubmitInput,
  CatalogResponse,
  GuideCompleteInput,
  GuideCompleteResponse,
  LessonMeta,
  LessonResponse,
  ProgressResponse,
  RewardResult,
  SubmitResponse,
} from './academy.schemas.js';

type CompletionView = SubmitResponse['completion'];

@Injectable()
export class AcademyService implements OnModuleInit {
  protected readonly content: () => AcademyContent = loadAcademyContent;
  /** Source of the per-attempt question and option shuffles (overridden by seeded tests). */
  protected readonly random: RandomInt = secureRandomInt;

  constructor(
    @Inject(AcademyRepository) private readonly repository: AcademyStoreProvider,
    /** Learning-coin hook (Shop module); absent or failing hooks never change completion rules. */
    @Optional() @Inject(LESSON_REWARD_PORT) private readonly rewards?: LessonRewardPort,
  ) {}

  /** Content packages are validated at boot: a broken package stops the API, not a learner's request. */
  onModuleInit(): void {
    this.content();
  }

  /** Full 13-chapter / 71-lesson catalog metadata. Never carries answers or private banks. */
  catalog(): CatalogResponse {
    const content = this.content();
    return {
      catalog_version: content.catalog_version,
      chapter_count: content.chapters.length,
      lesson_count: content.lessons.size,
      chapters: content.chapters.map((chapter) => ({
        no: chapter.no,
        title: chapter.title,
        type: chapter.type,
        lessons: chapter.lessons.map(lessonMeta),
      })),
    };
  }

  /** `course_done` counts distinct completed lessons of this catalog; attempts and views never count. */
  async progress(userId: string): Promise<ProgressResponse> {
    const content = this.content();
    const completions = await this.repository.store().completions(userId);
    return buildProgress(content, completions);
  }

  /**
   * Typed sections (blocks), the chart models of the lesson's chart blocks, nav labels and
   * completion info. Never carries questions, answers or explanations.
   */
  async lesson(userId: string, lessonId: string): Promise<LessonResponse> {
    const content = this.content();
    const lesson = requireLesson(content, lessonId);
    const store = this.repository.store();
    const published = lesson.content_status === 'published' ? lesson.content : null;
    const [completion, stats] = await Promise.all([
      store.completion(userId, lesson.lesson_key),
      published && lesson.completion.mode === 'quiz'
        ? store.attemptStats(userId, lesson.lesson_key)
        : Promise.resolve<AttemptStats>({ best_score: null, attempts_submitted: 0 }),
    ]);
    return {
      ...lessonMeta(lesson),
      catalog_version: content.catalog_version,
      completed: completion !== null,
      completion_method: completion?.completion_method ?? null,
      completed_at: completion?.completed_at.toISOString() ?? null,
      reward:
        completion && 'reward' in completion.source ? rewardFromSource(completion.source) : null,
      best_score: stats.best_score,
      attempts_submitted: stats.attempts_submitted,
      title: published?.title ?? lesson.name,
      lead: published?.lead ?? null,
      nav_labels: published?.nav_labels ? [...published.nav_labels] : null,
      sections: published?.sections ?? [],
      charts: published?.charts ?? {},
      fixture: published?.fixture ?? null,
      sources: published?.sources ?? [],
      review_status: published?.review_status ?? null,
    };
  }

  /**
   * Starts an attempt: the lesson's 8 questions, shuffled once, with each question's options
   * shuffled once; both orders are stored on the attempt and never change. A retake is a new
   * attempt (new idempotency key) over the same 8 questions in a new order.
   */
  async createAttempt(userId: string, input: AttemptCreateInput): Promise<AttemptResponse> {
    const content = this.content();
    assertCatalogVersion(content, input.catalog_version);
    const lesson = requireLesson(content, input.lesson_id);
    if (lesson.completion.mode !== 'quiz') throw modeMismatch(lesson, 'quiz');
    const assessment = lesson.assessment;
    const published = lesson.content;
    if (lesson.content_status !== 'published' || !assessment || !published)
      throw notPublished(lesson);

    const store = this.repository.store();
    const existing = await store.attemptByIdempotencyKey(userId, input.idempotency_key);
    if (existing) return this.attemptView(content, existing, input);

    const order = buildAttemptOrder(assessment.questions, this.random);
    const inserted = await store.insertAttempt({
      id: randomUUID(),
      user_id: userId,
      lesson_id: lesson.id,
      lesson_key: lesson.lesson_key,
      catalog_version: content.catalog_version,
      content_version: published.content_version,
      questions_version: assessment.version,
      question_ids: order.question_ids,
      option_orders: order.option_orders,
      idempotency_key: input.idempotency_key,
    });
    // A concurrent request with the same key won the insert; return its attempt.
    const attempt =
      inserted ?? (await store.attemptByIdempotencyKey(userId, input.idempotency_key));
    if (!attempt) throw new Error('Academy attempt insert returned no row');
    return this.attemptView(content, attempt, input);
  }

  /**
   * Grades the attempt against the question bank it was created with (the lesson's current bank,
   * or the archived bank of that version) and returns the committed result with the review.
   */
  submit(userId: string, attemptId: string, input: AttemptSubmitInput): Promise<SubmitResponse> {
    const content = this.content();
    return this.repository.transaction(async (store, tx) => {
      const attempt = await store.lockAttempt(userId, attemptId);
      if (!attempt)
        throw new NotFoundException({
          code: 'ATTEMPT_NOT_FOUND',
          message: 'Không tìm thấy lượt làm bài.',
        });
      if (attempt.status === 'submitted') return this.storedResult(content, store, attempt);
      const { lesson, assessment } = pinnedAttempt(content, attempt);

      const issues = findInvalidAnswers(assessment.questions, attempt.question_ids, input.answers);
      if (issues.length || attempt.question_ids.length !== QUESTIONS_PER_LESSON)
        throw new UnprocessableEntityException({
          code: 'INVALID_ANSWERS',
          message: `Cần trả lời đủ ${QUESTIONS_PER_LESSON} câu của lượt làm bài, mỗi câu một đáp án hợp lệ.`,
          issues,
        });

      const graded = gradeAnswers(assessment.questions, attempt.question_ids, input.answers);
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

      // 8/8: the completion, its reward and the capability derivation share this transaction.
      if (graded.passed) {
        await store.lockUser(userId);
        const created = await store.insertCompletion({
          user_id: userId,
          lesson_key: lesson.lesson_key,
          catalog_version: content.catalog_version,
          lesson_id: lesson.id,
          completion_method: 'quiz',
          attempt_id: attempt.id,
          request_id: null,
          // The version of the lesson text the learner studied when the attempt was created.
          content_version: attempt.content_version,
          source: {
            score: graded.score,
            total: QUESTIONS_PER_LESSON,
            assessment_version: attempt.questions_version,
          },
        });
        if (created) await this.creditReward(store, tx, created, 'quiz');
      }
      // The committed state is the response, so a replay returns exactly this.
      return this.storedResult(content, store, submitted);
    });
  }

  /** Guide lessons only: records the acknowledgment; no quiz, score or capability involved. */
  async completeGuide(
    userId: string,
    lessonId: string,
    input: GuideCompleteInput,
  ): Promise<GuideCompleteResponse> {
    const content = this.content();
    assertCatalogVersion(content, input.catalog_version);
    const lesson = requireLesson(content, lessonId);
    if (lesson.completion.mode !== 'guide') throw modeMismatch(lesson, 'guide');
    const published = lesson.content;
    if (lesson.content_status !== 'published' || !published) throw notPublished(lesson);
    if (input.content_version !== published.content_version)
      throw new ConflictException({
        code: 'CONTENT_VERSION_MISMATCH',
        message: 'Nội dung bài học đã được cập nhật. Vui lòng tải lại trang.',
        content_version: published.content_version,
      });

    return this.repository.transaction(async (store, tx) => {
      await store.lockUser(userId);
      const replay = await store.completionByRequestId(userId, input.request_id);
      if (replay && replay.lesson_key !== lesson.lesson_key)
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'Mã yêu cầu đã được dùng cho một bài học khác.',
        });
      let completion = replay ?? (await store.completion(userId, lesson.lesson_key));
      let reward: RewardResult = null;
      if (!completion) {
        const created = await store.insertCompletion({
          user_id: userId,
          lesson_key: lesson.lesson_key,
          catalog_version: content.catalog_version,
          lesson_id: lesson.id,
          completion_method: 'guide',
          attempt_id: null,
          request_id: input.request_id,
          content_version: published.content_version,
          source: { acknowledgment: true },
        });
        if (!created) throw new Error('Academy completion insert returned no row');
        completion = created;
        reward = await this.creditReward(store, tx, created, 'guide');
      } else if (completion.request_id === input.request_id) {
        // Replay of the request that created it: same committed result, reward included.
        reward = rewardFromSource(completion.source);
      }
      const completions = await store.completions(userId);
      return {
        lesson_id: lesson.id,
        lesson_key: lesson.lesson_key,
        catalog_version: content.catalog_version,
        completion: completionView(completion, completion.request_id === input.request_id),
        granted_capabilities: capabilitiesFromCompletions(content, completions),
        progress_revision: completions.length,
        reward,
      };
    });
  }

  /** Calls the optional reward hook in the caller's transaction and keeps its outcome with the evidence. */
  private async creditReward(
    store: AcademyStore,
    tx: SqlClient,
    completion: CompletionRow,
    method: 'quiz' | 'guide',
  ): Promise<Exclude<RewardResult, null>> {
    let view: Exclude<RewardResult, null> = { status: 'unavailable' };
    if (this.rewards) {
      const result = await this.rewards.creditFirstCompletion(tx, {
        userId: completion.user_id,
        lessonKey: completion.lesson_key,
        lessonId: completion.lesson_id,
        catalogVersion: completion.catalog_version,
        completionMethod: method,
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
   * The committed outcome of a submitted attempt, rebuilt from the stored rows and the bank the
   * attempt was pinned to. It never completes, rewards or re-grades anything. An attempt of the
   * legacy 18-chapter catalog (or whose bank is gone) answers with its stored score and no review.
   */
  private async storedResult(
    content: AcademyContent,
    store: AcademyStore,
    attempt: AttemptRow,
  ): Promise<SubmitResponse> {
    // Attempts of the legacy catalog have no lesson key: they keep their stored score, no review.
    const lessonKey =
      attempt.catalog_version === content.catalog_version ? attempt.lesson_key : null;
    const lesson = lessonKey ? content.lessonsByKey.get(lessonKey) : undefined;
    if (lessonKey && (!lesson || lesson.id !== attempt.lesson_id))
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Không tìm thấy bài học.' });

    const [answers, completions, stats, completion] = await Promise.all([
      store.answers(attempt.id),
      store.completions(attempt.user_id),
      lesson
        ? store.attemptStats(attempt.user_id, lesson.lesson_key)
        : Promise.resolve<AttemptStats>({ best_score: null, attempts_submitted: 0 }),
      lesson ? store.completion(attempt.user_id, lesson.lesson_key) : Promise.resolve(null),
    ]);
    const assessment = lesson
      ? resolveAssessment(content, lesson, attempt.questions_version)
      : null;
    const graded = new Map(answers.map((answer) => [answer.question_id, answer]));
    const review = assessment
      ? buildReview(
          assessment.questions,
          attempt.question_ids,
          attempt.option_orders,
          attempt.question_ids.flatMap((questionId): GradedAnswer[] => {
            const answer = graded.get(questionId);
            return answer
              ? [
                  {
                    question_id: questionId,
                    option_id: answer.option_id,
                    correct: answer.correct,
                  },
                ]
              : [];
          }),
        )
      : null;

    const score = attempt.score ?? 0;
    const created = completion !== null && completion.attempt_id === attempt.id;
    return {
      attempt_id: attempt.id,
      lesson_id: attempt.lesson_id,
      lesson_key: lesson?.lesson_key ?? null,
      catalog_version: attempt.catalog_version,
      score,
      total: QUESTIONS_PER_LESSON,
      correct: score,
      wrong: QUESTIONS_PER_LESSON - score,
      passed: attempt.passed === true,
      submitted_at: attempt.submitted_at?.toISOString() ?? null,
      best_score: stats.best_score,
      attempts_submitted: stats.attempts_submitted,
      review_available: review !== null,
      results: review ?? [],
      completion: completionView(completion, created),
      granted_capabilities: capabilitiesFromCompletions(content, completions),
      newly_granted: created && lesson ? [...lesson.capabilities] : [],
      progress_revision: completions.length,
      reward: created && completion ? rewardFromSource(completion.source) : null,
    };
  }

  private attemptView(
    content: AcademyContent,
    attempt: AttemptRow,
    input: AttemptCreateInput,
  ): AttemptResponse {
    if (
      attempt.lesson_id !== input.lesson_id ||
      attempt.catalog_version !== content.catalog_version
    )
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Khóa idempotency đã được dùng cho một bài học khác.',
      });
    const { lesson, assessment } = pinnedAttempt(content, attempt);
    const views = attemptQuestionViews(
      assessment.questions,
      attempt.question_ids,
      attempt.option_orders,
    );
    if (!views)
      throw new ConflictException({
        code: 'ASSESSMENT_VERSION_MISMATCH',
        message: 'Bộ câu hỏi đã được cập nhật. Vui lòng bắt đầu lượt làm bài mới.',
      });
    return {
      attempt_id: attempt.id,
      lesson_id: lesson.id,
      lesson_key: lesson.lesson_key,
      catalog_version: attempt.catalog_version,
      content_version: attempt.content_version,
      assessment_version: attempt.questions_version,
      status: attempt.status,
      questions: views,
    };
  }
}

/** Catalog metadata of one lesson; carries no answers. */
export function lessonMeta(lesson: AcademyLesson): LessonMeta {
  const published = lesson.content_status === 'published';
  const ready = published && lesson.assessment !== null;
  return {
    id: lesson.id,
    lesson_key: lesson.lesson_key,
    chapter: lesson.chapter,
    order: lesson.order,
    name: lesson.name,
    kind: lesson.kind,
    completion: {
      mode: lesson.completion.mode,
      question_count: lesson.completion.mode === 'quiz' ? lesson.completion.question_count : null,
      required_correct:
        lesson.completion.mode === 'quiz' ? lesson.completion.required_correct : null,
      assessment_ready: ready,
      assessment_version: ready ? (lesson.assessment?.version ?? null) : null,
      button_label: published ? (lesson.content?.completion_button_label ?? null) : null,
    },
    capability_binding: lesson.capability_binding ? { ...lesson.capability_binding } : null,
    capability_id: lesson.capabilities[0] ?? null,
    content_status: lesson.content_status,
    content_version: published ? (lesson.content?.content_version ?? null) : null,
    legacy_lesson_ids: [...lesson.legacy_lesson_ids],
  };
}

/** Progress formula: distinct completions that map into the current catalog. */
export function buildProgress(
  content: AcademyContent,
  completions: readonly CompletionRow[],
): ProgressResponse {
  const done = new Map<string, CompletionRow>();
  for (const completion of completions)
    if (content.lessonsByKey.has(completion.lesson_key))
      done.set(completion.lesson_key, completion);
  const completed = content.chapters.flatMap((chapter) =>
    chapter.lessons.flatMap((lesson) => {
      const row = done.get(lesson.lesson_key);
      return row
        ? [
            {
              lesson_id: lesson.id,
              lesson_key: lesson.lesson_key,
              completion_method: row.completion_method,
              completed_at: row.completed_at.toISOString(),
            },
          ]
        : [];
    }),
  );
  return {
    catalog_version: content.catalog_version,
    completed,
    completed_lesson_ids: completed.map((item) => item.lesson_id),
    chapters: content.chapters.map((chapter) => ({
      no: chapter.no,
      total: chapter.lessons.length,
      done: chapter.lessons.filter((lesson) => done.has(lesson.lesson_key)).length,
    })),
    course_done: done.size,
    course_total: content.lessons.size,
    progress_revision: completions.length,
    granted_capabilities: capabilitiesFromCompletions(content, completions),
  };
}

function completionView(completion: CompletionRow | null, created: boolean): CompletionView {
  return {
    completed: completion !== null,
    completion_method: completion?.completion_method ?? null,
    completed_at: completion?.completed_at.toISOString() ?? null,
    newly_completed: completion !== null && created,
  };
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

function requireLesson(content: AcademyContent, lessonId: string): AcademyLesson {
  const lesson = content.lessons.get(lessonId);
  if (!lesson)
    throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Không tìm thấy bài học.' });
  return lesson;
}

/**
 * The lesson and question bank an open attempt was created against. An attempt of another
 * catalog (legacy) is never graded; an attempt of an older bank is graded with that bank (the
 * archived copy of its `questions_version`), never with the current one. Changed lesson text does
 * not matter: only the pinned questions do. An unknown version is refused, not guessed.
 */
function pinnedAttempt(
  content: AcademyContent,
  attempt: AttemptRow,
): { lesson: AcademyLesson; assessment: LessonAssessment } {
  if (attempt.catalog_version !== content.catalog_version || attempt.lesson_key === null)
    throw new ConflictException({
      code: 'CATALOG_VERSION_MISMATCH',
      message: 'Lượt làm bài thuộc danh mục cũ. Vui lòng bắt đầu lượt làm bài mới.',
      catalog_version: content.catalog_version,
    });
  const lesson = content.lessonsByKey.get(attempt.lesson_key);
  if (!lesson || lesson.id !== attempt.lesson_id)
    throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Không tìm thấy bài học.' });
  const assessment = resolveAssessment(content, lesson, attempt.questions_version);
  if (!assessment)
    throw new ConflictException({
      code: 'ASSESSMENT_VERSION_MISMATCH',
      message: 'Bộ câu hỏi đã được cập nhật. Vui lòng bắt đầu lượt làm bài mới.',
    });
  return { lesson, assessment };
}

function assertCatalogVersion(content: AcademyContent, requested: string): void {
  if (requested !== content.catalog_version)
    throw new ConflictException({
      code: 'CATALOG_VERSION_MISMATCH',
      message: 'Danh mục Học viện đã được cập nhật. Vui lòng tải lại trang.',
      catalog_version: content.catalog_version,
    });
}

function modeMismatch(lesson: AcademyLesson, requested: 'quiz' | 'guide') {
  return new UnprocessableEntityException({
    code: 'COMPLETION_MODE_MISMATCH',
    message:
      requested === 'quiz'
        ? 'Bài hướng dẫn hoàn thành bằng nút “Hoàn thành bài học”, không có bài kiểm tra.'
        : 'Bài này hoàn thành bằng bài kiểm tra 8/8, không thể xác nhận bằng nút.',
    lesson_id: lesson.id,
    completion_mode: lesson.completion.mode,
  });
}

function notPublished(lesson: AcademyLesson) {
  return new ConflictException({
    code: 'NOT_PUBLISHED',
    message: 'Nội dung bài học chưa được xuất bản.',
    lesson_id: lesson.id,
  });
}
