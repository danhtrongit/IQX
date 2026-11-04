import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import { detectIndustry, type Industry } from '../financials/financials.industry.js';
import { VciMarketProvider } from '../market-data/providers/vci.provider.js';
import { finite } from './integration.utils.js';

/**
 * Per-symbol attributes the screener needs BEFORE it calls any financial report (Bộ lọc 4.0 §2.3,
 * §10): the financial-statement template (Ngành: thuong | nh | ck | bh) and the share count behind
 * Vốn hóa. Both come from VCI, the source the fundamental metrics already use:
 *  - template: `detectIndustry` on the income statement, the SAME function the screener applies to
 *    decide `not_applicable` for `non_financial` metrics, so the two can never disagree;
 *  - shares: `number_of_shares_mkt_cap` of the latest statistics-financial row.
 */

/** The template is re-read weekly (it changes only when a company changes its report form). */
export const TEMPLATE_TTL_MS = 7 * 86_400_000;
/** Shares change with issuance; refreshed daily. */
export const SHARES_TTL_MS = 86_400_000;
const FETCH_CONCURRENCY = 4;
/** Symbols handled per job tick, so one tick stays short and the pass completes over a few ticks. */
const BATCH_LIMIT = 500;

export type AttributesOutcome = {
  due: number;
  processed: number;
  template_updated: number;
  shares_updated: number;
  failed: number;
  elapsed_ms: number;
  errors: string[];
};

type DueRow = { symbol: string; template_due: boolean; shares_due: boolean };

@Injectable()
export class SymbolAttributesService {
  private readonly logger = new Logger(SymbolAttributesService.name);
  private running = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly vci: VciMarketProvider,
  ) {}

  /** Statement template of a company from its VCI income statement rows. */
  async fetchTemplate(symbol: string): Promise<Industry> {
    const income = await this.vci.fetchFinancialRaw(symbol, 'INCOME_STATEMENT');
    return detectIndustry(
      income.data as { years?: readonly Record<string, unknown>[]; quarters?: readonly Record<string, unknown>[] },
    );
  }

  /** Shares on VCI's market-cap basis; null when the source has none. */
  async fetchShares(symbol: string): Promise<number | null> {
    const report = await this.vci.fetchFinancialReport(symbol, 'ratio', { period: 'Q' });
    const rows = Array.isArray(report.data) ? (report.data as Record<string, unknown>[]) : [];
    const shares = finite(rows[0]?.number_of_shares_mkt_cap);
    return shares !== null && shares > 0 ? Math.round(shares) : null;
  }

  /** Job body: handles the symbols whose template or share count is missing or past its TTL. */
  async ensureFresh(now = new Date(), limit = BATCH_LIMIT): Promise<AttributesOutcome> {
    const started = Date.now();
    const outcome: AttributesOutcome = {
      due: 0,
      processed: 0,
      template_updated: 0,
      shares_updated: 0,
      failed: 0,
      elapsed_ms: 0,
      errors: [],
    };
    if (this.running) return outcome;
    this.running = true;
    try {
      const rows = await this.database.query<DueRow>(
        `select upper(symbol) as symbol,
                (statement_template is null
                 or statement_template_at is null
                 or statement_template_at < $1::timestamptz - ($2::bigint * interval '1 millisecond')) as template_due,
                (shares_outstanding is null
                 or shares_at is null
                 or shares_at < $1::timestamptz - ($3::bigint * interval '1 millisecond')) as shares_due
           from symbols
          where is_active = true
            and coalesce(is_index, false) = false
            and lower(asset_type) = 'stock'
            and upper(coalesce(exchange, '')) in ('HOSE', 'HNX', 'UPCOM')
            and (statement_template is null or statement_template_at is null
                 or statement_template_at < $1::timestamptz - ($2::bigint * interval '1 millisecond')
                 or shares_outstanding is null or shares_at is null
                 or shares_at < $1::timestamptz - ($3::bigint * interval '1 millisecond'))
          order by (statement_template is null) desc, (shares_outstanding is null) desc, upper(symbol)
          limit $4`,
        [now, TEMPLATE_TTL_MS, SHARES_TTL_MS, limit],
      );
      outcome.due = rows.length;
      let next = 0;
      const lanes = Array.from({ length: Math.min(FETCH_CONCURRENCY, rows.length) }, async () => {
        while (next < rows.length) {
          const row = rows[next]!;
          next += 1;
          try {
            if (row.template_due) {
              const template = await this.fetchTemplate(row.symbol);
              await this.database.query(
                `update symbols set statement_template = $2, statement_template_at = $3
                  where upper(symbol) = $1`,
                [row.symbol, template, now],
              );
              outcome.template_updated += 1;
            }
            if (row.shares_due) {
              const shares = await this.fetchShares(row.symbol);
              if (shares !== null) {
                await this.database.query(
                  `update symbols set shares_outstanding = $2, shares_at = $3
                    where upper(symbol) = $1`,
                  [row.symbol, shares, now],
                );
                outcome.shares_updated += 1;
              }
            }
            outcome.processed += 1;
          } catch (error) {
            outcome.failed += 1;
            if (outcome.errors.length < 5)
              outcome.errors.push(
                `${row.symbol}: ${error instanceof Error ? error.message : String(error)}`,
              );
          }
        }
      });
      await Promise.all(lanes);
      outcome.elapsed_ms = Date.now() - started;
      if (outcome.due)
        this.logger.log(
          `Symbol attributes: ${outcome.processed}/${outcome.due} processed ` +
            `(${outcome.template_updated} templates, ${outcome.shares_updated} share counts, ${outcome.failed} failed) in ${outcome.elapsed_ms} ms`,
        );
      return outcome;
    } finally {
      this.running = false;
    }
  }
}
