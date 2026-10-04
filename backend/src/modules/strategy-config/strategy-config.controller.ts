import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import { ApiAuthGuard, CurrentUser, Premium, PremiumGuard } from '../auth/index.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { StrategyConfigEnabledGuard } from './strategy-config-enabled.guard.js';
import {
  revisionsQuerySchema,
  sharedConfigPatchSchema,
  sharedConfigRevisionListSchema,
  sharedConfigSaveResultSchema,
  sharedConfigStateSchema,
  technicalRegistryResponseSchema,
  type RevisionsQuery,
  type SharedConfigPatchInput,
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

  @Patch('shared-config')
  @ApiOperation({
    operationId: 'strategyConfigPatchSharedConfig',
    summary: 'Save changed indicators as a new revision (expected_revision + idempotency_key)',
  })
  @ApiOkResponse({ schema: openApi(sharedConfigSaveResultSchema) })
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: sharedConfigPatchSchema }) body: SharedConfigPatchInput,
  ) {
    return this.sharedConfig.save(user.id, body);
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
