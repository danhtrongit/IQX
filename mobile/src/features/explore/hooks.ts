import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addToWatchlist,
  exploreKeys,
  fetchHuntFilters,
  fetchHuntResult,
  fetchNews,
  fetchNewsArticle,
  fetchPatterns,
  nextNewsPage,
  WATCHLIST_KEY,
  type NewsSentiment,
  type PatternKind,
} from './api';

export function useHuntFilters() {
  return useQuery({ queryKey: exploreKeys.huntFilters, queryFn: ({ signal }) => fetchHuntFilters(signal), staleTime: 60_000 });
}

export function useHuntResult(filter: string) {
  return useQuery({ queryKey: exploreKeys.hunt(filter), queryFn: ({ signal }) => fetchHuntResult(filter, signal), staleTime: 60_000 });
}

export function useAddToWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (symbol: string) => addToWatchlist(symbol),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });
}

export function useNews(ticker: string, sentiment: NewsSentiment) {
  return useInfiniteQuery({
    queryKey: exploreKeys.news(ticker, sentiment),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => fetchNews({ page: pageParam, ticker, sentiment }, signal),
    getNextPageParam: (last, all) => nextNewsPage(last, all),
    staleTime: 60_000,
  });
}

export function useNewsArticle(slug: string) {
  return useQuery({ queryKey: exploreKeys.article(slug), queryFn: ({ signal }) => fetchNewsArticle(slug, signal), enabled: !!slug, staleTime: 5 * 60_000 });
}

export function usePatterns(kind: PatternKind, symbol: string, enabled: boolean) {
  return useQuery({
    queryKey: exploreKeys.patterns(kind, symbol),
    queryFn: ({ signal }) => fetchPatterns(kind, symbol, signal),
    enabled: enabled && symbol !== '',
    staleTime: 5 * 60_000,
  });
}
