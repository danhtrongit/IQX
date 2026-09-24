import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { setTimeout as delayUntil } from 'node:timers/promises';

import { RealtimeDemandService } from './realtime.demand.js';
import { RealtimeLeaderLease, type LeaderLease } from './realtime.lease.js';
import { normalizePayload } from './normalize.js';
import { eventChannel } from './protocol.js';
import { RealtimePubSub } from './realtime.pubsub.js';
import { REALTIME_OPTIONS, type MarketStreamPort, type RealtimeOptions } from './realtime.types.js';

@Injectable()
export class RealtimeBridge implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeBridge.name);
  private readonly owner = `${process.pid}-${crypto.randomUUID()}`;
  private stopSignal = false;
  private readonly shutdownSignal = new AbortController();
  private task: Promise<void> | undefined;
  private lease: LeaderLease | null = null;
  private stream: MarketStreamPort | undefined;

  constructor(
    private readonly demand: RealtimeDemandService,
    private readonly leader: RealtimeLeaderLease,
    private readonly pubsub: RealtimePubSub,
    @Inject(REALTIME_OPTIONS) private readonly options: RealtimeOptions,
  ) {}

  onModuleInit(): void {
    if (this.options.ingestEnabled && this.options.providerFactory) this.task = this.run();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopSignal = true;
    this.shutdownSignal.abort();
    await this.stream?.close();
    await this.task;
    if (this.lease) await this.leader.release(this.lease).catch(() => undefined);
    this.lease = null;
  }

  start(): void {
    if (!this.task) this.task = this.run();
  }

  private async run(): Promise<void> {
    while (!this.stopSignal) {
      try {
        if (!this.options.providerFactory) return;
        const lease = await this.leader.acquire(this.owner);
        if (!lease) {
          await this.delay(this.options.reconcileMs);
          continue;
        }
        this.lease = lease;
        this.stream = this.options.providerFactory();
        await this.stream.connect();
        await this.lead(lease, this.stream);
      } catch (error) {
        if (!this.stopSignal) {
          this.logger.warn(
            `Realtime upstream unavailable: ${error instanceof Error ? error.name : 'unknown'}`,
          );
        }
      } finally {
        await this.stream?.close().catch(() => undefined);
        this.stream = undefined;
        if (this.lease) await this.leader.release(this.lease).catch(() => undefined);
        this.lease = null;
      }
      await this.delay(Math.min(this.options.reconcileMs * 2, 30_000));
    }
  }

  private async lead(lease: LeaderLease, stream: MarketStreamPort): Promise<void> {
    let active = true;
    const pump = (async () => {
      for await (const message of stream.messages()) {
        if (!active || this.stopSignal) return;
        await this.pubsub.publish(eventChannel(message.channel, message.symbol), {
          ...normalizePayload(message.channel, message.symbol, message.payload),
          _meta: { fence: lease.fence },
        });
      }
      throw new Error('Realtime upstream closed');
    })();
    const control = (async () => {
      while (active && !this.stopSignal) {
        if (!(await this.leader.renew(lease))) throw new Error('Realtime leadership lost');
        await stream.updateSubscriptions(await this.demand.current());
        await this.delay(this.options.reconcileMs);
      }
    })();
    try {
      await Promise.race([pump, control]);
    } finally {
      active = false;
      await stream.close().catch(() => undefined);
      await Promise.allSettled([pump, control]);
    }
  }

  private async delay(ms: number): Promise<void> {
    await delayUntil(ms, undefined, { signal: this.shutdownSignal.signal }).catch(() => undefined);
  }
}
