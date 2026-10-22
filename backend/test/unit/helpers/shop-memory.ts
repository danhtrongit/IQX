import { randomUUID } from 'node:crypto';

import type {
  DatabaseService,
  SqlClient,
} from '../../../src/platform/database/database.service.js';
import { DEFAULT_MASCOT_ID, type MascotId } from '../../../src/modules/shop/shop.catalog.js';
import {
  ShopRepository,
  type DemoExchangeRow,
  type LedgerRow,
  type LockedWallet,
  type NewLedgerEntry,
  type NewPurchase,
  type NewReward,
  type OwnershipRow,
  type PetLevelRow,
  type PremiumPlanRow,
  type PremiumXuPurchaseRow,
  type ProfileRow,
  type ProvisionResult,
  type PurchaseRow,
  type ShopSnapshot,
  type WalletState,
} from '../../../src/modules/shop/shop.repository.js';

type OwnershipEntry = OwnershipRow & { userId: string; ref: Record<string, unknown> };
type LedgerEntry = NewLedgerEntry & { createdAt: Date };
type PurchaseEntry = PurchaseRow & { userId: string };
type PetLevelEntry = PetLevelRow & { userId: string };
type PremiumPurchaseEntry = PremiumXuPurchaseRow & { userId: string };
type DemoAccountEntry = {
  id: string;
  userId: string;
  cashAvailableVnd: bigint;
  netDepositedCashVnd: bigint;
};
type DemoCashEntry = {
  accountId: string;
  amountVnd: bigint;
  balanceAfterVnd: bigint;
  kind: string;
  note: string;
  idempotencyKey: string;
};

interface MemoryState {
  wallets: Map<string, WalletState>;
  ledger: LedgerEntry[];
  rewards: Map<string, NewReward>;
  purchases: PurchaseEntry[];
  ownerships: Map<string, OwnershipEntry>;
  profiles: Map<string, ProfileRow>;
  legacy: Map<string, MascotId>;
  petLevels: Map<string, PetLevelEntry>;
  demoAccounts: Map<string, DemoAccountEntry>;
  demoCashLedger: DemoCashEntry[];
  demoExchanges: DemoExchangeRow[];
  premiumPurchases: PremiumPurchaseEntry[];
  plans: Map<string, PremiumPlanRow>;
  entitlements: Map<string, { startsAt: Date; endsAt: Date; planId: string | null }>;
  phoneVerified: Map<string, Date>;
}

function emptyState(): MemoryState {
  return {
    wallets: new Map(),
    ledger: [],
    rewards: new Map(),
    purchases: [],
    ownerships: new Map(),
    profiles: new Map(),
    legacy: new Map(),
    petLevels: new Map(),
    demoAccounts: new Map(),
    demoCashLedger: [],
    demoExchanges: [],
    premiumPurchases: [],
    plans: new Map(),
    entitlements: new Map(),
    phoneVerified: new Map(),
  };
}

function violation(constraint: string): Error {
  return Object.assign(new Error(`duplicate key value violates unique constraint ${constraint}`), {
    code: '23505',
  });
}

/**
 * In-memory stand-in for the Postgres pool. Transactions run one at a time (like a single
 * serialised lock) and roll back by restoring a snapshot when the operation throws.
 */
export class MemoryDatabase {
  state: MemoryState = emptyState();
  transactions = 0;
  private tail: Promise<void> = Promise.resolve();

  /** Both the pool and a transaction handle resolve to this database for the repository. */
  get mem(): MemoryDatabase {
    return this;
  }

  query(): Promise<never> {
    return Promise.reject(new Error('MemoryDatabase does not execute SQL'));
  }

  async transaction<T>(operation: (tx: SqlClient) => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    this.transactions += 1;
    const backup = structuredClone(this.state);
    try {
      return await operation(this as unknown as SqlClient);
    } catch (error) {
      this.state = backup;
      throw error;
    } finally {
      release();
    }
  }

  asDatabaseService(): DatabaseService {
    return this as unknown as DatabaseService;
  }
}

const mem = (client: SqlClient): MemoryDatabase => (client as unknown as MemoryDatabase).mem;
const ownershipKey = (userId: string, mascotId: string) => `${userId}|${mascotId}`;

/** Mirrors PgShopRepository, including the unique/check constraints of migration 0015. */
export class MemoryShopRepository extends ShopRepository {
  async lockWallet(tx: SqlClient, userId: string): Promise<LockedWallet> {
    const { state } = mem(tx);
    const existing = state.wallets.get(userId);
    if (existing) return { ...existing, created: false };
    state.wallets.set(userId, { balance: 0, lastSeq: 0 });
    return { balance: 0, lastSeq: 0, created: true };
  }

  async readWallet(db: SqlClient, userId: string): Promise<WalletState | null> {
    const wallet = mem(db).state.wallets.get(userId);
    return wallet ? { ...wallet } : null;
  }

  async saveWallet(tx: SqlClient, userId: string, balance: number, lastSeq: number): Promise<void> {
    if (!Number.isInteger(balance) || balance < 0) {
      throw Object.assign(new Error('ck_coin_wallets_balance_non_negative'), { code: '23514' });
    }
    mem(tx).state.wallets.set(userId, { balance, lastSeq });
  }

  async appendLedger(tx: SqlClient, entry: NewLedgerEntry): Promise<void> {
    const { state } = mem(tx);
    if (!Number.isInteger(entry.delta) || entry.delta === 0) {
      throw Object.assign(new Error('ck_coin_ledger_delta_non_zero'), { code: '23514' });
    }
    if (entry.balanceAfter < 0) {
      throw Object.assign(new Error('ck_coin_ledger_balance_non_negative'), { code: '23514' });
    }
    if (state.ledger.some((row) => row.uniqueKey === entry.uniqueKey)) {
      throw violation('uq_coin_ledger_unique_key');
    }
    if (state.ledger.some((row) => row.userId === entry.userId && row.seq === entry.seq)) {
      throw violation('uq_coin_ledger_user_seq');
    }
    state.ledger.push({ ...entry, createdAt: new Date() });
  }

  async listLedger(
    db: SqlClient,
    userId: string,
    page: { beforeSeq: number | null; limit: number },
  ): Promise<LedgerRow[]> {
    return mem(db)
      .state.ledger.filter(
        (row) => row.userId === userId && (page.beforeSeq === null || row.seq < page.beforeSeq),
      )
      .sort((a, b) => b.seq - a.seq)
      .slice(0, page.limit)
      .map((row) => ({
        id: row.id,
        seq: row.seq,
        kind: row.kind,
        delta: row.delta,
        balanceAfter: row.balanceAfter,
        ref: row.ref,
        createdAt: row.createdAt,
      }));
  }

  async insertRewardIfAbsent(tx: SqlClient, reward: NewReward): Promise<boolean> {
    const { state } = mem(tx);
    const key = `${reward.userId}|${reward.lessonKey}`;
    if (state.rewards.has(key)) return false;
    state.rewards.set(key, reward);
    return true;
  }

  async findPurchaseByKey(
    tx: SqlClient,
    userId: string,
    idempotencyKey: string,
  ): Promise<PurchaseRow | null> {
    const found = mem(tx).state.purchases.find(
      (p) => p.userId === userId && p.idempotencyKey === idempotencyKey,
    );
    return found ? { ...found } : null;
  }

  async insertPurchase(tx: SqlClient, purchase: NewPurchase): Promise<PurchaseRow> {
    const { state } = mem(tx);
    if (
      state.purchases.some(
        (p) => p.userId === purchase.userId && p.idempotencyKey === purchase.idempotencyKey,
      )
    ) {
      throw violation('uq_mascot_purchases_user_key');
    }
    if (
      state.purchases.some((p) => p.userId === purchase.userId && p.mascotId === purchase.mascotId)
    ) {
      throw violation('uq_mascot_purchases_user_mascot');
    }
    const row: PurchaseEntry = {
      id: purchase.id,
      userId: purchase.userId,
      mascotId: purchase.mascotId,
      priceXu: purchase.priceXu,
      catalogVersion: purchase.catalogVersion,
      idempotencyKey: purchase.idempotencyKey,
      requestHash: purchase.requestHash,
      ledgerId: purchase.ledgerId,
      createdAt: new Date(),
    };
    state.purchases.push(row);
    return { ...row };
  }

  async hasOwnership(tx: SqlClient, userId: string, mascotId: MascotId): Promise<boolean> {
    return mem(tx).state.ownerships.has(ownershipKey(userId, mascotId));
  }

  async insertOwnership(
    tx: SqlClient,
    input: {
      userId: string;
      mascotId: MascotId;
      source: OwnershipRow['source'];
      ref: Record<string, unknown>;
    },
  ): Promise<boolean> {
    const { state } = mem(tx);
    const key = ownershipKey(input.userId, input.mascotId);
    if (state.ownerships.has(key)) return false;
    state.ownerships.set(key, {
      userId: input.userId,
      mascotId: input.mascotId,
      source: input.source,
      acquiredAt: new Date(),
      ref: input.ref,
    });
    return true;
  }

  async getProfile(tx: SqlClient, userId: string): Promise<ProfileRow | null> {
    const profile = mem(tx).state.profiles.get(userId);
    return profile ? { ...profile } : null;
  }

  async provisionProfile(tx: SqlClient, userId: string): Promise<ProvisionResult> {
    const { state } = mem(tx);
    const existing = state.profiles.get(userId);
    if (existing) return { created: false, profile: { ...existing } };
    const legacy = state.legacy.get(userId) ?? null;
    await this.insertOwnership(tx, {
      userId,
      mascotId: DEFAULT_MASCOT_ID,
      source: 'default',
      ref: {},
    });
    if (legacy && legacy !== DEFAULT_MASCOT_ID) {
      await this.insertOwnership(tx, {
        userId,
        mascotId: legacy,
        source: 'legacy_grant',
        ref: { origin: 'bot_mascot_profiles' },
      });
    }
    const profile: ProfileRow = {
      activeMascotId: legacy ?? DEFAULT_MASCOT_ID,
      revision: 1,
      updatedAt: new Date(),
    };
    state.profiles.set(userId, profile);
    return { created: true, profile: { ...profile } };
  }

  async setActiveMascot(tx: SqlClient, userId: string, mascotId: MascotId): Promise<ProfileRow> {
    const { state } = mem(tx);
    const current = state.profiles.get(userId);
    if (!current) throw new Error('Mascot profile does not exist');
    if (!state.ownerships.has(ownershipKey(userId, mascotId))) {
      throw Object.assign(new Error('fk_mascot_profiles_owned'), { code: '23503' });
    }
    const next: ProfileRow = {
      activeMascotId: mascotId,
      revision: current.revision + 1,
      updatedAt: new Date(),
    };
    state.profiles.set(userId, next);
    return { ...next };
  }

  async readSnapshot(db: SqlClient, userId: string): Promise<ShopSnapshot> {
    const { state } = mem(db);
    const credits = state.ledger.filter((row) => row.userId === userId && row.delta > 0);
    const debits = state.ledger.filter((row) => row.userId === userId && row.delta < 0);
    const profile = state.profiles.get(userId);
    return {
      wallet: state.wallets.has(userId) ? { ...state.wallets.get(userId)! } : null,
      owned: [...state.ownerships.values()]
        .filter((o) => o.userId === userId)
        .map((o) => ({ mascotId: o.mascotId, source: o.source, acquiredAt: o.acquiredAt })),
      profile: profile ? { ...profile } : null,
      earnedXu: credits.reduce((sum, row) => sum + row.delta, 0),
      spentXu: debits.reduce((sum, row) => sum - row.delta, 0),
      lessonsRewarded: [...state.rewards.values()].filter((r) => r.userId === userId).length,
      legacyMascotId: state.legacy.get(userId) ?? null,
    };
  }

  async findLegacyMascot(db: SqlClient, userId: string): Promise<MascotId | null> {
    return mem(db).state.legacy.get(userId) ?? null;
  }

  async findLedgerByUniqueKey(db: SqlClient, uniqueKey: string): Promise<LedgerRow | null> {
    const row = mem(db).state.ledger.find((entry) => entry.uniqueKey === uniqueKey);
    if (!row) return null;
    return {
      id: row.id,
      seq: row.seq,
      kind: row.kind,
      delta: row.delta,
      balanceAfter: row.balanceAfter,
      ref: row.ref,
      createdAt: row.createdAt,
    };
  }

  async listPetLevels(db: SqlClient, userId: string): Promise<PetLevelRow[]> {
    return [...mem(db).state.petLevels.values()]
      .filter((row) => row.userId === userId)
      .map((row) => ({ petId: row.petId, level: row.level, updatedAt: row.updatedAt }));
  }

  async upsertPetLevel(
    tx: SqlClient,
    input: { userId: string; petId: MascotId; level: number },
  ): Promise<void> {
    mem(tx).state.petLevels.set(`${input.userId}|${input.petId}`, {
      userId: input.userId,
      petId: input.petId,
      level: input.level,
      updatedAt: new Date(),
    });
  }

  async findDemoAccount(
    tx: SqlClient,
    userId: string,
    _lock: boolean,
  ): Promise<DemoAccountEntry | null> {
    const account = mem(tx).state.demoAccounts.get(userId);
    return account ? { ...account } : null;
  }

  async createDemoAccountIfAbsent(
    tx: SqlClient,
    userId: string,
  ): Promise<{ account: DemoAccountEntry; created: boolean }> {
    const { state } = mem(tx);
    const existing = state.demoAccounts.get(userId);
    if (existing) return { account: { ...existing }, created: false };
    const account: DemoAccountEntry = {
      id: randomUUID(),
      userId,
      cashAvailableVnd: 0n,
      netDepositedCashVnd: 0n,
    };
    state.demoAccounts.set(userId, account);
    state.demoCashLedger.push({
      accountId: account.id,
      amountVnd: 0n,
      balanceAfterVnd: 0n,
      kind: 'activate',
      note: 'Vốn demo khởi tạo 0 VND, cấp đúng một lần',
      idempotencyKey: `manual:initial_funding:${userId}`,
    });
    return { account: { ...account }, created: true };
  }

  async updateDemoAccountCash(
    tx: SqlClient,
    input: {
      accountId: string;
      cashAvailableVnd: bigint;
      netDepositedCashVnd: bigint;
    },
  ): Promise<void> {
    const { state } = mem(tx);
    const account = [...state.demoAccounts.values()].find((row) => row.id === input.accountId);
    if (!account) throw new Error('Demo trading account does not exist');
    account.cashAvailableVnd = input.cashAvailableVnd;
    account.netDepositedCashVnd = input.netDepositedCashVnd;
  }

  async findDemoExchangeByKey(
    db: SqlClient,
    uniqueKey: string,
  ): Promise<DemoExchangeRow | null> {
    const row = mem(db).state.demoExchanges.find((entry) => entry.uniqueKey === uniqueKey);
    return row ? { ...row } : null;
  }

  async insertDemoExchange(
    tx: SqlClient,
    exchange: {
      id: string;
      userId: string;
      direction: DemoExchangeRow['direction'];
      xuDelta: number;
      cashDeltaVnd: bigint;
      uniqueKey: string;
    },
  ): Promise<DemoExchangeRow> {
    const { state } = mem(tx);
    if (state.demoExchanges.some((row) => row.uniqueKey === exchange.uniqueKey)) {
      throw violation('uq_demo_exchange_ledger_unique_key');
    }
    const row: DemoExchangeRow = {
      id: exchange.id,
      userId: exchange.userId,
      direction: exchange.direction,
      xuDelta: exchange.xuDelta,
      cashDeltaVnd: exchange.cashDeltaVnd,
      uniqueKey: exchange.uniqueKey,
      createdAt: new Date(),
    };
    state.demoExchanges.push(row);
    return { ...row };
  }

  async findPremiumXuPurchaseByKey(
    db: SqlClient,
    userId: string,
    uniqueKey: string,
  ): Promise<PremiumXuPurchaseRow | null> {
    const row = mem(db).state.premiumPurchases.find(
      (entry) => entry.userId === userId && entry.uniqueKey === uniqueKey,
    );
    return row ? { ...row } : null;
  }

  async insertPremiumXuPurchase(
    tx: SqlClient,
    purchase: {
      id: string;
      userId: string;
      planId: string | null;
      xuSpent: number;
      daysGranted: number;
      uniqueKey: string;
      ledgerId: string;
    },
  ): Promise<PremiumXuPurchaseRow> {
    const { state } = mem(tx);
    if (state.premiumPurchases.some((row) => row.uniqueKey === purchase.uniqueKey)) {
      throw violation('uq_premium_xu_purchases_unique_key');
    }
    const row: PremiumPurchaseEntry = {
      id: purchase.id,
      userId: purchase.userId,
      planId: purchase.planId,
      xuSpent: purchase.xuSpent,
      daysGranted: purchase.daysGranted,
      uniqueKey: purchase.uniqueKey,
      ledgerId: purchase.ledgerId,
      createdAt: new Date(),
    };
    state.premiumPurchases.push(row);
    return { ...row };
  }

  async findLatestPremiumXuPurchase(
    db: SqlClient,
    userId: string,
  ): Promise<PremiumXuPurchaseRow | null> {
    const rows = mem(db).state.premiumPurchases.filter((row) => row.userId === userId);
    const last = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return last ? { ...last } : null;
  }

  async findPremiumPlan(db: SqlClient, planId: string): Promise<PremiumPlanRow | null> {
    return mem(db).state.plans.get(planId) ?? null;
  }

  async findActiveMonthlyPremiumPlan(db: SqlClient): Promise<PremiumPlanRow | null> {
    const plans = [...mem(db).state.plans.values()].filter(
      (plan) => plan.isActive && plan.durationDays === 30,
    );
    return plans[0] ?? null;
  }

  async findActivePremiumGrant(
    db: SqlClient,
    userId: string,
  ): Promise<{ startsAt: Date; endsAt: Date; planId: string | null } | null> {
    const grant = mem(db).state.entitlements.get(userId);
    if (!grant || grant.endsAt.getTime() <= Date.now()) return null;
    return { ...grant };
  }

  async appendDemoCashLedger(
    tx: SqlClient,
    input: {
      accountId: string;
      amountVnd: bigint;
      balanceAfterVnd: bigint;
      kind: string;
      note: string;
      idempotencyKey: string;
    },
  ): Promise<void> {
    mem(tx).state.demoCashLedger.push({ ...input });
  }

  async grantPremiumDays(
    tx: SqlClient,
    input: { userId: string; planId: string | null; days: number; note?: string },
  ): Promise<{ startsAt: Date; endsAt: Date }> {
    const { state } = mem(tx);
    const current = state.entitlements.get(input.userId);
    const now = new Date();
    const startsAt = current && current.endsAt.getTime() > now.getTime() ? current.endsAt : now;
    const endsAt = new Date(startsAt.getTime() + input.days * 24 * 60 * 60 * 1000);
    state.entitlements.set(input.userId, { startsAt, endsAt, planId: input.planId });
    return { startsAt, endsAt };
  }

  async findPhoneVerifiedAt(db: SqlClient, userId: string): Promise<Date | null> {
    return mem(db).state.phoneVerified.get(userId) ?? null;
  }
}

export function newUserId(): string {
  return randomUUID();
}
