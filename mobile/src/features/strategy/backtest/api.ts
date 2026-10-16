import { apiData, apiRequest } from '@/lib/api';
import type { BacktestRequest, BacktestRun, TradesPage } from './types';

export const backtestKeys = {
  list: ['strategy', 'backtests'] as const,
  run: (id: string) => ['strategy', 'backtests', id] as const,
  trades: (id: string) => ['strategy', 'backtests', id, 'trades'] as const,
};

export const TRADES_PAGE = 25;

export const fetchBacktests = (signal?: AbortSignal) =>
  apiData<{ items?: BacktestRun[] } | BacktestRun[]>('/strategy/backtests', { query: { limit: 50 }, signal }).then((d) =>
    Array.isArray(d) ? d : (d.items ?? []),
  );

export const fetchBacktest = (id: string, signal?: AbortSignal) => apiData<BacktestRun>(`/strategy/backtests/${id}`, { signal });

export const fetchTrades = (id: string, offset: number, signal?: AbortSignal) =>
  apiData<TradesPage>(`/strategy/backtests/${id}/trades`, { query: { offset, limit: TRADES_PAGE }, signal });

export function runBacktest(req: BacktestRequest, sharedRevision: number, idempotencyKey: string) {
  return apiData<BacktestRun>('/strategy/backtests', {
    method: 'POST',
    timeoutMs: 120_000,
    body: { idempotency_key: idempotencyKey, shared_revision: sharedRevision, ...req },
  });
}

export { apiRequest };
