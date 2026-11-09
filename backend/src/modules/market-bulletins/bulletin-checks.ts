import { LEVEL_FAR_WARNING_RATIO, type SlotNumber } from './bulletin.constants.js';
import { dmy, nf, vnTime } from './bulletin.format.js';
import {
  COMMENT_KEYS,
  COMMENT_LABELS,
  LEVEL_KEYS,
  type BulletinCheck,
  type BulletinChecks,
  type BulletinContent,
  type CommentKey,
  type Levels,
  type SlotSnapshot,
  type VnIndexModel,
} from './bulletin.types.js';

/** Tham số chỉ báo và số nguyên nhỏ thường gặp trong nhận định (spec §3.5: 14, 20, 50, 200, 12, 26, 9, 30, 70…). */
const PARAMETER_NUMBERS: readonly number[] = [14, 20, 50, 60, 200, 12, 26, 9, 30, 70, 5, 1, 2, 3];

const NUMBER_PATTERN = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;

/** `1.755,61` → 1755,61; `38,0` → 38 với 1 chữ số thập phân (để biết độ làm tròn đã viết). */
export function parseWrittenNumber(text: string): { value: number; decimals: number } {
  const value = Number.parseFloat(text.replaceAll('.', '').replace(',', '.'));
  return { value: Math.abs(value), decimals: (text.split(',')[1] ?? '').length };
}

/** Các giá trị mà con số trong nhận định được phép khớp (spec §3.5 "Kiểm số trong nhận định"). */
export function referenceNumbers(model: VnIndexModel, levels: Levels): number[] {
  const { series, last, stats } = model;
  const at = (values: readonly (number | null)[], index = last) => values[index] ?? null;
  const candidates: (number | null)[] = [
    model.close,
    model.change,
    model.changePct,
    at(series.sma20),
    at(series.sma50),
    at(series.sma200),
    at(series.rsi),
    at(series.rsi, last - 1),
    at(series.macd),
    at(series.signal),
    at(series.hist),
    at(series.macd, last - 1),
    at(series.signal, last - 1),
    at(series.hist, last - 1),
    model.volume / 1e6,
    model.volumeMa20 === null ? null : model.volumeMa20 / 1e6,
    stats?.value_bn ?? null,
    stats?.advances ?? null,
    stats?.declines ?? null,
    stats?.unchanged ?? null,
    ...LEVEL_KEYS.map((key) => levels[key]),
    ...PARAMETER_NUMBERS,
  ];
  return candidates
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .map(Math.abs);
}

function numbersNotMatching(text: string, references: readonly number[]): string[] {
  const bad: string[] = [];
  for (const token of text.match(NUMBER_PATTERN) ?? []) {
    const { value, decimals } = parseWrittenNumber(token);
    const tolerance = 0.5 * 10 ** -decimals + 1e-9;
    const matched = references.some(
      (reference) =>
        Math.abs(reference - value) <= tolerance ||
        Math.abs(Math.round(reference) - value) <= tolerance,
    );
    if (!matched) bad.push(token);
  }
  return [...new Set(bad)];
}

type DirectionRule = {
  pattern: RegExp;
  holds: (match: RegExpMatchArray, model: VnIndexModel) => boolean;
  message: string;
};

const at = (values: readonly (number | null)[], index: number): number | null =>
  values[index] ?? null;

const DIRECTION_RULES: readonly DirectionRule[] = [
  {
    pattern: /(trên|dưới) SMA ?(20|50|200)\b/g,
    holds: (match, model) => {
      const key = `sma${match[2]}` as 'sma20' | 'sma50' | 'sma200';
      const sma = at(model.series[key], model.last);
      if (sma === null) return true;
      return match[1] === 'trên' ? model.close > sma : model.close < sma;
    },
    message: 'sai so với giá đóng cửa.',
  },
  {
    pattern: /RSI[^.\n]*?(tăng|giảm) so với phiên trước/g,
    holds: (match, model) => {
      const today = at(model.series.rsi, model.last);
      const yesterday = at(model.series.rsi, model.last - 1);
      if (today === null || yesterday === null) return true;
      return match[1] === 'tăng' ? today > yesterday : today < yesterday;
    },
    message: 'sai chiều RSI.',
  },
  {
    pattern: /MACD[^.\n]*?(trên|dưới) (?:đường )?Signal/g,
    holds: (match, model) => {
      const macd = at(model.series.macd, model.last);
      const signal = at(model.series.signal, model.last);
      if (macd === null || signal === null) return true;
      return match[1] === 'trên' ? macd > signal : macd < signal;
    },
    message: 'sai so với Signal.',
  },
  {
    pattern: /(cao|thấp) hơn trung bình 20 phiên/g,
    holds: (match, model) => {
      if (model.volumeMa20 === null) return true;
      return match[1] === 'cao' ? model.volume > model.volumeMa20 : model.volume < model.volumeMa20;
    },
    message: 'sai so với trung bình khối lượng.',
  },
];

export function commentChecks(
  content: Pick<BulletinContent, CommentKey>,
  model: VnIndexModel,
  levels: Levels,
): BulletinCheck[] {
  const items: BulletinCheck[] = [];
  const references = referenceNumbers(model, levels);
  for (const key of COMMENT_KEYS) {
    const text = content[key];
    if (!text.trim()) continue;
    const label = COMMENT_LABELS[key];
    const bad = numbersNotMatching(text, references);
    if (bad.length)
      items.push({
        level: 'error',
        code: 'comment_number_mismatch',
        message: `Nhận xét "${label}": số ${bad.join(', ')} không khớp số liệu tính được. Kiểm tra lại.`,
        field: key,
      });
    for (const rule of DIRECTION_RULES)
      for (const match of text.matchAll(rule.pattern))
        if (!rule.holds(match, model))
          items.push({
            level: 'error',
            code: 'comment_direction_mismatch',
            message: `Nhận xét "${label}": "${match[0]}" ${rule.message}`,
            field: key,
          });
  }
  return items;
}

export function levelChecks(levels: Levels, closePrice: number | null): BulletinCheck[] {
  const items: BulletinCheck[] = [];
  const close = closePrice;
  const closeText = close === null ? '' : nf(close, 2);
  if (close !== null) {
    for (const key of ['r1', 'r2'] as const) {
      const value = levels[key];
      if (value !== null && value <= close)
        items.push({
          level: 'error',
          code: 'resistance_not_above_close',
          message: `Kháng cự ${nf(value, 0)} phải cao hơn giá đóng cửa (${closeText}).`,
          field: 'levels',
        });
    }
    for (const key of ['s1', 's2'] as const) {
      const value = levels[key];
      if (value !== null && value >= close)
        items.push({
          level: 'error',
          code: 'support_not_below_close',
          message: `Hỗ trợ ${nf(value, 0)} phải thấp hơn giá đóng cửa (${closeText}).`,
          field: 'levels',
        });
    }
  }
  const { pa, pt, na, nt } = levels;
  if ((pa === null) !== (pt === null))
    items.push({
      level: 'error',
      code: 'positive_scenario_incomplete',
      message: 'Kịch bản tích cực cần đủ 2 mức: giữ trên … và hồi về ….',
      field: 'scenario',
    });
  else if (pa !== null && pt !== null && pt <= pa)
    items.push({
      level: 'error',
      code: 'positive_scenario_order',
      message: 'Kịch bản tích cực: mức "hồi về" phải cao hơn mức "giữ trên".',
      field: 'scenario',
    });
  if ((na === null) !== (nt === null))
    items.push({
      level: 'error',
      code: 'negative_scenario_incomplete',
      message: 'Kịch bản tiêu cực cần đủ 2 mức: thủng … và về ….',
      field: 'scenario',
    });
  else if (na !== null && nt !== null && nt >= na)
    items.push({
      level: 'error',
      code: 'negative_scenario_order',
      message: 'Kịch bản tiêu cực: mức "về" phải thấp hơn mức "thủng".',
      field: 'scenario',
    });
  if (close !== null) {
    const far = LEVEL_KEYS.map((key) => levels[key]).find(
      (value): value is number =>
        value !== null && Math.abs(value - close) / close > LEVEL_FAR_WARNING_RATIO,
    );
    if (far !== undefined)
      items.push({
        level: 'warn',
        code: 'level_far_from_close',
        message: `Mức ${nf(far, 0)} cách giá đóng cửa hơn 15%.`,
        field: 'levels',
      });
  }
  if (levels.r1 === null && levels.r2 === null)
    items.push({
      level: 'warn',
      code: 'no_resistance',
      message: 'Chưa có kháng cự.',
      field: 'levels',
    });
  if (levels.s1 === null && levels.s2 === null)
    items.push({ level: 'warn', code: 'no_support', message: 'Chưa có hỗ trợ.', field: 'levels' });
  return items;
}

export function slotChecks(
  tradeDate: string,
  slots: Readonly<Record<SlotNumber, SlotSnapshot | null>>,
): BulletinCheck[] {
  const items: BulletinCheck[] = [];
  for (const slot of [1, 2, 3] as const) {
    const snapshot = slots[slot];
    if (!snapshot || snapshot.trade_date !== tradeDate) {
      items.push({
        level: 'error',
        code: 'slot_not_pushed',
        message: `Bộ lọc ${slot}: chưa đẩy kết quả phiên ${dmy(tradeDate)} từ Bộ lọc.`,
        field: `slot${slot}`,
      });
    } else if (snapshot.passed_count === 0) {
      items.push({
        level: 'warn',
        code: 'slot_zero_passed',
        message: `Bộ lọc ${slot}: phiên này không có mã đạt. Bản tin in câu "Phiên này không có mã đạt."`,
        field: `slot${slot}`,
      });
    } else {
      items.push({
        level: 'info',
        code: 'slot_ready',
        message: `Bộ lọc ${slot}: ${snapshot.picks.length} mã (chọn từ ${snapshot.passed_count} mã đạt).`,
        field: `slot${slot}`,
      });
    }
  }
  return items;
}

export type CheckInput = {
  tradeDate: string;
  content: BulletinContent;
  /** Null khi dữ liệu phiên chưa chốt. */
  model: VnIndexModel | null;
  dataReadyAt: string | null;
  slots: Readonly<Record<SlotNumber, SlotSnapshot | null>>;
  /** Các ô nhận định tràn khung ở bản máy tính hoặc điện thoại (từ bộ dựng trang). */
  overflow: readonly CommentKey[];
  now?: Date;
};

/** Toàn bộ kiểm tra của spec §3.5; server chạy lại đúng hàm này khi nhận lệnh Public. */
export function runBulletinChecks(input: CheckInput): BulletinChecks {
  const { tradeDate, content, model } = input;
  const items: BulletinCheck[] = [];
  if (!model) {
    items.push({
      level: 'error',
      code: 'data_not_ready',
      message: `Chưa có dữ liệu phiên ${dmy(tradeDate)}. Chưa Public được.`,
      field: 'data',
    });
  } else {
    items.push({
      level: 'info',
      code: 'data_ready',
      message: `Số liệu VN-Index phiên ${dmy(tradeDate)} đã chốt lúc ${
        input.dataReadyAt ? vnTime(input.dataReadyAt) : '—'
      }.`,
      field: 'data',
    });
  }
  for (const key of COMMENT_KEYS)
    if (!content[key].trim())
      items.push({
        level: 'error',
        code: 'comment_empty',
        message: `Chưa viết nhận định "${COMMENT_LABELS[key]}".`,
        field: key,
      });
  items.push(...levelChecks(content.levels, model?.close ?? null));
  if (model) items.push(...commentChecks(content, model, content.levels));
  for (const key of input.overflow)
    items.push({
      level: 'error',
      code: 'comment_overflow',
      message: `Nhận xét "${COMMENT_LABELS[key]}" quá dài, vượt khung. Hãy rút gọn.`,
      field: key,
    });
  items.push(...slotChecks(tradeDate, input.slots));
  return {
    errors: items.filter((item) => item.level === 'error').length,
    warnings: items.filter((item) => item.level === 'warn').length,
    items,
    checked_at: (input.now ?? new Date()).toISOString(),
  };
}
