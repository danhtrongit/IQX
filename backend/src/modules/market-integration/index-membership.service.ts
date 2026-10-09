import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import { IndexMembershipProvider, normalizeIndexCode } from './index-membership.provider.js';
import { vnToday } from './integration.utils.js';

export type IndexMembershipSnapshot = {
  index_code: string;
  session_date: string;
  symbols: string[];
  source: string;
  fetched_at: string;
  source_hash: string;
};

export type MembershipCaptureResult =
  | { status: 'stored' | 'exists'; index_code: string; session_date: string; count: number }
  | {
      status: 'unavailable' | 'not_current_session';
      index_code: string;
      session_date: string;
      reason: string;
    };

type SnapshotRow = {
  index_code: string;
  session_date: Date | string;
  symbols: string[];
  source: string;
  fetched_at: Date | string;
  source_hash: string;
};

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const day = (value: Date | string): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

/**
 * Per-session index membership. A snapshot belongs to exactly one session and is never
 * rewritten: today's constituents must not rewrite the source a past run already used.
 */
@Injectable()
export class IndexMembershipService {
  private readonly logger = new Logger(IndexMembershipService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly provider: IndexMembershipProvider,
  ) {}

  async snapshot(indexCode: string, sessionDate: string): Promise<IndexMembershipSnapshot | null> {
    const rows = await this.database.query<SnapshotRow>(
      `select index_code, session_date, symbols, source, fetched_at, source_hash
         from index_membership_snapshots
        where index_code = $1 and session_date = $2::date`,
      [normalizeIndexCode(indexCode), sessionDate],
    );
    const row = rows[0];
    return row
      ? {
          index_code: row.index_code,
          session_date: day(row.session_date),
          symbols: [...new Set(row.symbols)].sort(),
          source: row.source,
          fetched_at: iso(row.fetched_at),
          source_hash: row.source_hash,
        }
      : null;
  }

  /** Latest stored snapshot on or before `sessionDate` (display only, never a Bot source). */
  async latestOnOrBefore(
    indexCode: string,
    sessionDate: string,
  ): Promise<IndexMembershipSnapshot | null> {
    const rows = await this.database.query<SnapshotRow>(
      `select index_code, session_date, symbols, source, fetched_at, source_hash
         from index_membership_snapshots
        where index_code = $1 and session_date <= $2::date
        order by session_date desc limit 1`,
      [normalizeIndexCode(indexCode), sessionDate],
    );
    const row = rows[0];
    return row
      ? {
          index_code: row.index_code,
          session_date: day(row.session_date),
          symbols: [...new Set(row.symbols)].sort(),
          source: row.source,
          fetched_at: iso(row.fetched_at),
          source_hash: row.source_hash,
        }
      : null;
  }

  /**
   * Stores the constituents observed now for `sessionDate`, only when it is today's Vietnam
   * session and no snapshot exists yet. Past sessions are never written.
   */
  async capture(
    indexCode: string,
    sessionDate: string,
    now = new Date(),
  ): Promise<MembershipCaptureResult> {
    const code = normalizeIndexCode(indexCode);
    if (sessionDate !== vnToday(now)) {
      return {
        status: 'not_current_session',
        index_code: code,
        session_date: sessionDate,
        reason: 'The constituents feed has no history; only the current session can be stored',
      };
    }
    const existing = await this.snapshot(code, sessionDate);
    if (existing) {
      return {
        status: 'exists',
        index_code: code,
        session_date: sessionDate,
        count: existing.symbols.length,
      };
    }
    try {
      const fetched = await this.provider.fetchCurrent(code);
      const inserted = await this.database.query<{ index_code: string }>(
        `insert into index_membership_snapshots
           (index_code, session_date, symbols, source, fetched_at, source_hash)
         values ($1, $2::date, $3::text[], $4, $5, $6)
         on conflict (index_code, session_date) do nothing
         returning index_code`,
        [code, sessionDate, fetched.symbols, fetched.source, now, fetched.source_hash],
      );
      return {
        status: inserted.length ? 'stored' : 'exists',
        index_code: code,
        session_date: sessionDate,
        count: fetched.symbols.length,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${code} membership unavailable for ${sessionDate}: ${reason}`);
      return { status: 'unavailable', index_code: code, session_date: sessionDate, reason };
    }
  }

  /** The stored snapshot for the session; one fetch attempt only when it is today's session. */
  async ensureForSession(
    indexCode: string,
    sessionDate: string,
    now = new Date(),
  ): Promise<IndexMembershipSnapshot | null> {
    const stored = await this.snapshot(indexCode, sessionDate);
    if (stored) return stored;
    if (sessionDate !== vnToday(now)) return null;
    await this.capture(indexCode, sessionDate, now);
    return this.snapshot(indexCode, sessionDate);
  }
}
