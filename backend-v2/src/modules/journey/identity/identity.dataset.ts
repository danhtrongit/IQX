import { ConflictException } from '@nestjs/common';

import { JOURNEY_LAYER_KEYS, type JourneyLayerAssessment } from '../core/index.js';

type Json = Record<string, unknown>;

const SOURCE_LAYERS = {
  ky_thuat: 'L1',
  dong_tien: 'L3',
  noi_bo: 'L4',
  tin_tuc: 'L5',
} as const;

const RANKS: Record<string, number> = {
  'rất yếu': 1,
  'cảnh báo mạnh': 1,
  'rất tiêu cực': 1,
  yếu: 2,
  'cảnh báo nhẹ': 2,
  'tiêu cực': 2,
  'trung bình': 3,
  'bình thường': 3,
  'trung tính': 3,
  mạnh: 4,
  'hỗ trợ nhẹ': 4,
  'tích cực': 4,
  'rất mạnh': 5,
  'hỗ trợ mạnh': 5,
  'rất tích cực': 5,
};

export type FrozenDatasetPayload = {
  symbol: string;
  source_symbol: string | null;
  valuation_source_symbol: string | null;
  readings: Record<string, { lines: string[]; degraded: boolean }>;
  ai_answers: Partial<Record<(typeof JOURNEY_LAYER_KEYS)[number], JourneyLayerAssessment>>;
  unavailable_layers: string[];
  trading_date: string;
  price: number | null;
  source_refs: Record<string, unknown>;
  source_snapshot: { insight: Json | null; valuation: Json | null; ohlcv: unknown };
};

export function buildFrozenDataset(input: {
  symbol: string;
  insight: Json | null;
  financialDashboard: Json | null;
  ohlcv: unknown;
  observedAt: Date;
}): FrozenDatasetPayload {
  const symbol = input.symbol.trim().toUpperCase();
  const sourceSymbol = normalizedString(input.insight?.symbol);
  const hero = asObject(input.financialDashboard?.hero);
  const valuationSymbol = normalizedString(hero?.ticker);
  if (
    (sourceSymbol !== null && sourceSymbol !== symbol) ||
    (valuationSymbol !== null && valuationSymbol !== symbol)
  ) {
    throw new ConflictException({
      code: 'READING_SOURCE_SYMBOL_MISMATCH',
      message: 'Nguồn dữ liệu đối chiếu không khớp mã đang đọc',
    });
  }

  const bars = extractBars(input.ohlcv);
  const tradingDate = latestSessionDate(bars, input.observedAt);
  if (!tradingDate) {
    throw new ConflictException({
      code: 'READING_SESSION_UNAVAILABLE',
      message: 'Không xác định được phiên giao dịch của bộ dữ liệu đọc',
    });
  }

  const readings = Object.fromEntries(
    JOURNEY_LAYER_KEYS.map((key) => [key, { lines: [] as string[], degraded: true }]),
  ) as FrozenDatasetPayload['readings'];
  const aiAnswers: FrozenDatasetPayload['ai_answers'] = {};
  const layers = asObject(input.insight?.layers) ?? {};
  for (const [layer, source] of Object.entries(SOURCE_LAYERS)) {
    const sourceLayer = asObject(layers[source]);
    const lines = readingLines(sourceLayer);
    const verdict = verdictFromLabel(sourceLayer?.statusLabel);
    readings[layer] = { lines, degraded: !lines.length || verdict === null };
    if (lines.length && verdict) aiAnswers[layer as keyof typeof aiAnswers] = verdict;
  }

  const blocks = asObject(input.financialDashboard?.blocks);
  const valuation = asObject(blocks?.valuation);
  const valuationReading = readValuation(valuation);
  if (valuationReading) {
    aiAnswers.dinh_gia = valuationReading.verdict;
    readings.dinh_gia = {
      degraded: false,
      lines: [
        `Vùng giá trị: ${formatMoney(valuationReading.low)} – ${formatMoney(valuationReading.high)}`,
        `Giá hiện tại: ${formatMoney(valuationReading.price)}`,
        `Trung vị (giá hợp lý): ${formatMoney(valuationReading.median)}`,
      ],
    };
  }

  return {
    symbol,
    source_symbol: sourceSymbol,
    valuation_source_symbol: valuationSymbol,
    readings,
    ai_answers: aiAnswers,
    unavailable_layers: JOURNEY_LAYER_KEYS.filter((key) => aiAnswers[key] === undefined),
    trading_date: tradingDate,
    price: valuationReading?.price ?? positiveNumber(asObject(input.insight?.header)?.price),
    source_refs: {
      insight_as_of: input.insight?.updatedAt ?? null,
      valuation_meta: input.financialDashboard?.meta ?? null,
      market_bar_as_of: tradingDate,
      observed_at: input.observedAt.toISOString(),
    },
    source_snapshot: { insight: input.insight, valuation, ohlcv: bars },
  };
}

function verdictFromLabel(value: unknown): JourneyLayerAssessment | null {
  if (typeof value !== 'string') return null;
  const rank = RANKS[value.trim().toLocaleLowerCase('vi')];
  return rank === undefined ? null : rank >= 4 ? 'ok' : rank <= 2 ? 'bad' : 'neu';
}

function readingLines(value: Json | null): string[] {
  if (!value) return [];
  const lines: string[] = [];
  for (const [key, raw] of Object.entries(value)) {
    if (['statusLabel', 'diff', 'summary'].includes(key)) continue;
    if (typeof raw === 'string' && raw.trim())
      lines.push(`${humanize(key)}: ${stripMarkup(raw.trim())}`);
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const record = asObject(item);
        const title = record && (record.tieu_de ?? record.title);
        if (typeof title === 'string' && title.trim()) lines.push(title.trim());
      }
    }
  }
  return [...new Set(lines)].slice(0, 20);
}

function readValuation(value: Json | null): {
  verdict: JourneyLayerAssessment;
  price: number;
  median: number;
  low: number;
  high: number;
} | null {
  if (!value) return null;
  const price = positiveNumber(value.current_price);
  const median = positiveNumber(value.fair_median);
  if (!price || !median) return null;
  const methods = Array.isArray(value.methods) ? value.methods : [];
  const bears = methods.flatMap((item) => {
    const amount = positiveNumber(asObject(item)?.bear);
    return amount ? [amount] : [];
  });
  const bulls = methods.flatMap((item) => {
    const amount = positiveNumber(asObject(item)?.bull);
    return amount ? [amount] : [];
  });
  const low = bears.length ? Math.min(...bears) : median * 0.85;
  const high = bulls.length ? Math.max(...bulls) : median * 1.15;
  const verdict =
    price < low || price < median * 0.95
      ? 'ok'
      : price > high || price > median * 1.05
        ? 'bad'
        : 'neu';
  return { verdict, price, median, low, high };
}

function extractBars(value: unknown): Json[] {
  if (Array.isArray(value))
    return value.map(asObject).filter((item): item is Json => item !== null);
  const object = asObject(value);
  const data = object?.data;
  return Array.isArray(data)
    ? data.map(asObject).filter((item): item is Json => item !== null)
    : [];
}

function latestSessionDate(bars: Json[], observedAt: Date): string | null {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    observedAt,
  );
  const dates = bars.flatMap((bar) => {
    for (const key of ['date', 'tradingDate', 'trading_date', 'time', 't']) {
      const date = sessionDate(bar[key]);
      if (date && date <= today) return [date];
    }
    return [];
  });
  return dates.sort().at(-1) ?? null;
}

function sessionDate(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : vietnamDate(date);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = Math.abs(value) > 10_000_000_000 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : vietnamDate(date);
  }
  return null;
}

function asObject(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function normalizedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}

function positiveNumber(value: unknown): number | null {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

function stripMarkup(value: string): string {
  return value.replace(/\[\/?(?:bull|bear|warn|info|num|gold)\]/g, '');
}

function vietnamDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(value);
}
