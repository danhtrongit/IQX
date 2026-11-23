import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../../src/platform/database/database.service.js';
import type { MarketHttpTransport } from '../../src/modules/market-data/providers/http.transport.js';
import type { VciMarketProvider } from '../../src/modules/market-data/providers/vci.provider.js';
import type { VndMarketProvider } from '../../src/modules/market-data/providers/vnd.provider.js';
import type { AiNewsProvider } from '../../src/modules/market-extended/ai-news.provider.js';
import type { CommoditySheetsNewsProvider } from '../../src/modules/market-extended/commodity-sheets-news.provider.js';
import type { GlobalMarketProvider } from '../../src/modules/market-extended/global-market.provider.js';
import type { VietcapInsightProvider } from '../../src/modules/market-extended/vietcap-insight.provider.js';
import type { VietcapOverviewProvider } from '../../src/modules/market-extended/vietcap-overview.provider.js';
import { DerivativesWidgetsService } from '../../src/modules/market-overview/aggregators/derivatives-widgets.service.js';
import {
  GlobalEventsWidgetsService,
  WORLD_INDICES_CATALOG,
} from '../../src/modules/market-overview/aggregators/global-events-widgets.service.js';
import { IndexWidgetsService } from '../../src/modules/market-overview/aggregators/index-widgets.service.js';
import { StockSectorWidgetsService } from '../../src/modules/market-overview/aggregators/stock-sector-widgets.service.js';
import { VnTradingCalendarService } from '../../src/modules/market-overview/aggregators/vn-trading-calendar.service.js';
import { MarketOverviewWidgetDispatcherService } from '../../src/modules/market-overview/aggregators/widget-dispatcher.service.js';
import { MarketOverviewCache } from '../../src/modules/market-overview/market-overview.cache.js';
import type {
  LiquidityHistoryPoint,
  MarketOverviewRepository,
  StoredLiquidityHistory,
} from '../../src/modules/market-overview/market-overview.repository.js';
import { marketOverviewWidgetResponseSchema } from '../../src/modules/market-overview/market-overview.schemas.js';

// Mon 2026-11-23 10:30 ICT (03:30 UTC) — inside trading hours
const TRADING_NOW = new Date('2026-11-23T03:30:00.000Z');
// Sat 2026-11-21 10:00 ICT (03:00 UTC) — off-hours weekend
const WEEKEND_NOW = new Date('2026-11-21T03:00:00.000Z');

function unixIct(isoDate: string, hhmm: string): number {
  return Math.floor(new Date(`${isoDate}T${hhmm}:00+07:00`).getTime() / 1_000);
}

function generateTradingDates(startMonday: string, weeks: number): string[] {
  const start = new Date(`${startMonday}T00:00:00.000Z`);
  const dates: string[] = [];
  for (let w = 0; w < weeks; w += 1) {
    for (let d = 0; d < 5; d += 1) {
      const dt = new Date(start.getTime() + (w * 7 + d) * 86_400_000);
      dates.push(dt.toISOString().slice(0, 10));
    }
  }
  return dates;
}

function buildMockHarness(options?: {
  now?: () => number;
  dbConfigured?: boolean;
  newsEnabled?: boolean;
}) {
  const cache = new MarketOverviewCache({
    maxEntries: 128,
    defaultMaxStaleMs: 10 * 60_000,
    now: options?.now,
  });

  const vci = {
    fetchGroupSymbols: vi.fn(async (group: string) => ({
      data:
        group === 'FU_INDEX'
          ? [
              { symbol: '41I1GB000' }, // VN30 Nov 2026 (expired 2026-11-19 -> filtered out on Nov 23)
              { symbol: '41I1GC000' }, // VN30 Dec 2026 -> VN30F1M
              { symbol: '41I1H1000' }, // VN30 Jan 2027 -> VN30F2M
              { symbol: '41I1H3000' }, // VN30 Mar 2027 -> VN30F1Q
              { symbol: '41I1H6000' }, // VN30 Jun 2027 -> VN30F2Q
              { symbol: 'VN100F2612' }, // VN100 Dec 2026 -> VN100F1M
              { symbol: 'VN100F2701' }, // VN100 Jan 2027 -> VN100F2M
            ]
          : [],
      rawEndpoint: 'vci:groups',
    })),
    fetchPriceBoard: vi.fn(async (symbols: string[]) => ({
      data: symbols.map((symbol, idx) => ({
        symbol,
        reference_price: symbol.startsWith('VN100') ? 1600 + idx : 1800 + idx * 2,
        close_price: symbol.startsWith('VN100') ? 1612.5 + idx : 1815.5 + idx * 2,
        total_volume: 120_000 - idx * 10_000,
        total_value: (1815.5 + idx * 2) * 100_000 * (120_000 - idx * 10_000),
        foreign_buy_volume: 2_500,
        foreign_sell_volume: 1_900,
        foreign_buy_value: 450_000_000_000,
        foreign_sell_value: 340_000_000_000,
      })),
      rawEndpoint: 'vci:price-board',
    })),
    fetchOhlcv: vi.fn(async () => ({ data: [], rawEndpoint: 'vci:ohlcv' })),
    fetchIndustries: vi.fn(async () => ({
      data: [
        { icb_code: '8300', icb_name: 'Ngân hàng', en_icb_name: 'Banks', level: 2 },
        { icb_code: '8600', icb_name: 'Bất động sản', en_icb_name: 'Real Estate', level: 2 },
        {
          icb_code: '1700',
          icb_name: 'Tài nguyên cơ bản',
          en_icb_name: 'Basic Resources',
          level: 2,
        },
      ],
      rawEndpoint: 'vci:industries',
    })),
    fetchIcbDirectory: vi.fn(async () => ({
      data: [
        { symbol: 'VCB', lv2: '8300', lv4: '8355' },
        { symbol: 'BID', lv2: '8300', lv4: '8355' },
        { symbol: 'VIC', lv2: '8600', lv4: '8633' },
        { symbol: 'HPG', lv2: '1700', lv4: '1757' },
      ],
      rawEndpoint: 'vci:icb-dir',
    })),
    fetchEvents: vi.fn(async (_start: string, _end?: string, eventType?: string) => {
      if (eventType === 'agm') {
        return {
          data: [
            {
              id: 'ev_agm_1',
              ticker: 'FPT',
              event_code: 'EGME',
              exright_date: '2026-12-05',
              event_title: 'Đại hội cổ đông bất thường',
            },
          ],
          rawEndpoint: 'vci:events',
        };
      }
      return {
        data: [
          {
            id: 'ev_div_1',
            ticker: 'VCB',
            event_code: 'DIV',
            exright_date: '2026-11-28',
            value_per_share: 1500,
            event_title: 'Trả cổ tức bằng tiền mặt',
          },
          {
            id: 'ev_iss_1',
            ticker: 'HPG',
            event_code: 'ISS',
            exright_date: '2026-12-01',
            event_title: 'Cổ phiếu thưởng 10%',
          },
        ],
        rawEndpoint: 'vci:events',
      };
    }),
  };

  const vnd = {
    fetchOhlcv: vi.fn(async (symbol: string, _from: number, _to: number, interval: string) => {
      if (interval === '1m' || interval === '5m') {
        const base =
          symbol === 'VNINDEX'
            ? 1700
            : symbol === 'VN30'
              ? 1805
              : symbol === 'VN30F1M'
                ? 1815
                : symbol === 'HNX'
                  ? 240
                  : 98;
        const times =
          symbol === 'VN30F1M'
            ? ['08:45', '08:55', '09:00', '09:15', '10:30']
            : ['09:00', '09:15', '10:30'];
        return {
          data: times.map((hhmm, idx) => ({
            time: unixIct('2026-11-23', hhmm),
            open: base + idx * 0.5,
            high: base + idx * 0.5 + 1,
            low: base + idx * 0.5 - 0.5,
            close: base + idx * 1.2,
            volume: 1_000_000 + idx * 200_000,
          })),
          rawEndpoint: 'vnd:ohlcv',
        };
      }
      return {
        data: [
          {
            time: unixIct('2026-11-20', '14:45'),
            close: symbol === 'VN100' ? 1595 : 1690,
            volume: 100,
          },
          {
            time: unixIct('2026-11-23', '14:45'),
            close: symbol === 'VN100' ? 1605 : 1703,
            volume: 120,
          },
        ],
        rawEndpoint: 'vnd:ohlcv',
      };
    }),
    fetchRanking: vi.fn(async () => ({ data: [], rawEndpoint: 'vnd:ranking' })),
  };

  const vietcapOverview = {
    marketIndex: vi.fn(async (symbols: string[]) => ({
      sourceUrl: 'vci:market-index',
      data: symbols
        .filter((s) => s !== 'VN100') // Force VN100 VND fallback coverage
        .map((sym) => {
          const cfg: Record<string, { price: number; ref: number; valM: number }> = {
            VNINDEX: { price: 1703.01, ref: 1693.01, valM: 18_500_000 },
            VN30: { price: 1808.5, ref: 1798.0, valM: 9_200_000 },
            HNXIndex: { price: 242.1, ref: 240.0, valM: 1_800_000 },
            HNXUpcomIndex: { price: 98.4, ref: 98.0, valM: 850_000 },
          };
          const row = cfg[sym] ?? { price: 1000, ref: 1000, valM: 1_000_000 };
          return {
            symbol: sym,
            price: row.price,
            ref_price: row.ref,
            change: row.price - row.ref,
            change_percent: ((row.price - row.ref) / row.ref) * 100,
            total_shares: 650_000_000,
            total_value_million_vnd: row.valM,
            total_stock_increase: 210,
            total_stock_decline: 120,
            total_stock_no_change: 50,
            total_stock_ceiling: 15,
            total_stock_floor: 3,
          };
        }),
    })),
    heatmap: vi.fn(async (group: string, sector: string) => {
      if (sector === 'icb_code_4') {
        return {
          sourceUrl: 'vci:heatmap-lv4',
          data: [
            {
              icb_code: 533,
              icb_name: 'Dầu khí',
              icb_change_percent: 2.35,
              total_market_cap_vnd: 200e12,
              stocks: [],
            },
            {
              icb_code: 1757,
              icb_name: 'Thép',
              icb_change_percent: -1.15,
              total_market_cap_vnd: 180e12,
              stocks: [],
            },
            {
              icb_code: 1353,
              icb_name: 'Cao su',
              icb_change_percent: 1.8,
              total_market_cap_vnd: 90e12,
              stocks: [],
            },
            {
              icb_code: 1357,
              icb_name: 'Phân bón',
              icb_change_percent: 0.9,
              total_market_cap_vnd: 70e12,
              stocks: [],
            },
            {
              icb_code: 3577,
              icb_name: 'Đường',
              icb_change_percent: 0.45,
              total_market_cap_vnd: 50e12,
              stocks: [],
            },
          ],
        };
      }
      if (group === 'HNX') {
        return {
          sourceUrl: 'vci:heatmap-hnx',
          data: [
            {
              icb_code: 8300,
              icb_name: 'Ngân hàng',
              icb_change_percent: 1.1,
              total_market_cap_vnd: 50e12,
              stocks: [
                {
                  symbol: 'SHS',
                  price: 16500,
                  ref_price: 15000,
                  ceiling_price: 16500,
                  floor_price: 13500,
                  volume: 10_000_000,
                  value_million_vnd: 165_000,
                  market_cap_vnd: 15e12,
                },
                {
                  symbol: 'PVS',
                  price: 38000,
                  ref_price: 38000,
                  ceiling_price: 41800,
                  floor_price: 34200,
                  volume: 0,
                  value_million_vnd: 0,
                  market_cap_vnd: 18e12,
                },
              ],
            },
          ],
        };
      }
      if (group === 'UPCOM') {
        return {
          sourceUrl: 'vci:heatmap-upcom',
          data: [
            {
              icb_code: 1700,
              icb_name: 'Tài nguyên cơ bản',
              icb_change_percent: -0.5,
              total_market_cap_vnd: 40e12,
              stocks: [
                {
                  symbol: 'BSR',
                  price: 18700,
                  ref_price: 22000,
                  ceiling_price: 25300,
                  floor_price: 18700,
                  volume: 5_000_000,
                  value_million_vnd: 95_000,
                  market_cap_vnd: 60e12,
                },
              ],
            },
          ],
        };
      }
      return {
        sourceUrl: 'vci:heatmap-all',
        data: [
          {
            icb_code: 8300,
            icb_name: 'Ngân hàng',
            icb_change_percent: 1.5,
            total_market_cap_vnd: 900e12,
            stocks: [
              {
                symbol: 'VCB',
                price: 96300,
                ref_price: 90000,
                ceiling_price: 96300,
                floor_price: 83700,
                volume: 4_000_000,
                value_million_vnd: 385_000,
                market_cap_vnd: 530e12,
              },
              {
                symbol: 'BID',
                price: 51000,
                ref_price: 50000,
                ceiling_price: 53500,
                floor_price: 46500,
                volume: 3_000_000,
                value_million_vnd: 153_000,
                market_cap_vnd: 290e12,
              },
              {
                symbol: 'E1VFVN30',
                price: 24000,
                ref_price: 23500,
                ceiling_price: 25100,
                floor_price: 21900,
                volume: 500_000,
                value_million_vnd: 12_000,
                market_cap_vnd: 8e12,
              }, // ETF excluded
              {
                symbol: 'ILL',
                price: 10700,
                ref_price: 10000,
                ceiling_price: 10700,
                floor_price: 9300,
                volume: 50_000,
                value_million_vnd: 500,
                market_cap_vnd: 1e12,
              }, // 0.5B < 1B excluded from featured
            ],
          },
          {
            icb_code: 8600,
            icb_name: 'Bất động sản',
            icb_change_percent: -1.2,
            total_market_cap_vnd: 350e12,
            stocks: [
              {
                symbol: 'VIC',
                price: 42000,
                ref_price: 43000,
                ceiling_price: 46000,
                floor_price: 40000,
                volume: 6_000_000,
                value_million_vnd: 252_000,
                market_cap_vnd: 165e12,
              },
              {
                symbol: 'VHM',
                price: 40000,
                ref_price: 43000,
                ceiling_price: 46000,
                floor_price: 40000,
                volume: 8_000_000,
                value_million_vnd: 320_000,
                market_cap_vnd: 180e12,
              },
              {
                symbol: 'NLG',
                price: 0,
                ref_price: 38000,
                ceiling_price: 40650,
                floor_price: 35350,
                volume: 0,
                value_million_vnd: 0,
                market_cap_vnd: 14e12,
              }, // unmatched -> unchanged
            ],
          },
        ],
      };
    }),
    liquidity: vi.fn(async (input: { timeFrame: string }) => {
      if (input.timeFrame === 'ONE_DAY') {
        return {
          sourceUrl: 'vci:liq-1d',
          data: [
            {
              symbols: 'VNINDEX',
              timestamps: [unixIct('2026-11-19', '14:45'), unixIct('2026-11-20', '14:45')],
              accumulated_volume: [500_000_000, 600_000_000],
              accumulated_value_million_vnd: [15_000_000, 17_000_000],
            },
          ],
        };
      }
      return {
        sourceUrl: 'vci:liq-1m',
        data: [
          {
            symbols: 'VNINDEX',
            timestamps: [
              unixIct('2026-11-20', '09:15'),
              unixIct('2026-11-20', '10:30'),
              unixIct('2026-11-20', '14:45'),
              unixIct('2026-11-23', '09:15'),
              unixIct('2026-11-23', '10:30'),
            ],
            accumulated_volume: [50_000_000, 200_000_000, 500_000_000, 60_000_000, 240_000_000],
            accumulated_value_million_vnd: [1_500_000, 6_000_000, 16_000_000, 1_800_000, 7_200_000],
          },
        ],
      };
    }),
    foreign: vi.fn(async () => ({
      sourceUrl: 'vci:foreign',
      data: [
        {
          trading_date: '2026-11-20',
          foreign_buy_value_vnd: 1_500_000_000_000,
          foreign_sell_value_vnd: 1_800_000_000_000,
        },
        {
          trading_date: '2026-11-23',
          foreign_buy_value_vnd: 2_100_000_000_000,
          foreign_sell_value_vnd: 1_600_000_000_000,
        },
      ],
    })),
    foreignTop: vi.fn(async () => ({
      sourceUrl: 'vci:foreign-top',
      data: {
        net_buy: [
          { symbol: 'VCB', net_value_vnd: 250_000_000_000 },
          { symbol: 'BID', net_value_vnd: 120_000_000_000 },
          { symbol: 'HPG', net_value_vnd: 80_000_000_000 },
          { symbol: 'FPT', net_value_vnd: 40_000_000_000 },
        ],
        net_sell: [
          { symbol: 'VIC', net_value_vnd: -310_000_000_000 },
          { symbol: 'VHM', net_value_vnd: -190_000_000_000 },
          { symbol: 'MWG', net_value_vnd: -90_000_000_000 },
        ],
      },
    })),
    proprietary: vi.fn(async (market: string) => {
      if (market === 'HNX' || market === 'UPCOM') {
        return { sourceUrl: 'vci:prop', data: [] };
      }
      if (market === 'HOSE') {
        // Test HSX fallback when HOSE returns empty
        return { sourceUrl: 'vci:prop', data: [] };
      }
      return {
        sourceUrl: 'vci:prop',
        data: [
          {
            trading_date: '2026-11-20',
            total_buy_value_vnd: 600_000_000_000,
            total_sell_value_vnd: 420_000_000_000,
          },
        ],
      };
    }),
    proprietaryTop: vi.fn(async (exchange: string) => {
      if (exchange === 'HNX' || exchange === 'UPCOM') {
        return { sourceUrl: 'vci:prop-top', data: { buy: [], sell: [] } };
      }
      return {
        sourceUrl: 'vci:prop-top',
        data: {
          buy: [{ ticker: 'VCB', total_value_vnd: 110_000_000_000 }],
          sell: [{ ticker: 'VHM', total_value_vnd: 75_000_000_000 }],
        },
      };
    }),
    indexImpact: vi.fn(async () => ({
      sourceUrl: 'vci:impact',
      data: {
        top_up: [
          { symbol: 'VCB', impact: 10.5, match_price: 96300, ref_price: 90000 },
          { symbol: 'BID', impact: 3.2, match_price: 51000, ref_price: 50000 },
        ],
        top_down: [
          { symbol: 'VHM', impact: -2.6, match_price: 40000, ref_price: 43000 },
          { symbol: 'VIC', impact: -1.1, match_price: 42000, ref_price: 43000 },
        ],
      },
    })),
    sectorsAllocation: vi.fn(async (_group: string, _timeFrame: string) => ({
      sourceUrl: 'vci:sectors-alloc',
      data: [
        {
          icb_code: 8300,
          icb_change_percent: 1.85,
          total_value_vnd: 6_000_000_000_000,
          total_stock_increase: 18,
          total_stock_decrease: 4,
          total_stock_no_change: 5,
        },
        {
          icb_code: 8600,
          icb_change_percent: -0.95,
          total_value_vnd: 3_000_000_000_000,
          total_stock_increase: 12,
          total_stock_decrease: 30,
          total_stock_no_change: 8,
        },
      ],
    })),
  };

  const vietcapInsight = {
    sectorInformation: vi.fn(async (level: number) => {
      if (level === 4) {
        return {
          sourceUrl: 'vci:sector-info-4',
          data: [
            { icb_code: '0533', market_cap: 200e12, percent_price_change_1d: 2.35 },
            { icb_code: '1757', market_cap: 180e12, percent_price_change_1d: -1.15 },
          ],
        };
      }
      return {
        sourceUrl: 'vci:sector-info-2',
        data: [
          {
            icb_code: '8300',
            market_cap: 900e12,
            percent_price_change_1d: 1.8,
            percent_price_change_1w: 3.4,
            percent_price_change_1m: 6.2,
            percent_price_change_ytd: 18.5,
          },
          {
            icb_code: '8600',
            market_cap: 350e12,
            percent_price_change_1d: -0.9,
            percent_price_change_1w: -2.1,
            percent_price_change_1m: -4.5,
            percent_price_change_ytd: 5.0,
          },
        ],
      };
    }),
  };

  const globalMarket = {
    worldIndex: vi.fn(async (symbol: string) => ({
      sourceUrl: `msn:${symbol}`,
      data: [
        { time: '2026-11-20', close: 1000, previous_close: 990 },
        { time: '2026-11-23', close: 1025, previous_close: 1000 },
      ],
    })),
    forex: vi.fn(async (symbol: string) => ({
      sourceUrl: `msn:${symbol}`,
      data: [
        { time: '2026-11-20', close: 2650, previous_close: 2630 },
        { time: '2026-11-23', close: 2680, previous_close: 2650 },
      ],
    })),
    gold: vi.fn(async (date: string) => ({
      sourceUrl: 'sjc:gold',
      data: [
        {
          date,
          name: 'Vàng SJC 1L, 10L, 1KG',
          branch: 'Hồ Chí Minh',
          buy_price: date === '2026-11-23' ? 84_000_000 : 83_000_000,
          sell_price: date === '2026-11-23' ? 86_000_000 : 85_000_000,
        },
      ],
    })),
    fx: vi.fn(async (date: string) => ({
      sourceUrl: 'vcb:fx',
      data: [
        {
          currency_code: 'USD',
          currency_name: 'US DOLLAR',
          buy_cash: 25100,
          buy_transfer: 25130,
          sell: date === '2026-11-23' ? 25450 : 25400,
          date,
        },
      ],
    })),
  };

  const commoditySheetsNews = {
    commodity: vi.fn(async (code: string) => ({
      sourceUrl: `simplize:${code}`,
      data: [
        { time: 1795000000, close: 70 },
        { time: 1795100000, close: 72.1 },
      ],
    })),
    rss: vi.fn(async () => ({
      sourceUrl: 'rss:vn',
      data: [
        {
          title: 'Fed giữ nguyên lãi suất, chứng khoán Mỹ lập đỉnh mới',
          link: 'https://vietstock.vn/fed-news',
          description: 'Kinh tế thế giới',
          pub_date: 'Mon, 23 Nov 2026 02:30:00 GMT',
          site: 'vietstock',
        },
      ],
    })),
  };

  const aiNews = {
    list: vi.fn(async (kind: string) => ({
      sourceUrl: `ai-news:${kind}`,
      data: {
        total: 2,
        items:
          kind === 'business'
            ? [
                {
                  id: 'n1',
                  slug: 'vcb-loi-nhuan-quy-4',
                  ticker: 'VCB',
                  title: 'VCB công bố lợi nhuận quý 4 tăng trưởng mạnh',
                  source_link: 'https://ai.vietcap.com.vn/vcb',
                  update_date: '2026-11-23T03:15:00.000Z',
                  source_name: 'Vietcap',
                  topic_name: '',
                  raw_type: 'business',
                },
              ]
            : kind === 'topic'
              ? [
                  {
                    id: 'n2',
                    slug: 'thanh-khoan-vnindex',
                    ticker: '',
                    title: 'Thanh khoản VN-Index bứt phá trong phiên sáng',
                    source_link: 'https://ai.vietcap.com.vn/vni',
                    update_date: '2026-11-23T03:00:00.000Z',
                    source_name: 'Vietcap',
                    topic_name: 'Thị trường',
                    raw_type: 'topic',
                  },
                ]
              : [],
      },
    })),
  };

  const httpTransport = {
    requestJson: vi.fn(async () => ({
      data: [
        [1795000000, 75, 76, 74, 75.0, 1000],
        [1795100000, 75, 78, 74.5, 76.5, 1200],
      ],
    })),
  };

  const rrgDates = generateTradingDates('2025-07-07', 70);
  const vcbCloses = rrgDates.map((_, idx) => 80 + idx * 0.08 + Math.sin(idx / 8) * 2);
  const vicCloses = rrgDates.map((_, idx) => 45 - idx * 0.02 + Math.cos(idx / 9) * 1.5);
  const vniCloses = rrgDates.map((_, idx) => 1500 + idx * 0.4 + Math.sin(idx / 12) * 10);

  const database = {
    isConfigured: vi.fn(() => options?.dbConfigured ?? true),
    query: vi.fn(async (sql: string) => {
      const normalized = sql.toLowerCase();
      if (normalized.includes('from virtual_trading_configs')) {
        return [{ holidays: ['2026-12-17'] }];
      }
      if (normalized.includes('from market_index_bars')) {
        return rrgDates.map((d, idx) => ({ trade_date: d, close: vniCloses[idx]! }));
      }
      if (normalized.includes('s.current_price_vnd')) {
        return [
          { symbol: 'VCB', current_price_vnd: 75_000n, bars: null },
          { symbol: 'HPG', current_price_vnd: 28_000n, bars: null },
          { symbol: 'FPT', current_price_vnd: 135_000n, bars: null },
        ];
      }
      if (
        normalized.includes('from market_daily_bars') &&
        normalized.includes('shares_outstanding')
      ) {
        return [
          {
            symbol: 'VCB',
            shares_outstanding: 5_589_000_000,
            icb_lv2: '8300',
            bars: { d: rrgDates, c: vcbCloses, v: rrgDates.map(() => 2_000_000) },
          },
          {
            symbol: 'VIC',
            shares_outstanding: 3_823_000_000,
            icb_lv2: '8600',
            bars: { d: rrgDates, c: vicCloses, v: rrgDates.map(() => 3_000_000) },
          },
        ];
      }
      if (normalized.includes('from market_daily_bars')) {
        return [
          {
            symbol: 'VCB',
            bars: {
              d: rrgDates.slice(-25),
              c: rrgDates.slice(-25).map(() => 90),
              v: rrgDates.slice(-25).map(() => 2_000_000),
            },
          },
          {
            symbol: 'BID',
            bars: {
              d: rrgDates.slice(-25),
              c: rrgDates.slice(-25).map(() => 50),
              v: rrgDates.slice(-25).map(() => 2_500_000),
            },
          },
          {
            symbol: 'VIC',
            bars: {
              d: rrgDates.slice(-25),
              c: rrgDates.slice(-25).map(() => 43),
              v: rrgDates.slice(-25).map(() => 4_000_000),
            },
          },
        ];
      }
      if (normalized.includes('from symbols') && normalized.includes("<> 'stock'")) {
        return [{ symbol: 'E1VFVN30' }];
      }
      if (normalized.includes('from symbols')) {
        return [
          { symbol: 'VCB', exchange: 'HOSE' },
          { symbol: 'BID', exchange: 'HOSE' },
          { symbol: 'VIC', exchange: 'HOSE' },
          { symbol: 'VHM', exchange: 'HOSE' },
          { symbol: 'SHS', exchange: 'HNX' },
          { symbol: 'BSR', exchange: 'UPCOM' },
        ];
      }
      return [];
    }),
  };

  const repository = {
    getRecentLiquidityHistory: vi.fn(async (): Promise<StoredLiquidityHistory[]> => []),
    upsertLiquidityHistory: vi.fn(
      async (
        sessionDate: string,
        exchange: string,
        points: readonly LiquidityHistoryPoint[],
      ): Promise<StoredLiquidityHistory> => ({
        sessionDate,
        exchange,
        points: [...points],
        updatedAt: TRADING_NOW.toISOString(),
      }),
    ),
  };

  const tradingCalendar = new VnTradingCalendarService(
    database as unknown as DatabaseService,
    cache,
  );

  const indexWidgets = new IndexWidgetsService(
    vci as unknown as VciMarketProvider,
    vnd as unknown as VndMarketProvider,
    vietcapOverview as unknown as VietcapOverviewProvider,
    repository as unknown as MarketOverviewRepository,
    database as unknown as DatabaseService,
    tradingCalendar,
  );

  const stockSectorWidgets = new StockSectorWidgetsService(
    vietcapOverview as unknown as VietcapOverviewProvider,
    vietcapInsight as unknown as VietcapInsightProvider,
    vci as unknown as VciMarketProvider,
    vnd as unknown as VndMarketProvider,
    database as unknown as DatabaseService,
    cache,
    tradingCalendar,
  );

  const derivativesWidgets = new DerivativesWidgetsService(
    vci as unknown as VciMarketProvider,
    vnd as unknown as VndMarketProvider,
    vietcapOverview as unknown as VietcapOverviewProvider,
    tradingCalendar,
  );

  const globalEventsWidgets = new GlobalEventsWidgetsService(
    globalMarket as unknown as GlobalMarketProvider,
    commoditySheetsNews as unknown as CommoditySheetsNewsProvider,
    aiNews as unknown as AiNewsProvider,
    vietcapOverview as unknown as VietcapOverviewProvider,
    vietcapInsight as unknown as VietcapInsightProvider,
    vci as unknown as VciMarketProvider,
    httpTransport as unknown as MarketHttpTransport,
    database as unknown as DatabaseService,
    tradingCalendar,
  );

  const dispatcher = new MarketOverviewWidgetDispatcherService(
    cache,
    indexWidgets,
    stockSectorWidgets,
    derivativesWidgets,
    globalEventsWidgets,
    tradingCalendar,
    options?.newsEnabled !== undefined ? { newsEnabled: options.newsEnabled } : undefined,
  );

  return {
    cache,
    vci,
    vnd,
    vietcapOverview,
    vietcapInsight,
    globalMarket,
    commoditySheetsNews,
    aiNews,
    httpTransport,
    database,
    repository,
    tradingCalendar,
    dispatcher,
  };
}

describe('MarketOverviewWidgetDispatcherService — all 16 widgets', () => {
  it('validates every single widget response against the strict Zod discriminated union schema', async () => {
    const { dispatcher } = buildMockHarness();

    const cases: Array<[string, Record<string, unknown>]> = [
      ['index_chart', { index: 'VNINDEX', range: 'intraday' }],
      ['market_breadth', {}],
      ['market_liquidity', {}],
      ['foreign_flow', { exchange: 'HOSE', tab: 'foreign' }],
      ['vnindex_impact', {}],
      ['market_heatmap', { mode: 'stock', sizeBy: 'market_cap' }],
      ['featured_stocks', { tab: 'gainers' }],
      ['sector_performance', { period: 'today', tab: 'price' }],
      ['sector_rotation', {}],
      ['derivatives_summary', {}],
      ['vn30f_vs_vn30', { range: 'intraday' }],
      ['futures_table', {}],
      ['world_indices', {}],
      ['commodities_fx', { tab: 'energy_metals' }],
      ['events_calendar', { filter: 'all' }],
      ['market_news', {}],
    ];

    for (const [slug, query] of cases) {
      const response = await dispatcher.getWidgetData(slug, query, TRADING_NOW);
      const parsed = marketOverviewWidgetResponseSchema.safeParse(response);
      expect(parsed.success, `schema failed for ${slug}`).toBe(true);
      expect(response.widget).toBe(slug);
      expect(response.isMarketOpen).toBe(true);
      expect(response.sessionDate).toBe('2026-11-23');
      expect(response.stale).toBe(false);
    }
  });

  it('reports off-hours metadata cleanly on weekends', async () => {
    const { dispatcher } = buildMockHarness();
    const res = await dispatcher.getWidgetData('market_breadth', {}, WEEKEND_NOW);
    expect(res.isMarketOpen).toBe(false);
    expect(res.sessionDate).toBe('2026-11-20');
  });

  it('enforces error isolation: 400 on unknown widget, stale cache fallback, and 503 (never 500) on cold upstream failure', async () => {
    let clock = 1_000_000;
    const { dispatcher, vietcapOverview } = buildMockHarness({ now: () => clock });

    await expect(dispatcher.getWidgetData('does_not_exist', {}, TRADING_NOW)).rejects.toThrow(
      BadRequestException,
    );

    // Warm cache for market_breadth
    const fresh = await dispatcher.getWidgetData('market_breadth', {}, TRADING_NOW);
    expect(fresh.stale).toBe(false);

    // Expire TTL, break all upstreams -> serves stale cache instead of throwing
    clock += 30_000;
    vietcapOverview.heatmap.mockRejectedValue(new Error('VCI timeout'));
    vietcapOverview.marketIndex.mockRejectedValue(new Error('VCI down'));

    const staleRes = await dispatcher.getWidgetData('market_breadth', {}, TRADING_NOW);
    expect(staleRes.stale).toBe(true);
    expect(staleRes.data.exchanges).toHaveLength(3);

    // Cold widget with broken upstream -> ServiceUnavailableException (503), never 500
    vietcapOverview.indexImpact.mockRejectedValue(new Error('VCI impact down'));
    await expect(dispatcher.getWidgetData('vnindex_impact', {}, TRADING_NOW)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

describe('Widget-specific invariants & domain math', () => {
  it('index_chart returns 5 index cards including VN30F1M and daily 3m series', async () => {
    const { dispatcher } = buildMockHarness();
    const res = await dispatcher.getWidgetData(
      'index_chart',
      { index: 'VN30F1M', range: '3m' },
      TRADING_NOW,
    );
    expect(res.data.cards.map((c) => c.code)).toEqual([
      'VNINDEX',
      'VN30',
      'HNX',
      'UPCOM',
      'VN30F1M',
    ]);
    expect(res.data.selected.code).toBe('VN30F1M');
    expect(res.data.selected.range).toBe('3m');
    expect(res.data.selected.points.length).toBeGreaterThan(0);
  });

  it('market_breadth counts equities only (excludes ETF), folds ceiling into advancingTotal, floor into decliningTotal, unmatched into unchanged', async () => {
    const { dispatcher } = buildMockHarness();
    const res = await dispatcher.getWidgetData('market_breadth', {}, TRADING_NOW);
    const hose = res.data.exchanges.find((e) => e.exchange === 'HOSE')!;
    // Equities in HOSE mock: VCB(ceil), BID(adv), ILL(ceil), VIC(dec), VHM(floor), NLG(unmatched->unchanged); E1VFVN30 excluded
    expect(hose.ceiling).toBe(2);
    expect(hose.advancing).toBe(1);
    expect(hose.advancingTotal).toBe(3);
    expect(hose.unchanged).toBe(1);
    expect(hose.declining).toBe(1);
    expect(hose.floor).toBe(1);
    expect(hose.decliningTotal).toBe(2);
    expect(hose.total).toBe(6);
  });

  it('market_liquidity computes HOSE matched curve with pctVsPrevSameTime and pctVsAvg20SameTime', async () => {
    const { dispatcher } = buildMockHarness();
    const res = await dispatcher.getWidgetData('market_liquidity', {}, TRADING_NOW);
    expect(res.data.exchange).toBe('HOSE');
    expect(res.data.currentValueBillion).toBe(7200);
    // At 10:30: today=7200, prev=6000 -> 120.0%
    expect(res.data.pctVsPrevSameTime).toBe(120);
    expect(res.data.pctVsAvg20SameTime).toBeGreaterThan(0);
    // After 10:30 (at 14:45): today is null while prev & avg20 remain populated
    const closePoint = res.data.points.find((p) => p.t === '14:45');
    expect(closePoint?.today).toBeNull();
    expect(closePoint?.prev).toBe(16000);
    expect(closePoint?.avg20).toBeGreaterThan(0);
  });

  it('foreign_flow sets propSupported=false for HNX/UPCoM, falls back to HSX for HOSE prop data, and stamps EOD sessionDate on prop tab', async () => {
    const { dispatcher } = buildMockHarness();

    const hoseProp = await dispatcher.getWidgetData(
      'foreign_flow',
      { exchange: 'HOSE', tab: 'prop' },
      TRADING_NOW,
    );
    expect(hoseProp.data.propSupported).toBe(true);
    expect(hoseProp.data.netBillion).toBe(180);
    expect(hoseProp.data.topBuy[0]?.symbol).toBe('VCB');
    expect(hoseProp.data.topSell[0]?.netBillion).toBeLessThan(0);
    // [H8] EOD proprietary session date reflects sessions.at(-1).date ('2026-11-20'), NOT live TRADING_NOW ('2026-11-23')
    expect(hoseProp.sessionDate).toBe('2026-11-20');

    const hnxProp = await dispatcher.getWidgetData(
      'foreign_flow',
      { exchange: 'HNX', tab: 'prop' },
      TRADING_NOW,
    );
    expect(hnxProp.data.propSupported).toBe(false);
    expect(hnxProp.data.sessions).toEqual([]);
    expect(hnxProp.sessionDate).toBe('2026-11-23');

    const upcomForeign = await dispatcher.getWidgetData(
      'foreign_flow',
      { exchange: 'UPCOM', tab: 'foreign' },
      TRADING_NOW,
    );
    expect(upcomForeign.data.propSupported).toBe(false);
    expect(upcomForeign.data.topBuy).toHaveLength(3);
    expect(upcomForeign.data.topSell).toHaveLength(3);
    expect(upcomForeign.sessionDate).toBe('2026-11-23');
  });

  it('vnindex_impact reconciles sumUp + sumDn within <= 0.1 pt of VN-Index change', async () => {
    const { dispatcher } = buildMockHarness();
    const res = await dispatcher.getWidgetData('vnindex_impact', {}, TRADING_NOW);
    expect(res.data.delta).toBeLessThanOrEqual(0.1);
    expect(Math.abs(res.data.sumUp + res.data.sumDn - res.data.indexChange)).toBeLessThanOrEqual(
      0.1,
    );
    expect(res.data.positive.length).toBeGreaterThan(0);
    expect(res.data.negative.length).toBeGreaterThan(0);
  });

  it('featured_stocks enforces >= 1B GTGD filter, |foreignNet| sort, and top-60 GTGD cap on vol_spike', async () => {
    const { dispatcher, vietcapOverview, database } = buildMockHarness();

    // Generate 65 stocks with GTGD >= 1B; the 65th stock (STK65) has huge volume spike but ranks 65th by GTGD.
    const stocks = Array.from({ length: 65 }, (_, i) => {
      const rank = i + 1;
      const symbol = `S${String(rank).padStart(2, '0')}`;
      const valueMillion = (100 - rank) * 1_000; // 99B down to 35B (>= 1B)
      return {
        symbol,
        price: 20_000 + (rank % 5) * 500,
        ref_price: 20_000,
        ceiling_price: 21_400,
        floor_price: 18_600,
        volume: rank === 65 ? 50_000_000 : rank === 10 ? 8_000_000 : 1_000_000,
        value_million_vnd: valueMillion,
        market_cap_vnd: 10e12,
      };
    });
    // Add one sub-1B stock with huge gain that MUST be excluded
    stocks.push({
      symbol: 'TINY',
      price: 21_400,
      ref_price: 20_000,
      ceiling_price: 21_400,
      floor_price: 18_600,
      volume: 20_000,
      value_million_vnd: 800, // 0.8B < 1B
      market_cap_vnd: 1e12,
    });

    vietcapOverview.heatmap.mockResolvedValue({
      sourceUrl: 'vci:heatmap',
      data: [
        {
          icb_code: 8300,
          icb_name: 'Ngân hàng',
          icb_change_percent: 1,
          total_market_cap_vnd: 500e12,
          stocks,
        },
      ],
    });

    database.query.mockImplementation(async (sql: string) => {
      if (sql.toLowerCase().includes('from market_daily_bars')) {
        return stocks.map((s) => ({
          symbol: s.symbol,
          bars: {
            d: ['2026-11-19', '2026-11-20'],
            c: [20, 20],
            v: [1_000_000, 1_000_000],
          },
        }));
      }
      return [];
    });

    const gainers = await dispatcher.getWidgetData(
      'featured_stocks',
      { tab: 'gainers' },
      TRADING_NOW,
    );
    expect(gainers.data.rows.every((r) => r.valueBillion >= 1)).toBe(true);
    expect(gainers.data.rows.some((r) => r.symbol === 'TINY')).toBe(false);

    const volSpike = await dispatcher.getWidgetData(
      'featured_stocks',
      { tab: 'vol_spike' },
      TRADING_NOW,
    );
    // S65 is rank 65 by GTGD (outside top 60) so MUST NOT appear in vol_spike!
    expect(volSpike.data.rows.some((r) => r.symbol === 'S65')).toBe(false);
    // S10 is rank 10 by GTGD with 8x daily volume -> must be #1!
    expect(volSpike.data.rows[0]?.symbol).toBe('S10');
    expect(volSpike.data.rows[0]?.volRatio20d).toBeGreaterThan(10);
  });

  it('sector_performance computes local 20D sector GTGD ratio and sector_rotation emits symmetric RRG trails', async () => {
    const { dispatcher } = buildMockHarness();

    const perf = await dispatcher.getWidgetData(
      'sector_performance',
      { period: 'today', tab: 'flow' },
      TRADING_NOW,
    );
    expect(perf.data.rows[0]?.code).toBe('8300');
    expect(perf.data.rows[0]?.valueSharePct).toBeCloseTo(66.67, 1);
    expect(perf.data.rows[0]?.valueRatio20d).toBeGreaterThan(0);

    const rrg = await dispatcher.getWidgetData('sector_rotation', {}, TRADING_NOW);
    expect(rrg.data.sectors.length).toBeGreaterThanOrEqual(2);
    expect(rrg.data.domain.maxRatio - 100).toBeCloseTo(100 - rrg.data.domain.minRatio, 2);
    expect(rrg.data.domain.maxMomentum - 100).toBeCloseTo(100 - rrg.data.domain.minMomentum, 2);
    for (const s of rrg.data.sectors) {
      expect(s.trail).toHaveLength(5);
    }
  });

  it('derivatives widgets honor DB holidays, preserve 08:45-08:59 pre-open vn30:null, and populate VN30/VN100 groups', async () => {
    const { dispatcher } = buildMockHarness();

    const summary = await dispatcher.getWidgetData('derivatives_summary', {}, TRADING_NOW);
    // DB holiday 2026-12-17 rolls Dec 2026 3rd Thursday expiry back to 2026-12-16!
    expect(summary.data.contract).toBe('41I1GC000');
    expect(summary.data.expiryDate).toBe('2026-12-16');
    expect(summary.data.basis).toBeCloseTo(7, 1);

    const fvs = await dispatcher.getWidgetData('vn30f_vs_vn30', { range: 'intraday' }, TRADING_NOW);
    const preOpenPoint = fvs.data.points.find((p) => p.t === '08:45');
    expect(preOpenPoint).toBeDefined();
    expect(preOpenPoint?.vn30).toBeNull();
    expect(preOpenPoint?.vn30f).toBeGreaterThan(0);
    expect(preOpenPoint?.basis).toBeNull();
    const regularPoint = fvs.data.points.find((p) => p.t === '09:15');
    expect(regularPoint?.vn30).not.toBeNull();
    expect(regularPoint?.basis).not.toBeNull();

    const table = await dispatcher.getWidgetData('futures_table', {}, TRADING_NOW);
    const vn30Group = table.data.groups.find((g) => g.underlying === 'VN30')!;
    const vn100Group = table.data.groups.find((g) => g.underlying === 'VN100')!;
    expect(vn30Group.contracts.map((c) => c.displayCode)).toEqual([
      'VN30F1M',
      'VN30F2M',
      'VN30F1Q',
      'VN30F2Q',
    ]);
    expect(vn100Group.spotPrice).toBe(1605); // From VND fallback
    expect(vn100Group.contracts.map((c) => c.displayCode)).toEqual(['VN100F1M', 'VN100F2M']);
  });

  it('world_indices covers all 12 indices with Vietnamese country labels and isolates single-index failures', async () => {
    const { dispatcher, globalMarket } = buildMockHarness();
    globalMarket.worldIndex.mockImplementation(async (symbol: string) => {
      if (symbol === 'KOSPI') throw new Error('MSN timeout for KOSPI');
      return {
        sourceUrl: `msn:${symbol}`,
        data: [
          { time: '2026-11-20', close: 1000, previous_close: 990 },
          { time: '2026-11-23', close: 1020, previous_close: 1000 },
        ],
      };
    });

    const res = await dispatcher.getWidgetData('world_indices', {}, TRADING_NOW);
    expect(res.data.rows).toHaveLength(12);
    expect(res.data.rows.map((r) => r.code)).toEqual(WORLD_INDICES_CATALOG.map((c) => c.code));

    const dji = res.data.rows.find((r) => r.code === 'DJI')!;
    expect(dji.country).toBe('Mỹ');
    expect(dji.changePct).toBe(2);

    const kospi = res.data.rows.find((r) => r.code === 'KOSPI')!;
    expect(kospi.country).toBe('Hàn Quốc');
    expect(kospi.price).toBeNull();
    expect(kospi.changePct).toBeNull();
  });

  it('commodities_fx maps fixed ICB Level 4 sector % today across energy_metals, agri, and gold_fx tabs', async () => {
    const { dispatcher } = buildMockHarness();

    const energy = await dispatcher.getWidgetData(
      'commodities_fx',
      { tab: 'energy_metals' },
      TRADING_NOW,
    );
    const brent = energy.data.rows.find((r) => r.code === 'oil_brent')!;
    expect(brent.mappedSectorName).toBe('Dầu khí');
    expect(brent.mappedSectorChangePct).toBe(2.35);

    const hrc = energy.data.rows.find((r) => r.code === 'steel_hrc')!;
    expect(hrc.mappedSectorName).toBe('Thép');
    expect(hrc.mappedSectorChangePct).toBe(-1.15);

    const agri = await dispatcher.getWidgetData('commodities_fx', { tab: 'agri' }, TRADING_NOW);
    expect(agri.data.rows.find((r) => r.code === 'rubber')?.mappedSectorName).toBe(
      'Cao su tự nhiên',
    );
    expect(agri.data.rows.find((r) => r.code === 'rubber')?.mappedSectorChangePct).toBe(1.8);
    expect(agri.data.rows.find((r) => r.code === 'fertilizer_ure')?.mappedSectorName).toBe(
      'Phân bón',
    );
    expect(agri.data.rows.find((r) => r.code === 'sugar')?.mappedSectorName).toBe('Đường');

    const goldFx = await dispatcher.getWidgetData(
      'commodities_fx',
      { tab: 'gold_fx' },
      TRADING_NOW,
    );
    const sjc = goldFx.data.rows.find((r) => r.code === 'gold_sjc')!;
    expect(sjc.price).toBe(86);
    const usdvnd = goldFx.data.rows.find((r) => r.code === 'usd_vnd')!;
    expect(usdvnd.price).toBe(25450);
  });

  it('events_calendar formats cash dividend title, computes yield from symbols.current_price_vnd, and sorts by exDate asc', async () => {
    const { dispatcher } = buildMockHarness();

    const allEvents = await dispatcher.getWidgetData(
      'events_calendar',
      { filter: 'all' },
      TRADING_NOW,
    );
    expect(allEvents.data.rows.map((r) => r.exDate)).toEqual([
      '2026-11-28',
      '2026-12-01',
      '2026-12-05',
    ]);
    const cashRow = allEvents.data.rows[0]!;
    expect(cashRow.symbol).toBe('VCB');
    expect(cashRow.eventType).toBe('cash');
    expect(cashRow.title).toBe('Tiền 1.500 đ/cp');
    expect(cashRow.cashPerShare).toBe(1500);
    expect(cashRow.dividendYieldPct).toBe(2); // 1500 / 75000 * 100 = 2.0%

    const nonCashRow = allEvents.data.rows[1]!;
    expect(nonCashRow.eventType).toBe('other');
    expect(nonCashRow.dividendYieldPct).toBeNull();

    const cashOnly = await dispatcher.getWidgetData(
      'events_calendar',
      { filter: 'cash' },
      TRADING_NOW,
    );
    expect(cashOnly.data.rows).toHaveLength(1);
    expect(cashOnly.data.rows[0]?.eventType).toBe('cash');
  });

  it('market_news defaults to disabled without calling upstreams, and blends AI news + RSS when newsEnabled=true', async () => {
    // [H11] Default (newsEnabled = false): immediate empty payload, zero upstream calls
    const disabledHarness = buildMockHarness();
    const disabledRes = await disabledHarness.dispatcher.getWidgetData(
      'market_news',
      {},
      TRADING_NOW,
    );
    expect(disabledRes.data).toEqual({ enabled: false, rows: [] });
    expect(disabledHarness.aiNews.list).not.toHaveBeenCalled();
    expect(disabledHarness.commoditySheetsNews.rss).not.toHaveBeenCalled();

    // Explicitly enabled (newsEnabled = true): blends AI news + RSS cleanly
    const enabledHarness = buildMockHarness({ newsEnabled: true });
    const res = await enabledHarness.dispatcher.getWidgetData('market_news', {}, TRADING_NOW);
    expect(res.data.enabled).toBe(true);
    expect(res.data.rows).toHaveLength(3);
    expect(res.data.rows.map((r) => r.category)).toEqual([
      'Doanh nghiệp',
      'Thị trường',
      'Thế giới',
    ]);
    // Verified newest-first order
    expect(res.data.rows[0]!.publishedAt >= res.data.rows[1]!.publishedAt).toBe(true);
    expect(res.data.rows[1]!.publishedAt >= res.data.rows[2]!.publishedAt).toBe(true);
  });
});

describe('Round 1 Audit Fix Regressions ([H8]-[H13], [M1]-[M3], [M11])', () => {
  it('[H9] world_indices emits real fetch ISO updatedAt for open date-only bars and preserves trading date when closed', async () => {
    const { dispatcher, globalMarket } = buildMockHarness();
    globalMarket.worldIndex.mockImplementation(async (symbol: string) => {
      if (symbol === 'KOSPI') throw new Error('timeout');
      if (symbol === 'HSI') {
        return {
          sourceUrl: 'msn:HSI',
          data: [
            { time: '2026-11-20', close: 19000, previous_close: 18900 },
            { time: '2026-11-23T00:00:00.000Z', close: 19200, previous_close: 19000 },
          ],
        };
      }
      if (symbol === 'DJI') {
        return {
          sourceUrl: 'msn:DJI',
          data: [
            { time: '2026-11-19', close: 43000, previous_close: 42900 },
            { time: '2026-11-20', close: 43200, previous_close: 43000 },
          ],
        };
      }
      return {
        sourceUrl: `msn:${symbol}`,
        data: [
          { time: '2026-11-20', close: 1000, previous_close: 990 },
          { time: '2026-11-23', close: 1020, previous_close: 1000 },
        ],
      };
    });

    // TRADING_NOW = Mon 2026-11-23T03:30:00.000Z -> Tokyo 12:30 (open), Hong Kong 11:30 (open), NY Sun 22:30 (closed)
    const res = await dispatcher.getWidgetData('world_indices', {}, TRADING_NOW);

    const n225 = res.data.rows.find((r) => r.code === 'N225')!;
    expect(n225.isOpen).toBe(true);
    expect(n225.updatedAt).toBe(TRADING_NOW.toISOString());

    const hsi = res.data.rows.find((r) => r.code === 'HSI')!;
    expect(hsi.isOpen).toBe(true);
    expect(hsi.updatedAt).toBe(TRADING_NOW.toISOString());

    const dji = res.data.rows.find((r) => r.code === 'DJI')!;
    expect(dji.isOpen).toBe(false);
    expect(dji.updatedAt).toBe('2026-11-20');

    const kospi = res.data.rows.find((r) => r.code === 'KOSPI')!;
    expect(kospi.updatedAt).toBeNull();
  });

  it('[H10] SJC & VCB walk backwards skipping weekends, empty days, and explicit same-published-date repeats', async () => {
    const { dispatcher, globalMarket } = buildMockHarness();

    // Mon 2026-11-23: Sun/Sat skipped; Fri 2026-11-20 empty for SJC and explicit same-published-date echo ('2026-11-23') for VCB; Thu 2026-11-19 has prior business-day rate
    globalMarket.gold.mockImplementation(async (date: string) => {
      if (date === '2026-11-23') {
        return {
          sourceUrl: 'sjc:gold',
          data: [
            {
              date,
              name: 'Vàng SJC 1L',
              branch: 'Hồ Chí Minh',
              buy_price: 84_000_000,
              sell_price: 86_000_000,
            },
          ],
        };
      }
      if (date === '2026-11-20') {
        return { sourceUrl: 'sjc:gold', data: [] };
      }
      if (date === '2026-11-19') {
        return {
          sourceUrl: 'sjc:gold',
          data: [
            {
              date,
              name: 'Vàng SJC 1L',
              branch: 'Hồ Chí Minh',
              buy_price: 82_000_000,
              sell_price: 84_000_000,
            },
          ],
        };
      }
      return { sourceUrl: 'sjc:gold', data: [] };
    });

    globalMarket.fx.mockImplementation(async (date: string) => {
      if (date === '2026-11-23' || date === '2026-11-20') {
        return {
          sourceUrl: 'vcb:fx',
          data: [
            {
              currency_code: 'USD',
              currency_name: 'US DOLLAR',
              buy_cash: 25_100,
              buy_transfer: 25_130,
              sell: 25_450,
              date: '2026-11-23',
            },
          ],
        };
      }
      if (date === '2026-11-19') {
        return {
          sourceUrl: 'vcb:fx',
          data: [
            {
              currency_code: 'USD',
              currency_name: 'US DOLLAR',
              buy_cash: 24_900,
              buy_transfer: 24_930,
              sell: 25_200,
              date,
            },
          ],
        };
      }
      return { sourceUrl: 'vcb:fx', data: [] };
    });

    const goldFx = await dispatcher.getWidgetData(
      'commodities_fx',
      { tab: 'gold_fx' },
      TRADING_NOW,
    );
    const sjc = goldFx.data.rows.find((r) => r.code === 'gold_sjc')!;
    expect(sjc.price).toBe(86);
    expect(sjc.changePct).toBeCloseTo(((86 - 84) / 84) * 100, 2);

    const usdvnd = goldFx.data.rows.find((r) => r.code === 'usd_vnd')!;
    expect(usdvnd.price).toBe(25450);
    expect(usdvnd.changePct).toBeCloseTo(((25450 - 25200) / 25200) * 100, 2);

    // Must never query Saturday (2026-11-21) or Sunday (2026-11-22) for prior rate
    const goldQueriedDates = globalMarket.gold.mock.calls.map(([date]) => date);
    expect(goldQueriedDates).not.toContain('2026-11-22');
    expect(goldQueriedDates).not.toContain('2026-11-21');
    const fxQueriedDates = globalMarket.fx.mock.calls.map(([date]) => date);
    expect(fxQueriedDates).not.toContain('2026-11-22');
    expect(fxQueriedDates).not.toContain('2026-11-21');
  });

  it('[H12] featured_stocks normalizes positive net_sell magnitudes to negative and excludes today sessionDate bar from vol_spike 20D avg', async () => {
    const { dispatcher, vietcapOverview, database } = buildMockHarness();

    // Positive net_value_vnd inside net_sell MUST still normalize to negative foreignNetBillion
    vietcapOverview.foreignTop.mockResolvedValue({
      sourceUrl: 'vci:foreign-top',
      data: {
        net_buy: [{ symbol: 'VCB', net_value_vnd: 250_000_000_000 }],
        net_sell: [{ symbol: 'VIC', net_value_vnd: 310_000_000_000 }],
      },
    });

    const foreignRes = await dispatcher.getWidgetData(
      'featured_stocks',
      { tab: 'foreign' },
      TRADING_NOW,
    );
    const vicRow = foreignRes.data.rows.find((r) => r.symbol === 'VIC')!;
    const vcbRow = foreignRes.data.rows.find((r) => r.symbol === 'VCB')!;
    expect(vicRow.foreignNetBillion).toBe(-310);
    expect(vcbRow.foreignNetBillion).toBe(250);
    // VIC (|-310|) ranks ahead of VCB (|250|)
    expect(foreignRes.data.rows[0]?.symbol).toBe('VIC');

    // vol_spike: DB already contains today's bar ('2026-11-23') with massive volume 100M;
    // excluding today's bar keeps avg20 = 1_000_000 (not diluted to 34_000_000!)
    database.query.mockImplementation(async (sql: string) => {
      const norm = sql.toLowerCase();
      if (norm.includes('from virtual_trading_configs')) return [{ holidays: [] }];
      if (norm.includes('from market_daily_bars')) {
        return [
          {
            symbol: 'VCB',
            bars: {
              d: ['2026-11-19', '2026-11-20', '2026-11-23'],
              c: [90, 90, 96.3],
              v: [1_000_000, 1_000_000, 100_000_000],
            },
          },
        ];
      }
      if (norm.includes('from symbols') && norm.includes("<> 'stock'")) return [];
      return [];
    });

    const volSpikeRes = await dispatcher.getWidgetData(
      'featured_stocks',
      { tab: 'vol_spike' },
      TRADING_NOW,
    );
    const vcbVol = volSpikeRes.data.rows.find((r) => r.symbol === 'VCB')!;
    // At 10:30 ICT (90 / 255 elapsed = 0.35294...), volume=4M / (1M * 90/255) = 11.33x
    expect(vcbVol.volRatio20d).toBeCloseTo(11.33, 1);
  });

  it('[H13] derivatives futures_table falls back to notional when VCI foreign buy/sell values are 0 but contract flow is non-zero', async () => {
    const { dispatcher, vci } = buildMockHarness();

    vci.fetchPriceBoard.mockImplementation(async (symbols: string[]) => ({
      data: symbols.map((symbol, idx) => ({
        symbol,
        reference_price: 1800,
        close_price: 1815.5,
        total_volume: 100_000,
        total_value: 0,
        // First contract: 0 values but +600 net contracts -> notional fallback (600 * 1815.5 * 100_000 / 1e9 = 108.93)
        // Second contract: 0 values and 0 net contracts -> stays 0
        foreign_buy_volume: idx === 0 ? 2_500 : 1_000,
        foreign_sell_volume: idx === 0 ? 1_900 : 1_000,
        foreign_buy_value: 0,
        foreign_sell_value: 0,
      })),
      rawEndpoint: 'vci:price-board',
    }));

    const table = await dispatcher.getWidgetData('futures_table', {}, TRADING_NOW);
    const vn30 = table.data.groups.find((g) => g.underlying === 'VN30')!;
    expect(vn30.contracts[0]!.foreignNetBillion).toBe(108.93);
    expect(vn30.contracts[1]!.foreignNetBillion).toBe(0);
  });

  it('[M1] market_liquidity skips persisting incomplete morning curves and excludes truncated curves from useEmpiricalAvg20', async () => {
    const { dispatcher, vietcapOverview, repository } = buildMockHarness();

    // 10 complete historical sessions (reaching 14:45 with 20_000B EOD) + 5 truncated morning sessions (ending 09:30 with 2_000B)
    const completeRows = Array.from({ length: 10 }, (_, idx) => ({
      sessionDate: `2026-11-${String(19 - idx).padStart(2, '0')}`,
      exchange: 'HOSE',
      points: [
        { t: '09:15', v: 2_000 },
        { t: '10:30', v: 8_000 },
        { t: '14:45', v: 20_000 },
      ],
      updatedAt: TRADING_NOW.toISOString(),
    }));
    const truncatedRows = Array.from({ length: 5 }, (_, idx) => ({
      sessionDate: `2026-10-${String(28 - idx).padStart(2, '0')}`,
      exchange: 'HOSE',
      points: [
        { t: '09:15', v: 1_500 },
        { t: '09:30', v: 2_000 },
      ],
      updatedAt: TRADING_NOW.toISOString(),
    }));
    repository.getRecentLiquidityHistory.mockResolvedValue([...completeRows, ...truncatedRows]);

    // Today has 5 morning points ending at 10:30 (< 14:30 -> MUST NOT be persisted);
    // Prev session (2026-11-20) has 5 points reaching 14:45 (>= 14:30 -> SHOULD be persisted).
    vietcapOverview.liquidity.mockImplementation(async (input: { timeFrame: string }) => {
      if (input.timeFrame === 'ONE_DAY') {
        return { sourceUrl: 'vci:liq-1d', data: [] };
      }
      return {
        sourceUrl: 'vci:liq-1m',
        data: [
          {
            symbols: 'VNINDEX',
            timestamps: [
              unixIct('2026-11-20', '09:15'),
              unixIct('2026-11-20', '10:00'),
              unixIct('2026-11-20', '11:30'),
              unixIct('2026-11-20', '13:30'),
              unixIct('2026-11-20', '14:45'),
              unixIct('2026-11-23', '09:15'),
              unixIct('2026-11-23', '09:30'),
              unixIct('2026-11-23', '09:45'),
              unixIct('2026-11-23', '10:00'),
              unixIct('2026-11-23', '10:30'),
            ],
            accumulated_volume: Array(10).fill(100_000_000),
            accumulated_value_million_vnd: [
              2_000_000, 6_000_000, 10_000_000, 14_000_000, 20_000_000, 1_800_000, 3_000_000,
              4_500_000, 6_000_000, 8_000_000,
            ],
          },
        ],
      };
    });

    const res = await dispatcher.getWidgetData('market_liquidity', {}, TRADING_NOW);

    // At 14:45, all 11 complete historical curves (10 DB + prev 2026-11-20) equal 20_000B -> avg20 MUST be 20_000 (not dragged down by 2_000B truncated curves)
    const closePoint = res.data.points.find((p) => p.t === '14:45')!;
    expect(closePoint.avg20).toBe(20000);

    // Only the complete previous session (2026-11-20) is persisted; incomplete morning 2026-11-23 is NOT persisted
    const persistedDates = repository.upsertLiquidityHistory.mock.calls.map(([date]) => date);
    expect(persistedDates).toEqual(['2026-11-20']);
  });

  it('[M2] shared cached VN holiday calendar marks DB holidays closed, rolls sessionDate back, and aligns index_chart front futures', async () => {
    const { dispatcher, database, vci } = buildMockHarness();

    let holidayQueries = 0;
    const baseImpl = database.query.getMockImplementation()!;
    database.query.mockImplementation(async (sql: string) => {
      if (sql.toLowerCase().includes('from virtual_trading_configs')) {
        holidayQueries += 1;
        return [{ holidays: ['2026-11-23', '2026-12-17'] }];
      }
      return baseImpl(sql);
    });

    // On Mon 2026-11-23 10:30 ICT (configured DB holiday): isMarketOpen=false, sessionDate='2026-11-20'
    const breadth = await dispatcher.getWidgetData('market_breadth', {}, TRADING_NOW);
    expect(breadth.isMarketOpen).toBe(false);
    expect(breadth.sessionDate).toBe('2026-11-20');

    // Calling index_chart + derivatives_summary reuses cached holidays (only 1 DB query total!)
    await dispatcher.getWidgetData('derivatives_summary', {}, TRADING_NOW);
    // On Thu 2026-12-17 (DB holiday rolling Dec 2026 expiry back to 2026-12-16), index_chart MUST roll front contract from expired 41I1GC000 to 41I1H1000
    const dec17Now = new Date('2026-12-17T03:30:00.000Z');
    await dispatcher.getWidgetData(
      'index_chart',
      { index: 'VN30F1M', range: 'intraday' },
      dec17Now,
    );
    expect(holidayQueries).toBe(1);
    const priceBoardSymbols = vci.fetchPriceBoard.mock.calls.flatMap(([syms]) => syms);
    expect(priceBoardSymbols).toContain('41I1H1000');
  });

  it('[M3] sector_performance maps period to ONE_DAY / ONE_WEEK / ONE_MONTH / ONE_YEAR with graceful fallback', async () => {
    const { dispatcher, vietcapOverview } = buildMockHarness();

    const calledTimeFrames: string[] = [];
    vietcapOverview.sectorsAllocation.mockImplementation(
      async (_group: string, timeFrame: string) => {
        calledTimeFrames.push(timeFrame);
        if (timeFrame === 'ONE_YEAR') {
          throw new Error('ONE_YEAR unsupported by upstream');
        }
        return {
          sourceUrl: `vci:sectors-alloc:${timeFrame}`,
          data: [
            {
              icb_code: 8300,
              icb_change_percent: timeFrame === 'ONE_WEEK' ? 3.4 : 6.2,
              total_value_vnd: timeFrame === 'ONE_WEEK' ? 28_000_000_000_000 : 90_000_000_000_000,
              total_stock_increase: 20,
              total_stock_decrease: 5,
              total_stock_no_change: 2,
            },
          ],
        };
      },
    );

    await dispatcher.getWidgetData(
      'sector_performance',
      { period: 'today', tab: 'price' },
      TRADING_NOW,
    );
    await dispatcher.getWidgetData(
      'sector_performance',
      { period: '1w', tab: 'price' },
      TRADING_NOW,
    );
    await dispatcher.getWidgetData(
      'sector_performance',
      { period: '1m', tab: 'price' },
      TRADING_NOW,
    );
    const ytdRes = await dispatcher.getWidgetData(
      'sector_performance',
      { period: 'ytd', tab: 'price' },
      TRADING_NOW,
    );

    expect(calledTimeFrames).toEqual([
      'ONE_DAY',
      'ONE_DAY',
      'ONE_WEEK',
      'ONE_DAY',
      'ONE_MONTH',
      'ONE_DAY',
      'ONE_YEAR',
      'ONE_MONTH',
    ]);
    expect(ytdRes.data.period).toBe('ytd');
    expect(ytdRes.data.rows[0]?.advancing).toBe(20);
  });

  it('[M11] excludes DB non-equity 3-char symbols consistently across market_breadth, vnindex_impact, market_heatmap, and featured_stocks', async () => {
    const { dispatcher, vietcapOverview, database } = buildMockHarness();

    const baseImpl = database.query.getMockImplementation()!;
    database.query.mockImplementation(async (sql: string) => {
      const norm = sql.toLowerCase();
      if (norm.includes('from symbols') && norm.includes("<> 'stock'")) {
        return [{ symbol: 'E1VFVN30' }, { symbol: 'FUC' }]; // 3-char closed-end fund / ETF
      }
      return baseImpl(sql);
    });

    vietcapOverview.heatmap.mockResolvedValue({
      sourceUrl: 'vci:heatmap-equity-filter',
      data: [
        {
          icb_code: 8300,
          icb_name: 'Ngân hàng',
          icb_change_percent: 1.5,
          total_market_cap_vnd: 900e12,
          stocks: [
            {
              symbol: 'VCB',
              price: 96300,
              ref_price: 90000,
              ceiling_price: 96300,
              floor_price: 83700,
              volume: 4_000_000,
              value_million_vnd: 385_000,
              market_cap_vnd: 530e12,
            },
            {
              symbol: 'FUC',
              price: 25000,
              ref_price: 23500,
              ceiling_price: 25100,
              floor_price: 21900,
              volume: 3_000_000,
              value_million_vnd: 75_000,
              market_cap_vnd: 150e12,
            },
          ],
        },
      ],
    });

    vietcapOverview.indexImpact.mockResolvedValue({
      sourceUrl: 'vci:impact',
      data: {
        top_up: [
          { symbol: 'VCB', impact: 8.5, match_price: 96300, ref_price: 90000 },
          { symbol: 'FUC', impact: 1.5, match_price: 25000, ref_price: 23500 },
        ],
        top_down: [],
      },
    });

    const [breadth, impact, heatmap, featured] = await Promise.all([
      dispatcher.getWidgetData('market_breadth', {}, TRADING_NOW),
      dispatcher.getWidgetData('vnindex_impact', {}, TRADING_NOW),
      dispatcher.getWidgetData(
        'market_heatmap',
        { mode: 'stock', sizeBy: 'market_cap' },
        TRADING_NOW,
      ),
      dispatcher.getWidgetData('featured_stocks', { tab: 'gainers' }, TRADING_NOW),
    ]);

    expect(breadth.data.exchanges.find((e) => e.exchange === 'HOSE')?.total).toBe(1);
    expect(impact.data.positive.map((i) => i.symbol)).toEqual(['VCB']);
    expect(heatmap.data.sectors.flatMap((s) => s.stocks.map((st) => st.symbol))).toEqual(['VCB']);
    expect(featured.data.rows.map((r) => r.symbol)).toEqual(['VCB']);
  });
});

describe('Round 2 Audit Fix Regressions ([R2-H1], [R2-M2])', () => {
  it('[R2-H1] sector_performance computes valueRatio20d strictly from ONE_DAY on 1w/1m periods and falls back to null when ONE_DAY is unavailable', async () => {
    const { dispatcher, vietcapOverview, database } = buildMockHarness();

    // At TRADING_NOW (Mon 2026-11-23 10:30 ICT): elapsedFrac = 90 / 255.
    // Daily avg20 GTGD for sector 8300 = 100 * 170_000_000 / 1e6 = 17_000B -> avg20SameMin = 6_000B.
    const baseQuery = database.query.getMockImplementation()!;
    database.query.mockImplementation(async (sql: string) => {
      const norm = sql.toLowerCase();
      if (norm.includes('from market_daily_bars') && !norm.includes('shares_outstanding')) {
        return [
          {
            symbol: 'VCB',
            bars: {
              d: ['2026-11-19', '2026-11-20'],
              c: [100, 100],
              v: [170_000_000, 170_000_000],
            },
          },
        ];
      }
      return baseQuery(sql);
    });

    let failOneDay = false;
    vietcapOverview.sectorsAllocation.mockImplementation(
      async (_group: string, timeFrame: string) => {
        if (timeFrame === 'ONE_DAY') {
          if (failOneDay) {
            throw new Error('ONE_DAY unavailable');
          }
          return {
            sourceUrl: 'vci:sectors-alloc:ONE_DAY',
            data: [
              {
                icb_code: 8300,
                icb_change_percent: 1.85,
                total_value_vnd: 6_000_000_000_000, // 6,000B -> 1.0x avg20SameMin
                total_stock_increase: 18,
                total_stock_decrease: 4,
                total_stock_no_change: 5,
              },
              {
                icb_code: 8600,
                icb_change_percent: -0.95,
                total_value_vnd: 3_000_000_000_000, // 3,000B
                total_stock_increase: 12,
                total_stock_decrease: 30,
                total_stock_no_change: 8,
              },
            ],
          };
        }
        if (timeFrame === 'ONE_WEEK') {
          return {
            sourceUrl: 'vci:sectors-alloc:ONE_WEEK',
            data: [
              {
                icb_code: 8300,
                icb_change_percent: 3.4,
                total_value_vnd: 30_000_000_000_000, // 5x ONE_DAY
                total_stock_increase: 21,
                total_stock_decrease: 3,
                total_stock_no_change: 3,
              },
              {
                icb_code: 8600,
                icb_change_percent: -2.1,
                total_value_vnd: 20_000_000_000_000,
                total_stock_increase: 10,
                total_stock_decrease: 35,
                total_stock_no_change: 5,
              },
            ],
          };
        }
        return {
          sourceUrl: `vci:sectors-alloc:${timeFrame}`,
          data: [
            {
              icb_code: 8300,
              icb_change_percent: 6.2,
              total_value_vnd: 120_000_000_000_000, // 20x ONE_DAY
              total_stock_increase: 22,
              total_stock_decrease: 2,
              total_stock_no_change: 3,
            },
            {
              icb_code: 8600,
              icb_change_percent: -4.5,
              total_value_vnd: 80_000_000_000_000,
              total_stock_increase: 9,
              total_stock_decrease: 36,
              total_stock_no_change: 5,
            },
          ],
        };
      },
    );

    const weekRes = await dispatcher.getWidgetData(
      'sector_performance',
      { period: '1w', tab: 'flow' },
      TRADING_NOW,
    );
    const weekBanks = weekRes.data.rows.find((r) => r.code === '8300')!;
    // Period metrics reflect ONE_WEEK (30k / 50k = 60%, advancing = 21)
    expect(weekBanks.valueSharePct).toBeCloseTo(60, 1);
    expect(weekBanks.advancing).toBe(21);
    // valueRatio20d MUST come from ONE_DAY (6k / 6k = 1.0), NOT inflated ~5.0!
    expect(weekBanks.valueRatio20d).toBeCloseTo(1, 2);

    const monthRes = await dispatcher.getWidgetData(
      'sector_performance',
      { period: '1m', tab: 'flow' },
      TRADING_NOW,
    );
    const monthBanks = monthRes.data.rows.find((r) => r.code === '8300')!;
    expect(monthBanks.valueSharePct).toBeCloseTo(60, 1);
    expect(monthBanks.valueRatio20d).toBeCloseTo(1, 2);

    // If ONE_DAY is unavailable on multi-day period, valueRatio20d MUST be null (never divide multi-day value by 1-day avg)
    failOneDay = true;
    const fallbackHarness = buildMockHarness();
    fallbackHarness.database.query.mockImplementation(database.query.getMockImplementation()!);
    fallbackHarness.vietcapOverview.sectorsAllocation.mockImplementation(
      vietcapOverview.sectorsAllocation.getMockImplementation()!,
    );
    const noOneDayRes = await fallbackHarness.dispatcher.getWidgetData(
      'sector_performance',
      { period: '1w', tab: 'flow' },
      TRADING_NOW,
    );
    const noOneDayBanks = noOneDayRes.data.rows.find((r) => r.code === '8300')!;
    expect(noOneDayBanks.valueSharePct).toBeCloseTo(60, 1);
    expect(noOneDayBanks.valueRatio20d).toBeNull();
  });

  it('[R2-M2] reports changePct === 0 on legitimately flat weekdays without walking back to a stale multi-day move', async () => {
    const { dispatcher, globalMarket } = buildMockHarness();
    // Tue 2026-11-24 10:30 ICT (03:30 UTC): Tue rate === Mon rate, while Fri 2026-11-20 had a different rate
    const tuesdayNow = new Date('2026-11-24T03:30:00.000Z');

    globalMarket.gold.mockImplementation(async (date: string) => {
      const sellByDate: Record<string, number> = {
        '2026-11-24': 86_000_000,
        '2026-11-23': 86_000_000,
        '2026-11-20': 84_000_000,
      };
      const sell = sellByDate[date];
      if (!sell) return { sourceUrl: 'sjc:gold', data: [] };
      return {
        sourceUrl: 'sjc:gold',
        data: [
          {
            date,
            name: 'Vàng SJC 1L',
            branch: 'Hồ Chí Minh',
            buy_price: sell - 2_000_000,
            sell_price: sell,
          },
        ],
      };
    });

    globalMarket.fx.mockImplementation(async (date: string) => {
      const sellByDate: Record<string, number> = {
        '2026-11-24': 25_450,
        '2026-11-23': 25_450,
        '2026-11-20': 25_200,
      };
      const sell = sellByDate[date];
      if (!sell) return { sourceUrl: 'vcb:fx', data: [] };
      return {
        sourceUrl: 'vcb:fx',
        data: [
          {
            currency_code: 'USD',
            currency_name: 'US DOLLAR',
            buy_cash: sell - 350,
            buy_transfer: sell - 320,
            sell,
            date,
          },
        ],
      };
    });

    const res = await dispatcher.getWidgetData('commodities_fx', { tab: 'gold_fx' }, tuesdayNow);
    const sjc = res.data.rows.find((r) => r.code === 'gold_sjc')!;
    const usdvnd = res.data.rows.find((r) => r.code === 'usd_vnd')!;

    expect(sjc.price).toBe(86);
    expect(sjc.changePct).toBe(0);
    expect(usdvnd.price).toBe(25450);
    expect(usdvnd.changePct).toBe(0);

    // Must stop at Mon 2026-11-23 and NEVER walk back to Fri 2026-11-20
    expect(globalMarket.gold.mock.calls.map(([date]) => date)).toEqual([
      '2026-11-24',
      '2026-11-23',
    ]);
    expect(globalMarket.fx.mock.calls.map(([date]) => date)).toEqual(['2026-11-24', '2026-11-23']);
  });

  it('[R2-M2] resolves prior business day cleanly across a 9-day Tết holiday gap using VN trading calendar holidays', async () => {
    const { dispatcher, globalMarket } = buildMockHarness();
    // 2026 Tết break: Sat 2026-02-14 .. Sun 2026-02-22 (9 calendar days; Mon-Fri 2026-02-16..20 in VN_HOLIDAYS).
    // First business day after Tết: Mon 2026-02-23 10:30 ICT -> prior business day is Fri 2026-02-13 (10 calendar days back).
    const postTetMonday = new Date('2026-02-23T03:30:00.000Z');

    globalMarket.gold.mockImplementation(async (date: string) => {
      if (date === '2026-02-23') {
        return {
          sourceUrl: 'sjc:gold',
          data: [
            {
              date,
              name: 'Vàng SJC 1L',
              branch: 'Hồ Chí Minh',
              buy_price: 86_000_000,
              sell_price: 88_000_000,
            },
          ],
        };
      }
      if (date === '2026-02-13') {
        return {
          sourceUrl: 'sjc:gold',
          data: [
            {
              date,
              name: 'Vàng SJC 1L',
              branch: 'Hồ Chí Minh',
              buy_price: 84_000_000,
              sell_price: 86_000_000,
            },
          ],
        };
      }
      if (date === '2026-02-12') {
        return {
          sourceUrl: 'sjc:gold',
          data: [
            {
              date,
              name: 'Vàng SJC 1L',
              branch: 'Hồ Chí Minh',
              buy_price: 83_000_000,
              sell_price: 85_000_000,
            },
          ],
        };
      }
      return { sourceUrl: 'sjc:gold', data: [] };
    });

    globalMarket.fx.mockImplementation(async (date: string) => {
      const sellByDate: Record<string, number> = {
        '2026-02-23': 25_600,
        '2026-02-13': 25_400,
        '2026-02-12': 25_300,
      };
      const sell = sellByDate[date];
      if (!sell) return { sourceUrl: 'vcb:fx', data: [] };
      return {
        sourceUrl: 'vcb:fx',
        data: [
          {
            currency_code: 'USD',
            currency_name: 'US DOLLAR',
            buy_cash: sell - 350,
            buy_transfer: sell - 320,
            sell,
            date,
          },
        ],
      };
    });

    const postTetRes = await dispatcher.getWidgetData(
      'commodities_fx',
      { tab: 'gold_fx' },
      postTetMonday,
    );
    const sjc = postTetRes.data.rows.find((r) => r.code === 'gold_sjc')!;
    const usdvnd = postTetRes.data.rows.find((r) => r.code === 'usd_vnd')!;

    expect(sjc.price).toBe(88);
    expect(sjc.changePct).toBeCloseTo(((88 - 86) / 86) * 100, 2);
    expect(usdvnd.price).toBe(25600);
    expect(usdvnd.changePct).toBeCloseTo(((25600 - 25400) / 25400) * 100, 2);
    // Skipped entire 9-day Tết gap (2026-02-14..2026-02-22) with zero upstream calls on holidays/weekends
    expect(globalMarket.gold.mock.calls.map(([date]) => date)).toEqual([
      '2026-02-23',
      '2026-02-13',
    ]);
    expect(globalMarket.fx.mock.calls.map(([date]) => date)).toEqual(['2026-02-23', '2026-02-13']);

    // Also verify during the 9th day of Tết (Sun 2026-02-22): resolves Fri 2026-02-13 vs Thu 2026-02-12
    const duringTetHarness = buildMockHarness();
    duringTetHarness.globalMarket.gold.mockImplementation(
      globalMarket.gold.getMockImplementation()!,
    );
    duringTetHarness.globalMarket.fx.mockImplementation(globalMarket.fx.getMockImplementation()!);
    const duringTetRes = await duringTetHarness.dispatcher.getWidgetData(
      'commodities_fx',
      { tab: 'gold_fx' },
      new Date('2026-02-22T03:00:00.000Z'),
    );
    const duringSjc = duringTetRes.data.rows.find((r) => r.code === 'gold_sjc')!;
    const duringFx = duringTetRes.data.rows.find((r) => r.code === 'usd_vnd')!;
    expect(duringSjc.price).toBe(86);
    expect(duringSjc.changePct).toBeCloseTo(((86 - 85) / 85) * 100, 2);
    expect(duringFx.price).toBe(25400);
    expect(duringFx.changePct).toBeCloseTo(((25400 - 25300) / 25300) * 100, 2);
  });
});
