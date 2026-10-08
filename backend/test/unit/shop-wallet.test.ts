import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { lessonRewardUniqueKey } from '../../src/modules/shop/lesson-reward.service.js';
import type { LessonRewardInput } from '../../src/platform/ports/lesson-reward.port.js';
import {
  allLedger,
  expectLedgerConsistent,
  fundLessons,
  harnessFactories,
  memoryHarness,
  snapshotOf,
  type ShopHarness,
} from './helpers/shop-harness.js';
import { MemoryDatabase } from './helpers/shop-memory.js';

const CATALOG = 'iqx-academy-outline-13ch-71lessons-v1';

function lesson(userId: string, lessonKey: string, extra: Partial<LessonRewardInput> = {}) {
  return {
    userId,
    lessonKey,
    lessonId: lessonKey.replace(':', '-'),
    catalogVersion: CATALOG,
    completionMethod: 'quiz' as const,
    completedAt: '2026-09-01T03:00:00.000Z',
    ...extra,
  };
}

describe.each(harnessFactories)('learning coins: wallet and ledger ($name)', ({ create }) => {
  let h: ShopHarness;
  beforeAll(async () => {
    h = await create();
  });
  afterAll(async () => {
    await h.close();
  });

  const credit = (input: LessonRewardInput) =>
    h.database.transaction((tx) => h.rewards.creditFirstCompletion(tx, input));

  it('credits +100 xu once per stable lesson key and replays as already_rewarded', async () => {
    const userId = await h.newUser();
    const first = await credit(lesson(userId, 'technical:rsi'));
    expect(first).toMatchObject({ status: 'credited', delta: 100, balanceAfter: 100 });
    expect(first.status === 'credited' && first.ledgerEntryId).toBeTruthy();

    const again = await credit(lesson(userId, 'technical:rsi'));
    expect(again).toEqual({ status: 'already_rewarded', balanceAfter: 100 });
    // A re-pass with other attempt metadata or a new catalog version is still the same lesson.
    const renamed = await credit(
      lesson(userId, 'technical:rsi', { catalogVersion: 'next-catalog', lessonId: 'ch09-l09' }),
    );
    expect(renamed).toEqual({ status: 'already_rewarded', balanceAfter: 100 });

    const rows = await expectLedgerConsistent(h, userId, 100);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'lesson_first_completion',
      delta: 100,
      balanceAfter: 100,
    });
    expect((await snapshotOf(h, userId)).lessonsRewarded).toBe(1);
  });

  it('two concurrent credits of the same lesson produce exactly one reward', async () => {
    const userId = await h.newUser();
    const results = await Promise.all([
      credit(lesson(userId, 'fundamental:roe')),
      credit(lesson(userId, 'fundamental:roe')),
      credit(lesson(userId, 'fundamental:roe')),
    ]);
    expect(results.filter((r) => r.status === 'credited')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'already_rewarded')).toHaveLength(2);
    for (const result of results) expect(result.balanceAfter).toBe(100);
    await expectLedgerConsistent(h, userId, 100);
  });

  it('concurrent credits of different lessons keep a gapless seq and a correct balance', async () => {
    const userId = await h.newUser();
    const keys = Array.from({ length: 8 }, (_, index) => `technical:t${index}`);
    await Promise.all(keys.map((key) => credit(lesson(userId, key))));
    const rows = await expectLedgerConsistent(h, userId, 800);
    expect(rows.map((row) => row.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows.map((row) => row.balanceAfter)).toEqual([100, 200, 300, 400, 500, 600, 700, 800]);
  });

  it('rewards are per user: the same lesson pays every user once', async () => {
    const a = await h.newUser();
    const b = await h.newUser();
    await Promise.all([credit(lesson(a, 'concept:hop_luu')), credit(lesson(b, 'concept:hop_luu'))]);
    await expectLedgerConsistent(h, a, 100);
    await expectLedgerConsistent(h, b, 100);
  });

  it('runs inside the caller transaction: a rollback leaves no reward, ledger or coins', async () => {
    const userId = await h.newUser();
    await expect(
      h.database.transaction(async (tx) => {
        await h.rewards.creditFirstCompletion(
          tx,
          lesson(userId, 'guide:ch02-l01', { completionMethod: 'guide' }),
        );
        throw new Error('academy completion failed after the reward hook');
      }),
    ).rejects.toThrow('academy completion failed');
    expect(await allLedger(h, userId)).toHaveLength(0);
    expect((await snapshotOf(h, userId)).lessonsRewarded).toBe(0);
    // The lesson can still be rewarded later: the failed attempt consumed nothing.
    expect(
      await credit(lesson(userId, 'guide:ch02-l01', { completionMethod: 'guide' })),
    ).toMatchObject({
      status: 'credited',
      balanceAfter: 100,
    });
  });

  it('rejects keys that are not stable lesson keys without writing anything', async () => {
    const userId = await h.newUser();
    for (const lessonKey of ['ch07-l01', 'technical:', 'tool:rsi', 'technical:rsi extra', '']) {
      await expect(credit(lesson(userId, lessonKey))).rejects.toThrow(TypeError);
    }
    await expect(
      credit(lesson(userId, 'technical:rsi', { completionMethod: 'click' as 'quiz' })),
    ).rejects.toThrow(TypeError);
    await expect(
      credit(lesson(userId, 'technical:rsi', { completedAt: 'not-a-date' })),
    ).rejects.toThrow(TypeError);
    expect(await allLedger(h, userId)).toHaveLength(0);
  });

  it('keeps the old completion time in the evidence and writes the ledger at write time', async () => {
    const userId = await h.newUser();
    const before = Date.now();
    await h.database.transaction((tx) =>
      h.rewards.creditFirstCompletion(
        tx,
        lesson(userId, 'technical:macd', { completedAt: '2026-01-02T03:04:05.000Z' }),
        { source: 'backfill' },
      ),
    );
    const [row] = await allLedger(h, userId);
    expect(row?.ref).toMatchObject({
      lesson_key: 'technical:macd',
      completed_at: '2026-01-02T03:04:05.000Z',
      source: 'backfill',
      catalog_version: CATALOG,
    });
    expect(row!.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1_000);
  });

  it('keeps ledger rows ordered by seq even when many share one timestamp', async () => {
    const userId = await h.newUser();
    await fundLessons(h, userId, 5);
    const rows = await allLedger(h, userId);
    expect(rows.map((row) => row.seq)).toEqual([5, 4, 3, 2, 1]);
  });
});

describe('memory-only: ledger unique key format', () => {
  it('uses lesson_first_completion:<user>:<lesson_key> as the shared unique key', async () => {
    const h = memoryHarness();
    const userId = await h.newUser();
    await h.database.transaction((tx) =>
      h.rewards.creditFirstCompletion(tx, lesson(userId, 'technical:rsi')),
    );
    const memory = h.database as unknown as MemoryDatabase;
    expect(memory.state.ledger[0]?.uniqueKey).toBe(
      `lesson_first_completion:${userId}:technical:rsi`,
    );
    expect(lessonRewardUniqueKey(userId, 'technical:rsi')).toBe(memory.state.ledger[0]?.uniqueKey);
    expect(memory.state.ledger[0]?.policyVersion).toBe('iqx-shop-xu-v1');
  });
});
