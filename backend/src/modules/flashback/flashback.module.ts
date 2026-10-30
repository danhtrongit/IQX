/**
 * Module của game Flashback.
 *
 * v2 · Phòng chơi (docs/flashback-v2-rooms): `FlashbackRoomsController/Service/Job`. Bản v1.x (đề
 * chung 2 ngày) giữ lại để đọc dữ liệu lịch sử và quản trị; tác vụ đổi đề không còn chạy theo lịch.
 *
 * Module này dùng `MarketDataModule` (nến ngày), `MarketIntegrationModule` (VN30 hiện hành) và
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
  controllers: [FlashbackController, FlashbackRoomsController, FlashbackAdminController],
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
    FlashbackService,
    FlashbackAdminService,
    FlashbackRoundBuilder,
    FlashbackJob,
    PgFlashbackRoomsRepository,
    { provide: FLASHBACK_ROOMS_REPOSITORY, useExisting: PgFlashbackRoomsRepository },
    FlashbackRoomDataset,
    { provide: FB_DATASET, useExisting: FlashbackRoomDataset },
    FlashbackRoomsService,
    FlashbackRoomsJob,
  ],
  exports: [
    FlashbackService,
    FlashbackAdminService,
    FlashbackJob,
    FlashbackRoomsService,
    FlashbackRoomsJob,
    FLASHBACK_REPOSITORY,
  ],
})
export class FlashbackModule {}
