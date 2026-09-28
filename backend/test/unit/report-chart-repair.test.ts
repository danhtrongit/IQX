import { describe, expect, it, vi } from 'vitest';
import { ReportsRepository } from '../../src/modules/reports/reports.repository.js';

describe('report visual-only repair', () => {
  it('links a verified same-session snapshot without replacing narrative or its generation time', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ captured_at: '2026-09-24T08:10:00Z' }])
        .mockResolvedValueOnce([{ id: 'report' }]),
    };
    await new ReportsRepository(database as never).attachChartSnapshot(
      'daily',
      '2026-09-23',
      'snapshot',
    );
    const [sql, values] = database.query.mock.calls[1]!;
    expect(sql).toContain("'chart_snapshot_id'");
    expect(sql).not.toMatch(/generated_at\s*=|headline\s*=|paragraphs\s*=/);
    expect(values).toEqual(['snapshot', 'daily', '2026-09-23']);
  });
  it('rejects wrong-window or absent snapshots without updating a report', async () => {
    const database = {
      query: vi.fn().mockResolvedValue([{ captured_at: '2026-09-24T08:10:00Z' }]),
    };
    await expect(
      new ReportsRepository(database as never).attachChartSnapshot('midday', '2026-09-24', 'bad'),
    ).rejects.toThrow('not valid');
    expect(database.query).toHaveBeenCalledTimes(1);
  });
});
