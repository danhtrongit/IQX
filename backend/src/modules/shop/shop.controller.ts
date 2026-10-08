import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import {
  activeMascotBodySchema,
  activeMascotResultSchema,
  ledgerPageSchema,
  ledgerQuerySchema,
  purchaseBodySchema,
  purchaseKeyParamSchema,
  purchaseResultSchema,
  purchaseStatusSchema,
  shopStateSchema,
  type ActiveMascotBody,
  type LedgerQuery,
  type PurchaseBody,
} from './shop.schemas.js';
import { ShopService } from './shop.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/**
 * Learning coins and the mascot shop. Authenticated for every user (not Premium). The owner
 * always comes from the session; clients never send balances, prices to charge or rewards.
 */
@ApiTags('Shop')
@Controller('api/v2/shop')
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get()
  @ApiOperation({
    operationId: 'getShop',
    summary: 'Mascot catalog, xu wallet, owned mascots and the active mascot (read-only)',
  })
  @ApiOkResponse({ schema: openApi(shopStateSchema) })
  getShop(@CurrentUser() user: AuthenticatedUser) {
    return this.shop.getShop(user.id);
  }

  @Get('coin-ledger')
  @ApiOperation({
    operationId: 'listShopCoinLedger',
    summary: 'xu ledger, newest first by commit sequence, cursor-paginated',
  })
  @ApiOkResponse({ schema: openApi(ledgerPageSchema) })
  coinLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: ledgerQuerySchema }) query: LedgerQuery,
  ) {
    return this.shop.listLedger(user.id, query);
  }

  @Post('purchases')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'purchaseShopMascot',
    summary:
      'Buy a mascot with xu (idempotent per idempotency_key; never changes the active mascot)',
  })
  @ApiOkResponse({ schema: openApi(purchaseResultSchema) })
  @ApiConflictResponse({
    description:
      'IDEMPOTENCY_KEY_REUSED (same key, different payload), CATALOG_CHANGED, PRICE_CHANGED, MASCOT_NOT_FOR_SALE, INSUFFICIENT_XU (details[0] has balance_xu/price_xu/shortfall_xu)',
  })
  purchase(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: purchaseBodySchema }) body: PurchaseBody,
  ) {
    return this.shop.purchase(user.id, body);
  }

  @Get('purchases/:idempotencyKey')
  @ApiOperation({
    operationId: 'getShopPurchaseStatus',
    summary: 'Look up a purchase by idempotency key after a timeout (read-only)',
  })
  @ApiOkResponse({ schema: openApi(purchaseStatusSchema) })
  purchaseStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('idempotencyKey', { schema: purchaseKeyParamSchema }) idempotencyKey: string,
  ) {
    return this.shop.getPurchaseStatus(user.id, idempotencyKey);
  }

  @Put('active-mascot')
  @ApiOperation({
    operationId: 'setShopActiveMascot',
    summary: 'Switch the active mascot to an owned one (free; optimistic expected_revision)',
  })
  @ApiOkResponse({ schema: openApi(activeMascotResultSchema) })
  @ApiConflictResponse({
    description:
      'MASCOT_NOT_OWNED, or REVISION_CONFLICT (details[0] has current_revision/active_mascot_id)',
  })
  setActiveMascot(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: activeMascotBodySchema }) body: ActiveMascotBody,
  ) {
    return this.shop.setActiveMascot(user.id, body);
  }
}
