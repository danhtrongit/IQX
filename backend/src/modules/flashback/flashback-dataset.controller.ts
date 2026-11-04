/**
 * API quản trị kho dữ liệu Flashback v2.2 (IQX-Flashback-SPEC-DuLieu.md §6):
 * `api/v2/admin/flashback/dataset`, chỉ vai trò admin. Mọi đường dẫn yêu cầu đăng nhập (guard toàn
 * cục của API).
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { flashbackDatasetConfigPatchSchema } from './flashback-dataset.config.js';
import { FlashbackDatasetAdminService } from './flashback-dataset-admin.service.js';

const openapi = (schema: z.ZodType): SchemaObject =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

const versionViewSchema = z.object({
  version: z.number(),
  status: z.enum(['building', 'active', 'retired', 'failed']),
  created_at: z.string(),
  activated_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  symbols_count: z.number(),
  excluded_count: z.number(),
  first_date: z.string().nullable(),
  last_date: z.string().nullable(),
  source: z.string(),
  trigger: z.enum(['scheduled', 'manual', 'cli']),
  requested_by: z.string().nullable(),
  duration_ms: z.number().nullable(),
  log: z.record(z.string(), z.unknown()),
});

const configSchema = z.object({
  basket: z.string(),
  warmup_sessions: z.number(),
  min_months_ago: z.number(),
  max_gap_sessions: z.number(),
  max_zero_volume_ratio: z.number(),
  min_liquidity_vnd: z.number(),
  min_daily_volatility: z.number(),
  min_symbols: z.number(),
  price_sources: z.array(z.enum(['DNSE', 'VCI'])),
  refresh_months: z.array(z.number()),
  refresh_delay_days: z.number(),
  rebalance_dates: z.array(z.string()),
});

const statusResponseSchema = z.object({
  active: versionViewSchema.nullable(),
  building: z
    .object({
      version: z.number(),
      started_at: z.string(),
      heartbeat_at: z.string(),
      stale: z.boolean(),
      trigger: z.enum(['scheduled', 'manual', 'cli']),
      progress: z.object({
        phase: z.enum(['basket', 'calendar', 'symbols', 'finalize', 'done']),
        total: z.number(),
        done: z.number(),
        ok: z.number(),
        excluded: z.number(),
      }),
    })
    .nullable(),
  latest_failed: versionViewSchema.nullable(),
  config: configSchema,
  config_defaults: configSchema,
  config_invalid: z.array(z.string()),
  warnings: z.array(
    z.object({
      code: z.string(),
      level: z.enum(['high', 'medium']),
      message: z.string(),
      at: z.string().nullable(),
    }),
  ),
  alerts: z.array(
    z.object({
      run_at: z.string(),
      level: z.enum(['high', 'medium', 'low']),
      code: z.string(),
      message: z.string(),
    }),
  ),
  schedule: z.object({
    due: z.boolean(),
    reason: z.string(),
    anchor: z.string().nullable(),
  }),
});

const symbolsResponseSchema = z.object({
  version: z.number().nullable(),
  status: z.string().nullable(),
  symbols: z.array(
    z.object({
      symbol: z.string(),
      bars_count: z.number(),
      first_date: z.string().nullable(),
      last_date: z.string().nullable(),
      status: z.enum(['ok', 'excluded']),
      reason: z.string().nullable(),
      price_source: z.string().nullable(),
      value_basis: z.string().nullable(),
      bad_count: z.number(),
    }),
  ),
});

const versionsResponseSchema = z.object({ versions: z.array(versionViewSchema) });

const refreshResponseSchema = z.object({
  accepted: z.literal(true),
  mode: z.enum(['queued', 'inline']),
  job_id: z.string().nullable(),
});

const configResponseSchema = z.object({
  config: configSchema,
  config_invalid: z.array(z.string()),
});

/** Truy vấn danh sách mã: phiên bản (mặc định là phiên bản đang dùng). */
export const flashbackDatasetSymbolsQuerySchema = z.object({
  version: z.coerce.number().int().min(1).optional(),
});

@ApiTags('Flashback Admin')
@Controller('api/v2/admin/flashback/dataset')
@UseGuards(RolesGuard)
@Roles('admin')
export class FlashbackDatasetAdminController {
  constructor(private readonly dataset: FlashbackDatasetAdminService) {}

  @Get()
  @ApiOperation({
    operationId: 'flashbackAdminDataset',
    summary: 'Kho dữ liệu Flashback: phiên bản đang dùng, tiến độ, cảnh báo và tham số',
  })
  @ApiOkResponse({ schema: openapi(statusResponseSchema) })
  async status() {
    return this.dataset.status();
  }

  @Get('symbols')
  @ApiOperation({
    operationId: 'flashbackAdminDatasetSymbols',
    summary: 'Danh sách mã của một phiên bản kho kèm lý do bị loại',
  })
  @ApiOkResponse({ schema: openapi(symbolsResponseSchema) })
  async symbols(
    @Query({ schema: flashbackDatasetSymbolsQuerySchema })
    query: z.infer<typeof flashbackDatasetSymbolsQuerySchema>,
  ) {
    return this.dataset.symbols(query.version);
  }

  @Get('versions')
  @ApiOperation({
    operationId: 'flashbackAdminDatasetVersions',
    summary: 'Lịch sử phiên bản kho dữ liệu kèm nhật ký',
  })
  @ApiOkResponse({ schema: openapi(versionsResponseSchema) })
  async versions() {
    return { versions: await this.dataset.versions() };
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'flashbackAdminDatasetRefresh',
    summary: 'Làm mới kho dữ liệu (chạy nền; 409 nếu đang có một lần làm mới)',
  })
  @ApiOkResponse({ schema: openapi(refreshResponseSchema) })
  async refresh(@CurrentUser() user: AuthenticatedUser, @Req() request: FastifyRequest) {
    return this.dataset.refresh(auditContext(user, request));
  }

  @Put('config')
  @ApiOperation({
    operationId: 'flashbackAdminDatasetConfig',
    summary: 'Đổi tham số kho dữ liệu Flashback (chỉ các khoá được gửi)',
  })
  @ApiOkResponse({ schema: openapi(configResponseSchema) })
  async updateConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Body({ schema: flashbackDatasetConfigPatchSchema })
    body: z.infer<typeof flashbackDatasetConfigPatchSchema>,
  ) {
    return this.dataset.updateConfig(body, auditContext(user, request));
  }
}
