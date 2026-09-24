import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { HealthController, LegacyHealthController } from './health.controller.js';
import { LifecycleService } from './lifecycle.service.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';

@Module({
  imports: [DatabaseModule, RedisModule, RateLimitModule],
  controllers: [HealthController, LegacyHealthController],
  providers: [LifecycleService],
})
export class HealthModule {}
