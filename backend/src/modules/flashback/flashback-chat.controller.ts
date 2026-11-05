/**
 * API chat phòng Flashback (spec v2.4 §3.6): `rooms/:code/chat` cho người trong phòng và
 * `admin/flashback/chat` cho từ cấm và báo cáo (§3.5). Mọi đường dẫn yêu cầu đăng nhập.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { CurrentUser, Roles, RolesGuard, type AuthenticatedUser } from '../auth/index.js';
import { auditContext } from '../users/audit.js';
import { FB_CHAT_BANNED_MAX } from './flashback-chat.logic.js';
import { FlashbackChatService } from './flashback-chat.service.js';
import { fbRoomCodeParamSchema } from './flashback-rooms.controller.js';

const openapi = (schema: z.ZodType): SchemaObject =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/** Độ dài thật (200 ký tự) do service kiểm tra để trả đúng mã lỗi; ở đây chỉ chặn thân quá lớn. */
export const fbChatSendBodySchema = z.strictObject({ text: z.string().max(2000) });
export const fbChatMuteBodySchema = z.strictObject({
  user_id: z.string().uuid(),
  muted: z.boolean(),
});
export const fbChatReportBodySchema = z.strictObject({ message_id: z.string().uuid() });
export const fbChatBannedBodySchema = z.strictObject({
  words: z.array(z.string().max(200)).max(FB_CHAT_BANNED_MAX),
});
export const fbChatReportsQuerySchema = z.object({
  status: z.enum(['open', 'resolved', 'dismissed']).default('open'),
});
export const fbChatReportIdParamSchema = z.string().uuid();
export const fbChatDecideBodySchema = z.strictObject({ status: z.enum(['resolved', 'dismissed']) });

const messageSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  is_me: z.boolean(),
  waiting: z.boolean(),
  phien: z.number(),
  text: z.string(),
  created_at: z.string(),
});
const mutedSchema = z.object({ user_id: z.string(), name: z.string() });
const chatSchema = z.object({
  enabled: z.boolean(),
  messages: z.array(messageSchema),
  muted: z.array(mutedSchema),
});
const reportSchema = z.object({
  id: z.string(),
  room_code: z.string(),
  reporter_name: z.string(),
  reported_user_id: z.string(),
  reported_name: z.string(),
  text: z.string(),
  phien: z.number(),
  message_at: z.string(),
  context: z.array(
    z.object({
      name: z.string(),
      phien: z.number(),
      waiting: z.boolean(),
      text: z.string(),
      at: z.string(),
    }),
  ),
  status: z.enum(['open', 'resolved', 'dismissed']),
  created_at: z.string(),
  decided_at: z.string().nullable(),
});

@ApiTags('Flashback Rooms')
@Controller('api/v2/flashback/rooms/:code/chat')
export class FlashbackChatController {
  constructor(private readonly chat: FlashbackChatService) {}

  @Get()
  @ApiOperation({
    operationId: 'flashbackChatList',
    summary: 'Các tin đã tới lượt người đọc (tin của phiên sau không được trả về)',
  })
  @ApiOkResponse({ schema: openapi(chatSchema) })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code', { schema: fbRoomCodeParamSchema }) code: string,
  ) {
    return this.chat.list(user.id, code);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    operationId: 'flashbackChatSend',
    summary: 'Gửi tin vào chat phòng; server tự gắn phiên của người gửi',
  })
  @ApiOkResponse({ schema: openapi(messageSchema) })
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code', { schema: fbRoomCodeParamSchema }) code: string,
    @Body({ schema: fbChatSendBodySchema }) body: z.infer<typeof fbChatSendBodySchema>,
  ) {
    return this.chat.send(user.id, code, body.text);
  }

  @Post('mute')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'flashbackChatMute',
    summary: 'Tắt tiếng hoặc bỏ tắt tiếng một người trong phòng này',
  })
  @ApiOkResponse({ schema: openapi(z.object({ muted: z.array(mutedSchema) })) })
  async mute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code', { schema: fbRoomCodeParamSchema }) code: string,
    @Body({ schema: fbChatMuteBodySchema }) body: z.infer<typeof fbChatMuteBodySchema>,
  ) {
    return this.chat.setMuted(user.id, code, body.user_id, body.muted);
  }

  @Post('report')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'flashbackChatReport',
    summary: 'Báo cáo một tin nhắn cho quản trị',
  })
  @ApiOkResponse({ schema: openapi(z.object({ reported: z.literal(true) })) })
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code', { schema: fbRoomCodeParamSchema }) code: string,
    @Body({ schema: fbChatReportBodySchema }) body: z.infer<typeof fbChatReportBodySchema>,
  ) {
    return this.chat.report(user.id, code, body.message_id);
  }
}

@ApiTags('Flashback Admin')
@Controller('api/v2/admin/flashback/chat')
@UseGuards(RolesGuard)
@Roles('admin')
export class FlashbackChatAdminController {
  constructor(private readonly chat: FlashbackChatService) {}

  @Get('banned-words')
  @ApiOperation({
    operationId: 'flashbackAdminChatBannedWords',
    summary: 'Danh sách từ cấm của chat',
  })
  @ApiOkResponse({ schema: openapi(z.object({ words: z.array(z.string()) })) })
  async bannedWords() {
    return this.chat.bannedWords();
  }

  @Put('banned-words')
  @ApiOperation({
    operationId: 'flashbackAdminChatBannedWordsReplace',
    summary: 'Thay danh sách từ cấm của chat',
  })
  @ApiOkResponse({ schema: openapi(z.object({ words: z.array(z.string()) })) })
  async replaceBannedWords(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Body({ schema: fbChatBannedBodySchema }) body: z.infer<typeof fbChatBannedBodySchema>,
  ) {
    return this.chat.replaceBannedWords(body.words, auditContext(user, request));
  }

  @Get('reports')
  @ApiOperation({ operationId: 'flashbackAdminChatReports', summary: 'Báo cáo tin nhắn chat' })
  @ApiOkResponse({ schema: openapi(z.object({ reports: z.array(reportSchema) })) })
  async reports(
    @Query({ schema: fbChatReportsQuerySchema }) query: z.infer<typeof fbChatReportsQuerySchema>,
  ) {
    return this.chat.reports(query.status);
  }

  @Post('reports/:id/decide')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'flashbackAdminChatReportDecide',
    summary: 'Đánh dấu báo cáo là đã xử lý hoặc bỏ qua',
  })
  @ApiOkResponse({
    schema: openapi(z.object({ id: z.string(), status: z.enum(['resolved', 'dismissed']) })),
  })
  async decide(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: fbChatReportIdParamSchema }) id: string,
    @Body({ schema: fbChatDecideBodySchema }) body: z.infer<typeof fbChatDecideBodySchema>,
  ) {
    return this.chat.decideReport(id, body.status, auditContext(user, request));
  }
}
