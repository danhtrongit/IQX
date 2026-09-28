import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiAuthGuard, CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { BotService } from './bot.service.js';

@ApiTags('Bot')
@UseGuards(ApiAuthGuard)
@Controller(['api/v1/bot', 'api/v2/bot'])
export class BotsController {
  constructor(private readonly bot: BotService) {}

  @Get()
  @ApiOperation({
    operationId: 'getBotOverview',
    summary: 'Read the authenticated user Bot overview',
  })
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.bot.overview(user.id);
  }

  @Get('positions')
  @ApiOperation({
    operationId: 'getBotPositions',
    summary: 'Read the authenticated user open Bot positions',
  })
  positions(@CurrentUser() user: AuthenticatedUser) {
    return this.bot.positions(user.id);
  }

  @Get('status')
  @ApiOperation({
    operationId: 'getBotStatus',
    summary: 'Read the authenticated user Bot run status',
  })
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.bot.status(user.id);
  }

  @Get('journal')
  @ApiOperation({
    operationId: 'getBotJournal',
    summary: 'Read immutable Bot decisions and executions',
  })
  journal(
    @CurrentUser() user: AuthenticatedUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const pageSize = limit === undefined ? 30 : Number(limit);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new BadRequestException({
        code: 'INVALID_LIMIT',
        message: 'limit phải là số nguyên từ 1 đến 100',
      });
    }
    return this.bot.journal(user.id, cursor, pageSize);
  }

  @Get('performance')
  @ApiOperation({ operationId: 'getBotPerformance', summary: 'Read Bot NAV performance' })
  performance(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.bot.performance(user.id, from, to);
  }
}
