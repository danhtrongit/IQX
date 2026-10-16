import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { POLL } from '@/lib/query';
import { fetchDailyCloses, fetchQuote, marketKeys, normalizeSymbol, searchTradableSymbols } from './api';

/** Live quote polled every 15s while the app is in the foreground (DESIGN §8). */
export function useQuote(symbol: string | null | undefined) {
  const code = symbol ? normalizeSymbol(symbol) : '';
  return useQuery({
    queryKey: marketKeys.quote(code),
    queryFn: ({ signal }) => fetchQuote(code, signal),
    enabled: code !== '',
    staleTime: 10_000,
    refetchInterval: POLL.quotesMs,
  });
}

export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function useSymbolSearch(query: string) {
  const q = useDebouncedValue(query.trim());
  return useQuery({
    queryKey: marketKeys.search(q),
    queryFn: ({ signal }) => searchTradableSymbols(q, signal),
    enabled: q.length > 0,
    staleTime: 60_000,
  });
}

export function useDailyCloses(symbol: string, start: string, end: string) {
  const code = normalizeSymbol(symbol);
  return useQuery({
    queryKey: marketKeys.ohlcv(code, start, end),
    queryFn: ({ signal }) => fetchDailyCloses(code, start, end, signal),
    enabled: code !== '',
    staleTime: 10 * 60_000,
  });
}
