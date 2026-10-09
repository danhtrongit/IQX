import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import {
  planEvaluation,
  type AlertStateRow,
  type StateResult,
} from './strategy-alerts.evaluation.js';
import {
  MAX_ALERTS_PER_USER,
  type CreateAlertInput,
  type NewVersionInput,
  type OwnedListInfo,
  type OwnedRunInfo,
  type StrategyAlertsStore,
  type UpdateAlertInput,
} from './strategy-alerts.store.js';
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
} from './strategy-alerts.types.js';

const ALERT_COLUMNS = `a.id, a.user_id, a.name, a.enabled, a.current_version, a.observation_epoch,
       a.observation_started_at, a.paused_at, a.deleted_at, a.created_at, a.updated_at`;
const VERSION_COLUMNS = `v.alert_id, v.version, v.source, v.config, v.config_hash, v.schema_version,
       v.rule_version, v.calculation_version, v.scope, v.symbols, v.sides, v.definition_hash,
       v.created_at`;
const EVENT_COLUMNS = `e.id, e.user_id, e.alert_id, e.alert_version, e.alert_name, e.symbol, e.side,
       e.signal_session::text AS signal_session, e.event_kind, e.message, e.evaluated_at,
       e.data_version, e.config_hash, e.rule_version, e.calculation_version,
       e.previous_valid_result, e.previous_valid_session::text AS previous_valid_session,
       e.evidence, e.created_at`;

const alertNotFound = () =>
  new NotFoundException({ code: 'ALERT_NOT_FOUND', message: 'Không tìm thấy cảnh báo' });
const nameTaken = () =>
  new ConflictException({
    code: 'ALERT_NAME_TAKEN',
    message: 'Đã có cảnh báo trùng tên; hãy đặt tên khác (không ghi đè cảnh báo khác).',
  });

type StateDbRow = Omit<AlertStateRow, 'last_result'> & { last_result: StateResult };

@Injectable()
export class StrategyAlertsRepository implements StrategyAlertsStore {
  constructor(private readonly database: DatabaseService) {}

  // --- lookups used while validating a request -----------------------------------------

  async activeSymbols(symbols: readonly string[]): Promise<Set<string>> {
    if (!symbols.length) return new Set();
    const rows = await this.database.query<{ symbol: string }>(
      `SELECT upper(symbol) AS symbol FROM symbols
        WHERE upper(symbol) = ANY($1::text[]) AND is_active = true
          AND coalesce(is_index, false) = false`,
      [[...symbols]],
    );
    return new Set(rows.map((row) => row.symbol));
  }

  async findOwnedList(userId: string, listId: string): Promise<OwnedListInfo | null> {
    const [row] = await this.database.query<OwnedListInfo>(
      `SELECT id, name, tickers, as_of FROM list_snapshots
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [listId, userId],
    );
    return row ?? null;
  }

  async findOwnedSucceededRun(userId: string, runId: string): Promise<OwnedRunInfo | null> {
    const [row] = await this.database.query<OwnedRunInfo & { shared_revision: number | string }>(
      `SELECT id, shared_revision, request->>'symbol' AS symbol, request->>'start' AS start,
              request->>'end' AS "end", created_at, snapshot->'config' AS config
         FROM backtest_runs
        WHERE id = $1 AND user_id = $2 AND status = 'succeeded' AND snapshot IS NOT NULL`,
      [runId, userId],
    );
    return row ? { ...row, shared_revision: Number(row.shared_revision) } : null;
  }

  // --- reads ----------------------------------------------------------------------------

  async list(userId: string): Promise<AlertWithVersion[]> {
    const alerts = await this.database.query<AlertRow>(
      `SELECT ${ALERT_COLUMNS} FROM strategy_alerts a
        WHERE a.user_id = $1 AND a.deleted_at IS NULL
        ORDER BY a.created_at ASC, a.id`,
      [userId],
    );
    return this.attachVersions(this.database, alerts);
  }

  async get(userId: string, alertId: string): Promise<AlertWithVersion | null> {
    return this.getWith(this.database, userId, alertId);
  }

  async versions(alertId: string): Promise<AlertVersionRow[]> {
    return this.database.query<AlertVersionRow>(
      `SELECT ${VERSION_COLUMNS} FROM strategy_alert_versions v
        WHERE v.alert_id = $1 ORDER BY v.version DESC`,
      [alertId],
    );
  }

  async stateSummaries(alertIds: readonly string[]): Promise<StateSummary[]> {
    if (!alertIds.length) return [];
    return this.database.query<StateSummary>(
      `SELECT s.alert_id, s.version,
              count(*)::int AS total,
              (count(*) FILTER (WHERE s.last_result = 'true'))::int AS true_count,
              (count(*) FILTER (WHERE s.last_result = 'false'))::int AS false_count,
              (count(*) FILTER (WHERE s.last_result = 'unknown'))::int AS unknown_count,
              (count(*) FILTER (WHERE s.last_reason IN ('capability_locked', 'config_invalid')))::int
                AS blocked_count,
              max(s.last_session)::text AS last_session,
              max(s.last_evaluated_at) AS last_evaluated_at
         FROM strategy_alert_states s
         JOIN strategy_alerts a ON a.id = s.alert_id AND a.current_version = s.version
        WHERE s.alert_id = ANY($1::uuid[])
        GROUP BY s.alert_id, s.version`,
      [[...alertIds]],
    );
  }

  async listEvents(
    userId: string,
    filter: EventFilter,
  ): Promise<{ items: AlertEventRow[]; total: number }> {
    const where = ['e.user_id = $1'];
    const values: unknown[] = [userId];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      where.push(clause.replace('?', `$${values.length}`));
    };
    if (filter.side) add('e.side = ?', filter.side);
    if (filter.alert_id) add('e.alert_id = ?::uuid', filter.alert_id);
    if (filter.symbol) add('e.symbol = ?', filter.symbol);
    const clause = where.join(' AND ');
    const [count] = await this.database.query<{ total: number | string }>(
      `SELECT count(*) AS total FROM strategy_alert_events e WHERE ${clause}`,
      values,
    );
    values.push(filter.limit, filter.offset);
    const items = await this.database.query<AlertEventRow>(
      `SELECT ${EVENT_COLUMNS} FROM strategy_alert_events e
        WHERE ${clause}
        ORDER BY e.signal_session DESC, e.created_at DESC, e.id
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { items, total: Number(count?.total ?? 0) };
  }

  async getEvent(userId: string, eventId: string): Promise<AlertEventRow | null> {
    const [row] = await this.database.query<AlertEventRow>(
      `SELECT ${EVENT_COLUMNS} FROM strategy_alert_events e WHERE e.id = $1 AND e.user_id = $2`,
      [eventId, userId],
    );
    return row ?? null;
  }

  // --- writes ---------------------------------------------------------------------------

  create(input: CreateAlertInput): Promise<AlertWithVersion> {
    return this.database.transaction(async (client) => {
      await this.lockOwner(client, input.user_id);
      if (input.idempotency_key !== null) {
        const [replay] = await client.query<{ id: string; request_hash: string | null }>(
          `SELECT id, request_hash FROM strategy_alerts
            WHERE user_id = $1 AND idempotency_key = $2`,
          [input.user_id, input.idempotency_key],
        );
        if (replay) {
          if (replay.request_hash !== input.request_hash)
            throw new ConflictException({
              code: 'IDEMPOTENCY_KEY_CONFLICT',
              message: 'Khóa idempotency đã được dùng cho một yêu cầu khác',
            });
          const existing = await this.getWith(client, input.user_id, replay.id, true);
          if (existing) return existing;
        }
      }
      const [active] = await client.query<{ total: number | string }>(
        `SELECT count(*) AS total FROM strategy_alerts WHERE user_id = $1 AND deleted_at IS NULL`,
        [input.user_id],
      );
      if (Number(active?.total ?? 0) >= MAX_ALERTS_PER_USER)
        throw new ConflictException({
          code: 'ALERT_LIMIT_REACHED',
          message: `Đã đạt số cảnh báo tối đa (${MAX_ALERTS_PER_USER}); hãy xóa bớt cảnh báo không dùng.`,
        });
      await this.assertNameFree(client, input.user_id, input.name, null);
      const id = randomUUID();
      await client.query(
        `INSERT INTO strategy_alerts
           (id, user_id, name, enabled, current_version, observation_epoch, observation_started_at,
            paused_at, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4, 1, 1, now(), CASE WHEN $4::boolean THEN NULL ELSE now() END, $5, $6)`,
        [id, input.user_id, input.name, input.enabled, input.idempotency_key, input.request_hash],
      );
      await this.insertVersion(client, id, 1, input.version);
      const created = await this.getWith(client, input.user_id, id);
      if (!created) throw alertNotFound();
      return created;
    });
  }

  update(userId: string, alertId: string, input: UpdateAlertInput): Promise<AlertWithVersion> {
    return this.database.transaction(async (client) => {
      const [current] = await client.query<AlertRow & { definition_hash: string }>(
        `SELECT ${ALERT_COLUMNS}, v.definition_hash
           FROM strategy_alerts a
           JOIN strategy_alert_versions v ON v.alert_id = a.id AND v.version = a.current_version
          WHERE a.id = $1 AND a.user_id = $2 AND a.deleted_at IS NULL
          FOR UPDATE OF a`,
        [alertId, userId],
      );
      if (!current) throw alertNotFound();
      if (
        input.expected_version !== undefined &&
        input.expected_version !== current.current_version
      )
        throw new ConflictException({
          code: 'ALERT_VERSION_CONFLICT',
          message: 'Cảnh báo đã được cập nhật ở nơi khác; hãy tải lại.',
          details: [{ current_version: current.current_version }],
        });

      if (input.name !== undefined && input.name !== current.name) {
        await this.assertNameFree(client, userId, input.name, alertId);
        await client.query(
          `UPDATE strategy_alerts SET name = $3, updated_at = now() WHERE id = $1 AND user_id = $2`,
          [alertId, userId, input.name],
        );
      }
      if (input.enabled !== undefined && input.enabled !== current.enabled) {
        if (input.enabled)
          // Resume: a fresh observation (epoch + 1). Sessions skipped while paused are not replayed.
          await client.query(
            `UPDATE strategy_alerts
                SET enabled = true, paused_at = NULL, observation_epoch = observation_epoch + 1,
                    observation_started_at = now(), updated_at = now()
              WHERE id = $1 AND user_id = $2`,
            [alertId, userId],
          );
        else
          await client.query(
            `UPDATE strategy_alerts SET enabled = false, paused_at = now(), updated_at = now()
              WHERE id = $1 AND user_id = $2`,
            [alertId, userId],
          );
      }
      if (input.version && input.version.definition_hash !== current.definition_hash) {
        const next = current.current_version + 1;
        await this.insertVersion(client, alertId, next, input.version);
        await client.query(
          `UPDATE strategy_alerts SET current_version = $3, updated_at = now()
            WHERE id = $1 AND user_id = $2`,
          [alertId, userId, next],
        );
      }
      const updated = await this.getWith(client, userId, alertId);
      if (!updated) throw alertNotFound();
      return updated;
    });
  }

  async remove(userId: string, alertId: string): Promise<boolean> {
    const rows = await this.database.query<{ id: string }>(
      `UPDATE strategy_alerts
          SET deleted_at = now(), enabled = false, paused_at = COALESCE(paused_at, now()),
              updated_at = now()
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        RETURNING id`,
      [alertId, userId],
    );
    return rows.length > 0;
  }

  // --- end-of-session evaluation --------------------------------------------------------

  listTargets(): Promise<EvaluationTarget[]> {
    return this.database.query<EvaluationTarget>(
      `SELECT a.id AS alert_id, a.user_id, a.name, a.current_version AS version,
              a.observation_epoch AS epoch, v.config, v.config_hash, v.rule_version,
              v.calculation_version, v.symbols, v.sides
         FROM strategy_alerts a
         JOIN strategy_alert_versions v ON v.alert_id = a.id AND v.version = a.current_version
         JOIN users u ON u.id = a.user_id AND u.status = 'active'
        WHERE a.enabled = true AND a.deleted_at IS NULL
          AND (
            u.role = 'admin'
            OR EXISTS (
              SELECT 1 FROM billing_entitlement_grants g
               WHERE g.user_id = u.id AND g.status = 'active'
                 AND g.starts_at <= now() AND now() < g.ends_at
            )
          )
        ORDER BY a.user_id, a.id`,
    );
  }

  async loadStates(alertIds: readonly string[]): Promise<AlertStateRow[]> {
    if (!alertIds.length) return [];
    const rows = await this.database.query<StateDbRow>(
      `SELECT alert_id, version, symbol, side, epoch, last_valid_result,
              last_valid_session::text AS last_valid_session, last_result,
              last_session::text AS last_session, last_reason, attempts
         FROM strategy_alert_states WHERE alert_id = ANY($1::uuid[])`,
      [[...alertIds]],
    );
    return rows;
  }

  applyEvaluation(input: ApplyEvaluationInput): Promise<ApplyEvaluationOutcome> {
    const { target, symbol, side, session } = input;
    return this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO strategy_alert_states
           (alert_id, version, symbol, side, epoch, last_result)
         VALUES ($1, $2, $3, $4, $5, 'unknown')
         ON CONFLICT (alert_id, version, symbol, side) DO NOTHING`,
        [target.alert_id, target.version, symbol, side, target.epoch],
      );
      const [state] = await client.query<StateDbRow>(
        `SELECT alert_id, version, symbol, side, epoch, last_valid_result,
                last_valid_session::text AS last_valid_session, last_result,
                last_session::text AS last_session, last_reason, attempts
           FROM strategy_alert_states
          WHERE alert_id = $1 AND version = $2 AND symbol = $3 AND side = $4
          FOR UPDATE`,
        [target.alert_id, target.version, symbol, side],
      );
      const plan = planEvaluation(state, target.epoch, session, input.result);
      if (plan.skip !== null)
        return { plan, event_created: false, duplicate: false, result: 'unknown' as const };

      await client.query(
        `UPDATE strategy_alert_states
            SET epoch = $5, last_valid_result = $6, last_valid_session = $7::date,
                last_result = $8, last_session = $9::date, last_reason = $10,
                last_evaluated_at = $11::timestamptz, data_version = $12, attempts = $13,
                updated_at = now()
          WHERE alert_id = $1 AND version = $2 AND symbol = $3 AND side = $4`,
        [
          target.alert_id,
          target.version,
          symbol,
          side,
          plan.epoch,
          plan.next.last_valid_result,
          plan.next.last_valid_session,
          plan.result,
          session,
          input.reason,
          input.evaluated_at.toISOString(),
          input.data_version,
          plan.attempts,
        ],
      );
      if (!plan.event) return { plan, event_created: false, duplicate: false, result: plan.result };

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO strategy_alert_events
           (id, user_id, alert_id, alert_version, alert_name, symbol, side, signal_session,
            event_kind, message, evaluated_at, data_version, config_hash, rule_version,
            calculation_version, previous_valid_result, previous_valid_session, evidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11::timestamptz, $12, $13, $14,
                 $15, $16, $17::date, $18::jsonb)
         ON CONFLICT ON CONSTRAINT uq_strategy_alert_events_dedupe DO NOTHING
         RETURNING id`,
        [
          randomUUID(),
          target.user_id,
          target.alert_id,
          target.version,
          target.name,
          symbol,
          side,
          session,
          plan.event.kind,
          `Thỏa điều kiện ${side === 'buy' ? 'Mua' : 'Bán'}`,
          input.evaluated_at.toISOString(),
          input.data_version,
          target.config_hash,
          target.rule_version,
          target.calculation_version,
          plan.event.previous.last_valid_result,
          plan.event.previous.last_valid_session,
          JSON.stringify(input.evidence),
        ],
      );
      return {
        plan,
        event_created: inserted.length > 0,
        duplicate: inserted.length === 0,
        result: plan.result,
      };
    });
  }

  // --- helpers --------------------------------------------------------------------------

  private async lockOwner(client: SqlClient, userId: string): Promise<void> {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('strategy_alerts:' || $1::text))`, [
      userId,
    ]);
  }

  private async assertNameFree(
    client: SqlClient,
    userId: string,
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    const [taken] = await client.query<{ id: string }>(
      `SELECT id FROM strategy_alerts
        WHERE user_id = $1 AND deleted_at IS NULL AND lower(btrim(name)) = lower(btrim($2))
          AND ($3::uuid IS NULL OR id <> $3::uuid)
        LIMIT 1`,
      [userId, name, exceptId],
    );
    if (taken) throw nameTaken();
  }

  private async insertVersion(
    client: SqlClient,
    alertId: string,
    version: number,
    input: NewVersionInput,
  ): Promise<void> {
    await client.query(
      `INSERT INTO strategy_alert_versions
         (alert_id, version, source, config, config_hash, schema_version, rule_version,
          calculation_version, scope, symbols, sides, definition_hash)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9::jsonb, $10::text[], $11::text[], $12)`,
      [
        alertId,
        version,
        JSON.stringify(input.source),
        JSON.stringify(input.config),
        input.config_hash,
        input.schema_version,
        input.rule_version,
        input.calculation_version,
        JSON.stringify(input.scope),
        input.symbols,
        input.sides,
        input.definition_hash,
      ],
    );
  }

  private async getWith(
    client: SqlClient,
    userId: string,
    alertId: string,
    includeDeleted = false,
  ): Promise<AlertWithVersion | null> {
    const alerts = await client.query<AlertRow>(
      `SELECT ${ALERT_COLUMNS} FROM strategy_alerts a
        WHERE a.id = $1 AND a.user_id = $2 AND ($3::boolean OR a.deleted_at IS NULL)`,
      [alertId, userId, includeDeleted],
    );
    return (await this.attachVersions(client, alerts))[0] ?? null;
  }

  private async attachVersions(client: SqlClient, alerts: AlertRow[]): Promise<AlertWithVersion[]> {
    if (!alerts.length) return [];
    const versions = await client.query<AlertVersionRow>(
      `SELECT ${VERSION_COLUMNS}
         FROM strategy_alert_versions v
         JOIN strategy_alerts a ON a.id = v.alert_id AND a.current_version = v.version
        WHERE v.alert_id = ANY($1::uuid[])`,
      [alerts.map((alert) => alert.id)],
    );
    const byAlert = new Map(versions.map((version) => [version.alert_id, version]));
    return alerts.flatMap((alert) => {
      const version_row = byAlert.get(alert.id);
      return version_row ? [{ ...alert, version_row }] : [];
    });
  }
}
