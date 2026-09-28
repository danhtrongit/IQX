import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/index.js';
import { z } from 'zod';
import { COMMODITIES, RSS_FEEDS } from './commodity-sheets-news.provider.js';
import { DEFAULT_MACRO_PERIOD, MACRO_INDICATORS, MACRO_PERIODS } from './economy-funds.provider.js';
import { MarketExtendedService } from './market-extended.service.js';
import { envelope, type SourceResult } from './market-extended.types.js';
import type { AiNewsKind, AiNewsQuery } from './ai-news.provider.js';
import type { ScreeningRequest } from './vietcap-insight.provider.js';

const groups = ['ALL', 'HOSE', 'HNX', 'UPCOM'] as const;
const impactFrames = ['ONE_DAY', 'ONE_WEEK', 'ONE_MONTH', 'YTD', 'ONE_YEAR'] as const;
const liquidityFrames = ['ONE_MINUTE', 'ONE_DAY', 'ONE_WEEK', 'ONE_MONTH', 'ONE_YEAR'] as const;
const valuationFrames = ['SIX_MONTHS', 'YTD', 'ONE_YEAR', 'TWO_YEAR', 'FIVE_YEAR', 'ALL'] as const;
const indexSymbols = ['VNINDEX', 'HNXIndex', 'HNXUpcomIndex', 'VN30', 'HNX30'] as const;

function value(query: Record<string, unknown>, key: string, fallback = ''): string {
  const v = query[key];
  return typeof v === 'string' && v ? v : fallback;
}
function optional(query: Record<string, unknown>, key: string): string | undefined {
  const v = query[key];
  return typeof v === 'string' && v ? v : undefined;
}
function numberValue(
  query: Record<string, unknown>,
  key: string,
  fallback?: number,
  min?: number,
  max?: number,
): number | undefined {
  const raw = query[key];
  if ((raw === undefined || raw === '') && fallback !== undefined) return fallback;
  if (raw === undefined || raw === '') return undefined;
  const parsed = Number(raw);
  if (
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed) ||
    (min !== undefined && parsed < min) ||
    (max !== undefined && parsed > max)
  )
    invalid(`${key} is invalid`);
  return parsed;
}
function oneOf<T extends readonly string[]>(raw: string, allowed: T, key: string): T[number] {
  if (!allowed.includes(raw as T[number]))
    invalid(`${key}='${raw}' is invalid. Allowed: ${allowed.join(', ')}`);
  return raw as T[number];
}
function dateValue(raw: string | undefined, key: string): string | undefined {
  if (!raw) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const parsed = match ? new Date(`${raw}T00:00:00Z`) : undefined;
  if (
    !match ||
    !parsed ||
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(match[1]) ||
    parsed.getUTCMonth() + 1 !== Number(match[2]) ||
    parsed.getUTCDate() !== Number(match[3])
  )
    invalid(`${key} must be a valid YYYY-MM-DD date`);
  return raw;
}
function invalid(message: string): never {
  throw new UnprocessableEntityException({ code: 'VALIDATION_ERROR', message });
}
function result<T>(source: string, input: SourceResult<T>, extra: Record<string, unknown> = {}) {
  return {
    ...envelope(input.data, source, input.sourceUrl),
    source_url: input.sourceUrl,
    ...extra,
  };
}

const screeningSchema = z.object({
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(200).default(50),
  sortFields: z.array(z.string().min(1)).default(['stockStrength']),
  sortOrders: z.array(z.enum(['ASC', 'DESC'])).default(['DESC']),
  filter: z
    .array(
      z.object({
        name: z.string().min(1),
        conditionOptions: z
          .array(
            z.object({
              type: z.string().optional(),
              value: z.string().optional(),
              from: z.number().optional(),
              to: z.number().optional(),
            }),
          )
          .default([]),
        extraName: z.string().optional(),
      }),
    )
    .default([]),
});

@ApiTags('Market data extended')
@Public()
@Controller(['api/v1/market-data', 'api/v2/market-data'])
export class MarketExtendedController {
  constructor(private readonly market: MarketExtendedService) {}

  @Get('overview/liquidity') async liquidity(@Query() q: Record<string, unknown>) {
    const symbols = oneOf(
      value(q, 'symbols', 'ALL'),
      ['ALL', 'VNINDEX', 'HNXIndex', 'HNXUpcomIndex'] as const,
      'symbols',
    );
    const timeFrame = oneOf(value(q, 'time_frame', 'ONE_MINUTE'), liquidityFrames, 'time_frame');
    return result(
      'VCI',
      await this.market.overview.liquidity({
        symbols,
        timeFrame,
        from: numberValue(q, 'from_ts'),
        to: numberValue(q, 'to_ts'),
      }),
    );
  }
  @Get('overview/index-impact') async indexImpact(@Query() q: Record<string, unknown>) {
    return result(
      'VCI',
      await this.market.overview.indexImpact(
        oneOf(value(q, 'group', 'ALL'), groups, 'group'),
        oneOf(value(q, 'time_frame', 'ONE_DAY'), impactFrames, 'time_frame'),
      ),
    );
  }
  @Get('overview/foreign') async foreign(@Query() q: Record<string, unknown>) {
    return result(
      'VCI',
      await this.market.overview.foreign({
        group: oneOf(value(q, 'group', 'ALL'), groups, 'group'),
        timeFrame: oneOf(value(q, 'time_frame', 'ONE_MONTH'), impactFrames, 'time_frame'),
        from: numberValue(q, 'from_ts'),
        to: numberValue(q, 'to_ts'),
      }),
    );
  }
  @Get('overview/foreign/top') async foreignTop(@Query() q: Record<string, unknown>) {
    return result(
      'VCI',
      await this.market.overview.foreignTop({
        group: oneOf(value(q, 'group', 'ALL'), groups, 'group'),
        timeFrame: oneOf(value(q, 'time_frame', 'ONE_YEAR'), impactFrames, 'time_frame'),
        from: numberValue(q, 'from_ts'),
        to: numberValue(q, 'to_ts'),
      }),
    );
  }
  @Get('overview/proprietary') async proprietary(@Query() q: Record<string, unknown>) {
    return result(
      'VCI',
      await this.market.overview.proprietary(
        oneOf(value(q, 'market', 'ALL'), groups, 'market'),
        oneOf(value(q, 'time_frame', 'ONE_YEAR'), impactFrames, 'time_frame'),
      ),
    );
  }
  @Get('overview/proprietary/top') async proprietaryTop(@Query() q: Record<string, unknown>) {
    return result(
      'VCI',
      await this.market.overview.proprietaryTop(
        oneOf(value(q, 'exchange', 'ALL'), groups, 'exchange'),
        oneOf(value(q, 'time_frame', 'ONE_YEAR'), impactFrames, 'time_frame'),
      ),
    );
  }
  @Get('overview/allocation') async allocation(@Query() q: Record<string, unknown>) {
    return result(
      'VCI',
      await this.market.overview.allocation(
        oneOf(value(q, 'group', 'ALL'), groups, 'group'),
        oneOf(value(q, 'time_frame', 'ONE_YEAR'), impactFrames, 'time_frame'),
      ),
    );
  }
  @Get('overview/sectors/allocation') async sectorsAllocation(@Query() q: Record<string, unknown>) {
    return result(
      'VCI',
      await this.market.overview.sectorsAllocation(
        oneOf(value(q, 'group', 'ALL'), groups, 'group'),
        oneOf(value(q, 'time_frame', 'ONE_YEAR'), impactFrames, 'time_frame'),
      ),
    );
  }
  @Get('overview/valuation') async valuation(@Query() q: Record<string, unknown>) {
    return result(
      'VCI',
      await this.market.overview.valuation(
        oneOf(value(q, 'type', 'pe'), ['pe', 'pb'] as const, 'type'),
        oneOf(
          value(q, 'com_group_code', 'VNINDEX'),
          ['VNINDEX', 'HNX30', 'VN30', 'VNMIDCAP', 'VNSMALLCAP', 'VN100'] as const,
          'com_group_code',
        ),
        oneOf(value(q, 'time_frame', 'ONE_YEAR'), valuationFrames, 'time_frame'),
      ),
    );
  }
  @Get('overview/breadth') async breadth(@Query() q: Record<string, unknown>) {
    const exchange = value(q, 'exchange', 'HSX,HNX,UPCOM');
    for (const part of exchange.split(','))
      oneOf(part.trim(), ['HSX', 'HNX', 'UPCOM'] as const, 'exchange');
    return result(
      'VCI',
      await this.market.overview.breadth(
        oneOf(
          value(q, 'condition', 'EMA50'),
          ['EMA50', 'EMA20', 'SMA50', 'SMA200'] as const,
          'condition',
        ),
        exchange,
        oneOf(value(q, 'period', 'Y1'), ['M6', 'YTD', 'Y1', 'Y2', 'Y5', 'ALL'] as const, 'period'),
      ),
    );
  }
  @Get('overview/heatmap') async heatmap(@Query() q: Record<string, unknown>) {
    return result(
      'VCI',
      await this.market.overview.heatmap(
        oneOf(value(q, 'group', 'ALL'), groups, 'group'),
        oneOf(
          value(q, 'sector', 'icb_code_2'),
          ['icb_code_1', 'icb_code_2', 'icb_code_3', 'icb_code_4'] as const,
          'sector',
        ),
        oneOf(value(q, 'size', 'MKC'), ['MKC', 'VOL', 'VAL'] as const, 'size'),
      ),
    );
  }
  @Get('overview/heatmap/index') async heatmapIndex() {
    return result('VCI', await this.market.overview.heatmapIndex());
  }
  @Get('overview/sectors/detail') async sectorDetail(@Query() q: Record<string, unknown>) {
    const code = numberValue(q, 'icb_code', undefined, 1);
    if (!code) invalid('icb_code is required');
    return result(
      'VCI',
      await this.market.overview.sectorDetail(
        code,
        oneOf(value(q, 'group', 'ALL'), groups, 'group'),
        oneOf(value(q, 'time_frame', 'ONE_DAY'), impactFrames, 'time_frame'),
      ),
    );
  }
  @Get('overview/stock-strength') async stockStrength(@Query() q: Record<string, unknown>) {
    return result(
      'VCI',
      await this.market.overview.stockStrength(
        oneOf(
          value(q, 'exchange', 'ALL'),
          ['ALL', 'HOSE', 'HNX', 'UPCOM', 'HSX'] as const,
          'exchange',
        ),
      ),
    );
  }
  @Get('overview/market-index') async marketIndex(@Query() q: Record<string, unknown>) {
    const symbols = optional(q, 'symbols')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? ['VNINDEX', 'HNXIndex', 'HNXUpcomIndex'];
    symbols.forEach((s) => oneOf(s, indexSymbols, 'symbols'));
    return result('VCI', await this.market.overview.marketIndex(symbols));
  }
  @Get('overview/maintenance') async maintenance() {
    return result('VCI', await this.market.overview.maintenance());
  }
  @Get('reference/search') async search(@Query() q: Record<string, unknown>) {
    return result('VCI', await this.market.overview.search(numberValue(q, 'language', 1, 1, 2)!));
  }
  @Get('reference/event-codes') async eventCodes() {
    return result('VCI', await this.market.overview.eventCodes());
  }

  @Get('sectors/trading-dates') async tradingDates() {
    return result('VCI', await this.market.insight.tradingDates());
  }
  @Get('sectors/ranking') async sectorRanking(@Query() q: Record<string, unknown>) {
    const adtv = numberValue(q, 'adtv', 3)!;
    const threshold = numberValue(q, 'value', 3)!;
    if (![1, 3, 6].includes(adtv)) invalid('adtv must be 1, 3, or 6');
    if (![3, 5, 10].includes(threshold)) invalid('value must be 3, 5, or 10');
    return result(
      'VCI',
      await this.market.insight.sectorRanking(
        numberValue(q, 'icb_level', 2, 1, 4)!,
        adtv,
        threshold,
      ),
    );
  }
  @Get('sectors/information') async sectorInformation(@Query() q: Record<string, unknown>) {
    return result(
      'VCI',
      await this.market.insight.sectorInformation(numberValue(q, 'icb_level', 2, 1, 4)!),
    );
  }
  @Get('screening/criteria') async screeningCriteria() {
    return result('VCI', await this.market.insight.screeningCriteria());
  }
  @Post('screening/search') async screeningSearch(@Body() body: unknown) {
    const raw =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const normalized = {
      ...raw,
      pageSize: raw.pageSize ?? raw.page_size,
      sortFields: raw.sortFields ?? raw.sort_fields,
      sortOrders: raw.sortOrders ?? raw.sort_orders,
      filter: Array.isArray(raw.filter)
        ? raw.filter.map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
            const item = entry as Record<string, unknown>;
            return {
              ...item,
              conditionOptions: item.conditionOptions ?? item.condition_options,
              extraName: item.extraName ?? item.extra_name,
            };
          })
        : raw.filter,
    };
    const parsed = screeningSchema.safeParse(normalized);
    if (!parsed.success) invalid(parsed.error.issues[0]?.message ?? 'Invalid screening body');
    return result(
      'VCI',
      await this.market.insight.screeningSearch(parsed.data as ScreeningRequest),
    );
  }
  @Get('screening/presets') async screeningPresets() {
    return result('VCI', await this.market.insight.screeningPresets());
  }

  @Get('macro/economy/:indicator') async macro(
    @Param('indicator') indicator: string,
    @Query() q: Record<string, unknown>,
  ) {
    if (!MACRO_INDICATORS[indicator]) invalid(`Unsupported indicator: ${indicator}`);
    const period = value(q, 'period', DEFAULT_MACRO_PERIOD[indicator] ?? 'quarter');
    if (!MACRO_PERIODS[period]) invalid(`Unsupported period: ${period}`);
    const start = numberValue(q, 'start_year', 2015, 2000, 2100)!;
    const end = numberValue(q, 'end_year', new Date().getUTCFullYear(), 2000, 2100)!;
    if (start > end) invalid('start_year must be before end_year');
    return result('MBK', await this.market.economyFunds.macro(indicator, start, end, period));
  }
  @Get('macro/commodities') commodities() {
    return envelope(this.market.commoditySheetsNews.listCommodities(), 'SPL', 'static_mapping');
  }
  @Get('macro/commodities/:code') async commodity(
    @Param('code') code: string,
    @Query() q: Record<string, unknown>,
  ) {
    if (!COMMODITIES[code]) invalid(`Unsupported commodity: ${code}`);
    const interval = oneOf(value(q, 'interval', '1d'), ['1d', '1h', '1m'] as const, 'interval');
    return result(
      'SPL',
      await this.market.commoditySheetsNews.commodity(
        code,
        dateValue(optional(q, 'start'), 'start'),
        dateValue(optional(q, 'end'), 'end'),
        interval,
      ),
    );
  }
  @Get('funds') async funds(@Query() q: Record<string, unknown>) {
    return result(
      'FMARKET',
      await this.market.economyFunds.funds(
        oneOf(value(q, 'fund_type', ''), ['', 'BALANCED', 'BOND', 'STOCK'] as const, 'fund_type'),
      ),
    );
  }
  @Get('funds/:fundId/nav') async fundNav(@Param('fundId') id: string) {
    const fundId = Number(id);
    if (!Number.isInteger(fundId) || fundId < 1) invalid('fund_id must be a positive integer');
    return result('FMARKET', await this.market.economyFunds.fundNav(fundId));
  }
  @Get('funds/:fundId') async fundDetails(@Param('fundId') id: string) {
    const fundId = Number(id);
    if (!Number.isInteger(fundId) || fundId < 1) invalid('fund_id must be a positive integer');
    return result('FMARKET', await this.market.economyFunds.fundDetails(fundId));
  }
  @Get('news/sources') newsSources() {
    return envelope(
      Object.entries(RSS_FEEDS).map(([site, feeds]) => ({ site, feeds })),
      'STATIC',
      'static_mapping',
    );
  }
  @Get('news/latest') async latestNews(@Query() q: Record<string, unknown>) {
    const sites = optional(q, 'sites')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return result(
      'RSS',
      await this.market.commoditySheetsNews.rss(sites, numberValue(q, 'max_per_site', 20, 1, 100)!),
    );
  }
  @Get('sheets/vnd') async sheetVnd() {
    return result('GOOGLE_SHEETS', await this.market.commoditySheetsNews.sheet('VND'));
  }
  @Get('sheets/tpcp') async sheetTpcp() {
    return result('GOOGLE_SHEETS', await this.market.commoditySheetsNews.sheet('TPCP'));
  }
  @Get('sheets/tygia') async sheetTygia() {
    return result('GOOGLE_SHEETS', await this.market.commoditySheetsNews.sheet('TYGIA'));
  }

  @Get('news/ai') async aiNews(@Query() q: Record<string, unknown>) {
    const kind = oneOf(
      value(q, 'kind', 'business'),
      ['business', 'topic', 'exchange'] as const,
      'kind',
    ) as AiNewsKind;
    const query = this.aiQuery(q, 100);
    const response = await this.market.aiNews.list(kind, query);
    return result('VCI_AI', response, {
      total_records: response.data.total,
      kind,
      page: query.page,
      page_size: query.pageSize,
      data: response.data.items,
    });
  }
  @Get('news/ai/detail/:slug') async aiDetail(@Param('slug') slug: string) {
    if (!/^[a-zA-Z0-9._-]{1,200}$/.test(slug)) invalid('Invalid news slug');
    return result('VCI_AI', await this.market.aiNews.detail(slug));
  }
  @Get('news/ai/audio/:newsId') async aiAudio(@Param('newsId') id: string) {
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(id)) invalid('Invalid news id');
    return result('VCI_AI', await this.market.aiNews.audio(id));
  }
  @Get('news/ai/catalogs') async aiCatalogs() {
    const response = await this.market.aiNews.catalogs();
    return {
      ...envelope(response.data, 'VCI_AI'),
      partial: response.data.partial,
      warnings: response.data.warnings,
      source_urls: response.sourceUrls,
    };
  }
  @Get('news/ai/tickers/:symbol') async aiTicker(
    @Param('symbol') raw: string,
    @Query() q: Record<string, unknown>,
  ) {
    const symbol = raw.toUpperCase();
    if (!/^[A-Z0-9]{1,12}$/.test(symbol)) invalid('Invalid symbol');
    const query = this.aiQuery(q, 50);
    const [sentiment, business, exchange] = await Promise.allSettled([
      this.market.aiNews.sentiment(symbol),
      this.market.aiNews.list('business', { ...query, ticker: symbol }),
      this.market.aiNews.list('exchange', { ...query, ticker: symbol }),
    ]);
    const warnings: string[] = [];
    if (sentiment.status === 'rejected') warnings.push('sentiment: unavailable');
    if (business.status === 'rejected') warnings.push('business_news: unavailable');
    if (exchange.status === 'rejected') warnings.push('exchange_news: unavailable');
    return {
      ticker: symbol,
      sentiment:
        sentiment.status === 'fulfilled'
          ? sentiment.value.data
          : { ticker: symbol, score: 0, sentiment: '' },
      business_news:
        business.status === 'fulfilled'
          ? { data: business.value.data.items, total_records: business.value.data.total }
          : { data: [], total_records: 0 },
      exchange_news:
        exchange.status === 'fulfilled'
          ? { data: exchange.value.data.items, total_records: exchange.value.data.total }
          : { data: [], total_records: 0 },
      partial: warnings.length > 0,
      warnings,
      page: query.page,
      page_size: query.pageSize,
    };
  }

  @Get('macro/gold') async gold(@Query() q: Record<string, unknown>) {
    const date = dateValue(optional(q, 'date'), 'date') ?? new Date().toISOString().slice(0, 10);
    const source = optional(q, 'source')?.toUpperCase();
    return result(
      source === 'SIMPLIZE' ? 'SIMPLIZE' : 'SJC',
      await this.market.global.gold(date, source),
    );
  }
  @Get('macro/fx') async fx(@Query() q: Record<string, unknown>) {
    const date = dateValue(optional(q, 'date'), 'date') ?? new Date().toISOString().slice(0, 10);
    return result('VCB', await this.market.global.fx(date, optional(q, 'source')?.toUpperCase()));
  }
  @Get('global/world-index') async worldIndex(@Query() q: Record<string, unknown>) {
    const symbol = value(q, 'symbol').toUpperCase();
    if (!symbol) invalid('symbol is required');
    return result(
      'MSN',
      await this.market.global.worldIndex(
        symbol,
        dateValue(optional(q, 'start'), 'start'),
        dateValue(optional(q, 'end'), 'end'),
      ),
    );
  }
  @Get('global/forex') async forex(@Query() q: Record<string, unknown>) {
    const symbol = value(q, 'symbol').toUpperCase();
    if (!symbol) invalid('symbol is required');
    return result(
      'MSN',
      await this.market.global.forex(
        symbol,
        dateValue(optional(q, 'start'), 'start'),
        dateValue(optional(q, 'end'), 'end'),
      ),
    );
  }
  @Get('global/crypto/:symbol/ohlc') async cryptoOhlc(
    @Param('symbol') raw: string,
    @Query() q: Record<string, unknown>,
  ) {
    const symbol = this.cryptoSymbol(raw);
    const interval = oneOf(
      value(q, 'interval', '1d'),
      ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const,
      'interval',
    );
    const response = result(
      'BINANCE',
      await this.market.global.cryptoOhlc(symbol, interval, numberValue(q, 'limit', 500, 1, 1000)!),
    );
    response.meta.interval = interval;
    if (symbol.endsWith('USDT')) response.meta.currency = 'USDT';
    return response;
  }
  @Get('global/crypto/:symbol/ticker') async cryptoTicker(@Param('symbol') raw: string) {
    return result('BINANCE', await this.market.global.cryptoTicker(this.cryptoSymbol(raw)));
  }
  @Get('global/crypto/:symbol/depth') async cryptoDepth(
    @Param('symbol') raw: string,
    @Query() q: Record<string, unknown>,
  ) {
    return result(
      'BINANCE',
      await this.market.global.cryptoDepth(
        this.cryptoSymbol(raw),
        numberValue(q, 'limit', 100, 1, 5000)!,
      ),
    );
  }
  @Get('global/snapshot') async snapshot(@Query() q: Record<string, unknown>) {
    const rows = await this.market.snapshots.latest({
      category: optional(q, 'category'),
      date: dateValue(optional(q, 'date'), 'date'),
      session: optional(q, 'session'),
    });
    const snapshotDate = rows[0]?.snapshot_date ?? null;
    return {
      data: rows,
      meta: {
        snapshot_date: snapshotDate,
        stale_count: rows.filter((row) => row.stale === true).length,
      },
    };
  }

  private aiQuery(q: Record<string, unknown>, maxPageSize: number): AiNewsQuery {
    const sentiment = optional(q, 'sentiment');
    if (sentiment) oneOf(sentiment, ['Positive', 'Neutral', 'Negative'] as const, 'sentiment');
    return {
      page: numberValue(q, 'page', 1, 1)!,
      pageSize: numberValue(q, 'page_size', 20, 1, maxPageSize)!,
      ticker: optional(q, 'ticker'),
      topic: optional(q, 'topic'),
      industry: optional(q, 'industry'),
      source: optional(q, 'source'),
      sentiment,
      updateFrom: dateValue(optional(q, 'update_from'), 'update_from'),
      updateTo: dateValue(optional(q, 'update_to'), 'update_to'),
    };
  }
  private cryptoSymbol(raw: string) {
    const symbol = raw.toUpperCase();
    if (!/^[A-Z0-9]{2,20}$/.test(symbol)) invalid('Invalid crypto symbol');
    return symbol;
  }
}
