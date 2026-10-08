import { Global, Module } from '@nestjs/common';

import { LESSON_REWARD_PORT } from '../../platform/ports/lesson-reward.port.js';
import { LessonRewardService } from './lesson-reward.service.js';
import { ShopController } from './shop.controller.js';
import { PgShopRepository, ShopRepository } from './shop.repository.js';
import { ShopService } from './shop.service.js';

/**
 * Learning coins (xu), mascot ownership and the shop. Global so the Academy can resolve
 * `LESSON_REWARD_PORT` with `@Optional() @Inject(...)` without importing this module.
 */
@Global()
@Module({
  controllers: [ShopController],
  providers: [
    PgShopRepository,
    { provide: ShopRepository, useExisting: PgShopRepository },
    ShopService,
    LessonRewardService,
    { provide: LESSON_REWARD_PORT, useExisting: LessonRewardService },
  ],
  exports: [ShopService, ShopRepository, LessonRewardService, LESSON_REWARD_PORT],
})
export class ShopModule {}
