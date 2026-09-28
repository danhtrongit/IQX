export const REDIS_APPLICATION_NAMESPACE = 'iqx';
export const REDIS_SCHEMA_NAMESPACE = 'v2';

export const redisKeyPrefix = (appEnvironment: string): string =>
  [REDIS_APPLICATION_NAMESPACE, appEnvironment.toLowerCase(), REDIS_SCHEMA_NAMESPACE].join(':');
