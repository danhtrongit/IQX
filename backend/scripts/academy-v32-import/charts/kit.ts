import type {
  ChartModel,
  ChartTone,
  LeafChartModel,
} from '../../../src/modules/academy/content/v3/schema.js';

/** Shared builder types and tiny constructors. */
export type Builder = () => ChartModel;
export type Model<K extends ChartModel['kind']> = Extract<ChartModel, { kind: K }>;
export type Leaf<K extends LeafChartModel['kind']> = Extract<LeafChartModel, { kind: K }>;

export type SeriesPanels = Model<'series_panels'>;
export type Panel = SeriesPanels['panels'][number];
export type Point = NonNullable<SeriesPanels['points']>[number];
export type Schematic = Model<'schematic'>;
export type Layer = Schematic['layers'][number];
export type Diagram = Model<'diagram'>;
export type Shape = Diagram['shapes'][number];
export type Category = Model<'category'>;
export type SegmentBar = Model<'segment_bar'>;
export type Flow = Model<'flow'>;
export type Candles = NonNullable<Panel['candles']>;

export type LegendItem = { tone: ChartTone; label: string };

export const round2 = (v: number): number => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

/** OHLC tuples -> panel candles (rounded). */
export function candles(rows: readonly (readonly number[])[]): Candles {
  const col = (k: number) => rows.map((r) => Math.round((r[k] ?? 0) * 1e4) / 1e4);
  return { open: col(0), high: col(1), low: col(2), close: col(3) };
}

/** Volume bar colours by candle direction (`c >= o` up). */
export const upDown = (rows: readonly (readonly number[])[]): ('pos' | 'neg')[] =>
  rows.map((r) => ((r[3] ?? 0) >= (r[0] ?? 0) ? 'pos' : 'neg'));

/** Points `[x, y]` in pixel space flipped so y grows upward (`base - y`). */
export const flip = (
  pts: readonly (readonly [number, number])[],
  base: number,
): [number, number][] => pts.map(([x, y]) => [x, base - y]);

/** Sample f on [a, b] with n segments (n+1 points), rounded to 4 decimals. */
export function sample(
  a: number,
  b: number,
  n: number,
  f: (x: number) => number,
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    out.push([Math.round(x * 1e4) / 1e4, Math.round(f(x) * 1e4) / 1e4]);
  }
  return out;
}

/** x.ticks for a window: label at given absolute indexes, blank elsewhere. */
export function ticksAt(
  start: number,
  end: number,
  labels: Readonly<Record<number, string>>,
): string[] {
  const out: string[] = [];
  for (let i = start; i <= end; i++) out.push(labels[i] ?? '');
  return out;
}
