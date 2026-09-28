import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type QueueOptions } from 'bullmq';
import type { Redis } from 'ioredis';

import type { Environment } from '../config/environment.js';
import { RedisService } from '../redis/redis.service.js';
import type { InfrastructureHealth } from '../redis/redis.types.js';
import { bullMqPrefix } from './queue.constants.js';
import { QueueDisabledError, QueueUnavailableError } from './queue.errors.js';

type ManagedQueueOptions = Omit<QueueOptions, 'connection' | 'prefix'>;

@Injectable()
export class QueueService implements OnApplicationShutdown {
  private readonly enabled: boolean;
  private readonly queuePrefix: string;
  private readonly queues = new Map<string, Queue>();
  private readonly queueCreations = new Map<string, Promise<Queue>>();
  private closed = false;

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly redis: RedisService,
  ) {
    this.enabled = this.config.get('QUEUE_ENABLED', { infer: true });
    this.queuePrefix = bullMqPrefix(this.config.get('APP_ENV', { infer: true }));
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  prefix(): string {
    return this.queuePrefix;
  }

  async getConnection(): Promise<Redis> {
    this.assertEnabled();
    return this.redis.getClient();
  }

  async createQueue(name: string, options: ManagedQueueOptions = {}): Promise<Queue> {
    this.assertEnabled();
    this.validateQueueName(name);

    const existing = this.queues.get(name);
    if (existing) {
      return existing;
    }

    const inProgress = this.queueCreations.get(name);
    if (inProgress) {
      return inProgress;
    }

    const creation = this.initializeQueue(name, options);
    this.queueCreations.set(name, creation);
    try {
      return await creation;
    } finally {
      this.queueCreations.delete(name);
    }
  }

  async health(): Promise<InfrastructureHealth> {
    if (!this.enabled) {
      return { status: 'disabled' };
    }
    if (this.closed || !this.redis.isEnabled()) {
      return { status: 'down' };
    }

    const redisHealth = await this.redis.health();
    return { status: redisHealth.status === 'up' ? 'up' : 'down' };
  }

  async readiness(): Promise<InfrastructureHealth> {
    return this.health();
  }

  async assertReady(): Promise<void> {
    const health = await this.health();
    if (health.status !== 'up') {
      throw new QueueUnavailableError();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.allSettled(this.queueCreations.values());
    const queues = [...this.queues.values()];
    this.queues.clear();
    await Promise.allSettled(queues.map((queue) => queue.close()));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new QueueDisabledError();
    }
    if (this.closed) {
      throw new QueueUnavailableError();
    }
  }

  private async initializeQueue(name: string, options: ManagedQueueOptions): Promise<Queue> {
    await this.assertReady();
    this.assertEnabled();
    const connection = await this.getConnection();
    const queue = new Queue(name, {
      ...options,
      connection,
      prefix: this.queuePrefix,
    });
    this.queues.set(name, queue);
    return queue;
  }

  private validateQueueName(name: string): void {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
      throw new TypeError(
        'Queue names must use lowercase letters, digits, dots, underscores, or hyphens',
      );
    }
  }
}
