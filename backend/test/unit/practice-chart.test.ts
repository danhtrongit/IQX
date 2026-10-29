import { describe, expect, it } from 'vitest';

import { buildChart, sidePlot } from '../../src/modules/practice/practice.chart.js';
import {
  defaultPracticeConfig,
  practiceEntry,
  toSideConfig,
} from '../../src/modules/practice/practice.config.js';
import { PRACTICE_INDICATOR_IDS } from '../../src/modules/practice/practice.constants.js';
import { buildCalendar } from '../../src/modules/practice/practice.data.js';
import { loadPracticeSet } from '../../src/modules/practice/practice.set.js';
import type {
  PracticeParamsConfig,
  PracticeRowsConfig,
} from '../../src/modules/practice/practice.types.js';
import {
  calc,
  createSeriesCache,
  isRowsEntry,
  type ConditionRow,
  type RowsRegistryEntry,
  type Side,
  type SideConfig,
} from '../../src/modules/quant/v2/index.js';
import { walkRows } from './practice-fixtures.js';

const SIDES: readonly Side[] = ['buy', 'sell'];
const ROW_INDICATORS = PRACTICE_INDICATOR_IDS.filter((id) => id !== 'volume');
const set = loadPracticeSet();
const calendar = buildCalendar(walkRows('ACB'), set);

const rowsEntry = (id: string): RowsRegistryEntry => {
  const entry = practiceEntry(id);
  if (!entry || !isRowsEntry(entry)) throw new Error(`${id} is not row-based`);
  return entry;
};

const sides = (id: string, mutate?: (config: PracticeRowsConfig) => void) => {
  const entry = rowsEntry(id);
  const config = structuredClone(defaultPracticeConfig(entry) as PracticeRowsConfig);
  mutate?.(config);
  return {
    buy: toSideConfig(entry, 'buy', config.buy),
    sell: toSideConfig(entry, 'sell', config.sell),
  };
};

const withAllRows = (config: PracticeRowsConfig): void => {
  for (const side of SIDES) for (const row of config[side].rules) row.enabled = true;
};

const row = (config: PracticeRowsConfig, side: Side, index: number): ConditionRow =>
  config[side].rules[index]!;

const chartOf = (id: string, pair: Record<Side, SideConfig>, to = calendar.firstTest - 1) =>
  buildChart({
    indicatorId: id,
    calendar,
    from: calendar.observationStart,
    to,
    cache: createSeriesCache(calendar.bars.slice(0, to + 1)),
    sides: pair,
  });

describe('practice chart: per-row series of the default rows', () => {
  type Expected = {
    keys: string[];
    labels: string[];
    thresholds?: number[];
    overlay?: boolean;
    zero?: boolean;
    bounds?: [number, number];
    histogram?: string | null;
  };
  const DEFAULTS: Record<string, [Expected, Expected]> = {
    rsi: [
      { keys: ['rsi.level.value'], labels: ['RSI 14'], thresholds: [30], bounds: [0, 100] },
      { keys: ['rsi.level.value'], labels: ['RSI 14'], thresholds: [70], bounds: [0, 100] },
    ],
    macd: [
      {
        keys: ['macd.signal.value', 'macd.signal.signal'],
        labels: ['MACD 12/26', 'Signal 9'],
        zero: true,
      },
      {
        keys: ['macd.signal.value', 'macd.signal.signal'],
        labels: ['MACD 12/26', 'Signal 9'],
        zero: true,
      },
    ],
    ma: [
      { keys: ['ma.price_cross.value'], labels: ['SMA 20'], overlay: true },
      { keys: ['ma.price_cross.value'], labels: ['SMA 20'], overlay: true },
    ],
    bollinger: [
      {
        keys: [
          'bollinger.price_action.upper',
          'bollinger.price_action.middle',
          'bollinger.price_action.lower',
        ],
        labels: ['Dải trên', 'SMA 20', 'Dải dưới'],
        overlay: true,
      },
      {
        keys: [
          'bollinger.price_action.upper',
          'bollinger.price_action.middle',
          'bollinger.price_action.lower',
        ],
        labels: ['Dải trên', 'SMA 20', 'Dải dưới'],
        overlay: true,
      },
    ],
    ema: [
      { keys: ['ema.price_cross.value'], labels: ['EMA 20'], overlay: true },
      { keys: ['ema.price_cross.value'], labels: ['EMA 20'], overlay: true },
    ],
    ma_cross: [
      {
        keys: ['ma_cross.cross.fast', 'ma_cross.cross.slow'],
        labels: ['SMA 20', 'SMA 50'],
        overlay: true,
      },
      {
        keys: ['ma_cross.cross.fast', 'ma_cross.cross.slow'],
        labels: ['SMA 20', 'SMA 50'],
        overlay: true,
      },
    ],
    dmi: [
      { keys: ['dmi.di.plus', 'dmi.di.minus'], labels: ['+DI 14', '−DI 14'] },
      { keys: ['dmi.di.plus', 'dmi.di.minus'], labels: ['+DI 14', '−DI 14'] },
    ],
    stochastic: [
      {
        keys: ['stochastic.level.value', 'stochastic.kd_cross.signal'],
        labels: ['%K 14/3', '%D 3'],
        thresholds: [20],
        bounds: [0, 100],
      },
      {
        keys: ['stochastic.level.value', 'stochastic.kd_cross.signal'],
        labels: ['%K 14/3', '%D 3'],
        thresholds: [80],
        bounds: [0, 100],
      },
    ],
    cci: [
      { keys: ['cci.cross.value'], labels: ['CCI 20'], thresholds: [-100], zero: true },
      { keys: ['cci.cross.value'], labels: ['CCI 20'], thresholds: [100], zero: true },
    ],
    obv: [
      { keys: ['obv.sma.value', 'obv.sma.baseline'], labels: ['OBV', 'SMA 20 của OBV'] },
      { keys: ['obv.sma.value', 'obv.sma.baseline'], labels: ['OBV', 'SMA 20 của OBV'] },
    ],
    mfi: [
      { keys: ['mfi.cross.value'], labels: ['MFI 14'], thresholds: [20], bounds: [0, 100] },
      { keys: ['mfi.cross.value'], labels: ['MFI 14'], thresholds: [80], bounds: [0, 100] },
    ],
    cmf: [
      { keys: ['cmf.cross.value'], labels: ['CMF 20'], thresholds: [0], zero: true },
      { keys: ['cmf.cross.value'], labels: ['CMF 20'], thresholds: [0], zero: true },
    ],
    donchian: [
      { keys: ['donchian.break.upper'], labels: ['Dải trên 20'], overlay: true },
      { keys: ['donchian.break.lower'], labels: ['Dải dưới 20'], overlay: true },
    ],
    roc: [
      { keys: ['roc.cross.value'], labels: ['ROC 20 (%)'], thresholds: [5], zero: true },
      { keys: ['roc.cross.value'], labels: ['ROC 20 (%)'], thresholds: [-5], zero: true },
    ],
    williams_r: [
      {
        keys: ['williams_r.cross.value'],
        labels: ['Williams %R 14'],
        thresholds: [-80],
        bounds: [-100, 0],
      },
      {
        keys: ['williams_r.cross.value'],
        labels: ['Williams %R 14'],
        thresholds: [-20],
        bounds: [-100, 0],
      },
    ],
  };

  it('describes exactly the default-enabled rows of each indicator', () => {
    expect(Object.keys(DEFAULTS).sort()).toEqual([...ROW_INDICATORS].sort());
    for (const id of ROW_INDICATORS) {
      const pair = sides(id);
      SIDES.forEach((side, index) => {
        const expected = DEFAULTS[id]![index]!;
        const { plot } = sidePlot(id, pair[side]);
        expect(
          plot.lines.map((item) => item.key),
          `${id}.${side} keys`,
        ).toEqual(expected.keys);
        expect(
          plot.lines.map((item) => item.label),
          `${id}.${side} labels`,
        ).toEqual(expected.labels);
        expect(plot.threshold_levels, `${id}.${side} thresholds`).toEqual(
          expected.thresholds ?? [],
        );
        expect(plot.overlay, `${id}.${side} overlay`).toBe(expected.overlay ?? false);
        expect(plot.zero_line, `${id}.${side} zero`).toBe(expected.zero ?? false);
        expect(plot.bounds, `${id}.${side} bounds`).toEqual(expected.bounds ?? null);
        expect(plot.histogram_key, `${id}.${side} histogram`).toBe(expected.histogram ?? null);
        expect(plot.volume_key).toBeNull();
      });
    }
  });

  it('keeps the fixed look guides apart from the thresholds the rows really run on', () => {
    expect(sidePlot('rsi', sides('rsi').buy).plot.reference_levels).toEqual([50]);
    expect(sidePlot('mfi', sides('mfi').buy).plot.reference_levels).toEqual([50]);
    expect(sidePlot('stochastic', sides('stochastic').sell).plot.reference_levels).toEqual([
      20, 80,
    ]);
    expect(sidePlot('cci', sides('cci').buy).plot.reference_levels).toEqual([]);
    expect(sidePlot('dmi', sides('dmi').buy).plot.nonnegative).toBe(true);
    // thresholds come from the rows (the user's value), not from the guides
    const edited = sides('stochastic', (config) => {
      row(config, 'buy', 0).threshold = 35;
    });
    const { plot } = sidePlot('stochastic', edited.buy);
    expect(plot.threshold_levels).toEqual([35]);
    expect(plot.reference_levels).toEqual([20, 80]);
  });

  it('draws nothing for a tab without an enabled row and ignores disabled rows', () => {
    const none = sides('rsi', (config) => {
      for (const item of config.buy.rules) item.enabled = false;
    });
    const empty = sidePlot('rsi', none.buy);
    expect(empty.plot.lines).toEqual([]);
    expect(empty.plot.threshold_levels).toEqual([]);
    expect(empty.columns).toEqual([]);
    // the OBV breakout row is off by default: its extreme is not drawn
    expect(sidePlot('obv', sides('obv').buy).plot.lines.map((item) => item.key)).not.toContain(
      'obv.breakout.upper',
    );
  });
});

describe('practice chart: every row owns its lines', () => {
  it('draws two RSI rows with different periods as two lines of their own period', () => {
    const pair = sides('rsi', (config) => {
      row(config, 'buy', 0).period = 9;
      row(config, 'buy', 1).period = 21;
    });
    const { plot, columns } = sidePlot('rsi', pair.buy);
    expect(plot.lines).toEqual([
      { key: 'rsi.level.value', label: 'RSI 9' },
      { key: 'rsi.trend.value', label: 'RSI 21' },
    ]);
    expect(columns.map((column) => column.params)).toEqual([{ period: 9 }, { period: 21 }]);

    const chart = chartOf('rsi', pair);
    const level = chart.series.buy['rsi.level.value']!;
    const trend = chart.series.buy['rsi.trend.value']!;
    expect(level).not.toEqual(trend);
    // the plotted values are the shared calc of that row's own period
    const nine = calc('rsi', { period: 9 }, calendar.bars).value!;
    const twentyOne = calc('rsi', { period: 21 }, calendar.bars).value!;
    const first = calendar.observationStart;
    level.forEach((value, offset) => {
      expect(value).toBe(
        nine[first + offset] === null ? null : Math.round(nine[first + offset]! * 1e6) / 1e6,
      );
    });
    trend.forEach((value, offset) => {
      expect(value).toBe(
        twentyOne[first + offset] === null
          ? null
          : Math.round(twentyOne[first + offset]! * 1e6) / 1e6,
      );
    });
  });

  it('draws a line once when two rows need the same data', () => {
    const { plot, columns } = sidePlot('rsi', sides('rsi').buy);
    // rsi.level and rsi.trend both use RSI 14 by default
    expect(plot.lines).toHaveLength(1);
    expect(columns).toHaveLength(1);
    const ma = sides('ma', (config) => {
      row(config, 'buy', 1).enabled = true; // SMA 10 / 20 cross
      row(config, 'buy', 2).enabled = true; // SMA 20 trend
    });
    const keys = sidePlot('ma', ma.buy).plot.lines.map((item) => item.key);
    // SMA 20 is shared by the three rows: it is drawn by the first row that needs it
    expect(keys).toEqual(['ma.price_cross.value', 'ma.ma_cross.fast']);
    const labels = sidePlot('ma', ma.buy).plot.lines.map((item) => item.label);
    expect(labels).toEqual(['SMA 20', 'SMA 10']);
  });

  it('plots the MACD histogram of the histogram row and the MACD line of the zero row', () => {
    const pair = sides('macd', (config) => {
      row(config, 'buy', 0).enabled = false;
      row(config, 'buy', 1).enabled = true;
      row(config, 'buy', 2).enabled = true;
      row(config, 'buy', 2).fast = 5;
      row(config, 'buy', 2).slow = 35;
      row(config, 'buy', 2).signal = 7;
    });
    const { plot, columns } = sidePlot('macd', pair.buy);
    expect(plot.lines).toEqual([{ key: 'macd.zero.value', label: 'MACD 12/26' }]);
    expect(plot.histogram_key).toBe('macd.hist.histogram');
    expect(plot.zero_line).toBe(true);
    const histogram = columns.find((column) => column.key === 'macd.hist.histogram')!;
    expect(histogram).toMatchObject({ calc: 'macd', params: { fast: 5, slow: 35, signal: 7 } });
    // the zero row has no Signal input: its MACD line does not depend on it
    const zero = columns.find((column) => column.key === 'macd.zero.value')!;
    expect(zero.params).toEqual({ fast: 12, slow: 26, signal: 9 });
    const chart = chartOf('macd', pair);
    expect(chart.series.buy['macd.hist.histogram']!.some((value) => value !== null)).toBe(true);
  });

  it('keeps Bollinger rows apart by period and multiplier, and draws nothing for the price rows', () => {
    const pair = sides('bollinger', (config) => {
      row(config, 'buy', 0).period = 30;
      row(config, 'buy', 0).mult = 2.5;
    });
    const { plot, columns } = sidePlot('bollinger', pair.buy);
    expect(plot.lines.map((item) => item.label)).toEqual(['Dải trên', 'SMA 30', 'Dải dưới']);
    expect(columns[0]).toMatchObject({ calc: 'bollinger', params: { period: 30, k: 2.5 } });
    // price_dir (row 2) and the width row (row 3) have no price line
    const all = sides('bollinger', withAllRows);
    expect(sidePlot('bollinger', all.buy).plot.lines).toHaveLength(3);
  });

  it('draws only the band the Donchian row uses', () => {
    const pair = sides('donchian');
    expect(sidePlot('donchian', pair.buy).plot.lines).toEqual([
      { key: 'donchian.break.upper', label: 'Dải trên 20' },
    ]);
    expect(sidePlot('donchian', pair.sell).plot.lines).toEqual([
      { key: 'donchian.break.lower', label: 'Dải dưới 20' },
    ]);
    const swapped = sides('donchian', (config) => {
      row(config, 'buy', 0).band = 'lower';
      row(config, 'buy', 0).period = 55;
    });
    expect(sidePlot('donchian', swapped.buy).plot.lines).toEqual([
      { key: 'donchian.break.lower', label: 'Dải dưới 55' },
    ]);
  });

  it('draws the OBV extreme of the breakout row and its own break direction', () => {
    const pair = sides('obv', (config) => {
      row(config, 'buy', 1).enabled = true;
      row(config, 'sell', 1).enabled = true;
    });
    expect(sidePlot('obv', pair.buy).plot.lines.map((item) => item.label)).toEqual([
      'OBV',
      'SMA 20 của OBV',
      'Đỉnh 20 phiên',
    ]);
    expect(sidePlot('obv', pair.sell).plot.lines.map((item) => item.label)).toEqual([
      'OBV',
      'SMA 20 của OBV',
      'Đáy 20 phiên',
    ]);
    // OBV itself is drawn once even though two rows use it
    expect(
      sidePlot('obv', pair.buy).columns.filter((column) => column.series === 'value'),
    ).toHaveLength(1);
  });

  it('skips a row whose values cannot be plotted instead of failing the chart', () => {
    const pair = sides('rsi', (config) => {
      row(config, 'buy', 0).period = Number.NaN;
    });
    const { plot } = sidePlot('rsi', pair.buy);
    // level row is skipped (NaN period); the trend row still draws its own RSI 14
    expect(plot.lines).toEqual([{ key: 'rsi.trend.value', label: 'RSI 14' }]);
    expect(plot.threshold_levels).toEqual([]);
  });
});

describe('practice chart: payload and no look-ahead', () => {
  it('plots every line of every row of every indicator with real values', () => {
    for (const id of ROW_INDICATORS) {
      const pair = sides(id, withAllRows);
      const chart = chartOf(id, pair);
      for (const side of SIDES) {
        const { plot, series } = chart;
        expect(
          plot[side].lines.length + (plot[side].histogram_key ? 1 : 0),
          `${id}.${side}`,
        ).toBeGreaterThanOrEqual(id === 'bollinger' || id === 'obv' ? 2 : 1);
        for (const item of plot[side].lines) {
          const values = series[side][item.key]!;
          expect(values, `${id}.${side}.${item.key}`).toHaveLength(chart.bars.close.length);
          expect(
            values.some((value) => value !== null),
            `${id}.${side}.${item.key} has values`,
          ).toBe(true);
        }
        if (plot[side].histogram_key) {
          expect(series[side][plot[side].histogram_key]!.some((value) => value !== null)).toBe(
            true,
          );
        }
        // every key in the series is announced by the plot spec, and vice versa
        const announced = [
          ...plot[side].lines.map((item) => item.key),
          ...(plot[side].histogram_key ? [plot[side].histogram_key] : []),
        ].sort();
        expect(Object.keys(series[side]).sort(), `${id}.${side}`).toEqual(announced);
      }
    }
  });

  it('labels the session axis and aligns candles and series', () => {
    const chart = chartOf('rsi', sides('rsi'));
    const observed = calendar.firstTest - calendar.observationStart;
    expect(chart.first_session).toBe(-(observed - 1));
    expect(chart.last_session).toBe(0);
    expect(chart.last_observed_session).toBe(0);
    expect(chart.bars.close).toHaveLength(observed);
    expect(chart.bars.volume).toHaveLength(observed);
    for (const values of Object.values(chart.series.buy)) expect(values).toHaveLength(observed);
    // values are rounded to 6 decimals like the rest of the payload
    for (const value of chart.series.buy['rsi.level.value']!) {
      if (value !== null)
        expect(Math.abs(value * 1e6 - Math.round(value * 1e6))).toBeLessThan(1e-6);
    }
  });

  it('is identical whether or not the later bars exist (the preview never sees the future)', () => {
    for (const id of ROW_INDICATORS) {
      const pair = sides(id, withAllRows);
      const visible = calendar.bars.slice(0, calendar.firstTest);
      const preview = buildChart({
        indicatorId: id,
        calendar,
        from: calendar.observationStart,
        to: calendar.firstTest - 1,
        cache: createSeriesCache(visible),
        sides: pair,
      });
      // same window drawn from a cache over the full history (what a locked run does)
      const full = buildChart({
        indicatorId: id,
        calendar,
        from: calendar.observationStart,
        to: calendar.firstTest - 1,
        cache: createSeriesCache(calendar.bars),
        sides: pair,
      });
      expect(preview, id).toEqual(full);
      // and the future bars cannot change a preview: corrupt every bar after the window
      const future = calendar.bars.map((bar, index) =>
        index >= calendar.firstTest
          ? { ...bar, open: 1, high: 9_999_999, low: 1, close: 5_000_000, volume: 7 }
          : bar,
      );
      const corrupted = buildChart({
        indicatorId: id,
        calendar: { ...calendar, bars: future },
        from: calendar.observationStart,
        to: calendar.firstTest - 1,
        cache: createSeriesCache(future.slice(0, calendar.firstTest)),
        sides: pair,
      });
      expect(corrupted, id).toEqual(preview);
    }
  });
});

describe('practice chart: Volume keeps its params model', () => {
  const entry = practiceEntry('volume')!;

  it('plots the threshold line and the volume histogram under the legacy keys', () => {
    const config = structuredClone(defaultPracticeConfig(entry) as PracticeParamsConfig);
    config.buy.params = { lookback: 30, mult: 1.5 };
    const pair = {
      buy: toSideConfig(entry, 'buy', config.buy),
      sell: toSideConfig(entry, 'sell', config.sell),
    };
    const { plot } = sidePlot('volume', pair.buy);
    expect(plot.lines).toEqual([{ key: 'threshold', label: '1.5 × TB 30' }]);
    expect(plot.volume_key).toBe('volume');
    expect(plot.nonnegative).toBe(true);
    const chart = chartOf('volume', pair);
    expect(Object.keys(chart.series.buy).sort()).toEqual(['threshold', 'volume']);
    expect(chart.series.sell.threshold).not.toEqual(chart.series.buy.threshold);
    const expected = calc('volume', { lookback: 30, mult: 1.5 }, calendar.bars).threshold!;
    expect(chart.series.buy.threshold![10]).toBe(
      expected[calendar.observationStart + 10] === null
        ? null
        : Math.round(expected[calendar.observationStart + 10]! * 1e6) / 1e6,
    );
  });
});
