import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiAuthGuard,
  CurrentUser,
  Premium,
  PremiumGuard,
  type AuthenticatedUser,
} from '../auth/index.js';
import { PortfolioManagerService } from './portfolio.service.js';

@ApiTags('Portfolio manager')
@Controller('api/v2/portfolio-manager')
@UseGuards(ApiAuthGuard, PremiumGuard)
@Premium()
export class PortfolioManagerController {
  constructor(private readonly service: PortfolioManagerService) {}
  @Post('analyze') @ApiOperation({ operationId: 'analyzePortfolioV2' }) analyze(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.generate(user.id);
  }
  @Get('report') @ApiOperation({ operationId: 'getPortfolioReportV2' }) report(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.get(user.id);
  }
}

@ApiTags('Compatibility: Portfolio manager v1')
@Controller('api/v1/portfolio-manager')
@UseGuards(ApiAuthGuard, PremiumGuard)
@Premium()
export class PortfolioManagerV1Controller {
  constructor(private readonly service: PortfolioManagerService) {}
  @Post('analyze') analyze(@CurrentUser() user: AuthenticatedUser) {
    return this.service.generate(user.id);
  }
  @Get('report') report(@CurrentUser() user: AuthenticatedUser) {
    return this.service.get(user.id);
  }
}
