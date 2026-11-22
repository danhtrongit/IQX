import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';

import { ApiAuthGuard, CurrentUser, Premium, PremiumGuard } from '../auth/index.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { StrategyBacktestsEnabledGuard } from '../strategy-backtests/strategy-backtests-enabled.guard.js';
import {
  storeMetaSchema,
  strategyCreateBodySchema,
  strategyIdSchema,
  strategyListSchema,
  strategyRenameBodySchema,
  strategyRestoreBodySchema,
  strategySaveResultSchema,
  strategyVersionCreateBodySchema,
  strategyVersionDetailSchema,
  strategyVersionListSchema,
  strategyVersionParamSchema,
  strategyViewSchema,
  universeOptionsSchema,
  type StrategyCreateBody,
  type StrategyRenameBody,
  type StrategyRestoreBody,
  type StrategyVersionCreateBody,
} from './strategies.schemas.js';
import { StrategiesService } from './strategies.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/**
 * Chiến lược của tôi + kho giá + rổ mã (spec Bot và Chiến lược v2.0 §4, §10.3; PLAN §6.1).
 * Same gates as Backtest: feature flag, sign-in, Premium.
 */
@ApiTags('Strategies')
@Premium()
@UseGuards(StrategyBacktestsEnabledGuard, ApiAuthGuard, PremiumGuard)
@Controller('api/v2/strategy')
export class StrategiesController {
  constructor(private readonly strategies: StrategiesService) {}

  @Get('store/meta')
  @ApiOperation({
    operationId: 'strategyStoreMeta',
    summary: 'Kho giá dùng cho Backtest và Bot: phiên cuối, Từ ngày sớm nhất, đơn vị',
  })
  @ApiOkResponse({ schema: openApi(storeMetaSchema) })
  storeMeta() {
    return this.strategies.storeMeta();
  }

  @Get('universe-options')
  @ApiOperation({
    operationId: 'strategyUniverseOptions',
    summary: 'Rổ VN30, VN100 (thuộc kho) và danh mục đã lưu đã lọc VN100',
  })
  @ApiOkResponse({ schema: openApi(universeOptionsSchema) })
  universeOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.strategies.universeOptions(user.id);
  }

  @Get('strategies')
  @ApiOperation({ operationId: 'strategyList', summary: 'Chiến lược chưa xóa của tôi (tối đa 20)' })
  @ApiOkResponse({ schema: openApi(strategyListSchema) })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.strategies.list(user.id);
  }

  @Post('strategies')
  @ApiOperation({
    operationId: 'strategyCreate',
    summary: 'Tạo chiến lược + bản 1 từ bản nháp đã chạy (from_run_id); apply_next đặt cho Bot',
  })
  @ApiCreatedResponse({ schema: openApi(strategySaveResultSchema) })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: strategyCreateBodySchema }) body: StrategyCreateBody,
  ) {
    return this.strategies.create(user.id, body);
  }

  @Patch('strategies/:id')
  @ApiOperation({ operationId: 'strategyRename', summary: 'Đổi tên chiến lược' })
  @ApiOkResponse({ schema: openApi(strategyViewSchema) })
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: strategyIdSchema }) id: string,
    @Body({ schema: strategyRenameBodySchema }) body: StrategyRenameBody,
  ) {
    return this.strategies.rename(user.id, id, body.name);
  }

  @Delete('strategies/:id')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'strategyDelete',
    summary: 'Xóa mềm; 409 STRATEGY_IN_USE khi Bot đang hoặc sẽ dùng',
  })
  @ApiNoContentResponse()
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: strategyIdSchema }) id: string,
  ): Promise<void> {
    await this.strategies.remove(user.id, id);
  }

  @Get('strategies/:id/versions')
  @ApiOperation({
    operationId: 'strategyVersions',
    summary: 'Các bản của chiến lược, mới nhất trước',
  })
  @ApiOkResponse({ schema: openApi(strategyVersionListSchema) })
  versions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: strategyIdSchema }) id: string,
  ) {
    return this.strategies.versions(user.id, id);
  }

  @Get('strategies/:id/versions/:version')
  @ApiOperation({ operationId: 'strategyVersion', summary: 'Nội dung một bản' })
  @ApiOkResponse({ schema: openApi(strategyVersionDetailSchema) })
  version(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: strategyIdSchema }) id: string,
    @Param('version', { schema: strategyVersionParamSchema }) version: number,
  ) {
    return this.strategies.version(user.id, id, Number(version));
  }

  @Post('strategies/:id/versions')
  @ApiOperation({
    operationId: 'strategyVersionCreate',
    summary: 'Lưu bản mới (expected_latest_version, from_run_id); apply_next đặt cho Bot',
  })
  @ApiCreatedResponse({ schema: openApi(strategySaveResultSchema) })
  createVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: strategyIdSchema }) id: string,
    @Body({ schema: strategyVersionCreateBodySchema }) body: StrategyVersionCreateBody,
  ) {
    return this.strategies.createVersion(user.id, id, body);
  }

  @Post('strategies/:id/versions/:version/restore')
  @ApiOperation({
    operationId: 'strategyVersionRestore',
    summary: 'Khôi phục một bản cũ thành bản mới',
  })
  @ApiCreatedResponse({ schema: openApi(strategySaveResultSchema) })
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: strategyIdSchema }) id: string,
    @Param('version', { schema: strategyVersionParamSchema }) version: number,
    @Body({ schema: strategyRestoreBodySchema }) body: StrategyRestoreBody,
  ) {
    return this.strategies.restore(user.id, id, Number(version), body);
  }
}
