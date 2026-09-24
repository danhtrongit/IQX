import type { RealtimeChannel, RealtimePayload } from './realtime.types.js';

const number = (value: unknown): number => {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
};
const derivative = (symbol: string, raw: Record<string, unknown>): boolean => {
  const type = String(raw.type ?? '').toUpperCase();
  const market = String(raw.marketId ?? '').toUpperCase();
  return (
    type === 'DERIVATIVE' || type === 'INDEX' || market === 'DVX' || /^VN(?:30|100)F/.test(symbol)
  );
};
const price = (value: unknown, pointPriced: boolean): number =>
  pointPriced ? number(value) : Math.round(number(value) * 1_000);
const time = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value ?? null;
  const record = value as Record<string, unknown>;
  const seconds = number(record.Seconds ?? record.seconds);
  const millis = Math.floor(number(record.Nanos ?? record.nanos) / 1_000_000);
  return seconds > 0 ? new Date(seconds * 1_000 + millis).toISOString() : null;
};

export function normalizePayload(
  channel: RealtimeChannel,
  symbol: string,
  raw: Record<string, unknown>,
): RealtimePayload {
  const pointPriced = derivative(symbol, raw);
  if (channel === 'tick') {
    const side = String(raw.side ?? '').toUpperCase();
    return {
      type: 'tick',
      symbol,
      price: price(raw.matchPrice ?? raw.price, pointPriced),
      volume: number(raw.matchQtty ?? raw.volume),
      side: side.includes('BUY') ? 'B' : side.includes('SELL') ? 'S' : 'unknown',
      total_volume: number(raw.totalVolumeTraded ?? raw.total_volume),
      time: time(raw.sendingTime ?? raw.time),
      session: raw.tradingSessionId ?? raw.session ?? null,
    };
  }
  if (channel === 'orderbook') {
    const levels = (value: unknown) =>
      (Array.isArray(value) ? value : []).flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const row = item as Record<string, unknown>;
        return [{ price: price(row.price, pointPriced), volume: number(row.qtty ?? row.quantity) }];
      });
    return {
      type: 'orderbook',
      symbol,
      bids: levels(raw.bid ?? raw.bids),
      asks: levels(raw.offer ?? raw.asks),
      time: time(raw.sendingTime ?? raw.time),
    };
  }
  if (channel === 'ohlc') {
    return {
      type: 'ohlc',
      symbol,
      time: number(raw.time),
      open: price(raw.open, pointPriced),
      high: price(raw.high, pointPriced),
      low: price(raw.low, pointPriced),
      close: price(raw.close, pointPriced),
      volume: number(raw.volume),
      last_updated: number(raw.lastUpdated ?? raw.last_updated),
    };
  }
  const gross = raw.grossTradeAmount;
  return {
    type: 'index',
    code: String(raw.indexName ?? raw.symbol ?? raw.code ?? symbol),
    value: number(raw.valueIndexes ?? raw.indexValue ?? raw.value),
    change: number(raw.changedValue ?? raw.change),
    change_percent: number(raw.changedRatio ?? raw.changePercent ?? raw.change_percent),
    total_volume: number(raw.totalVolumeTraded ?? raw.allQty ?? raw.total_volume),
    total_value:
      gross === undefined ? number(raw.allValue ?? raw.total_value) : number(gross) * 1e9,
    advances: number(raw.fluctuationUpIssueCount ?? raw.advances),
    declines: number(raw.fluctuationDownIssueCount ?? raw.declines),
    nochange: number(raw.fluctuationSteadinessIssueCount ?? raw.nochange),
    time: time(raw.transactTime ?? raw.sendingTime ?? raw.time),
  };
}
