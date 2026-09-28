import type { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

import type { Environment } from '../config/environment.js';
import type { RedisService } from '../redis/redis.service.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

export const createRateLimitOptions = (
  config: ConfigService<Environment, true>,
  redis: RedisService,
): ThrottlerModuleOptions => ({
  throttlers: [
    {
      name: 'public',
      limit: config.get('RATE_LIMIT_MAX', { infer: true }),
      ttl: config.get('RATE_LIMIT_TTL_MS', { infer: true }),
    },
  ],
  // Omitting storage intentionally selects the library's in-memory store for
  // local/test runs where Redis is disabled. Enabled Redis always fails closed.
  storage: config.get('REDIS_ENABLED', { infer: true })
    ? new RedisThrottlerStorage(redis)
    : undefined,
});
