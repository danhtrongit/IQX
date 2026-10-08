import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { SqlClient } from '../../platform/database/index.js';
import {
  LESSON_REWARD_PORT,
  type LessonRewardPort,
} from '../../platform/ports/lesson-reward.port.js';
import { capabilitiesFromCompletions } from './academy-grants.service.js';
import {
  loadAcademyContent,
  QUESTIONS_PER_LESSON,
  type AcademyContent,
  type AcademyLesson,
} from './academy.content.js';
import {
  attemptQuestionViews,
  buildOptionOrders,
  findInvalidAnswers,
  gradeAnswers,
  type GradedAnswer,
} from './academy.grading.js';
import {
  AcademyRepository,
  type AcademyStore,
  type AcademyStoreProvider,
  type AttemptRow,
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
export class AcademyService {
  protected readonly content: () => AcademyContent = loadAcademyContent;

  constructor(
    @Inject(AcademyRepository) private readonly repository: AcademyStoreProvider,
    /** Learning-coin hook (Shop module); absent or failing hooks never change completion rules. */
    @Optional() @Inject(LESSON_REWARD_PORT) private readonly rewards?: LessonRewardPort,
  ) {}

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

  async lesson(userId: string, lessonId: string): Promise<LessonResponse> {
    const content = this.content();
    const lesson = requireLesson(content, lessonId);
    const completion = await this.repository.store().completion(userId, lesson.lesson_key);
    const published = lesson.content_status === 'published' ? lesson.content : null;
    return {
      ...lessonMeta(lesson),
      catalog_version: content.catalog_version,
      completed: completion !== null,
      completion_method: completion?.completion_method ?? null,
      completed_at: completion?.completed_at.toISOString() ?? null,
      sections: published?.sections.map((section) => structuredClone(section)) ?? [],
      assets: published?.assets.map((asset) => ({ ...asset })) ?? [],
      fixture: published?.fixture ?? null,
      sources: published ? [...published.sources] : [],
      review_status: published?.review_status ?? null,
    };
  }

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

    const inserted = await store.insertAttempt({
      id: randomUUID(),
      user_id: userId,
      lesson_id: lesson.id,
      lesson_key: lesson.lesson_key,
      catalog_version: content.catalog_version,
      content_version: published.content_version,
      questions_version: assessment.version,
      question_ids: assessment.questions.map((question) => question.id),
      option_orders: buildOptionOrders(assessment.questions),
      idempotency_key: input.idempotency_key,
    });
    // A concurrent request with the same key won the insert; return its attempt.
    const attempt =
      inserted ?? (await store.attemptByIdempotencyKey(userId, input.idempotency_key));
    if (!attempt) throw new Error('Academy attempt insert returned no row');
    return this.attemptView(content, attempt, input);
  }

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
      const lesson = pinnedLesson(content, attempt);
      const assessment = lesson.assessment;
      if (!assessment) throw notPublished(lesson);

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
      let created: CompletionRow | null = null;
      let reward: RewardResult = null;
      if (graded.passed) {
        await store.lockUser(userId);
        created = await store.insertCompletion({
          user_id: userId,
          lesson_key: lesson.lesson_key,
          catalog_version: content.catalog_version,
          lesson_id: lesson.id,
          completion_method: 'quiz',
          attempt_id: attempt.id,
          request_id: null,
          content_version: attempt.content_version,
          source: {
            score: graded.score,
            total: QUESTIONS_PER_LESSON,
            assessment_version: attempt.questions_version,
          },
        });
        if (created) reward = await this.creditReward(store, tx, created, 'quiz');
      }
      return this.submitResult(content, store, attempt, lesson, {
        score: graded.score,
        passed: graded.passed,
        results: graded.results,
        created,
        reward,
      });
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

  private async submitResult(
    content: AcademyContent,
    store: AcademyStore,
    attempt: AttemptRow,
    lesson: AcademyLesson,
    outcome: {
      score: number;
      passed: boolean;
      results: GradedAnswer[];
      created: CompletionRow | null;
      reward: RewardResult;
    },
  ): Promise<SubmitResponse> {
    const [existing, completions] = await Promise.all([
      outcome.created ?? store.completion(attempt.user_id, lesson.lesson_key),
      store.completions(attempt.user_id),
    ]);
    return {
      attempt_id: attempt.id,
      lesson_id: lesson.id,
      lesson_key: lesson.lesson_key,
      score: outcome.score,
      total: QUESTIONS_PER_LESSON,
      passed: outcome.passed,
      results: outcome.results,
      completion: completionView(existing, existing !== null && existing.attempt_id === attempt.id),
      granted_capabilities: capabilitiesFromCompletions(content, completions),
      newly_granted: outcome.created ? [...lesson.capabilities] : [],
      progress_revision: completions.length,
      reward: outcome.reward,
    };
  }

  /** Stored outcome of a submitted attempt; never completes or rewards again. */
  private async storedResult(
    content: AcademyContent,
    store: AcademyStore,
    attempt: AttemptRow,
  ): Promise<SubmitResponse> {
    const lesson = pinnedLesson(content, attempt, { submitted: true });
    const answers = await store.answers(attempt.id);
    const completion = await store.completion(attempt.user_id, lesson.lesson_key);
    const questions = new Map(
      (lesson.assessment?.questions ?? []).map((question) => [question.id, question]),
    );
    const byQuestion = new Map(answers.map((answer) => [answer.question_id, answer]));
    const results = attempt.question_ids.flatMap((questionId): GradedAnswer[] => {
      const answer = byQuestion.get(questionId);
      if (!answer) return [];
      const question = questions.get(questionId);
      return [
        {
          question_id: questionId,
          option_id: answer.option_id,
          correct: answer.correct,
          correct_option_id:
            question?.correct_option_id ?? (answer.correct ? answer.option_id : ''),
          explanation: question?.explanation ?? '',
        },
      ];
    });
    const completions = await store.completions(attempt.user_id);
    const created = completion !== null && completion.attempt_id === attempt.id;
    return {
      attempt_id: attempt.id,
      lesson_id: lesson.id,
      lesson_key: lesson.lesson_key,
      score: attempt.score ?? 0,
      total: QUESTIONS_PER_LESSON,
      passed: attempt.passed === true,
      results,
      completion: completionView(completion, created),
      granted_capabilities: capabilitiesFromCompletions(content, completions),
      newly_granted: created ? [...lesson.capabilities] : [],
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
    const lesson = pinnedLesson(content, attempt);
    const views = attemptQuestionViews(
      lesson.assessment?.questions ?? [],
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
 * The lesson an attempt was pinned to. An attempt of another catalog (legacy), an unknown lesson
 * or a changed content/assessment version is never graded against the current bank.
 */
function pinnedLesson(
  content: AcademyContent,
  attempt: AttemptRow,
  options: { submitted?: boolean } = {},
): AcademyLesson {
  if (attempt.catalog_version !== content.catalog_version || attempt.lesson_key === null)
    throw new ConflictException({
      code: 'CATALOG_VERSION_MISMATCH',
      message: 'Lượt làm bài thuộc danh mục cũ. Vui lòng bắt đầu lượt làm bài mới.',
      catalog_version: content.catalog_version,
    });
  const lesson = content.lessonsByKey.get(attempt.lesson_key);
  if (!lesson || lesson.id !== attempt.lesson_id)
    throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Không tìm thấy bài học.' });
  if (options.submitted) return lesson;
  if (
    !lesson.content ||
    !lesson.assessment ||
    attempt.content_version !== lesson.content.content_version
  )
    throw new ConflictException({
      code: 'CONTENT_VERSION_MISMATCH',
      message: 'Nội dung Học viện đã được cập nhật. Vui lòng bắt đầu lượt làm bài mới.',
    });
  if (attempt.questions_version !== lesson.assessment.version)
    throw new ConflictException({
      code: 'ASSESSMENT_VERSION_MISMATCH',
      message: 'Bộ câu hỏi đã được cập nhật. Vui lòng bắt đầu lượt làm bài mới.',
    });
  return lesson;
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
