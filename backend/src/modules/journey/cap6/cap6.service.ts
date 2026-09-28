import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../platform/database/index.js';
import type { OrderPlanRow, VirtualOrderRow } from '../cap5/cap5.types.js';
import {
  CONFLICT_LABELS,
  CONFLICT_LEVELS,
  type Cap6ProgressRow,
  type Cap6SkipRow,
  type ConflictLevel,
  type ConflictResult,
  CAP6_POST_GRADUATION_HOOKS,
  type Cap6PostGraduationHooks,
} from './cap6.types.js';
import { emptyConflict, readConflict } from './conflict.js';
import {
  averagePositionRows,
  countConsistent,
  CONSISTENCY_TARGET,
  isConsistentOrder,
  MIN_CLOSED_ORDERS_FOR_RATE,
} from './rules.js';
import { earliestValidSession } from '../cap5/consensus.js';
import { Cap5Service } from '../cap5/cap5.service.js';

const upper = (value: string) => value.trim().toUpperCase();
const dateIso = (value: unknown) =>
  value ? new Date(value as string | number | Date).toISOString().slice(0, 10) : null;

@Injectable()
export class Cap6Service {
  constructor(
    private readonly database: DatabaseService,
    private readonly cap5: Cap5Service,
    @Inject(CAP6_POST_GRADUATION_HOOKS) private readonly hooks: Cap6PostGraduationHooks,
  ) {}
  private async one<T extends Record<string, unknown>>(
    sql: string,
    values: readonly unknown[],
  ): Promise<T | null> {
    return (await this.database.query<T>(sql, values))[0] ?? null;
  }
  private async progress(userId: string): Promise<Cap6ProgressRow> {
    const row = await this.one<Cap6ProgressRow>('select * from cap6_progress where user_id=$1', [
      userId,
    ]);
    if (!row) throw new NotFoundException({ code: 'CAP6_NOT_ENTERED', message: 'Chưa vào Cấp 6' });
    return row;
  }
  private progressOut(row: Cap6ProgressRow, consistent: number, veto: number, pnl: number | null) {
    return {
      id: row.id,
      user_id: row.user_id,
      entered_at: row.entered_at,
      so_lan_xu_ly_nhat_quan: consistent,
      so_lan_xu_ly_veto_nhat_quan: veto,
      muc_tieu_nhat_quan: CONSISTENCY_TARGET,
      tong_lai_lenh_cap6_pct: pnl,
      da_xem_tour_mauthuan: row.da_xem_tour_mauthuan,
      dat_nhiem_vu: consistent >= CONSISTENCY_TARGET,
      graduated_at: row.graduated_at,
      time_to_graduate_hours: row.time_to_graduate_hours,
    };
  }
  private async conflictSource(symbol: string): Promise<ConflictResult> {
    const row = await this.one<Record<string, unknown>>(
      `select payload, session_date from ai_insight_history where upper(symbol)=$1 order by session_date desc limit 1`,
      [upper(symbol)],
    );
    if (!row)
      return emptyConflict(
        'Mã này chưa có bản phân tích 5 lớp nào, nên IQX chưa dựng được bảng mâu thuẫn.',
      );
    const session = dateIso(row.session_date);
    const earliest = earliestValidSession(new Date().toISOString().slice(0, 10));
    if (!session || session < earliest)
      return emptyConflict(
        `Bản phân tích 5 lớp gần nhất là phiên ${session ?? 'không rõ'} — đã quá hạn dùng cho hôm nay.`,
      );
    return readConflict(row.payload, { sessionDate: session });
  }
  private async plans(userId: string): Promise<OrderPlanRow[]> {
    return this.database.query<OrderPlanRow>(
      `select ok.* from order_kehoach ok join virtual_orders vo on vo.id=ok.order_id where vo.user_id=$1 and vo.mode='thuc_chien' and vo.side='buy' and vo.status='filled' and ok.conflict_level is not null`,
      [userId],
    );
  }
  private async skips(userId: string): Promise<Cap6SkipRow[]> {
    return this.database.query<Cap6SkipRow>(
      'select * from cap6_skip where user_id=$1 order by at asc',
      [userId],
    );
  }
  private async recompute(row: Cap6ProgressRow, userId: string) {
    const plans = await this.plans(userId),
      skips = await this.skips(userId);
    const counts = countConsistent(plans, skips);
    const closed = await this.database.query<{
      pnl_pct: number;
      closed_at: Date | string;
      had_conflict: boolean | null;
    }>(
      `select ok.conflict_level,ok.had_conflict,ket.pnl_pct,ket.closed_at from order_ketso ket join virtual_orders sell on sell.id=ket.order_id and sell.user_id=$1 left join lateral (select b.* from virtual_orders b where b.user_id=$1 and b.symbol=sell.symbol and b.side='buy' and b.status='filled' and b.created_at <= sell.created_at order by b.created_at desc limit 1) buy on true join order_kehoach ok on ok.order_id=buy.id and ok.had_conflict=true where sell.side='sell' and ket.closed_at >= $2`,
      [userId, row.entered_at],
    );
    const pnl = closed.length
      ? Math.round(
          (closed.reduce((sum, item) => sum + Number(item.pnl_pct), 0) / closed.length) * 100,
        ) / 100
      : null;
    await this.database.query(
      'update cap6_progress set so_lan_xu_ly_nhat_quan=$1,so_lan_xu_ly_veto_nhat_quan=$2,tong_lai_lenh_cap6_pct=$3,updated_at=now() where id=$4',
      [counts.consistent, counts.vetoConsistent, pnl, row.id],
    );
    const fresh =
      (await this.one<Cap6ProgressRow>('select * from cap6_progress where id=$1', [row.id])) ?? row;
    return this.progressOut(fresh, counts.consistent, counts.vetoConsistent, pnl);
  }
  async getProgress(userId: string) {
    const row = await this.one<Cap6ProgressRow>('select * from cap6_progress where user_id=$1', [
      userId,
    ]);
    return row ? this.recompute(row, userId) : null;
  }
  async enter(userId: string) {
    const existing = await this.one<Cap6ProgressRow>(
      'select * from cap6_progress where user_id=$1',
      [userId],
    );
    if (existing) return this.recompute(existing, userId);
    const cap5 = await this.one<{ graduated_at: Date | string | null }>(
      'select graduated_at from cap5_progress where user_id=$1',
      [userId],
    );
    if (!cap5)
      throw new NotFoundException({ code: 'CAP5_NOT_FOUND', message: 'Chưa có tiến trình Cấp 5' });
    if (!cap5.graduated_at)
      throw new ConflictException({ code: 'CAP5_NOT_GRADUATED', message: 'Chưa tốt nghiệp Cấp 5' });
    await this.database.query(
      `insert into cap6_progress(id,user_id,entered_at,so_lan_xu_ly_nhat_quan,so_lan_xu_ly_veto_nhat_quan,da_xem_tour_mauthuan,created_at,updated_at) values($1,$2,now(),0,0,false,now(),now())`,
      [randomUUID(), userId],
    );
    return this.getProgress(userId);
  }
  async markTour(userId: string) {
    await this.progress(userId);
    await this.database.query(
      'update cap6_progress set da_xem_tour_mauthuan=true,updated_at=now() where user_id=$1',
      [userId],
    );
    return this.getProgress(userId);
  }
  private conflictOut(symbol: string, result: ConflictResult) {
    return {
      symbol,
      co_mau_thuan: result.co_mau_thuan,
      ung_ho: result.ung_ho,
      nguoc: result.nguoc,
      trung_tinh: result.trung_tinh,
      phu_quyet_kich_hoat: result.phu_quyet_kich_hoat,
      lop_phu_quyet_xau: result.lop_phu_quyet_xau,
      lop_phu_quyet_xau_ten: result.lop_phu_quyet_xau,
      canh_bao: result.canh_bao,
      chua_du_du_lieu: result.chua_du_du_lieu,
      ly_do_chua_du: result.ly_do_chua_du,
      so_lop_da_cham: result.so_lop_da_cham,
      session_date: result.session_date,
      lop_phu_quyet: ['noi_bo', 'tin_tuc'],
      lop_diem_tru: ['dinh_gia', 'dong_tien', 'ky_thuat'],
    };
  }
  async conflict(userId: string, symbol: string) {
    await this.progress(userId);
    return this.conflictOut(upper(symbol), await this.conflictSource(symbol));
  }
  private validate(level: string): ConflictLevel {
    if (!CONFLICT_LEVELS.includes(level as ConflictLevel))
      throw new BadRequestException({
        code: 'INVALID_CONFLICT_LEVEL',
        message: 'conflict_level không hợp lệ',
      });
    return level as ConflictLevel;
  }
  async recordSnapshot(userId: string, orderId: string) {
    await this.progress(userId);
    const order = await this.one<VirtualOrderRow>(
      `select * from virtual_orders where id=$1 and user_id=$2 and side='buy'`,
      [orderId, userId],
    );
    if (!order)
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy lệnh mua' });
    if (order.mode !== 'thuc_chien' || !['pending', 'filled'].includes(order.status))
      throw new BadRequestException({
        code: 'CAP6_ORDER_NOT_ELIGIBLE',
        message: 'Chỉ ghi snapshot cho lệnh Thực chiến đang chờ hoặc đã khớp',
      });
    const plan = await this.one<OrderPlanRow>('select * from order_kehoach where order_id=$1', [
      orderId,
    ]);
    if (!plan)
      throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Chưa có kế hoạch Cấp 1' });
    if (plan.conflict_snapshot_at) return plan;
    const result = await this.conflictSource(order.symbol);
    await this.database.query(
      `update order_kehoach set had_conflict=$1,had_veto=$2,veto_layers=$3,support_layers=$4,opposing_layers=$5,neutral_layers=$6,conflict_snapshot_session_date=$7,conflict_snapshot_at=now() where order_id=$8`,
      [
        result.chua_du_du_lieu ? null : result.co_mau_thuan,
        result.chua_du_du_lieu ? null : result.phu_quyet_kich_hoat,
        result.chua_du_du_lieu ? null : JSON.stringify(result.lop_phu_quyet_xau),
        result.chua_du_du_lieu ? null : JSON.stringify(result.ung_ho.map((item) => item.lop)),
        result.chua_du_du_lieu ? null : JSON.stringify(result.nguoc.map((item) => item.lop)),
        result.chua_du_du_lieu ? null : JSON.stringify(result.trung_tinh.map((item) => item.lop)),
        result.session_date,
        orderId,
      ],
    );
    return this.one<OrderPlanRow>('select * from order_kehoach where order_id=$1', [orderId]);
  }
  async record(userId: string, orderId: string, level: string) {
    const normalized = this.validate(level);
    await this.progress(userId);
    const order = await this.one<VirtualOrderRow>(
      "select * from virtual_orders where id=$1 and user_id=$2 and side='buy'",
      [orderId, userId],
    );
    if (!order)
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Không tìm thấy lệnh' });
    const plan = await this.one<OrderPlanRow>('select * from order_kehoach where order_id=$1', [
      orderId,
    ]);
    if (!plan)
      throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Chưa có kế hoạch Cấp 1' });
    if (plan.conflict_level === normalized && plan.conflict_snapshot_at) return this.planOut(plan);
    if (
      order.status === 'filled' &&
      Date.now() - new Date(order.created_at).getTime() > 15 * 60 * 1000
    )
      throw new ConflictException({
        code: 'CONFLICT_RATING_LOCKED',
        message: 'Lệnh đã khớp quá lâu — không thể ghi nhận định.',
      });
    await this.recordSnapshot(userId, orderId);
    await this.database.query('update order_kehoach set conflict_level=$1 where order_id=$2', [
      normalized,
      orderId,
    ]);
    return this.planOut(
      (await this.one<OrderPlanRow>('select * from order_kehoach where order_id=$1', [
        orderId,
      ])) as OrderPlanRow,
    );
  }
  private planOut(plan: OrderPlanRow) {
    const level = plan.conflict_level as ConflictLevel | null;
    return {
      id: plan.id,
      order_id: plan.order_id,
      had_conflict: plan.had_conflict,
      conflict_level: level,
      conflict_level_ten: level ? CONFLICT_LABELS[level] : null,
      had_veto: plan.had_veto,
      veto_layers: plan.veto_layers,
      veto_layers_ten: plan.veto_layers,
      support_layers: plan.support_layers,
      opposing_layers: plan.opposing_layers,
      neutral_layers: plan.neutral_layers,
      conflict_snapshot_session_date: plan.conflict_snapshot_session_date,
      conflict_snapshot_at: plan.conflict_snapshot_at,
      khoi_luong_pct_von: plan.pct_von,
      muc_tu_tin: plan.muc_tu_tin,
      nhat_quan: isConsistentOrder(plan),
    };
  }
  async getPlan(userId: string, orderId: string, cumulative = false) {
    await this.progress(userId);
    const plan = await this.one<OrderPlanRow>(
      'select ok.* from order_kehoach ok join virtual_orders vo on vo.id=ok.order_id where ok.order_id=$1 and vo.user_id=$2',
      [orderId, userId],
    );
    if (!plan)
      throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Không tìm thấy kế hoạch' });
    const cap6 = this.planOut(plan);
    return cumulative ? { ...(await this.cap5.getPlan(userId, orderId)), ...cap6 } : cap6;
  }
  async skip(userId: string, symbolInput: string, level: string) {
    const normalized = this.validate(level);
    await this.progress(userId);
    const symbol = upper(symbolInput);
    const result = await this.conflictSource(symbol);
    const id = randomUUID();
    await this.database.query(
      `insert into cap6_skip(id,user_id,symbol,at,conflict_level,had_conflict,had_veto,created_at,updated_at) values($1,$2,$3,now(),$4,$5,$6,now(),now())`,
      [
        id,
        userId,
        symbol,
        normalized,
        result.chua_du_du_lieu ? null : result.co_mau_thuan,
        result.chua_du_du_lieu ? null : result.phu_quyet_kich_hoat,
      ],
    );
    return {
      id,
      symbol,
      at: new Date(),
      conflict_level: normalized,
      conflict_level_ten: CONFLICT_LABELS[normalized],
      had_conflict: result.chua_du_du_lieu ? null : result.co_mau_thuan,
      had_veto: result.chua_du_du_lieu ? null : result.phu_quyet_kich_hoat,
    };
  }
  async analysis(userId: string) {
    await this.progress(userId);
    const plans = await this.plans(userId),
      skips = await this.skips(userId),
      rows = averagePositionRows(plans);
    const closed = await this.database.query<Record<string, unknown>>(
      `select ok.conflict_level,ket.pnl_pct from order_ketso ket join virtual_orders sell on sell.id=ket.order_id and sell.user_id=$1 and sell.side='sell' left join lateral (select b.* from virtual_orders b where b.user_id=$1 and b.symbol=sell.symbol and b.side='buy' and b.status='filled' and b.created_at<=sell.created_at order by b.created_at desc limit 1) buy on true join order_kehoach ok on ok.order_id=buy.id and ok.had_conflict=true`,
      [userId],
    );
    const levels: ConflictLevel[] = ['nhe', 'ngai', 'nghiem', 'chua_ro'];
    const k15 = levels.map((level) => {
      const subset = closed.filter((row) => row.conflict_level === level);
      const wins = subset.filter((row) => Number(row.pnl_pct) > 0).length;
      const enough = subset.length >= MIN_CLOSED_ORDERS_FOR_RATE;
      return {
        muc: level,
        muc_ten: CONFLICT_LABELS[level],
        so_lenh: subset.length,
        so_lenh_thang: wins,
        ty_le_thang_pct: enough ? Math.round((wins / subset.length) * 1000) / 10 : null,
        du_mau: enough,
      };
    });
    return {
      khoi_14: {
        rows: rows.map((row) => ({
          muc: row.level,
          muc_ten: CONFLICT_LABELS[row.level as ConflictLevel],
          so_lenh: row.count,
          kl_tb_pct_von: row.average,
          khop: row.matches,
        })),
        du_mau: rows.filter((row) => row.average !== null && row.level !== 'chua_ro').length >= 2,
        giai_thich: 'Chỉ tính lệnh có mâu thuẫn; khối lượng giảm dần khi mức đọc nặng dần.',
        nhan_xet: null,
      },
      khoi_15: {
        rows: k15,
        so_lan_nghiem_khong_mua: skips.filter((skip) => skip.conflict_level === 'nghiem').length,
        so_lan_khong_mua: skips.length,
        so_lenh_toi_thieu: MIN_CLOSED_ORDERS_FOR_RATE,
        giai_thich: `Mỗi mức cần ít nhất ${MIN_CLOSED_ORDERS_FOR_RATE} lệnh đã đóng mới được tính tỷ lệ thắng.`,
        nhan_xet: null,
      },
    };
  }
  async graduate(userId: string) {
    const before = await this.progress(userId);
    if (before.graduated_at) return this.getProgress(userId);
    const current = await this.recompute(before, userId);
    if (!current.dat_nhiem_vu)
      throw new ConflictException({
        code: 'CAP6_NOT_COMPLETE',
        message: `Cần ${CONSISTENCY_TARGET} lần xử lý mâu thuẫn nhất quán`,
      });
    await this.database.transaction(async (tx) => {
      const locked = (
        await tx.query<Cap6ProgressRow>('select * from cap6_progress where id=$1 for update', [
          before.id,
        ])
      )[0];
      if (!locked)
        throw new NotFoundException({ code: 'CAP6_NOT_ENTERED', message: 'Chưa vào Cấp 6' });
      if (locked.graduated_at) return;
      if (locked.so_lan_xu_ly_nhat_quan < CONSISTENCY_TARGET)
        throw new ConflictException({
          code: 'CAP6_NOT_COMPLETE',
          message: `Cần ${CONSISTENCY_TARGET} lần xử lý mâu thuẫn nhất quán`,
        });
      await tx.query(
        'update cap6_progress set graduated_at=now(),time_to_graduate_hours=extract(epoch from (now()-entered_at))/3600,updated_at=now() where id=$1 and graduated_at is null',
        [before.id],
      );
    });
    const result = await this.getProgress(userId);
    try {
      await this.hooks.initializeBot(userId);
    } catch {
      /* graduation is durable */
    }
    try {
      await this.hooks.initializeMascot(userId);
    } catch {
      /* graduation is durable */
    }
    return result;
  }
}
