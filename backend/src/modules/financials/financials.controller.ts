import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../auth/auth.decorators.js';
import {
  financialQuerySchema,
  financialResponseSchema,
  financialSymbolSchema,
  type FinancialQuery,
} from './financials.schemas.js';
import { FinancialsService } from './financials.service.js';

@Public()
@ApiTags('Financials')
@Controller()
export class FinancialsController {
  constructor(private readonly financials: FinancialsService) {}
  @Get([
    'api/v2/market-data/company/:symbol/bctc',
    'api/v2/market-data/bctc/:symbol',
    'api/v1/market-data/company/:symbol/bctc',
    'api/v1/market-data/bctc/:symbol',
  ])
  @ApiOperation({ operationId: 'getBctc', summary: 'Deterministic financial-statement analysis' })
  @ApiOkResponse({
    schema: z.toJSONSchema(financialResponseSchema, { target: 'openapi-3.0' }) as SchemaObject,
  })
  getBctc(
    @Param('symbol', { schema: financialSymbolSchema }) symbol: string,
    @Query({ schema: financialQuerySchema }) query: FinancialQuery,
  ) {
    return this.financials.getBctc(symbol, query.term_type as 1 | 2);
  }

  @Get([
    'api/v2/market-data/company/:symbol/bctc-dashboard',
    'api/v2/market-data/bctc-dashboard/:symbol',
    'api/v1/market-data/company/:symbol/bctc-dashboard',
    'api/v1/market-data/bctc-dashboard/:symbol',
  ])
  @ApiOperation({
    operationId: 'getBctcDashboard',
    summary: 'Deterministic BCTC storytelling dashboard',
  })
  @ApiOkResponse({
    schema: z.toJSONSchema(financialResponseSchema, { target: 'openapi-3.0' }) as SchemaObject,
  })
  getDashboard(
    @Param('symbol', { schema: financialSymbolSchema }) symbol: string,
    @Query({ schema: financialQuerySchema }) query: FinancialQuery,
  ) {
    return this.financials.getDashboard(symbol, query.term_type as 1 | 2);
  }
}
