import { describe, expect, it } from 'vitest';

import {
  QUE_LIST,
  RITUAL_RULES,
  canResolve,
  isSameVnDay,
  isValidMonth,
  monthOf,
  normaliseTickers,
  parseQuoteTime,
  queById,
  score,
  targetSession,
  vnDay,
  vnTimeOn,
} from '../../src/modules/trading-floor/floor-ritual.logic.js';

/** Epoch ms của HH:MM giờ Việt Nam. 2026-11-12 là thứ Năm. */
const vn = (day: string, hour: number, minute = 0) => vnTimeOn(day, { hour, minute });

describe('vnTimeOn / vnDay', () => {
  it('uses UTC+7', () => {
    expect(vn('2026-11-12', 14, 30)).toBe(Date.UTC(2026, 10, 12, 7, 30));
    expect(new Date(vn('2026-11-12', 0)).getUTCDay()).toBe(3);
  });

  it('rolls the day at Vietnam midnight, not UTC midnight', () => {
    expect(vnDay(Date.UTC(2026, 10, 12, 16, 59))).toBe('2026-11-12');
    expect(vnDay(Date.UTC(2026, 10, 12, 17, 0))).toBe('2026-11-13');
  });

  it('compares calendar days in Vietnam time', () => {
    expect(isSameVnDay(vn('2026-11-12', 0), vn('2026-11-12', 23, 59))).toBe(true);
    expect(isSameVnDay(vn('2026-11-12', 23, 59), vn('2026-11-13', 0))).toBe(false);
  });
});

describe('targetSession', () => {
  it('predicts today until the 14:30 cutoff on a weekday', () => {
    expect(targetSession(vn('2026-11-12', 9))).toBe('2026-11-12');
    expect(targetSession(vn('2026-11-12', 14, 29))).toBe('2026-11-12');
  });

  it('moves to the next weekday from the cutoff', () => {
    expect(targetSession(vn('2026-11-12', 14, 30))).toBe('2026-11-13');
    expect(targetSession(vn('2026-11-12', 23, 59))).toBe('2026-11-13');
  });

  it('skips the weekend', () => {
    expect(targetSession(vn('2026-11-13', 15))).toBe('2026-11-16');
    expect(targetSession(vn('2026-11-14', 10))).toBe('2026-11-16');
    expect(targetSession(vn('2026-11-15', 23, 59))).toBe('2026-11-16');
  });
});

describe('canResolve', () => {
  it('waits until 15:00 on the session day', () => {
    expect(canResolve('2026-11-12', vn('2026-11-12', 14, 59))).toBe(false);
    expect(canResolve('2026-11-12', vn('2026-11-12', 15))).toBe(true);
  });

  it('resolves older sessions at any later time', () => {
    expect(canResolve('2026-11-12', vn('2026-11-13', 8))).toBe(true);
  });
});

describe('score', () => {
  it('counts the direction and keeps the level error for tie-breaks', () => {
    expect(score('up', 1745, 1740, 3.2)).toEqual({ correct: true, error: 5 });
    expect(score('down', 1745, 1740, 3.2)).toEqual({ correct: false, error: 5 });
    expect(score('down', 1730, 1740, -1)).toEqual({ correct: true, error: 10 });
  });

  it('treats an unchanged close as wrong for both directions', () => {
    expect(score('up', 1740, 1740, 0).correct).toBe(false);
    expect(score('down', 1740, 1740, 0).correct).toBe(false);
  });
});

describe('normaliseTickers', () => {
  it('upper-cases and trims', () => {
    expect(normaliseTickers([' fpt', 'Hpg ', 'VCB'])).toEqual(['FPT', 'HPG', 'VCB']);
  });

  it('needs three different well-formed codes', () => {
    expect(normaliseTickers(['FPT', 'fpt', 'VCB'])).toBeNull();
    expect(normaliseTickers(['FPT', 'HPG'])).toBeNull();
    expect(normaliseTickers(['FPT', 'HPG', 'VCB', 'MWG'])).toBeNull();
    expect(normaliseTickers(['FPT', 'HPG', 'VCBX'])).toBeNull();
    expect(normaliseTickers(['FPT', 'HPG', 'V-B'])).toBeNull();
  });
});

describe('monthOf / isValidMonth', () => {
  it('takes YYYY-MM', () => expect(monthOf('2026-11-12')).toBe('2026-11'));
  it('validates months', () => {
    expect(isValidMonth('2026-11')).toBe(true);
    expect(isValidMonth('2026-13')).toBe(false);
    expect(isValidMonth('2026-1')).toBe(false);
  });
});

describe('parseQuoteTime', () => {
  it('reads epoch seconds and milliseconds', () => {
    expect(parseQuoteTime(1_700_000_000)).toBe(1_700_000_000_000);
    expect(parseQuoteTime(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('reads a zoneless string as Vietnam time and a zoned string as ISO', () => {
    expect(parseQuoteTime('2026-11-12 14:45:10')).toBe(Date.UTC(2026, 10, 12, 7, 45, 10));
    expect(parseQuoteTime('2026-11-12T14:45')).toBe(Date.UTC(2026, 10, 12, 7, 45));
    expect(parseQuoteTime('2026-11-12T07:45:00.000Z')).toBe(Date.UTC(2026, 10, 12, 7, 45));
  });

  it('rejects junk', () => {
    expect(parseQuoteTime(null)).toBeNull();
    expect(parseQuoteTime(0)).toBeNull();
    expect(parseQuoteTime('')).toBeNull();
    expect(parseQuoteTime('không phải giờ')).toBeNull();
  });
});

describe('que list', () => {
  it('has unique ids that resolve', () => {
    const ids = QUE_LIST.map((que) => que.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const que of QUE_LIST) expect(queById(que.id)).toBe(que);
    expect(queById(-1)).toBeUndefined();
  });

  it('keeps the contract cutoffs', () => {
    expect(RITUAL_RULES.cutoff).toEqual({ hour: 14, minute: 30 });
    expect(RITUAL_RULES.resolveAfter).toEqual({ hour: 15, minute: 0 });
    expect(RITUAL_RULES.liveCloseAt).toEqual({ hour: 14, minute: 45 });
  });
});
