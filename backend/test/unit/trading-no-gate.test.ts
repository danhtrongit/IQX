import { describe, expect, it } from 'vitest';

import { TradingService } from '../../src/modules/trading/trading.service.js';
import type {
  ConfigSnapshot,
  SettlementMode,
  TradingAccount,
  TradingConfig,
  TradingOrder,
  TradingPosition,
  TradingQuote,
} from '../../src/modules/trading/trading.types.js';

const NOW = new Date();

function makeConfig(settlementMode: SettlementMode): TradingConfig {
  return {
    id: 'config',
    initialCashVnd: 100_000_000n,
    buyFeeRateBps: 15,
    sellFeeRateBps: 15,
    sellTaxRateBps: 10,
    settlementMode,
    boardLotSize: 100,
    tradingEnabled: true,
    holidays: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/** Minimal in-memory repository covering the BUY path of TradingService.placeOrder. */
class FakeTradingRepository {
  account: TradingAccount = {
    id: 'acc-1',
    userId: 'user-1',
    status: 'active',
    initialCashVnd: 100_000_000n,
    cashAvailableVnd: 100_000_000n,
    cashReservedVnd: 0n,
    cashPendingVnd: 0n,
    activatedAt: NOW,
    resetAt: null,
    frozenAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
  orders: TradingOrder[] = [];
  positions = new Map<string, TradingPosition>();
  settlements: Array<{ kind: string; amount: bigint }> = [];
  ledger: Array<{ kind: string; amount: bigint }> = [];
  constructor(private readonly config: TradingConfig) {}

  async transaction<T>(operation: (tx: unknown) => Promise<T>): Promise<T> {
    return operation({});
  }
  async ensureConfig() {
    return this.config;
  }
  async getAccountByUser() {
    return { ...this.account };
  }
  async createOrder(
    _tx: unknown,
    input: {
      accountId: string;
      userId: string;
      symbol: string;
      mode: string;
      side: 'buy' | 'sell';
      orderType: 'market' | 'limit';
      status: TradingOrder['status'];
      quantity: number;
      limitPriceVnd?: bigint | null;
      reservedCashVnd?: bigint;
      tradingDate: string;
      expiresAt?: Date | null;
      snapshot: ConfigSnapshot;
    },
  ): Promise<TradingOrder> {
    const order: TradingOrder = {
      id: `order-${this.orders.length + 1}`,
      accountId: input.accountId,
      userId: input.userId,
      symbol: input.symbol,
      mode: input.mode as TradingOrder['mode'],
      side: input.side,
      orderType: input.orderType,
      status: input.status,
      quantity: input.quantity,
      limitPriceVnd: input.limitPriceVnd ?? null,
      reservedCashVnd: input.reservedCashVnd ?? 0n,
      reservedQuantity: 0,
      filledPriceVnd: null,
      grossAmountVnd: null,
      feeVnd: null,
      taxVnd: null,
      netAmountVnd: null,
      tradingDate: input.tradingDate,
      expiresAt: input.expiresAt ?? null,
      rejectionReason: null,
      cancelReason: null,
      configSnapshot: input.snapshot,
      exitMatchedBuyOrderId: null,
      exitSnapshotAt: null,
      exitAvgCostVnd: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.orders.push(order);
    return order;
  }
  async getOrder(id: string) {
    return this.orders.find((order) => order.id === id) ?? null;
  }
  async saveOrder(_tx: unknown, order: TradingOrder) {
    return order;
  }
  async getPosition(_tx: unknown, _accountId: string, symbol: string) {
    return this.positions.get(symbol) ?? null;
  }
  async savePosition(_tx: unknown, position: Omit<TradingPosition, 'id'> & { id?: string }) {
    const saved = { ...position, id: position.id ?? 'pos-1' } as TradingPosition;
    this.positions.set(position.symbol, saved);
    return saved;
  }
  async updateCash(_tx: unknown, account: TradingAccount) {
    this.account = { ...account };
    return this.account;
  }
  async insertTrade() {
    return { id: 'trade-1' };
  }
  async insertSettlement(_tx: unknown, input: { kind: string; amount: bigint }) {
    this.settlements.push(input);
  }
  async insertLedger(_tx: unknown, input: { kind: string; amount: bigint }) {
    this.ledger.push(input);
  }
}

function service(settlement: SettlementMode) {
  const repository = new FakeTradingRepository(makeConfig(settlement));
  const quote: TradingQuote = {
    symbol: 'VCB',
    priceVnd: 90_000n,
    source: 'test',
    priceTime: new Date(),
    obtainedAt: new Date(),
  };
  // Exactly three collaborators: repository, market, rights. No journey port exists any more.
  const trading = new TradingService(
    repository as never,
    {
      validateSymbol: async () => true,
      getQuote: async () => ({ ...quote, priceTime: new Date(), obtainedAt: new Date() }),
    },
    {} as never,
  );
  return { trading, repository };
}

const buyBase = {
  userId: 'user-1',
  symbol: 'vcb',
  side: 'buy' as const,
  orderType: 'market' as const,
  quantity: 100,
};

describe('manual BUY has no journey/level/plan gate', () => {
  it('no longer injects the journey port (nothing can demand a level or a plan)', () => {
    expect(Reflect.getMetadata('self:paramtypes', TradingService)).toBeUndefined();
    expect(Reflect.getMetadata('optional:paramtypes', TradingService)).toBeUndefined();
    expect(TradingService.length).toBe(3);
  });

  it('fills a market BUY with no journey plan, no level and no Premium flag', async () => {
    const { trading, repository } = service('T2');
    const result = await trading.placeOrder(buyBase);

    expect(result.status).toBe('filled');
    expect(result.side).toBe('buy');
    expect(result.symbol).toBe('VCB');
    // 100 x 90,000 + 15 bps fee (13,500) deducted from cash.
    expect(repository.account.cashAvailableVnd).toBe(100_000_000n - 9_000_000n - 13_500n);
    expect(result.journey_plan_saved_levels).toEqual([]);
    expect(result.nhoi_lenh_alert_linked).toBe(false);
    expect(repository.ledger.map((entry) => entry.kind)).toEqual(['buy']);
  });

  it('uses the regular (non-practice) mode with the configured T+2 settlement for everyone', async () => {
    const { trading, repository } = service('T2');
    const result = await trading.placeOrder(buyBase);
    expect(result.mode).toBe('thuc_chien');
    expect(repository.orders[0]?.configSnapshot.settlement_mode).toBe('T2');
    const position = repository.positions.get('VCB');
    expect(position).toMatchObject({
      quantityTotal: 100,
      quantityPending: 100,
      quantitySellable: 0,
    });
    expect(repository.settlements.map((s) => s.kind)).toEqual(['buy_qty_release']);
  });

  it('follows a T0 configuration as well (no forced practice settlement either way)', async () => {
    const { trading, repository } = service('T0');
    const result = await trading.placeOrder(buyBase);
    expect(result.mode).toBe('thuc_chien');
    expect(repository.positions.get('VCB')).toMatchObject({
      quantitySellable: 100,
      quantityPending: 0,
    });
    expect(repository.settlements).toHaveLength(0);
  });

  it('keeps ordinary validation: lot size and limit orders still reserve cash', async () => {
    const { trading, repository } = service('T2');
    await expect(trading.placeOrder({ ...buyBase, quantity: 150 })).rejects.toThrow(
      'bội số của 100',
    );
    const limit = await trading.placeOrder({
      ...buyBase,
      orderType: 'limit',
      limitPriceVnd: 80_000,
    });
    expect(limit.status).toBe('pending');
    expect(limit.reserved_cash_vnd).toBe(8_000_000 + 12_000);
    expect(repository.account.cashReservedVnd).toBe(8_012_000n);
    await expect(
      trading.placeOrder({
        ...buyBase,
        orderType: 'limit',
        limitPriceVnd: 100_000,
        quantity: 2_000,
      }),
    ).rejects.toThrow('Không đủ tiền');
  });

  it('ignores a legacy journey_plan sent by an old client instead of requiring or storing it', async () => {
    const { trading } = service('T2');
    const result = await trading.placeOrder({
      ...buyBase,
      journeyPlan: { ly_do_doi_thuong: 'ghi chú cũ', co_bam_doc_chi_tiet: false },
    });
    expect(result.status).toBe('filled');
    expect(result.journey_plan_saved_levels).toEqual([]);
  });
});
