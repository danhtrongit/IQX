/**
 * REST API controller for "Toàn cảnh thị trường" (`/api/v2/toan-canh`).
 *
 * Route ordering note: static `PATCH pages/order` is declared strictly before
 * parameterized `PUT pages/:id` and `DELETE pages/:id`.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import { ApiAuthGuard, CurrentUser, Public, type AuthenticatedUser } from '../auth/index.js';
import { MarketOverviewWidgetDispatcherService } from './aggregators/widget-dispatcher.service.js';
import type { MarketOverviewWidgetSlug } from './market-overview.catalog.js';
import { MarketOverviewPagesService } from './market-overview.pages.service.js';
import {
  createMarketOverviewPageSchema,
  deleteMarketOverviewPageResponseSchema,
  marketOverviewPageIdParamSchema,
  marketOverviewPageSchema,
  marketOverviewPagesListResponseSchema,
  marketOverviewPreferencesResponseSchema,
  marketOverviewTemplateResponseSchema,
  marketOverviewWidgetResponseSchema,
  marketOverviewWidgetSlugSchema,
  reorderMarketOverviewPagesResponseSchema,
  reorderMarketOverviewPagesSchema,
  updateMarketOverviewPageSchema,
  updateMarketOverviewPreferencesSchema,
  widgetDataQuerySchema,
  type CreateMarketOverviewPageInput,
  type DeleteMarketOverviewPageResponse,
  type MarketOverviewPageDto,
  type MarketOverviewPagesListResponse,
  type MarketOverviewPreferencesResponse,
  type MarketOverviewTemplateResponse,
  type MarketOverviewWidgetResponse,
  type ReorderMarketOverviewPagesInput,
  type ReorderMarketOverviewPagesResponse,
  type UpdateMarketOverviewPageInput,
  type UpdateMarketOverviewPreferencesInput,
  type WidgetDataQuery,
} from './market-overview.schemas.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

@ApiTags('Market Overview')
@Controller('api/v2/toan-canh')
export class MarketOverviewController {
  constructor(
    private readonly pages: MarketOverviewPagesService,
    private readonly dispatcher: MarketOverviewWidgetDispatcherService,
  ) {}

  @Get('template')
  @Public()
  @ApiOperation({
    operationId: 'marketOverviewTemplate',
    summary:
      'Server-driven read-only "Thị trường" template layout (13 curated widgets), full 16-widget catalog, groups, and grid limits',
  })
  @ApiOkResponse({ schema: openApi(marketOverviewTemplateResponseSchema) })
  getTemplate(): MarketOverviewTemplateResponse {
    return this.pages.getTemplate();
  }

  @Get('widgets/:widget')
  @Public()
  @ApiOperation({
    operationId: 'marketOverviewWidgetData',
    summary: 'Fetch cached market snapshot data for a single "Toàn cảnh thị trường" widget',
  })
  @ApiOkResponse({ schema: openApi(marketOverviewWidgetResponseSchema) })
  getWidgetData(
    @Param('widget', { schema: marketOverviewWidgetSlugSchema }) widget: MarketOverviewWidgetSlug,
    @Query({ schema: widgetDataQuerySchema }) query: WidgetDataQuery,
  ): Promise<MarketOverviewWidgetResponse> {
    return this.dispatcher.getWidgetData(widget, query as Record<string, unknown>);
  }

  @Get('pages')
  @UseGuards(ApiAuthGuard)
  @ApiOperation({
    operationId: 'marketOverviewListPages',
    summary: 'List authenticated user custom "Toàn cảnh thị trường" pages and last active page ID',
  })
  @ApiOkResponse({ schema: openApi(marketOverviewPagesListResponseSchema) })
  listPages(@CurrentUser() user: AuthenticatedUser): Promise<MarketOverviewPagesListResponse> {
    return this.pages.listPages(user.id);
  }

  @Post('pages')
  @HttpCode(200)
  @UseGuards(ApiAuthGuard)
  @ApiOperation({
    operationId: 'marketOverviewCreatePage',
    summary: 'Create a new custom page or duplicate an existing user page (max 8 pages)',
  })
  @ApiBody({ schema: openApi(createMarketOverviewPageSchema) })
  @ApiOkResponse({ schema: openApi(marketOverviewPageSchema) })
  createPage(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: createMarketOverviewPageSchema }) body: CreateMarketOverviewPageInput,
  ): Promise<MarketOverviewPageDto> {
    return this.pages.createPage(user.id, body);
  }

  @Patch('pages/order')
  @UseGuards(ApiAuthGuard)
  @ApiOperation({
    operationId: 'marketOverviewReorderPages',
    summary: 'Persist reordered sequence of user custom pages',
  })
  @ApiBody({ schema: openApi(reorderMarketOverviewPagesSchema) })
  @ApiOkResponse({ schema: openApi(reorderMarketOverviewPagesResponseSchema) })
  async reorderPages(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: reorderMarketOverviewPagesSchema }) body: ReorderMarketOverviewPagesInput,
  ): Promise<ReorderMarketOverviewPagesResponse> {
    const pages = await this.pages.reorderPages(user.id, body.pageIds);
    return { pages };
  }

  @Put('pages/:id')
  @UseGuards(ApiAuthGuard)
  @ApiOperation({
    operationId: 'marketOverviewUpdatePage',
    summary: 'Update custom page name, 12-column widget layout, and per-widget states',
  })
  @ApiBody({ schema: openApi(updateMarketOverviewPageSchema) })
  @ApiOkResponse({ schema: openApi(marketOverviewPageSchema) })
  updatePage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: marketOverviewPageIdParamSchema }) id: string,
    @Body({ schema: updateMarketOverviewPageSchema }) body: UpdateMarketOverviewPageInput,
  ): Promise<MarketOverviewPageDto> {
    return this.pages.updatePage(user.id, id, body);
  }

  @Delete('pages/:id')
  @UseGuards(ApiAuthGuard)
  @ApiOperation({
    operationId: 'marketOverviewDeletePage',
    summary: 'Delete a user custom page and reconcile last active page preference',
  })
  @ApiOkResponse({ schema: openApi(deleteMarketOverviewPageResponseSchema) })
  deletePage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: marketOverviewPageIdParamSchema }) id: string,
  ): Promise<DeleteMarketOverviewPageResponse> {
    return this.pages.deletePage(user.id, id);
  }

  @Put('preferences')
  @UseGuards(ApiAuthGuard)
  @ApiOperation({
    operationId: 'marketOverviewUpdatePreferences',
    summary: 'Save the user last active tab ID ("thi-truong" or a custom page ID)',
  })
  @ApiBody({ schema: openApi(updateMarketOverviewPreferencesSchema) })
  @ApiOkResponse({ schema: openApi(marketOverviewPreferencesResponseSchema) })
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: updateMarketOverviewPreferencesSchema })
    body: UpdateMarketOverviewPreferencesInput,
  ): Promise<MarketOverviewPreferencesResponse> {
    return this.pages.updatePreferences(user.id, body.lastActivePageId);
  }
}
