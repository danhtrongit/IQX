import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, Premium } from '../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { PremiumGuard } from '../auth/premium.guard.js';
import { AnalysisService } from './analysis.service.js';
import {
  bctcQuerySchema,
  dashboardAnalyzeSchema,
  industryAnalyzeSchema,
  industryBatchAnalyzeSchema,
  insightAnalyzeSchema,
  insightPathSchema,
  languageQuerySchema,
  type BctcQuery,
  type DashboardAnalyze,
  type IndustryAnalyze,
  type IndustryBatchAnalyze,
  type InsightAnalyze,
} from './analysis.schemas.js';

@ApiTags('AI Analysis')
@Controller(['api/v2/ai', 'api/v1/ai'])
@UseGuards(ApiAuthGuard, PremiumGuard)
@Premium()
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post('dashboard/analyze')
  @ApiOperation({ operationId: 'analyzeDashboardV2' })
  dashboard(
    @Body({ schema: dashboardAnalyzeSchema }) body: DashboardAnalyze,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analysis.dashboard(body, user.id);
  }

  @Post('industry/analyze')
  @ApiOperation({ operationId: 'analyzeIndustryV2' })
  industry(
    @Body({ schema: industryAnalyzeSchema }) body: IndustryAnalyze,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analysis.industry(body, user.id);
  }

  @Post('industry/analyze-batch')
  @ApiOperation({ operationId: 'analyzeIndustryBatchV2' })
  industryBatch(
    @Body({ schema: industryBatchAnalyzeSchema }) body: IndustryBatchAnalyze,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analysis.industryBatch(body, user.id);
  }

  @Post('insight/analyze')
  @ApiOperation({ operationId: 'analyzeInsightV2' })
  insight(
    @Body({ schema: insightAnalyzeSchema }) body: InsightAnalyze,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analysis.insight(body, user.id);
  }

  /** Legacy GET is still a paid, authenticated operation; it never permits anonymous generation. */
  @Get('insight/:symbol')
  @ApiOperation({ operationId: 'getInsightV2' })
  insightGet(
    @Param('symbol', { schema: insightPathSchema }) symbol: string,
    @Query({ schema: languageQuerySchema }) query: { language: 'vi' | 'en' },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analysis
      .insight({ symbol, language: query.language, include_payload: false }, user.id)
      .then((data) => ({ data }));
  }

  @Get('bctc/:symbol')
  @ApiOperation({ operationId: 'getBctcAnalysisV2' })
  bctc(
    @Param('symbol', { schema: insightPathSchema }) symbol: string,
    @Query({ schema: bctcQuerySchema }) query: BctcQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analysis
      .bctc(symbol, query.term_type, query.language, user.id)
      .then((data) => ({ data }));
  }

  @Get('bctc-dashboard/:symbol')
  @ApiOperation({ operationId: 'getBctcNarrativeV2' })
  bctcNarrative(
    @Param('symbol', { schema: insightPathSchema }) symbol: string,
    @Query({ schema: bctcQuerySchema }) query: BctcQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analysis.bctcNarrative(symbol, query.term_type, query.language, user.id);
  }
}
