import { ApiError } from '@/lib/api';
import { buildUpdateBody, mapApiErrors, resolveSides, sideValid } from '../form-logic';
import { lastCheckText, scopeTitle, sourceCaption, statusLabel, STATUS_LABEL } from '../labels';
import { parseSymbols, validateSymbols } from '../symbols';
import type { SidesDetail, StrategyAlert } from '../types';

const detail = (buy: boolean, sell: boolean): SidesDetail => ({
  buy: { valid: buy, indicator_ids: buy ? ['rsi'] : [] },
  sell: { valid: sell, indicator_ids: sell ? ['macd'] : [] },
});

const alert: StrategyAlert = {
  id: 'a1',
  name: 'FPT watch',
  enabled: true,
  status: 'watching',
  current_version: 3,
  last_check: { session: '2026-10-08', pairs_expected: 2, pairs_checked: 1 },
  version: {
    sides: ['buy'],
    symbols: ['FPT', 'VNM'],
    sides_detail: detail(true, false),
    source: { kind: 'shared_config', revision: 2 },
    scope: { kind: 'symbols' },
  },
};

describe('parseSymbols / validateSymbols', () => {
  it('splits on whitespace, comma, semicolon; uppercases; dedupes', () => {
    expect(parseSymbols('fpt, vnm;hpg\nFPT  acb').symbols).toEqual(['FPT', 'VNM', 'HPG', 'ACB']);
  });
  it('reports invalid tokens', () => {
    const r = parseSymbols('FPT, A$B, TOOLONGSYMBOLTOOLONGSYMBOL');
    expect(r.symbols).toEqual(['FPT']);
    expect(r.invalid).toEqual(['A$B', 'TOOLONGSYMBOLTOOLONGSYMBOL']);
  });
  it('allows dot, dash, underscore', () => {
    expect(parseSymbols('e1vfvn30 a_b c-d e.f').invalid).toEqual([]);
  });
  it('validates empty, invalid and >500', () => {
    expect(validateSymbols('  ').ok).toBe(false);
    expect(validateSymbols('A!').ok).toBe(false);
    const many = Array.from({ length: 501 }, (_, i) => `S${i}`).join(' ');
    const r = validateSymbols(many);
    expect(r.ok).toBe(false);
    expect(validateSymbols('FPT vnm')).toEqual({ ok: true, symbols: ['FPT', 'VNM'] });
  });
});

describe('side enabling', () => {
  it('only valid sides are selectable and checked by default (create)', () => {
    expect(sideValid(detail(true, false), 'buy')).toBe(true);
    expect(sideValid(detail(true, false), 'sell')).toBe(false);
    expect(resolveSides(detail(true, true), {})).toEqual(['buy', 'sell']);
    expect(resolveSides(detail(true, false), { sell: true })).toEqual(['buy']);
    expect(resolveSides(detail(true, true), { buy: false })).toEqual(['sell']);
    expect(resolveSides(undefined, {})).toEqual([]);
  });
  it('edit starts from current sides', () => {
    expect(resolveSides(detail(true, true), {}, ['buy'])).toEqual(['buy']);
  });
});

describe('buildUpdateBody', () => {
  const same = { name: 'FPT watch', enabled: true, source: null, scope: { kind: 'symbols' as const, symbols: ['VNM', 'FPT'] }, sides: ['buy' as const] };
  it('is empty when nothing changed', () => {
    expect(buildUpdateBody(alert, same)).toEqual({});
  });
  it('name/enabled only: no expected_version', () => {
    expect(buildUpdateBody(alert, { ...same, name: 'X', enabled: false })).toEqual({ name: 'X', enabled: false });
  });
  it('scope change adds expected_version', () => {
    expect(buildUpdateBody(alert, { ...same, scope: { kind: 'symbols', symbols: ['FPT'] } })).toEqual({
      scope: { kind: 'symbols', symbols: ['FPT'] },
      expected_version: 3,
    });
  });
  it('source and sides changes', () => {
    const body = buildUpdateBody(alert, { ...same, source: { kind: 'backtest_run', run_id: 'r1' }, sides: ['buy', 'sell'] });
    expect(body).toEqual({ source: { kind: 'backtest_run', run_id: 'r1' }, sides: ['buy', 'sell'], expected_version: 3 });
  });
  it('saved-list scope is never sent', () => {
    const list: StrategyAlert = { ...alert, version: { ...alert.version, scope: { kind: 'saved_list', list_id: 'l', list_name: 'L' } } };
    expect(buildUpdateBody(list, { ...same, scope: null })).toEqual({});
  });
});

describe('mapApiErrors', () => {
  it('maps validation paths to fields', () => {
    const e = new ApiError('bad', 422, {
      code: 'VALIDATION_ERROR',
      details: [
        { path: ['name'], message: 'Too long' },
        { path: ['scope', 'symbols'], message: 'Too small' },
        { path: ['sides'], message: 'Bad sides' },
      ],
    });
    expect(mapApiErrors(e, 'x')).toEqual({ name: 'Too long', symbols: 'Too small', sides: 'Bad sides' });
  });
  it('maps SYMBOL_INVALID', () => {
    const e = new ApiError('m', 422, { code: 'SYMBOL_INVALID', details: [{ symbol: 'ZZZ' }] });
    expect(mapApiErrors(e, 'x').symbols).toContain('ZZZ');
  });
  it('409 asks to reload', () => {
    expect(mapApiErrors(new ApiError('c', 409), 'x').form).toMatch(/tải lại/);
  });
  it('non-api errors use the fallback', () => {
    expect(mapApiErrors(new Error('net'), 'fallback')).toEqual({ form: 'fallback' });
  });
});

describe('labels', () => {
  it('maps every status to the web label', () => {
    expect(STATUS_LABEL).toEqual({
      watching: 'Đang theo dõi',
      paused: 'Tạm dừng',
      unchecked: 'Chưa kiểm tra',
      waiting_data: 'Chờ dữ liệu',
      config_error: 'Lỗi cấu hình/quyền',
    });
    expect(statusLabel('weird')).toBe('weird');
  });
  it('captions', () => {
    expect(sourceCaption(alert.version)).toBe('Cấu hình chung · bản 2');
    expect(scopeTitle(alert.version)).toBe('2 mã');
    expect(lastCheckText(alert)).toContain('1/2 tổ hợp');
    expect(lastCheckText({ ...alert, last_check: { session: null, pairs_expected: 0, pairs_checked: 0 } })).toBe('Chưa có lần kiểm tra');
  });
});
