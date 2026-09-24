import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../../platform/database/index.js';
import { CoreJourneyService, JourneyEventService } from '../core/index.js';
import { integer } from './exact-numeric.js';
import type { Cap4PlanBody } from './cap4.schemas.js';
import {
  LAYERS,
  type Assessment,
  type Cap4Progress,
  type Layer,
  type LayerWinRate,
} from './cap4.types.js';

const MIN_READINGS = 10;
const MIN_CLOSED = 3;
const WEAPON_THRESHOLD = 70;
const BLINDSPOT_THRESHOLD = 50;
const LABELS: Record<Layer, string> = {
  ky_thuat: 'Kỹ thuật',
  dong_tien: 'Dòng tiền',
  noi_bo: 'Nội bộ',
  tin_tuc: 'Tin tức',
  dinh_gia: 'Định giá',
};

type ProgressRow = {
  id: string;
  user_id: string;
  entered_at: Date | string;
  task_1_done_at: Date | string | null;
  so_lenh_doc_du_5lop: number;
  vu_khi_lop: Layer | null;
  diem_mu_lop: Layer | null;
  graduated_at: Date | string | null;
  time_to_graduate_hours: number | string | null;
};
type OrderRow = {
  id: string;
  user_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  mode: string;
  status: string;
  quantity: number;
  filled_price_vnd: string | number | bigint | null;
  limit_price_vnd: string | number | bigint | null;
  created_at: Date | string;
  trading_date: Date | string;
};
type PlanRow = {
  id: string;
  order_id: string;
  lyDo: string;
  trangThai_luc_dat: string;
  vung_mua: string | number | bigint;
  phuong_phap_sl_tp: string | null;
  cat_lo: string | number | bigint | null;
  chot_loi: string | number | bigint | null;
  khau_vi: string | null;
  muc_tu_tin: number | null;
  cach_khoi_luong: string | null;
  khoi_luong: number | null;
  pct_von: number | string | null;
  doc_5_lop: Record<string, Assessment> | null;
  ai_5_lop: Record<string, Assessment> | null;
  so_lop_dong_thuan: number | null;
  so_lop_khac_ai: number | null;
};
type ClosedRow = {
  doc_5_lop: Record<string, Assessment> | null;
  ai_5_lop: Record<string, Assessment> | null;
  so_lop_dong_thuan: number | null;
  so_lop_khac_ai: number | null;
  pnl_pct: number | string;
  pnl_vnd: string | number | bigint;
};

@Injectable()
export class Cap4Service {
  constructor(
    private readonly database: DatabaseService,
    private readonly journey: CoreJourneyService,
    private readonly events: JourneyEventService,
  ) {}

  async getProgress(userId: string): Promise<Cap4Progress | null> {
    return this.database.transaction(async (tx) => {
      const progress = await this.findProgress(tx, userId, true);
      return progress ? this.recompute(tx, progress) : null;
    });
  }

  async enter(userId: string): Promise<Cap4Progress> {
    return this.database.transaction(async (tx) => {
      const existing = await this.findProgress(tx, userId, true);
      if (existing) return this.recompute(tx, existing);
      await this.journey.requireLevel(tx, userId, 3);
      const [cap3] = await tx.query<{ graduated_at: Date | string | null }>(
        'select graduated_at from cap3_progress where user_id = $1 limit 1',
        [userId],
      );
      if (!cap3 || cap3.graduated_at === null) throw new ConflictException('Chưa tốt nghiệp Cấp 3');
      await tx.query(
        `insert into cap4_progress
          (id, user_id, entered_at, task_1_done_at, so_lenh_doc_du_5lop,
           vu_khi_lop, diem_mu_lop, created_at, updated_at)
         values ($1, $2, now(), null, 0, null, null, now(), now())
         on conflict (user_id) do nothing`,
        [randomUUID(), userId],
      );
      const progress = await this.findProgress(tx, userId, true);
      if (!progress) throw new ConflictException('Không thể khởi tạo tiến trình Cấp 4');
      return this.recompute(tx, progress);
    });
  }

  async markTask(userId: string, taskNo: 1): Promise<Cap4Progress> {
    if (taskNo !== 1) throw new BadRequestException('task_no không hợp lệ');
    return this.database.transaction(async (tx) =>
      this.recompute(tx, await this.requireProgress(tx, userId, true)),
    );
  }

  async recordPlan(userId: string, input: Cap4PlanBody): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      const progress = await this.requireProgress(tx, userId, true);
      const order = await this.requireOrder(tx, userId, input.order_id, true);
      if (order.side !== 'buy') throw new BadRequestException('Đọc 5 lớp chỉ ghi cho lệnh MUA');
      if (order.mode !== 'thuc_chien')
        throw new BadRequestException('Cấp 4 chỉ ghi nhận lệnh Thực chiến');
      if (!['pending', 'filled'].includes(order.status)) {
        throw new BadRequestException('Chỉ ghi kế hoạch cho lệnh đang chờ hoặc đã khớp');
      }
      const doc = validateMap(input.doc_5_lop);
      const plan = await this.requirePlan(tx, input.order_id, true);
      if (plan.doc_5_lop !== null) {
        if (stableJson(plan.doc_5_lop) !== stableJson(doc)) {
          throw new ConflictException('Bản tự chấm 5 lớp đã được chốt');
        }
        await this.recompute(tx, progress);
        return this.planOutput(plan);
      }

      const ai = await this.findVerifiedAi(tx, userId, order);
      const consensus = ai ? Object.values(ai).filter((value) => value === 'ok').length : null;
      const differing = ai ? LAYERS.filter((layer) => doc[layer] !== ai[layer]).length : null;
      await tx.query(
        `update order_kehoach
        set doc_5_lop = $2::json, ai_5_lop = $3::json,
             so_lop_dong_thuan = $4, so_lop_khac_ai = $5, updated_at = now()
         where order_id = $1`,
        [input.order_id, JSON.stringify(doc), ai ? JSON.stringify(ai) : null, consensus, differing],
      );
      for (const [layer, assessment] of Object.entries(doc)) {
        await this.events.recordInTransaction(tx, {
          userId,
          name: 'cap4_doc_lop',
          fields: { lop: layer, nhan_dinh: assessment },
          dedupKey: `order:${input.order_id}:lop:${layer}:nhan_dinh:${assessment}`,
        });
      }
      if (Object.keys(doc).length === LAYERS.length) {
        await this.events.recordInTransaction(tx, {
          userId,
          name: 'cap4_dat_lenh_du_5lop',
          dedupKey: `order:${input.order_id}`,
        });
        if (ai) {
          await this.events.recordInTransaction(tx, {
            userId,
            name: 'cap4_lo_ai',
            fields: { so_khac_ai: differing },
            dedupKey: `order:${input.order_id}`,
          });
        }
      }
      await this.recompute(tx, progress);
      return this.planOutput(await this.requirePlan(tx, input.order_id, false));
    });
  }

  async getPlan(userId: string, orderId: string): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      const order = await this.requireOrder(tx, userId, orderId, false);
      if (order.side !== 'buy' || order.status !== 'filled')
        throw new NotFoundException('lệnh mua');
      const plan = await this.requirePlan(tx, orderId, false);
      const price = order.filled_price_vnd ?? order.limit_price_vnd;
      if (price === null) throw new BadRequestException('Chưa xác định được giá mua');
      return {
        ...this.planOutput(plan),
        symbol: order.symbol,
        quantity: order.quantity,
        bought_at: order.created_at,
        gia_vao: integer(price, 'gia_vao'),
      };
    });
  }

  async weapons(userId: string): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      const progress = await this.requireProgress(tx, userId, true);
      const metrics = await this.metrics(tx, userId);
      await this.persistMetrics(tx, userId, progress, metrics);
      return {
        lop: metrics.layers,
        vu_khi_lop: metrics.weapon,
        diem_mu_lop: metrics.blindspot,
        so_lenh_toi_thieu: MIN_CLOSED,
        nguong_vu_khi: WEAPON_THRESHOLD,
        nguong_diem_mu: BLINDSPOT_THRESHOLD,
        giai_thich: `Đo bằng kết quả thật: ≥${WEAPON_THRESHOLD}% là vũ khí, <${BLINDSPOT_THRESHOLD}% là điểm mù; cần ít nhất ${MIN_CLOSED} lệnh đã đóng mỗi lớp.`,
      };
    });
  }

  async analysis(userId: string): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      const progress = await this.requireProgress(tx, userId, false);
      const rows = await this.closedRows(tx, userId);
      await this.events.recordInTransaction(tx, {
        userId,
        name: 'cap4_phantich_view',
        dedupKey: `progress:${progress.id}`,
      });
      const grouped: Record<'cao' | 'vua' | 'thap', ClosedRow[]> = { cao: [], vua: [], thap: [] };
      let excluded = 0;
      for (const row of rows) {
        if (row.so_lop_dong_thuan === null) {
          excluded++;
          continue;
        }
        if (row.so_lop_dong_thuan >= 4) grouped.cao.push(row);
        else if (row.so_lop_dong_thuan >= 2) grouped.vua.push(row);
        else grouped.thap.push(row);
      }
      const bands = (Object.entries(grouped) as [keyof typeof grouped, ClosedRow[]][]).map(
        ([band, values]) => ({
          band,
          label:
            band === 'cao'
              ? '4-5 lớp ủng hộ'
              : band === 'vua'
                ? '2-3 lớp ủng hộ'
                : '0-1 lớp ủng hộ',
          count: values.length,
          wins: values.filter((row) => Number(row.pnl_pct) > 0).length,
          win_rate: values.length
            ? Math.round(
                (values.filter((row) => Number(row.pnl_pct) > 0).length / values.length) * 100,
              )
            : null,
          insufficient: values.length < 3,
        }),
      );
      const high = bands[0]!;
      const low = bands[2]!;
      const gap =
        high.win_rate === null || low.win_rate === null ? null : high.win_rate - low.win_rate;
      let finding: string | null = null;
      if (gap !== null && !high.insufficient && !low.insufficient) {
        finding =
          gap >= 15
            ? `Nhóm đồng thuận cao thắng ${high.win_rate}% so với ${low.win_rate}% ở nhóm thấp — có tín hiệu tích cực.`
            : gap <= -15
              ? `Nhóm đồng thuận cao thắng ${high.win_rate}%, thấp hơn nhóm thấp ${low.win_rate}% — chưa nên ưu tiên đồng thuận cao.`
              : `Chênh lệch ${gap} điểm phần trăm chưa đủ rõ để kết luận.`;
      }
      return {
        khoi_10: {
          rows: bands,
          total_trades: bands.reduce((sum, row) => sum + row.count, 0),
          excluded_no_ai: excluded,
          hieu_qua: gap === null || high.insufficient || low.insufficient ? null : gap >= 15,
          phat_hien: finding,
          insufficient_note:
            gap === null || high.insufficient || low.insufficient
              ? 'Cần ít nhất 3 lệnh ở cả nhóm 4-5 và 0-1 lớp ủng hộ.'
              : null,
          giai_thich:
            'Tỷ lệ thắng được tính từ kết quả thật của lệnh đã đóng; không phải điều kiện tốt nghiệp.',
        },
        khoi_11: this.analysisDifferences(rows),
      };
    });
  }

  async graduate(userId: string): Promise<Cap4Progress> {
    return this.database.transaction(async (tx) => {
      let progress = await this.recompute(tx, await this.requireProgress(tx, userId, true));
      if (progress.graduated_at !== null) return progress;
      if (progress.task_1_done_at === null)
        throw new ConflictException('Chưa hoàn thành nhiệm vụ Cấp 4');
      const now = new Date();
      const hours = (now.getTime() - new Date(progress.entered_at).getTime()) / 3_600_000;
      await tx.query(
        `update cap4_progress set graduated_at = $2, time_to_graduate_hours = $3, updated_at = now()
         where user_id = $1 and graduated_at is null`,
        [userId, now, hours],
      );
      await this.events.recordInTransaction(tx, {
        userId,
        name: 'cap4_graduate',
        dedupKey: `progress:${progress.id}`,
      });
      progress = await this.recompute(tx, await this.requireProgress(tx, userId, true));
      return progress;
    });
  }

  private async recompute(tx: SqlClient, row: ProgressRow): Promise<Cap4Progress> {
    const metrics = await this.metrics(tx, row.user_id);
    await this.persistMetrics(tx, row.user_id, row, metrics);
    const fresh = await this.requireProgress(tx, row.user_id, false);
    const taskDone = fresh.task_1_done_at ?? (metrics.readings >= MIN_READINGS ? new Date() : null);
    if (fresh.task_1_done_at === null && taskDone !== null) {
      await tx.query(
        'update cap4_progress set task_1_done_at = $2, updated_at = now() where user_id = $1',
        [row.user_id, taskDone],
      );
      await this.events.recordInTransaction(tx, {
        userId: row.user_id,
        name: 'cap4_task_complete',
        fields: { task_id: 1 },
        dedupKey: `1:${new Date(taskDone).toISOString()}`,
      });
    }
    const result = await this.requireProgress(tx, row.user_id, false);
    return {
      ...result,
      so_lenh_doc_du_5lop: metrics.readings,
      vu_khi_lop: metrics.weapon,
      diem_mu_lop: metrics.blindspot,
      time_to_graduate_hours:
        result.time_to_graduate_hours === null ? null : Number(result.time_to_graduate_hours),
    };
  }

  private async persistMetrics(
    tx: SqlClient,
    userId: string,
    row: ProgressRow,
    metrics: Metrics,
  ): Promise<void> {
    await tx.query(
      `update cap4_progress set so_lenh_doc_du_5lop = $2, vu_khi_lop = $3,
          diem_mu_lop = $4, updated_at = now() where user_id = $1`,
      [userId, metrics.readings, metrics.weapon, metrics.blindspot],
    );
  }

  private async metrics(tx: SqlClient, userId: string): Promise<Metrics> {
    const plans = await tx.query<{ doc_5_lop: Record<string, Assessment> | null }>(
      `select k.doc_5_lop from order_kehoach k join virtual_orders o on o.id = k.order_id
       where o.user_id = $1 and o.mode = 'thuc_chien' and o.side = 'buy' and k.doc_5_lop is not null
       order by o.created_at asc`,
      [userId],
    );
    const readings = plans.filter((row) => isCompleteMap(row.doc_5_lop)).length;
    const rows = await this.closedRows(tx, userId);
    const layers: LayerWinRate[] = LAYERS.map((layer) => {
      const selected = rows.filter((row) => row.doc_5_lop?.[layer] === 'ok');
      const wins = selected.filter((row) => Number(row.pnl_pct) > 0).length;
      const rate = selected.length ? (wins / selected.length) * 100 : null;
      const label: LayerWinRate['nhan'] = selected.length < MIN_CLOSED ? 'chua_du_du_lieu' : null;
      return {
        lop: layer,
        ten: LABELS[layer],
        n_orders: selected.length,
        n_wins: wins,
        win_rate: rate,
        nhan: label,
        giai_thich: selected.length
          ? `${LABELS[layer]}: ${wins}/${selected.length} lệnh thắng (${rate!.toFixed(1)}%).`
          : `Chưa có lệnh đóng khi đọc ${LABELS[layer]} là Ủng hộ.`,
      };
    });
    const weaponRows = layers
      .filter(
        (row) =>
          row.n_orders >= MIN_CLOSED && row.win_rate !== null && row.win_rate >= WEAPON_THRESHOLD,
      )
      .sort(
        (a, b) =>
          b.win_rate! - a.win_rate! ||
          b.n_orders - a.n_orders ||
          LAYERS.indexOf(a.lop) - LAYERS.indexOf(b.lop),
      );
    const blindRows = layers
      .filter(
        (row) =>
          row.n_orders >= MIN_CLOSED && row.win_rate !== null && row.win_rate < BLINDSPOT_THRESHOLD,
      )
      .sort(
        (a, b) =>
          a.win_rate! - b.win_rate! ||
          b.n_orders - a.n_orders ||
          LAYERS.indexOf(a.lop) - LAYERS.indexOf(b.lop),
      );
    const weapon = weaponRows[0]?.lop ?? null;
    const blindspot = blindRows[0]?.lop ?? null;
    for (const layer of layers) {
      if (layer.nhan === 'chua_du_du_lieu') continue;
      if (layer.lop === weapon) layer.nhan = 'vu_khi';
      else if (layer.lop === blindspot) layer.nhan = 'diem_mu';
    }
    return {
      readings,
      layers: layers.sort((a, b) => (b.win_rate ?? -1) - (a.win_rate ?? -1)),
      weapon,
      blindspot,
    };
  }

  private async closedRows(tx: SqlClient, userId: string): Promise<ClosedRow[]> {
    return tx.query<ClosedRow>(
      `select k.doc_5_lop, k.ai_5_lop, k.so_lop_dong_thuan, k.so_lop_khac_ai, ks.pnl_pct, ks.pnl_vnd
       from order_ketso ks join virtual_orders sell on sell.id = ks.order_id
       join lateral (
         select candidate.id from virtual_orders candidate
         where candidate.user_id = sell.user_id and candidate.mode = 'thuc_chien'
           and candidate.side = 'buy' and candidate.status = 'filled'
           and candidate.account_id = sell.account_id and candidate.symbol = sell.symbol
           and ((sell.exit_matched_buy_order_id is not null and candidate.id = sell.exit_matched_buy_order_id)
             or candidate.created_at <= sell.created_at)
         order by candidate.created_at desc limit 1
       ) buy on true join order_kehoach k on k.order_id = buy.id
       where sell.user_id = $1 and sell.mode = 'thuc_chien'`,
      [userId],
    );
  }

  private async findProgress(
    tx: SqlClient,
    userId: string,
    lock: boolean,
  ): Promise<ProgressRow | null> {
    const rows = await tx.query<ProgressRow>(
      `select id, user_id, entered_at, task_1_done_at, so_lenh_doc_du_5lop,
              vu_khi_lop, diem_mu_lop, graduated_at, time_to_graduate_hours
       from cap4_progress where user_id = $1${lock ? ' for update' : ''}`,
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
    if (!row) throw new NotFoundException('tiến trình Cấp 4');
    return row;
  }
  private async requireOrder(
    tx: SqlClient,
    userId: string,
    orderId: string,
    lock: boolean,
  ): Promise<OrderRow> {
    const rows = await tx.query<OrderRow>(
      `select id, user_id, symbol, side, mode, status, quantity, filled_price_vnd, limit_price_vnd, created_at, trading_date
       from virtual_orders where id = $1 and user_id = $2${lock ? ' for update' : ''}`,
      [orderId, userId],
    );
    if (!rows[0]) throw new NotFoundException('lệnh');
    return rows[0];
  }
  private async requirePlan(tx: SqlClient, orderId: string, lock: boolean): Promise<PlanRow> {
    const rows = await tx.query<PlanRow>(
      `select id, order_id, "lyDo", "trangThai_luc_dat", vung_mua, phuong_phap_sl_tp, cat_lo, chot_loi,
              khau_vi, muc_tu_tin, cach_khoi_luong, khoi_luong, pct_von, doc_5_lop, ai_5_lop,
              so_lop_dong_thuan, so_lop_khac_ai from order_kehoach where order_id = $1${lock ? ' for update' : ''}`,
      [orderId],
    );
    if (!rows[0]) throw new NotFoundException('kế hoạch Cấp 1 — cần ghi vùng mua trước');
    return rows[0];
  }
  private planOutput(plan: PlanRow): Record<string, unknown> {
    return {
      id: plan.id,
      order_id: plan.order_id,
      vung_mua: integer(plan.vung_mua, 'vung_mua'),
      lyDo: plan.lyDo,
      trangThai_luc_dat: plan.trangThai_luc_dat,
      phuong_phap_sl_tp: plan.phuong_phap_sl_tp,
      cat_lo: plan.cat_lo === null ? null : integer(plan.cat_lo, 'cat_lo'),
      chot_loi: plan.chot_loi === null ? null : integer(plan.chot_loi, 'chot_loi'),
      khau_vi: plan.khau_vi,
      muc_tu_tin: plan.muc_tu_tin,
      cach_khoi_luong: plan.cach_khoi_luong,
      khoi_luong: plan.khoi_luong,
      pct_von: plan.pct_von === null ? null : Number(plan.pct_von),
      doc_5_lop: plan.doc_5_lop,
      ai_5_lop: plan.ai_5_lop,
      so_lop_dong_thuan: plan.so_lop_dong_thuan,
      so_lop_khac_ai: plan.so_lop_khac_ai,
    };
  }
  private async findVerifiedAi(
    tx: SqlClient,
    userId: string,
    order: OrderRow,
  ): Promise<Record<Layer, Assessment> | null> {
    const rows = await tx.query<{ payload: Record<string, unknown>; dataset_hash: string }>(
      `select payload, dataset_hash from journey_reading_datasets
       where user_id = $1 and symbol = $2 and trading_date = $3 order by created_at desc`,
      [userId, order.symbol.toUpperCase(), order.trading_date],
    );
    for (const row of rows) {
      const payload = row.payload;
      const candidate = payload.ai_answers;
      if (
        payload.symbol === order.symbol.toUpperCase() &&
        payload.source_symbol === order.symbol.toUpperCase() &&
        payload.valuation_source_symbol === order.symbol.toUpperCase() &&
        payload.trading_date === dateOnly(order.trading_date) &&
        stableDigest(payload) === row.dataset_hash &&
        isCompleteMap(candidate)
      )
        return candidate;
    }
    return null;
  }
  private analysisDifferences(rows: ClosedRow[]): Record<string, unknown> {
    const differing = rows.filter(
      (row) => (row.so_lop_khac_ai ?? 0) > 0 && Number(row.pnl_pct) !== 0,
    );
    const userRight = differing.filter((row) => Number(row.pnl_pct) > 0).length;
    const aiRight = differing.filter((row) => Number(row.pnl_pct) < 0).length;
    return {
      so_lan_khac_ai: differing.length,
      so_lan_ban_dung: userRight,
      so_lan_ai_dung: aiRight,
      phat_hien: null,
      insufficient_note:
        differing.length < 5 ? `Cần ít nhất 5 lệnh khác AI (hiện: ${differing.length}).` : null,
      giai_thich:
        'Đếm theo lệnh; kết quả đúng/sai chỉ dựa vào P&L thực, không dùng mức đồng thuận để chấm.',
    };
  }
}

type Metrics = {
  readings: number;
  layers: LayerWinRate[];
  weapon: Layer | null;
  blindspot: Layer | null;
};

function validateMap(value: Record<string, Assessment> | null): Record<Layer, Assessment> {
  if (!value || Object.keys(value).length === 0)
    throw new BadRequestException('doc_5_lop không được để trống');
  const clean: Partial<Record<Layer, Assessment>> = {};
  for (const [layer, assessment] of Object.entries(value)) {
    if (
      !(LAYERS as readonly string[]).includes(layer) ||
      !['ok', 'neu', 'bad'].includes(assessment)
    ) {
      throw new BadRequestException(`Nhận định lớp không hợp lệ: ${layer}`);
    }
    clean[layer as Layer] = assessment;
  }
  return clean as Record<Layer, Assessment>;
}
function isCompleteMap(value: unknown): value is Record<Layer, Assessment> {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return LAYERS.every((layer) => ['ok', 'neu', 'bad'].includes(String(record[layer])));
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(', ')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}: ${stableJson(nested)}`)
      .join(', ')}}`;
  return JSON.stringify(value);
}
function stableDigest(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function dateOnly(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
