import { randomUUID } from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import type { ReportType } from '../reports/reports.types.js';
import { buildReportVisuals } from '../reports/report-visuals.js';
import { isReportSnapshotTime } from '../reports/report-snapshot-window.js';
import { MarketDataService } from '../market-data/market-data.service.js';
import { MarketExtendedService } from '../market-extended/market-extended.service.js';
import {
  daysBefore,
  finite,
  isObject,
  sessionDate,
  stableHash,
  vnToday,
  type JsonObject,
} from './integration.utils.js';

type SourceQuality = {
  source: string;
  ok: boolean;
  verified_session: boolean;
  as_of: string | null;
  source_ref: string | null;
  error?: string;
};

type RecoveredIndexImpact = {
  data: JsonObject;
  snapshotId: string;
  capturedAt: string;
  sourceRef: string;
};

export type CapturedMarketInput = {
  id: string;
  type: ReportType;
  sessionDate: string;
  capturedAt: string;
  complete: boolean;
  payload: JsonObject;
  quality: JsonObject;
};

function records(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function dateOf(row: JsonObject): string | null {
  const value =
    row.trading_date ?? row.date ?? row.time ?? row.timestamp ?? row.as_of ?? row.updated_at;
  const canonical = sessionDate(value);
  if (canonical || typeof value !== 'string') return canonical;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() === Number(month) - 1 &&
    parsed.getUTCDate() === Number(day)
    ? `${year}-${month}-${day}`
    : null;
}

function errorName(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function lastExact(rows: readonly JsonObject[], date: string): JsonObject | null {
  return [...rows].reverse().find((row) => dateOf(row) === date) ?? null;
}

function boundedThroughExact(value: unknown, date: string, earliest: string): JsonObject[] {
  const dated = records(value)
    .map((row, index) => ({ row, index, date: dateOf(row) }))
    .filter(
      (entry): entry is { row: JsonObject; index: number; date: string } =>
        entry.date !== null && entry.date >= earliest && entry.date <= date,
    )
    .sort((left, right) => left.date.localeCompare(right.date) || left.index - right.index);
  const deduped = [...new Map(dated.map((entry) => [entry.date, entry.row])).entries()];
  return deduped.at(-1)?.[0] === date ? deduped.map(([, row]) => row) : [];
}

function parsedObject(value: unknown): JsonObject | null {
  if (isObject(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function verifiedImpact(value: unknown): JsonObject | null {
  if (!isObject(value) || value.time_frame !== 'ONE_DAY') return null;
  const side = (candidate: unknown, positive: boolean): JsonObject[] | null => {
    const input = records(candidate);
    const output = input.filter((row) => {
      const impact = finite(row.impact ?? row.points);
      return (
        typeof (row.symbol ?? row.ticker) === 'string' &&
        impact !== null &&
        (positive ? impact > 0 : impact < 0)
      );
    });
    return output.length === input.length ? output : null;
  };
  const topUp = side(value.top_up, true);
  const topDown = side(value.top_down, false);
  if (!topUp || !topDown || topUp.length + topDown.length === 0) return null;
  return { ...value, top_up: topUp, top_down: topDown };
}

@Injectable()
export class MarketInputSnapshotService {
  constructor(
    private readonly database: DatabaseService,
    private readonly market: MarketDataService,
    private readonly extended: MarketExtendedService,
  ) {}

  private async recoverDailyIndexImpact(date: string): Promise<RecoveredIndexImpact | null> {
    const rows = await this.database.query<{
      id: unknown;
      payload: unknown;
      quality: unknown;
      captured_at: unknown;
    }>(
      `select id, payload, quality, captured_at from market_report_input_snapshots
       where report_type='daily' and session_date=$1::date and complete=true
         and captured_at >= ($1::date + time '15:15') at time zone 'Asia/Ho_Chi_Minh'
         and captured_at < ($1::date + interval '1 day') at time zone 'Asia/Ho_Chi_Minh'
       order by captured_at asc`,
      [date],
    );
    for (const row of rows) {
      const payload = parsedObject(row.payload);
      const quality = parsedObject(row.quality);
      const meta = parsedObject(payload?.meta);
      const evidence = records(quality?.sources).find(
        (source) =>
          source.source === 'index_impact' &&
          source.ok === true &&
          source.verified_session === true &&
          source.as_of === date &&
          source.source_ref === 'VCI:index-impact',
      );
      const data = verifiedImpact(payload?.point_contribution);
      if (
        !meta ||
        meta.generated_for_date !== date ||
        typeof meta.input_hash !== 'string' ||
        !meta.input_hash ||
        !evidence ||
        !data
      )
        continue;
      const capturedAt = new Date(String(row.captured_at));
      if (!Number.isFinite(capturedAt.getTime())) continue;
      return {
        data,
        snapshotId: String(row.id),
        capturedAt: capturedAt.toISOString(),
        sourceRef: String(evidence.source_ref),
      };
    }
    return null;
  }

  /** Capture and persist a report input. Incomplete snapshots are retained for audit but never consumed. */
  async capture(type: ReportType, sessionDateValue: string): Promise<CapturedMarketInput> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDateValue)) {
      throw new ServiceUnavailableException({
        code: 'REPORT_INPUT_DATE_INVALID',
        message: 'Ngày snapshot báo cáo không hợp lệ',
      });
    }
    if (!isReportSnapshotTime(type, sessionDateValue, new Date())) {
      throw new ServiceUnavailableException({
        code: 'REPORT_INPUT_WINDOW_UNAVAILABLE',
        message: 'Không thể lấy dữ liệu trực tiếp ngoài mốc báo cáo; cần snapshot đúng thời điểm',
      });
    }
    const built =
      type === 'premarket'
        ? await this.premarket(sessionDateValue)
        : await this.vnMarket(type, sessionDateValue);
    const id = randomUUID();
    const capturedAt = new Date().toISOString();
    // Slow upstreams must not cross the cutoff and publish afternoon data
    // under a morning label. Preserve such attempts only as incomplete evidence.
    built.complete =
      built.complete && isReportSnapshotTime(type, sessionDateValue, new Date(capturedAt));
    const payload = {
      ...built.payload,
      meta: {
        ...(isObject(built.payload.meta) ? built.payload.meta : {}),
        report_type: type,
        generated_for_date: sessionDateValue,
        snapshot_captured_at: capturedAt,
        input_hash: stableHash(built.payload),
      },
    };
    const quality: JsonObject = {
      ...built.quality,
      complete: built.complete,
      session_date: sessionDateValue,
      captured_at: capturedAt,
      input_hash: stableHash(payload),
    };
    await this.database.query(
      `insert into market_report_input_snapshots
         (id, report_type, session_date, payload, quality, captured_at, complete)
       values ($1, $2, $3::date, $4::jsonb, $5::jsonb, $6::timestamptz, $7)`,
      [
        id,
        type,
        sessionDateValue,
        JSON.stringify(payload),
        JSON.stringify(quality),
        capturedAt,
        built.complete,
      ],
    );
    return {
      id,
      type,
      sessionDate: sessionDateValue,
      capturedAt,
      complete: built.complete,
      payload,
      quality,
    };
  }

  private async vnMarket(
    type: 'daily' | 'midday',
    date: string,
  ): Promise<{ complete: boolean; payload: JsonObject; quality: JsonObject }> {
    const current = date === vnToday();
    const start = daysBefore(date, 400);
    const chartStart = daysBefore(date, 40);
    const startTs = Math.floor(new Date(`${date}T00:00:00+07:00`).getTime() / 1000);
    const chartStartTs = Math.floor(new Date(`${chartStart}T00:00:00+07:00`).getTime() / 1000);
    const recoveredImpact =
      type === 'daily' && !current ? await this.recoverDailyIndexImpact(date) : null;
    const endTs = startTs + 86_399;
    const sourceQuality: SourceQuality[] = [];
    const capture = async <T>(
      source: string,
      operation: () => Promise<T>,
      sourceRef: string,
    ): Promise<T | null> => {
      try {
        const value = await operation();
        sourceQuality.push({
          source,
          ok: true,
          verified_session: false,
          as_of: null,
          source_ref: sourceRef,
        });
        return value;
      } catch (error) {
        sourceQuality.push({
          source,
          ok: false,
          verified_session: false,
          as_of: null,
          source_ref: sourceRef,
          error: errorName(error),
        });
        return null;
      }
    };

    const [
      vnResponse,
      vn30Response,
      liveIndices,
      breadth20,
      breadth50,
      impact,
      foreign,
      foreignTop,
      proprietary,
      proprietaryTop,
      sectors,
    ] = await Promise.all([
      capture(
        'vnindex_ohlcv',
        () => this.market.getOhlcv('VNINDEX', { start, end: date, interval: '1D', source: 'VCI' }),
        'VCI:gap-chart:VNINDEX',
      ),
      capture(
        'vn30_ohlcv',
        () => this.market.getOhlcv('VN30', { start, end: date, interval: '1D', source: 'VCI' }),
        'VCI:gap-chart:VN30',
      ),
      current
        ? capture(
            'market_indices',
            () =>
              this.extended.overview.marketIndex(['VNINDEX', 'VN30', 'HNXIndex', 'HNXUpcomIndex']),
            'VCI:marketIndex',
          )
        : Promise.resolve(null),
      capture(
        'breadth_ema20',
        () => this.extended.overview.breadth('EMA20', 'HSX', 'Y1'),
        'VCI:breadth:EMA20',
      ),
      capture(
        'breadth_ema50',
        () => this.extended.overview.breadth('EMA50', 'HSX', 'Y1'),
        'VCI:breadth:EMA50',
      ),
      current
        ? capture(
            'index_impact',
            () => this.extended.overview.indexImpact('ALL', 'ONE_DAY'),
            'VCI:index-impact',
          )
        : Promise.resolve(null),
      capture(
        'foreign_flow',
        () =>
          this.extended.overview.foreign({
            group: 'ALL',
            timeFrame: 'ONE_DAY',
            from: chartStartTs,
            to: endTs,
          }),
        'VCI:foreign-flow:ONE_DAY:40D',
      ),
      capture(
        'foreign_top',
        () =>
          this.extended.overview.foreignTop({
            group: 'ALL',
            timeFrame: 'ONE_DAY',
            from: startTs,
            to: endTs,
          }),
        'VCI:foreign-top',
      ),
      capture(
        'proprietary',
        () => this.extended.overview.proprietary('ALL', 'ONE_MONTH'),
        'VCI:proprietary:ONE_MONTH',
      ),
      capture(
        'proprietary_top',
        () => this.extended.overview.proprietaryTop('ALL', 'ONE_DAY'),
        'VCI:proprietary-top',
      ),
      current
        ? capture(
            'sectors',
            () => this.extended.overview.sectorsAllocation('ALL', 'ONE_DAY'),
            'VCI:sector-allocation',
          )
        : Promise.resolve(null),
    ]);

    const vnRows = vnResponse?.data ?? [];
    const exactIndex = lastExact(vnRows, date);
    const indexQuality = sourceQuality.find((row) => row.source === 'vnindex_ohlcv');
    if (indexQuality) {
      indexQuality.verified_session = Boolean(exactIndex);
      indexQuality.as_of = exactIndex ? date : dateOf(vnRows.at(-1) ?? {});
    }
    const vn30Quality = sourceQuality.find((row) => row.source === 'vn30_ohlcv');
    if (vn30Quality) {
      vn30Quality.verified_session = Boolean(lastExact(vn30Response?.data ?? [], date));
      vn30Quality.as_of = vn30Quality.verified_session ? date : null;
    }
    const previous = exactIndex ? vnRows.slice(0, vnRows.indexOf(exactIndex)).at(-1) : undefined;
    const close = finite(exactIndex?.close);
    const previousClose = finite(previous?.close);
    const change = close !== null && previousClose !== null ? close - previousClose : null;
    const changePct = change !== null && previousClose ? (change / previousClose) * 100 : null;
    const high = finite(exactIndex?.high);
    const low = finite(exactIndex?.low);
    const recent = exactIndex
      ? vnRows.slice(Math.max(0, vnRows.indexOf(exactIndex) - 20), vnRows.indexOf(exactIndex))
      : [];
    const values = recent
      .map((row) => finite(row.value))
      .filter((value): value is number => value !== null);
    const ma20 = values.length === 20 ? values.reduce((sum, value) => sum + value, 0) / 20 : null;
    const currentValue = finite(exactIndex?.value);

    const liveRows = liveIndices ? records(liveIndices.data) : [];
    const liveVn = liveRows.find((row) => row.symbol === 'VNINDEX') ?? null;
    const breadth20Rows = boundedThroughExact(breadth20?.data, date, chartStart);
    const breadth50Rows = boundedThroughExact(breadth50?.data, date, chartStart);
    const foreignRows = boundedThroughExact(foreign?.data, date, chartStart);
    const foreignExact = lastExact(foreignRows, date);
    const propRows = boundedThroughExact(proprietary?.data, date, chartStart);
    const propExact = lastExact(propRows, date);
    for (const [source, exact] of [
      ['foreign_flow', foreignExact],
      ['proprietary', propExact],
    ] as const) {
      const entry = sourceQuality.find((row) => row.source === source);
      if (entry) {
        entry.verified_session = Boolean(exact);
        entry.as_of = exact ? date : null;
      }
    }
    for (const [source, exact] of [
      ['breadth_ema20', breadth20Rows.length > 0],
      ['breadth_ema50', breadth50Rows.length > 0],
    ] as const) {
      const entry = sourceQuality.find((row) => row.source === source);
      if (entry) {
        entry.verified_session = entry.ok && exact;
        entry.as_of = entry.verified_session ? date : null;
      }
    }
    for (const source of ['market_indices', 'index_impact', 'sectors']) {
      const entry = sourceQuality.find((row) => row.source === source);
      if (entry) {
        entry.verified_session = entry.ok && current;
        entry.as_of = entry.verified_session ? date : null;
      }
    }

    const propTopData =
      isObject(proprietaryTop?.data) && dateOf(proprietaryTop.data) === date
        ? proprietaryTop.data
        : null;
    if (!current) {
      sourceQuality.push(
        recoveredImpact
          ? {
              source: 'index_impact',
              ok: true,
              verified_session: true,
              as_of: date,
              source_ref: `${recoveredImpact.sourceRef};snapshot:${recoveredImpact.snapshotId}`,
            }
          : {
              source: 'index_impact',
              ok: false,
              verified_session: false,
              as_of: null,
              source_ref: null,
              error: 'No verified same-session EOD snapshot',
            },
      );
    }
    const foreignTopData = isObject(foreignTop?.data) ? foreignTop.data : null;
    const foreignTopRows = foreignTopData
      ? [...records(foreignTopData.net_buy), ...records(foreignTopData.net_sell)]
      : [];
    const foreignTopExact =
      foreignTopData !== null &&
      (dateOf(foreignTopData) === date ||
        (foreignTopRows.length > 0 && foreignTopRows.every((row) => dateOf(row) === date)));
    for (const [source, available] of [
      ['foreign_top', foreignTopExact],
      ['proprietary_top', Boolean(propTopData)],
    ] as const) {
      const entry = sourceQuality.find((row) => row.source === source);
      if (entry) {
        entry.verified_session = entry.ok && available;
        entry.as_of = entry.verified_session ? date : null;
      }
    }

    const breadth = liveVn
      ? {
          advances: finite(liveVn.total_stock_increase),
          declines: finite(liveVn.total_stock_decline),
          unchanged: finite(liveVn.total_stock_no_change),
          ceiling: finite(liveVn.total_stock_ceiling),
          floor: finite(liveVn.total_stock_floor),
        }
      : null;
    const foreignBuy = finite(foreignExact?.foreign_buy_value_vnd);
    const foreignSell = finite(foreignExact?.foreign_sell_value_vnd);
    const propBuy = finite(propExact?.total_buy_value_vnd);
    const propSell = finite(propExact?.total_sell_value_vnd);
    const payload: JsonObject = {
      meta: { report_type: type, generated_for_date: date, as_of: new Date().toISOString() },
      vnindex: {
        close,
        value: close,
        open: finite(exactIndex?.open),
        high,
        low,
        volume: finite(exactIndex?.volume),
        change_points: change,
        change_pct: changePct,
        intraday_range_pct:
          high !== null && low !== null && previousClose
            ? ((high - low) / previousClose) * 100
            : null,
        last_30min_change_pct: null,
      },
      vn30: this.indexBlock(vn30Response?.data ?? [], date),
      hnx: current ? this.liveIndex(liveRows, 'HNXIndex') : null,
      upcom: current ? this.liveIndex(liveRows, 'HNXUpcomIndex') : null,
      breadth,
      market_health: {
        ema20: breadth20Rows.length ? breadth20Rows : null,
        ema50: breadth50Rows.length ? breadth50Rows : null,
      },
      volume: {
        total_value_vnd_billion: currentValue === null ? null : currentValue / 1_000,
        ma20_value_vnd_billion: ma20 === null ? null : ma20 / 1_000,
        ratio_vs_ma20: currentValue !== null && ma20 ? currentValue / ma20 : null,
      },
      point_contribution: impact?.data ?? recoveredImpact?.data ?? null,
      foreign_flow: {
        trading_date: foreignExact ? date : null,
        buy_value_vnd_billion: foreignBuy === null ? null : foreignBuy / 1e9,
        sell_value_vnd_billion: foreignSell === null ? null : foreignSell / 1e9,
        net_value_vnd_billion:
          foreignBuy !== null && foreignSell !== null ? (foreignBuy - foreignSell) / 1e9 : null,
        top: foreignTop?.data ?? null,
        top_verified: foreignTopExact,
      },
      prop_trading: {
        trading_date: propExact ? date : null,
        buy_value_vnd_billion: propBuy === null ? null : propBuy / 1e9,
        sell_value_vnd_billion: propSell === null ? null : propSell / 1e9,
        net_value_vnd_billion:
          propBuy !== null && propSell !== null ? (propBuy - propSell) / 1e9 : null,
        top: propTopData,
        top_verified: propTopData !== null,
      },
      sectors: sectors?.data ?? null,
      chart_sources: { foreign_history: foreignRows, proprietary_history: propRows },
    };
    if (recoveredImpact && isObject(payload.meta)) {
      payload.meta.chart_provenance = {
        point_contribution: {
          mode: 'verified_same_session_snapshot',
          snapshot_id: recoveredImpact.snapshotId,
          captured_at: recoveredImpact.capturedAt,
          source_ref: recoveredImpact.sourceRef,
        },
      };
    }
    if (type === 'midday') {
      payload.pulse = {
        vn_index: {
          value: finite(liveVn?.price) ?? close,
          change_pct: finite(liveVn?.change_percent) ?? changePct,
        },
        breadth,
        foreign_net_billion:
          foreignBuy !== null && foreignSell !== null ? (foreignBuy - foreignSell) / 1e9 : null,
      };
    }
    const visuals = buildReportVisuals(payload, type);
    payload.charts = visuals.charts;
    if (type === 'midday') payload.pulse = visuals.pulse;
    const verified = sourceQuality.filter((row) => row.verified_session).length;
    const complete = Boolean(exactIndex) && (type === 'daily' || current);
    return {
      complete,
      payload,
      quality: {
        sources: sourceQuality,
        verified_source_count: verified,
        requested_source_count: sourceQuality.length,
        data_completeness: sourceQuality.length ? verified / sourceQuality.length : 0,
        exact_index_session: Boolean(exactIndex),
        recovered_sources: recoveredImpact
          ? [
              {
                field: 'point_contribution',
                snapshot_id: recoveredImpact.snapshotId,
                captured_at: recoveredImpact.capturedAt,
                source_ref: recoveredImpact.sourceRef,
              },
            ]
          : [],
        missing_fields: sourceQuality
          .filter((row) => !row.verified_session)
          .map((row) => row.source),
      },
    };
  }

  private async premarket(
    date: string,
  ): Promise<{ complete: boolean; payload: JsonObject; quality: JsonObject }> {
    const current = date === vnToday();
    const start = daysBefore(date, 7);
    const sourceQuality: SourceQuality[] = [];
    const indices = ['INX', 'DJI', 'COMP', 'N225', 'HSI'] as const;
    const settled = await Promise.allSettled([
      ...indices.map((symbol) => this.extended.global.worldIndex(symbol, start, date)),
      this.extended.global.forex('USDVND', start, date),
      this.extended.global.fx(date, 'VCB'),
      this.extended.aiNews.list('business', {
        page: 1,
        pageSize: 50,
        updateFrom: start,
        updateTo: date,
      }),
      this.market.events(date, date),
    ]);
    const globalMarkets: JsonObject[] = [];
    for (let index = 0; index < indices.length + 2; index += 1) {
      const name =
        index < indices.length ? indices[index]! : index === indices.length ? 'USDVND' : 'VCB_FX';
      const result = settled[index] as
        | PromiseFulfilledResult<{ data: unknown; sourceUrl: string }>
        | PromiseRejectedResult
        | undefined;
      if (result?.status !== 'fulfilled') {
        sourceQuality.push({
          source: name,
          ok: false,
          verified_session: false,
          as_of: null,
          source_ref: null,
          error: result ? errorName(result.reason) : 'missing',
        });
        continue;
      }
      const data = records(result.value.data);
      const last = data.at(-1) ?? null;
      const asOf = last ? dateOf(last) : null;
      const allowed = Boolean(asOf && asOf <= date && asOf >= daysBefore(date, 4));
      sourceQuality.push({
        source: name,
        ok: true,
        verified_session: allowed,
        as_of: asOf,
        source_ref: result.value.sourceUrl,
      });
      if (last && allowed)
        globalMarkets.push({ symbol: name, ...last, source_ref: result.value.sourceUrl });
    }
    const newsResult = settled[indices.length + 2] as
      | PromiseFulfilledResult<{ data: { items: unknown[] }; sourceUrl: string }>
      | PromiseRejectedResult
      | undefined;
    const eventsResult = settled[indices.length + 3] as
      | PromiseFulfilledResult<{
          data: JsonObject[];
          meta: { raw_endpoint: string };
        }>
      | PromiseRejectedResult
      | undefined;
    const news = newsResult?.status === 'fulfilled' ? newsResult.value.data.items : [];
    const events = eventsResult?.status === 'fulfilled' ? eventsResult.value.data : [];
    sourceQuality.push({
      source: 'news_pool',
      ok: newsResult?.status === 'fulfilled',
      verified_session: current && newsResult?.status === 'fulfilled',
      as_of: current ? date : null,
      source_ref: newsResult?.status === 'fulfilled' ? newsResult.value.sourceUrl : null,
      ...(newsResult?.status === 'rejected' ? { error: errorName(newsResult.reason) } : {}),
    });
    sourceQuality.push({
      source: 'events_pool',
      ok: eventsResult?.status === 'fulfilled',
      verified_session: eventsResult?.status === 'fulfilled',
      as_of: eventsResult?.status === 'fulfilled' ? date : null,
      source_ref:
        eventsResult?.status === 'fulfilled' ? eventsResult.value.meta.raw_endpoint : null,
      ...(eventsResult?.status === 'rejected' ? { error: errorName(eventsResult.reason) } : {}),
    });

    const previous = await this.database.query<Record<string, unknown>>(
      `select session_date, headline, tagline, scenarios, watchlist from analysis_history
       where report_type='daily' and is_published=true and session_date < $1::date
       order by session_date desc limit 1`,
      [date],
    );
    const verifiedGlobals = sourceQuality.filter(
      (row) => row.verified_session && !['news_pool', 'events_pool'].includes(row.source),
    ).length;
    return {
      complete: current && verifiedGlobals > 0,
      payload: {
        meta: {
          report_type: 'premarket',
          generated_for_date: date,
          as_of: new Date().toISOString(),
        },
        global_markets: globalMarkets,
        news_pool: news,
        events_pool: events,
        eod_previous_summary: previous[0] ?? null,
        config: { generated_for_date: date },
      },
      quality: {
        sources: sourceQuality,
        verified_source_count: sourceQuality.filter((row) => row.verified_session).length,
        requested_source_count: sourceQuality.length,
        data_completeness: sourceQuality.length
          ? sourceQuality.filter((row) => row.verified_session).length / sourceQuality.length
          : 0,
        missing_fields: sourceQuality
          .filter((row) => !row.verified_session)
          .map((row) => row.source),
      },
    };
  }

  private indexBlock(rows: readonly JsonObject[], date: string): JsonObject | null {
    const row = lastExact(rows, date);
    if (!row) return null;
    return {
      close: finite(row.close),
      open: finite(row.open),
      high: finite(row.high),
      low: finite(row.low),
      volume: finite(row.volume),
    };
  }

  private liveIndex(rows: readonly JsonObject[], symbol: string): JsonObject | null {
    const row = rows.find((item) => item.symbol === symbol);
    return row ? { close: finite(row.price), change_pct: finite(row.change_percent) } : null;
  }
}
