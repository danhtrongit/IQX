/**
 * API của Flashback (spec v1.1 §3.2 và spec v1.2 §7).
 *
 * Phía người chơi: `api/v2/flashback`. Phía quản trị: `api/v2/admin/flashback` (chỉ vai trò admin).
 * Mọi đường dẫn đều yêu cầu đăng nhập (guard toàn cục của API).
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
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { CurrentUser, Roles, RolesGuard, type AuthenticatedUser } from '../auth/index.js';
import { auditContext } from '../users/audit.js';
import { FlashbackAdminService } from './flashback-admin.service.js';
import { FlashbackService } from './flashback.service.js';

const openapi = (schema: z.ZodType): SchemaObject =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/** Thân đặt lệnh: phía mua/bán và số lượng. */
export const flashbackOrderBodySchema = z.strictObject({
  side: z.enum(['buy', 'sell']),
  qty: z.number().int().min(1).max(1_000_000_000),
  idempotency_key: z.string().min(1).max(128).optional(),
});
export type FlashbackOrderBody = z.infer<typeof flashbackOrderBodySchema>;

/** Thân lưu tham số chỉ báo. */
export const flashbackIndicatorsBodySchema = z.strictObject({
  indicators: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(64),
        params: z.record(
          z.string().min(1).max(64),
          z.union([z.number(), z.strictObject({ lower: z.number(), upper: z.number() })]),
        ),
      }),
    )
    .max(16),
});
export type FlashbackIndicatorsBody = z.infer<typeof flashbackIndicatorsBodySchema>;

/** Truy vấn bảng xếp hạng. */
export const flashbackLeaderboardQuerySchema = z.object({
  scope: z.enum(['all', 'team']).default('all'),
});

/** Thân tạm dừng Flashback. */
export const flashbackPauseBodySchema = z.strictObject({
  paused: z.boolean(),
});

/** Định danh lượt chơi. */
export const flashbackEntryParamSchema = z.object({ id: z.uuid() });

const barSchema = z.object({
  session: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

const currentResponseSchema = z.object({
  round_id: z.string(),
  round_no: z.number(),
  closes_at: z.string(),
  player_count: z.number(),
  fee_xu: z.number(),
  first_join_free: z.boolean(),
  reward_table: z.array(
    z.object({ from_rank: z.number(), to_rank: z.number().nullable(), xu: z.number() }),
  ),
  joined: z.boolean(),
  my_entry: z.looseObject({}).nullable(),
  bars: z.array(barSchema),
  played_bars: z.array(barSchema),
  warmup_bars: z.array(barSchema).optional(),
  history_sessions: z.number(),
  play_sessions: z.number(),
  total_sessions: z.number(),
});

const joinResponseSchema = z.object({
  entry_id: z.string(),
  round_id: z.string(),
  first_join: z.boolean(),
  fee_xu: z.number(),
  cash: z.string(),
  joined_at: z.string(),
});

const nextResponseSchema = z.object({
  entry_id: z.string(),
  step: z.number(),
  bar: barSchema,
  cash: z.string(),
  holdings: z.number(),
  pnl_pct: z.number(),
  pnl_percent: z.number(),
  max_drawdown: z.number(),
});

const orderResponseSchema = z.object({
  order: z.looseObject({}),
  cash: z.string(),
  holdings: z.number(),
  total_assets: z.string(),
  pnl_pct: z.number(),
  pnl_percent: z.number(),
  max_drawdown: z.number(),
});

const finishResponseSchema = z.object({
  entry_id: z.string(),
  final_nav: z.string(),
  pnl_pct: z.number(),
  pnl_percent: z.number(),
  max_drawdown: z.number(),
  max_drawdown_percent: z.number(),
  rank: z.number().nullable(),
  reward_xu: z.number(),
  status: z.literal('finished'),
});

const leaderboardResponseSchema = z.object({
  scope: z.enum(['all', 'team']),
  rows: z.array(z.looseObject({})),
  me: z.looseObject({}).nullable(),
  total_players: z.number(),
});

const indicatorsResponseSchema = z.object({
  indicators: z.array(z.looseObject({})),
});

const saveIndicatorsResponseSchema = z.object({
  entry_id: z.string(),
  indicators: z.array(z.looseObject({})),
  warmup_required: z.number(),
});

const adminRoundSchema = z.object({
  id: z.string(),
  round_no: z.number(),
  status: z.string(),
  scheduled_open_at: z.string(),
  opens_at: z.string().nullable(),
  closes_at: z.string().nullable(),
  player_count: z.number(),
  total_fee_xu: z.number(),
  total_reward_xu: z.number(),
  fallback_level: z.number(),
  symbol: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
});

const adminRoundsResponseSchema = z.object({
  rounds: z.array(adminRoundSchema),
});

const adminAlertSchema = z.object({
  run_at: z.string(),
  step: z.string(),
  round_id: z.string().nullable(),
  result: z.string(),
  error: z.string().nullable(),
  level: z.enum(['high', 'medium', 'low']).nullable(),
  level_label: z.string().nullable(),
});

const adminAlertsResponseSchema = z.object({
  alerts: z.array(adminAlertSchema),
});

const adminSuspectSchema = z.object({
  round_id: z.string(),
  reason: z.string(),
  shared: z.string(),
  user_count: z.number(),
  usernames: z.array(z.string()),
});

const adminSuspectsResponseSchema = z.object({
  suspects: z.array(adminSuspectSchema),
});

const adminPauseResponseSchema = z.object({ paused: z.boolean() });

@ApiTags('Flashback')
@Controller('api/v2/flashback')
export class FlashbackController {
  constructor(private readonly flashback: FlashbackService) {}

  @Get('current')
  @ApiOperation({ operationId: 'flashbackCurrent', summary: 'Đề đang mở và lượt chơi của tôi' })
  @ApiOkResponse({ schema: openapi(currentResponseSchema) })
  async current(@CurrentUser() user: AuthenticatedUser) {
    return this.flashback.getCurrent(user.id);
  }

  @Post('current/join')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackJoin', summary: 'Tham gia đề hiện tại' })
  @ApiOkResponse({ schema: openapi(joinResponseSchema) })
  async join(@CurrentUser() user: AuthenticatedUser) {
    return this.flashback.join(user.id);
  }

  @Get('current/leaderboard')
  @ApiOperation({ operationId: 'flashbackLeaderboard', summary: 'Bảng xếp hạng của đề hiện tại' })
  @ApiOkResponse({ schema: openapi(leaderboardResponseSchema) })
  async leaderboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: z.infer<typeof flashbackLeaderboardQuerySchema>,
  ) {
    return this.flashback.leaderboard(user.id, query.scope ?? 'all');
  }

  @Get('indicators')
  @ApiOperation({ operationId: 'flashbackIndicators', summary: 'Chỉ báo đã mở kèm tham số' })
  @ApiOkResponse({ schema: openapi(indicatorsResponseSchema) })
  async indicators(@CurrentUser() user: AuthenticatedUser) {
    return { indicators: await this.flashback.listIndicators(user.id) };
  }

  @Post('entries/:id/next')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackNext', summary: 'Mở nến phiên tiếp theo' })
  @ApiOkResponse({ schema: openapi(nextResponseSchema) })
  async next(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: z.infer<typeof flashbackEntryParamSchema>,
  ) {
    return this.flashback.next(user.id, params.id);
  }

  @Post('entries/:id/orders')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackPlaceOrder', summary: 'Đặt lệnh mua hoặc bán' })
  @ApiOkResponse({ schema: openapi(orderResponseSchema) })
  async placeOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: z.infer<typeof flashbackEntryParamSchema>,
    @Body() body: FlashbackOrderBody,
  ) {
    return this.flashback.placeOrder(user.id, params.id, {
      side: body.side,
      qty: body.qty,
      idempotencyKey: body.idempotency_key ?? null,
    });
  }

  @Post('entries/:id/finish')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackFinish', summary: 'Kết thúc lượt chơi và xem kết quả' })
  @ApiOkResponse({ schema: openapi(finishResponseSchema) })
  async finish(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: z.infer<typeof flashbackEntryParamSchema>,
  ) {
    return this.flashback.finish(user.id, params.id);
  }

  @Put('entries/:id/indicators')
  @ApiOperation({ operationId: 'flashbackSaveIndicators', summary: 'Lưu tham số chỉ báo của lượt chơi' })
  @ApiOkResponse({ schema: openapi(saveIndicatorsResponseSchema) })
  async saveIndicators(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: z.infer<typeof flashbackEntryParamSchema>,
    @Body() body: FlashbackIndicatorsBody,
  ) {
    return this.flashback.saveIndicatorParams(user.id, params.id, body.indicators);
  }
}

@ApiTags('Flashback Admin')
@Controller('api/v2/admin/flashback')
@UseGuards(RolesGuard)
@Roles('admin')
export class FlashbackAdminController {
  constructor(private readonly admin: FlashbackAdminService) {}

  @Get('rounds')
  @ApiOperation({ operationId: 'flashbackAdminRounds', summary: 'Danh sách đề Flashback' })
  @ApiOkResponse({ schema: openapi(adminRoundsResponseSchema) })
  async rounds() {
    return { rounds: await this.admin.rounds() };
  }

  @Get('alerts')
  @ApiOperation({ operationId: 'flashbackAdminAlerts', summary: 'Cảnh báo của tác vụ Flashback' })
  @ApiOkResponse({ schema: openapi(adminAlertsResponseSchema) })
  async alerts() {
    return { alerts: await this.admin.alerts() };
  }

  @Get('suspects')
  @ApiOperation({ operationId: 'flashbackAdminSuspects', summary: 'Tài khoản bị nghi vấn' })
  @ApiOkResponse({ schema: openapi(adminSuspectsResponseSchema) })
  async suspects() {
    return { suspects: await this.admin.suspects() };
  }

  @Get('pause')
  @ApiOperation({
    operationId: 'flashbackAdminPauseStatus',
    summary: 'Trạng thái tạm dừng Flashback',
  })
  @ApiOkResponse({ schema: openapi(adminPauseResponseSchema) })
  async pauseStatus() {
    return { paused: await this.admin.paused() };
  }

  @Post('pause')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackAdminPause', summary: 'Tạm dừng Flashback' })
  @ApiOkResponse({ schema: openapi(adminPauseResponseSchema) })
  async pause(@Body() body: z.infer<typeof flashbackPauseBodySchema>) {
    return this.admin.setPaused(body.paused);
  }

  @Get('rounds/:id/reveal')
  @ApiOperation({ operationId: 'flashbackAdminReveal', summary: 'Xem mã của đề đã đóng' })
  @ApiOkResponse({ schema: openapi(z.looseObject({})) })
  async reveal(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param() params: z.infer<typeof flashbackEntryParamSchema>,
  ) {
    return this.admin.reveal(params.id, auditContext(user, request), {
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      requestId: typeof request.id === 'string' ? request.id : null,
    });
  }
}
