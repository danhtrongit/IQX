import { describe, expect, it } from 'vitest';
import { scoreConsensus } from '../../src/modules/journey/cap5/consensus.js';
import { HuntEngine } from '../../src/modules/journey/cap5/hunt.engine.js';
import type { HuntBar, HuntDataSource } from '../../src/modules/journey/cap5/cap5.types.js';

describe('Cap5 consensus and hunt rules', () => {
  it('does not convert missing layers into zero', () => {
    const result = scoreConsensus({ L1: { statusLabel: 'Mạnh' } }, { sessionDate: '2026-09-23' });
    expect(result.diem).toBe(1);
    expect(result.so_lop_da_cham).toBe(1);
    expect(result.status).toBeNull();
    expect(result.lop.find((layer) => layer.lop === 'dinh_gia')?.ung_ho).toBeNull();
  });

  it('keeps a stale analysis unavailable', () => {
    const result = scoreConsensus(null, { expiredSessionDate: '2026-01-01' });
    expect(result.diem).toBeNull();
    expect(result.session_date_qua_han).toBe('2026-01-01');
  });

  it('fails closed when no bars can be evaluated', async () => {
    const source: HuntDataSource = {
      dailyBars: async () => new Map(),
      netFlow: async () => null,
      restrictedSymbols: async () => new Set(),
    };
    const engine = new HuntEngine(source);
    const result = await engine.run('kl', ['AAA', 'BBB']);
    expect(result.available).toBe(false);
    expect(result.matchedCount).toBeNull();
    expect(result.items).toEqual([]);
  });

  it('applies inclusive floor boundaries and ranks top ten', async () => {
    const makeBars = (symbol: string): [string, HuntBar[]] => {
      const bars = Array.from({ length: 21 }, (_, index) => ({
        time: `2026-09-${String(index + 1).padStart(2, '0')}`,
        open: 3_000,
        high: 3_100,
        low: 2_900,
        close: 3_000,
        volume: index === 20 ? 2_000 : 1_000,
        gtgdVnd: 1_000_000_000,
      }));
      return [symbol, bars];
    };
    const source: HuntDataSource = {
      dailyBars: async () => new Map([makeBars('AAA')]),
      netFlow: async () => null,
      restrictedSymbols: async () => new Set(),
    };
    const result = await new HuntEngine(source).run('kl', ['AAA']);
    expect(result.available).toBe(true);
    expect(result.matchedCount).toBe(1);
    expect(result.items[0]?.symbol).toBe('AAA');
  });
});
