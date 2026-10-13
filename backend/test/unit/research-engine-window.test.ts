import { describe, expect, it } from 'vitest';

import { isWithinWindow, vnToday, windowStart } from '../../src/modules/research/engine/window.js';

describe('research window (spec §8, test 5)', () => {
  it('exactly 30 days is active, 31 is expired', () => {
    expect(isWithinWindow('2026-09-16', '2026-10-16')).toBe(true);
    expect(isWithinWindow('2026-09-15', '2026-10-16')).toBe(false);
  });

  it('handles month/year/leap boundaries without drift', () => {
    expect(isWithinWindow('2025-12-31', '2026-01-30')).toBe(true);
    expect(isWithinWindow('2025-12-31', '2026-01-31')).toBe(false);
    expect(windowStart('2026-03-01')).toBe('2026-01-30');
    expect(windowStart('2024-03-01')).toBe('2024-01-31');
    expect(windowStart('2026-10-16', 0)).toBe('2026-10-16');
  });

  it('keeps today and future dates active; honours a custom window', () => {
    expect(isWithinWindow('2026-10-16', '2026-10-16')).toBe(true);
    expect(isWithinWindow('2026-10-20', '2026-10-16')).toBe(true);
    expect(isWithinWindow('2026-10-09', '2026-10-16', 7)).toBe(true);
    expect(isWithinWindow('2026-10-08', '2026-10-16', 7)).toBe(false);
  });

  it('vnToday uses Asia/Ho_Chi_Minh (UTC+7)', () => {
    expect(vnToday(new Date('2026-10-15T17:30:00Z'))).toBe('2026-10-16');
    expect(vnToday(new Date('2026-10-15T16:59:00Z'))).toBe('2026-10-15');
    expect(vnToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
