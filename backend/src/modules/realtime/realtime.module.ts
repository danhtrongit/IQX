import { Module, type DynamicModule } from '@nestjs/common';

import { RealtimeBridge } from './realtime.bridge.js';
import { RealtimeDemandService } from './realtime.demand.js';
import { RealtimeGateway, RealtimeV2Gateway } from './realtime.gateway.js';
import { RealtimeLeaderLease } from './realtime.lease.js';
import { RealtimePubSub } from './realtime.pubsub.js';
import { REALTIME_OPTIONS, type RealtimeOptions } from './realtime.types.js';
import { RedisModule } from '../../platform/redis/redis.module.js';

@Module({})
export class RealtimeModule {
  static register(options: Partial<RealtimeOptions> = {}): DynamicModule {
    const defaults: RealtimeOptions = {
      enabled: options.enabled ?? false,
      v1CompatibilityEnabled: options.v1CompatibilityEnabled ?? true,
      ingestEnabled: options.ingestEnabled ?? false,
      maxSymbolsPerConnection: options.maxSymbolsPerConnection ?? 50,
      maxBufferedBytes: options.maxBufferedBytes ?? 1_000_000,
      demandTtlMs: options.demandTtlMs ?? 30_000,
      leaderTtlMs: options.leaderTtlMs ?? 15_000,
      reconcileMs: options.reconcileMs ?? 5_000,
      providerFactory: options.providerFactory,
    };
    return {
      module: RealtimeModule,
      imports: [RedisModule],
      providers: [
        { provide: REALTIME_OPTIONS, useValue: defaults },
        RealtimeDemandService,
        RealtimeLeaderLease,
        RealtimePubSub,
        RealtimeGateway,
        RealtimeV2Gateway,
        RealtimeBridge,
      ],
      exports: [
        RealtimeGateway,
        RealtimeV2Gateway,
        RealtimeBridge,
        RealtimeDemandService,
        RealtimePubSub,
      ],
    };
  }
}
