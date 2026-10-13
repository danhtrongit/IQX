import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import { ApiAuthGuard } from '../auth/auth.guard.js';
import { Premium } from '../auth/auth.decorators.js';
import { PremiumGuard } from '../auth/premium.guard.js';
import { ResearchEnabledGuard } from './research-enabled.guard.js';
import {
  investmentViewResponseSchema,
  researchStatusQuerySchema,
  researchSymbolSchema,
  type ResearchStatusQuery,
} from './research.schemas.js';
import { ResearchService } from './research.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/** "Góc nhìn đầu tư" of AI Insight v2; same access as the insight itself (premium). */
@ApiTags('AI Analysis')
@Controller('api/v2/ai/investment-view')
@UseGuards(ResearchEnabledGuard, ApiAuthGuard, PremiumGuard)
@Premium()
export class ResearchController {
  constructor(private readonly research: ResearchService) {}

  @Get(':symbol')
  @ApiOperation({ operationId: 'getInvestmentViewV2' })
  @ApiOkResponse({ schema: openApi(investmentViewResponseSchema) })
  async view(@Param('symbol', { schema: researchSymbolSchema }) symbol: string) {
    return { data: await this.research.view(symbol) };
  }

  @Get(':symbol/status')
  @ApiOperation({ operationId: 'getInvestmentViewStatusV2' })
  @ApiOkResponse({ schema: openApi(investmentViewResponseSchema) })
  async status(
    @Param('symbol', { schema: researchSymbolSchema }) symbol: string,
    @Query({ schema: researchStatusQuerySchema }) query: ResearchStatusQuery,
  ) {
    return { data: await this.research.status(symbol, query.jobId) };
  }
}
