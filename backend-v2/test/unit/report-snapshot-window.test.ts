import { afterEach, describe, expect, it, vi } from 'vitest';
import { isReportSnapshotTime } from '../../src/modules/reports/report-snapshot-window.js';
import { SqlMarketReportInputService } from '../../src/modules/reports/sql-report-input.service.js';
import { MarketInputSnapshotService } from '../../src/modules/market-integration/market-input-snapshot.service.js';

afterEach(() => vi.useRealTimers());

describe('report snapshot time boundaries (ICT)', () => {
  it.each([
    ['premarket', '08:59:59', true],
    ['premarket', '09:00:00', false],
    ['midday', '11:29:59', false],
    ['midday', '11:30:00', true],
    ['midday', '12:59:59', true],
    ['midday', '13:00:00', false],
    ['daily', '15:14:59', false],
    ['daily', '15:15:00', true],
  ] as const)('%s at %s is accepted=%s', (type, time, expected) => {
    expect(isReportSnapshotTime(type, '2026-09-24', new Date(`2026-09-24T${time}+07:00`))).toBe(
      expected,
    );
  });

  it('rejects invalid timestamps and permits previous-session daily snapshots', () => {
    expect(isReportSnapshotTime('daily', '2026-09-24', new Date('invalid'))).toBe(false);
    expect(isReportSnapshotTime('daily', '2026-09-23', new Date('2026-09-24T14:00:00+07:00'))).toBe(
      true,
    );
  });

  it('reuses a stored morning snapshot in the afternoon without recapturing live data', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-24T14:00:00+07:00'));
    const database = {
      query: vi.fn().mockResolvedValue([
        {
          captured_at: '2026-09-24T11:35:00+07:00',
          payload: { vnindex: { close: 1200 } },
          quality: { complete: true },
        },
      ]),
    };
    const snapshots = { capture: vi.fn() };
    const service = new SqlMarketReportInputService(database as never, snapshots as never);
    const result = await service.buildPayload('midday', '2026-09-24');
    expect(result.vnindex).toEqual({ close: 1200 });
    expect(snapshots.capture).not.toHaveBeenCalled();
  });

  it('does not consume an old mislabeled afternoon snapshot for a midday report', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-24T14:00:00+07:00'));
    const database = {
      query: vi
        .fn()
        .mockResolvedValue([
          { captured_at: '2026-09-24T13:35:00+07:00', payload: {}, quality: { complete: true } },
        ]),
    };
    const snapshots = new MarketInputSnapshotService(database as never, {} as never, {} as never);
    const service = new SqlMarketReportInputService(database as never, snapshots);
    await expect(service.buildPayload('midday', '2026-09-24')).rejects.toMatchObject({
      response: { code: 'REPORT_INPUT_WINDOW_UNAVAILABLE' },
    });
    expect(database.query).toHaveBeenCalledTimes(1);
  });
});
