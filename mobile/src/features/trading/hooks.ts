import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api';
import {
  activateAccount,
  addToWatchlist,
  analyzePortfolio,
  cancelOrder,
  fetchAccount,
  fetchOrders,
  fetchPortfolio,
  fetchWatchlist,
  placeOrder,
  removeFromWatchlist,
  tradingKeys,
} from './api';
import type { PlaceOrderInput } from './types';

export function useTradingAccount() {
  return useQuery({
    queryKey: tradingKeys.account,
    queryFn: ({ signal }) => fetchAccount(signal),
  });
}

export function useTradingPortfolio() {
  return useQuery({
    queryKey: tradingKeys.portfolio,
    queryFn: ({ signal }) => fetchPortfolio(signal),
  });
}

/** 503 PORTFOLIO_VALUATION_UNAVAILABLE is a warning state, not a crash. */
export function isValuationUnavailable(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'PORTFOLIO_VALUATION_UNAVAILABLE' || error.status === 503);
}

export function useTradingOrders(status: string) {
  return useInfiniteQuery({
    queryKey: tradingKeys.orders(status),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => fetchOrders({ status: status === 'all' ? undefined : status, page: pageParam }, signal),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, p) => sum + p.orders.length, 0);
      return last.orders.length > 0 && loaded < last.total ? last.page + 1 : undefined;
    },
  });
}

export function useActivateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: activateAccount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tradingKeys.all }),
  });
}

export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlaceOrderInput) => placeOrder(input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: tradingKeys.all }),
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelOrder(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: tradingKeys.all }),
  });
}

export function useWatchlist() {
  return useQuery({
    queryKey: tradingKeys.watchlist,
    queryFn: ({ signal }) => fetchWatchlist(signal),
  });
}

export function useAddToWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (symbol: string) => addToWatchlist(symbol),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tradingKeys.watchlist }),
  });
}

export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (symbol: string) => removeFromWatchlist(symbol),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tradingKeys.watchlist }),
  });
}

/** Premium AI report; generated on demand (cached server-side for the day). */
export function useAnalyzePortfolio() {
  return useMutation({ mutationFn: () => analyzePortfolio() });
}
