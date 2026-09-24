import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

import type { Environment } from '../config/environment.js';
import { redisKeyPrefix } from './redis.constants.js';
import {
  RedisConfigurationError,
  RedisDisabledError,
  RedisUnavailableError,
} from './redis.errors.js';
import type { InfrastructureHealth } from './redis.types.js';

const KEY_SEGMENT_SEPARATOR = ':';

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly enabled: boolean;
  private readonly redisUrl: string | undefined;
  private readonly timeoutMs: number;
  private readonly namespace: string;

  private client: Redis | undefined;
  private connectionAttempt: Promise<Redis> | undefined;
  private closed = false;

  constructor(private readonly config: ConfigService<Environment, true>) {
    this.enabled = this.config.get('REDIS_ENABLED', { infer: true });
    this.redisUrl = this.config.get('REDIS_URL', { infer: true });
    this.timeoutMs = this.config.get('REDIS_CONNECT_TIMEOUT_MS', { infer: true });
    this.namespace = redisKeyPrefix(this.config.get('APP_ENV', { infer: true }));
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  key(...segments: readonly string[]): string {
    if (segments.length === 0) {
      return this.namespace;
    }

    const validatedSegments = segments.map((segment) => {
      const trimmed = segment.trim();
      if (trimmed.length === 0) {
        throw new TypeError('Redis key segments must not be empty');
      }
      return trimmed;
    });

    return [this.namespace, ...validatedSegments].join(KEY_SEGMENT_SEPARATOR);
  }

  async getClient(): Promise<Redis> {
    this.assertAvailableConfiguration();

    if (this.client?.status === 'ready') {
      return this.client;
    }

    if (this.connectionAttempt) {
      return this.connectionAttempt;
    }

    if (this.client) {
      this.resetClient(this.client);
    }
    const client = this.createClient();
    this.client = client;
    this.connectionAttempt = this.connect(client);

    try {
      return await this.connectionAttempt;
    } finally {
      this.connectionAttempt = undefined;
    }
  }

  async ping(timeoutMs = this.timeoutMs): Promise<void> {
    const response = await this.execute((client) => client.ping(), timeoutMs);
    if (response !== 'PONG') {
      throw new RedisUnavailableError();
    }
  }

  async execute<T>(
    operation: (client: Redis) => Promise<T>,
    timeoutMs = this.timeoutMs,
  ): Promise<T> {
    const client = await this.getClient();

    try {
      return await this.withTimeout(operation(client), timeoutMs);
    } catch {
      this.resetClient(client);
      throw new RedisUnavailableError();
    }
  }

  async health(): Promise<InfrastructureHealth> {
    if (!this.enabled) {
      return { status: 'disabled' };
    }

    try {
      await this.ping();
      return { status: 'up' };
    } catch {
      return { status: 'down' };
    }
  }

  async readiness(): Promise<InfrastructureHealth> {
    return this.health();
  }

  async close(): Promise<void> {
    this.closed = true;
    const client = this.client;
    const connectionAttempt = this.connectionAttempt;
    this.client = undefined;
    this.connectionAttempt = undefined;

    if (!client) {
      return;
    }

    try {
      if (connectionAttempt) {
        await Promise.allSettled([connectionAttempt]);
      }
      if (client.status === 'ready') {
        await this.withTimeout(client.quit(), this.timeoutMs);
      }
    } catch {
      // Shutdown must remain bounded even when Redis is already unavailable.
    } finally {
      client.disconnect(false);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }

  private assertAvailableConfiguration(): void {
    if (!this.enabled) {
      throw new RedisDisabledError();
    }
    if (this.closed) {
      throw new RedisUnavailableError();
    }
    if (!this.redisUrl) {
      throw new RedisConfigurationError();
    }
  }

  private createClient(): Redis {
    // The URL is intentionally never interpolated into logs or thrown errors.
    const client = new Redis(this.redisUrl as string, {
      lazyConnect: true,
      connectTimeout: this.timeoutMs,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });

    client.on('error', () => {
      this.logger.warn('Redis connection error');
    });

    return client;
  }

  private async connect(client: Redis): Promise<Redis> {
    try {
      await this.withTimeout(client.connect(), this.timeoutMs);
      return client;
    } catch {
      this.resetClient(client);
      throw new RedisUnavailableError();
    }
  }

  private resetClient(client: Redis): void {
    client.disconnect(false);
    if (this.client === client) {
      this.client = undefined;
    }
  }

  private async withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new RedisUnavailableError()), timeoutMs);
    });

    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
