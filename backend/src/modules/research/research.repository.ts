import { Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/database.service.js';
import type {
  AcquireJobResult,
  BrokerCurrentViewRow,
  PublishInput,
  ResearchJob,
  ResearchStore,
  ThesisPatch,
  UpsertListingResult,
} from './research.ports.js';
import type {
  BrokerTarget,
  CanonicalThesis,
  ClaimMatch,
  ClaimNumber,
  DilutiveAction,
  Disagreement,
  ExtractedClaim,
  NewThesisDraft,
  PublishedView,
  ResearchReport,
  SourceReportListing,
  StoredClaim,
  ThesisEvidenceLink,
  ValuationSnapshot,
} from './research.types.js';

type Row = Record<string, unknown>;

const ERROR_MAX_CHARS = 500;
const DATE_FMT = `'YYYY-MM-DD'`;

// ── Row helpers ────────────────────────────────────────────────────────────────

function num(value: unknown): number {
  return Number(value);
}

function numOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function strOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** DATE columns are selected with to_char; this only guards against a Date from another driver. */
function ymd(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function ymdOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : ymd(value);
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}

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

function truncateError(message: string): string {
  return message.length > ERROR_MAX_CHARS ? message.slice(0, ERROR_MAX_CHARS) : message;
}

function pgCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (error as { cause?: unknown }).cause;
  return typeof cause === 'object' && cause !== null && typeof (cause as { code?: unknown }).code === 'string'
    ? ((cause as { code: string }).code)
    : undefined;
}

// ── Column lists and mappers ──────────────────────────────────────────────────

const REPORT_COLUMNS = `
  id, source, source_report_id, symbol, broker, report_type,
  to_char(report_date, ${DATE_FMT}) AS report_date,
  title, summary, language, source_url, file_url, file_path, file_hash,
  target_price_vnd, target_source, target_horizon,
  download_status, process_status, process_attempts`;

function mapReport(row: Row): ResearchReport {
  return {
    id: String(row.id),
    source: String(row.source) as ResearchReport['source'],
    sourceReportId: String(row.source_report_id),
    symbol: strOrNull(row.symbol),
    broker: String(row.broker),
    reportType: String(row.report_type) as ResearchReport['reportType'],
    reportDate: ymd(row.report_date),
    title: String(row.title),
    summary: String(row.summary ?? ''),
    language: String(row.language) as ResearchReport['language'],
    sourceUrl: String(row.source_url),
    fileUrl: strOrNull(row.file_url),
    filePath: strOrNull(row.file_path),
    fileHash: strOrNull(row.file_hash),
    targetPriceVnd: numOrNull(row.target_price_vnd),
    targetSource: strOrNull(row.target_source) as ResearchReport['targetSource'],
    targetHorizon: strOrNull(row.target_horizon),
    downloadStatus: String(row.download_status) as ResearchReport['downloadStatus'],
    processStatus: String(row.process_status) as ResearchReport['processStatus'],
    processAttempts: num(row.process_attempts),
  };
}

const CLAIM_COLUMNS = `
  id, report_id, symbol, broker, claim_type, subject, driver, mechanism, outcome, direction,
  time_horizon, summary, numbers, source_page,
  to_char(evidence_date, ${DATE_FMT}) AS evidence_date, status`;

function mapClaim(row: Row): StoredClaim {
  return {
    id: String(row.id),
    reportId: String(row.report_id),
    symbol: String(row.symbol),
    broker: String(row.broker),
    claimType: String(row.claim_type) as StoredClaim['claimType'],
    subject: String(row.subject),
    driver: String(row.driver),
    mechanism: String(row.mechanism),
    outcome: String(row.outcome),
    direction: String(row.direction) as StoredClaim['direction'],
    timeHorizon: String(row.time_horizon ?? ''),
    summary: String(row.summary),
    numbers: json<ClaimNumber[]>(row.numbers, []),
    sourcePage: numOrNull(row.source_page),
    evidenceDate: ymd(row.evidence_date),
    status: String(row.status) as StoredClaim['status'],
  };
}

const THESIS_COLUMNS = `
  id, symbol, seq, canonical_driver, canonical_mechanism, canonical_outcome, direction, is_risk,
  status, materiality, current_title, current_summary, disagreement, summary_brokers,
  needs_rewrite, created_at`;

function mapThesis(row: Row): CanonicalThesis {
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    seq: num(row.seq),
    canonicalDriver: String(row.canonical_driver),
    canonicalMechanism: String(row.canonical_mechanism),
    canonicalOutcome: String(row.canonical_outcome),
    direction: String(row.direction) as CanonicalThesis['direction'],
    isRisk: Boolean(row.is_risk),
    status: String(row.status) as CanonicalThesis['status'],
    materiality: num(row.materiality),
    currentTitle: strOrNull(row.current_title),
    currentSummary: strOrNull(row.current_summary),
    disagreement: json<Disagreement | null>(row.disagreement, null),
    summaryBrokers: Array.isArray(row.summary_brokers) ? row.summary_brokers.map(String) : [],
    needsRewrite: Boolean(row.needs_rewrite),
    createdAt: iso(row.created_at),
  };
}

/** A report whose extraction failed this many times is given up (transient AI outages are retried). */
const MAX_PROCESS_ATTEMPTS = 3;

const JOB_COLUMNS = `
  id, symbol, status, started_at, heartbeat_at, finished_at, input_fingerprint, llm_calls, error_message`;

function mapJob(row: Row): ResearchJob {
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    status: String(row.status) as ResearchJob['status'],
    startedAt: iso(row.started_at),
    heartbeatAt: iso(row.heartbeat_at),
    finishedAt: isoOrNull(row.finished_at),
    inputFingerprint: strOrNull(row.input_fingerprint),
    llmCalls: num(row.llm_calls),
    errorMessage: strOrNull(row.error_message),
  };
}

function emptyValuation(): ValuationSnapshot {
  return {
    targetMedian: null,
    targetMin: null,
    targetMax: null,
    activeBrokerCount: 0,
    targets: [],
    researchAsOf: null,
    hiddenReason: 'no_target',
  };
}

@Injectable()
export class ResearchRepository implements ResearchStore {
  constructor(private readonly db: DatabaseService) {}

  // ── Report store ────────────────────────────────────────────────────────────

  async upsertListing(listing: SourceReportListing): Promise<UpsertListingResult> {
    const targetSource = listing.targetPriceVnd === null ? null : 'metadata';
    const rows = await this.db.query<Row>(
      `INSERT INTO research_reports (
         source, source_report_id, symbol, broker, broker_raw, report_type, report_date,
         title, summary, language, source_url, file_url, target_price_vnd, target_source
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, $12, $13::bigint, $14)
       ON CONFLICT (source, source_report_id) DO UPDATE SET
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         broker = EXCLUDED.broker,
         broker_raw = EXCLUDED.broker_raw,
         report_type = EXCLUDED.report_type,
         report_date = EXCLUDED.report_date,
         symbol = EXCLUDED.symbol,
         file_url = COALESCE(EXCLUDED.file_url, research_reports.file_url),
         -- A target extracted from the PDF text is never overwritten by listing metadata.
         target_price_vnd = CASE
           WHEN research_reports.target_source IS NULL OR research_reports.target_source = 'metadata'
             THEN COALESCE(EXCLUDED.target_price_vnd, research_reports.target_price_vnd)
           ELSE research_reports.target_price_vnd END,
         target_source = CASE
           WHEN (research_reports.target_source IS NULL OR research_reports.target_source = 'metadata')
             AND EXCLUDED.target_price_vnd IS NOT NULL THEN 'metadata'
           ELSE research_reports.target_source END,
         updated_at = now()
       RETURNING id, (xmax = 0) AS inserted`,
      [
        listing.source,
        listing.sourceReportId,
        listing.symbol,
        listing.broker,
        listing.brokerRaw,
        listing.reportType,
        listing.reportDate,
        listing.title,
        listing.summary,
        listing.language,
        listing.sourceUrl,
        listing.fileUrl,
        listing.targetPriceVnd,
        targetSource,
      ],
    );
    const row = rows[0]!;
    return { id: String(row.id), inserted: Boolean(row.inserted) };
  }

  async pendingDownloads(limit: number, maxAttempts: number): Promise<ResearchReport[]> {
    const rows = await this.db.query<Row>(
      `SELECT ${REPORT_COLUMNS}
         FROM research_reports
        WHERE download_status = 'pending'
           OR (download_status = 'failed' AND download_attempts < $2)
        ORDER BY created_at ASC, id ASC
        LIMIT $1`,
      [limit, maxAttempts],
    );
    return rows.map(mapReport);
  }

  async markDownloaded(
    reportId: string,
    file: { filePath: string; fileHash: string; fileBytes: number; fileUrl: string },
  ): Promise<'downloaded' | 'duplicate'> {
    return this.db.transaction(async (tx) => {
      const markDuplicate = async (): Promise<'duplicate'> => {
        await tx.query(
          `UPDATE research_reports
              SET download_status = 'duplicate', process_status = 'skipped',
                  file_url = $2, file_hash = $3,
                  download_attempts = download_attempts + 1,
                  error_message = NULL, updated_at = now()
            WHERE id = $1`,
          [reportId, file.fileUrl, file.fileHash],
        );
        return 'duplicate';
      };

      const existing = await tx.query<Row>(
        `SELECT id FROM research_reports
          WHERE file_hash = $1 AND download_status = 'downloaded' AND id <> $2
          LIMIT 1`,
        [file.fileHash, reportId],
      );
      if (existing.length > 0) return markDuplicate();

      // A concurrent download of the same file can still win the partial unique index; a savepoint
      // keeps the transaction usable after the 23505.
      await tx.query('SAVEPOINT research_mark_downloaded');
      try {
        await tx.query(
          `UPDATE research_reports
              SET download_status = 'downloaded', file_path = $2, file_hash = $3, file_bytes = $4,
                  file_url = $5, downloaded_at = now(),
                  download_attempts = download_attempts + 1,
                  error_message = NULL, updated_at = now()
            WHERE id = $1`,
          [reportId, file.filePath, file.fileHash, file.fileBytes, file.fileUrl],
        );
        await tx.query('RELEASE SAVEPOINT research_mark_downloaded');
        return 'downloaded' as const;
      } catch (error) {
        if (pgCode(error) !== '23505') throw error;
        await tx.query('ROLLBACK TO SAVEPOINT research_mark_downloaded');
        return markDuplicate();
      }
    });
  }

  async markDownloadFailed(reportId: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE research_reports
          SET download_status = 'failed', download_attempts = download_attempts + 1,
              error_message = $2, updated_at = now()
        WHERE id = $1`,
      [reportId, truncateError(error)],
    );
  }

  async countReports(source: SourceReportListing['source']): Promise<number> {
    const rows = await this.db.query<Row>(
      'SELECT count(*)::int AS total FROM research_reports WHERE source = $1',
      [source],
    );
    return num(rows[0]?.total ?? 0);
  }

  // ── Engine reads ────────────────────────────────────────────────────────────

  async activeReports(symbol: string, fromDate: string): Promise<ResearchReport[]> {
    const rows = await this.db.query<Row>(
      `SELECT ${REPORT_COLUMNS}
         FROM research_reports
        WHERE symbol = $1
          AND report_type = 'company'
          AND download_status = 'downloaded'
          AND report_date >= $2::date
        ORDER BY report_date ASC, created_at ASC`,
      [symbol, fromDate],
    );
    return rows.map(mapReport);
  }

  async activeClaims(symbol: string, fromDate: string): Promise<StoredClaim[]> {
    const rows = await this.db.query<Row>(
      `SELECT ${CLAIM_COLUMNS}
         FROM research_claims
        WHERE symbol = $1 AND status = 'active' AND evidence_date >= $2::date
        ORDER BY evidence_date ASC, created_at ASC, id ASC`,
      [symbol, fromDate],
    );
    return rows.map(mapClaim);
  }

  async unmatchedClaims(symbol: string, fromDate: string): Promise<StoredClaim[]> {
    const rows = await this.db.query<Row>(
      `SELECT ${CLAIM_COLUMNS}
         FROM research_claims
        WHERE symbol = $1 AND status = 'active' AND matched_at IS NULL AND evidence_date >= $2::date
        ORDER BY evidence_date ASC, created_at ASC, id ASC`,
      [symbol, fromDate],
    );
    return rows.map(mapClaim);
  }

  async theses(symbol: string): Promise<CanonicalThesis[]> {
    const rows = await this.db.query<Row>(
      `SELECT ${THESIS_COLUMNS} FROM canonical_theses WHERE symbol = $1 ORDER BY seq ASC`,
      [symbol],
    );
    return rows.map(mapThesis);
  }

  async thesisLinks(symbol: string): Promise<ThesisEvidenceLink[]> {
    const rows = await this.db.query<Row>(
      `SELECT l.canonical_thesis_id, l.claim_id, l.relationship
         FROM canonical_thesis_claims l
         JOIN canonical_theses t ON t.id = l.canonical_thesis_id
        WHERE t.symbol = $1
        ORDER BY l.created_at ASC, l.claim_id ASC`,
      [symbol],
    );
    return rows.map((row) => ({
      thesisId: String(row.canonical_thesis_id),
      claimId: String(row.claim_id),
      relationship: String(row.relationship) as ThesisEvidenceLink['relationship'],
    }));
  }

  async published(symbol: string): Promise<PublishedView | null> {
    const versions = await this.db.query<Row>(
      `SELECT v.id, v.symbol, v.version, v.input_fingerprint,
              s.investment_view_version_id AS snapshot_id,
              s.target_median, s.target_min, s.target_max, s.active_broker_count, s.targets,
              to_char(s.research_as_of, ${DATE_FMT}) AS research_as_of, s.hidden_reason
         FROM investment_view_versions v
         LEFT JOIN valuation_snapshots s ON s.investment_view_version_id = v.id
        WHERE v.symbol = $1 AND v.status = 'published'
        LIMIT 1`,
      [symbol],
    );
    const version = versions[0];
    if (!version) return null;

    const thesisRows = await this.db.query<Row>(
      `SELECT canonical_thesis_id, order_index, title, summary
         FROM investment_view_theses
        WHERE investment_view_version_id = $1
        ORDER BY order_index ASC`,
      [String(version.id)],
    );

    const valuation: ValuationSnapshot =
      version.snapshot_id === null || version.snapshot_id === undefined
        ? emptyValuation()
        : {
            targetMedian: numOrNull(version.target_median),
            targetMin: numOrNull(version.target_min),
            targetMax: numOrNull(version.target_max),
            activeBrokerCount: num(version.active_broker_count),
            targets: json<BrokerTarget[]>(version.targets, []),
            researchAsOf: ymdOrNull(version.research_as_of),
            hiddenReason: strOrNull(version.hidden_reason) as ValuationSnapshot['hiddenReason'],
          };

    return {
      versionId: String(version.id),
      symbol: String(version.symbol),
      version: num(version.version),
      inputFingerprint: String(version.input_fingerprint),
      theses: thesisRows.map((row) => ({
        id: String(row.canonical_thesis_id),
        order: num(row.order_index),
        title: String(row.title),
        summary: String(row.summary),
      })),
      valuation,
    };
  }

  async dilutiveActions(symbol: string, afterDate: string): Promise<DilutiveAction[]> {
    const rows = await this.db.query<Row>(
      `SELECT symbol, to_char(exright_date, ${DATE_FMT}) AS ex_date, event_code
         FROM virtual_corporate_actions
        WHERE symbol = $1 AND event_code = 'ISS' AND exright_date > $2::date
        ORDER BY exright_date ASC`,
      [symbol, afterDate],
    );
    return rows.map((row) => ({
      symbol: String(row.symbol),
      exDate: ymd(row.ex_date),
      eventCode: String(row.event_code),
    }));
  }

  // ── Engine writes ───────────────────────────────────────────────────────────

  async insertClaims(report: ResearchReport, claims: ExtractedClaim[]): Promise<StoredClaim[]> {
    if (claims.length === 0) return [];
    const payload = claims.map((claim) => ({
      claim_type: claim.claimType,
      subject: claim.subject,
      driver: claim.driver,
      mechanism: claim.mechanism,
      outcome: claim.outcome,
      direction: claim.direction,
      time_horizon: claim.timeHorizon,
      summary: claim.summary,
      numbers: claim.numbers,
      source_page: claim.sourcePage,
    }));
    const rows = await this.db.query<Row>(
      `INSERT INTO research_claims (
         report_id, symbol, broker, claim_type, subject, driver, mechanism, outcome, direction,
         time_horizon, summary, numbers, source_page, evidence_date
       )
       SELECT $1::uuid, $2, $3, c.claim_type, c.subject, c.driver, c.mechanism, c.outcome,
              c.direction, c.time_horizon, c.summary, c.numbers, c.source_page, $4::date
         FROM jsonb_to_recordset($5::jsonb) AS c(
           claim_type text, subject text, driver text, mechanism text, outcome text,
           direction text, time_horizon text, summary text, numbers jsonb, source_page integer)
       RETURNING ${CLAIM_COLUMNS}`,
      [report.id, report.symbol, report.broker, report.reportDate, JSON.stringify(payload)],
    );
    return rows.map(mapClaim);
  }

  async setClaimStatus(claimIds: string[], status: StoredClaim['status']): Promise<void> {
    if (claimIds.length === 0) return;
    await this.db.query('UPDATE research_claims SET status = $2 WHERE id = ANY($1::uuid[])', [
      claimIds,
      status,
    ]);
  }

  async markClaimsMatched(claimIds: string[]): Promise<void> {
    if (claimIds.length === 0) return;
    await this.db.query('UPDATE research_claims SET matched_at = now() WHERE id = ANY($1::uuid[])', [claimIds]);
  }

  async markProcessed(
    reportId: string,
    target: { targetPriceVnd: number; horizon: string | null } | null,
  ): Promise<void> {
    // Metadata target wins: the extracted one only fills an empty slot.
    await this.db.query(
      `UPDATE research_reports
          SET process_status = 'processed', processed_at = now(),
              process_attempts = process_attempts + 1, error_message = NULL,
              target_price_vnd = CASE WHEN $2::bigint IS NOT NULL AND target_source IS NULL
                                      THEN $2::bigint ELSE target_price_vnd END,
              target_horizon = CASE WHEN $2::bigint IS NOT NULL AND target_source IS NULL
                                    THEN $3::text ELSE target_horizon END,
              target_source = CASE WHEN $2::bigint IS NOT NULL AND target_source IS NULL
                                   THEN 'extracted' ELSE target_source END,
              updated_at = now()
        WHERE id = $1`,
      [reportId, target?.targetPriceVnd ?? null, target?.horizon ?? null],
    );
  }

  async markProcessFailed(reportId: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE research_reports
          SET process_attempts = process_attempts + 1,
              process_status = CASE WHEN process_attempts + 1 >= ${MAX_PROCESS_ATTEMPTS} THEN 'failed' ELSE 'pending' END,
              error_message = $2, updated_at = now()
        WHERE id = $1`,
      [reportId, truncateError(error)],
    );
  }

  async createThesis(symbol: string, draft: NewThesisDraft): Promise<CanonicalThesis> {
    return this.db.transaction(async (tx) => {
      await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended('iqx:research:thesis-seq:' || $1::text, 0))`, [
        symbol,
      ]);
      const seqRows = await tx.query<Row>(
        'SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM canonical_theses WHERE symbol = $1',
        [symbol],
      );
      const seq = num(seqRows[0]?.next_seq ?? 1);
      const id = `${symbol}_THESIS_${String(seq).padStart(3, '0')}`;
      const rows = await tx.query<Row>(
        `INSERT INTO canonical_theses (
           id, symbol, seq, canonical_driver, canonical_mechanism, canonical_outcome,
           direction, is_risk, status, needs_rewrite
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', TRUE)
         RETURNING ${THESIS_COLUMNS}`,
        [
          id,
          symbol,
          seq,
          draft.canonicalDriver,
          draft.canonicalMechanism,
          draft.canonicalOutcome,
          draft.direction,
          draft.isRisk,
        ],
      );
      return mapThesis(rows[0]!);
    });
  }

  async linkClaims(links: (ThesisEvidenceLink & { matchReason: ClaimMatch['match'] })[]): Promise<void> {
    if (links.length === 0) return;
    const payload = links.map((link) => ({
      thesis_id: link.thesisId,
      claim_id: link.claimId,
      relationship: link.relationship.toLowerCase(),
      match_reason: link.matchReason,
    }));
    await this.db.query(
      `INSERT INTO canonical_thesis_claims (canonical_thesis_id, claim_id, relationship, match_reason)
       SELECT l.thesis_id, l.claim_id, l.relationship, l.match_reason
         FROM jsonb_to_recordset($1::jsonb) AS l(
           thesis_id text, claim_id uuid, relationship text, match_reason jsonb)
       ON CONFLICT DO NOTHING`,
      [JSON.stringify(payload)],
    );
  }

  async updateThesis(thesisId: string, patch: ThesisPatch): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [thesisId];
    const add = (column: string, value: unknown, cast = ''): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}${cast}`);
    };

    if (patch.status !== undefined) add('status', patch.status);
    if (patch.materiality !== undefined) add('materiality', patch.materiality);
    if (patch.currentTitle !== undefined) add('current_title', patch.currentTitle);
    if (patch.currentSummary !== undefined) add('current_summary', patch.currentSummary);
    if (patch.disagreement !== undefined) {
      add('disagreement', patch.disagreement === null ? null : JSON.stringify(patch.disagreement), '::jsonb');
    }
    if (patch.summaryBrokers !== undefined) add('summary_brokers', patch.summaryBrokers, '::text[]');
    if (patch.needsRewrite !== undefined) add('needs_rewrite', patch.needsRewrite);
    if (sets.length === 0) return;

    await this.db.query(
      `UPDATE canonical_theses SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`,
      values,
    );
  }

  async replaceBrokerCurrentViews(symbol: string, views: BrokerCurrentViewRow[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const view of views) {
        const rows = await tx.query<Row>(
          `INSERT INTO broker_current_views (
             symbol, broker, as_of, latest_report_id, latest_target_price,
             latest_target_report_date, latest_target_report_id
           ) VALUES ($1, $2, $3::date, $4::uuid, $5::bigint, $6::date, $7::uuid)
           ON CONFLICT (symbol, broker) DO UPDATE SET
             as_of = EXCLUDED.as_of,
             latest_report_id = EXCLUDED.latest_report_id,
             latest_target_price = EXCLUDED.latest_target_price,
             latest_target_report_date = EXCLUDED.latest_target_report_date,
             latest_target_report_id = EXCLUDED.latest_target_report_id,
             updated_at = now()
           RETURNING id`,
          [
            symbol,
            view.broker,
            view.asOf,
            view.latestReportId,
            view.latestTargetPrice,
            view.latestTargetReportDate,
            view.latestTargetReportId,
          ],
        );
        const viewId = String(rows[0]!.id);
        await tx.query('DELETE FROM broker_current_view_claims WHERE broker_current_view_id = $1', [viewId]);

        const unique = new Map(view.claims.map((claim) => [claim.claimId, claim.relationship]));
        if (unique.size > 0) {
          await tx.query(
            `INSERT INTO broker_current_view_claims (broker_current_view_id, claim_id, relationship)
             SELECT $1::uuid, c.claim_id, c.relationship
               FROM unnest($2::uuid[], $3::text[]) AS c(claim_id, relationship)`,
            [viewId, [...unique.keys()], [...unique.values()]],
          );
        }
      }

      await tx.query(
        'DELETE FROM broker_current_views WHERE symbol = $1 AND broker <> ALL($2::text[])',
        [symbol, views.map((view) => view.broker)],
      );
    });
  }

  async publish(symbol: string, input: PublishInput): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended('iqx:research:publish:' || $1::text, 0))`, [
        symbol,
      ]);
      const versionRows = await tx.query<Row>(
        'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM investment_view_versions WHERE symbol = $1',
        [symbol],
      );
      const version = num(versionRows[0]?.next_version ?? 1);

      await tx.query(
        `UPDATE investment_view_versions SET status = 'superseded'
          WHERE symbol = $1 AND status = 'published'`,
        [symbol],
      );
      const inserted = await tx.query<Row>(
        `INSERT INTO investment_view_versions (symbol, version, status, published_at, input_fingerprint)
         VALUES ($1, $2, 'published', now(), $3)
         RETURNING id`,
        [symbol, version, input.inputFingerprint],
      );
      const versionId = String(inserted[0]!.id);

      if (input.theses.length > 0) {
        await tx.query(
          `INSERT INTO investment_view_theses (
             investment_view_version_id, canonical_thesis_id, order_index, title, summary)
           SELECT $1::uuid, t.thesis_id, t.order_index, t.title, t.summary
             FROM unnest($2::text[], $3::int[], $4::text[], $5::text[])
                  AS t(thesis_id, order_index, title, summary)`,
          [
            versionId,
            input.theses.map((thesis) => thesis.id),
            input.theses.map((thesis) => thesis.order),
            input.theses.map((thesis) => thesis.title),
            input.theses.map((thesis) => thesis.summary),
          ],
        );
      }

      const valuation = input.valuation;
      await tx.query(
        `INSERT INTO valuation_snapshots (
           investment_view_version_id, target_median, target_min, target_max,
           active_broker_count, targets, research_as_of, hidden_reason
         ) VALUES ($1, $2::bigint, $3::bigint, $4::bigint, $5, $6::jsonb, $7::date, $8)`,
        [
          versionId,
          valuation.targetMedian,
          valuation.targetMin,
          valuation.targetMax,
          valuation.activeBrokerCount,
          JSON.stringify(valuation.targets),
          valuation.researchAsOf,
          valuation.hiddenReason,
        ],
      );
      return version;
    });
  }

  async touchPublished(symbol: string): Promise<void> {
    await this.db.query(
      `UPDATE investment_view_versions SET last_checked_at = now()
        WHERE symbol = $1 AND status = 'published'`,
      [symbol],
    );
  }

  // ── Jobs ────────────────────────────────────────────────────────────────────

  async acquireJob(symbol: string, staleAfterMs: number): Promise<AcquireJobResult> {
    return this.db.transaction(async (tx) => {
      await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended('iqx:research:job:' || $1::text, 0))`, [
        symbol,
      ]);
      const running = await tx.query<Row>(
        `SELECT ${JOB_COLUMNS},
                (heartbeat_at > now() - ($2::double precision * interval '1 millisecond')) AS live
           FROM research_processing_jobs
          WHERE symbol = $1 AND status = 'running'
          ORDER BY started_at DESC
          LIMIT 1`,
        [symbol, staleAfterMs],
      );
      const current = running[0];
      if (current) {
        if (current.live === true) return { acquired: false as const, job: mapJob(current) };
        await tx.query(
          `UPDATE research_processing_jobs
              SET status = 'failed', finished_at = now(), error_message = 'lease expired'
            WHERE id = $1`,
          [String(current.id)],
        );
      }
      return { acquired: true as const, job: await this.insertRunningJob(tx, symbol) };
    });
  }

  private async insertRunningJob(tx: SqlClient, symbol: string): Promise<ResearchJob> {
    const rows = await tx.query<Row>(
      `INSERT INTO research_processing_jobs (symbol, status) VALUES ($1, 'running')
       RETURNING ${JOB_COLUMNS}`,
      [symbol],
    );
    return mapJob(rows[0]!);
  }

  async heartbeat(jobId: string): Promise<void> {
    await this.db.query(
      `UPDATE research_processing_jobs SET heartbeat_at = now() WHERE id = $1 AND status = 'running'`,
      [jobId],
    );
  }

  async finishJob(
    jobId: string,
    status: 'done' | 'failed' | 'blocked',
    detail: { inputFingerprint?: string | null; llmCalls?: number; error?: string | null },
  ): Promise<void> {
    await this.db.query(
      `UPDATE research_processing_jobs
          SET status = $2, finished_at = now(), heartbeat_at = now(),
              input_fingerprint = COALESCE($3, input_fingerprint),
              llm_calls = COALESCE($4::int, llm_calls),
              error_message = $5
        WHERE id = $1`,
      [
        jobId,
        status,
        detail.inputFingerprint ?? null,
        detail.llmCalls ?? null,
        detail.error ? truncateError(detail.error) : null,
      ],
    );
  }

  async job(jobId: string): Promise<ResearchJob | null> {
    const rows = await this.db.query<Row>(
      `SELECT ${JOB_COLUMNS} FROM research_processing_jobs WHERE id = $1`,
      [jobId],
    );
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async lastJob(symbol: string): Promise<ResearchJob | null> {
    const rows = await this.db.query<Row>(
      `SELECT ${JOB_COLUMNS} FROM research_processing_jobs WHERE symbol = $1 ORDER BY started_at DESC LIMIT 1`,
      [symbol],
    );
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async lastBlockedFingerprint(symbol: string): Promise<string | null> {
    const rows = await this.db.query<Row>(
      `SELECT input_fingerprint
         FROM research_processing_jobs
        WHERE symbol = $1 AND status = 'blocked'
          AND started_at > COALESCE(
                (SELECT MAX(started_at) FROM research_processing_jobs
                  WHERE symbol = $1 AND status = 'done'),
                '-infinity'::timestamptz)
        ORDER BY started_at DESC
        LIMIT 1`,
      [symbol],
    );
    return strOrNull(rows[0]?.input_fingerprint);
  }

  // ── Daily AI budget ─────────────────────────────────────────────────────────

  async aiCallsOn(date: string): Promise<number> {
    const rows = await this.db.query<Row>(
      'SELECT llm_calls FROM research_ai_usage WHERE usage_date = $1::date',
      [date],
    );
    return num(rows[0]?.llm_calls ?? 0);
  }

  async recordAiUsage(
    date: string,
    usage: { calls: number; promptTokens: number; completionTokens: number },
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO research_ai_usage (usage_date, llm_calls, prompt_tokens, completion_tokens)
       VALUES ($1::date, $2, $3, $4)
       ON CONFLICT (usage_date) DO UPDATE SET
         llm_calls = research_ai_usage.llm_calls + EXCLUDED.llm_calls,
         prompt_tokens = research_ai_usage.prompt_tokens + EXCLUDED.prompt_tokens,
         completion_tokens = research_ai_usage.completion_tokens + EXCLUDED.completion_tokens`,
      [date, usage.calls, usage.promptTokens, usage.completionTokens],
    );
  }
}
