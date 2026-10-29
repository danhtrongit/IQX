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
  isCurrentFormat,
  isLegacyConfig,
  isRowsEntry,
  loadTechnicalRegistry,
  removedIndicatorIds,
  resetToCurrentFormat,
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

/**
 * A stored revision read through the current contract (`iqx-rules-4.0`). `outdated` documents
 * are read as the SPEC V3 reset (defaults + switches) and carry a review that blocks both sides.
 */
export type StoredConfigView = {
  config: SharedConfig;
  outdated: boolean;
  legacy: LegacyConfigReview | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Review of an outdated document: conditions reset, both sides blocked until the user saves. */
function outdatedReview(stored: unknown, registry: readonly RegistryEntry[]): LegacyConfigReview {
  const indicators = isRecord(stored) && isRecord(stored.indicators) ? stored.indicators : {};
  const removed = removedIndicatorIds(indicators);
  return {
    from_rule_version:
      isRecord(stored) && typeof stored.rule_version === 'string' ? stored.rule_version : 'unknown',
    legacy: true,
    reset: true,
    removed_indicators: removed,
    defaulted_indicators: registry
      .filter((entry) => indicators[entry.id] === undefined)
      .map((entry) => entry.id),
    buy: { status: 'legacy_needs_review', indicators: removed },
    sell: { status: 'legacy_needs_review', indicators: removed },
    needs_review: true,
  };
}

/**
 * Reads a stored config document (SPEC V3 §6.1.5). A current-format document (`iqx-rules-4.0`)
 * is returned as is. Any other document (`iqx-rules-3.0`, `iqx-rules-2.0`, unreadable) is never
 * mapped: it reads as the SPEC V3 defaults keeping only the switches (`master_enabled`,
 * `buy.enabled`, `sell.enabled`) of the current indicators, Volume copied verbatim when valid
 * (`resetToCurrentFormat`), with `outdated: true`.
 */
export function readStoredConfig(
  stored: unknown,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): StoredConfigView {
  if (isCurrentFormat(stored, registry))
    return { config: stored as SharedConfig, outdated: false, legacy: null };
  return {
    config: resetToCurrentFormat(stored, registry),
    outdated: true,
    legacy: outdatedReview(stored, registry),
  };
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
 * - master OFF keeps child enabled/rows; row edits never flip master.
 * Each side is copied independently: Buy rows are never reused for Sell.
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
      indicators: this.registry().map((entry) => {
        const base = {
          id: entry.id,
          name: entry.name,
          chapter: entry.chapter,
          lesson_id: entry.lesson_id,
          family: entry.family,
          formula: entry.formula,
          availability: entry.availability,
          learned: grants.has(indicatorCapability(entry.id)),
        };
        if (isRowsEntry(entry)) {
          return {
            ...base,
            model: 'rows' as const,
            rows: entry.rows.map((row) => ({
              id: row.id,
              sentence: row.sentence,
              fields: structuredClone(row.fields),
              constraints: structuredClone(row.constraints),
              default_enabled: row.default_enabled,
              buy: { ...row.buy },
              sell: { ...row.sell },
            })),
          };
        }
        return {
          ...base,
          model: 'legacy_params' as const,
          fields: structuredClone(entry.fields),
          validation: { cross_fields: structuredClone(entry.validation?.cross_fields ?? []) },
          buy: structuredClone(entry.buy),
          sell: structuredClone(entry.sell),
        };
      }),
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
    // reader as the saved one.
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
        outdated: view.outdated,
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
      outdated: stored?.outdated ?? false,
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
      legacy: isLegacyConfig(row.config, this.registry()),
      outdated: !isCurrentFormat(row.config, this.registry()),
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

      // An outdated revision is the base through its SPEC V3 reset (defaults + switches); the new
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
      // SPEC V3 §6.2: saving the config resumes a Bot paused by the upgrade, from the session
      // this revision becomes effective.
      await store.resumeConfigPause(userId, revision);
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
      outdated: stored.outdated,
      legacy: stored.legacy,
    };
  }

  async getRevision(userId: string, revision: number, options: GetRevisionOptions = {}) {
    const row = await this.repository.store().revision(userId, revision);
    if (!row) return null;
    const stored = readStoredConfig(row.config, this.registry());
    if (stored.outdated && options.allowOutdated !== true && options.allowLegacyReview !== true) {
      // SPEC V3 §6.1.5: an outdated revision is never run or pinned (its conditions are not
      // mapped); Backtest and Alerts ask the user to save the config in the new format.
      throw new UnprocessableEntityException({
        code: 'CONFIG_FORMAT_OUTDATED',
        message:
          'Phiên bản cấu hình này dùng định dạng điều kiện cũ. Hãy lưu lại cấu hình theo mẫu điều kiện mới.',
        revision: row.revision,
        details: [{ field: 'revision', revision: row.revision }],
      });
    }
    return {
      revision: row.revision,
      config: stored.config,
      config_hash: row.config_hash,
      saved_at: row.saved_at.toISOString(),
      outdated: stored.outdated,
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
          message: `Cần đạt bài kiểm tra của bài học chỉ báo ${id} trước khi bật.`,
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
