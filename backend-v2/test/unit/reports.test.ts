import { describe, expect, it } from 'vitest';
import {
  buildCalendarBlock,
  isTradingDate,
  previousTradingDate,
  thirdThursday,
} from '../../src/modules/reports/market-calendar.js';
import { classifySession } from '../../src/modules/reports/session-classifier.js';
import { parseAiJson, validateMarketReport } from '../../src/modules/reports/report-validator.js';

describe('market reports contracts', () => {
  it('handles trading calendar and futures expiry deterministically', () => {
    expect(thirdThursday(2026, 6)).toBe('2026-06-18');
    expect(isTradingDate('2026-09-02')).toBe(false);
    expect(previousTradingDate('2026-09-02')).toBe('2026-09-01');
    expect(buildCalendarBlock('2026-06-17').next_futures_expiry).toMatchObject({
      date: '2026-06-18',
      code: 'VN30F2606',
    });
  });
  it('classifies using actual payload metrics and priority order', () => {
    expect(
      classifySession({
        meta: { generated_for_date: '2026-06-18' },
        vnindex: { change_pct: 0 },
        breadth: {},
        foreign_flow: {},
        volume: {},
      }),
    ).toBe('derivatives_anomaly');
    expect(
      classifySession({
        meta: { generated_for_date: '2026-06-17' },
        vnindex: { change_pct: -3 },
        breadth: { advances: 1, declines: 100 },
        foreign_flow: { net_value_vnd_billion: -600 },
        volume: {},
      }),
    ).toBe('broad_selloff');
  });
  it('rejects malformed or forbidden AI output', () => {
    expect(() => parseAiJson('```json\n{"headline":"ok"}\n```')).not.toThrow();
    const result = validateMarketReport(
      {
        headline: 'ok',
        tagline: {},
        paragraphs: { market_health: 'short' },
        scenarios: [],
        watchlist: null,
      },
      { vnindex: {}, data_quality: {} },
      'daily',
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((error) => error.startsWith('STRUCT'))).toBe(true);
  });
});
