import { Body, Controller, Delete, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiAuthGuard, CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { toChartDrawing, toLegacyChartDrawing } from './chart-drawings.mapper.js';
import {
  chartDrawingUpsertSchema,
  chartSymbolSchema,
  type ChartDrawingUpsertInput,
} from './chart-drawings.schemas.js';
import { ChartDrawingsService } from './chart-drawings.service.js';
import type { ChartDrawing, LegacyChartDrawing } from './chart-drawings.types.js';

@ApiTags('Chart drawings')
@UseGuards(ApiAuthGuard)
@Controller('api/v1/chart-drawings')
export class LegacyChartDrawingsController {
  constructor(private readonly drawings: ChartDrawingsService) {}

  @Get(':symbol')
  @ApiOperation({ operationId: 'getChartDrawingV1' })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol', { schema: chartSymbolSchema }) symbol: string,
  ): Promise<LegacyChartDrawing> {
    return toLegacyChartDrawing(symbol, await this.drawings.getForUser(user.id, symbol));
  }

  @Put(':symbol')
  @ApiOperation({ operationId: 'saveChartDrawingV1' })
  async put(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol', { schema: chartSymbolSchema }) symbol: string,
    @Body({ schema: chartDrawingUpsertSchema }) body: ChartDrawingUpsertInput,
  ): Promise<LegacyChartDrawing> {
    return toLegacyChartDrawing(
      symbol,
      await this.drawings.upsertForUser(user.id, symbol, body.state),
    );
  }

  @Delete(':symbol')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteChartDrawingV1' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol', { schema: chartSymbolSchema }) symbol: string,
  ): Promise<void> {
    await this.drawings.deleteForUser(user.id, symbol);
  }
}

@ApiTags('Chart drawings')
@UseGuards(ApiAuthGuard)
@Controller('api/v2/chart-drawings')
export class ChartDrawingsController {
  constructor(private readonly drawings: ChartDrawingsService) {}

  @Get(':symbol')
  @ApiOperation({ operationId: 'getChartDrawingV2' })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol', { schema: chartSymbolSchema }) symbol: string,
  ): Promise<{ data: ChartDrawing; meta: Record<string, never> }> {
    return {
      data: toChartDrawing(symbol, await this.drawings.getForUser(user.id, symbol)),
      meta: {},
    };
  }

  @Put(':symbol')
  @ApiOperation({ operationId: 'saveChartDrawingV2' })
  async put(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol', { schema: chartSymbolSchema }) symbol: string,
    @Body({ schema: chartDrawingUpsertSchema }) body: ChartDrawingUpsertInput,
  ): Promise<{ data: ChartDrawing; meta: Record<string, never> }> {
    return {
      data: toChartDrawing(symbol, await this.drawings.upsertForUser(user.id, symbol, body.state)),
      meta: {},
    };
  }

  @Delete(':symbol')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteChartDrawingV2' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol', { schema: chartSymbolSchema }) symbol: string,
  ): Promise<void> {
    await this.drawings.deleteForUser(user.id, symbol);
  }
}
