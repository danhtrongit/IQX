import { randomUUID } from 'node:crypto';

import type { SqlClient } from '../../../src/platform/database/database.service.js';
import {
  CandleDojoRepository,
  type ExamAttemptRow,
  type ExamStatus,
  type LessonProgressRow,
  type NewExamAttempt,
  type ProgressRow,
  type RewardRecord,
  type UserCardRow,
} from '../../../src/modules/candle-dojo/candle-dojo.repository.js';
import { MemoryDatabase } from './shop-memory.js';

interface DojoState {
  progress: Map<string, ProgressRow>;
  lessons: Map<string, LessonProgressRow & { userId: string }>;
  cards: Map<string, UserCardRow & { userId: string; ledgerId: string }>;
  rewards: Map<string, RewardRecord>;
  attempts: Map<string, ExamAttemptRow>;
}

const emptyDojo = (): DojoState => ({
  progress: new Map(),
  lessons: new Map(),
  cards: new Map(),
  rewards: new Map(),
  attempts: new Map(),
});

/** Cơ sở dữ liệu trong bộ nhớ của Shop, thêm bảng Candle Dojo; giao dịch lỗi thì trả lại cả hai. */
export class DojoMemoryDatabase extends MemoryDatabase {
  dojo: DojoState = emptyDojo();

  override async transaction<T>(operation: (tx: SqlClient) => Promise<T>): Promise<T> {
    return super.transaction(async (tx) => {
      const backup = structuredClone(this.dojo);
      try {
        return await operation(tx);
      } catch (error) {
        this.dojo = backup;
        throw error;
      }
    });
  }
}

const dojo = (client: SqlClient): DojoState => (client as unknown as DojoMemoryDatabase).dojo;
const key = (userId: string, id: string) => `${userId}|${id}`;

const freshProgress = (): ProgressRow => ({
  belt: -1,
  introCompletedAt: null,
  streakDays: 0,
  bestStreak: 0,
  lastDrillDay: null,
  drillsTotal: 0,
});

/** Mô phỏng PgCandleDojoRepository, kể cả các khoá duy nhất của migration 0045. */
export class MemoryCandleDojoRepository extends CandleDojoRepository {
  async lockProgress(tx: SqlClient, userId: string): Promise<ProgressRow> {
    const state = dojo(tx);
    const existing = state.progress.get(userId);
    if (existing) return { ...existing };
    state.progress.set(userId, freshProgress());
    return freshProgress();
  }

  async readProgress(db: SqlClient, userId: string): Promise<ProgressRow | null> {
    const row = dojo(db).progress.get(userId);
    return row ? { ...row } : null;
  }

  async saveProgress(
    tx: SqlClient,
    userId: string,
    patch: Parameters<CandleDojoRepository['saveProgress']>[2],
  ): Promise<void> {
    const state = dojo(tx);
    const row = state.progress.get(userId) ?? freshProgress();
    state.progress.set(userId, {
      belt: patch.belt ?? row.belt,
      introCompletedAt: patch.introCompletedAt ?? row.introCompletedAt,
      streakDays: patch.streakDays ?? row.streakDays,
      bestStreak: patch.bestStreak ?? row.bestStreak,
      lastDrillDay: patch.lastDrillDay ?? row.lastDrillDay,
      drillsTotal: patch.drillsTotal ?? row.drillsTotal,
    });
  }

  async listLessons(db: SqlClient, userId: string): Promise<LessonProgressRow[]> {
    return [...dojo(db).lessons.values()]
      .filter((row) => row.userId === userId)
      .map(({ userId: _userId, ...row }) => row);
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
    const state = dojo(tx);
    const id = key(entry.userId, entry.lessonId);
    const existing = state.lessons.get(id);
    const now = new Date();
    const row: LessonProgressRow & { userId: string } = existing
      ? {
          ...existing,
          stars: Math.max(existing.stars, entry.stars),
          huntStar: existing.huntStar || entry.huntStar,
          twinStar: existing.twinStar || entry.twinStar,
          attempts: existing.attempts + 1,
          updatedAt: now,
        }
      : {
          userId: entry.userId,
          lessonId: entry.lessonId,
          stars: entry.stars,
          huntStar: entry.huntStar,
          twinStar: entry.twinStar,
          attempts: 1,
          firstCompletedAt: now,
          updatedAt: now,
        };
    state.lessons.set(id, row);
    const { userId: _userId, ...view } = row;
    return { created: !existing, row: view };
  }

  async listCards(db: SqlClient, userId: string): Promise<UserCardRow[]> {
    return [...dojo(db).cards.values()]
      .filter((row) => row.userId === userId)
      .map(({ userId: _userId, ledgerId: _ledgerId, ...row }) => row);
  }

  async hasCard(tx: SqlClient, userId: string, cardId: string): Promise<boolean> {
    return dojo(tx).cards.has(key(userId, cardId));
  }

  async insertCard(
    tx: SqlClient,
    entry: { userId: string; cardId: string; priceXu: number; ledgerId: string },
  ): Promise<UserCardRow | null> {
    const state = dojo(tx);
    const id = key(entry.userId, entry.cardId);
    if (state.cards.has(id)) return null;
    const row = {
      userId: entry.userId,
      cardId: entry.cardId,
      priceXu: entry.priceXu,
      ledgerId: entry.ledgerId,
      acquiredAt: new Date(),
      seenAt: null,
    };
    state.cards.set(id, row);
    return { cardId: row.cardId, priceXu: row.priceXu, acquiredAt: row.acquiredAt, seenAt: null };
  }

  async insertRewardIfAbsent(tx: SqlClient, reward: RewardRecord): Promise<boolean> {
    const state = dojo(tx);
    const id = key(reward.userId, reward.rewardKey);
    if (state.rewards.has(id)) return false;
    state.rewards.set(id, reward);
    return true;
  }

  async hasReward(db: SqlClient, userId: string, rewardKey: string): Promise<boolean> {
    return dojo(db).rewards.has(key(userId, rewardKey));
  }

  async abandonOpenAttempts(tx: SqlClient, userId: string, dojoN: number): Promise<void> {
    for (const [id, attempt] of dojo(tx).attempts) {
      if (attempt.userId === userId && attempt.dojo === dojoN && attempt.status === 'open') {
        dojo(tx).attempts.set(id, { ...attempt, status: 'abandoned', finishedAt: new Date() });
      }
    }
  }

  async insertAttempt(tx: SqlClient, attempt: NewExamAttempt): Promise<ExamAttemptRow> {
    const row: ExamAttemptRow = {
      id: attempt.id ?? randomUUID(),
      userId: attempt.userId,
      dojo: attempt.dojo,
      status: 'open',
      questions: attempt.questions,
      answers: attempt.questions.map(() => null),
      score: null,
      passMark: attempt.passMark,
      beltAwarded: false,
      startedAt: new Date(),
      finishedAt: null,
    };
    dojo(tx).attempts.set(row.id, row);
    return { ...row };
  }

  async findAttempt(
    db: SqlClient,
    attemptId: string,
    userId: string,
  ): Promise<ExamAttemptRow | null> {
    const row = dojo(db).attempts.get(attemptId);
    return row && row.userId === userId ? { ...row } : null;
  }

  async updateAttempt(
    tx: SqlClient,
    attemptId: string,
    patch: Partial<{
      answers: readonly (string | null)[];
      status: ExamStatus;
      score: number;
      beltAwarded: boolean;
      finishedAt: Date;
    }>,
  ): Promise<void> {
    const row = dojo(tx).attempts.get(attemptId);
    if (!row) return;
    dojo(tx).attempts.set(attemptId, {
      ...row,
      answers: patch.answers ?? row.answers,
      status: patch.status ?? row.status,
      score: patch.score ?? row.score,
      beltAwarded: patch.beltAwarded ?? row.beltAwarded,
      finishedAt: patch.finishedAt ?? row.finishedAt,
    });
  }
}
