import { describe, expect, it } from 'vitest';

import { circuitBreak } from '../../src/modules/research/engine/circuit-breaker.js';
import { viewFingerprint } from '../../src/modules/research/engine/fingerprint.js';
import type { ThesisEvidenceEntry } from '../../src/modules/research/engine/current-view.js';
import { buildShortlist, orderTheses } from '../../src/modules/research/engine/ordering.js';
import type {
  CanonicalThesis,
  InvestmentViewThesis,
  PublishedView,
} from '../../src/modules/research/research.types.js';
import { snapshot, thesis } from './research-engine-helpers.js';

const cand = (
  id: string,
  seq: number,
  materiality: number,
  brokerCount: number,
  isRisk = false,
) => ({
  thesis: thesis({ id, seq, materiality, isRisk }),
  brokerCount,
  title: `T ${id}`,
  summary: `S ${id}`,
});

describe('orderTheses', () => {
  it('sorts by materiality, broker count, previous order, seq', () => {
    const out = orderTheses(
      [
        cand('a', 1, 3, 1),
        cand('b', 2, 5, 1),
        cand('c', 3, 3, 3),
        cand('d', 4, 3, 1),
        cand('e', 5, 3, 1),
      ],
      new Map([
        ['e', 1],
        ['d', 2],
      ]),
    );
    expect(out.map((t) => t.id)).toEqual(['b', 'c', 'e', 'd', 'a']);
    expect(out.map((t) => t.order)).toEqual([1, 2, 3, 4, 5]);
    expect(out[0]).toEqual({ id: 'b', order: 1, title: 'T b', summary: 'S b' });
  });

  it('is stable between versions when nothing changes', () => {
    const cs = [cand('x', 2, 3, 2), cand('y', 1, 3, 2), cand('z', 3, 3, 2)];
    const v1 = orderTheses(cs, new Map());
    expect(v1.map((t) => t.id)).toEqual(['y', 'x', 'z']);
    const prev = new Map(v1.map((t) => [t.id, t.order]));
    // Reversing seq would change a fresh sort, but previous order keeps the layout.
    const cs2 = [cand('x', 9, 3, 2), cand('y', 8, 3, 2), cand('z', 7, 3, 2)];
    expect(orderTheses(cs2, prev).map((t) => t.id)).toEqual(['y', 'x', 'z']);
  });

  it('caps at MAX_THESES (5)', () => {
    const cs = Array.from({ length: 8 }, (_, i) => cand(`t${i}`, i, 3, 1));
    expect(orderTheses(cs, new Map())).toHaveLength(5);
  });

  it('forces the best risk thesis in when none made the cut', () => {
    const cs = [
      ...Array.from({ length: 5 }, (_, i) => cand(`p${i}`, i, 4, 2)),
      cand('r1', 10, 2, 1, true),
      cand('r2', 11, 3, 1, true),
    ];
    const out = orderTheses(cs, new Map());
    expect(out.map((t) => t.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'r2']);
  });

  it('does not touch the selection when a risk thesis is already in', () => {
    const cs = [
      ...Array.from({ length: 5 }, (_, i) => cand(`p${i}`, i, 4, 2)),
      cand('r', 10, 1, 1, true),
    ];
    cs[0] = cand('p0', 0, 4, 2, true);
    expect(orderTheses(cs, new Map()).map((t) => t.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
  });

  it('empty input', () => {
    expect(orderTheses([], new Map())).toEqual([]);
  });
});

const th = (id: string, order = 1): InvestmentViewThesis => ({
  id,
  order,
  title: `t${id}`,
  summary: `s${id}`,
});
const published = (ids: string[], median: number | null): PublishedView => ({
  versionId: 'v',
  symbol: 'VIC',
  version: 1,
  inputFingerprint: 'f',
  theses: ids.map((id, i) => th(id, i + 1)),
  valuation: snapshot({ targetMedian: median }),
});

describe('circuitBreak (test 27)', () => {
  it('no previous version → never blocks', () => {
    expect(circuitBreak(null, { theses: [], valuation: snapshot() }, true)).toBeNull();
  });

  it('median moved > 30% blocks; exactly 30% or less passes', () => {
    const prev = published(['a'], 100_000);
    expect(
      circuitBreak(
        prev,
        { theses: [th('a')], valuation: snapshot({ targetMedian: 131_000 }) },
        true,
      ),
    ).toMatch(/median/);
    expect(
      circuitBreak(
        prev,
        { theses: [th('a')], valuation: snapshot({ targetMedian: 60_000 }) },
        true,
      ),
    ).toMatch(/median/);
    expect(
      circuitBreak(
        prev,
        { theses: [th('a')], valuation: snapshot({ targetMedian: 130_000 }) },
        true,
      ),
    ).toBeNull();
    expect(
      circuitBreak(
        prev,
        { theses: [th('a')], valuation: snapshot({ targetMedian: 185_000 }) },
        true,
      ),
    ).not.toBeNull();
  });

  it('null medians on either side are not compared', () => {
    expect(
      circuitBreak(
        published(['a'], null),
        { theses: [th('a')], valuation: snapshot({ targetMedian: 500 }) },
        true,
      ),
    ).toBeNull();
    expect(
      circuitBreak(published(['a'], 100), { theses: [th('a')], valuation: snapshot() }, true),
    ).toBeNull();
  });

  it('thesis count falling to 0 blocks only while valid reports remain', () => {
    const prev = published(['a'], null);
    expect(circuitBreak(prev, { theses: [], valuation: snapshot() }, true)).toMatch(/0/);
    expect(circuitBreak(prev, { theses: [], valuation: snapshot() }, false)).toBeNull();
    expect(
      circuitBreak(published([], null), { theses: [], valuation: snapshot() }, true),
    ).toBeNull();
  });

  it('replacing every previous thesis at once (prev ≥ 2) blocks', () => {
    const prev = published(['a', 'b'], null);
    expect(circuitBreak(prev, { theses: [th('c'), th('d')], valuation: snapshot() }, true)).toMatch(
      /replaced/,
    );
    expect(
      circuitBreak(prev, { theses: [th('c'), th('a')], valuation: snapshot() }, true),
    ).toBeNull();
    // a single previous thesis replaced is allowed
    expect(
      circuitBreak(published(['a'], null), { theses: [th('c')], valuation: snapshot() }, true),
    ).toBeNull();
  });
});

describe('viewFingerprint', () => {
  const targets = [
    { broker: 'SSI', targetPriceVnd: 190_000, reportDate: '2026-10-01', reportId: 'r1' },
    { broker: 'VIETCAP', targetPriceVnd: 185_000, reportDate: '2026-10-16', reportId: 'r2' },
  ];
  const val = snapshot({ targets, targetMedian: 187_500, hiddenReason: null });

  it('is a sha256 hex and deterministic', () => {
    const f = viewFingerprint([th('a')], val);
    expect(f).toMatch(/^[0-9a-f]{64}$/);
    expect(viewFingerprint([th('a')], val)).toBe(f);
  });

  it('is independent of array order, key order and non-hashed fields', () => {
    const t1 = th('a', 1);
    const t2 = th('b', 2);
    const f = viewFingerprint([t1, t2], val);
    expect(viewFingerprint([t2, t1], val)).toBe(f);
    const reordered = { summary: t1.summary, order: 1, title: t1.title, id: 'a' };
    expect(viewFingerprint([reordered, t2], val)).toBe(f);
    expect(viewFingerprint([t1, t2], { ...val, targets: [...targets].reverse() })).toBe(f);
    expect(
      viewFingerprint([t1, t2], {
        ...val,
        targets: targets.map((t) => ({ ...t, reportId: 'zzz' })),
      }),
    ).toBe(f);
    expect(viewFingerprint([t1, t2], { ...val, researchAsOf: '2030-01-01' })).toBe(f);
  });

  it('changes with title/summary/order, target price/date or hidden reason', () => {
    const f = viewFingerprint([th('a')], val);
    expect(viewFingerprint([{ ...th('a'), title: 'x' }], val)).not.toBe(f);
    expect(viewFingerprint([{ ...th('a'), summary: 'x' }], val)).not.toBe(f);
    expect(viewFingerprint([th('a', 2)], val)).not.toBe(f);
    expect(
      viewFingerprint([th('a')], {
        ...val,
        targets: [{ ...targets[0]!, targetPriceVnd: 191_000 }, targets[1]!],
      }),
    ).not.toBe(f);
    expect(
      viewFingerprint([th('a')], {
        ...val,
        targets: [{ ...targets[0]!, reportDate: '2026-10-02' }, targets[1]!],
      }),
    ).not.toBe(f);
    expect(viewFingerprint([th('a')], { ...val, hiddenReason: 'corporate_action' })).not.toBe(f);
  });
});

describe('buildShortlist', () => {
  const thesis = (seq: number, isRisk = false) =>
    ({ id: `T${seq}`, seq, isRisk, status: 'active' }) as unknown as CanonicalThesis;
  const entry = (id: string, brokers: string[], date: string) =>
    ({
      thesisId: id,
      brokers,
      perBroker: brokers.map((broker) => ({ broker, claim: { evidenceDate: date } })),
    }) as unknown as ThesisEvidenceEntry;

  it('keeps the 8 best-backed theses and gives the last slot to the best risk', () => {
    const theses = Array.from({ length: 10 }, (_, i) => thesis(i + 1, i === 9));
    const evidence = new Map(
      theses.map((t, i) => [
        t.id,
        entry(t.id, i < 8 ? ['A', 'B'] : ['A'], `2026-10-0${(i % 9) + 1}`),
      ]),
    );
    const picked = buildShortlist(theses, evidence);
    expect(picked.size).toBe(8);
    expect(picked.has('T10')).toBe(true);
    expect(picked.has('T9')).toBe(false);
  });

  it('skips theses without evidence', () => {
    const picked = buildShortlist(
      [thesis(1), thesis(2)],
      new Map([['T1', entry('T1', ['A'], '2026-10-01')]]),
    );
    expect([...picked]).toEqual(['T1']);
  });
});
