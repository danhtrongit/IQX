import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import { canonicalHash } from '../bots/bot.domain.js';
import { BOT_TRADABLE_SYMBOL_SQL } from '../bots/bot.tradability.js';
import type { BotIssue, BotMarketSnapshotInput, BotSnapshotProvider } from '../bots/bot.types.js';
import { MarketDataService } from '../market-data/market-data.service.js';
import { HoseRestrictedSecuritiesProvider } from './hose-restricted-securities.provider.js';
import {
  finite,
  isCompletedVietnamSession,
  sessionDate,
  stableHash,
  vnToday,
} from './integration.utils.js';
import { MarketHuntDataSource } from './market-hunt-data-source.js';

/** 20 sessions feed the average traded value; a few extra tolerate suspended days. */
const BAR_COUNT = 25;
const LIQUIDITY_SESSIONS = 20;

function issue(code: string, detail: string, symbol: string | null = null): BotIssue {
  return { code, detail, symbol };
}

function normalize(symbols: readonly string[] | undefined): string[] {
  return [
    ...new Set((symbols ?? []).map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)),
  ].sort();
}

/**
 * Market side of a Bot run snapshot for the symbols that matter to ONE account: the members
 * of its effective buy universe and every position it holds. The Săn mã / Hunt filters are
 * not used at all. A symbol with missing data is simply delivered without that field (the
 * Bot then skips it with a per-symbol reason); it never fails the whole snapshot.
 */
@Injectable()
export class BotMarketSnapshotProvider implements BotSnapshotProvider {
  private readonly logger = new Logger(BotMarketSnapshotProvider.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly market: MarketDataService,
    private readonly bars: MarketHuntDataSource,
    private readonly restrictions: HoseRestrictedSecuritiesProvider,
  ) {}

  async buildSnapshot(
    tradingDate: string,
    options: { openSymbols: readonly string[]; universeSymbols?: readonly string[] },
  ): Promise<BotMarketSnapshotInput> {
    const observedAt = new Date();
    const issues: BotIssue[] = [];
    const openSymbols = normalize(options.openSymbols);
    const universeSymbols = normalize(options.universeSymbols);
    const requested = [...new Set([...universeSymbols, ...openSymbols])].sort();

    const isCurrentSession = tradingDate === vnToday(observedAt);
    // Restricted-securities status only matters for buying; skip the feed when nothing can be
    // bought so a HOSE outage never touches an account that has no buy universe.
    const restricted =
      universeSymbols.length && isCurrentSession ? await this.restrictions.current() : null;
    const securityVerified = restricted !== null;
    if (universeSymbols.length && restricted === null) {
      issues.push(
        issue(
          'missing_security_status',
          isCurrentSession
            ? 'Không lấy được trạng thái chứng khoán HOSE'
            : 'HOSE không cung cấp lịch sử trạng thái chứng khoán theo phiên',
        ),
      );
    }

    // The same static predicate that validates an applied list: active HOSE stock.
    const tradable = new Set(
      universeSymbols.length
        ? (
            await this.database.query<{ symbol: string }>(
              `select upper(symbol) as symbol from symbols
               where upper(symbol) = any($1::text[]) and ${BOT_TRADABLE_SYMBOL_SQL}`,
              [universeSymbols],
            )
          ).map((row) => row.symbol)
        : [],
    );

    const barsMap: Awaited<ReturnType<MarketHuntDataSource['dailyBarsThrough']>> = requested.length
      ? await this.bars.dailyBarsThrough(requested, BAR_COUNT, tradingDate)
      : new Map();
    const completedSession = isCompletedVietnamSession(tradingDate, observedAt);
    const symbols: BotMarketSnapshotInput['symbols'] = {};
    const gaps: Record<string, string> = {};
    for (const symbol of requested) {
      const symbolBars = barsMap.get(symbol) ?? [];
      const latest = symbolBars.at(-1);
      const exact = latest?.time === tradingDate && completedSession;
      const official = Boolean(
        exact && latest && Number.isFinite(latest.close) && latest.close > 0,
      );
      const recentValues = symbolBars.slice(-LIQUIDITY_SESSIONS).map((bar) => bar.gtgdVnd);
      const tradingValueAvg20 =
        recentValues.length === LIQUIDITY_SESSIONS &&
        recentValues.every((value) => value !== null && Number.isFinite(value))
          ? Math.round(
              recentValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) /
                LIQUIDITY_SESSIONS,
            )
          : null;
      if (!symbolBars.length) gaps[symbol] = 'no_bars';
      else if (!official) gaps[symbol] = 'no_official_close';
      else if (tradingValueAvg20 === null) gaps[symbol] = 'no_liquidity';
      const universeMember = universeSymbols.includes(symbol);
      symbols[symbol] = {
        close_vnd: official ? String(Math.round(latest!.close)) : undefined,
        close_is_official: official,
        trading_value_avg20_vnd: tradingValueAvg20 === null ? undefined : String(tradingValueAvg20),
        security_status_verified: universeMember ? securityVerified : undefined,
        tradable_security_status: universeMember
          ? securityVerified && tradable.has(symbol) && !restricted!.has(symbol)
          : undefined,
        source_refs: {
          close: {
            provider: 'VCI',
            endpoint: 'chart/OHLCChart/gap-chart',
            session: latest?.time ?? null,
            exact_session: exact,
            completed_session: completedSession,
            official_close_evidence: official,
          },
          liquidity: {
            basis: `Trung bình ${LIQUIDITY_SESSIONS} phiên GTGD, VCI accumulatedValue`,
            sessions: symbolBars.slice(-LIQUIDITY_SESSIONS).length,
            complete: tradingValueAvg20 !== null,
          },
        },
      };
    }
    for (const [symbol, reason] of Object.entries(gaps)) {
      this.logger.debug(`Bot data gap ${symbol} (${tradingDate}): ${reason}`);
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

    const openSymbolsComplete = openSymbols.every(
      (symbol) => symbols[symbol]?.close_is_official === true,
    );
    if (!openSymbolsComplete) {
      issues.push(issue('missing_official_close', 'Thiếu giá đóng cửa đúng phiên cho vị thế mở'));
    }
    const sourceRefs = {
      universe: {
        session: tradingDate,
        requested_symbols: universeSymbols.length,
        symbols_with_gaps: Object.keys(gaps).length,
        gaps,
      },
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
      close_is_official: openSymbolsComplete && completedSession,
      // Only inputs shared by the whole candidate scan belong in this bit. Close, liquidity,
      // condition signals, lot sizing and capital are judged per symbol so one bad symbol
      // never prevents the others from being considered.
      buy_inputs_complete: universeSymbols.length === 0 || securityVerified,
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
