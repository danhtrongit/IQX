import { Injectable } from '@nestjs/common';
import {
  GoogleSheetsService,
  normalizedColumn,
  parseSheetNumber,
  type SheetRow,
} from './google-sheets.service.js';
import type { ForecastHorizon } from './forecasts.schemas.js';

export type ForecastItem = {
  rank: number;
  symbol: string;
  expectedReturn: number;
  projectedPrice: number | null;
  upProbability: number | null;
};
type Projected = {
  symbol: string;
  expectedReturn: number | null;
  projectedPrice: number | null;
  upProbability: number | null;
};

@Injectable()
export class ForecastsService {
  private rowsCache: { expiresAt: number; rows: SheetRow[] } | null = null;
  constructor(private readonly sheets: GoogleSheetsService) {}

  async ranking(horizon: ForecastHorizon, limit: number): Promise<Record<string, unknown>> {
    const rows = await this.rows();
    const items = rows
      .map((row) => this.project(row, horizon))
      .filter(
        (item): item is Projected & { expectedReturn: number } =>
          !!item && item.expectedReturn !== null,
      )
      .sort((a, b) => b.expectedReturn - a.expectedReturn)
      .slice(0, limit)
      .map((item, index) => ({ ...item, rank: index + 1 }));
    return { horizon: `T+${horizon}`, horizonDays: Number(horizon), count: items.length, items };
  }

  async symbol(symbol: string): Promise<Record<string, unknown>> {
    const normalized = symbol.toUpperCase();
    const row = (await this.rows()).find(
      (item) => normalizedColumn(item, 'ticker', 'symbol', 'code').toUpperCase() === normalized,
    );
    const forecasts = (['3', '5', '10'] as const).map((horizon) => {
      const projected = row ? this.project(row, horizon) : null;
      return {
        horizon: `T+${horizon}`,
        horizonDays: Number(horizon),
        projectedPrice: projected?.projectedPrice ?? null,
        expectedReturn: projected?.expectedReturn ?? null,
        upProbability: projected?.upProbability ?? null,
      };
    });
    return { symbol: normalized, forecasts };
  }

  private async rows(): Promise<SheetRow[]> {
    if (this.rowsCache && this.rowsCache.expiresAt > Date.now()) return this.rowsCache.rows;
    const rows = await this.sheets.read('Du_Bao');
    this.rowsCache = { rows, expiresAt: Date.now() + 300_000 };
    return rows;
  }

  private project(row: SheetRow, horizon: ForecastHorizon): Projected | null {
    const suffix = `t${horizon}`;
    const symbol = normalizedColumn(row, 'ticker', 'symbol', 'code').trim().toUpperCase();
    if (!symbol) return null;
    const projectedPrice = parseSheetNumber(
      normalizedColumn(
        row,
        `price${suffix}`,
        `projectedprice${suffix}`,
        `targetprice${suffix}`,
        ...(horizon === '5' ? ['price', 'projectedprice', 'targetprice'] : []),
      ),
    );
    const expectedReturn = parseSheetNumber(
      normalizedColumn(
        row,
        `return${suffix}`,
        `expectedreturn${suffix}`,
        `upside${suffix}`,
        ...(horizon === '5' ? ['return', 'expectedreturn', 'upside'] : []),
      ),
    );
    const upProbability = parseSheetNumber(
      normalizedColumn(
        row,
        `upprobability${suffix}`,
        `probability${suffix}`,
        ...(horizon === '5' ? ['upprobability', 'probability'] : []),
      ),
    );
    if (expectedReturn === null) return { symbol, projectedPrice, expectedReturn, upProbability };
    return { symbol, expectedReturn, projectedPrice, upProbability };
  }
}
