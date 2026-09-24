import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { MarketHttpClient } from './market-http.client.js';
import { asRecord, finiteNumber, isRecord, type SourceResult } from './market-extended.types.js';

const MSN_SECID: Record<string, string> = {
  INX: 'a33k6h',
  DJI: 'a6qja2',
  USA30: 'a6qja2',
  COMP: 'a3oxnm',
  RUT: 'b9v42w',
  NYA: 'a74pqh',
  UKX: 'aopnp2',
  DAX: 'afx2kr',
  PX1: 'aecfh7',
  N225: 'a9j7bh',
  '000001': 'adfh77',
  HSI: 'ah7etc',
  SENSEX: 'ahkucw',
  VNI: 'aqk2nm',
  BTC: 'c2111',
  BTCUSDT: 'c2111',
  ETH: 'c2112',
  BNB: 'c2113',
  XRP: 'c2117',
  ADA: 'c2114',
  SOL: 'c2116',
  DOGE: 'c2119',
  USDT: 'c2115',
  USDC: 'c211a',
  USDVND: 'avyufr',
  JPYVND: 'ave8sm',
  EURVND: 'av93ec',
  EURUSD: 'av932w',
  USDJPY: 'avyomw',
  GBPUSD: 'avyjhw',
  AUDUSD: 'auxr9c',
  XAUUSD: 'ck48ur',
  XAGUSD: 'ck48xm',
};
const BINANCE_HOSTS = [
  'https://api.binance.com',
  'https://api-gcp.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://api4.binance.com',
];

function chartRows(raw: unknown, currency: boolean) {
  const item = Array.isArray(raw) && isRecord(raw[0]) ? raw[0] : undefined;
  const series = item && isRecord(item.series) ? item.series : {};
  const times = Array.isArray(series.timeStamps) ? series.timeStamps : [];
  const get = (field: string, index: number) =>
    Array.isArray(series[field]) ? (series[field] as unknown[])[index] : undefined;
  return times.flatMap((value, index) => {
    const date = new Date(String(value));
    const open = get('openPrices', index);
    const high = get('pricesHigh', index);
    const low = get('pricesLow', index);
    if (
      !Number.isFinite(date.getTime()) ||
      [open, high, low].some((v) => v === undefined || v === -99999901)
    )
      return [];
    const timestamp = Math.floor(date.getTime() / 1000);
    const volume = get('volumes', index);
    return [
      {
        time: date.toISOString().slice(0, 10),
        timestamp,
        open,
        high,
        low,
        close: get('prices', index),
        volume: currency || volume === -99999901 ? null : volume,
      },
    ];
  });
}

@Injectable()
export class GlobalMarketProvider {
  private msnKey: { value: string; expires: number } | undefined;
  constructor(private readonly http: MarketHttpClient) {}

  async gold(date: string, source?: string): Promise<SourceResult<unknown>> {
    if (source && !['SJC', 'SIMPLIZE'].includes(source))
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: `Unsupported gold source: ${source}`,
      });
    if (source === 'SIMPLIZE') return this.globalGold(date);
    const sourceUrl = 'https://sjc.com.vn/GoldPrice/Services/PriceService.ashx';
    const [year, month, day] = date.split('-');
    const form = new URLSearchParams({
      method: 'GetSJCGoldPriceByDate',
      toDate: `${day}/${month}/${year}`,
    });
    try {
      const root = asRecord(await this.http.json(sourceUrl, 'POST', { form }), 'SJC gold');
      const rows = Array.isArray(root.data) ? root.data.filter(isRecord) : [];
      return {
        sourceUrl,
        data: rows.map((r) => ({
          date,
          name: r.TypeName ?? '',
          branch: r.BranchName ?? '',
          buy_price: r.BuyValue ?? null,
          sell_price: r.SellValue ?? null,
        })),
      };
    } catch (error) {
      if (source === 'SJC') throw error;
      return this.globalGold(date);
    }
  }

  async fx(date: string, source?: string): Promise<SourceResult<unknown>> {
    if (source && source !== 'VCB')
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: `Unsupported FX source: ${source}. Supported: VCB`,
      });
    const sourceUrl = 'https://www.vietcombank.com.vn/api/exchangerates';
    const root = asRecord(
      await this.http.json(sourceUrl, 'GET', { query: { date } }),
      'VCB exchange rates',
    );
    const asOf = String(root.Date ?? '').slice(0, 10) || date;
    const parse = (v: unknown) =>
      v === '-' || v == null ? null : finiteNumber(String(v).replaceAll(',', ''));
    return {
      sourceUrl,
      data: (Array.isArray(root.Data) ? root.Data : []).filter(isRecord).map((r) => ({
        currency_code: r.currencyCode ?? '',
        currency_name: r.currencyName ?? '',
        buy_cash: parse(r.cash),
        buy_transfer: parse(r.transfer),
        sell: parse(r.sell),
        date: asOf,
      })),
    };
  }

  async worldIndex(symbol: string, start?: string, end?: string): Promise<SourceResult<unknown>> {
    return this.msnChart(symbol, start, end, false);
  }
  async forex(symbol: string, start?: string, end?: string): Promise<SourceResult<unknown>> {
    return this.msnChart(symbol, start, end, true);
  }

  async cryptoOhlc(
    symbol: string,
    interval: string,
    limit: number,
  ): Promise<SourceResult<unknown>> {
    const { raw, sourceUrl } = await this.binance('/api/v3/uiKlines', { symbol, interval, limit });
    const data = (Array.isArray(raw) ? raw : []).filter(Array.isArray).map((k) => {
      const timestamp = Math.floor(Number(k[0]) / 1000);
      return {
        time: new Date(timestamp * 1000).toISOString().slice(0, 10),
        timestamp,
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
      };
    });
    return { data, sourceUrl };
  }

  async cryptoTicker(symbol: string): Promise<SourceResult<unknown>> {
    const { raw, sourceUrl } = await this.binance('/api/v3/ticker/24hr', { symbol });
    const r = asRecord(raw, 'Binance ticker');
    return {
      sourceUrl,
      data: {
        symbol: r.symbol ?? symbol,
        last_price: finiteNumber(r.lastPrice),
        open_price: finiteNumber(r.openPrice),
        high_price: finiteNumber(r.highPrice),
        low_price: finiteNumber(r.lowPrice),
        bid_price: finiteNumber(r.bidPrice),
        ask_price: finiteNumber(r.askPrice),
        price_change: finiteNumber(r.priceChange),
        change_pct: finiteNumber(r.priceChangePercent),
        volume: finiteNumber(r.volume),
        quote_volume: finiteNumber(r.quoteVolume),
        open_time: r.openTime ?? null,
        close_time: r.closeTime ?? null,
        count: r.count ?? null,
      },
    };
  }

  async cryptoDepth(symbol: string, limit: number): Promise<SourceResult<unknown>> {
    const { raw, sourceUrl } = await this.binance('/api/v3/depth', { symbol, limit });
    const r = asRecord(raw, 'Binance depth');
    const levels = (v: unknown) =>
      (Array.isArray(v) ? v : [])
        .filter(Array.isArray)
        .map((entry) => ({ price: Number(entry[0]), qty: Number(entry[1]) }));
    return {
      sourceUrl,
      data: { last_update_id: r.lastUpdateId ?? null, bids: levels(r.bids), asks: levels(r.asks) },
    };
  }

  private async globalGold(date: string): Promise<SourceResult<unknown>> {
    const sourceUrl = 'https://api.simplize.vn/api/historical/prices/ohlcv';
    const start = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
    const end = start + 86_399;
    const root = await this.http.json(sourceUrl, 'GET', {
      query: { ticker: 'GC=F', interval: '1d', type: 'commodity', from: start, to: end },
    });
    const raw = isRecord(root) && Array.isArray(root.data) ? root.data : [];
    return {
      sourceUrl,
      data: raw.map((i) =>
        Array.isArray(i)
          ? { time: i[0], open: i[1], high: i[2], low: i[3], close: i[4], volume: i[5] }
          : i,
      ),
    };
  }

  private async msnChart(
    symbol: string,
    start: string | undefined,
    end: string | undefined,
    currency: boolean,
  ): Promise<SourceResult<unknown>> {
    const secid = MSN_SECID[symbol];
    if (!secid)
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: `Unsupported MSN symbol: ${symbol}`,
      });
    const sourceUrl = 'https://assets.msn.com/service/Finance/Charts/TimeRange';
    const apikey = await this.msnApiKey();
    const raw = await this.http.json(sourceUrl, 'GET', {
      query: {
        apikey,
        StartTime: `${start ?? '2000-01-01'}T17:00:00.000Z`,
        EndTime: `${end ?? new Date().toISOString().slice(0, 10)}T16:59:00.858Z`,
        timeframe: 1,
        ocid: 'finance-utils-peregrine',
        cm: 'vi-vn',
        it: 'web',
        scn: 'ANON',
        ids: secid,
        type: 'All',
        wrapodata: 'false',
        disableSymbol: 'false',
      },
    });
    return { sourceUrl, data: chartRows(raw, currency) };
  }

  private async msnApiKey(): Promise<string> {
    if (this.msnKey && this.msnKey.expires > Date.now()) return this.msnKey.value;
    const sourceUrl = 'https://assets.msn.com/resolver/api/resolve/v3/config/';
    const d = new Date(Date.now() - 7 * 3_600_000);
    const version = `${d.toISOString().slice(0, 10).replaceAll('-', '')}.168`;
    const scope = JSON.stringify({
      audienceMode: 'adult',
      browser: { browserType: 'chrome', version: '0', ismobile: 'false' },
      deviceFormFactor: 'desktop',
      domain: 'www.msn.com',
      locale: {
        content: { language: 'vi', market: 'vn' },
        display: { language: 'vi', market: 'vn' },
      },
      ocid: 'hpmsn',
      os: 'macos',
      platform: 'web',
      pageType: 'financestockdetails',
    });
    const root = asRecord(
      await this.http.json(sourceUrl, 'GET', {
        query: {
          expType: 'AppConfig',
          expInstance: 'default',
          apptype: 'finance',
          v: version,
          targetScope: scope,
        },
      }),
      'MSN resolver',
    );
    const configs = isRecord(root.configs) ? root.configs : {};
    const entry = isRecord(configs['shared/msn-ns/HoroscopeAnswerCardWC/default'])
      ? configs['shared/msn-ns/HoroscopeAnswerCardWC/default']
      : {};
    const props = isRecord(entry.properties) ? entry.properties : {};
    const settings = isRecord(props.horoscopeAnswerServiceClientSettings)
      ? props.horoscopeAnswerServiceClientSettings
      : {};
    const weather = isRecord(props.weatherApi) ? props.weatherApi : {};
    const value = settings.apikey ?? props.mvpAPIkey ?? weather.apiKey;
    if (!value) throw new Error('MSN resolver did not return an API key');
    this.msnKey = { value: String(value), expires: Date.now() + 21_600_000 };
    return String(value);
  }

  private async binance(
    path: string,
    query: Record<string, string | number>,
  ): Promise<{ raw: unknown; sourceUrl: string }> {
    let last: unknown;
    for (const host of BINANCE_HOSTS) {
      const sourceUrl = `${host}${path}`;
      try {
        return {
          raw: await this.http.json(sourceUrl, 'GET', { query, timeoutMs: 12_000 }),
          sourceUrl,
        };
      } catch (error) {
        last = error;
      }
    }
    throw last;
  }
}
