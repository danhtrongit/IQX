/**
 * Collaboration, Staff Profile, Meeting Room, and Document Library endpoints for Khu Văn phòng.
 */
import type { MultipartFile } from '@fastify/multipart';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { CurrentUser, Public, type AuthenticatedUser } from '../auth/index.js';
import {
  OFFICE_DOCUMENTS_LIST_SCHEMA,
  OFFICE_DOCUMENT_SCHEMA,
  OFFICE_MEETINGS_LIST_SCHEMA,
  OFFICE_MEETING_SCHEMA,
  OFFICE_MEMBERS_LIST_SCHEMA,
  OFFICE_MEMBER_NOTES_LIST_SCHEMA,
  OFFICE_MEMBER_NOTE_SCHEMA,
  OFFICE_MEMBER_PROFILE_SCHEMA,
  OFFICE_OK_SCHEMA,
  OFFICE_PROPOSALS_LIST_SCHEMA,
  OFFICE_PROPOSAL_SCHEMA,
  OFFICE_STICKY_NOTES_LIST_SCHEMA,
  OFFICE_STICKY_NOTE_SCHEMA,
  createMeetingBodySchema,
  createMemberNoteBodySchema,
  createProposalBodySchema,
  createStickyNoteBodySchema,
  officeDownloadQuerySchema,
  officeMembersQuerySchema,
  officeUuidParamSchema,
  replyProposalBodySchema,
  updateMeetingBodySchema,
  updateMemberProfileBodySchema,
  updateStickyNoteBodySchema,
  type CreateMeetingBody,
  type CreateMemberNoteBody,
  type CreateProposalBody,
  type CreateStickyNoteBody,
  type OfficeDownloadQuery,
  type OfficeMembersQuery,
  type ReplyProposalBody,
  type UpdateMeetingBody,
  type UpdateMemberProfileBody,
  type UpdateStickyNoteBody,
} from './office.schemas.js';
import { OfficeAccessService } from './services/office-access.service.js';
import { OfficeCollabService } from './services/office-collab.service.js';
import { OfficeRoomsService } from './services/office-rooms.service.js';

type MultipartRequest = FastifyRequest & {
  isMultipart(): boolean;
  file(): Promise<MultipartFile | undefined>;
};

function extractMultipartStringField(file: MultipartFile, name: string): string | undefined {
  const field = file.fields?.[name];
  if (!field || Array.isArray(field)) return undefined;
  if ('value' in field && typeof field.value === 'string') return field.value;
  return undefined;
}

function asciiFallbackFilename(name: string): string {
  const cleaned = name
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_')
    .trim();
  return cleaned || 'document';
}

@ApiTags('Văn phòng')
@ApiBearerAuth()
@Controller('api/v2/office')
export class OfficeWorkspaceController {
  constructor(
    private readonly access: OfficeAccessService,
    private readonly collab: OfficeCollabService,
    private readonly rooms: OfficeRoomsService,
  ) {}

  // ───────────── Proposals (static `proposals/team` BEFORE `:id`) ─────────────

  @Get('proposals/team')
  @ApiOperation({
    operationId: 'officeListTeamProposals',
    summary: 'Sếp xem toàn bộ đề xuất của nhóm (mới nhất ở trên)',
  })
  @ApiOkResponse({ schema: OFFICE_PROPOSALS_LIST_SCHEMA })
  listTeamProposals(@CurrentUser() user: AuthenticatedUser) {
    return this.collab.listTeamProposals(user);
  }

  @Get('proposals')
  @ApiOperation({
    operationId: 'officeListMyProposals',
    summary: 'Nhân viên xem lịch sử đề xuất đã gửi của mình',
  })
  @ApiOkResponse({ schema: OFFICE_PROPOSALS_LIST_SCHEMA })
  listMyProposals(@CurrentUser() user: AuthenticatedUser) {
    return this.collab.listMyProposals(user);
  }

  @Post('proposals')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'officeCreateProposal',
    summary: 'Nhân viên gửi đề xuất mới cho sếp (không sửa/xoá sau khi gửi)',
  })
  @ApiOkResponse({ schema: OFFICE_PROPOSAL_SCHEMA })
  createProposal(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: createProposalBodySchema }) body: CreateProposalBody,
  ) {
    return this.collab.createProposal(user, body);
  }

  @Post('proposals/:id/seen')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'officeMarkProposalSeen',
    summary: 'Sếp đánh dấu đề xuất đã xem',
  })
  @ApiOkResponse({ schema: OFFICE_PROPOSAL_SCHEMA })
  markProposalSeen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: officeUuidParamSchema }) id: string,
  ) {
    return this.collab.markProposalSeen(user, id);
  }

  @Post('proposals/:id/reply')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'officeReplyProposal',
    summary: 'Sếp trả lời đề xuất (chỉ trả lời một lần)',
  })
  @ApiOkResponse({ schema: OFFICE_PROPOSAL_SCHEMA })
  replyProposal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: officeUuidParamSchema }) id: string,
    @Body({ schema: replyProposalBodySchema }) body: ReplyProposalBody,
  ) {
    return this.collab.replyProposal(user, id, body);
  }

  // ───────────── Sticky Notes (Staff private only; 403 for Boss) ─────────────

  @Get('notes')
  @ApiOperation({
    operationId: 'officeListStickyNotes',
    summary: 'Danh sách ghi chú giấy dán riêng tư của nhân viên',
  })
  @ApiOkResponse({ schema: OFFICE_STICKY_NOTES_LIST_SCHEMA })
  listStickyNotes(@CurrentUser() user: AuthenticatedUser) {
    return this.collab.listStickyNotes(user);
  }

  @Post('notes')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'officeCreateStickyNote',
    summary: 'Tạo ghi chú giấy dán mới (tối đa 50 tờ, 300 ký tự)',
  })
  @ApiOkResponse({ schema: OFFICE_STICKY_NOTE_SCHEMA })
  createStickyNote(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: createStickyNoteBodySchema }) body: CreateStickyNoteBody,
  ) {
    return this.collab.createStickyNote(user, body);
  }

  @Patch('notes/:id')
  @ApiOperation({
    operationId: 'officeUpdateStickyNote',
    summary: 'Cập nhật nội dung hoặc màu sắc của ghi chú giấy dán',
  })
  @ApiOkResponse({ schema: OFFICE_STICKY_NOTE_SCHEMA })
  updateStickyNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: officeUuidParamSchema }) id: string,
    @Body({ schema: updateStickyNoteBodySchema }) body: UpdateStickyNoteBody,
  ) {
    return this.collab.updateStickyNote(user, id, body);
  }

  @Delete('notes/:id')
  @ApiOperation({
    operationId: 'officeDeleteStickyNote',
    summary: 'Xoá một ghi chú giấy dán riêng tư',
  })
  @ApiOkResponse({ schema: OFFICE_OK_SCHEMA })
  deleteStickyNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: officeUuidParamSchema }) id: string,
  ) {
    return this.collab.deleteStickyNote(user, id);
  }

  // ───────────── Staff Profiles & Boss Private Notes (Boss only; 403 for Staff) ─────────────

  @Get('members')
  @ApiOperation({
    operationId: 'officeListMembers',
    summary: 'Sếp xem danh sách nhân viên trong nhóm (hỗ trợ tìm không dấu)',
  })
  @ApiOkResponse({ schema: OFFICE_MEMBERS_LIST_SCHEMA })
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: officeMembersQuerySchema }) query: OfficeMembersQuery,
  ) {
    return this.collab.listMembers(user, query);
  }

  @Get('members/:userId')
  @ApiOperation({
    operationId: 'officeGetMemberProfile',
    summary: 'Sếp xem hồ sơ chi tiết nhân viên, thâm niên, thống kê tháng và ghi chú riêng',
  })
  @ApiOkResponse({ schema: OFFICE_MEMBER_PROFILE_SCHEMA })
  getMemberProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', { schema: officeUuidParamSchema }) userId: string,
  ) {
    return this.collab.getMemberProfile(user, userId);
  }

  @Patch('members/:userId')
  @ApiOperation({
    operationId: 'officeUpdateMemberProfile',
    summary: 'Sếp cập nhật ngày vào làm của nhân viên (không được sau hôm nay)',
  })
  @ApiOkResponse({ schema: OFFICE_MEMBER_PROFILE_SCHEMA })
  updateMemberProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', { schema: officeUuidParamSchema }) userId: string,
    @Body({ schema: updateMemberProfileBodySchema }) body: UpdateMemberProfileBody,
  ) {
    return this.collab.updateMemberProfile(user, userId, body);
  }

  @Get('members/:userId/notes')
  @ApiOperation({
    operationId: 'officeListMemberNotes',
    summary: 'Sếp xem danh sách ghi chú riêng về một nhân viên',
  })
  @ApiOkResponse({ schema: OFFICE_MEMBER_NOTES_LIST_SCHEMA })
  listMemberNotes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', { schema: officeUuidParamSchema }) userId: string,
  ) {
    return this.collab.listMemberNotes(user, userId);
  }

  @Post('members/:userId/notes')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'officeCreateMemberNote',
    summary: 'Sếp thêm ghi chú riêng về nhân viên (tối đa 1.000 ký tự)',
  })
  @ApiOkResponse({ schema: OFFICE_MEMBER_NOTE_SCHEMA })
  createMemberNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', { schema: officeUuidParamSchema }) userId: string,
    @Body({ schema: createMemberNoteBodySchema }) body: CreateMemberNoteBody,
  ) {
    return this.collab.createMemberNote(user, userId, body);
  }

  @Delete('members/:userId/notes/:noteId')
  @ApiOperation({
    operationId: 'officeDeleteMemberNote',
    summary: 'Sếp xoá ghi chú riêng về nhân viên',
  })
  @ApiOkResponse({ schema: OFFICE_OK_SCHEMA })
  deleteMemberNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', { schema: officeUuidParamSchema }) userId: string,
    @Param('noteId', { schema: officeUuidParamSchema }) noteId: string,
  ) {
    return this.collab.deleteMemberNote(user, userId, noteId);
  }

  // ───────────── Meeting Room ─────────────

  @Get('meetings')
  @ApiOperation({
    operationId: 'officeListMeetings',
    summary: 'Lịch họp hôm nay, lịch họp tiếp theo và cuộc họp hiện trên màn hình phòng họp',
  })
  @ApiOkResponse({ schema: OFFICE_MEETINGS_LIST_SCHEMA })
  listMeetings(@CurrentUser() user: AuthenticatedUser) {
    return this.rooms.listMeetings(user);
  }

  @Post('meetings')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'officeCreateMeeting',
    summary: 'Sếp tạo lịch cuộc họp mới',
  })
  @ApiOkResponse({ schema: OFFICE_MEETING_SCHEMA })
  createMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: createMeetingBodySchema }) body: CreateMeetingBody,
  ) {
    return this.rooms.createMeeting(user, body);
  }

  @Patch('meetings/:id')
  @ApiOperation({
    operationId: 'officeUpdateMeeting',
    summary: 'Sếp cập nhật thông tin cuộc họp',
  })
  @ApiOkResponse({ schema: OFFICE_MEETING_SCHEMA })
  updateMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: officeUuidParamSchema }) id: string,
    @Body({ schema: updateMeetingBodySchema }) body: UpdateMeetingBody,
  ) {
    return this.rooms.updateMeeting(user, id, body);
  }

  @Delete('meetings/:id')
  @ApiOperation({
    operationId: 'officeDeleteMeeting',
    summary: 'Sếp xoá cuộc họp',
  })
  @ApiOkResponse({ schema: OFFICE_OK_SCHEMA })
  deleteMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: officeUuidParamSchema }) id: string,
  ) {
    return this.rooms.deleteMeeting(user, id);
  }

  // ───────────── Document Library ─────────────

  @Get('documents')
  @ApiOperation({
    operationId: 'officeListDocuments',
    summary: 'Danh sách tài liệu của nhóm kèm liên kết tải về có thời hạn (300 giây)',
  })
  @ApiOkResponse({ schema: OFFICE_DOCUMENTS_LIST_SCHEMA })
  listDocuments(@CurrentUser() user: AuthenticatedUser) {
    return this.rooms.listDocuments(user);
  }

  @Post('documents')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string', maxLength: 160 },
      },
    },
  })
  @ApiOperation({
    operationId: 'officeUploadDocument',
    summary: 'Sếp tải lên tài liệu nhóm (PDF, DOCX, XLSX, PPTX, PNG, JPG; tối đa 20 MB)',
  })
  @ApiOkResponse({ schema: OFFICE_DOCUMENT_SCHEMA })
  async uploadDocument(@CurrentUser() user: AuthenticatedUser, @Req() req: MultipartRequest) {
    const ctx = await this.access.requireBoss(user);
    if (!req.isMultipart()) {
      throw new BadRequestException({
        code: 'MULTIPART_REQUIRED',
        message: 'Content-Type phải là multipart/form-data',
      });
    }
    const part = await req.file();
    if (!part) {
      throw new BadRequestException({
        code: 'MULTIPART_FILE_REQUIRED',
        message: 'Yêu cầu một tệp multipart (trường file)',
      });
    }
    const title = extractMultipartStringField(part, 'title');
    return this.rooms.uploadDocument(
      user,
      {
        stream: part.file,
        fileName: part.filename,
        title,
      },
      ctx,
    );
  }

  @Public()
  @Get('documents/:id/download')
  @ApiOperation({
    operationId: 'officeDownloadDocument',
    summary: 'Tải về tài liệu văn phòng bằng liên kết ký HMAC có thời hạn theo nhóm',
  })
  @ApiOkResponse({
    description: 'Nội dung tệp tài liệu văn phòng',
    content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
  })
  async downloadDocument(
    @Param('id', { schema: officeUuidParamSchema }) id: string,
    @Query({ schema: officeDownloadQuerySchema }) query: OfficeDownloadQuery,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const file = await this.rooms.resolveDownload(id, query.token);
    const asciiName = asciiFallbackFilename(file.fileName);
    const encodedName = encodeURIComponent(file.fileName);
    reply.header('Content-Type', file.mimeType);
    reply.header('Content-Length', String(file.size));
    reply.header(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
    );
    reply.header('Cache-Control', 'private, max-age=60');
    reply.header('X-Content-Type-Options', 'nosniff');
    await reply.send(this.rooms.openReadStream(file.path));
  }

  @Delete('documents/:id')
  @ApiOperation({
    operationId: 'officeDeleteDocument',
    summary: 'Sếp xoá tài liệu khỏi Phòng tài liệu',
  })
  @ApiOkResponse({ schema: OFFICE_OK_SCHEMA })
  deleteDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: officeUuidParamSchema }) id: string,
  ) {
    return this.rooms.deleteDocument(user, id);
  }
}
