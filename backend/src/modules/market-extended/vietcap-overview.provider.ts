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

const TRADING = 'https://trading.vietcap.com.vn';
const IQ = 'https://iq.vietcap.com.vn';
const headers = { referer: 'https://trading.vietcap.com.vn/iq/market' };

function unwrap(value: unknown, label: string): unknown {
  const root = asRecord(value, label);
  if (root.successful === false)
    throw new Error(`Invalid upstream response: ${label} unsuccessful`);
  return root.data;
}

function rows(value: unknown, label: string): JsonObject[] {
  return asArray(value, label).filter(isRecord);
}

function impact(i: JsonObject) {
  return {
    symbol: i.symbol ?? '',
    impact: finiteNumber(i.impact),
    exchange: i.exchange ?? '',
    company_name: i.organName ?? '',
    match_price: integer(i.matchPrice),
    ref_price: finiteNumber(i.refPrice),
  };
}

@Injectable()
export class VietcapOverviewProvider {
  constructor(private readonly http: MarketHttpClient) {}

  private async post(path: string, body: JsonObject): Promise<SourceResult<unknown>> {
    const sourceUrl = `${TRADING}${path}`;
    return { data: await this.http.json(sourceUrl, 'POST', { headers, body }), sourceUrl };
  }

  private async get(
    base: string,
    path: string,
    query?: Record<string, string | number>,
  ): Promise<SourceResult<unknown>> {
    const sourceUrl = `${base}${path}`;
    return { data: await this.http.json(sourceUrl, 'GET', { headers, query }), sourceUrl };
  }

  private range(from?: number, to?: number): { from: number; to: number } {
    const now = Math.floor(Date.now() / 1000);
    return { from: from ?? now - 365 * 86_400, to: to ?? now };
  }

  async liquidity(input: {
    symbols: string;
    timeFrame: string;
    from?: number;
    to?: number;
  }): Promise<SourceResult<unknown>> {
    const range = this.range(input.from, input.to);
    const result = await this.post('/api/chart/v3/OHLCChart/gap-liquidity', {
      ...range,
      symbols: [input.symbols],
      timeFrame: input.timeFrame,
    });
    return {
      ...result,
      data: rows(result.data, 'liquidity').map((i) => ({
        symbols: i.symbol ?? [],
        timestamps: Array.isArray(i.t) ? i.t.map(integer) : [],
        accumulated_volume: Array.isArray(i.accumulatedVolume)
          ? i.accumulatedVolume.map(integer)
          : [],
        accumulated_value_million_vnd: Array.isArray(i.accumulatedValue)
          ? i.accumulatedValue.map(finiteNumber)
          : [],
        min_batch_trunc_time: integer(i.minBatchTruncTime),
      })),
    };
  }

  async indexImpact(group: string, timeFrame: string): Promise<SourceResult<unknown>> {
    const result = await this.post('/api/market-watch/v2/IndexImpactChart/getData', {
      group,
      timeFrame,
    });
    const data = asRecord(result.data, 'index impact');
    return {
      ...result,
      data: {
        top_up: rows(data.topUp, 'topUp').map(impact),
        top_down: rows(data.topDown, 'topDown').map(impact),
        group,
        time_frame: timeFrame,
      },
    };
  }

  async foreign(input: {
    group: string;
    timeFrame: string;
    from?: number;
    to?: number;
  }): Promise<SourceResult<unknown>> {
    const result = await this.post('/api/market-watch/v3/ForeignVolumeChart/getAll', {
      ...this.range(input.from, input.to),
      group: input.group,
      timeFrame: input.timeFrame,
    });
    return {
      ...result,
      data: rows(result.data, 'foreign').map((i) => ({
        trading_date: i.truncTime,
        trunc_time: integer(i.truncTime),
        foreign_buy_volume: integer(i.foreignBuyVolume),
        foreign_sell_volume: integer(i.foreignSellVolume),
        foreign_buy_value_vnd: integer(i.foreignBuyValue),
        foreign_sell_value_vnd: integer(i.foreignSellValue),
        group: i.group ?? '',
        time_frame: i.timeFrame ?? '',
      })),
    };
  }

  async foreignTop(input: {
    group: string;
    timeFrame: string;
    from?: number;
    to?: number;
  }): Promise<SourceResult<unknown>> {
    const result = await this.post('/api/market-watch/v3/ForeignNetValue/top', {
      ...this.range(input.from, input.to),
      group: input.group,
      timeFrame: input.timeFrame,
    });
    const data = asRecord(result.data, 'foreign top');
    const norm = (i: JsonObject) => ({
      symbol: i.symbol ?? '',
      exchange: i.exchange ?? '',
      company_name: i.organName ?? '',
      net_value_vnd: integer(i.net),
      buy_value_vnd: integer(i.foreignBuyValue),
      sell_value_vnd: integer(i.foreignSellValue),
      match_price: integer(i.matchPrice),
      ref_price: finiteNumber(i.refPrice),
    });
    return {
      ...result,
      data: {
        net_buy: rows(data.netBuy, 'netBuy').map(norm),
        net_sell: rows(data.netSell, 'netSell').map(norm),
        total_net_buy_vnd: integer(data.totalNetBuy),
        total_net_sell_vnd: integer(data.totalNetSell),
        group: input.group,
      },
    };
  }

  async proprietary(market: string, timeFrame: string): Promise<SourceResult<unknown>> {
    const result = await this.get(TRADING, '/api/fiin-api-service/v3/proprietary-trading-value', {
      market,
      timeFrame,
    });
    const inner = asRecord(unwrap(result.data, 'proprietary'), 'proprietary data');
    return {
      ...result,
      data: rows(inner.data, 'proprietary rows').map((i) => ({
        trading_date: i.tradingDate ?? '',
        total_buy_value_vnd: integer(i.totalBuyValue),
        total_sell_value_vnd: integer(i.totalSellValue),
        total_buy_volume: integer(i.totalBuyVolume),
        total_sell_volume: integer(i.totalSellVolume),
        total_deal_buy_volume: integer(i.totalDealBuyVolume),
        total_deal_sell_volume: integer(i.totalDealSellVolume),
      })),
    };
  }

  async proprietaryTop(exchange: string, timeFrame: string): Promise<SourceResult<unknown>> {
    const result = await this.get(IQ, '/api/iq-insight-service/v1/market-watch/top-proprietary', {
      exchange,
      timeFrame,
    });
    const inner = asRecord(unwrap(result.data, 'proprietary top'), 'proprietary top');
    const data = asRecord(inner.data, 'proprietary top data');
    const norm = (i: JsonObject) => ({
      ticker: i.ticker ?? '',
      exchange: i.exchange ?? '',
      company_name: i.organName ?? '',
      total_value_vnd: integer(i.totalValue),
      total_volume: integer(i.totalVolume),
      match_price: integer(i.matchPrice),
      ref_price: finiteNumber(i.refPrice),
    });
    return {
      ...result,
      data: {
        buy: rows(data.BUY, 'BUY').map(norm),
        sell: rows(data.SELL, 'SELL').map(norm),
        trading_date: inner.tradingDate ?? '',
      },
    };
  }

  async allocation(group: string, timeFrame: string): Promise<SourceResult<unknown>> {
    const result = await this.post('/api/market-watch/AllocatedValue/getAllocatedValue', {
      group,
      timeFrame,
    });
    const sections = [
      'totalIncrease',
      'totalNochange',
      'totalDecrease',
      'totalSymbolIncrease',
      'totalSymbolNochange',
      'totalSymbolDecrease',
    ];
    return {
      ...result,
      data: rows(result.data, 'allocation').map((block) => {
        const entry: JsonObject = {};
        for (const section of sections)
          for (const item of rows(block[section], section))
            for (const [key, value] of Object.entries(item))
              if (key !== 'group') entry[`${section}_${String(item.group ?? '')}`] = integer(value);
        return entry;
      }),
    };
  }

  async sectorsAllocation(group: string, timeFrame: string): Promise<SourceResult<unknown>> {
    const result = await this.post('/api/market-watch/AllocatedICB/getAllocated', {
      group,
      timeFrame,
    });
    return {
      ...result,
      data: rows(result.data, 'sector allocation').map((i) => ({
        icb_code: integer(i.icb_code),
        icb_change_percent: finiteNumber(i.icbChangePercent),
        total_value_vnd: integer(i.totalValue),
        total_stock_increase: integer(i.totalStockIncrease),
        total_stock_decrease: integer(i.totalStockDecrease),
        total_stock_no_change: integer(i.totalStockNoChange),
        icb_code_parent: i.icbCodeParent ?? null,
      })),
    };
  }

  async valuation(
    type: string,
    comGroupCode: string,
    timeFrame: string,
  ): Promise<SourceResult<unknown>> {
    const result = await this.get(
      TRADING,
      '/api/iq-insight-service/v1/market-watch/index-valuation',
      { type, comGroupCode, timeFrame },
    );
    const inner = asRecord(unwrap(result.data, 'valuation'), 'valuation');
    return {
      ...result,
      data: rows(inner.values, 'valuation values').map((i) => ({
        date: i.date ?? '',
        value: finiteNumber(i.value),
      })),
    };
  }

  async breadth(
    condition: string,
    exchange: string,
    period: string,
  ): Promise<SourceResult<unknown>> {
    const result = await this.get(IQ, '/api/iq-insight-service/v1/market-watch/breadth', {
      condition,
      exchange,
      enNumberOfDays: period,
    });
    return {
      ...result,
      data: rows(unwrap(result.data, 'breadth'), 'breadth').map((i) => ({
        condition: i.condition ?? '',
        count: integer(i.count),
        total: integer(i.total),
        percent: finiteNumber(i.percent),
        trading_date: i.tradingDate ?? '',
      })),
    };
  }

  async heatmap(group: string, sector: string, size: string): Promise<SourceResult<unknown>> {
    const result = await this.post('/api/market-watch/HeatMapChart/getByIcb', {
      group,
      sector,
      size,
    });
    return {
      ...result,
      data: rows(result.data, 'heatmap').map((i) => ({
        icb_code: integer(i.icb_code),
        icb_name: i.icb_name ?? '',
        en_icb_name: i.en_icb_name ?? '',
        icb_change_percent: finiteNumber(i.icbChangePercent),
        total_market_cap_vnd: integer(i.totalMarketCap),
        stocks: rows(i.data, 'heatmap stocks').map((s) => ({
          symbol: s.symbol ?? '',
          volume: integer(s.volume),
          value_million_vnd: finiteNumber(s.value),
          price: integer(s.price),
          ref_price: integer(s.refPrice),
          market_cap_vnd: integer(s.marketCap),
          ceiling_price: integer(s.ceilingPrice),
          floor_price: integer(s.floorPrice),
        })),
      })),
    };
  }

  async heatmapIndex(): Promise<SourceResult<unknown>> {
    const result = await this.get(TRADING, '/api/market-watch/HeatMapChart/getIndex');
    const d = asRecord(result.data, 'heatmap index');
    return {
      ...result,
      data: {
        total_stock: integer(d.totalStock),
        total_trading_volume: integer(d.totalTradingVolume),
        total_trading_value_million_vnd: finiteNumber(d.totalTradingValue),
        total_foreign_buy_volume: integer(d.totalFrBuyVolume),
        total_foreign_sell_volume: integer(d.totalFrSellVolume),
        total_foreign_buy_value_vnd: integer(d.totalFrBuyValue),
        total_foreign_sell_value_vnd: integer(d.totalFrSellValue),
        index_data: rows(d.indexData, 'index data').map((i) => ({
          symbol: i.symbol ?? '',
          price: finiteNumber(i.price),
          ref_price: finiteNumber(i.refPrice),
        })),
      },
    };
  }

  async sectorDetail(
    icbCode: number,
    group: string,
    timeFrame: string,
  ): Promise<SourceResult<unknown>> {
    const result = await this.post('/api/market-watch/AllocatedICB/getAllocatedDetail', {
      group,
      timeFrame,
      icbCode,
    });
    const d = asRecord(result.data, 'sector detail');
    return {
      ...result,
      data: {
        icb_code: integer(d.icb_code),
        icb_change_percent: finiteNumber(d.icbChangePercent),
        total_value_vnd: integer(d.totalValue),
        total_stock_increase: integer(d.totalStockIncrease),
        total_stock_decrease: integer(d.totalStockDecrease),
        total_stock_no_change: integer(d.totalStockNoChange),
        icb_code_parent: d.icbCodeParent ?? null,
        stocks: rows(d.icbDataDetail, 'sector stocks').map((s) => ({
          symbol: s.symbol ?? '',
          ref_price: integer(s.refPrice),
          match_price: integer(s.matchPrice),
          ceiling_price: integer(s.ceilingPrice),
          floor_price: integer(s.floorPrice),
          accumulated_volume: integer(s.accumulatedVolume),
          accumulated_value_vnd: integer(s.accumulatedValue),
          company_name: s.organName ?? '',
          en_company_name: s.enOrganName ?? '',
          foreign_net_volume: integer(s.foreignNetVolume),
          foreign_net_value_vnd: integer(s.foreignNetValue),
          board: s.board ?? '',
        })),
      },
    };
  }

  async stockStrength(exchange: string): Promise<SourceResult<unknown>> {
    const result = await this.get(IQ, '/api/iq-insight-service/v1/ta/stock-strength', { exchange });
    const data = asRecord(unwrap(result.data, 'stock strength'), 'stock strength');
    return {
      ...result,
      data: Object.fromEntries(Object.entries(data).filter(([, value]) => Number.isInteger(value))),
    };
  }

  async marketIndex(symbols: string[]): Promise<SourceResult<unknown>> {
    const result = await this.post('/api/price/marketIndex/getList', { symbols });
    return {
      ...result,
      data: rows(result.data, 'market indices').map((i) => ({
        symbol: i.symbol ?? '',
        board: i.board ?? '',
        price: finiteNumber(i.price),
        ref_price: finiteNumber(i.refPrice),
        change: finiteNumber(i.change),
        change_percent: finiteNumber(i.changePercent),
        total_shares: integer(i.totalShares),
        total_value_million_vnd: finiteNumber(i.totalValue),
        total_stock_increase: integer(i.totalStockIncrease),
        total_stock_decline: integer(i.totalStockDecline),
        total_stock_no_change: integer(i.totalStockNoChange),
        total_stock_ceiling: integer(i.totalStockCeiling),
        total_stock_floor: integer(i.totalStockFloor),
        time: i.time ?? '',
      })),
    };
  }

  async search(language: number): Promise<SourceResult<unknown>> {
    const result = await this.get(IQ, '/api/iq-insight-service/v2/company/search-bar', {
      language,
    });
    return {
      ...result,
      data: rows(unwrap(result.data, 'search'), 'search').map((i) => ({
        code: i.code ?? '',
        name: i.name ?? '',
        short_name: i.shortName ?? '',
        floor: i.floor ?? '',
        is_index: i.isIndex ?? false,
        current_price: integer(i.currentPrice),
        target_price: integer(i.targetPrice),
        upside_pct: finiteNumber(i.upsideToTpPercentage),
        logo_url: i.logoUrl ?? '',
        icb_lv1: i.icbLv1 ?? null,
        icb_lv2: i.icbLv2 ?? null,
      })),
    };
  }

  async eventCodes(): Promise<SourceResult<unknown>> {
    const result = await this.get(IQ, '/api/iq-insight-service/v1/event-codes');
    return {
      ...result,
      data: rows(unwrap(result.data, 'event codes'), 'event codes').map((i) => ({
        event_code: i.eventCode ?? '',
        event_name_vi: i.eventNameVi ?? '',
        event_name_en: i.eventNameEn ?? '',
      })),
    };
  }

  async maintenance(): Promise<SourceResult<unknown>> {
    const result = await this.get(IQ, '/api/iq-insight-service/v1/notification', {
      type: 'maintenance',
    });
    const value = unwrap(result.data, 'maintenance');
    return {
      ...result,
      data: Array.isArray(value)
        ? value
        : isRecord(value) && Object.keys(value).length
          ? [value]
          : [],
    };
  }
}
