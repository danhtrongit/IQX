/**
 * Metadata và kiểm tra tham số chỉ báo của Flashback.
 *
 * Danh mục là bảng tĩnh, đóng băng, chốt theo registry kỹ thuật của Bot tại thời điểm ra spec
 * Flashback v1.1 §2.7 (registry v16). Flashback chỉ vẽ chỉ báo lên biểu đồ để người chơi tự đọc,
 * không có điều kiện Mua/Bán, nên không đọc registry của Bot: registry đổi hình (spec chỉ báo V3,
 * tham số theo từng dòng điều kiện) thì tên tham số, miền giá trị, bước nhảy và quy tắc kiểm tra
 * chéo đã lưu trong `flashback_entries.indicator_params` vẫn phải giữ nguyên. Muốn đổi danh mục
 * này phải sửa bảng ở đây và cập nhật `flashback.indicators.test.ts`.
 */

/** Giá trị một tham số: số đơn hoặc cặp ngưỡng dưới/trên (chỉ báo có hai ngưỡng). */
export type FlashbackIndicatorParamValue = number | { lower: number; upper: number };

/** Bộ tham số của một chỉ báo, theo đúng key của danh mục. */
export type FlashbackIndicatorParams = Record<string, FlashbackIndicatorParamValue>;

/** Một chỉ báo được chọn trong lượt chơi. */
export interface FlashbackIndicatorInstanceInput {
  readonly id: string;
  readonly params: FlashbackIndicatorParams;
}

/** Một phía của tham số (ngưỡng dưới theo phía Mua, ngưỡng trên theo phía Bán của Bot). */
export interface FlashbackParamSide {
  readonly min: number;
  readonly max: number;
  readonly default: number;
  readonly label: string;
}

/** Metadata một tham số gửi cho trình duyệt. */
export interface FlashbackIndicatorParamMeta {
  readonly key: string;
  readonly label: string;
  readonly type: 'integer' | 'number';
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
  /** Mặc định (lấy theo ngưỡng dưới khi phía Mua và phía Bán khác nhau). */
  readonly default: number;
  /** Ngưỡng dưới khi phía Mua và phía Bán khác nhau (ví dụ RSI). */
  readonly lower: FlashbackParamSide | null;
  /** Ngưỡng trên khi phía Mua và phía Bán khác nhau (ví dụ RSI). */
  readonly upper: FlashbackParamSide | null;
}

/** Metadata một chỉ báo gửi cho trình duyệt. */
export interface FlashbackIndicatorMeta {
  readonly id: string;
  readonly name: string;
  readonly chapter: number;
  readonly lesson_id: string | null;
  readonly params: readonly FlashbackIndicatorParamMeta[];
  readonly cross_fields: readonly { left: string; op: '>' | '<'; right: string }[];
  /** Số phiên lịch sử cần thêm để khởi tạo chỉ báo với tham số mặc định. */
  readonly warmup_sessions: number;
}

/**
 * Các field là "cửa sổ nhìn lại" (số phiên cần dữ liệu quá khứ). Field loại `number` là ngưỡng
 * (RSI 30, CCI -100) nên không tính vào số phiên khởi tạo.
 */
const WINDOW_FIELD_KEYS: Record<string, true> = {
  period: true,
  lookback: true,
  baseline: true,
  sma_period: true,
  fast: true,
  slow: true,
  signal: true,
  smooth: true,
  k: true,
  d: true,
};

/** Sai số cho phép khi kiểm tra giá trị nằm đúng bước nhảy. */
const STEP_TOLERANCE = 1e-6;

function computeIndicatorWarmup(
  id: string,
  paramsMeta: readonly FlashbackIndicatorParamMeta[],
  values: FlashbackIndicatorParams,
): number {
  const numOf = (key: string, fallback: number): number => {
    const raw = values[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    const meta = paramsMeta.find((item) => item.key === key);
    return meta ? meta.default : fallback;
  };
  if (id === 'macd') {
    return numOf('slow', 26) + numOf('signal', 9);
  }
  if (id === 'stochastic') {
    return numOf('k', 14) + numOf('smooth', 3) + numOf('d', 3);
  }
  if (id === 'dmi') {
    return numOf('period', 14) * 2;
  }
  if (id === 'obv') {
    const smaPeriod = values.sma_period;
    if (typeof smaPeriod === 'number' && Number.isFinite(smaPeriod)) return smaPeriod;
    return numOf('baseline', 20);
  }
  let maxWindow = 0;
  for (const param of paramsMeta) {
    if (param.type !== 'integer' || !WINDOW_FIELD_KEYS[param.key]) continue;
    const raw = values[param.key];
    const numeric = typeof raw === 'number' && Number.isFinite(raw) ? raw : param.default;
    if (numeric > maxWindow) maxWindow = numeric;
  }
  return maxWindow;
}

/**
 * Bảng chỉ báo, đã sắp theo thứ tự bài học của 16 chỉ báo trong danh mục Học viện v3.3
 * (spec Flashback v1.1 §2.7). `warmup_sessions` không nằm trong bảng mà tính từ chính các tham số
 * này khi dựng danh mục.
 */
const FLASHBACK_INDICATOR_TABLE: readonly Omit<FlashbackIndicatorMeta, 'warmup_sessions'>[] = [
  {
    id: 'volume',
    name: 'Khối lượng',
    chapter: 4,
    lesson_id: 'ch04-l04',
    params: [
      {
        key: 'lookback',
        label: 'Số phiên tham chiếu',
        type: 'integer',
        min: 5,
        max: 100,
        step: 1,
        unit: 'phiên',
        default: 20,
        lower: null,
        upper: null,
      },
      {
        key: 'mult',
        label: 'Hệ số khối lượng',
        type: 'number',
        min: 0.5,
        max: 3,
        step: 0.1,
        unit: 'lần',
        default: 1,
        lower: null,
        upper: null,
      },
    ],
    cross_fields: [],
  },
  {
    id: 'ma',
    name: 'MA / SMA',
    chapter: 4,
    lesson_id: 'ch04-l05',
    params: [
      {
        key: 'period',
        label: 'Chu kỳ SMA',
        type: 'integer',
        min: 5,
        max: 200,
        step: 1,
        unit: 'phiên',
        default: 20,
        lower: null,
        upper: null,
      },
    ],
    cross_fields: [],
  },
  {
    id: 'rsi',
    name: 'RSI',
    chapter: 4,
    lesson_id: 'ch04-l06',
    params: [
      {
        key: 'period',
        label: 'Chu kỳ RSI',
        type: 'integer',
        min: 5,
        max: 50,
        step: 1,
        unit: 'phiên',
        default: 14,
        lower: null,
        upper: null,
      },
      {
        key: 'level',
        label: 'Ngưỡng RSI',
        type: 'number',
        min: 0,
        max: 100,
        step: 1,
        unit: '',
        default: 30,
        lower: { min: 0, max: 100, default: 30, label: 'Ngưỡng quá bán' },
        upper: { min: 0, max: 100, default: 70, label: 'Ngưỡng quá mua' },
      },
    ],
    cross_fields: [],
  },
  {
    id: 'macd',
    name: 'MACD',
    chapter: 4,
    lesson_id: 'ch04-l07',
    params: [
      {
        key: 'fast',
        label: 'Chu kỳ EMA nhanh',
        type: 'integer',
        min: 2,
        max: 50,
        step: 1,
        unit: 'phiên',
        default: 12,
        lower: null,
        upper: null,
      },
      {
        key: 'slow',
        label: 'Chu kỳ EMA chậm',
        type: 'integer',
        min: 5,
        max: 100,
        step: 1,
        unit: 'phiên',
        default: 26,
        lower: null,
        upper: null,
      },
      {
        key: 'signal',
        label: 'Chu kỳ đường tín hiệu',
        type: 'integer',
        min: 2,
        max: 30,
        step: 1,
        unit: 'phiên',
        default: 9,
        lower: null,
        upper: null,
      },
    ],
    cross_fields: [{ left: 'fast', op: '<', right: 'slow' }],
  },
  {
    id: 'bollinger',
    name: 'Bollinger Bands',
    chapter: 4,
    lesson_id: 'ch04-l08',
    params: [
      {
        key: 'period',
        label: 'Chu kỳ Bollinger',
        type: 'integer',
        min: 10,
        max: 100,
        step: 1,
        unit: 'phiên',
        default: 20,
        lower: null,
        upper: null,
      },
      {
        key: 'k',
        label: 'Hệ số dải',
        type: 'number',
        min: 1,
        max: 3.5,
        step: 0.1,
        unit: '',
        default: 2,
        lower: null,
        upper: null,
      },
    ],
    cross_fields: [],
  },
  {
    id: 'ema',
    name: 'EMA',
    chapter: 6,
    lesson_id: 'ch06-l01',
    params: [
      {
        key: 'period',
        label: 'Chu kỳ EMA',
        type: 'integer',
        min: 5,
        max: 200,
        step: 1,
        unit: 'phiên',
        default: 20,
        lower: null,
        upper: null,
      },
    ],
    cross_fields: [],
  },
  {
    id: 'ma_cross',
    name: 'MA Cross',
    chapter: 6,
    lesson_id: 'ch06-l02',
    params: [
      {
        key: 'fast',
        label: 'Chu kỳ SMA nhanh',
        type: 'integer',
        min: 5,
        max: 200,
        step: 1,
        unit: 'phiên',
        default: 20,
        lower: null,
        upper: null,
      },
      {
        key: 'slow',
        label: 'Chu kỳ SMA chậm',
        type: 'integer',
        min: 5,
        max: 200,
        step: 1,
        unit: 'phiên',
        default: 50,
        lower: null,
        upper: null,
      },
    ],
    cross_fields: [{ left: 'fast', op: '<', right: 'slow' }],
  },
  {
    id: 'dmi',
    name: 'DMI',
    chapter: 6,
    lesson_id: 'ch06-l03',
    params: [
      {
        key: 'period',
        label: 'Chu kỳ DMI',
        type: 'integer',
        min: 5,
        max: 50,
        step: 1,
        unit: 'phiên',
        default: 14,
        lower: null,
        upper: null,
      },
    ],
    cross_fields: [],
  },
  {
    id: 'donchian',
    name: 'Donchian Channel',
    chapter: 6,
    lesson_id: 'ch06-l04',
    params: [
      {
        key: 'period',
        label: 'Chu kỳ Donchian',
        type: 'integer',
        min: 5,
        max: 252,
        step: 1,
        unit: 'phiên',
        default: 20,
        lower: null,
        upper: null,
      },
    ],
    cross_fields: [],
  },
  {
    id: 'stochastic',
    name: 'Stochastic',
    chapter: 7,
    lesson_id: 'ch07-l01',
    params: [
      {
        key: 'k',
        label: 'Chu kỳ %K',
        type: 'integer',
        min: 5,
        max: 50,
        step: 1,
        unit: 'phiên',
        default: 14,
        lower: null,
        upper: null,
      },
      {
        key: 'd',
        label: 'Chu kỳ %D',
        type: 'integer',
        min: 2,
        max: 20,
        step: 1,
        unit: 'phiên',
        default: 3,
        lower: null,
        upper: null,
      },
      {
        key: 'smooth',
        label: 'Chu kỳ trung bình %K',
        type: 'integer',
        min: 1,
        max: 10,
        step: 1,
        unit: 'phiên',
        default: 3,
        lower: null,
        upper: null,
      },
      {
        key: 'level',
        label: 'Ngưỡng %K',
        type: 'number',
        min: 0,
        max: 100,
        step: 1,
        unit: '',
        default: 20,
        lower: { min: 0, max: 100, default: 20, label: 'Ngưỡng %K' },
        upper: { min: 0, max: 100, default: 80, label: 'Ngưỡng %K' },
      },
    ],
    cross_fields: [],
  },
  {
    id: 'cci',
    name: 'CCI',
    chapter: 7,
    lesson_id: 'ch07-l02',
    params: [
      {
        key: 'period',
        label: 'Chu kỳ CCI',
        type: 'integer',
        min: 5,
        max: 100,
        step: 1,
        unit: 'phiên',
        default: 20,
        lower: null,
        upper: null,
      },
      {
        key: 'level',
        label: 'Ngưỡng CCI',
        type: 'number',
        min: -300,
        max: 300,
        step: 1,
        unit: '',
        default: -100,
        lower: { min: -300, max: 300, default: -100, label: 'Ngưỡng CCI' },
        upper: { min: -300, max: 300, default: 100, label: 'Ngưỡng CCI' },
      },
    ],
    cross_fields: [],
  },
  {
    id: 'roc',
    name: 'ROC',
    chapter: 7,
    lesson_id: 'ch07-l03',
    params: [
      {
        key: 'period',
        label: 'Chu kỳ ROC',
        type: 'integer',
        min: 2,
        max: 252,
        step: 1,
        unit: 'phiên',
        default: 20,
        lower: null,
        upper: null,
      },
      {
        key: 'level',
        label: 'Ngưỡng ROC',
        type: 'number',
        min: -100,
        max: 10000,
        step: 0.1,
        unit: '%',
        default: -5,
        lower: { min: -100, max: 10000, default: -5, label: 'Ngưỡng ROC' },
        upper: { min: -100, max: 10000, default: 5, label: 'Ngưỡng ROC' },
      },
    ],
    cross_fields: [],
  },
  {
    id: 'williams_r',
    name: 'Williams %R',
    chapter: 7,
    lesson_id: 'ch07-l04',
    params: [
      {
        key: 'period',
        label: 'Chu kỳ Williams %R',
        type: 'integer',
        min: 5,
        max: 100,
        step: 1,
        unit: 'phiên',
        default: 14,
        lower: null,
        upper: null,
      },
      {
        key: 'level',
        label: 'Ngưỡng Williams %R',
        type: 'number',
        min: -100,
        max: 0,
        step: 1,
        unit: '',
        default: -80,
        lower: { min: -100, max: 0, default: -80, label: 'Ngưỡng Williams %R' },
        upper: { min: -100, max: 0, default: -20, label: 'Ngưỡng Williams %R' },
      },
    ],
    cross_fields: [],
  },
  {
    id: 'obv',
    name: 'OBV',
    chapter: 7,
    lesson_id: 'ch07-l05',
    params: [
      {
        key: 'baseline',
        label: 'Chu kỳ SMA của OBV',
        type: 'integer',
        min: 5,
        max: 100,
        step: 1,
        unit: 'phiên',
        default: 20,
        lower: null,
        upper: null,
      },
    ],
    cross_fields: [],
  },
  {
    id: 'mfi',
    name: 'MFI',
    chapter: 7,
    lesson_id: 'ch07-l06',
    params: [
      {
        key: 'period',
        label: 'Chu kỳ MFI',
        type: 'integer',
        min: 5,
        max: 50,
        step: 1,
        unit: 'phiên',
        default: 14,
        lower: null,
        upper: null,
      },
      {
        key: 'level',
        label: 'Ngưỡng MFI',
        type: 'number',
        min: 0,
        max: 100,
        step: 1,
        unit: '',
        default: 20,
        lower: { min: 0, max: 100, default: 20, label: 'Ngưỡng MFI' },
        upper: { min: 0, max: 100, default: 80, label: 'Ngưỡng MFI' },
      },
    ],
    cross_fields: [],
  },
  {
    id: 'cmf',
    name: 'Chaikin Money Flow',
    chapter: 7,
    lesson_id: 'ch07-l07',
    params: [
      {
        key: 'period',
        label: 'Chu kỳ CMF',
        type: 'integer',
        min: 5,
        max: 100,
        step: 1,
        unit: 'phiên',
        default: 20,
        lower: null,
        upper: null,
      },
      {
        key: 'level',
        label: 'Ngưỡng CMF',
        type: 'number',
        min: -1,
        max: 1,
        step: 0.01,
        unit: '',
        default: 0,
        lower: null,
        upper: null,
      },
    ],
    cross_fields: [],
  },
];

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function buildCatalog(): readonly FlashbackIndicatorMeta[] {
  return deepFreeze(
    FLASHBACK_INDICATOR_TABLE.map((entry) => ({
      ...entry,
      warmup_sessions: computeIndicatorWarmup(entry.id, entry.params, {}),
    })),
  );
}

/** Danh mục 16 chỉ báo đã sắp theo thứ tự bài học (spec v1.1 §2.7), đóng băng sâu. */
export const FLASHBACK_INDICATORS: readonly FlashbackIndicatorMeta[] = buildCatalog();

/** Toàn bộ chỉ báo của danh mục (chưa lọc theo quyền của người dùng). */
export function flashbackIndicatorCatalog(): readonly FlashbackIndicatorMeta[] {
  return FLASHBACK_INDICATORS;
}

/** Metadata của một chỉ báo theo id. */
export function flashbackIndicatorMeta(id: string): FlashbackIndicatorMeta | undefined {
  return flashbackIndicatorCatalog().find((item) => item.id === id);
}

/** Số phiên lịch sử cần thêm cho một bộ tham số đã chọn. */
export function flashbackWarmupRequired(
  instances: readonly FlashbackIndicatorInstanceInput[],
): number {
  let required = 0;
  for (const instance of instances) {
    const meta = flashbackIndicatorMeta(instance.id);
    if (!meta) continue;
    const warmup = computeIndicatorWarmup(meta.id, meta.params, instance.params);
    if (warmup > required) required = warmup;
  }
  return required;
}

function effectiveNumber(value: FlashbackIndicatorParamValue): number {
  return typeof value === 'number' ? value : value.lower;
}

function checkValue(
  meta: FlashbackIndicatorMeta,
  param: FlashbackIndicatorParamMeta,
  value: FlashbackIndicatorParamValue,
): string | null {
  const check = (raw: number, min: number, max: number): string | null => {
    if (!Number.isFinite(raw)) return `${param.label} không phải số hợp lệ.`;
    if (raw < min || raw > max)
      return `${param.label} phải nằm trong khoảng ${min} - ${max} (đang là ${raw}).`;
    if (param.type === 'integer' && !Number.isInteger(raw))
      return `${param.label} phải là số nguyên.`;
    const steps = (raw - param.min) / param.step;
    if (Math.abs(steps - Math.round(steps)) > STEP_TOLERANCE)
      return `${param.label} phải là bội của ${param.step} (đang là ${raw}).`;
    return null;
  };
  if (typeof value === 'number') return check(value, param.min, param.max);
  const lowerMin = param.lower?.min ?? param.min;
  const lowerMax = param.lower?.max ?? param.max;
  const upperMin = param.upper?.min ?? param.min;
  const upperMax = param.upper?.max ?? param.max;
  const lowerError = check(value.lower, lowerMin, lowerMax);
  if (lowerError) return lowerError;
  const upperError = check(value.upper, upperMin, upperMax);
  if (upperError) return upperError;
  if (value.lower >= value.upper) return 'Ngưỡng dưới phải nhỏ hơn ngưỡng trên.';
  return null;
}

/**
 * Kiểm tra một bộ tham số theo danh mục: key phải có trong danh mục, giá trị phải nằm đúng
 * miền và đúng bước nhảy, và phải thoả các quy tắc kiểm tra chéo (ví dụ MACD fast < slow).
 * Trả về thông báo lỗi tiếng Việt hoặc `null` khi hợp lệ.
 */
export function validateFlashbackIndicatorParams(
  meta: FlashbackIndicatorMeta,
  params: FlashbackIndicatorParams,
): string | null {
  for (const [key, value] of Object.entries(params)) {
    const param = meta.params.find((item) => item.key === key);
    if (!param) return `${meta.name}: không có tham số "${key}".`;
    const error = checkValue(meta, param, value);
    if (error) return `${meta.name}: ${error}`;
  }
  for (const rule of meta.cross_fields) {
    const left = params[rule.left];
    const right = params[rule.right];
    if (left === undefined || right === undefined) continue;
    const leftValue = effectiveNumber(left);
    const rightValue = effectiveNumber(right);
    const ok = rule.op === '<' ? leftValue < rightValue : leftValue > rightValue;
    if (!ok) {
      const leftLabel = meta.params.find((item) => item.key === rule.left)?.label ?? rule.left;
      const rightLabel = meta.params.find((item) => item.key === rule.right)?.label ?? rule.right;
      return `${meta.name}: ${leftLabel} phải ${rule.op === '<' ? 'nhỏ hơn' : 'lớn hơn'} ${rightLabel}.`;
    }
  }
  return null;
}
