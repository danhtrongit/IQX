import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService, type SqlClient } from '../../../platform/database/index.js';
import { Cap1Service } from '../cap1/index.js';
import type { Cap2KehoachInput, Cap2KetsoInput } from './cap2.schemas.js';

type Progress = Record<string, unknown> & {
  id: string;
  user_id: string;
  entered_at: Date | string;
  task_1_done_at: Date | string | null;
  so_lenh_co_cl_tp: number;
  so_lan_cat_lo_dung: number;
  so_lan_chot_loi_dung: number;
  so_lan_thuc_hien_dung: number;
  chuoi_current: number;
  chuoi_record: number;
  last_chuoi_reset_at: Date | string | null;
  graduated_at: Date | string | null;
};
type Plan = Record<string, unknown> & {
  id: string;
  order_id: string;
  vung_mua: string | number;
  phuong_phap_sl_tp: string | null;
  cat_lo: string | number | null;
  chot_loi: string | number | null;
};
type Closeout = Record<string, unknown> & {
  id: string;
  order_id: string;
  gia_ra: string | number;
  pnl_pct: number;
  pnl_vnd: string | number;
  closed_at: Date | string;
  cham_SL_cuoi_phien: boolean;
  cham_SL_cat_dung_phien_ke: boolean;
  cham_SL_khong_cat: boolean;
  giu_cham_SL_bao_nhieu_phien: number | null;
  cham_TP_giu_lam_hut: boolean;
  ban_som_khi_lo_nhe: boolean;
  nhoi_lenh_khi_lo: boolean;
  ghi_chu_nhin_lai: string | null;
  chot_loi: string | number | null;
};

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function vnToday(): string {
  return dayString(new Date(Date.now() + 7 * 3_600_000));
}
function daysBefore(day: string, amount: number): string {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - amount);
  return dayString(value);
}
function planOut(row: Plan) {
  return {
    id: row.id,
    order_id: row.order_id,
    vung_mua: Number(row.vung_mua),
    phuong_phap_sl_tp: row.phuong_phap_sl_tp,
    cat_lo: row.cat_lo === null ? null : Number(row.cat_lo),
    chot_loi: row.chot_loi === null ? null : Number(row.chot_loi),
  };
}
function closeoutOut(row: Closeout) {
  const { chot_loi: _chotLoi, ...rest } = row;
  return { ...rest, gia_ra: Number(row.gia_ra), pnl_vnd: Number(row.pnl_vnd) };
}

@Injectable()
export class Cap2Service {
  constructor(
    private readonly database: DatabaseService,
    private readonly cap1: Cap1Service,
  ) {}

  async getProgress(userId: string): Promise<Record<string, unknown> | null> {
    return this.database.transaction(async (tx) => {
      const rows = await tx.query<Progress>(
        'select * from cap2_progress where user_id = $1 for update',
        [userId],
      );
      return rows[0] ? this.recompute(tx, userId, rows[0]) : null;
    });
  }

  async enter(userId: string): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      const current = await tx.query<Progress>(
        'select * from cap2_progress where user_id = $1 for update',
        [userId],
      );
      if (current[0]) return current[0];
      const gates = await tx.query<{
        cap1_id: string | null;
        graduated_at: Date | string | null;
        placed_level: number | null;
        da_xem_tour: boolean | null;
      }>(
        `select c.id as cap1_id, c.graduated_at, p.placed_level, p.da_xem_tour
         from (select $1::uuid as user_id) u left join cap1_progress c on c.user_id = u.user_id
         left join user_placement p on p.user_id = u.user_id`,
        [userId],
      );
      const gate = gates[0]!;
      if (!gate.graduated_at && (gate.placed_level ?? 0) < 2)
        throw new ConflictException('Chưa tốt nghiệp Cấp 1');
      if (!gate.graduated_at && (gate.placed_level ?? 0) >= 2) {
        await tx.query(
          `insert into cap1_progress
           (id, user_id, entered_at, da_xem_tour, task_1_done_at, task_2_done_at,
            task_3_done_at, task_4_done_at, task_5_done_at, so_ly_do_da_dung,
            so_lenh_ly_do_ung_ho, so_lenh_thuc_chien, graduated_at,
            time_to_graduate_hours, created_at, updated_at)
           values ($1,$2,now(),$3,now(),now(),now(),now(),now(),5,3,10,now(),0,now(),now())
           on conflict (user_id) do update set graduated_at=coalesce(cap1_progress.graduated_at,now()),
             task_1_done_at=coalesce(cap1_progress.task_1_done_at,now()), task_2_done_at=coalesce(cap1_progress.task_2_done_at,now()),
             task_3_done_at=coalesce(cap1_progress.task_3_done_at,now()), task_4_done_at=coalesce(cap1_progress.task_4_done_at,now()),
             task_5_done_at=coalesce(cap1_progress.task_5_done_at,now()), so_ly_do_da_dung=greatest(cap1_progress.so_ly_do_da_dung,5),
             so_lenh_ly_do_ung_ho=greatest(cap1_progress.so_lenh_ly_do_ung_ho,3), so_lenh_thuc_chien=greatest(cap1_progress.so_lenh_thuc_chien,10), updated_at=now()`,
          [randomUUID(), userId, Boolean(gate.da_xem_tour)],
        );
      }
      const rows = await tx.query<Progress>(
        `insert into cap2_progress
          (id,user_id,entered_at,so_lenh_co_cl_tp,so_lan_cat_lo_dung,
           so_lan_chot_loi_dung,so_lan_thuc_hien_dung,chuoi_current,chuoi_record,
           created_at,updated_at) values ($1,$2,now(),0,0,0,0,0,0,now(),now()) returning *`,
        [randomUUID(), userId],
      );
      return { ...rows[0]!, so_lenh_7_ngay: 0 };
    });
  }

  async markTask(userId: string, taskNo: number): Promise<Record<string, unknown>> {
    if (taskNo !== 1) throw new BadRequestException('task_no không hợp lệ');
    const progress = await this.getProgress(userId);
    if (!progress) throw new NotFoundException('Không tìm thấy tiến trình Cấp 2');
    return progress;
  }

  async recordKehoach(userId: string, input: Cap2KehoachInput): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      const progress = await this.requireProgress(tx, userId);
      const orders = await tx.query<{
        side: string;
        mode: string;
        status: string;
        created_at: Date | string;
      }>('select side, mode, status, created_at from virtual_orders where id=$1 and user_id=$2', [
        input.order_id,
        userId,
      ]);
      const order = orders[0];
      if (!order) throw new NotFoundException('Không tìm thấy lệnh');
      if (order.side !== 'buy')
        throw new BadRequestException('Cắt lỗ/Chốt lời chỉ ghi cho lệnh MUA');
      if (order.mode !== 'thuc_chien')
        throw new BadRequestException('Cấp 2 chỉ ghi nhận lệnh Thực chiến');
      if (!['pending', 'filled'].includes(order.status))
        throw new BadRequestException('Chỉ ghi kế hoạch cho lệnh đang chờ hoặc đã khớp');
      if (new Date(order.created_at).getTime() + 999 < new Date(progress.entered_at).getTime())
        throw new BadRequestException('Lệnh được tạo trước khi vào Cấp 2');
      const plans = await tx.query<Plan>(
        'select * from order_kehoach where order_id=$1 for update',
        [input.order_id],
      );
      const plan = plans[0];
      if (!plan) throw new NotFoundException('Cần ghi kế hoạch Cấp 1 trước');
      if (plan.phuong_phap_sl_tp !== null || plan.cat_lo !== null || plan.chot_loi !== null) {
        if (
          plan.phuong_phap_sl_tp !== input.phuong_phap_sl_tp ||
          Number(plan.cat_lo) !== input.cat_lo ||
          Number(plan.chot_loi) !== input.chot_loi
        )
          throw new ConflictException('Kế hoạch cắt lỗ/chốt lời đã được chốt lúc đặt lệnh');
        await this.recompute(tx, userId, progress);
        return planOut(plan);
      }
      const updated = await tx.query<Plan>(
        `update order_kehoach set phuong_phap_sl_tp=$2,cat_lo=$3,chot_loi=$4,updated_at=now()
         where order_id=$1 returning *`,
        [input.order_id, input.phuong_phap_sl_tp, input.cat_lo, input.chot_loi],
      );
      await this.recompute(tx, userId, progress);
      return planOut(updated[0]!);
    });
  }

  async recordKetso(userId: string, input: Cap2KetsoInput): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      const progress = await this.requireProgress(tx, userId);
      const orders = await tx.query<{ side: string }>(
        'select side from virtual_orders where id=$1 and user_id=$2',
        [input.order_id, userId],
      );
      if (!orders[0]) throw new NotFoundException('Không tìm thấy lệnh');
      if (orders[0].side !== 'sell')
        throw new BadRequestException('Đo kỷ luật chỉ ghi cho lệnh BÁN');
      const rows = await tx.query<Closeout>(
        "select k.*, p.chot_loi from order_ketso k left join virtual_orders s on s.id=k.order_id left join lateral (select p.* from order_kehoach p join virtual_orders b on b.id=p.order_id where b.id=s.exit_matched_buy_order_id or (s.exit_matched_buy_order_id is null and b.account_id=s.account_id and b.symbol=s.symbol and b.side='buy' and b.created_at<=s.created_at) order by b.created_at desc limit 1) p on true where k.order_id=$1 for update of k",
        [input.order_id],
      );
      if (!rows[0]) throw new NotFoundException('Cần kết sổ Cấp 1 trước');
      const row = rows[0];
      const held = await tx.query<{ sessions: string | number }>(
        `select coalesce(max(breach_session_no),0) sessions from cap2_alert_events
         where user_id=$1 and alert_type='cham_cat_lo' and action='hold' and acted_at is not null
           and source_plan_order_id=(select coalesce(s.exit_matched_buy_order_id,p.order_id) from virtual_orders s left join lateral
             (select b.id as order_id from virtual_orders b where b.account_id=s.account_id and b.symbol=s.symbol and b.side='buy' and b.created_at<=s.created_at order by b.created_at desc limit 1) p on true where s.id=$2)`,
        [userId, input.order_id],
      );
      const heldSessions = Number(held[0]?.sessions ?? 0);
      const updated = await tx.query<Closeout>(
        `update order_ketso set
          "cham_SL_cuoi_phien"="cham_SL_cuoi_phien" or $2 or $10>0,
          "cham_SL_cat_dung_phien_ke"="cham_SL_cat_dung_phien_ke" or $3,
          "cham_SL_khong_cat"="cham_SL_khong_cat" or $4 or $10>0,
          "giu_cham_SL_bao_nhieu_phien"=greatest(coalesce("giu_cham_SL_bao_nhieu_phien",0),coalesce($5,0),$10),
          "cham_TP_giu_lam_hut"="cham_TP_giu_lam_hut" or $6,
          ban_som_khi_lo_nhe=ban_som_khi_lo_nhe or $7,
          nhoi_lenh_khi_lo=nhoi_lenh_khi_lo or $8 or exists(select 1 from cap2_alert_events e where e.user_id=$1 and e.alert_type='nhoi_lenh' and e.action='proceed_buy' and e.violation_confirmed_at is not null),
          ghi_chu_nhin_lai=case when nullif(trim($9),'') is not null then left(trim($9),2000) else ghi_chu_nhin_lai end,
          updated_at=now() where order_id=$11 returning *`,
        [
          userId,
          input.cham_SL_cuoi_phien,
          input.cham_SL_cat_dung_phien_ke,
          input.cham_SL_khong_cat,
          input.giu_cham_SL_bao_nhieu_phien ?? null,
          input.cham_TP_giu_lam_hut,
          input.ban_som_khi_lo_nhe,
          input.nhoi_lenh_khi_lo,
          input.ghi_chu_nhin_lai ?? null,
          heldSessions,
          input.order_id,
        ],
      );
      await this.recompute(tx, userId, progress);
      return closeoutOut({ ...updated[0]!, chot_loi: row.chot_loi });
    });
  }

  async score(userId: string, targetDay = vnToday()): Promise<Record<string, unknown>> {
    const progress = await this.database.query<{ id: string }>(
      'select id from cap2_progress where user_id=$1',
      [userId],
    );
    if (!progress[0]) throw new NotFoundException('Không tìm thấy tiến trình Cấp 2');
    const plans = await this.database.query<{
      phuong_phap_sl_tp: string | null;
      cat_lo: string | number | null;
      chot_loi: string | number | null;
    }>(
      `select p.phuong_phap_sl_tp,p.cat_lo,p.chot_loi from order_kehoach p join virtual_orders o on o.id=p.order_id where o.user_id=$1 and o.mode='thuc_chien' and o.trading_date=$2`,
      [userId, targetDay],
    );
    const closes = await this.database.query<Closeout>(
      `select k.*,p.chot_loi from order_ketso k join virtual_orders s on s.id=k.order_id left join lateral (select p.* from order_kehoach p join virtual_orders b on b.id=p.order_id where b.id=s.exit_matched_buy_order_id or (s.exit_matched_buy_order_id is null and b.account_id=s.account_id and b.symbol=s.symbol and b.side='buy' and b.created_at<=s.created_at) order by b.created_at desc limit 1) p on true where s.user_id=$1 and s.mode='thuc_chien' and s.trading_date=$2`,
      [userId, targetDay],
    );
    if (!plans.length && !closes.length)
      return {
        ngay: targetDay,
        co_giao_dich: false,
        co_tinh_huong: false,
        diem: null,
        xep_loai: null,
        giai_thich: 'Ngày không đặt lệnh nào — không chấm điểm.',
        thanh_phan: null,
      };
    const complete = plans.length
      ? plans.filter((p) => p.phuong_phap_sl_tp && p.cat_lo !== null && p.chot_loi !== null)
          .length / plans.length
      : 1;
    const keHoach = 40 * complete,
      catLo = Math.min(40, closes.filter((r) => r.cham_SL_cat_dung_phien_ke).length * 20),
      khongNhoi = Math.min(30, closes.filter((r) => !r.nhoi_lenh_khi_lo).length * 10),
      chotLoi = Math.min(
        30,
        closes.filter(
          (r) =>
            r.chot_loi !== null && Number(r.gia_ra) >= Number(r.chot_loi) && !r.cham_TP_giu_lam_hut,
        ).length * 10,
      );
    const parts = {
      ke_hoach: keHoach,
      ke_hoach_toi_da: 40,
      cat_lo_dung: catLo,
      cat_lo_dung_toi_da: 40,
      khong_nhoi: khongNhoi,
      khong_nhoi_toi_da: 30,
      chot_loi_dung: chotLoi,
      chot_loi_dung_toi_da: 30,
    };
    if (!closes.length)
      return {
        ngay: targetDay,
        co_giao_dich: true,
        co_tinh_huong: false,
        diem: keHoach,
        xep_loai: null,
        giai_thich:
          'Ngày không có tình huống thử thách kỷ luật — điểm tính theo phần kế hoạch (tối đa 40).',
        thanh_phan: parts,
      };
    const total = Math.min(100, Math.max(0, keHoach + catLo + khongNhoi + chotLoi));
    const rank = total >= 85 ? 'xanh' : total >= 70 ? 'vang' : 'do';
    return {
      ngay: targetDay,
      co_giao_dich: true,
      co_tinh_huong: true,
      diem: total,
      xep_loai: rank,
      giai_thich: `Kế hoạch ${keHoach.toFixed(0)}/40 + cắt lỗ đúng ${catLo}/40 + không nhồi ${khongNhoi}/30 + chốt lời đúng ${chotLoi}/30.`,
      thanh_phan: parts,
    };
  }

  async scoreHistory(userId: string, fromDate: string, toDate: string) {
    const span =
      (new Date(`${toDate}T00:00:00Z`).getTime() - new Date(`${fromDate}T00:00:00Z`).getTime()) /
      86_400_000;
    if (span < 0) throw new BadRequestException('to_date phải từ from_date trở đi');
    if (span > 90) throw new BadRequestException('Khoảng lịch sử tối đa 90 ngày');
    const scores = [];
    for (let i = 0; i <= span; i++) {
      const day = daysBefore(toDate, span - i);
      const score = await this.score(userId, day);
      if (score.co_giao_dich) scores.push(score);
    }
    return { scores, from_date: fromDate, to_date: toDate };
  }

  async listTrades(userId: string) {
    const progress = await this.database.query<Progress>(
      'select * from cap2_progress where user_id=$1',
      [userId],
    );
    if (!progress[0]) throw new NotFoundException('Không tìm thấy tiến trình Cấp 2');
    const all = await this.cap1.listTrades(userId);
    const entered = new Date(progress[0].entered_at).getTime();
    const trades = all.trades.filter(
      (row) =>
        row.phuong_phap_sl_tp != null && new Date(String(row.closed_at)).getTime() >= entered,
    );
    return { trades, total: trades.length };
  }

  async analysis(userId: string) {
    const today = vnToday(),
      from = daysBefore(today, 29);
    const score30d = await this.scoreHistory(userId, from, today);
    const trades = (await this.listTrades(userId)).trades;
    const violations = (r: Record<string, unknown>) =>
      [
        ['cham_SL_khong_cat', 'cat_lo_cham'],
        ['cham_TP_giu_lam_hut', 'chot_loi_hut'],
        ['ban_som_khi_lo_nhe', 'ban_som_lo_nhe'],
        ['nhoi_lenh_khi_lo', 'nhoi_lenh_khi_lo'],
      ]
        .filter(([key]) => Boolean(r[key!]))
        .map(([, name]) => name!);
    const window20 = trades.slice(0, 20).map((r) => ({
      sell_order_id: r.sell_order_id,
      symbol: r.symbol,
      closed_at: r.closed_at,
      compliant: violations(r).length === 0,
      violations: violations(r),
    }));
    const scored = score30d.scores.filter((r) => r.diem !== null),
      last7 = scored.filter((r) => String(r.ngay) >= daysBefore(today, 6));
    const weekly: Array<{
      week_start: string;
      week_end: string;
      cat_lo_cham: number;
      chot_loi_hut: number;
      ban_som_lo_nhe: number;
      nhoi_lenh_khi_lo: number;
      total: number;
      trend: string | null;
    }> = [];
    const now = new Date(`${today}T00:00:00Z`);
    const mondayOffset = (now.getUTCDay() + 6) % 7;
    const monday = daysBefore(today, mondayOffset);
    for (const weeks of [3, 2, 1, 0]) {
      const start = daysBefore(monday, weeks * 7),
        end = daysBefore(start, -6);
      const counts = { cat_lo_cham: 0, chot_loi_hut: 0, ban_som_lo_nhe: 0, nhoi_lenh_khi_lo: 0 };
      for (const trade of trades) {
        const d = String(trade.closed_at).slice(0, 10);
        if (d >= start && d <= end)
          for (const v of violations(trade)) counts[v as keyof typeof counts]++;
      }
      weekly.push({
        week_start: start,
        week_end: end,
        ...counts,
        total: Object.values(counts).reduce((a, b) => a + b, 0),
        trend: null as string | null,
      });
    }
    weekly.forEach((r, i) => {
      if (i)
        r.trend =
          r.total > weekly[i - 1]!.total
            ? 'tang'
            : r.total < weekly[i - 1]!.total
              ? 'giam'
              : 'on_dinh';
    });
    const violating = trades.filter((r) => violations(r).length),
      notes = violating.filter((r) => String(r.ghi_chu_nhin_lai ?? '').trim());
    return {
      score_30d: {
        scores: score30d.scores,
        average_7d: last7.length
          ? last7.reduce((a, r) => a + Number(r.diem), 0) / last7.length
          : null,
        average_30d: scored.length
          ? scored.reduce((a, r) => a + Number(r.diem), 0) / scored.length
          : null,
        xanh_days: scored.filter((r) => r.xep_loai === 'xanh').length,
        vang_days: scored.filter((r) => r.xep_loai === 'vang').length,
        do_days: scored.filter((r) => r.xep_loai === 'do').length,
      },
      weekly_violations: weekly,
      window20,
      reflection: {
        eligible: notes.length >= 3,
        note_count: notes.length,
        violation_count: violating.length,
        insights: [],
      },
      patterns: [],
    };
  }

  async graduate(userId: string) {
    return this.database.transaction(async (tx) => {
      const p = await this.requireProgress(tx, userId);
      const current = await this.recompute(tx, userId, p);
      if (!current.task_1_done_at) throw new ConflictException('Chưa hoàn thành nhiệm vụ Cấp 2');
      const rows = await tx.query<Progress>(
        `update cap2_progress set graduated_at=coalesce(graduated_at,now()),time_to_graduate_hours=coalesce(time_to_graduate_hours,extract(epoch from(now()-entered_at))/3600.0),updated_at=now() where user_id=$1 returning *`,
        [userId],
      );
      return rows[0]!;
    });
  }

  private async requireProgress(tx: SqlClient, userId: string) {
    const rows = await tx.query<Progress>(
      'select * from cap2_progress where user_id=$1 for update',
      [userId],
    );
    if (!rows[0]) throw new NotFoundException('Không tìm thấy tiến trình Cấp 2');
    return rows[0];
  }
  private async recompute(tx: SqlClient, userId: string, p: Progress): Promise<Progress> {
    const planCount = await tx.query<{ count: string | number }>(
      `select count(*) count from order_kehoach p join virtual_orders o on o.id=p.order_id where o.user_id=$1 and o.mode='thuc_chien' and o.side='buy' and o.status='filled' and p.cat_lo is not null and p.chot_loi is not null`,
      [userId],
    );
    const closes = await tx.query<Closeout>(
      `select k.*,p.chot_loi from order_ketso k join virtual_orders s on s.id=k.order_id left join lateral(select p.* from order_kehoach p join virtual_orders b on b.id=p.order_id where b.id=s.exit_matched_buy_order_id or(s.exit_matched_buy_order_id is null and b.account_id=s.account_id and b.symbol=s.symbol and b.side='buy' and b.created_at<=s.created_at)order by b.created_at desc limit 1)p on true where s.user_id=$1 and s.mode='thuc_chien' and k.closed_at>=$2 and p.phuong_phap_sl_tp is not null order by k.closed_at`,
      [userId, p.entered_at],
    );
    let current = 0,
      record = 0,
      lastReset: Date | string | null = null,
      sl = 0,
      tp = 0;
    for (const row of closes) {
      if (row.cham_SL_cat_dung_phien_ke) sl++;
      else if (
        row.chot_loi !== null &&
        Number(row.gia_ra) >= Number(row.chot_loi) &&
        !row.cham_TP_giu_lam_hut
      )
        tp++;
      if (
        row.cham_SL_khong_cat ||
        row.cham_TP_giu_lam_hut ||
        row.ban_som_khi_lo_nhe ||
        row.nhoi_lenh_khi_lo
      ) {
        current = 0;
        lastReset = row.closed_at;
      } else {
        current++;
        record = Math.max(record, current);
      }
    }
    const count = Math.max(p.so_lenh_co_cl_tp, Number(planCount[0]?.count ?? 0));
    const seven = closes.filter(
      (r) => new Date(r.closed_at).getTime() >= Date.now() - 7 * 86_400_000,
    ).length;
    const rows = await tx.query<Progress>(
      `update cap2_progress set so_lenh_co_cl_tp=$2,so_lan_cat_lo_dung=$3,so_lan_chot_loi_dung=$4,so_lan_thuc_hien_dung=$5,chuoi_current=$6,chuoi_record=greatest(chuoi_record,$7),last_chuoi_reset_at=$8,task_1_done_at=case when $2>=10 then coalesce(task_1_done_at,now())else task_1_done_at end,updated_at=now() where user_id=$1 returning *`,
      [userId, count, sl, tp, sl + tp, current, record, lastReset],
    );
    return { ...rows[0]!, so_lenh_7_ngay: seven };
  }
}
