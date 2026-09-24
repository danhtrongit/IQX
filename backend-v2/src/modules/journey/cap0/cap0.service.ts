import { randomUUID } from 'node:crypto';
import { JourneyEventService } from '../core/journey-event.service.js';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../../platform/database/index.js';
import type { KehoachInput, PlacementInput, TaskInput } from './cap0.schemas.js';

type ProgressRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  entered_at: Date | string;
  virtual_balance_init: string | number;
  task_1_done_at: Date | string | null;
  task_2_done_at: Date | string | null;
  task_3_done_at: Date | string | null;
  task_4_done_at: Date | string | null;
  task_5_done_at: Date | string | null;
  task1_star_clicked: boolean;
  task5_debrief_done: boolean;
  graduated_at: Date | string | null;
  time_to_graduate_hours: number | null;
};
type PlacementRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  experience: 'never' | 'unsure' | 'regular';
  placed_level: number;
  da_xem_tour: boolean;
  tour_bantin_done_at: Date | string | null;
  tour_phantich_done_at: Date | string | null;
  tour_bctc_done_at: Date | string | null;
};
type PlanViewRow = Record<string, unknown> & {
  id: string;
  order_id: string;
  symbol: string;
  mode: string;
  ly_do_doi_thuong: string;
  mua_luc: Date | string;
  ngay_mua: Date | string;
  gia_vao: string | number | null;
  sell_date: Date | string | null;
};

const INITIAL_CASH = 100_000_000;
const REASON_LABELS: Record<string, string> = {
  cong_ty_toi_biet: 'Công ty tôi biết',
  nguoi_quen_gioi_thieu: 'Người quen giới thiệu',
  thay_tren_mang: 'Thấy trên mạng',
  gia_dang_tang: 'Giá đang tăng',
  thu_cho_biet: 'Thử cho biết',
};
const LABEL_REASONS = Object.fromEntries(
  Object.entries(REASON_LABELS).map(([key, label]) => [label, key]),
);

function asNumber(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function progressOutput(row: ProgressRow): Record<string, unknown> {
  return { ...row, virtual_balance_init: Number(row.virtual_balance_init) };
}

function placementOutput(row: PlacementRow): Record<string, unknown> {
  return {
    placed_level: row.placed_level,
    answer: row.experience,
    da_xem_tour: row.da_xem_tour,
  };
}

function tradingSessions(start: Date | string, end: Date | string | null): number | null {
  if (end === null) return null;
  const cursor = new Date(`${String(start).slice(0, 10)}T00:00:00.000Z`);
  const finish = new Date(`${String(end).slice(0, 10)}T00:00:00.000Z`);
  let count = 0;
  while (cursor < finish) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) count += 1;
  }
  return count;
}

@Injectable()
export class Cap0Service {
  constructor(
    private readonly database: DatabaseService,
    private readonly events: JourneyEventService,
  ) {}

  async getProgress(userId: string): Promise<Record<string, unknown> | null> {
    const rows = await this.database.query<ProgressRow>(
      'select * from cap0_progress where user_id = $1 limit 1',
      [userId],
    );
    return rows[0] ? progressOutput(rows[0]) : null;
  }

  async enter(userId: string): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      const rows = await tx.query<ProgressRow>(
        `insert into cap0_progress
          (id, user_id, entered_at, virtual_balance_init, task1_star_clicked,
           task5_debrief_done, created_at, updated_at)
         values ($1, $2, now(), $3, false, false, now(), now())
         on conflict (user_id) do update set updated_at = cap0_progress.updated_at
         returning *`,
        [randomUUID(), userId, INITIAL_CASH],
      );
      await tx.query(
        `insert into virtual_trading_accounts
          (id, user_id, status, initial_cash_vnd, cash_available_vnd,
           cash_reserved_vnd, cash_pending_vnd, activated_at, created_at, updated_at)
         values ($1, $2, 'active', $3, $3, 0, 0, now(), now(), now())
         on conflict (user_id) do nothing`,
        [randomUUID(), userId, INITIAL_CASH],
      );
      const row = rows[0];
      if (!row) throw new ConflictException('Không thể khởi tạo Cấp 0');
      return progressOutput(row);
    });
  }

  async getPlacement(userId: string): Promise<Record<string, unknown> | null> {
    const rows = await this.database.query<PlacementRow>(
      'select * from user_placement where user_id = $1 limit 1',
      [userId],
    );
    return rows[0] ? placementOutput(rows[0]) : null;
  }

  async setPlacement(userId: string, input: PlacementInput): Promise<Record<string, unknown>> {
    const answer = input.answer ?? (input.has_traded_before ? 'regular' : 'never');
    const level = { never: 0, unsure: 1, regular: 2 }[answer];
    const rows = await this.database.query<PlacementRow>(
      `insert into user_placement
        (id, user_id, has_traded_before, experience, placed_level, da_xem_tour,
         created_at, updated_at)
       values ($1, $2, $3, $4, $5, false, now(), now())
       on conflict (user_id) do update set
         has_traded_before = excluded.has_traded_before,
         experience = excluded.experience,
         placed_level = excluded.placed_level,
         updated_at = now()
       returning *`,
      [randomUUID(), userId, answer !== 'never', answer, level],
    );
    const row = rows[0];
    if (!row) throw new ConflictException('Không thể ghi xếp lớp');
    return placementOutput(row);
  }

  async completeTour(
    userId: string,
    tour: 'bantin' | 'phantich' | 'bctc',
    skipped = false,
  ): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      const placementRows = await tx.query<PlacementRow>(
        'select * from user_placement where user_id = $1 for update',
        [userId],
      );
      const placement = placementRows[0];
      if (!placement) throw new NotFoundException('Không tìm thấy kết quả xếp lớp');
      const progressRows = await tx.query<ProgressRow>(
        'select * from cap0_progress where user_id = $1 for update',
        [userId],
      );
      const progress = progressRows[0];
      if (progress && progress.graduated_at === null && progress.task_1_done_at === null) {
        throw new ConflictException('Cần hoàn thành lệnh MUA đầu tiên trước khi xem tour');
      }
      const field = `tour_${tour}_done_at`;
      await tx.query(
        `update user_placement set ${field} = coalesce(${field}, now()), updated_at = now()
         where user_id = $1`,
        [userId],
      );
      const refreshedRows = await tx.query<PlacementRow>(
        `update user_placement set da_xem_tour =
           (tour_bantin_done_at is not null and tour_phantich_done_at is not null and tour_bctc_done_at is not null),
           updated_at = now() where user_id = $1 returning *`,
        [userId],
      );
      const refreshed = refreshedRows[0]!;
      if (progress && progress.graduated_at === null) {
        const task = { phantich: 2, bantin: 3, bctc: 4 }[tour];
        await tx.query(
          `update cap0_progress set task_${task}_done_at = coalesce(task_${task}_done_at, now()),
             updated_at = now() where user_id = $1`,
          [userId],
        );
      }
      await tx.query(
        'update cap1_progress set da_xem_tour = $2, updated_at = now() where user_id = $1',
        [userId, refreshed.da_xem_tour],
      );
      const completed = (['bantin', 'phantich', 'bctc'] as const).filter(
        (item) => refreshed[`tour_${item}_done_at` as keyof PlacementRow] !== null,
      );
      await this.events.recordInTransaction(tx, {
        userId,
        name: placement.placed_level > 0 ? 'cap1_tour_complete' : 'cap0_task_complete',
        fields: {
          tour,
          skipped,
          ...(placement.placed_level > 0
            ? {}
            : { task_id: { phantich: 2, bantin: 3, bctc: 4 }[tour] }),
        },
        dedupKey: `tour:${tour}:${String(refreshed[field as keyof PlacementRow])}`,
      });
      return { da_xem_tour: refreshed.da_xem_tour, completed };
    });
  }

  async completeTask(userId: string, input: TaskInput): Promise<Record<string, unknown>> {
    const required = input.task_no === 1 ? 'star' : input.task_no === 5 ? 'debrief' : null;
    if (required && input.gate !== required) {
      throw new BadRequestException(`Nhiệm vụ ${input.task_no} cần gate="${required}"`);
    }
    return this.database.transaction(async (tx) => {
      const rows = await tx.query<ProgressRow>(
        'select * from cap0_progress where user_id = $1 for update',
        [userId],
      );
      const progress = rows[0];
      if (!progress) throw new NotFoundException('Không tìm thấy tiến trình Cấp 0');
      if ([2, 3, 4, 5].includes(input.task_no) && progress.task_1_done_at === null) {
        throw new ConflictException('Cần hoàn thành lệnh MUA đầu tiên');
      }
      if (input.task_no === 1) await this.requireFirstBuy(tx, userId);
      if (input.task_no === 5) await this.requireCloseout(tx, userId);
      const gateField =
        input.gate === 'star'
          ? ', task1_star_clicked = true'
          : input.gate === 'debrief'
            ? ', task5_debrief_done = true'
            : '';
      const updated = await tx.query<ProgressRow>(
        `update cap0_progress set task_${input.task_no}_done_at = coalesce(task_${input.task_no}_done_at, now())
         ${gateField}, updated_at = now() where user_id = $1 returning *`,
        [userId],
      );
      return progressOutput(updated[0]!);
    });
  }

  async recordKehoach(userId: string, input: KehoachInput): Promise<Record<string, unknown>> {
    const reason = REASON_LABELS[input.ly_do_doi_thuong]
      ? input.ly_do_doi_thuong
      : LABEL_REASONS[input.ly_do_doi_thuong];
    if (!reason) throw new BadRequestException('ly_do_doi_thuong không hợp lệ');
    await this.database.transaction(async (tx) => {
      const progress = await tx.query<{ id: string }>(
        'select id from cap0_progress where user_id = $1',
        [userId],
      );
      if (!progress[0]) throw new NotFoundException('Không tìm thấy tiến trình Cấp 0');
      const orders = await tx.query<{ id: string; side: string }>(
        'select id, side from virtual_orders where id = $1 and user_id = $2',
        [input.order_id, userId],
      );
      if (!orders[0]) throw new NotFoundException('Không tìm thấy lệnh');
      if (orders[0].side !== 'buy')
        throw new BadRequestException('Kế hoạch Cấp 0 chỉ ghi cho lệnh MUA');
      await tx.query(
        `insert into cap0_order_kehoach (id, order_id, ly_do_doi_thuong, created_at, updated_at)
         values ($1, $2, $3, now(), now()) on conflict (order_id) do update set
         ly_do_doi_thuong = excluded.ly_do_doi_thuong, updated_at = now()`,
        [randomUUID(), input.order_id, reason],
      );
    });
    const result = await this.getKehoach(userId, input.order_id);
    if (!result) throw new NotFoundException('Không tìm thấy kế hoạch Cấp 0');
    return result;
  }

  async getKehoach(userId: string, orderId: string): Promise<Record<string, unknown> | null> {
    const rows = await this.database.query<PlanViewRow>(
      `select p.id, p.order_id, o.symbol, o.mode, p.ly_do_doi_thuong,
              o.created_at as mua_luc, o.trading_date as ngay_mua,
              o.filled_price_vnd as gia_vao,
              (select s.trading_date from virtual_orders s
               where s.account_id = o.account_id and s.symbol = o.symbol and s.side = 'sell'
                 and s.status = 'filled' and s.created_at >= o.created_at
               order by s.created_at limit 1) as sell_date
       from cap0_order_kehoach p join virtual_orders o on o.id = p.order_id
       where p.order_id = $1 and o.user_id = $2 limit 1`,
      [orderId, userId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      order_id: row.order_id,
      symbol: row.symbol,
      mode: row.mode,
      ly_do_doi_thuong: row.ly_do_doi_thuong,
      ly_do_label: REASON_LABELS[row.ly_do_doi_thuong],
      mua_luc: row.mua_luc,
      ngay_mua: row.ngay_mua,
      gia_vao: asNumber(row.gia_vao),
      so_phien_giu: tradingSessions(row.ngay_mua, row.sell_date),
    };
  }

  async graduate(userId: string): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      const rows = await tx.query<ProgressRow>(
        'select * from cap0_progress where user_id = $1 for update',
        [userId],
      );
      const row = rows[0];
      if (!row) throw new NotFoundException('Không tìm thấy tiến trình Cấp 0');
      if (
        !row.task_1_done_at ||
        !row.task_5_done_at ||
        !row.task1_star_clicked ||
        !row.task5_debrief_done
      ) {
        throw new ConflictException('Chưa hoàn thành hai nhiệm vụ giao dịch và cổng Cấp 0');
      }
      const updated = await tx.query<ProgressRow>(
        `update cap0_progress set graduated_at = coalesce(graduated_at, now()),
           time_to_graduate_hours = coalesce(time_to_graduate_hours,
             extract(epoch from (now() - entered_at)) / 3600.0), updated_at = now()
         where user_id = $1 returning *`,
        [userId],
      );
      await tx.query(
        `insert into user_placement
          (id, user_id, has_traded_before, experience, placed_level, da_xem_tour, created_at, updated_at)
         values ($1, $2, false, 'never', 0, true, now(), now())
         on conflict (user_id) do update set da_xem_tour = true, updated_at = now()`,
        [randomUUID(), userId],
      );
      return progressOutput(updated[0]!);
    });
  }

  private async requireFirstBuy(tx: SqlClient, userId: string): Promise<void> {
    const rows = await tx.query<{ id: string }>(
      `select p.id from cap0_order_kehoach p join virtual_orders o on o.id = p.order_id
       where o.user_id = $1 and o.side = 'buy' and o.status = 'filled' limit 1`,
      [userId],
    );
    if (!rows[0]) throw new ConflictException('Chưa có lệnh MUA đã khớp kèm kế hoạch Cấp 0');
  }

  private async requireCloseout(tx: SqlClient, userId: string): Promise<void> {
    const rows = await tx.query<{ id: string }>(
      `select s.id from virtual_orders s join virtual_orders b
         on b.account_id = s.account_id and b.symbol = s.symbol and b.created_at <= s.created_at
       join cap0_order_kehoach p on p.order_id = b.id
       where s.user_id = $1 and s.side = 'sell' and s.status = 'filled'
         and b.side = 'buy' and b.status = 'filled' limit 1`,
      [userId],
    );
    if (!rows[0]) throw new ConflictException('Chưa có lệnh BÁN đã khớp để Kết sổ');
  }
}
