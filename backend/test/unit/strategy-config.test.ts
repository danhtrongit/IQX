import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AcademyGrantsPort } from '../../src/modules/academy/academy.ports.js';
import { activeSideIndicators } from '../../src/modules/bots/bot.shared-config.js';
import {
  configHash,
  defaultConfig,
  loadTechnicalRegistry,
  type IndicatorConfig,
} from '../../src/modules/quant/v2/index.js';
import { StrategyConfigEnabledGuard } from '../../src/modules/strategy-config/strategy-config-enabled.guard.js';
import {
  effectiveStatus,
  nextEffectiveSession,
  tradingDayPredicate,
  vnDate,
  type IsTradingDay,
} from '../../src/modules/strategy-config/strategy-config.calendar.js';
import {
  SharedConfigSqlStore,
  type NewEffectiveSession,
  type NewRevision,
  type RevisionRow,
  type SharedConfigStore,
  type SharedConfigStoreProvider,
} from '../../src/modules/strategy-config/strategy-config.repository.js';
import { sharedConfigPatchSchema } from '../../src/modules/strategy-config/strategy-config.schemas.js';
import type { SharedConfigPatchInput } from '../../src/modules/strategy-config/strategy-config.schemas.js';
import {
  SharedConfigService,
  mergeIndicatorPatch,
} from '../../src/modules/strategy-config/strategy-config.service.js';
import type { Environment } from '../../src/platform/config/environment.js';

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER_USER = '00000000-0000-4000-8000-000000000002';

type StoredRevision = Omit<RevisionRow, 'effective_session' | 'session_status'>;

/** In-memory store; transactions are serialized (advisory lock) and roll back on error. */
class MemorySharedConfig implements SharedConfigStoreProvider, SharedConfigStore {
  revisions: StoredRevision[] = [];
  sessions: NewEffectiveSession[] = [];
  calendar: { holidays: unknown } | null = { holidays: '[]' };
  private queue: Promise<unknown> = Promise.resolve();

  store(): SharedConfigStore {
    return this;
  }

  transaction<T>(operation: (store: SharedConfigStore) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const snapshot = structuredClone({ revisions: this.revisions, sessions: this.sessions });
      try {
        return await operation(this);
      } catch (error) {
        Object.assign(this, snapshot);
        throw error;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async lockOwner() {
    await Promise.resolve();
  }

  private joined(row: StoredRevision | undefined): RevisionRow | null {
    if (!row) return null;
    const session = this.sessions.find(
      (item) => item.user_id === row.user_id && item.revision === row.revision,
    );
    return structuredClone({
      ...row,
      effective_session: session?.effective_session ?? null,
      session_status: session?.status ?? 'calendar_unavailable',
    });
  }

  private owned(userId: string) {
    return this.revisions
      .filter((row) => row.user_id === userId)
      .sort((a, b) => b.revision - a.revision);
  }

  async latestRevision(userId: string) {
    await Promise.resolve();
    return this.joined(this.owned(userId)[0]);
  }

  async revision(userId: string, revision: number) {
    await Promise.resolve();
    return this.joined(this.owned(userId).find((row) => row.revision === revision));
  }

  async revisionByIdempotencyKey(userId: string, key: string) {
    await Promise.resolve();
    return this.joined(this.owned(userId).find((row) => row.idempotency_key === key));
  }

  async effectiveRevision(userId: string, sessionDate: string) {
    await Promise.resolve();
    const rows = this.owned(userId).map((row) => this.joined(row)!);
    return (
      rows.find(
        (row) =>
          row.session_status !== 'calendar_unavailable' &&
          row.effective_session !== null &&
          row.effective_session <= sessionDate,
      ) ?? null
    );
  }

  async listRevisions(userId: string, limit: number) {
    await Promise.resolve();
    return this.owned(userId)
      .slice(0, limit)
      .map((row) => this.joined(row)!);
  }

  async insertRevision(revision: NewRevision) {
    await Promise.resolve();
    if (
      this.revisions.some(
        (row) =>
          row.user_id === revision.user_id &&
          (row.revision === revision.revision || row.idempotency_key === revision.idempotency_key),
      )
    )
      throw new Error('unique violation');
    const savedAt = new Date();
    this.revisions.push({
      user_id: revision.user_id,
      revision: revision.revision,
      config: structuredClone(revision.config),
      config_hash: revision.config_hash,
      before_hash: revision.before_hash,
      patch: structuredClone(revision.patch),
      requested_at: revision.requested_at,
      saved_at: savedAt,
      actor_id: revision.actor_id,
      idempotency_key: revision.idempotency_key,
    });
    return { saved_at: savedAt };
  }

  async insertEffectiveSession(session: NewEffectiveSession) {
    await Promise.resolve();
    this.sessions.push({ ...session });
  }

  async activeCalendar() {
    await Promise.resolve();
    return this.calendar;
  }
}

class FakeGrants implements AcademyGrantsPort {
  constructor(public capabilities: string[] = []) {}
  async grantedCapabilities() {
    await Promise.resolve();
    return new Set(this.capabilities);
  }
}

const registry = loadTechnicalRegistry();
const defaults = () => defaultConfig(registry);
const indicator = (id: string): IndicatorConfig => structuredClone(defaults().indicators[id]!);
const on = (id: string, patch: Partial<IndicatorConfig> = {}): IndicatorConfig => ({
  ...indicator(id),
  master_enabled: true,
  ...patch,
});

/** Weekdays only, minus the listed holidays. */
const weekdays =
  (holidays: string[] = []): IsTradingDay =>
  (date) => {
    const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    return day !== 0 && day !== 6 && !holidays.includes(date);
  };

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as { getStatus(): number; getResponse(): Record<string, unknown> };
  }
  throw new Error('expected rejection');
}

describe('strategy-config calendar', () => {
  it('formats the save date in Asia/Ho_Chi_Minh', () => {
    expect(vnDate(new Date('2025-01-06T16:30:00Z'))).toBe('2025-01-06'); // Mon 23:30 VN
    expect(vnDate(new Date('2025-01-06T17:30:00Z'))).toBe('2025-01-07'); // Tue 00:30 VN
  });

  it('applies from the first trading session after the VN save date (never +24h)', () => {
    const isTradingDay = weekdays();
    // Friday 10:00 VN -> Monday.
    expect(nextEffectiveSession(new Date('2025-01-03T03:00:00Z'), isTradingDay)).toBe('2025-01-06');
    // Friday before a Monday holiday -> Tuesday.
    expect(nextEffectiveSession(new Date('2025-01-03T03:00:00Z'), weekdays(['2025-01-06']))).toBe(
      '2025-01-07',
    );
    // Monday 23:30 VN (16:30Z) -> Tuesday.
    expect(nextEffectiveSession(new Date('2025-01-06T16:30:00Z'), isTradingDay)).toBe('2025-01-07');
    // Tuesday 00:30 VN (Monday 17:30Z) -> Wednesday, not Tuesday.
    expect(nextEffectiveSession(new Date('2025-01-06T17:30:00Z'), isTradingDay)).toBe('2025-01-08');
    // Saturday save -> Monday (not Sunday = save + 24h).
    expect(nextEffectiveSession(new Date('2025-01-04T05:00:00Z'), isTradingDay)).toBe('2025-01-06');
  });

  it('returns null when no session exists within the search bound', () => {
    expect(nextEffectiveSession(new Date('2025-01-03T03:00:00Z'), () => false)).toBeNull();
  });

  it('reads the active calendar row like DomainRuntime.isTradingDay', () => {
    expect(tradingDayPredicate(null)).toBeNull();
    expect(tradingDayPredicate({ holidays: 'not json' })).toBeNull();
    expect(tradingDayPredicate({ holidays: '{"a":1}' })).toBeNull();
    const noHolidays = tradingDayPredicate({ holidays: null })!;
    expect(noHolidays('2025-01-06')).toBe(true);
    expect(noHolidays('2025-01-05')).toBe(false);
    const withHoliday = tradingDayPredicate({ holidays: '["2025-01-06"]' })!;
    expect(withHoliday('2025-01-06')).toBe(false);
    expect(withHoliday('2025-01-07')).toBe(true);
    expect(tradingDayPredicate({ holidays: ['2025-01-07'] })!('2025-01-07')).toBe(false);
  });

  it('reports pending until the VN date reaches the effective session', () => {
    expect(effectiveStatus('2025-01-07', new Date('2025-01-06T16:59:00Z'))).toBe('pending');
    expect(effectiveStatus('2025-01-07', new Date('2025-01-06T17:00:00Z'))).toBe('effective');
    expect(effectiveStatus(null, new Date())).toBe('calendar_unavailable');
  });
});

describe('strategy-config patch merge', () => {
  it('keeps untouched indicators and copies each side independently', () => {
    const base = defaults();
    const rsi = on('rsi');
    rsi.buy.params.period = 21;
    const merged = mergeIndicatorPatch(base, { rsi });
    expect(merged.indicators.rsi!.buy.params.period).toBe(21);
    expect(merged.indicators.rsi!.sell.params.period).toBe(base.indicators.rsi!.sell.params.period);
    expect(merged.indicators.macd).toEqual(base.indicators.macd);
    expect(base.indicators.rsi!.master_enabled).toBe(false);
  });
});

describe('SharedConfigService', () => {
  let memory: MemorySharedConfig;
  let grants: FakeGrants;
  let service: SharedConfigService;

  const patch = (
    indicators: Record<string, IndicatorConfig>,
    expected_revision: number,
    idempotency_key = `key-${Math.random().toString(36).slice(2)}`,
  ) => sharedConfigPatchSchema.parse({ expected_revision, idempotency_key, indicators });

  beforeEach(() => {
    vi.useFakeTimers();
    // Friday 2025-01-03 10:00 VN.
    vi.setSystemTime(new Date('2025-01-03T03:00:00Z'));
    memory = new MemorySharedConfig();
    grants = new FakeGrants(['indicator:rsi', 'indicator:macd', 'lesson:ch02-l01']);
    service = new SharedConfigService(memory, grants);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns revision 0 with the registry default when never saved', async () => {
    const state = await service.current(USER);
    expect(state.saved_revision).toBe(0);
    expect(state.effective_revision).toBeNull();
    expect(state.effective_session).toBeNull();
    expect(state.config).toEqual(defaults());
    expect(state.config_hash).toBe(configHash(defaults()));
    expect(state.registry_version).toBe('iqx-ta-2.0');
    expect(state.granted_indicators).toEqual(['rsi', 'macd']);
  });

  it('lists the technical registry with per-user learned flags and no internals', async () => {
    const response = await service.technicalRegistry(USER);
    expect(response.calculation_version).toBe('iqx-ta-2.0');
    expect(response.indicators).toHaveLength(registry.length);
    const byId = new Map(response.indicators.map((item) => [item.id, item]));
    expect(byId.get('rsi')!.learned).toBe(true);
    expect(byId.get('ma')!.learned).toBe(false);
    expect(byId.get('rsi')).not.toHaveProperty('seed_and_missing');
    expect(byId.get('rsi')).not.toHaveProperty('validation');
  });

  it('saves a revision with audit fields and a pending effective session', async () => {
    const result = await service.save(USER, patch({ rsi: on('rsi') }, 0));
    expect(result.revision).toBe(1);
    expect(result.config.revision).toBe(1);
    expect(result.config.indicators.rsi!.master_enabled).toBe(true);
    expect(result.config_hash).toBe(configHash(result.config));
    expect(result.effective_session).toBe('2025-01-06');
    expect(result.status).toBe('pending');

    const stored = memory.revisions[0]!;
    expect(stored.actor_id).toBe(USER);
    expect(stored.requested_at).toEqual(new Date('2025-01-03T03:00:00Z'));
    expect(stored.before_hash).toBe(configHash(defaults()));
    expect(Object.keys(stored.patch)).toEqual(['rsi']);
    expect(memory.sessions).toEqual([
      { user_id: USER, revision: 1, effective_session: '2025-01-06', status: 'pending' },
    ]);

    const second = await service.save(USER, patch({ macd: on('macd') }, 1));
    expect(memory.revisions[1]!.before_hash).toBe(result.config_hash);
    expect(second.revision).toBe(2);
  });

  it('rejects a stale expected_revision with 409 and writes nothing', async () => {
    await service.save(USER, patch({ rsi: on('rsi') }, 0));
    const error = await rejection(service.save(USER, patch({ macd: on('macd') }, 0)));
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'REVISION_CONFLICT', current_revision: 1 });
    expect(memory.revisions).toHaveLength(1);
    expect(memory.sessions).toHaveLength(1);
  });

  it('replays the stored result for the same idempotency key, even after later revisions', async () => {
    const first = await service.save(USER, patch({ rsi: on('rsi') }, 0, 'idem-key-0001'));
    await service.save(USER, patch({ macd: on('macd') }, 1));
    const replay = await service.save(USER, patch({ rsi: on('rsi') }, 0, 'idem-key-0001'));
    expect(replay).toEqual(first);
    expect(memory.revisions).toHaveLength(2);
  });

  it('rejects an idempotency key reused with a different payload', async () => {
    await service.save(USER, patch({ rsi: on('rsi') }, 0, 'idem-key-0002'));
    const error = await rejection(
      service.save(USER, patch({ macd: on('macd') }, 1, 'idem-key-0002')),
    );
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(memory.revisions).toHaveLength(1);
  });

  it('partial patch preserves untouched indicators', async () => {
    const rsi = on('rsi');
    rsi.sell.params.level = 75;
    await service.save(USER, patch({ rsi }, 0));
    const result = await service.save(USER, patch({ macd: on('macd') }, 1));
    expect(result.config.indicators.rsi).toEqual(rsi);
    expect(result.config.indicators.macd!.master_enabled).toBe(true);
    expect(result.config.indicators.ma).toEqual(defaults().indicators.ma);
  });

  it('turning both children off on a master-ON indicator saves master OFF', async () => {
    await service.save(USER, patch({ rsi: on('rsi') }, 0));
    const rsi = on('rsi');
    rsi.buy.enabled = false;
    rsi.sell.enabled = false;
    rsi.buy.params.period = 9;
    const result = await service.save(USER, patch({ rsi }, 1));
    expect(result.config.indicators.rsi!.master_enabled).toBe(false);
    expect(result.config.indicators.rsi!.buy).toEqual(rsi.buy);
    expect(result.config.indicators.rsi!.sell).toEqual(rsi.sell);
  });

  it('master OFF keeps child settings', async () => {
    const rsi = indicator('rsi');
    rsi.buy.params.period = 30;
    rsi.sell.enabled = false;
    const result = await service.save(USER, patch({ rsi }, 0));
    expect(result.config.indicators.rsi).toEqual(rsi);
  });

  it('turning master ON with both children OFF from master OFF is 422 SIDE_REQUIRED', async () => {
    const rsi = on('rsi');
    rsi.buy.enabled = false;
    rsi.sell.enabled = false;
    const error = await rejection(service.save(USER, patch({ rsi }, 0)));
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toMatchObject({ code: 'SIDE_REQUIRED', indicator: 'rsi' });
    expect(memory.revisions).toHaveLength(0);
  });

  it('enabling an unlearned indicator is 403 CAPABILITY_LOCKED', async () => {
    const error = await rejection(service.save(USER, patch({ ma: on('ma') }, 0)));
    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({
      code: 'CAPABILITY_LOCKED',
      capability: 'indicator:ma',
      reason: 'not_learned',
    });
    expect(memory.revisions).toHaveLength(0);
  });

  it('allows saving an unlearned indicator with master OFF', async () => {
    const ma = indicator('ma');
    ma.buy.params.period = 50;
    const result = await service.save(USER, patch({ ma }, 0));
    expect(result.config.indicators.ma!.buy.params.period).toBe(50);
  });

  it('does not re-check untouched indicators that are already master ON', async () => {
    await service.save(USER, patch({ rsi: on('rsi') }, 0));
    grants.capabilities = ['indicator:macd'];
    const result = await service.save(USER, patch({ macd: on('macd') }, 1));
    expect(result.config.indicators.rsi!.master_enabled).toBe(true);
  });

  it('never copies Buy params to Sell', async () => {
    const rsi = on('rsi');
    rsi.buy.params = { period: 7, level: 25 };
    const result = await service.save(USER, patch({ rsi }, 0));
    expect(result.config.indicators.rsi!.buy.params).toEqual({ period: 7, level: 25 });
    expect(result.config.indicators.rsi!.sell.params).toEqual(
      defaults().indicators.rsi!.sell.params,
    );
  });

  it('rejects invalid params and unknown indicators with 422 CONFIG_INVALID', async () => {
    const rsi = on('rsi');
    rsi.buy.params.period = 999;
    const invalid = await rejection(service.save(USER, patch({ rsi }, 0)));
    expect(invalid.getStatus()).toBe(422);
    expect(invalid.getResponse()).toMatchObject({ code: 'CONFIG_INVALID' });
    expect((invalid.getResponse().errors as Array<{ path: string }>)[0]!.path).toBe(
      'indicators.rsi.buy.params.period',
    );

    const unknown = await rejection(service.save(USER, patch({ nope: indicator('rsi') }, 0)));
    expect(unknown.getStatus()).toBe(422);
    expect(unknown.getResponse()).toMatchObject({ code: 'CONFIG_INVALID' });
    expect(memory.revisions).toHaveLength(0);
  });

  it('reports calendar_unavailable without an active calendar row', async () => {
    memory.calendar = null;
    const result = await service.save(USER, patch({ rsi: on('rsi') }, 0));
    expect(result.effective_session).toBeNull();
    expect(result.status).toBe('calendar_unavailable');
    vi.setSystemTime(new Date('2025-02-01T03:00:00Z'));
    const state = await service.current(USER);
    expect(state.status).toBe('calendar_unavailable');
    expect(state.effective_revision).toBeNull();
    expect(await service.effectiveFor(USER, '2025-02-01')).toBeNull();
  });

  it('becomes effective on the effective session (computed on read)', async () => {
    await service.save(USER, patch({ rsi: on('rsi') }, 0));
    expect((await service.current(USER)).status).toBe('pending');
    vi.setSystemTime(new Date('2025-01-05T17:00:00Z')); // Monday 00:00 VN
    const state = await service.current(USER);
    expect(state.status).toBe('effective');
    expect(state.effective_revision).toBe(1);
    expect(state.effective_session).toBe('2025-01-06');
    const [listed] = await service.revisions(USER, 10);
    expect(listed).toMatchObject({
      revision: 1,
      effective_session: '2025-01-06',
      status: 'effective',
    });
  });

  it('effectiveFor picks the latest revision whose session has started', async () => {
    await service.save(USER, patch({ rsi: on('rsi') }, 0)); // Fri -> Mon 2025-01-06
    vi.setSystemTime(new Date('2025-01-06T04:00:00Z')); // Mon 11:00 VN
    await service.save(USER, patch({ macd: on('macd') }, 1)); // -> Tue 2025-01-07

    expect(await service.effectiveFor(USER, '2025-01-03')).toBeNull();
    const monday = await service.effectiveFor(USER, '2025-01-06');
    expect(monday).toMatchObject({ revision: 1, effective_session: '2025-01-06' });
    expect(monday!.config.indicators.macd!.master_enabled).toBe(false);
    expect(await service.effectiveFor(USER, '2025-01-07')).toMatchObject({
      revision: 2,
      effective_session: '2025-01-07',
    });
    expect(await service.effectiveFor(OTHER_USER, '2025-01-07')).toBeNull();
    const state = await service.current(USER);
    expect(state.saved_revision).toBe(2);
    expect(state.effective_revision).toBe(1);
    expect(state.status).toBe('pending');
  });

  it('getRevision returns only revisions owned by the user', async () => {
    const saved = await service.save(USER, patch({ rsi: on('rsi') }, 0));
    expect(await service.getRevision(USER, 1)).toEqual({
      revision: 1,
      config: saved.config,
      config_hash: saved.config_hash,
      saved_at: '2025-01-03T03:00:00.000Z',
    });
    expect(await service.getRevision(OTHER_USER, 1)).toBeNull();
    expect(await service.getRevision(USER, 2)).toBeNull();
  });

  it('validates the PATCH body shape', () => {
    expect(
      sharedConfigPatchSchema.safeParse({
        expected_revision: 0,
        idempotency_key: 'short',
        indicators: { rsi: on('rsi') },
      }).success,
    ).toBe(false);
    expect(
      sharedConfigPatchSchema.safeParse({
        expected_revision: -1,
        idempotency_key: 'long-enough',
        indicators: { rsi: on('rsi') },
      }).success,
    ).toBe(false);
    expect(
      sharedConfigPatchSchema.safeParse({
        expected_revision: 0,
        idempotency_key: 'long-enough',
        indicators: {},
      }).success,
    ).toBe(false);
  });

  it('A01 save never creates a bot account or grants capital (reads grants only)', async () => {
    const calls: string[] = [];
    const spyGrants: AcademyGrantsPort = {
      grantedCapabilities: () => {
        calls.push('grantedCapabilities');
        return Promise.resolve(new Set(['indicator:rsi']));
      },
    };
    const svc = new SharedConfigService(memory, spyGrants);
    await svc.save(USER, patch({ rsi: on('rsi') }, 0));
    expect(calls).toEqual(['grantedCapabilities']);
    const surface = [
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(svc)),
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(memory)),
    ];
    expect(surface.filter((name) => /bot|capital|account|wallet|cash/i.test(name))).toEqual([]);
    expect(memory.revisions).toHaveLength(1);
  });

  it('B01 master ON + Buy ON + Sell OFF is active only on E_buy and keeps Sell params stored', async () => {
    const rsi = on('rsi');
    rsi.sell.enabled = false;
    rsi.sell.params = { period: 10, level: 75 };
    const result = await service.save(USER, patch({ rsi }, 0));
    const saved = result.config.indicators.rsi!;
    expect(saved.master_enabled).toBe(true);
    expect(saved.buy.enabled).toBe(true);
    expect(saved.sell.enabled).toBe(false);
    expect(saved.sell.params).toEqual({ period: 10, level: 75 });

    const registry = loadTechnicalRegistry();
    expect(activeSideIndicators(result.config, 'buy', registry).map((e) => e.id)).toContain('rsi');
    expect(activeSideIndicators(result.config, 'sell', registry).map((e) => e.id)).not.toContain(
      'rsi',
    );
  });

  it('B02 master OFF keeps children; re-enabling restores the saved choices without enabling both sides', async () => {
    const first = on('rsi');
    first.sell.enabled = false;
    first.buy.params.period = 30;
    first.sell.params = { period: 10, level: 75 };
    await service.save(USER, patch({ rsi: first }, 0));

    const off = indicator('rsi');
    off.master_enabled = false;
    off.buy = structuredClone(first.buy);
    off.sell = structuredClone(first.sell);
    const savedOff = await service.save(USER, patch({ rsi: off }, 1));
    expect(savedOff.config.indicators.rsi!.master_enabled).toBe(false);
    expect(savedOff.config.indicators.rsi!.buy).toEqual(first.buy);
    expect(savedOff.config.indicators.rsi!.sell).toEqual(first.sell);

    const backOn = structuredClone(off);
    backOn.master_enabled = true;
    const restored = await service.save(USER, patch({ rsi: backOn }, 2));
    expect(restored.config.indicators.rsi!.buy.enabled).toBe(true);
    expect(restored.config.indicators.rsi!.sell.enabled).toBe(false);
    expect(restored.config.indicators.rsi!.sell.params).toEqual({ period: 10, level: 75 });
  });

  it('B03 both children OFF saves master OFF; master ON with both OFF is 422 SIDE_REQUIRED', async () => {
    await service.save(USER, patch({ rsi: on('rsi') }, 0));
    const bothOff = on('rsi');
    bothOff.buy.enabled = false;
    bothOff.sell.enabled = false;
    const saved = await service.save(USER, patch({ rsi: bothOff }, 1));
    expect(saved.config.indicators.rsi!.master_enabled).toBe(false);

    const ema = on('ema');
    ema.buy.enabled = false;
    ema.sell.enabled = false;
    const error = await rejection(service.save(USER, patch({ ema }, 2)));
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toMatchObject({ code: 'SIDE_REQUIRED', indicator: 'ema' });
    expect(memory.revisions).toHaveLength(2);
  });

  it('B04 locks ungranted indicators and rejects tampered ops / client actor fields with real codes', async () => {
    const locked = await rejection(service.save(USER, patch({ ma: on('ma') }, 0)));
    expect(locked.getStatus()).toBe(403);
    expect(locked.getResponse()).toMatchObject({
      code: 'CAPABILITY_LOCKED',
      capability: 'indicator:ma',
    });

    // Client-supplied `actor_id` / `passed` fields are not part of the strict patch schema.
    expect(
      sharedConfigPatchSchema.safeParse({
        expected_revision: 0,
        idempotency_key: 'long-enough',
        actor_id: OTHER_USER,
        indicators: { rsi: on('rsi') },
      }).success,
    ).toBe(false);
    expect(
      sharedConfigPatchSchema.safeParse({
        expected_revision: 0,
        idempotency_key: 'long-enough',
        indicators: { rsi: { ...on('rsi'), passed: true } },
      }).success,
    ).toBe(false);

    // Operators outside the whitelist and tampered allowed_ops are CONFIG_INVALID at the service.
    const badOp = on('rsi');
    (badOp.buy.rules[0] as { op: string }).op = '>=';
    const opError = await rejection(
      service.save(USER, {
        expected_revision: 0,
        idempotency_key: 'long-enough',
        indicators: { rsi: badOp },
      } as unknown as SharedConfigPatchInput),
    );
    expect(opError.getStatus()).toBe(422);
    expect(opError.getResponse()).toMatchObject({ code: 'CONFIG_INVALID' });

    const tampered = on('rsi');
    (tampered.buy.rules[0] as { allowed_ops: string[] }).allowed_ops = ['∈'];
    const allowedError = await rejection(
      service.save(USER, {
        expected_revision: 0,
        idempotency_key: 'long-enough',
        indicators: { rsi: tampered },
        actor_id: OTHER_USER,
      } as unknown as SharedConfigPatchInput),
    );
    expect(allowedError.getStatus()).toBe(422);
    expect(allowedError.getResponse()).toMatchObject({ code: 'CONFIG_INVALID' });

    // The server never trusts a client actor: the stored actor stays the authenticated user.
    const saved = await service.save(USER, {
      expected_revision: 0,
      idempotency_key: 'long-enough',
      indicators: { rsi: on('rsi') },
      actor_id: OTHER_USER,
    } as unknown as SharedConfigPatchInput);
    expect(saved.revision).toBe(1);
    expect(memory.revisions[0]!.actor_id).toBe(USER);
  });

  it('B05 changing Buy params leaves Sell params (period 10, level 75) untouched', async () => {
    const saved = on('rsi');
    saved.sell.params = { period: 10, level: 75 };
    await service.save(USER, patch({ rsi: saved }, 0));

    const edit = structuredClone(saved);
    edit.buy.params.period = 12;
    const result = await service.save(USER, patch({ rsi: edit }, 1));
    expect(result.config.indicators.rsi!.buy.params.period).toBe(12);
    expect(result.config.indicators.rsi!.sell.params).toEqual({ period: 10, level: 75 });
    expect(memory.revisions[0]!.config.indicators.rsi!.sell.params).toEqual({
      period: 10,
      level: 75,
    });
  });

  it('F01 saves at 08:00, 11:00 and 20:00 VN on trading day T schedule the next trading day', async () => {
    const isTradingDay = weekdays();
    // Monday 2025-01-06 (VN) at 08:00 / 11:00 / 20:00 (01:00Z / 04:00Z / 13:00Z) -> Tuesday.
    for (const utc of ['01:00:00', '04:00:00', '13:00:00']) {
      expect(nextEffectiveSession(new Date(`2025-01-06T${utc}Z`), isTradingDay)).toBe('2025-01-07');
    }
    // Saturday save -> Monday; Sunday 23:30 VN -> Monday (skipped), never +24h.
    expect(nextEffectiveSession(new Date('2025-01-04T05:00:00Z'), isTradingDay)).toBe('2025-01-06');
    expect(nextEffectiveSession(new Date('2025-01-05T16:30:00Z'), isTradingDay)).toBe('2025-01-06');

    // EffectiveSessionFor follows the same rule through the service.
    vi.setSystemTime(new Date('2025-01-06T13:00:00Z')); // Monday 20:00 VN
    const result = await service.save(USER, patch({ rsi: on('rsi') }, 0));
    expect(result.effective_session).toBe('2025-01-07');
  });

  it('F03 unusable calendar stores calendar_unavailable, a null session and never reports effective', async () => {
    memory.calendar = { holidays: 'not json' };
    const result = await service.save(USER, patch({ rsi: on('rsi') }, 0));
    expect(result.effective_session).toBeNull();
    expect(result.status).toBe('calendar_unavailable');

    vi.setSystemTime(new Date('2025-06-01T03:00:00Z'));
    const state = await service.current(USER);
    expect(state.status).toBe('calendar_unavailable');
    expect(state.effective_revision).toBeNull();
    expect(state.effective_session).toBeNull();
    const [listed] = await service.revisions(USER, 10);
    expect(listed).toMatchObject({ status: 'calendar_unavailable', effective_session: null });
    expect(await service.effectiveFor(USER, '2025-06-01')).toBeNull();
  });

  it('F04 stale revision is 409 REVISION_CONFLICT; replay and idempotency reuse use the real codes', async () => {
    const first = await service.save(USER, patch({ rsi: on('rsi') }, 0, 'f04-key-0001'));
    const stale = await rejection(
      service.save(USER, patch({ macd: on('macd') }, 0, 'f04-key-0002')),
    );
    expect(stale.getStatus()).toBe(409);
    expect(stale.getResponse()).toMatchObject({ code: 'REVISION_CONFLICT', current_revision: 1 });

    const replay = await service.save(USER, patch({ rsi: on('rsi') }, 0, 'f04-key-0001'));
    expect(replay.revision).toBe(first.revision);
    expect(memory.revisions).toHaveLength(1);

    const reused = await rejection(
      service.save(USER, patch({ macd: on('macd') }, 1, 'f04-key-0001')),
    );
    expect(reused.getStatus()).toBe(409);
    expect(reused.getResponse()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(memory.revisions).toHaveLength(1);
  });
});

describe('StrategyConfigEnabledGuard', () => {
  const guard = (enabled: boolean) =>
    new StrategyConfigEnabledGuard({
      get: (key: string) => (key === 'STRATEGY_V2_ENABLED' ? enabled : undefined),
    } as unknown as ConfigService<Environment, true>);

  it('returns 404 FEATURE_DISABLED when STRATEGY_V2_ENABLED=false', () => {
    expect(() => guard(false).canActivate()).toThrow(NotFoundException);
    try {
      guard(false).canActivate();
    } catch (error) {
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'FEATURE_DISABLED',
      });
    }
    expect(guard(true).canActivate()).toBe(true);
  });
});

describe('SharedConfigSqlStore', () => {
  it('locks per owner, serializes JSON and coerces revision rows', async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const savedAt = '2025-01-03T03:00:00.000Z';
    const client = {
      query: async <T extends Record<string, unknown>>(
        text: string,
        values?: readonly unknown[],
      ) => {
        await Promise.resolve();
        calls.push({ text, values });
        if (text.includes('returning saved_at')) return [{ saved_at: savedAt }] as unknown as T[];
        if (text.includes('from shared_config_revisions r'))
          return [
            {
              user_id: USER,
              revision: '3',
              config: defaults(),
              config_hash: 'a'.repeat(64),
              before_hash: null,
              patch: {},
              requested_at: savedAt,
              saved_at: savedAt,
              actor_id: USER,
              idempotency_key: 'idem-key-0003',
              effective_session: '2025-01-06',
              session_status: 'pending',
            },
          ] as unknown as T[];
        return [] as T[];
      },
    };
    const store = new SharedConfigSqlStore(client);
    await store.lockOwner(USER);
    expect(calls[0]!.text).toContain('pg_advisory_xact_lock');
    expect(calls[0]!.values).toEqual([USER]);

    const inserted = await store.insertRevision({
      user_id: USER,
      revision: 1,
      schema_version: '2.0',
      rule_version: 'iqx-rules-2.0',
      calculation_version: 'iqx-ta-2.0',
      config: defaults(),
      config_hash: 'a'.repeat(64),
      before_hash: null,
      patch: { rsi: indicator('rsi') },
      requested_at: new Date(savedAt),
      actor_id: USER,
      idempotency_key: 'idem-key-0003',
    });
    expect(inserted.saved_at).toEqual(new Date(savedAt));
    expect(typeof calls[1]!.values![5]).toBe('string');
    expect(typeof calls[1]!.values![8]).toBe('string');

    const row = await store.revision(USER, 3);
    expect(row).toMatchObject({ revision: 3, effective_session: '2025-01-06' });
    expect(row!.saved_at).toEqual(new Date(savedAt));
    expect(await store.activeCalendar()).toBeNull();
  });
});
