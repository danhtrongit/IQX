import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { DatabaseService, type SqlClient } from '../../platform/database/database.service.js';
import {
  COIN_POLICY_VERSION,
  DEFAULT_MASCOT_ID,
  MASCOT_CATALOG,
  MASCOT_CATALOG_VERSION,
  findMascot,
  mascotAssetRoot,
  type MascotId,
  type MascotOwnershipSource,
} from './shop.catalog.js';
import {
  ShopRepository,
  type LedgerRow,
  type ProfileRow,
  type PurchaseRow,
  type ShopSnapshot,
} from './shop.repository.js';
import type { ActiveMascotBody, LedgerQuery, PurchaseBody } from './shop.schemas.js';

const ISO = (value: Date) => value.toISOString();

export function purchaseRequestHash(input: {
  mascot_id: string;
  expected_price_xu: number;
  catalog_version: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify([input.mascot_id, input.expected_price_xu, input.catalog_version]),
      'utf8',
    )
    .digest('hex');
}

export function purchaseLedgerKey(userId: string, mascotId: string): string {
  return `mascot_purchase:${userId}:${mascotId}`;
}

type OwnedView = { mascot_id: MascotId; source: MascotOwnershipSource; acquired_at: string | null };
type ActiveView = { mascot_id: MascotId; revision: number; updated_at: string | null };

/** Ownership/profile as the user sees it, including the defaults not yet materialised. */
function effectiveState(snapshot: ShopSnapshot): {
  provisioned: boolean;
  owned: OwnedView[];
  active: ActiveView;
} {
  if (snapshot.profile) {
    return {
      provisioned: true,
      owned: snapshot.owned.map((o) => ({
        mascot_id: o.mascotId,
        source: o.source,
        acquired_at: ISO(o.acquiredAt),
      })),
      active: {
        mascot_id: snapshot.profile.activeMascotId,
        revision: snapshot.profile.revision,
        updated_at: ISO(snapshot.profile.updatedAt),
      },
    };
  }
  // Same rule as provisioning: Bach Ho is always owned; a legacy mascot is kept and active.
  const owned: OwnedView[] = [
    { mascot_id: DEFAULT_MASCOT_ID, source: 'default', acquired_at: null },
  ];
  const legacy = snapshot.legacyMascotId;
  if (legacy && legacy !== DEFAULT_MASCOT_ID) {
    owned.push({ mascot_id: legacy, source: 'legacy_grant', acquired_at: null });
  }
  for (const o of snapshot.owned) {
    if (!owned.some((item) => item.mascot_id === o.mascotId)) {
      owned.push({
        mascot_id: o.mascotId,
        source: o.source,
        acquired_at: ISO(o.acquiredAt),
      });
    }
  }
  return {
    provisioned: false,
    owned,
    active: { mascot_id: legacy ?? DEFAULT_MASCOT_ID, revision: 1, updated_at: null },
  };
}

function purchaseView(purchase: PurchaseRow) {
  return {
    id: purchase.id,
    mascot_id: purchase.mascotId,
    price_xu: purchase.priceXu,
    catalog_version: purchase.catalogVersion,
    idempotency_key: purchase.idempotencyKey,
    ledger_id: purchase.ledgerId,
    created_at: ISO(purchase.createdAt),
  };
}

function ledgerView(row: LedgerRow) {
  const ref = row.ref;
  const text = (key: string) => (typeof ref[key] === 'string' ? (ref[key] as string) : null);
  const mascotId = text('mascot_id');
  return {
    id: row.id,
    seq: row.seq,
    kind: row.kind,
    delta: row.delta,
    balance_after: row.balanceAfter,
    created_at: ISO(row.createdAt),
    label: {
      lesson_key: text('lesson_key'),
      lesson_id: text('lesson_id'),
      mascot_id: mascotId,
      mascot_name: mascotId ? (findMascot(mascotId)?.name ?? null) : null,
    },
  };
}

@Injectable()
export class ShopService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: ShopRepository,
  ) {}

  /** Read-only: catalog, wallet, ownership and active mascot. Never writes (not even defaults). */
  async getShop(userId: string) {
    const snapshot = await this.repository.readSnapshot(this.database, userId);
    const state = effectiveState(snapshot);
    return {
      catalog_version: MASCOT_CATALOG_VERSION,
      catalog: MASCOT_CATALOG.map((entry) => ({
        ...entry,
        asset_root: mascotAssetRoot(entry),
      })),
      wallet: {
        balance: snapshot.wallet?.balance ?? 0,
        last_seq: snapshot.wallet?.lastSeq ?? 0,
      },
      totals: {
        earned_xu: snapshot.earnedXu,
        spent_xu: snapshot.spentXu,
        lessons_rewarded: snapshot.lessonsRewarded,
      },
      owned: state.owned,
      owned_count: state.owned.length,
      total_count: MASCOT_CATALOG.length,
      active: state.active,
      provisioned: state.provisioned,
    };
  }

  /** Full ledger by commit sequence, newest first, paginated by an opaque `seq` cursor. */
  async listLedger(userId: string, query: LedgerQuery) {
    const rows = await this.repository.listLedger(this.database, userId, {
      beforeSeq: query.cursor ? Number(query.cursor) : null,
      limit: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(ledgerView),
      next_cursor: rows.length > query.limit && last ? String(last.seq) : null,
    };
  }

  /**
   * Creates the wallet (0 xu) and the default mascot ownership/profile when they are missing.
   * Idempotent and safe under concurrency; used by workspace onboarding.
   */
  async provision(userId: string) {
    return this.database.transaction(async (tx) => {
      const wallet = await this.repository.lockWallet(tx, userId);
      const profile = await this.repository.provisionProfile(tx, userId);
      const snapshot = await this.repository.readSnapshot(tx, userId);
      return {
        wallet: { balance: wallet.balance, last_seq: wallet.lastSeq, created: wallet.created },
        mascot: {
          active_mascot_id: profile.profile.activeMascotId,
          revision: profile.profile.revision,
          owned: snapshot.owned.map((o) => o.mascotId),
          created: profile.created,
        },
      };
    });
  }

  /** Read-only lookup used after a timeout: did this idempotency key commit a purchase? */
  async getPurchaseStatus(userId: string, idempotencyKey: string) {
    const [purchase, wallet] = await Promise.all([
      this.repository.findPurchaseByKey(this.database, userId, idempotencyKey),
      this.repository.readWallet(this.database, userId),
    ]);
    return {
      idempotency_key: idempotencyKey,
      status: purchase ? ('completed' as const) : ('not_found' as const),
      purchase: purchase ? purchaseView(purchase) : null,
      wallet: { balance: wallet?.balance ?? 0, last_seq: wallet?.lastSeq ?? 0 },
    };
  }

  /**
   * Buy one mascot with xu, atomically (Shop spec 6.2). The wallet row lock serialises every
   * wallet operation of the user, so replay detection, the balance check and the writes
   * cannot interleave with a concurrent purchase or reward.
   */
  async purchase(userId: string, input: PurchaseBody) {
    const requestHash = purchaseRequestHash(input);
    return this.database.transaction(async (tx) => {
      const wallet = await this.repository.lockWallet(tx, userId);

      // 1. A request that already committed replays its result, whatever changed since.
      const previous = await this.repository.findPurchaseByKey(tx, userId, input.idempotency_key);
      if (previous) {
        if (previous.requestHash !== requestHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'idempotency_key đã được dùng cho một yêu cầu khác',
          });
        }
        return this.purchaseResult(tx, userId, 'purchased', true, previous);
      }

      // 2. Resolve catalog and price on the server.
      if (input.catalog_version !== MASCOT_CATALOG_VERSION) {
        throw new ConflictException({
          code: 'CATALOG_CHANGED',
          message: 'Danh mục linh thú đã thay đổi, vui lòng tải lại và xác nhận lại',
          details: [{ catalog_version: MASCOT_CATALOG_VERSION }],
        });
      }
      const mascot = findMascot(input.mascot_id);
      if (!mascot) {
        throw new NotFoundException({
          code: 'MASCOT_NOT_FOUND',
          message: 'Không tìm thấy linh thú',
        });
      }
      if (!mascot.for_sale) {
        throw new ConflictException({
          code: 'MASCOT_NOT_FOR_SALE',
          message: `${mascot.name} không bán`,
        });
      }
      if (input.expected_price_xu !== mascot.price_xu) {
        throw new ConflictException({
          code: 'PRICE_CHANGED',
          message: `Giá đã thay đổi, hiện là ${mascot.price_xu} xu. Vui lòng xác nhận lại`,
          details: [{ current_price_xu: mascot.price_xu, catalog_version: MASCOT_CATALOG_VERSION }],
        });
      }

      // 3. Default (and legacy) ownership must exist before counting what is owned.
      await this.repository.provisionProfile(tx, userId);

      // 4. Already owned: never charge, even with a brand-new idempotency key.
      if (await this.repository.hasOwnership(tx, userId, mascot.mascot_id)) {
        return this.purchaseResult(tx, userId, 'already_owned', false, null);
      }

      // 5. The balance is read under the wallet lock, not taken from the confirmation modal.
      if (wallet.balance < mascot.price_xu) {
        throw new ConflictException({
          code: 'INSUFFICIENT_XU',
          message: `Chưa đủ xu: có ${wallet.balance} xu, cần ${mascot.price_xu} xu`,
          details: [
            {
              balance_xu: wallet.balance,
              price_xu: mascot.price_xu,
              shortfall_xu: mascot.price_xu - wallet.balance,
            },
          ],
        });
      }

      // 6. Ledger -price, purchase row and ownership commit together; active mascot is untouched.
      const ledgerId = randomUUID();
      const seq = wallet.lastSeq + 1;
      const balanceAfter = wallet.balance - mascot.price_xu;
      await this.repository.appendLedger(tx, {
        id: ledgerId,
        userId,
        seq,
        kind: 'mascot_purchase',
        delta: -mascot.price_xu,
        balanceAfter,
        uniqueKey: purchaseLedgerKey(userId, mascot.mascot_id),
        ref: {
          mascot_id: mascot.mascot_id,
          catalog_version: MASCOT_CATALOG_VERSION,
          idempotency_key: input.idempotency_key,
        },
        policyVersion: COIN_POLICY_VERSION,
      });
      const purchase = await this.repository.insertPurchase(tx, {
        id: randomUUID(),
        userId,
        mascotId: mascot.mascot_id,
        priceXu: mascot.price_xu,
        catalogVersion: MASCOT_CATALOG_VERSION,
        idempotencyKey: input.idempotency_key,
        requestHash,
        ledgerId,
      });
      await this.repository.insertOwnership(tx, {
        userId,
        mascotId: mascot.mascot_id,
        source: 'purchase',
        ref: { purchase_id: purchase.id, ledger_id: ledgerId },
      });
      await this.repository.saveWallet(tx, userId, balanceAfter, seq);
      return this.purchaseResult(tx, userId, 'purchased', false, purchase);
    });
  }

  /** Switch the displayed mascot to one the user owns. Free, never touches xu or the Bot. */
  async setActiveMascot(userId: string, input: ActiveMascotBody) {
    const mascot = findMascot(input.mascot_id);
    if (!mascot) {
      throw new NotFoundException({ code: 'MASCOT_NOT_FOUND', message: 'Không tìm thấy linh thú' });
    }
    return this.database.transaction(async (tx) => {
      await this.repository.provisionProfile(tx, userId);
      const current = await this.repository.getProfile(tx, userId, true);
      if (!current) throw new Error('Mascot profile missing after provisioning');
      if (!(await this.repository.hasOwnership(tx, userId, mascot.mascot_id))) {
        throw new ConflictException({
          code: 'MASCOT_NOT_OWNED',
          message: `Bạn chưa sở hữu ${mascot.name}`,
        });
      }
      if (current.activeMascotId === mascot.mascot_id) {
        return { changed: false, active: this.activeView(current) };
      }
      if (current.revision !== input.expected_revision) {
        throw new ConflictException({
          code: 'REVISION_CONFLICT',
          message: 'Linh thú đang sử dụng đã được thay đổi ở nơi khác, vui lòng tải lại',
          details: [
            { current_revision: current.revision, active_mascot_id: current.activeMascotId },
          ],
        });
      }
      const updated = await this.repository.setActiveMascot(tx, userId, mascot.mascot_id);
      return { changed: true, active: this.activeView(updated) };
    });
  }

  private activeView(profile: ProfileRow): ActiveView {
    return {
      mascot_id: profile.activeMascotId,
      revision: profile.revision,
      updated_at: ISO(profile.updatedAt),
    };
  }

  private async purchaseResult(
    db: SqlClient,
    userId: string,
    status: 'purchased' | 'already_owned',
    replayed: boolean,
    purchase: PurchaseRow | null,
  ) {
    const snapshot = await this.repository.readSnapshot(db, userId);
    const state = effectiveState(snapshot);
    return {
      status,
      replayed,
      purchase: purchase ? purchaseView(purchase) : null,
      wallet: {
        balance: snapshot.wallet?.balance ?? 0,
        last_seq: snapshot.wallet?.lastSeq ?? 0,
      },
      owned: state.owned,
      active: state.active,
      catalog_version: MASCOT_CATALOG_VERSION,
    };
  }
}
