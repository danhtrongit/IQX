import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { SqlClient } from '../../platform/database/database.service.js';
import type {
  LessonRewardInput,
  LessonRewardPort,
  LessonRewardResult,
} from '../../platform/ports/lesson-reward.port.js';
import { COIN_POLICY_VERSION, LESSON_REWARD_XU } from './shop.catalog.js';
import { ShopRepository } from './shop.repository.js';

/** Stable lesson keys: `technical:rsi`, `fundamental:roe`, `concept:hop_luu`, `guide:ch02-l01`. */
const LESSON_KEY = /^(technical|fundamental|concept|guide):[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;

export type RewardSource = 'realtime' | 'backfill';

export interface CreditOptions {
  /** Audit label stored in the ledger `ref`; the unique key is identical for both sources. */
  readonly source?: RewardSource;
}

export function lessonRewardUniqueKey(userId: string, lessonKey: string): string {
  return `lesson_first_completion:${userId}:${lessonKey}`;
}

function assertValidInput(input: LessonRewardInput): Date {
  if (!input.userId) throw new TypeError('userId is required');
  if (!LESSON_KEY.test(input.lessonKey)) {
    throw new TypeError(`Invalid stable lesson key: ${input.lessonKey}`);
  }
  if (!input.lessonId || !input.catalogVersion) {
    throw new TypeError('lessonId and catalogVersion are required');
  }
  if (input.completionMethod !== 'quiz' && input.completionMethod !== 'guide') {
    throw new TypeError(`Invalid completion method: ${String(input.completionMethod)}`);
  }
  const completedAt = new Date(input.completedAt);
  if (Number.isNaN(completedAt.getTime())) throw new TypeError('completedAt is not a valid date');
  return completedAt;
}

/**
 * +100 xu for the first valid completion of a lesson (Shop spec section 5). It runs inside the
 * caller's transaction, so the completion, the capability grant and the coins commit together.
 *
 * The gate is the `(user_id, lesson_key)` primary key of `lesson_rewards`: a concurrent
 * second completion blocks on that key, then finds the row and returns `already_rewarded`.
 * Realtime hooks and the backfill share this exact path and the same ledger unique key.
 */
@Injectable()
export class LessonRewardService implements LessonRewardPort {
  constructor(private readonly repository: ShopRepository) {}

  async creditFirstCompletion(
    tx: SqlClient,
    input: LessonRewardInput,
    options: CreditOptions = {},
  ): Promise<LessonRewardResult> {
    const completedAt = assertValidInput(input);
    const ledgerId = randomUUID();

    const inserted = await this.repository.insertRewardIfAbsent(tx, {
      userId: input.userId,
      lessonKey: input.lessonKey,
      lessonId: input.lessonId,
      catalogVersion: input.catalogVersion,
      completionMethod: input.completionMethod,
      completedAt,
      ledgerId,
      policyVersion: COIN_POLICY_VERSION,
    });
    if (!inserted) {
      const wallet = await this.repository.readWallet(tx, input.userId);
      return { status: 'already_rewarded', balanceAfter: wallet?.balance ?? 0 };
    }

    // Reward and purchases serialise on the same wallet row.
    const wallet = await this.repository.lockWallet(tx, input.userId);
    const seq = wallet.lastSeq + 1;
    const balanceAfter = wallet.balance + LESSON_REWARD_XU;
    await this.repository.appendLedger(tx, {
      id: ledgerId,
      userId: input.userId,
      seq,
      kind: 'lesson_first_completion',
      delta: LESSON_REWARD_XU,
      balanceAfter,
      uniqueKey: lessonRewardUniqueKey(input.userId, input.lessonKey),
      ref: {
        lesson_key: input.lessonKey,
        lesson_id: input.lessonId,
        catalog_version: input.catalogVersion,
        completion_method: input.completionMethod,
        completed_at: completedAt.toISOString(),
        source: options.source ?? 'realtime',
      },
      policyVersion: COIN_POLICY_VERSION,
    });
    await this.repository.saveWallet(tx, input.userId, balanceAfter, seq);
    return {
      status: 'credited',
      delta: LESSON_REWARD_XU,
      balanceAfter,
      ledgerEntryId: ledgerId,
    };
  }
}
