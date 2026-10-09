import { z } from 'zod';

import { lessonBlockSchema } from './academy.blocks.js';
import { chartModelSchema } from './content/packages/package.schema.js';

export const lessonIdParamSchema = z.string().regex(/^ch\d{2}-l\d{2}$/);
export const attemptIdParamSchema = z.uuid();

const catalogVersionSchema = z.string().min(1).max(64);

export const attemptCreateSchema = z.strictObject({
  lesson_id: lessonIdParamSchema,
  catalog_version: catalogVersionSchema,
  idempotency_key: z.string().min(8).max(128),
});
export type AttemptCreateInput = z.infer<typeof attemptCreateSchema>;

export const attemptSubmitSchema = z.object({
  // Exact-8/unique/ownership checks run in the service so they surface as INVALID_ANSWERS.
  // Client score/pass/grant fields are ignored: the server grades from the pinned attempt.
  answers: z
    .array(
      z.object({
        question_id: z.string().min(1).max(64),
        option_id: z.string().min(1).max(64),
      }),
    )
    .max(64),
  idempotency_key: z.string().min(8).max(128).optional(),
});
export type AttemptSubmitInput = z.infer<typeof attemptSubmitSchema>;

/**
 * Draft selections of an open attempt (partial allowed, merged into the stored draft). Ownership,
 * openness and id validity run in the service; nothing here grades or reveals correctness.
 */
export const draftSaveSchema = z.object({
  answers: z
    .array(
      z.object({
        question_id: z.string().min(1).max(64),
        option_id: z.string().min(1).max(64),
      }),
    )
    .max(64),
  /** Optimistic guard: the draft revision the client last saw (0 = nothing saved yet). */
  expected_revision: z.number().int().min(0).max(2_147_483_647).optional(),
});
export type DraftSaveInput = z.infer<typeof draftSaveSchema>;

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
export type HistoryQuery = z.output<typeof historyQuerySchema>;

/** Acknowledgment of a guide lesson; carries no score, pass flag or capability. */
export const guideCompleteSchema = z.strictObject({
  catalog_version: catalogVersionSchema,
  content_version: z.string().min(1).max(32),
  request_id: z.string().min(8).max(128),
});
export type GuideCompleteInput = z.infer<typeof guideCompleteSchema>;

const lessonKindSchema = z.enum(['technical', 'fundamental', 'concept', 'guide']);
const contentStatusSchema = z.enum(['published', 'not_published']);
const completionMethodSchema = z.enum(['quiz', 'guide', 'legacy_migration']);

const capabilityBindingSchema = z
  .object({ kind: z.enum(['technical', 'fundamental']), id: z.string() })
  .nullable();

const completionInfoSchema = z.object({
  mode: z.enum(['quiz', 'guide']),
  question_count: z.number().int().nullable(),
  required_correct: z.number().int().nullable(),
  /** Quiz lessons only: the lesson is published and has its 8-question bank. */
  assessment_ready: z.boolean(),
  /** Pinned by attempts; null until the bank is published. */
  assessment_version: z.string().nullable(),
  /** Guide lessons: label of the completion button ("Hoàn thành bài học"); null for quizzes. */
  button_label: z.string().nullable(),
});

/** Catalog metadata of one lesson. Never carries answers. */
export const lessonMetaSchema = z.object({
  id: z.string(),
  lesson_key: z.string(),
  chapter: z.number().int(),
  order: z.number().int(),
  name: z.string(),
  kind: lessonKindSchema,
  completion: completionInfoSchema,
  capability_binding: capabilityBindingSchema,
  /** `indicator:<id>` / `metric:<id>` opened by completing it; null for concept and guides. */
  capability_id: z.string().nullable(),
  content_status: contentStatusSchema,
  content_version: z.string().nullable(),
  /** Ids this lesson had in the legacy 18-chapter catalog (for legacy links); empty when none. */
  legacy_lesson_ids: z.array(z.string()),
});
export type LessonMeta = z.infer<typeof lessonMetaSchema>;

export const catalogResponseSchema = z.object({
  catalog_version: z.string(),
  chapter_count: z.number().int(),
  lesson_count: z.number().int(),
  chapters: z.array(
    z.object({
      no: z.number().int(),
      title: z.string(),
      type: z.enum(['technical', 'fundamental', 'tool']),
      lessons: z.array(lessonMetaSchema),
    }),
  ),
});
export type CatalogResponse = z.infer<typeof catalogResponseSchema>;

export const progressResponseSchema = z.object({
  catalog_version: z.string(),
  /** Distinct completed lessons of the current catalog (course_done = their count). */
  completed: z.array(
    z.object({
      lesson_id: z.string(),
      lesson_key: z.string(),
      completion_method: completionMethodSchema,
      completed_at: z.string(),
    }),
  ),
  completed_lesson_ids: z.array(z.string()),
  chapters: z.array(
    z.object({ no: z.number().int(), done: z.number().int(), total: z.number().int() }),
  ),
  course_done: z.number().int(),
  course_total: z.number().int(),
  /** Monotonic: the number of completion rows; changes exactly when progress changes. */
  progress_revision: z.number().int(),
  /** Capability ids opened by completed lessons (`indicator:<id>`, `metric:<id>`). */
  granted_capabilities: z.array(z.string()),
});
export type ProgressResponse = z.infer<typeof progressResponseSchema>;

/** Outcome of the learning-coin hook of the completion that created this result, if any. */
export const rewardResultSchema = z
  .discriminatedUnion('status', [
    z.object({
      status: z.literal('credited'),
      delta: z.number().int(),
      balance_after: z.number().int(),
    }),
    z.object({ status: z.literal('already_rewarded'), balance_after: z.number().int() }),
    z.object({ status: z.literal('unavailable') }),
  ])
  .nullable();
export type RewardResult = z.infer<typeof rewardResultSchema>;

export const lessonResponseSchema = lessonMetaSchema.extend({
  catalog_version: z.string(),
  /** Reading never completes a lesson. */
  completed: z.boolean(),
  completion_method: completionMethodSchema.nullable(),
  completed_at: z.string().nullable(),
  /**
   * Coin outcome stored with the completion ("Đã nhận 100 xu" on re-read; `unavailable` = still
   * updating). null when not completed or when the completion carries no reward record.
   */
  reward: rewardResultSchema,
  /** Best score over the owner's submitted attempts (only ever grows); null without a submission. */
  best_score: z.number().int().nullable(),
  /** Submitted attempts of the owner for this lesson (quiz lessons; 0 for guides). */
  attempts_submitted: z.number().int(),
  /** Reader heading: the package title, or the catalog name for chapters without a package. */
  title: z.string(),
  lead: z.string().nullable(),
  /** Labels of the four section tabs (s1..s4); null for chapters without a package. */
  nav_labels: z.array(z.string()).length(4).nullable(),
  /** Empty when `content_status` is `not_published`. */
  sections: z.array(
    z.object({ id: z.string(), title: z.string(), blocks: z.array(lessonBlockSchema) }),
  ),
  /** Chart models of this lesson's chart blocks, keyed by `chart_id`. */
  charts: z.record(z.string(), chartModelSchema),
  fixture: z.record(z.string(), z.unknown()).nullable(),
  sources: z.array(z.string()),
  review_status: z.string().nullable(),
});
export type LessonResponse = z.infer<typeof lessonResponseSchema>;

/** Figure of a question: a chart model carried inline, or a small table. */
export const questionFigureSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('chart'), chart_id: z.string(), chart: chartModelSchema }),
  z.object({
    type: z.literal('table'),
    head: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
]);

const questionContentShape = {
  topic: z.string().nullable(),
  /** Lesson section (1-4) the question revises; null for chapters without a package. */
  section: z.number().int().min(1).max(4).nullable(),
  prompt: z.string(),
  /** Public hint (e.g. the formula to use); null when the question has none. */
  hint: z.string().nullable(),
  figure: questionFigureSchema.nullable(),
};

export const attemptResponseSchema = z.object({
  attempt_id: z.string(),
  lesson_id: z.string(),
  lesson_key: z.string(),
  catalog_version: z.string(),
  content_version: z.string(),
  assessment_version: z.string(),
  /** `submitted` when the key replays an attempt that was already graded: ask submit for the result. */
  status: z.enum(['open', 'submitted']),
  /** The 8 questions in this attempt's own (stored, stable) order; options likewise. */
  questions: z.array(
    z.object({
      id: z.string(),
      ...questionContentShape,
      options: z.array(z.object({ id: z.string(), text: z.string() })),
    }),
  ),
});
export type AttemptResponse = z.infer<typeof attemptResponseSchema>;

const draftAnswerSchema = z.object({ question_id: z.string(), option_id: z.string() });

/** The saved selections of an open attempt. Carries no correctness, score or key. */
export const draftStateSchema = z.object({
  /** Number of saves (0 = nothing saved yet). Send it back as `expected_revision`. */
  revision: z.number().int(),
  /** Saved choices in the attempt's question order; only questions that have one. */
  answers: z.array(draftAnswerSchema),
  answered_count: z.number().int(),
  total: z.literal(8),
  updated_at: z.string().nullable(),
});
export type DraftState = z.infer<typeof draftStateSchema>;

export const draftSaveResponseSchema = draftStateSchema.extend({ attempt_id: z.string() });
export type DraftSaveResponse = z.infer<typeof draftSaveResponseSchema>;

/**
 * The learner's latest open attempt of a lesson, resumable after a reload: the same public
 * projection as starting an attempt (questions and options in the stored order, no key) plus the
 * saved selections. `attempt` is null when there is nothing to resume.
 */
export const attemptResumeResponseSchema = z.object({
  lesson_id: z.string(),
  lesson_key: z.string(),
  catalog_version: z.string(),
  attempt: attemptResponseSchema
    .extend({ created_at: z.string(), draft: draftStateSchema })
    .nullable(),
});
export type AttemptResumeResponse = z.infer<typeof attemptResumeResponseSchema>;

const completionResultSchema = z.object({
  /** The lesson is completed after this call (a failed quiz attempt on a new lesson: false). */
  completed: z.boolean(),
  completion_method: completionMethodSchema.nullable(),
  completed_at: z.string().nullable(),
  /** true only for the call that created the completion. */
  newly_completed: z.boolean(),
});

const reviewOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** The learner chose this option. */
  chosen: z.boolean(),
  /** This option is the right answer. */
  correct: z.boolean(),
  /** Why this option is right or wrong (chapters 1 and 3); null for the other chapters. */
  explanation: z.string().nullable(),
});

/** One question of a submitted attempt, in the attempt's order, with the key and explanations. */
const reviewItemSchema = z.object({
  question_id: z.string(),
  ...questionContentShape,
  /** The option the learner chose. */
  option_id: z.string(),
  correct: z.boolean(),
  correct_option_id: z.string(),
  /** One explanation for the whole question (chapters 5-13); null where options carry theirs. */
  explanation: z.string().nullable(),
  /** In the order the learner saw, so letters A-D match the attempt. */
  options: z.array(reviewOptionSchema),
});

export const submitResponseSchema = z.object({
  attempt_id: z.string(),
  lesson_id: z.string(),
  /** null only for an attempt of the legacy 18-chapter catalog (read-only history). */
  lesson_key: z.string().nullable(),
  catalog_version: z.string(),
  score: z.number().int(),
  total: z.literal(8),
  correct: z.number().int(),
  wrong: z.number().int(),
  passed: z.boolean(),
  submitted_at: z.string().nullable(),
  /** Best score over the owner's submitted attempts of this lesson; never lowered by a retake. */
  best_score: z.number().int().nullable(),
  attempts_submitted: z.number().int(),
  /** false when the pinned question bank is no longer available (legacy history): `results` is empty. */
  review_available: z.boolean(),
  results: z.array(reviewItemSchema),
  completion: completionResultSchema,
  granted_capabilities: z.array(z.string()),
  newly_granted: z.array(z.string()),
  progress_revision: z.number().int(),
  /** null unless this submission created the completion. */
  reward: rewardResultSchema,
});
export type SubmitResponse = z.infer<typeof submitResponseSchema>;

/** One submitted attempt in the learner's history of a lesson. */
export const attemptHistoryItemSchema = z.object({
  attempt_id: z.string(),
  submitted_at: z.string(),
  score: z.number().int(),
  total: z.literal(8),
  passed: z.boolean(),
  /** `GET attempts/:attemptId` returns the review; false when the pinned bank is gone. */
  review_available: z.boolean(),
});

export const attemptHistoryResponseSchema = z.object({
  lesson_id: z.string(),
  lesson_key: z.string(),
  catalog_version: z.string(),
  /** Newest submission first. */
  items: z.array(attemptHistoryItemSchema),
  /** All submitted attempts of the owner for this lesson. */
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  /** Offset of the next page; null on the last page. */
  next_offset: z.number().int().nullable(),
});
export type AttemptHistoryResponse = z.infer<typeof attemptHistoryResponseSchema>;

export const guideCompleteResponseSchema = z.object({
  lesson_id: z.string(),
  lesson_key: z.string(),
  catalog_version: z.string(),
  completion: completionResultSchema,
  granted_capabilities: z.array(z.string()),
  progress_revision: z.number().int(),
  reward: rewardResultSchema,
});
export type GuideCompleteResponse = z.infer<typeof guideCompleteResponseSchema>;
