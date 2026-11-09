import { z } from 'zod';

import { CD_CARD_COUNT } from './shared/cards.js';

const isoTime = z.string();
const cardIdField = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9_]+$/);
const lessonIdField = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_]+$/);

// ------------------------------------------------------------------ yêu cầu

export const cardIdParamSchema = cardIdField;
export const attemptIdParamSchema = z.string().uuid();

/** Người học chỉ gửi những gì họ làm; sao, thưởng và mở khoá do server quyết định. */
export const lessonCompleteBodySchema = z
  .object({
    /** Chỗ chạm của bước Săn nến (chỉ số nến), theo thứ tự chạm. */
    hunt: z
      .object({ taps: z.array(z.number().int().min(0).max(200)).max(200) })
      .strict()
      .optional(),
    /** Bên chọn ở từng câu Song sinh ('a' hoặc 'b'; null = bỏ qua). */
    twins: z
      .array(z.enum(['a', 'b']).nullable())
      .max(3)
      .optional(),
  })
  .strict();

export const examStartBodySchema = z.object({ dojo: z.number().int().min(1).max(5) }).strict();

export const examAnswerBodySchema = z
  .object({
    index: z.number().int().min(0).max(7),
    option: cardIdField,
  })
  .strict();

export const drillCompleteBodySchema = z
  .object({
    lesson_id: lessonIdField,
    taps: z.array(z.number().int().min(0).max(200)).max(200),
  })
  .strict();

/** Mua thẻ: giá và danh mục chỉ để xác nhận điều đã hiển thị; server tính lại. */
export const cardPurchaseBodySchema = z
  .object({
    expected_price_xu: z.number().int().min(0).max(1_000_000),
    catalog_version: z.string().trim().min(1).max(64),
  })
  .strict();

// ------------------------------------------------------------------ phản hồi

const progressSchema = z.object({
  /** -1 = chưa có đai, 0 = trắng ... 5 = đen. */
  belt: z.number().int().min(-1).max(5),
  belt_name: z.string().nullable(),
  intro_completed: z.boolean(),
  streak_days: z.number().int(),
  best_streak: z.number().int(),
  drills_total: z.number().int(),
  drill_unlocked: z.boolean(),
  drill_done_today: z.boolean(),
});

const lessonProgressSchema = z.object({
  lesson_id: z.string(),
  dojo: z.number().int(),
  stars: z.number().int().min(1).max(3),
  hunt_star: z.boolean(),
  twin_star: z.boolean(),
  attempts: z.number().int(),
  completed_at: isoTime,
});

const dojoStateSchema = z.object({
  n: z.number().int(),
  unlocked: z.boolean(),
  lessons_total: z.number().int(),
  lessons_done: z.number().int(),
  exam_ready: z.boolean(),
  passed: z.boolean(),
});

export const stateSchema = z.object({
  catalog_version: z.string(),
  wallet: z.object({ balance: z.number().int() }),
  progress: progressSchema,
  lessons: z.array(lessonProgressSchema),
  /** Bài đang mở (mở sẵn hoặc đã học): màn học dùng để vẽ trạng thái khoá. */
  open_lessons: z.array(z.string()),
  dojos: z.array(dojoStateSchema),
  cards: z.object({
    total: z.number().int(),
    owned_count: z.number().int(),
    owned: z.array(
      z.object({ card_id: z.string(), acquired_at: isoTime, seen_at: isoTime.nullable() }),
    ),
  }),
  rewards: z.object({
    intro_xu: z.number().int(),
    lesson_xu: z.number().int(),
    belt_xu: z.number().int(),
    drill_xu: z.number().int(),
  }),
});

const rewardSchema = z.object({
  /** Xu vừa nhận (0 khi không phải lần đầu). */
  reward_xu: z.number().int(),
  first_time: z.boolean(),
  balance: z.number().int(),
});

export const introResultSchema = rewardSchema.extend({
  belt: z.number().int(),
});

export const lessonResultSchema = rewardSchema.extend({
  lesson_id: z.string(),
  /** Sao của lần học này và sao cao nhất đã lưu. */
  stars: z.number().int().min(1).max(3),
  best_stars: z.number().int().min(1).max(3),
  previous_stars: z.number().int().min(0).max(3),
  hunt: z.object({
    found: z.number().int(),
    total: z.number().int(),
    miss: z.number().int(),
    star: z.boolean(),
  }),
  twins: z.object({ right: z.number().int(), total: z.number().int(), star: z.boolean() }),
  /** Thẻ của bài, mua được ngay (không cần đủ sao). */
  card_ids: z.array(z.string()),
});

export const drillResultSchema = rewardSchema.extend({
  lesson_id: z.string(),
  found: z.number().int(),
  total: z.number().int(),
  miss: z.number().int(),
  streak_days: z.number().int(),
});

const examQuestionSchema = z.object({
  index: z.number().int(),
  /** Số nến của mẫu (nằm cuối biểu đồ, tô vàng). */
  n: z.number().int(),
  bars: z.array(
    z.object({ o: z.number(), h: z.number(), l: z.number(), c: z.number(), v: z.number() }),
  ),
  options: z.array(z.string()),
});

export const examStartResultSchema = z.object({
  attempt_id: z.string(),
  dojo: z.number().int(),
  belt_name: z.string(),
  pass_mark: z.number().int(),
  total: z.number().int(),
  questions: z.array(examQuestionSchema),
});

export const examAnswerResultSchema = z.object({
  attempt_id: z.string(),
  index: z.number().int(),
  correct: z.boolean(),
  /** Mã thẻ đúng, lộ sau khi đã trả lời câu này. */
  answer: z.string(),
  answered: z.number().int(),
  finished: z.boolean(),
  /** Có khi vừa trả lời câu cuối. */
  result: z
    .object({
      score: z.number().int(),
      total: z.number().int(),
      pass_mark: z.number().int(),
      passed: z.boolean(),
      belt: z.number().int(),
      belt_up: z.boolean(),
      reward_xu: z.number().int(),
      balance: z.number().int(),
    })
    .nullable(),
});

export const cardItemSchema = z.object({
  card_id: z.string(),
  name: z.string(),
  tier: z.number().int().min(1).max(5),
  price_xu: z.number().int(),
  lesson_id: z.string(),
  lesson_title: z.string(),
  dojo: z.number().int(),
  owned: z.boolean(),
  acquired_at: isoTime.nullable(),
  /** Đã gặp ở Flashback (nhãn "Đã gặp" trong Shop). */
  seen: z.boolean(),
  /** Bài của thẻ đã học xong: thẻ mua được. */
  unlocked: z.boolean(),
});

export const cardsSchema = z.object({
  catalog_version: z.string(),
  wallet: z.object({ balance: z.number().int() }),
  total_count: z.literal(CD_CARD_COUNT),
  owned_count: z.number().int(),
  items: z.array(cardItemSchema),
});

export const cardPurchaseResultSchema = z.object({
  status: z.literal('purchased'),
  card_id: z.string(),
  name: z.string(),
  price_xu: z.number().int(),
  balance: z.number().int(),
  acquired_at: isoTime,
});

export type LessonCompleteBody = z.infer<typeof lessonCompleteBodySchema>;
export type ExamStartBody = z.infer<typeof examStartBodySchema>;
export type ExamAnswerBody = z.infer<typeof examAnswerBodySchema>;
export type DrillCompleteBody = z.infer<typeof drillCompleteBodySchema>;
export type CardPurchaseBody = z.infer<typeof cardPurchaseBodySchema>;
