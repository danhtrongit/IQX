import { resetHeartbeatState, runHeartbeat } from '../heartbeat';

describe('runHeartbeat throttling', () => {
  beforeEach(() => resetHeartbeatState());

  it('shares one in-flight request between concurrent callers', async () => {
    let resolve!: (v: Record<string, unknown>) => void;
    const refresh = jest.fn(() => new Promise<Record<string, unknown>>((r) => (resolve = r)));
    const a = runHeartbeat({ refresh, now: () => 1000 });
    const b = runHeartbeat({ refresh, now: () => 1001 });
    expect(refresh).toHaveBeenCalledTimes(1);
    resolve({ orders_filled: 0 });
    await Promise.all([a, b]);
  });

  it('enforces the minimum gap, then allows the next run', async () => {
    const refresh = jest.fn(async () => ({ orders_filled: 0 }));
    let t = 10_000;
    await runHeartbeat({ refresh, now: () => t, minGapMs: 3000 });
    t += 1000;
    expect(await runHeartbeat({ refresh, now: () => t, minGapMs: 3000 })).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
    t += 2500;
    await runHeartbeat({ refresh, now: () => t, minGapMs: 3000 });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('calls onChanged only when a counter is positive', async () => {
    const onChanged = jest.fn();
    let t = 0;
    await runHeartbeat({ refresh: async () => ({ orders_filled: 0, warnings: ['x'] }), now: () => (t += 5000), onChanged });
    expect(onChanged).not.toHaveBeenCalled();
    await runHeartbeat({ refresh: async () => ({ orders_filled: 1 }), now: () => (t += 5000), onChanged });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('swallows failures and frees the slot', async () => {
    let t = 0;
    const refresh = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({});
    expect(await runHeartbeat({ refresh, now: () => (t += 5000) })).toBeNull();
    await runHeartbeat({ refresh, now: () => (t += 5000) });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
