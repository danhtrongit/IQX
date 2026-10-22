import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

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
import {
  allLedger,
  expectLedgerConsistent,
  fundLessons,
  harnessFactories,
  type ShopHarness,
} from './helpers/shop-harness.js';

let keyCounter = 0;
const nextKey = (label = 'econ') => `${label}-${Date.now()}-${(keyCounter += 1)}`;

/** The switch that makes the Premium redemption require a verified phone number. */
const PHONE_FLAG = 'PREMIUM_XU_REDEEM_PHONE_VERIFIED_ONLY';
const originalPhoneFlag = process.env[PHONE_FLAG];

afterEach(() => {
  if (originalPhoneFlag === undefined) delete process.env[PHONE_FLAG];
  else process.env[PHONE_FLAG] = originalPhoneFlag;
});

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
  });
});

describe.each(harnessFactories)('xu economy: shop, evolution, premium and exchange ($name)', ({
  create,
}) => {
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
    expect(
      evolutions.reduce((sum, row) => sum + Math.abs(row.delta), 0) + MASCOT_PRICE_XU,
    ).toBe(42_000);
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

  it('buys 30 days of Premium for 3.000 xu and refuses a second redemption for 30 days', async () => {
    const userId = await h.newUser();
    await fundLessons(h, userId, 30);
    const request = {
      expected_price_xu: PREMIUM_PRICE_XU,
      idempotency_key: nextKey('premium'),
    };
    const result = await h.shop.purchasePremium(userId, request);
    expect(result).toMatchObject({
      status: 'purchased',
      replayed: false,
      price_xu: PREMIUM_PRICE_XU,
      days_granted: PREMIUM_DURATION_DAYS,
      wallet: { balance: 0 },
    });
    const rows = await expectLedgerConsistent(h, userId, 0);
    expect(rows.filter((row) => row.kind === 'premium_purchase')).toHaveLength(1);

    const replay = await h.shop.purchasePremium(userId, request);
    expect(replay).toMatchObject({ status: 'purchased', replayed: true });
    await expectLedgerConsistent(h, userId, 0);

    const limited = await rejectedWith(
      h.shop.purchasePremium(userId, {
        expected_price_xu: PREMIUM_PRICE_XU,
        idempotency_key: nextKey('premium'),
      }),
    );
    expect(limited).toMatchObject({ status: 409, code: 'PREMIUM_PURCHASE_LIMIT' });
  });

  it('refuses Premium with xu when the wallet is short', async () => {
    const userId = await h.newUser();
    await fundLessons(h, userId, 10);
    const error = await rejectedWith(
      h.shop.purchasePremium(userId, {
        expected_price_xu: PREMIUM_PRICE_XU,
        idempotency_key: nextKey('premium'),
      }),
    );
    expect(error).toMatchObject({ status: 409, code: 'INSUFFICIENT_XU' });
    expect(error.details).toEqual([
      { balance_xu: 1000, price_xu: PREMIUM_PRICE_XU, shortfall_xu: 2000 },
    ]);
  });

  it('converts xu into Demo cash at 10.000 VND per xu', async () => {
    const userId = await h.newUser();
    await fundLessons(h, userId, 10);
    const request = { direction: 'xu_to_cash' as const, amount: 100, idempotency_key: nextKey('ex') };
    const result = await h.shop.exchangeDemo(userId, request);
    expect(result).toMatchObject({
      direction: 'xu_to_cash',
      amount: 100,
      xu_delta: -100,
      cash_delta_vnd: 1_000_000,
      balance_xu: 900,
      cash_available_vnd: 1_000_000,
      net_deposited_cash_vnd: 1_000_000,
      cash_per_xu: DEMO_CASH_PER_XU,
      replayed: false,
    });
    const rows = await expectLedgerConsistent(h, userId, 900);
    expect(rows.filter((row) => row.kind === 'demo_withdraw')).toHaveLength(1);

    const replay = await h.shop.exchangeDemo(userId, request);
    expect(replay).toMatchObject({ replayed: true, balance_xu: 900 });
    await expectLedgerConsistent(h, userId, 900);
  });

  it('converts Demo cash back into xu and only accepts multiples of 10.000 VND', async () => {
    const userId = await h.newUser();
    await fundLessons(h, userId, 10);
    await h.shop.exchangeDemo(userId, {
      direction: 'xu_to_cash',
      amount: 100,
      idempotency_key: nextKey('ex'),
    });

    const invalid = await rejectedWith(
      h.shop.exchangeDemo(userId, {
        direction: 'cash_to_xu',
        amount: 1_234_567,
        idempotency_key: nextKey('ex'),
      }),
    );
    expect(invalid).toMatchObject({ status: 400, code: 'INVALID_AMOUNT' });

    const tooMuch = await rejectedWith(
      h.shop.exchangeDemo(userId, {
        direction: 'cash_to_xu',
        amount: 2_000_000,
        idempotency_key: nextKey('ex'),
      }),
    );
    expect(tooMuch).toMatchObject({ status: 409, code: 'INSUFFICIENT_CASH' });

    const result = await h.shop.exchangeDemo(userId, {
      direction: 'cash_to_xu',
      amount: 300_000,
      idempotency_key: nextKey('ex'),
    });
    expect(result).toMatchObject({
      direction: 'cash_to_xu',
      amount: 300_000,
      xu_delta: 30,
      cash_delta_vnd: -300_000,
      balance_xu: 930,
      cash_available_vnd: 700_000,
      net_deposited_cash_vnd: 700_000,
    });
    const rows = await expectLedgerConsistent(h, userId, 930);
    expect(rows.filter((row) => row.kind === 'demo_deposit')).toHaveLength(1);
  });

  it('refuses to convert more xu than the wallet holds', async () => {
    const userId = await h.newUser();
    await fundLessons(h, userId, 2);
    const error = await rejectedWith(
      h.shop.exchangeDemo(userId, {
        direction: 'xu_to_cash',
        amount: 500,
        idempotency_key: nextKey('ex'),
      }),
    );
    expect(error).toMatchObject({ status: 409, code: 'INSUFFICIENT_XU' });
  });

  it('writes both histories of an exchange: the xu wallet and the Demo account', async () => {
    const userId = await h.newUser();
    await fundLessons(h, userId, 10);
    await h.shop.exchangeDemo(userId, {
      direction: 'xu_to_cash',
      amount: 100,
      idempotency_key: nextKey('ex'),
    });

    const rows = await expectLedgerConsistent(h, userId, 900);
    expect(rows.filter((row) => row.kind === 'demo_withdraw')).toHaveLength(1);

    const cash = await h.demoCashLedger(userId);
    // The account opens with no capital and the exchange lands in its own cash history.
    expect(cash.map((row) => row.kind)).toEqual(['activate', 'demo_exchange_out']);
    expect(cash[1]).toMatchObject({ amountVnd: '1000000', balanceAfterVnd: '1000000' });
  });

  it('rejects an exchange key that is reused with another direction or another amount', async () => {
    const userId = await h.newUser();
    await fundLessons(h, userId, 10);
    const key = nextKey('ex');
    await h.shop.exchangeDemo(userId, {
      direction: 'xu_to_cash',
      amount: 100,
      idempotency_key: key,
    });

    // Another direction with the same key is a reused key, not a malformed amount.
    const otherDirection = await rejectedWith(
      h.shop.exchangeDemo(userId, {
        direction: 'cash_to_xu',
        amount: 1_234,
        idempotency_key: key,
      }),
    );
    expect(otherDirection).toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });

    const otherAmount = await rejectedWith(
      h.shop.exchangeDemo(userId, {
        direction: 'xu_to_cash',
        amount: 200,
        idempotency_key: key,
      }),
    );
    expect(otherAmount).toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
    await expectLedgerConsistent(h, userId, 900);
  });

  it('only lets a phone-verified account redeem Premium for xu when the rule is on', async () => {
    process.env[PHONE_FLAG] = 'true';
    const userId = await h.newUser();
    await fundLessons(h, userId, 30);

    const refused = await rejectedWith(
      h.shop.purchasePremium(userId, {
        expected_price_xu: PREMIUM_PRICE_XU,
        idempotency_key: nextKey('premium'),
      }),
    );
    expect(refused).toMatchObject({ status: 403, code: 'PHONE_NOT_VERIFIED' });

    await h.markPhoneVerified(userId);
    const allowed = await h.shop.purchasePremium(userId, {
      expected_price_xu: PREMIUM_PRICE_XU,
      idempotency_key: nextKey('premium'),
    });
    expect(allowed).toMatchObject({
      status: 'purchased',
      days_granted: PREMIUM_DURATION_DAYS,
      wallet: { balance: 0 },
    });
  });

  it('replays a Premium redemption that already paid, even when the phone rule is on', async () => {
    const userId = await h.newUser();
    await fundLessons(h, userId, 30);
    const request = {
      expected_price_xu: PREMIUM_PRICE_XU,
      idempotency_key: nextKey('premium'),
    };
    await h.shop.purchasePremium(userId, request);

    process.env[PHONE_FLAG] = 'true';
    const replay = await h.shop.purchasePremium(userId, request);
    expect(replay).toMatchObject({ status: 'purchased', replayed: true });
    await expectLedgerConsistent(h, userId, 0);
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
});
