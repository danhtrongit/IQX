import { describe, expect, it } from 'vitest';

import {
  buildCap7PortfolioSnapshot,
  Cap7Service,
} from '../../src/modules/journey/cap7/cap7.service.js';

describe('Cap7 allocation gate', () => {
  it('requires four held symbols, three known sectors and both live thresholds', () => {
    const snapshot = buildCap7PortfolioSnapshot({
      cashVnd: 60,
      positions: [
        { symbol: 'AAA', quantity: 1, marketValueVnd: 10, sector: 'banking' },
        { symbol: 'BBB', quantity: 1, marketValueVnd: 10, sector: 'technology' },
        { symbol: 'CCC', quantity: 1, marketValueVnd: 10, sector: 'retail' },
        { symbol: 'DDD', quantity: 1, marketValueVnd: 10, sector: 'energy' },
      ],
    });
    expect(snapshot.can_doi_ok).toBe(true);
    expect(snapshot.held_symbol_count).toBe(4);
    expect(snapshot.known_sector_count).toBe(4);
  });

  it('keeps unknown prices and sectors explicit instead of treating them as zero', () => {
    const snapshot = buildCap7PortfolioSnapshot({
      cashVnd: 90,
      positions: [
        { symbol: 'AAA', quantity: 1, marketValueVnd: null, sector: null },
        { symbol: 'BBB', quantity: 1, marketValueVnd: 10, sector: 'technology' },
        { symbol: 'CCC', quantity: 1, marketValueVnd: 10, sector: 'retail' },
        { symbol: 'DDD', quantity: 1, marketValueVnd: 10, sector: 'energy' },
      ],
    });
    expect(snapshot.data_complete).toBe(false);
    expect(snapshot.can_doi_ok).toBe(false);
    expect(snapshot.unpriced_symbols).toEqual(['AAA']);
    expect(snapshot.unknown_sector_symbols).toEqual(['AAA']);
  });

  it('aggregates sector concentration independently from symbol concentration', () => {
    const snapshot = buildCap7PortfolioSnapshot({
      cashVnd: 0,
      positions: [
        { symbol: 'AAA', quantity: 1, marketValueVnd: 20, sector: 'banking' },
        { symbol: 'BBB', quantity: 1, marketValueVnd: 20, sector: 'banking' },
        { symbol: 'CCC', quantity: 1, marketValueVnd: 20, sector: 'retail' },
        { symbol: 'DDD', quantity: 1, marketValueVnd: 20, sector: 'energy' },
      ],
    });
    expect(snapshot.max_symbol_weight_pct).toBe(25);
    expect(snapshot.max_sector).toBe('banking');
    expect(snapshot.max_sector_weight_pct).toBe(50);
    expect(snapshot.can_doi_ok).toBe(false);
  });

  it('exposes an exported service for worker composition', () => {
    expect(Cap7Service).toBeDefined();
  });
});
