import { Inject, Injectable } from '@nestjs/common';

import { RedisService } from '../../platform/redis/redis.service.js';
import { REALTIME_OPTIONS, type RealtimeOptions } from './realtime.types.js';

export type LeaderLease = { owner: string; fence: number };

const ACQUIRE = `
if redis.call('exists', KEYS[1]) == 1 then return nil end
local fence = redis.call('incr', KEYS[2])
redis.call('psetex', KEYS[1], ARGV[1], cjson.encode({owner=ARGV[2], fence=fence}))
return fence`;
const RENEW = `
local raw = redis.call('get', KEYS[1]); if not raw then return 0 end
local lease = cjson.decode(raw)
if lease.owner ~= ARGV[2] or tostring(lease.fence) ~= ARGV[3] then return 0 end
redis.call('pexpire', KEYS[1], ARGV[1]); return 1`;
const RELEASE = `
local raw = redis.call('get', KEYS[1]); if not raw then return 0 end
local lease = cjson.decode(raw)
if lease.owner ~= ARGV[1] or tostring(lease.fence) ~= ARGV[2] then return 0 end
return redis.call('del', KEYS[1])`;

@Injectable()
export class RealtimeLeaderLease {
  constructor(
    private readonly redis: RedisService,
    @Inject(REALTIME_OPTIONS) private readonly options: RealtimeOptions,
  ) {}

  async acquire(owner: string): Promise<LeaderLease | null> {
    const result = await this.redis.execute((client) =>
      client.eval(
        ACQUIRE,
        2,
        this.leaderKey(),
        this.fenceKey(),
        String(this.options.leaderTtlMs),
        owner,
      ),
    );
    return result === null ? null : { owner, fence: Number(result) };
  }

  async renew(lease: LeaderLease): Promise<boolean> {
    const result = await this.redis.execute((client) =>
      client.eval(
        RENEW,
        1,
        this.leaderKey(),
        String(this.options.leaderTtlMs),
        lease.owner,
        String(lease.fence),
      ),
    );
    return Number(result) === 1;
  }

  async release(lease: LeaderLease): Promise<void> {
    await this.redis.execute((client) =>
      client.eval(RELEASE, 1, this.leaderKey(), lease.owner, String(lease.fence)),
    );
  }

  private leaderKey(): string {
    return this.redis.key('realtime', 'leader');
  }
  private fenceKey(): string {
    return this.redis.key('realtime', 'fence');
  }
}
