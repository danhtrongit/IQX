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
  isLegacyConfig,
  loadTechnicalRegistry,
  mapLegacyConfig,
  validateConfig,
  type IndicatorConfig,
  type LegacyConfigReview,
  type RegistryEntry,
  type SharedConfig,
} from '../quant/v2/index.js';
import {
  effectiveStatus,
  nextEffectiveSession,
  tradingDayPredicate,
  vnDate,
} from './strategy-config.calendar.js';
import type {
  EffectiveSharedConfig,
  GetRevisionOptions,
  SharedConfigReaderPort,
} from './strategy-config.ports.js';
import {
  SharedConfigRepository,
  type RevisionRow,
  type SharedConfigStore,
  type SharedConfigStoreProvider,
} from './strategy-config.repository.js';
import type {
  EffectiveSharedConfigView,
  SharedConfigPatchInput,
  SharedConfigRevisionSummary,
  SharedConfigSaveResult,
  SharedConfigState,
  TechnicalRegistryResponse,
} from './strategy-config.schemas.js';

/** A stored revision read through the current 16-indicator contract. */
export type StoredConfigView = { config: SharedConfig; legacy: LegacyConfigReview | null };

const UNREADABLE_REVIEW: LegacyConfigReview = {
  from_rule_version: 'unknown',
  legacy: true,
  removed_indicators: [],
  defaulted_indicators: [],
  buy: { status: 'legacy_needs_review', indicators: [] },
  sell: { status: 'legacy_needs_review', indicators: [] },
  needs_review: true,
};

/**
 * Reads a stored config document. A current (`iqx-rules-3.0`) document is returned as is; a
 * historical 35-indicator document is mapped to the 16-indicator shape together with its review
 * (see `mapLegacyConfig`). A document that cannot be mapped is never trusted: it reads as the
 * registry default with both sides flagged `legacy_needs_review`.
 */
export function readStoredConfig(
  stored: unknown,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): StoredConfigView {
  if (!isLegacyConfig(stored)) return { config: stored as SharedConfig, legacy: null };
  const mapped = mapLegacyConfig(stored, registry);
  if (mapped.ok) return { config: mapped.mapping.config, legacy: mapped.mapping.review };
  return { config: defaultConfig(registry), legacy: UNREADABLE_REVIEW };
}

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
          details: [
            {
              path: `indicators.${id}`,
              message: `Chọn ít nhất một phía Mua hoặc Bán trước khi bật chỉ báo ${id}.`,
            },
          ],
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
        validation: { cross_fields: structuredClone(entry.validation?.cross_fields ?? []) },
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
    const stored = latest ? readStoredConfig(latest.config, this.registry()) : null;
    const config = stored?.config ?? defaultConfig(this.registry());
    // The config in force can be an older revision than the latest saved one (a newer save is
    // pending until its effective session), so it is returned in full, read through the same
    // legacy mapping as the saved one.
    let inForce: EffectiveSharedConfigView | null = null;
    if (effective?.effective_session) {
      const view =
        stored && effective.revision === latest?.revision
          ? stored
          : readStoredConfig(effective.config, this.registry());
      inForce = {
        revision: effective.revision,
        effective_session: effective.effective_session,
        config_hash: effective.config_hash,
        config: view.config,
        legacy: view.legacy,
      };
    }
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
      legacy: stored?.legacy ?? null,
      effective: inForce,
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
      legacy: isLegacyConfig(row.config),
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
          // The v2 error envelope forwards only `code`, `message` and an array `details`.
          details: [{ field: 'expected_revision', current_revision: currentRevision }],
        });
      }

      const unknown = Object.keys(input.indicators).filter(
        (id) => !registry.some((entry) => entry.id === id),
      );
      if (unknown.length) {
        const errors = unknown.map((id) => ({
          path: `indicators.${id}`,
          message: `Chỉ báo không được hỗ trợ: ${id}.`,
        }));
        throw new UnprocessableEntityException({
          code: 'CONFIG_INVALID',
          message: 'Cấu hình không hợp lệ.',
          errors,
          details: errors,
        });
      }

      // A historical (35-indicator) revision is the base through its 16-indicator mapping; the new
      // revision is saved in the current shape and `before_hash` keeps the stored document's hash.
      const base = latest
        ? readStoredConfig(latest.config, registry).config
        : defaultConfig(registry);
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
          details: errors,
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
    const stored = readStoredConfig(row.config, this.registry());
    return {
      revision: row.revision,
      config: stored.config,
      config_hash: row.config_hash,
      effective_session: row.effective_session,
      legacy: stored.legacy,
    };
  }

  async getRevision(userId: string, revision: number, options: GetRevisionOptions = {}) {
    const row = await this.repository.store().revision(userId, revision);
    if (!row) return null;
    const stored = readStoredConfig(row.config, this.registry());
    if (stored.legacy?.needs_review && options.allowLegacyReview !== true) {
      // Never hand out a mapping that silently omits an ON rule of a removed indicator.
      throw new UnprocessableEntityException({
        code: 'LEGACY_CONFIG_NEEDS_REVIEW',
        message:
          'Phiên bản cấu hình cũ dùng chỉ báo đã bỏ khỏi danh mục. Hãy kiểm tra và lưu cấu hình mới.',
        revision: row.revision,
        legacy: stored.legacy,
      });
    }
    return {
      revision: row.revision,
      config: stored.config,
      config_hash: row.config_hash,
      saved_at: row.saved_at.toISOString(),
      legacy: stored.legacy,
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
      config: readStoredConfig(row.config, this.registry()).config,
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
          details: [{ capability, reason: 'not_learned', indicator: id }],
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
