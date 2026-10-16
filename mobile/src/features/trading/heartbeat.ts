/**
 * Demo-trading engine heartbeat. `GET /virtual-trading/orders` is read-only: pending orders only
 * fill / expire and T+ settlements only land when `POST /virtual-trading/refresh` is called.
 * State is module-level so several mounted layouts (trade + portfolio) share one in-flight call and
 * one minimum gap.
 */
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth';
import { POLL } from '@/lib/query';
import { postRefresh, refreshChanged, tradingKeys } from './api';
import type { EngineRefreshResult } from './types';

let inFlight: Promise<EngineRefreshResult | null> | null = null;
let lastStartedAt = -Infinity;

export function resetHeartbeatState(): void {
  inFlight = null;
  lastStartedAt = -Infinity;
}

/**
 * Run one heartbeat unless one is in flight or the last one started < minGapMs ago.
 * Returns the engine result, or `null` when skipped / failed (failures are non-fatal).
 */
export async function runHeartbeat(
  options: {
    refresh?: (signal?: AbortSignal) => Promise<EngineRefreshResult>;
    now?: () => number;
    minGapMs?: number;
    onChanged?: () => void;
  } = {},
): Promise<EngineRefreshResult | null> {
  const { refresh = postRefresh, now = Date.now, minGapMs = POLL.orderHeartbeatMinGapMs, onChanged } = options;
  if (inFlight) return inFlight;
  if (now() - lastStartedAt < minGapMs) return null;
  lastStartedAt = now();
  const current: Promise<EngineRefreshResult | null> = (async () => {
    try {
      const result = await refresh();
      if (refreshChanged(result)) onChanged?.();
      return result;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();
  inFlight = current;
  return current;
}

function invalidateTrading(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: tradingKeys.all });
}

/** Mount in every trading-related layout; it is safe to mount several at once. */
export function useTradingHeartbeat(): void {
  const queryClient = useQueryClient();
  const { status } = useAuth();
  const authed = status === 'authenticated';

  useEffect(() => {
    if (!authed) return;
    const beat = () => {
      void runHeartbeat({ onChanged: () => invalidateTrading(queryClient) });
    };
    beat();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(beat, POLL.orderHeartbeatMs);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        beat();
        start();
      } else stop();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [authed, queryClient]);
}
