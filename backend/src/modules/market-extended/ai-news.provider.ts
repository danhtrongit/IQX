import { Injectable, NotFoundException } from '@nestjs/common';
import { MarketHttpClient } from './market-http.client.js';
import {
  asArray,
  asRecord,
  isRecord,
  type JsonObject,
  type SourceResult,
} from './market-extended.types.js';

const BASE = 'https://ai.vietcap.com.vn';
const headers = { referer: `${BASE}/`, origin: BASE };
const PATHS = {
  business: '/api/v3/news_info',
  topic: '/api/v3/topics_info',
  exchange: '/api/v3/xnews_info',
} as const;

export type AiNewsKind = keyof typeof PATHS;
export type AiNewsQuery = {
  page: number;
  pageSize: number;
  ticker?: string;
  industry?: string;
  topic?: string;
  source?: string;
  sentiment?: string;
  updateFrom?: string;
  updateTo?: string;
};

function item(raw: JsonObject, kind: string) {
  return {
    id: raw.id ?? '',
    slug: raw.slug ?? '',
    ticker: raw.ticker ?? '',
    industry: raw.industry ?? '',
    title: raw.news_title ?? '',
    short_content: raw.news_short_content ?? '',
    source_link: raw.news_source_link ?? '',
    image_url: raw.news_image_url ?? '',
    update_date: raw.update_date ?? '',
    source: raw.news_from ?? '',
    source_name: raw.news_from_name ?? '',
    sentiment: raw.sentiment ?? '',
    score: raw.score ?? 0,
    topic_name: raw.topic_name ?? '',
    male_audio_duration: raw.male_audio_duration ?? 0,
    female_audio_duration: raw.female_audio_duration ?? 0,
    raw_type: kind,
  };
}
function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class AiNewsProvider {
  constructor(private readonly http: MarketHttpClient) {}

  async list(
    kind: AiNewsKind,
    query: AiNewsQuery,
  ): Promise<SourceResult<{ items: unknown[]; total: number }>> {
    const sourceUrl = `${BASE}${PATHS[kind]}`;
    const earliest = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const root = asRecord(
      await this.http.json(sourceUrl, 'GET', {
        headers,
        query: {
          page: query.page,
          page_size: Math.min(query.pageSize, 99),
          language: 'vi',
          ticker: query.ticker,
          industry: query.industry,
          topic: query.topic,
          newsfrom: query.source,
          sentiment: query.sentiment,
          update_from:
            query.updateFrom && query.updateFrom > earliest
              ? query.updateFrom
              : query.updateFrom
                ? earliest
                : undefined,
          update_to: query.updateTo,
        },
      }),
      'AI news',
    );
    return {
      sourceUrl,
      data: {
        items: asArray(root.news_info, 'news_info').map((entry) =>
          item(asRecord(entry, 'news item'), kind),
        ),
        total: Number(root.total_records ?? 0),
      },
    };
  }

  async detail(slug: string): Promise<SourceResult<unknown>> {
    const sourceUrl = `${BASE}/api/v3/news_from_slug`;
    const raw = asRecord(
      await this.http.json(sourceUrl, 'GET', { headers, query: { slug, language: 'vi' } }),
      'AI news detail',
    );
    if (!raw.id)
      throw new NotFoundException({
        code: 'NEWS_NOT_FOUND',
        message: `No detail found for slug='${slug}'`,
      });
    const html = String(raw.news_full_content ?? '');
    return {
      sourceUrl,
      data: {
        ...item(raw, String(raw.news_type ?? 'unknown')),
        company_name: raw.company_name ?? '',
        summary: raw.summary ?? '',
        highlight_position: raw.highlight_position ?? '',
        news_full_content_html: html,
        news_full_content_text: stripHtml(html),
        file_attachments: raw.file_attachment ?? [],
        news_type: raw.news_type ?? '',
      },
    };
  }

  async audio(id: string): Promise<SourceResult<unknown>> {
    const sourceUrl = `${BASE}/api/audio_from_id`;
    const raw = asRecord(
      await this.http.json(sourceUrl, 'GET', { headers, query: { id } }),
      'AI news audio',
    );
    if (!('male' in raw) && !('female' in raw))
      throw new NotFoundException({
        code: 'AUDIO_NOT_FOUND',
        message: `No audio found for id='${id}'`,
      });
    return { sourceUrl, data: { male_url: raw.male ?? '', female_url: raw.female ?? '' } };
  }

  async catalogs(): Promise<{ data: JsonObject; sourceUrls: string[] }> {
    const tasks = [
      this.catalog('topics', '/api/v3/topics_all', { language: 'vi' }, (raw) =>
        asArray(asRecord(raw, 'topics').static_topic, 'topics')
          .filter(isRecord)
          .map((i) => ({ name: i.name ?? '', key: i.key ?? '' })),
      ),
      this.catalog('sources', '/api/v3/get_source_info', { language: 'vi' }, (raw) =>
        asArray(raw, 'sources')
          .filter(isRecord)
          .map((i) => ({ name: i.viName ?? i.enName ?? '', value: i.value ?? '' })),
      ),
      this.catalog('industries', '/api/get_industry_info', {}, (raw) =>
        asArray(raw, 'industries')
          .filter(isRecord)
          .map((i) => ({ name: i.viName ?? i.enName ?? '', value: i.value ?? '' })),
      ),
      this.catalog(
        'top_tickers',
        '/api/v2/get_top_tickers',
        { industry: '', group: 'hose', top_neg: '5', top_pos: '5' },
        (raw) =>
          asArray(asRecord(raw, 'top tickers').ticker_info, 'top tickers')
            .filter(isRecord)
            .map((i) => ({
              ticker: i.ticker ?? '',
              score: i.score ?? 0,
              sentiment: i.sentiment ?? '',
              company_name: i.organ_name ?? '',
              logo: i.logo ?? '',
            })),
      ),
    ];
    const settled = await Promise.allSettled(tasks);
    const data: JsonObject = {};
    const sourceUrls: string[] = [];
    const warnings: string[] = [];
    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index]!;
      const name = ['topics', 'sources', 'industries', 'top_tickers'][index]!;
      if (result.status === 'fulfilled') {
        data[name] = result.value.data;
        sourceUrls.push(result.value.sourceUrl);
      } else {
        data[name] = [];
        warnings.push(`${name}: unavailable`);
      }
    }
    data.partial = warnings.length > 0;
    data.available_sections = ['topics', 'sources', 'industries', 'top_tickers'].filter(
      (name) => Array.isArray(data[name]) && (data[name] as unknown[]).length > 0,
    );
    data.warnings = warnings;
    return { data, sourceUrls };
  }

  async sentiment(symbol: string): Promise<SourceResult<unknown>> {
    const sourceUrl = `${BASE}/api/v3/ticker_score`;
    const root = asRecord(
      await this.http.json(sourceUrl, 'GET', {
        headers,
        query: { ticker: symbol, industry: '', group: '', summary: 'false', language: 'vi' },
      }),
      'ticker score',
    );
    const first =
      Array.isArray(root.ticker_info) && isRecord(root.ticker_info[0])
        ? root.ticker_info[0]
        : undefined;
    return {
      sourceUrl,
      data: first
        ? {
            ticker: first.ticker ?? symbol,
            score: first.score ?? 0,
            sentiment: first.sentiment ?? '',
            news_count: first.cnt_news ?? 0,
            count_positive: first.count_pos ?? 0,
            count_neutral: first.count_neu ?? 0,
            count_negative: first.count_neg ?? 0,
            company_name: first.organ_name ?? '',
            logo: first.logo ?? '',
            summaries: first.extractive_summaries ?? [],
            summary_sentiments: first.extractive_sentiments ?? [],
          }
        : { ticker: symbol, score: 0, sentiment: '', news_count: 0 },
    };
  }

  private async catalog(
    name: string,
    path: string,
    query: Record<string, string>,
    normalize: (raw: unknown) => unknown,
  ): Promise<{ name: string; data: unknown; sourceUrl: string }> {
    const sourceUrl = `${BASE}${path}`;
    return {
      name,
      sourceUrl,
      data: normalize(await this.http.json(sourceUrl, 'GET', { headers, query })),
    };
  }
}
