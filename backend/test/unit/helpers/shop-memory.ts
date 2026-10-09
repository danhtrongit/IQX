import { randomUUID } from 'node:crypto';

import type {
  DatabaseService,
  SqlClient,
} from '../../../src/platform/database/database.service.js';
import { DEFAULT_MASCOT_ID, type MascotId } from '../../../src/modules/shop/shop.catalog.js';
import {
  ShopRepository,
  type LedgerRow,
  type LockedWallet,
  type NewLedgerEntry,
  type NewPurchase,
  type NewReward,
  type OwnershipRow,
  type ProfileRow,
  type ProvisionResult,
  type PurchaseRow,
  type ShopSnapshot,
  type WalletState,
} from '../../../src/modules/shop/shop.repository.js';

type OwnershipEntry = OwnershipRow & { userId: string; ref: Record<string, unknown> };
type LedgerEntry = NewLedgerEntry & { createdAt: Date };
type PurchaseEntry = PurchaseRow & { userId: string };

interface MemoryState {
  wallets: Map<string, WalletState>;
  ledger: LedgerEntry[];
  rewards: Map<string, NewReward>;
  purchases: PurchaseEntry[];
  ownerships: Map<string, OwnershipEntry>;
  profiles: Map<string, ProfileRow>;
  legacy: Map<string, MascotId>;
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
}

export function newUserId(): string {
  return randomUUID();
}
