import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DEMO_CASH_MIN_EXCHANGE,
  DEMO_CASH_PER_XU,
  MASCOT_CATALOG_VERSION,
  MASCOT_PRICE_XU,
  PET_EVOLVE_LEVEL2_XU,
  PET_EVOLVE_LEVEL3_XU,
  PREMIUM_DURATION_DAYS,
  PREMIUM_PRICE_XU,
} from '../../src/modules/shop/shop.catalog.js';
import { ledgerItemSchema } from '../../src/modules/shop/shop.schemas.js';
import {
  allLedger,
  expectLedgerConsistent,
  fundLessons,
  harnessFactories,
  type ShopHarness,
} from './helpers/shop-harness.js';

let keyCounter = 0;
const nextKey = (label = 'econ') => `${label}-${Date.now()}-${(keyCounter += 1)}`;

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

describe('xu economy prices', () => {
  it('uses the new shop prices of the Flashback spec 1.2', () => {
    expect(MASCOT_PRICE_XU).toBe(2000);
    expect(PREMIUM_PRICE_XU).toBe(3000);
    expect(PREMIUM_DURATION_DAYS).toBe(30);
    expect(PET_EVOLVE_LEVEL2_XU).toBe(10_000);
    expect(PET_EVOLVE_LEVEL3_XU).toBe(30_000);
    expect(DEMO_CASH_PER_XU).toBe(10_000);
    expect(DEMO_CASH_MIN_EXCHANGE).toBe(10_000);
    expect(MASCOT_CATALOG_VERSION).toBe('iqx-mascot-shop-v2');
    // Lên cấp 3 tốn tổng 40.000 xu cho một linh thú.
    expect(PET_EVOLVE_LEVEL2_XU + PET_EVOLVE_LEVEL3_XU).toBe(40_000);
    expect(ledgerItemSchema.shape.kind.options).toContain('flashback_fee');
    expect(ledgerItemSchema.shape.kind.options).toContain('flashback_reward');
    // Old rows of the retired kinds and the 0056 refund stay readable in the xu history.
    expect(ledgerItemSchema.shape.kind.options).toEqual(
      expect.arrayContaining([
        'premium_purchase',
        'demo_deposit',
        'demo_withdraw',
        'demo_exchange_refund',
      ]),
    );
  });
});

describe.each(harnessFactories)(
  'xu economy: shop, evolution, premium and exchange ($name)',
  ({ create }) => {
    let h: ShopHarness;
    beforeAll(async () => {
      h = await create();
    });
    afterAll(async () => {
      await h.close();
    });

    it('buys a mascot for 2.000 xu and writes one debit row', async () => {
      const userId = await h.newUser();
      await fundLessons(h, userId, 20);
      const result = await h.shop.purchase(userId, {
        mascot_id: 'thanh_long',
        expected_price_xu: MASCOT_PRICE_XU,
        catalog_version: MASCOT_CATALOG_VERSION,
        idempotency_key: nextKey('buy'),
      });
      expect(result).toMatchObject({
        status: 'purchased',
        wallet: { balance: 0 },
        purchase: { mascot_id: 'thanh_long', price_xu: MASCOT_PRICE_XU },
      });
      const rows = await expectLedgerConsistent(h, userId, 0);
      const purchases = rows.filter((row) => row.kind === 'pet_purchase');
      expect(purchases).toHaveLength(1);
      expect(purchases[0]).toMatchObject({ delta: -MASCOT_PRICE_XU, balanceAfter: 0 });
    });

    it('evolves a mascot to level 2 for 10.000 xu and to level 3 for 30.000 xu', async () => {
      const userId = await h.newUser();
      await fundLessons(h, userId, 420);
      await h.shop.purchase(userId, {
        mascot_id: 'thanh_long',
        expected_price_xu: MASCOT_PRICE_XU,
        catalog_version: MASCOT_CATALOG_VERSION,
        idempotency_key: nextKey('buy'),
      });

      const level2 = await h.shop.evolvePet(userId, 'thanh_long', {
        target_level: 2,
        expected_price_xu: PET_EVOLVE_LEVEL2_XU,
        idempotency_key: nextKey('evo'),
      });
      expect(level2).toMatchObject({
        status: 'evolved',
        replayed: false,
        mascot_id: 'thanh_long',
        level: 2,
        previous_level: 1,
        price_xu: PET_EVOLVE_LEVEL2_XU,
        wallet: { balance: 30_000 },
      });

      const level3 = await h.shop.evolvePet(userId, 'thanh_long', {
        target_level: 3,
        expected_price_xu: PET_EVOLVE_LEVEL3_XU,
        idempotency_key: nextKey('evo'),
      });
      expect(level3).toMatchObject({
        status: 'evolved',
        level: 3,
        previous_level: 2,
        wallet: { balance: 0 },
      });

      const rows = await expectLedgerConsistent(h, userId, 0);
      const evolutions = rows.filter((row) => row.kind === 'pet_evolve');
      expect(evolutions).toHaveLength(2);
      expect(evolutions.map((row) => row.delta).sort((a, b) => a - b)).toEqual([
        -PET_EVOLVE_LEVEL3_XU,
        -PET_EVOLVE_LEVEL2_XU,
      ]);
      // 40.000 xu cho một linh thú lên cấp 3.
      expect(evolutions.reduce((sum, row) => sum + Math.abs(row.delta), 0) + MASCOT_PRICE_XU).toBe(
        42_000,
      );
    });

    it('keeps the level of each mascot and never skips level 2', async () => {
      const userId = await h.newUser();
      await fundLessons(h, userId, 130);
      await h.shop.purchase(userId, {
        mascot_id: 'thanh_long',
        expected_price_xu: MASCOT_PRICE_XU,
        catalog_version: MASCOT_CATALOG_VERSION,
        idempotency_key: nextKey('buy'),
      });

      const locked = await rejectedWith(
        h.shop.evolvePet(userId, 'thanh_long', {
          target_level: 3,
          expected_price_xu: PET_EVOLVE_LEVEL3_XU,
          idempotency_key: nextKey('evo'),
        }),
      );
      expect(locked).toMatchObject({ status: 409, code: 'PET_LEVEL_LOCKED' });

      const notOwned = await rejectedWith(
        h.shop.evolvePet(userId, 'kim_quy', {
          target_level: 2,
          expected_price_xu: PET_EVOLVE_LEVEL2_XU,
          idempotency_key: nextKey('evo'),
        }),
      );
      expect(notOwned).toMatchObject({ status: 409, code: 'PET_NOT_OWNED' });

      await h.shop.evolvePet(userId, 'thanh_long', {
        target_level: 2,
        expected_price_xu: PET_EVOLVE_LEVEL2_XU,
        idempotency_key: nextKey('evo'),
      });
      const maxed = await rejectedWith(
        h.shop.evolvePet(userId, 'thanh_long', {
          target_level: 2,
          expected_price_xu: PET_EVOLVE_LEVEL2_XU,
          idempotency_key: nextKey('evo'),
        }),
      );
      expect(maxed).toMatchObject({ status: 409, code: 'PET_MAX_LEVEL' });

      // Cấp giữ nguyên khi người dùng đổi linh thú.
      const shop = await h.shop.getShop(userId);
      expect(shop.pet_levels.find((row) => row.mascot_id === 'thanh_long')?.level).toBe(2);
      expect(shop.pet_levels.find((row) => row.mascot_id === 'bach_ho')?.level).toBe(1);
    });

    it('replays an evolution without charging twice', async () => {
      const userId = await h.newUser();
      await fundLessons(h, userId, 130);
      await h.shop.purchase(userId, {
        mascot_id: 'thanh_long',
        expected_price_xu: MASCOT_PRICE_XU,
        catalog_version: MASCOT_CATALOG_VERSION,
        idempotency_key: nextKey('buy'),
      });
      const request = {
        target_level: 2 as const,
        expected_price_xu: PET_EVOLVE_LEVEL2_XU,
        idempotency_key: nextKey('evo'),
      };
      const first = await h.shop.evolvePet(userId, 'thanh_long', request);
      const second = await h.shop.evolvePet(userId, 'thanh_long', request);
      expect(second).toMatchObject({ status: 'evolved', replayed: true, level: 2 });
      expect(second.wallet.balance).toBe(first.wallet.balance);
      const rows = await expectLedgerConsistent(h, userId, first.wallet.balance);
      expect(rows.filter((row) => row.kind === 'pet_evolve')).toHaveLength(1);
    });

    it('answers 410 SHOP_PREMIUM_REMOVED for Premium with xu and never touches the wallet', async () => {
      const userId = await h.newUser();
      await fundLessons(h, userId, 30);
      const before = await allLedger(h, userId);
      const removed = await rejectedWith(Promise.resolve().then(() => h.shop.purchasePremium()));
      expect(removed).toMatchObject({ status: 410, code: 'SHOP_PREMIUM_REMOVED' });
      const rows = await expectLedgerConsistent(h, userId, 3000);
      expect(rows).toHaveLength(before.length);
      expect(rows.some((row) => row.kind === 'premium_purchase')).toBe(false);
    });

    it('answers 410 DEMO_EXCHANGE_REMOVED for the xu <-> Demo cash exchange', async () => {
      const userId = await h.newUser();
      await fundLessons(h, userId, 10);
      const removed = await rejectedWith(Promise.resolve().then(() => h.shop.exchangeDemo()));
      expect(removed).toMatchObject({ status: 410, code: 'DEMO_EXCHANGE_REMOVED' });
      const rows = await expectLedgerConsistent(h, userId, 1000);
      expect(rows.some((row) => ['demo_deposit', 'demo_withdraw'].includes(row.kind))).toBe(false);
    });

    it('serves the new prices, the exchange rate and the pet levels in the shop state', async () => {
      const userId = await h.newUser();
      const shop = await h.shop.getShop(userId);
      expect(shop).toMatchObject({
        catalog_version: MASCOT_CATALOG_VERSION,
        premium_price_xu: PREMIUM_PRICE_XU,
        premium_duration_days: PREMIUM_DURATION_DAYS,
        exchange: {
          cash_per_xu: DEMO_CASH_PER_XU,
          min_exchange_cash_vnd: DEMO_CASH_MIN_EXCHANGE,
        },
        wallet: { balance: 0 },
      });
      expect(shop.catalog.find((row) => row.mascot_id === 'thanh_long')?.price_xu).toBe(
        MASCOT_PRICE_XU,
      );
      expect(shop.pet_levels).toEqual([{ mascot_id: 'bach_ho', level: 1, updated_at: null }]);
      expect(await allLedger(h, userId)).toHaveLength(0);
    });
  },
);
