import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';

import { RedisService } from '../../platform/redis/redis.service.js';
import {
  REALTIME_OPTIONS,
  type RealtimeOptions,
  type RealtimeSubscription,
} from './realtime.types.js';

type Lease = { subscriptions: RealtimeSubscription[] };

@Injectable()
export class RealtimeDemandService implements OnApplicationShutdown {
  private readonly instanceId = `${process.pid}-${crypto.randomUUID()}`;
  private readonly local = new Map<
    string,
    { subscriptions: RealtimeSubscription[]; timer: ReturnType<typeof setInterval> }
  >();

  constructor(
    private readonly redis: RedisService,
    @Inject(REALTIME_OPTIONS) private readonly options: RealtimeOptions,
  ) {}

  async set(connectionId: string, subscriptions: readonly RealtimeSubscription[]): Promise<void> {
    const existing = this.local.get(connectionId);
    if (existing) clearInterval(existing.timer);
    const normalized = [...subscriptions];
    await this.write(connectionId, normalized);
    const timer = setInterval(
      () => void this.write(connectionId, normalized),
      Math.max(1_000, Math.floor(this.options.demandTtlMs / 3)),
    );
    timer.unref();
    this.local.set(connectionId, { subscriptions: normalized, timer });
  }

  async remove(connectionId: string): Promise<void> {
    const lease = this.local.get(connectionId);
    if (lease) clearInterval(lease.timer);
    this.local.delete(connectionId);
    if (!this.redis.isEnabled()) return;
    try {
      await this.redis.execute((client) => client.del(this.key(connectionId)));
    } catch {
      // TTL guarantees eventual cleanup after a Redis outage.
    }
  }

  async current(): Promise<RealtimeSubscription[]> {
    if (!this.redis.isEnabled()) {
      return this.deduplicate([...this.local.values()].flatMap((value) => value.subscriptions));
    }
    const pattern = this.redis.key('realtime', 'demand', '*');
    const leases: RealtimeSubscription[] = [];
    try {
      await this.redis.execute(async (client) => {
        let cursor = '0';
        do {
          const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
          cursor = next;
          if (keys.length) {
            const values = await client.mget(keys);
            for (const value of values) {
              if (!value) continue;
              try {
                const parsed = JSON.parse(value) as Lease;
                if (Array.isArray(parsed.subscriptions)) leases.push(...parsed.subscriptions);
              } catch {
                // One corrupt/foreign lease must not erase valid global demand.
              }
            }
          }
        } while (cursor !== '0');
      });
    } catch {
      return [];
    }
    return this.deduplicate(leases);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([...this.local.keys()].map((id) => this.remove(id)));
  }

  private async write(connectionId: string, subscriptions: RealtimeSubscription[]): Promise<void> {
    if (!this.redis.isEnabled()) return;
    try {
      await this.redis.execute(async (client) => {
        await client.set(
          this.key(connectionId),
          JSON.stringify({ subscriptions } satisfies Lease),
          'PX',
          this.options.demandTtlMs,
        );
      });
    } catch {
      // The WebSocket remains usable; ingestion will catch up on the next lease refresh.
    }
  }

  private key(connectionId: string): string {
    return this.redis.key('realtime', 'demand', `${this.instanceId}-${connectionId}`);
  }

  private deduplicate(values: readonly RealtimeSubscription[]): RealtimeSubscription[] {
    const map = new Map(values.map((value) => [`${value.channel}:${value.symbol}`, value]));
    return [...map.values()];
  }
}
