import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../../src/platform/database/database.service.js';
import { ResearchRepository } from '../../src/modules/research/research.repository.js';
import type { ResearchReport } from '../../src/modules/research/research.types.js';

type Call = { sql: string; values: readonly unknown[] | undefined };

function setup(
  handler: (
    sql: string,
    values: readonly unknown[] | undefined,
  ) => unknown[] | Promise<unknown[]> = () => [],
) {
  const calls: Call[] = [];
  const run = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    calls.push({ sql, values });
    return handler(sql, values);
  });
  const tx = { query: run };
  const db = { query: run, transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };
  const repo = new ResearchRepository(db as unknown as DatabaseService);
  return { repo, calls, db, run };
}

const reportRow = {
  id: 'r1',
  source: 'vietstock',
  source_report_id: '42',
  symbol: 'FPT',
  broker: 'SSI',
  report_type: 'company',
  report_date: '2026-10-01',
  title: 'FPT',
  summary: null,
  language: 'vi',
  source_url: 'https://x',
  file_url: null,
  file_path: null,
  file_hash: null,
  target_price_vnd: '150000',
  target_source: 'metadata',
  target_horizon: null,
  download_status: 'downloaded',
  process_status: 'pending',
  process_attempts: 0,
};

const file = { filePath: '/f.pdf', fileHash: 'a'.repeat(64), fileBytes: 10, fileUrl: 'https://f' };

describe('ResearchRepository', () => {
  it('maps report rows: bigint to number, dates stay YYYY-MM-DD, selected via to_char', async () => {
    const { repo, calls } = setup(() => [reportRow]);
    const [report] = await repo.activeReports('FPT', '2026-09-13');
    expect(report).toMatchObject({
      id: 'r1',
      reportDate: '2026-10-01',
      targetPriceVnd: 150000,
      targetSource: 'metadata',
      summary: '',
      fileUrl: null,
    });
    expect(calls[0]!.sql).toContain(`to_char(report_date, 'YYYY-MM-DD')`);
    expect(calls[0]!.sql).toContain('ORDER BY report_date ASC, created_at ASC');
    expect(calls[0]!.values).toEqual(['FPT', '2026-09-13']);
  });

  it('does not drift a Date value across timezones', async () => {
    const { repo } = setup(() => [{ ...reportRow, report_date: new Date('2026-10-01T00:00:00Z') }]);
    const [report] = await repo.activeReports('FPT', '2026-09-13');
    expect(report!.reportDate).toBe('2026-10-01');
  });

  it('upsertListing reports inserted flag and sets metadata target source', async () => {
    const { repo, calls } = setup(() => [{ id: 'r1', inserted: true }]);
    const result = await repo.upsertListing({
      source: 'vietstock',
      sourceReportId: '42',
      symbol: 'FPT',
      broker: 'SSI',
      brokerRaw: 'SSI Research',
      reportType: 'company',
      reportDate: '2026-10-01',
      title: 't',
      summary: 's',
      language: 'vi',
      sourceUrl: 'u',
      fileUrl: null,
      targetPriceVnd: 150000,
    });
    expect(result).toEqual({ id: 'r1', inserted: true });
    expect(calls[0]!.sql).toContain('ON CONFLICT (source, source_report_id) DO UPDATE');
    expect(calls[0]!.sql).toContain('(xmax = 0) AS inserted');
    expect(calls[0]!.values![13]).toBe('metadata');
    expect(calls[0]!.values![12]).toBe(150000);
  });

  it('pendingDownloads filters pending/failed under max attempts, oldest first', async () => {
    const { repo, calls } = setup(() => [reportRow]);
    await repo.pendingDownloads(20, 3);
    expect(calls[0]!.sql).toContain("download_status = 'pending'");
    expect(calls[0]!.sql).toContain("download_status = 'failed' AND download_attempts < $2");
    expect(calls[0]!.sql).toContain('ORDER BY created_at ASC');
    expect(calls[0]!.values).toEqual([20, 3]);
  });

  describe('markDownloaded', () => {
    it('marks duplicate/skipped when another downloaded row has the hash', async () => {
      const { repo, calls } = setup((sql) =>
        sql.includes('SELECT id FROM research_reports') ? [{ id: 'other' }] : [],
      );
      await expect(repo.markDownloaded('r1', file)).resolves.toBe('duplicate');
      const update = calls.find((c) => c.sql.includes("download_status = 'duplicate'"))!;
      expect(update.sql).toContain("process_status = 'skipped'");
      expect(calls.some((c) => c.sql.includes("download_status = 'downloaded',"))).toBe(false);
    });

    it('stores the file and increments attempts when the hash is new', async () => {
      const { repo, calls } = setup();
      await expect(repo.markDownloaded('r1', file)).resolves.toBe('downloaded');
      const update = calls.find((c) => c.sql.includes("SET download_status = 'downloaded'"))!;
      expect(update.sql).toContain('download_attempts = download_attempts + 1');
      expect(update.values).toEqual(['r1', '/f.pdf', file.fileHash, 10, 'https://f']);
    });

    it('falls back to duplicate when the unique index rejects a concurrent winner', async () => {
      const { repo, calls } = setup((sql) => {
        if (sql.includes("download_status = 'downloaded',"))
          throw Object.assign(new Error('dup'), { code: '23505' });
        return [];
      });
      await expect(repo.markDownloaded('r1', file)).resolves.toBe('duplicate');
      const sqls = calls.map((c) => c.sql);
      expect(sqls).toContain('ROLLBACK TO SAVEPOINT research_mark_downloaded');
      expect(sqls.some((s) => s.includes("download_status = 'duplicate'"))).toBe(true);
    });

    it('rethrows other errors', async () => {
      const { repo } = setup((sql) => {
        if (sql.includes("download_status = 'downloaded',"))
          throw Object.assign(new Error('boom'), { code: '40001' });
        return [];
      });
      await expect(repo.markDownloaded('r1', file)).rejects.toThrow('boom');
    });
  });

  it('markProcessFailed fails the report at the third attempt and truncates the error', async () => {
    const { repo, calls } = setup();
    await repo.markProcessFailed('r1', 'x'.repeat(900));
    expect(calls[0]!.sql).toContain("process_attempts + 1 >= 3 THEN 'failed' ELSE 'pending'");
    expect((calls[0]!.values![1] as string).length).toBe(500);
  });

  it('markProcessed only applies the extracted target when no target exists (metadata wins)', async () => {
    const { repo, calls } = setup();
    await repo.markProcessed('r1', { targetPriceVnd: 99000, horizon: '12m' });
    expect(calls[0]!.sql).toContain('target_source IS NULL');
    expect(calls[0]!.sql).toContain("'extracted'");
    expect(calls[0]!.values).toEqual(['r1', 99000, '12m']);
    await repo.markProcessed('r2', null);
    expect(calls[1]!.values).toEqual(['r2', null, null]);
  });

  it('insertClaims is one statement with evidence_date from the report', async () => {
    const { repo, calls } = setup(() => [
      {
        id: 'c1',
        report_id: 'r1',
        symbol: 'FPT',
        broker: 'SSI',
        claim_type: 'growth_driver',
        subject: 's',
        driver: 'd',
        mechanism: 'm',
        outcome: 'o',
        direction: 'positive',
        time_horizon: '',
        summary: 'sum',
        numbers: [{ metric: 'rev', value: 1, unit: '%' }],
        source_page: '3',
        evidence_date: '2026-10-01',
        status: 'active',
      },
    ]);
    const claim = {
      subject: 's',
      driver: 'd',
      mechanism: 'm',
      outcome: 'o',
      direction: 'positive' as const,
      timeHorizon: '',
      claimType: 'growth_driver' as const,
      summary: 'sum',
      numbers: [],
      sourcePage: 3,
    };
    const stored = await repo.insertClaims(reportRow as unknown as ResearchReport, [claim, claim]);
    expect(calls).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: 'c1',
      sourcePage: 3,
      evidenceDate: '2026-10-01',
      status: 'active',
    });
    expect(calls[0]!.sql).toContain('$4::date');
    expect(JSON.parse(calls[0]!.values![4] as string)).toHaveLength(2);
    await expect(
      repo.insertClaims({ ...(reportRow as unknown as ResearchReport) }, []),
    ).resolves.toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('createThesis locks per symbol and pads the sequence', async () => {
    const { repo, calls } = setup((sql) => {
      if (sql.includes('MAX(seq)')) return [{ next_seq: '7' }];
      if (sql.includes('INSERT INTO canonical_theses')) {
        return [
          {
            id: 'FPT_THESIS_007',
            symbol: 'FPT',
            seq: 7,
            canonical_driver: 'd',
            canonical_mechanism: 'm',
            canonical_outcome: 'o',
            direction: 'positive',
            is_risk: false,
            status: 'active',
            materiality: 3,
            current_title: null,
            current_summary: null,
            disagreement: null,
            summary_brokers: [],
            needs_rewrite: true,
            created_at: new Date('2026-10-01T00:00:00Z'),
          },
        ];
      }
      return [];
    });
    const thesis = await repo.createThesis('FPT', {
      key: 'n1',
      canonicalDriver: 'd',
      canonicalMechanism: 'm',
      canonicalOutcome: 'o',
      direction: 'positive',
      isRisk: false,
    });
    expect(calls[0]!.sql).toContain('pg_advisory_xact_lock');
    expect(calls[0]!.sql).toContain('iqx:research:thesis-seq:');
    expect(calls.find((c) => c.sql.includes('INSERT INTO canonical_theses'))!.values![0]).toBe(
      'FPT_THESIS_007',
    );
    expect(thesis).toMatchObject({
      id: 'FPT_THESIS_007',
      seq: 7,
      needsRewrite: true,
      createdAt: '2026-10-01T00:00:00.000Z',
    });
  });

  it('linkClaims lower-cases relationship and ignores conflicts', async () => {
    const { repo, calls } = setup();
    await repo.linkClaims([
      {
        thesisId: 'FPT_THESIS_001',
        claimId: 'c1',
        relationship: 'support',
        matchReason: { driver: true, mechanism: true, direction: true, reason: 'same' },
      },
    ]);
    expect(calls[0]!.sql).toContain('ON CONFLICT DO NOTHING');
    const payload = JSON.parse(calls[0]!.values![0] as string);
    expect(payload[0]).toMatchObject({ relationship: 'support', match_reason: { reason: 'same' } });
  });

  it('updateThesis sets only the provided fields', async () => {
    const { repo, calls } = setup();
    await repo.updateThesis('T1', { status: 'updated', disagreement: null, needsRewrite: false });
    expect(calls[0]!.sql).toBe(
      'UPDATE canonical_theses SET status = $2, disagreement = $3::jsonb, needs_rewrite = $4, updated_at = now() WHERE id = $1',
    );
    expect(calls[0]!.values).toEqual(['T1', 'updated', null, false]);
    await repo.updateThesis('T1', {});
    expect(calls).toHaveLength(1);
  });

  it('replaceBrokerCurrentViews upserts, replaces claims and drops absent brokers', async () => {
    const { repo, calls } = setup((sql) =>
      sql.includes('INSERT INTO broker_current_views') ? [{ id: 'v1' }] : [],
    );
    await repo.replaceBrokerCurrentViews('FPT', [
      {
        broker: 'SSI',
        asOf: '2026-10-01',
        latestReportId: 'r1',
        latestTargetPrice: 150000,
        latestTargetReportDate: '2026-10-01',
        latestTargetReportId: 'r1',
        claims: [
          { claimId: 'c1', relationship: 'current' },
          { claimId: 'c2', relationship: 'inherited' },
        ],
      },
    ]);
    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('DELETE FROM broker_current_view_claims'))).toBe(true);
    const claimsInsert = calls.find((c) =>
      c.sql.includes('INSERT INTO broker_current_view_claims'),
    )!;
    expect(claimsInsert.values).toEqual(['v1', ['c1', 'c2'], ['current', 'inherited']]);
    const prune = calls[calls.length - 1]!;
    expect(prune.sql).toContain('broker <> ALL($2::text[])');
    expect(prune.values).toEqual(['FPT', ['SSI']]);
  });

  it('published maps version, ordered theses and valuation snapshot; null when none', async () => {
    const { repo } = setup((sql) => {
      if (sql.includes('FROM investment_view_versions v')) {
        return [
          {
            id: 'v1',
            symbol: 'FPT',
            version: 3,
            input_fingerprint: 'f'.repeat(64),
            snapshot_id: 'v1',
            target_median: '150000',
            target_min: '140000',
            target_max: '160000',
            active_broker_count: 3,
            targets: [
              { broker: 'SSI', targetPriceVnd: 150000, reportDate: '2026-10-01', reportId: 'r1' },
            ],
            research_as_of: '2026-10-01',
            hidden_reason: null,
          },
        ];
      }
      return [{ canonical_thesis_id: 'T1', order_index: 1, title: 't', summary: 's' }];
    });
    await expect(repo.published('FPT')).resolves.toEqual({
      versionId: 'v1',
      symbol: 'FPT',
      version: 3,
      inputFingerprint: 'f'.repeat(64),
      theses: [{ id: 'T1', order: 1, title: 't', summary: 's' }],
      valuation: {
        targetMedian: 150000,
        targetMin: 140000,
        targetMax: 160000,
        activeBrokerCount: 3,
        targets: [
          { broker: 'SSI', targetPriceVnd: 150000, reportDate: '2026-10-01', reportId: 'r1' },
        ],
        researchAsOf: '2026-10-01',
        hiddenReason: null,
      },
    });
    const empty = setup();
    await expect(empty.repo.published('FPT')).resolves.toBeNull();
  });

  it('publish locks, supersedes the previous version, then inserts version, theses and valuation', async () => {
    const { repo, calls } = setup((sql) => {
      if (sql.includes('MAX(version)')) return [{ next_version: '4' }];
      if (sql.includes('INSERT INTO investment_view_versions')) return [{ id: 'v4' }];
      return [];
    });
    const version = await repo.publish('FPT', {
      inputFingerprint: 'f'.repeat(64),
      theses: [{ id: 'T1', order: 1, title: 't', summary: 's' }],
      valuation: {
        targetMedian: 150000,
        targetMin: 140000,
        targetMax: 160000,
        activeBrokerCount: 2,
        targets: [],
        researchAsOf: '2026-10-01',
        hiddenReason: null,
      },
    });
    expect(version).toBe(4);
    const sqls = calls.map((c) => c.sql);
    expect(sqls[0]).toContain('pg_advisory_xact_lock');
    const supersede = sqls.findIndex((s) => s.includes("SET status = 'superseded'"));
    const insert = sqls.findIndex((s) => s.includes('INSERT INTO investment_view_versions'));
    expect(supersede).toBeGreaterThan(0);
    expect(insert).toBeGreaterThan(supersede);
    expect(sqls.some((s) => s.includes('INSERT INTO investment_view_theses'))).toBe(true);
    const snapshot = calls.find((c) => c.sql.includes('INSERT INTO valuation_snapshots'))!;
    expect(snapshot.values![0]).toBe('v4');
    expect(snapshot.values![5]).toBe('[]');
  });

  it('dilutiveActions reads ISS events by exright_date', async () => {
    const { repo, calls } = setup(() => [
      { symbol: 'FPT', ex_date: '2026-10-05', event_code: 'ISS' },
    ]);
    await expect(repo.dilutiveActions('FPT', '2026-09-13')).resolves.toEqual([
      { symbol: 'FPT', exDate: '2026-10-05', eventCode: 'ISS' },
    ]);
    expect(calls[0]!.sql).toContain("event_code = 'ISS'");
    expect(calls[0]!.sql).toContain('exright_date > $2::date');
  });

  describe('acquireJob', () => {
    const jobRow = {
      id: 'j1',
      symbol: 'FPT',
      status: 'running',
      started_at: new Date('2026-10-13T01:00:00Z'),
      heartbeat_at: new Date('2026-10-13T01:00:05Z'),
      finished_at: null,
      input_fingerprint: null,
      llm_calls: 0,
      error_message: null,
    };

    it('returns acquired=false for a live lease', async () => {
      const { repo, calls } = setup((sql) =>
        sql.includes("status = 'running'\n") || sql.includes('live')
          ? [{ ...jobRow, live: true }]
          : [],
      );
      const result = await repo.acquireJob('FPT', 60_000);
      expect(result.acquired).toBe(false);
      expect(result.job.id).toBe('j1');
      expect(result.job.heartbeatAt).toBe('2026-10-13T01:00:05.000Z');
      expect(calls.some((c) => c.sql.includes('INSERT INTO research_processing_jobs'))).toBe(false);
      expect(calls[0]!.sql).toContain('iqx:research:job:');
    });

    it('fails a stale lease and starts a new job', async () => {
      const { repo, calls } = setup((sql) => {
        if (sql.includes('live')) return [{ ...jobRow, live: false }];
        if (sql.includes('INSERT INTO research_processing_jobs')) return [{ ...jobRow, id: 'j2' }];
        return [];
      });
      const result = await repo.acquireJob('FPT', 60_000);
      expect(result).toMatchObject({ acquired: true, job: { id: 'j2' } });
      const expire = calls.find((c) => c.sql.includes("error_message = 'lease expired'"))!;
      expect(expire.values).toEqual(['j1']);
    });

    it('starts a new job when nothing is running', async () => {
      const { repo, calls } = setup((sql) =>
        sql.includes('INSERT INTO research_processing_jobs') ? [{ ...jobRow, id: 'j3' }] : [],
      );
      const result = await repo.acquireJob('FPT', 60_000);
      expect(result).toMatchObject({ acquired: true, job: { id: 'j3', status: 'running' } });
      expect(calls.some((c) => c.sql.includes('lease expired'))).toBe(false);
    });
  });

  it('finishJob records the outcome and truncates the error', async () => {
    const { repo, calls } = setup();
    await repo.finishJob('j1', 'failed', { llmCalls: 2, error: 'e'.repeat(700) });
    expect(calls[0]!.values![1]).toBe('failed');
    expect(calls[0]!.values![3]).toBe(2);
    expect((calls[0]!.values![4] as string).length).toBe(500);
  });

  it('lastBlockedFingerprint returns the fingerprint or null; job returns null when missing', async () => {
    const hit = setup(() => [{ input_fingerprint: 'abc' }]);
    await expect(hit.repo.lastBlockedFingerprint('FPT')).resolves.toBe('abc');
    expect(hit.calls[0]!.sql).toContain("status = 'blocked'");
    const miss = setup();
    await expect(miss.repo.lastBlockedFingerprint('FPT')).resolves.toBeNull();
    await expect(miss.repo.job('nope')).resolves.toBeNull();
  });

  it('AI usage: reads calls (0 when absent) and upsert-increments', async () => {
    const { repo, calls } = setup((sql) => (sql.startsWith('SELECT') ? [{ llm_calls: '12' }] : []));
    await expect(repo.aiCallsOn('2026-10-13')).resolves.toBe(12);
    await repo.recordAiUsage('2026-10-13', { calls: 2, promptTokens: 100, completionTokens: 50 });
    expect(calls[1]!.sql).toContain('llm_calls = research_ai_usage.llm_calls + EXCLUDED.llm_calls');
    expect(calls[1]!.values).toEqual(['2026-10-13', 2, 100, 50]);
    await expect(setup().repo.aiCallsOn('2026-10-13')).resolves.toBe(0);
  });
});
