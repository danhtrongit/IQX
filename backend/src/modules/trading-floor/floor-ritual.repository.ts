/**
 * Lưu trữ nghi lễ Thần Tài: mỗi tài khoản một nghi lễ mỗi phiên (`tf_rituals`), điểm đóng cửa mỗi phiên
 * đã chấm (`tf_ritual_sessions`) và bảng xếp hạng. Mọi `date` đọc về dưới dạng text `YYYY-MM-DD`.
 */

import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { SqlClient } from '../../platform/database/database.service.js';
import { cleanAvatar } from './floor-profile.logic.js';
import { RITUAL_RULES, score } from './floor-ritual.logic.js';
import type {
  Leaderboard,
  MyRitual,
  RitualDirection,
  RitualStats,
  RitualToday,
} from './floor-types.js';

export const FLOOR_RITUAL_REPOSITORY = Symbol('FLOOR_RITUAL_REPOSITORY');

export interface FloorRitualRepository {
  findMine(db: SqlClient, userId: string, session: string): Promise<MyRitual | null>;
  /** false khi người này đã gieo quẻ cho phiên (không ghi đè). */
  insertDraw(
    db: SqlClient,
    userId: string,
    session: string,
    queId: number,
    at: Date,
  ): Promise<boolean>;
  /** false khi nghi lễ đã hoàn tất hoặc chưa gieo quẻ. */
  complete(
    db: SqlClient,
    input: {
      userId: string;
      session: string;
      direction: RitualDirection;
      level: number;
      tickers: readonly string[];
      at: Date;
    },
  ): Promise<boolean>;
  stats(db: SqlClient, session: string): Promise<RitualStats>;
  lastResult(db: SqlClient): Promise<RitualToday['lastResult']>;
  leaderboard(db: SqlClient, month: string): Promise<Leaderboard>;
  /** Phiên đã có nghi lễ hoàn tất mà chưa chấm, cũ nhất trước. */
  unscoredSessions(db: SqlClient): Promise<string[]>;
  /** Ghi điểm đóng cửa của phiên và chấm mọi nghi lễ đã hoàn tất; trả số nghi lễ đã chấm. */
  resolve(
    tx: SqlClient,
    session: string,
    close: number,
    change: number,
    source: string,
    at: Date,
  ): Promise<number>;
}

type Row = Record<string, unknown>;

const toNumberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const toMine = (row: Row): MyRitual => ({
  session: String(row.session),
  queId: Number(row.que_id),
  direction: (row.direction as RitualDirection | null) ?? null,
  level: toNumberOrNull(row.level),
  tickers: Array.isArray(row.tickers) ? (row.tickers as unknown[]).map(String) : [],
  createdAt: new Date(row.created_at as string | number | Date).getTime(),
  correct: row.correct === null || row.correct === undefined ? null : row.correct === true,
  error: toNumberOrNull(row.error),
});

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Khoá công khai của một người trên bảng xếp hạng: băm của id tài khoản, không lộ id thật. */
export const leaderboardId = (userId: string): string =>
  createHash('sha256').update(userId).digest('hex').slice(0, 12);

@Injectable()
export class PgFloorRitualRepository implements FloorRitualRepository {
  async findMine(db: SqlClient, userId: string, session: string): Promise<MyRitual | null> {
    const rows = await db.query<Row>(
      `select session::text as session, que_id, direction, level, tickers, created_at, correct, error
         from tf_rituals where user_id = $1 and session = $2::date`,
      [userId, session],
    );
    return rows[0] ? toMine(rows[0]) : null;
  }

  async insertDraw(
    db: SqlClient,
    userId: string,
    session: string,
    queId: number,
    at: Date,
  ): Promise<boolean> {
    const rows = await db.query<Row>(
      `insert into tf_rituals (user_id, session, que_id, created_at)
       values ($1, $2::date, $3, $4)
       on conflict (user_id, session) do nothing
       returning user_id`,
      [userId, session, queId, at],
    );
    return rows.length > 0;
  }

  async complete(
    db: SqlClient,
    input: {
      userId: string;
      session: string;
      direction: RitualDirection;
      level: number;
      tickers: readonly string[];
      at: Date;
    },
  ): Promise<boolean> {
    const rows = await db.query<Row>(
      `update tf_rituals
          set direction = $3, level = $4, tickers = $5::text[], done_at = $6
        where user_id = $1 and session = $2::date and direction is null
        returning user_id`,
      [input.userId, input.session, input.direction, input.level, [...input.tickers], input.at],
    );
    return rows.length > 0;
  }

  async stats(db: SqlClient, session: string): Promise<RitualStats> {
    const [summary] = await db.query<Row>(
      `select count(*)::int as total,
              (count(*) filter (where direction = 'up'))::int as up,
              (count(*) filter (where direction = 'down'))::int as down,
              avg(level) as avg
         from tf_rituals where session = $1::date and direction is not null`,
      [session],
    );
    const top = await db.query<Row>(
      `select t.symbol, count(*)::int as n
         from tf_rituals r, unnest(r.tickers) as t(symbol)
        where r.session = $1::date and r.direction is not null
        group by t.symbol
        order by n desc, t.symbol asc
        limit $2`,
      [session, RITUAL_RULES.topTickers],
    );
    const avg = toNumberOrNull(summary?.avg);
    return {
      session,
      total: Number(summary?.total ?? 0),
      up: Number(summary?.up ?? 0),
      down: Number(summary?.down ?? 0),
      avgLevel: avg === null ? null : round2(avg),
      topTickers: top.map((row) => ({ symbol: String(row.symbol), count: Number(row.n) })),
    };
  }

  async lastResult(db: SqlClient): Promise<RitualToday['lastResult']> {
    const rows = await db.query<Row>(
      `select s.session::text as session, s.close, s.change,
              (select count(*) from tf_rituals r
                where r.session = s.session and r.direction is not null)::int as total,
              (select count(*) from tf_rituals r
                where r.session = s.session and r.direction is not null and r.correct)::int as correct
         from tf_ritual_sessions s order by s.session desc limit 1`,
    );
    const row = rows[0];
    return row
      ? {
          session: String(row.session),
          close: Number(row.close),
          change: Number(row.change),
          total: Number(row.total),
          correct: Number(row.correct),
        }
      : null;
  }

  async leaderboard(db: SqlClient, month: string): Promise<Leaderboard> {
    const rows = await db.query<Row>(
      `select r.user_id,
              coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(u.full_name), ''), u.username) as name,
              p.avatar,
              (count(*) filter (where r.correct))::int as correct,
              count(*)::int as total,
              avg(r.error) filter (where r.correct) as avg_error,
              min(r.done_at) as first_at
         from tf_rituals r
         join users u on u.id = r.user_id
         left join tf_profiles p on p.user_id = r.user_id
        where to_char(r.session, 'YYYY-MM') = $1 and r.correct is not null
        group by r.user_id, p.display_name, p.avatar, u.full_name, u.username
       having count(*) filter (where r.correct) > 0
        order by correct desc, avg_error asc nulls last, first_at asc, r.user_id
        limit 10`,
      [month],
    );
    return {
      month,
      rows: rows.map((row, index) => {
        const avgError = toNumberOrNull(row.avg_error);
        return {
          rank: index + 1,
          id: leaderboardId(String(row.user_id)),
          name: String(row.name ?? ''),
          avatar: cleanAvatar(row.avatar) ?? 'male01',
          correct: Number(row.correct),
          total: Number(row.total),
          avgError: avgError === null ? null : round2(avgError),
        };
      }),
    };
  }

  async unscoredSessions(db: SqlClient): Promise<string[]> {
    const rows = await db.query<Row>(
      `select distinct r.session::text as session
         from tf_rituals r
         left join tf_ritual_sessions s on s.session = r.session
        where s.session is null and r.direction is not null
        order by 1`,
    );
    return rows.map((row) => String(row.session));
  }

  async resolve(
    tx: SqlClient,
    session: string,
    close: number,
    change: number,
    source: string,
    at: Date,
  ): Promise<number> {
    await tx.query(
      `insert into tf_ritual_sessions (session, close, change, source, resolved_at)
       values ($1::date, $2, $3, $4, $5)
       on conflict (session) do update
         set close = excluded.close, change = excluded.change, source = excluded.source,
             resolved_at = excluded.resolved_at`,
      [session, close, change, source, at],
    );
    const rows = await tx.query<Row>(
      `select user_id, direction, level from tf_rituals
        where session = $1::date and direction is not null for update`,
      [session],
    );
    if (rows.length === 0) return 0;
    const ids: string[] = [];
    const corrects: boolean[] = [];
    const errors: number[] = [];
    for (const row of rows) {
      const result = score(row.direction as RitualDirection, Number(row.level), close, change);
      ids.push(String(row.user_id));
      corrects.push(result.correct);
      errors.push(round2(result.error));
    }
    await tx.query(
      `update tf_rituals t set correct = v.correct, error = v.error
         from unnest($2::uuid[], $3::boolean[], $4::numeric[]) as v(user_id, correct, error)
        where t.session = $1::date and t.user_id = v.user_id`,
      [session, ids, corrects, errors],
    );
    return rows.length;
  }
}
