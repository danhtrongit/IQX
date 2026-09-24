import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defaultRuntimeSchedules,
  WeekdayCalendar,
} from '../../src/modules/runtime/runtime.schedules.js';

describe('runtime schedules', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('registers every migrated job with an explicit enabled flag', () => {
    const schedules = defaultRuntimeSchedules();
    expect(schedules.length).toBeGreaterThanOrEqual(14);
    expect(schedules.every((schedule) => typeof schedule.enabled === 'boolean')).toBe(true);
    expect(schedules.find((schedule) => schedule.name === 'reports.daily')?.tradingDay).toBe(true);
  });

  it('does not run scheduled market jobs on weekends', async () => {
    const calendar = new WeekdayCalendar();
    await expect(calendar.isTradingDay('2026-09-20')).resolves.toBe(false);
    await expect(calendar.isTradingDay('2026-09-21')).resolves.toBe(true);
  });

  it('keeps alert scanning disabled unless the documented flag enables it', () => {
    vi.stubEnv('ALERT_SCAN_ENABLED', 'false');
    expect(
      defaultRuntimeSchedules().find((schedule) => schedule.name === 'alerts.scan')?.enabled,
    ).toBe(false);

    vi.stubEnv('ALERT_SCAN_ENABLED', 'true');
    expect(
      defaultRuntimeSchedules().find((schedule) => schedule.name === 'alerts.scan')?.enabled,
    ).toBe(true);
  });

  it('lets the per-job flag explicitly override the alert scan default', () => {
    vi.stubEnv('ALERT_SCAN_ENABLED', 'true');
    vi.stubEnv('JOB_ALERTS_SCAN_ENABLED', 'false');
    expect(
      defaultRuntimeSchedules().find((schedule) => schedule.name === 'alerts.scan')?.enabled,
    ).toBe(false);
  });
});
