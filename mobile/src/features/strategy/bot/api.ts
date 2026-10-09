import { apiData } from '@/lib/api';
import type { BotOverview, BotPosition, BotSession, BotSessionItem, BotTrade, Page } from './types';

export const botKeys = {
  all: ['bot'] as const,
  overview: ['bot', 'overview'] as const,
  positions: ['bot', 'positions'] as const,
  trades: ['bot', 'trades'] as const,
  sessions: ['bot', 'sessions'] as const,
  session: (s: string) => ['bot', 'sessions', s] as const,
};

export const PAGE = 30;

export const fetchBot = (signal?: AbortSignal) => apiData<BotOverview>('/bot', { signal });
export const fetchPositions = (signal?: AbortSignal) =>
  apiData<Page<BotPosition> | BotPosition[]>('/bot/positions', { signal }).then((d) => (Array.isArray(d) ? d : (d.items ?? [])));
export const fetchTrades = (cursor: string | undefined, signal?: AbortSignal) =>
  apiData<Page<BotTrade>>('/bot/trades', { query: { limit: PAGE, cursor }, signal });
export const fetchSessions = (cursor: string | undefined, signal?: AbortSignal) =>
  apiData<Page<BotSession>>('/bot/journal/sessions', { query: { limit: PAGE, cursor }, signal });
export const fetchSessionDetail = (session: string, cursor: string | undefined, signal?: AbortSignal) =>
  apiData<Page<BotSessionItem> & { session?: BotSession }>(`/bot/journal/sessions/${session}`, { query: { limit: 100, cursor }, signal });
