import { describe, expect, it, vi } from 'vitest';

import { HuntEngine } from '../../src/modules/journey/cap5/hunt.engine.js';
import type { HuntDataSource, HuntFilter } from '../../src/modules/journey/cap5/cap5.types.js';

// Săn mã stays an independent product feature after the Bot stopped using it; these
// semantics used to be covered next to the Bot provider tests and are kept here.

function flatBars() {
  return Array.from({ length: 21 }, (_, index) => {
    const date = new Date('2025-12-13T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + index);
    return {
      time: date.toISOString().slice(0, 10),
      open: 10_000,
      high: 10_000,
      low: 10_000,
      close: 10_000,
      volume: 100_000,
      gtgdVnd: 2_000_000_000,
    };
  });
}

function volumeBreakoutBars() {
  return flatBars().map((bar, index) => ({ ...bar, volume: index === 20 ? 200_000 : 100_000 }));
}

describe('Hunt engine filters (independent of the Bot)', () => {
  it.each(['ngoai', 'tudoanh'] as const)(
    '%s keeps 3/5-session positive-flow semantics and requires a positive total',
    async (filter) => {
      const symbols = ['AAA', 'BBB', 'CCC'];
      const bars = new Map(symbols.map((symbol) => [symbol, flatBars()]));
      const flows = new Map([
        ['AAA', [10, 10, 10, -1, -1]],
        ['BBB', [10, 10, -1, -1, -1]],
        ['CCC', [1, 1, 1, -5, -5]],
      ]);
      const source: HuntDataSource = {
        dailyBars: vi.fn(async () => bars),
        netFlow: vi.fn(async (_symbols, side) => (side === filter ? flows : null)),
        restrictedSymbols: vi.fn(async () => new Set<string>()),
      };

      const result = await new HuntEngine(source).run(filter, symbols);

      expect(result.complete).toBe(true);
      expect(result.matchedCount).toBe(1);
      expect(result.items.map((item) => item.symbol)).toEqual(['AAA']);
      expect(result.items[0]?.tin_hieu).toContain('3/5 phiên');
    },
  );

  it('applies top 10 per filter and breaks equal ranks by symbol ascending', async () => {
    const symbols = Array.from({ length: 12 }, (_, index) => `S${String(index).padStart(2, '0')}`);
    const bars = new Map(symbols.map((symbol) => [symbol, volumeBreakoutBars()]));
    const source: HuntDataSource = {
      dailyBars: vi.fn(async () => bars),
      netFlow: vi.fn(async (_symbols, _side: Extract<HuntFilter, 'ngoai' | 'tudoanh'>) => null),
      restrictedSymbols: vi.fn(async () => new Set<string>()),
    };

    const result = await new HuntEngine(source).run('kl', [...symbols].reverse());

    expect(result.complete).toBe(true);
    expect(result.matchedCount).toBe(12);
    expect(result.items.map((item) => item.symbol)).toEqual(symbols.slice(0, 10));
  });
});
