import { afterEach, describe, expect, it, vi } from 'vitest';

import { RuntimeStatusStore } from '../../src/modules/runtime/runtime.status-store.js';
import type { JobExecutionStatus } from '../../src/modules/runtime/runtime.types.js';

const status = (jobId: string, detail?: Record<string, unknown>): JobExecutionStatus => ({
  jobId,
  name: 'reports.daily',
  state: 'completed',
  scheduledFor: '2026-09-23T00:00:00.000Z',
  detail,
});

const disabledRedis = {
  isEnabled: () => false,
  key: vi.fn(),
  execute: vi.fn(),
};

describe('RuntimeStatusStore', () => {
  afterEach(() => vi.useRealTimers());

  it('does not overwrite an existing status when a duplicate enqueue is reported', async () => {
    const store = new RuntimeStatusStore(disabledRedis as never);
    await store.put(status('same-job'));

    await expect(store.putIfAbsent({ ...status('same-job'), state: 'queued' })).resolves.toBe(
      false,
    );
    await expect(store.get('same-job')).resolves.toMatchObject({ state: 'completed' });
  });

  it('hydrates the fallback with the existing Redis status when SET NX loses', async () => {
    const completed = status('shared-job');
    let redisEnabled = true;
    const client = {
      set: vi.fn().mockResolvedValue(null),
      get: vi.fn().mockResolvedValue(JSON.stringify(completed)),
    };
    const redis = {
      isEnabled: () => redisEnabled,
      key: vi.fn(() => 'runtime:shared-job'),
      execute: vi.fn((operation) => operation(client)),
    };
    const store = new RuntimeStatusStore(redis as never);

    await expect(store.putIfAbsent({ ...completed, state: 'queued' })).resolves.toBe(false);
    expect(client.set).toHaveBeenCalledWith(
      'runtime:shared-job',
      expect.any(String),
      'EX',
      expect.any(Number),
      'NX',
    );
    redisEnabled = false;
    await expect(store.get('shared-job')).resolves.toMatchObject({ state: 'completed' });
  });

  it('expires fallback entries and evicts the oldest entry at capacity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T00:00:00.000Z'));
    const store = new RuntimeStatusStore(disabledRedis as never);
    for (let index = 0; index <= 1_000; index += 1) {
      await store.put(status(`job-${index}`));
    }
    await expect(store.get('job-0')).resolves.toBeNull();
    await expect(store.get('job-1000')).resolves.not.toBeNull();

    vi.advanceTimersByTime(30 * 24 * 60 * 60 * 1_000);
    await expect(store.get('job-1000')).resolves.toBeNull();
  });

  it('bounds oversized details while retaining scalar counters and codes', async () => {
    const store = new RuntimeStatusStore(disabledRedis as never);
    await store.put(
      status('large', {
        processedCount: 42,
        diagnosticCode: 'PARTIAL_IMPORT',
        snapshot: 'x'.repeat(100_000),
      }),
    );

    const stored = await store.get('large');
    expect(stored?.detail).toMatchObject({
      processedCount: 42,
      diagnosticCode: 'PARTIAL_IMPORT',
      _runtimeStatus: { truncated: true },
    });
    expect(Buffer.byteLength(JSON.stringify(stored), 'utf8')).toBeLessThan(33_000);
  });

  it('safely truncates circular diagnostic detail', async () => {
    const store = new RuntimeStatusStore(disabledRedis as never);
    const diagnostic: Record<string, unknown> = { code: 'CYCLE' };
    diagnostic.self = diagnostic;

    await expect(store.put(status('cyclic', diagnostic))).resolves.toBeUndefined();
    await expect(store.get('cyclic')).resolves.toMatchObject({
      detail: {
        code: 'CYCLE',
        self: '[circular]',
        _runtimeStatus: { truncated: true, reasons: ['circular-reference'] },
      },
    });
  });
});
