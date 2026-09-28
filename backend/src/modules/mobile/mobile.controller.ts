import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, type AuthenticatedUser } from '../auth/index.js';
import {
  deviceSchema,
  productQuerySchema,
  preferencesSchema,
  purchaseSchema,
  restoreSchema,
  storeNotificationSchema,
  type DeviceInput,
  type ProductQuery,
  type PreferencesInput,
  type PurchaseInput,
  type RestoreInput,
  type StoreNotificationInput,
} from './mobile.schemas.js';
import { MobileService } from './mobile.service.js';

@ApiTags('Mobile')
@Controller('api/v2/mobile')
export class MobileController {
  constructor(private readonly mobile: MobileService) {}
  @Get('premium/products')
  @ApiOperation({ operationId: 'mobilePremiumProducts' })
  @ApiQuery({ name: 'platform', enum: ['ios', 'android'] })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
      additionalProperties: true,
    },
  })
  products(@Query({ schema: productQuerySchema }) query: ProductQuery) {
    return this.mobile.products(query);
  }
  @Post('premium/purchases/verify')
  @ApiOperation({ operationId: 'mobileVerifyPurchase' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  verify(
    @Body({ schema: purchaseSchema }) body: PurchaseInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mobile.verify(body, user);
  }
  @Post('premium/purchases/apple/verify')
  @ApiOperation({ operationId: 'mobileVerifyApplePurchase' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  verifyApple(
    @Body({ schema: purchaseSchema }) body: PurchaseInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mobile.verify({ ...body, platform: 'ios' }, user);
  }
  @Post('premium/purchases/google/verify')
  @ApiOperation({ operationId: 'mobileVerifyGooglePurchase' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  verifyGoogle(
    @Body({ schema: purchaseSchema }) body: PurchaseInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mobile.verify({ ...body, platform: 'android' }, user);
  }
  @Post('premium/purchases/restore')
  @ApiOperation({ operationId: 'mobileRestorePurchases' })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  restore(
    @Body({ schema: restoreSchema }) body: RestoreInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mobile.restore(body, user);
  }
  @Public()
  @Post('premium/apple/notifications')
  @HttpCode(202)
  @ApiOperation({ operationId: 'mobileAppleStoreNotification' })
  @ApiResponse({
    status: 202,
    schema: { type: 'object', properties: { accepted: { type: 'boolean' } } },
  })
  appleNotification(@Body({ schema: storeNotificationSchema }) body: StoreNotificationInput) {
    return this.mobile.notify('ios', body);
  }
  @Public()
  @Post('premium/google/notifications')
  @HttpCode(202)
  @ApiOperation({ operationId: 'mobileGoogleStoreNotification' })
  @ApiResponse({
    status: 202,
    schema: { type: 'object', properties: { accepted: { type: 'boolean' } } },
  })
  googleNotification(@Body({ schema: storeNotificationSchema }) body: StoreNotificationInput) {
    return this.mobile.notify('android', body);
  }
  @Post('devices')
  @HttpCode(200)
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  registerDevice(
    @Body({ schema: deviceSchema }) body: DeviceInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mobile.registerDevice(user, body);
  }
  @Delete('devices/:device_id')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { deleted: { type: 'boolean' } },
      additionalProperties: true,
    },
  })
  removeDevice(@Param('device_id') deviceId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.mobile.removeDevice(user, deviceId);
  }
  @Get('preferences')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.mobile.getPreferences(user);
  }
  @Patch('preferences')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  updatePreferences(
    @Body({ schema: preferencesSchema }) body: PreferencesInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mobile.updatePreferences(user, body);
  }
  @Post('realtime/ticket')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { ticket: { type: 'string' }, expires_at: { type: 'string' } },
      additionalProperties: true,
    },
  })
  ticket(@CurrentUser() user: AuthenticatedUser) {
    return this.mobile.issueRealtimeTicket(user);
  }
  @Post('market-data/ws-ticket')
  @ApiOperation({ operationId: 'mobileMarketDataWsTicket' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { ticket: { type: 'string' }, expires_at: { type: 'string' } },
      additionalProperties: true,
    },
  })
  wsTicket(@CurrentUser() user: AuthenticatedUser) {
    return this.mobile.issueRealtimeTicket(user);
  }
  @Post('account/deletion')
  @HttpCode(202)
  @ApiResponse({
    status: 202,
    schema: {
      type: 'object',
      properties: { request_id: { type: 'string' }, status: { type: 'string' } },
      additionalProperties: true,
    },
  })
  deletion(@CurrentUser() user: AuthenticatedUser) {
    return this.mobile.requestDeletion(user);
  }
  @Post('account/export')
  @HttpCode(202)
  @ApiResponse({
    status: 202,
    schema: {
      type: 'object',
      properties: { request_id: { type: 'string' }, status: { type: 'string' } },
      additionalProperties: true,
    },
  })
  export(@CurrentUser() user: AuthenticatedUser) {
    return this.mobile.requestExport(user);
  }
}
