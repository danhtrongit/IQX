import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
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
import { SavedFiltersFeatureGuard } from './saved-filters.feature.guard.js';
import {
  filterCreateSchema,
  filterGetQuerySchema,
  filterUpdateSchema,
  listCreateSchema,
  savedFilterListSchema,
  savedFilterSchema,
  savedListCollectionSchema,
  savedListSchema,
  savedResourceIdSchema,
  type FilterCreateInput,
  type FilterGetQuery,
  type FilterUpdateInput,
  type ListCreateInput,
  type SavedFilter,
  type SavedFilterSummary,
  type SavedList,
} from './saved-filters.schemas.js';
import { SavedFiltersService } from './saved-filters.service.js';

function openApi(schema: z.ZodType): SchemaObject {
  return z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;
}

@ApiTags('Strategy saved filters')
@Premium()
@UseGuards(SavedFiltersFeatureGuard, ApiAuthGuard, PremiumGuard)
@Controller('api/v2/strategy')
export class SavedFiltersController {
  constructor(private readonly savedFilters: SavedFiltersService) {}

  @Get('filters')
  @ApiOperation({ operationId: 'listStrategySavedFilters', summary: 'Saved filters of the user' })
  @ApiOkResponse({ schema: openApi(savedFilterListSchema) })
  listFilters(@CurrentUser() user: AuthenticatedUser): Promise<{ items: SavedFilterSummary[] }> {
    return this.savedFilters.listFilters(user.id);
  }

  @Post('filters')
  @ApiOperation({ operationId: 'createStrategySavedFilter', summary: 'Save a filter (version 1)' })
  @ApiCreatedResponse({ schema: openApi(savedFilterSchema) })
  createFilter(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: filterCreateSchema }) body: FilterCreateInput,
  ): Promise<SavedFilter> {
    return this.savedFilters.createFilter(user.id, body);
  }

  @Get('filters/:filterId')
  @ApiOperation({ operationId: 'getStrategySavedFilter', summary: 'Saved filter with versions' })
  @ApiOkResponse({ schema: openApi(savedFilterSchema) })
  getFilter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('filterId', { schema: savedResourceIdSchema }) filterId: string,
    @Query({ schema: filterGetQuerySchema }) query: FilterGetQuery,
  ): Promise<SavedFilter> {
    return this.savedFilters.getFilter(user.id, filterId, query.version);
  }

  @Put('filters/:filterId')
  @ApiOperation({
    operationId: 'updateStrategySavedFilter',
    summary: 'Save a new filter version (unchanged definition keeps the current version)',
  })
  @ApiOkResponse({ schema: openApi(savedFilterSchema) })
  updateFilter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('filterId', { schema: savedResourceIdSchema }) filterId: string,
    @Body({ schema: filterUpdateSchema }) body: FilterUpdateInput,
  ): Promise<SavedFilter> {
    return this.savedFilters.updateFilter(user.id, filterId, body);
  }

  @Delete('filters/:filterId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteStrategySavedFilter', summary: 'Soft-delete a filter' })
  @ApiNoContentResponse({ description: 'Đã xóa bộ lọc' })
  async deleteFilter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('filterId', { schema: savedResourceIdSchema }) filterId: string,
  ): Promise<void> {
    await this.savedFilters.deleteFilter(user.id, filterId);
  }

  @Get('lists')
  @ApiOperation({ operationId: 'listStrategySavedLists', summary: 'Static list snapshots' })
  @ApiOkResponse({ schema: openApi(savedListCollectionSchema) })
  listLists(@CurrentUser() user: AuthenticatedUser): Promise<{ items: SavedList[] }> {
    return this.savedFilters.listLists(user.id);
  }

  @Post('lists')
  @ApiOperation({
    operationId: 'createStrategySavedList',
    summary: 'Save a static retrospective ticker list',
  })
  @ApiCreatedResponse({ schema: openApi(savedListSchema) })
  createList(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: listCreateSchema }) body: ListCreateInput,
  ): Promise<SavedList> {
    return this.savedFilters.createList(user.id, body);
  }

  @Get('lists/:listId')
  @ApiOperation({ operationId: 'getStrategySavedList', summary: 'Static list snapshot' })
  @ApiOkResponse({ schema: openApi(savedListSchema) })
  getList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listId', { schema: savedResourceIdSchema }) listId: string,
  ): Promise<SavedList> {
    return this.savedFilters.getList(user.id, listId);
  }

  @Delete('lists/:listId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteStrategySavedList', summary: 'Soft-delete a list' })
  @ApiNoContentResponse({ description: 'Đã xóa danh sách' })
  async deleteList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listId', { schema: savedResourceIdSchema }) listId: string,
  ): Promise<void> {
    await this.savedFilters.deleteList(user.id, listId);
  }
}
