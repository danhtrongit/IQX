import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { RedisService } from '../../platform/redis/redis.service.js';

type Listener = (payload: Record<string, unknown>) => void;

@Injectable()
export class RealtimePubSub implements OnApplicationShutdown {
  private readonly logger = new Logger(RealtimePubSub.name);
  private readonly listeners = new Map<string, Set<Listener>>();
  private subscriber: Redis | undefined;
  private opening: Promise<Redis> | undefined;
  private readonly subscriptions = new Map<string, Promise<void>>();

  constructor(private readonly redis: RedisService) {}

  async publish(channel: string, payload: Record<string, unknown>): Promise<void> {
    await this.redis.execute((client) =>
      client.publish(this.physical(channel), JSON.stringify(payload)),
    );
  }

  async subscribe(channel: string, listener: Listener): Promise<() => Promise<void>> {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
      const subscribing = (async () => {
        const subscriber = await this.getSubscriber();
        await subscriber.subscribe(this.physical(channel));
      })();
      this.subscriptions.set(channel, subscribing);
    }
    set.add(listener);
    try {
      await this.subscriptions.get(channel);
    } catch (error) {
      set.delete(listener);
      if (!set.size) {
        this.listeners.delete(channel);
        this.subscriptions.delete(channel);
      }
      throw error;
    }
    return async () => {
      const current = this.listeners.get(channel);
      current?.delete(listener);
      if (current?.size === 0) {
        this.listeners.delete(channel);
        this.subscriptions.delete(channel);
        await this.subscriber?.unsubscribe(this.physical(channel));
      }
    };
  }

  async onApplicationShutdown(): Promise<void> {
    const subscriber = this.subscriber;
    this.subscriber = undefined;
    this.listeners.clear();
    this.subscriptions.clear();
    if (subscriber) {
      try {
        await subscriber.quit();
      } catch {
        subscriber.disconnect(false);
      }
    }
  }

  private async getSubscriber(): Promise<Redis> {
    if (this.subscriber?.status === 'ready') return this.subscriber;
    if (this.opening) return this.opening;
    this.opening = (async () => {
      const base = await this.redis.getClient();
      const subscriber = base.duplicate({ lazyConnect: true, maxRetriesPerRequest: 1 });
      subscriber.on('message', (channel, payload) => {
        const logical = channel.slice(this.physical('').length);
        try {
          const decoded: unknown = JSON.parse(payload);
          if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return;
          for (const listener of this.listeners.get(logical) ?? [])
            listener(decoded as Record<string, unknown>);
        } catch {
          this.logger.warn('Discarded malformed realtime payload');
        }
      });
      subscriber.on('error', () => this.logger.warn('Realtime Redis subscriber error'));
      await subscriber.connect();
      this.subscriber = subscriber;
      return subscriber;
    })();
    try {
      return await this.opening;
    } finally {
      this.opening = undefined;
    }
  }

  private physical(channel: string): string {
    return `${this.redis.key('realtime', 'pubsub')}:${channel}`;
  }
}
