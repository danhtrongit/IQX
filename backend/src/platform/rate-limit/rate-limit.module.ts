import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import type { Environment } from '../config/environment.js';
import { RedisModule } from '../redis/redis.module.js';
import { RedisService } from '../redis/redis.service.js';
import { createRateLimitOptions } from './rate-limit.options.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

@Global()
@Module({
  imports: [
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigService, RedisService],
      useFactory: (config: ConfigService<Environment, true>, redis: RedisService) =>
        createRateLimitOptions(config, redis),
    }),
  ],
  providers: [
    RedisThrottlerStorage,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
  exports: [ThrottlerModule, RedisThrottlerStorage],
})
export class RateLimitModule {}
