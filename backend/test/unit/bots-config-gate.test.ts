import { describe, expect, it } from 'vitest';

import {
  blockedGate,
  gateConfigSides,
  readLegacyReview,
} from '../../src/modules/bots/bot.config-gate.js';
import { defaultConfig, type SharedConfig } from '../../src/modules/quant/v2/index.js';

function config(buy: string[], sell: string[]): SharedConfig {
  const base = defaultConfig();
  for (const id of new Set([...buy, ...sell])) {
    const item = base.indicators[id]!;
    item.master_enabled = true;
    item.buy.enabled = buy.includes(id);
    item.sell.enabled = sell.includes(id);
  }
  return base;
}

const granted = (...ids: string[]) => new Set(ids.map((id) => `indicator:${id}`));

describe('config side gate (E_buy / E_sell)', () => {
  it('G01 reports inactive when no indicator is master ON with the side ON', () => {
    const gate = gateConfigSides(defaultConfig(), granted());
    expect(gate.buy).toMatchObject({ status: 'inactive', indicator_ids: [], block: null });
    expect(gate.sell).toMatchObject({ status: 'inactive', indicator_ids: [], block: null });
  });

  it('G02 lists the valid participants of each side independently, in registry order', () => {
    const gate = gateConfigSides(config(['ma', 'rsi'], ['macd']), granted('ma', 'rsi', 'macd'));
    expect(gate.buy.status).toBe('active');
    expect(gate.buy.indicator_ids).toEqual(['rsi', 'ma']);
    expect(gate.sell).toMatchObject({ status: 'active', indicator_ids: ['macd'] });
  });

  it('G03 a missing grant blocks only the sides that use that indicator', () => {
    const gate = gateConfigSides(config(['ma'], ['macd']), granted('ma'));
    expect(gate.buy.status).toBe('active');
    expect(gate.sell).toMatchObject({
      status: 'blocked',
      indicator_ids: [],
      block: { reason: 'config_invalid_or_unauthorized', indicator_ids: ['macd'] },
    });
    expect(gate.sell.block?.detail).toContain('macd');
  });

  it('G04 one bad participant blocks the whole side; the others are NOT ANDed alone', () => {
    const gate = gateConfigSides(config(['ma', 'macd'], []), granted('ma'));
    expect(gate.buy.status).toBe('blocked');
    expect(gate.buy.indicator_ids).toEqual([]);
  });

  it('G05 an unsupported indicator that participates is legacy_needs_review', () => {
    const cfg = config(['ma'], []);
    (cfg.indicators as Record<string, unknown>).retired = structuredClone(cfg.indicators.ma);
    const gate = gateConfigSides(cfg, new Set(['indicator:ma', 'indicator:retired']));
    expect(gate.buy).toMatchObject({
      status: 'blocked',
      block: { reason: 'legacy_needs_review', indicator_ids: ['retired'] },
    });
    expect(gate.sell.status).toBe('inactive');
  });

  it('G06 an unsupported indicator with master OFF does not affect anything', () => {
    const cfg = config(['ma'], []);
    (cfg.indicators as Record<string, unknown>).retired = {
      ...structuredClone(cfg.indicators.ma),
      master_enabled: false,
    };
    const gate = gateConfigSides(cfg, granted('ma'));
    expect(gate.buy).toMatchObject({ status: 'active', indicator_ids: ['ma'] });
  });

  it('G07 structural errors of a participating side are explicit', () => {
    const cfg = config(['ma'], []);
    cfg.indicators.ma!.buy.params = { period: -4 };
    const gate = gateConfigSides(cfg, granted('ma'));
    expect(gate.buy).toMatchObject({
      status: 'blocked',
      block: { reason: 'config_invalid_or_unauthorized' },
    });
  });

  it('G08 a global config error (schema/rule version) blocks both sides', () => {
    const cfg = { ...config(['ma'], ['macd']), schema_version: '1.0' } as unknown as SharedConfig;
    const gate = gateConfigSides(cfg, granted('ma', 'macd'));
    expect(gate.buy.status).toBe('blocked');
    expect(gate.sell.status).toBe('blocked');
  });

  it('G09 the legacy mapping flag is read defensively from several shapes', () => {
    const cfg = config(['ma'], ['macd']);
    expect(readLegacyReview(cfg)).toEqual({ buy: [], sell: [] });
    expect(readLegacyReview(cfg, { legacy_needs_review: true })).toEqual({
      buy: ['ma'],
      sell: ['macd'],
    });
    expect(readLegacyReview(cfg, undefined, { legacy_review: { sell: true } })).toEqual({
      buy: [],
      sell: ['macd'],
    });
    expect(readLegacyReview(cfg, { legacy_needs_review: { buy: ['ma', 'x'] } })).toEqual({
      buy: ['ma', 'x'],
      sell: [],
    });
    const marked = structuredClone(cfg);
    (marked.indicators.macd as unknown as Record<string, unknown>).legacy_status =
      'legacy_needs_review';
    expect(readLegacyReview(marked)).toEqual({ buy: [], sell: ['macd'] });
    expect(readLegacyReview(cfg, 'nonsense', null, 42)).toEqual({ buy: [], sell: [] });
  });

  it('G09b reads the strategy-config LegacyConfigReview of a historical revision', () => {
    const cfg = config(['ma'], ['macd']);
    const review = {
      from_rule_version: 'iqx-rules-2.0',
      legacy: true,
      removed_indicators: ['adx', 'atr'],
      defaulted_indicators: [],
      buy: { status: 'legacy_needs_review', indicators: ['adx'] },
      sell: { status: 'ok', indicators: [] },
      needs_review: true,
    };
    const flags = readLegacyReview(cfg, { revision: 3, legacy: review });
    expect(flags).toEqual({ buy: ['adx'], sell: [] });
    const gate = gateConfigSides(cfg, granted('ma', 'macd'), undefined, flags);
    expect(gate.buy).toMatchObject({
      status: 'blocked',
      block: { reason: 'legacy_needs_review', indicator_ids: ['adx'] },
    });
    expect(gate.sell.status).toBe('active');
    expect(readLegacyReview(cfg, { legacy: { ...review, buy: { status: 'ok' } } })).toEqual({
      buy: [],
      sell: [],
    });
  });

  it('G10 flagged indicators block with legacy_needs_review while the other side stays usable', () => {
    const cfg = config(['ma'], ['macd']);
    const gate = gateConfigSides(
      cfg,
      granted('ma', 'macd'),
      undefined,
      readLegacyReview(cfg, { legacy_needs_review: { sell: ['macd'] } }),
    );
    expect(gate.buy.status).toBe('active');
    expect(gate.sell).toMatchObject({
      status: 'blocked',
      block: { reason: 'legacy_needs_review', indicator_ids: ['macd'] },
    });
  });

  it('G11 an unreadable config blocks both sides with the supplied reason', () => {
    const gate = blockedGate('không đọc được');
    expect(gate.buy).toMatchObject({ status: 'blocked', block: { detail: 'không đọc được' } });
    expect(gate.sell.block?.reason).toBe('config_invalid_or_unauthorized');
  });
});
