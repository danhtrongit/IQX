import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
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
  summary: {
    counts: ScreenerRunHeader['counts'];
    data_quality: ScreenerRunHeader['data_quality'];
    legacy_review: ScreenerRunHeader['legacy_review'];
    provenance_notes: ScreenerRunHeader['provenance_notes'];
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
            registry_version, universe_truncated, summary, results)
         VALUES ($1, $2, $3::jsonb, $4, $5::timestamptz, $6, $7, $8, $9, $10::jsonb, $11::jsonb)`,
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
          }),
          JSON.stringify(run.results),
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
              universe_truncated, summary, results, created_at
         FROM screener_runs WHERE id = $1 AND user_id = $2`,
      [resultId, userId],
    );
    if (!row) return null;
    return {
      header: {
        result_id: row.id,
        schema_version: '3.0',
        data_mode: 'latest_disclosed',
        as_of: new Date(row.as_of).toISOString(),
        definition: row.definition,
        legacy_review: row.summary.legacy_review,
        data_source: row.data_source,
        calculation_version: row.calculation_version,
        registry_version: row.registry_version,
        universe_truncated: row.universe_truncated,
        provenance_notes: row.summary.provenance_notes,
        counts: row.summary.counts,
        data_quality: row.summary.data_quality,
      },
      results: row.results,
      created_at: new Date(row.created_at),
    };
  }
}
