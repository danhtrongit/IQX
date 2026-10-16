import { buildIndicatorConfig, buildPatch, crossFieldErrors, dirtyIds, draftFromSaved, paramError, paramFromWire, paramToWire, rebaseDraft, withParam, withSideEnabled } from '../model';
import type { Registry, RegistryIndicator, SharedConfig } from '../types';

const rules = [{ id: 'r1', kind: 'compare', lhs: { kind: 'series', key: 'value', offset: -1 }, rhs: { kind: 'param', key: 'level' }, op: '<', allowed_ops: ['>', '<'] }];
const rsi: RegistryIndicator = {
  id: 'rsi', name: 'RSI', chapter: 1,
  fields: [
    { key: 'period', label: 'Chu kỳ RSI', type: 'integer', min: 5, max: 50, step: 1, api_scale: 1 },
    { key: 'level', label: 'Ngưỡng RSI', type: 'number', min: 10, max: 90, step: 1, api_scale: 1 },
  ],
  buy: { enabled: false, params: { period: 14, level: 30 }, rules },
  sell: { enabled: false, params: { period: 14, level: 70 }, rules },
  learned: true,
};
const macd: RegistryIndicator = { ...rsi, id: 'macd', name: 'MACD', fields: [
  { key: 'fast', label: 'EMA nhanh', type: 'integer', min: 2, max: 50, step: 1 },
  { key: 'slow', label: 'EMA chậm', type: 'integer', min: 5, max: 100, step: 1 },
], validation: { cross_fields: [{ left: 'fast', op: '<', right: 'slow' }] } };
const registry: Registry = { calculation_version: 'v', rule_version: 'r', indicators: [rsi] };
const saved = (revision = 1): SharedConfig => ({
  saved_revision: revision, effective_revision: null, effective_session: null, status: 'pending', granted_indicators: ['rsi'],
  config: { indicators: { rsi: { master_enabled: true, buy: { enabled: true, params: { period: 14, level: 30 }, rules }, sell: { enabled: false, params: { period: 14, level: 70 }, rules } } } },
});

describe('shared config model', () => {
  it('validates params', () => {
    expect(paramError(rsi.fields[0], 14)).toBeNull();
    expect(paramError(rsi.fields[0], 14.5)).toMatch(/số nguyên/);
    expect(paramError(rsi.fields[0], 4)).toMatch(/từ 5 đến 50/);
    expect(paramError(rsi.fields[1], null)).toMatch(/số hợp lệ/);
  });
  it('checks cross fields', () => {
    expect(crossFieldErrors(macd, { fast: 30, slow: 20 })).toHaveLength(1);
    expect(crossFieldErrors(macd, { fast: 12, slow: 26 })).toHaveLength(0);
  });
  it('api_scale conversion is a pass-through (as on web)', () => {
    expect(paramToWire(14, { api_scale: 1 })).toBe(14);
    expect(paramFromWire(0.3, { api_scale: 1 })).toBe(0.3);
  });
  it('builds a PATCH body with dirty indicators only', () => {
    const s = saved(3);
    const base = draftFromSaved(registry, s);
    const draft = { ...base, rsi: withParam(base.rsi, 'buy', 'level', 25) };
    expect(dirtyIds(draft, base)).toEqual(['rsi']);
    const body = buildPatch(registry, s, draft, base, 'key-1');
    expect(body.expected_revision).toBe(3);
    expect(body.idempotency_key).toBe('key-1');
    expect(body.indicators.rsi.master_enabled).toBe(true);
    expect(body.indicators.rsi.buy.params.level).toBe(25);
    expect(buildPatch(registry, s, base, base, 'k').indicators).toEqual({});
  });
  it('master follows sides', () => {
    const s = saved();
    expect(buildIndicatorConfig(s.config.indicators.rsi, withSideEnabled(s.config.indicators.rsi, 'buy', false)).master_enabled).toBe(false);
  });
  it('rebases untouched indicators onto the new base', () => {
    const s = saved(1);
    const oldBase = draftFromSaved(registry, s);
    const draft = { rsi: withParam(oldBase.rsi, 'buy', 'level', 20) };
    const s2 = saved(2);
    s2.config.indicators.rsi.buy.params.level = 35;
    const newBase = draftFromSaved(registry, s2);
    expect(rebaseDraft(draft, oldBase, newBase).rsi.buy.params.level).toBe(20);
    expect(rebaseDraft(oldBase, oldBase, newBase).rsi.buy.params.level).toBe(35);
  });
});
