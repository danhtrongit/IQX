import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ReportSource, ReportType, SourceReportListing } from '../research.types.js';
import { foldText, normalizeBroker } from './broker-aliases.js';
import { htmlToText } from './html-text.js';
import { SourceHttp } from './source-http.js';
import { parseTargetPriceVnd } from './target-parse.js';

const BASE = 'https://finance.vietstock.vn';
const TOKEN_PAGE = `${BASE}/bao-cao-phan-tich/phan-tich-doanh-nghiep`;
const LIST_ENDPOINT = `${BASE}/View/ChannelEDocumentPage`;
const PAGE_SIZE = 20;
const MAX_PAGES = 100;

/** Vietstock `reportTypeID` of each channel (read from the channel pages, 2026-10-13). */
const CHANNELS: { reportTypeId: number; kind: 'company' | 'industry' | 'macro_strategy' }[] = [
  { reportTypeId: 58, kind: 'company' },
  { reportTypeId: 57, kind: 'industry' },
  { reportTypeId: 51, kind: 'macro_strategy' },
];

const TICKER = /^[A-Z0-9]{3}$/;
const TITLE_TICKER = /^\s*([A-Z0-9]{3})\s*:/;
const TITLE_MULTI = /^\s*(?:[A-Z0-9]{3}\s*[,;/&+]\s*)+[A-Z0-9]{3}\s*:/;

export interface VietstockItem {
  id: string;
  slug: string;
  title: string;
  brokerRaw: string;
  date: string;
  summary: string;
}

/** Extracts the report cards (`edoc-first` / `edoc-child`) from a ChannelEDocumentPage fragment. */
export function parseVietstockFragment(html: string): VietstockItem[] {
  const starts = [...html.matchAll(/<div class="[^"]*\bedoc-(?:first|child)\b[^"]*"/g)].map(
    (m) => m.index ?? 0,
  );
  const items: VietstockItem[] = [];
  starts.forEach((start, index) => {
    const block = html.slice(start, starts[index + 1] ?? html.length);
    const href = [
      ...block.matchAll(
        /<a\b[^>]*href="\/bao-cao-phan-tich\/(\d+)\/([^"/]+?)\.htm"[^>]*>([\s\S]*?)<\/a>/g,
      ),
    ].find((m) => htmlToText(m[3] ?? ''));
    const dateMatch = /<i>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/i>/.exec(block);
    if (!href || !dateMatch) return;
    const broker = /<span>\s*Ngu[^<]*<\/span>\s*<(b|a)\b[^>]*>([\s\S]*?)<\/\1>/.exec(block);
    const summary = /<span>\s*N[^<]*dung[^<]*<\/span>\s*<b>([\s\S]*?)<\/b>/.exec(block);
    items.push({
      id: href[1] ?? '',
      slug: href[2] ?? '',
      title: htmlToText(href[3] ?? ''),
      brokerRaw: htmlToText(broker?.[2] ?? ''),
      date: `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`,
      summary: htmlToText(summary?.[1] ?? ''),
    });
  });
  return items;
}

function isTechnical(title: string): boolean {
  const folded = foldText(title);
  return /\bky thuat\b|\btechnical analysis\b|\bphan tich ky thuat\b/.test(folded);
}

/** Maps a parsed card into a listing, or null when the symbol of a company report is unknown. */
export function toVietstockListing(
  item: VietstockItem,
  kind: 'company' | 'industry' | 'macro_strategy',
): SourceReportListing | null {
  if (!item.id || !item.title || !item.date) return null;
  let reportType: ReportType;
  let symbol: string | null = null;
  if (kind === 'company') {
    const ticker = TITLE_TICKER.exec(item.title)?.[1];
    if (ticker && TICKER.test(ticker)) {
      symbol = ticker;
      reportType = isTechnical(item.title) ? 'technical' : 'company';
    } else if (TITLE_MULTI.test(item.title)) {
      reportType = 'other';
    } else {
      return null; // symbol unknown → skipped (no AI identification)
    }
  } else if (kind === 'industry') {
    reportType = 'industry';
  } else {
    reportType = /\bvi mo\b/.test(foldText(item.title)) ? 'macro' : 'strategy';
  }
  const { broker, brokerRaw } = normalizeBroker(item.brokerRaw);
  return {
    source: 'vietstock',
    sourceReportId: item.id,
    symbol,
    broker,
    brokerRaw,
    reportType,
    reportDate: item.date,
    title: item.title,
    summary: item.summary,
    language: 'vi',
    sourceUrl: `${BASE}/bao-cao-phan-tich/${item.id}/${item.slug}.htm`,
    fileUrl: `${BASE}/downloadedoc/${item.id}`,
    targetPriceVnd:
      reportType === 'company' ? parseTargetPriceVnd(`${item.title}. ${item.summary}`) : null,
  };
}

function cookieHeader(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0]?.trim() ?? '')
    .filter(Boolean)
    .join('; ');
}

function extractToken(html: string): string | null {
  const m =
    /name="?__RequestVerificationToken"?[^>]*?value="?([^"\s>]+)/i.exec(html) ??
    /value="?([^"\s>]+)"?[^>]*name="?__RequestVerificationToken/i.exec(html);
  return m?.[1] ?? null;
}

@Injectable()
export class VietstockSource implements ReportSource {
  readonly id = 'vietstock' as const;
  private readonly logger = new Logger(VietstockSource.name);

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
    const session = await this.openSession(signal);
    const out = new Map<string, SourceReportListing>();
    let skipped = 0;
    for (const channel of CHANNELS) {
      const seen = new Set<string>();
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const form = new URLSearchParams({
          reportTypeID: String(channel.reportTypeId),
          fromdate: fromDate,
          todate: toDate,
          page: String(page),
          pageSize: String(PAGE_SIZE),
          __RequestVerificationToken: session.token,
        });
        const { text } = await this.http.text(
          LIST_ENDPOINT,
          {
            method: 'POST',
            body: form.toString(),
            headers: {
              'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'x-requested-with': 'XMLHttpRequest',
              referer: TOKEN_PAGE,
              origin: BASE,
              cookie: session.cookie,
            },
          },
          signal,
        );
        const items = parseVietstockFragment(text);
        const fresh = items.filter((item) => !seen.has(item.id));
        fresh.forEach((item) => seen.add(item.id));
        for (const item of fresh) {
          if (item.date < fromDate || item.date > toDate) continue;
          const listing = toVietstockListing(item, channel.kind);
          if (!listing) skipped += 1;
          else out.set(listing.sourceReportId, listing);
        }
        if (items.length < PAGE_SIZE || fresh.length === 0) break;
      }
    }
    if (skipped > 0)
      this.logger.warn(
        `vietstock: skipped ${skipped} company reports without a recognizable symbol`,
      );
    return [...out.values()];
  }

  async resolveFileUrl(listing: SourceReportListing): Promise<string | null> {
    return listing.fileUrl ?? `${BASE}/downloadedoc/${listing.sourceReportId}`;
  }

  download(fileUrl: string, signal?: AbortSignal): Promise<Uint8Array> {
    return this.http.binary(fileUrl, { headers: { referer: `${BASE}/bao-cao-phan-tich` } }, signal);
  }

  private async openSession(signal?: AbortSignal): Promise<{ token: string; cookie: string }> {
    const { text, headers } = await this.http.text(TOKEN_PAGE, {}, signal);
    const token = extractToken(text);
    if (!token) throw new Error('vietstock: anti-forgery token not found on the channel page');
    return { token, cookie: cookieHeader(headers) };
  }
}
