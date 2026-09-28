import { describe, expect, it } from 'vitest';
import { readConflict } from '../../src/modules/journey/cap6/conflict.js';
import {
  averagePositionRows,
  countConsistent,
  isConsistentOrder,
} from '../../src/modules/journey/cap6/rules.js';

describe('Cap6 conflict and graduation rules', () => {
  it('separates opposing, neutral and support layers and activates veto only at rank one', () => {
    const result = readConflict(
      {
        L1: { statusLabel: 'Rất mạnh' },
        L3: { statusLabel: 'Trung tính' },
        L4: { statusLabel: 'Cảnh báo mạnh' },
        L5: { statusLabel: 'Tiêu cực' },
      },
      { sessionDate: '2026-09-23' },
    );
    expect(result.co_mau_thuan).toBe(true);
    expect(result.ung_ho.map((row) => row.lop)).toEqual(['ky_thuat']);
    expect(result.trung_tinh.map((row) => row.lop)).toEqual(['dong_tien']);
    expect(result.lop_phu_quyet_xau).toEqual(['noi_bo']);
    expect(result.nguoc.find((row) => row.lop === 'tin_tuc')?.la_phu_quyet).toBe(true);
  });

  it('does not count unclear levels or large serious positions', () => {
    expect(isConsistentOrder({ had_conflict: true, conflict_level: 'nghiem', pct_von: 10 })).toBe(
      true,
    );
    expect(
      isConsistentOrder({ had_conflict: true, conflict_level: 'nghiem', pct_von: 10.01 }),
    ).toBe(false);
    expect(
      isConsistentOrder({ had_conflict: true, conflict_level: 'ngai', pct_von: 5 }),
    ).toBeNull();
  });

  it('deduplicates same-symbol skips on one Vietnam session', () => {
    const result = countConsistent(
      [],
      [
        {
          symbol: 'AAA',
          at: '2026-09-23T02:00:00Z',
          had_conflict: true,
          had_veto: false,
          conflict_level: 'nghiem',
        },
        {
          symbol: 'AAA',
          at: '2026-09-23T04:00:00Z',
          had_conflict: true,
          had_veto: true,
          conflict_level: 'nghiem',
        },
        {
          symbol: 'BBB',
          at: '2026-09-23T04:00:00Z',
          had_conflict: true,
          had_veto: true,
          conflict_level: 'nhe',
        },
      ],
    );
    expect(result.consistent).toBe(2);
    expect(result.vetoConsistent).toBe(1);
  });

  it('keeps unknown average and match values nullable', () => {
    const rows = averagePositionRows([{ had_conflict: true, conflict_level: 'nhe', pct_von: 10 }]);
    expect(rows.find((row) => row.level === 'nghiem')?.average).toBeNull();
    expect(rows.find((row) => row.level === 'nhe')?.matches).toBeNull();
  });
});
