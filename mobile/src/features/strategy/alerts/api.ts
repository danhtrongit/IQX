import { apiData, apiRequest } from '@/lib/api';
import type {
  AlertDetail,
  AlertEventPage,
  AlertSide,
  AlertSourceInput,
  AlertSourcePreview,
  ConfigRevision,
  RunRow,
  StrategyAlert,
} from './types';

export const EVENT_PAGE_SIZE = 25;

export const alertKeys = {
  all: ['strategy', 'alerts'] as const,
  list: (uid: unknown) => ['strategy', 'alerts', 'list', uid] as const,
  detail: (uid: unknown, id: string) => ['strategy', 'alerts', 'detail', uid, id] as const,
  events: (uid: unknown, side: string) => ['strategy', 'alerts', 'events', uid, side] as const,
  preview: (uid: unknown, fp: string) => ['strategy', 'alerts', 'preview', uid, fp] as const,
  revisions: (uid: unknown) => ['strategy', 'alerts', 'revisions', uid] as const,
  runs: (uid: unknown) => ['strategy', 'alerts', 'runs', uid] as const,
};

export async function listAlerts(signal?: AbortSignal): Promise<StrategyAlert[]> {
  const res = await apiData<{ items: StrategyAlert[] }>('/strategy/alerts', { signal });
  return res?.items ?? [];
}

export const getAlert = (id: string, signal?: AbortSignal) => apiData<AlertDetail>(`/strategy/alerts/${id}`, { signal });

export const createAlert = (body: unknown) => apiData<AlertDetail>('/strategy/alerts', { method: 'POST', body });

export const updateAlert = (id: string, body: unknown) => apiData<AlertDetail>(`/strategy/alerts/${id}`, { method: 'PATCH', body });

export async function deleteAlert(id: string): Promise<void> {
  await apiRequest(`/strategy/alerts/${id}`, { method: 'DELETE' });
}

export const previewAlertSource = (source: AlertSourceInput, signal?: AbortSignal) =>
  apiData<AlertSourcePreview>('/strategy/alerts/source-preview', { method: 'POST', body: { source }, signal });

export function listAlertEvents(query: { side?: AlertSide; offset: number; limit: number }, signal?: AbortSignal) {
  return apiData<AlertEventPage>('/strategy/alerts/events', { query, signal });
}

export async function listConfigRevisions(limit: number, signal?: AbortSignal): Promise<ConfigRevision[]> {
  const res = await apiData<ConfigRevision[] | { items: ConfigRevision[] }>('/strategy/shared-config/revisions', { query: { limit }, signal });
  return Array.isArray(res) ? res : (res?.items ?? []);
}

export async function listRunsForAlerts(limit: number, signal?: AbortSignal): Promise<RunRow[]> {
  const res = await apiData<{ items: RunRow[] }>('/strategy/backtests', { query: { limit }, signal });
  return res?.items ?? [];
}
