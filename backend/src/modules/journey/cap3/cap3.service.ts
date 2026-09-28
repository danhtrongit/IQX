import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../../platform/database/index.js';
import { CoreJourneyService, JourneyEventService } from '../core/index.js';
import { exactInteger, exactRatioPercent, nullableExactInteger } from './exact-numeric.js';
import type { Cap3PlanBody } from './cap3.schemas.js';
import type {
  Cap3Progress,
  Cap3Trade,
  ConfidenceLevel,
  OrderPlanRow,
  RiskAppetite,
} from './cap3.types.js';

const DEFAULT_CAPITAL = 100_000_000n;
const CONFIDENCE = new Set([1, 2, 3]);
const MAX_ALLOCATION_PCT: Record<RiskAppetite, number> = {
  than_trong: 10,
  can_bang: 20,
  tan_cong: 30,
};

export function isWithinAllocationCap(appetite: RiskAppetite, percentage: number): boolean {
  return Number.isFinite(percentage) && percentage <= MAX_ALLOCATION_PCT[appetite] + 0.000001;
}

type ProgressRow = {
  id: string;
  user_id: string;
  entered_at: Date | string;
  khau_vi_da_dat: boolean;
  khau_vi: RiskAppetite | null;
  von_ban_dau: string | number | bigint;
  task_1_done_at: Date | string | null;
  task_2_done_at: Date | string | null;
  so_lenh_cap3: number;
  lai_pct_cap3: number | string;
  diem_ky_luat_tb_cap3: number | string | null;
  graduated_at: Date | string | null;
  time_to_graduate_hours: number | string | null;
};

type OrderRow = {
  id: string;
  user_id: string;
  account_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  mode: string;
  status: string;
  quantity: number;
  limit_price_vnd: string | number | bigint | null;
  filled_price_vnd: string | number | bigint | null;
  trading_date: Date | string;
  created_at: Date | string;
};

type Evidence = { count: string | number; confidence_levels: number[] | null };

@Injectable()
export class Cap3Service {
  constructor(
    private readonly database: DatabaseService,
    private readonly journey: CoreJourneyService,
    private readonly events: JourneyEventService,
  ) {}

  async getProgress(userId: string): Promise<Cap3Progress | null> {
    return this.database.transaction(async (tx) => {
      const progress = await this.findProgress(tx, userId, true);
      return progress ? this.recompute(tx, progress) : null;
    });
  }

  async enter(userId: string): Promise<Cap3Progress> {
    return this.database.transaction(async (tx) => {
      const existing = await this.findProgress(tx, userId, true);
      if (existing) return this.recompute(tx, existing);

      await this.journey.requireLevel(tx, userId, 2);
      const [cap2] = await tx.query<{ graduated_at: Date | string | null }>(
        'select graduated_at from cap2_progress where user_id = $1 limit 1',
        [userId],
      );
      if (!cap2 || cap2.graduated_at === null) throw new ConflictException('Chưa tốt nghiệp Cấp 2');
      let account: Awaited<ReturnType<CoreJourneyService['getAccountSnapshot']>> | null = null;
      try {
        account = await this.journey.getAccountSnapshot(tx, userId, { lock: false });
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
      const capital = account ? BigInt(account.initial_cash_vnd) : DEFAULT_CAPITAL;
      const id = randomUUID();
      await tx.query(
        `insert into cap3_progress
           (id, user_id, entered_at, khau_vi_da_dat, khau_vi, von_ban_dau,
            so_lenh_cap3, lai_pct_cap3, created_at, updated_at)
         values ($1, $2, now(), false, null, $3, 0, 0, now(), now())
         on conflict (user_id) do nothing`,
        [id, userId, capital.toString()],
      );
      const progress = await this.findProgress(tx, userId, true);
      if (!progress) throw new ConflictException('Không thể khởi tạo tiến trình Cấp 3');
      return this.recompute(tx, progress);
    });
  }

  async setRiskAppetite(userId: string, appetite: RiskAppetite): Promise<Cap3Progress> {
    return this.database.transaction(async (tx) => {
      const progress = await this.requireProgress(tx, userId, true);
      const event = progress.khau_vi_da_dat ? 'cap3_khau_vi_change' : 'cap3_khau_vi_set';
      const changed = !progress.khau_vi_da_dat || progress.khau_vi !== appetite;
      await tx.query(
        `update cap3_progress
         set khau_vi = $2, khau_vi_da_dat = true, updated_at = now()
         where user_id = $1`,
        [userId, appetite],
      );
      if (changed) {
        await this.events.recordInTransaction(tx, {
          userId,
          name: event,
          fields: { loai: appetite },
          dedupKey: `${progress.id}:${event}:${appetite}`,
        });
      }
      return this.recompute(tx, await this.requireProgress(tx, userId, true));
    });
  }

  async recordPlan(userId: string, input: Cap3PlanBody): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      const progress = await this.requireProgress(tx, userId, true);
      if (!progress.khau_vi_da_dat || progress.khau_vi === null) {
        throw new ConflictException('Chưa đặt khẩu vị rủi ro — cần đặt trước khi vào lệnh');
      }
      const order = await this.requireOrder(tx, userId, input.order_id, true);
      this.assertEligibleBuy(order, 'Cấp 3');
      if (
        new Date(order.created_at).getTime() < floorSecond(new Date(progress.entered_at)).getTime()
      ) {
        throw new BadRequestException('Lệnh được tạo trước khi vào Cấp 3');
      }
      if (input.khau_vi !== progress.khau_vi) {
        throw new ConflictException('Khẩu vị của lệnh không khớp cài đặt hiện tại');
      }
      if (!CONFIDENCE.has(input.muc_tu_tin)) {
        throw new BadRequestException('muc_tu_tin phải là 1, 2 hoặc 3');
      }
      if (input.khoi_luong !== order.quantity) {
        throw new BadRequestException('Khối lượng kế hoạch phải khớp khối lượng lệnh');
      }

      const referenceRaw = order.filled_price_vnd ?? order.limit_price_vnd;
      if (referenceRaw === null || BigInt(referenceRaw) <= 0n) {
        throw new BadRequestException('Chưa xác định được giá để tính % vốn');
      }
      const capital = BigInt(progress.von_ban_dau);
      const actualPct = exactRatioPercent(BigInt(order.quantity) * BigInt(referenceRaw), capital);
      if (Math.abs(input.pct_von - actualPct) > 0.05) {
        throw new BadRequestException('% vốn không khớp giá trị thực tế của lệnh');
      }
      if (!isWithinAllocationCap(input.khau_vi, actualPct)) {
        throw new BadRequestException(
          `Phân bổ vốn vượt trần khẩu vị ${MAX_ALLOCATION_PCT[input.khau_vi]}%`,
        );
      }

      const plans = await tx.query<OrderPlanRow>(
        `select id, order_id, "lyDo", "trangThai_luc_dat", vung_mua,
                phuong_phap_sl_tp, cat_lo, chot_loi, khau_vi, muc_tu_tin,
                cach_khoi_luong, khoi_luong, pct_von
         from order_kehoach where order_id = $1 for update`,
        [order.id],
      );
      const plan = plans[0];
      if (!plan) throw new NotFoundException('kế hoạch Cấp 1 — cần ghi lý do + vùng mua trước');

      const current = [
        plan.khau_vi,
        plan.muc_tu_tin,
        plan.cach_khoi_luong,
        plan.khoi_luong,
        plan.pct_von,
      ];
      if (current.some((value) => value !== null)) {
        const same =
          plan.khau_vi === input.khau_vi &&
          plan.muc_tu_tin === input.muc_tu_tin &&
          plan.cach_khoi_luong === input.cach_khoi_luong &&
          plan.khoi_luong === order.quantity &&
          plan.pct_von !== null &&
          Math.abs(Number(plan.pct_von) - actualPct) < 1e-9;
        if (!same) throw new ConflictException('Kế hoạch quản lý vốn đã được chốt lúc đặt lệnh');
      } else {
        await tx.query(
          `update order_kehoach
           set khau_vi = $2, muc_tu_tin = $3, cach_khoi_luong = $4,
               khoi_luong = $5, pct_von = $6, updated_at = now()
           where order_id = $1`,
          [
            order.id,
            input.khau_vi,
            input.muc_tu_tin,
            input.cach_khoi_luong,
            order.quantity,
            actualPct,
          ],
        );
        await this.events.recordInTransaction(tx, {
          userId,
          name: 'cap3_tu_tin_chon',
          fields: { muc: input.muc_tu_tin },
          dedupKey: order.id,
        });
        await this.events.recordInTransaction(tx, {
          userId,
          name: 'cap3_khoi_luong_cach',
          fields: { cach: input.cach_khoi_luong },
          dedupKey: order.id,
        });
      }
      await this.recompute(tx, progress);
      return this.planOutput(await this.requirePlan(tx, order.id));
    });
  }

  async getPlan(userId: string, orderId: string): Promise<Record<string, unknown>> {
    const order = await this.requireOrder(this.database, userId, orderId, false);
    if (order.side !== 'buy') throw new NotFoundException('lệnh mua');
    const plan = await this.requirePlan(this.database, orderId);
    const price = order.filled_price_vnd ?? order.limit_price_vnd;
    if (price === null) throw new BadRequestException('Chưa xác định được giá mua');
    return {
      ...this.planOutput(plan),
      symbol: order.symbol,
      quantity: order.quantity,
      bought_at: order.created_at,
      gia_vao: exactInteger(price, 'gia_vao'),
    };
  }

  async listTrades(userId: string): Promise<Cap3Trade[]> {
    const rows = await this.database.query<TradeSqlRow>(TRADE_HISTORY_SQL, [userId]);
    return rows.filter(completeCap3Evidence).map(mapTrade);
  }

  async tradeAnalysis(userId: string): Promise<Record<string, unknown>> {
    const trades = await this.listTrades(userId);
    const byConfidence = ([3, 2, 1] as const).map((confidence) => {
      const selected = trades.filter((trade) => trade.muc_tu_tin === confidence);
      const count = selected.length;
      const wins = selected.filter((trade) => trade.pnl_vnd > 0).length;
      return {
        muc_tu_tin: confidence,
        count,
        wins,
        win_rate: count ? (wins / count) * 100 : null,
        avg_pnl_pct: count ? selected.reduce((sum, row) => sum + row.pnl_pct, 0) / count : null,
        avg_khoi_luong: count
          ? selected.reduce((sum, row) => sum + row.khoi_luong, 0) / count
          : null,
        avg_pct_von: count ? selected.reduce((sum, row) => sum + row.pct_von, 0) / count : null,
      };
    });
    return { trades, total: trades.length, by_confidence: byConfidence };
  }

  async markTask(userId: string, taskNo: 1 | 2): Promise<Cap3Progress> {
    if (taskNo !== 1 && taskNo !== 2) throw new BadRequestException('task_no không hợp lệ');
    return this.database.transaction(async (tx) =>
      this.recompute(tx, await this.requireProgress(tx, userId, true)),
    );
  }

  async graduate(userId: string): Promise<Cap3Progress> {
    return this.database.transaction(async (tx) => {
      let progress = await this.recompute(tx, await this.requireProgress(tx, userId, true));
      if (progress.graduated_at !== null) return progress;
      if (progress.task_1_done_at === null || progress.task_2_done_at === null) {
        throw new ConflictException('Chưa hoàn thành đủ 2 nhiệm vụ Cấp 3');
      }
      const now = new Date();
      const hours = (now.getTime() - new Date(progress.entered_at).getTime()) / 3_600_000;
      await tx.query(
        `update cap3_progress
         set graduated_at = $2, time_to_graduate_hours = $3, updated_at = now()
         where user_id = $1 and graduated_at is null`,
        [userId, now, hours],
      );
      await this.events.recordInTransaction(tx, {
        userId,
        name: 'cap3_graduate',
        fields: {},
        dedupKey: now.toISOString(),
      });
      progress = await this.recompute(tx, await this.requireProgress(tx, userId, true));
      return progress;
    });
  }

  private async recompute(tx: SqlClient, row: ProgressRow): Promise<Cap3Progress> {
    let account: Awaited<ReturnType<CoreJourneyService['getAccountSnapshot']>> | null = null;
    try {
      account = await this.journey.getAccountSnapshot(tx, row.user_id, { lock: false });
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }
    const accountCapital = account ? BigInt(account.initial_cash_vnd) : 0n;
    const capital = accountCapital > 0n ? accountCapital : BigInt(row.von_ban_dau);

    const evidenceRows = await tx.query<Evidence>(
      `select count(*)::int as count,
              coalesce(array_agg(distinct k.muc_tu_tin order by k.muc_tu_tin)
                       filter (where k.muc_tu_tin in (1,2,3)), '{}') as confidence_levels
       from order_kehoach k
       join virtual_orders o on o.id = k.order_id
       where o.user_id = $1 and o.mode = 'thuc_chien' and o.side = 'buy'
         and o.status = 'filled' and o.created_at >= date_trunc('second', $2::timestamptz)
         and k.khau_vi is not null and k.muc_tu_tin in (1,2,3)
         and k.cach_khoi_luong is not null and k.khoi_luong > 0 and k.pct_von > 0
         and ($3::timestamptz is null or o.created_at <= $3::timestamptz)`,
      [row.user_id, row.entered_at, row.graduated_at],
    );
    const evidence = evidenceRows[0] ?? { count: 0, confidence_levels: [] };
    const count = Number(evidence.count);
    const levels = (evidence.confidence_levels ?? []).map(Number) as ConfidenceLevel[];

    const pnlRows = await tx.query<{ count: string | number; pnl_vnd: string | number | bigint }>(
      `select count(*)::int as count, coalesce(sum(ks.pnl_vnd), 0)::bigint as pnl_vnd
       from order_ketso ks
       join virtual_orders sell on sell.id = ks.order_id
       join virtual_orders buy on buy.id = sell.exit_matched_buy_order_id
       join order_kehoach k on k.order_id = buy.id
       where sell.user_id = $1 and sell.mode = 'thuc_chien'
         and ks.closed_at >= $2 and ($3::timestamptz is null or ks.closed_at <= $3)
         and k.khau_vi is not null and k.muc_tu_tin in (1,2,3)
         and k.cach_khoi_luong is not null`,
      [row.user_id, row.entered_at, row.graduated_at],
    );
    const pnl = pnlRows[0] ?? { count: 0, pnl_vnd: 0 };
    const discipline = await this.disciplineAverage(tx, row.user_id, row.entered_at);
    const now = new Date();
    const task1 = row.task_1_done_at ?? (count >= 10 ? now : null);
    const task2 = row.task_2_done_at ?? (new Set(levels).size === 3 ? now : null);

    await tx.query(
      `update cap3_progress set von_ban_dau = $2, so_lenh_cap3 = $3,
          lai_pct_cap3 = $4, diem_ky_luat_tb_cap3 = $5,
          task_1_done_at = coalesce(task_1_done_at, $6),
          task_2_done_at = coalesce(task_2_done_at, $7), updated_at = now()
       where user_id = $1`,
      [
        row.user_id,
        capital.toString(),
        Number(pnl.count),
        exactRatioPercent(BigInt(pnl.pnl_vnd), capital),
        discipline,
        task1,
        task2,
      ],
    );
    if (row.task_1_done_at === null && task1 !== null) {
      await this.events.recordInTransaction(tx, {
        userId: row.user_id,
        name: 'cap3_task_complete',
        fields: { task_id: 1 },
        dedupKey: `1:${new Date(task1).toISOString()}`,
      });
    }
    if (row.task_2_done_at === null && task2 !== null) {
      await this.events.recordInTransaction(tx, {
        userId: row.user_id,
        name: 'cap3_task_complete',
        fields: { task_id: 2 },
        dedupKey: `2:${new Date(task2).toISOString()}`,
      });
    }
    const fresh = await this.requireProgress(tx, row.user_id, false);
    return mapProgress(fresh, count, levels);
  }

  private async disciplineAverage(
    tx: SqlClient,
    userId: string,
    enteredAt: Date | string,
  ): Promise<number | null> {
    const rows = await tx.query<{ score: number | string }>(
      `with days as (
         select distinct trading_date from virtual_orders
         where user_id = $1 and mode = 'thuc_chien' and trading_date >= ($2::timestamptz)::date
       ), plans as (
         select o.trading_date, count(*)::int total,
                count(*) filter (where k.phuong_phap_sl_tp is not null
                  and k.cat_lo is not null and k.chot_loi is not null)::int complete
         from order_kehoach k join virtual_orders o on o.id = k.order_id
         where o.user_id = $1 and o.mode = 'thuc_chien' group by o.trading_date
       ), outcomes as (
         select sell.trading_date, count(*)::int total,
                count(*) filter (where ks."cham_SL_cat_dung_phien_ke")::int stop_ok,
                count(*) filter (where not ks.nhoi_lenh_khi_lo)::int no_average_down,
                count(*) filter (where p.chot_loi is not null and ks.gia_ra >= p.chot_loi
                  and not ks."cham_TP_giu_lam_hut")::int take_profit_ok
         from order_ketso ks join virtual_orders sell on sell.id = ks.order_id
         left join virtual_orders buy on buy.id = sell.exit_matched_buy_order_id
         left join order_kehoach p on p.order_id = buy.id
         where sell.user_id = $1 and sell.mode = 'thuc_chien' group by sell.trading_date
       )
       select least(100.0,
         40.0 * case when coalesce(p.total,0)=0 then 1 else p.complete::float/p.total end
         + least(40, coalesce(o.stop_ok,0)*20)
         + least(30, coalesce(o.no_average_down,0)*10)
         + least(30, coalesce(o.take_profit_ok,0)*10)) as score
       from days d left join plans p using(trading_date) left join outcomes o using(trading_date)`,
      [userId, enteredAt],
    );
    return rows.length
      ? rows.reduce((sum, item) => sum + Number(item.score), 0) / rows.length
      : null;
  }

  private async findProgress(
    tx: SqlClient,
    userId: string,
    lock: boolean,
  ): Promise<ProgressRow | null> {
    const rows = await tx.query<ProgressRow>(
      `select id, user_id, entered_at, khau_vi_da_dat, khau_vi, von_ban_dau,
              task_1_done_at, task_2_done_at, so_lenh_cap3, lai_pct_cap3,
              diem_ky_luat_tb_cap3, graduated_at, time_to_graduate_hours
       from cap3_progress where user_id = $1${lock ? ' for update' : ''}`,
      [userId],
    );
    return rows[0] ?? null;
  }

  private async requireProgress(
    tx: SqlClient,
    userId: string,
    lock: boolean,
  ): Promise<ProgressRow> {
    const row = await this.findProgress(tx, userId, lock);
    if (!row) throw new NotFoundException('tiến trình Cấp 3');
    return row;
  }

  private async requireOrder(
    tx: SqlClient | DatabaseService,
    userId: string,
    orderId: string,
    lock: boolean,
  ): Promise<OrderRow> {
    const rows = await tx.query<OrderRow>(
      `select id, user_id, account_id, symbol, side, mode, status, quantity,
              limit_price_vnd, filled_price_vnd, trading_date, created_at
       from virtual_orders where id = $1 and user_id = $2${lock ? ' for update' : ''}`,
      [orderId, userId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('lệnh');
    return row;
  }

  private async requirePlan(
    tx: SqlClient | DatabaseService,
    orderId: string,
  ): Promise<OrderPlanRow> {
    const rows = await tx.query<OrderPlanRow>(
      `select id, order_id, "lyDo", "trangThai_luc_dat", vung_mua,
              phuong_phap_sl_tp, cat_lo, chot_loi, khau_vi, muc_tu_tin,
              cach_khoi_luong, khoi_luong, pct_von
       from order_kehoach where order_id = $1`,
      [orderId],
    );
    if (!rows[0]) throw new NotFoundException('kế hoạch');
    return rows[0];
  }

  private assertEligibleBuy(order: OrderRow, level: string): void {
    if (order.side !== 'buy') throw new BadRequestException('Quản lý vốn chỉ ghi cho lệnh MUA');
    if (order.mode !== 'thuc_chien')
      throw new BadRequestException(`${level} chỉ ghi nhận lệnh Thực chiến`);
    if (!['pending', 'filled'].includes(order.status)) {
      throw new BadRequestException('Chỉ ghi kế hoạch cho lệnh đang chờ hoặc đã khớp');
    }
  }

  private planOutput(plan: OrderPlanRow): Record<string, unknown> {
    return {
      id: plan.id,
      order_id: plan.order_id,
      lyDo: plan.lyDo,
      trangThai_luc_dat: plan.trangThai_luc_dat,
      vung_mua: exactInteger(plan.vung_mua, 'vung_mua'),
      phuong_phap_sl_tp: plan.phuong_phap_sl_tp,
      cat_lo: nullableExactInteger(plan.cat_lo, 'cat_lo'),
      chot_loi: nullableExactInteger(plan.chot_loi, 'chot_loi'),
      khau_vi: plan.khau_vi,
      muc_tu_tin: plan.muc_tu_tin,
      cach_khoi_luong: plan.cach_khoi_luong,
      khoi_luong: plan.khoi_luong,
      pct_von: plan.pct_von === null ? null : Number(plan.pct_von),
    };
  }
}

function floorSecond(date: Date): Date {
  date.setMilliseconds(0);
  return date;
}

function mapProgress(row: ProgressRow, count: number, levels: ConfidenceLevel[]): Cap3Progress {
  return {
    ...row,
    von_ban_dau: exactInteger(row.von_ban_dau, 'von_ban_dau'),
    so_lenh_quan_ly_von: count,
    muc_tu_tin_da_dung: levels,
    so_muc_tu_tin_da_dung: levels.length,
    so_lenh_cap3: Number(row.so_lenh_cap3),
    lai_pct_cap3: Number(row.lai_pct_cap3),
    diem_ky_luat_tb_cap3:
      row.diem_ky_luat_tb_cap3 === null ? null : Number(row.diem_ky_luat_tb_cap3),
    time_to_graduate_hours:
      row.time_to_graduate_hours === null ? null : Number(row.time_to_graduate_hours),
  };
}

type TradeSqlRow = OrderPlanRow & {
  buy_order_id: string;
  sell_order_id: string;
  matched_by: 'snapshot' | 'symbol_fallback';
  symbol: string;
  quantity: number;
  bought_at: Date | string;
  closed_at: Date | string;
  gia_vao: string | number | bigint | null;
  gia_ra: string | number | bigint;
  pnl_pct: number | string;
  pnl_vnd: string | number | bigint;
  cam_xuc: Cap3Trade['cam_xuc'];
  cham_SL_cuoi_phien: boolean;
  cham_SL_cat_dung_phien_ke: boolean;
  cham_SL_khong_cat: boolean;
  giu_cham_SL_bao_nhieu_phien: number | null;
  cham_TP_giu_lam_hut: boolean;
  ban_som_khi_lo_nhe: boolean;
  nhoi_lenh_khi_lo: boolean;
  ghi_chu_nhin_lai: string | null;
};

function completeCap3Evidence(row: TradeSqlRow): boolean {
  return (
    row.khau_vi !== null &&
    row.muc_tu_tin !== null &&
    CONFIDENCE.has(row.muc_tu_tin) &&
    row.cach_khoi_luong !== null &&
    row.khoi_luong !== null &&
    row.khoi_luong > 0 &&
    row.pct_von !== null &&
    Number(row.pct_von) > 0
  );
}

function mapTrade(row: TradeSqlRow): Cap3Trade {
  return {
    buy_order_id: row.buy_order_id,
    sell_order_id: row.sell_order_id,
    matched_by: row.matched_by,
    symbol: row.symbol,
    quantity: row.quantity,
    bought_at: row.bought_at,
    closed_at: row.closed_at,
    gia_vao: nullableExactInteger(row.gia_vao, 'gia_vao'),
    gia_ra: exactInteger(row.gia_ra, 'gia_ra'),
    pnl_pct: Number(row.pnl_pct),
    pnl_vnd: exactInteger(row.pnl_vnd, 'pnl_vnd'),
    lyDo: row.lyDo,
    trangThai_luc_dat: row.trangThai_luc_dat,
    vung_mua: exactInteger(row.vung_mua, 'vung_mua'),
    cam_xuc: row.cam_xuc,
    phuong_phap_sl_tp: row.phuong_phap_sl_tp,
    cat_lo: nullableExactInteger(row.cat_lo, 'cat_lo'),
    chot_loi: nullableExactInteger(row.chot_loi, 'chot_loi'),
    cham_SL_cuoi_phien: row.cham_SL_cuoi_phien,
    cham_SL_cat_dung_phien_ke: row.cham_SL_cat_dung_phien_ke,
    cham_SL_khong_cat: row.cham_SL_khong_cat,
    giu_cham_SL_bao_nhieu_phien: row.giu_cham_SL_bao_nhieu_phien,
    cham_TP_giu_lam_hut: row.cham_TP_giu_lam_hut,
    ban_som_khi_lo_nhe: row.ban_som_khi_lo_nhe,
    nhoi_lenh_khi_lo: row.nhoi_lenh_khi_lo,
    ghi_chu_nhin_lai: row.ghi_chu_nhin_lai,
    khau_vi: row.khau_vi!,
    muc_tu_tin: row.muc_tu_tin as ConfidenceLevel,
    cach_khoi_luong: row.cach_khoi_luong!,
    khoi_luong: row.khoi_luong!,
    pct_von: Number(row.pct_von),
  };
}

const TRADE_HISTORY_SQL = `
  select buy.id as buy_order_id, sell.id as sell_order_id,
         case when sell.exit_matched_buy_order_id = buy.id then 'snapshot'
              else 'symbol_fallback' end as matched_by,
         sell.symbol, sell.quantity, buy.created_at as bought_at, ks.closed_at,
         buy.filled_price_vnd as gia_vao, ks.gia_ra, ks.pnl_pct, ks.pnl_vnd,
         k.id, k.order_id, k."lyDo", k."trangThai_luc_dat", k.vung_mua,
         ks.cam_xuc, k.phuong_phap_sl_tp, k.cat_lo, k.chot_loi,
         ks."cham_SL_cuoi_phien", ks."cham_SL_cat_dung_phien_ke",
         ks."cham_SL_khong_cat", ks."giu_cham_SL_bao_nhieu_phien",
         ks."cham_TP_giu_lam_hut", ks.ban_som_khi_lo_nhe,
         ks.nhoi_lenh_khi_lo, ks.ghi_chu_nhin_lai,
         k.khau_vi, k.muc_tu_tin, k.cach_khoi_luong, k.khoi_luong, k.pct_von
  from order_ketso ks
  join virtual_orders sell on sell.id = ks.order_id and sell.side = 'sell'
  join lateral (
    select candidate.* from virtual_orders candidate
    where candidate.user_id = sell.user_id and candidate.mode = sell.mode
      and candidate.side = 'buy' and candidate.status = 'filled'
      and candidate.account_id = sell.account_id and candidate.symbol = sell.symbol
      and candidate.created_at <= sell.created_at
      and (candidate.id = sell.exit_matched_buy_order_id or candidate.created_at <= sell.created_at)
    order by (candidate.id = sell.exit_matched_buy_order_id) desc, candidate.created_at desc
    limit 1
  ) buy on true
  join order_kehoach k on k.order_id = buy.id
  where sell.user_id = $1
  order by ks.closed_at desc
  limit 500`;
