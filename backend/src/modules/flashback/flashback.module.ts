/**
 * Module của game Flashback.
 *
 * v2 · Phòng chơi (docs/flashback-v2-rooms): `FlashbackRoomsController/Service/Job`. Bản v1.x (đề
 * chung 2 ngày) giữ lại để đọc dữ liệu lịch sử và quản trị; tác vụ đổi đề không còn chạy theo lịch.
 *
 * v2.2 · Kho dữ liệu (IQX-Flashback-SPEC-DuLieu.md): `FlashbackDatasetBuilder/Cuts/Job` dựng kho VN100
 * (DNSE, dự phòng VCI) theo phiên bản và cắt đề từ kho thay cho bộ dựng đề v1 trên đường của phòng
 * chơi; `FlashbackDatasetAdminController` là mục "Kho dữ liệu Flashback" của trang Quản trị.
 *
 * Module này dùng `MarketDataModule` (nến ngày), `MarketIntegrationModule` (rổ chỉ số) và
 * `DatabaseModule` (kho Flashback + ví xu). Nó không sửa dữ liệu của các module khác ngoài hai bảng
 * `coin_wallets` / `coin_ledger` với kind riêng (`flashback_fee`, `flashback_reward` của v1;
 * `flashback_stake`, `flashback_win`, `flashback_refund` của v2). Mở đủ 16 chỉ báo cho mọi người,
 * không còn phụ thuộc quyền mở của Học viện (spec v2 §6.4).
 */

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AuthModule } from '../auth/index.js';
import { MarketDataModule } from '../market-data/index.js';
import { IndexMembershipProvider, MarketIntegrationModule } from '../market-integration/index.js';
import { FlashbackAdminController, FlashbackController } from './flashback.controller.js';
import type { Environment } from '../../platform/config/environment.js';
import { FLASHBACK_OPS_ALERTS, TelegramFlashbackOpsAlerts } from './flashback.alerts.js';
import { FLASHBACK_SUPER_ADMINS, FlashbackAdminService } from './flashback-admin.service.js';
import { FlashbackJob } from './flashback.job.js';
import { MarketFlashbackMarketData } from './flashback.market-data.js';
import { FLASHBACK_REPOSITORY, PgFlashbackRepository } from './flashback.repository.js';
import { FlashbackRoundBuilder, FLASHBACK_VN30 } from './flashback.round-builder.js';
import { FLASHBACK_CLOCK, FlashbackService, systemFlashbackClock } from './flashback.service.js';
import { FlashbackDatasetAdminService } from './flashback-dataset-admin.service.js';
import { FlashbackDatasetBuilder } from './flashback-dataset.builder.js';
import { FlashbackDatasetAdminController } from './flashback-dataset.controller.js';
import { FlashbackDatasetCuts } from './flashback-dataset.cuts.js';
import { FlashbackDatasetJob } from './flashback-dataset.job.js';
import {
  FLASHBACK_DATASET_REPOSITORY,
  PgFlashbackDatasetRepository,
} from './flashback-dataset.repository.js';
import {
  FLASHBACK_DATASET_SOURCE,
  MarketFlashbackDatasetSource,
} from './flashback-dataset.source.js';
import {
  FlashbackChatAdminController,
  FlashbackChatController,
} from './flashback-chat.controller.js';
import {
  FLASHBACK_CHAT_REPOSITORY,
  PgFlashbackChatRepository,
} from './flashback-chat.repository.js';
import { FlashbackChatService } from './flashback-chat.service.js';
import {
  FLASHBACK_MEDIA_OPTIONS,
  FlashbackMediaHub,
  type FbMediaHubOptions,
} from './flashback-media.hub.js';
import { FlashbackRoomEvents } from './flashback-room-events.js';
import { FlashbackWsGateway } from './flashback-ws.gateway.js';
import { FlashbackRoomsController } from './flashback-rooms.controller.js';
import { FlashbackRoomDataset } from './flashback-rooms.dataset.js';
import { FlashbackRoomsJob } from './flashback-rooms.job.js';
import {
  FLASHBACK_ROOMS_REPOSITORY,
  PgFlashbackRoomsRepository,
} from './flashback-rooms.repository.js';
import { FB_DATASET, FlashbackRoomsService } from './flashback-rooms.service.js';

/** Token của nguồn nến ngày dùng cho Flashback. */
export const FLASHBACK_MARKET_DATA = 'FLASHBACK_MARKET_DATA';

@Module({
  imports: [DatabaseModule, AuthModule, MarketDataModule, MarketIntegrationModule],
  controllers: [
    FlashbackController,
    FlashbackRoomsController,
    FlashbackChatController,
    FlashbackChatAdminController,
    FlashbackAdminController,
    FlashbackDatasetAdminController,
  ],
  providers: [
    PgFlashbackRepository,
    MarketFlashbackMarketData,
    { provide: FLASHBACK_REPOSITORY, useExisting: PgFlashbackRepository },
    { provide: FLASHBACK_CLOCK, useValue: systemFlashbackClock },
    { provide: FLASHBACK_MARKET_DATA, useExisting: MarketFlashbackMarketData },
    { provide: FLASHBACK_VN30, useExisting: IndexMembershipProvider },
    TelegramFlashbackOpsAlerts,
    { provide: FLASHBACK_OPS_ALERTS, useExisting: TelegramFlashbackOpsAlerts },
    {
      provide: FLASHBACK_SUPER_ADMINS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) =>
        config.get('SUPER_ADMIN_USER_IDS', { infer: true }) ?? [],
    },
    FlashbackRoomEvents,
    {
      provide: FLASHBACK_MEDIA_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>): FbMediaHubOptions => ({
        iceServers: config.get('FLASHBACK_ICE_SERVERS', { infer: true }),
      }),
    },
    FlashbackMediaHub,
    FlashbackWsGateway,
    FlashbackService,
    FlashbackAdminService,
    FlashbackRoundBuilder,
    FlashbackJob,
    PgFlashbackRoomsRepository,
    { provide: FLASHBACK_ROOMS_REPOSITORY, useExisting: PgFlashbackRoomsRepository },
    PgFlashbackDatasetRepository,
    { provide: FLASHBACK_DATASET_REPOSITORY, useExisting: PgFlashbackDatasetRepository },
    MarketFlashbackDatasetSource,
    { provide: FLASHBACK_DATASET_SOURCE, useExisting: MarketFlashbackDatasetSource },
    FlashbackDatasetBuilder,
    FlashbackDatasetCuts,
    FlashbackDatasetJob,
    FlashbackDatasetAdminService,
    FlashbackRoomDataset,
    { provide: FB_DATASET, useExisting: FlashbackRoomDataset },
    FlashbackRoomsService,
    PgFlashbackChatRepository,
    { provide: FLASHBACK_CHAT_REPOSITORY, useExisting: PgFlashbackChatRepository },
    FlashbackChatService,
    FlashbackRoomsJob,
  ],
  exports: [
    FlashbackService,
    FlashbackAdminService,
    FlashbackJob,
    FlashbackRoomsService,
    FlashbackRoomsJob,
    FlashbackDatasetJob,
    FlashbackDatasetBuilder,
    FlashbackDatasetCuts,
    FLASHBACK_REPOSITORY,
  ],
})
export class FlashbackModule {}
