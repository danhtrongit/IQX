/**
 * Lưu trữ mưa lộc (`tf_coin_rains`, `tf_coin_grabs`) và ghi ví xu (`coin_wallets` + `coin_ledger`).
 * Mọi hàm ghi chạy trong transaction của người gọi; ví khoá `FOR UPDATE` và `seq = last_seq + 1`
 * như `FlashbackRepository.lockWallet/saveWallet/appendLedger`.
 */

import { Injectable } from '@nestjs/common';

import type { SqlClient } from '../../platform/database/database.service.js';

export const FLOOR_FX_REPOSITORY = Symbol('FLOOR_FX_REPOSITORY');

export const FLOOR_RAIN_POLICY = 'iqx-floor-rain-v1';

export interface NewCoinRain {
  readonly giverUserId: string;
  readonly amount: number;
  readonly coins: number;
  readonly expiresAt: Date;
}

export interface CoinGrab {
  readonly rainId: string;
  readonly coin: number;
  readonly userId: string;
}

export interface RainSettlement {
  readonly giverUserId: string;
  /** Số xu hoàn cho người tán (0 khi mọi đồng đã có người nhặt). */
  readonly refund: number;
  /** Số dư sau khi hoàn; null khi không hoàn gì. */
  readonly balance: number | null;
}

export abstract class FloorFxRepository {
  /** Trừ ví người tán và tạo cơn mưa; 'insufficient' khi ví không đủ. */
  abstract createRain(
    tx: SqlClient,
    input: NewCoinRain,
  ): Promise<{ id: string; balance: number } | 'insufficient'>;
  /** Nhặt một đồng và cộng ví; null khi đồng đã bị nhặt, mưa đã tạnh hoặc người nhặt là người tán. */
  abstract grab(tx: SqlClient, input: CoinGrab): Promise<{ balance: number; value: number } | null>;
  /** Chốt cơn mưa một lần duy nhất và hoàn phần chưa ai nhặt; null khi đã chốt hoặc không có. */
  abstract settle(tx: SqlClient, rainId: string): Promise<RainSettlement | null>;
  /** Các cơn mưa đã hết giờ mà chưa chốt (tiến trình API khởi động lại giữa chừng). */
  abstract listUnsettledExpired(db: SqlClient, limit?: number): Promise<string[]>;
}

type Row = Record<string, unknown>;

const toInt = (value: unknown, field: string): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`floor rain: ${field} is not an integer`);
  return n;
};

type LedgerKind = 'floor_rain_give' | 'floor_rain_catch' | 'floor_rain_refund';

@Injectable()
export class PgFloorFxRepository extends FloorFxRepository {
  async createRain(
    tx: SqlClient,
    input: NewCoinRain,
  ): Promise<{ id: string; balance: number } | 'insufficient'> {
    const wallet = await this.lockWallet(tx, input.giverUserId);
    if (wallet.balance < input.amount) return 'insufficient';
    const rows = await tx.query<Row>(
      `insert into tf_coin_rains (giver_user_id, amount, coin_value, coins, expires_at)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [input.giverUserId, input.amount, input.amount / input.coins, input.coins, input.expiresAt],
    );
    const id = String(rows[0]!.id);
    const balance = await this.move(tx, input.giverUserId, wallet, {
      kind: 'floor_rain_give',
      delta: -input.amount,
      uniqueKey: `floor_rain_give:${id}`,
      ref: { rain_id: id },
    });
    return { id, balance };
  }

  // `for share` chờ `settle` (giữ `for update`) xong rồi đọc lại `settled_at`: một lượt nhặt không thể
  // lọt vào giữa lúc chốt, nên không có đồng nào vừa trả cho người nhặt vừa hoàn cho người tán.
  async grab(tx: SqlClient, input: CoinGrab): Promise<{ balance: number; value: number } | null> {
    const rows = await tx.query<Row>(
      `insert into tf_coin_grabs (rain_id, coin, user_id)
       select r.id, $2, $3 from tf_coin_rains r
        where r.id = $1 and r.settled_at is null and r.expires_at > now()
          and r.giver_user_id <> $3 and $2 < r.coins
        for share
       on conflict do nothing
       returning (select coin_value from tf_coin_rains where id = $1) as value`,
      [input.rainId, input.coin, input.userId],
    );
    if (!rows[0]) return null;
    const value = toInt(rows[0].value, 'coin_value');
    const wallet = await this.lockWallet(tx, input.userId);
    const balance = await this.move(tx, input.userId, wallet, {
      kind: 'floor_rain_catch',
      delta: value,
      uniqueKey: `floor_rain_catch:${input.rainId}:${input.coin}`,
      ref: { rain_id: input.rainId, coin: input.coin },
    });
    return { balance, value };
  }

  async settle(tx: SqlClient, rainId: string): Promise<RainSettlement | null> {
    const rains = await tx.query<Row>(
      `select giver_user_id, coins, coin_value from tf_coin_rains
        where id = $1 and settled_at is null
        for update`,
      [rainId],
    );
    const rain = rains[0];
    if (!rain) return null;
    const grabs = await tx.query<Row>(
      `select count(*)::int as n from tf_coin_grabs where rain_id = $1`,
      [rainId],
    );
    const left = Math.max(0, toInt(rain.coins, 'coins') - toInt(grabs[0]?.n ?? 0, 'grabs'));
    const refund = left * toInt(rain.coin_value, 'coin_value');
    const updated = await tx.query<Row>(
      `update tf_coin_rains set settled_at = now(), refunded = $2
        where id = $1 and settled_at is null
        returning id`,
      [rainId, refund],
    );
    if (!updated[0]) return null;
    const giverUserId = String(rain.giver_user_id);
    if (refund <= 0) return { giverUserId, refund: 0, balance: null };
    const wallet = await this.lockWallet(tx, giverUserId);
    const balance = await this.move(tx, giverUserId, wallet, {
      kind: 'floor_rain_refund',
      delta: refund,
      uniqueKey: `floor_rain_refund:${rainId}`,
      ref: { rain_id: rainId },
    });
    return { giverUserId, refund, balance };
  }

  async listUnsettledExpired(db: SqlClient, limit = 50): Promise<string[]> {
    const rows = await db.query<Row>(
      `select id from tf_coin_rains
        where settled_at is null and expires_at < now()
        order by expires_at
        limit $1`,
      [limit],
    );
    return rows.map((row) => String(row.id));
  }

  // ================================================================== ví xu

  private async lockWallet(
    tx: SqlClient,
    userId: string,
  ): Promise<{ balance: number; lastSeq: number }> {
    const lockSql = `select balance::text as balance, last_seq::text as last_seq
       from coin_wallets where user_id = $1 for update`;
    let rows = await tx.query<Row>(lockSql, [userId]);
    if (!rows[0]) {
      await tx.query(
        `insert into coin_wallets (user_id) values ($1) on conflict (user_id) do nothing`,
        [userId],
      );
      rows = await tx.query<Row>(lockSql, [userId]);
    }
    if (!rows[0]) throw new Error('floor rain: could not lock the coin wallet');
    return {
      balance: toInt(rows[0].balance, 'balance'),
      lastSeq: toInt(rows[0].last_seq, 'last_seq'),
    };
  }

  /**
   * Ghi một dòng sổ cái rồi lưu ví. Dòng trùng `unique_key` (đã ghi trước đó) thì giữ nguyên ví:
   * cộng trừ hai lần là mất tiền thật.
   */
  private async move(
    tx: SqlClient,
    userId: string,
    wallet: { balance: number; lastSeq: number },
    entry: { kind: LedgerKind; delta: number; uniqueKey: string; ref: Record<string, unknown> },
  ): Promise<number> {
    const balance = wallet.balance + entry.delta;
    const seq = wallet.lastSeq + 1;
    const inserted = await tx.query<Row>(
      `insert into coin_ledger
         (id, user_id, seq, kind, delta, balance_after, unique_key, ref, policy_version)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       on conflict (unique_key) do nothing
       returning id`,
      [
        userId,
        seq,
        entry.kind,
        entry.delta,
        balance,
        entry.uniqueKey,
        JSON.stringify(entry.ref),
        FLOOR_RAIN_POLICY,
      ],
    );
    if (!inserted[0]) return wallet.balance;
    await tx.query(
      `update coin_wallets set balance = $2, last_seq = $3, updated_at = now() where user_id = $1`,
      [userId, balance, seq],
    );
    return balance;
  }
}
