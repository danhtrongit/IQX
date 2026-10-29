import { afterEach, describe, expect, it } from 'vitest';

import {
  freeIdempotencyKey,
  inBotWindow,
  migratedConfig,
  botRunning,
  parseArgs,
  practiceDraftReset,
  repinnedVersion,
  requireSafeTarget,
} from '../../scripts/indicator-conditions-v3-migrate.js';
import { restoredConfig } from '../../scripts/indicator-conditions-v3-rollback.js';
import { definitionHash } from '../../src/modules/alerts/strategy-alerts.evaluation.js';
import {
  defaultConfigV4,
  isCurrentFormat,
  type RowSideConfig,
} from '../../src/modules/quant/v2/index.js';
import { preV3Config } from './helpers/strategy-pre-v3.js';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('indicator conditions V3 migration: arguments and safety', () => {
  it('is a dry run unless --apply, and needs the approval variable to write', () => {
    expect(parseArgs([])).toEqual({ apply: false, json: false, userId: null });
    expect(parseArgs(['--apply', '--json'])).toMatchObject({ apply: true, json: true });
    expect(() => parseArgs(['--user', 'nope'])).toThrow('--user requires a user UUID');
    expect(() => parseArgs(['--force'])).toThrow('Unknown argument');

    process.env.DATABASE_URL = 'postgresql://localhost/iqx_v2_local';
    delete process.env.INDICATOR_V3_MIGRATION_APPROVED;
    expect(requireSafeTarget(false)).toBe('postgresql://localhost/iqx_v2_local');
    expect(() => requireSafeTarget(true)).toThrow('INDICATOR_V3_MIGRATION_APPROVED=true');
    process.env.INDICATOR_V3_MIGRATION_APPROVED = 'true';
    expect(requireSafeTarget(true)).toBe('postgresql://localhost/iqx_v2_local');
    expect(() => requireSafeTarget(true, 'INDICATOR_V3_ROLLBACK_APPROVED')).toThrow(
      'INDICATOR_V3_ROLLBACK_APPROVED=true',
    );
    process.env.DATABASE_URL = 'postgresql://localhost/iqx';
    expect(() => requireSafeTarget(false)).toThrow('iqx_v2_*');
  });

  it.each([
    ['2026-10-29T11:29:59Z', false],
    ['2026-10-29T11:30:00Z', true],
    ['2026-10-29T12:00:00Z', true],
    ['2026-10-29T12:39:59Z', true],
    ['2026-10-29T12:40:00Z', false],
    ['2026-10-29T03:00:00Z', false],
  ])('Bot window 18:30-19:40 ICT at %s → %s', (instant, inside) => {
    expect(inBotWindow(new Date(instant))).toBe(inside);
  });
});

describe('indicator conditions V3 migration: builders', () => {
  it('rebuilds a pre-V3 document as the V3 defaults keeping the switches', () => {
    const stored = preV3Config(3);
    const indicators = stored.indicators as Record<string, Record<string, unknown>>;
    indicators.rsi = { ...indicators.rsi, master_enabled: true }; // both tabs OFF
    const { config, errors } = migratedConfig(stored, 4);
    expect(errors).toEqual([]);
    expect(isCurrentFormat(config)).toBe(true);
    expect(config.revision).toBe(4);
    const defaults = defaultConfigV4();
    expect(config.indicators.ma).toEqual({
      master_enabled: true,
      buy: { ...defaults.indicators.ma!.buy, enabled: true },
      sell: { ...defaults.indicators.ma!.sell, enabled: true },
    });
    expect((config.indicators.ma!.sell as RowSideConfig).rules[0]).toMatchObject({
      op: 'cross_down',
    });
    expect(config.indicators.rsi!.master_enabled).toBe(false);
  });

  it('counts a Bot as running only when active, with an instance and active conditions', () => {
    const on = preV3Config(1);
    const off = { ...preV3Config(1), indicators: {} };
    const active = { status: 'active', has_instance: true };
    expect(botRunning(active, [off, on])).toBe(true);
    expect(botRunning(active, [off, undefined])).toBe(false);
    expect(botRunning({ status: 'suspended', has_instance: true }, [on])).toBe(false);
    expect(botRunning({ status: 'active', has_instance: false }, [on])).toBe(false);
    expect(botRunning(null, [on])).toBe(false);
  });

  it('resets a pre-V3 Luyện tập draft keeping its switches and hold, and leaves V3 drafts', () => {
    const reset = practiceDraftReset('rsi', {
      buy: { enabled: false, params: { period: 9 }, ops: { r1: '<' } },
      sell: { enabled: true, params: { period: 9 }, ops: { r1: '>' } },
      hold_max_sessions: 7,
    });
    expect(reset).toMatchObject({
      buy: { enabled: false },
      sell: { enabled: true },
      hold_max_sessions: 7,
    });
    expect((reset!.buy as { rules: Array<{ id: string }> }).rules.map((row) => row.id)).toEqual([
      'rsi.level',
      'rsi.trend',
    ]);
    expect(practiceDraftReset('rsi', reset)).toBeNull();
    expect(practiceDraftReset('volume', practiceDraftReset('volume', {}))).toBeNull();
    expect(practiceDraftReset('unknown', {})).toBeNull();
  });

  it('pins an alert version to a revision with the service hashes', () => {
    const config = { ...defaultConfigV4(), revision: 5 };
    const savedAt = new Date('2026-10-29T03:00:00Z');
    const scope = { kind: 'saved_list', list_id: 'l-1', list_name: 'VN30', list_version: 1 };
    const version = repinnedVersion(
      { scope, symbols: ['VNM', 'FPT'], sides: ['sell', 'buy', 'buy'] },
      { revision: 5, config, config_hash: 'c'.repeat(64), saved_at: savedAt },
    );
    expect(version).toMatchObject({
      source: {
        kind: 'shared_config',
        revision: 5,
        saved_at: savedAt.toISOString(),
        stored_config_hash: 'c'.repeat(64),
      },
      config_hash: 'c'.repeat(64),
      scope,
      symbols: ['VNM', 'FPT'],
      sides: ['buy', 'sell'],
      rule_version: 'iqx-rules-4.0',
      schema_version: '3.0',
    });
    expect(version.definition_hash).toBe(
      definitionHash({
        config_hash: 'c'.repeat(64),
        symbols: ['FPT', 'VNM'],
        sides: ['buy', 'sell'],
        scope: { kind: 'saved_list', list_id: 'l-1' },
      }),
    );
  });

  it('picks a free idempotency key across migrate/rollback cycles', () => {
    expect(freeIdempotencyKey('k', new Set())).toBe('k');
    expect(freeIdempotencyKey('k', new Set(['k']))).toBe('k:2');
    expect(freeIdempotencyKey('k', new Set(['k', 'k:2']))).toBe('k:3');
  });

  it('rollback copies the pre-V3 document with the new revision number', () => {
    const stored = preV3Config(1);
    const copy = restoredConfig(stored, 7);
    expect(copy).toEqual({ ...stored, revision: 7 });
    expect(stored.revision).toBe(1);
  });
});
