import { Injectable } from '@nestjs/common';

import type { SqlClient } from '../../platform/database/database.service.js';
import {
  DEFAULT_MASCOT_ID,
  isMascotId,
  type MascotId,
  type MascotOwnershipSource,
} from './shop.catalog.js';

export type CoinLedgerKind = 'lesson_first_completion' | 'mascot_purchase' | 'adjustment';

export interface WalletState {
  readonly balance: number;
  readonly lastSeq: number;
}

export interface LockedWallet extends WalletState {
  /** True when this call created the (empty) wallet row. */
  readonly created: boolean;
}

export interface NewLedgerEntry {
  readonly id: string;
  readonly userId: string;
  readonly seq: number;
  readonly kind: CoinLedgerKind;
  readonly delta: number;
  readonly balanceAfter: number;
  readonly uniqueKey: string;
  readonly ref: Record<string, unknown>;
  readonly policyVersion: string;
}

export interface LedgerRow {
  readonly id: string;
  readonly seq: number;
  readonly kind: CoinLedgerKind;
  readonly delta: number;
  readonly balanceAfter: number;
  readonly ref: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface NewReward {
  readonly userId: string;
  readonly lessonKey: string;
  readonly lessonId: string;
  readonly catalogVersion: string;
  readonly completionMethod: 'quiz' | 'guide' | 'legacy_migration';
  readonly completedAt: Date;
  readonly ledgerId: string;
  readonly policyVersion: string;
}

export interface OwnershipRow {
  readonly mascotId: MascotId;
  readonly source: MascotOwnershipSource;
  readonly acquiredAt: Date;
}

export interface ProfileRow {
  readonly activeMascotId: MascotId;
  readonly revision: number;
  readonly updatedAt: Date;
}

export interface PurchaseRow {
  readonly id: string;
  readonly mascotId: MascotId;
  readonly priceXu: number;
  readonly catalogVersion: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly ledgerId: string;
  readonly createdAt: Date;
}

export interface NewPurchase {
  readonly id: string;
  readonly userId: string;
  readonly mascotId: MascotId;
  readonly priceXu: number;
  readonly catalogVersion: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly ledgerId: string;
}

export interface ShopSnapshot {
  readonly wallet: WalletState | null;
  readonly owned: readonly OwnershipRow[];
  readonly profile: ProfileRow | null;
  readonly earnedXu: number;
  readonly spentXu: number;
  readonly lessonsRewarded: number;
  /** Mascot assigned by the retired 0-6 level journey, if any (read-only legacy evidence). */
  readonly legacyMascotId: MascotId | null;
}

export interface ProvisionResult {
  readonly created: boolean;
  readonly profile: ProfileRow;
}

/**
 * Data access for the xu wallet, mascot ownership and the display profile. Every write takes
 * the caller's transaction handle; reads accept any `SqlClient` (a pool or a transaction).
 */
export abstract class ShopRepository {
  /** Creates the wallet row if absent, then returns it locked `FOR UPDATE`. */
  abstract lockWallet(tx: SqlClient, userId: string): Promise<LockedWallet>;
  abstract readWallet(db: SqlClient, userId: string): Promise<WalletState | null>;
  abstract saveWallet(
    tx: SqlClient,
    userId: string,
    balance: number,
    lastSeq: number,
  ): Promise<void>;
  abstract appendLedger(tx: SqlClient, entry: NewLedgerEntry): Promise<void>;
  abstract listLedger(
    db: SqlClient,
    userId: string,
    page: { beforeSeq: number | null; limit: number },
  ): Promise<LedgerRow[]>;

  /** Inserts the once-per-lesson evidence row; false when the reward already exists. */
  abstract insertRewardIfAbsent(tx: SqlClient, reward: NewReward): Promise<boolean>;

  abstract findPurchaseByKey(
    tx: SqlClient,
    userId: string,
    idempotencyKey: string,
  ): Promise<PurchaseRow | null>;
  abstract insertPurchase(tx: SqlClient, purchase: NewPurchase): Promise<PurchaseRow>;
  abstract hasOwnership(tx: SqlClient, userId: string, mascotId: MascotId): Promise<boolean>;
  abstract insertOwnership(
    tx: SqlClient,
    input: {
      userId: string;
      mascotId: MascotId;
      source: MascotOwnershipSource;
      ref: Record<string, unknown>;
    },
  ): Promise<boolean>;

  abstract getProfile(tx: SqlClient, userId: string, lock: boolean): Promise<ProfileRow | null>;
  /** Idempotently creates default (+ legacy) ownership and the active profile. */
  abstract provisionProfile(tx: SqlClient, userId: string): Promise<ProvisionResult>;
  abstract setActiveMascot(tx: SqlClient, userId: string, mascotId: MascotId): Promise<ProfileRow>;

  /** One-statement (single snapshot) read of everything the Shop screen needs. */
  abstract readSnapshot(db: SqlClient, userId: string): Promise<ShopSnapshot>;
  abstract findLegacyMascot(db: SqlClient, userId: string): Promise<MascotId | null>;
}

type Row = Record<string, unknown>;

function toInt(value: unknown, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${field} is not a safe integer`);
  return result;
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function mascotOf(value: unknown): MascotId {
  if (!isMascotId(value)) throw new RangeError(`Unknown mascot id ${String(value)}`);
  return value;
}

function mapProfile(row: Row): ProfileRow {
  return {
    activeMascotId: mascotOf(row.active_mascot_id),
    revision: toInt(row.revision, 'revision'),
    updatedAt: toDate(row.updated_at),
  };
}

function mapPurchase(row: Row): PurchaseRow {
  return {
    id: String(row.id),
    mascotId: mascotOf(row.mascot_id),
    priceXu: toInt(row.price_xu, 'price_xu'),
    catalogVersion: String(row.catalog_version),
    idempotencyKey: String(row.idempotency_key),
    requestHash: String(row.request_hash),
    ledgerId: String(row.ledger_id),
    createdAt: toDate(row.created_at),
  };
}

const LEGACY_MASCOT_SQL = `select mascot_id from bot_mascot_profiles
   where user_id = $1 and assignment_status = 'assigned' and mascot_id is not null
   order by mascot_rules_version desc, assigned_at desc nulls last
   limit 1`;

@Injectable()
export class PgShopRepository extends ShopRepository {
  async lockWallet(tx: SqlClient, userId: string): Promise<LockedWallet> {
    const lockSql = `select balance::text as balance, last_seq::text as last_seq
       from coin_wallets where user_id = $1 for update`;
    const existing = await tx.query(lockSql, [userId]);
    if (existing[0]) {
      return {
        balance: toInt(existing[0].balance, 'balance'),
        lastSeq: toInt(existing[0].last_seq, 'last_seq'),
        created: false,
      };
    }
    const inserted = await tx.query(
      `insert into coin_wallets (user_id) values ($1)
       on conflict (user_id) do nothing returning user_id`,
      [userId],
    );
    const locked = await tx.query(lockSql, [userId]);
    const row = locked[0];
    if (!row) throw new Error('Coin wallet could not be created');
    return {
      balance: toInt(row.balance, 'balance'),
      lastSeq: toInt(row.last_seq, 'last_seq'),
      created: inserted.length > 0,
    };
  }

  async readWallet(db: SqlClient, userId: string): Promise<WalletState | null> {
    const rows = await db.query(
      `select balance::text as balance, last_seq::text as last_seq
       from coin_wallets where user_id = $1`,
      [userId],
    );
    const row = rows[0];
    return row
      ? { balance: toInt(row.balance, 'balance'), lastSeq: toInt(row.last_seq, 'last_seq') }
      : null;
  }

  async saveWallet(tx: SqlClient, userId: string, balance: number, lastSeq: number): Promise<void> {
    await tx.query(
      `update coin_wallets set balance = $2, last_seq = $3, updated_at = now()
       where user_id = $1`,
      [userId, balance, lastSeq],
    );
  }

  async appendLedger(tx: SqlClient, entry: NewLedgerEntry): Promise<void> {
    await tx.query(
      `insert into coin_ledger
         (id, user_id, seq, kind, delta, balance_after, unique_key, ref, policy_version)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        entry.id,
        entry.userId,
        entry.seq,
        entry.kind,
        entry.delta,
        entry.balanceAfter,
        entry.uniqueKey,
        JSON.stringify(entry.ref),
        entry.policyVersion,
      ],
    );
  }

  async listLedger(
    db: SqlClient,
    userId: string,
    page: { beforeSeq: number | null; limit: number },
  ): Promise<LedgerRow[]> {
    const rows = await db.query(
      `select id, seq::text as seq, kind, delta, balance_after::text as balance_after, ref,
              created_at
       from coin_ledger
       where user_id = $1 and ($2::bigint is null or coin_ledger.seq < $2::bigint)
       order by coin_ledger.seq desc
       limit $3`,
      [userId, page.beforeSeq, page.limit],
    );
    return rows.map((row) => ({
      id: String(row.id),
      seq: toInt(row.seq, 'seq'),
      kind: String(row.kind) as CoinLedgerKind,
      delta: toInt(row.delta, 'delta'),
      balanceAfter: toInt(row.balance_after, 'balance_after'),
      ref: (row.ref ?? {}) as Record<string, unknown>,
      createdAt: toDate(row.created_at),
    }));
  }

  async insertRewardIfAbsent(tx: SqlClient, reward: NewReward): Promise<boolean> {
    const rows = await tx.query(
      `insert into lesson_rewards
         (user_id, lesson_key, lesson_id, catalog_version, completion_method, completed_at,
          ledger_id, policy_version)
       values ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8)
       on conflict (user_id, lesson_key) do nothing
       returning ledger_id`,
      [
        reward.userId,
        reward.lessonKey,
        reward.lessonId,
        reward.catalogVersion,
        reward.completionMethod,
        reward.completedAt,
        reward.ledgerId,
        reward.policyVersion,
      ],
    );
    return rows.length > 0;
  }

  async findPurchaseByKey(
    tx: SqlClient,
    userId: string,
    idempotencyKey: string,
  ): Promise<PurchaseRow | null> {
    const rows = await tx.query(
      `select id, mascot_id, price_xu, catalog_version, idempotency_key, request_hash,
              ledger_id, created_at
       from mascot_purchases where user_id = $1 and idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    return rows[0] ? mapPurchase(rows[0]) : null;
  }

  async insertPurchase(tx: SqlClient, purchase: NewPurchase): Promise<PurchaseRow> {
    const rows = await tx.query(
      `insert into mascot_purchases
         (id, user_id, mascot_id, price_xu, catalog_version, idempotency_key, request_hash,
          ledger_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, mascot_id, price_xu, catalog_version, idempotency_key, request_hash,
                 ledger_id, created_at`,
      [
        purchase.id,
        purchase.userId,
        purchase.mascotId,
        purchase.priceXu,
        purchase.catalogVersion,
        purchase.idempotencyKey,
        purchase.requestHash,
        purchase.ledgerId,
      ],
    );
    return mapPurchase(rows[0]!);
  }

  async hasOwnership(tx: SqlClient, userId: string, mascotId: MascotId): Promise<boolean> {
    const rows = await tx.query(
      `select 1 as owned from mascot_ownerships where user_id = $1 and mascot_id = $2`,
      [userId, mascotId],
    );
    return rows.length > 0;
  }

  async insertOwnership(
    tx: SqlClient,
    input: {
      userId: string;
      mascotId: MascotId;
      source: MascotOwnershipSource;
      ref: Record<string, unknown>;
    },
  ): Promise<boolean> {
    const rows = await tx.query(
      `insert into mascot_ownerships (user_id, mascot_id, source, ref)
       values ($1, $2, $3, $4::jsonb)
       on conflict (user_id, mascot_id) do nothing
       returning mascot_id`,
      [input.userId, input.mascotId, input.source, JSON.stringify(input.ref)],
    );
    return rows.length > 0;
  }

  async getProfile(tx: SqlClient, userId: string, lock: boolean): Promise<ProfileRow | null> {
    const rows = await tx.query(
      `select active_mascot_id, revision, updated_at from mascot_profiles
       where user_id = $1${lock ? ' for update' : ''}`,
      [userId],
    );
    return rows[0] ? mapProfile(rows[0]) : null;
  }

  async provisionProfile(tx: SqlClient, userId: string): Promise<ProvisionResult> {
    const existing = await this.getProfile(tx, userId, false);
    if (existing) return { created: false, profile: existing };

    const legacy = await this.findLegacyMascot(tx, userId);
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
    const inserted = await tx.query(
      `insert into mascot_profiles (user_id, active_mascot_id, revision)
       values ($1, $2, 1)
       on conflict (user_id) do nothing
       returning active_mascot_id, revision, updated_at`,
      [userId, legacy ?? DEFAULT_MASCOT_ID],
    );
    if (inserted[0]) return { created: true, profile: mapProfile(inserted[0]) };
    const winner = await this.getProfile(tx, userId, false);
    if (!winner) throw new Error('Mascot profile conflict could not be resolved');
    return { created: false, profile: winner };
  }

  async setActiveMascot(tx: SqlClient, userId: string, mascotId: MascotId): Promise<ProfileRow> {
    const rows = await tx.query(
      `update mascot_profiles
       set active_mascot_id = $2, revision = revision + 1, updated_at = now()
       where user_id = $1
       returning active_mascot_id, revision, updated_at`,
      [userId, mascotId],
    );
    if (!rows[0]) throw new Error('Mascot profile does not exist');
    return mapProfile(rows[0]);
  }

  async readSnapshot(db: SqlClient, userId: string): Promise<ShopSnapshot> {
    // A single statement reads one consistent snapshot of every table involved.
    const rows = await db.query(
      `select
         (select json_build_object('balance', w.balance::text, 'last_seq', w.last_seq::text)
            from coin_wallets w where w.user_id = $1) as wallet,
         (select coalesce(
                   json_agg(json_build_object(
                     'mascot_id', o.mascot_id, 'source', o.source, 'acquired_at', o.acquired_at)
                     order by o.acquired_at, o.mascot_id),
                   '[]'::json)
            from mascot_ownerships o where o.user_id = $1) as owned,
         (select json_build_object(
                   'active_mascot_id', p.active_mascot_id, 'revision', p.revision,
                   'updated_at', p.updated_at)
            from mascot_profiles p where p.user_id = $1) as profile,
         (select coalesce(sum(l.delta) filter (where l.delta > 0), 0)::text
            from coin_ledger l where l.user_id = $1) as earned,
         (select coalesce(-sum(l.delta) filter (where l.delta < 0), 0)::text
            from coin_ledger l where l.user_id = $1) as spent,
         (select count(*)::text from lesson_rewards r where r.user_id = $1) as lessons_rewarded,
         (${LEGACY_MASCOT_SQL}) as legacy_mascot_id`,
      [userId],
    );
    const row = rows[0] ?? {};
    const wallet = row.wallet as Row | null | undefined;
    const profile = row.profile as Row | null | undefined;
    const owned = (row.owned as Row[] | null | undefined) ?? [];
    return {
      wallet: wallet
        ? { balance: toInt(wallet.balance, 'balance'), lastSeq: toInt(wallet.last_seq, 'last_seq') }
        : null,
      owned: owned.map((item) => ({
        mascotId: mascotOf(item.mascot_id),
        source: String(item.source) as MascotOwnershipSource,
        acquiredAt: toDate(item.acquired_at),
      })),
      profile: profile ? mapProfile(profile) : null,
      earnedXu: toInt(row.earned ?? 0, 'earned'),
      spentXu: toInt(row.spent ?? 0, 'spent'),
      lessonsRewarded: toInt(row.lessons_rewarded ?? 0, 'lessons_rewarded'),
      legacyMascotId: isMascotId(row.legacy_mascot_id) ? row.legacy_mascot_id : null,
    };
  }

  async findLegacyMascot(db: SqlClient, userId: string): Promise<MascotId | null> {
    const rows = await db.query(LEGACY_MASCOT_SQL, [userId]);
    const id = rows[0]?.mascot_id;
    return isMascotId(id) ? id : null;
  }
}
