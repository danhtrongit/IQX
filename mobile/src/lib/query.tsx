import NetInfo from '@react-native-community/netinfo';
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { shouldRetryQuery } from './api';

/** Polling cadence shared with the web client (mobile/DESIGN.md §8). */
export const POLL = {
  quotesMs: 15_000,
  orderHeartbeatMs: 30_000,
  orderHeartbeatMinGapMs: 3_000,
} as const;

/**
 * Pause polling when the app is backgrounded (focusManager) or offline (onlineManager) and refetch
 * on return. Pass `refetchInterval: POLL.quotesMs` on a query; react-query stops the interval while
 * unfocused (refetchIntervalInBackground stays false) and pauses fetches while offline.
 * Returns an unsubscribe function.
 */
export function wireLifecycle(): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const sub = AppState.addEventListener('change', (state: AppStateStatus) => focusManager.setFocused(state === 'active'));
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false)),
  );
  return () => sub.remove();
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnReconnect: true,
        refetchIntervalInBackground: false,
        networkMode: 'online',
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

export function QueryProvider({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? createQueryClient());

  useEffect(() => wireLifecycle(), []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
