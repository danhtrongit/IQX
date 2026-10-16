import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { retryUnlessFinal } from '../shared/errors';
import { backtestKeys, fetchBacktest, fetchBacktests, fetchTrades, TRADES_PAGE } from './api';

export const useBacktests = () =>
  useQuery({ queryKey: backtestKeys.list, queryFn: ({ signal }) => fetchBacktests(signal), retry: retryUnlessFinal });

export const useBacktest = (id: string) =>
  useQuery({ queryKey: backtestKeys.run(id), queryFn: ({ signal }) => fetchBacktest(id, signal), retry: retryUnlessFinal, enabled: !!id });

export function useBacktestTrades(id: string) {
  return useInfiniteQuery({
    queryKey: backtestKeys.trades(id),
    queryFn: ({ pageParam, signal }) => fetchTrades(id, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + TRADES_PAGE : undefined),
    retry: retryUnlessFinal,
    enabled: !!id,
  });
}
