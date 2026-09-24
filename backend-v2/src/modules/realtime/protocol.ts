import { REALTIME_CHANNELS, type RealtimeChannel } from './realtime.types.js';

const SYMBOL = /^[A-Z0-9][A-Z0-9._-]{0,19}$/;
const CHANNELS = new Set<string>(REALTIME_CHANNELS);

export type ClientFrame =
  | { action: 'ping' }
  | { action: 'subscribe' | 'unsubscribe'; symbols: string[]; channels: RealtimeChannel[] };

export function parseClientFrame(input: unknown): ClientFrame | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  if (raw.action === 'ping') return { action: 'ping' };
  if (raw.action !== 'subscribe' && raw.action !== 'unsubscribe') return null;
  if (!Array.isArray(raw.symbols) || !Array.isArray(raw.channels)) return null;
  const symbols = [...new Set(raw.symbols.map((value) => String(value).trim().toUpperCase()))];
  const channels = [...new Set(raw.channels.map(String))];
  if (symbols.length === 0 || symbols.some((symbol) => !SYMBOL.test(symbol))) return null;
  if (channels.length === 0 || channels.some((channel) => !CHANNELS.has(channel))) return null;
  return { action: raw.action, symbols, channels: channels as RealtimeChannel[] };
}

export function eventChannel(channel: RealtimeChannel, symbol: string): string {
  const short = channel === 'orderbook' ? 'ob' : channel;
  return `rt:${short}:${symbol.toUpperCase()}`;
}
