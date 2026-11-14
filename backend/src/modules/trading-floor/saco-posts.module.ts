/**
 * SACO nhận định của Khu giao dịch: bài viết, ảnh, tim, bình luận và quản trị. Dùng chung `FloorEvents`
 * với `TradingFloorModule` (qua `FloorEventsModule`) để đẩy bài mới, tim và bình luận tới người trong khu.
 */

import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AuthModule } from '../auth/index.js';
import { FloorEventsModule } from './floor-events.js';
import { SacoPostsAuthorController } from './saco-posts-author.controller.js';
import { SacoPostsImagesService } from './saco-posts-images.service.js';
import { SacoPostsManageController } from './saco-posts-manage.controller.js';
import { SacoPostsController } from './saco-posts.controller.js';
import { PgSacoPostsRepository, SACO_POSTS_REPOSITORY } from './saco-posts.repository.js';
import {
  COMMENT_COOLDOWN_MS,
  SACO_COMMENT_COOLDOWN_MS,
  SacoPostsService,
} from './saco-posts.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, FloorEventsModule],
  controllers: [SacoPostsController, SacoPostsAuthorController, SacoPostsManageController],
  providers: [
    PgSacoPostsRepository,
    { provide: SACO_POSTS_REPOSITORY, useExisting: PgSacoPostsRepository },
    { provide: SACO_COMMENT_COOLDOWN_MS, useValue: COMMENT_COOLDOWN_MS },
    SacoPostsImagesService,
    SacoPostsService,
  ],
  exports: [SacoPostsService],
})
export class SacoPostsModule {}
