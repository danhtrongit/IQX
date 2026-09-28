import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import type { AuditContext } from './admin-audit.service.js';
import { AdminAuditService } from './admin-audit.service.js';
import type {
  AccountListQuery,
  CashAdjustInput,
  LedgerQuery,
  OrdersQuery,
  ResetAccountInput,
  ResetAllInput,
  SettlementsQuery,
  TradesQuery,
  TradingConfigUpdate,
} from './admin.schemas.js';

function json<T>(value: unknown): T {
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value as T;
}

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = -MAX_SAFE_BIGINT;

/**
 * PostgreSQL BIGINT is deliberately parsed as a string by node-postgres.  Keep
 * it exact for every calculation and only expose a JSON number after proving
 * that the value is representable without rounding.
 */
function safeMoney(value: unknown, field: string): number {
  let parsed: bigint;
  try {
    parsed = typeof value === 'bigint' ? value : BigInt(String(value));
  } catch {
    throw new UnprocessableEntityException({
      code: 'MONEY_INVALID',
      message: `Trường tiền tệ ${field} không hợp lệ`,
    });
  }
  if (parsed < MIN_SAFE_BIGINT || parsed > MAX_SAFE_BIGINT) {
    throw new UnprocessableEntityException({
      code: 'MONEY_OUT_OF_RANGE',
      message: `Trường tiền tệ ${field} vượt quá phạm vi JSON an toàn`,
    });
  }
  return Number(parsed);
}

function exactMoney(value: unknown, field: string): bigint {
  let parsed: bigint;
  try {
    parsed = typeof value === 'bigint' ? value : BigInt(String(value));
  } catch {
    throw new UnprocessableEntityException({
      code: 'MONEY_INVALID',
      message: `Trường tiền tệ ${field} không hợp lệ`,
    });
  }
  if (parsed < MIN_SAFE_BIGINT || parsed > MAX_SAFE_BIGINT) {
    throw new UnprocessableEntityException({
      code: 'MONEY_OUT_OF_RANGE',
      message: `Trường tiền tệ ${field} vượt quá phạm vi JSON an toàn`,
    });
  }
  return parsed;
}

const MONEY_FIELDS = new Set([
  'initial_cash_vnd',
  'cash_available_vnd',
  'cash_reserved_vnd',
  'cash_pending_vnd',
  'avg_cost_vnd',
  'limit_price_vnd',
  'filled_price_vnd',
  'gross_amount_vnd',
  'fee_vnd',
  'tax_vnd',
  'net_amount_vnd',
  'price_vnd',
  'balance_after_vnd',
  'amount_vnd',
  'exit_original_stop_vnd',
  'exit_original_take_profit_vnd',
  'exit_dynamic_stop_vnd',
  'exit_avg_cost_vnd',
]);

function normalizeMoneyRecord(row: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...row };
  for (const field of MONEY_FIELDS) {
    if (normalized[field] !== null && normalized[field] !== undefined) {
      normalized[field] = safeMoney(normalized[field], field);
    }
  }
  return normalized;
}

function page(total: number, query: { page: number; page_size: number }): Record<string, number> {
  return {
    total,
    page: query.page,
    page_size: query.page_size,
    total_pages: Math.ceil(total / query.page_size),
  };
}

@Injectable()
export class AdminVTService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AdminAuditService,
  ) {}

  async account(accountId: string): Promise<Record<string, unknown>> {
    const rows = await this.database.query<Record<string, unknown>>(
      `select a.*, u.email as user_email, u.full_name as user_name
         from virtual_trading_accounts a join users u on u.id = a.user_id where a.id = $1::uuid`,
      [accountId],
    );
    if (!rows[0])
      throw new NotFoundException({
        code: 'VT_ACCOUNT_NOT_FOUND',
        message: 'Không tìm thấy tài khoản giao dịch ảo',
      });
    return normalizeMoneyRecord(rows[0]);
  }

  async accounts(query: AccountListQuery): Promise<Record<string, unknown>> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      clauses.push(sql.replace('?', `$${values.length}`));
    };
    if (query.status) add('a.status = ?', query.status);
    if (query.frozen_only !== undefined)
      clauses.push(query.frozen_only ? 'a.frozen_at is not null' : 'a.frozen_at is null');
    if (query.search) {
      values.push(`%${query.search}%`);
      clauses.push(`(u.email ilike $${values.length} or u.full_name ilike $${values.length})`);
    }
    const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
    const count = await this.database.query<{ total: string }>(
      `select count(*)::text as total from virtual_trading_accounts a join users u on u.id = a.user_id ${where}`,
      values,
    );
    const rows = await this.database.query<Record<string, unknown>>(
      `select a.*, u.email as user_email, u.full_name as user_name
         from virtual_trading_accounts a join users u on u.id = a.user_id ${where}
        order by a.created_at desc, a.id desc limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, query.page_size, (query.page - 1) * query.page_size],
    );
    return { items: rows.map(normalizeMoneyRecord), ...page(Number(count[0]?.total ?? 0), query) };
  }

  async positions(accountId: string) {
    await this.account(accountId);
    const rows = await this.database.query<Record<string, unknown>>(
      `select * from virtual_positions where account_id = $1::uuid order by symbol`,
      [accountId],
    );
    return rows.map(normalizeMoneyRecord);
  }

  async orders(accountId: string, query: OrdersQuery): Promise<Record<string, unknown>> {
    await this.account(accountId);
    return this.paginated('virtual_orders', accountId, query, [
      query.status ? ['status', query.status] : null,
      query.symbol ? ['symbol', query.symbol] : null,
      query.date_from ? ['trading_date >=', query.date_from] : null,
      query.date_to ? ['trading_date <=', query.date_to] : null,
    ]);
  }

  async trades(accountId: string, query: TradesQuery): Promise<Record<string, unknown>> {
    await this.account(accountId);
    return this.paginated('virtual_trades', accountId, query, [
      query.symbol ? ['symbol', query.symbol] : null,
    ]);
  }

  async ledger(accountId: string, query: LedgerQuery): Promise<Record<string, unknown>> {
    await this.account(accountId);
    return this.paginated('virtual_cash_ledger', accountId, query, [
      query.kind ? ['kind', query.kind] : null,
    ]);
  }

  async settlements(accountId: string, query: SettlementsQuery): Promise<Record<string, unknown>> {
    await this.account(accountId);
    return this.paginated('virtual_settlements', accountId, query, [
      query.status ? ['status', query.status] : null,
    ]);
  }

  async stats(accountId: string): Promise<Record<string, unknown>> {
    await this.account(accountId);
    const rows = await this.database.query<Record<string, string>>(
      `select
         (select count(*) from virtual_orders where account_id = $1::uuid)::text as total_orders,
         (select count(*) from virtual_trades where account_id = $1::uuid)::text as total_trades,
         coalesce((select sum(net_amount_vnd) from virtual_trades where account_id = $1::uuid and side = 'buy'), 0)::text as buy,
         coalesce((select sum(net_amount_vnd) from virtual_trades where account_id = $1::uuid and side = 'sell'), 0)::text as sell`,
      [accountId],
    );
    const row = rows[0] ?? { total_orders: '0', total_trades: '0', buy: '0', sell: '0' };
    const buy = exactMoney(row.buy, 'gross_buy_vnd');
    const sell = exactMoney(row.sell, 'gross_sell_vnd');
    const grossBuy = buy < 0n ? -buy : buy;
    const realized = sell - grossBuy;
    const turnover = sell + grossBuy;
    const realizedNumber = safeMoney(realized, 'realized_pnl_vnd');
    const turnoverNumber = safeMoney(turnover, 'turnover_vnd');
    return {
      account_id: accountId,
      total_orders: Number(row.total_orders),
      total_trades: Number(row.total_trades),
      gross_buy_vnd: Number(grossBuy),
      gross_sell_vnd: Number(sell),
      realized_pnl_vnd: realizedNumber,
      turnover_vnd: turnoverNumber,
      win_rate: null,
    };
  }

  async freeze(accountId: string, context: AuditContext, reason: string) {
    return this.mutateAccount(accountId, context, 'freeze', reason);
  }
  async unfreeze(accountId: string, context: AuditContext, reason?: string) {
    return this.mutateAccount(accountId, context, 'unfreeze', reason ?? '');
  }

  async cashAdjust(
    accountId: string,
    context: AuditContext,
    input: CashAdjustInput,
  ): Promise<Record<string, unknown>> {
    if (!input.amount_vnd)
      throw new BadRequestException({
        code: 'INVALID_AMOUNT',
        message: 'Số tiền điều chỉnh khác 0',
      });
    const result = await this.database.transaction(async (tx) => {
      const rows = await tx.query<Record<string, string>>(
        `select * from virtual_trading_accounts where id = $1::uuid for update`,
        [accountId],
      );
      const acct = rows[0];
      if (!acct)
        throw new NotFoundException({
          code: 'VT_ACCOUNT_NOT_FOUND',
          message: 'Không tìm thấy tài khoản',
        });
      const current = exactMoney(acct.cash_available_vnd, 'cash_available_vnd');
      const adjustment = BigInt(input.amount_vnd);
      const next = current + adjustment;
      if (next < 0n)
        throw new BadRequestException({ code: 'NEGATIVE_CASH', message: 'Số dư không thể âm' });
      // Keep the public contract as JSON numbers; never round a BIGINT.
      const nextNumber = safeMoney(next, 'cash_available_vnd');
      const updated = await tx.query<{ cash_available_vnd: string }>(
        `update virtual_trading_accounts
            set cash_available_vnd = (cash_available_vnd::numeric + $1::numeric)::bigint,
                updated_at = now()
          where id = $2::uuid
            and cash_available_vnd::numeric + $1::numeric
                between $3::numeric and $4::numeric
          returning cash_available_vnd`,
        [adjustment.toString(), accountId, MIN_SAFE_BIGINT.toString(), MAX_SAFE_BIGINT.toString()],
      );
      if (!updated[0]) {
        throw new UnprocessableEntityException({
          code: 'MONEY_OUT_OF_RANGE',
          message: 'Số dư tiền mặt vượt quá phạm vi JSON an toàn',
        });
      }
      const ledger = await tx.query<Record<string, unknown>>(
        `insert into virtual_cash_ledger (account_id, amount_vnd, balance_after_vnd, kind, reference_type, note)
         values ($1::uuid, $2, $3, 'admin_adjust', 'admin_audit', $4) returning id`,
        [accountId, adjustment.toString(), next.toString(), input.reason],
      );
      await this.audit.record(tx, context, {
        action: 'vt.cash.adjust',
        targetEntity: 'vt_account',
        targetId: accountId,
        before: { cash_available_vnd: Number(current) },
        after: { cash_available_vnd: nextNumber, ledger_id: ledger[0]?.id },
        note: input.reason,
      });
      return {
        account: { ...normalizeMoneyRecord(acct), cash_available_vnd: nextNumber },
        ledger_id: ledger[0]?.id,
        new_cash_available_vnd: nextNumber,
      };
    });
    return result;
  }

  async config(): Promise<Record<string, unknown>> {
    const rows = await this.database.query<Record<string, unknown>>(
      `select * from virtual_trading_configs where is_active = true order by created_at desc limit 1`,
    );
    if (!rows[0])
      throw new NotFoundException({
        code: 'VT_CONFIG_NOT_FOUND',
        message: 'Chưa có cấu hình giao dịch',
      });
    return {
      ...normalizeMoneyRecord(rows[0]),
      holidays: rows[0].holidays ? json<unknown[]>(rows[0].holidays) : [],
    };
  }

  async updateConfig(
    context: AuditContext,
    patch: TradingConfigUpdate,
  ): Promise<Record<string, unknown>> {
    const result = await this.database.transaction(async (tx) => {
      const current = await tx.query<Record<string, unknown>>(
        `select * from virtual_trading_configs where is_active = true order by created_at desc limit 1 for update`,
      );
      if (!current[0])
        throw new NotFoundException({
          code: 'VT_CONFIG_NOT_FOUND',
          message: 'Chưa có cấu hình giao dịch',
        });
      const allowed: Record<string, string> = {
        initial_cash_vnd: 'initial_cash_vnd',
        buy_fee_rate_bps: 'buy_fee_rate_bps',
        sell_fee_rate_bps: 'sell_fee_rate_bps',
        sell_tax_rate_bps: 'sell_tax_rate_bps',
        settlement_mode: 'settlement_mode',
        board_lot_size: 'board_lot_size',
        trading_enabled: 'trading_enabled',
        holidays: 'holidays',
      };
      const entries = Object.entries(patch).filter(([key]) => allowed[key]);
      const sets: string[] = [];
      const values: unknown[] = [];
      for (const [key, value] of entries) {
        values.push(key === 'holidays' ? JSON.stringify(value) : value);
        sets.push(`${allowed[key]} = $${values.length}${key === 'holidays' ? '::text' : ''}`);
      }
      values.push(context.adminId);
      sets.push(`updated_by = $${values.length}::uuid`);
      sets.push('updated_at = now()');
      const id = current[0].id as string;
      values.push(id);
      const rows = await tx.query<Record<string, unknown>>(
        `update virtual_trading_configs set ${sets.join(', ')} where id = $${values.length}::uuid returning *`,
        values,
      );
      await this.audit.record(tx, context, {
        action: 'vt.config.update',
        targetEntity: 'vt_config',
        targetId: id,
        before: current[0],
        after: rows[0] ?? null,
      });
      return rows[0] ?? current[0];
    });
    return {
      ...normalizeMoneyRecord(result),
      holidays: result.holidays ? json<unknown[]>(result.holidays) : [],
    };
  }

  async resetAccount(
    accountId: string,
    context: AuditContext,
    input: ResetAccountInput,
  ): Promise<Record<string, unknown>> {
    return this.reset(context, input, accountId);
  }
  async resetByUser(
    userId: string,
    context: AuditContext,
    input: ResetAccountInput,
  ): Promise<Record<string, unknown>> {
    const rows = await this.database.query<{ id: string }>(
      `select id from virtual_trading_accounts where user_id = $1::uuid`,
      [userId],
    );
    if (!rows[0])
      throw new NotFoundException({
        code: 'VT_ACCOUNT_NOT_FOUND',
        message: 'Không tìm thấy tài khoản giao dịch ảo',
      });
    return this.reset(context, input, rows[0].id);
  }
  async resetAll(context: AuditContext, input: ResetAllInput): Promise<Record<string, unknown>> {
    if (input.dry_run) {
      const accounts = await this.database.query<{ id: string }>(
        `select id from virtual_trading_accounts order by id`,
      );
      return { accounts_reset: accounts.length, dry_run: true };
    }
    return this.database.transaction(async (tx) => {
      const accounts = await tx.query<{ id: string }>(
        `select id from virtual_trading_accounts order by id for update`,
      );
      for (const account of accounts)
        await this.resetInTransaction(tx, account.id, context, input.reason);
      await this.audit.record(tx, context, {
        action: 'vt.account.reset_all',
        targetEntity: 'vt_account',
        note: input.reason,
        after: { count: accounts.length },
      });
      return { accounts_reset: accounts.length, dry_run: false };
    });
  }

  private async reset(
    context: AuditContext,
    input: ResetAccountInput,
    accountId: string,
  ): Promise<Record<string, unknown>> {
    if (input.dry_run) {
      await this.account(accountId);
      return { accounts_reset: 1, dry_run: true };
    }
    return this.database.transaction(async (tx) => {
      await this.resetInTransaction(tx, accountId, context, input.reason);
      return { accounts_reset: 1, dry_run: false };
    });
  }

  private async resetInTransaction(
    tx: SqlClient,
    accountId: string,
    context: AuditContext,
    reason: string,
  ): Promise<void> {
    const rows = await tx.query<Record<string, string>>(
      `select * from virtual_trading_accounts where id = $1::uuid for update`,
      [accountId],
    );
    const acct = rows[0];
    if (!acct)
      throw new NotFoundException({
        code: 'VT_ACCOUNT_NOT_FOUND',
        message: 'Không tìm thấy tài khoản',
      });
    const config = await tx.query<{ initial_cash_vnd: string }>(
      `select initial_cash_vnd from virtual_trading_configs where is_active = true order by created_at desc limit 1`,
    );
    const initial = exactMoney(
      config[0]?.initial_cash_vnd ?? acct.initial_cash_vnd,
      'initial_cash_vnd',
    );
    const initialNumber = Number(initial);
    await tx.query(`delete from virtual_settlements where account_id = $1::uuid`, [accountId]);
    await tx.query(`delete from virtual_trades where account_id = $1::uuid`, [accountId]);
    await tx.query(`delete from virtual_orders where account_id = $1::uuid`, [accountId]);
    await tx.query(`delete from virtual_positions where account_id = $1::uuid`, [accountId]);
    await tx.query(`delete from virtual_cash_ledger where account_id = $1::uuid`, [accountId]);
    await tx.query(
      `update virtual_trading_accounts set initial_cash_vnd = $1, cash_available_vnd = $1, cash_reserved_vnd = 0, cash_pending_vnd = 0, status = 'active', reset_at = now(), frozen_at = null, frozen_by_user_id = null, freeze_reason = null, updated_at = now() where id = $2::uuid`,
      [initial.toString(), accountId],
    );
    await tx.query(
      `insert into virtual_cash_ledger (account_id, amount_vnd, balance_after_vnd, kind, reference_type, note) values ($1::uuid, $2, $2, 'reset', 'admin_audit', $3)`,
      [accountId, initial.toString(), reason],
    );
    await this.audit.record(tx, context, {
      action: 'vt.account.reset',
      targetEntity: 'vt_account',
      targetId: accountId,
      before: { cash_available_vnd: safeMoney(acct.cash_available_vnd, 'cash_available_vnd') },
      after: { cash_available_vnd: initialNumber },
      note: reason,
    });
  }

  private async mutateAccount(
    accountId: string,
    context: AuditContext,
    operation: 'freeze' | 'unfreeze',
    reason: string,
  ): Promise<Record<string, unknown>> {
    if (operation === 'freeze' && !reason.trim())
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'Lý do bắt buộc' });
    return this.database.transaction(async (tx) => {
      const rows = await tx.query<Record<string, unknown>>(
        `select * from virtual_trading_accounts where id = $1::uuid for update`,
        [accountId],
      );
      const acct = rows[0];
      if (!acct)
        throw new NotFoundException({
          code: 'VT_ACCOUNT_NOT_FOUND',
          message: 'Không tìm thấy tài khoản',
        });
      if (operation === 'freeze' && acct.frozen_at)
        throw new BadRequestException({ code: 'ALREADY_FROZEN', message: 'Tài khoản đã bị khóa' });
      if (operation === 'unfreeze' && !acct.frozen_at)
        throw new BadRequestException({ code: 'NOT_FROZEN', message: 'Tài khoản không bị khóa' });
      const next =
        operation === 'freeze'
          ? {
              status: 'suspended',
              frozen_at: new Date().toISOString(),
              frozen_by_user_id: context.adminId,
              freeze_reason: reason.trim(),
            }
          : { status: 'active', frozen_at: null, frozen_by_user_id: null, freeze_reason: null };
      const updated = await tx.query<Record<string, unknown>>(
        `update virtual_trading_accounts set status = $1, frozen_at = $2, frozen_by_user_id = $3::uuid, freeze_reason = $4, updated_at = now() where id = $5::uuid returning *`,
        [next.status, next.frozen_at, next.frozen_by_user_id, next.freeze_reason, accountId],
      );
      await this.audit.record(tx, context, {
        action: `vt.account.${operation}`,
        targetEntity: 'vt_account',
        targetId: accountId,
        before: acct,
        after: updated[0] ?? next,
        note: reason || null,
      });
      return updated[0] ? normalizeMoneyRecord(updated[0]) : next;
    });
  }

  private async paginated(
    table: string,
    accountId: string,
    query: { page: number; page_size: number },
    filters: Array<unknown[] | null>,
  ): Promise<Record<string, unknown>> {
    const values: unknown[] = [accountId];
    const clauses = ['account_id = $1::uuid'];
    for (const filter of filters)
      if (filter) {
        values.push(filter[1]);
        const field = String(filter[0]);
        const operator = /\s(?:>=|<=|=)$/.test(field) ? '' : ' =';
        clauses.push(`${field}${operator} $${values.length}`);
      }
    const where = clauses.join(' and ');
    const count = await this.database.query<{ total: string }>(
      `select count(*)::text as total from ${table} where ${where}`,
      values,
    );
    const rows = await this.database.query<Record<string, unknown>>(
      `select * from ${table} where ${where} order by created_at desc, id desc limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, query.page_size, (query.page - 1) * query.page_size],
    );
    return { items: rows.map(normalizeMoneyRecord), ...page(Number(count[0]?.total ?? 0), query) };
  }
}
