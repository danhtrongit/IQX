import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService, type SqlClient } from '../../platform/database/database.service.js';
import type {
  JsonObject,
  JsonValue,
  MarketReport,
  MarketReportOutput,
  ReportType,
} from './reports.types.js';
import { buildReportVisuals } from './report-visuals.js';
import { isReportSnapshotTime } from './report-snapshot-window.js';

type Row = Record<string, unknown>;

function json<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function mapRow(row: Row): MarketReport {
  const storedMeta = json<JsonObject | null>(row.meta, null);
  const inputPayload = json<JsonObject | null>(row.input_payload, null);
  const reportType = String(row.report_type) as ReportType;
  const sessionDate = String(row.session_date).slice(0, 10);
  const inputCapturedAt = new Date(String(row.input_captured_at ?? ''));
  const visuals =
    inputPayload && isReportSnapshotTime(reportType, sessionDate, inputCapturedAt)
      ? buildReportVisuals(inputPayload, reportType)
      : null;
  const meta =
    storedMeta && visuals
      ? { ...storedMeta, charts: visuals.charts, pulse: visuals.pulse }
      : storedMeta;
  return {
    id: String(row.public_id),
    sessionDate,
    sessionType: String(row.session_type),
    reportType,
    generatedAt: new Date(String(row.generated_at)).toISOString(),
    headline: String(row.headline ?? ''),
    tagline: json<JsonObject>(row.tagline, {}),
    paragraphs: json<JsonObject>(row.paragraphs, {}),
    scenarios: json<JsonValue[]>(row.scenarios, []),
    watchlist: json<JsonValue[] | null>(row.watchlist, null),
    unexplained: row.unexplained == null ? null : String(row.unexplained),
    meta,
    published: Boolean(row.is_published),
    generationStatus: String(row.generation_status) as MarketReport['generationStatus'],
    generationError: row.generation_error == null ? null : String(row.generation_error),
  };
}

@Injectable()
export class ReportsRepository {
  constructor(private readonly database: DatabaseService) {}

  transaction<T>(operation: (tx: SqlClient) => Promise<T>): Promise<T> {
    return this.database.transaction(operation);
  }

  /** Repair visuals from a verified same-session snapshot without rewriting AI text. */
  async attachChartSnapshot(
    type: ReportType,
    sessionDate: string,
    snapshotId: string,
  ): Promise<void> {
    const snapshots = await this.database.query<{ captured_at: unknown }>(
      `select captured_at from market_report_input_snapshots
       where id=$1 and report_type=$2 and session_date=$3::date and complete=true`,
      [snapshotId, type, sessionDate],
    );
    if (
      !snapshots[0] ||
      !isReportSnapshotTime(type, sessionDate, new Date(String(snapshots[0].captured_at)))
    ) {
      throw new Error('Chart snapshot is not valid for this report session');
    }
    const updated = await this.database.query(
      `update analysis_history a set meta=coalesce(a.meta,'{}'::jsonb) || jsonb_build_object(
         'chart_snapshot_id',s.id::text,'chart_snapshot_captured_at',s.captured_at,
         'chart_data_quality',s.quality), updated_at=now()
       from market_report_input_snapshots s
       where s.id=$1 and s.report_type=$2 and s.session_date=$3::date and s.complete=true
         and a.report_type=s.report_type and a.session_date=s.session_date
         and a.generation_status='published' and a.is_published=true
       returning a.id`,
      [snapshotId, type, sessionDate],
    );
    if (!updated.length) throw new Error('Published report not found for chart repair');
  }

  async latest(type: ReportType): Promise<MarketReport | null> {
    const rows = await this.database.query(
      `select a.*, s.payload as input_payload, s.captured_at as input_captured_at from analysis_history a
       left join lateral (
         select payload, captured_at from market_report_input_snapshots
         where report_type=a.report_type and session_date=a.session_date and complete=true
           and (id::text = a.meta->>'chart_snapshot_id' or captured_at <= a.generated_at)
           and captured_at >= (a.session_date + case a.report_type
             when 'daily' then time '15:15'
             when 'midday' then time '11:30'
             else time '00:00' end) at time zone 'Asia/Ho_Chi_Minh'
           and (a.report_type='daily' or captured_at < (a.session_date + case a.report_type
             when 'midday' then time '13:00' else time '09:00' end) at time zone 'Asia/Ho_Chi_Minh')
         order by (id::text = a.meta->>'chart_snapshot_id') desc nulls last,
           captured_at = nullif(a.meta->>'snapshot_captured_at','')::timestamptz desc,
           (payload->'meta'->>'input_hash') = (a.meta->>'input_hash') desc, captured_at desc limit 1
       ) s on true
       where a.report_type=$1 and a.is_published=true and a.generation_status='published'
       order by a.session_date desc, a.generated_at desc limit 1`,
      [type],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async byDate(type: ReportType, sessionDate: string): Promise<MarketReport | null> {
    const rows = await this.database.query(
      `select a.*, s.payload as input_payload, s.captured_at as input_captured_at from analysis_history a
       left join lateral (
         select payload, captured_at from market_report_input_snapshots
         where report_type=a.report_type and session_date=a.session_date and complete=true
           and (id::text = a.meta->>'chart_snapshot_id' or captured_at <= a.generated_at)
           and captured_at >= (a.session_date + case a.report_type
             when 'daily' then time '15:15'
             when 'midday' then time '11:30'
             else time '00:00' end) at time zone 'Asia/Ho_Chi_Minh'
           and (a.report_type='daily' or captured_at < (a.session_date + case a.report_type
             when 'midday' then time '13:00' else time '09:00' end) at time zone 'Asia/Ho_Chi_Minh')
         order by (id::text = a.meta->>'chart_snapshot_id') desc nulls last,
           captured_at = nullif(a.meta->>'snapshot_captured_at','')::timestamptz desc,
           (payload->'meta'->>'input_hash') = (a.meta->>'input_hash') desc, captured_at desc limit 1
       ) s on true
       where a.report_type=$1 and a.session_date=$2 and a.is_published=true
         and a.generation_status='published' limit 1`,
      [type, sessionDate],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async state(type: ReportType, sessionDate: string): Promise<MarketReport | null> {
    const rows = await this.database.query(
      `select a.*, s.payload as input_payload, s.captured_at as input_captured_at from analysis_history a
       left join lateral (
         select payload, captured_at from market_report_input_snapshots
         where report_type=a.report_type and session_date=a.session_date and complete=true
           and (id::text = a.meta->>'chart_snapshot_id' or captured_at <= a.generated_at)
           and captured_at >= (a.session_date + case a.report_type
             when 'daily' then time '15:15'
             when 'midday' then time '11:30'
             else time '00:00' end) at time zone 'Asia/Ho_Chi_Minh'
           and (a.report_type='daily' or captured_at < (a.session_date + case a.report_type
             when 'midday' then time '13:00' else time '09:00' end) at time zone 'Asia/Ho_Chi_Minh')
         order by (id::text = a.meta->>'chart_snapshot_id') desc nulls last,
           captured_at = nullif(a.meta->>'snapshot_captured_at','')::timestamptz desc,
           (payload->'meta'->>'input_hash') = (a.meta->>'input_hash') desc, captured_at desc limit 1
       ) s on true
       where a.report_type=$1 and a.session_date=$2 limit 1`,
      [type, sessionDate],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async list(type: ReportType, limit: number): Promise<MarketReport[]> {
    const rows = await this.database.query(
      `select a.*, s.payload as input_payload, s.captured_at as input_captured_at from analysis_history a
       left join lateral (
         select payload, captured_at from market_report_input_snapshots
         where report_type=a.report_type and session_date=a.session_date and complete=true
           and (id::text = a.meta->>'chart_snapshot_id' or captured_at <= a.generated_at)
           and captured_at >= (a.session_date + case a.report_type
             when 'daily' then time '15:15'
             when 'midday' then time '11:30'
             else time '00:00' end) at time zone 'Asia/Ho_Chi_Minh'
           and (a.report_type='daily' or captured_at < (a.session_date + case a.report_type
             when 'midday' then time '13:00' else time '09:00' end) at time zone 'Asia/Ho_Chi_Minh')
         order by (id::text = a.meta->>'chart_snapshot_id') desc nulls last,
           captured_at = nullif(a.meta->>'snapshot_captured_at','')::timestamptz desc,
           (payload->'meta'->>'input_hash') = (a.meta->>'input_hash') desc, captured_at desc limit 1
       ) s on true
       where a.report_type=$1 and a.is_published=true and a.generation_status='published'
       order by a.session_date desc, a.generated_at desc limit $2`,
      [type, limit],
    );
    return rows.map(mapRow);
  }

  async reserve(type: ReportType, sessionDate: string, sessionType: string): Promise<boolean> {
    return this.transaction(async (tx) => {
      const rows = await tx.query<{ reserved: boolean }>(
        `insert into analysis_history
         (id, public_id, session_date, session_type, report_type, generated_at,
          headline, tagline, paragraphs, scenarios, meta, is_published,
          generation_status, created_at, updated_at)
         values ($1,$2,$3,$4,$5,now(),'','{}'::jsonb,'{}'::jsonb,'[]'::jsonb,'{}'::jsonb,false,'generating',now(),now())
         on conflict (session_date, report_type) do update set
           session_type=excluded.session_type,
           generation_status='generating', generation_error=null, updated_at=now()
         where analysis_history.generation_status='failed'
            or (analysis_history.generation_status='generating'
                and analysis_history.updated_at < now() - interval '15 minutes')
         returning true as reserved`,
        [randomUUID(), `vnindex-${type}-${sessionDate}`, sessionDate, sessionType, type],
      );
      return rows[0]?.reserved === true;
    });
  }

  async publish(
    type: ReportType,
    sessionDate: string,
    sessionType: string,
    output: MarketReportOutput,
    generation: { model: string; attempts: number; generationTimeMs: number },
  ): Promise<void> {
    await this.transaction(async (tx) => {
      const meta = {
        ...(output.meta ?? {}),
        model: generation.model,
        attempts: generation.attempts,
        generation_time_ms: generation.generationTimeMs,
      };
      const rows = await tx.query<{ id: string }>(
        `update analysis_history set session_type=$3, generated_at=now(), headline=$4,
          tagline=$5::jsonb, paragraphs=$6::jsonb, scenarios=$7::jsonb,
          watchlist=$8::jsonb, unexplained=$9, meta=$10::jsonb,
          is_published=true, generation_status='published', generation_error=null, updated_at=now()
         where report_type=$1 and session_date=$2 and generation_status='generating'
         returning id`,
        [
          type,
          sessionDate,
          sessionType,
          output.headline,
          JSON.stringify(output.tagline),
          JSON.stringify(output.paragraphs),
          JSON.stringify(output.scenarios),
          JSON.stringify(output.watchlist ?? null),
          output.unexplained ?? null,
          JSON.stringify(meta),
        ],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('Generation lease was lost before publication');
      await tx.query(`delete from analysis_claims where analysis_id=$1`, [id]);
      for (const scenario of output.scenarios) {
        const record =
          scenario && typeof scenario === 'object' && !Array.isArray(scenario)
            ? (scenario as JsonObject)
            : {};
        await tx.query(
          `insert into analysis_claims
           (id, analysis_id, session_date, claim_text, claim_type, conditions,
            predicted_outcome, status, created_at, updated_at)
           values ($1,$2,$3,$4,$5,$6::jsonb,$7,'pending',now(),now())`,
          [
            randomUUID(),
            id,
            sessionDate,
            String(record.title ?? record.name ?? record.condition_html ?? 'Kịch bản thị trường'),
            String(record.type ?? type),
            JSON.stringify(record.conditions ?? {}),
            record.outcome_html == null ? null : String(record.outcome_html),
          ],
        );
      }
    });
  }

  async fail(type: ReportType, sessionDate: string, error: string): Promise<void> {
    await this.database.transaction((tx) =>
      tx
        .query(
          `update analysis_history set generation_status='failed', is_published=false,
       generation_error=$3, updated_at=now() where report_type=$1 and session_date=$2`,
          [type, sessionDate, error.slice(0, 2000)],
        )
        .then(() => undefined),
    );
  }
}
