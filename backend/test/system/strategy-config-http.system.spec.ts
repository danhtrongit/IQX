import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ACADEMY_GRANTS } from '../../src/modules/academy/academy.ports.js';
import { defaultConfig, type IndicatorConfig } from '../../src/modules/quant/v2/index.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The shared-config HTTP surface through the real guards and the API exception filter: the
 * config in force while a newer revision is pending, `cross_fields` in the registry, and the
 * 409 / 422 extras reaching the client in `error.details`.
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
      effective: { revision: 1, effective_session: '2020-01-02', legacy: null },
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

  it('E03 CONFIG_INVALID lists every error as { path, message } in error.details', async () => {
    const invalid = await patch({
      expected_revision: 2,
      idempotency_key: 'http-config-key-0004',
      indicators: {
        rsi: indicator('rsi', (value) => {
          value.buy.params.period = 999;
        }),
        macd: indicator('macd', (value) => {
          value.buy.params.fast = 26;
          value.buy.params.slow = 12; // violates fast < slow
        }),
      },
    });
    expect(invalid.statusCode).toBe(422);
    const { error } = invalid.json() as { error: { code: string; details: Json[] } };
    expect(error.code).toBe('CONFIG_INVALID');
    expect(error.details.map((detail) => detail.path)).toEqual(
      expect.arrayContaining([
        'indicators.rsi.buy.params.period',
        'indicators.macd.buy.params.fast',
      ]),
    );
    for (const detail of error.details) {
      expect(typeof detail.message).toBe('string');
    }

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

  it('E04 the registry exposes validation.cross_fields for macd and ma_cross', async () => {
    const response = await get('/api/v2/strategy/registry/technical');
    expect(response.statusCode).toBe(200);
    const indicators = (response.json() as { indicators: Json[] }).indicators;
    const crossFields = Object.fromEntries(
      indicators.map((item) => [item.id, item.validation.cross_fields]),
    );
    expect(crossFields.macd).toEqual([{ left: 'fast', op: '<', right: 'slow' }]);
    expect(crossFields.ma_cross).toEqual([{ left: 'fast', op: '<', right: 'slow' }]);
    expect(crossFields.rsi).toEqual([]);
    expect(Object.keys(crossFields)).toHaveLength(16);
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
