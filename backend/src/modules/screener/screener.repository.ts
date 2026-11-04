import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import { SCREENER_DEFINITION_SCHEMA_VERSION } from './screener.registry.js';
import { emptyMarketQuality } from './screener.market.js';
import type { ScreenerRow, ScreenerRunHeader } from './screener.schemas.js';

/** Runs kept per user (newest first); older ones are pruned when a new run is stored. */
export const SCREENER_RUNS_RETAINED = 30;
/** A run is evidence for the save/apply flow, not an archive: pruned after this many days. */
export const SCREENER_RUN_RETENTION_DAYS = 14;

export type StoredScreenerRun = {
  header: ScreenerRunHeader;
  results: ScreenerRow[];
  created_at: Date;
};

export type NewScreenerRun = {
  user_id: string;
  definition_hash: string;
  header: Omit<ScreenerRunHeader, 'result_id'>;
  results: ScreenerRow[];
};

/** Persistence of server-held screener runs (faked in unit tests). */
export interface ScreenerRunStore {
  insert(run: NewScreenerRun): Promise<string>;
  /** Owner-scoped; another user's id behaves as missing. */
  find(userId: string, resultId: string): Promise<StoredScreenerRun | null>;
}

type RunRow = {
  id: string;
  definition: ScreenerRunHeader['definition'];
  as_of: Date | string;
  data_source: string;
  calculation_version: string;
  registry_version: string;
  universe_truncated: boolean;
  session_date: Date | string | null;
  summary: {
    counts: ScreenerRunHeader['counts'];
    data_quality: Partial<ScreenerRunHeader['data_quality']> & Pick<ScreenerRunHeader['data_quality'], 'metrics'>;
    legacy_review: ScreenerRunHeader['legacy_review'];
    provenance_notes: ScreenerRunHeader['provenance_notes'];
    fundamental_candidates?: number | null;
    price_source?: string | null;
  };
  results: ScreenerRow[];
  created_at: Date | string;
};

@Injectable()
export class ScreenerRunRepository implements ScreenerRunStore {
  constructor(private readonly database: DatabaseService) {}

  async insert(run: NewScreenerRun): Promise<string> {
    const id = randomUUID();
    const { header } = run;
    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO screener_runs
           (id, user_id, definition, definition_hash, as_of, data_source, calculation_version,
            registry_version, universe_truncated, summary, results, session_date)
         VALUES ($1, $2, $3::jsonb, $4, $5::timestamptz, $6, $7, $8, $9, $10::jsonb, $11::jsonb,
                 $12::date)`,
        [
          id,
          run.user_id,
          JSON.stringify(header.definition),
          run.definition_hash,
          header.as_of,
          header.data_source,
          header.calculation_version,
          header.registry_version,
          header.universe_truncated,
          JSON.stringify({
            counts: header.counts,
            data_quality: header.data_quality,
            legacy_review: header.legacy_review,
            provenance_notes: header.provenance_notes,
            fundamental_candidates: header.fundamental_candidates,
            price_source: header.price_source,
          }),
          JSON.stringify(run.results),
          header.session_date,
        ],
      );
      // Bounded retention: newest N per user and nothing older than the retention window.
      await client.query(
        `DELETE FROM screener_runs
          WHERE user_id = $1
            AND (created_at < now() - ($2::integer * interval '1 day')
                 OR id NOT IN (SELECT id FROM screener_runs WHERE user_id = $1
                                ORDER BY created_at DESC, id DESC LIMIT $3))`,
        [run.user_id, SCREENER_RUN_RETENTION_DAYS, SCREENER_RUNS_RETAINED],
      );
    });
    return id;
  }

  async find(userId: string, resultId: string): Promise<StoredScreenerRun | null> {
    const [row] = await this.database.query<RunRow>(
      `SELECT id, definition, as_of, data_source, calculation_version, registry_version,
              universe_truncated, session_date, summary, results, created_at
         FROM screener_runs WHERE id = $1 AND user_id = $2`,
      [resultId, userId],
    );
    if (!row) return null;
    return {
      header: {
        result_id: row.id,
        schema_version: SCREENER_DEFINITION_SCHEMA_VERSION,
        data_mode: 'latest_disclosed',
        as_of: new Date(row.as_of).toISOString(),
        session_date:
          row.session_date === null
            ? null
            : row.session_date instanceof Date
              ? row.session_date.toISOString().slice(0, 10)
              : String(row.session_date).slice(0, 10),
        definition: row.definition,
        legacy_review: row.summary.legacy_review,
        data_source: row.data_source,
        price_source: row.summary.price_source ?? null,
        calculation_version: row.calculation_version,
        registry_version: row.registry_version,
        universe_truncated: row.universe_truncated,
        fundamental_candidates: row.summary.fundamental_candidates ?? null,
        provenance_notes: row.summary.provenance_notes,
        counts: row.summary.counts,
        data_quality: {
          metrics: row.summary.data_quality.metrics,
          market: row.summary.data_quality.market ?? emptyMarketQuality(),
          technical: row.summary.data_quality.technical ?? [],
        },
      },
      // Rows stored before 4.0 (retention is 14 days) have no market/technical/group fields.
      results: row.results.map((item) => ({
        ...item,
        group: item.group ?? null,
        market: item.market ?? { price: null, change_pct: null, market_cap: null, avg_value: null },
        technical: item.technical ?? {},
      })),
      created_at: new Date(row.created_at),
    };
  }
}
