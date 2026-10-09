import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { ACADEMY_GRANTS, type AcademyGrantsPort } from '../academy/academy.ports.js';
import {
  CALCULATION_VERSION,
  RULE_VERSION,
  SCHEMA_VERSION,
  canonicalJson,
  configHash,
  indicatorCapability,
  loadTechnicalRegistry,
  sha256Hex,
  validateConfig,
  type SharedConfig,
  type Side,
} from '../quant/v2/index.js';
import {
  SHARED_CONFIG_READER,
  type SharedConfigReaderPort,
} from '../strategy-config/strategy-config.ports.js';
import {
  EVENT_KIND_LABEL,
  SIDE_LABEL,
  activeIndicatorIds,
  definitionHash,
} from './strategy-alerts.evaluation.js';
import { StrategyAlertsRepository } from './strategy-alerts.repository.js';
import type {
  AlertScopeInput,
  AlertSourceInput,
  StrategyAlertCreateInput,
  StrategyAlertDetailView,
  StrategyAlertEventsQuery,
  StrategyAlertEventView,
  StrategyAlertUpdateInput,
  StrategyAlertView,
} from './strategy-alerts.schemas.js';
import type {
  NewVersionInput,
  StrategyAlertsStore,
  UpdateAlertInput,
} from './strategy-alerts.store.js';
import type {
  AlertEventRow,
  AlertScope,
  AlertSource,
  AlertVersionRow,
  AlertWithVersion,
  StateSummary,
} from './strategy-alerts.types.js';

const unprocessable = (code: string, message: string, details?: unknown[]) =>
  new UnprocessableEntityException({ code, message, ...(details ? { details } : {}) });

const alertNotFound = () =>
  new NotFoundException({ code: 'ALERT_NOT_FOUND', message: 'Không tìm thấy cảnh báo' });

type SidesDetail = Record<Side, { valid: boolean; watched: boolean; indicator_ids: string[] }>;

export function sidesDetail(config: SharedConfig, watched: readonly Side[]): SidesDetail {
  const detail = (side: Side) => {
    const ids = activeIndicatorIds(config, side);
    return { valid: ids.length > 0, watched: watched.includes(side), indicator_ids: ids };
  };
  return { buy: detail('buy'), sell: detail('sell') };
}

type Resolved = {
  source: AlertSource;
  config: SharedConfig;
  config_hash: string;
  suggested_symbol: string | null;
};

/**
 * Strategy alert definitions: pinned condition snapshot (shared-config revision or the config of
 * one backtest run), watched scope and sides, enabled/paused. Server-side checks: ownership,
 * `indicator:<id>` grants of the snapshot, valid symbols, non-empty side condition sets.
 * Never places an order and never writes shared config.
 */
@Injectable()
export class StrategyAlertsService {
  constructor(
    @Inject(StrategyAlertsRepository) private readonly store: StrategyAlertsStore,
    @Inject(SHARED_CONFIG_READER) private readonly reader: SharedConfigReaderPort,
    @Inject(ACADEMY_GRANTS) private readonly grants: AcademyGrantsPort,
  ) {}

  async list(userId: string): Promise<{ items: StrategyAlertView[] }> {
    const alerts = await this.store.list(userId);
    const summaries = await this.store.stateSummaries(alerts.map((alert) => alert.id));
    return { items: alerts.map((alert) => this.view(alert, summaries)) };
  }

  async get(userId: string, alertId: string): Promise<StrategyAlertDetailView> {
    const alert = await this.store.get(userId, alertId);
    if (!alert) throw alertNotFound();
    const [summaries, versions] = await Promise.all([
      this.store.stateSummaries([alert.id]),
      this.store.versions(alert.id),
    ]);
    return {
      ...this.view(alert, summaries),
      versions: versions.map((version) => this.versionView(version)),
    };
  }

  /** What a source would pin (which sides are usable) before the alert is saved. */
  async previewSource(userId: string, source: AlertSourceInput) {
    const resolved = await this.resolveSource(userId, source);
    return {
      source: resolved.source,
      config_hash: resolved.config_hash,
      rule_version: RULE_VERSION,
      calculation_version: CALCULATION_VERSION,
      sides_detail: sidesDetail(resolved.config, []),
      suggested_symbol: resolved.suggested_symbol,
    };
  }

  async create(userId: string, input: StrategyAlertCreateInput): Promise<StrategyAlertDetailView> {
    const version = await this.buildVersion(userId, null, {
      source: input.source,
      scope: input.scope,
      sides: input.sides,
    });
    const requestHash = sha256Hex(
      canonicalJson({
        name: input.name.trim(),
        source: input.source,
        scope: input.scope,
        sides: [...input.sides].sort(),
        enabled: input.enabled,
      }),
    );
    const created = await this.store.create({
      user_id: userId,
      name: input.name,
      enabled: input.enabled,
      version,
      idempotency_key: input.idempotency_key ?? null,
      request_hash: requestHash,
    });
    return this.get(userId, created.id);
  }

  async update(
    userId: string,
    alertId: string,
    input: StrategyAlertUpdateInput,
  ): Promise<StrategyAlertDetailView> {
    const current = await this.store.get(userId, alertId);
    if (!current) throw alertNotFound();
    const patch: UpdateAlertInput = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    if (input.expected_version !== undefined) patch.expected_version = input.expected_version;
    const definitionChanged =
      input.source !== undefined && input.source.kind !== 'keep'
        ? true
        : input.scope !== undefined || input.sides !== undefined;
    if (definitionChanged) {
      patch.version = await this.buildVersion(userId, current.version_row, {
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.sides !== undefined ? { sides: input.sides } : {}),
      });
    }
    const updated = await this.store.update(userId, alertId, patch);
    return this.get(userId, updated.id);
  }

  async remove(userId: string, alertId: string): Promise<void> {
    if (!(await this.store.remove(userId, alertId))) throw alertNotFound();
  }

  async listEvents(userId: string, query: StrategyAlertEventsQuery) {
    const { items, total } = await this.store.listEvents(userId, {
      ...(query.side ? { side: query.side } : {}),
      ...(query.alert_id ? { alert_id: query.alert_id } : {}),
      ...(query.symbol ? { symbol: query.symbol } : {}),
      offset: query.offset,
      limit: query.limit,
    });
    return {
      items: items.map((row) => this.eventView(row)),
      total,
      offset: query.offset,
      limit: query.limit,
    };
  }

  async getEvent(userId: string, eventId: string): Promise<StrategyAlertEventView> {
    const row = await this.store.getEvent(userId, eventId);
    if (!row)
      throw new NotFoundException({
        code: 'ALERT_EVENT_NOT_FOUND',
        message: 'Không tìm thấy tín hiệu',
      });
    return this.eventView(row);
  }

  // --- snapshot resolution ----------------------------------------------------------------

  private async resolveSource(userId: string, source: AlertSourceInput): Promise<Resolved> {
    if (source.kind === 'shared_config') {
      // Throws 422 LEGACY_CONFIG_NEEDS_REVIEW for a historical revision whose removed indicators
      // were ON: such a revision is never pinned (nothing is silently dropped from the AND).
      const revision = await this.reader.getRevision(userId, source.revision);
      if (!revision)
        throw new NotFoundException({
          code: 'REVISION_NOT_FOUND',
          message: 'Không tìm thấy phiên bản cấu hình đã lưu.',
        });
      return {
        source: {
          kind: 'shared_config',
          revision: revision.revision,
          saved_at: revision.saved_at,
          stored_config_hash: revision.config_hash,
        },
        config: revision.config,
        config_hash: revision.legacy?.legacy ? configHash(revision.config) : revision.config_hash,
        suggested_symbol: null,
      };
    }
    const run = await this.store.findOwnedSucceededRun(userId, source.run_id);
    if (!run)
      throw new NotFoundException({
        code: 'BACKTEST_RUN_NOT_FOUND',
        message: 'Không tìm thấy kết quả backtest.',
      });
    if (!run.config)
      throw unprocessable('RUN_CONFIG_UNAVAILABLE', 'Kết quả backtest này không lưu cấu hình.');
    return {
      source: {
        kind: 'backtest_run',
        run_id: run.id,
        shared_revision: run.shared_revision,
        symbol: run.symbol,
        start: run.start,
        end: run.end,
        run_created_at: new Date(run.created_at).toISOString(),
      },
      config: run.config,
      config_hash: configHash(run.config),
      suggested_symbol: run.symbol,
    };
  }

  /** Validates and assembles the immutable version a create/update would write. */
  private async buildVersion(
    userId: string,
    current: AlertVersionRow | null,
    input: {
      source?: AlertSourceInput | { kind: 'keep' };
      scope?: AlertScopeInput;
      sides?: readonly Side[];
    },
  ): Promise<NewVersionInput> {
    let source: AlertSource;
    let config: SharedConfig;
    let hash: string;
    if (!input.source || input.source.kind === 'keep') {
      if (!current)
        throw unprocessable('SOURCE_REQUIRED', 'Cần chọn nguồn cấu hình cho cảnh báo mới.');
      source = current.source;
      config = current.config;
      hash = current.config_hash;
    } else {
      const resolved = await this.resolveSource(userId, input.source);
      source = resolved.source;
      config = resolved.config;
      hash = resolved.config_hash;
    }

    const errors = validateConfig(config, loadTechnicalRegistry());
    if (errors.length)
      throw unprocessable(
        'CONFIG_INVALID',
        'Cấu hình được ghim không hợp lệ.',
        errors.map((error) => ({ path: error.path, message: error.message })),
      );

    const sides = [...new Set(input.sides ?? current?.sides ?? [])].sort() as Side[];
    if (!sides.length) throw unprocessable('SIDES_REQUIRED', 'Cần chọn ít nhất một phía theo dõi.');
    const empty = sides.filter((side) => activeIndicatorIds(config, side).length === 0);
    if (empty.length)
      throw unprocessable(
        'SIDE_NOT_AVAILABLE',
        `Nguồn cấu hình không có điều kiện hợp lệ cho phía ${empty.map((side) => SIDE_LABEL[side]).join(', ')}; không thể theo dõi phía rỗng.`,
        empty.map((side) => ({ side, reason: 'no_valid_conditions' })),
      );

    // Every indicator that decides a watched side must be granted now (the grants of the
    // snapshot), otherwise the alert would run on tools the account has not opened.
    const needed = [...new Set(sides.flatMap((side) => activeIndicatorIds(config, side)))];
    const granted = await this.grants.grantedCapabilities(userId);
    const locked = needed.filter((id) => !granted.has(indicatorCapability(id)));
    if (locked.length)
      throw new ForbiddenException({
        code: 'CAPABILITY_LOCKED',
        message: `Cần hoàn thành bài học của chỉ báo ${locked.join(', ')} (8/8) trước khi tạo cảnh báo.`,
        capability: indicatorCapability(locked[0]!),
        capabilities: locked.map(indicatorCapability),
        reason: 'not_learned',
        details: locked.map((id) => ({
          capability: indicatorCapability(id),
          reason: 'not_learned',
        })),
      });

    const { scope, symbols } = await this.resolveScope(userId, current, input.scope);
    const unknownSymbols = await this.unknownSymbols(symbols);
    if (unknownSymbols.length)
      throw unprocessable(
        'SYMBOL_INVALID',
        'Có mã không thuộc danh mục mã đang hoạt động.',
        unknownSymbols.map((value) => ({ symbol: value })),
      );

    return {
      source,
      config,
      config_hash: hash,
      schema_version: SCHEMA_VERSION,
      rule_version: RULE_VERSION,
      calculation_version: CALCULATION_VERSION,
      scope,
      symbols,
      sides,
      definition_hash: definitionHash({
        config_hash: hash,
        symbols,
        sides,
        scope: scope.kind === 'saved_list' ? { kind: scope.kind, list_id: scope.list_id } : scope,
      }),
    };
  }

  private async resolveScope(
    userId: string,
    current: AlertVersionRow | null,
    input: AlertScopeInput | undefined,
  ): Promise<{ scope: AlertScope; symbols: string[] }> {
    if (!input) {
      if (!current) throw unprocessable('SCOPE_REQUIRED', 'Cần chọn mã hoặc danh mục để theo dõi.');
      return { scope: current.scope, symbols: [...current.symbols] };
    }
    if (input.kind === 'symbols') return { scope: { kind: 'symbols' }, symbols: input.symbols };
    const list = await this.store.findOwnedList(userId, input.list_id);
    if (!list)
      throw new NotFoundException({ code: 'LIST_NOT_FOUND', message: 'Không tìm thấy danh sách' });
    const tickers = [...new Set(list.tickers.map((ticker) => ticker.toUpperCase()))];
    let symbols = tickers;
    if (input.symbols) {
      const inList = new Set(tickers);
      const outside = input.symbols.filter((symbol) => !inList.has(symbol));
      if (outside.length)
        throw unprocessable(
          'SYMBOL_NOT_IN_LIST',
          'Có mã không thuộc danh mục đã chọn.',
          outside.map((symbol) => ({ symbol })),
        );
      symbols = input.symbols;
    }
    if (!symbols.length)
      throw unprocessable('SCOPE_EMPTY', 'Danh mục không có mã nào để theo dõi.');
    return {
      scope: {
        kind: 'saved_list',
        list_id: list.id,
        list_version: 1,
        list_name: list.name,
        list_as_of: list.as_of,
        list_ticker_count: tickers.length,
      },
      symbols,
    };
  }

  private async unknownSymbols(symbols: readonly string[]): Promise<string[]> {
    const known = await this.store.activeSymbols(symbols);
    return symbols.filter((symbol) => !known.has(symbol));
  }

  // --- views ------------------------------------------------------------------------------

  private versionView(version: AlertVersionRow) {
    return {
      version: version.version,
      source: version.source,
      config_hash: version.config_hash,
      schema_version: version.schema_version,
      rule_version: version.rule_version,
      calculation_version: version.calculation_version,
      scope: version.scope,
      symbols: version.symbols,
      sides: version.sides,
      sides_detail: sidesDetail(version.config, version.sides),
      definition_hash: version.definition_hash,
      created_at: new Date(version.created_at).toISOString(),
    };
  }

  private view(alert: AlertWithVersion, summaries: readonly StateSummary[]): StrategyAlertView {
    const version = alert.version_row;
    const summary = summaries.find(
      (item) => item.alert_id === alert.id && item.version === alert.current_version,
    );
    const expected = version.symbols.length * version.sides.length;
    const checked = summary?.total ?? 0;
    const lastCheck = {
      session: summary?.last_session ?? null,
      evaluated_at: summary?.last_evaluated_at
        ? new Date(summary.last_evaluated_at).toISOString()
        : null,
      pairs_expected: expected,
      pairs_checked: checked,
      satisfied: summary?.true_count ?? 0,
      not_satisfied: summary?.false_count ?? 0,
      unknown: summary?.unknown_count ?? 0,
      blocked: summary?.blocked_count ?? 0,
    };
    let status: StrategyAlertView['status'];
    if (!alert.enabled) status = 'paused';
    else if (lastCheck.blocked > 0) status = 'config_error';
    else if (checked === 0 || lastCheck.session === null) status = 'unchecked';
    else if (lastCheck.unknown > 0) status = 'waiting_data';
    else status = 'watching';
    return {
      id: alert.id,
      name: alert.name,
      enabled: alert.enabled,
      status,
      current_version: alert.current_version,
      observation_started_at: new Date(alert.observation_started_at).toISOString(),
      paused_at: alert.paused_at ? new Date(alert.paused_at).toISOString() : null,
      version: this.versionView(version),
      last_check: lastCheck,
      created_at: new Date(alert.created_at).toISOString(),
      updated_at: new Date(alert.updated_at).toISOString(),
    };
  }

  private eventView(row: AlertEventRow): StrategyAlertEventView {
    return {
      id: row.id,
      alert_id: row.alert_id,
      alert_version: row.alert_version,
      alert_name: row.alert_name,
      symbol: row.symbol,
      side: row.side,
      side_label: SIDE_LABEL[row.side],
      signal_session: row.signal_session,
      event_kind: row.event_kind,
      event_kind_label: EVENT_KIND_LABEL[row.event_kind],
      message: row.message,
      evaluated_at: new Date(row.evaluated_at).toISOString(),
      data_version: row.data_version,
      config_hash: row.config_hash,
      rule_version: row.rule_version,
      calculation_version: row.calculation_version,
      previous_valid_result: row.previous_valid_result,
      previous_valid_session: row.previous_valid_session,
      evidence: row.evidence as StrategyAlertEventView['evidence'],
      created_at: new Date(row.created_at).toISOString(),
    };
  }
}
