/**
 * API của Khu giao dịch dưới `api/v2/trading-floor`: hồ sơ nhân vật. Danh tính là tài khoản IQX hoặc
 * khách (`x-floor-guest`); Thần Tài ở `than-tai.controller.ts`.
 */

import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { Public } from '../auth/index.js';
import { FloorActors } from './floor-actor.js';
import { FloorProfileService, type FloorMe } from './floor-profile.service.js';
import {
  FLOOR_ME_SCHEMA,
  FLOOR_PROFILE_SCHEMA,
  floorProfileBodySchema,
  type FloorProfileBody,
} from './floor.schemas.js';
import type { FloorProfile } from './floor-types.js';

@ApiTags('Khu giao dịch')
@ApiBearerAuth()
@Controller('api/v2/trading-floor')
export class FloorController {
  constructor(
    private readonly profiles: FloorProfileService,
    private readonly actors: FloorActors,
  ) {}

  @Public()
  @Get('me')
  @ApiOperation({
    operationId: 'floorMe',
    summary:
      'Hồ sơ nhân vật trên sàn, tên gợi ý và quyền SACO của chính tôi (tài khoản đăng nhập hoặc khách `x-floor-guest`)',
  })
  @ApiOkResponse({ schema: FLOOR_ME_SCHEMA })
  async me(@Req() req: FastifyRequest): Promise<FloorMe> {
    return this.profiles.me(await this.actors.require(req));
  }

  @Public()
  @Put('profile')
  @ApiOperation({
    operationId: 'floorProfileSave',
    summary:
      'Tạo hoặc đổi nhân vật trên sàn (tên 2–20 ký tự, dáng, màu áo); khách `x-floor-guest` đổi được nhân vật của mình',
  })
  @ApiOkResponse({ schema: FLOOR_PROFILE_SCHEMA })
  async saveProfile(
    @Req() req: FastifyRequest,
    @Body({ schema: floorProfileBodySchema }) body: FloorProfileBody,
  ): Promise<FloorProfile> {
    return this.profiles.save(await this.actors.require(req), body);
  }
}
