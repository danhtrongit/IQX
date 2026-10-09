import { describe, expect, it } from 'vitest';
import {
  CURRENT_INDICATOR_IDS,
  LEGACY_REMOVED_INDICATOR_IDS,
  defaultConfig,
  isLegacyConfig,
  loadLegacyTechnicalRegistry,
  mapLegacyConfig,
  validateConfig,
  type IndicatorConfig,
  type LegacyConfigMapping,
} from '../../src/modules/quant/v2/index.js';
import { deepFreeze } from '../fixtures/bot-v2/reference.js';

type LegacyDocument = {
  schema_version: string;
  revision: number;
  rule_version: string;
  indicators: Record<string, IndicatorConfig>;
};

/** A stored `iqx-rules-2.0` revision: the 16 current indicators plus the 19 removed ones, all OFF. */
function legacyDocument(
  mutate: (indicators: Record<string, IndicatorConfig>) => void = () => undefined,
  revision = 7,
) {
  const base = defaultConfig();
  const document: LegacyDocument = {
    schema_version: '2.0',
    revision,
    rule_version: 'iqx-rules-2.0',
    indicators: structuredClone(base.indicators),
  };
  for (const entry of loadLegacyTechnicalRegistry()) {
    document.indicators[entry.id] = {
      master_enabled: false,
      buy: {
        enabled: true,
        params: structuredClone(entry.buy.params),
        rules: structuredClone(entry.buy.rules),
      },
      sell: {
        enabled: true,
        params: structuredClone(entry.sell.params),
        rules: structuredClone(entry.sell.rules),
      },
    };
  }
  mutate(document.indicators);
  return document;
}

function mapped(document: unknown): LegacyConfigMapping {
  const result = mapLegacyConfig(document);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.mapping;
}

describe('legacy shared-config mapping (35 -> 16 indicators)', () => {
  it('lists the 19 removed indicators and the 16 current ones with no overlap', () => {
    expect(CURRENT_INDICATOR_IDS).toHaveLength(16);
    expect(LEGACY_REMOVED_INDICATOR_IDS).toHaveLength(19);
    expect(
      CURRENT_INDICATOR_IDS.some((id) =>
        (LEGACY_REMOVED_INDICATOR_IDS as readonly string[]).includes(id),
      ),
    ).toBe(false);
    expect(loadLegacyTechnicalRegistry().map((entry) => entry.id)).toEqual([
      ...LEGACY_REMOVED_INDICATOR_IDS,
    ]);
  });

  it('recognises a historical document by its rule version or by an indicator outside the 16', () => {
    expect(isLegacyConfig(defaultConfig())).toBe(false);
    expect(isLegacyConfig(legacyDocument())).toBe(true);
    expect(isLegacyConfig({ ...defaultConfig(), rule_version: 'iqx-rules-2.0' })).toBe(true);
    const extra = structuredClone(defaultConfig());
    extra.indicators.atr = structuredClone(extra.indicators.rsi!);
    expect(isLegacyConfig(extra)).toBe(true);
    expect(isLegacyConfig(null)).toBe(false);
    expect(isLegacyConfig('x')).toBe(false);
  });

  it('maps a legacy config to the current shape, preserving the 16 entries choices', () => {
    const document = legacyDocument((indicators) => {
      const rsi = indicators.rsi!;
      rsi.master_enabled = true;
      rsi.buy.enabled = true;
      rsi.buy.params.period = 21;
      rsi.sell.enabled = false;
      rsi.sell.params.level = 80;
      indicators.bollinger!.buy.rules[1]!.op = '∉';
    });
    const { config, review, validation_errors } = mapped(document);
    expect(config).toMatchObject({
      schema_version: '2.0',
      rule_version: 'iqx-rules-3.0',
      revision: 7,
    });
    expect(Object.keys(config.indicators)).toEqual([...CURRENT_INDICATOR_IDS]);
    expect(config.indicators.rsi).toEqual(document.indicators.rsi);
    expect(config.indicators.rsi!.buy.params.period).toBe(21);
    expect(config.indicators.rsi!.sell.params.level).toBe(80);
    expect(config.indicators.bollinger!.buy.rules[1]!.op).toBe('∉');
    // Removed indicators are not carried into the current shape.
    expect(Object.keys(config.indicators).some((id) => id === 'atr' || id === 'psar')).toBe(false);
    expect(validation_errors).toEqual([]);
    expect(validateConfig(config)).toEqual([]);
    expect(review).toMatchObject({
      from_rule_version: 'iqx-rules-2.0',
      legacy: true,
      defaulted_indicators: [],
      needs_review: false,
      buy: { status: 'ok', indicators: [] },
      sell: { status: 'ok', indicators: [] },
    });
    expect(review.removed_indicators).toEqual([...LEGACY_REMOVED_INDICATOR_IDS].sort());
  });

  it('flags a side legacy_needs_review when a removed indicator was master ON with that side ON', () => {
    const document = legacyDocument((indicators) => {
      indicators.rsi!.master_enabled = true;
      indicators.rsi!.buy.enabled = true;
      indicators.atr!.master_enabled = true;
      indicators.atr!.buy.enabled = true;
      indicators.atr!.sell.enabled = false;
      indicators.keltner!.master_enabled = true;
      indicators.keltner!.buy.enabled = true;
      indicators.keltner!.sell.enabled = false;
    });
    const { review, config } = mapped(document);
    expect(review.needs_review).toBe(true);
    expect(review.buy).toEqual({ status: 'legacy_needs_review', indicators: ['atr', 'keltner'] });
    expect(review.sell).toEqual({ status: 'ok', indicators: [] });
    // The rule is not dropped silently: the mapped config still has RSI ON, and the status is
    // exposed so the Bot blocks the Buy side instead of running RSI alone.
    expect(config.indicators.rsi!.master_enabled).toBe(true);
    expect(config.indicators.rsi!.buy.enabled).toBe(true);
  });

  it('flags each side independently', () => {
    const sellOnly = mapped(
      legacyDocument((indicators) => {
        indicators.psar!.master_enabled = true;
        indicators.psar!.buy.enabled = false;
        indicators.psar!.sell.enabled = true;
      }),
    ).review;
    expect(sellOnly.buy.status).toBe('ok');
    expect(sellOnly.sell).toEqual({ status: 'legacy_needs_review', indicators: ['psar'] });
    const both = mapped(
      legacyDocument((indicators) => {
        indicators.adx!.master_enabled = true;
      }),
    ).review;
    expect(both.buy.status).toBe('legacy_needs_review');
    expect(both.sell.status).toBe('legacy_needs_review');
  });

  it('does not flag removed indicators that were master OFF or had that side OFF', () => {
    const { review } = mapped(
      legacyDocument((indicators) => {
        // master OFF keeps child choices but the indicator takes no part in either side
        indicators.atr!.master_enabled = false;
        indicators.atr!.buy.enabled = true;
        // master ON with both sides OFF is an empty set, not a rule
        indicators.gap!.master_enabled = true;
        indicators.gap!.buy.enabled = false;
        indicators.gap!.sell.enabled = false;
      }),
    );
    expect(review.needs_review).toBe(false);
  });

  it('treats a removed or unknown entry it cannot prove OFF as needing review', () => {
    const malformed = legacyDocument();
    (malformed.indicators as Record<string, unknown>).gap = 'broken';
    const unknown = legacyDocument((indicators) => {
      indicators.supertrend = {
        master_enabled: true,
        buy: { enabled: true, params: {}, rules: [] },
        sell: { enabled: false, params: {}, rules: [] },
      };
    });
    expect(mapped(malformed).review).toMatchObject({
      needs_review: true,
      buy: { status: 'legacy_needs_review', indicators: ['gap'] },
      sell: { status: 'legacy_needs_review', indicators: ['gap'] },
    });
    expect(mapped(unknown).review).toMatchObject({
      buy: { status: 'legacy_needs_review', indicators: ['supertrend'] },
      sell: { status: 'ok' },
    });
  });

  it('maps a current config to itself with every side ok, and defaults missing current entries to OFF', () => {
    const current = mapped(defaultConfig());
    expect(current.config).toEqual(defaultConfig());
    expect(current.review).toMatchObject({
      legacy: false,
      removed_indicators: [],
      needs_review: false,
      buy: { status: 'ok' },
      sell: { status: 'ok' },
    });
    const partial = structuredClone(defaultConfig());
    delete partial.indicators.cci;
    const result = mapped(partial);
    expect(result.review.defaulted_indicators).toEqual(['cci']);
    expect(result.config.indicators.cci).toEqual(defaultConfig().indicators.cci);
  });

  it('reports invalid 16-entry values through validation_errors, never repairs them', () => {
    const document = legacyDocument((indicators) => {
      indicators.rsi!.buy.params.period = 4;
    });
    const result = mapped(document);
    expect(result.config.indicators.rsi!.buy.params.period).toBe(4);
    expect(result.validation_errors.map((e) => e.path)).toEqual([
      'indicators.rsi.buy.params.period',
    ]);
  });

  it('rejects documents it cannot read and never mutates its input', () => {
    expect(mapLegacyConfig(null)).toMatchObject({ ok: false });
    expect(mapLegacyConfig({ indicators: [] })).toMatchObject({ ok: false });
    const broken = legacyDocument();
    (broken.indicators as Record<string, unknown>).rsi = { master_enabled: true };
    expect(mapLegacyConfig(broken)).toMatchObject({
      ok: false,
      errors: [{ path: 'indicators.rsi' }],
    });
    const frozen = deepFreeze(
      legacyDocument((indicators) => (indicators.atr!.master_enabled = true)),
    );
    expect(() => mapLegacyConfig(frozen)).not.toThrow();
    const result = mapped(frozen);
    result.config.indicators.rsi!.buy.params.period = 50;
    expect(frozen.indicators.rsi!.buy.params.period).toBe(14);
  });

  it('the current validator keeps refusing legacy documents (saving accepts only the 16)', () => {
    const document = legacyDocument();
    const errors = validateConfig(document);
    expect(errors.some((e) => e.path === 'rule_version')).toBe(true);
    expect(errors.filter((e) => e.path.startsWith('indicators.')).map((e) => e.path)).toHaveLength(
      19,
    );
  });
});
