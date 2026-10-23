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

/** Định danh lượt chơi, đề hoặc khoản thưởng đang giữ. */
export const flashbackIdParamSchema = z.uuid();

/** Thân tham gia đề: mã thiết bị do trình duyệt sinh (FB-07), không bắt buộc. */
export const flashbackJoinBodySchema = z
  .strictObject({
    device_id: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{8,64}$/)
      .optional(),
  })
  .default({});
export type FlashbackJoinBody = z.infer<typeof flashbackJoinBodySchema>;

/** Truy vấn danh sách thưởng đang giữ. */
export const flashbackRewardHoldsQuerySchema = z.object({
  status: z.enum(['held', 'released', 'voided']).optional(),
});

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
  reward_eligible: z.boolean(),
  status: z.literal('finished'),
});

const leaderboardRowSchema = z.object({
  rank: z.number(),
  username: z.string(),
  pnl_pct: z.number().nullable(),
  is_me: z.boolean(),
  /** Chỉ có ở dòng của chính mình (FB-10). */
  step: z.number().optional(),
  status: z.enum(['playing', 'finished']).optional(),
});

const leaderboardResponseSchema = z.object({
  scope: z.enum(['all', 'team']),
  rows: z.array(leaderboardRowSchema),
  me: leaderboardRowSchema.nullable(),
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
  held_reward_xu: z.number(),
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

const adminPauseStatusResponseSchema = z.object({
  paused: z.boolean(),
  /** Người đang xem có trong `SUPER_ADMIN_USER_IDS` (FB-08). */
  super_admin: z.boolean(),
});

const adminRewardHoldSchema = z.object({
  id: z.string(),
  round_id: z.string(),
  round_no: z.number(),
  user_id: z.string(),
  username: z.string(),
  amount: z.number(),
  reason: z.string(),
  status: z.enum(['held', 'released', 'voided']),
  decided_by: z.string().nullable(),
  decided_at: z.string().nullable(),
  created_at: z.string(),
});

const adminRewardHoldsResponseSchema = z.object({ holds: z.array(adminRewardHoldSchema) });

const adminSettingsResponseSchema = z.object({
  settings: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      value: z.union([z.string(), z.number()]),
      default_value: z.union([z.string(), z.number()]),
    }),
  ),
});

const adminRevealResponseSchema = z.object({
  round_no: z.number(),
  symbol: z.string(),
  start_date: z.string(),
  session_range: z.string(),
});

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
  async join(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Body({ schema: flashbackJoinBodySchema }) body: FlashbackJoinBody,
  ) {
    return this.flashback.join(user.id, {
      deviceId: body?.device_id ?? null,
      ip: request.ip ?? null,
    });
  }

  @Get('current/leaderboard')
  @ApiOperation({ operationId: 'flashbackLeaderboard', summary: 'Bảng xếp hạng của đề hiện tại' })
  @ApiOkResponse({ schema: openapi(leaderboardResponseSchema) })
  async leaderboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: flashbackLeaderboardQuerySchema })
    query: z.infer<typeof flashbackLeaderboardQuerySchema>,
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
    @Param('id', { schema: flashbackIdParamSchema }) id: string,
  ) {
    return this.flashback.next(user.id, id);
  }

  @Post('entries/:id/orders')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackPlaceOrder', summary: 'Đặt lệnh mua hoặc bán' })
  @ApiOkResponse({ schema: openapi(orderResponseSchema) })
  async placeOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: flashbackIdParamSchema }) id: string,
    @Body({ schema: flashbackOrderBodySchema }) body: FlashbackOrderBody,
  ) {
    return this.flashback.placeOrder(user.id, id, {
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
    @Param('id', { schema: flashbackIdParamSchema }) id: string,
  ) {
    return this.flashback.finish(user.id, id);
  }

  @Put('entries/:id/indicators')
  @ApiOperation({ operationId: 'flashbackSaveIndicators', summary: 'Lưu tham số chỉ báo của lượt chơi' })
  @ApiOkResponse({ schema: openapi(saveIndicatorsResponseSchema) })
  async saveIndicators(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: flashbackIdParamSchema }) id: string,
    @Body({ schema: flashbackIndicatorsBodySchema }) body: FlashbackIndicatorsBody,
  ) {
    return this.flashback.saveIndicatorParams(user.id, id, body.indicators);
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
  @ApiOkResponse({ schema: openapi(adminPauseStatusResponseSchema) })
  async pauseStatus(@CurrentUser() user: AuthenticatedUser) {
    return { paused: await this.admin.paused(), super_admin: this.admin.isSuperAdmin(user.id) };
  }

  @Post('pause')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'flashbackAdminPause',
    summary: 'Tạm dừng Flashback (chỉ quản trị viên cao nhất)',
  })
  @ApiOkResponse({ schema: openapi(adminPauseResponseSchema) })
  async pause(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Body({ schema: flashbackPauseBodySchema }) body: z.infer<typeof flashbackPauseBodySchema>,
  ) {
    return this.admin.setPaused(body.paused, auditContext(user, request));
  }

  @Get('settings')
  @ApiOperation({
    operationId: 'flashbackAdminSettings',
    summary: 'Tham số vận hành Flashback (chỉ đọc)',
  })
  @ApiOkResponse({ schema: openapi(adminSettingsResponseSchema) })
  async settings() {
    return { settings: await this.admin.settings() };
  }

  @Get('reward-holds')
  @ApiOperation({
    operationId: 'flashbackAdminRewardHolds',
    summary: 'Thưởng đang giữ của tài khoản bị đánh dấu',
  })
  @ApiOkResponse({ schema: openapi(adminRewardHoldsResponseSchema) })
  async rewardHolds(
    @Query({ schema: flashbackRewardHoldsQuerySchema })
    query: z.infer<typeof flashbackRewardHoldsQuerySchema>,
  ) {
    return { holds: await this.admin.rewardHolds(query.status) };
  }

  @Post('reward-holds/:id/release')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackAdminReleaseRewardHold', summary: 'Trả thưởng đang giữ' })
  @ApiOkResponse({ schema: openapi(adminRewardHoldSchema) })
  async releaseRewardHold(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: flashbackIdParamSchema }) id: string,
  ) {
    return this.admin.releaseRewardHold(id, auditContext(user, request));
  }

  @Post('reward-holds/:id/void')
  @HttpCode(200)
  @ApiOperation({ operationId: 'flashbackAdminVoidRewardHold', summary: 'Huỷ thưởng đang giữ' })
  @ApiOkResponse({ schema: openapi(adminRewardHoldSchema) })
  async voidRewardHold(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: flashbackIdParamSchema }) id: string,
  ) {
    return this.admin.voidRewardHold(id, auditContext(user, request));
  }

  @Get('rounds/:id/reveal')
  @ApiOperation({
    operationId: 'flashbackAdminReveal',
    summary: 'Xem mã của đề đã đóng (chỉ quản trị viên cao nhất)',
  })
  @ApiOkResponse({ schema: openapi(adminRevealResponseSchema) })
  async reveal(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: flashbackIdParamSchema }) id: string,
  ) {
    return this.admin.reveal(id, auditContext(user, request), {
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      requestId: typeof request.id === 'string' ? request.id : null,
    });
  }
}
