/**
 * Lưu trữ Thần Tài v2: lượt khấn mỗi ngày (`tf_khan_daily`), vòng không lặp lá (`tf_la_seen`), thư viện
 * quẻ/lá do quản trị sửa (`tf_kd_que`, `tf_kd_la`) và cấu hình 5 hành (`tf_hanh_config`). Mọi `date` đọc về
 * dưới dạng text `YYYY-MM-DD`. Các bước ghi là UPDATE có điều kiện nên bấm đúp không ghi hai lần.
 */

import { Injectable } from '@nestjs/common';

import type { SqlClient } from '../../platform/database/database.service.js';
import {
  HANG_LABEL,
  HANG_LIST,
  HANH_LIST,
  TRIGRAMS,
  type Direction,
  type Hang,
  type Hanh,
  type HanhConfig,
  type HanhMau,
  type ThanTaiLa,
  type TrigramView,
} from './than-tai.logic.js';

export const THAN_TAI_REPOSITORY = Symbol('THAN_TAI_REPOSITORY');

/** Một lượt khấn trong ngày. */
export interface KhanRow {
  laId: number;
  hang: Hang;
  duDoan: Direction | null;
  /** null = chưa làm, [] = bỏ qua. */
  maCau: string[] | null;
}

export interface TopTicker {
  ticker: string;
  count: number;
}

export interface DayTally {
  up: number;
  flat: number;
  down: number;
  top5: TopTicker[];
}

/** Một lá kèm nội dung quẻ, dạng phẳng cho màn quản trị. */
export interface AdminLa {
  id: number;
  queId: number;
  queTen: string;
  chuHan: string;
  hao: string;
  queTren: string;
  queDuoi: string;
  tuong: string;
  thoan: string;
  thoanNghia: string;
  haoDong: number;
  tenHao: string;
  haoVan: string;
  haoNghia: string;
  hang: Hang;
  luan: string;
  chot: string;
  active: boolean;
  updatedAt: number;
}

export interface AdminQue {
  id: number;
  ten: string;
  chuHan: string;
  hao: string;
  queTren: string;
  queDuoi: string;
  tuong: string;
  thoan: string;
  thoanNghia: string;
  updatedAt: number;
}

export interface AdminHanh extends HanhConfig {
  updatedAt: number;
}

export interface LaPatch {
  tenHao?: string;
  haoVan?: string;
  haoNghia?: string;
  hang?: Hang;
  luan?: string;
  chot?: string;
  active?: boolean;
}

export interface QuePatch {
  ten?: string;
  chuHan?: string;
  tuong?: string;
  thoan?: string;
  thoanNghia?: string;
}

export interface HanhPatch {
  nganh?: string[];
  mau?: HanhMau[];
  huong?: string;
}

export interface ThanTaiRepository {
  hanhConfigs(db: SqlClient): Promise<HanhConfig[]>;
  findKhan(db: SqlClient, actorKey: string, ngay: string): Promise<KhanRow | null>;
  /** Một lá theo id, kể cả lá đã tắt (lá đã gieo vẫn hiển thị đủ nội dung). */
  findLa(db: SqlClient, laId: number): Promise<ThanTaiLa | null>;
  /** id các lá đang bật theo hạng; hạng không có lá thì vắng mặt. */
  activeLaByHang(db: SqlClient): Promise<Map<Hang, number[]>>;
  seenIds(db: SqlClient, actorKey: string): Promise<Set<number>>;
  /** false khi người này đã có lượt cho ngày (không ghi đè). */
  insertKhan(
    db: SqlClient,
    input: { actorKey: string; ngay: string; laId: number; hang: Hang; at: Date },
  ): Promise<boolean>;
  clearSeen(db: SqlClient, actorKey: string, hang: Hang): Promise<void>;
  markSeen(db: SqlClient, actorKey: string, hang: Hang, laId: number): Promise<void>;
  /** false khi đã dự đoán hoặc chưa gieo quẻ. */
  setPrediction(
    db: SqlClient,
    input: { actorKey: string; ngay: string; direction: Direction; at: Date },
  ): Promise<boolean>;
  /** false khi đã cầu mã hoặc chưa dự đoán. */
  setCau(
    db: SqlClient,
    input: { actorKey: string; ngay: string; tickers: readonly string[]; at: Date },
  ): Promise<boolean>;
  tally(db: SqlClient, ngay: string, top: number): Promise<DayTally>;

  adminListLa(db: SqlClient): Promise<AdminLa[]>;
  adminFindLa(db: SqlClient, id: number): Promise<AdminLa | null>;
  adminUpdateLa(db: SqlClient, id: number, patch: LaPatch, at: Date): Promise<boolean>;
  adminFindQue(db: SqlClient, id: number): Promise<AdminQue | null>;
  adminUpdateQue(db: SqlClient, id: number, patch: QuePatch, at: Date): Promise<boolean>;
  adminListHanh(db: SqlClient): Promise<AdminHanh[]>;
  adminFindHanh(db: SqlClient, hanh: Hanh): Promise<AdminHanh | null>;
  adminUpdateHanh(db: SqlClient, hanh: Hanh, patch: HanhPatch, at: Date): Promise<boolean>;
}

type Row = Record<string, unknown>;

const HANG_SET = new Set<string>(HANG_LIST);
const HANH_SET = new Set<string>(HANH_LIST);

const toHang = (value: unknown): Hang =>
  HANG_SET.has(String(value)) ? (value as Hang) : 'trung_cat';

const toEpoch = (value: unknown): number => new Date(value as string | number | Date).getTime();

const toTrigram = (key: unknown): TrigramView => {
  const id = String(key);
  const known = TRIGRAMS[id];
  return { key: id, ten: known?.ten ?? id, symbol: known?.symbol ?? '' };
};

const toMau = (value: unknown): HanhMau[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => item as { ten?: unknown; hex?: unknown })
    .filter((item) => typeof item.ten === 'string' && typeof item.hex === 'string')
    .map((item) => ({ ten: String(item.ten), hex: String(item.hex) }));
};

const toHanhConfig = (row: Row): HanhConfig => ({
  hanh: row.hanh as Hanh,
  nganh: Array.isArray(row.nganh) ? (row.nganh as unknown[]).map(String) : [],
  mau: toMau(row.mau),
  huong: String(row.huong ?? ''),
});

const toAdminLa = (row: Row): AdminLa => ({
  id: Number(row.id),
  queId: Number(row.que_id),
  queTen: String(row.que_ten),
  chuHan: String(row.chu_han),
  hao: String(row.hao),
  queTren: String(row.que_tren),
  queDuoi: String(row.que_duoi),
  tuong: String(row.tuong),
  thoan: String(row.thoan),
  thoanNghia: String(row.thoan_nghia),
  haoDong: Number(row.hao_dong),
  tenHao: String(row.ten_hao),
  haoVan: String(row.hao_van),
  haoNghia: String(row.hao_nghia),
  hang: toHang(row.hang),
  luan: String(row.luan),
  chot: String(row.chot),
  active: row.active === true,
  updatedAt: toEpoch(row.updated_at),
});

const toAdminQue = (row: Row): AdminQue => ({
  id: Number(row.id),
  ten: String(row.ten),
  chuHan: String(row.chu_han),
  hao: String(row.hao),
  queTren: String(row.que_tren),
  queDuoi: String(row.que_duoi),
  tuong: String(row.tuong),
  thoan: String(row.thoan),
  thoanNghia: String(row.thoan_nghia),
  updatedAt: toEpoch(row.updated_at),
});

const toKhan = (row: Row): KhanRow => ({
  laId: Number(row.la_id),
  hang: toHang(row.hang),
  duDoan: (row.du_doan as Direction | null) ?? null,
  maCau: Array.isArray(row.ma_cau) ? (row.ma_cau as unknown[]).map(String) : null,
});

const toLa = (row: Row): ThanTaiLa => {
  const hang = toHang(row.hang);
  return {
    id: Number(row.id),
    hang,
    hangLabel: HANG_LABEL[hang],
    que: {
      id: Number(row.que_id),
      ten: String(row.que_ten),
      chuHan: String(row.chu_han),
      hao: String(row.hao),
      tren: toTrigram(row.que_tren),
      duoi: toTrigram(row.que_duoi),
      tuong: String(row.tuong),
      thoan: String(row.thoan),
      thoanNghia: String(row.thoan_nghia),
    },
    haoDong: {
      so: Number(row.hao_dong),
      ten: String(row.ten_hao),
      van: String(row.hao_van),
      nghia: String(row.hao_nghia),
    },
    luan: String(row.luan),
    chot: String(row.chot),
  };
};

const LA_COLUMNS = `l.id, l.que_id, l.hao_dong, l.ten_hao, l.hao_van, l.hao_nghia, l.hang, l.luan, l.chot,
       l.active, l.updated_at,
       q.ten as que_ten, q.chu_han, q.hao, q.que_tren, q.que_duoi, q.tuong, q.thoan, q.thoan_nghia`;

const QUE_COLUMNS = `id, ten, chu_han, hao, que_tren, que_duoi, tuong, thoan, thoan_nghia, updated_at`;

const HANH_COLUMNS = `hanh, nganh, mau, huong, updated_at`;

@Injectable()
export class PgThanTaiRepository implements ThanTaiRepository {
  async hanhConfigs(db: SqlClient): Promise<HanhConfig[]> {
    const rows = await db.query<Row>(`select ${HANH_COLUMNS} from tf_hanh_config`);
    return rows.filter((row) => HANH_SET.has(String(row.hanh))).map(toHanhConfig);
  }

  async findKhan(db: SqlClient, actorKey: string, ngay: string): Promise<KhanRow | null> {
    const rows = await db.query<Row>(
      `select la_id, hang, du_doan, ma_cau
         from tf_khan_daily where actor_key = $1 and ngay = $2::date`,
      [actorKey, ngay],
    );
    return rows[0] ? toKhan(rows[0]) : null;
  }

  async findLa(db: SqlClient, laId: number): Promise<ThanTaiLa | null> {
    const rows = await db.query<Row>(
      `select ${LA_COLUMNS}
         from tf_kd_la l join tf_kd_que q on q.id = l.que_id
        where l.id = $1`,
      [laId],
    );
    return rows[0] ? toLa(rows[0]) : null;
  }

  async activeLaByHang(db: SqlClient): Promise<Map<Hang, number[]>> {
    const rows = await db.query<Row>(
      `select hang, array_agg(id order by id) as ids
         from tf_kd_la where active group by hang`,
    );
    const byHang = new Map<Hang, number[]>();
    for (const row of rows) {
      const ids = Array.isArray(row.ids) ? (row.ids as unknown[]).map(Number) : [];
      if (ids.length > 0 && HANG_SET.has(String(row.hang))) byHang.set(row.hang as Hang, ids);
    }
    return byHang;
  }

  async seenIds(db: SqlClient, actorKey: string): Promise<Set<number>> {
    const rows = await db.query<Row>(`select la_id from tf_la_seen where actor_key = $1`, [
      actorKey,
    ]);
    return new Set(rows.map((row) => Number(row.la_id)));
  }

  async insertKhan(
    db: SqlClient,
    input: { actorKey: string; ngay: string; laId: number; hang: Hang; at: Date },
  ): Promise<boolean> {
    const rows = await db.query<Row>(
      `insert into tf_khan_daily (actor_key, ngay, la_id, hang, step, created_at, updated_at)
       values ($1, $2::date, $3, $4, 2, $5, $5)
       on conflict (actor_key, ngay) do nothing
       returning actor_key`,
      [input.actorKey, input.ngay, input.laId, input.hang, input.at],
    );
    return rows.length > 0;
  }

  async clearSeen(db: SqlClient, actorKey: string, hang: Hang): Promise<void> {
    await db.query(`delete from tf_la_seen where actor_key = $1 and hang = $2`, [actorKey, hang]);
  }

  async markSeen(db: SqlClient, actorKey: string, hang: Hang, laId: number): Promise<void> {
    await db.query(
      `insert into tf_la_seen (actor_key, hang, la_id) values ($1, $2, $3)
       on conflict (actor_key, la_id) do nothing`,
      [actorKey, hang, laId],
    );
  }

  async setPrediction(
    db: SqlClient,
    input: { actorKey: string; ngay: string; direction: Direction; at: Date },
  ): Promise<boolean> {
    const rows = await db.query<Row>(
      `update tf_khan_daily set du_doan = $3, step = 3, updated_at = $4
        where actor_key = $1 and ngay = $2::date and du_doan is null
        returning actor_key`,
      [input.actorKey, input.ngay, input.direction, input.at],
    );
    return rows.length > 0;
  }

  async setCau(
    db: SqlClient,
    input: { actorKey: string; ngay: string; tickers: readonly string[]; at: Date },
  ): Promise<boolean> {
    const rows = await db.query<Row>(
      `update tf_khan_daily set ma_cau = $3::text[], step = 4, updated_at = $4
        where actor_key = $1 and ngay = $2::date and ma_cau is null and du_doan is not null
        returning actor_key`,
      [input.actorKey, input.ngay, [...input.tickers], input.at],
    );
    return rows.length > 0;
  }

  async tally(db: SqlClient, ngay: string, top: number): Promise<DayTally> {
    const [counts, tickers] = await Promise.all([
      db.query<Row>(
        `select count(*) filter (where du_doan = 'up')::int as up,
                count(*) filter (where du_doan = 'flat')::int as flat,
                count(*) filter (where du_doan = 'down')::int as down
           from tf_khan_daily where ngay = $1::date and du_doan is not null`,
        [ngay],
      ),
      db.query<Row>(
        `select t.ticker, count(*)::int as count
           from tf_khan_daily d, unnest(d.ma_cau) as t(ticker)
          where d.ngay = $1::date and d.ma_cau is not null
          group by t.ticker
          order by count desc, t.ticker asc
          limit $2`,
        [ngay, top],
      ),
    ]);
    const row = counts[0] ?? {};
    return {
      up: Number(row.up ?? 0),
      flat: Number(row.flat ?? 0),
      down: Number(row.down ?? 0),
      top5: tickers.map((item) => ({ ticker: String(item.ticker), count: Number(item.count) })),
    };
  }

  async adminListLa(db: SqlClient): Promise<AdminLa[]> {
    const rows = await db.query<Row>(
      `select ${LA_COLUMNS}
         from tf_kd_la l join tf_kd_que q on q.id = l.que_id
        order by l.que_id, l.hao_dong`,
    );
    return rows.map(toAdminLa);
  }

  async adminFindLa(db: SqlClient, id: number): Promise<AdminLa | null> {
    const rows = await db.query<Row>(
      `select ${LA_COLUMNS}
         from tf_kd_la l join tf_kd_que q on q.id = l.que_id
        where l.id = $1`,
      [id],
    );
    return rows[0] ? toAdminLa(rows[0]) : null;
  }

  async adminUpdateLa(db: SqlClient, id: number, patch: LaPatch, at: Date): Promise<boolean> {
    const rows = await db.query<Row>(
      `update tf_kd_la set
          ten_hao = coalesce($2, ten_hao),
          hao_van = coalesce($3, hao_van),
          hao_nghia = coalesce($4, hao_nghia),
          hang = coalesce($5, hang),
          luan = coalesce($6, luan),
          chot = coalesce($7, chot),
          active = coalesce($8, active),
          updated_at = $9
        where id = $1
        returning id`,
      [
        id,
        patch.tenHao ?? null,
        patch.haoVan ?? null,
        patch.haoNghia ?? null,
        patch.hang ?? null,
        patch.luan ?? null,
        patch.chot ?? null,
        patch.active ?? null,
        at,
      ],
    );
    return rows.length > 0;
  }

  async adminFindQue(db: SqlClient, id: number): Promise<AdminQue | null> {
    const rows = await db.query<Row>(`select ${QUE_COLUMNS} from tf_kd_que where id = $1`, [id]);
    return rows[0] ? toAdminQue(rows[0]) : null;
  }

  async adminUpdateQue(db: SqlClient, id: number, patch: QuePatch, at: Date): Promise<boolean> {
    const rows = await db.query<Row>(
      `update tf_kd_que set
          ten = coalesce($2, ten),
          chu_han = coalesce($3, chu_han),
          tuong = coalesce($4, tuong),
          thoan = coalesce($5, thoan),
          thoan_nghia = coalesce($6, thoan_nghia),
          updated_at = $7
        where id = $1
        returning id`,
      [
        id,
        patch.ten ?? null,
        patch.chuHan ?? null,
        patch.tuong ?? null,
        patch.thoan ?? null,
        patch.thoanNghia ?? null,
        at,
      ],
    );
    return rows.length > 0;
  }

  async adminListHanh(db: SqlClient): Promise<AdminHanh[]> {
    const rows = await db.query<Row>(
      `select ${HANH_COLUMNS} from tf_hanh_config
        order by array_position(array['kim','moc','thuy','hoa','tho'], hanh)`,
    );
    return rows
      .filter((row) => HANH_SET.has(String(row.hanh)))
      .map((row) => ({ ...toHanhConfig(row), updatedAt: toEpoch(row.updated_at) }));
  }

  async adminFindHanh(db: SqlClient, hanh: Hanh): Promise<AdminHanh | null> {
    const rows = await db.query<Row>(`select ${HANH_COLUMNS} from tf_hanh_config where hanh = $1`, [
      hanh,
    ]);
    const row = rows[0];
    return row ? { ...toHanhConfig(row), updatedAt: toEpoch(row.updated_at) } : null;
  }

  async adminUpdateHanh(db: SqlClient, hanh: Hanh, patch: HanhPatch, at: Date): Promise<boolean> {
    const rows = await db.query<Row>(
      `update tf_hanh_config set
          nganh = coalesce($2::text[], nganh),
          mau = coalesce($3::jsonb, mau),
          huong = coalesce($4, huong),
          updated_at = $5
        where hanh = $1
        returning hanh`,
      [
        hanh,
        patch.nganh ?? null,
        patch.mau ? JSON.stringify(patch.mau) : null,
        patch.huong ?? null,
        at,
      ],
    );
    return rows.length > 0;
  }
}
