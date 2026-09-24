import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import { BOT_LAYER_KEYS, canonicalHash } from '../bots/bot.domain.js';
import type {
  BotIssue,
  BotLayerEvidence,
  BotMarketSnapshotInput,
  BotSnapshotProvider,
} from '../bots/bot.types.js';
import { FILTER_SPECS, HuntEngine, REQUIRED_CANDLES } from '../journey/cap5/hunt.engine.js';
import type { HuntDataSource, HuntFilter } from '../journey/cap5/cap5.types.js';
import { MarketDataService } from '../market-data/market-data.service.js';
import { HoseRestrictedSecuritiesProvider } from './hose-restricted-securities.provider.js';
import {
  finite,
  isCompletedVietnamSession,
  isObject,
  sessionDate,
  stableHash,
  vnToday,
} from './integration.utils.js';
import { MarketHuntDataSource } from './market-hunt-data-source.js';

const FILTER_IDS: Record<HuntFilter, string> = {
  ngoai: 'khoi_ngoai_gom',
  tudoanh: 'tu_doanh_gom',
  kl: 'kl_dot_bien',
  dinh: 'vuot_dinh_20',
  tang: 'tang_manh_kl',
};

const LAYER_MAPPING = {
  ky_thuat: 'L1',
  dinh_gia: 'L2',
  dong_tien: 'L3',
  noi_bo: 'L4',
  tin_tuc: 'L5',
} as const;

const SUPPORT: Record<string, ReadonlySet<string>> = {
  L1: new Set(['Mạnh', 'Rất mạnh']),
  L2: new Set(['Tốt', 'Rẻ', 'Hấp dẫn', 'Mạnh', 'Rất mạnh']),
  L3: new Set(['Hỗ trợ nhẹ', 'Hỗ trợ mạnh']),
  L4: new Set(['Hỗ trợ nhẹ', 'Hỗ trợ mạnh']),
  L5: new Set(['Tích cực', 'Rất tích cực']),
};
const NEGATIVE: Record<string, ReadonlySet<string>> = {
  L1: new Set(['Yếu', 'Rất yếu']),
  L2: new Set(['Đắt', 'Rất đắt', 'Yếu', 'Rất yếu']),
  L3: new Set(['Cảnh báo nhẹ', 'Cảnh báo mạnh']),
  L4: new Set(['Cảnh báo nhẹ', 'Cảnh báo mạnh']),
  L5: new Set(['Tiêu cực', 'Rất tiêu cực']),
};
const VERY_NEGATIVE: Record<string, ReadonlySet<string>> = {
  L4: new Set(['Cảnh báo mạnh']),
  L5: new Set(['Rất tiêu cực']),
};

function issue(code: string, detail: string, symbol: string | null = null): BotIssue {
  return { code, detail, symbol };
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return isObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isObject(value) ? value : {};
}

function insightLayers(payload: Record<string, unknown>): Record<string, unknown> {
  const nested = object(payload.layers);
  return Object.keys(nested).length ? nested : payload;
}

function layerEvidence(aiKey: string, value: unknown, sourceRef: string): BotLayerEvidence | null {
  const row = object(value);
  const raw = typeof row.statusLabel === 'string' ? row.statusLabel.trim() : '';
  if (!raw || raw === '—') return null;
  const verdict = SUPPORT[aiKey]?.has(raw) ? 'ok' : NEGATIVE[aiKey]?.has(raw) ? 'bad' : 'neu';
  return {
    verdict,
    raw_level: raw,
    is_very_negative:
      aiKey === 'L4' || aiKey === 'L5' ? Boolean(VERY_NEGATIVE[aiKey]?.has(raw)) : false,
    source_ref: `${sourceRef}:${aiKey}`,
  };
}

function amplitude(bars: readonly { high: number; low: number; close: number }[]): number | null {
  if (bars.length < 15) return null;
  const ranges: number[] = [];
  for (let index = bars.length - 14; index < bars.length; index += 1) {
    const current = bars[index];
    const previous = bars[index - 1];
    if (!current || !previous) return null;
    const range = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    );
    if (!Number.isFinite(range) || range <= 0) return null;
    ranges.push(range);
  }
  const result = ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
  return Number.isFinite(result) && result > 0 ? Math.round(result * 10_000) / 10_000 : null;
}

@Injectable()
export class BotMarketSnapshotProvider implements BotSnapshotProvider {
  private readonly logger = new Logger(BotMarketSnapshotProvider.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly market: MarketDataService,
    private readonly huntSource: MarketHuntDataSource,
    private readonly restrictions: HoseRestrictedSecuritiesProvider,
  ) {}

  async buildSnapshot(
    tradingDate: string,
    options: { openSymbols: readonly string[] },
  ): Promise<BotMarketSnapshotInput> {
    const observedAt = new Date();
    const issues: BotIssue[] = [];
    const universeRows = await this.database.query<{ symbol: string }>(
      `select upper(symbol) symbol from symbols
       where is_active=true and upper(exchange)='HOSE' and coalesce(is_index,false)=false
         and lower(asset_type)='stock' order by symbol`,
    );
    const universe = universeRows.map((row) => row.symbol);
    if (!universe.length)
      issues.push(issue('filter_data_incomplete', 'Rổ cổ phiếu HOSE đang rỗng'));

    const isCurrentSession = tradingDate === vnToday(observedAt);
    const restricted = isCurrentSession ? await this.restrictions.current() : null;
    if (restricted === null) {
      issues.push(
        issue(
          'missing_security_status',
          isCurrentSession
            ? 'Không lấy được trạng thái chứng khoán HOSE'
            : 'HOSE không cung cấp lịch sử trạng thái chứng khoán theo phiên',
        ),
      );
    }
    const filterUniverse = restricted
      ? universe.filter((symbol) => !restricted.has(symbol))
      : universe;
    const pinned: HuntDataSource = {
      dailyBars: (symbols, count) => this.huntSource.dailyBarsThrough(symbols, count, tradingDate),
      netFlow: (symbols, side, count) =>
        this.huntSource.netFlowThrough(symbols, side, count, tradingDate),
      restrictedSymbols: async () => (restricted === null ? null : new Set(restricted)),
    };
    const engine = new HuntEngine(pinned);
    const filterSymbols = new Map<string, Set<string>>();
    const filterEvidence: Record<string, unknown> = {};
    let filtersComplete = universe.length > 0 && restricted !== null;
    for (const filter of Object.keys(FILTER_SPECS) as HuntFilter[]) {
      const result = await engine.run(filter, filterUniverse);
      const id = FILTER_IDS[filter];
      filterSymbols.set(id, new Set(result.items.map((item) => item.symbol)));
      filterEvidence[id] = {
        available: result.available,
        complete: result.complete,
        matched_count: result.matchedCount,
        missing_count: result.missingDataCount,
      };
      if (!result.available || result.complete !== true) {
        filtersComplete = false;
        issues.push(
          issue(
            'filter_data_incomplete',
            result.unavailableReason ?? result.incompleteWarning ?? `Bộ lọc ${id} chưa đủ dữ liệu`,
          ),
        );
      }
    }

    const allSymbols = [
      ...new Set([...universe, ...options.openSymbols.map((value) => value.toUpperCase())]),
    ].sort();
    const barsMap = await this.huntSource.dailyBarsThrough(
      allSymbols,
      Math.max(REQUIRED_CANDLES, 40),
      tradingDate,
    );
    const candidateSymbols = new Set(
      [...filterSymbols.values()].flatMap((symbols) => [...symbols]),
    );
    const insights = candidateSymbols.size
      ? await this.database.query<{ symbol: string; payload: unknown; session_date: unknown }>(
          `select upper(symbol) symbol, payload, session_date from ai_insight_history
           where upper(symbol)=any($1::text[]) and session_date=$2::date`,
          [[...candidateSymbols], tradingDate],
        )
      : [];
    const insightBySymbol = new Map(insights.map((row) => [row.symbol, row]));

    const symbols: BotMarketSnapshotInput['symbols'] = {};
    let candidateInputsComplete = candidateSymbols.size > 0;
    for (const symbol of allSymbols) {
      const bars = barsMap.get(symbol) ?? [];
      const latest = bars.at(-1);
      const exact =
        latest?.time === tradingDate && isCompletedVietnamSession(tradingDate, observedAt);
      const recentValues = bars.slice(-20).map((bar) => bar.gtgdVnd);
      const tradingValueAvg20 =
        recentValues.length === 20 &&
        recentValues.every((value) => value !== null && Number.isFinite(value))
          ? Math.round(recentValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) / 20)
          : null;
      const filterIds = [...filterSymbols.entries()]
        .filter(([, members]) => members.has(symbol))
        .map(([id]) => id)
        .sort();
      const insight = insightBySymbol.get(symbol);
      const payload = object(insight?.payload);
      const rawLayers = insightLayers(payload);
      const insightHash = insight ? stableHash(payload) : null;
      const insightRef = insightHash ? `ai_insight:${symbol}:${tradingDate}:${insightHash}` : null;
      const layers: Record<string, BotLayerEvidence> = {};
      if (insightRef) {
        for (const key of BOT_LAYER_KEYS) {
          const aiKey = LAYER_MAPPING[key];
          const normalized = layerEvidence(aiKey, rawLayers[aiKey], insightRef);
          if (normalized) layers[key] = normalized;
        }
      }
      const atr = amplitude(bars);
      const official = Boolean(
        exact && latest && Number.isFinite(latest.close) && latest.close > 0,
      );
      const securityVerified = restricted !== null;
      symbols[symbol] = {
        close_vnd: official ? String(Math.round(latest!.close)) : undefined,
        close_is_official: official,
        trading_value_avg20_vnd: tradingValueAvg20 === null ? undefined : String(tradingValueAvg20),
        filter_ids: filterIds,
        layers,
        l1_amplitude_vnd: atr,
        l1_amplitude_source_ref:
          atr === null ? null : `quant:atr14:true-range:VCI-OHLCV:${symbol}:${tradingDate}:v1`,
        security_status_verified: securityVerified,
        tradable_security_status: securityVerified ? !restricted!.has(symbol) : false,
        source_refs: {
          close: {
            provider: 'VCI',
            endpoint: 'chart/OHLCChart/gap-chart',
            session: latest?.time ?? null,
            exact_session: exact,
            completed_session: isCompletedVietnamSession(tradingDate, observedAt),
            official_close_evidence: official,
          },
          insight: insightRef,
          amplitude: atr === null ? null : 'ATR(14), true range, VCI unadjusted daily OHLCV',
        },
      };
      if (filterIds.length > 0) {
        if (!official)
          issues.push(issue('missing_official_close', 'Thiếu giá đóng cửa đúng phiên', symbol));
        const missing = BOT_LAYER_KEYS.filter((key) => !layers[key]);
        if (missing.length)
          issues.push(issue('missing_layers', `Thiếu lớp: ${missing.join(', ')}`, symbol));
        if (atr === null)
          issues.push(
            issue(
              'invalid_or_missing_l1_amplitude',
              'Không tính được ATR14 từ dữ liệu thật',
              symbol,
            ),
          );
        if (!official || missing.length > 0 || atr === null) candidateInputsComplete = false;
      }
    }

    const feeRows = await this.database.query<{
      id: string;
      buy_fee_rate_bps: number;
      sell_fee_rate_bps: number;
      sell_tax_rate_bps: number;
      board_lot_size: number;
      updated_at: unknown;
    }>(
      `select id, buy_fee_rate_bps, sell_fee_rate_bps, sell_tax_rate_bps,
              board_lot_size, updated_at
       from virtual_trading_configs where is_active=true order by updated_at desc limit 1`,
    );
    const fee = feeRows[0];
    if (!fee) {
      throw new ServiceUnavailableException({
        code: 'BOT_FEE_RULES_MISSING',
        message: 'Chưa có cấu hình phí/thuế/lô đang hoạt động',
      });
    }
    const feeRules = {
      buy_fee_rate_bps: Number(fee.buy_fee_rate_bps),
      sell_fee_rate_bps: Number(fee.sell_fee_rate_bps),
      sell_tax_rate_bps: Number(fee.sell_tax_rate_bps),
      board_lot_size: Number(fee.board_lot_size),
      source_ref: `virtual_trading_configs:${fee.id}:${String(fee.updated_at)}`,
    };
    if (
      ![
        feeRules.buy_fee_rate_bps,
        feeRules.sell_fee_rate_bps,
        feeRules.sell_tax_rate_bps,
        feeRules.board_lot_size,
      ].every(Number.isSafeInteger) ||
      feeRules.buy_fee_rate_bps < 0 ||
      feeRules.sell_fee_rate_bps < 0 ||
      feeRules.sell_tax_rate_bps < 0 ||
      feeRules.board_lot_size <= 0
    ) {
      throw new ServiceUnavailableException({
        code: 'BOT_FEE_RULES_INVALID',
        message: 'Cấu hình phí/thuế/lô không hợp lệ',
      });
    }

    let vnindex: number | null = null;
    try {
      const response = await this.market.getOhlcv('VNINDEX', {
        start: tradingDate,
        end: tradingDate,
        interval: '1D',
        source: 'VCI',
      });
      const row = response.data.find((item) => sessionDate(item.time) === tradingDate);
      vnindex = finite(row?.close);
    } catch (error) {
      this.logger.debug(`VNINDEX unavailable for Bot snapshot: ${String(error)}`);
    }

    const openSymbolsComplete = options.openSymbols.every(
      (symbol) => symbols[symbol.toUpperCase()]?.close_is_official === true,
    );
    if (!openSymbolsComplete) {
      issues.push(issue('missing_official_close', 'Thiếu giá đóng cửa đúng phiên cho vị thế mở'));
    }
    const sourceRefs = {
      filters: { session: tradingDate, hash: stableHash(filterEvidence), data: filterEvidence },
      security_status: {
        provider: 'HOSE securities/status-list + stock-status',
        session: isCurrentSession ? tradingDate : null,
        historical_supported: false,
        hash: restricted ? stableHash([...restricted].sort()) : null,
      },
      fees: { source_ref: feeRules.source_ref, hash: stableHash(feeRules) },
      official_close_policy: 'VCI exact daily bar + completed Vietnam session',
    };
    const base: BotMarketSnapshotInput = {
      trading_date: tradingDate,
      data_version: '',
      close_is_official: openSymbolsComplete && isCompletedVietnamSession(tradingDate, observedAt),
      buy_inputs_complete:
        filtersComplete &&
        restricted !== null &&
        candidateInputsComplete &&
        candidateSymbols.size > 0 &&
        true,
      symbols,
      fee_rules: feeRules,
      vnindex,
      issues,
      source_refs: sourceRefs,
    };
    const contentHash = canonicalHash(base);
    base.data_version = `bot-v1:${tradingDate}:${contentHash.slice(0, 16)}`;
    base.snapshot_hash = canonicalHash(base);
    return base;
  }
}
