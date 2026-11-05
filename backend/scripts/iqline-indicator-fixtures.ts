/**
 * Sinh bộ mẫu đối chiếu chỉ báo cho IQLine (frontend/docs/iqline-design.md §9).
 *
 *   node node_modules/jiti/lib/jiti-cli.mjs scripts/iqline-indicator-fixtures.ts [đường-dẫn-đầu-ra]
 *   node dist/scripts/iqline-indicator-fixtures.js [đường-dẫn-đầu-ra]   (sau `npm run build`)
 *
 * Chạy công thức thật của backend (`calcLegacy` trong quant/v2/indicators.ts) trên một chuỗi nến cố định,
 * sinh bằng bộ số giả ngẫu nhiên có hạt giống, không gọi mạng, không đọc cơ sở dữ liệu. Kết quả là một
 * file JSON để test của frontend so từng chỉ báo. Script chỉ ĐỌC công thức backend, không sửa gì:
 * Bot đang chạy theo công thức này nên frontend phải theo, không phải ngược lại.
 *
 * Mặc định ghi vào `../frontend/src/lib/iqline/indicators/__fixtures__/backend-golden.json` (tính từ
 * thư mục hiện tại, tức thư mục `backend`).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { FLASHBACK_INDICATORS } from '../src/modules/flashback/flashback.indicators.js';
import { calcLegacy } from '../src/modules/quant/v2/indicators.js';
import type { Bar } from '../src/modules/quant/v2/types.js';

const DEFAULT_OUT = '../frontend/src/lib/iqline/indicators/__fixtures__/backend-golden.json';
const BAR_COUNT = 240;
const SEED = 20261105;

type Params = Record<string, number>;
type Value = number | null;

/** Một chỉ báo của frontend, chỉ báo tương ứng ở backend và các chuỗi cần lấy ra để so. */
type Target = {
  id: string;
  /** Chỉ báo tương ứng trong `calcLegacy`; mặc định bằng `id`. */
  backendId?: string;
  /** Bộ tham số mặc định và bộ tham số thay thế (đều theo key của backend). */
  defaults: Params;
  alt: Params;
  /** Tên chuỗi ở backend cần lưu. */
  capture: readonly string[];
};

const TARGETS: readonly Target[] = [
  {
    id: 'volume',
    defaults: { lookback: 20, mult: 1 },
    alt: { lookback: 10, mult: 1.5 },
    capture: ['threshold'],
  },
  { id: 'ma', defaults: { period: 20 }, alt: { period: 5 }, capture: ['value'] },
  {
    id: 'bollinger',
    defaults: { period: 20, k: 2 },
    alt: { period: 10, k: 1.5 },
    capture: ['upper', 'lower', 'middle'],
  },
  { id: 'ema', defaults: { period: 20 }, alt: { period: 7 }, capture: ['value'] },
  {
    id: 'ma_cross',
    defaults: { fast: 20, slow: 50 },
    alt: { fast: 5, slow: 21 },
    capture: ['fast', 'slow'],
  },
  { id: 'donchian', defaults: { period: 20 }, alt: { period: 10 }, capture: ['upper', 'lower'] },
  { id: 'rsi', defaults: { period: 14 }, alt: { period: 7 }, capture: ['value'] },
  {
    id: 'macd',
    defaults: { fast: 12, slow: 26, signal: 9 },
    alt: { fast: 5, slow: 13, signal: 4 },
    capture: ['value', 'signal', 'histogram'],
  },
  { id: 'dmi', defaults: { period: 14 }, alt: { period: 7 }, capture: ['plus', 'minus'] },
  {
    id: 'stochastic',
    defaults: { k: 14, d: 3, smooth: 3 },
    alt: { k: 9, d: 5, smooth: 1 },
    capture: ['value', 'signal'],
  },
  { id: 'cci', defaults: { period: 20 }, alt: { period: 10 }, capture: ['value'] },
  { id: 'roc', defaults: { period: 20 }, alt: { period: 5 }, capture: ['value'] },
  { id: 'williams_r', defaults: { period: 14 }, alt: { period: 7 }, capture: ['value'] },
  { id: 'obv', defaults: { baseline: 20 }, alt: { baseline: 8 }, capture: ['value', 'baseline'] },
  { id: 'mfi', defaults: { period: 14 }, alt: { period: 7 }, capture: ['value'] },
  { id: 'cmf', defaults: { period: 20 }, alt: { period: 8 }, capture: ['value'] },
  {
    id: 'atr',
    defaults: { period: 14, baseline: 20 },
    alt: { period: 5, baseline: 10 },
    capture: ['atr'],
  },
  {
    id: 'atr_percent',
    defaults: { period: 14, baseline: 20 },
    alt: { period: 5, baseline: 10 },
    capture: ['value'],
  },
  { id: 'adx', defaults: { period: 14 }, alt: { period: 7 }, capture: ['value'] },
  {
    id: 'keltner',
    defaults: { ema: 20, atr: 10, k: 2 },
    alt: { ema: 10, atr: 5, k: 1.5 },
    capture: ['upper', 'lower', 'middle'],
  },
  { id: 'bb_width', defaults: { period: 20, k: 2 }, alt: { period: 10, k: 1 }, capture: ['value'] },
  {
    id: 'psar',
    defaults: { step: 0.02, max: 0.2 },
    alt: { step: 0.04, max: 0.4 },
    capture: ['value'],
  },
  {
    id: 'relative_volume',
    defaults: { lookback: 20 },
    alt: { lookback: 10 },
    capture: ['value'],
  },
];

/** Bộ số giả ngẫu nhiên mulberry32: cùng hạt giống cho cùng chuỗi trên mọi máy. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (x: number): number => Math.round(x * 100) / 100;
/** Bước giá HOSE tính theo nghìn đồng: 0,01 dưới 10, 0,05 từ 10 đến dưới 50, 0,1 từ 50. */
const tick = (price: number): number => (price < 10 ? 0.01 : price < 50 ? 0.05 : 0.1);
const snap = (price: number): number => round2(Math.round(price / tick(price)) * tick(price));

function dateOf(index: number): string {
  const d = new Date(Date.UTC(2024, 0, 2));
  let added = 0;
  while (added < index) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Chuỗi nến cố định. Có đủ các tình huống làm công thức khác nhau lộ ra: nhiều phiên đóng cửa bằng nhau
 * (giá tròn bước giá), phiên kịch trần hoặc kịch sàn (high = low = open = close, rất hay gặp ở cổ phiếu Việt
 * Nam), một phiên khối lượng bằng 0, các đoạn tăng, giảm và đi ngang.
 */
function makeBars(): Bar[] {
  const rand = mulberry32(SEED);
  const normal = (): number => {
    const u = Math.max(rand(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const regimes: { drift: number; vol: number }[] = [
    { drift: 0.004, vol: 0.012 },
    { drift: -0.005, vol: 0.018 },
    { drift: 0, vol: 0.008 },
    { drift: 0.006, vol: 0.02 },
    { drift: -0.003, vol: 0.014 },
    { drift: 0.001, vol: 0.01 },
  ];
  const ceilingAt = new Set([23, 24, 118, 167]);
  const floorAt = new Set([71, 119, 205]);
  const zeroVolumeAt = new Set([118]);
  const bars: Bar[] = [];
  let previous = 24.55;
  for (let index = 0; index < BAR_COUNT; index += 1) {
    const regime = regimes[Math.floor(index / 40) % regimes.length] ?? { drift: 0, vol: 0.01 };
    const gap = index % 53 === 52 ? 0.025 * (rand() < 0.5 ? -1 : 1) : 0;
    const open = snap(previous * (1 + gap + 0.003 * normal()));
    let close = snap(open * (1 + regime.drift + regime.vol * normal()));
    // HOSE chặn biên độ ±7% quanh giá tham chiếu.
    close = Math.min(Math.max(close, snap(previous * 0.93)), snap(previous * 1.07));
    let high = round2(Math.max(open, close) + tick(close) * Math.floor(rand() * 4));
    let low = round2(Math.min(open, close) - tick(close) * Math.floor(rand() * 4));
    let volume = Math.round(
      300_000 * Math.exp(0.7 * normal()) * (1 + (6 * Math.abs(close - open)) / open),
    );
    if (ceilingAt.has(index) || floorAt.has(index)) {
      const locked = snap(previous * (ceilingAt.has(index) ? 1.07 : 0.93));
      const lockedVolume = zeroVolumeAt.has(index) ? 0 : Math.round(volume * 0.25);
      bars.push({
        date: dateOf(index),
        open: locked,
        high: locked,
        low: locked,
        close: locked,
        volume: lockedVolume,
      });
      previous = locked;
      continue;
    }
    if (zeroVolumeAt.has(index)) volume = 0;
    low = Math.max(low, 0.01);
    high = Math.max(high, low);
    bars.push({ date: dateOf(index), open, high, low, close, volume });
    previous = close;
  }
  return bars;
}

const sig = (x: number): number => Number(x.toPrecision(13));
const clean = (series: readonly Value[] | undefined, length: number): Value[] =>
  Array.from({ length }, (_, index) => {
    const value = series?.[index];
    return typeof value === 'number' && Number.isFinite(value) ? sig(value) : null;
  });

type LegacyField = { key: string; min: number; max: number; step: number; type: string };
type LegacyEntry = { id: string; fields: LegacyField[]; buy: { params: Record<string, number> } };

function main(): void {
  const out = resolve(process.cwd(), process.argv[2] ?? DEFAULT_OUT);
  const bars = makeBars();
  const cases: unknown[] = [];
  for (const target of TARGETS) {
    for (const [variant, params] of [
      ['default', target.defaults],
      ['alt', target.alt],
    ] as const) {
      const series = calcLegacy(target.backendId ?? target.id, params, bars);
      cases.push({
        name: `${target.id}:${variant}`,
        id: target.id,
        params,
        series: Object.fromEntries(
          target.capture.map((key) => [key, clean(series[key], bars.length)]),
        ),
      });
    }
  }

  const legacyPath = resolve(
    process.cwd(),
    'src/modules/quant/v2/registry/legacy-technical-registry.json',
  );
  const legacy = JSON.parse(readFileSync(legacyPath, 'utf8')) as LegacyEntry[];
  const extras = new Set([
    'atr',
    'atr_percent',
    'adx',
    'keltner',
    'bb_width',
    'psar',
    'relative_volume',
  ]);
  const document = {
    note: 'Sinh bởi backend/scripts/iqline-indicator-fixtures.ts. Không sửa tay. Chạy lại script để làm mới.',
    seed: SEED,
    calculationVersion: 'iqx-ta-2.0',
    bars: bars.map((bar) => ({
      date: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    })),
    cases,
    /** Danh mục Flashback (16 chỉ báo): miền giá trị, bước nhảy, giá trị mặc định, ràng buộc chéo. */
    catalog: FLASHBACK_INDICATORS.map((meta) => ({
      id: meta.id,
      name: meta.name,
      params: meta.params.map((param) => ({
        key: param.key,
        min: param.min,
        max: param.max,
        step: param.step,
        default: param.default,
        lower: param.lower,
        upper: param.upper,
      })),
      crossFields: meta.cross_fields,
    })),
    /** Registry cũ của Bot cho 7 chỉ báo bổ sung: miền giá trị và mặc định. */
    legacy: legacy
      .filter((entry) => extras.has(entry.id))
      .map((entry) => ({
        id: entry.id,
        defaults: entry.buy.params,
        fields: entry.fields.map((field) => ({
          key: field.key,
          min: field.min,
          max: field.max,
          step: field.step,
        })),
      })),
  };

  // Mỗi case một dòng để diff dễ đọc.
  const lines = JSON.stringify({ ...document, bars: '__BARS__', cases: '__CASES__' }, null, 1)
    .replace('"__BARS__"', `[\n${document.bars.map((bar) => JSON.stringify(bar)).join(',\n')}\n]`)
    .replace('"__CASES__"', `[\n${cases.map((entry) => JSON.stringify(entry)).join(',\n')}\n]`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${lines}\n`);
  process.stdout.write(`Đã ghi ${out}: ${bars.length} nến, ${cases.length} case\n`);
}

main();
