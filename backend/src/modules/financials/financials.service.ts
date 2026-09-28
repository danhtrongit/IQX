import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  MarketDataService,
  MarketTransportError,
  VciMarketProvider,
} from '../market-data/index.js';
import type { JsonObject } from '../market-data/index.js';
import { buildBctcPayload } from './bctc.js';
import { applyBenchmark, emptyMedians, PEER_METRIC_FIELDS } from './benchmark.js';
import { assembleDashboard } from './dashboard.js';
import { finite, median } from './financials.calculations.js';
import { PeerMediansRepository } from './peer-medians.repository.js';
import type { FinancialRow, FinancialStatements } from './financials.types.js';

export interface FinancialEnvelope<T> {
  data: T;
  meta: { source: string; source_url: string; term_type: 1 | 2 };
}

@Injectable()
export class FinancialsService {
  constructor(
    private readonly vci: VciMarketProvider,
    private readonly market: MarketDataService,
    private readonly peers: PeerMediansRepository,
  ) {}

  async snapshot(symbol: string, termType: 1 | 2) {
    const sym = symbol.toUpperCase();
    const statementsResult = await this.vci
      .fetchBctcStatements(sym, termType)
      .catch((error: unknown) => {
        if (error instanceof MarketTransportError)
          throw new ServiceUnavailableException({
            code: 'FINANCIAL_PROVIDER_UNAVAILABLE',
            message: 'Dữ liệu báo cáo tài chính tạm thời không khả dụng',
          });
        throw error;
      });
    const statements = this.normalizeStatements(statementsResult.data);
    const [ratioResult, overviewResult] = await Promise.allSettled([
      this.vci.fetchFinancialReport(sym, 'ratio', { period: 'Y', termType }),
      this.market.companyOverview(sym),
    ]);
    const ratioRows =
      ratioResult.status === 'fulfilled' && Array.isArray(ratioResult.value.data)
        ? ratioResult.value.data.filter(this.isRow)
        : [];
    const overview =
      overviewResult.status === 'fulfilled' && this.isRow(overviewResult.value.data)
        ? overviewResult.value.data
        : {};
    return {
      symbol: sym,
      termType,
      statements,
      ratioRows,
      overview,
      sourceUrl: statementsResult.rawEndpoint,
    };
  }

  async getBctc(
    symbol: string,
    termType: 1 | 2 = 1,
  ): Promise<FinancialEnvelope<Record<string, unknown>>> {
    const s = await this.snapshot(symbol, termType);
    return {
      data: buildBctcPayload(
        s.statements.balance_sheet,
        s.statements.income_statement,
        s.statements.cash_flow,
        s.ratioRows,
      ),
      meta: { source: 'VCI', source_url: s.sourceUrl, term_type: termType },
    };
  }

  async getDashboard(
    symbol: string,
    termType: 1 | 2 = 1,
  ): Promise<FinancialEnvelope<Record<string, unknown>>> {
    const s = await this.snapshot(symbol, termType);
    const dashboard = assembleDashboard(
      s.statements.balance_sheet,
      s.statements.income_statement,
      s.statements.cash_flow,
      s.ratioRows,
      s.overview,
      s.symbol,
    );
    const sector =
      typeof s.overview.icb_lv2 === 'string'
        ? s.overview.icb_lv2
        : typeof s.overview.icb_name_2 === 'string'
          ? s.overview.icb_name_2
          : null;
    if (sector) {
      try {
        const result = await this.getSectorMedians(sector);
        applyBenchmark(dashboard, result.medians);
        dashboard.meta.peer_count = result.peerCount;
        (dashboard.meta as { peer_asof: string | null }).peer_asof = this.today();
      } catch {
        /* deterministic dashboard degrades without peers */
      }
    }
    return {
      data: dashboard,
      meta: { source: 'VCI', source_url: s.sourceUrl, term_type: termType },
    };
  }

  private async getSectorMedians(sector: string) {
    const asof = this.today(),
      cached = await this.peers.find(sector, asof);
    if (cached) return cached;
    const symbols = await this.peers.peerSymbols(sector, 20);
    const settled = await Promise.allSettled(
      symbols.map((s) => this.vci.fetchFinancialReport(s, 'ratio', { period: 'Y', termType: 1 })),
    );
    const usable: Record<string, number>[] = [];
    for (const result of settled) {
      if (result.status !== 'fulfilled' || !Array.isArray(result.value.data)) continue;
      const newest = result.value.data.find(this.isRow);
      if (!newest) continue;
      const row: Record<string, number> = {};
      for (const [key, candidates] of Object.entries(PEER_METRIC_FIELDS)) {
        for (const candidate of candidates) {
          const n = finite(newest[candidate]);
          if (n !== undefined) {
            row[key] = n;
            break;
          }
        }
      }
      if (Object.keys(row).length) usable.push(row);
    }
    const medians = emptyMedians();
    if (usable.length >= 3) {
      for (const key of Object.keys(PEER_METRIC_FIELDS)) {
        const xs = usable.flatMap((r) => (r[key] === undefined ? [] : [r[key]!]));
        medians[key] = median(xs);
      }
    }
    return this.peers.upsert(sector, asof, medians, usable.length);
  }
  private today() {
    return new Date().toISOString().slice(0, 10);
  }
  private readonly isRow = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  private normalizeStatements(raw: Record<string, JsonObject[]>): FinancialStatements {
    return {
      balance_sheet: (raw.balance_sheet ?? []) as FinancialRow[],
      income_statement: (raw.income_statement ?? []) as FinancialRow[],
      cash_flow: (raw.cash_flow ?? []) as FinancialRow[],
    };
  }
}
