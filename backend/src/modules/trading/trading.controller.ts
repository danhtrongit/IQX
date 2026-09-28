import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentUser, Premium, Public, type AuthenticatedUser } from '../auth/index.js';
import { BillingService } from '../billing/billing.service.js';
import { TradingService } from './trading.service.js';
import {
  leaderboardQuerySchema,
  orderListQuerySchema,
  paginationQuerySchema,
  placeOrderSchema,
  uuidParamSchema,
  type LeaderboardQuery,
  type OrderListQuery,
  type PaginationQuery,
  type PlaceOrderBody,
} from './trading.schemas.js';

@ApiTags('Virtual trading')
@Controller(['api/v1/virtual-trading', 'api/v2/virtual-trading'])
export class TradingController {
  constructor(
    private readonly trading: TradingService,
    private readonly billing: BillingService,
  ) {}

  @Post('account/activate')
  @Premium()
  activate(@CurrentUser() user: AuthenticatedUser) {
    return this.trading.activateAccount(user.id);
  }

  @Get('account')
  account(@CurrentUser() user: AuthenticatedUser) {
    return this.trading.getAccountResponse(user.id);
  }

  @Get('portfolio')
  portfolio(@CurrentUser() user: AuthenticatedUser) {
    return this.trading.getPortfolio(user.id);
  }

  @Post('orders')
  place(
    @Body({ schema: placeOrderSchema }) body: PlaceOrderBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.getEntitlement(user.id, user.role).then((entitlement) =>
      this.trading.placeOrder({
        userId: user.id,
        isPremium: Boolean(entitlement.is_premium),
        symbol: body.symbol,
        side: body.side,
        orderType: body.order_type,
        quantity: body.quantity,
        limitPriceVnd: body.limit_price_vnd,
        journeyPlan: body.journey_plan,
      }),
    );
  }

  @Get('orders')
  orders(
    @Query({ schema: orderListQuerySchema }) query: OrderListQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.trading.listOrders(user.id, {
      status: query.status,
      symbol: query.symbol,
      side: query.side,
      page: query.page,
      pageSize: query.page_size,
    });
  }

  @Post('orders/:orderId/cancel')
  cancel(
    @Param('orderId', { schema: uuidParamSchema }) orderId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.trading.cancelOrder(user.id, orderId);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@CurrentUser() user: AuthenticatedUser) {
    return this.trading.refresh(user.id);
  }

  @Get('trades')
  trades(
    @Query({ schema: paginationQuerySchema }) query: PaginationQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.trading.listTrades(user.id, query.page, query.page_size);
  }

  @Get('ledger')
  ledger(
    @Query({ schema: paginationQuerySchema }) query: PaginationQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.trading.listLedger(user.id, query.page, query.page_size);
  }

  @Get('leaderboard')
  @Public()
  leaderboard(@Query({ schema: leaderboardQuerySchema }) query: LeaderboardQuery) {
    return this.trading.getLeaderboard(query.sort_by, query.page, query.page_size);
  }
}
