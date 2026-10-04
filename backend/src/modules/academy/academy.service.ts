import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { capabilityUnion } from './academy-grants.service.js';
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
} from './academy.repository.js';
import type {
  AttemptCreateInput,
  AttemptResponse,
  AttemptSubmitInput,
  CurriculumQuery,
  CurriculumResponse,
  LessonResponse,
  SubmitResponse,
} from './academy.schemas.js';

@Injectable()
export class AcademyService {
  private readonly content: () => AcademyContent = loadAcademyContent;

  constructor(@Inject(AcademyRepository) private readonly repository: AcademyStoreProvider) {}

  async curriculum(userId: string, query: CurriculumQuery): Promise<CurriculumResponse> {
    const content = this.content();
    if (query.content_version !== undefined) assertContentVersion(content, query.content_version);
    const store = this.repository.store();
    const [grants, stats] = await Promise.all([store.grants(userId), store.attemptStats(userId)]);
    const passed = new Set(grants.map((grant) => grant.lesson_id));
    const statsByLesson = new Map(stats.map((row) => [row.lesson_id, row]));
    return {
      content_version: content.content_version,
      chapters: content.chapters.map((chapter) => ({
        no: chapter.no,
        title: chapter.title,
        type: chapter.type,
        bot: chapter.bot,
        lessons: chapter.lessons.map((lesson) => ({
          id: lesson.id,
          order: lesson.order,
          name: lesson.name,
          kind: lesson.kind,
          config_id: lesson.config_id,
          passed: passed.has(lesson.id),
          best_score: statsByLesson.get(lesson.id)?.best_score ?? null,
          attempts: statsByLesson.get(lesson.id)?.attempts ?? 0,
          capabilities: [...lesson.capabilities],
        })),
      })),
      granted_capabilities: capabilityUnion(grants),
    };
  }

  async lesson(userId: string, lessonId: string): Promise<LessonResponse> {
    const lesson = requireLesson(this.content(), lessonId);
    const grant = await this.repository.store().grant(userId, lesson.id);
    return {
      id: lesson.id,
      chapter: lesson.chapter,
      order: lesson.order,
      name: lesson.name,
      kind: lesson.kind,
      content_version: lesson.content_version,
      config_id: lesson.config_id,
      sections: lesson.sections.map((section) => ({ title: section.title, html: section.html })),
      fixture: lesson.fixture,
      prerequisites: [...lesson.prerequisites],
      sources: [...lesson.sources],
      review_status: lesson.review_status,
      passed: grant !== null,
    };
  }

  async createAttempt(userId: string, input: AttemptCreateInput): Promise<AttemptResponse> {
    const content = this.content();
    const lesson = requireLesson(content, input.lesson_id);
    assertContentVersion(content, input.content_version);
    const store = this.repository.store();
    const existing = await store.attemptByIdempotencyKey(userId, input.idempotency_key);
    if (existing) return this.attemptView(content, existing, input);

    const questions = content.questionsByLesson.get(lesson.id) ?? [];
    const inserted = await store.insertAttempt({
      id: randomUUID(),
      user_id: userId,
      lesson_id: lesson.id,
      content_version: content.content_version,
      questions_version: content.questions_version,
      question_ids: questions.map((question) => question.id),
      option_orders: buildOptionOrders(questions),
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
    return this.repository.transaction(async (store) => {
      const attempt = await store.lockAttempt(userId, attemptId);
      if (!attempt)
        throw new NotFoundException({
          code: 'ATTEMPT_NOT_FOUND',
          message: 'Không tìm thấy lượt làm bài.',
        });
      if (attempt.status === 'submitted') return storedResult(content, store, attempt);
      if (attempt.questions_version !== content.questions_version)
        throw new ConflictException({
          code: 'QUESTIONS_VERSION_MISMATCH',
          message: 'Bộ câu hỏi đã được cập nhật. Vui lòng bắt đầu lượt làm bài mới.',
        });

      const questions = content.questionsByLesson.get(attempt.lesson_id) ?? [];
      const issues = findInvalidAnswers(questions, attempt.question_ids, input.answers);
      if (issues.length || attempt.question_ids.length !== QUESTIONS_PER_LESSON)
        throw new UnprocessableEntityException({
          code: 'INVALID_ANSWERS',
          message: `Cần trả lời đủ ${QUESTIONS_PER_LESSON} câu của lượt làm bài, mỗi câu một đáp án hợp lệ.`,
          issues,
        });

      const graded = gradeAnswers(questions, attempt.question_ids, input.answers);
      const submitted = await store.markSubmitted(attempt.id, graded.score, graded.passed);
      // Status guard lost a race (only possible without the row lock): keep the first result.
      if (!submitted) {
        const current = await store.lockAttempt(userId, attemptId);
        if (!current) throw new Error('Academy attempt disappeared during submit');
        return storedResult(content, store, current);
      }
      await store.insertAnswers(
        graded.results.map((result) => ({
          attempt_id: attempt.id,
          question_id: result.question_id,
          option_id: result.option_id,
          correct: result.correct,
        })),
      );

      let newlyGranted: string[] = [];
      if (graded.passed) {
        const lesson = requireLesson(content, attempt.lesson_id);
        const grant = await store.insertGrant({
          user_id: userId,
          lesson_id: lesson.id,
          capability_ids: [...lesson.capabilities],
          attempt_id: attempt.id,
          content_version: attempt.content_version,
        });
        newlyGranted = grant ? [...grant.capability_ids] : [];
      }
      return {
        attempt_id: attempt.id,
        score: graded.score,
        total: QUESTIONS_PER_LESSON,
        passed: graded.passed,
        results: graded.results,
        granted_capabilities: capabilityUnion(await store.grants(userId)),
        newly_granted: newlyGranted,
      };
    });
  }

  private attemptView(
    content: AcademyContent,
    attempt: AttemptRow,
    input: AttemptCreateInput,
  ): AttemptResponse {
    if (attempt.lesson_id !== input.lesson_id)
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Khóa idempotency đã được dùng cho một bài học khác.',
      });
    if (attempt.content_version !== content.content_version) throw contentVersionMismatch(content);
    const views =
      attempt.questions_version === content.questions_version
        ? attemptQuestionViews(
            content.questionsByLesson.get(attempt.lesson_id) ?? [],
            attempt.question_ids,
            attempt.option_orders,
          )
        : null;
    if (!views)
      throw new ConflictException({
        code: 'QUESTIONS_VERSION_MISMATCH',
        message: 'Bộ câu hỏi đã được cập nhật. Vui lòng bắt đầu lượt làm bài mới.',
      });
    return {
      attempt_id: attempt.id,
      lesson_id: attempt.lesson_id,
      content_version: attempt.content_version,
      questions_version: attempt.questions_version,
      questions: views,
    };
  }
}

function requireLesson(content: AcademyContent, lessonId: string): AcademyLesson {
  const lesson = content.lessons.get(lessonId);
  if (!lesson)
    throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Không tìm thấy bài học.' });
  return lesson;
}

function contentVersionMismatch(content: AcademyContent): ConflictException {
  return new ConflictException({
    code: 'CONTENT_VERSION_MISMATCH',
    message: 'Nội dung Học viện đã được cập nhật. Vui lòng tải lại trang.',
    content_version: content.content_version,
  });
}

function assertContentVersion(content: AcademyContent, requested: string): void {
  if (requested !== content.content_version) throw contentVersionMismatch(content);
}

/** Stored outcome of a submitted attempt; never grants again. */
async function storedResult(
  content: AcademyContent,
  store: AcademyStore,
  attempt: AttemptRow,
): Promise<SubmitResponse> {
  const [answers, grant, grants] = await Promise.all([
    store.answers(attempt.id),
    store.grant(attempt.user_id, attempt.lesson_id),
    store.grants(attempt.user_id),
  ]);
  const questions = new Map(
    (content.questionsByLesson.get(attempt.lesson_id) ?? []).map((question) => [
      question.id,
      question,
    ]),
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
        correct_option_id: question?.correct_option_id ?? (answer.correct ? answer.option_id : ''),
        explanation: question?.explanation ?? '',
      },
    ];
  });
  return {
    attempt_id: attempt.id,
    score: attempt.score ?? 0,
    total: QUESTIONS_PER_LESSON,
    passed: attempt.passed === true,
    results,
    granted_capabilities: capabilityUnion(grants),
    newly_granted: grant?.attempt_id === attempt.id ? [...grant.capability_ids] : [],
  };
}
