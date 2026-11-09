import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { CurrentUser, Public, Roles, RolesGuard } from '../auth/index.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { auditContext } from '../users/audit.js';
import { BulletinSlotsService } from './bulletin-slots.service.js';
import type { SlotNumber } from './bulletin.constants.js';
import {
  archiveQuerySchema,
  bulletinByDateQuerySchema,
  bulletinContentSchema,
  fileQuerySchema,
  previewBodySchema,
  pushSlotBodySchema,
  slotParamSchema,
  tradeDateSchema,
  trackingQuerySchema,
  variantSchema,
  type ArchiveQuery,
  type BulletinByDateQuery,
  type BulletinContentInput,
  type FileQuery,
  type PreviewBody,
  type PushSlotBody,
  type TrackingQuery,
} from './bulletin.schemas.js';
import {
  adminCheckResponseSchema,
  adminDetailResponseSchema,
  adminListResponseSchema,
  adminPreviewResponseSchema,
  archiveResponseSchema,
  bulletinByDateResponseSchema,
  latestBulletinResponseSchema,
  openApi,
  pushContextResponseSchema,
  pushSlotResponseSchema,
  trackingResponseSchema,
} from './bulletin.responses.js';
import { BulletinPublicService } from './bulletins-public.service.js';
import { MarketBulletinsService } from './bulletins.service.js';

const revisionParamSchema = z.coerce.number().int().min(1).max(10_000);

/** Phần công khai của bản tin và Theo dõi (spec §5, §6): miễn phí, không cần đăng nhập. */
@ApiTags('Market bulletins')
@Controller('api/v2/market')
export class MarketBulletinsPublicController {
  constructor(
    private readonly publicBulletins: BulletinPublicService,
    private readonly slots: BulletinSlotsService,
  ) {}

  @Public()
  @Get('bulletins/latest')
  @ApiOperation({ operationId: 'getLatestMarketBulletin', summary: 'Bản tin Public mới nhất' })
  @ApiOkResponse({ schema: openApi(latestBulletinResponseSchema) })
  latest() {
    return this.publicBulletins.latest();
  }

  @Public()
  @Get('bulletins/archive')
  @ApiOperation({ operationId: 'listMarketBulletinArchive', summary: 'Bản tin cũ trong 6 tháng' })
  @ApiOkResponse({ schema: openApi(archiveResponseSchema) })
  archive(@Query({ schema: archiveQuerySchema }) query: ArchiveQuery) {
    return this.publicBulletins.archive(query.page);
  }

  @Public()
  @Get('bulletins')
  @ApiOperation({ operationId: 'getMarketBulletinByDate', summary: 'Bản tin Public của một phiên' })
  @ApiOkResponse({ schema: openApi(bulletinByDateResponseSchema) })
  byDate(@Query({ schema: bulletinByDateQuerySchema }) query: BulletinByDateQuery) {
    return query.date ? this.publicBulletins.byDate(query.date) : this.publicBulletins.latest();
  }

  @Public()
  @Get('bulletins/:date/files/:variant/:revision')
  @ApiOperation({
    operationId: 'downloadMarketBulletinFile',
    summary: 'File PDF của bản tin (cache theo revision)',
  })
  @ApiOkResponse({
    description: 'File PDF của bản tin',
    content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
  })
  async file(
    @Param('date', { schema: tradeDateSchema }) date: string,
    @Param('variant', { schema: variantSchema }) variant: 'desktop' | 'mobile',
    @Param('revision', { schema: revisionParamSchema }) revision: number,
    @Query({ schema: fileQuerySchema }) query: FileQuery,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const file = await this.publicBulletins.file(date, variant, revision);
    await reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Length', String(file.content.byteLength))
      .header(
        'Content-Disposition',
        `${query.download === '1' ? 'attachment' : 'inline'}; filename="${file.file_name}"`,
      )
      // Đường dẫn đổi mỗi lần Public lại nên file không đổi theo URL; ngắn hơn một ngày vì bản bị gỡ phải biến mất sớm.
      .header('Cache-Control', 'public, max-age=3600')
      .header('X-Content-Type-Options', 'nosniff')
      .send(file.content);
  }

  @Public()
  @Get('tracking')
  @ApiOperation({ operationId: 'getMarketTracking', summary: 'Mã đang theo dõi và ba số tổng' })
  @ApiOkResponse({ schema: openApi(trackingResponseSchema) })
  tracking(@Query({ schema: trackingQuerySchema }) query: TrackingQuery) {
    return this.publicBulletins.trackingView((query.slot ?? null) as SlotNumber | null);
  }

  /** Nút "Đẩy vào bản tin" của Bộ lọc: chỉ quản trị viên, server kiểm §4.2 và §6. */
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @Post('bulletins/:date/slots/:slot')
  @ApiOperation({
    operationId: 'pushMarketBulletinSlot',
    summary: 'Đẩy kết quả Bộ lọc vào ô của bản tin',
  })
  @ApiOkResponse({ schema: openApi(pushSlotResponseSchema) })
  push(
    @CurrentUser() user: AuthenticatedUser,
    @Param('date', { schema: tradeDateSchema }) date: string,
    @Param('slot', { schema: slotParamSchema }) slot: number,
    @Body({ schema: pushSlotBodySchema }) body: PushSlotBody,
    @Req() request: FastifyRequest,
  ) {
    return this.slots.push(user, date, slot as SlotNumber, body, auditContext(user, request));
  }
}

/** Quản trị › NỘI DUNG › Bản tin cuối phiên (spec §3): mọi API kiểm quyền quản trị ở server. */
@ApiTags('Market bulletins admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('admin')
@Controller('api/v2/admin/market-bulletins')
export class MarketBulletinsAdminController {
  constructor(private readonly bulletins: MarketBulletinsService) {}

  @Get()
  @ApiOperation({ operationId: 'listAdminMarketBulletins', summary: 'Danh sách bản tin (6 tháng)' })
  @ApiOkResponse({ schema: openApi(adminListResponseSchema) })
  list() {
    return this.bulletins.list();
  }

  @Get('push-context')
  @ApiOperation({
    operationId: 'getMarketBulletinPushContext',
    summary: 'Bản tin đang chờ đẩy mã từ Bộ lọc',
  })
  @ApiOkResponse({ schema: openApi(pushContextResponseSchema) })
  pushContext() {
    return this.bulletins.pushContext();
  }

  @Get(':date')
  @ApiOperation({ operationId: 'getAdminMarketBulletin', summary: 'Mở bản tin để soạn' })
  @ApiOkResponse({ schema: openApi(adminDetailResponseSchema) })
  detail(@Param('date', { schema: tradeDateSchema }) date: string) {
    return this.bulletins.detail(date);
  }

  @Put(':date/content')
  @ApiOperation({
    operationId: 'saveAdminMarketBulletinContent',
    summary: 'Lưu nhận định và mức hỗ trợ/kháng cự',
  })
  @ApiOkResponse({ schema: openApi(adminDetailResponseSchema) })
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('date', { schema: tradeDateSchema }) date: string,
    @Body({ schema: bulletinContentSchema }) body: BulletinContentInput,
  ) {
    return this.bulletins.saveContent(user, date, body);
  }

  @Post(':date/check')
  @ApiOperation({ operationId: 'checkAdminMarketBulletin', summary: 'Chạy lại kiểm tra' })
  @ApiOkResponse({ schema: openApi(adminCheckResponseSchema) })
  async check(@Param('date', { schema: tradeDateSchema }) date: string) {
    return { checks: (await this.bulletins.detail(date)).checks };
  }

  @Post(':date/preview')
  @ApiOperation({
    operationId: 'previewAdminMarketBulletin',
    summary: 'Xem trước các trang (SVG) của một bản',
  })
  @ApiOkResponse({ schema: openApi(adminPreviewResponseSchema) })
  preview(
    @Param('date', { schema: tradeDateSchema }) date: string,
    @Body({ schema: previewBodySchema }) body: PreviewBody,
  ) {
    return this.bulletins.preview(date, body.variant, body.content);
  }

  @Post(':date/publish')
  @ApiOperation({
    operationId: 'publishAdminMarketBulletin',
    summary: 'Public hoặc Public lại bản đã sửa',
  })
  @ApiOkResponse({ schema: openApi(adminDetailResponseSchema) })
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('date', { schema: tradeDateSchema }) date: string,
    @Req() request: FastifyRequest,
  ) {
    return this.bulletins.publish(user, date, auditContext(user, request));
  }

  @Post(':date/unpublish')
  @ApiOperation({ operationId: 'unpublishAdminMarketBulletin', summary: 'Gỡ bản tin khỏi web' })
  @ApiOkResponse({ schema: openApi(adminDetailResponseSchema) })
  unpublish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('date', { schema: tradeDateSchema }) date: string,
    @Req() request: FastifyRequest,
  ) {
    return this.bulletins.unpublish(user, date, auditContext(user, request));
  }
}
