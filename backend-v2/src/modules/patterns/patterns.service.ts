import { Injectable } from '@nestjs/common';
import {
  GoogleSheetsService,
  normalizedColumn,
  type SheetRow,
} from '../forecasts/google-sheets.service.js';
import type { PatternKind } from './patterns.schemas.js';

export type PatternItem = {
  symbol: string;
  name: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  signalLabel: string | null;
  state: string | null;
  meaning: string | null;
  action: string | null;
  illustration: string | null;
};

@Injectable()
export class PatternsService {
  private readonly cache = new Map<PatternKind, { expiresAt: number; rows: SheetRow[] }>();
  constructor(private readonly sheets: GoogleSheetsService) {}

  async bySymbol(kind: PatternKind, symbol: string): Promise<Record<string, unknown>> {
    const normalized = symbol.toUpperCase();
    const rows = await this.rows(kind);
    const items = rows
      .filter(
        (row) =>
          normalizedColumn(row, 'symbol', 'ticker', 'code').trim().toUpperCase() === normalized,
      )
      .map((row) => this.project(row));
    return { symbol: normalized, kind, items, count: items.length };
  }

  async symbols(kind: PatternKind): Promise<Record<string, unknown>> {
    const values = new Set(
      (await this.rows(kind))
        .map((row) => normalizedColumn(row, 'symbol', 'ticker', 'code').trim().toUpperCase())
        .filter(Boolean),
    );
    const symbols = [...values].sort();
    return { kind, symbols, count: symbols.length };
  }

  private async rows(kind: PatternKind): Promise<SheetRow[]> {
    const cached = this.cache.get(kind);
    if (cached && cached.expiresAt > Date.now()) return cached.rows;
    const rows = await this.sheets.read(kind === 'candles' ? 'CANDLE' : 'CHART');
    this.cache.set(kind, { rows, expiresAt: Date.now() + 300_000 });
    return rows;
  }

  private project(row: SheetRow): PatternItem {
    const signalLabel = normalizedColumn(row, 'tin hieu', 'signal', 'tín hiệu') || '';
    const lower = signalLabel.toLowerCase();
    const signal = /tăng|mua|bullish|tích cực/.test(lower)
      ? 'bullish'
      : /giảm|bán|bearish|tiêu cực/.test(lower)
        ? 'bearish'
        : 'neutral';
    return {
      symbol: normalizedColumn(row, 'symbol', 'ticker', 'code').trim().toUpperCase(),
      name: normalizedColumn(row, 'name', 'pattern', 'ten').trim(),
      signal,
      signalLabel: signalLabel || null,
      state: normalizedColumn(row, 'muc do', 'trang thai', 'state') || null,
      meaning: normalizedColumn(row, 'y nghia', 'meaning') || null,
      action: normalizedColumn(row, 'hanh dong', 'action') || null,
      illustration: null,
    };
  }
}
