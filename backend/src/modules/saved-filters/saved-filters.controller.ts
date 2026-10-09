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
  listFromResultSchema,
  listQuerySchema,
  resultSnapshotCollectionSchema,
  resultSnapshotCreateSchema,
  resultSnapshotQuerySchema,
  resultSnapshotSchema,
  savedFilterListSchema,
  savedFilterSchema,
  savedListCollectionSchema,
  savedListSchema,
  savedResourceIdSchema,
  type FilterCreateInput,
  type FilterGetQuery,
  type FilterUpdateInput,
  type ListCreateInput,
  type ListFromResultInput,
  type ListQuery,
  type ResultSnapshot,
  type ResultSnapshotCreateInput,
  type ResultSnapshotQuery,
  type ResultSnapshotSummary,
  type SavedFilter,
  type SavedFilterSummary,
  type SavedList,
} from './saved-filters.schemas.js';
import { SavedFiltersService } from './saved-filters.service.js';
import { SavedResultsService } from './saved-results.service.js';

function openApi(schema: z.ZodType): SchemaObject {
  return z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;
}

@ApiTags('Strategy saved filters')
@Premium()
@UseGuards(SavedFiltersFeatureGuard, ApiAuthGuard, PremiumGuard)
@Controller('api/v2/strategy')
export class SavedFiltersController {
  constructor(
    private readonly savedFilters: SavedFiltersService,
    private readonly results: SavedResultsService,
  ) {}

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
  @ApiOperation({
    operationId: 'listStrategySavedLists',
    summary: 'Static list snapshots ("Danh mục đã lưu"; internal Bot-apply lists on request)',
  })
  @ApiOkResponse({ schema: openApi(savedListCollectionSchema) })
  listLists(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: listQuerySchema }) query: ListQuery,
  ): Promise<{ items: SavedList[] }> {
    return this.savedFilters.listLists(user.id, query.include_internal);
  }

  @Post('lists/from-result')
  @ApiOperation({
    operationId: 'createStrategySavedListFromResult',
    summary:
      'Create a list (and its evidence snapshot) from a server-held filter result; tickers never come from the client',
  })
  @ApiCreatedResponse({ schema: openApi(savedListSchema) })
  createListFromResult(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: listFromResultSchema }) body: ListFromResultInput,
  ): Promise<SavedList> {
    return this.results.createListFromResult(user.id, body);
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
  @ApiOperation({
    operationId: 'deleteStrategySavedList',
    summary:
      'Soft-delete a list; 409 LIST_IN_USE_BY_BOT while the Bot uses it as a pending or effective buy source',
  })
  @ApiNoContentResponse({ description: 'Đã xóa danh sách' })
  async deleteList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listId', { schema: savedResourceIdSchema }) listId: string,
  ): Promise<void> {
    await this.savedFilters.deleteList(user.id, listId);
  }

  @Get('result-snapshots')
  @ApiOperation({
    operationId: 'listStrategyResultSnapshots',
    summary: 'Saved result snapshots (criteria, rows and provenance frozen at save time)',
  })
  @ApiOkResponse({ schema: openApi(resultSnapshotCollectionSchema) })
  listResultSnapshots(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: resultSnapshotQuerySchema }) query: ResultSnapshotQuery,
  ): Promise<{ items: ResultSnapshotSummary[] }> {
    return this.results.listSnapshots(user.id, query.include_internal);
  }

  @Post('result-snapshots')
  @ApiOperation({
    operationId: 'createStrategyResultSnapshot',
    summary: 'Freeze selected rows of a server-held filter result (immutable)',
  })
  @ApiCreatedResponse({ schema: openApi(resultSnapshotSchema) })
  createResultSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: resultSnapshotCreateSchema }) body: ResultSnapshotCreateInput,
  ): Promise<ResultSnapshot> {
    return this.results.createSnapshot(user.id, body);
  }

  @Get('result-snapshots/:snapshotId')
  @ApiOperation({
    operationId: 'getStrategyResultSnapshot',
    summary: 'One saved result snapshot with its rows and provenance',
  })
  @ApiOkResponse({ schema: openApi(resultSnapshotSchema) })
  getResultSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('snapshotId', { schema: savedResourceIdSchema }) snapshotId: string,
  ): Promise<ResultSnapshot> {
    return this.results.getSnapshot(user.id, snapshotId);
  }

  @Delete('result-snapshots/:snapshotId')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'deleteStrategyResultSnapshot',
    summary: 'Soft-delete a result snapshot (refused while the Bot buys from a list made from it)',
  })
  @ApiNoContentResponse({ description: 'Đã xóa kết quả đã lưu' })
  async deleteResultSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('snapshotId', { schema: savedResourceIdSchema }) snapshotId: string,
  ): Promise<void> {
    await this.results.deleteSnapshot(user.id, snapshotId);
  }
}
