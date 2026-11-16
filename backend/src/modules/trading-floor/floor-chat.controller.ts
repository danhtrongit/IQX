/**
 * API Nhắn tin với SACO dưới `api/v2/trading-floor/chat` và công tắc Đang trực dưới
 * `api/v2/trading-floor/saco/duty`. Phía người chat (hộp thư, Chat SACO, Nhắn SACO, đọc, gửi, đã xem)
 * mở cho tài khoản đăng nhập lẫn khách (`x-floor-guest`); phía SACO (trả lời lời mời, công tắc trực)
 * chỉ tài khoản. Quyền trong từng cuộc trò chuyện do service kiểm tra (người ngoài cuộc nhận 404).
 */

import type { MultipartFile } from '@fastify/multipart';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';

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
  FLOOR_START_SCHEMA,
  floorChatOpenBodySchema,
  floorChatSendBodySchema,
  floorDutyBodySchema,
  floorIdParamSchema,
  floorInviteAnswerBodySchema,
  floorInviteIdParamSchema,
  floorMessageIdParamSchema,
} from './floor.schemas.js';
import type {
  ChatMessage,
  ConvDetail,
  ConvSummary,
  Inbox,
  SacoSelf,
  StartResult,
} from './floor-types.js';
import type { z } from 'zod';

type MultipartRequest = FastifyRequest & {
  isMultipart(): boolean;
  file(): Promise<MultipartFile | undefined>;
};

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
  @Post('chat/start')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'floorChatStart',
    summary:
      'Chat SACO nhắn trước: gửi vào cuộc chat đang khớp, hoặc xếp tin chờ và phân phối cho một SACO (kết quả qua WebSocket chat:match)',
  })
  @ApiOkResponse({ schema: FLOOR_START_SCHEMA })
  async start(
    @Req() req: FastifyRequest,
    @Body({ schema: floorChatSendBodySchema }) body: z.infer<typeof floorChatSendBodySchema>,
  ): Promise<StartResult> {
    return this.chat.start(await this.ownerOf(req), body.text);
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
  @Post('chat/convs/:id/images')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'floorChatSendImage',
    summary: 'Gửi một ảnh (JPG, PNG, WebP, tối đa 5 MB, trường file), máy chủ nén lại thành WebP',
  })
  @ApiOkResponse({ schema: FLOOR_MESSAGE_SCHEMA })
  async sendImage(
    @Req() req: MultipartRequest,
    @Param('id', { schema: floorIdParamSchema }) id: string,
  ): Promise<ChatMessage> {
    const owner = await this.ownerOf(req);
    if (!req.isMultipart())
      throw new BadRequestException({
        code: 'MULTIPART_REQUIRED',
        message: 'Content-Type phải là multipart/form-data',
      });
    const file = await req.file();
    if (!file)
      throw new BadRequestException({
        code: 'MULTIPART_FILE_REQUIRED',
        message: 'Yêu cầu một file multipart',
      });
    return this.chat.sendImage(owner, id, file.file);
  }

  @Public()
  @Get('chat/images/:imageId')
  @ApiOperation({
    operationId: 'floorChatImage',
    summary: 'Ảnh trong chat (WebP), phát theo uuid khó đoán; 404 khi tin đã thu hồi',
  })
  @ApiOkResponse({
    description: 'Ảnh WebP',
    content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } },
  })
  async image(
    @Param('imageId', { schema: floorIdParamSchema }) imageId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const file = await this.chat.openImage(imageId);
    reply.header('Content-Type', 'image/webp');
    reply.header('Content-Length', String(file.size));
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    reply.header('X-Content-Type-Options', 'nosniff');
    await reply.send(this.chat.readImage(file.path));
  }

  @Public()
  @Post('chat/convs/:id/messages/:messageId/recall')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'floorChatRecall',
    summary: 'Thu hồi một tin của chính mình (lặp lại không lỗi); hai bên nhận chat:recall',
  })
  @ApiOkResponse({ schema: FLOOR_OK_SCHEMA })
  async recall(
    @Req() req: FastifyRequest,
    @Param('id', { schema: floorIdParamSchema }) id: string,
    @Param('messageId', { schema: floorMessageIdParamSchema }) messageId: number,
  ): Promise<{ ok: true }> {
    await this.chat.recall(await this.ownerOf(req), id, messageId);
    return { ok: true };
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
