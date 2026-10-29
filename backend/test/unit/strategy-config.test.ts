import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AcademyGrantsPort } from '../../src/modules/academy/academy.ports.js';
import { activeSideIndicators } from '../../src/modules/bots/bot.shared-config.js';
import {
  configHash,
  defaultConfig,
  isRowsEntry,
  loadLegacyTechnicalRegistry,
  loadTechnicalRegistry,
  validateConfig,
  type ConditionRow,
  type IndicatorConfig,
  type ParamsRegistryEntry,
  type RowSideConfig,
  type RowsRegistryEntry,
  type SharedConfig,
  type Side,
  type SideConfig,
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
import {
  sharedConfigPatchSchema,
  sharedConfigStateSchema,
  technicalRegistryResponseSchema,
} from '../../src/modules/strategy-config/strategy-config.schemas.js';
import type { SharedConfigPatchInput } from '../../src/modules/strategy-config/strategy-config.schemas.js';
import {
  SharedConfigService,
  mergeIndicatorPatch,
  readStoredConfig,
} from '../../src/modules/strategy-config/strategy-config.service.js';
import type { Environment } from '../../src/platform/config/environment.js';
import { ApiExceptionFilter } from '../../src/platform/http/api-exception.filter.js';

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER_USER = '00000000-0000-4000-8000-000000000002';

type StoredRevision = Omit<RevisionRow, 'effective_session' | 'session_status'>;

/** In-memory store; transactions are serialized (advisory lock) and roll back on error. */
class MemorySharedConfig implements SharedConfigStoreProvider, SharedConfigStore {
  revisions: StoredRevision[] = [];
  sessions: NewEffectiveSession[] = [];
  /** `bot_config_pauses` rows by user (only the columns the save touches). */
  pauses = new Map<string, { resume_revision: number | null; resumed_at: string | null }>();
  /** Versions written with each revision. */
  versions: Array<{ revision: number; schema: string; rule: string }> = [];
  /** Fails the save right after the resume hook, to prove it rolls back with the revision. */
  failAfterResume = false;
  calendar: { holidays: unknown } | null = { holidays: '[]' };
  private queue: Promise<unknown> = Promise.resolve();

  store(): SharedConfigStore {
    return this;
  }

  transaction<T>(operation: (store: SharedConfigStore) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const snapshot = structuredClone({
        revisions: this.revisions,
        sessions: this.sessions,
        pauses: this.pauses,
        versions: this.versions,
      });
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
    this.versions.push({
      revision: revision.revision,
      schema: revision.schema_version,
      rule: revision.rule_version,
    });
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

  async resumeConfigPause(userId: string, revision: number) {
    await Promise.resolve();
    const pause = this.pauses.get(userId);
    if (pause && pause.resume_revision === null) {
      this.pauses.set(userId, { resume_revision: revision, resumed_at: 'now' });
    }
    if (this.failAfterResume) throw new Error('boom');
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
/** Registry defaults are OFF on both sides; `on` is a master-ON indicator with both sides chosen. */
const on = (id: string, patch: Partial<IndicatorConfig> = {}): IndicatorConfig => {
  const base = indicator(id);
  return {
    ...base,
    master_enabled: true,
    buy: { ...base.buy, enabled: true },
    sell: { ...base.sell, enabled: true },
    ...patch,
  };
};

/** Rows of a tab of a row-based indicator. */
const rowsOf = (side: SideConfig): ConditionRow[] => (side as RowSideConfig).rules;
const row = (item: IndicatorConfig, side: Side, index: number): ConditionRow =>
  rowsOf(item[side])[index]!;

type StoredDocument = {
  schema_version: string;
  revision: number;
  rule_version: string;
  indicators: Record<string, unknown>;
};

/**
 * A SPEC V2 (`iqx-rules-3.0`) document: side-level params + rule templates. RSI is master ON
 * with Mua ON and Bán OFF, MACD master ON with both tabs OFF, Volume valid with custom params.
 */
function v2Document(): StoredDocument {
  const side = (enabled: boolean) => ({
    enabled,
    params: { period: 9, level: 25 },
    rules: [
      {
        id: 'r1',
        kind: 'compare',
        lhs: { kind: 'series', key: 'value' },
        op: '>',
        rhs: { kind: 'param', key: 'level' },
        allowed_ops: ['>', '<'],
      },
    ],
  });
  const indicators: Record<string, unknown> = {};
  for (const entry of registry) {
    indicators[entry.id] = { master_enabled: false, buy: side(false), sell: side(false) };
  }
  indicators.rsi = { master_enabled: true, buy: side(true), sell: side(false) };
  indicators.macd = { master_enabled: true, buy: side(false), sell: side(false) };
  const volume = structuredClone(defaultConfig(registry).indicators.volume!) as {
    master_enabled: boolean;
    buy: { enabled: boolean; params: Record<string, number> };
  };
  volume.master_enabled = true;
  volume.buy.enabled = true;
  volume.buy.params.lookback = 30;
  indicators.volume = volume;
  return { schema_version: '2.0', revision: 3, rule_version: 'iqx-rules-3.0', indicators };
}

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
    row(rsi, 'buy', 0).period = 21;
    const merged = mergeIndicatorPatch(base, { rsi });
    expect(row(merged.indicators.rsi!, 'buy', 0).period).toBe(21);
    expect(row(merged.indicators.rsi!, 'sell', 0).period).toBe(
      row(base.indicators.rsi!, 'sell', 0).period,
    );
    expect(merged.indicators.macd).toEqual(base.indicators.macd);
    expect(base.indicators.rsi!.master_enabled).toBe(false);
  });
});

describe('readStoredConfig (SPEC V3 §6.1.5)', () => {
  it('returns a current-format document as is, never normalised', () => {
    const stored = defaults();
    row(stored.indicators.rsi!, 'buy', 1).period = 9;
    stored.indicators.rsi!.buy.enabled = true;
    const view = readStoredConfig(stored, registry);
    expect(view).toEqual({ config: stored, outdated: false, legacy: null });
    expect(view.config).toBe(stored);
  });

  it('resets an outdated document to the V3 defaults keeping only the switches', () => {
    const view = readStoredConfig(v2Document(), registry);
    expect(view.outdated).toBe(true);
    expect(view.config.rule_version).toBe('iqx-rules-4.0');
    expect(view.config.schema_version).toBe('3.0');
    expect(view.config.revision).toBe(3);
    expect(Object.keys(view.config.indicators)).toEqual(registry.map((entry) => entry.id));
    const rsi = view.config.indicators.rsi!;
    expect(rsi).toMatchObject({
      master_enabled: true,
      buy: { enabled: true },
      sell: { enabled: false },
    });
    // Rows are the SPEC V3 defaults: the old period 9 / level 25 / `>` are never mapped.
    expect(rowsOf(rsi.buy)).toEqual(rowsOf(defaults().indicators.rsi!.buy));
    expect(rowsOf(rsi.sell)).toEqual(rowsOf(defaults().indicators.rsi!.sell));
    // Master ON with both tabs OFF reads as master OFF.
    expect(view.config.indicators.macd!.master_enabled).toBe(false);
    // Volume (unchanged by V3) is copied verbatim when valid.
    expect(view.config.indicators.volume).toEqual(v2Document().indicators.volume);
    expect(view.legacy).toMatchObject({
      from_rule_version: 'iqx-rules-3.0',
      legacy: true,
      reset: true,
      needs_review: true,
      buy: { status: 'legacy_needs_review' },
      sell: { status: 'legacy_needs_review' },
    });
    expect(validateConfig(view.config, registry)).toEqual([]);
  });

  it('resets an invalid Volume and an unreadable document to the defaults', () => {
    const doc = v2Document();
    (doc.indicators.volume as { buy: { params: Record<string, number> } }).buy.params.lookback =
      999;
    const view = readStoredConfig(doc, registry);
    // Invalid Volume is not copied: registry params and rules, the stored switches kept.
    expect(view.config.indicators.volume).toEqual({
      ...defaults().indicators.volume!,
      master_enabled: true,
      buy: { ...defaults().indicators.volume!.buy, enabled: true },
    });

    for (const unreadable of [null, 'x', {}, { rule_version: 'iqx-rules-4.0' }]) {
      const read = readStoredConfig(unreadable, registry);
      expect(read.outdated).toBe(true);
      expect(read.config).toEqual(defaults());
      expect(read.legacy).toMatchObject({ reset: true, needs_review: true });
    }
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
    expect(state.outdated).toBe(false);
    expect(sharedConfigStateSchema.safeParse(state).success).toBe(true);
  });

  it('lists the technical registry with per-user learned flags and no internals', async () => {
    const response = await service.technicalRegistry(USER);
    expect(response.calculation_version).toBe('iqx-ta-2.0');
    expect(response.rule_version).toBe('iqx-rules-4.0');
    expect(response.indicators).toHaveLength(registry.length);
    const byId = new Map(response.indicators.map((item) => [item.id, item]));
    expect(byId.get('rsi')!.learned).toBe(true);
    expect(byId.get('ma')!.learned).toBe(false);
    expect(byId.get('rsi')).not.toHaveProperty('seed_and_missing');
    expect(byId.get('rsi')).not.toHaveProperty('worked_fixture');
    expect(technicalRegistryResponseSchema.safeParse(response).success).toBe(true);
  });

  it('exposes the rows (sentence, fields, constraints, defaults) of the 15 row-based indicators', async () => {
    const response = await service.technicalRegistry(USER);
    const rowsEntries = response.indicators.filter((item) => item.model === 'rows');
    expect(rowsEntries).toHaveLength(15);
    for (const item of rowsEntries) {
      const entry = registry.find((candidate) => candidate.id === item.id)!;
      expect(isRowsEntry(entry), item.id).toBe(true);
      expect(item.rows, item.id).toEqual(
        (entry as RowsRegistryEntry).rows.map((definition) => ({
          id: definition.id,
          sentence: definition.sentence,
          fields: definition.fields,
          constraints: definition.constraints,
          default_enabled: definition.default_enabled,
          buy: definition.buy,
          sell: definition.sell,
        })),
      );
      expect(item).not.toHaveProperty('fields');
      expect(item).not.toHaveProperty('buy');
    }
    expect(rowsEntries.map((item) => item.rows.length)).toEqual([
      2, 3, 3, 3, 3, 1, 2, 2, 1, 2, 1, 1, 1, 1, 1,
    ]);
    const rsi = rowsEntries.find((item) => item.id === 'rsi')!;
    expect(rsi.rows[1]).toMatchObject({
      id: 'rsi.trend',
      sentence: 'RSI {period} xu hướng {dir}',
      default_enabled: true,
      buy: { period: 14, dir: 'up' },
      sell: { period: 14, dir: 'down' },
    });
    const withConstraints = rowsEntries
      .flatMap((item) => item.rows)
      .filter((definition) => definition.constraints.length > 0)
      .map((definition) => definition.id);
    expect(withConstraints).toEqual([
      'macd.signal',
      'macd.zero',
      'macd.hist',
      'ma.ma_cross',
      'ema.ma_cross',
      'ma_cross.cross',
    ]);
    const sma = rowsEntries.find((item) => item.id === 'ma')!.rows[0]!.fields;
    expect(sma.find((field) => field.key === 'period')).toMatchObject({
      options: [5, 10, 20, 50, 100, 200],
    });
    // A copy: mutating the response never changes the process-wide registry.
    rsi.rows[0]!.buy.period = 99;
    (rsi.rows[0]!.fields[0] as { label: string }).label = 'x';
    const again = (await service.technicalRegistry(USER)).indicators.find((i) => i.id === 'rsi')!;
    if (again.model !== 'rows') throw new Error('rsi must be row-based');
    expect(again.rows[0]!.buy.period).toBe(14);
    expect(again.rows[0]!.fields[0]).toMatchObject({ label: 'Chu kỳ RSI' });
  });

  it('keeps the params model (fields, cross_fields, params + rules) for Volume', async () => {
    const response = await service.technicalRegistry(USER);
    const volume = response.indicators.find((item) => item.id === 'volume')!;
    const entry = registry.find((candidate) => candidate.id === 'volume') as ParamsRegistryEntry;
    expect(volume).toMatchObject({
      model: 'legacy_params',
      fields: entry.fields,
      validation: { cross_fields: [] },
      buy: entry.buy,
      sell: entry.sell,
    });
    expect((volume as { validation: object }).validation).not.toHaveProperty('finite_required');
  });

  it('saves a revision with audit fields and a pending effective session', async () => {
    const result = await service.save(USER, patch({ rsi: on('rsi') }, 0));
    expect(result.revision).toBe(1);
    expect(result.config.revision).toBe(1);
    expect(result.config.rule_version).toBe('iqx-rules-4.0');
    expect(result.config.indicators.rsi!.master_enabled).toBe(true);
    expect(result.config_hash).toBe(configHash(result.config));
    expect(result.effective_session).toBe('2025-01-06');
    expect(result.status).toBe('pending');

    const stored = memory.revisions[0]!;
    expect(stored.actor_id).toBe(USER);
    expect(stored.requested_at).toEqual(new Date('2025-01-03T03:00:00Z'));
    expect(stored.before_hash).toBe(configHash(defaults()));
    expect(Object.keys(stored.patch)).toEqual(['rsi']);
    expect(memory.versions).toEqual([{ revision: 1, schema: '3.0', rule: 'iqx-rules-4.0' }]);
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
    row(rsi, 'sell', 0).threshold = 75;
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
    row(rsi, 'buy', 0).period = 9;
    const result = await service.save(USER, patch({ rsi }, 1));
    expect(result.config.indicators.rsi!.master_enabled).toBe(false);
    expect(result.config.indicators.rsi!.buy).toEqual(rsi.buy);
    expect(result.config.indicators.rsi!.sell).toEqual(rsi.sell);
  });

  it('master OFF keeps child settings', async () => {
    const rsi = indicator('rsi');
    row(rsi, 'buy', 0).period = 30;
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
    row(ma, 'buy', 0).period = 50;
    const result = await service.save(USER, patch({ ma }, 0));
    expect(row(result.config.indicators.ma!, 'buy', 0).period).toBe(50);
  });

  it('does not re-check untouched indicators that are already master ON', async () => {
    await service.save(USER, patch({ rsi: on('rsi') }, 0));
    grants.capabilities = ['indicator:macd'];
    const result = await service.save(USER, patch({ macd: on('macd') }, 1));
    expect(result.config.indicators.rsi!.master_enabled).toBe(true);
  });

  it('keeps every row independent: own periods per row, Buy never copied to Sell', async () => {
    const rsi = on('rsi');
    row(rsi, 'buy', 0).period = 14;
    row(rsi, 'buy', 1).period = 9; // RSI 14 on row 1, RSI 9 on row 2 (SPEC V3 §1.2)
    row(rsi, 'buy', 0).threshold = 25;
    const result = await service.save(USER, patch({ rsi }, 0));
    expect(rowsOf(result.config.indicators.rsi!.buy)).toEqual([
      { id: 'rsi.level', enabled: true, period: 14, op: '<', threshold: 25 },
      { id: 'rsi.trend', enabled: true, period: 9, dir: 'up' },
    ]);
    expect(result.config.indicators.rsi!.sell).toEqual({
      ...defaults().indicators.rsi!.sell,
      enabled: true,
    });
  });

  it('stores and reads back negative, decimal and percent values exactly (SPEC V3 §7.1.6)', async () => {
    const cmf = indicator('cmf');
    row(cmf, 'buy', 0).threshold = -0.05;
    const cci = indicator('cci');
    row(cci, 'buy', 0).threshold = -100;
    const williams = indicator('williams_r');
    row(williams, 'buy', 0).threshold = -80;
    const roc = indicator('roc');
    row(roc, 'buy', 0).threshold = 5;
    row(roc, 'sell', 0).threshold = -5.5;
    const bollinger = indicator('bollinger');
    row(bollinger, 'buy', 0).mult = 2.5;
    await service.save(USER, patch({ cmf, cci, williams_r: williams, roc, bollinger }, 0));
    const state = await service.current(USER);
    expect(state.outdated).toBe(false);
    expect(row(state.config.indicators.cmf!, 'buy', 0).threshold).toBe(-0.05);
    expect(row(state.config.indicators.cci!, 'buy', 0).threshold).toBe(-100);
    expect(row(state.config.indicators.williams_r!, 'buy', 0).threshold).toBe(-80);
    expect(row(state.config.indicators.roc!, 'buy', 0).threshold).toBe(5);
    expect(row(state.config.indicators.roc!, 'sell', 0).threshold).toBe(-5.5);
    expect(row(state.config.indicators.bollinger!, 'buy', 0).mult).toBe(2.5);
  });

  it('rejects invalid rows and unknown indicators with 422 CONFIG_INVALID (per-row message and path)', async () => {
    const rsi = on('rsi');
    row(rsi, 'buy', 1).period = 999;
    const invalid = await rejection(service.save(USER, patch({ rsi }, 0)));
    expect(invalid.getStatus()).toBe(422);
    expect(invalid.getResponse()).toMatchObject({ code: 'CONFIG_INVALID' });
    expect(invalid.getResponse().errors).toEqual([
      {
        path: 'indicators.rsi.buy.rules.1.period',
        message: 'Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.',
        side: 'buy',
        row: 2,
      },
    ]);

    const unknown = await rejection(service.save(USER, patch({ nope: indicator('rsi') }, 0)));
    expect(unknown.getStatus()).toBe(422);
    expect(unknown.getResponse()).toMatchObject({ code: 'CONFIG_INVALID' });
    expect(memory.revisions).toHaveLength(0);
  });

  it('checks both tabs, disabled rows and a disabled tab included, and never repairs a value', async () => {
    const ma = indicator('ma');
    ma.sell.enabled = false;
    row(ma, 'sell', 0).period = 7; // not a preset
    rowsOf(ma.sell)[1]!.enabled = false;
    row(ma, 'sell', 1).fast = 50;
    row(ma, 'sell', 1).slow = 20; // fast >= slow on a disabled row
    const ema = indicator('ema');
    row(ema, 'buy', 0).period = 2.5;
    const error = await rejection(service.save(USER, patch({ ma, ema }, 0)));
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse().errors).toEqual([
      {
        path: 'indicators.ma.sell.rules.0.period',
        message: 'Bán · dòng 1: Chu kỳ SMA chỉ chọn 5, 10, 20, 50, 100, 200.',
        side: 'sell',
        row: 1,
      },
      {
        path: 'indicators.ma.sell.rules.1.fast',
        message: 'Bán · dòng 2: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm.',
        side: 'sell',
        row: 2,
      },
      {
        path: 'indicators.ema.buy.rules.0.period',
        message: 'Mua · dòng 1: Chu kỳ EMA phải từ 2 đến 200, số nguyên.',
        side: 'buy',
        row: 1,
      },
    ]);
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
      legacy: false,
      outdated: false,
    });
  });

  it('effectiveFor picks the latest revision whose session has started', async () => {
    await service.save(USER, patch({ rsi: on('rsi') }, 0)); // Fri -> Mon 2025-01-06
    vi.setSystemTime(new Date('2025-01-06T04:00:00Z')); // Mon 11:00 VN
    await service.save(USER, patch({ macd: on('macd') }, 1)); // -> Tue 2025-01-07

    expect(await service.effectiveFor(USER, '2025-01-03')).toBeNull();
    const monday = await service.effectiveFor(USER, '2025-01-06');
    expect(monday).toMatchObject({
      revision: 1,
      effective_session: '2025-01-06',
      outdated: false,
      legacy: null,
    });
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
      outdated: false,
      legacy: null,
    });
    expect(await service.getRevision(OTHER_USER, 1)).toBeNull();
    expect(await service.getRevision(USER, 2)).toBeNull();
  });

  /** Stores a raw (possibly outdated) document as an effective revision. */
  function seedRevision(revision: number, config: unknown, userId = USER): string {
    const hash = configHash(config as SharedConfig);
    memory.revisions.push({
      user_id: userId,
      revision,
      config: config as SharedConfig,
      config_hash: hash,
      before_hash: null,
      patch: {},
      requested_at: new Date('2024-12-02T03:00:00Z'),
      saved_at: new Date('2024-12-02T03:00:00Z'),
      actor_id: userId,
      idempotency_key: `seeded-${revision}`,
    });
    memory.sessions.push({
      user_id: userId,
      revision,
      effective_session: '2024-12-03',
      status: 'effective',
    });
    return hash;
  }

  /** A historical `iqx-rules-2.0` revision: the 16 indicators plus the 19 removed ones. */
  function legacyDocument(mutate: (indicators: Record<string, unknown>) => void = () => undefined) {
    const doc = v2Document();
    doc.rule_version = 'iqx-rules-2.0';
    for (const entry of loadLegacyTechnicalRegistry()) {
      doc.indicators[entry.id] = {
        master_enabled: false,
        buy: { enabled: true, params: entry.buy.params, rules: entry.buy.rules },
        sell: { enabled: true, params: entry.sell.params, rules: entry.sell.rules },
      };
    }
    mutate(doc.indicators);
    return doc;
  }

  it('reads an outdated (iqx-rules-3.0) revision as the V3 defaults with its switches', async () => {
    const hash = seedRevision(3, v2Document());
    const state = await service.current(USER);
    expect(state.saved_revision).toBe(3);
    expect(state.outdated).toBe(true);
    expect(state.config).toEqual(readStoredConfig(v2Document(), registry).config);
    expect(state.config.indicators.rsi).toMatchObject({
      master_enabled: true,
      buy: { enabled: true },
      sell: { enabled: false },
    });
    expect(state.config_hash).toBe(hash); // hash of the stored document, kept for receipts
    expect(state.legacy).toMatchObject({ reset: true, needs_review: true });
    expect(state.effective).toMatchObject({ revision: 3, outdated: true });
    expect(sharedConfigStateSchema.safeParse(state).success).toBe(true);
    expect(await service.revisions(USER, 10)).toMatchObject([
      { revision: 3, legacy: true, outdated: true },
    ]);
  });

  it('reads a historical 35-indicator revision the same way, listing the removed indicators', async () => {
    const doc = legacyDocument((indicators) => {
      (indicators.atr as IndicatorConfig).master_enabled = true;
    });
    doc.revision = 1;
    seedRevision(1, doc);
    const effective = await service.effectiveFor(USER, '2025-01-03');
    expect(effective).toMatchObject({ revision: 1, outdated: true });
    expect(effective!.config.revision).toBe(1);
    expect(Object.keys(effective!.config.indicators)).toEqual(registry.map((entry) => entry.id));
    expect(effective!.legacy).toMatchObject({
      from_rule_version: 'iqx-rules-2.0',
      reset: true,
      needs_review: true,
      buy: { status: 'legacy_needs_review' },
      sell: { status: 'legacy_needs_review' },
    });
    expect(effective!.legacy!.removed_indicators).toHaveLength(19);
  });

  it('getRevision refuses an outdated revision with 422 CONFIG_FORMAT_OUTDATED unless allowed', async () => {
    const hash = seedRevision(1, v2Document());
    const error = await rejection(service.getRevision(USER, 1));
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toMatchObject({
      code: 'CONFIG_FORMAT_OUTDATED',
      revision: 1,
      details: [{ field: 'revision', revision: 1 }],
    });
    const allowed = await service.getRevision(USER, 1, { allowOutdated: true });
    expect(allowed).toMatchObject({ revision: 1, config_hash: hash, outdated: true });
    expect(allowed!.legacy).toMatchObject({ needs_review: true });
    expect(allowed!.config.rule_version).toBe('iqx-rules-4.0');
    // The pre-V3 option name keeps working for existing Bot callers.
    expect(await service.getRevision(USER, 1, { allowLegacyReview: true })).toMatchObject({
      outdated: true,
    });
  });

  it('saves a new current revision from an outdated base; the outdated one stays unchanged', async () => {
    const hash = seedRevision(1, legacyDocument());
    const result = await service.save(USER, patch({ macd: on('macd') }, 1));
    expect(result.revision).toBe(2);
    expect(result.config.rule_version).toBe('iqx-rules-4.0');
    expect(Object.keys(result.config.indicators)).toEqual(registry.map((entry) => entry.id));
    expect(result.config.indicators.rsi).toMatchObject({
      master_enabled: true,
      buy: { enabled: true },
      sell: { enabled: false },
    });
    expect(rowsOf(result.config.indicators.rsi!.buy)).toEqual(
      rowsOf(defaults().indicators.rsi!.buy),
    );
    expect(result.config.indicators.macd!.master_enabled).toBe(true);
    expect(memory.revisions[1]!.before_hash).toBe(hash);
    expect(configHash(memory.revisions[1]!.config)).toBe(result.config_hash);
    const state = await service.current(USER);
    expect(state.outdated).toBe(false);
    expect(state.legacy).toBeNull();
    expect((memory.revisions[0]!.config as { rule_version: string }).rule_version).toBe(
      'iqx-rules-2.0',
    );

    const removed = await rejection(service.save(USER, patch({ atr: on('rsi') }, 2)));
    expect(removed.getStatus()).toBe(422);
    expect(removed.getResponse()).toMatchObject({ code: 'CONFIG_INVALID' });
    expect((removed.getResponse().errors as Array<{ path: string }>)[0]!.path).toBe(
      'indicators.atr',
    );
  });

  describe('resume of a Bot paused by the upgrade (SPEC V3 §6.2)', () => {
    it('marks the unresolved pause resumed by the saved revision, inside the save', async () => {
      memory.pauses.set(USER, { resume_revision: null, resumed_at: null });
      memory.pauses.set(OTHER_USER, { resume_revision: null, resumed_at: null });
      const result = await service.save(USER, patch({ rsi: on('rsi') }, 0));
      expect(memory.pauses.get(USER)).toEqual({
        resume_revision: result.revision,
        resumed_at: 'now',
      });
      expect(memory.pauses.get(OTHER_USER)).toEqual({ resume_revision: null, resumed_at: null });

      // A later save never moves an already resolved pause.
      await service.save(USER, patch({ macd: on('macd') }, 1));
      expect(memory.pauses.get(USER)!.resume_revision).toBe(1);
    });

    it('does nothing without a pause, on a rejected save or on an idempotent replay', async () => {
      await service.save(USER, patch({ rsi: on('rsi') }, 0, 'resume-key-0001'));
      expect(memory.pauses.size).toBe(0);

      memory.pauses.set(USER, { resume_revision: null, resumed_at: null });
      const rsi = on('rsi');
      row(rsi, 'buy', 0).period = 1;
      await rejection(service.save(USER, patch({ rsi }, 1)));
      await service.save(USER, patch({ rsi: on('rsi') }, 0, 'resume-key-0001'));
      expect(memory.pauses.get(USER)).toEqual({ resume_revision: null, resumed_at: null });
    });

    it('rolls the resume back with the revision when the save fails after it', async () => {
      memory.pauses.set(USER, { resume_revision: null, resumed_at: null });
      memory.failAfterResume = true;
      await expect(service.save(USER, patch({ rsi: on('rsi') }, 0))).rejects.toThrow('boom');
      expect(memory.revisions).toHaveLength(0);
      expect(memory.pauses.get(USER)).toEqual({ resume_revision: null, resumed_at: null });
    });
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

  it('accepts only the V3 shape: rows for the 15, params + rules for Volume', () => {
    const body = (indicators: Record<string, unknown>) =>
      sharedConfigPatchSchema.safeParse({
        expected_revision: 0,
        idempotency_key: 'long-enough',
        indicators,
      });
    expect(body({ rsi: on('rsi'), volume: on('volume') }).success).toBe(true);

    // The SPEC V2 side (side-level params + rule templates) is refused, never mapped.
    const old = v2Document().indicators.rsi;
    const refused = body({ rsi: old });
    expect(refused.success).toBe(false);
    expect(refused.error!.issues).toEqual([
      expect.objectContaining({
        path: ['indicators', 'rsi'],
        message: 'Định dạng điều kiện cũ không còn được hỗ trợ. Tải lại để dùng mẫu điều kiện mới.',
      }),
    ]);
    // Rows on Volume, or one side of each model, are refused too.
    expect(body({ volume: on('rsi') }).success).toBe(false);
    expect(body({ rsi: { ...on('rsi'), sell: on('volume').sell } }).success).toBe(false);
    // A row with a side-level `params` key or an operand object is not a row.
    expect(body({ rsi: { ...on('rsi'), buy: { ...on('rsi').buy, params: {} } } }).success).toBe(
      false,
    );
    const operand = on('rsi');
    (rowsOf(operand.buy)[0] as Record<string, unknown>).lhs = { kind: 'series', key: 'value' };
    expect(body({ rsi: operand }).success).toBe(false);
  });

  describe('effective config read', () => {
    it('is null before any revision became effective (never saved, or still pending)', async () => {
      expect((await service.current(USER)).effective).toBeNull();
      await service.save(USER, patch({ rsi: on('rsi') }, 0));
      const pending = await service.current(USER);
      expect(pending.saved_revision).toBe(1);
      expect(pending.effective_revision).toBeNull();
      expect(pending.effective).toBeNull();
    });

    it('equals the saved config when nothing newer is pending', async () => {
      await service.save(USER, patch({ rsi: on('rsi') }, 0)); // Fri -> Mon 2025-01-06
      vi.setSystemTime(new Date('2025-01-05T17:00:00Z')); // Monday 00:00 VN
      const state = await service.current(USER);
      expect(state.effective_revision).toBe(1);
      expect(state.effective).toMatchObject({
        revision: 1,
        effective_session: '2025-01-06',
        config_hash: state.config_hash,
        outdated: false,
        legacy: null,
      });
      expect(state.effective!.config).toEqual(state.config);
      expect(sharedConfigStateSchema.safeParse(state).success).toBe(true);
    });

    it('returns the older revision in force while a newer save is pending', async () => {
      await service.save(USER, patch({ rsi: on('rsi') }, 0)); // Fri -> Mon 2025-01-06
      vi.setSystemTime(new Date('2025-01-06T04:00:00Z')); // Mon 11:00 VN
      const second = await service.save(USER, patch({ macd: on('macd') }, 1)); // -> Tue

      const state = await service.current(USER);
      expect(state.saved_revision).toBe(2);
      expect(state.status).toBe('pending');
      expect(state.effective_revision).toBe(1);
      expect(state.config.indicators.macd!.master_enabled).toBe(true);
      expect(state.config_hash).toBe(second.config_hash);
      expect(state.effective).toMatchObject({ revision: 1, effective_session: '2025-01-06' });
      expect(state.effective!.config.indicators.rsi!.master_enabled).toBe(true);
      // What the Bot uses today is NOT the pending MACD condition.
      expect(state.effective!.config.indicators.macd!.master_enabled).toBe(false);
      expect(state.effective!.config_hash).toBe(memory.revisions[0]!.config_hash);
      expect(sharedConfigStateSchema.safeParse(state).success).toBe(true);

      vi.setSystemTime(new Date('2025-01-06T17:00:00Z')); // Tue 00:00 VN: revision 2 starts
      const later = await service.current(USER);
      expect(later.effective_revision).toBe(2);
      expect(later.effective).toMatchObject({ revision: 2, effective_session: '2025-01-07' });
      expect(later.effective!.config.indicators.macd!.master_enabled).toBe(true);
    });

    it('is owner-scoped', async () => {
      await service.save(USER, patch({ rsi: on('rsi') }, 0));
      vi.setSystemTime(new Date('2025-01-05T17:00:00Z'));
      expect((await service.current(USER)).effective).not.toBeNull();
      const other = await service.current(OTHER_USER);
      expect(other.effective).toBeNull();
      expect(other.saved_revision).toBe(0);
    });

    it('reports an outdated revision in force while a newer current one is pending', async () => {
      seedRevision(1, v2Document());
      // Revision 2 saved today from the outdated base: pending, revision 1 stays in force.
      const saved = await service.save(USER, patch({ macd: on('macd') }, 1));
      expect(saved.status).toBe('pending');

      const state = await service.current(USER);
      expect(state.saved_revision).toBe(2);
      expect(state.outdated).toBe(false);
      expect(state.legacy).toBeNull();
      expect(state.effective_revision).toBe(1);
      expect(state.effective).toMatchObject({ revision: 1, outdated: true });
      expect(state.effective!.config.rule_version).toBe('iqx-rules-4.0');
      expect(state.effective!.legacy).toMatchObject({ reset: true, needs_review: true });
      // It never throws like getRevision does: the client must see it.
      expect(sharedConfigStateSchema.safeParse(state).success).toBe(true);
    });
  });

  describe('error details reach the client through the API exception filter', () => {
    function send(exception: unknown) {
      let status = 0;
      let body: Record<string, unknown> = {};
      const reply = {
        header: () => reply,
        type: () => reply,
        status: (code: number) => {
          status = code;
          return { send: (payload: Record<string, unknown>) => (body = payload) };
        },
      };
      const host = {
        switchToHttp: () => ({
          getRequest: () => ({ id: 'req-1', url: '/api/v2/strategy/shared-config' }),
          getResponse: () => reply,
        }),
      };
      new ApiExceptionFilter().catch(exception, host as never);
      return { status, body: body as { error: Record<string, unknown>; request_id: string } };
    }

    it('REVISION_CONFLICT carries current_revision in details[0]', async () => {
      await service.save(USER, patch({ rsi: on('rsi') }, 0));
      const error = await rejection(service.save(USER, patch({ macd: on('macd') }, 0)));
      const { status, body } = send(error);
      expect(status).toBe(409);
      expect(body.error).toMatchObject({
        code: 'REVISION_CONFLICT',
        details: [{ field: 'expected_revision', current_revision: 1 }],
      });
    });

    it('CONFIG_INVALID lists every per-row error (path, message, side, row) as details', async () => {
      const rsi = on('rsi');
      row(rsi, 'buy', 0).period = 999;
      const { status, body } = send(await rejection(service.save(USER, patch({ rsi }, 0))));
      expect(status).toBe(422);
      expect(body.error.code).toBe('CONFIG_INVALID');
      expect(body.error.details).toEqual([
        {
          path: 'indicators.rsi.buy.rules.0.period',
          message: 'Mua · dòng 1: Chu kỳ RSI phải từ 2 đến 200, số nguyên.',
          side: 'buy',
          row: 1,
        },
      ]);

      const unknown = send(
        await rejection(service.save(USER, patch({ nope: indicator('rsi') }, 0))),
      );
      expect(unknown.body.error.details).toEqual([
        { path: 'indicators.nope', message: 'Chỉ báo không được hỗ trợ: nope.' },
      ]);
    });

    it('a violated fast < slow is a details entry on the fast field of that row', async () => {
      const macd = on('macd');
      row(macd, 'buy', 0).fast = 26;
      row(macd, 'buy', 0).slow = 12;
      const { status, body } = send(await rejection(service.save(USER, patch({ macd }, 0))));
      expect(status).toBe(422);
      expect(body.error.details).toEqual([
        {
          path: 'indicators.macd.buy.rules.0.fast',
          message: 'Mua · dòng 1: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm.',
          side: 'buy',
          row: 1,
        },
      ]);
    });

    it('CONFIG_FORMAT_OUTDATED exposes the revision in details', async () => {
      seedRevision(1, v2Document());
      const { status, body } = send(await rejection(service.getRevision(USER, 1)));
      expect(status).toBe(422);
      expect(body.error).toMatchObject({
        code: 'CONFIG_FORMAT_OUTDATED',
        details: [{ field: 'revision', revision: 1 }],
      });
    });

    it('SIDE_REQUIRED and CAPABILITY_LOCKED also expose details', async () => {
      const closed = indicator('rsi');
      closed.master_enabled = true; // master ON with both sides OFF from a master-OFF base
      const side = send(await rejection(service.save(USER, patch({ rsi: closed }, 0))));
      expect(side.status).toBe(422);
      expect(side.body.error).toMatchObject({
        code: 'SIDE_REQUIRED',
        details: [{ path: 'indicators.rsi', message: expect.any(String) }],
      });

      const locked = send(await rejection(service.save(USER, patch({ ma: on('ma') }, 0))));
      expect(locked.status).toBe(403);
      expect(locked.body.error).toMatchObject({
        code: 'CAPABILITY_LOCKED',
        details: [{ capability: 'indicator:ma', reason: 'not_learned', indicator: 'ma' }],
      });
    });

    it('does not change the envelope of other errors (no details when none are set)', () => {
      const plain = send(new NotFoundException({ code: 'FEATURE_DISABLED', message: 'x' }));
      expect(plain.body.error).toEqual({ code: 'FEATURE_DISABLED', message: 'x' });
    });
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

  it('B01 master ON + Buy ON + Sell OFF is active only on E_buy and keeps Sell rows stored', async () => {
    const rsi = on('rsi');
    rsi.sell.enabled = false;
    row(rsi, 'sell', 0).period = 10;
    row(rsi, 'sell', 0).threshold = 75;
    const result = await service.save(USER, patch({ rsi }, 0));
    const saved = result.config.indicators.rsi!;
    expect(saved.master_enabled).toBe(true);
    expect(saved.buy.enabled).toBe(true);
    expect(saved.sell.enabled).toBe(false);
    expect(row(saved, 'sell', 0)).toMatchObject({ period: 10, threshold: 75 });

    const registry = loadTechnicalRegistry();
    expect(activeSideIndicators(result.config, 'buy', registry).map((e) => e.id)).toContain('rsi');
    expect(activeSideIndicators(result.config, 'sell', registry).map((e) => e.id)).not.toContain(
      'rsi',
    );
  });

  it('B02 master OFF keeps children; re-enabling restores the saved choices without enabling both sides', async () => {
    const first = on('rsi');
    first.sell.enabled = false;
    row(first, 'buy', 0).period = 30;
    row(first, 'sell', 0).threshold = 75;
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
    expect(row(restored.config.indicators.rsi!, 'sell', 0).threshold).toBe(75);
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

    // An operator outside the row's options (RSI dòng 1 has only > and <) is CONFIG_INVALID.
    const badOp = on('rsi');
    row(badOp, 'buy', 0).op = 'cross_up';
    const opError = await rejection(service.save(USER, patch({ rsi: badOp }, 0)));
    expect(opError.getStatus()).toBe(422);
    expect(opError.getResponse()).toMatchObject({
      code: 'CONFIG_INVALID',
      errors: [
        {
          path: 'indicators.rsi.buy.rules.0.op',
          message: 'Mua · dòng 1: Dấu so sánh không hợp lệ.',
          side: 'buy',
          row: 1,
        },
      ],
    });

    // Unknown row keys, a swapped row id and a missing row are refused by the shared validator.
    const tampered = on('rsi');
    (rowsOf(tampered.buy)[0] as Record<string, unknown>).allowed_ops = ['∈'];
    rowsOf(tampered.sell)[0]!.id = 'rsi.trend';
    const tamperedError = await rejection(
      service.save(USER, {
        expected_revision: 0,
        idempotency_key: 'long-enough',
        indicators: { rsi: tampered },
        actor_id: OTHER_USER,
      } as unknown as SharedConfigPatchInput),
    );
    expect(tamperedError.getStatus()).toBe(422);
    expect(
      (tamperedError.getResponse().errors as Array<{ path: string }>).map((e) => e.path),
    ).toEqual(['indicators.rsi.buy.rules.0.allowed_ops', 'indicators.rsi.sell.rules.0.id']);
    const short = on('rsi');
    rowsOf(short.buy).pop();
    const shortError = await rejection(service.save(USER, patch({ rsi: short }, 0)));
    expect(shortError.getResponse()).toMatchObject({
      code: 'CONFIG_INVALID',
      errors: [{ path: 'indicators.rsi.buy.rules', message: 'RSI Mua: sai số dòng điều kiện.' }],
    });

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

  it('B05 changing a Buy row leaves the Sell rows untouched', async () => {
    const saved = on('rsi');
    row(saved, 'sell', 0).period = 10;
    row(saved, 'sell', 0).threshold = 75;
    await service.save(USER, patch({ rsi: saved }, 0));

    const edit = structuredClone(saved);
    row(edit, 'buy', 0).period = 12;
    const result = await service.save(USER, patch({ rsi: edit }, 1));
    expect(row(result.config.indicators.rsi!, 'buy', 0).period).toBe(12);
    expect(result.config.indicators.rsi!.sell).toEqual(saved.sell);
    expect(row(memory.revisions[0]!.config.indicators.rsi!, 'sell', 0)).toMatchObject({
      period: 10,
      threshold: 75,
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
      schema_version: '3.0',
      rule_version: 'iqx-rules-4.0',
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

    const stored = await store.revision(USER, 3);
    expect(stored).toMatchObject({ revision: 3, effective_session: '2025-01-06' });
    expect(stored!.saved_at).toEqual(new Date(savedAt));

    calls.length = 0;
    await store.resumeConfigPause(USER, 4);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).toMatch(
      /update bot_config_pauses set resume_revision = \$2, resumed_at = now\(\)\s+where user_id = \$1 and resume_revision is null/,
    );
    expect(calls[0]!.values).toEqual([USER, 4]);
    expect(await store.activeCalendar()).toBeNull();
  });
});
