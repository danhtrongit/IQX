import { describe, expect, it } from 'vitest';

import {
  HANG_LIST,
  HANG_WEIGHT,
  HANH_LIST,
  MONTH_RE,
  buildDay,
  compareTallies,
  dayCalendar,
  deadlineOf,
  drawHang,
  hopHanh,
  isBeforeDeadline,
  isSameVnDay,
  julianDayNumber,
  kiengHanh,
  lastSettledDay,
  nextMonth,
  normaliseTickers,
  outcomeOf,
  parseQuoteTime,
  pickLa,
  rankTallies,
  statusOf,
  stepOf,
  tallyCalls,
  unlistedTickers,
  vnDay,
  vnTimeOn,
  vnindexReference,
  type Hang,
  type Hanh,
  type HanhConfig,
  type KhanProgress,
  type MonthTally,
  type ScoredCall,
} from '../../src/modules/trading-floor/than-tai.logic.js';

/** Epoch ms của HH:MM:SS giờ Việt Nam. */
const vn = (day: string, hour: number, minute = 0, second = 0) =>
  vnTimeOn(day, { hour, minute }) + second * 1000;

/** PRNG có hạt giống cố định (mulberry32) để phân phối kiểm tra được và lặp lại được. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('giờ Việt Nam', () => {
  it('uses UTC+7', () => {
    expect(vnTimeOn('2026-11-15', { hour: 11, minute: 30 })).toBe(Date.UTC(2026, 10, 15, 4, 30));
  });

  it('rolls the day at Vietnam midnight, not UTC midnight', () => {
    expect(vnDay(Date.UTC(2026, 10, 12, 16, 59, 59))).toBe('2026-11-12');
    expect(vnDay(Date.UTC(2026, 10, 12, 17, 0, 0))).toBe('2026-11-13');
    expect(vnDay(Date.UTC(2026, 10, 12, 17, 0), -1)).toBe('2026-11-12');
    expect(isSameVnDay(Date.UTC(2026, 10, 12, 0, 0), Date.UTC(2026, 10, 12, 16, 59))).toBe(true);
    expect(isSameVnDay(Date.UTC(2026, 10, 12, 16, 59), Date.UTC(2026, 10, 12, 17, 0))).toBe(false);
  });
});

describe('hạn 11:30', () => {
  const day = '2026-11-15'; // Chủ nhật: cuối tuần vẫn khấn được

  it('deadline is 11:30 of the Vietnam day', () => {
    expect(deadlineOf(day)).toBe(Date.UTC(2026, 10, 15, 4, 30));
  });

  it('11:29:59 is still allowed, 11:30:00 is not', () => {
    expect(isBeforeDeadline(vn(day, 11, 29, 59))).toBe(true);
    expect(isBeforeDeadline(vn(day, 11, 30, 0))).toBe(false);
    expect(isBeforeDeadline(vn(day, 11, 30, 1))).toBe(false);
    expect(isBeforeDeadline(vn(day, 11, 29, 59) + 999)).toBe(true);
    expect(isBeforeDeadline(vn(day, 11, 30, 0) - 1)).toBe(true);
  });

  it('opens again after midnight Vietnam time', () => {
    expect(isBeforeDeadline(vn(day, 23, 59, 59))).toBe(false);
    expect(isBeforeDeadline(vn('2026-11-16', 0, 0, 0))).toBe(true);
    expect(isBeforeDeadline(Date.UTC(2026, 10, 15, 16, 59, 59))).toBe(false); // 23:59:59 VN
    expect(isBeforeDeadline(Date.UTC(2026, 10, 15, 17, 0, 0))).toBe(true); // 00:00:00 VN ngày 16
  });
});

describe('can chi và nạp âm của ngày', () => {
  it('julian day number of 2000-01-01 is 2451545', () => {
    expect(julianDayNumber('2000-01-01')).toBe(2451545);
    expect(julianDayNumber('2026-11-15') - julianDayNumber('2026-11-14')).toBe(1);
  });

  it('2000-01-01 is Mậu Ngọ (Thiên Thượng Hỏa)', () => {
    expect(dayCalendar('2000-01-01')).toEqual({
      canChi: 'Mậu Ngọ',
      napAm: 'Thiên Thượng Hỏa',
      hanh: 'hoa',
    });
  });

  it('matches known calendar days of Tết (mùng 1)', () => {
    expect(dayCalendar('2024-02-10').canChi).toBe('Giáp Thìn');
    expect(dayCalendar('2025-01-29').canChi).toBe('Mậu Tuất');
  });

  it('Bính Ngọ is Thiên Hà Thủy (hành Thủy)', () => {
    const cal = dayCalendar('2026-11-28');
    expect(cal).toEqual({ canChi: 'Bính Ngọ', napAm: 'Thiên Hà Thủy', hanh: 'thuy' });
  });

  it('gives the day values of 2026-11-14 and 2026-11-15 (Vietnam dates)', () => {
    // Cùng một nạp âm cho hai can chi liền nhau.
    expect(dayCalendar('2026-11-14')).toEqual({
      canChi: 'Nhâm Thìn',
      napAm: 'Trường Lưu Thủy',
      hanh: 'thuy',
    });
    expect(dayCalendar('2026-11-15')).toEqual({
      canChi: 'Quý Tỵ',
      napAm: 'Trường Lưu Thủy',
      hanh: 'thuy',
    });
    expect(dayCalendar('2026-11-16')).toEqual({
      canChi: 'Giáp Ngọ',
      napAm: 'Sa Trung Kim',
      hanh: 'kim',
    });
  });

  it('repeats every 60 days and uses each of the 30 nạp âm for two consecutive days', () => {
    const start = julianDayNumber('2026-01-01');
    const days = Array.from({ length: 120 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      return dayCalendar(d);
    });
    expect(julianDayNumber('2026-01-02')).toBe(start + 1);
    for (let i = 0; i < 60; i += 1) expect(days[i + 60]).toEqual(days[i]);
    const napAm = new Set(days.slice(0, 60).map((d) => d.napAm));
    expect(napAm.size).toBe(30);
    const hanh = new Set(days.map((d) => d.hanh));
    expect([...hanh].sort()).toEqual([...HANH_LIST].sort());
  });
});

describe('hợp và kiêng theo hành ngày (SPEC)', () => {
  const spec: Record<Hanh, { hop: [Hanh, Hanh]; kieng: [Hanh, Hanh] }> = {
    kim: { hop: ['kim', 'thuy'], kieng: ['moc', 'hoa'] },
    moc: { hop: ['moc', 'hoa'], kieng: ['tho', 'kim'] },
    thuy: { hop: ['thuy', 'moc'], kieng: ['hoa', 'tho'] },
    hoa: { hop: ['hoa', 'tho'], kieng: ['kim', 'thuy'] },
    tho: { hop: ['tho', 'kim'], kieng: ['thuy', 'moc'] },
  };

  for (const hanh of HANH_LIST) {
    it(`hành ${hanh}`, () => {
      expect(hopHanh(hanh)).toEqual(spec[hanh].hop);
      expect(kiengHanh(hanh)).toEqual(spec[hanh].kieng);
    });
  }
});

describe('buildDay', () => {
  const colours: Record<Hanh, { ten: string; hex: string }[]> = {
    kim: [{ ten: 'Trắng', hex: '#FFFFFF' }],
    moc: [{ ten: 'Xanh lá', hex: '#22A653' }],
    thuy: [
      { ten: 'Đen huyền', hex: '#1F2937' },
      { ten: 'Xanh lam', hex: '#2563EB' },
    ],
    hoa: [{ ten: 'Đỏ', hex: '#DC2626' }],
    tho: [{ ten: 'Nâu', hex: '#8B5A2B' }],
  };
  const directions: Record<Hanh, string> = {
    kim: 'Tây',
    moc: 'Đông',
    thuy: 'Bắc',
    hoa: 'Nam',
    tho: 'Đông Bắc',
  };
  const configs = Object.fromEntries(
    HANH_LIST.map((hanh) => [
      hanh,
      {
        hanh,
        nganh: [1, 2, 3, 4, 5, 6].map((n) => `${hanh}-${n}`),
        mau: colours[hanh],
        huong: directions[hanh],
      } satisfies HanhConfig,
    ]),
  ) as Record<Hanh, HanhConfig>;

  it('builds the day line, hợp, kiêng, colours and direction', () => {
    const day = buildDay('2026-11-15', configs);
    expect(day).toMatchObject({
      date: '2026-11-15',
      canChi: 'Quý Tỵ',
      napAm: 'Trường Lưu Thủy',
      hanh: 'thuy',
      hanhLabel: 'Thủy',
      huong: 'Bắc',
    });
    expect(day.hop.map((g) => [g.hanh, g.label])).toEqual([
      ['thuy', 'Thủy'],
      ['moc', 'Mộc'],
    ]);
    expect(day.kieng.map((g) => [g.hanh, g.label])).toEqual([
      ['hoa', 'Hỏa'],
      ['tho', 'Thổ'],
    ]);
    expect(day.mau).toEqual(colours.thuy);
  });

  it('shows at most 4 ngành per element: the first 4 of the config list', () => {
    const day = buildDay('2026-11-15', configs);
    for (const group of [...day.hop, ...day.kieng]) {
      expect(group.nganh).toEqual([1, 2, 3, 4].map((n) => `${group.hanh}-${n}`));
    }
  });

  it('survives a missing element config', () => {
    const day = buildDay('2026-11-15', {});
    expect(day.hop.every((g) => g.nganh.length === 0)).toBe(true);
    expect(day.mau).toEqual([]);
    expect(day.huong).toBe('');
  });
});

describe('rút hạng theo trọng số', () => {
  it('weights are 35/30/20/10/5', () => {
    expect(HANG_LIST.map((h) => HANG_WEIGHT[h])).toEqual([35, 30, 20, 10, 5]);
  });

  it('follows the 35/30/20/10/5 distribution with a seeded rng', () => {
    const rng = seeded(20261115);
    const n = 100_000;
    const counts: Record<Hang, number> = {
      dai_cat: 0,
      thuong_cat: 0,
      trung_cat: 0,
      tieu_cat: 0,
      than_trong: 0,
    };
    for (let i = 0; i < n; i += 1) counts[drawHang(HANG_LIST, rng)!] += 1;
    for (const hang of HANG_LIST) {
      expect(counts[hang] / n).toBeCloseTo(HANG_WEIGHT[hang] / 100, 2);
    }
  });

  it('is deterministic for a seeded rng', () => {
    const a = seeded(7);
    const b = seeded(7);
    const first = Array.from({ length: 50 }, () => drawHang(HANG_LIST, a));
    const second = Array.from({ length: 50 }, () => drawHang(HANG_LIST, b));
    expect(first).toEqual(second);
  });

  it('renormalises over the ranks that still have a lá', () => {
    const rng = seeded(99);
    const n = 50_000;
    let careful = 0;
    for (let i = 0; i < n; i += 1) {
      const hang = drawHang(['trung_cat', 'than_trong'], rng);
      expect(['trung_cat', 'than_trong']).toContain(hang);
      if (hang === 'than_trong') careful += 1;
    }
    // 5 / (20 + 5) = 20%.
    expect(careful / n).toBeCloseTo(0.2, 1);
  });

  it('edge values of the rng stay inside the list', () => {
    expect(drawHang(HANG_LIST, () => 0)).toBe('dai_cat');
    expect(drawHang(HANG_LIST, () => 0.999999999)).toBe('than_trong');
    expect(drawHang(['tieu_cat'], () => 0.5)).toBe('tieu_cat');
  });

  it('returns null when no rank has an active lá', () => {
    expect(drawHang([], () => 0.5)).toBeNull();
  });
});

describe('vòng không lặp lá', () => {
  it('prefers lá the actor has not seen', () => {
    const rng = seeded(1);
    for (let i = 0; i < 100; i += 1) {
      const picked = pickLa([10, 11, 12, 13], new Set([10, 12]), rng)!;
      expect([11, 13]).toContain(picked.laId);
      expect(picked.resetSeen).toBe(false);
    }
  });

  it('resets the cycle once every lá of the rank was seen', () => {
    const rng = seeded(2);
    const picked = pickLa([10, 11], new Set([10, 11]), rng)!;
    expect([10, 11]).toContain(picked.laId);
    expect(picked.resetSeen).toBe(true);
  });

  it('ignores seen ids that are no longer candidates (deactivated lá)', () => {
    const picked = pickLa([10, 11], new Set([99, 100]), seeded(3))!;
    expect(picked.resetSeen).toBe(false);
  });

  it('returns null without candidates', () => {
    expect(pickLa([], new Set(), seeded(4))).toBeNull();
  });

  it('shows every lá once per cycle, then starts a new cycle', () => {
    const rng = seeded(5);
    const candidates = [1, 2, 3, 4, 5];
    const seen = new Set<number>();
    const history: number[] = [];
    let resets = 0;
    for (let i = 0; i < 15; i += 1) {
      const picked = pickLa(candidates, seen, rng)!;
      if (picked.resetSeen) {
        resets += 1;
        seen.clear();
      }
      seen.add(picked.laId);
      history.push(picked.laId);
    }
    // Ba vòng đủ 5 lá, mỗi vòng không lặp.
    for (const cycle of [0, 5, 10]) {
      expect(new Set(history.slice(cycle, cycle + 5)).size).toBe(5);
    }
    expect(resets).toBe(2);
  });
});

describe('bước và trạng thái', () => {
  const none = null;
  const drawn: KhanProgress = { duDoan: null, maCau: null };
  const predicted: KhanProgress = { duDoan: 'up', maCau: null };
  const skipped: KhanProgress = { duDoan: 'flat', maCau: [] };
  const prayed: KhanProgress = { duDoan: 'down', maCau: ['FPT', 'VCB'] };

  it('step is the next step to do', () => {
    expect(stepOf(none)).toBe(1);
    expect(stepOf(drawn)).toBe(2);
    expect(stepOf(predicted)).toBe(3);
    expect(stepOf(skipped)).toBe(4);
    expect(stepOf(prayed)).toBe(4);
  });

  const day = '2026-11-15';
  const before = vn(day, 9, 0);
  const after = vn(day, 11, 30);

  it('status before 11:30', () => {
    expect(statusOf(none, before)).toBe('chua_khan');
    expect(statusOf(drawn, before)).toBe('dang_do');
    expect(statusOf(predicted, before)).toBe('dang_do');
    expect(statusOf(skipped, before)).toBe('da_xong');
    expect(statusOf(prayed, before)).toBe('da_xong');
  });

  it('status from 11:30: finished stays da_xong, the rest is het_gio', () => {
    expect(statusOf(none, after)).toBe('het_gio');
    expect(statusOf(drawn, after)).toBe('het_gio');
    expect(statusOf(predicted, after)).toBe('het_gio');
    expect(statusOf(skipped, after)).toBe('da_xong');
    expect(statusOf(prayed, vn(day, 20, 0))).toBe('da_xong');
  });

  it('switches exactly at 11:30:00', () => {
    expect(statusOf(drawn, vn(day, 11, 29, 59))).toBe('dang_do');
    expect(statusOf(drawn, vn(day, 11, 30, 0))).toBe('het_gio');
  });
});

describe('mã cầu', () => {
  it('uppercases and trims; an empty list means skipped', () => {
    expect(normaliseTickers([' fpt', 'Vcb '])).toEqual({ ok: true, tickers: ['FPT', 'VCB'] });
    expect(normaliseTickers([])).toEqual({ ok: true, tickers: [] });
    expect(normaliseTickers(['vn3'])).toEqual({ ok: true, tickers: ['VN3'] });
  });

  it('accepts up to 3 and rejects more with QUA_3_MA (checked before the format)', () => {
    expect(normaliseTickers(['AAA', 'BBB', 'CCC']).ok).toBe(true);
    expect(normaliseTickers(['AAA', 'BBB', 'CCC', 'DDD'])).toEqual({ ok: false, code: 'QUA_3_MA' });
    expect(normaliseTickers(['AAA', 'AAA', 'AAA', 'AAA'])).toEqual({ ok: false, code: 'QUA_3_MA' });
    expect(normaliseTickers(['A', '', '??', 'ZZZZ'])).toEqual({ ok: false, code: 'QUA_3_MA' });
  });

  it('rejects duplicates, bad length and bad characters with MA_KHONG_HOP_LE', () => {
    const bad = { ok: false, code: 'MA_KHONG_HOP_LE' };
    expect(normaliseTickers(['FPT', 'fpt'])).toEqual(bad);
    expect(normaliseTickers(['FP'])).toEqual(bad);
    expect(normaliseTickers(['FPTX'])).toEqual(bad);
    expect(normaliseTickers([''])).toEqual(bad);
    expect(normaliseTickers(['F-T'])).toEqual(bad);
    expect(normaliseTickers(['FPT', 'V C'])).toEqual(bad);
    expect(normaliseTickers(['FÀT'])).toEqual(bad);
  });

  it('lists tickers missing from the listed set; no list accepts everything', () => {
    const listed = new Set(['FPT', 'VCB']);
    expect(unlistedTickers(['FPT', 'ZZZ', 'VCB', 'YYY'], listed)).toEqual(['ZZZ', 'YYY']);
    expect(unlistedTickers(['FPT'], listed)).toEqual([]);
    expect(unlistedTickers(['ZZZ'], null)).toEqual([]);
  });
});

describe('giá tham chiếu VNINDEX', () => {
  const now = vn('2026-11-12', 10, 0);

  it('is the live value minus the change of the session', () => {
    expect(vnindexReference({ value: 1756.52, change: 9.62, time: now }, now)).toBe(1746.9);
    expect(vnindexReference({ value: 1740.1, change: -6.8, time: null }, now)).toBe(1746.9);
  });

  it('a quote of an earlier day is itself the previous close', () => {
    const friday = vn('2026-11-13', 15, 0);
    const monday = vn('2026-11-16', 8, 30);
    expect(vnindexReference({ value: 1750.25, change: 3.5, time: friday }, monday)).toBe(1750.25);
  });

  it('is null without a quote or a usable value', () => {
    expect(vnindexReference(null, now)).toBeNull();
    expect(vnindexReference({ value: 5, change: 5, time: now }, now)).toBeNull();
  });
});

describe('parseQuoteTime', () => {
  it('reads epoch seconds and milliseconds', () => {
    expect(parseQuoteTime(1_700_000_000)).toBe(1_700_000_000_000);
    expect(parseQuoteTime(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(parseQuoteTime(0)).toBeNull();
    expect(parseQuoteTime(Number.NaN)).toBeNull();
  });

  it('reads local strings without a zone as Vietnam time', () => {
    expect(parseQuoteTime('2026-11-12 14:45:10')).toBe(Date.UTC(2026, 10, 12, 7, 45, 10));
    expect(parseQuoteTime('2026-11-12T14:45')).toBe(Date.UTC(2026, 10, 12, 7, 45));
  });

  it('reads strings with a zone as ISO', () => {
    expect(parseQuoteTime('2026-11-12T07:45:00.000Z')).toBe(Date.UTC(2026, 10, 12, 7, 45));
    expect(parseQuoteTime('')).toBeNull();
    expect(parseQuoteTime('không phải giờ')).toBeNull();
    expect(parseQuoteTime(null)).toBeNull();
  });
});

describe('bảng vinh danh: kết quả của ngày', () => {
  it('up above zero, down below, flat exactly zero', () => {
    expect(outcomeOf(9.62)).toBe('up');
    expect(outcomeOf(0.01)).toBe('up');
    expect(outcomeOf(-0.01)).toBe('down');
    expect(outcomeOf(0)).toBe('flat');
    expect(outcomeOf(-0)).toBe('flat');
  });

  it('has no outcome without a known change', () => {
    expect(outcomeOf(null)).toBeNull();
    expect(outcomeOf(Number.NaN)).toBeNull();
  });
});

describe('bảng vinh danh: ngày đã chốt', () => {
  it('today counts only from 15:00 Vietnam time', () => {
    expect(lastSettledDay(vn('2026-11-12', 14, 59, 59))).toBe('2026-11-11');
    expect(lastSettledDay(vn('2026-11-12', 15, 0))).toBe('2026-11-12');
    expect(lastSettledDay(vn('2026-11-12', 23, 59))).toBe('2026-11-12');
  });

  it('uses the Vietnam date at the UTC day boundary', () => {
    // 2026-11-12 17:30 UTC is 00:30 on the 13th in Vietnam: the 12th is settled, the 13th is not.
    expect(lastSettledDay(Date.UTC(2026, 10, 12, 17, 30))).toBe('2026-11-12');
  });

  it('rolls back over a month boundary', () => {
    expect(lastSettledDay(vn('2026-12-01', 9, 0))).toBe('2026-11-30');
  });
});

describe('bảng vinh danh: tháng', () => {
  it('accepts YYYY-MM only', () => {
    for (const ok of ['2026-11', '2026-01', '2099-12']) expect(MONTH_RE.test(ok)).toBe(true);
    for (const bad of ['2026-13', '2026-00', '2026-1', '26-11', '2026-11-01', 'abc', ''])
      expect(MONTH_RE.test(bad)).toBe(false);
  });

  it('finds the next month, across the year end', () => {
    expect(nextMonth('2026-11')).toBe('2026-12');
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(nextMonth('2026-01')).toBe('2026-02');
  });
});

const call = (actorKey: string, ngay: string, duDoan: ScoredCall['duDoan'], change: number | null) =>
  ({ actorKey, ngay, duDoan, change }) satisfies ScoredCall;

describe('bảng vinh danh: gộp lượt', () => {
  it('counts correct calls and totals per account', () => {
    const tallies = tallyCalls([
      call('u:a', '2026-11-02', 'up', 5),
      call('u:a', '2026-11-03', 'down', 5),
      call('u:a', '2026-11-04', 'flat', 0),
      call('u:b', '2026-11-02', 'down', 5),
    ]);
    const a = tallies.find((row) => row.actorKey === 'u:a')!;
    expect(a).toMatchObject({ correct: 2, total: 3, reachedOn: '2026-11-04' });
    expect(tallies.find((row) => row.actorKey === 'u:b')).toMatchObject({
      correct: 0,
      total: 1,
      reachedOn: '',
    });
  });

  it('skips days whose change is unknown', () => {
    expect(tallyCalls([call('u:a', '2026-11-02', 'up', null)])).toEqual([]);
  });
});

const tally = (actorKey: string, correct: number, total: number, reachedOn: string): MonthTally => ({
  actorKey,
  correct,
  total,
  reachedOn,
});

describe('bảng vinh danh: thứ tự xếp hạng', () => {
  const order = (rows: MonthTally[]) => [...rows].sort(compareTallies).map((row) => row.actorKey);

  it('more correct calls first', () => {
    expect(order([tally('u:a', 3, 3, '2026-11-05'), tally('u:b', 5, 9, '2026-11-09')])).toEqual([
      'u:b',
      'u:a',
    ]);
  });

  it('then higher accuracy', () => {
    expect(order([tally('u:a', 4, 8, '2026-11-02'), tally('u:b', 4, 5, '2026-11-09')])).toEqual([
      'u:b',
      'u:a',
    ]);
  });

  it('then the one who reached that count earlier', () => {
    expect(order([tally('u:a', 4, 5, '2026-11-09'), tally('u:b', 4, 5, '2026-11-06')])).toEqual([
      'u:b',
      'u:a',
    ]);
  });

  it('then by actor key, so the order is always the same', () => {
    expect(order([tally('u:b', 4, 5, '2026-11-06'), tally('u:a', 4, 5, '2026-11-06')])).toEqual([
      'u:a',
      'u:b',
    ]);
  });

  it('compares accuracy exactly, not through rounded fractions', () => {
    // 1/3 vs 2/6 are the same accuracy: falls through to the date.
    expect(compareTallies(tally('u:a', 2, 6, '2026-11-02'), tally('u:b', 1, 3, '2026-11-09'))).toBe(
      -1,
    );
    expect(compareTallies(tally('u:a', 2, 6, '2026-11-09'), tally('u:b', 2, 6, '2026-11-02'))).toBe(
      1,
    );
  });
});

describe('bảng vinh danh: xếp hạng', () => {
  const profiles = new Map(
    ['a', 'b', 'c'].map((id) => [`u:${id}`, { name: `Người ${id}`, avatar: 'male01', color: 'default' }]),
  );

  it('numbers ranks from 1 and drops accounts without a floor profile', () => {
    const rows = rankTallies(
      [
        tally('u:c', 1, 4, '2026-11-02'),
        tally('u:ghost', 9, 9, '2026-11-02'),
        tally('u:a', 3, 4, '2026-11-02'),
        tally('u:b', 2, 4, '2026-11-02'),
      ],
      profiles,
    );
    expect(rows.map((row) => [row.rank, row.actorKey, row.correct, row.total])).toEqual([
      [1, 'u:a', 3, 4],
      [2, 'u:b', 2, 4],
      [3, 'u:c', 1, 4],
    ]);
    expect(rows[0]).toMatchObject({ name: 'Người a', avatar: 'male01', color: 'default' });
  });

  it('is empty when nobody was scored', () => {
    expect(rankTallies([], profiles)).toEqual([]);
  });
});
