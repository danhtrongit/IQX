import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ACADEMY_GRANTS } from '../../src/modules/academy/academy.ports.js';
import {
  defaultConfig,
  type IndicatorConfig,
  type ParamsSideConfig,
  type RowSideConfig,
} from '../../src/modules/quant/v2/index.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The shared-config HTTP surface through the real guards and the API exception filter: the
 * config in force while a newer revision is pending, the condition rows in the registry, the
 * 409 / 422 extras reaching the client in `error.details`, and SPEC V3 §6 (old format refused,
 * outdated revision read as the new defaults, saving resumes a Bot paused by the upgrade).
 */
describe('system acceptance: shared-config effective read and error details (HTTP)', () => {
  let stack: SystemStack;
  let user: Awaited<ReturnType<typeof registerAndLogin>>;

  beforeAll(async () => {
    stack = await startSystemStack(
      { STRATEGY_V2_ENABLED: 'true' },
      {
        overrideProviders: [
          {
            token: ACADEMY_GRANTS,
            value: {
              grantedCapabilities: async () => new Set(['indicator:rsi', 'indicator:macd']),
            },
          },
        ],
      },
    );
    // Registration grants the 7-day trial, which is what the Premium guard checks.
    user = await registerAndLogin(stack.app, 'shared-config-http');
  });

  afterAll(async () => {
    await stack?.close();
  });

  const get = (url: string) =>
    stack.app.inject({ method: 'GET', url, headers: authHeader(user.accessToken) });
  const patch = (payload: Json) =>
    stack.app.inject({
      method: 'PATCH',
      url: '/api/v2/strategy/shared-config',
      headers: authHeader(user.accessToken),
      payload,
    });

  function indicator(id: string, mutate: (value: IndicatorConfig) => void = () => undefined) {
    const value = structuredClone(defaultConfig().indicators[id]!);
    value.master_enabled = true;
    value.buy.enabled = true;
    mutate(value);
    return value;
  }

  /** Condition rows of a tab of a row-based indicator. */
  const rows = (side: IndicatorConfig['buy']) => (side as RowSideConfig).rules;

  it('E01 returns the config in force in `effective` while a newer revision is pending', async () => {
    const empty = (await get('/api/v2/strategy/shared-config')).json() as Json;
    expect(empty).toMatchObject({ saved_revision: 0, effective_revision: null, effective: null });

    const first = await patch({
      expected_revision: 0,
      idempotency_key: 'http-config-key-0001',
      indicators: { rsi: indicator('rsi') },
    });
    expect(first.statusCode).toBe(200);
    // Saved today: pending until its effective session, so nothing is in force yet.
    const pending = (await get('/api/v2/strategy/shared-config')).json() as Json;
    expect(pending).toMatchObject({ saved_revision: 1, effective_revision: null, effective: null });

    // Revision 1 starts (its session is in the past), then revision 2 is saved and pends.
    await stack.query(
      `update effective_config_sessions set effective_session = '2020-01-02', status = 'effective'
        where user_id = $1 and revision = 1`,
      [user.id],
    );
    const second = await patch({
      expected_revision: 1,
      idempotency_key: 'http-config-key-0002',
      indicators: { macd: indicator('macd') },
    });
    expect(second.statusCode).toBe(200);

    const state = (await get('/api/v2/strategy/shared-config')).json() as Json;
    expect(state).toMatchObject({
      saved_revision: 2,
      effective_revision: 1,
      status: 'pending',
      outdated: false,
      effective: { revision: 1, effective_session: '2020-01-02', outdated: false, legacy: null },
    });
    expect(state.config.indicators.macd.master_enabled).toBe(true); // what the form edits
    expect(state.effective.config.indicators.macd.master_enabled).toBe(false); // what the Bot uses
    expect(state.effective.config.indicators.rsi.master_enabled).toBe(true);
    expect(state.effective.config_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.effective.config.revision).toBe(1);
  });

  it('E02 a stale expected_revision is 409 with current_revision in error.details[0]', async () => {
    const stale = await patch({
      expected_revision: 1,
      idempotency_key: 'http-config-key-0003',
      indicators: { rsi: indicator('rsi') },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toMatchObject({
      code: 'REVISION_CONFLICT',
      details: [{ field: 'expected_revision', current_revision: 2 }],
    });
  });

  it('E03 CONFIG_INVALID lists every per-row error (path, message, side, row) in error.details', async () => {
    const invalid = await patch({
      expected_revision: 2,
      idempotency_key: 'http-config-key-0004',
      indicators: {
        rsi: indicator('rsi', (value) => {
          rows(value.buy)[1]!.period = 999;
        }),
        macd: indicator('macd', (value) => {
          rows(value.sell)[0]!.fast = 26;
          rows(value.sell)[0]!.slow = 12; // violates fast < slow, on the Bán tab
        }),
      },
    });
    expect(invalid.statusCode).toBe(422);
    const { error } = invalid.json() as { error: { code: string; details: Json[] } };
    expect(error.code).toBe('CONFIG_INVALID');
    expect(error.details).toEqual([
      {
        path: 'indicators.rsi.buy.rules.1.period',
        message: 'Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.',
        side: 'buy',
        row: 2,
      },
      {
        path: 'indicators.macd.sell.rules.0.fast',
        message: 'Bán · dòng 1: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm.',
        side: 'sell',
        row: 1,
      },
    ]);

    const unknown = await patch({
      expected_revision: 2,
      idempotency_key: 'http-config-key-0005',
      indicators: { nope: indicator('rsi') },
    });
    expect(unknown.statusCode).toBe(422);
    expect(unknown.json().error.details).toEqual([
      { path: 'indicators.nope', message: 'Chỉ báo không được hỗ trợ: nope.' },
    ]);
    // Nothing was saved by the rejected requests.
    expect(((await get('/api/v2/strategy/shared-config')).json() as Json).saved_revision).toBe(2);
  });

  it('E04 the registry exposes the condition rows of the 15 and the params model of Volume', async () => {
    const response = await get('/api/v2/strategy/registry/technical');
    expect(response.statusCode).toBe(200);
    const body = response.json() as { rule_version: string; indicators: Json[] };
    expect(body.rule_version).toBe('iqx-rules-4.0');
    expect(body.indicators).toHaveLength(16);
    const byId = new Map(body.indicators.map((item) => [item.id as string, item]));
    expect(body.indicators.filter((item) => item.model === 'rows')).toHaveLength(15);
    expect(byId.get('rsi')!.rows).toEqual([
      expect.objectContaining({
        id: 'rsi.level',
        sentence: 'RSI {period} {op} {threshold}',
        default_enabled: true,
        constraints: [],
        buy: { period: 14, op: '<', threshold: 30 },
        sell: { period: 14, op: '>', threshold: 70 },
      }),
      expect.objectContaining({ id: 'rsi.trend', sentence: 'RSI {period} xu hướng {dir}' }),
    ]);
    expect(byId.get('macd')!.rows[0].constraints).toEqual([
      { left: 'fast', op: '<', right: 'slow' },
    ]);
    expect(byId.get('ma')!.rows[0].fields).toContainEqual(
      expect.objectContaining({ key: 'period', options: [5, 10, 20, 50, 100, 200] }),
    );
    expect(byId.get('rsi')).not.toHaveProperty('fields');
    expect(byId.get('volume')).toMatchObject({
      model: 'legacy_params',
      validation: { cross_fields: [] },
    });
    const volume = defaultConfig().indicators.volume!.buy as ParamsSideConfig;
    expect(byId.get('volume')!.buy.params).toEqual(volume.params);
  });

  it('E06 refuses the old side-level params format of the 15 with 422 (never mapped)', async () => {
    const old = await patch({
      expected_revision: 2,
      idempotency_key: 'http-config-key-0006',
      indicators: {
        rsi: {
          master_enabled: true,
          buy: { enabled: true, params: { period: 14, level: 30 }, rules: [] },
          sell: { enabled: false, params: { period: 14, level: 70 }, rules: [] },
        },
      },
    });
    expect(old.statusCode).toBe(422);
    expect(old.json().error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [
        {
          path: ['indicators', 'rsi'],
          message:
            'Định dạng điều kiện cũ không còn được hỗ trợ. Tải lại để dùng mẫu điều kiện mới.',
        },
      ],
    });
    expect(((await get('/api/v2/strategy/shared-config')).json() as Json).saved_revision).toBe(2);
  });

  it('E07 reads an outdated revision as the V3 defaults; saving resumes the paused Bot', async () => {
    const owner = await registerAndLogin(stack.app, 'shared-config-v3');
    const as = (method: 'GET' | 'PATCH', url: string, payload?: Json) =>
      stack.app.inject({ method, url, headers: authHeader(owner.accessToken), payload });
    // A SPEC V2 (`iqx-rules-3.0`) document as the migration would find it, in force since 2020.
    const v2 = {
      schema_version: '2.0',
      revision: 1,
      rule_version: 'iqx-rules-3.0',
      indicators: {
        rsi: {
          master_enabled: true,
          buy: { enabled: true, params: { period: 9, level: 25 }, rules: [] },
          sell: { enabled: false, params: { period: 9, level: 75 }, rules: [] },
        },
      },
    };
    await stack.query(
      `insert into shared_config_revisions
         (user_id, revision, schema_version, rule_version, calculation_version, config,
          config_hash, patch, requested_at, actor_id, idempotency_key)
       values ($1, 1, '2.0', 'iqx-rules-3.0', 'iqx-ta-2.0', $2::jsonb, $3, '{}'::jsonb, now(),
               $1, 'seeded-v2-0001')`,
      [owner.id, JSON.stringify(v2), 'b'.repeat(64)],
    );
    await stack.query(
      `insert into effective_config_sessions (user_id, revision, effective_session, status)
       values ($1, 1, '2020-01-02', 'effective')`,
      [owner.id],
    );
    await stack.query(
      `insert into bot_config_pauses (user_id, reason, paused_revision)
       values ($1, 'indicator_conditions_v3', 1)`,
      [owner.id],
    );

    const state = (await as('GET', '/api/v2/strategy/shared-config')).json() as Json;
    expect(state).toMatchObject({
      saved_revision: 1,
      outdated: true,
      config_hash: 'b'.repeat(64),
      legacy: { from_rule_version: 'iqx-rules-3.0', reset: true, needs_review: true },
      effective: { revision: 1, outdated: true },
    });
    expect(state.config.rule_version).toBe('iqx-rules-4.0');
    expect(state.config.indicators.rsi).toEqual({
      ...defaultConfig().indicators.rsi,
      master_enabled: true,
      buy: { ...defaultConfig().indicators.rsi!.buy, enabled: true },
    });
    const listed = (await as('GET', '/api/v2/strategy/shared-config/revisions')).json() as Json[];
    expect(listed).toMatchObject([{ revision: 1, legacy: true, outdated: true }]);

    const saved = await as('PATCH', '/api/v2/strategy/shared-config', {
      expected_revision: 1,
      idempotency_key: 'http-config-v3-0001',
      indicators: { rsi: state.config.indicators.rsi },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ revision: 2 });
    const pauses = await stack.query<{ resume_revision: number; resumed_at: Date | null }>(
      'select resume_revision, resumed_at from bot_config_pauses where user_id = $1',
      [owner.id],
    );
    expect(pauses).toHaveLength(1);
    expect(pauses[0]!.resume_revision).toBe(2);
    expect(pauses[0]!.resumed_at).not.toBeNull();
    const after = (await as('GET', '/api/v2/strategy/shared-config')).json() as Json;
    expect(after).toMatchObject({ saved_revision: 2, outdated: false, legacy: null });

    // A later save never moves the resolved pause.
    await as('PATCH', '/api/v2/strategy/shared-config', {
      expected_revision: 2,
      idempotency_key: 'http-config-v3-0002',
      indicators: {
        rsi: {
          ...state.config.indicators.rsi,
          sell: { ...state.config.indicators.rsi.sell, enabled: true },
        },
      },
    });
    const still = await stack.query<{ resume_revision: number }>(
      'select resume_revision from bot_config_pauses where user_id = $1',
      [owner.id],
    );
    expect(still[0]!.resume_revision).toBe(2);
  });

  it('E05 keeps the Premium and feature guards as they were', async () => {
    const anonymous = await stack.app.inject({
      method: 'GET',
      url: '/api/v2/strategy/shared-config',
    });
    expect(anonymous.statusCode).toBe(401);
    const free = await registerAndLogin(stack.app, 'shared-config-free');
    await stack.query(
      `update billing_entitlement_grants
          set starts_at = now() - interval '9 days', ends_at = now() - interval '1 minute',
              original_ends_at = now() - interval '1 minute'
        where user_id = $1`,
      [free.id],
    );
    const denied = await stack.app.inject({
      method: 'GET',
      url: '/api/v2/strategy/shared-config',
      headers: authHeader(free.accessToken),
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('PREMIUM_REQUIRED');
  });
});
