import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService, type SqlClient } from '../../platform/database/database.service.js';
import type {
  ConfigSnapshot,
  OrderSide,
  OrderStatus,
  TradingAccount,
  TradingConfig,
  TradingOrder,
  TradingPosition,
} from './trading.types.js';

type Row = Record<string, unknown>;

function bigint(value: unknown): bigint {
  return BigInt(value as string | number | bigint);
}

function nullableBigint(value: unknown): bigint | null {
  return value == null ? null : bigint(value);
}

function date(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function nullableDate(value: unknown): Date | null {
  return value == null ? null : date(value);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function mapConfig(row: Row): TradingConfig {
  return {
    id: String(row.id),
    initialCashVnd: bigint(row.initial_cash_vnd),
    buyFeeRateBps: Number(row.buy_fee_rate_bps),
    sellFeeRateBps: Number(row.sell_fee_rate_bps),
    sellTaxRateBps: Number(row.sell_tax_rate_bps),
    settlementMode: String(row.settlement_mode) as 'T0' | 'T2',
    boardLotSize: Number(row.board_lot_size),
    tradingEnabled: Boolean(row.trading_enabled),
    holidays: parseJson<string[]>(row.holidays, []),
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
  };
}

export function mapAccount(row: Row): TradingAccount {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    status: String(row.status) as 'active' | 'suspended',
    initialCashVnd: bigint(row.initial_cash_vnd),
    cashAvailableVnd: bigint(row.cash_available_vnd),
    cashReservedVnd: bigint(row.cash_reserved_vnd),
    cashPendingVnd: bigint(row.cash_pending_vnd),
    activatedAt: date(row.activated_at),
    resetAt: nullableDate(row.reset_at),
    frozenAt: nullableDate(row.frozen_at),
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
  };
}

export function mapPosition(row: Row): TradingPosition {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    symbol: String(row.symbol),
    quantityTotal: Number(row.quantity_total),
    quantitySellable: Number(row.quantity_sellable),
    quantityPending: Number(row.quantity_pending),
    quantityReserved: Number(row.quantity_reserved),
    avgCostVnd: bigint(row.avg_cost_vnd),
    activePlanBuyOrderId:
      row.active_plan_buy_order_id == null ? null : String(row.active_plan_buy_order_id),
    activeOriginalStopVnd: nullableBigint(row.active_original_stop_vnd),
    activeOriginalTakeProfitVnd: nullableBigint(row.active_original_take_profit_vnd),
    activeDynamicStopVnd: nullableBigint(row.active_dynamic_stop_vnd),
  };
}

export function mapOrder(row: Row): TradingOrder {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    userId: String(row.user_id),
    symbol: String(row.symbol),
    mode: String(row.mode) as 'san_tap' | 'thuc_chien',
    side: String(row.side) as OrderSide,
    orderType: String(row.order_type) as 'market' | 'limit',
    status: String(row.status) as OrderStatus,
    quantity: Number(row.quantity),
    limitPriceVnd: nullableBigint(row.limit_price_vnd),
    reservedCashVnd: bigint(row.reserved_cash_vnd),
    reservedQuantity: Number(row.reserved_quantity),
    filledPriceVnd: nullableBigint(row.filled_price_vnd),
    grossAmountVnd: nullableBigint(row.gross_amount_vnd),
    feeVnd: nullableBigint(row.fee_vnd),
    taxVnd: nullableBigint(row.tax_vnd),
    netAmountVnd: nullableBigint(row.net_amount_vnd),
    tradingDate: String(row.trading_date).slice(0, 10),
    expiresAt: nullableDate(row.expires_at),
    rejectionReason: row.rejection_reason == null ? null : String(row.rejection_reason),
    cancelReason: row.cancel_reason == null ? null : String(row.cancel_reason),
    configSnapshot: parseJson<ConfigSnapshot>(row.config_snapshot, {
      buy_fee_rate_bps: 0,
      sell_fee_rate_bps: 0,
      sell_tax_rate_bps: 0,
      settlement_mode: 'T0',
      board_lot_size: 100,
    }),
    exitMatchedBuyOrderId:
      row.exit_matched_buy_order_id == null ? null : String(row.exit_matched_buy_order_id),
    exitSnapshotAt: nullableDate(row.exit_snapshot_at),
    exitAvgCostVnd: nullableBigint(row.exit_avg_cost_vnd),
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
  };
}

@Injectable()
export class TradingRepository {
  constructor(private readonly database: DatabaseService) {}

  transaction<T>(operation: (tx: SqlClient) => Promise<T>): Promise<T> {
    return this.database.transaction(operation);
  }

  async getConfig(client: SqlClient = this.database): Promise<TradingConfig | null> {
    const rows = await client.query(
      `select * from virtual_trading_configs where is_active = true limit 1`,
    );
    return rows[0] ? mapConfig(rows[0]) : null;
  }

  async ensureConfig(tx: SqlClient, createdBy?: string): Promise<TradingConfig> {
    await tx.query(`select pg_advisory_xact_lock(hashtext('iqx:virtual-trading:active-config'))`);
    const existing = await this.getConfig(tx);
    if (existing) return existing;
    const rows = await tx.query(
      `insert into virtual_trading_configs
       (id, initial_cash_vnd, buy_fee_rate_bps, sell_fee_rate_bps, sell_tax_rate_bps,
        settlement_mode, board_lot_size, trading_enabled, holidays, is_active,
        created_by, created_at, updated_at)
       values ($1, 100000000, 15, 15, 10, 'T0', 100, true, '[]', true, $2, now(), now())
       returning *`,
      [randomUUID(), createdBy ?? null],
    );
    return mapConfig(rows[0]!);
  }

  async getAccountByUser(
    userId: string,
    client: SqlClient = this.database,
    lock = false,
  ): Promise<TradingAccount | null> {
    const rows = await client.query(
      `select * from virtual_trading_accounts where user_id = $1${lock ? ' for update' : ''}`,
      [userId],
    );
    return rows[0] ? mapAccount(rows[0]) : null;
  }

  async getAccountById(
    tx: SqlClient,
    accountId: string,
    lock = false,
  ): Promise<TradingAccount | null> {
    const rows = await tx.query(
      `select * from virtual_trading_accounts where id = $1${lock ? ' for update' : ''}`,
      [accountId],
    );
    return rows[0] ? mapAccount(rows[0]) : null;
  }

  async createAccount(tx: SqlClient, userId: string, initialCash: bigint): Promise<TradingAccount> {
    const rows = await tx.query(
      `insert into virtual_trading_accounts
       (id, user_id, status, initial_cash_vnd, cash_available_vnd, cash_reserved_vnd,
        cash_pending_vnd, activated_at, created_at, updated_at)
       values ($1, $2, 'active', $3, $3, 0, 0, now(), now(), now()) returning *`,
      [randomUUID(), userId, initialCash.toString()],
    );
    return mapAccount(rows[0]!);
  }

  async updateCash(tx: SqlClient, account: TradingAccount): Promise<TradingAccount> {
    const rows = await tx.query(
      `update virtual_trading_accounts
       set cash_available_vnd=$2, cash_reserved_vnd=$3, cash_pending_vnd=$4, updated_at=now()
       where id=$1 returning *`,
      [
        account.id,
        account.cashAvailableVnd.toString(),
        account.cashReservedVnd.toString(),
        account.cashPendingVnd.toString(),
      ],
    );
    return mapAccount(rows[0]!);
  }

  async listPositions(
    accountId: string,
    client: SqlClient = this.database,
  ): Promise<TradingPosition[]> {
    const rows = await client.query(
      `select * from virtual_positions where account_id=$1 order by symbol`,
      [accountId],
    );
    return rows.map(mapPosition);
  }

  async getPosition(
    tx: SqlClient,
    accountId: string,
    symbol: string,
    lock = false,
  ): Promise<TradingPosition | null> {
    const rows = await tx.query(
      `select * from virtual_positions where account_id=$1 and symbol=$2${lock ? ' for update' : ''}`,
      [accountId, symbol],
    );
    return rows[0] ? mapPosition(rows[0]) : null;
  }

  async savePosition(
    tx: SqlClient,
    position: Omit<TradingPosition, 'id'> & { id?: string },
  ): Promise<TradingPosition> {
    const rows = await tx.query(
      `insert into virtual_positions
       (id, account_id, symbol, quantity_total, quantity_sellable, quantity_pending,
        quantity_reserved, avg_cost_vnd, active_plan_buy_order_id,
        active_original_stop_vnd, active_original_take_profit_vnd, active_dynamic_stop_vnd,
        created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now())
       on conflict (account_id, symbol) do update set
         quantity_total=excluded.quantity_total,
         quantity_sellable=excluded.quantity_sellable,
         quantity_pending=excluded.quantity_pending,
         quantity_reserved=excluded.quantity_reserved,
         avg_cost_vnd=excluded.avg_cost_vnd,
         active_plan_buy_order_id=excluded.active_plan_buy_order_id,
         active_original_stop_vnd=excluded.active_original_stop_vnd,
         active_original_take_profit_vnd=excluded.active_original_take_profit_vnd,
         active_dynamic_stop_vnd=excluded.active_dynamic_stop_vnd,
         updated_at=now()
       returning *`,
      [
        position.id ?? randomUUID(),
        position.accountId,
        position.symbol,
        position.quantityTotal,
        position.quantitySellable,
        position.quantityPending,
        position.quantityReserved,
        position.avgCostVnd.toString(),
        position.activePlanBuyOrderId,
        position.activeOriginalStopVnd?.toString() ?? null,
        position.activeOriginalTakeProfitVnd?.toString() ?? null,
        position.activeDynamicStopVnd?.toString() ?? null,
      ],
    );
    return mapPosition(rows[0]!);
  }

  async createOrder(
    tx: SqlClient,
    input: {
      accountId: string;
      userId: string;
      symbol: string;
      mode: string;
      side: OrderSide;
      orderType: 'market' | 'limit';
      status: OrderStatus;
      quantity: number;
      limitPriceVnd?: bigint | null;
      reservedCashVnd?: bigint;
      reservedQuantity?: number;
      tradingDate: string;
      expiresAt?: Date | null;
      rejectionReason?: string | null;
      snapshot: ConfigSnapshot;
    },
  ): Promise<TradingOrder> {
    const rows = await tx.query(
      `insert into virtual_orders
       (id, account_id, user_id, symbol, mode, side, order_type, status, quantity,
        limit_price_vnd, reserved_cash_vnd, reserved_quantity, trading_date, expires_at,
        rejection_reason, config_snapshot, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now())
       returning *`,
      [
        randomUUID(),
        input.accountId,
        input.userId,
        input.symbol,
        input.mode,
        input.side,
        input.orderType,
        input.status,
        input.quantity,
        input.limitPriceVnd?.toString() ?? null,
        (input.reservedCashVnd ?? 0n).toString(),
        input.reservedQuantity ?? 0,
        input.tradingDate,
        input.expiresAt ?? null,
        input.rejectionReason ?? null,
        JSON.stringify(input.snapshot),
      ],
    );
    return mapOrder(rows[0]!);
  }

  async getOrder(
    orderId: string,
    client: SqlClient = this.database,
    lock = false,
  ): Promise<TradingOrder | null> {
    const rows = await client.query(
      `select * from virtual_orders where id=$1${lock ? ' for update' : ''}`,
      [orderId],
    );
    return rows[0] ? mapOrder(rows[0]) : null;
  }

  async saveOrder(tx: SqlClient, order: TradingOrder): Promise<TradingOrder> {
    const rows = await tx.query(
      `update virtual_orders set
        status=$2, reserved_cash_vnd=$3, reserved_quantity=$4, filled_price_vnd=$5,
        gross_amount_vnd=$6, fee_vnd=$7, tax_vnd=$8, net_amount_vnd=$9,
        rejection_reason=$10, cancel_reason=$11, exit_matched_buy_order_id=$12,
        exit_snapshot_at=$13, exit_avg_cost_vnd=$14, updated_at=now()
       where id=$1 returning *`,
      [
        order.id,
        order.status,
        order.reservedCashVnd.toString(),
        order.reservedQuantity,
        order.filledPriceVnd?.toString() ?? null,
        order.grossAmountVnd?.toString() ?? null,
        order.feeVnd?.toString() ?? null,
        order.taxVnd?.toString() ?? null,
        order.netAmountVnd?.toString() ?? null,
        order.rejectionReason,
        order.cancelReason,
        order.exitMatchedBuyOrderId,
        order.exitSnapshotAt,
        order.exitAvgCostVnd?.toString() ?? null,
      ],
    );
    return mapOrder(rows[0]!);
  }

  async listOrders(
    accountId: string,
    filters: { status?: string; symbol?: string; side?: string; page: number; pageSize: number },
  ): Promise<{ rows: TradingOrder[]; total: number }> {
    const values: unknown[] = [accountId];
    const conditions = ['account_id=$1'];
    for (const [column, value] of [
      ['status', filters.status],
      ['symbol', filters.symbol],
      ['side', filters.side],
    ] as const) {
      if (value) {
        values.push(value);
        conditions.push(`${column}=$${values.length}`);
      }
    }
    const where = conditions.join(' and ');
    const count = await this.database.query<{ total: string }>(
      `select count(*)::text as total from virtual_orders where ${where}`,
      values,
    );
    values.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
    const rows = await this.database.query(
      `select * from virtual_orders where ${where} order by created_at desc
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { rows: rows.map(mapOrder), total: Number(count[0]?.total ?? 0) };
  }

  async listPending(
    accountId: string,
    client: SqlClient = this.database,
    lock = false,
  ): Promise<TradingOrder[]> {
    const rows = await client.query(
      `select * from virtual_orders where account_id=$1 and status='pending'
       order by created_at, id${lock ? ' for update' : ''}`,
      [accountId],
    );
    return rows.map(mapOrder);
  }

  async insertTrade(
    tx: SqlClient,
    input: {
      orderId: string;
      accountId: string;
      symbol: string;
      side: OrderSide;
      quantity: number;
      priceVnd: bigint;
      grossAmountVnd: bigint;
      feeVnd: bigint;
      taxVnd: bigint;
      netAmountVnd: bigint;
      priceSource: string;
      priceTime: Date;
    },
  ): Promise<Row> {
    const rows = await tx.query(
      `insert into virtual_trades
       (id, order_id, account_id, symbol, side, quantity, price_vnd, gross_amount_vnd,
        fee_vnd, tax_vnd, net_amount_vnd, price_source, price_time, traded_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now(),now()) returning *`,
      [
        randomUUID(),
        input.orderId,
        input.accountId,
        input.symbol,
        input.side,
        input.quantity,
        input.priceVnd.toString(),
        input.grossAmountVnd.toString(),
        input.feeVnd.toString(),
        input.taxVnd.toString(),
        input.netAmountVnd.toString(),
        input.priceSource,
        input.priceTime,
      ],
    );
    return rows[0]!;
  }

  async insertSettlement(
    tx: SqlClient,
    input: {
      accountId: string;
      tradeId: string;
      kind: string;
      amount: bigint;
      symbol?: string;
      dueDate: string;
    },
  ): Promise<void> {
    await tx.query(
      `insert into virtual_settlements
       (id, account_id, trade_id, kind, amount, symbol, due_date, status, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,'pending',now(),now())`,
      [
        randomUUID(),
        input.accountId,
        input.tradeId,
        input.kind,
        input.amount.toString(),
        input.symbol ?? null,
        input.dueDate,
      ],
    );
  }

  async insertLedger(
    tx: SqlClient,
    input: {
      accountId: string;
      amount: bigint;
      balanceAfter: bigint;
      kind: string;
      referenceType?: string;
      referenceId?: string;
      note?: string;
    },
  ): Promise<void> {
    await tx.query(
      `insert into virtual_cash_ledger
       (id, account_id, amount_vnd, balance_after_vnd, kind, reference_type, reference_id, note, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
      [
        randomUUID(),
        input.accountId,
        input.amount.toString(),
        input.balanceAfter.toString(),
        input.kind,
        input.referenceType ?? null,
        input.referenceId ?? null,
        input.note ?? null,
      ],
    );
  }

  async listTrades(
    accountId: string,
    page: number,
    pageSize: number,
  ): Promise<{ rows: Row[]; total: number }> {
    const count = await this.database.query<{ total: string }>(
      `select count(*)::text as total from virtual_trades where account_id=$1`,
      [accountId],
    );
    const rows = await this.database.query(
      `select * from virtual_trades where account_id=$1 order by traded_at desc
       limit $2 offset $3`,
      [accountId, pageSize, (page - 1) * pageSize],
    );
    return { rows, total: Number(count[0]?.total ?? 0) };
  }

  async listDueSettlements(tx: SqlClient, accountId: string, asOf: string): Promise<Row[]> {
    return tx.query(
      `select * from virtual_settlements
       where account_id=$1 and status='pending' and due_date <= $2
       order by due_date, id for update`,
      [accountId, asOf],
    );
  }

  async settle(tx: SqlClient, settlementId: string): Promise<boolean> {
    const rows = await tx.query<{ id: string }>(
      `update virtual_settlements set status='settled', settled_at=now(), updated_at=now()
       where id=$1 and status='pending' returning id`,
      [settlementId],
    );
    return rows.length === 1;
  }

  async listActiveAccounts(limit: number): Promise<TradingAccount[]> {
    const rows = await this.database.query(
      `select * from virtual_trading_accounts where status='active'
       order by activated_at desc limit $1`,
      [limit],
    );
    return rows.map(mapAccount);
  }

  async countActiveAccounts(): Promise<number> {
    const rows = await this.database.query<{ total: string }>(
      `select count(*)::text as total from virtual_trading_accounts where status='active'`,
    );
    return Number(rows[0]?.total ?? 0);
  }

  async userNames(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.database.query<{ id: string; full_name: string }>(
      `select id, full_name from users where id = any($1::uuid[])`,
      [userIds],
    );
    return new Map(rows.map((row) => [row.id, row.full_name]));
  }

  async listLedger(
    accountId: string,
    page: number,
    pageSize: number,
  ): Promise<{ rows: Row[]; total: number }> {
    const count = await this.database.query<{ total: string }>(
      `select count(*)::text as total from virtual_cash_ledger where account_id=$1`,
      [accountId],
    );
    const rows = await this.database.query(
      `select * from virtual_cash_ledger where account_id=$1 order by created_at desc, id desc
       limit $2 offset $3`,
      [accountId, pageSize, (page - 1) * pageSize],
    );
    return { rows, total: Number(count[0]?.total ?? 0) };
  }
}
