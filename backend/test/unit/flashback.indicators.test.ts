import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

// Flashback không được phụ thuộc vào registry kỹ thuật của Bot: nếu `flashback.indicators`
// (hoặc thứ nó import) nạp module này thì việc import ở dưới sẽ lỗi ngay.
vi.mock('../../src/modules/quant/v2/technical-registry.js', () => {
  throw new Error('Flashback không được nạp registry kỹ thuật của Bot.');
});

import {
  FLASHBACK_INDICATORS,
  flashbackIndicatorCatalog,
  flashbackIndicatorMeta,
  flashbackWarmupRequired,
  validateFlashbackIndicatorParams,
  type FlashbackIndicatorMeta,
  type FlashbackIndicatorParamMeta,
  type FlashbackIndicatorParams,
  type FlashbackParamSide,
} from '../../src/modules/flashback/flashback.indicators.js';

/**
 * Danh mục chỉ báo Flashback là bảng tĩnh chốt theo registry kỹ thuật v16 (spec Flashback v1.1
 * §2.7). Bảng dưới đây là bản chụp của danh mục trước khi tách khỏi registry; đổi bất kỳ giá trị
 * nào (tên tham số, miền, bước nhảy, nhãn, thứ tự, số phiên khởi tạo) đều làm test này đỏ, vì các
 * tham số đã lưu trong `flashback_entries.indicator_params` và hộp thoại phía trình duyệt đang
 * dựa vào đúng các giá trị này.
 */
const CATALOG_SHA256 = '5875b441d83f1d3bfa02149a52cee598c3b397b2e24d903379ba9234b6d5b69c';

function describeSide(side: FlashbackParamSide): string {
  return `${side.min}..${side.max} =${side.default} "${side.label}"`;
}

function describeParam(param: FlashbackIndicatorParamMeta): string {
  const base = `${param.key} "${param.label}" ${param.type} ${param.min}..${param.max} /${param.step} unit="${param.unit}" =${param.default}`;
  if (!param.lower || !param.upper) return base;
  return `${base} | thấp ${describeSide(param.lower)} | cao ${describeSide(param.upper)}`;
}

function describeIndicator(meta: FlashbackIndicatorMeta) {
  return {
    id: meta.id,
    name: meta.name,
    chapter: meta.chapter,
    lessonId: meta.lesson_id,
    warmup: meta.warmup_sessions,
    cross: meta.cross_fields.map((rule) => `${rule.left} ${rule.op} ${rule.right}`),
    params: meta.params.map(describeParam),
  };
}

const EXPECTED_CATALOG = [
  {
    id: 'volume',
    name: 'Khối lượng',
    chapter: 4,
    lessonId: 'ch04-l04',
    warmup: 20,
    cross: [],
    params: [
      'lookback "Số phiên tham chiếu" integer 5..100 /1 unit="phiên" =20',
      'mult "Hệ số khối lượng" number 0.5..3 /0.1 unit="lần" =1',
    ],
  },
  {
    id: 'ma',
    name: 'MA / SMA',
    chapter: 4,
    lessonId: 'ch04-l05',
    warmup: 20,
    cross: [],
    params: ['period "Chu kỳ SMA" integer 5..200 /1 unit="phiên" =20'],
  },
  {
    id: 'rsi',
    name: 'RSI',
    chapter: 4,
    lessonId: 'ch04-l06',
    warmup: 14,
    cross: [],
    params: [
      'period "Chu kỳ RSI" integer 5..50 /1 unit="phiên" =14',
      'level "Ngưỡng RSI" number 0..100 /1 unit="" =30 | thấp 0..100 =30 "Ngưỡng quá bán" | cao 0..100 =70 "Ngưỡng quá mua"',
    ],
  },
  {
    id: 'macd',
    name: 'MACD',
    chapter: 4,
    lessonId: 'ch04-l07',
    warmup: 35,
    cross: ['fast < slow'],
    params: [
      'fast "Chu kỳ EMA nhanh" integer 2..50 /1 unit="phiên" =12',
      'slow "Chu kỳ EMA chậm" integer 5..100 /1 unit="phiên" =26',
      'signal "Chu kỳ đường tín hiệu" integer 2..30 /1 unit="phiên" =9',
    ],
  },
  {
    id: 'bollinger',
    name: 'Bollinger Bands',
    chapter: 4,
    lessonId: 'ch04-l08',
    warmup: 20,
    cross: [],
    params: [
      'period "Chu kỳ Bollinger" integer 10..100 /1 unit="phiên" =20',
      'k "Hệ số dải" number 1..3.5 /0.1 unit="" =2',
    ],
  },
  {
    id: 'ema',
    name: 'EMA',
    chapter: 6,
    lessonId: 'ch06-l01',
    warmup: 20,
    cross: [],
    params: ['period "Chu kỳ EMA" integer 5..200 /1 unit="phiên" =20'],
  },
  {
    id: 'ma_cross',
    name: 'MA Cross',
    chapter: 6,
    lessonId: 'ch06-l02',
    warmup: 50,
    cross: ['fast < slow'],
    params: [
      'fast "Chu kỳ SMA nhanh" integer 5..200 /1 unit="phiên" =20',
      'slow "Chu kỳ SMA chậm" integer 5..200 /1 unit="phiên" =50',
    ],
  },
  {
    id: 'dmi',
    name: 'DMI',
    chapter: 6,
    lessonId: 'ch06-l03',
    warmup: 28,
    cross: [],
    params: ['period "Chu kỳ DMI" integer 5..50 /1 unit="phiên" =14'],
  },
  {
    id: 'donchian',
    name: 'Donchian Channel',
    chapter: 6,
    lessonId: 'ch06-l04',
    warmup: 20,
    cross: [],
    params: ['period "Chu kỳ Donchian" integer 5..252 /1 unit="phiên" =20'],
  },
  {
    id: 'stochastic',
    name: 'Stochastic',
    chapter: 7,
    lessonId: 'ch07-l01',
    warmup: 20,
    cross: [],
    params: [
      'k "Chu kỳ %K" integer 5..50 /1 unit="phiên" =14',
      'd "Chu kỳ %D" integer 2..20 /1 unit="phiên" =3',
      'smooth "Chu kỳ trung bình %K" integer 1..10 /1 unit="phiên" =3',
      'level "Ngưỡng %K" number 0..100 /1 unit="" =20 | thấp 0..100 =20 "Ngưỡng %K" | cao 0..100 =80 "Ngưỡng %K"',
    ],
  },
  {
    id: 'cci',
    name: 'CCI',
    chapter: 7,
    lessonId: 'ch07-l02',
    warmup: 20,
    cross: [],
    params: [
      'period "Chu kỳ CCI" integer 5..100 /1 unit="phiên" =20',
      'level "Ngưỡng CCI" number -300..300 /1 unit="" =-100 | thấp -300..300 =-100 "Ngưỡng CCI" | cao -300..300 =100 "Ngưỡng CCI"',
    ],
  },
  {
    id: 'roc',
    name: 'ROC',
    chapter: 7,
    lessonId: 'ch07-l03',
    warmup: 20,
    cross: [],
    params: [
      'period "Chu kỳ ROC" integer 2..252 /1 unit="phiên" =20',
      'level "Ngưỡng ROC" number -100..10000 /0.1 unit="%" =-5 | thấp -100..10000 =-5 "Ngưỡng ROC" | cao -100..10000 =5 "Ngưỡng ROC"',
    ],
  },
  {
    id: 'williams_r',
    name: 'Williams %R',
    chapter: 7,
    lessonId: 'ch07-l04',
    warmup: 14,
    cross: [],
    params: [
      'period "Chu kỳ Williams %R" integer 5..100 /1 unit="phiên" =14',
      'level "Ngưỡng Williams %R" number -100..0 /1 unit="" =-80 | thấp -100..0 =-80 "Ngưỡng Williams %R" | cao -100..0 =-20 "Ngưỡng Williams %R"',
    ],
  },
  {
    id: 'obv',
    name: 'OBV',
    chapter: 7,
    lessonId: 'ch07-l05',
    warmup: 20,
    cross: [],
    params: ['baseline "Chu kỳ SMA của OBV" integer 5..100 /1 unit="phiên" =20'],
  },
  {
    id: 'mfi',
    name: 'MFI',
    chapter: 7,
    lessonId: 'ch07-l06',
    warmup: 14,
    cross: [],
    params: [
      'period "Chu kỳ MFI" integer 5..50 /1 unit="phiên" =14',
      'level "Ngưỡng MFI" number 0..100 /1 unit="" =20 | thấp 0..100 =20 "Ngưỡng MFI" | cao 0..100 =80 "Ngưỡng MFI"',
    ],
  },
  {
    id: 'cmf',
    name: 'Chaikin Money Flow',
    chapter: 7,
    lessonId: 'ch07-l07',
    warmup: 20,
    cross: [],
    params: [
      'period "Chu kỳ CMF" integer 5..100 /1 unit="phiên" =20',
      'level "Ngưỡng CMF" number -1..1 /0.01 unit="" =0',
    ],
  },
];

/** Tham số mặc định của một chỉ báo, đúng dạng trình duyệt gửi lên. */
function defaultParams(meta: FlashbackIndicatorMeta): FlashbackIndicatorParams {
  const params: FlashbackIndicatorParams = {};
  for (const param of meta.params) {
    params[param.key] =
      param.lower && param.upper
        ? { lower: param.lower.default, upper: param.upper.default }
        : param.default;
  }
  return params;
}

function isFrozenDeep(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(isFrozenDeep);
}

describe('danh mục chỉ báo Flashback (bảng tĩnh)', () => {
  it('khớp từng chỉ báo, tham số, nhãn, thứ tự và số phiên khởi tạo của danh mục trước khi tách khỏi registry', () => {
    expect(FLASHBACK_INDICATORS.map(describeIndicator)).toEqual(EXPECTED_CATALOG);
  });

  it('JSON gửi cho trình duyệt giữ nguyên từng byte (thứ tự key, kiểu số)', () => {
    const digest = createHash('sha256').update(JSON.stringify(FLASHBACK_INDICATORS)).digest('hex');
    expect(digest).toBe(CATALOG_SHA256);
  });

  it('đóng băng sâu và flashbackIndicatorCatalog() trả đúng danh mục đó', () => {
    expect(flashbackIndicatorCatalog()).toBe(FLASHBACK_INDICATORS);
    expect(isFrozenDeep(FLASHBACK_INDICATORS)).toBe(true);
    expect(() => {
      (FLASHBACK_INDICATORS as FlashbackIndicatorMeta[]).push(FLASHBACK_INDICATORS[0]!);
    }).toThrow(TypeError);
    expect(() => {
      (FLASHBACK_INDICATORS[0]!.params[0] as { min: number }).min = 1;
    }).toThrow(TypeError);
  });

  it('không import registry kỹ thuật hay bất kỳ module quant nào', () => {
    const source = readFileSync(
      new URL('../../src/modules/flashback/flashback.indicators.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/from\s+['"][^'"]*quant\//);
    expect(source).not.toMatch(/loadTechnicalRegistry/);
  });

  it('tra cứu theo id và trả undefined cho chỉ báo lạ', () => {
    expect(flashbackIndicatorMeta('macd')?.name).toBe('MACD');
    expect(flashbackIndicatorMeta('ichimoku')).toBeUndefined();
  });

  it('tham số mặc định của mọi chỉ báo hợp lệ và cho đúng số phiên khởi tạo của danh mục', () => {
    for (const meta of FLASHBACK_INDICATORS) {
      const params = defaultParams(meta);
      expect(validateFlashbackIndicatorParams(meta, params), meta.id).toBeNull();
      expect(flashbackWarmupRequired([{ id: meta.id, params }]), meta.id).toBe(
        meta.warmup_sessions,
      );
      expect(flashbackWarmupRequired([{ id: meta.id, params: {} }]), meta.id).toBe(
        meta.warmup_sessions,
      );
    }
  });

  it('kiểm tra miền, bước nhảy, số nguyên, key lạ và quy tắc chéo theo bảng đã chốt', () => {
    const meta = (id: string): FlashbackIndicatorMeta => flashbackIndicatorMeta(id)!;
    const check = (id: string, params: FlashbackIndicatorParams) =>
      validateFlashbackIndicatorParams(meta(id), params);

    expect(check('ma', { period: 4 })).toBe(
      'MA / SMA: Chu kỳ SMA phải nằm trong khoảng 5 - 200 (đang là 4).',
    );
    expect(check('ma', { period: 200 })).toBeNull();
    expect(check('macd', { fast: 51 })).toBe(
      'MACD: Chu kỳ EMA nhanh phải nằm trong khoảng 2 - 50 (đang là 51).',
    );
    expect(check('macd', { fast: 26, slow: 26 })).toBe(
      'MACD: Chu kỳ EMA nhanh phải nhỏ hơn Chu kỳ EMA chậm.',
    );
    expect(check('ma_cross', { fast: 60, slow: 50 })).toBe(
      'MA Cross: Chu kỳ SMA nhanh phải nhỏ hơn Chu kỳ SMA chậm.',
    );
    expect(check('rsi', { period: 14.5 })).toBe('RSI: Chu kỳ RSI phải là số nguyên.');
    expect(check('rsi', { period: 14, level: { lower: 30, upper: 70 } })).toBeNull();
    expect(check('rsi', { period: 14, level: { lower: 70, upper: 70 } })).toBe(
      'RSI: Ngưỡng dưới phải nhỏ hơn ngưỡng trên.',
    );
    expect(check('rsi', { foo: 1 })).toBe('RSI: không có tham số "foo".');
    expect(check('roc', { period: 20, level: { lower: -5.05, upper: 5 } })).toBe(
      'ROC: Ngưỡng ROC phải là bội của 0.1 (đang là -5.05).',
    );
    expect(check('roc', { period: 20, level: { lower: -100, upper: 10000 } })).toBeNull();
    expect(check('cmf', { level: 0.005 })).toBe(
      'Chaikin Money Flow: Ngưỡng CMF phải là bội của 0.01 (đang là 0.005).',
    );
    expect(check('cmf', { level: -1 })).toBeNull();
    expect(check('bollinger', { period: 9 })).toBe(
      'Bollinger Bands: Chu kỳ Bollinger phải nằm trong khoảng 10 - 100 (đang là 9).',
    );
  });

  it('tính số phiên khởi tạo theo tham số người chơi chọn, lấy giá trị lớn nhất giữa các chỉ báo', () => {
    expect(flashbackWarmupRequired([])).toBe(0);
    expect(flashbackWarmupRequired([{ id: 'unknown', params: {} }])).toBe(0);
    expect(
      flashbackWarmupRequired([{ id: 'macd', params: { fast: 12, slow: 40, signal: 10 } }]),
    ).toBe(50);
    expect(
      flashbackWarmupRequired([
        { id: 'stochastic', params: { k: 21, smooth: 5, d: 4, level: { lower: 20, upper: 80 } } },
      ]),
    ).toBe(30);
    expect(flashbackWarmupRequired([{ id: 'dmi', params: { period: 30 } }])).toBe(60);
    expect(flashbackWarmupRequired([{ id: 'obv', params: { baseline: 50 } }])).toBe(50);
    expect(
      flashbackWarmupRequired([
        { id: 'rsi', params: { period: 14 } },
        { id: 'ma', params: { period: 100 } },
        { id: 'obv', params: {} },
      ]),
    ).toBe(100);
  });
});
