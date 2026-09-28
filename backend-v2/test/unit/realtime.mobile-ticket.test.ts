import { describe, expect, it, vi } from 'vitest';
import { RealtimeMobileTicketStore } from '../../src/modules/realtime/mobile-ticket.js';

describe('realtime mobile tickets', () => {
  it('issues a short lived opaque ticket and consumes it once', () => {
    const store = new RealtimeMobileTicketStore();
    const issued = store.issue('user-1');
    expect(issued.ticket).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(store.consume(issued.ticket)).toBe('user-1');
    expect(store.consume(issued.ticket)).toBeNull();
  });

  it('rejects unknown, malformed, and expired tickets', () => {
    const store = new RealtimeMobileTicketStore();
    expect(store.consume('nope')).toBeNull();
    expect(store.consume('x'.repeat(257))).toBeNull();
    vi.useFakeTimers();
    try {
      const issued = store.issue('user-1', 1000);
      vi.advanceTimersByTime(1001);
      expect(store.consume(issued.ticket)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
