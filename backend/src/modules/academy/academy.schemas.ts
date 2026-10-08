import { z } from 'zod';

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

const sectionBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('html'), html: z.string() }),
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('formula'), expression: z.string(), caption: z.string().optional() }),
  z.object({
    type: z.literal('table'),
    caption: z.string().optional(),
    header: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    note: z.string().optional(),
  }),
  z.object({ type: z.literal('chart'), chart_id: z.string(), caption: z.string().optional() }),
  z.object({
    type: z.literal('image'),
    asset_id: z.string(),
    alt: z.string(),
    caption: z.string().optional(),
  }),
]);

export const lessonResponseSchema = lessonMetaSchema.extend({
  catalog_version: z.string(),
  /** Reading never completes a lesson. */
  completed: z.boolean(),
  completion_method: completionMethodSchema.nullable(),
  completed_at: z.string().nullable(),
  /** Empty when `content_status` is `not_published`. */
  sections: z.array(
    z.object({ id: z.string(), title: z.string(), blocks: z.array(sectionBlockSchema) }),
  ),
  assets: z.array(z.object({ id: z.string(), kind: z.enum(['image', 'chart']), ref: z.string() })),
  fixture: z.record(z.string(), z.unknown()).nullable(),
  sources: z.array(z.string()),
  review_status: z.string().nullable(),
});
export type LessonResponse = z.infer<typeof lessonResponseSchema>;

export const attemptResponseSchema = z.object({
  attempt_id: z.string(),
  lesson_id: z.string(),
  lesson_key: z.string(),
  catalog_version: z.string(),
  content_version: z.string(),
  assessment_version: z.string(),
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      options: z.array(z.object({ id: z.string(), text: z.string() })),
    }),
  ),
});
export type AttemptResponse = z.infer<typeof attemptResponseSchema>;

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

const completionResultSchema = z.object({
  /** The lesson is completed after this call (a failed quiz attempt on a new lesson: false). */
  completed: z.boolean(),
  completion_method: completionMethodSchema.nullable(),
  completed_at: z.string().nullable(),
  /** true only for the call that created the completion. */
  newly_completed: z.boolean(),
});

export const submitResponseSchema = z.object({
  attempt_id: z.string(),
  lesson_id: z.string(),
  lesson_key: z.string(),
  score: z.number().int(),
  total: z.literal(8),
  passed: z.boolean(),
  results: z.array(
    z.object({
      question_id: z.string(),
      option_id: z.string(),
      correct: z.boolean(),
      correct_option_id: z.string(),
      explanation: z.string(),
    }),
  ),
  completion: completionResultSchema,
  granted_capabilities: z.array(z.string()),
  newly_granted: z.array(z.string()),
  progress_revision: z.number().int(),
  /** null unless this submission created the completion. */
  reward: rewardResultSchema,
});
export type SubmitResponse = z.infer<typeof submitResponseSchema>;

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
