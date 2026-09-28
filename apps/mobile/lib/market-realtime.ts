import { AppState, type AppStateStatus } from 'react-native';
import { API_BASE_URL, api } from './api';

export type MarketChannel = 'tick' | 'orderbook' | 'ohlc' | 'index';
export type MarketRealtimeStatus = 'idle' | 'connecting' | 'connected' | 'paused' | 'fallback';
export type MarketRealtimeOptions = {
  symbols: string[];
  channels: MarketChannel[];
  onEvent: (event: Record<string, unknown>) => void;
  onStatus?: (status: MarketRealtimeStatus) => void;
  pollFallback?: () => Promise<void>;
  fallbackIntervalMs?: number;
};

type Ticket = { ticket: string; expires_at: string };

function websocketUrl(): string {
  const url = new URL(API_BASE_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/mobile/market-data/ws`;
  url.search = '';
  return url.toString();
}

/**
 * Mobile market stream. The JWT is used only for the ticket request; the
 * short-lived ticket is sent in the first WebSocket frame and never in a URL.
 */
export function createMarketRealtime(options: MarketRealtimeOptions) {
  let socket: WebSocket | null = null;
  let stopped = true;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let fallbackTimer: ReturnType<typeof setInterval> | undefined;
  let retryCount = 0;
  let appState: AppStateStatus = AppState.currentState;
  const fallbackIntervalMs = options.fallbackIntervalMs ?? 15_000;

  const setStatus = (status: MarketRealtimeStatus) => options.onStatus?.(status);
  const clearTimers = () => {
    if (retryTimer) clearTimeout(retryTimer);
    if (fallbackTimer) clearInterval(fallbackTimer);
    retryTimer = undefined;
    fallbackTimer = undefined;
  };
  const startFallback = () => {
    if (!options.pollFallback || fallbackTimer || stopped || appState !== 'active') return;
    setStatus('fallback');
    void options.pollFallback();
    fallbackTimer = setInterval(() => void options.pollFallback?.(), fallbackIntervalMs);
  };
  const scheduleReconnect = () => {
    if (stopped || appState !== 'active' || retryTimer) return;
    startFallback();
    const delay = Math.min(30_000, 500 * 2 ** retryCount + Math.round(Math.random() * 250));
    retryCount = Math.min(retryCount + 1, 6);
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void connect();
    }, delay);
  };
  const closeSocket = () => {
    socket?.close(1000, 'lifecycle');
    socket = null;
  };
  const connect = async (): Promise<void> => {
    if (stopped || appState !== 'active') return;
    setStatus('connecting');
    try {
      const ticket = await api<Ticket>('mobile/market-data/ws-ticket', { method: 'POST' });
      if (stopped || appState !== 'active') return;
      const next = new WebSocket(websocketUrl());
      socket = next;
      next.onopen = () => {
        retryCount = 0;
        if (fallbackTimer) clearInterval(fallbackTimer);
        fallbackTimer = undefined;
        setStatus('connected');
        next.send(JSON.stringify({ action: 'auth', ticket: ticket.ticket }));
      };
      next.onmessage = (message) => {
        try {
          const parsed: unknown = JSON.parse(String(message.data));
          if (parsed && typeof parsed === 'object') {
            const frame = parsed as Record<string, unknown>;
            // The ticket verifier is asynchronous. Wait for the server's
            // acknowledgement before subscribing so the two client frames
            // cannot race on reconnect or on a slower device.
            if (frame.type === 'authenticated') {
              next.send(
                JSON.stringify({
                  action: 'subscribe',
                  symbols: options.symbols,
                  channels: options.channels,
                }),
              );
              return;
            }
            options.onEvent(frame);
          }
        } catch {
          // Ignore malformed frames; the server validates outbound payloads.
        }
      };
      next.onerror = () => setStatus('fallback');
      next.onclose = () => {
        if (socket === next) socket = null;
        scheduleReconnect();
      };
    } catch {
      startFallback();
      scheduleReconnect();
    }
  };
  const onAppState = (next: AppStateStatus) => {
    appState = next;
    if (next === 'active') {
      retryCount = 0;
      clearTimers();
      void connect();
    } else {
      clearTimers();
      closeSocket();
      if (!stopped) setStatus('paused');
    }
  };
  const subscription = AppState.addEventListener('change', onAppState);

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      void connect();
    },
    stop() {
      stopped = true;
      clearTimers();
      closeSocket();
      subscription.remove();
      setStatus('idle');
    },
  };
}
