import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../../platform/database/index.js';
import { Cap7Service } from '../cap7/cap7.service.js';
import { classifyCap8Exit } from './cap8.classification.js';
import { Cap8PriceHistoryService } from './cap8.history.js';
import {
  CAP8_EXIT_TARGET,
  type Cap8DynamicStop,
  type Cap8Exit,
  type Cap8ExitContext,
  type Cap8ExitSnapshot,
  type Cap8Progress,
  type Cap8SyncedPlan,
  type DailyClose,
} from './cap8.types.js';

type ProgressRow = {
  id: string;
  user_id: string;
  entered_at: Date | string;
  so_lenh_thoat_dung_ke_hoach: number;
  graduated_at: Date | string | null;
  time_to_graduate_hours: string | number | null;
};

type AccountRow = { id: string };

type PositionRow = {
  id: string;
  account_id: string;
  symbol: string;
  quantity_total: number;
  quantity_sellable: number;
  avg_cost_vnd: bigint | number | string;
  active_plan_buy_order_id: string | null;
  active_original_stop_vnd: bigint | number | string | null;
  active_original_take_profit_vnd: bigint | number | string | null;
  active_dynamic_stop_vnd: bigint | number | string | null;
  active_dynamic_stop_set_at: Date | string | null;
  updated_at: Date | string;
};

type PlanRow = {
  order_id: string;
  cat_lo: bigint | number | string;
  chot_loi: bigint | number | string;
};

type SellRow = {
  id: string;
  account_id: string;
  user_id: string;
  symbol: string;
  quantity: number;
  filled_price_vnd: bigint | number | string;
  exit_snapshot_at: Date | string | null;
  position_quantity_before_fill: number | null;
  position_quantity_after_fill: number | null;
  exit_matched_buy_order_id: string | null;
  exit_original_stop_vnd: bigint | number | string | null;
  exit_original_take_profit_vnd: bigint | number | string | null;
  exit_dynamic_stop_vnd: bigint | number | string | null;
  exit_dynamic_stop_set_at: Date | string | null;
  exit_avg_cost_vnd: bigint | number | string | null;
  exit_plan_activated_at: Date | string | null;
  updated_at: Date | string;
  created_at: Date | string;
};

type ExitRow = {
  id: string;
  user_id: string;
  symbol: string;
  matched_buy_order_id: string | null;
  sell_order_id: string;
  exited_at: Date | string;
  quantity: number;
  filled_price_vnd: bigint | number | string;
  remaining_position_pct: number | string;
  exit_method: string;
  original_stop_vnd: bigint | number | string | null;
  original_take_profit_vnd: bigint | number | string | null;
  effective_stop_vnd: bigint | number | string | null;
  dung_ke_hoach: boolean;
  ban_cam_xuc: boolean;
  classification_reason: string;
};

function integer(value: bigint | number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function requireInteger(value: bigint | number | string, field: string): number {
  const parsed = integer(value);
  if (parsed === null) throw new Error(`${field} cannot be represented safely`);
  return parsed;
}

@Injectable()
export class Cap8Service {
  constructor(
    private readonly database: DatabaseService,
    private readonly cap7: Cap7Service,
    private readonly history: Cap8PriceHistoryService,
  ) {}

  async getProgress(userId: string): Promise<Cap8Progress | null> {
    const current = await this.database.query<ProgressRow>(
      `select id, user_id, entered_at, so_lenh_thoat_dung_ke_hoach,
              graduated_at, time_to_graduate_hours
       from cap8_progress where user_id = $1`,
      [userId],
    );
    if (!current[0]) return null;
    await this.bootstrapOpenPositions(userId);
    await this.reconcileFilledExits(userId, current[0].entered_at);
    return this.recomputeProgress(userId);
  }

  async enter(userId: string): Promise<Cap8Progress> {
    await this.database.transaction(async (tx) => {
      // Match the fill lock order: account before position/progress decisions.
      const accounts = await tx.query<AccountRow>(
        'select id from virtual_trading_accounts where user_id = $1 for update',
        [userId],
      );
      if (!accounts[0]) this.notFound('tài khoản giao dịch ảo');
      let progress = await this.findProgress(tx, userId, true);
      if (!progress) {
        this.assertEntryEnabled(8);
        const prior = await tx.query<{ graduated_at: Date | string | null }>(
          'select graduated_at from cap7_progress where user_id = $1',
          [userId],
        );
        if (!prior[0]) this.notFound('tiến trình Cấp 7');
        if (!prior[0].graduated_at) this.conflict('Chưa tốt nghiệp Cấp 7', 'CAP7_NOT_GRADUATED');
        await tx.query(
          `insert into cap8_progress
             (id, user_id, entered_at, so_lenh_thoat_dung_ke_hoach, created_at, updated_at)
           values ($1, $2, now(), 0, now(), now())
           on conflict (user_id) do nothing`,
          [randomUUID(), userId],
        );
        progress = await this.findProgress(tx, userId, true);
      }
      if (!progress) throw new Error('Cấp 8 entry was not persisted');
    });
    await this.bootstrapOpenPositions(userId);
    const entered = await this.requireProgressRead(userId);
    await this.reconcileFilledExits(userId, entered.entered_at);
    return (await this.recomputeProgress(userId))!;
  }

  async syncPlan(userId: string, symbolInput: string, buyOrderId: string): Promise<Cap8SyncedPlan> {
    const symbol = symbolInput.toUpperCase();
    return this.database.transaction(async (tx) => {
      await this.requireProgress(tx, userId);
      const { account, position } = await this.lockPosition(tx, userId, symbol);
      const latest = await this.latestQualifyingPlan(tx, userId, account.id, symbol);
      if (!latest || latest.order_id !== buyOrderId) {
        this.badRequest(
          'Chỉ lệnh MUA khớp gần nhất có kế hoạch cắt lỗ/chốt lời hợp lệ mới điều khiển vị thế',
          'INVALID_ACTIVE_PLAN',
        );
      }
      const stop = requireInteger(latest.cat_lo, 'cat_lo');
      const takeProfit = requireInteger(latest.chot_loi, 'chot_loi');
      await tx.query(
        `update virtual_positions
         set active_plan_buy_order_id = $2,
             active_original_stop_vnd = $3,
             active_original_take_profit_vnd = $4,
             active_dynamic_stop_vnd = null,
             active_dynamic_stop_set_at = null,
             updated_at = now()
         where id = $1`,
        [position.id, latest.order_id, stop, takeProfit],
      );
      return {
        symbol,
        source_buy_order_id: latest.order_id,
        original_stop_vnd: stop,
        original_take_profit_vnd: takeProfit,
        dynamic_stop_vnd: null,
        dynamic_stop_set_at: null,
      };
    });
  }

  async setDynamicStop(
    userId: string,
    symbolInput: string,
    dynamicStopVnd: number,
  ): Promise<Cap8DynamicStop> {
    const symbol = symbolInput.toUpperCase();
    return this.database.transaction(async (tx) => {
      await this.requireProgress(tx, userId);
      const { position } = await this.lockPosition(tx, userId, symbol);
      if (position.quantity_total <= 0)
        this.badRequest('Không còn vị thế để nâng cắt lỗ động', 'POSITION_EMPTY');
      const bootstrapped = await this.bootstrapPlan(tx, userId, position);
      const quoteRows = await tx.query<{ current_price_vnd: bigint | number | string | null }>(
        `select current_price_vnd from symbols
         where symbol = $1 and is_active = true and current_price_vnd > 0`,
        [symbol],
      );
      const currentPrice = integer(quoteRows[0]?.current_price_vnd ?? null);
      const avgCost = requireInteger(position.avg_cost_vnd, 'avg_cost_vnd');
      if (currentPrice === null || currentPrice <= avgCost) {
        this.badRequest(
          'Chỉ được nâng cắt lỗ động khi vị thế đang có lãi',
          'POSITION_NOT_PROFITABLE',
        );
      }
      const previous =
        integer(bootstrapped.active_dynamic_stop_vnd) ??
        integer(bootstrapped.active_original_stop_vnd);
      if (dynamicStopVnd <= avgCost)
        this.badRequest('Cắt lỗ động phải cao hơn giá vốn bình quân', 'DYNAMIC_STOP_BELOW_COST');
      if (previous === null || dynamicStopVnd <= previous) {
        this.badRequest('Cắt lỗ động phải cao hơn mức cắt lỗ hiện tại', 'DYNAMIC_STOP_NOT_RAISED');
      }
      if (dynamicStopVnd > currentPrice)
        this.badRequest(
          'Cắt lỗ động không được vượt giá thị trường hiện tại',
          'DYNAMIC_STOP_ABOVE_MARKET',
        );
      const rows = await tx.query<{ active_dynamic_stop_set_at: Date | string }>(
        `update virtual_positions
         set active_dynamic_stop_vnd = $2, active_dynamic_stop_set_at = now(), updated_at = now()
         where id = $1 returning active_dynamic_stop_set_at`,
        [position.id, dynamicStopVnd],
      );
      return {
        symbol,
        dynamic_stop_vnd: dynamicStopVnd,
        dynamic_stop_set_at: rows[0]!.active_dynamic_stop_set_at,
      };
    });
  }

  async exitContext(
    userId: string,
    symbolInput: string,
    proposedSaleQuantity?: number,
  ): Promise<Cap8ExitContext> {
    const symbol = symbolInput.toUpperCase();
    return this.database.transaction(async (tx) => {
      await this.requireProgress(tx, userId);
      const { position } = await this.lockPosition(tx, userId, symbol);
      if (position.quantity_total <= 0)
        this.badRequest('Không còn vị thế để thoát lệnh', 'POSITION_EMPTY');
      const active = await this.bootstrapPlan(tx, userId, position);
      const proposed = proposedSaleQuantity ?? active.quantity_sellable;
      if (proposed < 0 || proposed > active.quantity_sellable) {
        this.badRequest(
          'Khối lượng bán dự kiến phải nằm trong số cổ phiếu có thể bán',
          'INVALID_SALE_QUANTITY',
        );
      }
      const quoteRows = await tx.query<{ current_price_vnd: bigint | number | string | null }>(
        'select current_price_vnd from symbols where symbol = $1 and is_active = true',
        [symbol],
      );
      const currentPrice = integer(quoteRows[0]?.current_price_vnd ?? null);
      const impact = await this.cap7.snapshotInTransaction(
        tx,
        userId,
        proposed === 0 ? { lock: false } : { lock: false, sale: { symbol, quantity: proposed } },
      );
      const config = await tx.query<{ board_lot_size: number }>(
        'select board_lot_size from virtual_trading_configs where is_active = true order by updated_at desc limit 1',
      );
      const avgCost = requireInteger(active.avg_cost_vnd, 'avg_cost_vnd');
      return {
        symbol,
        quantity_total: active.quantity_total,
        quantity_sellable: active.quantity_sellable,
        avg_cost_vnd: avgCost,
        current_price_vnd: currentPrice,
        source_buy_order_id: active.active_plan_buy_order_id,
        original_stop_vnd: integer(active.active_original_stop_vnd),
        original_take_profit_vnd: integer(active.active_original_take_profit_vnd),
        dynamic_stop_vnd: integer(active.active_dynamic_stop_vnd),
        dynamic_stop_set_at: active.active_dynamic_stop_set_at,
        can_update_dynamic_stop:
          currentPrice !== null && currentPrice > avgCost && active.quantity_total > 0,
        board_lot_size: config[0]?.board_lot_size ?? 100,
        proposed_sale_quantity: proposed,
        sector_impact: impact,
      };
    });
  }

  async recordExit(userId: string, sellOrderId: string): Promise<Cap8Exit> {
    // Fetch external evidence before acquiring any database locks. Filled order snapshots
    // are immutable, then they are re-read under the user's progress lock below.
    const preflight = await this.loadSell(this.database, userId, sellOrderId);
    if (!preflight)
      this.badRequest('Chỉ ghi nhận lệnh BÁN đã khớp của chính bạn', 'INVALID_FILLED_SELL');
    let closes: DailyClose[] | null = null;
    const effectiveStop =
      integer(preflight.exit_dynamic_stop_vnd) ?? integer(preflight.exit_original_stop_vnd);
    const filledPrice = requireInteger(preflight.filled_price_vnd, 'filled_price_vnd');
    if (effectiveStop !== null && filledPrice <= effectiveStop) {
      closes = await this.history.dailyCloses(preflight.symbol);
    }

    return this.database.transaction(async (tx) => {
      const accounts = await tx.query<AccountRow>(
        'select id from virtual_trading_accounts where user_id = $1 for update',
        [userId],
      );
      if (!accounts[0]) this.notFound('tài khoản giao dịch ảo');
      const progress = await this.requireProgress(tx, userId, true);
      const existing = await tx.query<ExitRow>(
        'select * from cap8_exits where sell_order_id = $1',
        [sellOrderId],
      );
      if (existing[0]) {
        if (existing[0].user_id !== userId) this.notFound('lệnh bán');
        return this.toExit(existing[0]);
      }
      const sell = await this.loadSell(tx, userId, sellOrderId, true);
      if (!sell)
        this.badRequest('Chỉ ghi nhận lệnh BÁN đã khớp của chính bạn', 'INVALID_FILLED_SELL');
      const snapshot = this.toSnapshot(sell);
      const classification = classifyCap8Exit(snapshot, closes);
      const rows = await tx.query<ExitRow>(
        `insert into cap8_exits
           (id, user_id, account_id, symbol, matched_buy_order_id, sell_order_id,
            exited_at, quantity, filled_price_vnd, remaining_position_pct,
            exit_method, original_stop_vnd, original_take_profit_vnd,
            effective_stop_vnd, dung_ke_hoach, ban_cam_xuc,
            classification_reason, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now(),now())
         on conflict (sell_order_id) do nothing
         returning *`,
        [
          randomUUID(),
          userId,
          sell.account_id,
          sell.symbol,
          sell.exit_matched_buy_order_id,
          sell.id,
          sell.exit_snapshot_at ?? sell.updated_at ?? sell.created_at,
          sell.quantity,
          filledPrice,
          classification.remainingPositionPct,
          classification.exitMethod,
          integer(sell.exit_original_stop_vnd),
          integer(sell.exit_original_take_profit_vnd),
          classification.effectiveStopVnd,
          classification.compliant,
          classification.emotional,
          classification.reason,
        ],
      );
      const stored =
        rows[0] ??
        (
          await tx.query<ExitRow>('select * from cap8_exits where sell_order_id = $1', [
            sellOrderId,
          ])
        )[0];
      if (!stored || stored.user_id !== userId) this.notFound('lệnh bán');
      await this.recomputeProgressInTransaction(tx, progress);
      return this.toExit(stored);
    });
  }

  async graduate(userId: string): Promise<Cap8Progress> {
    const existing = await this.requireProgressRead(userId);
    await this.bootstrapOpenPositions(userId);
    await this.reconcileFilledExits(userId, existing.entered_at);
    return this.database.transaction(async (tx) => {
      const progress = await this.requireProgress(tx, userId, true);
      const refreshed = await this.recomputeProgressInTransaction(tx, progress);
      if (!refreshed.graduated_at && refreshed.so_lenh_thoat_dung_ke_hoach < CAP8_EXIT_TARGET) {
        this.conflict(
          'Cần 5 lệnh thoát tuân thủ kế hoạch sau khi vào Cấp 8',
          'CAP8_EXIT_GATE_FAILED',
        );
      }
      if (refreshed.graduated_at) return this.toProgress(refreshed);
      const rows = await tx.query<ProgressRow>(
        `update cap8_progress
         set graduated_at = coalesce(graduated_at, now()),
             time_to_graduate_hours = coalesce(
               time_to_graduate_hours,
               extract(epoch from (now() - entered_at)) / 3600.0
             ), updated_at = now()
         where id = $1
         returning id, user_id, entered_at, so_lenh_thoat_dung_ke_hoach,
                   graduated_at, time_to_graduate_hours`,
        [progress.id],
      );
      return this.toProgress(rows[0]!);
    });
  }

  private async bootstrapOpenPositions(userId: string): Promise<void> {
    await this.database.transaction(async (tx) => {
      const accounts = await tx.query<AccountRow>(
        'select id from virtual_trading_accounts where user_id = $1 for update',
        [userId],
      );
      if (!accounts[0]) return;
      const positions = await tx.query<PositionRow>(
        `select * from virtual_positions
         where account_id = $1 and quantity_total > 0 order by symbol for update`,
        [accounts[0].id],
      );
      for (const position of positions) await this.bootstrapPlan(tx, userId, position);
    });
  }

  private async bootstrapPlan(
    tx: SqlClient,
    userId: string,
    position: PositionRow,
  ): Promise<PositionRow> {
    const plan = await this.latestQualifyingPlan(tx, userId, position.account_id, position.symbol);
    // A filled BUY starts a new governing position plan. We only read the
    // immutable plan row captured on that BUY; mutable later learning state is
    // never consulted. If no qualifying BUY exists, preserve the current
    // active snapshot rather than inventing an empty plan.
    if (!plan || position.active_plan_buy_order_id === plan.order_id) return position;
    const rows = await tx.query<PositionRow>(
      `update virtual_positions
       set active_plan_buy_order_id = $2,
           active_original_stop_vnd = $3,
           active_original_take_profit_vnd = $4,
           active_dynamic_stop_vnd = null,
           active_dynamic_stop_set_at = null,
           updated_at = now()
       where id = $1 and active_plan_buy_order_id is null returning *`,
      [position.id, plan.order_id, plan.cat_lo, plan.chot_loi],
    );
    return rows[0] ?? position;
  }

  private async latestQualifyingPlan(
    tx: SqlClient,
    userId: string,
    accountId: string,
    symbol: string,
  ): Promise<PlanRow | null> {
    const rows = await tx.query<PlanRow>(
      `with last_full_close as (
         select max(exit_snapshot_at) as at
         from virtual_orders
         where account_id = $2 and symbol = $3 and side = 'sell' and status = 'filled'
           and position_quantity_after_fill = 0
       )
       select o.id as order_id, k.cat_lo, k.chot_loi
       from virtual_orders o
       join order_kehoach k on k.order_id = o.id
       cross join last_full_close l
       where o.user_id = $1 and o.account_id = $2 and o.symbol = $3
         and o.side = 'buy' and o.status = 'filled'
         and k.cat_lo is not null and k.chot_loi is not null
         and (l.at is null or o.updated_at > l.at)
       order by o.updated_at desc, o.id desc limit 1`,
      [userId, accountId, symbol],
    );
    return rows[0] ?? null;
  }

  private async lockPosition(
    tx: SqlClient,
    userId: string,
    symbol: string,
  ): Promise<{ account: AccountRow; position: PositionRow }> {
    const accounts = await tx.query<AccountRow>(
      'select id from virtual_trading_accounts where user_id = $1 for update',
      [userId],
    );
    const account = accounts[0];
    if (!account) this.notFound('tài khoản giao dịch ảo');
    const positions = await tx.query<PositionRow>(
      'select * from virtual_positions where account_id = $1 and symbol = $2 for update',
      [account.id, symbol],
    );
    if (!positions[0]) this.notFound('vị thế');
    return { account, position: positions[0] };
  }

  private async reconcileFilledExits(userId: string, enteredAt: Date | string): Promise<void> {
    const rows = await this.database.query<{ id: string }>(
      `select o.id from virtual_orders o
       where o.user_id = $1 and o.side = 'sell' and o.status = 'filled'
         and coalesce(o.exit_snapshot_at, o.updated_at, o.created_at) >= $2
         and not exists (select 1 from cap8_exits e where e.sell_order_id = o.id)
       order by o.exit_snapshot_at nulls last, o.id`,
      [userId, enteredAt],
    );
    for (const row of rows) await this.recordExit(userId, row.id);
  }

  private async recomputeProgress(userId: string): Promise<Cap8Progress | null> {
    return this.database.transaction(async (tx) => {
      const progress = await this.findProgress(tx, userId, true);
      if (!progress) return null;
      return this.toProgress(await this.recomputeProgressInTransaction(tx, progress));
    });
  }

  private async recomputeProgressInTransaction(
    tx: SqlClient,
    progress: ProgressRow,
  ): Promise<ProgressRow> {
    const rows = await tx.query<ProgressRow>(
      `update cap8_progress p
       set so_lenh_thoat_dung_ke_hoach = (
             select count(*)::int from cap8_exits e
             where e.user_id = p.user_id and e.dung_ke_hoach = true
               and e.exited_at >= p.entered_at
           ), updated_at = now()
       where p.id = $1
       returning id, user_id, entered_at, so_lenh_thoat_dung_ke_hoach,
                 graduated_at, time_to_graduate_hours`,
      [progress.id],
    );
    return rows[0]!;
  }

  private async findProgress(
    tx: SqlClient,
    userId: string,
    lock: boolean,
  ): Promise<ProgressRow | null> {
    const rows = await tx.query<ProgressRow>(
      `select id, user_id, entered_at, so_lenh_thoat_dung_ke_hoach,
              graduated_at, time_to_graduate_hours
       from cap8_progress where user_id = $1${lock ? ' for update' : ''}`,
      [userId],
    );
    return rows[0] ?? null;
  }

  private async requireProgress(tx: SqlClient, userId: string, lock = false): Promise<ProgressRow> {
    const progress = await this.findProgress(tx, userId, lock);
    if (!progress) this.notFound('tiến trình Cấp 8');
    return progress;
  }

  private async requireProgressRead(userId: string): Promise<ProgressRow> {
    const rows = await this.database.query<ProgressRow>(
      `select id, user_id, entered_at, so_lenh_thoat_dung_ke_hoach,
              graduated_at, time_to_graduate_hours from cap8_progress where user_id = $1`,
      [userId],
    );
    if (!rows[0]) this.notFound('tiến trình Cấp 8');
    return rows[0];
  }

  private async loadSell(
    client: SqlClient | DatabaseService,
    userId: string,
    sellOrderId: string,
    lock = false,
  ): Promise<SellRow | null> {
    const rows = await client.query<SellRow>(
      `select id, account_id, user_id, symbol, quantity, filled_price_vnd,
              exit_snapshot_at, position_quantity_before_fill,
              position_quantity_after_fill, exit_matched_buy_order_id,
              exit_original_stop_vnd, exit_original_take_profit_vnd,
              exit_dynamic_stop_vnd, exit_dynamic_stop_set_at,
              exit_avg_cost_vnd, exit_plan_activated_at, updated_at, created_at
       from virtual_orders
       where id = $1 and user_id = $2 and side = 'sell' and status = 'filled'
         and filled_price_vnd is not null${lock ? ' for update' : ''}`,
      [sellOrderId, userId],
    );
    return rows[0] ?? null;
  }

  private toSnapshot(row: SellRow): Cap8ExitSnapshot {
    return {
      matchedBuyOrderId: row.exit_matched_buy_order_id,
      sellOrderId: row.id,
      symbol: row.symbol,
      snapshotAt: row.exit_snapshot_at,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      quantity: row.quantity,
      filledPriceVnd: requireInteger(row.filled_price_vnd, 'filled_price_vnd'),
      beforeQuantity: row.position_quantity_before_fill,
      afterQuantity: row.position_quantity_after_fill,
      originalStopVnd: integer(row.exit_original_stop_vnd),
      takeProfitVnd: integer(row.exit_original_take_profit_vnd),
      dynamicStopVnd: integer(row.exit_dynamic_stop_vnd),
      dynamicStopSetAt: row.exit_dynamic_stop_set_at,
      planActivatedAt: row.exit_plan_activated_at,
      avgCostVnd: integer(row.exit_avg_cost_vnd),
    };
  }

  private toProgress(row: ProgressRow): Cap8Progress {
    return {
      id: row.id,
      user_id: row.user_id,
      entered_at: row.entered_at,
      so_lenh_thoat_dung_ke_hoach: Number(row.so_lenh_thoat_dung_ke_hoach),
      muc_tieu_thoat_dung_ke_hoach: CAP8_EXIT_TARGET,
      graduated_at: row.graduated_at,
      time_to_graduate_hours:
        row.time_to_graduate_hours === null ? null : Number(row.time_to_graduate_hours),
    };
  }

  private toExit(row: ExitRow): Cap8Exit {
    return {
      id: row.id,
      symbol: row.symbol,
      matched_buy_order_id: row.matched_buy_order_id,
      sell_order_id: row.sell_order_id,
      exited_at: row.exited_at,
      quantity: row.quantity,
      filled_price_vnd: requireInteger(row.filled_price_vnd, 'filled_price_vnd'),
      remaining_position_pct: Number(row.remaining_position_pct),
      exit_method: row.exit_method,
      original_stop_vnd: integer(row.original_stop_vnd),
      original_take_profit_vnd: integer(row.original_take_profit_vnd),
      effective_stop_vnd: integer(row.effective_stop_vnd),
      dung_ke_hoach: row.dung_ke_hoach,
      ban_cam_xuc: row.ban_cam_xuc,
      classification_reason: row.classification_reason,
    };
  }

  private assertEntryEnabled(level: number): void {
    const configured = Number(process.env.CAP_MAX_ENABLED ?? 6);
    const maximum = Number.isInteger(configured) ? configured : 6;
    if (level > maximum)
      this.conflict(`Cấp ${level} hiện chưa mở cho tiến trình mới`, 'JOURNEY_LEVEL_DISABLED');
  }

  private notFound(resource: string): never {
    throw new NotFoundException({ code: 'NOT_FOUND', message: `Không tìm thấy ${resource}` });
  }

  private badRequest(message: string, code: string): never {
    throw new BadRequestException({ code, message });
  }

  private conflict(message: string, code: string): never {
    throw new ConflictException({ code, message });
  }
}
