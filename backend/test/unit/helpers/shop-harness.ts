import { randomUUID } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';
import { expect } from 'vitest';

import { LessonRewardService } from '../../../src/modules/shop/lesson-reward.service.js';
import type { MascotId } from '../../../src/modules/shop/shop.catalog.js';
import {
  PgShopRepository,
  ShopRepository,
  type LedgerRow,
  type ShopSnapshot,
} from '../../../src/modules/shop/shop.repository.js';
import { ShopService } from '../../../src/modules/shop/shop.service.js';
import { DatabaseService } from '../../../src/platform/database/database.service.js';
import { MemoryDatabase, MemoryShopRepository, newUserId } from './shop-memory.js';

export interface ShopHarness {
  readonly name: 'memory' | 'postgres';
  readonly database: DatabaseService;
  readonly repository: ShopRepository;
  readonly shop: ShopService;
  readonly rewards: LessonRewardService;
  newUser(options?: { legacyMascot?: MascotId }): Promise<string>;
  close(): Promise<void>;
}

export interface HarnessFactory {
  readonly name: ShopHarness['name'];
  create(): Promise<ShopHarness>;
}

export function memoryHarness(): ShopHarness {
  const memory = new MemoryDatabase();
  const repository = new MemoryShopRepository();
  const database = memory.asDatabaseService();
  return {
    name: 'memory',
    database,
    repository,
    shop: new ShopService(database, repository),
    rewards: new LessonRewardService(repository),
    async newUser(options = {}) {
      const userId = newUserId();
      if (options.legacyMascot) memory.state.legacy.set(userId, options.legacyMascot);
      return userId;
    },
    async close() {
      /* nothing to release */
    },
  };
}

/**
 * Real PostgreSQL harness. Opt-in: set SHOP_TEST_DATABASE_URL to an already migrated, isolated
 * `iqx_v2_test_*` / `iqx_v2_system_*` database on a local host. It never runs by default.
 */
export async function postgresHarness(connectionString: string): Promise<ShopHarness> {
  const url = new URL(connectionString);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/^iqx_v2_(test|system)_[a-z0-9_]+$/.test(name)) {
    throw new Error(`Refusing to run shop tests against database ${name || '<empty>'}`);
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error('SHOP_TEST_DATABASE_URL must target a local isolated database');
  }
  const values: Record<string, unknown> = {
    DATABASE_URL: connectionString,
    DB_STATEMENT_TIMEOUT_MS: 10_000,
    DB_POOL_MAX: 10,
    DB_CONNECT_TIMEOUT_MS: 5_000,
    DB_READ_ONLY: false,
  };
  const database = new DatabaseService({
    get: (key: string) => values[key],
  } as unknown as ConfigService<never, true>);
  const repository = new PgShopRepository();
  return {
    name: 'postgres',
    database,
    repository,
    shop: new ShopService(database, repository),
    rewards: new LessonRewardService(repository),
    async newUser(options = {}) {
      const rows = await database.query<{ id: string }>(
        `insert into users (email, hashed_password, full_name)
         values ($1, 'x', 'Shop Test') returning id`,
        [`shop-${randomUUID()}@test.invalid`],
      );
      const userId = rows[0]!.id;
      if (options.legacyMascot) {
        await database.query(
          `insert into bot_mascot_profiles
             (user_id, mascot_rules_version, assignment_status, mascot_id, dominant_layer,
              assignment_basis, window_start, window_end, valid_pair_count, match_counts,
              tied_layers, selected_assessment_refs, dataset_hash, excluded_records_summary,
              assigned_at, created_at, updated_at)
           values ($1, 1, 'assigned', $2, 'ky_thuat', 'ai_match_count',
                   now() - interval '1 day', now() - interval '1 hour', 1, '{}'::jsonb,
                   '[]'::jsonb, '[]'::jsonb, 'x', '{}'::jsonb, now(), now(), now())`,
          [userId, options.legacyMascot],
        );
      }
      return userId;
    },
    async close() {
      await database.close();
    },
  };
}

export const harnessFactories: HarnessFactory[] = [
  { name: 'memory', create: async () => memoryHarness() },
  ...(process.env.SHOP_TEST_DATABASE_URL
    ? [
        {
          name: 'postgres' as const,
          create: () => postgresHarness(process.env.SHOP_TEST_DATABASE_URL!),
        },
      ]
    : []),
];

/** Credit `count` distinct lessons (100 xu each) through the real reward service. */
export async function fundLessons(
  harness: ShopHarness,
  userId: string,
  count: number,
  prefix = 'technical:fund',
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await harness.database.transaction((tx) =>
      harness.rewards.creditFirstCompletion(tx, {
        userId,
        lessonKey: `${prefix}${index}`,
        lessonId: `fund${index}`,
        catalogVersion: 'iqx-academy-outline-13ch-71lessons-v1',
        completionMethod: 'quiz',
        completedAt: new Date().toISOString(),
      }),
    );
  }
}

export function allLedger(harness: ShopHarness, userId: string): Promise<LedgerRow[]> {
  return harness.repository.listLedger(harness.database, userId, { beforeSeq: null, limit: 1000 });
}

export function snapshotOf(harness: ShopHarness, userId: string): Promise<ShopSnapshot> {
  return harness.repository.readSnapshot(harness.database, userId);
}

/** Wallet === replay of the ledger: contiguous seq, running balance_after, never negative. */
export async function expectLedgerConsistent(
  harness: ShopHarness,
  userId: string,
  expectedBalance: number,
): Promise<LedgerRow[]> {
  const rows = (await allLedger(harness, userId)).sort((a, b) => a.seq - b.seq);
  let running = 0;
  rows.forEach((row, index) => {
    running += row.delta;
    expect(row.seq).toBe(index + 1);
    expect(row.balanceAfter).toBe(running);
    expect(running).toBeGreaterThanOrEqual(0);
  });
  const wallet = await harness.repository.readWallet(harness.database, userId);
  expect(wallet?.balance ?? 0).toBe(expectedBalance);
  expect(running).toBe(expectedBalance);
  expect(wallet?.lastSeq ?? 0).toBe(rows.length);
  return rows;
}
