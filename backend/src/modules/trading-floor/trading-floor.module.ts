/**
 * Khu giao dịch: sân chung 2D, nghi lễ Thần Tài hằng phiên, bảng xếp hạng tháng và nhắn tin với SACO
 * (spec `IQX-KhuGiaoDich`; hợp đồng `docs/trading-floor`). Danh tính là tài khoản IQX (`users.id`),
 * quyền SACO do trưởng nhóm (nhóm mình) hoặc quản trị viên (mọi nhóm) cấp.
 *
 * Trạng thái thời gian thực (ai đang đứng ở đâu, lời mời Chat SACO đang chờ) nằm trong bộ nhớ của tiến
 * trình API, giống Flashback. Module này chỉ phát sự kiện qua `FloorEvents`; `FloorEventsModule` dùng
 * chung với `SacoPostsModule` để bài viết mới tới được người trong khu.
 */

import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AuthModule } from '../auth/index.js';
import { MarketExtendedModule } from '../market-extended/index.js';
import { FLOOR_CHAT_REPOSITORY, PgFloorChatRepository } from './floor-chat.repository.js';
import { FloorChatController } from './floor-chat.controller.js';
import { FloorBots } from './floor-bots.js';
import { FloorChatService } from './floor-chat.service.js';
import { FLOOR_CLOCK, systemFloorClock } from './floor-clock.js';
import { FloorEventsModule } from './floor-events.js';
import { FloorManageController } from './floor-manage.controller.js';
import { FLOOR_MARKET, PgFloorMarket } from './floor-market.js';
import { FloorPresence } from './floor-presence.js';
import {
  FLOOR_PROFILE_REPOSITORY,
  PgFloorProfileRepository,
} from './floor-profile.repository.js';
import { FloorProfileService } from './floor-profile.service.js';
import {
  FLOOR_RITUAL_REPOSITORY,
  PgFloorRitualRepository,
} from './floor-ritual.repository.js';
import { FloorRitualJob } from './floor-ritual.job.js';
import { FloorRitualService } from './floor-ritual.service.js';
import { FLOOR_SACO_REPOSITORY, PgFloorSacoRepository } from './floor-saco.repository.js';
import { FloorSacoService } from './floor-saco.service.js';
import { FloorWsGateway } from './floor-ws.gateway.js';
import { FloorHub } from './floor.hub.js';
import { FloorController } from './floor.controller.js';

@Module({
  imports: [DatabaseModule, AuthModule, MarketExtendedModule, FloorEventsModule],
  controllers: [FloorController, FloorChatController, FloorManageController],
  providers: [
    PgFloorProfileRepository,
    { provide: FLOOR_PROFILE_REPOSITORY, useExisting: PgFloorProfileRepository },
    PgFloorSacoRepository,
    { provide: FLOOR_SACO_REPOSITORY, useExisting: PgFloorSacoRepository },
    PgFloorChatRepository,
    { provide: FLOOR_CHAT_REPOSITORY, useExisting: PgFloorChatRepository },
    PgFloorRitualRepository,
    { provide: FLOOR_RITUAL_REPOSITORY, useExisting: PgFloorRitualRepository },
    PgFloorMarket,
    { provide: FLOOR_MARKET, useExisting: PgFloorMarket },
    { provide: FLOOR_CLOCK, useValue: systemFloorClock },
    FloorPresence,
    FloorProfileService,
    FloorRitualService,
    FloorChatService,
    FloorSacoService,
    FloorBots,
    FloorHub,
    FloorWsGateway,
    FloorRitualJob,
  ],
  exports: [FloorRitualJob, FloorRitualService, FloorChatService],
})
export class TradingFloorModule {}
