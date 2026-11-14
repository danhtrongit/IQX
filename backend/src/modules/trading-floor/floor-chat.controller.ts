/**
 * API Nhắn tin với SACO dưới `api/v2/trading-floor/chat` và công tắc Đang trực dưới
 * `api/v2/trading-floor/saco/duty`. Mọi đường dẫn yêu cầu đăng nhập; quyền trong từng cuộc trò chuyện
 * do service kiểm tra (người ngoài cuộc nhận 404).
 */

import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { FloorChatService } from './floor-chat.service.js';
import {
  FLOOR_CONV_DETAIL_SCHEMA,
  FLOOR_CONV_SUMMARY_SCHEMA,
  FLOOR_INBOX_SCHEMA,
  FLOOR_MATCH_SCHEMA,
  FLOOR_MESSAGE_SCHEMA,
  FLOOR_OK_SCHEMA,
  FLOOR_SACO_SELF_SCHEMA,
  floorChatOpenBodySchema,
  floorChatSendBodySchema,
  floorDutyBodySchema,
  floorIdParamSchema,
  floorInviteAnswerBodySchema,
  floorInviteIdParamSchema,
} from './floor.schemas.js';
import type {
  ChatMessage,
  ConvDetail,
  ConvSummary,
  Inbox,
  SacoSelf,
} from './floor-types.js';
import type { z } from 'zod';

@ApiTags('Khu giao dịch')
@ApiBearerAuth()
@Controller('api/v2/trading-floor')
export class FloorChatController {
  constructor(private readonly chat: FloorChatService) {}

  @Get('chat/inbox')
  @ApiOperation({
    operationId: 'floorChatInbox',
    summary: 'Hộp thư: cuộc chat của tôi với SACO, cuộc chat của tôi nếu tôi là SACO, SACO khớp',
  })
  @ApiOkResponse({ schema: FLOOR_INBOX_SCHEMA })
  inbox(@CurrentUser() user: AuthenticatedUser): Promise<Inbox> {
    return this.chat.inbox(user.id);
  }

  @Post('chat/match')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'floorChatMatch',
    summary:
      'Chat SACO: trả cuộc chat với SACO khớp nếu có, ngược lại bắt đầu tìm (tiến trình qua WebSocket chat:match)',
  })
  @ApiOkResponse({ schema: FLOOR_MATCH_SCHEMA })
  match(@CurrentUser() user: AuthenticatedUser): Promise<{ convId: string } | { running: true }> {
    return this.chat.startMatch(user.id);
  }

  @Post('chat/match/cancel')
  @HttpCode(200)
  @ApiOperation({ operationId: 'floorChatMatchCancel', summary: 'Huỷ lượt tìm SACO đang chạy' })
  @ApiOkResponse({ schema: FLOOR_OK_SCHEMA })
  matchCancel(@CurrentUser() user: AuthenticatedUser): { ok: true } {
    this.chat.cancelMatch(user.id);
    return { ok: true };
  }

  @Post('chat/open')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'floorChatOpen',
    summary: 'Nhắn SACO: mở (hoặc dùng lại) cuộc chat trực tiếp với một SACO',
  })
  @ApiOkResponse({ schema: FLOOR_CONV_SUMMARY_SCHEMA })
  open(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: floorChatOpenBodySchema }) body: z.infer<typeof floorChatOpenBodySchema>,
  ): Promise<ConvSummary> {
    return this.chat.openDirect(user.id, body.sacoId);
  }

  @Get('chat/convs/:id')
  @ApiOperation({
    operationId: 'floorChatConversation',
    summary: 'Một cuộc trò chuyện với tin nhắn gần nhất và mốc đã xem của bên kia',
  })
  @ApiOkResponse({ schema: FLOOR_CONV_DETAIL_SCHEMA })
  conversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: floorIdParamSchema }) id: string,
  ): Promise<ConvDetail> {
    return this.chat.conversation(user.id, id);
  }

  @Post('chat/convs/:id/send')
  @HttpCode(200)
  @ApiOperation({ operationId: 'floorChatSend', summary: 'Gửi một tin nhắn' })
  @ApiOkResponse({ schema: FLOOR_MESSAGE_SCHEMA })
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: floorIdParamSchema }) id: string,
    @Body({ schema: floorChatSendBodySchema }) body: z.infer<typeof floorChatSendBodySchema>,
  ): Promise<ChatMessage> {
    return this.chat.send(user.id, id, body.text);
  }

  @Post('chat/convs/:id/read')
  @HttpCode(200)
  @ApiOperation({ operationId: 'floorChatRead', summary: 'Đánh dấu đã xem cuộc trò chuyện' })
  @ApiOkResponse({ schema: FLOOR_OK_SCHEMA })
  async read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: floorIdParamSchema }) id: string,
  ): Promise<{ ok: true }> {
    await this.chat.markRead(user.id, id);
    return { ok: true };
  }

  @Post('chat/invites/:id')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'floorChatInviteAnswer',
    summary: 'SACO đồng ý hoặc từ chối lời mời Chat SACO (hết hạn thì 410)',
  })
  @ApiOkResponse({ schema: FLOOR_OK_SCHEMA })
  async answerInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: floorInviteIdParamSchema }) id: number,
    @Body({ schema: floorInviteAnswerBodySchema })
    body: z.infer<typeof floorInviteAnswerBodySchema>,
  ): Promise<{ ok: true }> {
    await this.chat.answerInvite(user.id, id, body.accept);
    return { ok: true };
  }

  @Post('saco/duty')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'floorSacoDuty',
    summary: 'SACO bật Đang trực hoặc chuyển sang Vắng',
  })
  @ApiOkResponse({ schema: FLOOR_SACO_SELF_SCHEMA })
  duty(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: floorDutyBodySchema }) body: z.infer<typeof floorDutyBodySchema>,
  ): Promise<SacoSelf> {
    return this.chat.setDuty(user.id, body.on);
  }
}
