import { describe, expect, it } from 'vitest';

import {
  FORBIDDEN_RECOMMENDATION_TERMS,
  GENERIC_TITLES,
  TECHNICAL_TERMS,
  countWords,
  findForbiddenTerms,
  isGenericTitle,
  untraceableNumbers,
  validateBuiltTheses,
} from '../../src/modules/research/engine/validators.js';
import type {
  BuiltThesis,
  ExtractedClaim,
  ThesisBuildInput,
} from '../../src/modules/research/research.types.js';
import { ec, input } from './research-engine-helpers.js';

const BROKERS = ['Vietcap', 'SSI', 'Rồng Việt', 'VNDIRECT'];

function check(
  summary: string,
  claims: ExtractedClaim[] = [ec()],
  over: Partial<ThesisBuildInput> = {},
  title = 'Công suất thép mới đóng góp từ đầu năm',
  materiality = 4,
) {
  const inp = input({ thesisId: 't1', ...over }, claims);
  const b: BuiltThesis = { thesisId: 't1', title, summary, materiality };
  return validateBuiltTheses([b], { inputs: [inp], brokerNames: BROKERS });
}
const codes = (r: ReturnType<typeof check>) => r.failures.map((f) => f.code);

const num = (value: number, unit: string, period?: string) => ({
  metric: 'm',
  value,
  unit,
  ...(period ? { period } : {}),
});

describe('countWords', () => {
  it('counts words and ignores bare punctuation', () => {
    expect(countWords('Một hai  ba — bốn · năm.')).toBe(5);
    expect(countWords('')).toBe(0);
  });
});

describe('constants', () => {
  it('exports the lists', () => {
    expect(FORBIDDEN_RECOMMENDATION_TERMS).toEqual(
      expect.arrayContaining(['mua', 'bán', 'khả quan', 'outperform', 'buy', 'sell']),
    );
    expect(GENERIC_TITLES).toEqual(
      expect.arrayContaining([
        'Triển vọng tích cực',
        'Nhiều cơ hội tăng trưởng',
        'Rủi ro cần theo dõi',
        'Tình hình khả quan',
      ]),
    );
    expect(TECHNICAL_TERMS).toEqual(expect.arrayContaining(['DATA CACHE', 'embedding', 'token']));
  });
});

describe('forbidden recommendation words (spec 21.2, test 25)', () => {
  it('flags recommendation wording', () => {
    expect(codes(check('Khuyến nghị mua cổ phiếu này.'))).toContain('forbidden_term');
    expect(findForbiddenTerms('Nên nắm giữ và tích lũy')).toEqual(
      expect.arrayContaining(['nắm giữ', 'tích lũy']),
    );
    expect(findForbiddenTerms('Triển vọng kém khả quan')).toContain('kém khả quan');
    expect(findForbiddenTerms('We rate it Outperform, not a SELL or Hold')).toEqual(
      expect.arrayContaining(['outperform', 'sell', 'hold']),
    );
    expect(findForbiddenTerms('overweight, underweight, accumulate, Buy')).toHaveLength(4);
  });

  it('is diacritic-aware: mùa / bàn / bản / bạn are not hits', () => {
    expect(findForbiddenTerms('Mùa cao điểm, bàn giao dự án, bản chất, bạn đọc')).toEqual([]);
    expect(findForbiddenTerms('Mua thêm')).toEqual(['mua']);
    expect(findForbiddenTerms('MUA')).toEqual(['mua']);
  });

  it('whole words only: buyback, holding, selling, mualem are not hits', () => {
    expect(findForbiddenTerms('buyback holding selling')).toEqual([]);
    expect(findForbiddenTerms('muaxuân')).toEqual([]);
  });

  it('handles NFD-composed input', () => {
    expect(findForbiddenTerms('khuyến nghị'.normalize('NFD'))).toEqual(['khuyến nghị']);
    expect(findForbiddenTerms('bán'.normalize('NFD'))).toEqual(['bán']);
  });

  it('does not reject ordinary business vocabulary (bán lẻ, giá bán, mở bán, mua bán điện)', () => {
    expect(
      findForbiddenTerms('Doanh thu bán lẻ tăng nhờ giá bán cao hơn; dự án mở bán đợt mới'),
    ).toEqual([]);
    expect(findForbiddenTerms('Hợp đồng mua bán điện dài hạn')).toEqual([]);
    expect(findForbiddenTerms('Công ty mua lại trái phiếu')).toEqual([]);
    // but the bare verb is still caught
    expect(findForbiddenTerms('Nên bán ngay')).toEqual(['bán']);
  });
});

describe('broker names, generic and technical text', () => {
  it('flags broker names case-insensitively, whole word only', () => {
    expect(codes(check('Theo vietcap, công suất tăng.'))).toContain('broker_name');
    expect(codes(check('Rồng Việt dự báo biên lợi nhuận mở rộng.'))).toContain('broker_name');
    expect(codes(check('Chuỗi bán lẻ dẫn đầu thị trường.'))).not.toContain('broker_name');
    expect(codes(check('Công ty hưởng lợi từ lãi suất giảm xuống mức SSIA.'))).not.toContain(
      'broker_name',
    );
  });

  it('flags anonymised refs leaking into the text', () => {
    expect(codes(check('B1 cho rằng biên lợi nhuận mở rộng.'))).toContain('broker_name');
  });

  it('flags generic titles', () => {
    for (const t of [
      'Triển vọng tích cực',
      'Nhiều cơ hội tăng trưởng.',
      'rủi ro cần theo dõi',
      'Tình hình khả quan',
    ]) {
      expect(isGenericTitle(t)).toBe(true);
    }
    expect(isGenericTitle('Công suất HRC mới đóng góp từ 2026')).toBe(false);
    expect(codes(check('Biên lợi nhuận mở rộng.', [ec()], {}, 'Triển vọng tích cực'))).toContain(
      'generic_title',
    );
  });

  it('flags technical terms', () => {
    expect(codes(check('Dữ liệu lấy từ DATA CACHE nội bộ.'))).toContain('forbidden_term');
    expect(codes(check('Dùng canonical thesis và embedding.'))).toContain('forbidden_term');
    expect(codes(check('Xem nguồn → báo cáo.'))).toContain('forbidden_term');
  });
});

describe('schema, word count, unknown thesis', () => {
  it('rejects empty title/summary and out-of-range materiality', () => {
    expect(codes(check('', [ec()], {}, ''))).toEqual(['schema', 'schema']);
    expect(
      codes(check('Biên lợi nhuận mở rộng.', [ec()], {}, 'Tiêu đề hợp lệ về biên', 0)),
    ).toEqual(['schema']);
    expect(
      codes(check('Biên lợi nhuận mở rộng.', [ec()], {}, 'Tiêu đề hợp lệ về biên', 6)),
    ).toEqual(['schema']);
    expect(
      codes(check('Biên lợi nhuận mở rộng.', [ec()], {}, 'Tiêu đề hợp lệ về biên', 2.5)),
    ).toEqual(['schema']);
  });

  it('summary > 60 words and title > 14 words fail; 60 passes', () => {
    const w = (n: number) => Array.from({ length: n }, () => 'từ').join(' ');
    expect(codes(check(w(61)))).toContain('word_count');
    expect(codes(check(w(60)))).not.toContain('word_count');
    expect(codes(check('Biên mở rộng.', [ec()], {}, w(15)))).toContain('word_count');
    expect(codes(check('Biên mở rộng.', [ec()], {}, w(14)))).not.toContain('word_count');
  });

  it('unknown thesisId and duplicates', () => {
    const inp = input({ thesisId: 't1' });
    const ok: BuiltThesis = {
      thesisId: 't1',
      title: 'Công suất mới',
      summary: 'Biên mở rộng.',
      materiality: 3,
    };
    const r = validateBuiltTheses([ok, { ...ok, thesisId: 'ghost' }, ok], {
      inputs: [inp],
      brokerNames: [],
    });
    expect(r.passed).toEqual([ok]);
    expect(r.failures.map((f) => [f.thesisId, f.code])).toEqual([
      ['ghost', 'unknown_thesis'],
      ['t1', 'schema'],
    ]);
  });

  it('passes a clean thesis and keeps input order of passed ones', () => {
    const r = check('Công suất mới giúp biên lợi nhuận mở rộng, dự kiến phát huy từ năm sau.');
    expect(r.failures).toEqual([]);
    expect(r.passed).toHaveLength(1);
  });
});

describe('number traceability (spec 21.3, test 24)', () => {
  const claims = [
    ec({
      timeHorizon: 'Q4/2026',
      numbers: [
        num(12.5, '%', '2026E'),
        num(12_500, 'tỷ đồng', 'FY2026'),
        num(68_000, 'VND/cổ phiếu'),
        num(3.2, 'nghìn tỷ đồng'),
      ],
    }),
    ec({ timeHorizon: 'H2/2027', numbers: [num(450, 'triệu USD', '2027')] }),
  ];
  const trace = (s: string) => untraceableNumbers(s, claims);

  it('test 24: a number absent from the claims fails the thesis', () => {
    const r = check('Lợi nhuận dự kiến tăng 35% trong năm 2026.', claims);
    expect(codes(r)).toContain('untraceable_number');
    expect(r.failures[0]!.detail).toContain('35%');
  });

  it('accepts Vietnamese and English number formats', () => {
    expect(trace('Doanh thu 12.500 tỷ đồng')).toEqual([]);
    expect(trace('Doanh thu 12,500 tỷ đồng')).toEqual([]);
    expect(trace('biên 12,5%')).toEqual([]);
    expect(trace('biên 12.5%')).toEqual([]);
    expect(trace('giá 68.000 đồng')).toEqual([]);
    expect(trace('giá 68,000 đồng')).toEqual([]);
    expect(trace('giá 68 nghìn đồng')).toEqual([]);
    expect(trace('vốn hóa 3.200 tỷ đồng')).toEqual([]); // 3.2 nghìn tỷ = 3.200 tỷ
    expect(trace('vốn 3,2 nghìn tỷ đồng')).toEqual([]);
    expect(trace('1.250.000 tỷ')).toEqual(['1.250.000']);
    expect(trace('12.500 tỷ đồng và 3,2 nghìn tỷ')).toEqual([]);
  });

  it('scales between nghìn / triệu / tỷ', () => {
    expect(trace('12,5 nghìn tỷ đồng')).toEqual([]); // 12,500 tỷ
    expect(trace('12.500.000 triệu đồng')).toEqual([]);
    expect(trace('450 triệu USD')).toEqual([]);
    expect(trace('0,45 tỷ USD')).toEqual([]);
    expect(trace('45 tỷ USD')).toEqual(['45']);
  });

  it('rounds within tolerance: displayed precision or 1%', () => {
    const c = [ec({ numbers: [num(12.46, '%'), num(12_547, 'tỷ đồng'), num(7.04, '%')] })];
    expect(untraceableNumbers('biên 12,5%', c)).toEqual([]); // 12.46 → 12.5
    expect(untraceableNumbers('biên 12%', c)).toEqual([]); // 12.46 → 12
    expect(untraceableNumbers('khoảng 12.500 tỷ đồng', c)).toEqual([]); // 0.4% off
    expect(untraceableNumbers('biên 14%', c)).toEqual(['14%']);
    expect(untraceableNumbers('tăng 7,0%', c)).toEqual([]);
    expect(untraceableNumbers('tăng 7,5%', c)).toEqual(['7,5%']);
  });

  it('percentages must come from percentage claim numbers; amounts not from percentages', () => {
    expect(trace('45%')).toEqual(['45%']);
    expect(
      untraceableNumbers('lợi nhuận 12,5 tỷ đồng', [ec({ numbers: [num(12.5, '%')] })]),
    ).toEqual(['12,5']);
    expect(untraceableNumbers('tăng 12,5%', [ec({ numbers: [num(12.5, 'tỷ đồng')] })])).toEqual([
      '12,5%',
    ]);
  });

  it('handles negatives (giảm 5% vs -5)', () => {
    expect(untraceableNumbers('giảm 5%', [ec({ numbers: [num(-5, '%')] })])).toEqual([]);
  });

  it('quarters, halves and years', () => {
    expect(trace('vận hành Q4/2026')).toEqual([]);
    expect(trace('vận hành quý 4/2026')).toEqual([]);
    expect(trace('vận hành quý IV/2026')).toEqual([]);
    expect(trace('vận hành 4Q26')).toEqual([]);
    expect(trace('vận hành Q4')).toEqual([]);
    expect(trace('vận hành Q3/2026')).toEqual(['Q3/2026']);
    expect(trace('vận hành Q4/2027')).toEqual(['Q4/2027']);
    expect(trace('hoàn thành H2/2027')).toEqual([]);
    expect(trace('hoàn thành nửa cuối năm 2027')).toEqual([]);
    expect(trace('hoàn thành 2H27')).toEqual([]);
    expect(trace('hoàn thành H1/2027')).toEqual(['H1/2027']);
    expect(trace('trong năm 2026')).toEqual([]);
    expect(trace('trong năm 2029')).toEqual(['2029']);
    expect(trace('giai đoạn FY2026')).toEqual([]);
    expect(trace('năm 2027')).toEqual([]);
  });

  it('years are not confused with amounts: "2.030 tỷ" is an amount', () => {
    expect(
      untraceableNumbers('doanh thu 2030 tỷ đồng', [ec({ numbers: [num(2030, 'tỷ đồng')] })]),
    ).toEqual([]);
    expect(untraceableNumbers('doanh thu 2030 tỷ đồng', claims)).toEqual(['2030']);
  });

  it('ignores small counts, tickers, and calendar months; keeps larger counts strict', () => {
    expect(trace('Hai dự án và 3 nhà máy, tháng 10, VN30, HPG, L1')).toEqual([]);
    expect(trace('trong 24 tháng tới')).toEqual(['24']);
    expect(untraceableNumbers('trong 24 tháng tới', [ec({ timeHorizon: '24 tháng' })])).toEqual([]);
    expect(trace('tăng 5%')).toEqual(['5%']); // a percent is never a "small count"
  });

  it('period-only matches: summary Q/H year needs the year in the evidence', () => {
    const c = [ec({ timeHorizon: 'Q4', numbers: [num(10, '%', '2026')] })];
    expect(untraceableNumbers('vào Q4/2026', c)).toEqual([]);
    expect(untraceableNumbers('vào Q4/2027', c)).toEqual(['Q4/2027']);
  });

  it('no numbers at all → nothing to trace', () => {
    expect(trace('Công suất mới giúp biên lợi nhuận mở rộng')).toEqual([]);
  });
});

describe('disagreement (spec 21.4, test 21)', () => {
  const dis = {
    dimension: 'timeline' as const,
    note: 'n',
    values: [
      { broker: 'B1', value: 'Q4/2026' },
      { broker: 'B2', value: 'H1/2027' },
      { broker: 'B3', value: 'H2/2027' },
    ],
  };
  const tl = [ec({ timeHorizon: 'Q4/2026 – H2/2027' })];

  it('summary picks a single date as fact → fails', () => {
    const r = check('Dự án dự kiến vận hành từ Q4/2026 và đóng góp doanh thu.', tl, {
      disagreement: dis,
    });
    expect(codes(r)).toEqual(['disagreement']);
  });

  it('summary that hedges or cites several values passes', () => {
    expect(
      check('Thời điểm vận hành chưa thống nhất, dự kiến từ Q4/2026 đến H2/2027.', tl, {
        disagreement: dis,
      }).failures,
    ).toEqual([]);
    expect(
      check('Mốc vận hành dự kiến khác nhau giữa các báo cáo.', tl, { disagreement: dis }).failures,
    ).toEqual([]);
    expect(
      check('Dự án dự kiến vận hành Q4/2026 hoặc muộn hơn.', tl, { disagreement: dis }).failures,
    ).toEqual([]);
    expect(
      check('Dự án dự kiến vận hành từ Q4/2026, có báo cáo cho rằng H2/2027.', tl, {
        disagreement: dis,
      }).failures,
    ).toEqual([]);
  });

  it('summary mentioning none of the values (no date) passes', () => {
    expect(
      check('Dự án mới sẽ đóng góp doanh thu khi đi vào vận hành.', tl, { disagreement: dis })
        .failures,
    ).toEqual([]);
  });

  it('summary signalling disagreement without ≥2 distinct values fails', () => {
    expect(codes(check('Các báo cáo khác nhau về mốc vận hành.', tl))).toEqual(['disagreement']);
    const one = {
      ...dis,
      values: [
        { broker: 'B1', value: 'Q4/2026' },
        { broker: 'B2', value: 'q4/2026' },
      ],
    };
    expect(
      codes(check('Mốc vận hành chưa thống nhất giữa các báo cáo.', tl, { disagreement: one })),
    ).toEqual(['disagreement']);
    expect(
      codes(
        check('Giá trị dao động từ 10 đến 12 tùy theo báo cáo.', [
          ec({ numbers: [num(10, ''), num(12, '')] }),
        ]),
      ),
    ).toEqual(['disagreement']);
  });

  it('numeric disagreement values are matched by number', () => {
    const d = {
      dimension: 'size' as const,
      note: 'n',
      values: [
        { broker: 'B1', value: '12,5%' },
        { broker: 'B2', value: '15%' },
      ],
    };
    const cl = [ec({ numbers: [num(12.5, '%'), num(15, '%')] })];
    expect(
      codes(check('Biên lợi nhuận gộp đạt 12,5% nhờ chi phí giảm.', cl, { disagreement: d })),
    ).toEqual(['disagreement']);
    expect(
      check('Biên lợi nhuận gộp dao động từ 12,5% đến 15% tùy báo cáo.', cl, { disagreement: d })
        .failures,
    ).toEqual([]);
  });
});

describe('certainty', () => {
  const fc = [ec({ claimType: 'forecast' })];
  it('forecast claim + "chắc chắn" fails; hedged wording passes', () => {
    expect(codes(check('Lợi nhuận chắc chắn tăng mạnh.', fc))).toEqual(['certainty']);
    expect(codes(check('Dự án sẽ chắc ghi nhận doanh thu.', fc))).toEqual(['certainty']);
    expect(codes(check('Biên lợi nhuận được đảm bảo mở rộng.', fc))).toEqual(['certainty']);
    expect(check('Lợi nhuận dự kiến tăng nếu dự án vận hành đúng tiến độ.', fc).failures).toEqual(
      [],
    );
    expect(check('Lợi nhuận chưa chắc chắn tăng.', fc).failures).toEqual([]);
  });

  it('claims worded with dự kiến / kỳ vọng / ước tính / dự báo count as forecasts', () => {
    for (const w of ['dự kiến', 'Kỳ vọng', 'ước tính', 'dự báo']) {
      const c = [ec({ claimType: 'growth_driver', summary: `${w} vận hành năm sau` })];
      expect(codes(check('Dự án chắc chắn vận hành.', c))).toEqual(['certainty']);
    }
  });

  it('a pure fact claim may be stated firmly', () => {
    expect(
      check('Nhà máy chắc chắn đã vận hành.', [
        ec({ claimType: 'growth_driver', summary: 'Nhà máy đã vận hành' }),
      ]).failures,
    ).toEqual([]);
  });
});
