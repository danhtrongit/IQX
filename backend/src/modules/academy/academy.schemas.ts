import { z } from 'zod';

export const lessonIdParamSchema = z.string().regex(/^ch\d{2}-l\d{2}$/);
export const attemptIdParamSchema = z.uuid();

export const curriculumQuerySchema = z.object({
  content_version: z.string().min(1).max(32).optional(),
});
export type CurriculumQuery = z.infer<typeof curriculumQuerySchema>;

export const attemptCreateSchema = z.object({
  lesson_id: lessonIdParamSchema,
  content_version: z.string().min(1).max(32),
  idempotency_key: z.string().min(8).max(128),
});
export type AttemptCreateInput = z.infer<typeof attemptCreateSchema>;

export const attemptSubmitSchema = z.object({
  // Exact-8/unique/ownership checks run in the service so they surface as INVALID_ANSWERS.
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

const lessonKindSchema = z.enum(['technical', 'fundamental', 'tool', 'system']);

export const curriculumResponseSchema = z.object({
  content_version: z.string(),
  chapters: z.array(
    z.object({
      no: z.number().int(),
      title: z.string(),
      type: lessonKindSchema,
      bot: z.string().nullable(),
      lessons: z.array(
        z.object({
          id: z.string(),
          order: z.number().int(),
          name: z.string(),
          kind: lessonKindSchema,
          config_id: z.string().nullable(),
          passed: z.boolean(),
          best_score: z.number().int().nullable(),
          attempts: z.number().int(),
          capabilities: z.array(z.string()),
        }),
      ),
    }),
  ),
  granted_capabilities: z.array(z.string()),
});
export type CurriculumResponse = z.infer<typeof curriculumResponseSchema>;

export const lessonResponseSchema = z.object({
  id: z.string(),
  chapter: z.number().int(),
  order: z.number().int(),
  name: z.string(),
  kind: lessonKindSchema,
  content_version: z.string(),
  config_id: z.string().nullable(),
  sections: z.array(z.object({ title: z.string(), html: z.string() })),
  fixture: z.record(z.string(), z.unknown()),
  prerequisites: z.array(z.string()),
  sources: z.array(z.string()),
  review_status: z.string(),
  passed: z.boolean(),
});
export type LessonResponse = z.infer<typeof lessonResponseSchema>;

export const attemptResponseSchema = z.object({
  attempt_id: z.string(),
  lesson_id: z.string(),
  content_version: z.string(),
  questions_version: z.string(),
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      options: z.array(z.object({ id: z.string(), text: z.string() })),
    }),
  ),
});
export type AttemptResponse = z.infer<typeof attemptResponseSchema>;

export const submitResponseSchema = z.object({
  attempt_id: z.string(),
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
  granted_capabilities: z.array(z.string()),
  newly_granted: z.array(z.string()),
});
export type SubmitResponse = z.infer<typeof submitResponseSchema>;
