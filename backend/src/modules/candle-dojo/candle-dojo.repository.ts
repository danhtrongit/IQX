import { Injectable } from '@nestjs/common';

import type { SqlClient } from '../../platform/database/database.service.js';

export interface ProgressRow {
  readonly belt: number;
  readonly introCompletedAt: Date | null;
  readonly streakDays: number;
  readonly bestStreak: number;
  readonly lastDrillDay: string | null;
  readonly drillsTotal: number;
}

export interface LessonProgressRow {
  readonly lessonId: string;
  readonly stars: number;
  readonly huntStar: boolean;
  readonly twinStar: boolean;
  readonly attempts: number;
  readonly firstCompletedAt: Date;
  readonly updatedAt: Date;
}

export interface UserCardRow {
  readonly cardId: string;
  readonly priceXu: number;
  readonly acquiredAt: Date;
  readonly seenAt: Date | null;
}

export interface ExamQuestionRecord {
  /** Vị trí câu trong đề gốc (`exams.json`). */
  readonly qid: number;
  /** Lựa chọn theo thứ tự đã hiện cho người học. */
  readonly options: readonly string[];
  readonly answer: string;
}

export type ExamStatus = 'open' | 'passed' | 'failed' | 'abandoned';

export interface ExamAttemptRow {
  readonly id: string;
  readonly userId: string;
  readonly dojo: number;
  readonly status: ExamStatus;
  readonly questions: readonly ExamQuestionRecord[];
  /** Lựa chọn của người học theo từng câu; null = chưa trả lời. */
  readonly answers: readonly (string | null)[];
  readonly score: number | null;
  readonly passMark: number;
  readonly beltAwarded: boolean;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
}

export interface NewExamAttempt {
  readonly id: string;
  readonly userId: string;
  readonly dojo: number;
  readonly questions: readonly ExamQuestionRecord[];
  readonly passMark: number;
}

export interface RewardRecord {
  readonly userId: string;
  readonly rewardKey: string;
  readonly xu: number;
  readonly ledgerId: string;
}

export abstract class CandleDojoRepository {
  /** Tạo dòng tiến độ nếu chưa có và khoá nó; gọi sau khi đã khoá ví. */
  abstract lockProgress(tx: SqlClient, userId: string): Promise<ProgressRow>;
  abstract readProgress(db: SqlClient, userId: string): Promise<ProgressRow | null>;
  abstract saveProgress(
    tx: SqlClient,
    userId: string,
    patch: Partial<{
      belt: number;
      introCompletedAt: Date;
      streakDays: number;
      bestStreak: number;
      lastDrillDay: string;
      drillsTotal: number;
    }>,
  ): Promise<void>;

  abstract listLessons(db: SqlClient, userId: string): Promise<LessonProgressRow[]>;
  /** Ghi kết quả một lần học: giữ sao cao nhất. `created` = lần đầu xong bài này. */
  abstract recordLesson(
    tx: SqlClient,
    entry: {
      userId: string;
      lessonId: string;
      huntStar: boolean;
      twinStar: boolean;
      stars: number;
    },
  ): Promise<{ created: boolean; row: LessonProgressRow }>;

  abstract listCards(db: SqlClient, userId: string): Promise<UserCardRow[]>;
  abstract hasCard(tx: SqlClient, userId: string, cardId: string): Promise<boolean>;
  abstract insertCard(
    tx: SqlClient,
    entry: { userId: string; cardId: string; priceXu: number; ledgerId: string },
  ): Promise<UserCardRow | null>;

  /** `true` khi phần thưởng này chưa từng được ghi (và vừa được ghi). */
  abstract insertRewardIfAbsent(tx: SqlClient, reward: RewardRecord): Promise<boolean>;
  abstract hasReward(db: SqlClient, userId: string, rewardKey: string): Promise<boolean>;

  abstract abandonOpenAttempts(tx: SqlClient, userId: string, dojo: number): Promise<void>;
  abstract insertAttempt(tx: SqlClient, attempt: NewExamAttempt): Promise<ExamAttemptRow>;
  abstract findAttempt(
    db: SqlClient,
    attemptId: string,
    userId: string,
    lock: boolean,
  ): Promise<ExamAttemptRow | null>;
  abstract updateAttempt(
    tx: SqlClient,
    attemptId: string,
    patch: Partial<{
      answers: readonly (string | null)[];
      status: ExamStatus;
      score: number;
      beltAwarded: boolean;
      finishedAt: Date;
    }>,
  ): Promise<void>;
}

const toInt = (value: unknown): number => Number(value);
const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));
const toDay = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

function mapProgress(row: Record<string, unknown>): ProgressRow {
  return {
    belt: toInt(row.belt),
    introCompletedAt: row.intro_completed_at ? toDate(row.intro_completed_at) : null,
    streakDays: toInt(row.streak_days),
    bestStreak: toInt(row.best_streak),
    lastDrillDay: toDay(row.last_drill_day),
    drillsTotal: toInt(row.drills_total),
  };
}

function mapLesson(row: Record<string, unknown>): LessonProgressRow {
  return {
    lessonId: String(row.lesson_id),
    stars: toInt(row.stars),
    huntStar: Boolean(row.hunt_star),
    twinStar: Boolean(row.twin_star),
    attempts: toInt(row.attempts),
    firstCompletedAt: toDate(row.first_completed_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapCard(row: Record<string, unknown>): UserCardRow {
  return {
    cardId: String(row.card_id),
    priceXu: toInt(row.price_xu),
    acquiredAt: toDate(row.acquired_at),
    seenAt: row.seen_at ? toDate(row.seen_at) : null,
  };
}

function mapAttempt(row: Record<string, unknown>): ExamAttemptRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    dojo: toInt(row.dojo),
    status: String(row.status) as ExamStatus,
    questions: (row.questions ?? []) as ExamQuestionRecord[],
    answers: (row.answers ?? []) as (string | null)[],
    score: row.score === null || row.score === undefined ? null : toInt(row.score),
    passMark: toInt(row.pass_mark),
    beltAwarded: Boolean(row.belt_awarded),
    startedAt: toDate(row.started_at),
    finishedAt: row.finished_at ? toDate(row.finished_at) : null,
  };
}

const PROGRESS_COLUMNS = `belt, intro_completed_at, streak_days, best_streak,
  to_char(last_drill_day, 'YYYY-MM-DD') as last_drill_day, drills_total`;

@Injectable()
export class PgCandleDojoRepository extends CandleDojoRepository {
  async lockProgress(tx: SqlClient, userId: string): Promise<ProgressRow> {
    await tx.query(`insert into cd_user_progress (user_id) values ($1) on conflict do nothing`, [
      userId,
    ]);
    const rows = await tx.query(
      `select ${PROGRESS_COLUMNS} from cd_user_progress where user_id = $1 for update`,
      [userId],
    );
    if (!rows[0]) throw new Error('Candle Dojo progress could not be created');
    return mapProgress(rows[0]);
  }

  async readProgress(db: SqlClient, userId: string): Promise<ProgressRow | null> {
    const rows = await db.query(
      `select ${PROGRESS_COLUMNS} from cd_user_progress where user_id = $1`,
      [userId],
    );
    return rows[0] ? mapProgress(rows[0]) : null;
  }

  async saveProgress(
    tx: SqlClient,
    userId: string,
    patch: Parameters<CandleDojoRepository['saveProgress']>[2],
  ): Promise<void> {
    await tx.query(
      `update cd_user_progress set
         belt = coalesce($2::smallint, belt),
         intro_completed_at = coalesce($3::timestamptz, intro_completed_at),
         streak_days = coalesce($4::integer, streak_days),
         best_streak = coalesce($5::integer, best_streak),
         last_drill_day = coalesce($6::date, last_drill_day),
         drills_total = coalesce($7::integer, drills_total),
         updated_at = now()
       where user_id = $1`,
      [
        userId,
        patch.belt ?? null,
        patch.introCompletedAt ?? null,
        patch.streakDays ?? null,
        patch.bestStreak ?? null,
        patch.lastDrillDay ?? null,
        patch.drillsTotal ?? null,
      ],
    );
  }

  async listLessons(db: SqlClient, userId: string): Promise<LessonProgressRow[]> {
    const rows = await db.query(
      `select lesson_id, stars, hunt_star, twin_star, attempts, first_completed_at, updated_at
         from cd_lesson_progress where user_id = $1 order by first_completed_at`,
      [userId],
    );
    return rows.map(mapLesson);
  }

  async recordLesson(
    tx: SqlClient,
    entry: {
      userId: string;
      lessonId: string;
      huntStar: boolean;
      twinStar: boolean;
      stars: number;
    },
  ) {
    const rows = await tx.query(
      `insert into cd_lesson_progress (user_id, lesson_id, stars, hunt_star, twin_star)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, lesson_id) do update set
         stars = greatest(cd_lesson_progress.stars, excluded.stars),
         hunt_star = cd_lesson_progress.hunt_star or excluded.hunt_star,
         twin_star = cd_lesson_progress.twin_star or excluded.twin_star,
         attempts = cd_lesson_progress.attempts + 1,
         updated_at = now()
       returning lesson_id, stars, hunt_star, twin_star, attempts, first_completed_at, updated_at,
                 (xmax = 0) as created`,
      [entry.userId, entry.lessonId, entry.stars, entry.huntStar, entry.twinStar],
    );
    const row = rows[0]!;
    return { created: Boolean(row.created), row: mapLesson(row) };
  }

  async listCards(db: SqlClient, userId: string): Promise<UserCardRow[]> {
    const rows = await db.query(
      `select card_id, price_xu, acquired_at, seen_at from cd_user_cards
        where user_id = $1 order by acquired_at, card_id`,
      [userId],
    );
    return rows.map(mapCard);
  }

  async hasCard(tx: SqlClient, userId: string, cardId: string): Promise<boolean> {
    const rows = await tx.query(`select 1 from cd_user_cards where user_id = $1 and card_id = $2`, [
      userId,
      cardId,
    ]);
    return rows.length > 0;
  }

  async insertCard(
    tx: SqlClient,
    entry: { userId: string; cardId: string; priceXu: number; ledgerId: string },
  ): Promise<UserCardRow | null> {
    const rows = await tx.query(
      `insert into cd_user_cards (user_id, card_id, price_xu, ledger_id)
       values ($1, $2, $3, $4)
       on conflict (user_id, card_id) do nothing
       returning card_id, price_xu, acquired_at, seen_at`,
      [entry.userId, entry.cardId, entry.priceXu, entry.ledgerId],
    );
    return rows[0] ? mapCard(rows[0]) : null;
  }

  async insertRewardIfAbsent(tx: SqlClient, reward: RewardRecord): Promise<boolean> {
    const rows = await tx.query(
      `insert into cd_rewards (user_id, reward_key, xu, ledger_id) values ($1, $2, $3, $4)
       on conflict (user_id, reward_key) do nothing returning reward_key`,
      [reward.userId, reward.rewardKey, reward.xu, reward.ledgerId],
    );
    return rows.length > 0;
  }

  async hasReward(db: SqlClient, userId: string, rewardKey: string): Promise<boolean> {
    const rows = await db.query(`select 1 from cd_rewards where user_id = $1 and reward_key = $2`, [
      userId,
      rewardKey,
    ]);
    return rows.length > 0;
  }

  async abandonOpenAttempts(tx: SqlClient, userId: string, dojo: number): Promise<void> {
    await tx.query(
      `update cd_exam_attempts set status = 'abandoned', finished_at = now()
        where user_id = $1 and dojo = $2 and status = 'open'`,
      [userId, dojo],
    );
  }

  async insertAttempt(tx: SqlClient, attempt: NewExamAttempt): Promise<ExamAttemptRow> {
    const rows = await tx.query(
      `insert into cd_exam_attempts (id, user_id, dojo, questions, answers, pass_mark)
       values ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
       returning id, user_id, dojo, status, questions, answers, score, pass_mark, belt_awarded,
                 started_at, finished_at`,
      [
        attempt.id,
        attempt.userId,
        attempt.dojo,
        JSON.stringify(attempt.questions),
        JSON.stringify(attempt.questions.map(() => null)),
        attempt.passMark,
      ],
    );
    return mapAttempt(rows[0]!);
  }

  async findAttempt(
    db: SqlClient,
    attemptId: string,
    userId: string,
    lock: boolean,
  ): Promise<ExamAttemptRow | null> {
    const rows = await db.query(
      `select id, user_id, dojo, status, questions, answers, score, pass_mark, belt_awarded,
              started_at, finished_at
         from cd_exam_attempts where id = $1 and user_id = $2 ${lock ? 'for update' : ''}`,
      [attemptId, userId],
    );
    return rows[0] ? mapAttempt(rows[0]) : null;
  }

  async updateAttempt(
    tx: SqlClient,
    attemptId: string,
    patch: Parameters<CandleDojoRepository['updateAttempt']>[2],
  ): Promise<void> {
    await tx.query(
      `update cd_exam_attempts set
         answers = coalesce($2::jsonb, answers),
         status = coalesce($3, status),
         score = coalesce($4::smallint, score),
         belt_awarded = coalesce($5, belt_awarded),
         finished_at = coalesce($6::timestamptz, finished_at)
       where id = $1`,
      [
        attemptId,
        patch.answers ? JSON.stringify(patch.answers) : null,
        patch.status ?? null,
        patch.score ?? null,
        patch.beltAwarded ?? null,
        patch.finishedAt ?? null,
      ],
    );
  }
}
