import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../../platform/database/index.js';
import type { Cap1KehoachInput, Cap1KetsoInput } from './cap1.schemas.js';

type ProgressRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  entered_at: Date | string;
  da_xem_tour: boolean;
  task_1_done_at: Date | string | null;
  task_2_done_at: Date | string | null;
  task_3_done_at: Date | string | null;
  task_4_done_at: Date | string | null;
  task_5_done_at: Date | string | null;
  so_ly_do_da_dung: number;
  so_lenh_ly_do_ung_ho: number;
  so_lenh_thuc_chien: number;
  graduated_at: Date | string | null;
};
type OrderRow = Record<string, unknown> & {
  id: string;
  account_id: string;
  user_id: string;
  symbol: string;
  mode: string;
  side: string;
  status: string;
  quantity: number;
  filled_price_vnd: string | number | null;
  net_amount_vnd: string | number | null;
  trading_date: Date | string;
  created_at: Date | string;
  exit_matched_buy_order_id: string | null;
};
type PlanRow = Record<string, unknown> & {
  id: string;
  order_id: string;
  lyDo: string;
  trangThai_luc_dat: string;
  vung_mua: string | number;
  co_bam_doc_chi_tiet: boolean;
  snapshot_lop_du_lieu: Record<string, unknown> | null;
};
type KetsoRow = Record<string, unknown> & {
  id: string;
  order_id: string;
  gia_ra: string | number;
  so_phien_giu: number;
  so_ngay_lich: number;
  pnl_pct: number;
  pnl_vnd: string | number;
  cam_xuc: string | null;
  closed_at: Date | string;
};

function numberValue(value: string | number | null): number {
  return Number(value ?? 0);
}
function planOutput(row: PlanRow): Record<string, unknown> {
  return { ...row, vung_mua: Number(row.vung_mua) };
}
function ketsoOutput(row: KetsoRow): Record<string, unknown> {
  return { ...row, gia_ra: Number(row.gia_ra), pnl_vnd: Number(row.pnl_vnd) };
}
function calendarDays(start: Date | string, end: Date | string): number {
  const from = new Date(`${String(start).slice(0, 10)}T00:00:00Z`).getTime();
  const to = new Date(`${String(end).slice(0, 10)}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}
function tradingSessions(start: Date | string, end: Date | string): number {
  const cursor = new Date(`${String(start).slice(0, 10)}T00:00:00Z`);
  const finish = new Date(`${String(end).slice(0, 10)}T00:00:00Z`);
  let count = 0;
  while (cursor < finish) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (![0, 6].includes(cursor.getUTCDay())) count += 1;
  }
  return count;
}

@Injectable()
export class Cap1Service {
  constructor(private readonly database: DatabaseService) {}

  async getProgress(userId: string): Promise<Record<string, unknown> | null> {
    return this.database.transaction(async (tx) => {
      const rows = await tx.query<ProgressRow>(
        'select * from cap1_progress where user_id = $1 for update',
        [userId],
      );
      if (!rows[0]) return null;
      return this.recompute(tx, userId, rows[0]);
    });
  }

  async enter(userId: string): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      const existing = await tx.query<ProgressRow>(
        'select * from cap1_progress where user_id = $1 for update',
        [userId],
      );
      if (existing[0]) return existing[0];
      const eligibility = await tx.query<{
        cap0_graduated: boolean;
        placed_level: number | null;
        da_xem_tour: boolean | null;
      }>(
        `select (c.graduated_at is not null) as cap0_graduated,
                p.placed_level, p.da_xem_tour
         from (select $1::uuid as user_id) u
         left join cap0_progress c on c.user_id = u.user_id
         left join user_placement p on p.user_id = u.user_id`,
        [userId],
      );
      const gate = eligibility[0]!;
      if (!gate.cap0_graduated && (gate.placed_level ?? 0) < 1) {
        throw new ConflictException('Chưa tốt nghiệp Cấp 0 hoặc chưa được xếp vào Cấp 1');
      }
      const rows = await tx.query<ProgressRow>(
        `insert into cap1_progress
          (id, user_id, entered_at, da_xem_tour, so_ly_do_da_dung,
           so_lenh_ly_do_ung_ho, so_lenh_thuc_chien, created_at, updated_at)
         values ($1, $2, now(), $3, 0, 0, 0, now(), now()) returning *`,
        [randomUUID(), userId, gate.cap0_graduated || Boolean(gate.da_xem_tour)],
      );
      return rows[0]!;
    });
  }

  async markTask(userId: string, taskNo: number): Promise<Record<string, unknown>> {
    if (!Number.isInteger(taskNo) || taskNo < 1 || taskNo > 5) {
      throw new BadRequestException('task_no không hợp lệ');
    }
    const result = await this.getProgress(userId);
    if (!result) throw new NotFoundException('Không tìm thấy tiến trình Cấp 1');
    return result;
  }

  async recordKehoach(userId: string, input: Cap1KehoachInput): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      const progress = await this.requireProgress(tx, userId);
      if (!progress.da_xem_tour)
        throw new ConflictException('Cần xem xong 3 tour sản phẩm trước khi đặt lệnh');
      const order = await this.requireOrder(tx, userId, input.order_id);
      if (order.side !== 'buy') throw new BadRequestException('Kế hoạch chỉ ghi cho lệnh MUA');
      if (order.mode !== 'thuc_chien')
        throw new BadRequestException('Cấp 1 chỉ ghi nhận lệnh Thực chiến');
      if (!['pending', 'filled'].includes(order.status))
        throw new BadRequestException('Chỉ ghi kế hoạch cho lệnh đang chờ hoặc đã khớp');
      const current = await tx.query<PlanRow>('select * from order_kehoach where order_id = $1', [
        input.order_id,
      ]);
      const existing = current[0];
      if (existing) {
        const same =
          existing.lyDo === input.lyDo &&
          existing.trangThai_luc_dat === input.trangThai_luc_dat &&
          Number(existing.vung_mua) === input.vung_mua &&
          existing.co_bam_doc_chi_tiet === input.co_bam_doc_chi_tiet &&
          JSON.stringify(existing.snapshot_lop_du_lieu) === JSON.stringify(input.snapshot ?? null);
        if (!same) throw new ConflictException('Kế hoạch đã được chốt lúc đặt lệnh');
        await this.recompute(tx, userId, progress);
        return planOutput(existing);
      }
      const rows = await tx.query<PlanRow>(
        `insert into order_kehoach
          (id, order_id, "lyDo", "trangThai_luc_dat", vung_mua,
           co_bam_doc_chi_tiet, snapshot_lop_du_lieu, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), now()) returning *`,
        [
          randomUUID(),
          input.order_id,
          input.lyDo,
          input.trangThai_luc_dat,
          input.vung_mua,
          input.co_bam_doc_chi_tiet,
          JSON.stringify(input.snapshot ?? null),
        ],
      );
      await this.recompute(tx, userId, progress);
      return planOutput(rows[0]!);
    });
  }

  async recordKetso(userId: string, input: Cap1KetsoInput): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      const progress = await this.requireProgress(tx, userId);
      const sell = await this.requireOrder(tx, userId, input.order_id);
      if (sell.side !== 'sell') throw new BadRequestException('Kết sổ chỉ ghi cho lệnh BÁN');
      if (sell.status !== 'filled') throw new BadRequestException('Lệnh bán chưa khớp');
      const current = await tx.query<KetsoRow>(
        'select * from order_ketso where order_id = $1 for update',
        [input.order_id],
      );
      const existing = current[0];
      if (existing) {
        if (input.cam_xuc && existing.cam_xuc && existing.cam_xuc !== input.cam_xuc) {
          throw new ConflictException('Cảm xúc Kết sổ đã được chốt');
        }
        if (input.cam_xuc && !existing.cam_xuc) {
          const updated = await tx.query<KetsoRow>(
            'update order_ketso set cam_xuc = $2, updated_at = now() where order_id = $1 returning *',
            [input.order_id, input.cam_xuc],
          );
          await this.recompute(tx, userId, progress);
          return ketsoOutput(updated[0]!);
        }
        return ketsoOutput(existing);
      }
      const buy = await this.findMatchingBuy(tx, sell);
      if (!buy) throw new ConflictException('Không tìm thấy lệnh mua tương ứng để kết sổ');
      const buyNet = numberValue(buy.net_amount_vnd);
      const sellNet = numberValue(sell.net_amount_vnd);
      const pnlVnd = sellNet + buyNet;
      const cost = -buyNet;
      const rows = await tx.query<KetsoRow>(
        `insert into order_ketso
          (id, order_id, gia_ra, so_phien_giu, so_ngay_lich, pnl_pct, pnl_vnd,
           cam_xuc, closed_at, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now(), now()) returning *`,
        [
          randomUUID(),
          input.order_id,
          numberValue(sell.filled_price_vnd),
          tradingSessions(buy.trading_date, sell.trading_date),
          calendarDays(buy.trading_date, sell.trading_date),
          cost ? (pnlVnd / cost) * 100 : 0,
          pnlVnd,
          input.cam_xuc ?? null,
        ],
      );
      await this.recompute(tx, userId, progress);
      return ketsoOutput(rows[0]!);
    });
  }

  async listTrades(userId: string): Promise<{ trades: Record<string, unknown>[]; total: number }> {
    const rows = await this.database.query<
      Record<string, unknown> & {
        gia_vao: string | number | null;
        gia_ra: string | number;
        pnl_vnd: string | number;
        vung_mua: string | number;
        buy_order_id: string;
        sell_order_id: string;
      }
    >(
      `select b.id as buy_order_id, s.id as sell_order_id,
              case when s.exit_matched_buy_order_id is not null then 'snapshot' else 'symbol_fallback' end as matched_by,
              s.symbol, s.quantity, b.created_at as bought_at, k.closed_at,
              b.filled_price_vnd as gia_vao, k.gia_ra, k.pnl_pct, k.pnl_vnd,
              p."lyDo", p."trangThai_luc_dat", p.vung_mua, k.cam_xuc,
              p.phuong_phap_sl_tp, p.cat_lo, p.chot_loi,
              k."cham_SL_cuoi_phien", k."cham_SL_cat_dung_phien_ke", k."cham_SL_khong_cat",
              k."giu_cham_SL_bao_nhieu_phien", k."cham_TP_giu_lam_hut",
              k.ban_som_khi_lo_nhe, k.nhoi_lenh_khi_lo, k.ghi_chu_nhin_lai,
              p.khau_vi, p.muc_tu_tin, p.cach_khoi_luong, p.khoi_luong, p.pct_von
       from order_ketso k join virtual_orders s on s.id = k.order_id
       join lateral (select b.* from virtual_orders b
          where b.id = s.exit_matched_buy_order_id or
            (s.exit_matched_buy_order_id is null and b.account_id = s.account_id
             and b.symbol = s.symbol and b.side = 'buy' and b.status = 'filled'
             and b.created_at <= s.created_at)
          order by (b.id = s.exit_matched_buy_order_id) desc, b.created_at desc limit 1) b on true
       join order_kehoach p on p.order_id = b.id
       where s.user_id = $1 and s.side = 'sell'
       order by k.closed_at desc limit 500`,
      [userId],
    );
    const trades = rows.map((row) => ({
      ...row,
      gia_vao: row.gia_vao === null ? null : Number(row.gia_vao),
      gia_ra: Number(row.gia_ra),
      pnl_vnd: Number(row.pnl_vnd),
      vung_mua: Number(row.vung_mua),
    }));
    return { trades, total: trades.length };
  }

  async graduate(userId: string): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      const progress = await this.requireProgress(tx, userId);
      const updatedProgress = await this.recompute(tx, userId, progress);
      if ([1, 2, 3, 4, 5].some((task) => !updatedProgress[`task_${task}_done_at`])) {
        throw new ConflictException('Chưa hoàn thành đủ 5 nhiệm vụ Cấp 1');
      }
      const rows = await tx.query<ProgressRow>(
        `update cap1_progress set graduated_at = coalesce(graduated_at, now()),
           time_to_graduate_hours = coalesce(time_to_graduate_hours,
             extract(epoch from (now() - entered_at)) / 3600.0), updated_at = now()
         where user_id = $1 returning *`,
        [userId],
      );
      return rows[0]!;
    });
  }

  private async requireProgress(tx: SqlClient, userId: string): Promise<ProgressRow> {
    const rows = await tx.query<ProgressRow>(
      'select * from cap1_progress where user_id = $1 for update',
      [userId],
    );
    if (!rows[0]) throw new NotFoundException('Không tìm thấy tiến trình Cấp 1');
    return rows[0];
  }

  private async requireOrder(tx: SqlClient, userId: string, orderId: string): Promise<OrderRow> {
    const rows = await tx.query<OrderRow>(
      'select * from virtual_orders where id = $1 and user_id = $2',
      [orderId, userId],
    );
    if (!rows[0]) throw new NotFoundException('Không tìm thấy lệnh');
    return rows[0];
  }

  private async findMatchingBuy(tx: SqlClient, sell: OrderRow): Promise<OrderRow | null> {
    const rows = sell.exit_matched_buy_order_id
      ? await tx.query<OrderRow>('select * from virtual_orders where id = $1 and user_id = $2', [
          sell.exit_matched_buy_order_id,
          sell.user_id,
        ])
      : await tx.query<OrderRow>(
          `select * from virtual_orders where account_id = $1 and symbol = $2 and side = 'buy'
         and status = 'filled' and created_at <= $3 order by created_at desc limit 1`,
          [sell.account_id, sell.symbol, sell.created_at],
        );
    return rows[0] ?? null;
  }

  private async recompute(
    tx: SqlClient,
    userId: string,
    progress: ProgressRow,
  ): Promise<ProgressRow> {
    const counts = await tx.query<{
      reasons: string | number;
      supported: string | number;
      total: string | number;
      closeouts: string | number;
    }>(
      `select count(distinct p."lyDo") as reasons,
              count(*) filter (where p."trangThai_luc_dat" = 'ung_ho') as supported,
              count(*) as total,
              (select count(*) from order_ketso k join virtual_orders s on s.id = k.order_id
               where s.user_id = $1 and s.mode = 'thuc_chien' and s.status = 'filled'
                 and k.closed_at >= $2) as closeouts
       from order_kehoach p join virtual_orders o on o.id = p.order_id
       where o.user_id = $1 and o.mode = 'thuc_chien' and o.side = 'buy' and o.status = 'filled'`,
      [userId, progress.entered_at],
    );
    const count = counts[0]!;
    const reasons = Math.max(progress.so_ly_do_da_dung, Number(count.reasons));
    const supported = Math.max(progress.so_lenh_ly_do_ung_ho, Number(count.supported));
    const total = Math.max(progress.so_lenh_thuc_chien, Number(count.total));
    const rows = await tx.query<ProgressRow>(
      `update cap1_progress set
         so_ly_do_da_dung = $2, so_lenh_ly_do_ung_ho = $3, so_lenh_thuc_chien = $4,
         task_1_done_at = case when $4 >= 1 then coalesce(task_1_done_at, now()) else task_1_done_at end,
         task_2_done_at = case when $5 >= 1 then coalesce(task_2_done_at, now()) else task_2_done_at end,
         task_3_done_at = case when $2 >= 5 then coalesce(task_3_done_at, now()) else task_3_done_at end,
         task_4_done_at = case when $3 >= 3 then coalesce(task_4_done_at, now()) else task_4_done_at end,
         task_5_done_at = case when $4 >= 10 then coalesce(task_5_done_at, now()) else task_5_done_at end,
         updated_at = now() where user_id = $1 returning *`,
      [userId, reasons, supported, total, Number(count.closeouts)],
    );
    return rows[0]!;
  }
}
