import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService, type SqlClient } from '../../../platform/database/index.js';
import {
  CONSENSUS_THRESHOLD,
  CONSENSUS_VALID_SESSIONS,
  earliestValidSession,
  scoreConsensus,
} from './consensus.js';
import {
  CAP5_HUNT_DATA_SOURCE,
  FILTER_SPECS,
  floorConditions,
  HuntEngine,
  TOP_RESULTS,
  UnconfiguredHuntDataSource,
} from './hunt.engine.js';
import type {
  Cap5ProgressRow,
  HuntDataSource,
  HuntFilter,
  HuntLogRow,
  OrderPlanRow,
  VirtualOrderRow,
  WatchlistRow,
} from './cap5.types.js';
import { HUNT_FILTER_LABELS, HUNT_FILTERS } from './cap5.types.js';
import { assertEligibleStock } from '../../watchlists/index.js';

const MAX_WATCHLIST = 50;
const TASK_1_TARGET = 10;
const TASK_2_TARGET = 5;
const MIN_ANALYSIS_ORDERS = 3;
const toDate = (value: unknown): Date | null =>
  value ? new Date(value as string | number | Date) : null;
const upper = (value: string) => value.trim().toUpperCase();
const vnDay = (value: unknown) => {
  const date = toDate(value);
  return date
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date)
    : null;
};
const tradingSessions = (from: string | null, to: string | null): number | null => {
  if (!from || !to) return null;
  const a = new Date(`${from}T00:00:00Z`),
    b = new Date(`${to}T00:00:00Z`);
  if (b < a) return 0;
  let count = 0;
  for (const current = new Date(a); current <= b; current.setUTCDate(current.getUTCDate() + 1)) {
    if (current.getUTCDay() !== 0 && current.getUTCDay() !== 6) count += 1;
  }
  return Math.max(0, count - 1);
};

export const CAP5_SERVICE = Symbol('CAP5_SERVICE');

@Injectable()
export class Cap5Service {
  private readonly hunt: HuntEngine;
  constructor(
    private readonly database: DatabaseService,
    @Inject(CAP5_HUNT_DATA_SOURCE) source: HuntDataSource,
  ) {
    this.hunt = new HuntEngine(source ?? new UnconfiguredHuntDataSource());
  }

  private async one<T extends Record<string, unknown>>(
    sql: string,
    values: readonly unknown[],
  ): Promise<T | null> {
    const rows = await this.database.query<T>(sql, values);
    return rows[0] ?? null;
  }
  private async requireProgress(userId: string): Promise<Cap5ProgressRow> {
    const row = await this.one<Cap5ProgressRow>('select * from cap5_progress where user_id = $1', [
      userId,
    ]);
    if (!row) throw new NotFoundException({ code: 'CAP5_NOT_ENTERED', message: 'Chưa vào Cấp 5' });
    return row;
  }
  private output(
    row: Cap5ProgressRow,
    huntCount: number,
    boughtCount: number,
    scored = 0,
    notable: number | null = null,
  ) {
    return {
      id: row.id,
      user_id: row.user_id,
      entered_at: row.entered_at,
      task_1_done_at: row.task_1_done_at,
      task_2_done_at: row.task_2_done_at,
      so_ma_da_san: huntCount,
      so_ma_mua_tu_watchlist: boughtCount,
      so_ma_cho_du_lop: scored ? notable : null,
      so_ma_da_cham_diem: scored,
      so_ma_cho_du_lop_day_du: huntCount > 0 && scored >= huntCount,
      muc_tieu_so_ma_san: TASK_1_TARGET,
      muc_tieu_so_ma_mua: TASK_2_TARGET,
      da_xem_tour_sanma: row.da_xem_tour_sanma,
      best_filter: row.best_filter,
      best_filter_ten: row.best_filter ? HUNT_FILTER_LABELS[row.best_filter] : null,
      graduated_at: row.graduated_at,
      time_to_graduate_hours: row.time_to_graduate_hours,
    };
  }

  private async huntLog(userId: string, client?: SqlClient): Promise<HuntLogRow[]> {
    const query = client?.query.bind(client) ?? this.database.query.bind(this.database);
    return query<HuntLogRow>(
      'select * from cap5_hunt_log where user_id = $1 order by first_hunted_at asc',
      [userId],
    );
  }
  private async watchRows(userId: string, client?: SqlClient): Promise<WatchlistRow[]> {
    const query = client?.query.bind(client) ?? this.database.query.bind(this.database);
    return query<WatchlistRow>(
      'select * from watchlist_items where user_id = $1 order by sort_order asc, created_at asc',
      [userId],
    );
  }
  private async refreshConsensus(
    rows: WatchlistRow[],
    client?: SqlClient,
  ): Promise<Map<string, ReturnType<typeof scoreConsensus>>> {
    const result = new Map<string, ReturnType<typeof scoreConsensus>>();
    if (!rows.length) return result;
    const query = client?.query.bind(client) ?? this.database.query.bind(this.database);
    const symbols = rows.map((row) => upper(row.symbol));
    const aiRows = await query<Record<string, unknown>>(
      `select distinct on (upper(symbol)) upper(symbol) as symbol, payload, session_date
       from ai_insight_history where upper(symbol) = any($1::text[]) order by upper(symbol), session_date desc`,
      [symbols],
    );
    const bySymbol = new Map(aiRows.map((row) => [String(row.symbol), row]));
    const today = new Date().toISOString().slice(0, 10);
    const earliest = earliestValidSession(today);
    for (const row of rows) {
      const current = bySymbol.get(upper(row.symbol));
      const currentDate = current?.session_date ? String(current.session_date).slice(0, 10) : null;
      const valid = currentDate && currentDate >= earliest;
      const scored = scoreConsensus(valid ? current?.payload : null, {
        sessionDate: valid ? currentDate : null,
        insightSessionDate: valid ? currentDate : null,
        expiredSessionDate: currentDate && !valid ? currentDate : null,
      });
      result.set(upper(row.symbol), scored);
      const lastRefresh = vnDay(row.consensus_at);
      if (lastRefresh === today || scored.diem === null) continue;
      const previous =
        row.consensus_today !== null && row.consensus_today !== scored.diem
          ? row.consensus_today
          : row.consensus_prev;
      await query(
        `update watchlist_items set consensus_prev = $1, consensus_today = $2, consensus_da_cham = $3,
         consensus_at = now(), status = $4, updated_at = now() where id = $5`,
        [previous, scored.diem, scored.so_lop_da_cham, scored.status, row.id],
      );
      if (scored.status === 'notable') {
        await query(
          `update cap5_hunt_log set notable_at = coalesce(notable_at, now()), updated_at = now()
           where user_id = $1 and upper(symbol) = $2`,
          [row.user_id, upper(row.symbol)],
        );
      }
    }
    return result;
  }

  async getProgress(userId: string) {
    const row = await this.one<Cap5ProgressRow>('select * from cap5_progress where user_id = $1', [
      userId,
    ]);
    if (!row) return null;
    const logs = await this.huntLog(userId);
    const buys = await this.database.query<VirtualOrderRow>(
      `select vo.* from virtual_orders vo where vo.user_id = $1 and vo.mode = 'thuc_chien' and vo.side = 'buy' and vo.status = 'filled'`,
      [userId],
    );
    const logBySymbol = new Map(logs.map((log) => [upper(log.symbol), log]));
    const orderIds = buys.map((buy) => buy.id);
    if (orderIds.length) {
      const plans = await this.database.query<OrderPlanRow>(
        'select * from order_kehoach where order_id = any($1::uuid[])',
        [orderIds],
      );
      const enteredAt = new Date(row.entered_at);
      for (const plan of plans) {
        const order = buys.find((buy) => buy.id === plan.order_id);
        if (!order || new Date(order.created_at) < enteredAt || plan.from_watchlist !== null)
          continue;
        const hunt = logBySymbol.get(upper(order.symbol));
        const fromWatchlist = Boolean(
          hunt && new Date(hunt.first_hunted_at) <= new Date(order.created_at),
        );
        await this.database.query(
          `update order_kehoach set from_watchlist=$1, hunt_filter=$2, hunt_signal_at_entry=$3,
           hunt_first_hunted_at_entry=$4, hunt_sessions_at_entry=$5, cap5_entry_snapshot_at=now()
           where order_id=$6 and from_watchlist is null`,
          [
            fromWatchlist,
            hunt?.hunt_filter ?? null,
            hunt?.hunt_signal ?? null,
            hunt?.first_hunted_at ?? null,
            tradingSessions(vnDay(hunt?.first_hunted_at), vnDay(order.created_at)),
            order.id,
          ],
        );
      }
    }
    const bought = new Set(
      buys
        .filter((buy) => {
          const log = logBySymbol.get(upper(buy.symbol));
          return Boolean(log && new Date(log.first_hunted_at) <= new Date(buy.created_at));
        })
        .map((buy) => upper(buy.symbol)),
    );
    const rows = await this.watchRows(userId);
    const consensus = await this.refreshConsensus(rows);
    const scoredSymbols = new Set<string>();
    let notable = 0;
    for (const log of logs) {
      const result = consensus.get(upper(log.symbol));
      if (result?.diem !== null && result?.diem !== undefined) scoredSymbols.add(upper(log.symbol));
      if (log.notable_at || result?.status === 'notable') notable += 1;
    }
    const huntCount = logs.length,
      boughtCount = bought.size;
    await this.database.query(
      `update cap5_progress set so_ma_da_san = $1::integer, so_ma_mua_tu_watchlist = $2::integer,
       task_1_done_at = case when task_1_done_at is null and $1::integer >= $3::integer then now() else task_1_done_at end,
       task_2_done_at = case when task_2_done_at is null and $2::integer >= $4::integer then now() else task_2_done_at end,
       updated_at = now() where id = $5`,
      [huntCount, boughtCount, TASK_1_TARGET, TASK_2_TARGET, row.id],
    );
    const fresh =
      (await this.one<Cap5ProgressRow>('select * from cap5_progress where id = $1', [row.id])) ??
      row;
    return this.output(fresh, huntCount, boughtCount, scoredSymbols.size, notable);
  }

  async enter(userId: string) {
    const existing = await this.one<Cap5ProgressRow>(
      'select * from cap5_progress where user_id = $1',
      [userId],
    );
    if (existing) return this.getProgress(userId);
    const cap4 = await this.one<{ graduated_at: string | null }>(
      'select graduated_at from cap4_progress where user_id = $1',
      [userId],
    );
    if (!cap4)
      throw new NotFoundException({ code: 'CAP4_NOT_FOUND', message: 'Chưa có tiến trình Cấp 4' });
    if (!cap4.graduated_at)
      throw new ConflictException({ code: 'CAP4_NOT_GRADUATED', message: 'Chưa tốt nghiệp Cấp 4' });
    await this.database.query(
      `insert into cap5_progress(id,user_id,entered_at,so_ma_da_san,so_ma_mua_tu_watchlist,da_xem_tour_sanma,created_at,updated_at)
       values($1,$2,now(),0,0,false,now(),now())`,
      [randomUUID(), userId],
    );
    return this.getProgress(userId);
  }
  async markTask(userId: string, taskNo: number) {
    if (![1, 2].includes(taskNo))
      throw new BadRequestException({ code: 'INVALID_TASK', message: 'task_no phải là 1 hoặc 2' });
    return this.getProgress(userId);
  }
  async markTour(userId: string) {
    await this.requireProgress(userId);
    await this.database.query(
      'update cap5_progress set da_xem_tour_sanma = true, updated_at = now() where user_id = $1',
      [userId],
    );
    return this.getProgress(userId);
  }

  async huntIndex(userId: string) {
    await this.requireProgress(userId);
    const symbols = await this.database.query<{ symbol: string }>(
      `select upper(symbol) symbol from symbols where is_active = true and upper(exchange) = 'HOSE' and coalesce(is_index,false) = false and lower(asset_type) = 'stock' order by symbol`,
    );
    const universe = symbols.map((row) => row.symbol);
    let restricted: Set<string> | null = null;
    try {
      restricted = await this.hunt.source.restrictedSymbols();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) restricted = null;
      else throw error;
    }
    const availableUniverse =
      restricted === null ? [] : universe.filter((symbol) => !restricted!.has(symbol));
    const statuses = await Promise.all(
      HUNT_FILTERS.map(async (filter) => {
        const [available, reason] =
          restricted === null
            ? ([false, 'API trạng thái HOSE không trả dữ liệu hợp lệ — chưa lọc được.'] as const)
            : await this.hunt.probe(filter, availableUniverse);
        return { ...FILTER_SPECS[filter], kha_dung: available, ly_do_chua_kha_dung: reason };
      }),
    );
    return {
      loc_san: floorConditions(restricted !== null),
      so_ma_trong_ro: restricted === null ? universe.length : availableUniverse.length,
      bo_loc: statuses,
      hien_thi_toi_da: TOP_RESULTS,
    };
  }
  async huntResult(userId: string, filter: string) {
    await this.requireProgress(userId);
    if (!HUNT_FILTERS.includes(filter as HuntFilter))
      throw new NotFoundException({
        code: 'HUNT_FILTER_NOT_FOUND',
        message: 'Bộ lọc không hợp lệ',
      });
    const symbols = await this.database.query<{ symbol: string }>(
      `select upper(symbol) symbol from symbols where is_active = true and upper(exchange) = 'HOSE' and coalesce(is_index,false) = false and lower(asset_type) = 'stock' order by symbol`,
    );
    let restricted: Set<string> | null;
    try {
      restricted = await this.hunt.source.restrictedSymbols();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) restricted = null;
      else throw error;
    }
    if (!restricted)
      throw new ServiceUnavailableException({
        code: 'CAP5_HUNT_PROVIDER_UNAVAILABLE',
        message: 'Nguồn trạng thái HOSE chưa sẵn sàng',
      });
    const universe = symbols.map((row) => row.symbol).filter((symbol) => !restricted!.has(symbol));
    const result = await this.hunt.run(filter as HuntFilter, universe);
    return {
      ma: result.filter.ma,
      icon: result.filter.icon,
      ten: result.filter.ten,
      mo_ta: result.filter.mo_ta,
      dieu_kien: result.filter.dieu_kien,
      xep_hang_theo: result.filter.xep_hang_theo,
      nguon_du_lieu: result.filter.nguon_du_lieu,
      kha_dung: result.available,
      ly_do_chua_kha_dung: result.unavailableReason,
      tong_so_ma: result.matchedCount,
      so_ma_trong_ro: result.universeCount,
      so_ma_xet: result.evaluatedCount,
      so_ma_truot_loc_san: result.floorRejectedCount,
      so_ma_bo_qua_thieu_du_lieu: result.missingDataCount,
      ket_qua_day_du: result.complete,
      canh_bao_thieu_du_lieu: result.incompleteWarning,
      hien_thi_toi_da: TOP_RESULTS,
      loc_san: floorConditions(true),
      items: result.items,
    };
  }

  async addWatchlist(userId: string, body: { symbol: string; hunt_filter: HuntFilter }) {
    await this.requireProgress(userId);
    const symbol = upper(body.symbol);
    if (!HUNT_FILTERS.includes(body.hunt_filter))
      throw new BadRequestException({
        code: 'INVALID_HUNT_FILTER',
        message: 'Bộ lọc săn mã không hợp lệ',
      });
    return this.database.transaction(async (tx) => {
      await assertEligibleStock(tx, symbol);
      const existing = (
        await tx.query<WatchlistRow>(
          'select * from watchlist_items where user_id = $1 and upper(symbol) = $2 for update',
          [userId, symbol],
        )
      )[0];
      if (!existing) {
        const count = (
          await tx.query<{ count: string }>(
            'select count(*)::text count from watchlist_items where user_id = $1',
            [userId],
          )
        )[0];
        if (Number(count?.count ?? 0) >= MAX_WATCHLIST)
          throw new ConflictException({
            code: 'WATCHLIST_LIMIT',
            message: `Watchlist tối đa ${MAX_WATCHLIST} mã`,
          });
      }
      const now = new Date();
      const id = existing?.id ?? randomUUID();
      if (existing)
        await tx.query(
          'update watchlist_items set hunt_filter = $1, hunt_signal = null, hunt_at = $2, updated_at = now() where id = $3',
          [body.hunt_filter, now, id],
        );
      else
        await tx.query(
          `insert into watchlist_items(id,user_id,symbol,sort_order,hunt_filter,hunt_signal,hunt_at,created_at,updated_at) values($1,$2,$3,coalesce((select max(sort_order)+1 from watchlist_items where user_id=$2),0),$4,null,$5,now(),now())`,
          [id, userId, symbol, body.hunt_filter, now],
        );
      const log = (
        await tx.query<HuntLogRow>(
          'select * from cap5_hunt_log where user_id = $1 and upper(symbol) = $2 for update',
          [userId, symbol],
        )
      )[0];
      if (log)
        await tx.query(
          'update cap5_hunt_log set hunt_filter = $1, hunt_signal = null, last_hunted_at = $2, updated_at = now() where id = $3',
          [body.hunt_filter, now, log.id],
        );
      else
        await tx.query(
          `insert into cap5_hunt_log(id,user_id,symbol,hunt_filter,hunt_signal,first_hunted_at,last_hunted_at,created_at,updated_at) values($1,$2,$3,$4,null,$5,$5,now(),now())`,
          [randomUUID(), userId, symbol, body.hunt_filter, now],
        );
      const row = (
        await tx.query<WatchlistRow>('select * from watchlist_items where id = $1', [id])
      )[0];
      return row;
    });
  }
  async removeWatchlist(userId: string, symbol: string) {
    await this.requireProgress(userId);
    const result = await this.database.query<{ id: string }>(
      'delete from watchlist_items where user_id = $1 and upper(symbol) = $2 returning id',
      [userId, upper(symbol)],
    );
    if (!result[0])
      throw new NotFoundException({
        code: 'WATCHLIST_NOT_FOUND',
        message: 'Mã không có trong Watchlist',
      });
  }
  async watchlist(userId: string) {
    await this.requireProgress(userId);
    const rows = await this.watchRows(userId);
    const scores = await this.refreshConsensus(rows);
    const logs = await this.huntLog(userId);
    const logMap = new Map(logs.map((row) => [upper(row.symbol), row]));
    const items = rows.map((row) => {
      const score = scores.get(upper(row.symbol));
      const log = logMap.get(upper(row.symbol));
      const stale = row.consensus_today !== null && (!score || score.diem === null);
      return {
        symbol: upper(row.symbol),
        current_price_vnd: null,
        percent_change: null,
        added_at: row.created_at,
        hunt_filter: row.hunt_filter,
        hunt_filter_ten: row.hunt_filter ? HUNT_FILTER_LABELS[row.hunt_filter] : null,
        hunt_signal: row.hunt_signal,
        hunt_at: row.hunt_at,
        so_phien_tu_khi_san: tradingSessions(vnDay(row.hunt_at), vnDay(new Date())),
        consensus_today: row.consensus_today,
        consensus_prev: row.consensus_prev,
        consensus_da_cham: row.consensus_da_cham,
        consensus_at: row.consensus_at,
        consensus_session_date: score?.session_date ?? null,
        consensus_session_date_qua_han: score?.session_date_qua_han ?? null,
        consensus_het_han: stale,
        so_phien_hieu_luc: CONSENSUS_VALID_SESSIONS,
        status: row.status,
        tong_so_lop: 5,
        nguong_dang_chu_y: CONSENSUS_THRESHOLD,
        nhac:
          row.status === 'notable'
            ? stale
              ? 'Điểm này dựng từ bản phân tích 5 lớp đã cũ — mở AI Phân tích để có bản mới.'
              : '4/5 lớp đang ủng hộ — quyết định mua vẫn là của bạn.'
            : null,
        lop: score?.lop
          ? Object.fromEntries(score.lop.map((layer) => [layer.lop, layer.muc]))
          : null,
        lop_chi_tiet: score?.lop ?? null,
        first_hunted_at: log?.first_hunted_at ?? null,
      };
    });
    return {
      items,
      so_luong: items.length,
      so_dang_chu_y: items.filter((item) => item.status === 'notable').length,
      toi_da: MAX_WATCHLIST,
      so_phien_hieu_luc: CONSENSUS_VALID_SESSIONS,
    };
  }

  async source(userId: string, symbolInput: string, orderId?: string) {
    await this.requireProgress(userId);
    const symbol = upper(symbolInput);
    let order: VirtualOrderRow | null = null;
    if (orderId) {
      order = await this.one<VirtualOrderRow>(
        'select * from virtual_orders where id = $1 and user_id = $2',
        [orderId, userId],
      );
      if (!order)
        throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy lệnh' });
      if (upper(order.symbol) !== symbol)
        throw new BadRequestException({
          code: 'ORDER_SYMBOL_MISMATCH',
          message: 'Lệnh không thuộc mã này',
        });
    }
    const log = await this.one<HuntLogRow>(
      'select * from cap5_hunt_log where user_id = $1 and upper(symbol) = $2',
      [userId, symbol],
    );
    const fromHunt =
      log && order ? new Date(log.first_hunted_at) <= new Date(order.created_at) : Boolean(log);
    const sessions = fromHunt
      ? tradingSessions(vnDay(log!.first_hunted_at), vnDay(order?.created_at ?? new Date()))
      : null;
    const plan = order
      ? await this.one<OrderPlanRow>('select * from order_kehoach where order_id = $1', [order.id])
      : null;
    const filter =
      plan?.from_watchlist && plan.hunt_filter
        ? plan.hunt_filter
        : fromHunt
          ? log?.hunt_filter
          : null;
    return {
      symbol,
      order_id: orderId ?? null,
      tu_san_ma: Boolean(fromHunt),
      hunt_filter: filter ?? null,
      hunt_filter_ten: filter ? HUNT_FILTER_LABELS[filter] : null,
      hunt_signal: log?.hunt_signal ?? null,
      first_hunted_at: log?.first_hunted_at ?? null,
      so_phien_trong_watchlist: sessions,
      moc_tinh_phien: order ? 'luc_dat_lenh' : 'hom_nay',
      canh_bao_thieu_order_id: order
        ? null
        : 'Dòng này đọc từ SỔ SĂN, không gắn với lệnh nào; truyền order_id để xác nhận nguồn của một lệnh cụ thể.',
      canh_bao_nguon_moi_hon: null,
      so_lop_luc_vao: null,
      giai_thich: fromHunt
        ? `Mã này bạn săn từ bộ lọc ${filter ? HUNT_FILTER_LABELS[filter] : 'không xác định'}.`
        : `Mã ${symbol} không đến từ săn mã.`,
      ly_do_thieu_so_lop: fromHunt ? 'Hệ không lưu điểm đồng thuận tại thời điểm đặt lệnh.' : null,
    };
  }
  async analysis(userId: string) {
    await this.requireProgress(userId);
    const rows = await this.database.query<Record<string, unknown>>(
      `select ok.*, ot.pnl_pct from order_kehoach ok join virtual_orders buy on buy.id=ok.order_id and buy.user_id=$1 and buy.side='buy' left join lateral (select s.* from virtual_orders s where s.user_id=$1 and s.symbol=buy.symbol and s.side='sell' and s.created_at>=buy.created_at order by s.created_at asc limit 1) sell on true join order_ketso ot on ot.order_id=sell.id where ok.from_watchlist = true`,
      [userId],
    );
    const items: Array<{
      ma: HuntFilter;
      ten: string;
      so_lenh: number;
      so_lenh_thang: number;
      ty_le_thang: number | null;
      du_mau: boolean;
      nhan: string | null;
      canh_bao: string | null;
      giai_thich: string;
    }> = HUNT_FILTERS.map((filter) => {
      const subset = rows.filter((row) => row.hunt_filter === filter);
      const wins = subset.filter((row) => Number(row.pnl_pct) > 0).length;
      const enough = subset.length >= MIN_ANALYSIS_ORDERS;
      return {
        ma: filter,
        ten: HUNT_FILTER_LABELS[filter],
        so_lenh: subset.length,
        so_lenh_thang: wins,
        ty_le_thang: enough ? Math.round((wins / subset.length) * 1000) / 10 : null,
        du_mau: enough,
        nhan: null,
        canh_bao: null,
        giai_thich: enough
          ? `${wins}/${subset.length} lệnh đã đóng có lãi.`
          : `Mới ${subset.length}/${MIN_ANALYSIS_ORDERS} lệnh — chưa đủ dữ liệu.`,
      };
    });
    const enough = items
      .filter((item) => item.du_mau)
      .sort((a, b) => (b.ty_le_thang ?? 0) - (a.ty_le_thang ?? 0));
    if (enough[0]) enough[0].nhan = 'hợp với bạn nhất';
    const progress = await this.getProgress(userId);
    const logs = await this.huntLog(userId);
    const watchRows = await this.watchRows(userId);
    const scores = await this.refreshConsensus(watchRows);
    const scored = new Set<string>();
    for (const log of logs) {
      const score = scores.get(upper(log.symbol));
      if (score?.diem !== null && score?.diem !== undefined) scored.add(upper(log.symbol));
    }
    const funnelCount = progress?.so_ma_cho_du_lop ?? null;
    const funnelExplanation =
      logs.length === 0
        ? 'Bạn chưa săn mã nào — mở màn Săn mã và thử một bộ lọc.'
        : funnelCount === null
          ? `Bạn săn ${logs.length} mã; tầng giữa chưa đo được vì chưa có điểm đồng thuận hợp lệ.`
          : `Bạn săn ${logs.length} mã, ít nhất ${funnelCount} mã đạt ngưỡng ${CONSENSUS_THRESHOLD}/5 lớp ủng hộ và vào lệnh ${progress?.so_ma_mua_tu_watchlist ?? 0} mã.`;
    return {
      khoi_12: {
        items,
        best_filter: enough[0]?.ma ?? null,
        so_lenh_toi_thieu: MIN_ANALYSIS_ORDERS,
        so_lenh_khong_tu_san: rows.filter((row) => !row.hunt_filter).length,
        du_de_ket_luan: enough.length > 0,
        giai_thich: `Mỗi bộ lọc cần ít nhất ${MIN_ANALYSIS_ORDERS} lệnh đã đóng mới được xếp hạng.`,
      },
      khoi_13: {
        so_ma_da_san: logs.length,
        so_ma_cho_du_lop: funnelCount,
        so_ma_da_cham_diem: scored.size,
        so_ma_cho_du_lop_day_du: logs.length > 0 && scored.size >= logs.length,
        so_ma_vao_lenh: progress?.so_ma_mua_tu_watchlist ?? 0,
        giai_thich: 'Phễu kỷ luật săn mã.',
        loi_ket: funnelExplanation,
      },
    };
  }
  async getPlan(userId: string, orderId: string) {
    await this.requireProgress(userId);
    const plan = await this.one<OrderPlanRow>(
      'select * from order_kehoach ok join virtual_orders vo on vo.id=ok.order_id where ok.order_id=$1 and vo.user_id=$2',
      [orderId, userId],
    );
    if (!plan)
      throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Không tìm thấy kế hoạch' });
    return {
      order_id: orderId,
      source_known: plan.from_watchlist !== null,
      from_watchlist: plan.from_watchlist,
      tu_san_ma: plan.from_watchlist,
      hunt_filter: plan.hunt_filter,
      hunt_filter_ten: plan.hunt_filter ? HUNT_FILTER_LABELS[plan.hunt_filter] : null,
      hunt_signal: plan.hunt_signal_at_entry,
      first_hunted_at: plan.hunt_first_hunted_at_entry,
      so_phien_trong_watchlist: plan.hunt_sessions_at_entry,
      so_lop_luc_vao: plan.consensus_at_entry,
      so_lop_da_cham_luc_vao: plan.consensus_scored_at_entry,
      consensus_captured_at_entry: plan.consensus_captured_at_entry,
      entry_snapshot_at: plan.cap5_entry_snapshot_at,
      giai_thich: plan.from_watchlist
        ? `Mã này được săn từ bộ lọc ${HUNT_FILTER_LABELS[plan.hunt_filter!]}.`
        : 'Lệnh này không đến từ săn mã.',
      ly_do_thieu_so_lop:
        plan.consensus_at_entry === null
          ? 'Không có điểm đồng thuận đã chấm tại thời điểm đặt.'
          : null,
    };
  }
  async recordEntrySnapshot(userId: string, orderId: string) {
    const progress = await this.requireProgress(userId);
    const order = await this.one<VirtualOrderRow>(
      "select * from virtual_orders where id=$1 and user_id=$2 and side='buy'",
      [orderId, userId],
    );
    if (!order)
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy lệnh mua' });
    if (order.mode !== 'thuc_chien')
      throw new BadRequestException({
        code: 'CAP5_ORDER_NOT_ELIGIBLE',
        message: 'Cấp 5 chỉ ghi nhận lệnh Thực chiến',
      });
    if (new Date(order.created_at) < new Date(progress.entered_at))
      throw new BadRequestException({
        code: 'CAP5_ORDER_BEFORE_ENTRY',
        message: 'Lệnh được tạo trước khi vào Cấp 5',
      });
    const plan = await this.one<OrderPlanRow>('select * from order_kehoach where order_id=$1', [
      orderId,
    ]);
    if (!plan)
      throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Chưa có kế hoạch Cấp 1' });
    if (plan.cap5_entry_snapshot_at) return plan;
    const log = await this.one<HuntLogRow>(
      'select * from cap5_hunt_log where user_id=$1 and upper(symbol)=$2',
      [userId, upper(order.symbol)],
    );
    const hunt = log && new Date(log.first_hunted_at) <= new Date(order.created_at) ? log : null;
    await this.database.query(
      `update order_kehoach set from_watchlist=$1,hunt_filter=$2,hunt_signal_at_entry=$3,hunt_first_hunted_at_entry=$4,cap5_entry_snapshot_at=now() where order_id=$5`,
      [
        Boolean(hunt),
        hunt?.hunt_filter ?? null,
        hunt?.hunt_signal ?? null,
        hunt?.first_hunted_at ?? null,
        orderId,
      ],
    );
    return this.getPlan(userId, orderId);
  }
  async graduate(userId: string) {
    const progress = await this.requireProgress(userId);
    const current = await this.getProgress(userId);
    if (progress.graduated_at) return current;
    if (!current || !progress.task_1_done_at || !progress.task_2_done_at)
      throw new ConflictException({
        code: 'CAP5_NOT_COMPLETE',
        message: 'Chưa hoàn thành đủ 2 nhiệm vụ Cấp 5',
      });
    await this.database.transaction(async (tx) => {
      const locked = (
        await tx.query<Cap5ProgressRow>('select * from cap5_progress where id=$1 for update', [
          progress.id,
        ])
      )[0];
      if (!locked)
        throw new NotFoundException({ code: 'CAP5_NOT_ENTERED', message: 'Chưa vào Cấp 5' });
      if (locked.graduated_at) return;
      if (!locked.task_1_done_at || !locked.task_2_done_at)
        throw new ConflictException({
          code: 'CAP5_NOT_COMPLETE',
          message: 'Chưa hoàn thành đủ 2 nhiệm vụ Cấp 5',
        });
      await tx.query(
        'update cap5_progress set graduated_at=now(), time_to_graduate_hours=extract(epoch from (now()-entered_at))/3600, updated_at=now() where id=$1 and graduated_at is null',
        [progress.id],
      );
    });
    return this.getProgress(userId);
  }
}
