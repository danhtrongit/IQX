import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService, type SqlClient } from '../../platform/database/database.service.js';
import { mapAccount, mapConfig, mapPosition } from './trading.repository.js';
import type {
  ActionEventCode,
  ActionKind,
  CorporateActionDisposition,
  CorporateActionRow,
  EntitlementRow,
  EntitlementStatus,
  NormalizedAction,
  PriorStockEntitlement,
} from './rights.types.js';
import type { TradingAccount, TradingConfig, TradingPosition } from './trading.types.js';

type Row = Record<string, unknown>;

const ACTION_SELECT = `id, source, source_event_id, symbol, event_code, kind, event_title_en,
  announced_date::text as announced_date, exright_date::text as exright_date,
  record_date::text as record_date, payout_date::text as payout_date,
  issue_date::text as issue_date, cash_per_share_vnd, stock_ratio,
  credit_date::text as credit_date, credit_action_id, disposition, review_reason,
  financial_frozen_at, latest_payload, first_seen_at, last_seen_at`;

const ENTITLEMENT_SELECT = `id, account_id, corporate_action_id, account_epoch_at, kind,
  effective_ex_date::text as effective_ex_date, eligibility_date::text as eligibility_date,
  eligible_quantity, cash_amount_vnd, share_quantity, avg_before_ex_vnd, avg_after_ex_vnd,
  status, applied_at, fulfilled_at`;

const UPSERT_CHUNK = 500;

export type RightsReplayTrade = {
  side: 'buy' | 'sell';
  quantity: number;
  tradedAt: Date;
  orderTradingDate: string;
};

export type PendingRightsTotals = {
  cashVnd: bigint;
  shares: number;
  bySymbol: Map<string, { cashVnd: bigint; shares: number }>;
};

export type SyncCounts = {
  inserted: number;
  updated: number;
  review: number;
};

export type EntitlementInsert = {
  accountId: string;
  corporateActionId: string;
  accountEpochAt: Date;
  kind: 'cash_dividend' | 'stock_dividend';
  effectiveExDate: string;
  eligibilityDate: string;
  eligibleQuantity: number;
  cashAmountVnd: bigint;
  shareQuantity: number;
  avgBeforeVnd: bigint;
  avgAfterVnd: bigint;
  status: Extract<EntitlementStatus, 'no_entitlement' | 'pending_cash' | 'pending_stock'>;
};

function toBigint(value: unknown): bigint {
  return BigInt(value as string | number | bigint);
}

function nullableTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(String(value));
}

function timestamp(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function nullableDateText(value: unknown): string | null {
  return value == null ? null : String(value).slice(0, 10);
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

export function mapCorporateAction(row: Row): CorporateActionRow {
  return {
    id: String(row.id),
    source: String(row.source),
    source_event_id: String(row.source_event_id),
    symbol: String(row.symbol),
    event_code: String(row.event_code) as ActionEventCode,
    kind: String(row.kind) as ActionKind,
    event_title_en: String(row.event_title_en ?? ''),
    announced_date: nullableDateText(row.announced_date),
    exright_date: nullableDateText(row.exright_date),
    record_date: nullableDateText(row.record_date),
    payout_date: nullableDateText(row.payout_date),
    issue_date: nullableDateText(row.issue_date),
    cash_per_share_vnd: row.cash_per_share_vnd == null ? null : toBigint(row.cash_per_share_vnd),
    stock_ratio: row.stock_ratio == null ? null : String(row.stock_ratio),
    credit_date: nullableDateText(row.credit_date),
    credit_action_id: row.credit_action_id == null ? null : String(row.credit_action_id),
    disposition: String(row.disposition) as CorporateActionDisposition,
    review_reason: row.review_reason == null ? null : String(row.review_reason),
    financial_frozen_at: nullableTimestamp(row.financial_frozen_at),
    latest_payload: parseJson(row.latest_payload, {} as Record<string, unknown>),
    first_seen_at: timestamp(row.first_seen_at),
    last_seen_at: timestamp(row.last_seen_at),
  };
}

export function mapEntitlement(row: Row): EntitlementRow {
  return {
    id: String(row.id),
    account_id: String(row.account_id),
    corporate_action_id: String(row.corporate_action_id),
    account_epoch_at: timestamp(row.account_epoch_at),
    kind: String(row.kind) as 'cash_dividend' | 'stock_dividend',
    effective_ex_date: String(row.effective_ex_date).slice(0, 10),
    eligibility_date: String(row.eligibility_date).slice(0, 10),
    eligible_quantity: Number(row.eligible_quantity),
    cash_amount_vnd: toBigint(row.cash_amount_vnd),
    share_quantity: Number(row.share_quantity),
    avg_before_ex_vnd: toBigint(row.avg_before_ex_vnd),
    avg_after_ex_vnd: toBigint(row.avg_after_ex_vnd),
    status: String(row.status) as EntitlementStatus,
    applied_at: timestamp(row.applied_at),
    fulfilled_at: nullableTimestamp(row.fulfilled_at),
  };
}

@Injectable()
export class TradingRightsRepository {
  constructor(private readonly database: DatabaseService) {}

  transaction<T>(operation: (tx: SqlClient) => Promise<T>): Promise<T> {
    return this.database.transaction(operation);
  }

  async getPolicy(client: SqlClient = this.database): Promise<string | null> {
    const rows = await client.query<{ deployment_date: string | null }>(
      `select deployment_date::text as deployment_date from virtual_rights_policy where singleton = true`,
    );
    return rows[0]?.deployment_date ?? null;
  }

  async getActiveConfig(client: SqlClient = this.database): Promise<TradingConfig | null> {
    const rows = await client.query(
      `select * from virtual_trading_configs where is_active = true
       order by updated_at desc limit 1`,
    );
    return rows[0] ? mapConfig(rows[0]) : null;
  }

  async getOldestUnresolvedRecordDate(client: SqlClient = this.database): Promise<string | null> {
    const rows = await client.query<{ record_date: string | null }>(
      `select min(record_date)::text as record_date from virtual_corporate_actions
       where kind = 'stock_dividend' and credit_date is null`,
    );
    return rows[0]?.record_date ?? null;
  }

  async universeSymbols(client: SqlClient = this.database): Promise<Set<string>> {
    const rows = await client.query<{ symbol: string }>(
      `select symbol from virtual_positions where quantity_total > 0
       union
       select symbol from virtual_corporate_actions
       union
       select a.symbol from virtual_rights_entitlements e
         join virtual_corporate_actions a on a.id = e.corporate_action_id`,
    );
    return new Set(rows.map((row) => row.symbol));
  }

  async listActiveAccountIds(afterId: string | null, limit: number): Promise<string[]> {
    const rows = await this.database.query<{ id: string }>(
      `select id from virtual_trading_accounts
       where status = 'active' and ($1::uuid is null or id > $1::uuid)
       order by id limit $2`,
      [afterId, limit],
    );
    return rows.map((row) => row.id);
  }

  async lockAccount(tx: SqlClient, accountId: string): Promise<TradingAccount | null> {
    const rows = await tx.query(`select * from virtual_trading_accounts where id = $1 for update`, [
      accountId,
    ]);
    return rows[0] ? mapAccount(rows[0]) : null;
  }

  async upsertObservations(
    tx: SqlClient,
    events: readonly NormalizedAction[],
    deploymentDate: string,
  ): Promise<SyncCounts> {
    const unique = new Map<string, NormalizedAction>();
    for (const event of events) unique.set(event.sourceEventId, event);
    const list = [...unique.values()];
    let inserted = 0;
    let updated = 0;
    let review = 0;

    for (let offset = 0; offset < list.length; offset += UPSERT_CHUNK) {
      const chunk = list.slice(offset, offset + UPSERT_CHUNK);
      const payload = JSON.stringify(
        chunk.map((event) => ({
          source_event_id: event.sourceEventId,
          symbol: event.symbol,
          event_code: event.eventCode,
          kind: event.kind,
          event_title_en: event.eventTitleEn,
          announced_date: event.announcedDate,
          exright_date: event.exrightDate,
          record_date: event.recordDate,
          payout_date: event.payoutDate,
          issue_date: event.issueDate,
          cash_per_share_vnd: event.cashPerShareVnd?.toString() ?? null,
          stock_ratio: event.stockRatio,
          latest_payload: event.latestPayload,
        })),
      );
      const rows = await tx.query<{ inserted: boolean; disposition: string }>(
        `insert into virtual_corporate_actions
           (source, source_event_id, symbol, event_code, kind, event_title_en,
            announced_date, exright_date, record_date, payout_date, issue_date,
            cash_per_share_vnd, stock_ratio, disposition, latest_payload)
         select
           'VCI', r.source_event_id, r.symbol, r.event_code, r.kind, r.event_title_en,
           nullif(r.announced_date, '')::date, nullif(r.exright_date, '')::date,
           nullif(r.record_date, '')::date, nullif(r.payout_date, '')::date,
           nullif(r.issue_date, '')::date,
           nullif(r.cash_per_share_vnd, '')::bigint, nullif(r.stock_ratio, '')::numeric,
           case
             when nullif(r.exright_date, '')::date is not null
               and nullif(r.exright_date, '')::date < $2::date
             then 'skipped_pre_deploy'
             else 'processable'
           end,
           coalesce(r.latest_payload, '{}'::jsonb)
         from jsonb_to_recordset($1::jsonb) as r(
           source_event_id text, symbol text, event_code text, kind text, event_title_en text,
           announced_date text, exright_date text, record_date text, payout_date text,
           issue_date text, cash_per_share_vnd text, stock_ratio text, latest_payload jsonb
         )
         on conflict (source, source_event_id) do update set
           latest_payload = excluded.latest_payload,
           last_seen_at = now(),
           record_date = coalesce(virtual_corporate_actions.record_date, excluded.record_date),
           payout_date = coalesce(virtual_corporate_actions.payout_date, excluded.payout_date),
           issue_date = coalesce(virtual_corporate_actions.issue_date, excluded.issue_date),
           symbol = case when virtual_corporate_actions.financial_frozen_at is null
             then excluded.symbol else virtual_corporate_actions.symbol end,
           event_code = case
             when virtual_corporate_actions.financial_frozen_at is null
               and virtual_corporate_actions.credit_date is null
             then excluded.event_code else virtual_corporate_actions.event_code end,
           kind = case
             when virtual_corporate_actions.financial_frozen_at is null
               and virtual_corporate_actions.credit_date is null
             then excluded.kind else virtual_corporate_actions.kind end,
           event_title_en = case when virtual_corporate_actions.financial_frozen_at is null
             then excluded.event_title_en else virtual_corporate_actions.event_title_en end,
           announced_date = case when virtual_corporate_actions.financial_frozen_at is null
             then excluded.announced_date else virtual_corporate_actions.announced_date end,
           exright_date = case when virtual_corporate_actions.financial_frozen_at is null
             then excluded.exright_date else virtual_corporate_actions.exright_date end,
           cash_per_share_vnd = case when virtual_corporate_actions.financial_frozen_at is null
             then excluded.cash_per_share_vnd else virtual_corporate_actions.cash_per_share_vnd end,
           stock_ratio = case when virtual_corporate_actions.financial_frozen_at is null
             then excluded.stock_ratio else virtual_corporate_actions.stock_ratio end,
           disposition = case
             when virtual_corporate_actions.financial_frozen_at is not null
               and (virtual_corporate_actions.symbol is distinct from excluded.symbol
                 or virtual_corporate_actions.kind is distinct from excluded.kind
                 or virtual_corporate_actions.exright_date is distinct from excluded.exright_date
                 or virtual_corporate_actions.cash_per_share_vnd
                   is distinct from excluded.cash_per_share_vnd
                 or virtual_corporate_actions.stock_ratio
                   is distinct from excluded.stock_ratio)
             then 'review_required'
             else virtual_corporate_actions.disposition end,
           review_reason = case
             when virtual_corporate_actions.financial_frozen_at is not null
               and (virtual_corporate_actions.symbol is distinct from excluded.symbol
                 or virtual_corporate_actions.kind is distinct from excluded.kind
                 or virtual_corporate_actions.exright_date is distinct from excluded.exright_date
                 or virtual_corporate_actions.cash_per_share_vnd
                   is distinct from excluded.cash_per_share_vnd
                 or virtual_corporate_actions.stock_ratio
                   is distinct from excluded.stock_ratio)
             then 'Financial terms changed after application'
             else virtual_corporate_actions.review_reason end
         returning (xmax = 0) as inserted, disposition`,
        [payload, deploymentDate],
      );
      for (const row of rows) {
        if (row.inserted) inserted += 1;
        else updated += 1;
        if (!row.inserted && row.disposition === 'review_required') review += 1;
      }
    }
    return { inserted, updated, review };
  }

  async resolveCreditDates(tx: SqlClient): Promise<number> {
    const rows = await tx.query<{ id: string }>(
      `update virtual_corporate_actions a
       set credit_action_id = b.id, credit_date = b.issue_date
       from virtual_corporate_actions src
       join lateral (
         select b.id, b.issue_date
         from virtual_corporate_actions b
         where b.kind = 'listing' and b.disposition = 'processable'
           and b.symbol = src.symbol and b.issue_date is not null
           and b.issue_date > src.record_date
         order by b.issue_date, b.source_event_id
         limit 1
       ) b on true
       where a.id = src.id
         and src.kind = 'stock_dividend' and src.credit_date is null
         and src.record_date is not null and src.disposition = 'processable'
       returning a.id`,
    );
    return rows.length;
  }

  async lockRelevantActions(
    tx: SqlClient,
    accountId: string,
    asOf: string,
  ): Promise<CorporateActionRow[]> {
    const rows = await tx.query(
      `select ${ACTION_SELECT}
       from virtual_corporate_actions
       where disposition = 'processable' and kind <> 'listing'
         and (
           (exright_date is not null and exright_date <= $2::date
             and not exists (
               select 1 from virtual_rights_entitlements e
               where e.account_id = $1 and e.corporate_action_id = virtual_corporate_actions.id
             ))
           or exists (
             select 1 from virtual_rights_entitlements e
             where e.account_id = $1 and e.corporate_action_id = virtual_corporate_actions.id
               and ((e.status = 'pending_cash' and payout_date is not null
                       and payout_date <= $2::date)
                 or (e.status = 'pending_stock' and credit_date is not null
                       and credit_date <= $2::date))
           )
         )
       order by id
       for update`,
      [accountId, asOf],
    );
    return rows.map(mapCorporateAction);
  }

  async lockEntitlements(
    tx: SqlClient,
    accountId: string,
    actionIds: readonly string[],
  ): Promise<EntitlementRow[]> {
    if (actionIds.length === 0) return [];
    const rows = await tx.query(
      `select ${ENTITLEMENT_SELECT} from virtual_rights_entitlements
       where account_id = $1 and corporate_action_id = any($2::uuid[])
       order by id for update`,
      [accountId, actionIds],
    );
    return rows.map(mapEntitlement);
  }

  async lockPositions(
    tx: SqlClient,
    accountId: string,
    symbols: readonly string[],
  ): Promise<TradingPosition[]> {
    if (symbols.length === 0) return [];
    const rows = await tx.query(
      `select * from virtual_positions
       where account_id = $1 and symbol = any($2::text[])
       order by symbol for update`,
      [accountId, symbols],
    );
    return rows.map(mapPosition);
  }

  async listPriorStockEntitlements(
    tx: SqlClient,
    accountId: string,
    eligibilityDate: string,
  ): Promise<PriorStockEntitlement[]> {
    const rows = await tx.query<{ effective_ex_date: string; share_quantity: number }>(
      `select effective_ex_date::text as effective_ex_date, share_quantity
       from virtual_rights_entitlements
       where account_id = $1 and kind = 'stock_dividend'
         and status in ('pending_stock', 'credited')
         and effective_ex_date <= $2::date
       order by effective_ex_date, id`,
      [accountId, eligibilityDate],
    );
    return rows.map((row) => ({
      effectiveExDate: String(row.effective_ex_date).slice(0, 10),
      shareQuantity: Number(row.share_quantity),
    }));
  }

  async listReplayTrades(
    tx: SqlClient,
    accountId: string,
    symbol: string,
  ): Promise<RightsReplayTrade[]> {
    const rows = await tx.query<{
      side: string;
      quantity: number;
      traded_at: unknown;
      order_trading_date: string;
    }>(
      `select t.side, t.quantity, t.traded_at, o.trading_date::text as order_trading_date
       from virtual_trades t join virtual_orders o on o.id = t.order_id
       where t.account_id = $1 and t.symbol = $2
       order by t.traded_at, t.id`,
      [accountId, symbol],
    );
    return rows.map((row) => ({
      side: row.side === 'sell' ? 'sell' : 'buy',
      quantity: Number(row.quantity),
      tradedAt: timestamp(row.traded_at),
      orderTradingDate: String(row.order_trading_date).slice(0, 10),
    }));
  }

  async insertEntitlement(tx: SqlClient, input: EntitlementInsert): Promise<EntitlementRow | null> {
    const rows = await tx.query(
      `insert into virtual_rights_entitlements
         (account_id, corporate_action_id, account_epoch_at, kind, effective_ex_date,
          eligibility_date, eligible_quantity, cash_amount_vnd, share_quantity,
          avg_before_ex_vnd, avg_after_ex_vnd, status)
       values ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, $11, $12)
       on conflict (account_id, corporate_action_id) do nothing
       returning ${ENTITLEMENT_SELECT}`,
      [
        input.accountId,
        input.corporateActionId,
        input.accountEpochAt,
        input.kind,
        input.effectiveExDate,
        input.eligibilityDate,
        input.eligibleQuantity,
        input.cashAmountVnd.toString(),
        input.shareQuantity,
        input.avgBeforeVnd.toString(),
        input.avgAfterVnd.toString(),
        input.status,
      ],
    );
    return rows[0] ? mapEntitlement(rows[0]) : null;
  }

  async transitionEntitlement(
    tx: SqlClient,
    entitlementId: string,
    to: 'paid' | 'credited',
    from: 'pending_cash' | 'pending_stock',
  ): Promise<number> {
    const rows = await tx.query<{ id: string }>(
      `update virtual_rights_entitlements set status = $3, fulfilled_at = now()
       where id = $1 and status = $2 returning id`,
      [entitlementId, from, to],
    );
    return rows.length;
  }

  async markActionFrozen(tx: SqlClient, actionId: string): Promise<void> {
    await tx.query(
      `update virtual_corporate_actions set financial_frozen_at = now()
       where id = $1 and financial_frozen_at is null`,
      [actionId],
    );
  }

  async markActionReview(tx: SqlClient, actionId: string, reason: string): Promise<void> {
    await tx.query(
      `update virtual_corporate_actions set disposition = 'review_required', review_reason = $2
       where id = $1`,
      [actionId, reason],
    );
  }

  async insertRightsLedger(
    tx: SqlClient,
    input: {
      accountId: string;
      amount: bigint;
      balanceAfter: bigint;
      kind: 'rights_ex_applied' | 'rights_cash_paid' | 'rights_stock_credited';
      referenceId: string;
      note?: string;
    },
  ): Promise<void> {
    await tx.query(
      `insert into virtual_cash_ledger
         (id, account_id, amount_vnd, balance_after_vnd, kind, reference_type, reference_id,
          note, created_at)
       values ($1, $2, $3, $4, $5, 'rights_entitlement', $6, $7, now())`,
      [
        randomUUID(),
        input.accountId,
        input.amount.toString(),
        input.balanceAfter.toString(),
        input.kind,
        input.referenceId,
        input.note ?? null,
      ],
    );
  }

  async updateCash(tx: SqlClient, account: TradingAccount): Promise<TradingAccount> {
    const rows = await tx.query(
      `update virtual_trading_accounts
       set cash_available_vnd = $2, cash_reserved_vnd = $3, cash_pending_vnd = $4, updated_at = now()
       where id = $1 returning *`,
      [
        account.id,
        account.cashAvailableVnd.toString(),
        account.cashReservedVnd.toString(),
        account.cashPendingVnd.toString(),
      ],
    );
    return mapAccount(rows[0]!);
  }

  async savePosition(
    tx: SqlClient,
    position: Omit<TradingPosition, 'id'> & { id?: string },
  ): Promise<TradingPosition> {
    const rows = await tx.query(
      `insert into virtual_positions
         (id, account_id, symbol, quantity_total, quantity_sellable, quantity_pending,
          quantity_reserved, avg_cost_vnd, active_plan_buy_order_id, active_original_stop_vnd,
          active_original_take_profit_vnd, active_dynamic_stop_vnd, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now())
       on conflict (account_id, symbol) do update set
         quantity_total = excluded.quantity_total,
         quantity_sellable = excluded.quantity_sellable,
         quantity_pending = excluded.quantity_pending,
         quantity_reserved = excluded.quantity_reserved,
         avg_cost_vnd = excluded.avg_cost_vnd,
         active_plan_buy_order_id = excluded.active_plan_buy_order_id,
         active_original_stop_vnd = excluded.active_original_stop_vnd,
         active_original_take_profit_vnd = excluded.active_original_take_profit_vnd,
         active_dynamic_stop_vnd = excluded.active_dynamic_stop_vnd,
         updated_at = now()
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

  async creditPositionShares(
    tx: SqlClient,
    accountId: string,
    symbol: string,
    shares: number,
  ): Promise<TradingPosition | null> {
    const rows = await tx.query(
      `update virtual_positions
       set quantity_pending = quantity_pending - $3,
           quantity_sellable = quantity_sellable + $3,
           updated_at = now()
       where account_id = $1 and symbol = $2 and quantity_pending >= $3
       returning *`,
      [accountId, symbol, shares],
    );
    return rows[0] ? mapPosition(rows[0]) : null;
  }

  async pendingTotals(
    accountIds: readonly string[],
    client: SqlClient = this.database,
  ): Promise<Map<string, PendingRightsTotals>> {
    const result = new Map<string, PendingRightsTotals>();
    for (const accountId of accountIds) {
      result.set(accountId, { cashVnd: 0n, shares: 0, bySymbol: new Map() });
    }
    if (accountIds.length === 0) return result;
    const rows = await client.query<{
      account_id: string;
      symbol: string;
      cash_vnd: string;
      shares: string;
    }>(
      `select e.account_id, a.symbol,
         coalesce(sum(e.cash_amount_vnd) filter (where e.status = 'pending_cash'), 0)::text
           as cash_vnd,
         coalesce(sum(e.share_quantity) filter (where e.status = 'pending_stock'), 0)::text
           as shares
       from virtual_rights_entitlements e
       join virtual_corporate_actions a on a.id = e.corporate_action_id
       where e.account_id = any($1::uuid[]) and e.status in ('pending_cash', 'pending_stock')
       group by e.account_id, a.symbol`,
      [accountIds],
    );
    for (const row of rows) {
      const entry = result.get(row.account_id) ?? {
        cashVnd: 0n,
        shares: 0,
        bySymbol: new Map<string, { cashVnd: bigint; shares: number }>(),
      };
      const cashVnd = BigInt(row.cash_vnd);
      const shares = Number(row.shares);
      entry.cashVnd += cashVnd;
      entry.shares += shares;
      entry.bySymbol.set(row.symbol, { cashVnd, shares });
      result.set(row.account_id, entry);
    }
    return result;
  }

  async cancelPendingForResetSameTx(tx: SqlClient, accountId: string): Promise<number> {
    const rows = await tx.query<{ id: string }>(
      `update virtual_rights_entitlements
       set status = 'cancelled_reset', fulfilled_at = now()
       where account_id = $1 and status in ('pending_cash', 'pending_stock')
       returning id`,
      [accountId],
    );
    return rows.length;
  }
}
