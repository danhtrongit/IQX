import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../../platform/database/index.js';
import type {
  HistoricalJourneyLevel,
  JourneyAccountSnapshot,
  JourneyLevel,
  JourneyProgressRow,
} from './journey-core.types.js';

const CURRENT_MAX_LEVEL = 6 as const;

@Injectable()
export class CoreJourneyService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Resolve from authoritative progress rows. Historical Cấp 7/8 rows remain
   * readable, while the current product contract deliberately exposes Cấp 6.
   */
  async getLevel(tx: SqlClient, userId: string): Promise<JourneyLevel | null> {
    const rows = await this.progressRows(tx, userId);
    if (rows.length > 0) {
      const highest = Math.max(...rows.map((row) => row.level));
      const cap0 = rows.find((row) => row.level === 0);
      if (highest === 0) {
        const [placement] = await tx.query<{ placed_level: number }>(
          'select placed_level from user_placement where user_id = $1 limit 1',
          [userId],
        );
        if (placement && Number.isInteger(placement.placed_level) && placement.placed_level > 0) {
          return Math.min(placement.placed_level, CURRENT_MAX_LEVEL) as JourneyLevel;
        }
        // Graduation unlocks the next active level. Cấp 0 is therefore a
        // bootstrap row rather than the active learning level after completion.
        if (cap0?.graduated_at != null) return 1;
      }
      return Math.min(highest, CURRENT_MAX_LEVEL) as JourneyLevel;
    }

    const [placement] = await tx.query<{ placed_level: number }>(
      'select placed_level from user_placement where user_id = $1 limit 1',
      [userId],
    );
    if (!placement || !Number.isInteger(placement.placed_level)) return null;
    return Math.min(Math.max(placement.placed_level, 0), CURRENT_MAX_LEVEL) as JourneyLevel;
  }

  async getActiveLevel(tx: SqlClient, userId: string): Promise<JourneyLevel | null> {
    return this.getLevel(tx, userId);
  }

  async requireLevel(
    tx: SqlClient,
    userId: string,
    expected: JourneyLevel | readonly JourneyLevel[],
  ): Promise<JourneyLevel> {
    const actual = await this.getActiveLevel(tx, userId);
    const allowed = Array.isArray(expected) ? expected : [expected];
    if (actual === null || !allowed.includes(actual)) {
      throw new ConflictException({
        code: 'JOURNEY_LEVEL_MISMATCH',
        message: 'Cấp hành trình hiện tại không phù hợp',
        details: { expected: allowed, actual },
      });
    }
    return actual;
  }

  async progressRows(tx: SqlClient, userId: string): Promise<JourneyProgressRow[]> {
    const rows = await tx.query<{
      level: number;
      entered_at: Date | string;
      graduated_at: Date | string | null;
    }>(
      `select level, entered_at, graduated_at
       from (
         select 0 as level, entered_at, graduated_at from cap0_progress where user_id = $1
         union all select 1, entered_at, graduated_at from cap1_progress where user_id = $1
         union all select 2, entered_at, graduated_at from cap2_progress where user_id = $1
         union all select 3, entered_at, graduated_at from cap3_progress where user_id = $1
         union all select 4, entered_at, graduated_at from cap4_progress where user_id = $1
         union all select 5, entered_at, graduated_at from cap5_progress where user_id = $1
         union all select 6, entered_at, graduated_at from cap6_progress where user_id = $1
         union all select 7, entered_at, graduated_at from cap7_progress where user_id = $1
         union all select 8, entered_at, graduated_at from cap8_progress where user_id = $1
       ) progress
       order by level asc`,
      [userId],
    );
    return rows.map((row) => ({
      ...row,
      level: row.level as HistoricalJourneyLevel,
    }));
  }

  async getAccountSnapshot(
    tx: SqlClient,
    userId: string,
    options: { lock?: boolean } = {},
  ): Promise<JourneyAccountSnapshot> {
    const [row] = await tx.query<JourneyAccountSnapshot>(
      `select id, user_id, status, initial_cash_vnd::text, cash_available_vnd::text,
              cash_reserved_vnd::text, cash_pending_vnd::text
       from virtual_trading_accounts
       where user_id = $1
       limit 1${options.lock ? ' for update' : ''}`,
      [userId],
    );
    if (!row) {
      throw new NotFoundException({
        code: 'TRADING_ACCOUNT_NOT_FOUND',
        message: 'Không tìm thấy tài khoản giao dịch ảo',
      });
    }
    return row;
  }

  async withTransaction<T>(operation: (tx: SqlClient) => Promise<T>): Promise<T> {
    return this.database.transaction(operation);
  }
}
