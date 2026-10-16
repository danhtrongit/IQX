import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { shouldRetryQuery } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  alertKeys,
  createAlert,
  deleteAlert,
  EVENT_PAGE_SIZE,
  getAlert,
  listAlertEvents,
  listAlerts,
  listConfigRevisions,
  listRunsForAlerts,
  previewAlertSource,
  updateAlert,
} from './api';
import type { AlertSide, AlertSourceInput } from './types';

function useAccess() {
  const { user, isPremium } = useAuth();
  return { uid: user?.id, on: !!user && isPremium };
}

export function useAlerts() {
  const { uid, on } = useAccess();
  return useQuery({ queryKey: alertKeys.list(uid), enabled: on, queryFn: ({ signal }) => listAlerts(signal), staleTime: 30_000, retry: shouldRetryQuery });
}

export function useAlertDetail(id: string | null) {
  const { uid, on } = useAccess();
  return useQuery({
    queryKey: alertKeys.detail(uid, id ?? ''),
    enabled: on && !!id,
    queryFn: ({ signal }) => getAlert(id as string, signal),
    staleTime: 0,
    retry: shouldRetryQuery,
  });
}

export function useAlertEvents(side: AlertSide | 'all') {
  const { uid, on } = useAccess();
  return useInfiniteQuery({
    queryKey: alertKeys.events(uid, side),
    enabled: on,
    initialPageParam: 0,
    queryFn: ({ signal, pageParam }) => listAlertEvents({ ...(side === 'all' ? {} : { side }), offset: pageParam, limit: EVENT_PAGE_SIZE }, signal),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return last.items.length > 0 && loaded < last.total ? loaded : undefined;
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: shouldRetryQuery,
  });
}

export function useConfigRevisions(enabled = true) {
  const { uid, on } = useAccess();
  return useQuery({ queryKey: alertKeys.revisions(uid), enabled: enabled && on, queryFn: ({ signal }) => listConfigRevisions(50, signal), staleTime: 0, retry: shouldRetryQuery });
}

export function useRunsForAlerts(enabled = true) {
  const { uid, on } = useAccess();
  return useQuery({ queryKey: alertKeys.runs(uid), enabled: enabled && on, queryFn: ({ signal }) => listRunsForAlerts(50, signal), staleTime: 0, retry: shouldRetryQuery });
}

export function useSourcePreview(source: AlertSourceInput | null) {
  const { uid, on } = useAccess();
  return useQuery({
    queryKey: alertKeys.preview(uid, source ? JSON.stringify(source) : ''),
    enabled: on && !!source,
    queryFn: ({ signal }) => previewAlertSource(source as AlertSourceInput, signal),
    staleTime: 30_000,
    retry: shouldRetryQuery,
  });
}

export function useCreateAlert() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: unknown) => createAlert(body), onSuccess: () => qc.invalidateQueries({ queryKey: alertKeys.all }) });
}

export function useUpdateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body: unknown }) => updateAlert(input.id, input.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: alertKeys.all }),
  });
}

export function useDeleteAlert() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteAlert(id), onSuccess: () => qc.invalidateQueries({ queryKey: alertKeys.all }) });
}
