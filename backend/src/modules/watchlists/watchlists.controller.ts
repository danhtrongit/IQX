import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiAuthGuard, CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { toLegacyWatchlistItem, toWatchlistItem } from './watchlists.mapper.js';
import {
  addWatchlistItemSchema,
  reorderWatchlistSchema,
  watchlistSymbolSchema,
  type AddWatchlistItemInput,
  type ReorderWatchlistInput,
} from './watchlists.schemas.js';
import { WatchlistsService } from './watchlists.service.js';
import type { LegacyWatchlistItem, WatchlistItem } from './watchlists.types.js';

@ApiTags('Watchlists')
@UseGuards(ApiAuthGuard)
@Controller('api/v1/watchlist')
export class LegacyWatchlistsController {
  constructor(private readonly watchlists: WatchlistsService) {}

  @Get()
  @ApiOperation({ operationId: 'listWatchlistV1' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ items: LegacyWatchlistItem[]; count: number }> {
    const rows = await this.watchlists.listForUser(user.id);
    return { items: rows.map(toLegacyWatchlistItem), count: rows.length };
  }

  @Post()
  @ApiOperation({ operationId: 'addWatchlistItemV1' })
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: addWatchlistItemSchema }) body: AddWatchlistItemInput,
  ): Promise<LegacyWatchlistItem> {
    return toLegacyWatchlistItem(await this.watchlists.addForUser(user.id, body.symbol));
  }

  @Put('reorder')
  @ApiOperation({ operationId: 'reorderWatchlistV1' })
  async reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: reorderWatchlistSchema }) body: ReorderWatchlistInput,
  ): Promise<{ items: LegacyWatchlistItem[]; count: number }> {
    const rows = await this.watchlists.reorderForUser(user.id, body.symbols);
    return { items: rows.map(toLegacyWatchlistItem), count: rows.length };
  }

  @Get('check/:symbol')
  @ApiOperation({ operationId: 'checkWatchlistItemV1' })
  async check(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol', { schema: watchlistSymbolSchema }) symbol: string,
  ): Promise<{ symbol: string; is_watched: boolean }> {
    return { symbol, is_watched: await this.watchlists.isWatched(user.id, symbol) };
  }

  @Delete(':symbol')
  @HttpCode(204)
  @ApiOperation({ operationId: 'removeWatchlistItemV1' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol', { schema: watchlistSymbolSchema }) symbol: string,
  ): Promise<void> {
    await this.watchlists.removeForUser(user.id, symbol);
  }
}

@ApiTags('Watchlists')
@UseGuards(ApiAuthGuard)
@Controller('api/v2/watchlists')
export class WatchlistsController {
  constructor(private readonly watchlists: WatchlistsService) {}

  @Get()
  @ApiOperation({ operationId: 'listWatchlistV2' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: WatchlistItem[]; meta: { count: number; limit: number } }> {
    const rows = await this.watchlists.listForUser(user.id);
    return {
      data: rows.map(toWatchlistItem),
      meta: { count: rows.length, limit: 50 },
    };
  }

  @Post()
  @ApiOperation({ operationId: 'addWatchlistItemV2' })
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: addWatchlistItemSchema }) body: AddWatchlistItemInput,
  ): Promise<{ data: WatchlistItem; meta: Record<string, never> }> {
    return {
      data: toWatchlistItem(await this.watchlists.addForUser(user.id, body.symbol)),
      meta: {},
    };
  }

  @Put('reorder')
  @ApiOperation({ operationId: 'reorderWatchlistV2' })
  async reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: reorderWatchlistSchema }) body: ReorderWatchlistInput,
  ): Promise<{ data: WatchlistItem[]; meta: { count: number } }> {
    const rows = await this.watchlists.reorderForUser(user.id, body.symbols);
    return { data: rows.map(toWatchlistItem), meta: { count: rows.length } };
  }

  @Get(':symbol/status')
  @ApiOperation({ operationId: 'checkWatchlistItemV2' })
  async check(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol', { schema: watchlistSymbolSchema }) symbol: string,
  ): Promise<{ data: { symbol: string; watched: boolean }; meta: Record<string, never> }> {
    return {
      data: { symbol, watched: await this.watchlists.isWatched(user.id, symbol) },
      meta: {},
    };
  }

  @Delete(':symbol')
  @HttpCode(204)
  @ApiOperation({ operationId: 'removeWatchlistItemV2' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol', { schema: watchlistSymbolSchema }) symbol: string,
  ): Promise<void> {
    await this.watchlists.removeForUser(user.id, symbol);
  }
}
