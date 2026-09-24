import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../auth/auth.decorators.js';
import { ApiAuthGuard } from '../../auth/auth.guard.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import type { Cap7PortfolioResponse, Cap7ProgressResponse } from './cap7.schemas.js';
import { Cap7Service } from './cap7.service.js';
import type { Cap7PortfolioSnapshot, Cap7Progress } from './cap7.types.js';

@ApiTags('Journey: Cấp 7')
@UseGuards(ApiAuthGuard)
@Controller('api/v2/cap7')
export class Cap7Controller {
  constructor(private readonly cap7: Cap7Service) {}

  @Get('progress')
  @ApiOperation({ operationId: 'getCap7ProgressV2' })
  async progress(@CurrentUser() user: AuthenticatedUser): Promise<Cap7ProgressResponse> {
    return { data: await this.cap7.getProgress(user.id), meta: {} };
  }

  @Post('enter')
  @ApiOperation({ operationId: 'enterCap7V2' })
  async enter(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: Cap7Progress; meta: object }> {
    return { data: await this.cap7.enter(user.id), meta: {} };
  }

  @Get('portfolio')
  @ApiOperation({ operationId: 'getCap7PortfolioV2' })
  async portfolio(@CurrentUser() user: AuthenticatedUser): Promise<Cap7PortfolioResponse> {
    return { data: await this.cap7.portfolio(user.id), meta: {} };
  }

  @Post('graduate')
  @ApiOperation({ operationId: 'graduateCap7V2' })
  async graduate(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: Cap7Progress; meta: object }> {
    return { data: await this.cap7.graduate(user.id), meta: {} };
  }
}

@ApiTags('Compatibility: Journey Cấp 7 v1')
@UseGuards(ApiAuthGuard)
@Controller('api/v1/cap7')
export class Cap7V1Controller {
  constructor(private readonly cap7: Cap7Service) {}

  @Get('progress')
  progress(@CurrentUser() user: AuthenticatedUser): Promise<Cap7Progress | null> {
    return this.cap7.getProgress(user.id);
  }

  @Post('enter')
  enter(@CurrentUser() user: AuthenticatedUser): Promise<Cap7Progress> {
    return this.cap7.enter(user.id);
  }

  @Get('portfolio')
  portfolio(@CurrentUser() user: AuthenticatedUser): Promise<Cap7PortfolioSnapshot> {
    return this.cap7.portfolio(user.id);
  }

  @Post('graduate')
  graduate(@CurrentUser() user: AuthenticatedUser): Promise<Cap7Progress> {
    return this.cap7.graduate(user.id);
  }
}
