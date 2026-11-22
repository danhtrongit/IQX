import { Controller, GoneException, Get, HttpCode, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiGoneResponse, ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import { ApiAuthGuard, CurrentUser, Premium, PremiumGuard } from '../auth/index.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { StrategyConfigEnabledGuard } from './strategy-config-enabled.guard.js';
import {
  revisionsQuerySchema,
  sharedConfigRevisionListSchema,
  sharedConfigStateSchema,
  technicalRegistryResponseSchema,
  type RevisionsQuery,
} from './strategy-config.schemas.js';
import { SharedConfigService } from './strategy-config.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/** One saved Buy/Sell indicator config per account (Học viện, Backtest and Bot share it). */
@ApiTags('Strategy shared config')
@Premium()
@UseGuards(StrategyConfigEnabledGuard, ApiAuthGuard, PremiumGuard)
@Controller('api/v2/strategy')
export class StrategyConfigController {
  constructor(private readonly sharedConfig: SharedConfigService) {}

  @Get('registry/technical')
  @ApiOperation({
    operationId: 'strategyConfigTechnicalRegistry',
    summary: 'Technical indicator registry templates with the per-user learned flag',
  })
  @ApiOkResponse({ schema: openApi(technicalRegistryResponseSchema) })
  technicalRegistry(@CurrentUser() user: AuthenticatedUser) {
    return this.sharedConfig.technicalRegistry(user.id);
  }

  @Get('shared-config')
  @ApiOperation({
    operationId: 'strategyConfigGetSharedConfig',
    summary: 'Latest saved shared config (registry default when never saved)',
  })
  @ApiOkResponse({ schema: openApi(sharedConfigStateSchema) })
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.sharedConfig.current(user.id);
  }

  /**
   * Retired by update 22-11 (spec Bot và Chiến lược v2.0 §9): the Bot runs a chosen strategy and
   * Backtest runs drafts, so nothing writes the shared config any more. Old tabs get 410.
   */
  @Patch('shared-config')
  @HttpCode(410)
  @ApiOperation({
    operationId: 'strategyConfigPatchSharedConfig',
    deprecated: true,
    summary: 'Retired: 410 SHARED_CONFIG_RETIRED (use strategies + Bot schedule)',
  })
  @ApiOkResponse({
    description: 'Legacy shape, never returned since update 22-11',
    schema: openApi(sharedConfigStateSchema),
  })
  @ApiGoneResponse({ description: 'SHARED_CONFIG_RETIRED' })
  save(): never {
    throw new GoneException({
      code: 'SHARED_CONFIG_RETIRED',
      message:
        'Cấu hình chung không còn được lưu. Lưu chiến lược ở Backtest và chọn chiến lược cho Bot.',
    });
  }

  @Get('shared-config/revisions')
  @ApiOperation({
    operationId: 'strategyConfigListRevisions',
    summary: 'Saved revisions, newest first, with effective session status',
  })
  @ApiOkResponse({ schema: openApi(sharedConfigRevisionListSchema) })
  revisions(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: revisionsQuerySchema }) query: RevisionsQuery,
  ) {
    return this.sharedConfig.revisions(user.id, query.limit);
  }
}
