import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService, type SqlClient } from '../../../platform/database/index.js';
import type { AlertActionInput, PreBuyInput } from './cap2.schemas.js';

const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
type Event = Record<string, unknown> & {
  id: string;
  user_id: string;
  alert_type: string;
  symbol: string;
  session_date: string;
  observed_price_vnd: string | number;
  threshold_price_vnd: string | number | null;
  loss_pct: number | null;
  status: string;
  escalation: string | null;
  impression_count: number;
  action: string | null;
  acted_at: Date | string | null;
  intended_quantity: number | null;
  intended_order_type: string | null;
  intended_limit_price_vnd: string | number | null;
  violation_confirmed_at: Date | string | null;
  breach_session_no: number;
  suppression_reason: string | null;
  plan_started_at: Date | string | null;
  position_quantity: number | null;
  position_avg_cost_vnd: string | number | null;
  official_close_session_date: string | null;
  first_shown_at: Date | string | null;
  last_shown_at: Date | string | null;
};
function out(row: Event) {
  return {
    ...row,
    observed_price_vnd: Number(row.observed_price_vnd),
    threshold_price_vnd: row.threshold_price_vnd == null ? null : Number(row.threshold_price_vnd),
    position_avg_cost_vnd:
      row.position_avg_cost_vnd == null ? null : Number(row.position_avg_cost_vnd),
    intended_limit_price_vnd:
      row.intended_limit_price_vnd == null ? null : Number(row.intended_limit_price_vnd),
  };
}

@Injectable()
export class Cap2AlertsService {
  constructor(private readonly database: DatabaseService) {}

  async preBuy(userId: string, input: PreBuyInput) {
    return this.database.transaction(async (tx) => {
      const day = today(),
        trigger = `prebuy:${input.idempotency_key}`;
      const previous = await tx.query<Event>(
        "select * from cap2_alert_events where user_id=$1 and alert_type='nhoi_lenh' and trigger_key=$2",
        [userId, trigger],
      );
      if (previous[0]) {
        if (
          previous[0].symbol !== input.symbol ||
          previous[0].intended_quantity !== input.quantity ||
          previous[0].intended_order_type !== input.order_type ||
          Number(previous[0].intended_limit_price_vnd ?? 0) !== Number(input.limit_price_vnd ?? 0)
        )
          throw new ConflictException('Khóa idempotency đã dùng cho nội dung khác');
        return {
          data_status: 'available',
          triggered: true,
          reason: 'Kết quả kiểm tra đã được ghi nhận trước đó.',
          alert: out(previous[0]),
        };
      }
      const positions = await tx.query<{
        quantity_total: number;
        avg_cost_vnd: string | number;
        active_plan_buy_order_id: string | null;
      }>(
        `select p.quantity_total,p.avg_cost_vnd,p.active_plan_buy_order_id from virtual_positions p join virtual_trading_accounts a on a.id=p.account_id where a.user_id=$1 and p.symbol=$2`,
        [userId, input.symbol],
      );
      const position = positions[0];
      if (!position || position.quantity_total <= 0 || Number(position.avg_cost_vnd) <= 0)
        return {
          data_status: 'available',
          triggered: false,
          reason: 'Không có vị thế đang mở cùng mã.',
          alert: null,
        };
      const quotes = await tx.query<{ current_price_vnd: string | number }>(
        'select current_price_vnd from symbols where symbol=$1 and is_active=true limit 1',
        [input.symbol],
      );
      const price = Number(quotes[0]?.current_price_vnd ?? 0);
      if (price <= 0)
        return {
          data_status: 'unavailable',
          triggered: false,
          reason: 'Không lấy được giá hiện tại; không tạo cảnh báo nhồi lệnh.',
          alert: null,
        };
      const loss = ((price - Number(position.avg_cost_vnd)) / Number(position.avg_cost_vnd)) * 100;
      if (loss >= -3)
        return {
          data_status: 'available',
          triggered: false,
          reason: 'Vị thế chưa lỗ quá 3%.',
          alert: null,
        };
      const rows = await tx.query<Event>(
        `insert into cap2_alert_events(id,user_id,alert_type,symbol,session_date,trigger_key,observed_price_vnd,threshold_price_vnd,loss_pct,source_plan_order_id,position_quantity,position_avg_cost_vnd,intended_quantity,intended_order_type,intended_limit_price_vnd,status,impression_count,breach_session_no,created_at,updated_at) values($1,$2,'nhoi_lenh',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',0,1,now(),now()) returning *`,
        [
          randomUUID(),
          userId,
          input.symbol,
          day,
          trigger,
          price,
          position.avg_cost_vnd,
          loss,
          position.active_plan_buy_order_id,
          position.quantity_total,
          position.avg_cost_vnd,
          input.quantity,
          input.order_type,
          input.limit_price_vnd ?? null,
        ],
      );
      const event = rows[0]!;
      await this.present(tx, userId, day);
      const refreshed = await tx.query<Event>('select * from cap2_alert_events where id=$1', [
        event.id,
      ]);
      return {
        data_status: 'available',
        triggered: true,
        reason: 'Vị thế cùng mã đang lỗ quá 3%.',
        alert: out(refreshed[0] ?? event),
      };
    });
  }

  async active(userId: string, sessionDate: string = today()) {
    return this.database.transaction(async (tx) => ({
      session_date: sessionDate,
      alerts: (await this.present(tx, userId, sessionDate)).map(out),
    }));
  }
  async claim(userId: string, alertId: string) {
    const result = await this.active(userId);
    const alert = result.alerts.find((item) => item.id === alertId);
    if (!alert) throw new NotFoundException('Không tìm thấy cảnh báo hoặc đã hết quota');
    return { alert, claimed: true };
  }
  async check(userId: string, alertId: string) {
    const rows = await this.database.query<Event>(
      'select * from cap2_alert_events where id=$1 and user_id=$2 limit 1',
      [alertId, userId],
    );
    if (!rows[0]) throw new NotFoundException('Không tìm thấy cảnh báo');
    return {
      alert: out(rows[0]),
      eligible: rows[0].acted_at === null && rows[0].status !== 'suppressed',
    };
  }

  async act(userId: string, alertId: string, input: AlertActionInput) {
    return this.database.transaction(async (tx) => {
      const rows = await tx.query<Event>(
        'select * from cap2_alert_events where id=$1 and user_id=$2 for update',
        [alertId, userId],
      );
      const event = rows[0];
      if (!event) throw new NotFoundException('Không tìm thấy cảnh báo Cấp 2');
      let action = input.action;
      if (action === 'dismiss')
        action = event.alert_type === 'nhoi_lenh' ? 'cancel_buy' : 'sell_ato';
      if (action === 'snooze') action = event.alert_type === 'nhoi_lenh' ? 'proceed_buy' : 'hold';
      const allowed =
        event.alert_type === 'nhoi_lenh' ? ['cancel_buy', 'proceed_buy'] : ['sell_ato', 'hold'];
      if (!allowed.includes(action))
        throw new BadRequestException('Hành động không hợp lệ với loại cảnh báo');
      if (event.acted_at) {
        if (event.action !== action) throw new ConflictException('Cảnh báo đã được xử lý');
        return {
          alert: out(event),
          next_step: action === 'sell_ato' ? 'confirm_ato_sell' : 'none',
        };
      }
      if (event.status === 'pending') throw new ConflictException('Cảnh báo chưa được hiển thị');
      if (
        action === 'proceed_buy' &&
        event.escalation === 'type_phrase' &&
        input.confirmation_phrase !== 'Tôi hiểu'
      )
        throw new BadRequestException('Vui lòng nhập đúng "Tôi hiểu" để tiếp tục');
      const updated = await tx.query<Event>(
        "update cap2_alert_events set action=$3,acted_at=now(),status='acted',updated_at=now() where id=$1 and user_id=$2 returning *",
        [alertId, userId, action],
      );
      return {
        alert: out(updated[0]!),
        next_step: action === 'sell_ato' ? 'confirm_ato_sell' : 'none',
      };
    });
  }

  private async present(tx: SqlClient, userId: string, sessionDate: string): Promise<Event[]> {
    const quota = await tx.query<{ id: string; important_shown_count: number }>(
      `insert into cap2_alert_session_state(id,user_id,session_date,important_shown_count,created_at,updated_at) values($1,$2,$3,0,now(),now()) on conflict(user_id,session_date) do update set updated_at=now() returning *`,
      [randomUUID(), userId, sessionDate],
    );
    const count = quota[0]?.important_shown_count ?? 0;
    const candidates = await tx.query<Event>(
      `select * from cap2_alert_events where user_id=$1 and acted_at is null and ((alert_type='nhoi_lenh' and session_date=$2 and status='pending') or (alert_type='cham_cat_lo' and session_date<=$2)) order by case when alert_type='nhoi_lenh' then 0 else 1 end,created_at asc for update`,
      [userId, sessionDate],
    );
    const result: Event[] = [];
    let used = count;
    for (const event of candidates) {
      if (used >= 2) {
        await tx.query(
          "update cap2_alert_events set status='suppressed',suppression_reason='session_limit',updated_at=now() where id=$1",
          [event.id],
        );
        continue;
      }
      const seen = await tx.query<{ id: string }>(
        'select id from cap2_alert_impressions where event_id=$1 and session_date=$2',
        [event.id, sessionDate],
      );
      if (seen[0]) continue;
      const escalation = event.alert_type === 'nhoi_lenh' ? 'normal' : 'normal';
      await tx.query(
        `insert into cap2_alert_impressions(id,event_id,user_id,session_date,escalation,shown_at,created_at,updated_at) values($1,$2,$3,$4,$5,now(),now(),now()) on conflict(event_id,session_date) do nothing`,
        [randomUUID(), event.id, userId, sessionDate, escalation],
      );
      const updated = await tx.query<Event>(
        `update cap2_alert_events set status='shown',escalation=$2,impression_count=impression_count+1,first_shown_at=coalesce(first_shown_at,now()),last_shown_at=now(),suppression_reason=null,updated_at=now() where id=$1 returning *`,
        [event.id, escalation],
      );
      await tx.query(
        'update cap2_alert_session_state set important_shown_count=important_shown_count+1,updated_at=now() where user_id=$1 and session_date=$2',
        [userId, sessionDate],
      );
      used++;
      if (updated[0]) result.push(updated[0]);
    }
    return result;
  }
}
