import { redisKeyPrefix } from '../redis/redis.constants.js';

export const bullMqPrefix = (appEnvironment: string): string =>
  `${redisKeyPrefix(appEnvironment)}:bullmq`;
