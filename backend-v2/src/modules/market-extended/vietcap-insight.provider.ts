import { Injectable } from '@nestjs/common';
import { MarketHttpClient } from './market-http.client.js';
import {
  asArray,
  asRecord,
  finiteNumber,
  integer,
  isRecord,
  type JsonObject,
  type SourceResult,
} from './market-extended.types.js';

const BASE = 'https://iq.vietcap.com.vn/api/iq-insight-service';
const headers = { referer: 'https://trading.vietcap.com.vn/iq/' };

function unwrap(value: unknown, label: string): unknown {
  return asRecord(value, label).data;
}
function rows(value: unknown, label: string): JsonObject[] {
  return asArray(value, label).filter(isRecord);
}

export type ScreeningRequest = {
  page: number;
  pageSize: number;
  sortFields: string[];
  sortOrders: ('ASC' | 'DESC')[];
  filter: Array<{
    name: string;
    conditionOptions: Array<{ type?: string; value?: string; from?: number; to?: number }>;
    extraName?: string;
  }>;
};

@Injectable()
export class VietcapInsightProvider {
  constructor(private readonly http: MarketHttpClient) {}

  private async get(
    path: string,
    query?: Record<string, string | number>,
  ): Promise<SourceResult<unknown>> {
    const sourceUrl = `${BASE}${path}`;
    return { data: await this.http.json(sourceUrl, 'GET', { headers, query }), sourceUrl };
  }

  async tradingDates(): Promise<SourceResult<unknown>> {
    const result = await this.get('/v1/sector-ranking/trading-date');
    return {
      ...result,
      data: asArray(unwrap(result.data, 'trading dates'), 'trading dates').filter(
        (v): v is string => typeof v === 'string',
      ),
    };
  }

  async sectorRanking(
    icbLevel: number,
    adtv: number,
    value: number,
  ): Promise<SourceResult<unknown>> {
    const result = await this.get('/v1/sector-ranking/sectors', { icbLevel, adtv, value });
    return {
      ...result,
      data: rows(unwrap(result.data, 'sector ranking'), 'sector ranking').map((item) => ({
        icb_code: item.name ?? '',
        values: rows(item.values, 'ranking values').map((v) => ({
          date: v.date ?? '',
          value: integer(v.value),
          ...(v.sectorTrend !== undefined ? { sector_trend: v.sectorTrend } : {}),
          ...(v.extremeValue !== undefined ? { extreme_value: integer(v.extremeValue) } : {}),
          ...(v.trendStartValue !== undefined
            ? { trend_start_value: integer(v.trendStartValue) }
            : {}),
        })),
      })),
    };
  }

  async sectorInformation(icbLevel: number): Promise<SourceResult<unknown>> {
    const result = await this.get('/v1/sector-information', { icbLevel });
    return {
      ...result,
      data: rows(unwrap(result.data, 'sector information'), 'sector information').map((i) => ({
        icb_code: i.icbCode ?? '',
        market_cap: integer(i.marketCap),
        last_close_index: finiteNumber(i.lastCloseIndex),
        last_20_day_index: Array.isArray(i.last20DayIndex)
          ? i.last20DayIndex.map(finiteNumber)
          : [],
        percent_price_change_1d: finiteNumber(i.percentPriceChange1Day),
        percent_price_change_1w: finiteNumber(i.percentPriceChange1Week),
        percent_price_change_1m: finiteNumber(i.percentPriceChange1Month),
        percent_price_change_6m: finiteNumber(i.percentPriceChange6Month),
        percent_price_change_ytd: finiteNumber(i.percentPriceChangeYTD),
        percent_price_change_1y: finiteNumber(i.percentPriceChange1Year),
        percent_price_change_2y: finiteNumber(i.percentPriceChange2Year),
        percent_price_change_5y: finiteNumber(i.percentPriceChange5Year),
      })),
    };
  }

  async screeningCriteria(): Promise<SourceResult<unknown>> {
    const result = await this.get('/v1/screening/criteria');
    return {
      ...result,
      data: rows(unwrap(result.data, 'criteria'), 'criteria').map((i) => ({
        id: i.id ?? '',
        category: i.category ?? '',
        name: i.name ?? '',
        order: i.order ?? null,
        allow_duplicate: i.allowDuplicate ?? false,
        select_type: i.selectType ?? '',
        slider_stepper: i.sliderStepper ?? null,
        multiplier: i.multiplier ?? null,
        min: i.min ?? null,
        max: i.max ?? null,
        condition_options: i.conditionOptions ?? [],
        condition_extra: i.conditionExtra ?? null,
        active: i.active ?? true,
      })),
    };
  }

  async screeningSearch(body: ScreeningRequest): Promise<SourceResult<unknown>> {
    const sourceUrl = `${BASE}/v1/screening/paging`;
    const response = await this.http.json(sourceUrl, 'POST', { headers, body });
    const inner = asRecord(unwrap(response, 'screening paging'), 'screening paging');
    return {
      sourceUrl,
      data: {
        content: rows(inner.content, 'screening content').map((i) => ({
          ticker: i.ticker ?? '',
          exchange: i.exchange ?? '',
          ref_price: i.refPrice ?? null,
          ceiling: i.ceiling ?? null,
          market_price: i.marketPrice ?? null,
          floor: i.floor ?? null,
          accumulated_value: i.accumulatedValue ?? null,
          accumulated_volume: i.accumulatedVolume ?? null,
          market_cap: i.marketCap ?? null,
          daily_price_change_percent: i.dailyPriceChangePercent ?? null,
          en_organ_name: i.enOrganName ?? '',
          vi_organ_name: i.viOrganName ?? '',
          en_organ_short_name: i.enOrganShortName ?? '',
          vi_organ_short_name: i.viOrganShortName ?? '',
          icb_code_lv2: i.icbCodeLv2 ?? '',
          en_sector: i.enSector ?? '',
          vi_sector: i.viSector ?? '',
          icb_code_lv4: i.icbCodeLv4 ?? '',
          stock_strength: i.stockStrength ?? null,
        })),
        total_elements: inner.totalElements ?? 0,
        total_pages: inner.totalPages ?? 0,
        page: inner.number ?? body.page,
        page_size: inner.size ?? body.pageSize,
        first: inner.first ?? true,
        last: inner.last ?? false,
        empty: inner.empty ?? false,
      },
    };
  }

  async screeningPresets(): Promise<SourceResult<unknown>> {
    const result = await this.get('/v1/setting/screeners');
    const inner = asRecord(unwrap(result.data, 'screeners'), 'screeners');
    return {
      ...result,
      data: Object.fromEntries(
        Object.entries(inner)
          .filter(([, value]) => Array.isArray(value))
          .map(([key, value]) => [
            key,
            (value as unknown[]).filter(isRecord).map((s) => ({
              id: s.id ?? '',
              name: s.name ?? '',
              vi_name: s.viName ?? '',
              mode: s.mode ?? '',
              order: s.order ?? null,
              metrics: s.metrics ?? [],
            })),
          ]),
      ),
    };
  }
}
