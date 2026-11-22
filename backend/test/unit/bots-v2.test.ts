/**
 * Bot v2.0 pure parts (PLAN W3): cutoff and Phiên tới (§6.4, B09–B11), the iqx-bot-v2.0 receipt
 * (R14 verification), the one-line session summary and the conversion planning rules (§11, M01–M06).
 */
import { describe, expect, it } from 'vitest';

import {
  botCalendar,
  botV2Receipt,
  BOT_POLICY_V2,
  cutoffInstant,
  ictDate,
  isAtOrAfterCutoff,
  isGiveUpTime,
  isV2Receipt,
  nextSessionAt,
  parseCutoff,
  sessionSummary,
  verifyV2Receipt,
} from '../../src/modules/bots/index.js';
import {
  addTradingSessions,
  contentFrom,
  convertedMaxHolding,
  countTradingSessions,
  firstSessionAfter,
  inBotWindow,
  isOutdatedConfig,
  parseArgs,
  requireSafeTarget,
} from '../../scripts/bot-strategy-v2-convert.js';
import { defaultConfig } from '../../src/modules/quant/v2/config.js';
import { RULE_VERSION, SCHEMA_VERSION } from '../../src/modules/quant/v2/index.js';
import { RULE_MESSAGES } from '../../src/modules/strategy-rules/index.js';

const ict = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`);
const STORE = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];

describe('cutoff and Phiên tới (§6.4)', () => {
  it('parses the cutoff, 19:00 by default, rejects a bad value', () => {
    expect(parseCutoff('18:45')).toEqual({ hour: 18, minute: 45 });
    expect(parseCutoff(undefined)).toEqual({ hour: 19, minute: 0 });
    expect(() => parseCutoff('25:99')).toThrow('BOT_SESSION_CUTOFF');
  });

  it('works in ICT whatever the server zone', () => {
    expect(ictDate(new Date('2026-11-20T17:30:00Z'))).toBe('2026-11-21');
    expect(cutoffInstant('2026-11-20', { hour: 19, minute: 0 }).toISOString()).toBe(
      '2026-11-20T12:00:00.000Z',
    );
    expect(isAtOrAfterCutoff(ict('2026-11-20', '18:59'), { hour: 19, minute: 0 })).toBe(false);
    expect(isAtOrAfterCutoff(ict('2026-11-20', '19:00'), { hour: 19, minute: 0 })).toBe(true);
    expect(isGiveUpTime(ict('2026-11-20', '23:50'))).toBe(true);
    expect(isGiveUpTime(ict('2026-11-20', '22:00'))).toBe(false);
  });

  it('B09/B10: today before the cutoff, the next session after it, weekends and holidays skipped', () => {
    const calendar = botCalendar(STORE, ['2026-11-23']);
    const cutoff = { hour: 19, minute: 0 };
    expect(nextSessionAt(calendar, ict('2026-11-20', '10:00'), { cutoff })).toBe('2026-11-20');
    expect(nextSessionAt(calendar, ict('2026-11-20', '19:01'), { cutoff })).toBe('2026-11-24');
    expect(nextSessionAt(calendar, ict('2026-11-21', '09:00'), { cutoff })).toBe('2026-11-24');
    // B11: a locked today is never the next session, even before the cutoff.
    expect(
      nextSessionAt(calendar, ict('2026-11-20', '10:00'), { cutoff, todayLocked: true }),
    ).toBe('2026-11-24');
  });
});

describe('iqx-bot-v2.0 receipt', () => {
  const values = {
    session: '2026-11-20',
    strategy: {
      source: 'user' as const,
      id: 's1',
      version: 2,
      config_hash: 'a'.repeat(64),
      name: 'RSI',
      version_label: 'bản 20/11 10:00',
    },
    universe: { type: 'vn30' as const, label: 'VN30', count: 30, symbols_hash: 'b'.repeat(64) },
    fees: { buy_fee_bps: 15, sell_fee_bps: 15, sell_tax_bps: 10, lot_size: 100 },
    data_as_of: '2026-11-20',
    data_hash: 'c'.repeat(64),
    input_hash: 'd'.repeat(64),
  };

  it('pins policy, strategy version, basket, fees and input; any change breaks the hash', () => {
    const { snapshot, hash } = botV2Receipt(values);
    expect(snapshot).toMatchObject({ policy_version: 'iqx-bot-v2.0', ...values });
    expect(isV2Receipt(snapshot)).toBe(true);
    expect(isV2Receipt({ policy_version: 'iqx-bot-v1.1' })).toBe(false);
    expect(verifyV2Receipt(snapshot, hash)).toMatchObject({ valid: true });
    const tampered = { ...snapshot, strategy: { ...values.strategy, version: 3 } };
    expect(verifyV2Receipt(tampered, hash)).toEqual({ valid: false });
    expect(BOT_POLICY_V2.execution_model).toBe('same_session_close');
  });
});

describe('session summary (§10.4 Nhật ký)', () => {
  const sell = (symbol: string, exit: 'indicator' | 'max_holding') =>
    ({ symbol, exit_reason: exit }) as never;
  it('lists buys, sells with their reason and unfilled due positions', () => {
    expect(
      sessionSummary({
        buys: [{ symbol: 'FPT' }, { symbol: 'HPG' }] as never,
        sells: [sell('VNM', 'indicator'), sell('MWG', 'max_holding')],
        journal: [{ code: 'due_unfilled', symbol: 'ROS' }] as never,
      }),
    ).toBe(
      `Mua FPT, HPG · Bán VNM (${RULE_MESSAGES.exit_indicator}) · Bán MWG (${RULE_MESSAGES.exit_max_holding}) · 1 đến hạn chưa khớp (ROS tạm ngừng giao dịch)`,
    );
  });
  it('falls back to the session-level message', () => {
    const none = { buys: [], sells: [] };
    expect(sessionSummary({ ...none, journal: [{ code: 'no_strategy', symbol: null }] as never })).toBe(
      RULE_MESSAGES.no_strategy,
    );
    expect(sessionSummary({ ...none, journal: [] })).toBe(RULE_MESSAGES.no_orders);
  });
});

describe('conversion planning (§11, PLAN §5.2)', () => {
  const v3 = (mutate: (indicators: Record<string, any>) => void, extra: Record<string, unknown> = {}) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const indicators = structuredClone(defaultConfig().indicators) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    mutate(indicators);
    return { schema_version: SCHEMA_VERSION, rule_version: RULE_VERSION, indicators, ...extra };
  };
  const enable = (side: 'buy' | 'sell' | 'both') => (indicators: Record<string, any>) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const rsi = indicators.rsi;
    rsi.master_enabled = true;
    if (side !== 'sell') rsi.buy.enabled = true;
    if (side !== 'buy') rsi.sell.enabled = true;
  };

  it('M01: groups by usable rows; outdated pre-V3 revisions are "no rows"', () => {
    const universe = { type: 'vn30' as const };
    expect(contentFrom(v3(enable('both')), universe)).toMatchObject({ buy: true, sell: true });
    const sellOnly = contentFrom(v3(enable('sell')), universe);
    expect(sellOnly).toMatchObject({ buy: false, sell: true });
    expect(sellOnly?.content.sell_only).toBe(true);
    expect(contentFrom(v3(() => undefined), universe)).toBeNull();
    expect(isOutdatedConfig({ schema_version: '3', rule_version: 'iqx-rules-4.0' })).toBe(true);
    expect(contentFrom({ schema_version: '1', indicators: {} }, universe)).toBeNull();
  });

  it('D17: Giữ tối đa kept (1–2 → 3), else 30', () => {
    expect(convertedMaxHolding({ max_holding: 12 })).toEqual({ value: 12, kept: true });
    expect(convertedMaxHolding({ max_holding: 1 })).toEqual({ value: 3, kept: true });
    expect(convertedMaxHolding({})).toEqual({ value: 30, kept: false });
    const content = contentFrom(v3(enable('both'), { max_holding: 2 }), { type: 'vn30' });
    expect(content?.content.max_holding).toBe(3);
  });

  it('M02: P is the first session after today; anchored at P nothing is due before P+30', () => {
    const trading = (date: string) => ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
    expect(firstSessionAfter('2026-11-20', trading)).toBe('2026-11-23');
    expect(firstSessionAfter('2026-11-19', trading)).toBe('2026-11-20');
    const entry = '2026-07-01';
    const p = '2026-11-23';
    expect(countTradingSessions(entry, p, trading)).toBeGreaterThanOrEqual(80);
    expect(countTradingSessions(p, p, trading)).toBe(0);
    const due = addTradingSessions(p, 30, trading);
    expect(countTradingSessions(p, due, trading)).toBe(30);
    expect(addTradingSessions('2026-11-20', 2, trading)).toBe('2026-11-24');
  });

  it('M05 safety: dry-run by default, --apply needs approval and the Bot job off', () => {
    expect(parseArgs([])).toEqual({ apply: false, json: false, userId: null });
    expect(() => parseArgs(['--user', 'x'])).toThrow('--user requires a user UUID');
    const url = 'postgresql://u:p@localhost:5432/iqx_v2_w3';
    expect(requireSafeTarget(false, { DATABASE_URL: url })).toBe(url);
    expect(() => requireSafeTarget(false, { DATABASE_URL: url.replace('iqx_v2_w3', 'prod') })).toThrow(
      'iqx_v2_',
    );
    expect(() => requireSafeTarget(true, { DATABASE_URL: url })).toThrow(
      'BOT_STRATEGY_V2_CONVERSION_APPROVED',
    );
    expect(() =>
      requireSafeTarget(true, { DATABASE_URL: url, BOT_STRATEGY_V2_CONVERSION_APPROVED: 'true' }),
    ).toThrow('JOB_BOT_SESSION_EOD_ENABLED');
    expect(
      requireSafeTarget(true, {
        DATABASE_URL: url,
        BOT_STRATEGY_V2_CONVERSION_APPROVED: 'true',
        JOB_BOT_SESSION_EOD_ENABLED: 'false',
      }),
    ).toBe(url);
    expect(inBotWindow(ict('2026-11-20', '18:45'))).toBe(true);
    expect(inBotWindow(ict('2026-11-20', '20:00'))).toBe(false);
  });
});
