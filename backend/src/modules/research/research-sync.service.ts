import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REPORT_SOURCES, RESEARCH_STORE, type ResearchStore } from './research.ports.js';
import {
  REPORT_WINDOW_DAYS,
  type ReportSource,
  type ResearchReport,
  type SourceReportListing,
} from './research.types.js';
import { resolveMediaRoot, saveReportFile, sha256Hex } from './report-files.js';

export type ResearchSyncResult = {
  listed: number;
  inserted: number;
  downloaded: number;
  duplicates: number;
  failed: number;
  /** True when at least one source was empty and ran the 30-day backfill. */
  backfill: boolean;
};

const DOWNLOAD_BATCH = 200;
const MAX_DOWNLOAD_ATTEMPTS = 3;
/** Regular runs re-list the last days too, to catch reports a broker lists late. */
const OVERLAP_DAYS = 3;

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

function toListing(report: ResearchReport): SourceReportListing {
  return {
    source: report.source,
    sourceReportId: report.sourceReportId,
    symbol: report.symbol,
    broker: report.broker,
    brokerRaw: report.broker,
    reportType: report.reportType,
    reportDate: report.reportDate,
    title: report.title,
    summary: report.summary,
    language: report.language,
    sourceUrl: report.sourceUrl,
    fileUrl: report.fileUrl,
    targetPriceVnd: report.targetPriceVnd,
  };
}

/** Daily job (and first-deploy backfill): lists broker reports and downloads their PDFs. Never calls AI. */
@Injectable()
export class ResearchSyncService {
  private readonly logger = new Logger(ResearchSyncService.name);

  constructor(
    @Inject(RESEARCH_STORE) private readonly store: ResearchStore,
    @Inject(REPORT_SOURCES) private readonly sources: ReportSource[],
    private readonly config: ConfigService,
  ) {}

  async sync(input: { today: string; signal?: AbortSignal }): Promise<ResearchSyncResult> {
    const result: ResearchSyncResult = {
      listed: 0,
      inserted: 0,
      downloaded: 0,
      duplicates: 0,
      failed: 0,
      backfill: false,
    };
    for (const source of this.sources) {
      if (input.signal?.aborted) break;
      await this.listSource(source, input.today, input.signal, result);
    }
    await this.downloadPending(input.signal, result);
    this.logger.log(`research sync: ${JSON.stringify(result)}`);
    return result;
  }

  private async listSource(
    source: ReportSource,
    today: string,
    signal: AbortSignal | undefined,
    result: ResearchSyncResult,
  ) {
    try {
      const empty = (await this.store.countReports(source.id)) === 0;
      if (empty) result.backfill = true;
      const from = addDaysIso(today, empty ? -REPORT_WINDOW_DAYS : -OVERLAP_DAYS);
      const listings = await source.list(from, today, signal);
      result.listed += listings.length;
      for (const listing of listings) {
        try {
          const upserted = await this.store.upsertListing(listing);
          if (upserted.inserted) result.inserted += 1;
        } catch (error) {
          result.failed += 1;
          this.logger.warn(
            `upsert ${source.id}/${listing.sourceReportId} failed: ${(error as Error).message}`,
          );
        }
      }
    } catch (error) {
      result.failed += 1;
      this.logger.warn(`listing ${source.id} failed: ${(error as Error).message}`);
    }
  }

  private async downloadPending(signal: AbortSignal | undefined, result: ResearchSyncResult) {
    const sourceById = new Map(this.sources.map((s) => [s.id, s] as const));
    const pending = await this.store.pendingDownloads(DOWNLOAD_BATCH, MAX_DOWNLOAD_ATTEMPTS);
    let mediaRoot: string | null = null;
    for (const report of pending) {
      if (signal?.aborted) break;
      try {
        mediaRoot ??= resolveMediaRoot(this.config);
        const source = sourceById.get(report.source);
        if (!source) throw new Error(`no source adapter for ${report.source}`);
        const fileUrl = report.fileUrl ?? (await source.resolveFileUrl(toListing(report), signal));
        if (!fileUrl) throw new Error('no file url');
        const bytes = await source.download(fileUrl, signal);
        const stored = await saveReportFile(mediaRoot, bytes, report.reportDate);
        const status = await this.store.markDownloaded(report.id, {
          filePath: stored.filePath,
          fileHash: sha256Hex(bytes),
          fileBytes: stored.fileBytes,
          fileUrl,
        });
        if (status === 'duplicate') result.duplicates += 1;
        else result.downloaded += 1;
      } catch (error) {
        result.failed += 1;
        const message = (error as Error).message ?? String(error);
        this.logger.warn(`download ${report.source}/${report.sourceReportId} failed: ${message}`);
        await this.store
          .markDownloadFailed(report.id, message.slice(0, 500))
          .catch(() => undefined);
      }
    }
  }
}
