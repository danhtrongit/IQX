import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { SqlClient } from '../../platform/database/database.service.js';
import { addTradingDays, currentTradingDate, sessionExpiry } from './trading.calendar.js';
import {
  TRADING_JOURNEY_PORT,
  TradingMarketPort,
  type TradingJourneyPort,
} from './trading.ports.js';
import { TradingRepository, mapConfig } from './trading.repository.js';
import type {
  ConfigSnapshot,
  JourneyPlan,
  PlaceOrderInput,
  PlaceOrderResult,
  SettlementMode,
  TradingAccount,
  TradingConfig,
  TradingOrder,
  TradingPosition,
  TradingQuote,
} from './trading.types.js';

const MAX_GROSS_VND = 100_000_000_000n;
const MAX_PREFLIGHT_QUOTE_AGE_MS = 10_000;
const LEADERBOARD_HARD_CAP = 200;
const REQUIRED_FIVE_LAYERS = new Set(['ky_thuat', 'dong_tien', 'noi_bo', 'tin_tuc', 'dinh_gia']);

function safeMoney(value: bigint | null): number | null {
  if (value == null) return null;
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new UnprocessableEntityException({
      code: 'MONEY_OUT_OF_RANGE',
      message: 'Money value exceeds the JSON safe integer range',
    });
  }
  return result;
}

/** Exact round-half-up basis-point calculation over integer VND. */
export function roundBasisPoints(amount: bigint, rateBps: number): bigint {
  if (amount < 0n || !Number.isInteger(rateBps) || rateBps < 0) {
    throw new RangeError('amount and rateBps must be non-negative integers');
  }
  return (amount * BigInt(rateBps) + 5_000n) / 10_000n;
}

function accountResponse(account: TradingAccount) {
  return {
    id: account.id,
    user_id: account.userId,
    status: account.status,
    initial_cash_vnd: safeMoney(account.initialCashVnd),
    cash_available_vnd: safeMoney(account.cashAvailableVnd),
    cash_reserved_vnd: safeMoney(account.cashReservedVnd),
    cash_pending_vnd: safeMoney(account.cashPendingVnd),
    total_cash_vnd: safeMoney(
      account.cashAvailableVnd + account.cashReservedVnd + account.cashPendingVnd,
    ),
    activated_at: account.activatedAt.toISOString(),
    reset_at: account.resetAt?.toISOString() ?? null,
    created_at: account.createdAt.toISOString(),
  };
}

function orderResponse(
  order: TradingOrder,
  plan: { savedLevels?: number[]; nhoiLinked?: boolean } = {},
) {
  return {
    id: order.id,
    account_id: order.accountId,
    symbol: order.symbol,
    mode: order.mode,
    side: order.side,
    order_type: order.orderType,
    status: order.status,
    quantity: order.quantity,
    limit_price_vnd: safeMoney(order.limitPriceVnd),
    reserved_cash_vnd: safeMoney(order.reservedCashVnd),
    reserved_quantity: order.reservedQuantity,
    filled_price_vnd: safeMoney(order.filledPriceVnd),
    gross_amount_vnd: safeMoney(order.grossAmountVnd),
    fee_vnd: safeMoney(order.feeVnd),
    tax_vnd: safeMoney(order.taxVnd),
    net_amount_vnd: safeMoney(order.netAmountVnd),
    trading_date: order.tradingDate,
    rejection_reason: order.rejectionReason,
    cancel_reason: order.cancelReason,
    exit_matched_buy_order_id: order.exitMatchedBuyOrderId,
    exit_snapshot_at: order.exitSnapshotAt?.toISOString() ?? null,
    exit_avg_cost_vnd: safeMoney(order.exitAvgCostVnd),
    journey_plan_saved_levels: plan.savedLevels ?? [],
    nhoi_lenh_alert_linked: plan.nhoiLinked ?? false,
    created_at: order.createdAt.toISOString(),
  };
}

function assertQuoteFresh(quote: TradingQuote, now = new Date()): void {
  if (quote.priceVnd <= 0n) {
    throw new ServiceUnavailableException({
      code: 'PRICE_UNAVAILABLE',
      message: 'Giá không hợp lệ',
    });
  }
  const age = now.getTime() - quote.obtainedAt.getTime();
  const sourceAge = now.getTime() - quote.priceTime.getTime();
  if (
    age < -1_000 ||
    age > MAX_PREFLIGHT_QUOTE_AGE_MS ||
    sourceAge < -1_000 ||
    sourceAge > MAX_PREFLIGHT_QUOTE_AGE_MS
  ) {
    throw new ServiceUnavailableException({
      code: 'PRICE_STALE',
      message: 'Giá đã cũ, vui lòng thử lại',
    });
  }
}

function configSnapshot(config: TradingConfig, settlementMode: SettlementMode): ConfigSnapshot {
  return {
    buy_fee_rate_bps: config.buyFeeRateBps,
    sell_fee_rate_bps: config.sellFeeRateBps,
    sell_tax_rate_bps: config.sellTaxRateBps,
    settlement_mode: settlementMode,
    board_lot_size: config.boardLotSize,
  };
}

function assertPlan(
  level: number,
  plan: JourneyPlan | null | undefined,
): asserts plan is JourneyPlan {
  if (!plan) throw new BadRequestException('Lệnh MUA trong hành trình cần journey_plan');
  if (level === 0 && !plan.ly_do_doi_thuong?.trim()) {
    throw new BadRequestException('Cấp 0 cần lý do đời thường trước khi mua');
  }
  if (level >= 1 && (!plan.lyDo || !plan.trangThai_luc_dat || !plan.vung_mua)) {
    throw new BadRequestException('Cấp 1+ cần lý do, trạng thái và vùng mua');
  }
  if (level >= 2 && (!plan.phuong_phap_sl_tp || !plan.cat_lo || !plan.chot_loi)) {
    throw new BadRequestException('Cấp 2+ cần phương pháp, cắt lỗ và chốt lời');
  }
  if (level >= 3 && (!plan.khau_vi || !plan.muc_tu_tin || !plan.cach_khoi_luong)) {
    throw new BadRequestException('Cấp 3+ cần khẩu vị, mức tự tin và cách khối lượng');
  }
  if (level >= 4 && level <= 5) {
    const keys = Object.keys(plan.doc_5_lop ?? {});
    if (
      keys.length !== REQUIRED_FIVE_LAYERS.size ||
      keys.some((key) => !REQUIRED_FIVE_LAYERS.has(key))
    ) {
      throw new BadRequestException('Cấp 4–5 cần tự đọc đủ chính xác 5 lớp');
    }
  }
}

@Injectable()
export class TradingService {
  constructor(
    private readonly repository: TradingRepository,
    private readonly market: TradingMarketPort,
    @Optional()
    @Inject(TRADING_JOURNEY_PORT)
    private readonly journey?: TradingJourneyPort,
  ) {}

  async activateAccount(userId: string) {
    return this.repository.transaction(async (tx) => {
      const config = await this.repository.ensureConfig(tx);
      if (!config.tradingEnabled)
        throw new ForbiddenException('Giao dịch ảo hiện đang bị tạm dừng');
      if (await this.repository.getAccountByUser(userId, tx, true)) {
        throw new ConflictException('Tài khoản giao dịch ảo đã tồn tại');
      }
      let account: TradingAccount;
      try {
        account = await this.repository.createAccount(tx, userId, config.initialCashVnd);
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException('Tài khoản giao dịch ảo đã tồn tại');
        }
        throw error;
      }
      await this.repository.insertLedger(tx, {
        accountId: account.id,
        amount: config.initialCashVnd,
        balanceAfter: config.initialCashVnd,
        kind: 'activate',
        note: `Số dư ban đầu theo cấu hình: ${config.initialCashVnd} VND`,
      });
      return accountResponse(account);
    });
  }

  async getAccount(userId: string): Promise<TradingAccount> {
    const account = await this.repository.getAccountByUser(userId);
    if (!account) throw new NotFoundException('Không tìm thấy tài khoản giao dịch ảo');
    return account;
  }

  async getAccountResponse(userId: string) {
    return accountResponse(await this.getAccount(userId));
  }

  async getOrCreateConfig(actorId?: string): Promise<TradingConfig> {
    return this.repository.transaction((tx) => this.repository.ensureConfig(tx, actorId));
  }

  async updateConfig(
    patch: Partial<
      Pick<
        TradingConfig,
        | 'initialCashVnd'
        | 'buyFeeRateBps'
        | 'sellFeeRateBps'
        | 'sellTaxRateBps'
        | 'settlementMode'
        | 'boardLotSize'
        | 'tradingEnabled'
        | 'holidays'
      >
    >,
    actorId: string,
  ): Promise<TradingConfig> {
    return this.repository.transaction(async (tx) => {
      await this.repository.ensureConfig(tx, actorId);
      const values: unknown[] = [];
      const assignments: string[] = [];
      const fields: Array<[keyof typeof patch, string]> = [
        ['initialCashVnd', 'initial_cash_vnd'],
        ['buyFeeRateBps', 'buy_fee_rate_bps'],
        ['sellFeeRateBps', 'sell_fee_rate_bps'],
        ['sellTaxRateBps', 'sell_tax_rate_bps'],
        ['settlementMode', 'settlement_mode'],
        ['boardLotSize', 'board_lot_size'],
        ['tradingEnabled', 'trading_enabled'],
        ['holidays', 'holidays'],
      ];
      for (const [key, column] of fields) {
        const value = patch[key];
        if (value === undefined) continue;
        values.push(
          key === 'initialCashVnd' || key === 'holidays'
            ? key === 'initialCashVnd'
              ? String(value)
              : JSON.stringify(value)
            : value,
        );
        assignments.push(`${column}=$${values.length}`);
      }
      if (assignments.length === 0) {
        const config = await this.repository.getConfig(tx);
        if (!config) throw new NotFoundException('Không tìm thấy cấu hình giao dịch ảo');
        return config;
      }
      values.push(actorId);
      const rows = await tx.query(
        `update virtual_trading_configs set ${assignments.join(',')}, updated_by=$${values.length}, updated_at=now() where is_active=true returning *`,
        values,
      );
      return rows[0] ? mapConfig(rows[0]) : this.repository.ensureConfig(tx, actorId);
    });
  }

  async getOrderForUser(userId: string, orderId: string): Promise<TradingOrder> {
    const order = await this.repository.getOrder(orderId);
    if (!order) throw new NotFoundException('Không tìm thấy lệnh');
    if (order.userId !== userId) throw new ForbiddenException('Lệnh này không thuộc về bạn');
    return order;
  }

  async getOrderForUserSameTx(tx: SqlClient, userId: string, orderId: string, lock = false) {
    const order = await this.repository.getOrder(orderId, tx, lock);
    if (!order) throw new NotFoundException('Không tìm thấy lệnh');
    if (order.userId !== userId) throw new ForbiddenException('Lệnh này không thuộc về bạn');
    return order;
  }

  /** Stable transaction-scoped helpers for journey, bot and admin use cases. */
  async getAccountSameTx(tx: SqlClient, userId: string, lock = false): Promise<TradingAccount> {
    const account = await this.repository.getAccountByUser(userId, tx, lock);
    if (!account) throw new NotFoundException('Không tìm thấy tài khoản giao dịch ảo');
    return account;
  }

  getPositionSameTx(tx: SqlClient, accountId: string, symbol: string, lock = false) {
    return this.repository.getPosition(tx, accountId, symbol.toUpperCase(), lock);
  }

  async getConfigSameTx(tx: SqlClient): Promise<TradingConfig> {
    return this.repository.ensureConfig(tx);
  }

  /** Execute a pre-validated market quote while the caller owns its transaction. */
  fillAtQuoteSameTx(
    tx: SqlClient,
    account: TradingAccount,
    order: TradingOrder,
    quote: TradingQuote,
    config: TradingConfig,
  ) {
    return this.fillOrderSameTx(tx, account, order, quote, config);
  }

  async placeOrder(input: PlaceOrderInput): Promise<ReturnType<typeof orderResponse>> {
    const symbol = input.symbol.trim().toUpperCase();
    if (!(await this.market.validateSymbol(symbol))) {
      throw new UnprocessableEntityException(
        `Mã '${symbol}' không được niêm yết trên HOSE/HNX/UPCOM`,
      );
    }

    let quote: TradingQuote | null = null;
    let quoteFailure: unknown;
    if (input.orderType === 'market') {
      try {
        quote = await this.market.getQuote(symbol);
      } catch (error) {
        quoteFailure = error;
      }
    }

    const result = await this.repository.transaction(async (tx): Promise<PlaceOrderResult> => {
      const config = await this.repository.ensureConfig(tx);
      if (!config.tradingEnabled)
        throw new ForbiddenException('Giao dịch ảo hiện đang bị tạm dừng');
      if (input.quantity % config.boardLotSize !== 0) {
        throw new BadRequestException(`Khối lượng phải là bội số của ${config.boardLotSize}`);
      }
      const limitPrice = input.limitPriceVnd == null ? null : BigInt(input.limitPriceVnd);
      if (input.orderType === 'limit' && (!limitPrice || limitPrice <= 0n)) {
        throw new BadRequestException('Lệnh limit yêu cầu giá limit lớn hơn 0');
      }
      const referencePrice = input.orderType === 'market' ? quote?.priceVnd : limitPrice;
      if (referencePrice && referencePrice * BigInt(input.quantity) > MAX_GROSS_VND) {
        throw new UnprocessableEntityException(
          `Giá trị lệnh vượt quá mức tối đa ${MAX_GROSS_VND.toString()} VND`,
        );
      }

      let account = await this.repository.getAccountByUser(input.userId, tx, true);
      if (!account) throw new NotFoundException('Không tìm thấy tài khoản giao dịch ảo');
      if (account.status !== 'active' || account.frozenAt) {
        throw new ForbiddenException('Tài khoản tạm khóa');
      }

      const level = this.journey ? await this.journey.getActiveLevel(tx, input.userId) : null;
      if (input.side === 'buy' && level != null) assertPlan(level, input.journeyPlan);
      if (input.journeyPlan && !this.journey) {
        throw new ServiceUnavailableException({
          code: 'JOURNEY_INTEGRATION_UNAVAILABLE',
          message: 'Không thể lưu kế hoạch hành trình lúc này',
        });
      }

      const mode =
        level === 0
          ? 'san_tap'
          : level != null && level >= 1
            ? 'thuc_chien'
            : input.isPremium
              ? 'thuc_chien'
              : 'san_tap';
      const settlementMode: SettlementMode = mode === 'san_tap' ? 'T0' : config.settlementMode;
      const snapshot = configSnapshot(config, settlementMode);
      const holidays = new Set(config.holidays);
      const tradingDate = currentTradingDate(new Date(), holidays);

      if (input.orderType === 'market' && !quote) {
        const rejected = await this.repository.createOrder(tx, {
          accountId: account.id,
          userId: input.userId,
          symbol,
          mode,
          side: input.side,
          orderType: 'market',
          status: 'rejected',
          quantity: input.quantity,
          tradingDate,
          rejectionReason:
            quoteFailure instanceof Error
              ? quoteFailure.message.slice(0, 500)
              : 'Không có giá thị trường',
          snapshot,
        });
        return { order: rejected, journeyPlanSavedLevels: [], nhoiLenhAlertLinked: false };
      }

      let order: TradingOrder;
      if (input.orderType === 'limit') {
        const gross = limitPrice! * BigInt(input.quantity);
        if (input.side === 'buy') {
          const reserve = gross + roundBasisPoints(gross, snapshot.buy_fee_rate_bps);
          if (account.cashAvailableVnd < reserve) {
            throw new BadRequestException(
              `Không đủ tiền: cần ${reserve.toString()} VND, hiện có ${account.cashAvailableVnd.toString()} VND`,
            );
          }
          account.cashAvailableVnd -= reserve;
          account.cashReservedVnd += reserve;
          account = await this.repository.updateCash(tx, account);
          order = await this.repository.createOrder(tx, {
            accountId: account.id,
            userId: input.userId,
            symbol,
            mode,
            side: input.side,
            orderType: 'limit',
            status: 'pending',
            quantity: input.quantity,
            limitPriceVnd: limitPrice,
            reservedCashVnd: reserve,
            tradingDate,
            expiresAt: sessionExpiry(tradingDate),
            snapshot,
          });
        } else {
          const position = await this.repository.getPosition(tx, account.id, symbol, true);
          if (!position || position.quantitySellable < input.quantity) {
            throw new BadRequestException(
              `Không đủ cổ phiếu khả dụng để bán: cần ${input.quantity}, hiện có ${position?.quantitySellable ?? 0}`,
            );
          }
          position.quantitySellable -= input.quantity;
          position.quantityReserved += input.quantity;
          await this.repository.savePosition(tx, position);
          order = await this.repository.createOrder(tx, {
            accountId: account.id,
            userId: input.userId,
            symbol,
            mode,
            side: input.side,
            orderType: 'limit',
            status: 'pending',
            quantity: input.quantity,
            limitPriceVnd: limitPrice,
            reservedQuantity: input.quantity,
            tradingDate,
            expiresAt: sessionExpiry(tradingDate),
            snapshot,
          });
        }
      } else {
        assertQuoteFresh(quote!);
        order = await this.repository.createOrder(tx, {
          accountId: account.id,
          userId: input.userId,
          symbol,
          mode,
          side: input.side,
          orderType: 'market',
          status: 'pending',
          quantity: input.quantity,
          tradingDate,
          snapshot,
        });
        order = await this.fillOrderSameTx(tx, account, order, quote!, config);
      }

      let planResult = { savedLevels: [] as number[], nhoiLenhAlertLinked: false };
      if (
        input.side === 'buy' &&
        level != null &&
        (order.status === 'pending' || order.status === 'filled')
      ) {
        assertPlan(level, input.journeyPlan);
        planResult = await this.journey!.validateAndPersistBuyPlan({
          tx,
          userId: input.userId,
          orderId: order.id,
          symbol,
          quantity: input.quantity,
          referencePriceVnd: order.filledPriceVnd ?? order.limitPriceVnd!,
          level,
          plan: input.journeyPlan,
        });
        if (order.status === 'filled') {
          await this.journey!.onBuyOrderFilled?.({
            tx,
            userId: input.userId,
            orderId: order.id,
            symbol,
          });
        }
      }
      return {
        order,
        journeyPlanSavedLevels: planResult.savedLevels,
        nhoiLenhAlertLinked: planResult.nhoiLenhAlertLinked,
      };
    });

    return orderResponse(result.order, {
      savedLevels: result.journeyPlanSavedLevels,
      nhoiLinked: result.nhoiLenhAlertLinked,
    });
  }

  private async fillOrderSameTx(
    tx: SqlClient,
    accountInput: TradingAccount,
    orderInput: TradingOrder,
    quote: TradingQuote,
    config: TradingConfig,
  ): Promise<TradingOrder> {
    assertQuoteFresh(quote);
    const locked = await this.repository.getOrder(orderInput.id, tx, true);
    if (!locked || locked.status !== 'pending') {
      throw new ConflictException('Lệnh đã được xử lý');
    }
    let account = accountInput;
    const snapshot = locked.configSnapshot;
    const quantity = BigInt(locked.quantity);
    const gross = quote.priceVnd * quantity;
    let fee: bigint;
    let tax: bigint;
    let net: bigint;
    const position = await this.repository.getPosition(tx, account.id, locked.symbol, true);

    if (locked.side === 'buy') {
      fee = roundBasisPoints(gross, snapshot.buy_fee_rate_bps);
      tax = 0n;
      const cost = gross + fee;
      if (locked.reservedCashVnd > 0n) {
        if (account.cashReservedVnd < locked.reservedCashVnd) {
          throw new ConflictException('Số dư giữ chỗ không nhất quán');
        }
        account.cashReservedVnd -= locked.reservedCashVnd;
        const difference = cost - locked.reservedCashVnd;
        if (difference > 0n) {
          if (account.cashAvailableVnd < difference)
            throw new BadRequestException('Không đủ tiền sau khi giá thay đổi');
          account.cashAvailableVnd -= difference;
        } else {
          account.cashAvailableVnd += -difference;
        }
      } else {
        if (account.cashAvailableVnd < cost) {
          throw new BadRequestException(
            `Không đủ tiền: cần ${cost.toString()}, hiện có ${account.cashAvailableVnd.toString()}`,
          );
        }
        account.cashAvailableVnd -= cost;
      }
      net = -cost;
      const oldTotal = position?.quantityTotal ?? 0;
      const newTotal = oldTotal + locked.quantity;
      const weightedCost = (position?.avgCostVnd ?? 0n) * BigInt(oldTotal) + gross;
      const average = weightedCost / BigInt(newTotal);
      await this.repository.savePosition(tx, {
        id: position?.id,
        accountId: account.id,
        symbol: locked.symbol,
        quantityTotal: newTotal,
        quantitySellable:
          (position?.quantitySellable ?? 0) +
          (snapshot.settlement_mode === 'T0' ? locked.quantity : 0),
        quantityPending:
          (position?.quantityPending ?? 0) +
          (snapshot.settlement_mode === 'T2' ? locked.quantity : 0),
        quantityReserved: position?.quantityReserved ?? 0,
        avgCostVnd: average,
        activePlanBuyOrderId: position?.activePlanBuyOrderId ?? null,
        activeOriginalStopVnd: position?.activeOriginalStopVnd ?? null,
        activeOriginalTakeProfitVnd: position?.activeOriginalTakeProfitVnd ?? null,
        activeDynamicStopVnd: position?.activeDynamicStopVnd ?? null,
      });
    } else {
      fee = roundBasisPoints(gross, snapshot.sell_fee_rate_bps);
      tax = roundBasisPoints(gross, snapshot.sell_tax_rate_bps);
      net = gross - fee - tax;
      if (!position) throw new BadRequestException('Không đủ cổ phiếu');
      if (locked.reservedQuantity > 0) {
        if (position.quantityReserved < locked.reservedQuantity)
          throw new ConflictException('Khối lượng giữ chỗ không nhất quán');
        position.quantityReserved -= locked.reservedQuantity;
      } else {
        if (position.quantitySellable < locked.quantity)
          throw new BadRequestException('Không đủ cổ phiếu');
        position.quantitySellable -= locked.quantity;
      }
      if (position.quantityTotal < locked.quantity)
        throw new ConflictException('Vị thế không nhất quán');
      const before = position.quantityTotal;
      position.quantityTotal -= locked.quantity;
      locked.exitSnapshotAt = new Date();
      locked.exitMatchedBuyOrderId = position.activePlanBuyOrderId;
      locked.exitAvgCostVnd = position.avgCostVnd;
      if (position.quantityTotal === 0) {
        position.activePlanBuyOrderId = null;
        position.activeOriginalStopVnd = null;
        position.activeOriginalTakeProfitVnd = null;
        position.activeDynamicStopVnd = null;
      }
      await this.repository.savePosition(tx, position);
      if (snapshot.settlement_mode === 'T0') account.cashAvailableVnd += net;
      else account.cashPendingVnd += net;
      void before;
    }

    account = await this.repository.updateCash(tx, account);
    locked.status = 'filled';
    locked.filledPriceVnd = quote.priceVnd;
    locked.grossAmountVnd = gross;
    locked.feeVnd = fee;
    locked.taxVnd = tax;
    locked.netAmountVnd = net;
    locked.reservedCashVnd = 0n;
    locked.reservedQuantity = 0;
    const saved = await this.repository.saveOrder(tx, locked);
    const trade = await this.repository.insertTrade(tx, {
      orderId: saved.id,
      accountId: account.id,
      symbol: saved.symbol,
      side: saved.side,
      quantity: saved.quantity,
      priceVnd: quote.priceVnd,
      grossAmountVnd: gross,
      feeVnd: fee,
      taxVnd: tax,
      netAmountVnd: net,
      priceSource: quote.source,
      priceTime: quote.priceTime,
    });
    if (snapshot.settlement_mode === 'T2') {
      const dueDate = addTradingDays(saved.tradingDate, 2, new Set(config.holidays));
      await this.repository.insertSettlement(tx, {
        accountId: account.id,
        tradeId: String(trade.id),
        kind: saved.side === 'buy' ? 'buy_qty_release' : 'sell_cash_release',
        amount: saved.side === 'buy' ? BigInt(saved.quantity) : net,
        symbol: saved.side === 'buy' ? saved.symbol : undefined,
        dueDate,
      });
    }
    await this.repository.insertLedger(tx, {
      accountId: account.id,
      amount: net,
      balanceAfter: account.cashAvailableVnd,
      kind: saved.side,
      referenceType: 'trade',
      referenceId: String(trade.id),
    });
    return saved;
  }

  async cancelOrder(userId: string, orderId: string) {
    const initial = await this.getOrderForUser(userId, orderId);
    return this.repository.transaction(async (tx) => {
      const account = await this.repository.getAccountById(tx, initial.accountId, true);
      if (!account) throw new NotFoundException('Không tìm thấy tài khoản');
      const order = await this.getOrderForUserSameTx(tx, userId, orderId, true);
      if (order.status !== 'pending') {
        throw new BadRequestException(`Không thể hủy lệnh ở trạng thái '${order.status}'`);
      }
      order.status = 'cancelled';
      order.cancelReason = 'Người dùng hủy';
      if (order.side === 'buy' && order.reservedCashVnd > 0n) {
        if (account.cashReservedVnd < order.reservedCashVnd)
          throw new ConflictException('Số dư giữ chỗ không nhất quán');
        account.cashReservedVnd -= order.reservedCashVnd;
        account.cashAvailableVnd += order.reservedCashVnd;
        await this.repository.updateCash(tx, account);
      } else if (order.side === 'sell' && order.reservedQuantity > 0) {
        const position = await this.repository.getPosition(tx, account.id, order.symbol, true);
        if (!position || position.quantityReserved < order.reservedQuantity)
          throw new ConflictException('Khối lượng giữ chỗ không nhất quán');
        position.quantityReserved -= order.reservedQuantity;
        position.quantitySellable += order.reservedQuantity;
        await this.repository.savePosition(tx, position);
      }
      order.reservedCashVnd = 0n;
      order.reservedQuantity = 0;
      return orderResponse(await this.repository.saveOrder(tx, order));
    });
  }

  async refresh(userId: string) {
    const account = await this.getAccount(userId);
    const preflight = await this.repository.listPending(account.id);
    const quotes = new Map<string, TradingQuote>();
    const warnings: string[] = [];
    await Promise.all(
      [...new Set(preflight.map((order) => order.symbol))].map(async (symbol) => {
        try {
          quotes.set(symbol, await this.market.getQuote(symbol));
        } catch {
          warnings.push(`Không có giá cho ${symbol}; lệnh vẫn ở trạng thái chờ`);
        }
      }),
    );

    return this.repository.transaction(async (tx) => {
      let lockedAccount = await this.repository.getAccountById(tx, account.id, true);
      if (!lockedAccount || lockedAccount.userId !== userId)
        throw new NotFoundException('Không tìm thấy tài khoản');
      const config = await this.repository.ensureConfig(tx);
      const holidays = new Set(config.holidays);
      const now = new Date();
      const today = currentTradingDate(now, holidays);
      const pending = await this.repository.listPending(account.id, tx, true);
      let filled = 0;
      let expired = 0;
      let settled = 0;

      for (const order of pending) {
        if (order.tradingDate < today || (order.expiresAt != null && order.expiresAt <= now)) {
          order.status = 'expired';
          if (order.side === 'buy' && order.reservedCashVnd > 0n) {
            if (lockedAccount.cashReservedVnd < order.reservedCashVnd)
              throw new ConflictException('Số dư giữ chỗ không nhất quán');
            lockedAccount.cashReservedVnd -= order.reservedCashVnd;
            lockedAccount.cashAvailableVnd += order.reservedCashVnd;
          } else if (order.side === 'sell' && order.reservedQuantity > 0) {
            const position = await this.repository.getPosition(tx, account.id, order.symbol, true);
            if (!position || position.quantityReserved < order.reservedQuantity)
              throw new ConflictException('Khối lượng giữ chỗ không nhất quán');
            position.quantityReserved -= order.reservedQuantity;
            position.quantitySellable += order.reservedQuantity;
            await this.repository.savePosition(tx, position);
          }
          order.reservedCashVnd = 0n;
          order.reservedQuantity = 0;
          await this.repository.saveOrder(tx, order);
          expired += 1;
          continue;
        }
        const quote = quotes.get(order.symbol);
        if (!quote) continue;
        try {
          assertQuoteFresh(quote, now);
        } catch {
          warnings.push(`Giá cho ${order.symbol} đã cũ; lệnh vẫn ở trạng thái chờ`);
          continue;
        }
        const shouldFill =
          order.limitPriceVnd != null &&
          (order.side === 'buy'
            ? quote.priceVnd <= order.limitPriceVnd
            : quote.priceVnd >= order.limitPriceVnd);
        if (shouldFill) {
          lockedAccount = (await this.repository.getAccountById(tx, account.id, false))!;
          await this.fillOrderSameTx(tx, lockedAccount, order, quote, config);
          await this.journey?.onBuyOrderFilled?.({
            tx,
            userId,
            orderId: order.id,
            symbol: order.symbol,
          });
          lockedAccount = (await this.repository.getAccountById(tx, account.id, false))!;
          filled += 1;
        }
      }
      lockedAccount = await this.repository.updateCash(tx, lockedAccount);
      const due = await this.repository.listDueSettlements(tx, account.id, today);
      for (const settlement of due) {
        if (String(settlement.kind) === 'buy_qty_release' && settlement.symbol != null) {
          const position = await this.repository.getPosition(
            tx,
            account.id,
            String(settlement.symbol),
            true,
          );
          if (!position) throw new ConflictException('Không tìm thấy vị thế cần thanh toán');
          const amount = Number(settlement.amount);
          if (!Number.isSafeInteger(amount) || amount < 0 || position.quantityPending < amount) {
            throw new ConflictException('Khối lượng thanh toán không nhất quán');
          }
          position.quantityPending -= amount;
          position.quantitySellable += amount;
          await this.repository.savePosition(tx, position);
        } else if (String(settlement.kind) === 'sell_cash_release') {
          const amount = BigInt(settlement.amount as string);
          if (lockedAccount.cashPendingVnd < amount)
            throw new ConflictException('Tiền chờ về không nhất quán');
          lockedAccount.cashPendingVnd -= amount;
          lockedAccount.cashAvailableVnd += amount;
          lockedAccount = await this.repository.updateCash(tx, lockedAccount);
        }
        if (await this.repository.settle(tx, String(settlement.id))) settled += 1;
      }
      return {
        orders_filled: filled,
        orders_expired: expired,
        settlements_settled: settled,
        warnings,
      };
    });
  }

  async getPortfolio(userId: string) {
    const account = await this.getAccount(userId);
    const positions = (await this.repository.listPositions(account.id)).filter(
      (p) => p.quantityTotal > 0,
    );
    const priced = await Promise.all(
      positions.map(async (position) => {
        try {
          const quote = await this.market.getQuote(position.symbol);
          if (quote.priceVnd <= 0n) throw new Error('Non-positive valuation price');
          return { position, quote, warning: null };
        } catch {
          return { position, quote: null, warning: `Không có giá cho ${position.symbol}` };
        }
      }),
    );
    if (priced.some(({ quote }) => quote === null)) {
      throw new ServiceUnavailableException({
        code: 'PORTFOLIO_PRICE_UNAVAILABLE',
        message: 'Không đủ giá để định giá toàn bộ danh mục; vui lòng thử lại',
      });
    }
    let totalMarketValue = 0n;
    let totalPnl = 0n;
    const warnings: string[] = [];
    const result = priced.map(({ position, quote, warning }) => {
      if (warning) warnings.push(warning);
      const marketValue = quote ? quote.priceVnd * BigInt(position.quantityTotal) : null;
      const pnl =
        marketValue == null
          ? null
          : marketValue - position.avgCostVnd * BigInt(position.quantityTotal);
      if (marketValue != null) totalMarketValue += marketValue;
      if (pnl != null) totalPnl += pnl;
      return {
        symbol: position.symbol,
        quantity_total: position.quantityTotal,
        quantity_sellable: position.quantitySellable,
        quantity_pending: position.quantityPending,
        quantity_reserved: position.quantityReserved,
        avg_cost_vnd: safeMoney(position.avgCostVnd),
        current_price_vnd: safeMoney(quote?.priceVnd ?? null),
        market_value_vnd: safeMoney(marketValue),
        unrealized_pnl_vnd: safeMoney(pnl),
        active_plan_buy_order_id: position.activePlanBuyOrderId,
        active_original_stop_vnd: safeMoney(position.activeOriginalStopVnd),
        active_original_take_profit_vnd: safeMoney(position.activeOriginalTakeProfitVnd),
        active_dynamic_stop_vnd: safeMoney(position.activeDynamicStopVnd),
      };
    });
    const cash = account.cashAvailableVnd + account.cashReservedVnd + account.cashPendingVnd;
    const nav = cash + totalMarketValue;
    const returnPct =
      account.initialCashVnd > 0n
        ? Math.round(
            (Number(nav - account.initialCashVnd) / Number(account.initialCashVnd)) * 10_000,
          ) / 100
        : 0;
    return {
      account: accountResponse(account),
      positions: result,
      total_market_value_vnd: safeMoney(totalMarketValue),
      nav_vnd: safeMoney(nav),
      total_unrealized_pnl_vnd: safeMoney(totalPnl),
      return_pct: returnPct,
      refresh_warnings: warnings,
    };
  }

  async listOrders(
    userId: string,
    filters: { status?: string; symbol?: string; side?: string; page: number; pageSize: number },
  ) {
    const account = await this.getAccount(userId);
    const result = await this.repository.listOrders(account.id, filters);
    return {
      orders: result.rows.map((order) => orderResponse(order)),
      total: result.total,
      page: filters.page,
      page_size: filters.pageSize,
    };
  }

  async listTrades(userId: string, page: number, pageSize: number) {
    const account = await this.getAccount(userId);
    const result = await this.repository.listTrades(account.id, page, pageSize);
    return {
      trades: result.rows.map((row) => ({
        id: String(row.id),
        order_id: String(row.order_id),
        symbol: String(row.symbol),
        side: String(row.side),
        quantity: Number(row.quantity),
        price_vnd: safeMoney(BigInt(row.price_vnd as string)),
        gross_amount_vnd: safeMoney(BigInt(row.gross_amount_vnd as string)),
        fee_vnd: safeMoney(BigInt(row.fee_vnd as string)),
        tax_vnd: safeMoney(BigInt(row.tax_vnd as string)),
        net_amount_vnd: safeMoney(BigInt(row.net_amount_vnd as string)),
        price_source: String(row.price_source),
        price_time: new Date(row.price_time as string).toISOString(),
        traded_at: new Date(row.traded_at as string).toISOString(),
      })),
      total: result.total,
      page,
      page_size: pageSize,
    };
  }

  async listLedger(userId: string, page: number, pageSize: number) {
    const account = await this.getAccount(userId);
    const result = await this.repository.listLedger(account.id, page, pageSize);
    return {
      items: result.rows.map((row) => ({
        id: String(row.id),
        amount_vnd: safeMoney(BigInt(row.amount_vnd as string)),
        balance_after_vnd: safeMoney(BigInt(row.balance_after_vnd as string)),
        kind: String(row.kind),
        reference_type: row.reference_type == null ? null : String(row.reference_type),
        reference_id: row.reference_id == null ? null : String(row.reference_id),
        note: row.note == null ? null : String(row.note),
        created_at: new Date(row.created_at as string).toISOString(),
      })),
      total: result.total,
      page,
      page_size: pageSize,
    };
  }

  async getLeaderboard(sortBy: 'nav' | 'profit' | 'return_pct', page: number, pageSize: number) {
    const [accounts, totalEligible] = await Promise.all([
      this.repository.listActiveAccounts(LEADERBOARD_HARD_CAP),
      this.repository.countActiveAccounts(),
    ]);
    const positions = new Map<string, TradingPosition[]>();
    const symbols = new Set<string>();
    await Promise.all(
      accounts.map(async (account) => {
        const rows = await this.repository.listPositions(account.id);
        positions.set(account.id, rows);
        rows.filter((row) => row.quantityTotal > 0).forEach((row) => symbols.add(row.symbol));
      }),
    );
    const prices = new Map<string, bigint>();
    await Promise.all(
      [...symbols].map(async (symbol) => {
        try {
          prices.set(symbol, (await this.market.getQuote(symbol)).priceVnd);
        } catch {
          /* cost valuation below */
        }
      }),
    );
    const names = await this.repository.userNames(accounts.map((account) => account.userId));
    const entries = accounts.map((account) => {
      let marketValue = 0n;
      let degraded = false;
      for (const position of positions.get(account.id) ?? []) {
        if (position.quantityTotal <= 0) continue;
        const price = prices.get(position.symbol);
        if (price == null) degraded = true;
        marketValue += (price ?? position.avgCostVnd) * BigInt(position.quantityTotal);
      }
      const nav =
        account.cashAvailableVnd + account.cashReservedVnd + account.cashPendingVnd + marketValue;
      const profit = nav - account.initialCashVnd;
      const returnPct =
        account.initialCashVnd > 0n ? (Number(profit) / Number(account.initialCashVnd)) * 100 : 0;
      return {
        user_id: account.userId,
        display_name: names.get(account.userId) ?? 'Không xác định',
        nav_vnd: safeMoney(nav)!,
        profit_vnd: safeMoney(profit)!,
        return_pct: Math.round(returnPct * 100) / 100,
        initial_cash_vnd: safeMoney(account.initialCashVnd)!,
        valuation_degraded: degraded,
      };
    });
    const field =
      sortBy === 'profit' ? 'profit_vnd' : sortBy === 'return_pct' ? 'return_pct' : 'nav_vnd';
    entries.sort((a, b) => b[field] - a[field]);
    const start = (page - 1) * pageSize;
    return {
      entries: entries
        .slice(start, start + pageSize)
        .map((entry, index) => ({ ...entry, rank: start + index + 1 })),
      total: entries.length,
      total_eligible: totalEligible,
      evaluated_count: entries.length,
      page,
      page_size: pageSize,
      sort_by: sortBy,
    };
  }
}
