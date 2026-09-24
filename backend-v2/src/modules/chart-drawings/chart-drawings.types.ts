import type { DrawingState } from './chart-drawings.schemas.js';

export type ChartDrawingRow = {
  id: string;
  user_id: string;
  symbol: string;
  state: DrawingState;
  created_at: Date | string;
  updated_at: Date | string;
};

export type LegacyChartDrawing = {
  symbol: string;
  state: DrawingState | null;
  updated_at: string | null;
};

export type ChartDrawing = {
  symbol: string;
  state: DrawingState | null;
  updatedAt: string | null;
};
