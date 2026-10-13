import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readReportFile, sha256Hex } from '../../src/modules/research/report-files.js';
import {
  ResearchSyncService,
  addDaysIso,
} from '../../src/modules/research/research-sync.service.js';
import type { ResearchStore } from '../../src/modules/research/research.ports.js';
import type {
  ReportSource,
  ResearchReport,
  SourceReportListing,
} from '../../src/modules/research/research.types.js';

const TODAY = '2026-10-13';

function listing(id: string, over: Partial<SourceReportListing> = {}): SourceReportListing {
  return {
    source: 'vietstock',
    sourceReportId: id,
    symbol: 'DCM',
    broker: 'VDSC',
    brokerRaw: 'VDS',
    reportType: 'company',
    reportDate: '2026-10-12',
    title: `DCM: report ${id}`,
    summary: '',
    language: 'vi',
    sourceUrl: `https://finance.vietstock.vn/bao-cao-phan-tich/${id}/x.htm`,
    fileUrl: `https://finance.vietstock.vn/downloadedoc/${id}`,
    targetPriceVnd: null,
    ...over,
  };
}

/** In-memory ResearchStore: only the report-store half is real; the engine half must never be touched. */
class FakeStore {
  rows = new Map<string, ResearchReport & { attempts: number }>();
  hashes = new Set<string>();
  counts: Record<string, number> = {};
  failures: { id: string; error: string }[] = [];
  private seq = 0;

  async countReports(source: string) {
    return this.counts[source] ?? [...this.rows.values()].filter((r) => r.source === source).length;
  }
  async upsertListing(l: SourceReportListing) {
    const key = `${l.source}:${l.sourceReportId}`;
    const existing = this.rows.get(key);
    if (existing) return { id: existing.id, inserted: false };
    const id = `r${++this.seq}`;
    this.rows.set(key, {
      id,
      source: l.source,
      sourceReportId: l.sourceReportId,
      symbol: l.symbol,
      broker: l.broker,
      reportType: l.reportType,
      reportDate: l.reportDate,
      title: l.title,
      summary: l.summary,
      language: l.language,
      sourceUrl: l.sourceUrl,
      fileUrl: l.fileUrl,
      filePath: null,
      fileHash: null,
      targetPriceVnd: l.targetPriceVnd,
      targetSource: null,
      targetHorizon: null,
      downloadStatus: 'pending',
      processStatus: 'pending',
      processAttempts: 0,
      attempts: 0,
    });
    return { id, inserted: true };
  }
  async pendingDownloads() {
    return [...this.rows.values()].filter((r) => r.downloadStatus === 'pending');
  }
  async markDownloaded(id: string, file: { fileHash: string; filePath: string }) {
    const row = [...this.rows.values()].find((r) => r.id === id)!;
    if (this.hashes.has(file.fileHash)) {
      row.downloadStatus = 'duplicate';
      return 'duplicate' as const;
    }
    this.hashes.add(file.fileHash);
    row.downloadStatus = 'downloaded';
    row.fileHash = file.fileHash;
    row.filePath = file.filePath;
    return 'downloaded' as const;
  }
  async markDownloadFailed(id: string, error: string) {
    this.failures.push({ id, error });
    const row = [...this.rows.values()].find((r) => r.id === id)!;
    row.downloadStatus = 'failed';
  }
}

function pdf(label: string) {
  return new TextEncoder().encode(`%PDF-1.4\n${label}`);
}

function fakeSource(
  id: 'vietstock' | 'vndirect',
  items: SourceReportListing[],
  files: Record<string, Uint8Array | Error>,
) {
  const source = {
    id,
    list: vi.fn(async () => items),
    resolveFileUrl: vi.fn(async (l: SourceReportListing) => l.fileUrl),
    download: vi.fn(async (url: string) => {
      const file = files[url];
      if (!file) throw new Error(`404 ${url}`);
      if (file instanceof Error) throw file;
      return file;
    }),
  };
  return source satisfies ReportSource;
}

describe('ResearchSyncService', () => {
  let root: string;
  const config = () =>
    ({
      get: (key: string) => (key === 'MEDIA_ROOT' ? root : undefined),
    }) as unknown as ConfigService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'iqx-research-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const make = (store: FakeStore, sources: ReportSource[]) =>
    new ResearchSyncService(store as unknown as ResearchStore, sources, config());

  it('backfills 30 days on an empty store, then only the last 3 days', async () => {
    const store = new FakeStore();
    const source = fakeSource('vietstock', [], {});
    const service = make(store, [source]);

    expect(await service.sync({ today: TODAY })).toMatchObject({ backfill: true, listed: 0 });
    expect(source.list).toHaveBeenLastCalledWith('2026-09-13', TODAY, undefined);

    store.counts.vietstock = 12;
    expect(await service.sync({ today: TODAY })).toMatchObject({ backfill: false });
    expect(source.list).toHaveBeenLastCalledWith('2026-10-10', TODAY, undefined);
    expect(addDaysIso('2026-03-02', -3)).toBe('2026-02-27');
  });

  it('stores files under research/YYYY/MM/<sha256>.pdf and records them', async () => {
    const store = new FakeStore();
    const bytes = pdf('A');
    const l = listing('1');
    const result = await make(store, [fakeSource('vietstock', [l], { [l.fileUrl!]: bytes })]).sync({
      today: TODAY,
    });
    expect(result).toMatchObject({
      listed: 1,
      inserted: 1,
      downloaded: 1,
      duplicates: 0,
      failed: 0,
    });
    const row = store.rows.get('vietstock:1')!;
    const hash = sha256Hex(bytes);
    expect(row.fileHash).toBe(hash);
    expect(row.filePath).toBe(`research/2026/10/${hash}.pdf`);
    expect(existsSync(join(root, row.filePath!))).toBe(true);
    expect(await readReportFile(root, row.filePath!)).toEqual(bytes);
    await expect(readReportFile(root, '../outside.pdf')).rejects.toThrow(/escapes/);
  });

  it('counts the same file from two sources once (duplicate hash) and keeps one copy', async () => {
    const store = new FakeStore();
    const same = pdf('same-content');
    const a = listing('10');
    const b = listing('v-77', { source: 'vndirect', fileUrl: 'https://www.vndirect.com.vn/x.pdf' });
    const result = await make(store, [
      fakeSource('vietstock', [a], { [a.fileUrl!]: same }),
      fakeSource('vndirect', [b], { [b.fileUrl!]: same }),
    ]).sync({ today: TODAY });
    expect(result).toMatchObject({
      listed: 2,
      inserted: 2,
      downloaded: 1,
      duplicates: 1,
      failed: 0,
    });
    expect(store.hashes.size).toBe(1);
  });

  it('a failing download does not block the others and is marked failed', async () => {
    const store = new FakeStore();
    const items = [listing('1'), listing('2'), listing('3')];
    const files: Record<string, Uint8Array | Error> = {
      [items[0]!.fileUrl!]: pdf('one'),
      [items[1]!.fileUrl!]: new Error('HTTP 500'),
      [items[2]!.fileUrl!]: pdf('three'),
    };
    const result = await make(store, [fakeSource('vietstock', items, files)]).sync({
      today: TODAY,
    });
    expect(result).toMatchObject({ listed: 3, downloaded: 2, failed: 1 });
    expect(store.failures).toEqual([
      { id: store.rows.get('vietstock:2')!.id, error: expect.stringContaining('HTTP 500') },
    ]);
  });

  it('stores multi-symbol / industry listings (symbol null) without special handling', async () => {
    const store = new FakeStore();
    const industry = listing('9', {
      symbol: null,
      reportType: 'industry',
      title: 'Báo cáo ngành Thép',
    });
    const result = await make(store, [
      fakeSource('vietstock', [industry], { [industry.fileUrl!]: pdf('industry') }),
    ]).sync({ today: TODAY });
    expect(result.inserted).toBe(1);
    expect(store.rows.get('vietstock:9')).toMatchObject({
      symbol: null,
      reportType: 'industry',
      downloadStatus: 'downloaded',
      processStatus: 'pending',
    });
  });

  it('is idempotent on re-listing and survives one source failing to list', async () => {
    const store = new FakeStore();
    const l = listing('1');
    const good = fakeSource('vietstock', [l], { [l.fileUrl!]: pdf('x') });
    const bad = fakeSource('vndirect', [], {});
    bad.list.mockRejectedValue(new Error('vndirect down'));
    const service = make(store, [good, bad]);
    expect(await service.sync({ today: TODAY })).toMatchObject({
      inserted: 1,
      downloaded: 1,
      failed: 1,
    });
    expect(await service.sync({ today: TODAY })).toMatchObject({ inserted: 0, downloaded: 0 });
  });

  it('resolves the file url through the source when the listing has none', async () => {
    const store = new FakeStore();
    const l = listing('5', { fileUrl: null });
    const source = fakeSource('vietstock', [l], {
      'https://finance.vietstock.vn/downloadedoc/5': pdf('resolved'),
    });
    source.resolveFileUrl.mockResolvedValue('https://finance.vietstock.vn/downloadedoc/5');
    expect(await make(store, [source]).sync({ today: TODAY })).toMatchObject({
      downloaded: 1,
      failed: 0,
    });
    expect(source.resolveFileUrl).toHaveBeenCalledOnce();
  });
});
