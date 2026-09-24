import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeWithinDeadline } from '../../src/platform/health/shutdown.js';
import { LifecycleService } from '../../src/platform/health/lifecycle.service.js';

describe('shutdown orchestration', () => {
  afterEach(() => vi.useRealTimers());
  it('does not clear its deadline until every resource has closed', async () => {
    vi.useFakeTimers();
    let finishDatabase: (() => void) | undefined;
    const database = new Promise<void>((resolve) => {
      finishDatabase = resolve;
    });
    const close = closeWithinDeadline(async () => {
      await Promise.all([Promise.resolve(), database]);
    }, 1000);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(vi.getTimerCount()).toBe(1);
    finishDatabase?.();
    await close;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects when one resource hangs beyond the deadline', async () => {
    vi.useFakeTimers();
    const close = closeWithinDeadline(() => new Promise<void>(() => {}), 1000);
    const assertion = expect(close).rejects.toThrow('Shutdown deadline exceeded');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('marks readiness draining before resource closure', () => {
    const lifecycle = new LifecycleService();
    expect(lifecycle.isDraining()).toBe(false);
    lifecycle.beginDraining();
    expect(lifecycle.isDraining()).toBe(true);
  });
});
