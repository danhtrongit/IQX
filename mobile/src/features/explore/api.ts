/**
 * Market insights: Săn mã (cap5/san-ma), AI news and AI patterns.
 * Mirrors frontend/src/pages/demo-trading/{insights,market}. Unknown values stay null ("—"), never 0.
 */
import { apiRequest, ApiError } from '@/lib/api';
import { num, rows, str } from '@/features/market';

type Raw = Record<string, unknown>;

export const exploreKeys = {
  huntFilters: ['explore', 'hunt', 'filters'] as const,
  hunt: (filter: string) => ['explore', 'hunt', filter] as const,
  news: (ticker: string, sentiment: string) => ['explore', 'news', ticker, sentiment] as const,
  article: (slug: string) => ['explore', 'news-article', slug] as const,
  patterns: (kind: PatternKind, symbol: string) => ['explore', 'patterns', kind, symbol] as const,
};

/** Query key owned by the trading feature; invalidated after adding to the watchlist. */
export const WATCHLIST_KEY = ['trading', 'watchlist'] as const;

/* ── Săn mã ─────────────────────────────────────────────────────────────── */

export type HuntFilter = {
  ma: string;
  icon: string | null;
  ten: string;
  moTa: string | null;
  dieuKien: string | null;
  available: boolean;
  reason: string | null;
};

export function adaptHuntFilters(payload: unknown): HuntFilter[] {
  const list = payload && typeof payload === 'object' ? (payload as Raw).bo_loc : null;
  if (!Array.isArray(list)) return [];
  return (list as Raw[]).flatMap((raw) => {
    const ma = str(raw?.ma);
    const ten = str(raw?.ten);
    if (!ma || !ten) return [];
    return [
      {
        ma,
        icon: str(raw.icon),
        ten,
        moTa: str(raw.mo_ta),
        dieuKien: str(raw.dieu_kien),
        available: raw.kha_dung !== false,
        reason: str(raw.ly_do_chua_kha_dung),
      },
    ];
  });
}

export async function fetchHuntFilters(signal?: AbortSignal): Promise<HuntFilter[]> {
  return adaptHuntFilters(await apiRequest<unknown>('/cap5/san-ma', { signal }));
}

export type HuntItem = {
  rank: number;
  symbol: string;
  price: number | null;
  changePct: number | null;
  signal: string | null;
  rankValue: number | null;
};

export type HuntResult = {
  filter: string;
  items: HuntItem[];
  total: number | null;
  examined: number | null;
  complete: boolean | null;
  warnings: string[];
  rankBy: string | null;
  available: boolean;
  reason: string | null;
};

export function adaptHuntResult(payload: unknown, filter: string): HuntResult {
  const raw: Raw = payload && typeof payload === 'object' ? (payload as Raw) : {};
  const items = rows(raw.items).flatMap((row, index): HuntItem[] => {
    const symbol = str(row.symbol)?.toUpperCase();
    if (!symbol) return [];
    return [
      {
        rank: num(row.hang) ?? index + 1,
        symbol,
        price: num(row.gia_vnd),
        changePct: num(row.pct_thay_doi),
        signal: str(row.tin_hieu),
        rankValue: num(row.gia_tri_xep_hang),
      },
    ];
  });
  const warn = raw.canh_bao_thieu_du_lieu;
  const warnings = Array.isArray(warn)
    ? warn.flatMap((w) => (typeof w === 'string' ? [w] : w && typeof w === 'object' ? [str((w as Raw).message) ?? str((w as Raw).symbol) ?? ''].filter(Boolean) : []))
    : typeof warn === 'string' && warn.trim()
      ? [warn]
      : [];
  return {
    filter,
    items,
    total: num(raw.tong_so_ma),
    examined: num(raw.so_ma_xet),
    complete: typeof raw.ket_qua_day_du === 'boolean' ? raw.ket_qua_day_du : null,
    warnings,
    rankBy: str(raw.xep_hang_theo),
    available: raw.kha_dung !== false,
    reason: str(raw.ly_do_chua_kha_dung),
  };
}

/** 404 means "Chưa có dữ liệu": resolved as `null` rather than an error. */
export async function fetchHuntResult(filter: string, signal?: AbortSignal): Promise<HuntResult | null> {
  try {
    return adaptHuntResult(await apiRequest<unknown>(`/cap5/san-ma/${encodeURIComponent(filter)}`, { signal }), filter);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function addToWatchlist(symbol: string): Promise<unknown> {
  return apiRequest('/watchlists', { method: 'POST', body: { symbol } });
}

/** Friendly Vietnamese message for a failed "Thêm vào theo dõi". */
export function watchlistErrorMessage(error: unknown, symbol: string): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return `${symbol} đã có trong danh sách theo dõi.`;
    if (error.status === 400 || error.status === 422) return error.message || `Không thể thêm ${symbol} vào danh sách theo dõi.`;
  }
  return error instanceof Error && error.message ? error.message : 'Chưa thêm được vào danh sách theo dõi. Vui lòng thử lại.';
}

/* ── News ───────────────────────────────────────────────────────────────── */

export const NEWS_PAGE_SIZE = 12;

export type NewsSentiment = 'all' | 'Positive' | 'Neutral' | 'Negative';

export const SENTIMENT_OPTIONS: { value: NewsSentiment; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'Positive', label: 'Tích cực' },
  { value: 'Negative', label: 'Tiêu cực' },
  { value: 'Neutral', label: 'Trung lập' },
];

export function sentimentLabel(value: string | null): string | null {
  switch (value?.toLowerCase()) {
    case 'positive':
      return 'Tích cực';
    case 'negative':
      return 'Tiêu cực';
    case 'neutral':
      return 'Trung lập';
    default:
      return null;
  }
}

export type NewsItem = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  imageUrl: string | null;
  sourceName: string | null;
  sentiment: string | null;
  updatedAt: string | null;
  ticker: string | null;
};

export type NewsPage = { items: NewsItem[]; total: number };

export type NewsArticle = NewsItem & { body: string | null; sourceLink: string | null };

export function adaptNewsItem(raw: Raw): NewsItem | null {
  const title = str(raw.title);
  const slug = str(raw.slug);
  if (!title || !slug) return null;
  const image = str(raw.image_url);
  return {
    id: str(raw.id) ?? slug,
    slug,
    title,
    summary: str(raw.short_content),
    imageUrl: image && /^https?:\/\//i.test(image) ? image : null,
    sourceName: str(raw.source_name) ?? str(raw.source),
    sentiment: str(raw.sentiment),
    updatedAt: str(raw.update_date) ?? str(raw.updated_at),
    ticker: str(raw.ticker),
  };
}

export function adaptNewsPage(payload: unknown): NewsPage {
  const raw: Raw = payload && typeof payload === 'object' ? (payload as Raw) : {};
  const items = rows(Array.isArray(raw.data) ? raw.data : []).map(adaptNewsItem).filter((i): i is NewsItem => i !== null);
  return { items, total: num(raw.total_records) ?? items.length };
}

export async function fetchNews(
  params: { page: number; ticker?: string; sentiment?: NewsSentiment },
  signal?: AbortSignal,
): Promise<NewsPage> {
  const payload = await apiRequest<unknown>('/market-data/news/ai', {
    query: {
      page: params.page,
      page_size: NEWS_PAGE_SIZE,
      language: 'vi',
      ticker: params.ticker ? params.ticker.trim().toUpperCase() : undefined,
      sentiment: params.sentiment && params.sentiment !== 'all' ? params.sentiment : undefined,
    },
    signal,
  });
  return adaptNewsPage(payload);
}

/** Whether another page is worth requesting after `loaded` rows. */
export function nextNewsPage(lastPage: NewsPage, allPages: NewsPage[]): number | undefined {
  if (lastPage.items.length === 0) return undefined;
  const loaded = allPages.reduce((n, p) => n + p.items.length, 0);
  return loaded < lastPage.total ? allPages.length + 1 : undefined;
}

export function adaptNewsArticle(payload: unknown): NewsArticle | null {
  const raw = payload && typeof payload === 'object' ? ((payload as Raw).data as Raw | undefined) : undefined;
  if (!raw) return null;
  const item = adaptNewsItem(raw);
  if (!item) return null;
  return { ...item, body: str(raw.news_full_content_text) ?? str(raw.summary), sourceLink: str(raw.source_link) };
}

export async function fetchNewsArticle(slug: string, signal?: AbortSignal): Promise<NewsArticle | null> {
  return adaptNewsArticle(await apiRequest<unknown>(`/market-data/news/ai/detail/${encodeURIComponent(slug)}`, { query: { language: 'vi' }, signal }));
}

/* ── Patterns ───────────────────────────────────────────────────────────── */

export type PatternKind = 'candles' | 'charts';
export type PatternSignal = 'bullish' | 'bearish' | 'neutral';

export type PatternItem = {
  name: string;
  signal: PatternSignal;
  signalLabel: string | null;
  state: string | null;
  meaning: string | null;
  action: string | null;
};

export function adaptPatternSignal(value: unknown): PatternSignal {
  const raw = str(value)?.toLowerCase() ?? '';
  return raw === 'bullish' || raw === 'bearish' ? raw : 'neutral';
}

export function adaptPatterns(payload: unknown): PatternItem[] {
  return rows(payload).flatMap((raw) => {
    const name = str(raw.name);
    if (!name) return [];
    return [
      {
        name,
        signal: adaptPatternSignal(raw.signal),
        signalLabel: str(raw.signalLabel),
        state: str(raw.state),
        meaning: str(raw.meaning),
        action: str(raw.action),
      },
    ];
  });
}

export async function fetchPatterns(kind: PatternKind, symbol: string, signal?: AbortSignal): Promise<PatternItem[]> {
  return adaptPatterns(await apiRequest<unknown>(`/ai/patterns/${kind}`, { query: { symbol: symbol.trim().toUpperCase() }, signal }));
}
