import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthGuard } from '../auth/auth.guard.js';
import { Premium } from '../auth/auth.decorators.js';
import { PremiumGuard } from '../auth/premium.guard.js';
import { patternKindSchema, patternSymbolSchema, type PatternKind } from './patterns.schemas.js';
import { PatternsService } from './patterns.service.js';

@ApiTags('AI Patterns')
@Controller(['api/v2/ai/patterns', 'api/v1/ai/patterns'])
@UseGuards(ApiAuthGuard, PremiumGuard)
@Premium()
export class PatternsController {
  constructor(private readonly patterns: PatternsService) {}

  @Get('candles')
  @ApiOperation({ operationId: 'getCandlePatternsV2' })
  candles(@Query('symbol', { schema: patternSymbolSchema }) symbol: string) {
    return this.patterns.bySymbol('candles', symbol);
  }

  @Get('charts')
  @ApiOperation({ operationId: 'getChartPatternsV2' })
  charts(@Query('symbol', { schema: patternSymbolSchema }) symbol: string) {
    return this.patterns.bySymbol('charts', symbol);
  }

  @Get(':kind/symbols')
  @ApiOperation({ operationId: 'listPatternSymbolsV2' })
  symbols(@Param('kind', { schema: patternKindSchema }) kind: PatternKind) {
    return this.patterns.symbols(kind);
  }
}
