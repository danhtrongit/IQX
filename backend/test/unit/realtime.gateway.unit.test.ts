import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { RealtimeGateway } from '../../src/modules/realtime/realtime.gateway.js';
import type { RealtimeOptions } from '../../src/modules/realtime/realtime.types.js';

const options: RealtimeOptions = {
  enabled: true,
  ingestEnabled: false,
  maxSymbolsPerConnection: 50,
  maxBufferedBytes: 1_000_000,
  demandTtlMs: 30_000,
  leaderTtlMs: 15_000,
  reconcileMs: 5_000,
};

function socket() {
  return {
    id: 'connection',
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
  };
}

describe('RealtimeGateway subscription lifecycle', () => {
  it('serializes overlapping subscription mutations for the same connection', async () => {
    let resolveSubscribe: ((unsubscribe: () => Promise<void>) => void) | undefined;
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const subscribe = vi.fn(
      async () =>
        await new Promise<() => Promise<void>>((resolve) => {
          resolveSubscribe = resolve;
        }),
    );
    const demand = {
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const gateway = new RealtimeGateway(demand as never, { subscribe } as never, options);
    const client = socket();
    gateway.handleConnection(client);
    const frame = { action: 'subscribe', symbols: ['FPT'], channels: ['tick'] };

    const first = gateway.handleMessage(client, frame);
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
    const overlapping = gateway.handleMessage(client, frame);
    expect(subscribe).toHaveBeenCalledOnce();
    resolveSubscribe?.(unsubscribe);
    await Promise.all([first, overlapping]);

    expect(subscribe).toHaveBeenCalledOnce();
    await gateway.handleDisconnect(client);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('rolls back a partially failed subscribe so the full request can be retried', async () => {
    const firstUnsubscribe = vi
      .fn()
      .mockRejectedValueOnce(new Error('unsubscribe unavailable'))
      .mockResolvedValueOnce(undefined);
    const retryUnsubscribes = [
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
    ];
    const subscribe = vi
      .fn()
      .mockResolvedValueOnce(firstUnsubscribe)
      .mockRejectedValueOnce(new Error('subscriber unavailable'))
      .mockResolvedValueOnce(retryUnsubscribes[0])
      .mockResolvedValueOnce(retryUnsubscribes[1]);
    const demand = { set: vi.fn().mockResolvedValue(undefined), remove: vi.fn() };
    const gateway = new RealtimeGateway(demand as never, { subscribe } as never, options);
    const client = socket();
    gateway.handleConnection(client);
    const frame = {
      action: 'subscribe',
      symbols: ['FPT', 'VNM'],
      channels: ['tick'],
    };

    await expect(gateway.handleMessage(client, frame)).rejects.toThrow('subscriber unavailable');
    expect(firstUnsubscribe).toHaveBeenCalledOnce();
    expect(demand.set).not.toHaveBeenCalled();

    await gateway.handleMessage(client, frame);

    expect(subscribe).toHaveBeenCalledTimes(4);
    expect(demand.set).toHaveBeenCalledWith('connection', [
      { symbol: 'FPT', channel: 'tick' },
      { symbol: 'VNM', channel: 'tick' },
    ]);
    await gateway.handleDisconnect(client);
    expect(firstUnsubscribe).toHaveBeenCalledTimes(2);
    expect(retryUnsubscribes[0]).toHaveBeenCalledOnce();
    expect(retryUnsubscribes[1]).toHaveBeenCalledOnce();
  });

  it('runs every release callback and removes connection state after cleanup failures', async () => {
    const firstUnsubscribe = vi.fn().mockRejectedValue(new Error('unsubscribe failed'));
    const secondUnsubscribe = vi.fn().mockResolvedValue(undefined);
    const subscribe = vi
      .fn()
      .mockResolvedValueOnce(firstUnsubscribe)
      .mockResolvedValueOnce(secondUnsubscribe);
    const demand = {
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockRejectedValue(new Error('demand unavailable')),
    };
    const gateway = new RealtimeGateway(demand as never, { subscribe } as never, options);
    const client = socket();
    gateway.handleConnection(client);
    await gateway.handleMessage(client, {
      action: 'subscribe',
      symbols: ['FPT', 'VNM'],
      channels: ['tick'],
    });

    await expect(gateway.handleDisconnect(client)).resolves.toBeUndefined();

    expect(firstUnsubscribe).toHaveBeenCalledOnce();
    expect(secondUnsubscribe).toHaveBeenCalledOnce();
    expect(demand.remove).toHaveBeenCalledWith('connection');
    const sendsBefore = client.send.mock.calls.length;
    await gateway.handleMessage(client, { action: 'ping' });
    expect(client.send).toHaveBeenCalledTimes(sendsBefore);
  });
});
