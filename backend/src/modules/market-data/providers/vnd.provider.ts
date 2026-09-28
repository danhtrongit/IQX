import { Injectable } from '@nestjs/common';
import { MarketHttpTransport } from './http.transport.js';
import { asObjects, isObject, type JsonObject, type ProviderResult } from './provider.types.js';

const CHART = 'https://dchart-api.vndirect.com.vn';
const FINFO = 'https://api-finfo.vndirect.com.vn/v4';
const INTERVALS: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1H': '60',
  '1D': 'D',
  '1W': 'W',
  '1M': 'M',
};

@Injectable()
export class VndMarketProvider {
  constructor(private readonly http: MarketHttpTransport) {}

  async fetchSymbols(exchange = 'HOSE,HNX,UPCOM'): Promise<ProviderResult<JsonObject[]>> {
    const url = new URL(`${FINFO}/stocks`);
    url.searchParams.set('q', `type:stock,ifc~floor:${exchange}`);
    url.searchParams.set('size', '9999');
    const raw = await this.http.requestJson<unknown>(url.toString(), this.headers(), {
      cacheTtlMs: 300_000,
    });
    const items = isObject(raw) ? asObjects(raw.data) : asObjects(raw);
    return {
      data: items.map((item) => ({
        symbol: item.code ?? '',
        name: item.companyName ?? '',
        exchange: item.floor ?? '',
        asset_type: typeof item.type === 'string' ? item.type.toLowerCase() : null,
      })),
      rawEndpoint: `${FINFO}/stocks`,
    };
  }

  async fetchOhlcv(
    symbol: string,
    startTs: number,
    endTs: number,
    interval: string,
  ): Promise<ProviderResult<JsonObject[]>> {
    const url = new URL(`${CHART}/dchart/history`);
    url.searchParams.set('resolution', INTERVALS[interval] ?? 'D');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('from', String(startTs));
    url.searchParams.set('to', String(endTs));
    // VND's chart endpoint returns HTTP 406 for Accept: application/json.
    const raw = await this.http.requestJson<unknown>(url.toString(), this.chartHeaders(), {
      cacheTtlMs: 15_000,
    });
    const data = isObject(raw) ? raw : {};
    const times = Array.isArray(data.t) ? data.t : [];
    const values = (key: string) => (Array.isArray(data[key]) ? data[key] : []);
    const [opens, highs, lows, closes, volumes] = ['o', 'h', 'l', 'c', 'v'].map(values);
    return {
      data: times.map((time, index) => ({
        time,
        open: opens?.[index] ?? 0,
        high: highs?.[index] ?? 0,
        low: lows?.[index] ?? 0,
        close: closes?.[index] ?? 0,
        volume: volumes?.[index] ?? 0,
      })),
      rawEndpoint: `${CHART}/dchart/history`,
    };
  }

  async fetchRanking(
    kind: string,
    index: string,
    limit: number,
    date?: string,
  ): Promise<ProviderResult<JsonObject[]>> {
    const idx =
      ({ VNINDEX: 'VNIndex', HNX: 'HNX', VN30: 'VN30' } as Record<string, string>)[
        index.toUpperCase()
      ] ?? 'VNIndex';
    const url = new URL(kind.startsWith('foreign-') ? `${FINFO}/foreigns` : `${FINFO}/top_stocks`);
    if (kind.startsWith('foreign-')) {
      const direction = kind === 'foreign-buy' ? 'gt:0' : 'lt:0';
      url.searchParams.set('q', `type:STOCK,IFC,ETF~netVal:${direction}~tradingDate:${date ?? ''}`);
      url.searchParams.set('sort', `tradingDate~netVal:${kind === 'foreign-buy' ? 'desc' : 'asc'}`);
      url.searchParams.set('size', String(limit));
      url.searchParams.set('fields', 'code,netVal,tradingDate');
      const raw = await this.http.requestJson<unknown>(url.toString(), this.headers(), {
        cacheTtlMs: 15_000,
      });
      const rows = isObject(raw) ? asObjects(raw.data) : [];
      return {
        data: rows.map((row) => ({
          symbol: row.code ?? '',
          date: row.tradingDate ?? '',
          net_value: row.netVal ?? 0,
        })),
        rawEndpoint: `${FINFO}/foreigns`,
      };
    }
    const configs: Record<string, [string, string]> = {
      gainer: [`index:${idx}~nmVolumeAvgCr20D:gte:10000~priceChgPctCr1D:gt:0`, 'priceChgPctCr1D'],
      loser: [
        `index:${idx}~nmVolumeAvgCr20D:gte:10000~priceChgPctCr1D:lt:0`,
        'priceChgPctCr1D:asc',
      ],
      value: [`index:${idx}~accumulatedVal:gt:0`, 'accumulatedVal'],
      volume: [
        `index:${idx}~nmVolumeAvgCr20D:gte:10000~nmVolNmVolAvg20DPctCr:gte:100`,
        'nmVolNmVolAvg20DPctCr',
      ],
      deal: [`index:${idx}~nmVolumeAvgCr20D:gte:10000`, 'ptVolTotalVolAvg20DPctCr'],
    };
    const config = configs[kind];
    if (!config) throw new Error(`Unknown ranking kind: ${kind}`);
    url.searchParams.set('q', config[0]);
    url.searchParams.set('size', String(limit));
    url.searchParams.set('sort', config[1]);
    const raw = await this.http.requestJson<unknown>(url.toString(), this.headers(), {
      cacheTtlMs: 15_000,
    });
    const rows = isObject(raw) ? asObjects(raw.data) : [];
    const map: Record<string, string> = {
      code: 'symbol',
      index: 'index',
      lastPrice: 'last_price',
      lastUpdated: 'last_updated',
      priceChgCr1D: 'price_change_1d',
      priceChgPctCr1D: 'price_change_pct_1d',
      accumulatedVal: 'accumulated_value',
      nmVolumeAvgCr20D: 'avg_volume_20d',
      nmVolNmVolAvg20DPctCr: 'volume_spike_20d_pct',
    };
    return {
      data: rows.map((row) =>
        Object.fromEntries(
          Object.entries(map)
            .filter(([key]) => key in row)
            .map(([key, value]) => [value, row[key]]),
        ),
      ),
      rawEndpoint: `${FINFO}/top_stocks`,
    };
  }

  private headers(): RequestInit {
    return {
      headers: {
        Accept: 'application/json',
        Origin: 'https://mkw.vndirect.com.vn',
        Referer: 'https://mkw.vndirect.com.vn/',
      },
    };
  }

  private chartHeaders(): RequestInit {
    return {
      headers: {
        Origin: 'https://mkw.vndirect.com.vn',
        Referer: 'https://mkw.vndirect.com.vn/',
      },
    };
  }
}
