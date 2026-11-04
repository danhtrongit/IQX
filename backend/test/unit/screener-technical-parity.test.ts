import { describe, expect, it } from 'vitest';

import { sessionSideSignalWithEvidence } from '../../src/modules/bots/bot.shared-config.js';
import {
  defaultConfigV4,
  defaultRows,
  isRowsEntry,
  loadTechnicalRegistry,
  sideSignalsWithEvidence,
  validateSideRows,
  type ConditionRow,
  type ParamsRegistryEntry,
  type RegistryEntry,
  type RowsRegistryEntry,
  type SharedConfig,
  type SideConfig,
} from '../../src/modules/quant/v2/index.js';
import type { TechnicalItem } from '../../src/modules/screener/screener.definition.js';
import {
  evaluateTechnical,
  technicalIssues,
  toEngineBars,
} from '../../src/modules/screener/screener.technical.js';
import { randomWalk, seeded, toBars } from './helpers/screener-fixtures.js';

/**
 * Bộ lọc 4.0 §11.2.8: the Kỹ thuật part of the filter and the Bot must answer the same, per row, at
 * the same session T. The reference here is the Bot's own session signal (`sessionSideSignalWithEvidence`
 * on a SharedConfig that has only that indicator on); the subject is `evaluateTechnical`. Both end in the
 * shared `evaluateIndicatorSide`, so the test would fail if the filter ever grew a function of its own.
 */

const SESSION = '2026-11-03';
const SYMBOL_COUNT = 60;
const registry = loadTechnicalRegistry();
const rowEntries = registry.filter(isRowsEntry) as RowsRegistryEntry[];
const volumeEntry = registry.find((entry) => entry.id === 'volume') as ParamsRegistryEntry;

/** Sixty symbols: most with the Bot's full history, some young listings so NO_SIGNAL is exercised too. */
const SYMBOLS = Array.from({ length: SYMBOL_COUNT }, (_, index) => {
  const length = index % 10 === 3 ? 120 : index % 10 === 7 ? 250 : index % 15 === 11 ? 40 : 460;
  return { symbol: `P${String(index).padStart(2, '0')}`, columns: randomWalk(1000 + index, SESSION, length) };
});

type Variant = { name: string; item: TechnicalItem; botSide: SideConfig };

const roundTo = (value: number, step: number): number => {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
  return Number(value.toFixed(decimals));
};

function randomRows(entry: RowsRegistryEntry, seed: number): ConditionRow[] {
  const random = seeded(seed * 7919 + entry.id.length * 131);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows: ConditionRow[] = entry.rows.map((row) => {
      const values: Record<string, number | string> = {};
      for (const field of row.fields) {
        if (field.type === 'enum') {
          values[field.key] = field.options[Math.floor(random() * field.options.length)]!.value;
        } else if (field.type === 'integer' && 'options' in field && Array.isArray(field.options)) {
          // The Bot offers only these periods (5, 10, 20, 50, 100, 200 …) for this field.
          values[field.key] = (field.options as number[])[Math.floor(random() * field.options.length)]!;
        } else if (field.type === 'integer') {
          const high = random() < 0.7 ? Math.min(field.max, field.min + 58) : field.max;
          values[field.key] = field.min + Math.floor(random() * (high - field.min + 1));
        } else {
          const steps = Math.round((field.max - field.min) / field.step);
          values[field.key] = roundTo(field.min + Math.floor(random() * (steps + 1)) * field.step, field.step);
        }
      }
      return { id: row.id, enabled: random() < 0.75, ...values } as ConditionRow;
    });
    if (!rows.some((row) => row.enabled)) rows[0]!.enabled = true;
    if (validateSideRows(entry, 'buy', { enabled: true, rules: rows }, 'x').length === 0) return rows;
  }
  throw new Error(`no valid random rows for ${entry.id}`);
}

function rowVariants(entry: RowsRegistryEntry): Variant[] {
  const defaults = defaultRows(entry, 'buy');
  const allOn = defaults.map((row) => ({ ...row, enabled: true }));
  const sets: Array<[string, ConditionRow[]]> = [
    ['defaults', defaults],
    ['all rows on', allOn],
    ['random 1', randomRows(entry, 1)],
    ['random 2', randomRows(entry, 2)],
    ['random 3', randomRows(entry, 3)],
  ];
  return sets.map(([name, rules]) => ({
    name,
    item: { indicator: entry.id, rules: rules as TechnicalItem extends { rules: infer R } ? R : never } as TechnicalItem,
    botSide: { enabled: true, rules },
  }));
}

function volumeVariants(): Variant[] {
  const combos: Array<[number, number, [string, string]]> = [
    [20, 1.1, ['>', '>']],
    [5, 0.5, ['<', '<']],
    [100, 3, ['>', '<']],
    [30, 1.5, ['<', '>']],
    [50, 2, ['>', '>']],
  ];
  return combos.map(([sessions, factor, ops]) => ({
    name: `N=${sessions} k=${factor} ${ops.join('')}`,
    item: { indicator: 'volume', sessions, factor, ops },
    // How the Bot's Khối lượng form stores its side: registry params + the two rules with the chosen operators.
    botSide: {
      enabled: true,
      params: { lookback: sessions, mult: factor },
      rules: volumeEntry.buy.rules.map((rule, index) => ({ ...rule, op: ops[index]! })),
    } as SideConfig,
  }));
}

const VARIANTS: Array<{ entry: RegistryEntry; variants: Variant[] }> = [
  ...rowEntries.map((entry) => ({ entry, variants: rowVariants(entry) })),
  { entry: volumeEntry, variants: volumeVariants() },
];

function botConfig(entry: RegistryEntry, side: SideConfig): SharedConfig {
  const config = defaultConfigV4(registry);
  config.indicators[entry.id] = { ...config.indicators[entry.id]!, master_enabled: true, buy: side };
  return config;
}

type Tally = { rows: number; true: number; false: number; noSignal: number; mismatches: number };
const tally = new Map<string, Tally>();
const tallyOf = (id: string): Tally => {
  let entry = tally.get(id);
  if (!entry) {
    entry = { rows: 0, true: 0, false: 0, noSignal: 0, mismatches: 0 };
    tally.set(id, entry);
  }
  return entry;
};

describe('Bộ lọc 4.0 §11.2.8: Kỹ thuật equals the Bot, row by row, at the same session T', () => {
  it('uses at least 50 symbols and at least 3 configurations of every indicator', () => {
    expect(SYMBOLS.length).toBeGreaterThanOrEqual(50);
    expect(VARIANTS).toHaveLength(16);
    for (const { variants } of VARIANTS) expect(variants.length).toBeGreaterThanOrEqual(3);
    for (const { variants } of VARIANTS)
      for (const variant of variants) expect(technicalIssues([variant.item])).toEqual([]);
  });

  for (const { entry, variants } of VARIANTS) {
    it(`${entry.id}: ${SYMBOL_COUNT} symbols × ${variants.length} configurations give the Bot's verdict for every enabled row`, () => {
      const stats = tallyOf(entry.id);
      for (const variant of variants) {
        const config = botConfig(entry, variant.botSide);
        for (const { symbol, columns } of SYMBOLS) {
          const bars = toBars(columns);
          const bot = sessionSideSignalWithEvidence(config, bars, 'buy', SESSION, registry);
          const screened = evaluateTechnical([variant.item], toEngineBars(columns), SESSION);
          const where = `${entry.id} / ${variant.name} / ${symbol}`;
          // Bot rows are the enabled rows in definition order, keyed by their stored id.
          expect(screened.cells.length, where).toBe(bot.rules.length);
          bot.rules.forEach((rule, index) => {
            const cell = screened.cells[index]!;
            stats.rows += 1;
            if (rule.result === true) stats.true += 1;
            else if (rule.result === false) stats.false += 1;
            else stats.noSignal += 1;
            if (cell.result !== rule.result) stats.mismatches += 1;
            expect(cell.row_id, where).toBe(rule.id);
            expect(cell.result, `${where} row ${rule.id}`).toBe(rule.result);
            expect(cell.status, `${where} row ${rule.id}`).toBe(rule.result === null ? 'missing' : 'ok');
          });
          // The whole indicator: every enabled row true (a NO_SIGNAL row is never a pass).
          expect(screened.passed, where).toBe(bot.result === true);
          expect(screened.has_exception, where).toBe(bot.rules.some((rule) => rule.result === null));
        }
      }
      expect(stats.mismatches).toBe(0);
    });
  }

  it('is not vacuous: across the run there are true, false and NO_SIGNAL verdicts', () => {
    const total = [...tally.values()].reduce(
      (sum, item) => ({
        rows: sum.rows + item.rows,
        true: sum.true + item.true,
        false: sum.false + item.false,
        noSignal: sum.noSignal + item.noSignal,
        mismatches: sum.mismatches + item.mismatches,
      }),
      { rows: 0, true: 0, false: 0, noSignal: 0, mismatches: 0 },
    );
    expect(total.rows).toBeGreaterThan(5000);
    expect(total.true).toBeGreaterThan(50);
    expect(total.false).toBeGreaterThan(500);
    expect(total.noSignal).toBeGreaterThan(50);
    expect(total.mismatches).toBe(0);
    if (process.env.PARITY_REPORT) {
      const lines = ['| Chỉ báo | Mã | Cấu hình | Dòng so sánh | true | false | NO_SIGNAL | Lệch |', '|---|---|---|---|---|---|---|---|'];
      for (const { entry, variants } of VARIANTS) {
        const item = tallyOf(entry.id);
        lines.push(
          `| ${entry.id} | ${SYMBOL_COUNT} | ${variants.length} | ${item.rows} | ${item.true} | ${item.false} | ${item.noSignal} | ${item.mismatches} |`,
        );
      }
      lines.push(
        `| **Tổng** | ${SYMBOL_COUNT} | ${VARIANTS.reduce((sum, item) => sum + item.variants.length, 0)} | ${total.rows} | ${total.true} | ${total.false} | ${total.noSignal} | ${total.mismatches} |`,
      );
      console.log(`\nPARITY_TABLE\n${lines.join('\n')}\n`);
    }
  });

  it('§11.2.9 no look-ahead: the verdict at T equals the Bot verdict at index T of the FULL series (later bars never matter)', () => {
    const random = seeded(424242);
    let compared = 0;
    for (const { entry, variants } of VARIANTS) {
      for (const variant of variants.slice(0, 3)) {
        const config = botConfig(entry, variant.botSide);
        for (const { symbol, columns } of SYMBOLS.filter((item) => item.columns.dates.length >= 250).slice(0, 12)) {
          const bars = toBars(columns);
          const full = sideSignalsWithEvidence(config, bars, 'buy', registry);
          const index = 80 + Math.floor(random() * (bars.length - 82));
          const truncated = toEngineBars({
            dates: columns.dates.slice(0, index + 1),
            open: columns.open.slice(0, index + 1),
            high: columns.high.slice(0, index + 1),
            low: columns.low.slice(0, index + 1),
            close: columns.close.slice(0, index + 1),
            volume: columns.volume.slice(0, index + 1),
          });
          const screened = evaluateTechnical([variant.item], truncated, columns.dates[index]!);
          const botRows = full[index]!.rules;
          expect(screened.cells.map((cell) => cell.result), `${entry.id}/${variant.name}/${symbol}@${index}`).toEqual(
            botRows.map((rule) => rule.result),
          );
          compared += botRows.length;
        }
      }
    }
    expect(compared).toBeGreaterThan(500);
  });

  it('a session whose bar is not the last one is NO_SIGNAL, never an older bar read as T', () => {
    const { columns } = SYMBOLS[0]!;
    const variant = VARIANTS[0]!.variants[0]!;
    const result = evaluateTechnical([variant.item], toEngineBars(columns), '2099-01-01');
    expect(result.cells.length).toBeGreaterThan(0);
    expect(result.cells.every((cell) => cell.status === 'missing' && cell.reason_code === 'no_session_bar')).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.has_exception).toBe(true);
  });
});
