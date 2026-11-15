/**
 * Khách vào Khu giao dịch không cần đăng nhập: `POST api/v2/trading-floor/guest` tạo nhân vật khách
 * (chỉ tên, dáng và màu áo) và trả token để trình duyệt giữ. Token gửi lại qua header `x-floor-guest`
 * (REST) hoặc trường `guest` của thông điệp `auth` (WebSocket). Đổi nhân vật dùng `PUT .../profile`.
 */

import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { Public } from '../auth/index.js';
import { FloorProfileService, type FloorGuestCreated } from './floor-profile.service.js';
import {
  FLOOR_GUEST_CREATED_SCHEMA,
  floorProfileBodySchema,
  type FloorProfileBody,
} from './floor.schemas.js';

@ApiTags('Khu giao dịch')
@Controller('api/v2/trading-floor')
export class FloorGuestController {
  constructor(private readonly profiles: FloorProfileService) {}

  @Public()
  @Post('guest')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'floorGuestCreate',
    summary:
      'Khách chưa đăng nhập tạo nhân vật (tên 2–20 ký tự, dáng, màu áo) và nhận token khách; tối đa 10 lần mỗi IP mỗi giờ',
  })
  @ApiOkResponse({ schema: FLOOR_GUEST_CREATED_SCHEMA })
  createGuest(
    @Req() req: FastifyRequest,
    @Body({ schema: floorProfileBodySchema }) body: FloorProfileBody,
  ): Promise<FloorGuestCreated> {
    return this.profiles.createGuest(req.ip, body);
  }
}
