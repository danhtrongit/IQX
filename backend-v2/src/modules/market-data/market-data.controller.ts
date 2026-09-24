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
import { Public } from '../auth/auth.decorators.js';
import { MarketDataService } from './market-data.service.js';
import {
  eventsQuerySchema,
  financialQuerySchema,
  financialTypeSchema,
  foreignTradeQuerySchema,
  groupSchema,
  indexQuerySchema,
  insiderQuerySchema,
  intradayQuerySchema,
  ohlcvQuerySchema,
  priceBoardSchema,
  priceChartQuerySchema,
  rankingKindSchema,
  rankingQuerySchema,
  sourceSchema,
  statsQuerySchema,
  statsSummaryQuerySchema,
  symbolSchema,
  symbolsQuerySchema,
} from './market-data.schemas.js';
import { VCI_GROUPS } from './providers/vci.provider.js';

@Public()
@ApiTags('Market data')
@Controller(['api/v1/market-data', 'api/v2/market-data'])
export class MarketDataController {
  constructor(private readonly market: MarketDataService) {}

  @Get('reference/symbols') symbols(
    @Query({ schema: symbolsQuerySchema }) query: Parameters<MarketDataService['symbols']>[0],
  ) {
    return this.market.symbols(query);
  }
  @Get('reference/industries') industries(
    @Query('source', { schema: sourceSchema }) _source?: string,
  ) {
    return this.market.industries();
  }
  @Get('reference/indices') indices(
    @Query({ schema: indexQuerySchema }) query: { group?: string },
  ) {
    return this.market.indices(query.group);
  }
  @Get('reference/groups/:group/symbols') groupSymbols(
    @Param('group', { schema: groupSchema }) group: string,
  ) {
    if (!VCI_GROUPS.has(group))
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: `Giá trị group '${group}' không hợp lệ`,
      });
    return this.market.groupSymbols(group);
  }

  @Get('quotes/:symbol/ohlcv') ohlcv(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
    @Query({ schema: ohlcvQuerySchema }) query: Parameters<MarketDataService['ohlcv']>[1],
  ) {
    return this.market.ohlcv(symbol, query);
  }
  @Get('quotes/:symbol/intraday') intraday(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
    @Query({ schema: intradayQuerySchema }) query: { page_size: number },
  ) {
    return this.market.intraday(symbol, query.page_size);
  }
  @Get('quotes/:symbol/price-depth') priceDepth(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
  ) {
    return this.market.priceDepth(symbol);
  }
  @Post('trading/price-board') priceBoard(
    @Body({ schema: priceBoardSchema }) body: { symbols: string[]; source?: string },
  ) {
    return this.market.getPriceBoard(body.symbols, body.source);
  }
  @Get('insights/ranking/:kind') ranking(
    @Param('kind', { schema: rankingKindSchema }) kind: string,
    @Query({ schema: rankingQuerySchema }) query: { index: string; limit: number; date?: string },
  ) {
    return this.market.ranking(kind, query.index, query.limit, query.date);
  }

  @Get('company/:symbol/overview') overview(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
  ) {
    return this.market.companyOverview(symbol);
  }
  @Get('company/:symbol/shareholders') shareholders(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
  ) {
    return this.market.shareholders(symbol);
  }
  @Get('company/:symbol/officers') officers(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
  ) {
    return this.market.officers(symbol);
  }
  @Get('company/:symbol/subsidiaries') subsidiaries(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
  ) {
    return this.market.subsidiaries(symbol);
  }
  @Get('company/:symbol/news') news(@Param('symbol', { schema: symbolSchema }) symbol: string) {
    return this.market.companyNews(symbol);
  }
  @Get('company/:symbol/details') details(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
  ) {
    return this.market.companyDetails(symbol);
  }
  @Get('company/:symbol/price-chart') priceChart(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
    @Query({ schema: priceChartQuerySchema }) query: { length: number },
  ) {
    return this.market.priceChart(symbol, query.length);
  }

  @Get('fundamentals/:symbol/:reportType') financial(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
    @Param('reportType', { schema: financialTypeSchema }) reportType: string,
    @Query({ schema: financialQuerySchema })
    query: { term_type: number; page_size: number; period: 'Q' | 'Y' },
  ) {
    return this.market.financialReport(symbol, reportType, {
      termType: query.term_type,
      pageSize: query.page_size,
      period: query.period,
    });
  }
  @Get('trading/:symbol/foreign-trade') foreignTrade(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
    @Query({ schema: foreignTradeQuerySchema })
    query: { start?: string; end?: string; limit: number },
  ) {
    return this.market.foreignTrade(symbol, query.start, query.end, query.limit);
  }
  @Get('trading/:symbol/insider-deals') insiderDeals(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
    @Query({ schema: insiderQuerySchema }) query: { limit: number },
  ) {
    return this.market.insiderDeals(symbol, query.limit);
  }
  @Get('trading/:symbol/history') history(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
    @Query({ schema: statsQuerySchema }) query: Parameters<MarketDataService['tradingHistory']>[1],
  ) {
    return this.market.tradingHistory(symbol, query);
  }
  @Get('trading/:symbol/summary') summary(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
    @Query({ schema: statsSummaryQuerySchema })
    query: Parameters<MarketDataService['tradingSummary']>[1],
  ) {
    return this.market.tradingSummary(symbol, query);
  }
  @Get('trading/:symbol/foreign-trade/summary') foreignSummary(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
    @Query({ schema: statsSummaryQuerySchema })
    query: Parameters<MarketDataService['foreignSummary']>[1],
  ) {
    return this.market.foreignSummary(symbol, query);
  }
  @Get('trading/:symbol/supply-demand') supply(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
    @Query({ schema: statsQuerySchema }) query: Parameters<MarketDataService['supplyDemand']>[1],
  ) {
    return this.market.supplyDemand(symbol, query);
  }
  @Get('trading/:symbol/supply-demand/summary') supplySummary(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
    @Query({ schema: statsSummaryQuerySchema })
    query: Parameters<MarketDataService['supplyDemandSummary']>[1],
  ) {
    return this.market.supplyDemandSummary(symbol, query);
  }
  @Get('trading/:symbol/proprietary') proprietary(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
    @Query({ schema: statsQuerySchema }) query: Parameters<MarketDataService['proprietary']>[1],
  ) {
    return this.market.proprietary(symbol, query);
  }
  @Get('trading/:symbol/proprietary/summary') proprietarySummary(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
    @Query({ schema: statsSummaryQuerySchema })
    query: Parameters<MarketDataService['proprietarySummary']>[1],
  ) {
    return this.market.proprietarySummary(symbol, query);
  }
  @Get('events/calendar') events(
    @Query({ schema: eventsQuerySchema })
    query: {
      start: string;
      end?: string;
      event_type?: string;
    },
  ) {
    return this.market.events(query.start, query.end, query.event_type);
  }
}
