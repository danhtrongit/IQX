import { ConflictException, Injectable, Logger } from '@nestjs/common';

import type { SqlClient } from '../../platform/database/database.service.js';
import {
  RightsNegativeCostError,
  classifyVciEvent,
  computeEligibleQuantity,
  computeRightsAdjustment,
  determineDueTransitions,
  previousTradingDate,
  vnDate,
} from './rights.domain.js';
import { TradingRightsEventsPort } from './rights.ports.js';
import { TradingRightsRepository } from './rights.repository.js';
import type {
  CorporateActionRow,
  NormalizedAction,
  ReplayTrade,
  RightsTransition,
} from './rights.types.js';
import { currentTradingDate } from './trading.calendar.js';
import type { TradingAccount, TradingConfig, TradingPosition } from './trading.types.js';

const SYNC_DAYS_BACK = 120;
const SYNC_DAYS_FORWARD = 90;
const MAX_EVENT_ROWS = 20_000;
const ACCOUNT_PAGE = 200;
const RIGHTS_SYNC_LOCK = `select pg_advisory_xact_lock(hashtext('iqx:virtual-trading:rights-sync'))`;
const FALLBACK_DEPLOYMENT_DATE = '1900-01-01';

export type RightsSyncSummary = {
  as_of: string;
  events_seen: number;
  events_inserted: number;
  events_updated: number;
  events_ignored: number;
  events_review: number;
  ais_matches: number;
  accounts_checked: number;
  ex_applied: number;
  cash_paid: number;
  shares_credited: number;
};

export type RightsApplyResult = {
  exApplied: number;
  cashPaid: number;
  sharesCredited: number;
  account: TradingAccount;
};

function shiftDays(date: string, days: number): string {
  const cursor = new Date(`${date}T00:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

@Injectable()
export class TradingRightsService {
  private readonly logger = new Logger(TradingRightsService.name);

  constructor(
    private readonly repository: TradingRightsRepository,
    private readonly events: TradingRightsEventsPort,
  ) {}

  async syncAndApply(now: Date = new Date()): Promise<RightsSyncSummary> {
    const asOf = vnDate(now);
    const policy = await this.repository.getPolicy();
    const deploymentDate = policy ?? FALLBACK_DEPLOYMENT_DATE;
    if (policy === null) {
      this.logger.warn('Rights policy row is missing; applying without a deployment cutoff');
    }

    const from = shiftDays(asOf, -SYNC_DAYS_BACK);
    const to = shiftDays(asOf, SYNC_DAYS_FORWARD);
    const oldestRecord = await this.repository.getOldestUnresolvedRecordDate();
    const aisFrom = oldestRecord !== null && oldestRecord < from ? oldestRecord : from;

    const [dividends, listings] = await Promise.all([
      this.events.fetch({ from, to, codes: 'DIV,ISS' }),
      this.events.fetch({ from: aisFrom, to, codes: 'AIS' }),
    ]);
    if (dividends.length >= MAX_EVENT_ROWS || listings.length >= MAX_EVENT_ROWS) {
      throw new Error('VCI events response reached the completeness cap; aborting rights sync');
    }

    const raw = [...dividends, ...listings];
    const normalized: NormalizedAction[] = [];
    let eventsIgnored = 0;
    for (const record of raw) {
      const result = classifyVciEvent(record);
      if ('ignored' in result) {
        eventsIgnored += 1;
        continue;
      }
      if (result.action.kind === 'cash_dividend' && (result.action.cashPerShareVnd ?? 0n) <= 0n) {
        eventsIgnored += 1;
        continue;
      }
      normalized.push(result.action);
    }

    const universe = await this.repository.universeSymbols();
    const candidates = normalized.filter((action) => universe.has(action.symbol));

    const syncOutcome = await this.repository.transaction(async (tx) => {
      await tx.query(RIGHTS_SYNC_LOCK);
      const counts = await this.repository.upsertObservations(tx, candidates, deploymentDate);
      const matches = await this.repository.resolveCreditDates(tx);
      return { ...counts, matches };
    });

    let cursor: string | null = null;
    let accountsChecked = 0;
    let exApplied = 0;
    let cashPaid = 0;
    let sharesCredited = 0;
    for (;;) {
      const ids = await this.repository.listActiveAccountIds(cursor, ACCOUNT_PAGE);
      if (ids.length === 0) break;
      for (const accountId of ids) {
        accountsChecked += 1;
        try {
          const result = await this.repository.transaction(async (tx) => {
            const account = await this.repository.lockAccount(tx, accountId);
            if (!account || account.status !== 'active') return null;
            const config = await this.repository.getActiveConfig(tx);
            if (!config) return null;
            return this.applyDueForAccountSameTx(tx, account, config, now);
          });
          if (result) {
            exApplied += result.exApplied;
            cashPaid += result.cashPaid;
            sharesCredited += result.sharesCredited;
          }
        } catch (error) {
          if (error instanceof RightsNegativeCostError) {
            this.logger.error(
              `Rights negative cost escaped account ${accountId}: ${error.message}`,
            );
            continue;
          }
          throw error;
        }
      }
      cursor = ids[ids.length - 1]!;
      if (ids.length < ACCOUNT_PAGE) break;
    }

    return {
      as_of: asOf,
      events_seen: raw.length,
      events_inserted: syncOutcome.inserted,
      events_updated: syncOutcome.updated,
      events_ignored: eventsIgnored,
      events_review: syncOutcome.review,
      ais_matches: syncOutcome.matches,
      accounts_checked: accountsChecked,
      ex_applied: exApplied,
      cash_paid: cashPaid,
      shares_credited: sharesCredited,
    };
  }

  async applyDueForAccountSameTx(
    tx: SqlClient,
    account: TradingAccount,
    config: TradingConfig,
    now: Date,
  ): Promise<RightsApplyResult> {
    const asOf = vnDate(now);
    const holidays = new Set(config.holidays);
    const actions = await this.repository.lockRelevantActions(tx, account.id, asOf);
    if (actions.length === 0) {
      return { exApplied: 0, cashPaid: 0, sharesCredited: 0, account };
    }

    const entitlements = await this.repository.lockEntitlements(
      tx,
      account.id,
      actions.map((action) => action.id),
    );
    const entitlementByAction = new Map(entitlements.map((row) => [row.corporate_action_id, row]));

    const symbols = [...new Set(actions.map((action) => action.symbol))];
    const positions = await this.repository.lockPositions(tx, account.id, symbols);
    const positionBySymbol = new Map<string, TradingPosition>(
      positions.map((position) => [position.symbol, position]),
    );

    let currentAccount = account;
    let exApplied = 0;
    let cashPaid = 0;
    let sharesCredited = 0;

    for (const action of actions) {
      if (entitlementByAction.has(action.id)) continue;
      const transitions = determineDueTransitions(action, null, asOf);
      if (!transitions.some((transition) => transition.type === 'apply_ex')) continue;
      try {
        const inserted = await this.applyEx(tx, currentAccount, holidays, action, positionBySymbol);
        if (inserted) {
          if (inserted.eligible_quantity > 0) exApplied += 1;
          entitlementByAction.set(action.id, inserted);
        }
      } catch (error) {
        if (error instanceof RightsNegativeCostError) {
          await this.repository.markActionReview(tx, action.id, 'Negative adjusted average cost');
          this.logger.warn(
            `Rights negative cost for account ${account.id} action ${action.id} (${action.symbol}); marked review_required`,
          );
          continue;
        }
        throw error;
      }
    }

    for (const action of actions) {
      const entitlement = entitlementByAction.get(action.id);
      if (!entitlement) continue;
      const transitions: readonly RightsTransition[] = determineDueTransitions(
        action,
        entitlement,
        asOf,
      );
      for (const transition of transitions) {
        if (transition.type === 'pay_cash') {
          currentAccount = await this.payCash(tx, currentAccount, action.symbol, entitlement);
          cashPaid += 1;
        } else if (transition.type === 'credit_stock') {
          await this.creditStock(tx, currentAccount, action.symbol, entitlement, positionBySymbol);
          sharesCredited += 1;
        }
      }
    }

    return { exApplied, cashPaid, sharesCredited, account: currentAccount };
  }

  async pendingTotals(
    accountIds: readonly string[],
    client?: SqlClient,
  ): Promise<
    Map<
      string,
      {
        cashVnd: bigint;
        shares: number;
        bySymbol: Map<string, { cashVnd: bigint; shares: number }>;
      }
    >
  > {
    if (client) return this.repository.pendingTotals(accountIds, client);
    return this.repository.pendingTotals(accountIds);
  }

  async cancelPendingForResetSameTx(tx: SqlClient, accountId: string): Promise<number> {
    return this.repository.cancelPendingForResetSameTx(tx, accountId);
  }

  private async applyEx(
    tx: SqlClient,
    account: TradingAccount,
    holidays: ReadonlySet<string>,
    action: CorporateActionRow,
    positionBySymbol: Map<string, TradingPosition>,
  ) {
    if (action.exright_date === null) return null;
    const effectiveExDate = action.exright_date;
    const eligibilityDate = previousTradingDate(effectiveExDate, holidays);

    const replayRows = await this.repository.listReplayTrades(tx, account.id, action.symbol);
    const trades: ReplayTrade[] = replayRows.map((row) => {
      const actualSession = currentTradingDate(row.tradedAt, holidays);
      let sessionDate = actualSession;
      if (actualSession !== row.orderTradingDate) {
        sessionDate = actualSession > row.orderTradingDate ? actualSession : row.orderTradingDate;
        this.logger.warn(
          `Rights replay session mismatch for ${account.id}/${action.symbol}: order ${row.orderTradingDate}, executed ${actualSession}; using ${sessionDate}`,
        );
      }
      return {
        side: row.side,
        quantity: row.quantity,
        sessionDate,
        tradedAt: row.tradedAt,
      };
    });

    const priorStockEntitlements = await this.repository.listPriorStockEntitlements(
      tx,
      account.id,
      eligibilityDate,
    );
    const epoch = account.resetAt ?? account.activatedAt;
    const eligible = computeEligibleQuantity({
      trades,
      priorStockEntitlements,
      eligibilityDate,
      accountEpochAt: epoch,
    });
    if (eligible.negative) {
      this.logger.warn(
        `Rights eligibility reconstruction was negative for ${account.id}/${action.symbol}; clamped to 0`,
      );
    }

    const position = positionBySymbol.get(action.symbol) ?? null;
    const liveQuantity = position?.quantityTotal ?? 0;
    const liveAvgVnd = position?.avgCostVnd ?? 0n;

    let status: 'no_entitlement' | 'pending_cash' | 'pending_stock' = 'no_entitlement';
    let cashAmountVnd = 0n;
    let shareQuantity = 0;
    let avgAfterVnd = liveAvgVnd;

    if (eligible.quantity > 0) {
      if (action.kind === 'cash_dividend') {
        const adjustment = computeRightsAdjustment({
          eligibleQuantity: eligible.quantity,
          liveQuantity,
          liveAvgVnd,
          terms: { kind: 'cash_dividend', cashPerShareVnd: action.cash_per_share_vnd! },
        });
        status = 'pending_cash';
        cashAmountVnd = adjustment.cashVnd;
        avgAfterVnd = adjustment.newAvgVnd;
      } else {
        const adjustment = computeRightsAdjustment({
          eligibleQuantity: eligible.quantity,
          liveQuantity,
          liveAvgVnd,
          terms: { kind: 'stock_dividend', stockRatio: action.stock_ratio! },
        });
        status = 'pending_stock';
        shareQuantity = adjustment.shares;
        avgAfterVnd = adjustment.newAvgVnd;
      }
    }

    const inserted = await this.repository.insertEntitlement(tx, {
      accountId: account.id,
      corporateActionId: action.id,
      accountEpochAt: epoch,
      kind: action.kind === 'cash_dividend' ? 'cash_dividend' : 'stock_dividend',
      effectiveExDate,
      eligibilityDate,
      eligibleQuantity: eligible.quantity,
      cashAmountVnd,
      shareQuantity,
      avgBeforeVnd: liveAvgVnd,
      avgAfterVnd,
      status,
    });
    if (!inserted) return null;

    if (eligible.quantity > 0) {
      if (action.kind === 'cash_dividend') {
        if (position) {
          position.avgCostVnd = avgAfterVnd;
          await this.repository.savePosition(tx, position);
        }
      } else if (position) {
        position.quantityTotal += shareQuantity;
        position.quantityPending += shareQuantity;
        position.avgCostVnd = avgAfterVnd;
        await this.repository.savePosition(tx, position);
      } else {
        const created = await this.repository.savePosition(tx, {
          accountId: account.id,
          symbol: action.symbol,
          quantityTotal: shareQuantity,
          quantitySellable: 0,
          quantityPending: shareQuantity,
          quantityReserved: 0,
          avgCostVnd: avgAfterVnd,
          activePlanBuyOrderId: null,
          activeOriginalStopVnd: null,
          activeOriginalTakeProfitVnd: null,
          activeDynamicStopVnd: null,
        });
        positionBySymbol.set(action.symbol, created);
      }
      await this.repository.markActionFrozen(tx, action.id);
      await this.repository.insertRightsLedger(tx, {
        accountId: account.id,
        amount: 0n,
        balanceAfter: account.cashAvailableVnd,
        kind: 'rights_ex_applied',
        referenceId: inserted.id,
      });
    }
    return inserted;
  }

  private async payCash(
    tx: SqlClient,
    account: TradingAccount,
    symbol: string,
    entitlement: { id: string; cash_amount_vnd: bigint },
  ): Promise<TradingAccount> {
    const updated = await this.repository.transitionEntitlement(
      tx,
      entitlement.id,
      'paid',
      'pending_cash',
    );
    if (updated === 0) {
      throw new ConflictException(
        `Rights cash entitlement ${entitlement.id} for ${symbol} was already fulfilled`,
      );
    }
    account.cashAvailableVnd += entitlement.cash_amount_vnd;
    const saved = await this.repository.updateCash(tx, account);
    await this.repository.insertRightsLedger(tx, {
      accountId: saved.id,
      amount: entitlement.cash_amount_vnd,
      balanceAfter: saved.cashAvailableVnd,
      kind: 'rights_cash_paid',
      referenceId: entitlement.id,
    });
    return saved;
  }

  private async creditStock(
    tx: SqlClient,
    account: TradingAccount,
    symbol: string,
    entitlement: { id: string; account_id: string; share_quantity: number },
    positionBySymbol: Map<string, TradingPosition>,
  ): Promise<void> {
    const updated = await this.repository.transitionEntitlement(
      tx,
      entitlement.id,
      'credited',
      'pending_stock',
    );
    if (updated === 0) {
      throw new ConflictException(
        `Rights stock entitlement ${entitlement.id} for ${symbol} was already fulfilled`,
      );
    }
    if (!positionBySymbol.has(symbol)) {
      throw new ConflictException(`Rights stock position for ${symbol} is missing`);
    }
    const position = await this.repository.creditPositionShares(
      tx,
      account.id,
      symbol,
      entitlement.share_quantity,
    );
    if (!position) {
      throw new ConflictException(
        `Rights stock pending balance for ${symbol} is inconsistent with the entitlement`,
      );
    }
    positionBySymbol.set(symbol, position);
    await this.repository.insertRightsLedger(tx, {
      accountId: account.id,
      amount: 0n,
      balanceAfter: account.cashAvailableVnd,
      kind: 'rights_stock_credited',
      referenceId: entitlement.id,
    });
  }
}
