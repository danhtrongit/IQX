import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthGuard } from '../../auth/auth.guard.js';
import { CurrentUser } from '../../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { Cap5Service } from './cap5.service.js';
import {
  huntFilterParamSchema,
  orderIdParamSchema,
  sourceQuerySchema,
  symbolParamSchema,
  taskSchema,
  watchlistSchema,
  type SourceQuery,
  type TaskBody,
  type WatchlistBody,
} from './cap5.schemas.js';

@ApiTags('Cap5')
@UseGuards(ApiAuthGuard)
@Controller(['api/v2/cap5', 'api/v1/cap5'])
export class Cap5Controller {
  constructor(private readonly service: Cap5Service) {}
  @Get('progress') @ApiOperation({ operationId: 'cap5Progress' }) progress(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getProgress(user.id);
  }
  @Post('enter') @ApiOperation({ operationId: 'cap5Enter' }) enter(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.enter(user.id);
  }
  @Patch('task') @ApiOperation({ operationId: 'cap5Task' }) task(
    @Body({ schema: taskSchema }) body: TaskBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.markTask(user.id, body.task_no);
  }
  @Post('tour-sanma') @ApiOperation({ operationId: 'cap5TourSanma' }) tour(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.markTour(user.id);
  }
  @Get('plans/:order_id') @ApiOperation({ operationId: 'cap5Plan' }) plan(
    @Param({ schema: orderIdParamSchema }) params: { order_id: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getPlan(user.id, params.order_id);
  }
  @Get('san-ma') @ApiOperation({ operationId: 'cap5HuntIndex' }) huntIndex(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.huntIndex(user.id);
  }
  @Get('san-ma/:bo_loc') @ApiOperation({ operationId: 'cap5HuntResult' }) huntResult(
    @Param({ schema: huntFilterParamSchema }) params: { bo_loc: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.huntResult(user.id, params.bo_loc);
  }
  @Get('watchlist') @ApiOperation({ operationId: 'cap5Watchlist' }) watchlist(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.watchlist(user.id);
  }
  @Post('watchlist') @ApiOperation({ operationId: 'cap5AddWatchlist' }) add(
    @Body({ schema: watchlistSchema }) body: WatchlistBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.addWatchlist(user.id, body);
  }
  @Delete('watchlist/:symbol') @ApiOperation({ operationId: 'cap5RemoveWatchlist' }) remove(
    @Param({ schema: symbolParamSchema }) params: { symbol: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.removeWatchlist(user.id, params.symbol);
  }
  @Get('nguon-san/:symbol') @ApiOperation({ operationId: 'cap5HuntSource' }) source(
    @Param({ schema: symbolParamSchema }) params: { symbol: string },
    @Query({ schema: sourceQuerySchema }) query: SourceQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.source(user.id, params.symbol, query.order_id);
  }
  @Get('phan-tich') @ApiOperation({ operationId: 'cap5Analysis' }) analysis(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.analysis(user.id);
  }
  @Post('graduate') @ApiOperation({ operationId: 'cap5Graduate' }) graduate(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.graduate(user.id);
  }
}
