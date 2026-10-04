import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';

import { ACADEMY_GRANTS, type AcademyGrantsPort } from '../academy/academy.ports.js';
import {
  CALCULATION_VERSION,
  RULE_VERSION,
  SCHEMA_VERSION,
  canonicalJson,
  configHash,
  defaultConfig,
  indicatorCapability,
  loadTechnicalRegistry,
  validateConfig,
  type IndicatorConfig,
  type RegistryEntry,
  type SharedConfig,
} from '../quant/v2/index.js';
import {
  effectiveStatus,
  nextEffectiveSession,
  tradingDayPredicate,
  vnDate,
} from './strategy-config.calendar.js';
import type { EffectiveSharedConfig, SharedConfigReaderPort } from './strategy-config.ports.js';
import {
  SharedConfigRepository,
  type RevisionRow,
  type SharedConfigStore,
  type SharedConfigStoreProvider,
} from './strategy-config.repository.js';
import type {
  SharedConfigPatchInput,
  SharedConfigRevisionSummary,
  SharedConfigSaveResult,
  SharedConfigState,
  TechnicalRegistryResponse,
} from './strategy-config.schemas.js';

const isOn = (indicator: IndicatorConfig | undefined): boolean =>
  indicator?.master_enabled === true;
const bothSidesOff = (indicator: IndicatorConfig): boolean =>
  !indicator.buy.enabled && !indicator.sell.enabled;

/**
 * Applies the request indicators onto the saved config (SHARED-CONFIG-API §3 switch rules):
 * - a saved indicator with both children OFF is saved with master OFF;
 * - master ON with both children OFF is normalised to master OFF when the saved master was ON
 *   (the user switched both children off) and rejected with 422 SIDE_REQUIRED when the saved
 *   master was OFF (turning master on needs a chosen side; nothing is auto-enabled);
 * - master OFF keeps child enabled/params/rules; params edits never flip master.
 * Each side is copied independently: Buy params are never reused for Sell.
 */
export function mergeIndicatorPatch(
  base: SharedConfig,
  patch: Readonly<Record<string, IndicatorConfig>>,
): SharedConfig {
  const merged = structuredClone(base);
  for (const [id, requested] of Object.entries(patch)) {
    const next: IndicatorConfig = {
      master_enabled: requested.master_enabled,
      buy: structuredClone(requested.buy),
      sell: structuredClone(requested.sell),
    };
    if (next.master_enabled && bothSidesOff(next)) {
      if (!isOn(base.indicators[id])) {
        throw new UnprocessableEntityException({
          code: 'SIDE_REQUIRED',
          message: `Chọn ít nhất một phía Mua hoặc Bán trước khi bật chỉ báo ${id}.`,
          indicator: id,
        });
      }
      next.master_enabled = false;
    }
    merged.indicators[id] = next;
  }
  return merged;
}

@Injectable()
export class SharedConfigService implements SharedConfigReaderPort {
  constructor(
    @Inject(SharedConfigRepository) private readonly repository: SharedConfigStoreProvider,
    @Inject(ACADEMY_GRANTS) private readonly grants: AcademyGrantsPort,
  ) {}

  private registry(): readonly RegistryEntry[] {
    return loadTechnicalRegistry();
  }

  async technicalRegistry(userId: string): Promise<TechnicalRegistryResponse> {
    const grants = await this.grants.grantedCapabilities(userId);
    return {
      calculation_version: CALCULATION_VERSION,
      rule_version: RULE_VERSION,
      indicators: this.registry().map((entry) => ({
        id: entry.id,
        name: entry.name,
        chapter: entry.chapter,
        lesson_id: entry.lesson_id,
        family: entry.family,
        formula: entry.formula,
        availability: entry.availability,
        fields: structuredClone(entry.fields),
        buy: structuredClone(entry.buy),
        sell: structuredClone(entry.sell),
        learned: grants.has(indicatorCapability(entry.id)),
      })),
    };
  }

  async current(userId: string): Promise<SharedConfigState> {
    const now = new Date();
    const store = this.repository.store();
    const [grants, latest, effective] = await Promise.all([
      this.grants.grantedCapabilities(userId),
      store.latestRevision(userId),
      store.effectiveRevision(userId, vnDate(now)),
    ]);
    const config = latest?.config ?? defaultConfig(this.registry());
    return {
      saved_revision: latest?.revision ?? 0,
      effective_revision: effective?.revision ?? null,
      effective_session: latest?.effective_session ?? null,
      // Never saved: nothing is scheduled, so it is not reported as effective.
      status: latest ? this.status(latest, now) : 'pending',
      config,
      config_hash: latest?.config_hash ?? configHash(config),
      registry_version: CALCULATION_VERSION,
      granted_indicators: this.registry()
        .map((entry) => entry.id)
        .filter((id) => grants.has(indicatorCapability(id))),
    };
  }

  async revisions(userId: string, limit: number): Promise<SharedConfigRevisionSummary[]> {
    const now = new Date();
    const rows = await this.repository.store().listRevisions(userId, limit);
    return rows.map((row) => ({
      revision: row.revision,
      saved_at: row.saved_at.toISOString(),
      config_hash: row.config_hash,
      effective_session: row.effective_session,
      status: this.status(row, now),
    }));
  }

  async save(userId: string, input: SharedConfigPatchInput): Promise<SharedConfigSaveResult> {
    const requestedAt = new Date();
    const grants = await this.grants.grantedCapabilities(userId);
    const registry = this.registry();
    return this.repository.transaction(async (store) => {
      await store.lockOwner(userId);

      const replay = await store.revisionByIdempotencyKey(userId, input.idempotency_key);
      if (replay) return this.replay(replay, input);

      const latest = await store.latestRevision(userId);
      const currentRevision = latest?.revision ?? 0;
      if (currentRevision !== input.expected_revision) {
        throw new ConflictException({
          code: 'REVISION_CONFLICT',
          message: 'Cấu hình đã được lưu ở nơi khác. Tải lại để xem bản mới nhất.',
          current_revision: currentRevision,
        });
      }

      const unknown = Object.keys(input.indicators).filter(
        (id) => !registry.some((entry) => entry.id === id),
      );
      if (unknown.length) {
        throw new UnprocessableEntityException({
          code: 'CONFIG_INVALID',
          message: 'Cấu hình không hợp lệ.',
          errors: unknown.map((id) => ({
            path: `indicators.${id}`,
            message: `Chỉ báo không được hỗ trợ: ${id}.`,
          })),
        });
      }

      const base = latest?.config ?? defaultConfig(registry);
      const merged = mergeIndicatorPatch(base, input.indicators);
      this.assertLearned(merged, input.indicators, grants);
      // Indicators already master ON in the saved config and untouched by this PATCH are not
      // re-checked against grants.
      const allowed = new Set(grants);
      for (const [id, indicator] of Object.entries(base.indicators)) {
        if (!(id in input.indicators) && isOn(indicator)) allowed.add(indicatorCapability(id));
      }

      const revision = currentRevision + 1;
      const config: SharedConfig = { ...merged, revision };
      const errors = validateConfig(config, registry, allowed);
      if (errors.length) {
        throw new UnprocessableEntityException({
          code: 'CONFIG_INVALID',
          message: 'Cấu hình không hợp lệ.',
          errors,
        });
      }

      const hash = configHash(config);
      const { saved_at: savedAt } = await store.insertRevision({
        user_id: userId,
        revision,
        schema_version: SCHEMA_VERSION,
        rule_version: RULE_VERSION,
        calculation_version: CALCULATION_VERSION,
        config,
        config_hash: hash,
        before_hash: latest?.config_hash ?? configHash(base),
        patch: input.indicators,
        requested_at: requestedAt,
        actor_id: userId,
        idempotency_key: input.idempotency_key,
      });
      const effectiveSession = await this.effectiveSessionFor(store, savedAt);
      const status = effectiveStatus(effectiveSession, new Date());
      await store.insertEffectiveSession({
        user_id: userId,
        revision,
        effective_session: effectiveSession,
        status,
      });
      return { revision, config, config_hash: hash, effective_session: effectiveSession, status };
    });
  }

  async effectiveFor(userId: string, sessionDate: string): Promise<EffectiveSharedConfig | null> {
    const row = await this.repository.store().effectiveRevision(userId, sessionDate);
    if (!row?.effective_session) return null;
    return {
      revision: row.revision,
      config: row.config,
      config_hash: row.config_hash,
      effective_session: row.effective_session,
    };
  }

  async getRevision(userId: string, revision: number) {
    const row = await this.repository.store().revision(userId, revision);
    if (!row) return null;
    return {
      revision: row.revision,
      config: row.config,
      config_hash: row.config_hash,
      saved_at: row.saved_at.toISOString(),
    };
  }

  private replay(row: RevisionRow, input: SharedConfigPatchInput): SharedConfigSaveResult {
    const samePayload =
      row.revision - 1 === input.expected_revision &&
      canonicalJson(row.patch) === canonicalJson(input.indicators);
    if (!samePayload) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Khóa idempotency đã được dùng cho một yêu cầu khác.',
      });
    }
    return {
      revision: row.revision,
      config: row.config,
      config_hash: row.config_hash,
      effective_session: row.effective_session,
      status: this.status(row, new Date()),
    };
  }

  /** Master ON in a patched indicator needs the learned capability `indicator:<id>`. */
  private assertLearned(
    merged: SharedConfig,
    patch: Readonly<Record<string, IndicatorConfig>>,
    grants: ReadonlySet<string>,
  ): void {
    for (const id of Object.keys(patch)) {
      const capability = indicatorCapability(id);
      if (isOn(merged.indicators[id]) && !grants.has(capability)) {
        throw new ForbiddenException({
          code: 'CAPABILITY_LOCKED',
          message: `Cần hoàn thành bài học của chỉ báo ${id} (8/8) trước khi bật.`,
          capability,
          reason: 'not_learned',
        });
      }
    }
  }

  private async effectiveSessionFor(store: SharedConfigStore, savedAt: Date) {
    const isTradingDay = tradingDayPredicate(await store.activeCalendar());
    return isTradingDay ? nextEffectiveSession(savedAt, isTradingDay) : null;
  }

  private status(row: RevisionRow, now: Date) {
    if (row.session_status === 'calendar_unavailable') return 'calendar_unavailable';
    return effectiveStatus(row.effective_session, now);
  }
}
