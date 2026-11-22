/**
 * API thông báo (update 22-11 §8.5, PLAN §6.3). Cài đặt và hộp tin theo tài khoản; link tắt
 * thông báo trong email là POST công khai (trang `/thong-bao/tat` gọi), không cần đăng nhập.
 */
import { Body, Controller, Get, HttpCode, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import { LookupThrottle } from '../../platform/rate-limit/lookup-throttle.decorator.js';
import { ApiAuthGuard, CurrentUser, Public, type AuthenticatedUser } from '../auth/index.js';
import {
  markReadInputSchema,
  notificationListQuerySchema,
  notificationListSchema,
  notificationSettingsInputSchema,
  notificationSettingsSchema,
  unreadCountSchema,
  unsubscribeInputSchema,
  unsubscribeResultSchema,
  type MarkReadInput,
  type NotificationListQuery,
  type NotificationSettingsInput,
  type UnsubscribeInput,
} from './user-notifications.schemas.js';
import { UserNotificationsService } from './user-notifications.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

@ApiTags('Thông báo')
@UseGuards(ApiAuthGuard)
@Controller('api/v2/me')
export class UserNotificationsController {
  constructor(private readonly notifications: UserNotificationsService) {}

  @Get('notification-settings')
  @ApiOperation({
    operationId: 'notificationSettings',
    summary:
      'Notification settings of the account (master, Bản tin cuối phiên, Bot giao dịch, email channel); defaults when never saved',
  })
  @ApiOkResponse({ schema: openApi(notificationSettingsSchema) })
  settings(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.settings(user.id);
  }

  @Put('notification-settings')
  @ApiOperation({
    operationId: 'notificationSaveSettings',
    summary:
      'Save notification settings (applies immediately); email on without a verified email → 422 EMAIL_UNVERIFIED',
  })
  @ApiOkResponse({ schema: openApi(notificationSettingsSchema) })
  saveSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: notificationSettingsInputSchema }) body: NotificationSettingsInput,
  ) {
    return this.notifications.saveSettings(user.id, body);
  }

  @Get('notifications')
  @ApiOperation({
    operationId: 'notificationList',
    summary: 'Latest notifications of the account (max 50, newest first) and the unread count',
  })
  @ApiOkResponse({ schema: openApi(notificationListSchema) })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: notificationListQuerySchema }) query: NotificationListQuery,
  ) {
    return this.notifications.list(user.id, query.limit);
  }

  @Get('notifications/unread-count')
  @ApiOperation({ operationId: 'notificationUnreadCount', summary: 'Unread notification count' })
  @ApiOkResponse({ schema: openApi(unreadCountSchema) })
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return { unread_count: await this.notifications.unreadCount(user.id) };
  }

  @Post('notifications/read')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'notificationMarkRead',
    summary: 'Mark one notification ({id}) or all ({all:true}) as read',
  })
  @ApiOkResponse({ schema: openApi(unreadCountSchema) })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: markReadInputSchema }) body: MarkReadInput,
  ) {
    return this.notifications.markRead(user.id, body);
  }
}

@ApiTags('Thông báo')
@Public()
@Controller('api/v2/notifications')
export class NotificationUnsubscribeController {
  constructor(private readonly notifications: UserNotificationsService) {}

  @Post('unsubscribe')
  @HttpCode(200)
  @LookupThrottle()
  @ApiOperation({
    operationId: 'notificationUnsubscribe',
    summary:
      'Turn off one notification type from the signed single-use email token; reusing it → already_used; bad token → 400 TOKEN_INVALID',
  })
  @ApiOkResponse({ schema: openApi(unsubscribeResultSchema) })
  unsubscribe(@Body({ schema: unsubscribeInputSchema }) body: UnsubscribeInput) {
    return this.notifications.unsubscribe(body.token);
  }
}
