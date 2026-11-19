import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiGoneResponse,
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
  demoExchangeBodySchema,
  demoExchangeResultSchema,
  evolveBodySchema,
  evolveResultSchema,
  ledgerPageSchema,
  ledgerQuerySchema,
  petIdParamSchema,
  premiumPurchaseBodySchema,
  premiumPurchaseResultSchema,
  purchaseBodySchema,
  purchaseKeyParamSchema,
  purchaseResultSchema,
  purchaseStatusSchema,
  shopStateSchema,
  type ActiveMascotBody,
  type EvolveBody,
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

  @Post('pets/:mascotId/evolve')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'evolveShopPet',
    summary:
      'Tiến hoá linh thú lên cấp 2 rồi cấp 3 (idempotent; chỉ đổi hình ảnh, không lợi thế giao dịch)',
  })
  @ApiOkResponse({ schema: openApi(evolveResultSchema) })
  @ApiConflictResponse({
    description:
      'PET_NOT_OWNED, PET_LEVEL_LOCKED, PET_MAX_LEVEL, PRICE_CHANGED, INSUFFICIENT_XU (details[0] has balance_xu/price_xu/shortfall_xu)',
  })
  evolvePet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('mascotId', { schema: petIdParamSchema }) mascotId: string,
    @Body({ schema: evolveBodySchema }) body: EvolveBody,
  ) {
    return this.shop.evolvePet(user.id, mascotId, body);
  }

  /**
   * Removed by update 19-11 (Bố cục SPEC §7): always 410 `SHOP_PREMIUM_REMOVED`, the body is not
   * validated and xu, the coin ledger and Premium are never touched. The legacy body/200 shapes
   * stay documented (deprecated) so older clients keep compiling until they drop the call.
   */
  @Post('premium-purchases')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'purchaseShopPremiumWithXu',
    deprecated: true,
    summary: 'Đã bỏ: Premium không còn bán bằng xu (luôn 410 SHOP_PREMIUM_REMOVED, không trừ xu)',
  })
  @ApiBody({ required: false, schema: openApi(premiumPurchaseBodySchema) })
  @ApiOkResponse({
    description: 'Legacy shape, never returned since update 19-11',
    schema: openApi(premiumPurchaseResultSchema),
  })
  @ApiGoneResponse({
    description: 'SHOP_PREMIUM_REMOVED: Premium mua bằng xu đã bỏ; xu không đổi',
  })
  purchasePremium(): never {
    return this.shop.purchasePremium();
  }

  /**
   * Removed by update 19-11 (Bố cục SPEC §8.1): both directions always answer 410
   * `DEMO_EXCHANGE_REMOVED`; xu and Demo cash never change.
   */
  @Post('demo-exchange')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'exchangeShopDemoCash',
    deprecated: true,
    summary: 'Đã bỏ: không còn đổi xu <-> tiền Demo (luôn 410 DEMO_EXCHANGE_REMOVED)',
  })
  @ApiBody({ required: false, schema: openApi(demoExchangeBodySchema) })
  @ApiOkResponse({
    description: 'Legacy shape, never returned since update 19-11',
    schema: openApi(demoExchangeResultSchema),
  })
  @ApiGoneResponse({
    description: 'DEMO_EXCHANGE_REMOVED: đổi xu <-> tiền Demo đã bỏ; xu và tiền Demo không đổi',
  })
  exchangeDemo(): never {
    return this.shop.exchangeDemo();
  }
}
