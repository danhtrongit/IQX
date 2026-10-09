import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { retryUnlessFinal } from '../shared/errors';
import { botKeys, fetchBot, fetchPositions, fetchSessionDetail, fetchSessions, fetchTrades } from './api';

const next = (last: { next_cursor?: string | null }) => last.next_cursor ?? undefined;

export const useBot = () => useQuery({ queryKey: botKeys.overview, queryFn: ({ signal }) => fetchBot(signal), retry: retryUnlessFinal });
export const useBotPositions = (enabled = true) =>
  useQuery({ queryKey: botKeys.positions, queryFn: ({ signal }) => fetchPositions(signal), retry: retryUnlessFinal, enabled });
export const useBotTrades = (enabled = true) =>
  useInfiniteQuery({
    queryKey: botKeys.trades,
    queryFn: ({ pageParam, signal }) => fetchTrades(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: next,
    retry: retryUnlessFinal,
    enabled,
  });
export const useBotSessions = (enabled = true) =>
  useInfiniteQuery({
    queryKey: botKeys.sessions,
    queryFn: ({ pageParam, signal }) => fetchSessions(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: next,
    retry: retryUnlessFinal,
    enabled,
  });
export const useBotSession = (session: string) =>
  useInfiniteQuery({
    queryKey: botKeys.session(session),
    queryFn: ({ pageParam, signal }) => fetchSessionDetail(session, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: next,
    retry: retryUnlessFinal,
    enabled: !!session,
  });
