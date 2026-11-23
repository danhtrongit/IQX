/**
 * Global, Commodities/FX, Corporate Events, and Market News aggregators (4 widgets):
 *  13. `world_indices`   — Chỉ số thế giới (12 global indices)
 *  14. `commodities_fx`  — Hàng hoá và tỷ giá (+ ICB Level 4 mapped VN sector % today)
 *  15. `events_calendar` — Lịch sự kiện (next 30 days + dividend yield %)
 *  16. `market_news`     — Tin thị trường (VCI AI News + VN RSS blend)
 */
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../platform/database/database.service.js';
import { MarketHttpTransport } from '../../market-data/providers/http.transport.js';
import { VciMarketProvider } from '../../market-data/providers/vci.provider.js';
import { AiNewsProvider } from '../../market-extended/ai-news.provider.js';
import { CommoditySheetsNewsProvider } from '../../market-extended/commodity-sheets-news.provider.js';
import { GlobalMarketProvider } from '../../market-extended/global-market.provider.js';
import { VietcapInsightProvider } from '../../market-extended/vietcap-insight.provider.js';
import { VietcapOverviewProvider } from '../../market-extended/vietcap-overview.provider.js';
import type { CommoditiesFxTab, EventsCalendarFilter } from '../market-overview.catalog.js';
import type {
  CommoditiesFxData,
  EventsCalendarData,
  MarketNewsData,
  WorldIndicesData,
} from '../market-overview.schemas.js';
import {
  COMMODITY_SECTOR_ICB4_METADATA,
  getCommoditiesByTab,
  type CommodityDataSource,
  type MappedCommoditySectorName,
} from './commodity-map.js';
import { isVnTradingDay, normalizeIsoDate } from './derivatives-calendar.js';
import {
  addCalendarDays,
  asRecordArray,
  asString,
  formatIctDate,
  formatVietnameseInteger,
  isRecordObject,
  parseStoredDailyBars,
  parseUpstreamTimestamp,
  roundTo,
  toFiniteNumber,
  toNumberOrZero,
  vciPriceToThousands,
} from './market-overview.helpers.js';
import { VnTradingCalendarService } from './vn-trading-calendar.service.js';

interface WorldIndexSpec {
  code: string;
  name: string;
  country: string;
  timeZone: string;
  openMin: number;
  closeMin: number;
}

export const WORLD_INDICES_CATALOG: readonly WorldIndexSpec[] = [
  {
    code: 'DJI',
    name: 'Dow Jones',
    country: 'Mỹ',
    timeZone: 'America/New_York',
    openMin: 570,
    closeMin: 960,
  },
  {
    code: 'INX',
    name: 'S&P 500',
    country: 'Mỹ',
    timeZone: 'America/New_York',
    openMin: 570,
    closeMin: 960,
  },
  {
    code: 'COMP',
    name: 'Nasdaq',
    country: 'Mỹ',
    timeZone: 'America/New_York',
    openMin: 570,
    closeMin: 960,
  },
  {
    code: 'N225',
    name: 'Nikkei 225',
    country: 'Nhật Bản',
    timeZone: 'Asia/Tokyo',
    openMin: 540,
    closeMin: 930,
  },
  {
    code: 'HSI',
    name: 'Hang Seng',
    country: 'Hồng Kông',
    timeZone: 'Asia/Hong_Kong',
    openMin: 570,
    closeMin: 960,
  },
  {
    code: '000001',
    name: 'Shanghai',
    country: 'Trung Quốc',
    timeZone: 'Asia/Shanghai',
    openMin: 570,
    closeMin: 900,
  },
  {
    code: 'KOSPI',
    name: 'KOSPI',
    country: 'Hàn Quốc',
    timeZone: 'Asia/Seoul',
    openMin: 540,
    closeMin: 930,
  },
  {
    code: 'DAX',
    name: 'DAX',
    country: 'Đức',
    timeZone: 'Europe/Berlin',
    openMin: 540,
    closeMin: 1050,
  },
  {
    code: 'UKX',
    name: 'FTSE 100',
    country: 'Anh',
    timeZone: 'Europe/London',
    openMin: 480,
    closeMin: 990,
  },
  {
    code: 'PX1',
    name: 'CAC 40',
    country: 'Pháp',
    timeZone: 'Europe/Paris',
    openMin: 540,
    closeMin: 1050,
  },
  {
    code: 'ASX200',
    name: 'ASX 200',
    country: 'Úc',
    timeZone: 'Australia/Sydney',
    openMin: 600,
    closeMin: 960,
  },
  {
    code: 'SENSEX',
    name: 'Sensex',
    country: 'Ấn Độ',
    timeZone: 'Asia/Kolkata',
    openMin: 555,
    closeMin: 930,
  },
];

const WORLD_KEYWORDS = [
  'thế giới',
  'quốc tế',
  'toàn cầu',
  'fed',
  'fomc',
  'wall street',
  'dow jones',
  'nasdaq',
  's&p 500',
  'chứng khoán mỹ',
  'kinh tế mỹ',
  'trung quốc',
  'nhật bản',
  'châu âu',
  'ecb',
  'boj',
  'opec',
  'giá dầu',
  'vàng thế giới',
  'thuế quan',
  'trump',
] as const;

const CORPORATE_KEYWORDS = [
  'lợi nhuận',
  'doanh thu',
  'cổ tức',
  'đhcđ',
  'đại hội đồng cổ đông',
  'phát hành',
  'bctc',
  'báo cáo tài chính',
  'công ty',
  'tập đoàn',
  'ngân hàng',
  'hđqt',
  'mua lại cổ phiếu',
] as const;

interface QuoteSample {
  price: number | null;
  changePct: number | null;
  updatedAt?: string | null;
}

function isExchangeOpenNow(spec: WorldIndexSpec, now: Date): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: spec.timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
    if (weekday === 'Sat' || weekday === 'Sun') return false;
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const mins = (hour === 24 ? 0 : hour) * 60 + minute;
    return mins >= spec.openMin && mins <= spec.closeMin;
  } catch {
    return false;
  }
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIDNIGHT_UTC_ISO_RE = /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?Z$/i;
const RATE_LOOKBACK_CALENDAR_DAYS = 12;

interface PublishedRateSample {
  rate: number;
  publishedDate: string | null;
}

function isDateOnlyString(value: string): boolean {
  return DATE_ONLY_RE.test(value);
}

function extractPublishedIsoDate(raw: unknown): string | null {
  const str = asString(raw);
  if (!str) return null;
  return normalizeIsoDate(str) ?? normalizeIsoDate(str.slice(0, 10));
}

function extractOhlcQuote(raw: unknown): QuoteSample {
  const rows = asRecordArray(raw);
  if (rows.length === 0) return { price: null, changePct: null, updatedAt: null };
  const last = rows.at(-1)!;
  const price = toFiniteNumber(last.close);
  if (price === null || price <= 0) return { price: null, changePct: null, updatedAt: null };

  const explicitPrev = toFiniteNumber(last.previous_close);
  const priorBarClose = rows.length >= 2 ? toFiniteNumber(rows[rows.length - 2]!.close) : null;
  const prevClose = explicitPrev ?? priorBarClose;
  const changePct =
    prevClose !== null && prevClose > 0
      ? roundTo(((price - prevClose) / prevClose) * 100, 2)
      : null;

  let updatedAt: string | null = null;
  if (typeof last.time === 'string' && last.time.trim()) {
    const trimmed = last.time.trim();
    updatedAt = MIDNIGHT_UTC_ISO_RE.test(trimmed) ? trimmed.slice(0, 10) : trimmed;
  } else {
    const dt = parseUpstreamTimestamp(last.time ?? last.timestamp);
    if (dt) {
      const isUtcMidnight =
        dt.getUTCHours() === 0 &&
        dt.getUTCMinutes() === 0 &&
        dt.getUTCSeconds() === 0 &&
        dt.getUTCMilliseconds() === 0;
      updatedAt = isUtcMidnight ? dt.toISOString().slice(0, 10) : dt.toISOString();
    }
  }
  return { price: roundTo(price, 2), changePct, updatedAt };
}

function normalizeSjcMillionPerTael(raw: number): number {
  if (raw >= 1_000_000) return roundTo(raw / 1_000_000, 2);
  if (raw >= 1_000) return roundTo(raw / 1_000, 2);
  return roundTo(raw, 2);
}

function classifyNewsCategory(input: {
  title: string;
  topic: string;
  ticker: string;
  rawType: string;
}): 'Thế giới' | 'Thị trường' | 'Doanh nghiệp' {
  const haystack = `${input.title} ${input.topic}`.toLowerCase();
  if (WORLD_KEYWORDS.some((kw) => haystack.includes(kw))) {
    return 'Thế giới';
  }
  if (
    input.ticker.trim().length > 0 ||
    input.rawType === 'exchange' ||
    CORPORATE_KEYWORDS.some((kw) => haystack.includes(kw))
  ) {
    return 'Doanh nghiệp';
  }
  return 'Thị trường';
}

function pickEventDate(row: Record<string, unknown>): string | null {
  for (const key of ['exright_date', 'record_date', 'issue_date', 'public_date']) {
    const raw = row[key];
    if (typeof raw === 'string' && raw.trim()) {
      const iso = normalizeIsoDate(raw.slice(0, 10));
      if (iso) return iso;
    }
  }
  return null;
}

@Injectable()
export class GlobalEventsWidgetsService {
  constructor(
    private readonly globalMarket: GlobalMarketProvider,
    private readonly commoditySheetsNews: CommoditySheetsNewsProvider,
    private readonly aiNews: AiNewsProvider,
    private readonly vietcapOverview: VietcapOverviewProvider,
    private readonly vietcapInsight: VietcapInsightProvider,
    private readonly vci: VciMarketProvider,
    private readonly httpTransport: MarketHttpTransport,
    private readonly database: DatabaseService,
    private readonly tradingCalendar: VnTradingCalendarService,
  ) {}

  /** 13. Chỉ số thế giới (`world_indices`) — all 12 global indices. */
  async getWorldIndices(now: Date = new Date()): Promise<WorldIndicesData> {
    const endDate = now.toISOString().slice(0, 10);
    const startDate = addCalendarDays(endDate, -14);

    const settled = await Promise.allSettled(
      WORLD_INDICES_CATALOG.map((spec) =>
        this.globalMarket.worldIndex(spec.code, startDate, endDate),
      ),
    );

    let successCount = 0;
    const rows: WorldIndicesData['rows'] = WORLD_INDICES_CATALOG.map((spec, idx) => {
      const res = settled[idx];
      const quote =
        res && res.status === 'fulfilled'
          ? extractOhlcQuote(res.value.data)
          : { price: null, changePct: null, updatedAt: null };
      if (quote.price !== null) successCount += 1;

      const isOpen = isExchangeOpenNow(spec, now);
      let updatedAt: string | null = null;
      if (quote.price !== null) {
        if (isOpen) {
          updatedAt =
            quote.updatedAt && !isDateOnlyString(quote.updatedAt)
              ? quote.updatedAt
              : now.toISOString();
        } else {
          updatedAt = quote.updatedAt ?? null;
        }
      }

      return {
        code: spec.code,
        name: spec.name,
        country: spec.country,
        isOpen,
        price: quote.price,
        changePct: quote.changePct,
        updatedAt,
      };
    });

    if (successCount === 0) {
      throw new Error('All world index upstreams failed');
    }

    return { rows };
  }

  /** 14. Hàng hoá và tỷ giá (`commodities_fx`). */
  async getCommoditiesFx(
    params: { tab: CommoditiesFxTab },
    now: Date = new Date(),
  ): Promise<CommoditiesFxData> {
    const entries = getCommoditiesByTab(params.tab);
    const needsSectorMap = entries.some((entry) => entry.mappedSectorName !== null);

    const [sectorPctMap, itemSettled] = await Promise.all([
      needsSectorMap
        ? this.loadMappedIcb4SectorChanges().catch(
            () => new Map<MappedCommoditySectorName, number>(),
          )
        : Promise.resolve(new Map<MappedCommoditySectorName, number>()),
      Promise.allSettled(
        entries.map(async (entry) => {
          const primary = await this.fetchCommodityQuote(entry.source, now).catch(() => null);
          if (primary && primary.price !== null) return primary;
          if (entry.fallbackSource) {
            const fallback = await this.fetchCommodityQuote(entry.fallbackSource, now).catch(
              () => null,
            );
            if (fallback && fallback.price !== null) return fallback;
          }
          return { price: null, changePct: null };
        }),
      ),
    ]);

    let successCount = 0;
    const rows: CommoditiesFxData['rows'] = entries.map((entry, idx) => {
      const settled = itemSettled[idx];
      const quote =
        settled && settled.status === 'fulfilled'
          ? settled.value
          : { price: null, changePct: null };
      if (quote.price !== null) successCount += 1;

      const mappedSectorChangePct =
        entry.mappedSectorName !== null ? (sectorPctMap.get(entry.mappedSectorName) ?? null) : null;

      return {
        code: entry.code,
        name: entry.name,
        unit: entry.unit,
        price: quote.price,
        changePct: quote.changePct,
        mappedSectorName: entry.mappedSectorName,
        mappedSectorChangePct,
      };
    });

    if (successCount === 0 && entries.length > 0) {
      throw new Error(`All commodity/FX upstreams failed for tab ${params.tab}`);
    }

    return { tab: params.tab, rows };
  }

  /** 15. Lịch sự kiện (`events_calendar`) — next 30 days sorted by exDate asc. */
  async getEventsCalendar(
    params: { filter: EventsCalendarFilter },
    now: Date = new Date(),
  ): Promise<EventsCalendarData> {
    const todayIct = formatIctDate(now);
    const endDate = addCalendarDays(todayIct, 30);

    const [divRes, agmRes] = await Promise.all([
      this.vci.fetchEvents(todayIct, endDate, 'dividend').catch(() => null),
      params.filter === 'cash'
        ? Promise.resolve(null)
        : this.vci.fetchEvents(todayIct, endDate, 'agm').catch(() => null),
    ]);

    if (!divRes && !agmRes) {
      throw new Error('Corporate events upstream is unavailable');
    }

    const rawRows = [...asRecordArray(divRes?.data), ...asRecordArray(agmRes?.data)];
    const deduped = new Map<
      string,
      {
        id: string;
        exDate: string;
        symbol: string;
        eventType: 'cash' | 'other';
        title: string;
        cashPerShare: number | null;
      }
    >();

    for (const row of rawRows) {
      const symbol = asString(row.ticker ?? row.symbol).toUpperCase();
      if (!symbol) continue;
      const exDate = pickEventDate(row);
      if (!exDate || exDate < todayIct || exDate > endDate) continue;

      const eventCode = asString(row.event_code).toUpperCase();
      const rawCash = toFiniteNumber(row.value_per_share);
      const isCash = eventCode === 'DIV' && rawCash !== null && rawCash > 0;
      const eventType: 'cash' | 'other' = isCash ? 'cash' : 'other';

      if (params.filter === 'cash' && eventType !== 'cash') continue;
      if (params.filter === 'other' && eventType !== 'other') continue;

      const id = asString(row.id) || `${symbol}_${eventCode || eventType}_${exDate}`;
      const dedupeKey = `${symbol}|${eventCode}|${exDate}|${rawCash ?? ''}`;
      if (deduped.has(dedupeKey)) continue;

      const title = isCash
        ? `Tiền ${formatVietnameseInteger(rawCash)} đ/cp`
        : asString(
            row.event_title ??
              row.event_name ??
              row.event_list_name ??
              row.title ??
              row.event_title_en,
            eventCode === 'ISS'
              ? 'Phát hành cổ phiếu'
              : eventCode.includes('AGM') || eventCode.includes('EGM')
                ? 'Đại hội đồng cổ đông'
                : 'Sự kiện doanh nghiệp',
          );

      deduped.set(dedupeKey, {
        id,
        exDate,
        symbol,
        eventType,
        title,
        cashPerShare: isCash ? Math.round(rawCash) : null,
      });
    }

    const events = [...deduped.values()].sort(
      (a, b) => a.exDate.localeCompare(b.exDate) || a.symbol.localeCompare(b.symbol),
    );

    const uniqueSymbols = [...new Set(events.map((e) => e.symbol))];
    const priceInfoMap = await this.loadSymbolPricesVnd(uniqueSymbols);

    const rows: EventsCalendarData['rows'] = events.map((ev) => {
      const priceInfo = priceInfoMap.get(ev.symbol);
      const currentPriceVnd = priceInfo?.priceVnd ?? null;
      const price =
        currentPriceVnd !== null && currentPriceVnd > 0
          ? vciPriceToThousands(currentPriceVnd)
          : null;
      const dividendYieldPct =
        ev.eventType === 'cash' &&
        ev.cashPerShare !== null &&
        ev.cashPerShare > 0 &&
        currentPriceVnd !== null &&
        currentPriceVnd > 0
          ? roundTo((ev.cashPerShare / currentPriceVnd) * 100, 2)
          : null;

      return {
        id: ev.id,
        exDate: ev.exDate,
        symbol: ev.symbol,
        price,
        changePct: priceInfo?.changePct ?? null,
        eventType: ev.eventType,
        title: ev.title,
        cashPerShare: ev.cashPerShare,
        dividendYieldPct,
      };
    });

    return {
      filter: params.filter,
      rows,
    };
  }

  /** 16. Tin thị trường (`market_news`) — VCI AI News + VN RSS blend. */
  async getMarketNews(now: Date = new Date()): Promise<MarketNewsData> {
    const [bizRes, topicRes, exchangeRes, rssRes] = await Promise.allSettled([
      this.aiNews.list('business', { page: 1, pageSize: 20 }),
      this.aiNews.list('topic', { page: 1, pageSize: 12 }),
      this.aiNews.list('exchange', { page: 1, pageSize: 10 }),
      this.commoditySheetsNews.rss(['vietstock', 'cafebiz', 'vnexpress'], 6),
    ]);

    const anyFulfilled =
      bizRes.status === 'fulfilled' ||
      topicRes.status === 'fulfilled' ||
      exchangeRes.status === 'fulfilled' ||
      rssRes.status === 'fulfilled';

    if (!anyFulfilled) {
      throw new Error('All market news upstreams are unavailable');
    }

    const rows: MarketNewsData['rows'] = [];
    const seenKeys = new Set<string>();

    const pushRow = (row: MarketNewsData['rows'][number]) => {
      const titleKey = row.title.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!titleKey || seenKeys.has(titleKey)) return;
      seenKeys.add(titleKey);
      rows.push(row);
    };

    for (const res of [bizRes, topicRes, exchangeRes]) {
      if (res.status !== 'fulfilled') continue;
      for (const item of asRecordArray(res.value.data.items)) {
        const title = asString(item.title);
        if (!title) continue;
        const dt = parseUpstreamTimestamp(item.update_date) ?? now;
        const slug = asString(item.slug) || null;
        const url = asString(item.source_link) || null;
        const source = asString(item.source_name || item.source) || null;
        const id = asString(item.id) || slug || `ai_${rows.length + 1}`;
        const category = classifyNewsCategory({
          title,
          topic: asString(item.topic_name),
          ticker: asString(item.ticker),
          rawType: asString(item.raw_type),
        });
        pushRow({
          id,
          slug,
          url,
          category,
          title,
          publishedAt: dt.toISOString(),
          source,
        });
      }
    }

    if (rssRes.status === 'fulfilled') {
      for (const item of asRecordArray(rssRes.value.data)) {
        const title = asString(item.title);
        if (!title) continue;
        const dt = parseUpstreamTimestamp(item.pub_date) ?? now;
        const url = asString(item.link) || null;
        const site = asString(item.site) || null;
        const category = classifyNewsCategory({
          title,
          topic: asString(item.description),
          ticker: '',
          rawType: 'rss',
        });
        pushRow({
          id: url ?? `rss_${rows.length + 1}`,
          slug: null,
          url,
          category,
          title,
          publishedAt: dt.toISOString(),
          source: site,
        });
      }
    }

    rows.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

    return {
      enabled: true,
      rows: rows.slice(0, 30),
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async fetchCommodityQuote(source: CommodityDataSource, now: Date): Promise<QuoteSample> {
    const todayUtc = now.toISOString().slice(0, 10);
    const start14d = addCalendarDays(todayUtc, -14);
    const todayIct = formatIctDate(now);

    switch (source.provider) {
      case 'simplize': {
        const res = await this.commoditySheetsNews.commodity(source.code, start14d, todayUtc, '1d');
        return extractOhlcQuote(res.data);
      }

      case 'simplize_ticker': {
        const fromSec = Math.floor(new Date(`${start14d}T00:00:00Z`).getTime() / 1_000);
        const toSec = Math.floor(new Date(`${todayUtc}T23:59:59Z`).getTime() / 1_000);
        const url = new URL('https://api.simplize.vn/api/historical/prices/ohlcv');
        url.searchParams.set('ticker', source.ticker);
        url.searchParams.set('interval', '1d');
        url.searchParams.set('type', 'commodity');
        url.searchParams.set('from', String(fromSec));
        url.searchParams.set('to', String(toSec));

        const raw = await this.httpTransport.requestJson<unknown>(
          url.toString(),
          { headers: { Accept: 'application/json' } },
          { cacheTtlMs: 60_000 },
        );
        const entries =
          isRecordObject(raw) && Array.isArray(raw.data) ? raw.data : Array.isArray(raw) ? raw : [];
        const normalized = entries
          .map((item) =>
            Array.isArray(item)
              ? { time: item[0], close: item[4] }
              : isRecordObject(item)
                ? { time: item.time, close: item.close }
                : null,
          )
          .filter((item): item is { time: unknown; close: unknown } => item !== null);
        return extractOhlcQuote(normalized);
      }

      case 'msn_forex': {
        const res = await this.globalMarket.forex(source.symbol, start14d, todayUtc);
        return extractOhlcQuote(res.data);
      }

      case 'msn_index': {
        const res = await this.globalMarket.worldIndex(source.symbol, start14d, todayUtc);
        return extractOhlcQuote(res.data);
      }

      case 'sjc': {
        return this.resolvePublishedRateWithPrev(todayIct, async (date) => {
          const res = await this.globalMarket.gold(date, 'SJC');
          return this.pickSjcSellPrice(res.data);
        });
      }

      case 'vcb_fx': {
        return this.resolvePublishedRateWithPrev(todayIct, async (date) => {
          const res = await this.globalMarket.fx(date, 'VCB');
          return this.pickVcbRate(res.data, source.currencyCode, source.field);
        });
      }
    }
  }

  private async resolvePublishedRateWithPrev(
    todayIct: string,
    fetchRateForDate: (date: string) => Promise<PublishedRateSample | null>,
  ): Promise<QuoteSample> {
    const holidays = await this.tradingCalendar.getHolidays();

    let currentDate: string | null = null;
    let currentPublishedDate: string | null = null;
    let currentRate: number | null = null;

    // Locate the latest published business-day rate within the lookback window,
    // skipping weekends and Vietnam holidays (covering 9-day Tết breaks).
    for (let offset = 0; offset <= RATE_LOOKBACK_CALENDAR_DAYS; offset += 1) {
      const candidateDate = addCalendarDays(todayIct, -offset);
      if (!isVnTradingDay(candidateDate, holidays)) continue;
      const sample = await fetchRateForDate(candidateDate).catch(() => null);
      if (sample !== null) {
        currentPublishedDate = sample.publishedDate;
        currentDate =
          sample.publishedDate !== null && sample.publishedDate < candidateDate
            ? sample.publishedDate
            : candidateDate;
        currentRate = sample.rate;
        break;
      }
    }

    if (currentRate === null || currentDate === null) {
      return { price: null, changePct: null };
    }

    const effectiveCurrentDate = currentPublishedDate ?? currentDate;
    let prevRate: number | null = null;

    // Walk back up to RATE_LOOKBACK_CALENDAR_DAYS calendar days skipping weekends,
    // Vietnam holidays, empty responses, and explicit echoes of the same published date.
    // Accept the first valid prior business-day rate even when equal to currentRate
    // so legitimately flat weekdays report changePct = 0.
    for (let offset = 1; offset <= RATE_LOOKBACK_CALENDAR_DAYS; offset += 1) {
      const candidateDate = addCalendarDays(currentDate, -offset);
      if (!isVnTradingDay(candidateDate, holidays)) continue;
      const candidate = await fetchRateForDate(candidateDate).catch(() => null);
      if (candidate === null) continue;
      if (candidate.publishedDate !== null && candidate.publishedDate === effectiveCurrentDate) {
        continue;
      }
      prevRate = candidate.rate;
      break;
    }

    const changePct =
      prevRate !== null && prevRate > 0
        ? roundTo(((currentRate - prevRate) / prevRate) * 100, 2)
        : null;
    return { price: roundTo(currentRate, 2), changePct };
  }

  private pickSjcSellPrice(raw: unknown): PublishedRateSample | null {
    const rows = asRecordArray(raw);
    if (rows.length === 0) return null;
    const preferred =
      rows.find((r) => asString(r.name).toLowerCase().includes('1l')) ??
      rows.find((r) => asString(r.branch).toLowerCase().includes('hồ chí minh')) ??
      rows[0]!;
    const sell = toFiniteNumber(preferred.sell_price ?? preferred.buy_price);
    if (sell === null || sell <= 0) return null;
    return {
      rate: normalizeSjcMillionPerTael(sell),
      publishedDate: extractPublishedIsoDate(preferred.date),
    };
  }

  private pickVcbRate(
    raw: unknown,
    currencyCode: string,
    field: 'sell' | 'buy_cash' | 'buy_transfer',
  ): PublishedRateSample | null {
    const target = currencyCode.toUpperCase();
    const row = asRecordArray(raw).find((r) => asString(r.currency_code).toUpperCase() === target);
    if (!row) return null;
    const val = toFiniteNumber(row[field] ?? row.sell);
    if (val === null || val <= 0) return null;
    return {
      rate: val,
      publishedDate: extractPublishedIsoDate(row.date),
    };
  }

  private async loadMappedIcb4SectorChanges(): Promise<Map<MappedCommoditySectorName, number>> {
    const result = new Map<MappedCommoditySectorName, number>();
    const [heatmapLv4Res, sectorInfoLv4Res] = await Promise.all([
      this.vietcapOverview.heatmap('ALL', 'icb_code_4', 'MKC').catch(() => null),
      this.vietcapInsight.sectorInformation(4).catch(() => null),
    ]);

    const heatByCode = new Map<string, { changePct: number; marketCap: number }>();
    const stockBySymbol = new Map<string, { changePct: number; marketCap: number }>();

    for (const group of asRecordArray(heatmapLv4Res?.data)) {
      const code = asString(group.icb_code).padStart(4, '0');
      const pct = toFiniteNumber(group.icb_change_percent);
      const cap = toNumberOrZero(group.total_market_cap_vnd);
      if (code && pct !== null) {
        heatByCode.set(code, { changePct: pct, marketCap: Math.max(1, cap) });
      }
      for (const stock of asRecordArray(group.stocks)) {
        const sym = asString(stock.symbol).toUpperCase();
        const ref = toNumberOrZero(stock.ref_price);
        const price = toNumberOrZero(stock.price);
        const mcap = toNumberOrZero(stock.market_cap_vnd);
        if (sym && ref > 0 && price > 0) {
          stockBySymbol.set(sym, {
            changePct: ((price - ref) / ref) * 100,
            marketCap: Math.max(1, mcap),
          });
        }
      }
    }

    const infoByCode = new Map<string, { changePct: number; marketCap: number }>();
    for (const row of asRecordArray(sectorInfoLv4Res?.data)) {
      const code = asString(row.icb_code).padStart(4, '0');
      const pct = toFiniteNumber(row.percent_price_change_1d);
      const cap = toNumberOrZero(row.market_cap);
      if (code && pct !== null) {
        infoByCode.set(code, { changePct: pct, marketCap: Math.max(1, cap) });
      }
    }

    for (const [sectorName, meta] of Object.entries(COMMODITY_SECTOR_ICB4_METADATA) as Array<
      [
        MappedCommoditySectorName,
        (typeof COMMODITY_SECTOR_ICB4_METADATA)[MappedCommoditySectorName],
      ]
    >) {
      // 1. Direct match on VCI ICB Level 4 codes in heatmap.
      let weightedSum = 0;
      let totalCap = 0;
      for (const code of meta.icbLv4Codes) {
        const hit = heatByCode.get(code) ?? infoByCode.get(code);
        if (hit) {
          weightedSum += hit.changePct * hit.marketCap;
          totalCap += hit.marketCap;
        }
      }

      // 2. Fallback to representative constituents if ICB4 snapshot omitted the code.
      if (totalCap <= 0) {
        for (const sym of meta.representativeSymbols) {
          const hit = stockBySymbol.get(sym);
          if (hit) {
            weightedSum += hit.changePct * hit.marketCap;
            totalCap += hit.marketCap;
          }
        }
      }

      if (totalCap > 0) {
        result.set(sectorName, roundTo(weightedSum / totalCap, 2));
      }
    }

    return result;
  }

  private async loadSymbolPricesVnd(
    symbols: readonly string[],
  ): Promise<Map<string, { priceVnd: number; changePct: number | null }>> {
    const map = new Map<string, { priceVnd: number; changePct: number | null }>();
    if (symbols.length === 0) return map;

    try {
      if (!this.database.isConfigured()) return map;
      const rows = await this.database.query<{
        symbol: string;
        current_price_vnd: bigint | number | string | null;
        bars: unknown;
      }>(
        `SELECT upper(s.symbol) AS symbol, s.current_price_vnd, b.bars
           FROM symbols s
           LEFT JOIN market_daily_bars b ON upper(b.symbol) = upper(s.symbol)
          WHERE upper(s.symbol) = ANY($1::text[])
            AND s.is_active = true`,
        [[...symbols]],
      );

      for (const row of rows) {
        const directVnd = toFiniteNumber(row.current_price_vnd);
        const cols = parseStoredDailyBars(row.bars);
        const lastCloseThousand = cols?.c.at(-1) ?? null;
        const prevCloseThousand = cols && cols.c.length >= 2 ? cols.c[cols.c.length - 2]! : null;

        const priceVnd =
          directVnd !== null && directVnd > 0
            ? directVnd
            : lastCloseThousand !== null && lastCloseThousand > 0
              ? lastCloseThousand * 1_000
              : null;

        if (priceVnd === null || priceVnd <= 0) continue;

        let changePct: number | null = null;
        if (lastCloseThousand && prevCloseThousand && prevCloseThousand > 0) {
          changePct = roundTo(
            ((lastCloseThousand - prevCloseThousand) / prevCloseThousand) * 100,
            2,
          );
        }

        map.set(row.symbol, { priceVnd, changePct });
      }
    } catch {
      // Non-fatal: rows still render with price: null, dividendYieldPct: null.
    }
    return map;
  }
}
