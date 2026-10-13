import { describe, expect, it } from 'vitest';

import { buildBrokerCurrentViews, thesisEvidence } from '../../src/modules/research/engine/current-view.js';
import { TODAY, claim, report, thesis } from './research-engine-helpers.js';

describe('thesisEvidence', () => {
  const t1 = thesis({ id: 't1' });
  it('keeps the newest claim per broker, sorted brokers, in-window and active only', () => {
    const claims = [
      claim({ id: 'a1', reportId: 'r1', broker: 'VIETCAP', evidenceDate: '2026-10-01' }),
      claim({ id: 'a2', reportId: 'r2', broker: 'VIETCAP', evidenceDate: '2026-10-14' }),
      claim({ id: 'b1', reportId: 'r3', broker: 'SSI', evidenceDate: '2026-10-05' }),
      claim({ id: 'old', reportId: 'r4', broker: 'MBS', evidenceDate: '2026-09-10' }), // 36 days
      claim({ id: 'sup', reportId: 'r5', broker: 'HSC', evidenceDate: '2026-10-10', status: 'superseded' }),
    ];
    const links = ['a1', 'a2', 'b1', 'old', 'sup'].map((claimId) => ({
      thesisId: 't1',
      claimId,
      relationship: 'support' as const,
    }));
    const e = thesisEvidence([t1], links, claims, TODAY).get('t1')!;
    expect(e.brokers).toEqual(['SSI', 'VIETCAP']);
    expect(e.perBroker.map((p) => p.claim.id)).toEqual(['b1', 'a2']);
  });

  it('ties on evidenceDate go to the later claim in input order', () => {
    const claims = [
      claim({ id: 'x1', reportId: 'r1', broker: 'SSI', evidenceDate: '2026-10-05' }),
      claim({ id: 'x2', reportId: 'r2', broker: 'SSI', evidenceDate: '2026-10-05' }),
    ];
    const links = [
      { thesisId: 't1', claimId: 'x1', relationship: 'support' as const },
      { thesisId: 't1', claimId: 'x2', relationship: 'support' as const },
    ];
    expect(thesisEvidence([t1], links, claims, TODAY).get('t1')!.perBroker[0]!.claim.id).toBe('x2');
  });

  it('a newer replace/contradict from the same broker retires its older claims', () => {
    const claims = [
      claim({ id: 'old', reportId: 'r1', broker: 'VIETCAP', evidenceDate: '2026-10-01' }),
      claim({ id: 'new', reportId: 'r2', broker: 'VIETCAP', evidenceDate: '2026-10-14', status: 'superseded' }),
    ];
    const links = [
      { thesisId: 't1', claimId: 'old', relationship: 'support' as const },
      { thesisId: 't1', claimId: 'new', relationship: 'replace' as const },
    ];
    const e = thesisEvidence([t1], links, claims, TODAY).get('t1')!;
    expect(e.perBroker).toEqual([]);
    // A replace from ANOTHER broker does not retire it.
    const other = [claim({ id: 'new', reportId: 'r2', broker: 'SSI', evidenceDate: '2026-10-14' }), claims[0]!];
    const e2 = thesisEvidence([t1], links, other, TODAY).get('t1')!;
    expect(e2.brokers).toEqual(['SSI', 'VIETCAP']);
  });

  it('thesis without evidence gets empty arrays; inactive theses are skipped', () => {
    const res = thesisEvidence(
      [t1, thesis({ id: 'dead', status: 'invalidated' }), thesis({ id: 'upd', status: 'updated' })],
      [],
      [],
      TODAY,
    );
    expect(res.get('t1')).toEqual({ thesisId: 't1', brokers: [], perBroker: [] });
    expect(res.has('dead')).toBe(false);
    expect(res.has('upd')).toBe(true);
  });
});

describe('buildBrokerCurrentViews (tests 16, 17)', () => {
  const r1 = report({ id: 'r1', broker: 'VIETCAP', reportDate: '2026-10-01', targetPriceVnd: 170_000 });
  const r2 = report({ id: 'r2', broker: 'VIETCAP', reportDate: '2026-10-16', targetPriceVnd: 185_000 });
  const claims = [
    claim({ id: 'A1', reportId: 'r1', broker: 'VIETCAP', evidenceDate: '2026-10-01' }),
    claim({ id: 'B1', reportId: 'r1', broker: 'VIETCAP', evidenceDate: '2026-10-01' }),
    claim({ id: 'A2', reportId: 'r2', broker: 'VIETCAP', evidenceDate: '2026-10-16' }),
  ];
  const links = [
    { thesisId: 'tA', claimId: 'A1', relationship: 'support' as const },
    { thesisId: 'tB', claimId: 'B1', relationship: 'support' as const },
    { thesisId: 'tA', claimId: 'A2', relationship: 'update' as const },
  ];

  it('test 16: A from 16/10, B inherited from 01/10, A(01/10) dropped, target 185k only', () => {
    const rows = buildBrokerCurrentViews([r1, r2], claims, links, TODAY);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.latestReportId).toBe('r2');
    expect(row.asOf).toBe('2026-10-16');
    expect(row.latestTargetPrice).toBe(185_000);
    expect(row.claims).toEqual([
      { claimId: 'B1', relationship: 'inherited' },
      { claimId: 'A2', relationship: 'current' },
    ]);
  });

  it('test 17: newest report without target falls back to the nearest one with a target', () => {
    const flash = report({ id: 'r3', broker: 'VIETCAP', reportDate: '2026-10-16', targetPriceVnd: null });
    const row = buildBrokerCurrentViews([r1, flash], [], [], TODAY)[0]!;
    expect(row.latestReportId).toBe('r3');
    expect(row.latestTargetPrice).toBe(170_000);
    expect(row.latestTargetReportId).toBe('r1');
    expect(row.latestTargetReportDate).toBe('2026-10-01');
  });

  it('ignores out-of-window reports and expired claims; one row per broker, sorted', () => {
    const expired = report({ id: 'r9', broker: 'MBS', reportDate: '2026-09-10', targetPriceVnd: 1 });
    const ssi = report({ id: 's1', broker: 'SSI', reportDate: '2026-09-16' }); // exactly 30 days
    const rows = buildBrokerCurrentViews([expired, r1, ssi], [], [], TODAY);
    expect(rows.map((r) => r.broker)).toEqual(['SSI', 'VIETCAP']);
    expect(rows[0]!.latestTargetPrice).toBeNull();
  });

  it('claims inherited from an older report that also expired individually are not kept', () => {
    const c = [claim({ id: 'E', reportId: 'r1', broker: 'VIETCAP', evidenceDate: '2026-09-01' })];
    const row = buildBrokerCurrentViews([r1, r2], c, [], TODAY)[0]!;
    expect(row.claims).toEqual([]);
  });
});
