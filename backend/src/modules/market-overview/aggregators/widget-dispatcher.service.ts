/**
 * Central widget data dispatcher for "Toàn cảnh thị trường" (`GET /api/v2/toan-canh/widgets/:widget`).
 *
 * Wraps all 16 widget aggregators with:
 *  - Strict widget slug & query state sanitization
 *  - Bounded TTL cache + single-flight deduplication + stale-on-error fallback
 *  - Standardized envelope `{ widget, asOf, sessionDate, isMarketOpen, stale, data }`
 *  - Guaranteed non-500 failure handling (`BadRequestException` / `ServiceUnavailableException`)
 */
import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';

import { MarketOverviewCache } from '../market-overview.cache.js';
import {
  isMarketOverviewWidgetSlug,
  sanitizeWidgetState,
  type MarketOverviewWidgetSlug,
} from '../market-overview.catalog.js';
import {
  MARKET_OVERVIEW_PAGES_OPTIONS,
  type MarketOverviewPagesOptions,
} from '../market-overview.pages.service.js';
import type {
  ForeignFlowData,
  MarketOverviewWidgetResponse,
  MarketOverviewWidgetResponseOf,
} from '../market-overview.schemas.js';
import { DerivativesWidgetsService } from './derivatives-widgets.service.js';
import { GlobalEventsWidgetsService } from './global-events-widgets.service.js';
import { IndexWidgetsService } from './index-widgets.service.js';
import { isVnMarketOpen, resolveSessionDate } from './market-overview.helpers.js';
import { StockSectorWidgetsService } from './stock-sector-widgets.service.js';
import { VnTradingCalendarService } from './vn-trading-calendar.service.js';

const TTL_VN_INTRADAY_MS = 10_000;
const TTL_VN_OFF_HOURS_MS = 120_000;
const TTL_GLOBAL_MS = 60_000;
const TTL_EVENTS_NEWS_MS = 15 * 60_000;
const TTL_RRG_MS = 60 * 60_000;

@Injectable()
export class MarketOverviewWidgetDispatcherService {
  private readonly logger = new Logger(MarketOverviewWidgetDispatcherService.name);
  private readonly newsEnabled: boolean;

  constructor(
    private readonly cache: MarketOverviewCache,
    private readonly indexWidgets: IndexWidgetsService,
    private readonly stockSectorWidgets: StockSectorWidgetsService,
    private readonly derivativesWidgets: DerivativesWidgetsService,
    private readonly globalEventsWidgets: GlobalEventsWidgetsService,
    private readonly tradingCalendar: VnTradingCalendarService,
    @Optional()
    @Inject(MARKET_OVERVIEW_PAGES_OPTIONS)
    options?: MarketOverviewPagesOptions,
  ) {
    this.newsEnabled = options?.newsEnabled ?? false;
  }

  async getWidgetData<W extends MarketOverviewWidgetSlug>(
    widget: W | string,
    rawQuery: Record<string, unknown> = {},
    now: Date = new Date(),
  ): Promise<MarketOverviewWidgetResponseOf<W>> {
    if (!isMarketOverviewWidgetSlug(widget)) {
      throw new BadRequestException({
        code: 'UNKNOWN_WIDGET',
        message: `Widget '${String(widget)}' không tồn tại`,
      });
    }

    const slug: MarketOverviewWidgetSlug = widget;
    const state = sanitizeWidgetState(slug, rawQuery) as Record<string, string>;
    const holidays = await this.tradingCalendar.getHolidays();
    const marketOpen = isVnMarketOpen(now, holidays);
    const sessionDate = resolveSessionDate(now, holidays);

    if (slug === 'market_news' && !this.newsEnabled) {
      const disabledResponse: MarketOverviewWidgetResponse = {
        widget: 'market_news',
        asOf: now.toISOString(),
        sessionDate,
        isMarketOpen: marketOpen,
        stale: false,
        data: {
          enabled: false,
          rows: [],
        },
      };
      return disabledResponse as MarketOverviewWidgetResponseOf<W>;
    }

    const ttlMs = this.resolveTtlMs(slug, marketOpen);
    const cacheKey = this.buildCacheKey(slug, state);

    try {
      const result = await this.cache.getOrFetch(
        cacheKey,
        () => this.computeWidgetPayload(slug, state, now),
        { ttlMs, allowStaleOnError: true },
      );

      let effectiveSessionDate = sessionDate;
      if (slug === 'foreign_flow') {
        const flowData = result.value as ForeignFlowData;
        if (flowData.tab === 'prop' && flowData.sessions.length > 0) {
          effectiveSessionDate = flowData.sessions.at(-1)!.date;
        }
      }

      return {
        widget: slug,
        asOf: new Date(result.cachedAt).toISOString(),
        sessionDate: effectiveSessionDate,
        isMarketOpen: marketOpen,
        stale: result.stale,
        data: result.value,
      } as MarketOverviewWidgetResponseOf<W>;
    } catch (error) {
      if (error instanceof HttpException) {
        const status = error.getStatus();
        if (status >= 400 && status < 500) throw error;
      }
      this.logger.warn(
        `Market overview widget '${slug}' unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException({
        code: 'WIDGET_DATA_UNAVAILABLE',
        message: 'Chưa tải được dữ liệu',
      });
    }
  }

  private resolveTtlMs(widget: MarketOverviewWidgetSlug, marketOpen: boolean): number {
    switch (widget) {
      case 'world_indices':
      case 'commodities_fx':
        return TTL_GLOBAL_MS;
      case 'events_calendar':
      case 'market_news':
        return TTL_EVENTS_NEWS_MS;
      case 'sector_rotation':
        return TTL_RRG_MS;
      case 'index_chart':
      case 'market_breadth':
      case 'market_liquidity':
      case 'foreign_flow':
      case 'vnindex_impact':
      case 'market_heatmap':
      case 'featured_stocks':
      case 'sector_performance':
      case 'derivatives_summary':
      case 'vn30f_vs_vn30':
      case 'futures_table':
        return marketOpen ? TTL_VN_INTRADAY_MS : TTL_VN_OFF_HOURS_MS;
    }
  }

  private buildCacheKey(widget: MarketOverviewWidgetSlug, state: Record<string, string>): string {
    const entries = Object.entries(state).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return `widget:${widget}`;
    const suffix = entries.map(([k, v]) => `${k}=${v}`).join('&');
    return `widget:${widget}:${suffix}`;
  }

  private async computeWidgetPayload(
    widget: MarketOverviewWidgetSlug,
    state: Record<string, string>,
    now: Date,
  ): Promise<MarketOverviewWidgetResponse['data']> {
    switch (widget) {
      case 'index_chart':
        return this.indexWidgets.getIndexChart(sanitizeWidgetState('index_chart', state), now);
      case 'market_breadth':
        return this.indexWidgets.getMarketBreadth();
      case 'market_liquidity':
        return this.indexWidgets.getMarketLiquidity(now);
      case 'foreign_flow':
        return this.indexWidgets.getForeignFlow(sanitizeWidgetState('foreign_flow', state), now);
      case 'vnindex_impact':
        return this.indexWidgets.getVnIndexImpact();
      case 'market_heatmap':
        return this.stockSectorWidgets.getMarketHeatmap(
          sanitizeWidgetState('market_heatmap', state),
        );
      case 'featured_stocks':
        return this.stockSectorWidgets.getFeaturedStocks(
          sanitizeWidgetState('featured_stocks', state),
          now,
        );
      case 'sector_performance':
        return this.stockSectorWidgets.getSectorPerformance(
          sanitizeWidgetState('sector_performance', state),
          now,
        );
      case 'sector_rotation':
        return this.stockSectorWidgets.getSectorRotation(now);
      case 'derivatives_summary':
        return this.derivativesWidgets.getDerivativesSummary(now);
      case 'vn30f_vs_vn30':
        return this.derivativesWidgets.getVn30fVsVn30(
          sanitizeWidgetState('vn30f_vs_vn30', state),
          now,
        );
      case 'futures_table':
        return this.derivativesWidgets.getFuturesTable(now);
      case 'world_indices':
        return this.globalEventsWidgets.getWorldIndices(now);
      case 'commodities_fx':
        return this.globalEventsWidgets.getCommoditiesFx(
          sanitizeWidgetState('commodities_fx', state),
          now,
        );
      case 'events_calendar':
        return this.globalEventsWidgets.getEventsCalendar(
          sanitizeWidgetState('events_calendar', state),
          now,
        );
      case 'market_news':
        return this.globalEventsWidgets.getMarketNews(now);
    }
  }
}
