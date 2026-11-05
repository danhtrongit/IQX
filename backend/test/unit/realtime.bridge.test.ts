import { describe, expect, it, vi } from 'vitest';

import { describeUpstreamError, RealtimeBridge } from '../../src/modules/realtime/realtime.bridge.js';
import type {
  MarketStreamPort,
  RealtimeSubscription,
} from '../../src/modules/realtime/realtime.types.js';

class IdleStream implements MarketStreamPort {
  readonly updateSubscriptions = vi
    .fn<(subscriptions: readonly RealtimeSubscription[]) => Promise<void>>()
    .mockResolvedValue(undefined);
  private finish: (() => void) | undefined;
  async connect(): Promise<void> {}
  async *messages() {
    yield* [] as Array<{ channel: 'tick'; symbol: string; payload: Record<string, unknown> }>;
    await new Promise<void>((resolve) => {
      this.finish = resolve;
    });
    return;
  }
  async close(): Promise<void> {
    this.finish?.();
  }
}

describe('describeUpstreamError', () => {
  it('keeps the reason a connection failed', () => {
    expect(describeUpstreamError(new Error('DNSE authentication failed (401)'))).toBe(
      'Error: DNSE authentication failed (401)',
    );
    expect(
      describeUpstreamError(
        new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ECONNRESET' }) }),
      ),
    ).toBe('TypeError: fetch failed (ECONNRESET)');
    expect(describeUpstreamError('nope')).toBe('unknown');
  });

  it('removes URLs and tokens a driver message may quote', () => {
    const text = describeUpstreamError(
      new Error(
        'failed wss://user:secret@host/wss?token=abc Bearer abc.def header eyJhbGciOi.eyJzdWIi.c2ln',
      ),
    );
    expect(text).toBe('Error: failed [url] [token] header [token]');
  });
});

describe('RealtimeBridge leadership control loop', () => {
  it('renews leadership and reconciles demand while the upstream is idle', async () => {
    const stream = new IdleStream();
    const demand = { current: vi.fn().mockResolvedValue([{ symbol: 'FPT', channel: 'tick' }]) };
    const leader = {
      acquire: vi.fn().mockResolvedValue({ owner: 'owner', fence: 7 }),
      renew: vi.fn().mockResolvedValue(true),
      release: vi.fn().mockResolvedValue(undefined),
    };
    const bridge = new RealtimeBridge(
      demand as never,
      leader as never,
      { publish: vi.fn() } as never,
      {
        enabled: true,
        ingestEnabled: true,
        maxSymbolsPerConnection: 90,
        maxBufferedBytes: 1_000_000,
        demandTtlMs: 30_000,
        leaderTtlMs: 15_000,
        reconcileMs: 5,
        providerFactory: () => stream,
      },
    );
    bridge.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await bridge.onApplicationShutdown();
    expect(leader.renew).toHaveBeenCalled();
    expect(stream.updateSubscriptions).toHaveBeenCalledWith([{ symbol: 'FPT', channel: 'tick' }]);
    expect(leader.release).toHaveBeenCalled();
  });
});
