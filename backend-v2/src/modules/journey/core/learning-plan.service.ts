import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { SqlClient } from '../../../platform/database/index.js';
import { earliestValidSession } from '../cap5/consensus.js';
import { readConflict } from '../cap6/conflict.js';
import { CoreJourneyService } from './journey-core.service.js';
import {
  JOURNEY_LAYER_KEYS,
  type JourneyLayerAssessment,
  type JourneyLearningPlanInput,
  type JourneyOrderContext,
  type JourneyLevel,
  type PersistedJourneyPlan,
  type TradingLearningPlanPort,
  type ValidatedJourneyPlan,
} from './journey-core.types.js';

type OrderOwnershipRow = {
  id: string;
  account_id: string;
  user_id: string;
  symbol: string;
  mode: string;
  side: string;
  order_type: string;
  status: string;
  quantity: number;
  filled_price_vnd: string | null;
  limit_price_vnd: string | null;
  created_at: Date | string;
};

type NhoiAlertRow = {
  id: string;
  user_id: string;
  alert_type: string;
  symbol: string;
  session_date: Date | string;
  intended_quantity: number | null;
  intended_order_type: string | null;
  intended_limit_price_vnd: string | number | null;
  action: string | null;
  source_order_id: string | null;
  violation_confirmed_at: Date | string | null;
};

const EVERYDAY_REASONS = new Set([
  'cong_ty_toi_biet',
  'nguoi_quen_gioi_thieu',
  'thay_tren_mang',
  'gia_dang_tang',
  'thu_cho_biet',
]);
const LAYERS = new Set<string>(JOURNEY_LAYER_KEYS);
const ENTRY_STATES = new Set(['ung_ho', 'trung_tinh', 'can_chu_y', 'nguoc_chieu']);
const SL_TP_METHODS = new Set(['ho_tro_khang_cu', 'bien_do_dao_dong']);
const RISK_PROFILES = new Set(['than_trong', 'can_bang', 'tan_cong']);
const SIZE_METHODS = new Set(['khau_vi_tu_tin', 'chia_deu']);
const CONFLICT_LEVELS = new Set(['nhe', 'ngai', 'nghiem', 'chua_ro']);
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

@Injectable()
export class LearningPlanService implements TradingLearningPlanPort {
  constructor(private readonly journey: CoreJourneyService) {}

  async getActiveLevel(tx: SqlClient, userId: string): Promise<JourneyLevel | null> {
    return this.journey.getActiveLevel(tx, userId);
  }

  async validateAndPersistBuyPlan(input: {
    tx: SqlClient;
    userId: string;
    orderId: string;
    symbol: string;
    quantity: number;
    referencePriceVnd: bigint;
    level: number;
    plan: JourneyLearningPlanInput & { nhoi_lenh_alert_id?: string | null };
  }): Promise<{ savedLevels: number[]; nhoiLenhAlertLinked: boolean }> {
    await this.materializePlacementProgress(input.tx, input.userId, input.level);
    const level = await this.journey.getActiveLevel(input.tx, input.userId);
    if (level === null || level !== input.level || level < 0 || level > 6) {
      throw new ConflictException({
        code: 'JOURNEY_LEVEL_CHANGED',
        message: 'Cấp hành trình đã thay đổi; vui lòng đặt lại lệnh',
      });
    }
    const nhoiAlertId = input.plan.nhoi_lenh_alert_id ?? null;
    if (nhoiAlertId != null && level < 2) {
      this.invalid('Cảnh báo nhồi lệnh chỉ dùng cho BUY từ Cấp 2');
    }
    const validated = await this.validateForOrder(
      input.tx,
      {
        userId: input.userId,
        orderId: input.orderId,
        side: 'buy',
        quantity: input.quantity,
        referencePriceVnd: input.referencePriceVnd,
      },
      input.plan,
    );
    if (nhoiAlertId != null) {
      await this.validateNhoiAlert(input.tx, {
        userId: input.userId,
        alertId: nhoiAlertId,
        orderId: input.orderId,
        symbol: input.symbol,
      });
    }
    const result = await this.persistForOrder(
      input.tx,
      {
        userId: input.userId,
        orderId: input.orderId,
        side: 'buy',
        quantity: input.quantity,
        referencePriceVnd: input.referencePriceVnd,
      },
      validated,
    );
    const nhoiLenhAlertLinked =
      nhoiAlertId == null
        ? false
        : await this.linkNhoiAlert(input.tx, input.userId, nhoiAlertId, input.orderId);
    return { savedLevels: result.savedLevels, nhoiLenhAlertLinked };
  }

  async onBuyOrderFilled(input: {
    tx: SqlClient;
    userId: string;
    orderId: string;
    symbol: string;
  }): Promise<void> {
    const [order] = await input.tx.query<
      Pick<OrderOwnershipRow, 'id' | 'account_id' | 'user_id' | 'symbol' | 'side' | 'status'>
    >(
      `select id, account_id, user_id, symbol, side, status
       from virtual_orders where id=$1 and user_id=$2 limit 1 for update`,
      [input.orderId, input.userId],
    );
    if (
      !order ||
      order.side !== 'buy' ||
      order.status !== 'filled' ||
      order.symbol.toUpperCase() !== input.symbol.toUpperCase()
    ) {
      return;
    }

    const [plan] = await input.tx.query<{ cat_lo: string | null; chot_loi: string | null }>(
      'select cat_lo::text, chot_loi::text from order_kehoach where order_id=$1 limit 1',
      [input.orderId],
    );
    if (plan?.cat_lo != null && plan.chot_loi != null) {
      const activated = await input.tx.query<{ id: string }>(
        `update virtual_positions
         set active_plan_buy_order_id=$1,
             active_original_stop_vnd=$2,
             active_original_take_profit_vnd=$3,
             active_dynamic_stop_vnd=null,
             active_dynamic_stop_set_at=null,
             updated_at=now()
         where account_id=$4 and symbol=$5
         returning id`,
        [input.orderId, plan.cat_lo, plan.chot_loi, order.account_id, order.symbol],
      );
      if (!activated[0]) {
        throw new ConflictException({
          code: 'BUY_PLAN_POSITION_MISSING',
          message: 'Không tìm thấy vị thế để kích hoạt kế hoạch MUA',
        });
      }
    }
    await this.confirmNhoiOrderFilled(input.tx, input.userId, input.orderId);
  }

  async validateForOrder(
    tx: SqlClient,
    context: JourneyOrderContext,
    plan: JourneyLearningPlanInput | null | undefined,
  ): Promise<ValidatedJourneyPlan | null> {
    const order = await this.requireOwnedOrder(tx, context, false);
    if (order.side === 'sell') {
      if (plan != null) this.invalid('journey_plan chỉ dùng cho lệnh MUA');
      return null;
    }

    const level = await this.journey.getActiveLevel(tx, context.userId);
    if (level === null) {
      if (plan != null) this.invalid('Chưa bắt đầu hành trình học');
      return null;
    }
    if (!plan) this.invalid('Lệnh MUA trong hành trình cần journey_plan');

    const normalized = normalizePlan(plan);
    this.validateCumulative(level, normalized, context, order);
    return Object.freeze({ level, input: Object.freeze(normalized) });
  }

  async persistForOrder(
    tx: SqlClient,
    context: JourneyOrderContext,
    validated: ValidatedJourneyPlan | null,
  ): Promise<{ savedLevels: JourneyLevel[] }> {
    const order = await this.requireOwnedOrder(tx, context, true);
    if (!validated) return { savedLevels: [] };
    if (order.side !== 'buy' || !['pending', 'filled'].includes(order.status)) {
      throw new ConflictException({
        code: 'JOURNEY_PLAN_ORDER_STATE_INVALID',
        message: 'Chỉ lưu kế hoạch cho lệnh MUA hợp lệ',
      });
    }
    const current = await this.journey.getActiveLevel(tx, context.userId);
    if (current !== validated.level) {
      throw new ConflictException({
        code: 'JOURNEY_LEVEL_CHANGED',
        message: 'Cấp hành trình đã thay đổi; vui lòng đặt lại lệnh',
      });
    }

    const plan = validated.input;
    if (validated.level === 0) {
      await tx.query(
        `insert into cap0_order_kehoach
           (id, order_id, ly_do_doi_thuong, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, now(), now())
         on conflict (order_id) do nothing`,
        [context.orderId, plan.ly_do_doi_thuong],
      );
      await this.assertCap0Plan(tx, context.orderId, plan.ly_do_doi_thuong!);
      return { savedLevels: [0] };
    }

    const referencePrice = this.referencePrice(context, order);
    const pctVon = await this.computeCapitalPercentage(
      tx,
      context.userId,
      validated.level,
      context.quantity,
      referencePrice,
    );
    await tx.query(
      `insert into order_kehoach (
         id, order_id, "lyDo", "trangThai_luc_dat", vung_mua,
         co_bam_doc_chi_tiet, snapshot_lop_du_lieu,
         phuong_phap_sl_tp, cat_lo, chot_loi,
         khau_vi, muc_tu_tin, cach_khoi_luong, khoi_luong, pct_von,
         doc_5_lop, conflict_level, created_at, updated_at
       ) values (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6::json,
         $7, $8, $9, $10, $11, $12, $13, $14,
         $15::json, $16, now(), now()
       )
       on conflict (order_id) do nothing`,
      [
        context.orderId,
        plan.lyDo,
        plan.trangThai_luc_dat,
        plan.vung_mua,
        plan.co_bam_doc_chi_tiet ?? false,
        plan.snapshot ? JSON.stringify(plan.snapshot) : null,
        validated.level >= 2 ? plan.phuong_phap_sl_tp : null,
        validated.level >= 2 ? plan.cat_lo : null,
        validated.level >= 2 ? plan.chot_loi : null,
        validated.level >= 3 ? plan.khau_vi : null,
        validated.level >= 3 ? plan.muc_tu_tin : null,
        validated.level >= 3 ? plan.cach_khoi_luong : null,
        validated.level >= 3 ? context.quantity : null,
        pctVon,
        validated.level >= 4 && validated.level <= 5 ? JSON.stringify(plan.doc_5_lop) : null,
        validated.level >= 6 ? (plan.conflict_level ?? null) : null,
      ],
    );
    await this.assertCumulativePlan(tx, context.orderId, validated);
    const savedLevels: JourneyLevel[] = [1];
    if (validated.level >= 2) savedLevels.push(2);
    if (validated.level >= 3) savedLevels.push(3);
    if (validated.level === 4 || validated.level === 5) savedLevels.push(4);
    if (validated.level >= 5 && (await this.captureCap5Snapshot(tx, context.userId, order))) {
      savedLevels.push(5);
    }
    if (validated.level >= 6) {
      const snapshotStored = await this.captureCap6Snapshot(tx, context.userId, order);
      if (snapshotStored && plan.conflict_level != null) savedLevels.push(6);
    }
    return { savedLevels };
  }

  async readForOrder(
    tx: SqlClient,
    userId: string,
    orderId: string,
  ): Promise<PersistedJourneyPlan | null> {
    const [order] = await tx.query<{ id: string; user_id: string }>(
      'select id, user_id from virtual_orders where id = $1 and user_id = $2 limit 1',
      [orderId, userId],
    );
    if (!order) return null;
    const [cap0] = await tx.query<Record<string, unknown>>(
      'select * from cap0_order_kehoach where order_id = $1 limit 1',
      [orderId],
    );
    if (cap0) return { order_id: orderId, level: 0, saved_levels: [0], plan: cap0 };
    const [plan] = await tx.query<Record<string, unknown>>(
      'select * from order_kehoach where order_id = $1 limit 1',
      [orderId],
    );
    if (!plan) return null;
    const level = inferStoredLevel(plan);
    return {
      order_id: orderId,
      level,
      saved_levels: storedLevels(plan),
      plan,
    };
  }

  private validateCumulative(
    level: JourneyLevel,
    plan: JourneyLearningPlanInput,
    context: JourneyOrderContext,
    order: OrderOwnershipRow,
  ): void {
    if (level === 0) {
      if (!plan.ly_do_doi_thuong || !EVERYDAY_REASONS.has(plan.ly_do_doi_thuong)) {
        this.invalid('Cấp 0 cần lý do đời thường hợp lệ trước khi mua');
      }
      return;
    }
    if (!plan.lyDo || !LAYERS.has(plan.lyDo)) this.invalid('Cấp 1+ cần lý do hợp lệ');
    if (!plan.trangThai_luc_dat || !ENTRY_STATES.has(plan.trangThai_luc_dat)) {
      this.invalid('Cấp 1+ cần trạng thái lúc đặt hợp lệ');
    }
    if (!positiveInteger(plan.vung_mua)) this.invalid('Cấp 1+ cần vùng mua hợp lệ');
    if (level >= 2) {
      if (!plan.phuong_phap_sl_tp || !SL_TP_METHODS.has(plan.phuong_phap_sl_tp)) {
        this.invalid('Cấp 2+ cần phương pháp cắt lỗ/chốt lời hợp lệ');
      }
      if (!positiveInteger(plan.cat_lo) || !positiveInteger(plan.chot_loi)) {
        this.invalid('Cấp 2+ cần giá cắt lỗ và chốt lời hợp lệ');
      }
      if (!(plan.cat_lo! < plan.vung_mua! && plan.vung_mua! < plan.chot_loi!)) {
        this.invalid('Cần cắt lỗ < vùng mua < chốt lời');
      }
    }
    if (level >= 3) {
      if (!plan.khau_vi || !RISK_PROFILES.has(plan.khau_vi))
        this.invalid('Khẩu vị rủi ro không hợp lệ');
      if (![1, 2, 3].includes(plan.muc_tu_tin ?? 0)) this.invalid('Mức tự tin không hợp lệ');
      if (!plan.cach_khoi_luong || !SIZE_METHODS.has(plan.cach_khoi_luong)) {
        this.invalid('Cách tính khối lượng không hợp lệ');
      }
      if (!positiveInteger(context.quantity) || context.quantity !== order.quantity) {
        this.invalid('Khối lượng kế hoạch không khớp lệnh');
      }
    }
    if ((level === 4 || level === 5) && !completeLayerMap(plan.doc_5_lop)) {
      this.invalid('Cấp 4–5 cần tự đọc đủ chính xác 5 lớp');
    }
    if (level >= 6 && plan.conflict_level != null && !CONFLICT_LEVELS.has(plan.conflict_level)) {
      this.invalid('Mức mâu thuẫn không hợp lệ');
    }
  }

  /**
   * Placement can select Cấp 1/2 before an explicit `enter` call has created
   * the corresponding row. The first BUY owns that bootstrap and keeps it in
   * the same transaction as cash, order and plan writes.
   */
  private async materializePlacementProgress(
    tx: SqlClient,
    userId: string,
    level: number,
  ): Promise<void> {
    if (level === 1) {
      await tx.query(
        `insert into cap1_progress
           (id,user_id,entered_at,da_xem_tour,so_ly_do_da_dung,so_lenh_ly_do_ung_ho,
            so_lenh_thuc_chien,created_at,updated_at)
         values (gen_random_uuid(),$1,now(),false,0,0,0,now(),now())
         on conflict (user_id) do nothing`,
        [userId],
      );
    } else if (level === 2) {
      await tx.query(
        `insert into cap1_progress
           (id,user_id,entered_at,da_xem_tour,task_1_done_at,task_2_done_at,task_3_done_at,
            task_4_done_at,task_5_done_at,so_ly_do_da_dung,so_lenh_ly_do_ung_ho,
            so_lenh_thuc_chien,graduated_at,time_to_graduate_hours,created_at,updated_at)
         values (gen_random_uuid(),$1,now(),false,now(),now(),now(),now(),now(),5,3,10,now(),0,now(),now())
         on conflict (user_id) do nothing`,
        [userId],
      );
      await tx.query(
        `insert into cap2_progress
           (id,user_id,entered_at,so_lenh_co_cl_tp,so_lan_cat_lo_dung,so_lan_chot_loi_dung,
            so_lan_thuc_hien_dung,chuoi_current,chuoi_record,created_at,updated_at)
         values (gen_random_uuid(),$1,now(),0,0,0,0,0,0,now(),now())
         on conflict (user_id) do nothing`,
        [userId],
      );
    }
  }

  private async validateNhoiAlert(
    tx: SqlClient,
    input: {
      userId: string;
      alertId: string;
      orderId: string;
      symbol: string;
    },
  ): Promise<NhoiAlertRow> {
    const [order] = await tx.query<OrderOwnershipRow>(
      `select id,account_id,user_id,symbol,mode,side,order_type,status,quantity,
              filled_price_vnd::text,limit_price_vnd::text,created_at
       from virtual_orders where id=$1 and user_id=$2 limit 1 for update`,
      [input.orderId, input.userId],
    );
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy lệnh' });
    }
    if (order.side !== 'buy' || !['pending', 'filled'].includes(order.status)) {
      throw new ConflictException({
        code: 'NHOI_ALERT_ORDER_INVALID',
        message: 'Cảnh báo nhồi lệnh chỉ gắn với lệnh MUA đã được chấp nhận',
      });
    }
    if (order.symbol.toUpperCase() !== input.symbol.toUpperCase()) {
      throw new ConflictException({
        code: 'NHOI_ALERT_ORDER_MISMATCH',
        message: 'Mã của lệnh mua không khớp yêu cầu',
      });
    }
    const [event] = await tx.query<NhoiAlertRow>(
      `select id,user_id,alert_type,symbol,session_date,intended_quantity,
              intended_order_type,intended_limit_price_vnd::text,action,source_order_id,
              violation_confirmed_at
       from cap2_alert_events where id=$1 and user_id=$2 limit 1 for update`,
      [input.alertId, input.userId],
    );
    if (!event) {
      throw new NotFoundException({
        code: 'CAP2_ALERT_NOT_FOUND',
        message: 'Không tìm thấy cảnh báo Cấp 2',
      });
    }
    if (event.alert_type !== 'nhoi_lenh' || event.action !== 'proceed_buy') {
      throw new ConflictException({
        code: 'NHOI_ALERT_NOT_APPROVED',
        message: 'Cảnh báo chưa ghi nhận lựa chọn vẫn mua',
      });
    }
    if (event.source_order_id != null && event.source_order_id !== order.id) {
      throw new ConflictException({
        code: 'NHOI_ALERT_ALREADY_LINKED',
        message: 'Cảnh báo nhồi lệnh đã được gắn với một lệnh mua',
      });
    }
    const expectedLimit = order.order_type === 'limit' ? order.limit_price_vnd : null;
    if (
      event.symbol.toUpperCase() !== order.symbol.toUpperCase() ||
      dateOnly(event.session_date) !== currentVnDate() ||
      event.intended_quantity !== order.quantity ||
      event.intended_order_type !== order.order_type ||
      !sameNullableInteger(event.intended_limit_price_vnd, expectedLimit)
    ) {
      throw new ConflictException({
        code: 'NHOI_ALERT_ORDER_MISMATCH',
        message: 'Nội dung lệnh mua đã thay đổi sau cảnh báo',
      });
    }
    return event;
  }

  private async linkNhoiAlert(
    tx: SqlClient,
    userId: string,
    alertId: string,
    orderId: string,
  ): Promise<boolean> {
    const linked = await tx.query<{ id: string; status: string }>(
      `update cap2_alert_events e
       set source_order_id=$3,updated_at=now()
       from virtual_orders o
       where e.id=$1 and e.user_id=$2 and o.id=$3 and o.user_id=$2
         and o.side='buy' and o.status in ('pending','filled')
         and e.alert_type='nhoi_lenh' and e.action='proceed_buy'
         and (e.source_order_id is null or e.source_order_id=$3)
       returning e.id,o.status`,
      [alertId, userId, orderId],
    );
    if (!linked[0]) {
      throw new ConflictException({
        code: 'NHOI_ALERT_LINK_FAILED',
        message: 'Không thể gắn cảnh báo với lệnh mua',
      });
    }
    if (linked[0].status === 'filled') {
      await this.confirmNhoiOrderFilled(tx, userId, orderId);
    }
    return true;
  }

  private async confirmNhoiOrderFilled(
    tx: SqlClient,
    userId: string,
    orderId: string,
  ): Promise<boolean> {
    const [event] = await tx.query<NhoiAlertRow>(
      `select e.id,e.user_id,e.alert_type,e.symbol,e.session_date,e.intended_quantity,
              e.intended_order_type,e.intended_limit_price_vnd::text,e.action,e.source_order_id,
              e.violation_confirmed_at
       from cap2_alert_events e
       join virtual_orders o on o.id=e.source_order_id
       where e.user_id=$1 and e.alert_type='nhoi_lenh' and e.source_order_id=$2
         and e.action='proceed_buy' and o.user_id=$1 and o.side='buy' and o.status='filled'
       limit 1 for update of e`,
      [userId, orderId],
    );
    if (!event) return false;
    if (event.violation_confirmed_at != null) return true;
    await tx.query(
      `insert into cap2_alert_type_state
         (id,user_id,alert_type,ignored_streak,last_ignored_at,created_at,updated_at)
       values (gen_random_uuid(),$1,'nhoi_lenh',1,now(),now(),now())
       on conflict (user_id,alert_type) do update
       set ignored_streak=cap2_alert_type_state.ignored_streak+1,
           last_ignored_at=now(),updated_at=now()`,
      [userId],
    );
    await tx.query(
      `update cap2_alert_events set violation_confirmed_at=now(),updated_at=now()
       where id=$1 and violation_confirmed_at is null`,
      [event.id],
    );
    return true;
  }

  private async captureCap5Snapshot(
    tx: SqlClient,
    userId: string,
    order: OrderOwnershipRow,
  ): Promise<boolean> {
    const [progress] = await tx.query<{ entered_at: Date | string }>(
      'select entered_at from cap5_progress where user_id=$1 limit 1',
      [userId],
    );
    if (!progress) {
      throw new ConflictException({
        code: 'CAP5_PROGRESS_INCOMPLETE',
        message: 'Chưa có tiến trình Cấp 5',
      });
    }
    if (order.mode !== 'thuc_chien') {
      this.invalid('Cấp 5 chỉ ghi nhận lệnh Thực chiến');
    }
    if (new Date(order.created_at).getTime() < new Date(progress.entered_at).getTime()) {
      this.invalid('Lệnh được tạo trước khi vào Cấp 5');
    }
    const [existing] = await tx.query<{ cap5_entry_snapshot_at: Date | string | null }>(
      'select cap5_entry_snapshot_at from order_kehoach where order_id=$1 limit 1',
      [order.id],
    );
    if (existing?.cap5_entry_snapshot_at != null) return true;

    const [hunt] = await tx.query<{
      hunt_filter: string;
      hunt_signal: string | null;
      first_hunted_at: Date | string;
    }>(
      `select hunt_filter,hunt_signal,first_hunted_at
       from cap5_hunt_log
       where user_id=$1 and upper(symbol)=upper($2) and first_hunted_at <= $3
       limit 1`,
      [userId, order.symbol, order.created_at],
    );
    const [watch] = await tx.query<{
      consensus_today: number | null;
      consensus_da_cham: number | null;
      consensus_at: Date | string | null;
    }>(
      `select consensus_today,consensus_da_cham,consensus_at
       from watchlist_items where user_id=$1 and upper(symbol)=upper($2) limit 1`,
      [userId, order.symbol],
    );
    const huntSessions = hunt
      ? countTradingSessions(vnDate(hunt.first_hunted_at), vnDate(order.created_at))
      : null;
    const stored = await tx.query<{ cap5_entry_snapshot_at: Date | string }>(
      `update order_kehoach
       set from_watchlist=$1,hunt_filter=$2,hunt_signal_at_entry=$3,
           hunt_first_hunted_at_entry=$4,hunt_sessions_at_entry=$5,
           consensus_at_entry=$6,consensus_scored_at_entry=$7,
           consensus_captured_at_entry=$8,cap5_entry_snapshot_at=now(),updated_at=now()
       where order_id=$9 and cap5_entry_snapshot_at is null
       returning cap5_entry_snapshot_at`,
      [
        Boolean(hunt),
        hunt?.hunt_filter ?? null,
        hunt?.hunt_signal ?? null,
        hunt?.first_hunted_at ?? null,
        huntSessions,
        watch?.consensus_at != null ? watch.consensus_today : null,
        watch?.consensus_at != null ? watch.consensus_da_cham : null,
        watch?.consensus_at ?? null,
        order.id,
      ],
    );
    return stored.length > 0;
  }

  private async captureCap6Snapshot(
    tx: SqlClient,
    userId: string,
    order: OrderOwnershipRow,
  ): Promise<boolean> {
    const [progress] = await tx.query<{ id: string }>(
      'select id from cap6_progress where user_id=$1 limit 1',
      [userId],
    );
    if (!progress) {
      throw new ConflictException({
        code: 'CAP6_PROGRESS_INCOMPLETE',
        message: 'Chưa có tiến trình Cấp 6',
      });
    }
    if (order.mode !== 'thuc_chien') this.invalid('Cấp 6 chỉ ghi nhận lệnh Thực chiến');
    const [existing] = await tx.query<{ conflict_snapshot_at: Date | string | null }>(
      'select conflict_snapshot_at from order_kehoach where order_id=$1 limit 1',
      [order.id],
    );
    if (existing?.conflict_snapshot_at != null) return true;

    const [source] = await tx.query<{
      payload: unknown;
      session_date: Date | string;
    }>(
      `select payload,session_date from ai_insight_history
       where upper(symbol)=upper($1) order by session_date desc limit 1`,
      [order.symbol],
    );
    const sourceDate = source ? dateOnly(source.session_date) : null;
    const earliest = earliestValidSession(currentVnDate());
    const result =
      source && sourceDate != null && sourceDate >= earliest
        ? readConflict(source.payload, { sessionDate: sourceDate })
        : null;
    const stored = await tx.query<{ conflict_snapshot_at: Date | string }>(
      `update order_kehoach
       set had_conflict=$1,had_veto=$2,veto_layers=$3::jsonb,support_layers=$4::jsonb,
           opposing_layers=$5::jsonb,neutral_layers=$6::jsonb,
           conflict_snapshot_session_date=$7,conflict_snapshot_at=now(),updated_at=now()
       where order_id=$8 and conflict_snapshot_at is null
       returning conflict_snapshot_at`,
      [
        result?.chua_du_du_lieu === false ? result.co_mau_thuan : null,
        result?.chua_du_du_lieu === false ? result.phu_quyet_kich_hoat : null,
        result?.chua_du_du_lieu === false ? JSON.stringify(result.lop_phu_quyet_xau) : null,
        result?.chua_du_du_lieu === false
          ? JSON.stringify(result.ung_ho.map((item) => item.lop))
          : null,
        result?.chua_du_du_lieu === false
          ? JSON.stringify(result.nguoc.map((item) => item.lop))
          : null,
        result?.chua_du_du_lieu === false
          ? JSON.stringify(result.trung_tinh.map((item) => item.lop))
          : null,
        result?.session_date ?? null,
        order.id,
      ],
    );
    return stored.length > 0;
  }

  private async requireOwnedOrder(
    tx: SqlClient,
    context: JourneyOrderContext,
    lock: boolean,
  ): Promise<OrderOwnershipRow> {
    const [order] = await tx.query<OrderOwnershipRow>(
      `select id, account_id, user_id, symbol, mode, side, order_type, status, quantity,
              filled_price_vnd::text, limit_price_vnd::text, created_at
       from virtual_orders
       where id = $1 and user_id = $2
       limit 1${lock ? ' for update' : ''}`,
      [context.orderId, context.userId],
    );
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy lệnh' });
    }
    if (order.side !== context.side || order.quantity !== context.quantity) {
      throw new ConflictException({
        code: 'ORDER_CONTEXT_MISMATCH',
        message: 'Thông tin lệnh không khớp kế hoạch học',
      });
    }
    return order;
  }

  private referencePrice(context: JourneyOrderContext, order: OrderOwnershipRow): number | null {
    const value =
      context.referencePriceVnd ??
      numberOrNull(order.filled_price_vnd) ??
      numberOrNull(order.limit_price_vnd);
    if (typeof value === 'bigint') {
      return value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
    }
    return value != null && Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  private async computeCapitalPercentage(
    tx: SqlClient,
    userId: string,
    level: JourneyLevel,
    quantity: number,
    referencePrice: number | null,
  ): Promise<number | null> {
    if (level < 3) return null;
    if (!referencePrice) this.invalid('Chưa xác định được giá để tính % vốn');
    const [progress] = await tx.query<{ von_ban_dau: string }>(
      'select von_ban_dau::text from cap3_progress where user_id = $1 limit 1',
      [userId],
    );
    const capital = numberOrNull(progress?.von_ban_dau ?? null);
    if (!capital || capital <= 0) {
      throw new ConflictException({
        code: 'CAP3_PROGRESS_INCOMPLETE',
        message: 'Chưa có vốn ban đầu hợp lệ cho Cấp 3',
      });
    }
    return ((quantity * referencePrice!) / capital) * 100;
  }

  private async assertCap0Plan(tx: SqlClient, orderId: string, reason: string): Promise<void> {
    const [stored] = await tx.query<{ ly_do_doi_thuong: string }>(
      'select ly_do_doi_thuong from cap0_order_kehoach where order_id = $1 limit 1',
      [orderId],
    );
    if (!stored || stored.ly_do_doi_thuong !== reason) {
      throw new ConflictException({
        code: 'JOURNEY_PLAN_ALREADY_EXISTS',
        message: 'Lệnh đã có kế hoạch khác',
      });
    }
  }

  private async assertCumulativePlan(
    tx: SqlClient,
    orderId: string,
    validated: ValidatedJourneyPlan,
  ): Promise<void> {
    const [stored] = await tx.query<Record<string, unknown>>(
      'select * from order_kehoach where order_id = $1 limit 1',
      [orderId],
    );
    const input = validated.input;
    const expected: Record<string, unknown> = {
      lyDo: input.lyDo,
      trangThai_luc_dat: input.trangThai_luc_dat,
      vung_mua: input.vung_mua,
      co_bam_doc_chi_tiet: input.co_bam_doc_chi_tiet ?? false,
      snapshot_lop_du_lieu: input.snapshot ?? null,
      phuong_phap_sl_tp: validated.level >= 2 ? input.phuong_phap_sl_tp : null,
      cat_lo: validated.level >= 2 ? input.cat_lo : null,
      chot_loi: validated.level >= 2 ? input.chot_loi : null,
      khau_vi: validated.level >= 3 ? input.khau_vi : null,
      muc_tu_tin: validated.level >= 3 ? input.muc_tu_tin : null,
      cach_khoi_luong: validated.level >= 3 ? input.cach_khoi_luong : null,
      doc_5_lop: validated.level >= 4 && validated.level <= 5 ? input.doc_5_lop : null,
      conflict_level: validated.level >= 6 ? (input.conflict_level ?? null) : null,
    };
    const same =
      stored && Object.entries(expected).every(([key, value]) => samePlanValue(stored[key], value));
    if (!same) {
      throw new ConflictException({
        code: 'JOURNEY_PLAN_ALREADY_EXISTS',
        message: 'Lệnh đã có kế hoạch khác',
      });
    }
  }

  private invalid(message: string): never {
    throw new BadRequestException({ code: 'INVALID_JOURNEY_PLAN', message });
  }
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function numberOrNull(value: string | number | null): number | null {
  if (value == null) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(numeric) ? numeric : null;
}

function completeLayerMap(
  value: JourneyLearningPlanInput['doc_5_lop'],
): value is Record<(typeof JOURNEY_LAYER_KEYS)[number], JourneyLayerAssessment> {
  if (!value || Object.keys(value).length !== JOURNEY_LAYER_KEYS.length) return false;
  return JOURNEY_LAYER_KEYS.every(
    (key) => value[key] === 'ok' || value[key] === 'neu' || value[key] === 'bad',
  );
}

function inferStoredLevel(plan: Record<string, unknown>): JourneyLevel {
  if (plan.conflict_level != null || plan.conflict_snapshot_at != null) return 6;
  if (plan.cap5_entry_snapshot_at != null) return 5;
  if (plan.doc_5_lop != null) return 4;
  if (plan.khau_vi != null) return 3;
  if (plan.phuong_phap_sl_tp != null) return 2;
  return 1;
}

function storedLevels(plan: Record<string, unknown>): JourneyLevel[] {
  const levels: JourneyLevel[] = [1];
  if (plan.phuong_phap_sl_tp != null && plan.cat_lo != null && plan.chot_loi != null)
    levels.push(2);
  if (
    plan.khau_vi != null &&
    plan.muc_tu_tin != null &&
    plan.cach_khoi_luong != null &&
    plan.khoi_luong != null &&
    plan.pct_von != null
  ) {
    levels.push(3);
  }
  if (plan.doc_5_lop != null) levels.push(4);
  if (plan.cap5_entry_snapshot_at != null) levels.push(5);
  if (plan.conflict_snapshot_at != null && plan.conflict_level != null) levels.push(6);
  return levels;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function samePlanValue(actual: unknown, expected: unknown): boolean {
  if (
    typeof expected === 'number' &&
    typeof actual === 'string' &&
    /^-?\d+(?:\.\d+)?$/.test(actual)
  ) {
    return Number(actual) === expected;
  }
  return stableJson(actual) === stableJson(expected);
}

function normalizePlan(plan: JourneyLearningPlanInput): JourneyLearningPlanInput {
  const method = (plan as unknown as { cach_khoi_luong?: string | null }).cach_khoi_luong;
  const normalizedMethod =
    method === 'linh_hoat' ? 'khau_vi_tu_tin' : method === 'ky_luat' ? 'chia_deu' : method;
  return {
    ...plan,
    cach_khoi_luong: normalizedMethod as JourneyLearningPlanInput['cach_khoi_luong'],
  };
}

function currentVnDate(now = new Date()): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function dateOnly(value: Date | string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function vnDate(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : currentVnDate(date);
}

function countTradingSessions(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (end < cursor) return 0;
  let count = 0;
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function sameNullableInteger(
  actual: string | number | null,
  expected: string | number | null,
): boolean {
  if (actual == null || expected == null) return actual == null && expected == null;
  try {
    return BigInt(actual) === BigInt(expected);
  } catch {
    return false;
  }
}
