import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  MASCOT_CATALOG,
  MASCOT_CATALOG_VERSION,
  type MascotId,
} from '../../src/modules/shop/shop.catalog.js';
import {
  activeMascotBodySchema,
  ledgerQuerySchema,
  purchaseBodySchema,
  purchaseKeyParamSchema,
} from '../../src/modules/shop/shop.schemas.js';
import {
  allLedger,
  expectLedgerConsistent,
  fundLessons,
  harnessFactories,
  snapshotOf,
  type ShopHarness,
} from './helpers/shop-harness.js';

let keyCounter = 0;
const nextKey = (label = 'k') => `${label}-${Date.now()}-${(keyCounter += 1)}`;

function buy(
  userId: string,
  mascotId: MascotId | string,
  overrides: Partial<{
    expected_price_xu: number;
    catalog_version: string;
    idempotency_key: string;
  }> = {},
) {
  return {
    mascot_id: mascotId,
    expected_price_xu: 500,
    catalog_version: MASCOT_CATALOG_VERSION,
    idempotency_key: nextKey(userId.slice(0, 4)),
    ...overrides,
  };
}

async function rejectedWith(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const response = (error as { getResponse?: () => unknown }).getResponse?.() as
      { code?: string; details?: unknown[] } | undefined;
    return { status: (error as { getStatus?: () => number }).getStatus?.(), ...response };
  }
  throw new Error('expected the call to be rejected');
}

describe('mascot catalog', () => {
  it('lists Bach Ho as the free default and four 500 xu mascots with real asset slugs', () => {
    expect(MASCOT_CATALOG_VERSION).toBe('iqx-mascot-shop-v1');
    expect(
      MASCOT_CATALOG.map((m) => [m.mascot_id, m.name, m.price_xu, m.for_sale, m.asset_slug]),
    ).toEqual([
      ['bach_ho', 'Bạch Hổ', 0, false, 'bach-ho'],
      ['thanh_long', 'Thanh Long', 500, true, 'thanh-long'],
      ['loc_huou', 'Lộc Hươu', 500, true, 'loc-huou'],
      ['phung_hoang', 'Phụng Hoàng', 500, true, 'phung-hoang'],
      ['kim_quy', 'Kim Quy', 500, true, 'kim-quy'],
    ]);
    expect(MASCOT_CATALOG.filter((m) => m.is_default).map((m) => m.mascot_id)).toEqual(['bach_ho']);
    expect(MASCOT_CATALOG.map((m) => m.sort_order)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('shop request schemas', () => {
  it('rejects client-supplied owner, balance, reward and non-integer prices', () => {
    const valid = {
      mascot_id: 'thanh_long',
      expected_price_xu: 500,
      catalog_version: MASCOT_CATALOG_VERSION,
      idempotency_key: 'purchase-0001',
    };
    expect(purchaseBodySchema.safeParse(valid).success).toBe(true);
    for (const extra of [
      { owner_id: 'x' },
      { balance: 9999 },
      { owned: true },
      { reward_xu: 100 },
    ]) {
      expect(purchaseBodySchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
    for (const price of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '500']) {
      expect(purchaseBodySchema.safeParse({ ...valid, expected_price_xu: price }).success).toBe(
        false,
      );
    }
    expect(purchaseBodySchema.safeParse({ ...valid, idempotency_key: 'short' }).success).toBe(
      false,
    );
    expect(
      purchaseBodySchema.safeParse({ ...valid, idempotency_key: '<script>alert(1)</script>' })
        .success,
    ).toBe(false);
    expect(purchaseKeyParamSchema.safeParse('a b c d e f g h').success).toBe(false);
  });

  it('validates the active mascot body and ledger paging query', () => {
    expect(
      activeMascotBodySchema.safeParse({ mascot_id: 'kim_quy', expected_revision: 2 }).success,
    ).toBe(true);
    expect(
      activeMascotBodySchema.safeParse({ mascot_id: 'kim_quy', expected_revision: 0 }).success,
    ).toBe(false);
    expect(activeMascotBodySchema.safeParse({ mascot_id: 'kim_quy' }).success).toBe(false);
    expect(ledgerQuerySchema.parse({}).limit).toBe(20);
    expect(ledgerQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(ledgerQuerySchema.safeParse({ cursor: 'abc' }).success).toBe(false);
    expect(ledgerQuerySchema.safeParse({ cursor: '42', limit: '10' }).success).toBe(true);
  });
});

describe.each(harnessFactories)(
  'shop purchase, ownership and active mascot ($name)',
  ({ create }) => {
    let h: ShopHarness;
    beforeAll(async () => {
      h = await create();
    });
    afterAll(async () => {
      await h.close();
    });

    describe('read-only shop state', () => {
      it('serves a brand-new user from defaults without writing anything', async () => {
        const userId = await h.newUser();
        const transaction = vi.spyOn(h.database, 'transaction');
        const shop = await h.shop.getShop(userId);
        const ledger = await h.shop.listLedger(userId, { limit: 20 });
        const status = await h.shop.getPurchaseStatus(userId, 'never-sent-key');
        expect(transaction).not.toHaveBeenCalled();
        transaction.mockRestore();

        expect(shop).toMatchObject({
          catalog_version: MASCOT_CATALOG_VERSION,
          wallet: { balance: 0, last_seq: 0 },
          totals: { earned_xu: 0, spent_xu: 0, lessons_rewarded: 0 },
          owned_count: 1,
          total_count: 5,
          provisioned: false,
          active: { mascot_id: 'bach_ho', revision: 1, updated_at: null },
        });
        expect(shop.owned.map((o) => [o.mascot_id, o.source])).toEqual([['bach_ho', 'default']]);
        expect(shop.catalog.map((m) => m.mascot_id)).toEqual([
          'bach_ho',
          'thanh_long',
          'loc_huou',
          'phung_hoang',
          'kim_quy',
        ]);
        expect(shop.catalog[1]).toMatchObject({
          price_xu: 500,
          asset_root: '/assets/mascots-2d/v2/thanh-long',
        });
        expect(ledger).toEqual({ items: [], next_cursor: null });
        expect(status).toMatchObject({ status: 'not_found', purchase: null });
        // Nothing was created by reading.
        expect(await snapshotOf(h, userId)).toMatchObject({ wallet: null, profile: null });
      });

      it('shows a legacy mascot as owned and active before onboarding materialises it', async () => {
        const userId = await h.newUser({ legacyMascot: 'kim_quy' });
        const shop = await h.shop.getShop(userId);
        expect(shop.active.mascot_id).toBe('kim_quy');
        expect(shop.owned.map((o) => [o.mascot_id, o.source])).toEqual([
          ['bach_ho', 'default'],
          ['kim_quy', 'legacy_grant'],
        ]);
        expect(shop.provisioned).toBe(false);
      });
    });

    describe('provisioning', () => {
      it('creates a 0 xu wallet, default ownership and an active Bach Ho exactly once', async () => {
        const userId = await h.newUser();
        const [first, second, third] = await Promise.all([
          h.shop.provision(userId),
          h.shop.provision(userId),
          h.shop.provision(userId),
        ]);
        const results = [first, second, third];
        expect(results.filter((r) => r.mascot.created)).toHaveLength(1);
        expect(results.filter((r) => r.wallet.created)).toHaveLength(1);
        for (const r of results) {
          expect(r.mascot).toMatchObject({
            active_mascot_id: 'bach_ho',
            revision: 1,
            owned: ['bach_ho'],
          });
          expect(r.wallet.balance).toBe(0);
        }
        const shop = await h.shop.getShop(userId);
        expect(shop).toMatchObject({ provisioned: true, owned_count: 1 });
        expect(shop.owned[0]).toMatchObject({ mascot_id: 'bach_ho', source: 'default' });
      });

      it('keeps a legacy mascot (owned + active) and still owns Bach Ho', async () => {
        const userId = await h.newUser({ legacyMascot: 'kim_quy' });
        const result = await h.shop.provision(userId);
        expect(result.mascot.active_mascot_id).toBe('kim_quy');
        expect([...result.mascot.owned].sort()).toEqual(['bach_ho', 'kim_quy']);
        const shop = await h.shop.getShop(userId);
        expect(shop.owned.find((o) => o.mascot_id === 'kim_quy')?.source).toBe('legacy_grant');
        expect((await h.shop.provision(userId)).mascot.created).toBe(false);
        // A legacy holder never pays for the mascot they already have.
        const purchase = await h.shop.purchase(userId, buy(userId, 'kim_quy'));
        expect(purchase.status).toBe('already_owned');
        expect(await allLedger(h, userId)).toHaveLength(0);
      });
    });

    describe('purchase', () => {
      it('P01: 500 xu buys one mascot: balance 0, one purchase, one -500 entry, active unchanged', async () => {
        const userId = await h.newUser();
        await fundLessons(h, userId, 5);
        const result = await h.shop.purchase(userId, buy(userId, 'thanh_long'));
        expect(result).toMatchObject({
          status: 'purchased',
          replayed: false,
          wallet: { balance: 0, last_seq: 6 },
          active: { mascot_id: 'bach_ho', revision: 1 },
          catalog_version: MASCOT_CATALOG_VERSION,
          purchase: { mascot_id: 'thanh_long', price_xu: 500 },
        });
        expect(result.owned.map((o) => o.mascot_id).sort()).toEqual(['bach_ho', 'thanh_long']);
        expect(result.owned.find((o) => o.mascot_id === 'thanh_long')?.source).toBe('purchase');

        const rows = await expectLedgerConsistent(h, userId, 0);
        const purchases = rows.filter((r) => r.kind === 'mascot_purchase');
        expect(purchases).toHaveLength(1);
        expect(purchases[0]).toMatchObject({ delta: -500, balanceAfter: 0, seq: 6 });
        expect(purchases[0]?.ref).toMatchObject({ mascot_id: 'thanh_long' });
      });

      it('refuses with INSUFFICIENT_XU (and the current balance) when short, changing nothing', async () => {
        const userId = await h.newUser();
        await fundLessons(h, userId, 4);
        const error = await rejectedWith(h.shop.purchase(userId, buy(userId, 'loc_huou')));
        expect(error).toMatchObject({ status: 409, code: 'INSUFFICIENT_XU' });
        expect(error.details).toEqual([{ balance_xu: 400, price_xu: 500, shortfall_xu: 100 }]);
        const snapshot = await snapshotOf(h, userId);
        expect(snapshot.wallet).toMatchObject({ balance: 400, lastSeq: 4 });
        expect(snapshot.owned.map((o) => o.mascotId)).not.toContain('loc_huou');
        await expectLedgerConsistent(h, userId, 400);
      });

      it('a user with no wallet at all is refused with a 0 xu balance', async () => {
        const userId = await h.newUser();
        const error = await rejectedWith(h.shop.purchase(userId, buy(userId, 'phung_hoang')));
        expect(error).toMatchObject({ status: 409, code: 'INSUFFICIENT_XU' });
        expect(error.details).toEqual([{ balance_xu: 0, price_xu: 500, shortfall_xu: 500 }]);
      });

      it('P07: replaying the same key and payload returns the same purchase without a second charge', async () => {
        const userId = await h.newUser();
        await fundLessons(h, userId, 10);
        const request = buy(userId, 'thanh_long');
        const first = await h.shop.purchase(userId, request);
        const second = await h.shop.purchase(userId, request);
        expect(second).toMatchObject({
          status: 'purchased',
          replayed: true,
          wallet: { balance: 500 },
        });
        expect(second.purchase?.id).toBe(first.purchase?.id);
        expect(second.purchase?.ledger_id).toBe(first.purchase?.ledger_id);
        const rows = await expectLedgerConsistent(h, userId, 500);
        expect(rows.filter((r) => r.kind === 'mascot_purchase')).toHaveLength(1);

        const lookup = await h.shop.getPurchaseStatus(userId, request.idempotency_key);
        expect(lookup).toMatchObject({ status: 'completed', wallet: { balance: 500 } });
        expect(lookup.purchase?.id).toBe(first.purchase?.id);
      });

      it('P07: the same key with a different payload is rejected and never buys another mascot', async () => {
        const userId = await h.newUser();
        await fundLessons(h, userId, 10);
        const request = buy(userId, 'thanh_long');
        await h.shop.purchase(userId, request);
        const other = await rejectedWith(
          h.shop.purchase(userId, { ...request, mascot_id: 'loc_huou' }),
        );
        expect(other).toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
        const otherPrice = await rejectedWith(
          h.shop.purchase(userId, { ...request, expected_price_xu: 400 }),
        );
        expect(otherPrice).toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
        const snapshot = await snapshotOf(h, userId);
        expect(snapshot.owned.map((o) => o.mascotId)).not.toContain('loc_huou');
        await expectLedgerConsistent(h, userId, 500);
      });

      it('P04: with 600 xu, two concurrent purchases of different mascots: one wins, 100 xu left', async () => {
        const userId = await h.newUser();
        await fundLessons(h, userId, 6);
        const outcomes = await Promise.allSettled([
          h.shop.purchase(userId, buy(userId, 'thanh_long')),
          h.shop.purchase(userId, buy(userId, 'loc_huou')),
        ]);
        expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
        const rejected = outcomes.find((o) => o.status === 'rejected');
        expect((rejected as PromiseRejectedResult).reason).toMatchObject({
          response: { code: 'INSUFFICIENT_XU' },
        });
        const rows = await expectLedgerConsistent(h, userId, 100);
        expect(rows.filter((r) => r.kind === 'mascot_purchase')).toHaveLength(1);
        expect((await snapshotOf(h, userId)).owned).toHaveLength(2); // bach_ho + the winner
      });

      it('with 1,000 xu both different purchases succeed and leave exactly 0', async () => {
        const userId = await h.newUser();
        await fundLessons(h, userId, 10);
        const outcomes = await Promise.allSettled([
          h.shop.purchase(userId, buy(userId, 'thanh_long')),
          h.shop.purchase(userId, buy(userId, 'loc_huou')),
        ]);
        expect(outcomes.every((o) => o.status === 'fulfilled')).toBe(true);
        await expectLedgerConsistent(h, userId, 0);
      });

      it('P05: two concurrent purchases of the same mascot (fresh keys) charge only once', async () => {
        const userId = await h.newUser();
        await fundLessons(h, userId, 10);
        const results = await Promise.all([
          h.shop.purchase(userId, buy(userId, 'phung_hoang')),
          h.shop.purchase(userId, buy(userId, 'phung_hoang')),
          h.shop.purchase(userId, buy(userId, 'phung_hoang')),
        ]);
        expect(results.filter((r) => r.status === 'purchased')).toHaveLength(1);
        expect(results.filter((r) => r.status === 'already_owned')).toHaveLength(2);
        for (const r of results.filter((x) => x.status === 'already_owned')) {
          expect(r.purchase).toBeNull();
        }
        const rows = await expectLedgerConsistent(h, userId, 500);
        expect(rows.filter((r) => r.kind === 'mascot_purchase')).toHaveLength(1);
      });

      it('buying an already owned mascot with a new key never charges', async () => {
        const userId = await h.newUser();
        await fundLessons(h, userId, 6);
        await h.shop.purchase(userId, buy(userId, 'kim_quy'));
        const again = await h.shop.purchase(userId, buy(userId, 'kim_quy'));
        expect(again).toMatchObject({
          status: 'already_owned',
          replayed: false,
          wallet: { balance: 100 },
        });
        await expectLedgerConsistent(h, userId, 100);
      });

      it('P08: resolves the price on the server and rejects stale price or catalog confirmations', async () => {
        const userId = await h.newUser();
        await fundLessons(h, userId, 6);
        const cheap = await rejectedWith(
          h.shop.purchase(userId, buy(userId, 'thanh_long', { expected_price_xu: 1 })),
        );
        expect(cheap).toMatchObject({ status: 409, code: 'PRICE_CHANGED' });
        expect(cheap.details).toEqual([
          { current_price_xu: 500, catalog_version: MASCOT_CATALOG_VERSION },
        ]);
        const stale = await rejectedWith(
          h.shop.purchase(
            userId,
            buy(userId, 'thanh_long', { catalog_version: 'iqx-mascot-shop-v0' }),
          ),
        );
        expect(stale).toMatchObject({ status: 409, code: 'CATALOG_CHANGED' });
        const unknown = await rejectedWith(h.shop.purchase(userId, buy(userId, 'rong_vang')));
        expect(unknown).toMatchObject({ status: 404, code: 'MASCOT_NOT_FOUND' });
        const free = await rejectedWith(
          h.shop.purchase(userId, buy(userId, 'bach_ho', { expected_price_xu: 0 })),
        );
        expect(free).toMatchObject({ status: 409, code: 'MASCOT_NOT_FOR_SALE' });
        await expectLedgerConsistent(h, userId, 600);
        expect((await snapshotOf(h, userId)).owned.map((o) => o.mascotId)).not.toContain(
          'thanh_long',
        );
      });

      it('P06: a failure between the ledger entry and the ownership rolls the whole purchase back', async () => {
        const userId = await h.newUser();
        await fundLessons(h, userId, 5);
        const spy = vi.spyOn(h.repository, 'insertOwnership').mockImplementationOnce(async () => {
          throw new Error('injected failure after ledger and purchase rows');
        });
        await expect(h.shop.purchase(userId, buy(userId, 'thanh_long'))).rejects.toThrow(
          'injected',
        );
        spy.mockRestore();

        const snapshot = await snapshotOf(h, userId);
        expect(snapshot.wallet).toMatchObject({ balance: 500, lastSeq: 5 });
        expect(snapshot.owned.map((o) => o.mascotId)).not.toContain('thanh_long');
        const rows = await expectLedgerConsistent(h, userId, 500);
        expect(rows.some((r) => r.kind === 'mascot_purchase')).toBe(false);
        // The same request can be retried afterwards and succeeds exactly once.
        const retry = await h.shop.purchase(userId, buy(userId, 'thanh_long'));
        expect(retry.status).toBe('purchased');
        await expectLedgerConsistent(h, userId, 0);
      });

      it('never changes the active mascot or its revision', async () => {
        const userId = await h.newUser();
        await fundLessons(h, userId, 5);
        await h.shop.provision(userId);
        const before = (await h.shop.getShop(userId)).active;
        await h.shop.purchase(userId, buy(userId, 'loc_huou'));
        const after = (await h.shop.getShop(userId)).active;
        expect(after.mascot_id).toBe('bach_ho');
        expect(after.revision).toBe(before.revision);
      });
    });

    describe('rewards and purchases share one wallet', () => {
      it('L03: concurrent rewards and purchases never lose an update or overspend', async () => {
        const userId = await h.newUser();
        await fundLessons(h, userId, 5);
        const rewards = Array.from({ length: 5 }, (_, index) =>
          h.database.transaction((tx) =>
            h.rewards.creditFirstCompletion(tx, {
              userId,
              lessonKey: `fundamental:late${index}`,
              lessonId: `late${index}`,
              catalogVersion: 'v1',
              completionMethod: 'quiz',
              completedAt: new Date().toISOString(),
            }),
          ),
        );
        const purchases = ['thanh_long', 'loc_huou', 'phung_hoang'].map((id) =>
          h.shop.purchase(userId, buy(userId, id)).catch((error: unknown) => error),
        );
        const settled = await Promise.all([...rewards, ...purchases]);
        for (const outcome of settled.slice(5)) {
          // Either a committed purchase or a clean "not enough xu at commit time" refusal.
          const code = (outcome as { response?: { code?: string } }).response?.code;
          expect(code === undefined || code === 'INSUFFICIENT_XU').toBe(true);
        }
        const rows = await expectLedgerConsistent(
          h,
          userId,
          1000 - 500 * (await purchasesMade(h, userId)),
        );
        expect(rows.filter((r) => r.kind === 'lesson_first_completion')).toHaveLength(10);
      });

      it('L01/L08: 71 rewards and four purchases reconcile to 7,100 earned / 2,000 spent / 5,100 left', async () => {
        const userId = await h.newUser();
        await fundLessons(h, userId, 71, 'fundamental:l');
        for (const id of ['thanh_long', 'loc_huou', 'phung_hoang', 'kim_quy']) {
          await h.shop.purchase(userId, buy(userId, id));
        }
        const shop = await h.shop.getShop(userId);
        expect(shop).toMatchObject({
          wallet: { balance: 5100, last_seq: 75 },
          totals: { earned_xu: 7100, spent_xu: 2000, lessons_rewarded: 71 },
          owned_count: 5,
          active: { mascot_id: 'bach_ho' },
        });
        await expectLedgerConsistent(h, userId, 5100);
      });
    });

    describe('active mascot', () => {
      async function ownedUser(...mascots: string[]) {
        const userId = await h.newUser();
        await fundLessons(h, userId, mascots.length * 5);
        for (const id of mascots) await h.shop.purchase(userId, buy(userId, id));
        return userId;
      }

      it('E04: rejects a mascot that is not owned and keeps the previous choice', async () => {
        const userId = await h.newUser();
        await h.shop.provision(userId);
        const error = await rejectedWith(
          h.shop.setActiveMascot(userId, { mascot_id: 'kim_quy', expected_revision: 1 }),
        );
        expect(error).toMatchObject({ status: 409, code: 'MASCOT_NOT_OWNED' });
        expect((await h.shop.getShop(userId)).active).toMatchObject({
          mascot_id: 'bach_ho',
          revision: 1,
        });
        expect(await allLedger(h, userId)).toHaveLength(0);
      });

      it('E02/E03: switching is free, bumps the revision and keeps every ownership', async () => {
        const userId = await ownedUser('thanh_long');
        const balance = (await h.shop.getShop(userId)).wallet.balance;
        const ledgerBefore = (await allLedger(h, userId)).length;

        const toLong = await h.shop.setActiveMascot(userId, {
          mascot_id: 'thanh_long',
          expected_revision: 1,
        });
        expect(toLong).toMatchObject({
          changed: true,
          active: { mascot_id: 'thanh_long', revision: 2 },
        });
        const back = await h.shop.setActiveMascot(userId, {
          mascot_id: 'bach_ho',
          expected_revision: 2,
        });
        expect(back).toMatchObject({
          changed: true,
          active: { mascot_id: 'bach_ho', revision: 3 },
        });

        const shop = await h.shop.getShop(userId);
        expect(shop.owned.map((o) => o.mascot_id).sort()).toEqual(['bach_ho', 'thanh_long']);
        expect(shop.wallet.balance).toBe(balance);
        expect(await allLedger(h, userId)).toHaveLength(ledgerBefore);
      });

      it('E05: choosing the already active mascot is a no-op without a revision bump', async () => {
        const userId = await ownedUser('loc_huou');
        await h.shop.setActiveMascot(userId, { mascot_id: 'loc_huou', expected_revision: 1 });
        const same = await h.shop.setActiveMascot(userId, {
          mascot_id: 'loc_huou',
          expected_revision: 2,
        });
        expect(same).toMatchObject({
          changed: false,
          active: { mascot_id: 'loc_huou', revision: 2 },
        });
        // A stale revision for the state that already holds is also a harmless no-op.
        const stale = await h.shop.setActiveMascot(userId, {
          mascot_id: 'loc_huou',
          expected_revision: 1,
        });
        expect(stale).toMatchObject({ changed: false, active: { revision: 2 } });
      });

      it('E06: a stale revision is a 409 that never overwrites the newer choice', async () => {
        const userId = await ownedUser('thanh_long', 'loc_huou');
        await h.shop.provision(userId);
        // Device A and device B both read revision 1.
        await h.shop.setActiveMascot(userId, { mascot_id: 'thanh_long', expected_revision: 1 });
        const late = await rejectedWith(
          h.shop.setActiveMascot(userId, { mascot_id: 'loc_huou', expected_revision: 1 }),
        );
        expect(late).toMatchObject({ status: 409, code: 'REVISION_CONFLICT' });
        expect(late.details).toEqual([{ current_revision: 2, active_mascot_id: 'thanh_long' }]);
        expect((await h.shop.getShop(userId)).active).toMatchObject({
          mascot_id: 'thanh_long',
          revision: 2,
        });
      });

      it('rejects an unknown mascot id with 404 and works for a user who was never provisioned', async () => {
        const userId = await h.newUser();
        const unknown = await rejectedWith(
          h.shop.setActiveMascot(userId, { mascot_id: 'rong_vang', expected_revision: 1 }),
        );
        expect(unknown).toMatchObject({ status: 404, code: 'MASCOT_NOT_FOUND' });
        const noop = await h.shop.setActiveMascot(userId, {
          mascot_id: 'bach_ho',
          expected_revision: 1,
        });
        expect(noop).toMatchObject({
          changed: false,
          active: { mascot_id: 'bach_ho', revision: 1 },
        });
      });
    });

    describe('coin ledger pagination', () => {
      it('L04: walks the whole ledger by seq with no gaps or duplicates', async () => {
        const userId = await h.newUser();
        await fundLessons(h, userId, 10);
        await h.shop.purchase(userId, buy(userId, 'thanh_long'));
        await h.shop.purchase(userId, buy(userId, 'loc_huou'));

        const seen: number[] = [];
        let cursor: string | undefined;
        let pages = 0;
        do {
          const page = await h.shop.listLedger(userId, { limit: 3, cursor });
          pages += 1;
          seen.push(...page.items.map((item) => item.seq));
          for (const item of page.items) {
            expect(item.label).toBeDefined();
            expect(typeof item.created_at).toBe('string');
          }
          cursor = page.next_cursor ?? undefined;
        } while (cursor);

        const total = (await allLedger(h, userId)).length;
        expect(seen).toHaveLength(total);
        expect(new Set(seen).size).toBe(total);
        expect(seen).toEqual([...seen].sort((a, b) => b - a));
        expect(pages).toBe(Math.ceil(total / 3));

        const firstPage = await h.shop.listLedger(userId, { limit: 20 });
        const purchase = firstPage.items.find(
          (item) => item.kind === 'mascot_purchase' && item.label.mascot_id === 'thanh_long',
        );
        expect(purchase).toMatchObject({
          delta: -500,
          label: { mascot_id: 'thanh_long', mascot_name: 'Thanh Long' },
        });
        const reward = firstPage.items.find((item) => item.kind === 'lesson_first_completion');
        expect(reward?.delta).toBe(100);
        expect(reward?.label.lesson_key).toMatch(/^technical:fund/);
      });
    });
  },
);

async function purchasesMade(h: ShopHarness, userId: string): Promise<number> {
  return (await allLedger(h, userId)).filter((r) => r.kind === 'mascot_purchase').length;
}
