/**
 * API của Khu giao dịch dưới `api/v2/trading-floor`: hồ sơ nhân vật, nghi lễ Thần Tài và bảng xếp
 * hạng. Mọi đường dẫn yêu cầu đăng nhập (guard toàn cục); danh tính là tài khoản IQX.
 */

import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { FloorProfileService, type FloorMe } from './floor-profile.service.js';
import {
  FloorRitualService,
  type RitualDrawResult,
  type RitualSubmitResult,
} from './floor-ritual.service.js';
import {
  FLOOR_LEADERBOARD_SCHEMA,
  FLOOR_ME_SCHEMA,
  FLOOR_PROFILE_SCHEMA,
  FLOOR_RITUAL_DRAW_SCHEMA,
  FLOOR_RITUAL_SUBMIT_SCHEMA,
  FLOOR_RITUAL_TODAY_SCHEMA,
  floorProfileBodySchema,
  leaderboardQuerySchema,
  ritualSubmitBodySchema,
  type FloorProfileBody,
  type LeaderboardQuery,
  type RitualSubmitBody,
} from './floor.schemas.js';
import type { FloorProfile, Leaderboard, RitualToday } from './floor-types.js';

@ApiTags('Khu giao dịch')
@ApiBearerAuth()
@Controller('api/v2/trading-floor')
export class FloorController {
  constructor(
    private readonly profiles: FloorProfileService,
    private readonly ritual: FloorRitualService,
  ) {}

  @Get('me')
  @ApiOperation({
    operationId: 'floorMe',
    summary: 'Hồ sơ nhân vật trên sàn, tên gợi ý và quyền SACO của chính tôi',
  })
  @ApiOkResponse({ schema: FLOOR_ME_SCHEMA })
  me(@CurrentUser() user: AuthenticatedUser): Promise<FloorMe> {
    return this.profiles.me(user.id);
  }

  @Put('profile')
  @ApiOperation({
    operationId: 'floorProfileSave',
    summary: 'Tạo hoặc đổi nhân vật trên sàn (tên 2–20 ký tự, dáng, màu áo)',
  })
  @ApiOkResponse({ schema: FLOOR_PROFILE_SCHEMA })
  saveProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: floorProfileBodySchema }) body: FloorProfileBody,
  ): Promise<FloorProfile> {
    return this.profiles.save(user.id, body);
  }

  @Get('ritual/today')
  @ApiOperation({
    operationId: 'floorRitualToday',
    summary: 'Phiên đang dự đoán, nghi lễ của tôi, thống kê đám đông và phiên chấm gần nhất',
  })
  @ApiOkResponse({ schema: FLOOR_RITUAL_TODAY_SCHEMA })
  ritualToday(@CurrentUser() user: AuthenticatedUser): Promise<RitualToday> {
    return this.ritual.today(user.id);
  }

  @Post('ritual/draw')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'floorRitualDraw',
    summary: 'Gieo quẻ (một lần mỗi phiên; gieo lại trả đúng quẻ cũ)',
  })
  @ApiOkResponse({ schema: FLOOR_RITUAL_DRAW_SCHEMA })
  ritualDraw(@CurrentUser() user: AuthenticatedUser): Promise<RitualDrawResult> {
    return this.ritual.draw(user.id);
  }

  @Post('ritual/submit')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'floorRitualSubmit',
    summary: 'Hoàn tất nghi lễ: hướng VNINDEX, mức đóng cửa dự đoán và 3 mã khấn',
  })
  @ApiOkResponse({ schema: FLOOR_RITUAL_SUBMIT_SCHEMA })
  ritualSubmit(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: ritualSubmitBodySchema }) body: RitualSubmitBody,
  ): Promise<RitualSubmitResult> {
    return this.ritual.submit(user.id, body);
  }

  @Get('leaderboard')
  @ApiOperation({
    operationId: 'floorLeaderboard',
    summary: 'Bảng xếp hạng dự đoán đúng hướng của một tháng (mặc định tháng này)',
  })
  @ApiOkResponse({ schema: FLOOR_LEADERBOARD_SCHEMA })
  leaderboard(
    @Query({ schema: leaderboardQuerySchema }) query: LeaderboardQuery,
  ): Promise<Leaderboard> {
    return this.ritual.leaderboard(query.month);
  }
}
