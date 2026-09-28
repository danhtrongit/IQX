import type { ChartDrawing, ChartDrawingRow, LegacyChartDrawing } from './chart-drawings.types.js';

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value.replace(' ', 'T');
}

export function toLegacyChartDrawing(
  symbol: string,
  row: ChartDrawingRow | null,
): LegacyChartDrawing {
  return {
    symbol,
    state: row?.state ?? null,
    updated_at: row ? timestamp(row.updated_at) : null,
  };
}

export function toChartDrawing(symbol: string, row: ChartDrawingRow | null): ChartDrawing {
  return {
    symbol,
    state: row?.state ?? null,
    updatedAt: row ? timestamp(row.updated_at) : null,
  };
}
