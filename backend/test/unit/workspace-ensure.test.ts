import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { BotService } from '../../src/modules/bots/bot.service.js';
import {
  MANUAL_INITIAL_CASH_VND,
  TradingService,
  manualFundingKey,
} from '../../src/modules/trading/trading.service.js';
import type { TradingAccount } from '../../src/modules/trading/trading.types.js';
import { WorkspaceService } from '../../src/modules/workspace/workspace.service.js';
import type { DatabaseService } from '../../src/platform/database/database.service.js';
import { fundLessons, memoryHarness, type ShopHarness } from './helpers/shop-harness.js';

interface LedgerRow {
  accountId: string;
  amount: bigint;
  kind: string;
  idempotencyKey?: string;
}

/** In-memory twin of the virtual_trading_accounts / virtual_cash_ledger constraints. */
class FakeTradingStore {
  accounts = new Map<string, TradingAccount>();
  ledger: LedgerRow[] = [];
  transactions = 0;
  private tail: Promise<void> = Promise.resolve();

  async transaction<T>(operation: (tx: unknown) => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    this.transactions += 1;
    const backup = {
      accounts: new Map(this.accounts),
      ledger: [...this.ledger],
    };
    try {
      return await operation({});
    } catch (error) {
      this.accounts = backup.accounts;
      this.ledger = backup.ledger;
      throw error;
    } finally {
      release();
    }
  }
  async getAccountByUser(userId: string) {
    const account = this.accounts.get(userId);
    return account ? { ...account } : null;
  }
  async createAccountIfAbsent(_tx: unknown, userId: string, initialCash: bigint) {
    if (this.accounts.has(userId)) return null; // on conflict (user_id) do nothing
    const now = new Date();
    const account: TradingAccount = {
      id: randomUUID(),
      userId,
      status: 'active',
      initialCashVnd: initialCash,
      cashAvailableVnd: initialCash,
      cashReservedVnd: 0n,
      cashPendingVnd: 0n,
      activatedAt: now,
      resetAt: null,
      frozenAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.set(userId, account);
    return { ...account };
  }
  async insertLedger(_tx: unknown, input: LedgerRow) {
    if (
      input.idempotencyKey !== undefined &&
      this.ledger.some((row) => row.idempotencyKey === input.idempotencyKey)
    ) {
      throw Object.assign(new Error('uq_virtual_cash_ledger_idempotency_key'), { code: '23505' });
    }
    this.ledger.push({ ...input });
  }
}

class FakeBot {
  instances = new Set<string>();
  initialize = vi.fn(async (userId: string) => {
    const initialized = !this.instances.has(userId);
    this.instances.add(userId);
    return { initialized, instanceId: `bot-${userId}` };
  });
}

function build(h: ShopHarness = memoryHarness()) {
  const store = new FakeTradingStore();
  const bot = new FakeBot();
  const trading = new TradingService(store as never, {} as never, {} as never);
  // Read-only state query: assembled from the fakes the way the SQL joins the real tables.
  const queryDatabase = {
    query: vi.fn(async (_sql: string, values?: readonly unknown[]) => {
      const userId = String(values?.[0]);
      const account = store.accounts.get(userId);
      const wallet = await h.repository.readWallet(h.database, userId);
      return [
        {
          manual: account
            ? {
                id: account.id,
                initial_cash_vnd: account.initialCashVnd.toString(),
                cash_available_vnd: account.cashAvailableVnd.toString(),
                cash_reserved_vnd: account.cashReservedVnd.toString(),
                cash_pending_vnd: account.cashPendingVnd.toString(),
              }
            : null,
          bot: bot.instances.has(userId)
            ? { account_id: `acct-${userId}`, cash_vnd: '100000000', instance_id: `bot-${userId}` }
            : null,
          wallet_balance: wallet ? String(wallet.balance) : null,
        },
      ];
    }),
  };
  const workspace = new WorkspaceService(
    queryDatabase as unknown as DatabaseService,
    trading,
    bot as unknown as BotService,
    h.shop,
  );
  return { h, store, bot, trading, workspace, queryDatabase };
}

describe('workspace ensure: manual demo account funding', () => {
  it('creates the account with exactly 100,000,000 VND and one keyed funding row', async () => {
    const { h, store, trading } = build();
    const userId = await h.newUser();
    const first = await trading.ensureInitialAccount(userId);
    expect(first.created).toBe(true);
    expect(first.account).toMatchObject({
      userId,
      initialCashVnd: 100_000_000n,
      cashAvailableVnd: 100_000_000n,
      cashReservedVnd: 0n,
      cashPendingVnd: 0n,
    });
    expect(MANUAL_INITIAL_CASH_VND).toBe(100_000_000n);
    expect(store.ledger).toEqual([
      expect.objectContaining({
        accountId: first.account.id,
        amount: 100_000_000n,
        kind: 'activate',
        idempotencyKey: `manual:initial_funding:${userId}`,
      }),
    ]);
    expect(manualFundingKey(userId)).toBe(`manual:initial_funding:${userId}`);
  });

  it('is idempotent: repeated and concurrent calls leave one account and one funding row', async () => {
    const { h, store, trading } = build();
    const userId = await h.newUser();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => trading.ensureInitialAccount(userId)),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.account.id)).size).toBe(1);
    await trading.ensureInitialAccount(userId);
    expect(store.accounts.size).toBe(1);
    expect(store.ledger).toHaveLength(1);
    expect(store.accounts.get(userId)?.cashAvailableVnd).toBe(100_000_000n);
  });

  it('never touches or re-funds an existing account, even one that lost money', async () => {
    const { h, store, trading } = build();
    const userId = await h.newUser();
    const now = new Date();
    store.accounts.set(userId, {
      id: 'legacy-account',
      userId,
      status: 'active',
      initialCashVnd: 100_000_000n,
      cashAvailableVnd: 37_000_000n,
      cashReservedVnd: 0n,
      cashPendingVnd: 5_000_000n,
      activatedAt: now,
      resetAt: null,
      frozenAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const result = await trading.ensureInitialAccount(userId);
    expect(result.created).toBe(false);
    expect(result.account.cashAvailableVnd).toBe(37_000_000n);
    expect(store.ledger).toHaveLength(0);
  });

  it('a failed funding write rolls back so no unfunded account is left behind', async () => {
    const { h, store, trading } = build();
    const userId = await h.newUser();
    vi.spyOn(store, 'insertLedger').mockRejectedValueOnce(new Error('ledger down'));
    await expect(trading.ensureInitialAccount(userId)).rejects.toThrow('ledger down');
    expect(store.accounts.size).toBe(0);
    expect((await trading.ensureInitialAccount(userId)).created).toBe(true);
    expect(store.ledger).toHaveLength(1);
  });
});

describe('workspace ensure: full onboarding', () => {
  it('N01/N02: a new user gets accounts, 0 xu and Bach Ho; retries and concurrent calls change nothing', async () => {
    const { h, store, bot, workspace } = build();
    const userId = await h.newUser();

    const first = await workspace.ensure(userId);
    expect(first.created).toEqual({
      manual_account: true,
      bot: true,
      mascot_profile: true,
      wallet: true,
    });
    expect(first.state).toMatchObject({
      manual_account: {
        exists: true,
        initial_cash_vnd: 100_000_000,
        cash_available_vnd: 100_000_000,
        total_cash_vnd: 100_000_000,
      },
      bot: { exists: true, instance_id: `bot-${userId}` },
      mascot: { active_mascot_id: 'bach_ho', revision: 1, provisioned: true },
      wallet: { balance: 0, provisioned: true },
    });

    const second = await workspace.ensure(userId);
    expect(second.created).toEqual({
      manual_account: false,
      bot: false,
      mascot_profile: false,
      wallet: false,
    });
    expect(second.state).toEqual(first.state);

    await Promise.all([
      workspace.ensure(userId),
      workspace.ensure(userId),
      workspace.ensure(userId),
    ]);
    expect(store.accounts.size).toBe(1);
    expect(store.ledger).toHaveLength(1);
    expect(bot.initialize).toHaveBeenCalledWith(userId);
    expect(bot.instances.size).toBe(1);
    const shop = await h.shop.getShop(userId);
    expect(shop).toMatchObject({ owned_count: 1, wallet: { balance: 0 }, provisioned: true });
  });

  it('M01: keeps the legacy mascot active and owned, and adds the default Bach Ho', async () => {
    const { h, workspace } = build();
    const userId = await h.newUser({ legacyMascot: 'kim_quy' });
    const result = await workspace.ensure(userId);
    expect(result.state.mascot).toMatchObject({ active_mascot_id: 'kim_quy', provisioned: true });
    const shop = await h.shop.getShop(userId);
    expect(shop.owned.map((o) => [o.mascot_id, o.source]).sort()).toEqual([
      ['bach_ho', 'default'],
      ['kim_quy', 'legacy_grant'],
    ]);
  });

  it('M02: re-running onboarding never resets an existing wallet or ownership', async () => {
    const { h, workspace } = build();
    const userId = await h.newUser();
    await workspace.ensure(userId);
    await fundLessons(h, userId, 6);
    await h.shop.purchase(userId, {
      mascot_id: 'thanh_long',
      expected_price_xu: 500,
      catalog_version: 'iqx-mascot-shop-v1',
      idempotency_key: 'ensure-test-purchase-1',
    });
    await h.shop.setActiveMascot(userId, { mascot_id: 'thanh_long', expected_revision: 1 });

    const again = await workspace.ensure(userId);
    expect(again.state.wallet.balance).toBe(100);
    expect(again.state.mascot).toMatchObject({ active_mascot_id: 'thanh_long', revision: 2 });
    expect((await h.shop.getShop(userId)).owned_count).toBe(2);
    expect(again.state.manual_account.cash_available_vnd).toBe(100_000_000);
  });

  it('GET state is read-only: it reports "missing" without creating or funding anything', async () => {
    const { h, store, bot, workspace } = build();
    const userId = await h.newUser();
    const memoryTransactions = vi.spyOn(h.database, 'transaction');
    const state = await workspace.getState(userId);
    expect(state).toEqual({
      manual_account: {
        exists: false,
        account_id: null,
        initial_cash_vnd: null,
        cash_available_vnd: null,
        total_cash_vnd: null,
      },
      bot: { exists: false, account_id: null, instance_id: null, cash_vnd: null },
      mascot: { active_mascot_id: 'bach_ho', revision: 1, provisioned: false },
      wallet: { balance: 0, provisioned: false },
    });
    expect(store.transactions).toBe(0);
    expect(memoryTransactions).not.toHaveBeenCalled();
    expect(bot.initialize).not.toHaveBeenCalled();
    expect(store.accounts.size).toBe(0);
  });

  it('ensure does not require Premium, a level, graduation or any lesson', async () => {
    const { h, workspace } = build();
    const userId = await h.newUser();
    // The service takes only the user id: nothing else can gate it.
    expect(workspace.ensure.length).toBe(1);
    await expect(workspace.ensure(userId)).resolves.toBeDefined();
  });
});
