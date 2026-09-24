import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { CurrentUser, Roles, type AuthenticatedUser } from '../auth/index.js';
import { auditContext, type AuditContext } from './admin-audit.service.js';
import {
  accountListQuerySchema,
  cashAdjustSchema,
  freezeAccountSchema,
  ledgerQuerySchema,
  ordersQuerySchema,
  resetAccountSchema,
  resetAllSchema,
  settlementsQuerySchema,
  tradesQuerySchema,
  tradingConfigUpdateSchema,
  unfreezeAccountSchema,
  type AccountListQuery,
  type CashAdjustInput,
  type FreezeAccountInput,
  type LedgerQuery,
  type OrdersQuery,
  type ResetAccountInput,
  type ResetAllInput,
  type SettlementsQuery,
  type TradesQuery,
  type TradingConfigUpdate,
  type UnfreezeAccountInput,
} from './admin.schemas.js';
import { AdminVTService } from './admin-vt.service.js';

@ApiTags('Quản trị: Giao dịch ảo')
@ApiBearerAuth()
@Roles('admin')
@Controller({ path: ['api/v1/admin/vt', 'api/v2/admin/vt'] })
export class AdminVTController {
  constructor(private readonly service: AdminVTService) {}
  private ctx(user: AuthenticatedUser, request: FastifyRequest): AuditContext {
    return auditContext(user, request);
  }

  @Get('accounts') accounts(@Query({ schema: accountListQuerySchema }) query: AccountListQuery) {
    return this.service.accounts(query);
  }
  @Get('accounts/:accountId') account(@Param('accountId', ParseUUIDPipe) accountId: string) {
    return this.service.account(accountId);
  }
  @Get('accounts/:accountId/positions') positions(
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return this.service.positions(accountId);
  }
  @Get('accounts/:accountId/orders') orders(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query({ schema: ordersQuerySchema }) query: OrdersQuery,
  ) {
    return this.service.orders(accountId, query);
  }
  @Get('accounts/:accountId/trades') trades(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query({ schema: tradesQuerySchema }) query: TradesQuery,
  ) {
    return this.service.trades(accountId, query);
  }
  @Get('accounts/:accountId/ledger') ledger(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query({ schema: ledgerQuerySchema }) query: LedgerQuery,
  ) {
    return this.service.ledger(accountId, query);
  }
  @Get('accounts/:accountId/settlements') settlements(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query({ schema: settlementsQuerySchema }) query: SettlementsQuery,
  ) {
    return this.service.settlements(accountId, query);
  }
  @Get('accounts/:accountId/stats') stats(@Param('accountId', ParseUUIDPipe) accountId: string) {
    return this.service.stats(accountId);
  }

  @Post('accounts/:accountId/freeze') freeze(
    @Param('accountId', ParseUUIDPipe) id: string,
    @Body({ schema: freezeAccountSchema }) body: FreezeAccountInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.service.freeze(id, this.ctx(user, request), body.reason);
  }
  @Post('accounts/:accountId/unfreeze') unfreeze(
    @Param('accountId', ParseUUIDPipe) id: string,
    @Body({ schema: unfreezeAccountSchema }) body: UnfreezeAccountInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.service.unfreeze(id, this.ctx(user, request), body.reason);
  }
  @Post('accounts/:accountId/cash-adjust') cashAdjust(
    @Param('accountId', ParseUUIDPipe) id: string,
    @Body({ schema: cashAdjustSchema }) body: CashAdjustInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.service.cashAdjust(id, this.ctx(user, request), body);
  }
  @Post('accounts/:accountId/reset') reset(
    @Param('accountId', ParseUUIDPipe) id: string,
    @Body({ schema: resetAccountSchema }) body: ResetAccountInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.service.resetAccount(id, this.ctx(user, request), body);
  }
  @Post('reset-all') resetAll(
    @Body({ schema: resetAllSchema }) body: ResetAllInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.service.resetAll(this.ctx(user, request), body);
  }

  @Get('config') config() {
    return this.service.config();
  }
  @Patch('config') updateConfig(
    @Body({ schema: tradingConfigUpdateSchema }) body: TradingConfigUpdate,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.service.updateConfig(this.ctx(user, request), body);
  }
}

/** Legacy aliases retained only for existing virtual-trading admin consumers. */
@ApiTags('Quản trị: Giao dịch ảo')
@ApiBearerAuth()
@Roles('admin')
@Controller({ path: ['api/v1/virtual-trading/admin', 'api/v2/virtual-trading/admin'] })
export class LegacyVirtualTradingAdminController {
  constructor(private readonly service: AdminVTService) {}
  @Get('config') config() {
    return this.service.config();
  }
  @Patch('config') updateConfig(
    @Body({ schema: tradingConfigUpdateSchema }) body: TradingConfigUpdate,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.service.updateConfig(auditContext(user, request), body);
  }
  @Post('users/:userId/reset') reset(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body({ schema: resetAccountSchema }) body: ResetAccountInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    // Resolve the account by user ID; no broad reset endpoint is exposed here.
    return this.service.resetByUser(userId, auditContext(user, request), body);
  }
  @Post('reset-all') resetAll(
    @Body({ schema: resetAllSchema }) body: ResetAllInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.service.resetAll(auditContext(user, request), body);
  }
  @Get('accounts') accounts(@Query({ schema: accountListQuerySchema }) query: AccountListQuery) {
    return this.service.accounts(query);
  }
}
