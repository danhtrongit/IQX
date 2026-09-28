export class RedisDisabledError extends Error {
  constructor() {
    super('Redis is disabled');
    this.name = 'RedisDisabledError';
  }
}

export class RedisConfigurationError extends Error {
  constructor() {
    super('Redis is enabled but REDIS_URL is not configured');
    this.name = 'RedisConfigurationError';
  }
}

export class RedisUnavailableError extends Error {
  constructor() {
    super('Redis is unavailable');
    this.name = 'RedisUnavailableError';
  }
}
