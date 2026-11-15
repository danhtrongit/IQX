/**
 * API Nhắn tin với SACO dưới `api/v2/trading-floor/chat` và công tắc Đang trực dưới
 * `api/v2/trading-floor/saco/duty`. Phía người chat (hộp thư, Chat SACO, Nhắn SACO, đọc, gửi, đã xem)
 * mở cho tài khoản đăng nhập lẫn khách (`x-floor-guest`); phía SACO (trả lời lời mời, công tắc trực)
 * chỉ tài khoản. Quyền trong từng cuộc trò chuyện do service kiểm tra (người ngoài cuộc nhận 404).
 */

import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { CurrentUser, Public, type AuthenticatedUser } from '../auth/index.js';
import { FloorActors, ownerIdOf } from './floor-actor.js';
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
  constructor(
    private readonly chat: FloorChatService,
    private readonly actors: FloorActors,
  ) {}

  /** Chủ cuộc chat của người gọi: uuid tài khoản hoặc `g:<uuid khách>`; 401 khi không có danh tính. */
  private async ownerOf(req: FastifyRequest): Promise<string> {
    return ownerIdOf(await this.actors.require(req));
  }

  @Public()
  @Get('chat/inbox')
  @ApiOperation({
    operationId: 'floorChatInbox',
    summary: 'Hộp thư: cuộc chat của tôi với SACO, cuộc chat của tôi nếu tôi là SACO, SACO khớp',
  })
  @ApiOkResponse({ schema: FLOOR_INBOX_SCHEMA })
  async inbox(@Req() req: FastifyRequest): Promise<Inbox> {
    return this.chat.inbox(await this.ownerOf(req));
  }

  @Public()
  @Post('chat/match')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'floorChatMatch',
    summary:
      'Chat SACO: trả cuộc chat với SACO khớp nếu có, ngược lại bắt đầu tìm (tiến trình qua WebSocket chat:match)',
  })
  @ApiOkResponse({ schema: FLOOR_MATCH_SCHEMA })
  async match(@Req() req: FastifyRequest): Promise<{ convId: string } | { running: true }> {
    return this.chat.startMatch(await this.ownerOf(req));
  }

  @Public()
  @Post('chat/match/cancel')
  @HttpCode(200)
  @ApiOperation({ operationId: 'floorChatMatchCancel', summary: 'Huỷ lượt tìm SACO đang chạy' })
  @ApiOkResponse({ schema: FLOOR_OK_SCHEMA })
  async matchCancel(@Req() req: FastifyRequest): Promise<{ ok: true }> {
    this.chat.cancelMatch(await this.ownerOf(req));
    return { ok: true };
  }

  @Public()
  @Post('chat/open')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'floorChatOpen',
    summary: 'Nhắn SACO: mở (hoặc dùng lại) cuộc chat trực tiếp với một SACO',
  })
  @ApiOkResponse({ schema: FLOOR_CONV_SUMMARY_SCHEMA })
  async open(
    @Req() req: FastifyRequest,
    @Body({ schema: floorChatOpenBodySchema }) body: z.infer<typeof floorChatOpenBodySchema>,
  ): Promise<ConvSummary> {
    return this.chat.openDirect(await this.ownerOf(req), body.sacoId);
  }

  @Public()
  @Get('chat/convs/:id')
  @ApiOperation({
    operationId: 'floorChatConversation',
    summary: 'Một cuộc trò chuyện với tin nhắn gần nhất và mốc đã xem của bên kia',
  })
  @ApiOkResponse({ schema: FLOOR_CONV_DETAIL_SCHEMA })
  async conversation(
    @Req() req: FastifyRequest,
    @Param('id', { schema: floorIdParamSchema }) id: string,
  ): Promise<ConvDetail> {
    return this.chat.conversation(await this.ownerOf(req), id);
  }

  @Public()
  @Post('chat/convs/:id/send')
  @HttpCode(200)
  @ApiOperation({ operationId: 'floorChatSend', summary: 'Gửi một tin nhắn' })
  @ApiOkResponse({ schema: FLOOR_MESSAGE_SCHEMA })
  async send(
    @Req() req: FastifyRequest,
    @Param('id', { schema: floorIdParamSchema }) id: string,
    @Body({ schema: floorChatSendBodySchema }) body: z.infer<typeof floorChatSendBodySchema>,
  ): Promise<ChatMessage> {
    return this.chat.send(await this.ownerOf(req), id, body.text);
  }

  @Public()
  @Post('chat/convs/:id/read')
  @HttpCode(200)
  @ApiOperation({ operationId: 'floorChatRead', summary: 'Đánh dấu đã xem cuộc trò chuyện' })
  @ApiOkResponse({ schema: FLOOR_OK_SCHEMA })
  async read(
    @Req() req: FastifyRequest,
    @Param('id', { schema: floorIdParamSchema }) id: string,
  ): Promise<{ ok: true }> {
    await this.chat.markRead(await this.ownerOf(req), id);
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
