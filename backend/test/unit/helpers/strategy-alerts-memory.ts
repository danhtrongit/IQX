import { randomUUID } from 'node:crypto';

import { ConflictException, NotFoundException } from '@nestjs/common';

import {
  planEvaluation,
  type AlertStateRow,
} from '../../../src/modules/alerts/strategy-alerts.evaluation.js';
import {
  MAX_ALERTS_PER_USER,
  type CreateAlertInput,
  type NewVersionInput,
  type OwnedListInfo,
  type OwnedRunInfo,
  type StrategyAlertsStore,
  type UpdateAlertInput,
} from '../../../src/modules/alerts/strategy-alerts.store.js';
import type {
  AlertEventRow,
  AlertRow,
  AlertVersionRow,
  AlertWithVersion,
  ApplyEvaluationInput,
  ApplyEvaluationOutcome,
  EvaluationTarget,
  EventFilter,
  StateSummary,
} from '../../../src/modules/alerts/strategy-alerts.types.js';

type StoredAlert = AlertRow & { idempotency_key: string | null; request_hash: string | null };

/**
 * In-memory twin of the SQL repository. It enforces the same rules the database does: owner
 * scoping, case-insensitive unique names among live alerts, the per-user cap, idempotency keys,
 * resume = epoch + 1, immutable versions, and the durable event key
 * (alert, version, symbol, side, signal_session) with ON CONFLICT DO NOTHING.
 */
export class MemoryAlertStore implements StrategyAlertsStore {
  alerts = new Map<string, StoredAlert>();
  versionRows: AlertVersionRow[] = [];
  states = new Map<string, AlertStateRow & { last_evaluated_at: Date | null }>();
  events: AlertEventRow[] = [];
  catalog = new Set<string>();
  lists = new Map<string, OwnedListInfo & { user_id: string }>();
  runs = new Map<string, OwnedRunInfo & { user_id: string }>();
  private clock = Date.parse('2026-01-02T03:00:00.000Z');
  private readonly applied: ApplyEvaluationInput[] = [];

  now(): Date {
    this.clock += 1000;
    return new Date(this.clock);
  }

  get applyCalls(): readonly ApplyEvaluationInput[] {
    return this.applied;
  }

  // --- lookups ---------------------------------------------------------------------------

  activeSymbols(symbols: readonly string[]): Promise<Set<string>> {
    return Promise.resolve(new Set(symbols.filter((symbol) => this.catalog.has(symbol))));
  }

  findOwnedList(userId: string, listId: string): Promise<OwnedListInfo | null> {
    const list = this.lists.get(listId);
    return Promise.resolve(list && list.user_id === userId ? list : null);
  }

  findOwnedSucceededRun(userId: string, runId: string): Promise<OwnedRunInfo | null> {
    const run = this.runs.get(runId);
    return Promise.resolve(run && run.user_id === userId ? run : null);
  }

  // --- reads ------------------------------------------------------------------------------

  private join(alert: StoredAlert): AlertWithVersion | null {
    const version = this.versionRows.find(
      (item) => item.alert_id === alert.id && item.version === alert.current_version,
    );
    if (!version) return null;
    const { idempotency_key: _key, request_hash: _hash, ...row } = alert;
    return structuredClone({ ...row, version_row: version });
  }

  list(userId: string): Promise<AlertWithVersion[]> {
    return Promise.resolve(
      [...this.alerts.values()]
        .filter((alert) => alert.user_id === userId && alert.deleted_at === null)
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
        .flatMap((alert) => this.join(alert) ?? []),
    );
  }

  get(userId: string, alertId: string): Promise<AlertWithVersion | null> {
    const alert = this.alerts.get(alertId);
    return Promise.resolve(
      alert && alert.user_id === userId && alert.deleted_at === null ? this.join(alert) : null,
    );
  }

  versions(alertId: string): Promise<AlertVersionRow[]> {
    return Promise.resolve(
      structuredClone(
        this.versionRows
          .filter((item) => item.alert_id === alertId)
          .sort((a, b) => b.version - a.version),
      ),
    );
  }

  stateSummaries(alertIds: readonly string[]): Promise<StateSummary[]> {
    const out: StateSummary[] = [];
    for (const alertId of alertIds) {
      const alert = this.alerts.get(alertId);
      if (!alert) continue;
      const rows = [...this.states.values()].filter(
        (state) => state.alert_id === alertId && state.version === alert.current_version,
      );
      if (!rows.length) continue;
      const sessions = rows.flatMap((row) => (row.last_session ? [row.last_session] : []));
      const evaluated = rows.flatMap((row) =>
        row.last_evaluated_at ? [row.last_evaluated_at] : [],
      );
      out.push({
        alert_id: alertId,
        version: alert.current_version,
        total: rows.length,
        true_count: rows.filter((row) => row.last_result === 'true').length,
        false_count: rows.filter((row) => row.last_result === 'false').length,
        unknown_count: rows.filter((row) => row.last_result === 'unknown').length,
        blocked_count: rows.filter((row) =>
          ['capability_locked', 'config_invalid'].includes(row.last_reason ?? ''),
        ).length,
        last_session: sessions.sort().at(-1) ?? null,
        last_evaluated_at: evaluated.length
          ? new Date(Math.max(...evaluated.map((date) => date.getTime())))
          : null,
      });
    }
    return Promise.resolve(out);
  }

  // --- writes -----------------------------------------------------------------------------

  private assertNameFree(userId: string, name: string, exceptId: string | null): void {
    const taken = [...this.alerts.values()].some(
      (alert) =>
        alert.user_id === userId &&
        alert.deleted_at === null &&
        alert.id !== exceptId &&
        alert.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (taken)
      throw new ConflictException({
        code: 'ALERT_NAME_TAKEN',
        message: 'Đã có cảnh báo trùng tên',
      });
  }

  private pushVersion(alertId: string, version: number, input: NewVersionInput): void {
    this.versionRows.push(
      structuredClone({
        alert_id: alertId,
        version,
        source: input.source,
        config: input.config,
        config_hash: input.config_hash,
        schema_version: input.schema_version,
        rule_version: input.rule_version,
        calculation_version: input.calculation_version,
        scope: input.scope,
        symbols: input.symbols,
        sides: input.sides,
        definition_hash: input.definition_hash,
        created_at: this.now(),
      }),
    );
  }

  create(input: CreateAlertInput): Promise<AlertWithVersion> {
    if (input.idempotency_key !== null) {
      const replay = [...this.alerts.values()].find(
        (alert) =>
          alert.user_id === input.user_id && alert.idempotency_key === input.idempotency_key,
      );
      if (replay) {
        if (replay.request_hash !== input.request_hash)
          return Promise.reject(
            new ConflictException({ code: 'IDEMPOTENCY_KEY_CONFLICT', message: 'reuse' }),
          );
        return Promise.resolve(this.join(replay)!);
      }
    }
    const live = [...this.alerts.values()].filter(
      (alert) => alert.user_id === input.user_id && alert.deleted_at === null,
    );
    if (live.length >= MAX_ALERTS_PER_USER)
      return Promise.reject(
        new ConflictException({ code: 'ALERT_LIMIT_REACHED', message: 'limit' }),
      );
    try {
      this.assertNameFree(input.user_id, input.name, null);
    } catch (error) {
      return Promise.reject(error);
    }
    const id = randomUUID();
    const now = this.now();
    this.alerts.set(id, {
      id,
      user_id: input.user_id,
      name: input.name,
      enabled: input.enabled,
      current_version: 1,
      observation_epoch: 1,
      observation_started_at: now,
      paused_at: input.enabled ? null : now,
      deleted_at: null,
      created_at: now,
      updated_at: now,
      idempotency_key: input.idempotency_key,
      request_hash: input.request_hash,
    });
    this.pushVersion(id, 1, input.version);
    return Promise.resolve(this.join(this.alerts.get(id)!)!);
  }

  update(userId: string, alertId: string, input: UpdateAlertInput): Promise<AlertWithVersion> {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.user_id !== userId || alert.deleted_at !== null)
      return Promise.reject(
        new NotFoundException({ code: 'ALERT_NOT_FOUND', message: 'Không tìm thấy cảnh báo' }),
      );
    if (input.expected_version !== undefined && input.expected_version !== alert.current_version)
      return Promise.reject(
        new ConflictException({ code: 'ALERT_VERSION_CONFLICT', message: 'stale' }),
      );
    try {
      if (input.name !== undefined && input.name !== alert.name) {
        this.assertNameFree(userId, input.name, alertId);
        alert.name = input.name;
        alert.updated_at = this.now();
      }
    } catch (error) {
      return Promise.reject(error);
    }
    if (input.enabled !== undefined && input.enabled !== alert.enabled) {
      alert.enabled = input.enabled;
      alert.updated_at = this.now();
      if (input.enabled) {
        alert.paused_at = null;
        alert.observation_epoch += 1;
        alert.observation_started_at = this.now();
      } else {
        alert.paused_at = this.now();
      }
    }
    const current = this.versionRows.find(
      (item) => item.alert_id === alertId && item.version === alert.current_version,
    )!;
    if (input.version && input.version.definition_hash !== current.definition_hash) {
      alert.current_version += 1;
      this.pushVersion(alertId, alert.current_version, input.version);
      alert.updated_at = this.now();
    }
    return Promise.resolve(this.join(alert)!);
  }

  remove(userId: string, alertId: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.user_id !== userId || alert.deleted_at !== null)
      return Promise.resolve(false);
    alert.deleted_at = this.now();
    alert.enabled = false;
    alert.paused_at ??= alert.deleted_at;
    return Promise.resolve(true);
  }

  // --- events -----------------------------------------------------------------------------

  listEvents(
    userId: string,
    filter: EventFilter,
  ): Promise<{ items: AlertEventRow[]; total: number }> {
    const rows = this.events
      .filter(
        (event) =>
          event.user_id === userId &&
          (!filter.side || event.side === filter.side) &&
          (!filter.alert_id || event.alert_id === filter.alert_id) &&
          (!filter.symbol || event.symbol === filter.symbol),
      )
      .sort(
        (a, b) =>
          b.signal_session.localeCompare(a.signal_session) ||
          b.created_at.getTime() - a.created_at.getTime(),
      );
    return Promise.resolve({
      items: structuredClone(rows.slice(filter.offset, filter.offset + filter.limit)),
      total: rows.length,
    });
  }

  getEvent(userId: string, eventId: string): Promise<AlertEventRow | null> {
    const event = this.events.find((item) => item.id === eventId && item.user_id === userId);
    return Promise.resolve(event ? structuredClone(event) : null);
  }

  // --- evaluation store -------------------------------------------------------------------

  listTargets(): Promise<EvaluationTarget[]> {
    return Promise.resolve(
      [...this.alerts.values()]
        .filter((alert) => alert.enabled && alert.deleted_at === null)
        .flatMap((alert) => {
          const version = this.versionRows.find(
            (item) => item.alert_id === alert.id && item.version === alert.current_version,
          );
          if (!version) return [];
          return [
            structuredClone({
              alert_id: alert.id,
              user_id: alert.user_id,
              name: alert.name,
              version: version.version,
              epoch: alert.observation_epoch,
              config: version.config,
              config_hash: version.config_hash,
              rule_version: version.rule_version,
              calculation_version: version.calculation_version,
              symbols: version.symbols,
              sides: version.sides,
            }),
          ];
        }),
    );
  }

  loadStates(alertIds: readonly string[]): Promise<AlertStateRow[]> {
    const wanted = new Set(alertIds);
    return Promise.resolve(
      [...this.states.values()]
        .filter((state) => wanted.has(state.alert_id))
        .map((s) => ({ ...s })),
    );
  }

  /** Synchronous body = atomic like the row-locked SQL transaction. */
  applyEvaluation(input: ApplyEvaluationInput): Promise<ApplyEvaluationOutcome> {
    this.applied.push(input);
    const { target, symbol, side, session } = input;
    const key = `${target.alert_id}:${target.version}:${symbol}:${side}`;
    const state = this.states.get(key);
    const plan = planEvaluation(state, target.epoch, session, input.result);
    if (plan.skip !== null)
      return Promise.resolve({ plan, event_created: false, duplicate: false, result: 'unknown' });
    this.states.set(key, {
      alert_id: target.alert_id,
      version: target.version,
      symbol,
      side,
      epoch: plan.epoch,
      last_valid_result: plan.next.last_valid_result,
      last_valid_session: plan.next.last_valid_session,
      last_result: plan.result,
      last_session: session,
      last_reason: input.reason,
      attempts: plan.attempts,
      last_evaluated_at: input.evaluated_at,
    });
    if (!plan.event)
      return Promise.resolve({ plan, event_created: false, duplicate: false, result: plan.result });
    const duplicate = this.events.some(
      (event) =>
        event.alert_id === target.alert_id &&
        event.alert_version === target.version &&
        event.symbol === symbol &&
        event.side === side &&
        event.signal_session === session,
    );
    if (duplicate)
      return Promise.resolve({ plan, event_created: false, duplicate: true, result: plan.result });
    this.events.push({
      id: randomUUID(),
      user_id: target.user_id,
      alert_id: target.alert_id,
      alert_version: target.version,
      alert_name: target.name,
      symbol,
      side,
      signal_session: session,
      event_kind: plan.event.kind,
      message: `Thỏa điều kiện ${side === 'buy' ? 'Mua' : 'Bán'}`,
      evaluated_at: input.evaluated_at,
      data_version: input.data_version,
      config_hash: target.config_hash,
      rule_version: target.rule_version,
      calculation_version: target.calculation_version,
      previous_valid_result: plan.event.previous.last_valid_result,
      previous_valid_session: plan.event.previous.last_valid_session,
      evidence: structuredClone(input.evidence),
      created_at: this.now(),
    });
    return Promise.resolve({ plan, event_created: true, duplicate: false, result: plan.result });
  }
}
