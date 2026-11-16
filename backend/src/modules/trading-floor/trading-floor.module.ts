/**
 * Khu giao dịch: sân chung 2D, Thần Tài v2 (lắc quẻ Kinh Dịch hằng ngày, `docs/than-tai`) và nhắn tin
 * với SACO (spec `IQX-KhuGiaoDich`; hợp đồng `docs/trading-floor`). Danh tính là tài khoản IQX
 * (`users.id`) hoặc khách (`tf_guests`), quyền SACO do trưởng nhóm (nhóm mình) hoặc quản trị viên (mọi
 * nhóm) cấp.
 *
 * Trạng thái thời gian thực (ai đang đứng ở đâu, lời mời Chat SACO đang chờ) nằm trong bộ nhớ của tiến
 * trình API, giống Flashback. Module này chỉ phát sự kiện qua `FloorEvents`; `FloorEventsModule` dùng
 * chung với `SacoPostsModule` để bài viết mới tới được người trong khu.
 */

import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AuthModule } from '../auth/index.js';
import { MarketExtendedModule } from '../market-extended/index.js';
import { FloorActors } from './floor-actor.js';
import { FLOOR_CHAT_REPOSITORY, PgFloorChatRepository } from './floor-chat.repository.js';
import { FloorChatController } from './floor-chat.controller.js';
import { FloorChatImagesService } from './floor-chat-images.service.js';
import { FloorBots } from './floor-bots.js';
import { FloorChatService } from './floor-chat.service.js';
import { FLOOR_CLOCK, systemFloorClock } from './floor-clock.js';
import { FloorEventsModule } from './floor-events.js';
import { FloorGuestController } from './floor-guest.controller.js';
import { FloorManageController } from './floor-manage.controller.js';
import { FLOOR_MARKET, PgFloorMarket } from './floor-market.js';
import { FloorPresence } from './floor-presence.js';
import {
  FLOOR_PROFILE_REPOSITORY,
  PgFloorProfileRepository,
} from './floor-profile.repository.js';
import { FloorProfileService } from './floor-profile.service.js';
import { FLOOR_SACO_REPOSITORY, PgFloorSacoRepository } from './floor-saco.repository.js';
import { FloorSacoService } from './floor-saco.service.js';
import { FloorWsGateway } from './floor-ws.gateway.js';
import { FloorHub } from './floor.hub.js';
import { FloorController } from './floor.controller.js';
import { ThanTaiManageController } from './than-tai-manage.controller.js';
import { ThanTaiController } from './than-tai.controller.js';
import { PgThanTaiRepository, THAN_TAI_REPOSITORY } from './than-tai.repository.js';
import { ThanTaiService } from './than-tai.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, MarketExtendedModule, FloorEventsModule],
  controllers: [
    FloorController,
    FloorGuestController,
    FloorChatController,
    FloorManageController,
    ThanTaiController,
    ThanTaiManageController,
  ],
  providers: [
    PgFloorProfileRepository,
    { provide: FLOOR_PROFILE_REPOSITORY, useExisting: PgFloorProfileRepository },
    PgFloorSacoRepository,
    { provide: FLOOR_SACO_REPOSITORY, useExisting: PgFloorSacoRepository },
    PgFloorChatRepository,
    { provide: FLOOR_CHAT_REPOSITORY, useExisting: PgFloorChatRepository },
    PgThanTaiRepository,
    { provide: THAN_TAI_REPOSITORY, useExisting: PgThanTaiRepository },
    PgFloorMarket,
    { provide: FLOOR_MARKET, useExisting: PgFloorMarket },
    { provide: FLOOR_CLOCK, useValue: systemFloorClock },
    FloorActors,
    FloorPresence,
    FloorProfileService,
    ThanTaiService,
    FloorChatImagesService,
    FloorChatService,
    FloorSacoService,
    FloorBots,
    FloorHub,
    FloorWsGateway,
  ],
  exports: [FloorChatService],
})
export class TradingFloorModule {}
