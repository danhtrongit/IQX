import type { SqlClient } from '../database/index.js';

/**
 * Learning-coin reward hook. The Academy calls it inside the same transaction that
 * commits a first valid lesson completion; the Shop module implements it.
 */
export const LESSON_REWARD_PORT = Symbol('LESSON_REWARD_PORT');

export interface LessonRewardInput {
  readonly userId: string;
  /** Stable lesson key that survives catalog renumbering, e.g. `technical:rsi`. */
  readonly lessonKey: string;
  readonly lessonId: string;
  readonly catalogVersion: string;
  /**
   * `legacy_migration` only comes from the compensation backfill (Shop spec 10.2) for lessons
   * completed before the Shop; the realtime Academy path sends `quiz` or `guide`.
   */
  readonly completionMethod: 'quiz' | 'guide' | 'legacy_migration';
  readonly completedAt: string;
}

export type LessonRewardResult =
  | {
      readonly status: 'credited';
      readonly delta: number;
      readonly balanceAfter: number;
      readonly ledgerEntryId: string;
    }
  | { readonly status: 'already_rewarded'; readonly balanceAfter: number };

export interface LessonRewardPort {
  /** Runs in the caller's transaction; idempotent per (userId, lessonKey). */
  creditFirstCompletion(tx: SqlClient, input: LessonRewardInput): Promise<LessonRewardResult>;
}
