export const REALTIME_CHANNELS = ['tick', 'orderbook', 'ohlc', 'index'] as const;
export type RealtimeChannel = (typeof REALTIME_CHANNELS)[number];

export type RealtimeSubscription = { symbol: string; channel: RealtimeChannel };
export type RealtimePayload = Record<string, unknown> & { type: RealtimeChannel };

export interface MarketStreamPort {
  connect(): Promise<void>;
  updateSubscriptions(subscriptions: readonly RealtimeSubscription[]): Promise<void>;
  messages(): AsyncIterable<{
    channel: RealtimeChannel;
    symbol: string;
    payload: Record<string, unknown>;
  }>;
  close(): Promise<void>;
}

export type RealtimeOptions = {
  enabled: boolean;
  /** Controls the legacy v1 WebSocket route independently from the v2 alias. */
  v1CompatibilityEnabled?: boolean;
  ingestEnabled: boolean;
  maxSymbolsPerConnection: number;
  maxBufferedBytes: number;
  demandTtlMs: number;
  leaderTtlMs: number;
  reconcileMs: number;
  providerFactory?: () => MarketStreamPort;
};

export const REALTIME_OPTIONS = Symbol('REALTIME_OPTIONS');
