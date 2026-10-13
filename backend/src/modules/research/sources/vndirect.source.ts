import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ReportSource, ReportType, SourceReportListing } from '../research.types.js';
import { normalizeBroker } from './broker-aliases.js';
import { htmlToText } from './html-text.js';
import { SourceHttp } from './source-http.js';
import { parseTargetPriceVnd } from './target-parse.js';

const API = 'https://api-finfo.vndirect.com.vn/v4/news';
const PAGE_SIZE = 100;
const MAX_PAGES = 30;
const SUMMARY_MAX_CHARS = 2000;
const TICKER = /^[A-Z0-9]{3}$/;
const TITLE_PREFIX = /^\s*([A-Z0-9]{3})\s*[-–:]/;

export interface VndirectNewsItem {
  newsId?: string | number;
  tagCodes?: string | null;
  newsDate?: string;
  newsSource?: string | null;
  newsTitle?: string | null;
  newsAbstract?: string | null;
  newsContent?: string | null;
  newsUrl?: string | null;
  dstockUrl?: string | null;
  locale?: string | null;
  attachments?: { name?: string; url?: string | null }[] | null;
}

function pickPdf(item: VndirectNewsItem): string | null {
  const urls = (item.attachments ?? [])
    .map((a) => a.url ?? '')
    .filter((u) => /^https:\/\//i.test(u));
  return urls.find((u) => /\.pdf(?:$|\?)/i.test(u)) ?? urls[0] ?? null;
}

function detectLanguage(item: VndirectNewsItem, text: string): 'vi' | 'en' {
  const locale = (item.locale ?? '').toUpperCase();
  if (locale.startsWith('VI')) return 'vi';
  if (locale.startsWith('EN')) return 'en';
  return /[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i.test(text) ? 'vi' : 'en';
}

export function toVndirectListing(item: VndirectNewsItem): SourceReportListing | null {
  const id = item.newsId == null ? '' : String(item.newsId);
  const title = htmlToText(item.newsTitle ?? '');
  const date = (item.newsDate ?? '').slice(0, 10);
  if (!id || !title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const tags = (item.tagCodes ?? '')
    .split(/[,;\s]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  const validTags = [...new Set(tags.filter((t) => TICKER.test(t)))];
  let symbol: string | null = null;
  let reportType: ReportType = 'company';
  if (validTags.length === 1) {
    symbol = validTags[0] ?? null;
  } else if (validTags.length > 1) {
    reportType = 'other';
  } else {
    const prefix = TITLE_PREFIX.exec(title)?.[1];
    if (prefix && TICKER.test(prefix)) symbol = prefix;
    else return null; // symbol unknown → skipped (no AI identification)
  }
  if (reportType === 'company' && /\btechnical\b/i.test(title)) reportType = 'technical';

  const body = htmlToText(item.newsContent ?? '');
  const abstract = htmlToText(item.newsAbstract ?? '');
  const summary = [abstract, body].filter(Boolean).join(' ').slice(0, SUMMARY_MAX_CHARS);
  const { broker, brokerRaw } = normalizeBroker(item.newsSource || 'VNDIRECT');
  return {
    source: 'vndirect',
    sourceReportId: id,
    symbol,
    broker,
    brokerRaw,
    reportType,
    reportDate: date,
    title,
    summary,
    language: detectLanguage(item, `${title} ${summary}`),
    sourceUrl:
      item.newsUrl || item.dstockUrl || `https://dstock.vndirect.com.vn/tin-tuc/null/${id}`,
    fileUrl: pickPdf(item),
    targetPriceVnd: reportType === 'company' ? parseTargetPriceVnd(`${title}. ${summary}`) : null,
  };
}

@Injectable()
export class VndirectSource implements ReportSource {
  readonly id = 'vndirect' as const;
  private readonly logger = new Logger(VndirectSource.name);

  private readonly http: SourceHttp;

  /** `config` supplies MEDIA_MAX_PDF_MB; tests pass a stub `http` instead. */
  constructor(@Optional() config?: ConfigService, @Optional() http?: SourceHttp) {
    this.http =
      http ?? new SourceHttp({ maxPdfMb: Number(config?.get('MEDIA_MAX_PDF_MB') ?? 100) });
  }

  async list(
    fromDate: string,
    toDate: string,
    signal?: AbortSignal,
  ): Promise<SourceReportListing[]> {
    const out = new Map<string, SourceReportListing>();
    let skipped = 0;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const q = `newsType:company_report~newsDate:gte:${fromDate}~newsDate:lte:${toDate}`;
      const url = `${API}?q=${q}&size=${PAGE_SIZE}&sort=newsDate:desc&page=${page}`;
      const { text } = await this.http.text(
        url,
        { headers: { origin: 'https://dstock.vndirect.com.vn', accept: 'application/json' } },
        signal,
      );
      let payload: { data?: VndirectNewsItem[]; totalPages?: number };
      try {
        payload = JSON.parse(text) as typeof payload;
      } catch {
        throw new Error('vndirect: response is not JSON');
      }
      const data = Array.isArray(payload.data) ? payload.data : [];
      for (const item of data) {
        const listing = toVndirectListing(item);
        if (!listing) skipped += 1;
        else if (listing.reportDate >= fromDate && listing.reportDate <= toDate)
          out.set(listing.sourceReportId, listing);
      }
      if (data.length === 0 || page >= (payload.totalPages ?? 0)) break;
    }
    if (skipped > 0)
      this.logger.warn(`vndirect: skipped ${skipped} reports without a recognizable symbol`);
    return [...out.values()];
  }

  async resolveFileUrl(listing: SourceReportListing): Promise<string | null> {
    return listing.fileUrl;
  }

  download(fileUrl: string, signal?: AbortSignal): Promise<Uint8Array> {
    return this.http.binary(
      fileUrl,
      { headers: { origin: 'https://dstock.vndirect.com.vn' } },
      signal,
    );
  }
}
