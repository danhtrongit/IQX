import { loadTechnicalRegistry, type Side } from '../../../src/modules/quant/v2/index.js';

/**
 * Documents as they were stored before SPEC V3 (`iqx-rules-3.0`, schema 2.0): side-level `params`
 * and the registry rule templates `r1`… per tab. They prove two things for the Backtest and
 * Strategy-alert modules: what was written before stays readable, and nothing evaluates it
 * (its conditions are never mapped to the row conditions, SPEC V3 §6.1.5).
 */

type PreV3Rule = {
  id: string;
  kind: 'cross' | 'compare';
  enabled: boolean;
  lhs: Record<string, unknown>;
  op: '>' | '<';
  rhs: Record<string, unknown>;
  allowed_ops: Array<'>' | '<'>;
};

const series = (key: string, extra: Record<string, unknown> = {}) => ({
  kind: 'series',
  key,
  offset: 0,
  ...extra,
});

/** The three MA rule templates of `iqx-rules-3.0` (Mua `>`, Bán `<`). */
function maRules(op: '>' | '<'): PreV3Rule[] {
  return [
    {
      id: 'r1',
      kind: 'cross',
      enabled: true,
      lhs: series('close'),
      op,
      rhs: series('value'),
      allowed_ops: ['>', '<'],
    },
    {
      id: 'r2',
      kind: 'cross',
      enabled: false,
      lhs: series('fast'),
      op,
      rhs: series('slow'),
      allowed_ops: ['>', '<'],
    },
    {
      id: 'r3',
      kind: 'compare',
      enabled: false,
      lhs: series('trend'),
      op,
      rhs: { kind: 'series', key: 'trend', offset_param: 'trend_period' },
      allowed_ops: ['>', '<'],
    },
  ];
}

const maSide = (enabled: boolean, op: '>' | '<') => ({
  enabled,
  params: { period: 20, fast: 10, slow: 20, trend_period: 20 },
  rules: maRules(op),
});

/**
 * A V2 document with every registry indicator (the others master OFF, one generic rule) and MA
 * master ON with both tabs ON, like a user who had MA running before the upgrade.
 */
export function preV3Config(revision = 3): Record<string, unknown> {
  const indicators: Record<string, unknown> = {};
  for (const entry of loadTechnicalRegistry()) {
    const side = { enabled: false, params: { period: 14 }, rules: [] as PreV3Rule[] };
    indicators[entry.id] = { master_enabled: false, buy: side, sell: side };
  }
  indicators.ma = { master_enabled: true, buy: maSide(true, '>'), sell: maSide(true, '<') };
  return { schema_version: '2.0', revision, rule_version: 'iqx-rules-3.0', indicators };
}

/** One evaluated rule as stored in evidence before SPEC V3: registry rule id, no `values`. */
export function preV3EvidenceRule(side: Side) {
  return {
    id: 'r1',
    indicator: 'ma',
    side,
    op: side === 'buy' ? ('>' as const) : ('<' as const),
    lhs: 105.5,
    rhs: 103.2,
    result: true,
    missing: false,
    previous_lhs: 101.1,
    previous_rhs: 102.9,
  };
}
