/**
 * API Thần Tài v2 dưới `api/v2/trading-floor/than-tai`: bốn bước khấn hằng ngày và kết quả cả sàn. Mọi
 * đường dẫn là `@Public()` vì người dùng có thể là khách: danh tính lấy từ `Authorization: Bearer` hoặc
 * header `x-floor-guest` qua `FloorActors`. Trừ `results` (cho phép ẩn danh sau 11:30), thiếu cả hai là 401.
 */

import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { Public } from '../auth/index.js';
import { FloorActors } from './floor-actor.js';
import {
  THAN_TAI_LEADERBOARD_SCHEMA,
  THAN_TAI_RESULTS_SCHEMA,
  THAN_TAI_TODAY_SCHEMA,
  thanTaiCauBodySchema,
  thanTaiLeaderboardQuerySchema,
  thanTaiPredictBodySchema,
  type ThanTaiCauBody,
  type ThanTaiLeaderboardQuery,
  type ThanTaiPredictBody,
} from './than-tai.schemas.js';
import type { ThanTaiLeaderboard, ThanTaiResults, ThanTaiToday } from './than-tai.logic.js';
import { ThanTaiService } from './than-tai.service.js';

@ApiTags('Khu giao dịch · Thần Tài')
@Public()
@Controller('api/v2/trading-floor/than-tai')
export class ThanTaiController {
  constructor(
    private readonly actors: FloorActors,
    private readonly service: ThanTaiService,
  ) {}

  @Get('today')
  @ApiOperation({
    operationId: 'thanTaiToday',
    summary:
      'Trạng thái khấn hôm nay: bước còn dở, dòng ngày (can chi, hành), lá đã gieo và phần đã chốt',
  })
  @ApiOkResponse({ schema: THAN_TAI_TODAY_SCHEMA })
  async today(@Req() request: FastifyRequest): Promise<ThanTaiToday> {
    return this.service.today(await this.actors.require(request));
  }

  @Post('draw')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'thanTaiDraw',
    summary:
      'Bước 1: gieo quẻ (một lá mỗi ngày; gọi lại trả đúng lá đã gieo; sau 11:30 là HET_GIO)',
  })
  @ApiOkResponse({ schema: THAN_TAI_TODAY_SCHEMA })
  async draw(@Req() request: FastifyRequest): Promise<ThanTaiToday> {
    return this.service.draw(await this.actors.require(request));
  }

  @Post('predict')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'thanTaiPredict',
    summary: 'Bước 2: dự đoán hướng VNINDEX hôm nay (up, flat, down), chốt một lần',
  })
  @ApiOkResponse({ schema: THAN_TAI_TODAY_SCHEMA })
  async predict(
    @Req() request: FastifyRequest,
    @Body({ schema: thanTaiPredictBodySchema }) body: ThanTaiPredictBody,
  ): Promise<ThanTaiToday> {
    return this.service.predict(await this.actors.require(request), body.direction);
  }

  @Post('cau')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'thanTaiCau',
    summary: 'Bước 3: cầu 0–3 mã cổ phiếu (mảng rỗng là bỏ qua), chốt một lần',
  })
  @ApiOkResponse({ schema: THAN_TAI_TODAY_SCHEMA })
  async cau(
    @Req() request: FastifyRequest,
    @Body({ schema: thanTaiCauBodySchema }) body: ThanTaiCauBody,
  ): Promise<ThanTaiToday> {
    return this.service.cau(await this.actors.require(request), body.tickers);
  }

  @Get('results')
  @ApiOperation({
    operationId: 'thanTaiResults',
    summary:
      'Bước 4: kết quả cả sàn hôm nay (số người từng hướng, top 5 mã được cầu). Trước 11:30 chỉ người đã xong bước 3; sau 11:30 ai cũng xem được',
  })
  @ApiOkResponse({ schema: THAN_TAI_RESULTS_SCHEMA })
  async results(@Req() request: FastifyRequest): Promise<ThanTaiResults> {
    return this.service.results(await this.actors.fromRequest(request));
  }

  @Get('leaderboard')
  @ApiOperation({
    operationId: 'thanTaiLeaderboard',
    summary:
      'Bảng vinh danh theo tháng (`?month=YYYY-MM`, mặc định tháng này): top 10 tài khoản dự đoán đúng VNINDEX nhiều nhất và dòng của người gọi. Chỉ chấm ngày đã có giá đóng cửa; khách xem được nhưng không được xếp hạng',
  })
  @ApiOkResponse({ schema: THAN_TAI_LEADERBOARD_SCHEMA })
  async leaderboard(
    @Req() request: FastifyRequest,
    @Query({ schema: thanTaiLeaderboardQuerySchema }) query: ThanTaiLeaderboardQuery,
  ): Promise<ThanTaiLeaderboard> {
    return this.service.leaderboard(await this.actors.fromRequest(request), query.month);
  }
}
