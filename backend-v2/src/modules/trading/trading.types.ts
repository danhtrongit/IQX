import type { SqlClient } from '../../platform/database/database.service.js';

export const ORDER_SIDES = ['buy', 'sell'] as const;
export const ORDER_TYPES = ['market', 'limit'] as const;
export const ORDER_STATUSES = ['pending', 'filled', 'cancelled', 'expired', 'rejected'] as const;
export const SETTLEMENT_MODES = ['T0', 'T2'] as const;

export type OrderSide = (typeof ORDER_SIDES)[number];
export type OrderType = (typeof ORDER_TYPES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type SettlementMode = (typeof SETTLEMENT_MODES)[number];

export type Money = bigint;

export type TradingConfig = {
  id: string;
  initialCashVnd: Money;
  buyFeeRateBps: number;
  sellFeeRateBps: number;
  sellTaxRateBps: number;
  settlementMode: SettlementMode;
  boardLotSize: number;
  tradingEnabled: boolean;
  holidays: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type TradingAccount = {
  id: string;
  userId: string;
  status: 'active' | 'suspended';
  initialCashVnd: Money;
  cashAvailableVnd: Money;
  cashReservedVnd: Money;
  cashPendingVnd: Money;
  activatedAt: Date;
  resetAt: Date | null;
  frozenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TradingPosition = {
  id: string;
  accountId: string;
  symbol: string;
  quantityTotal: number;
  quantitySellable: number;
  quantityPending: number;
  quantityReserved: number;
  avgCostVnd: Money;
  activePlanBuyOrderId: string | null;
  activeOriginalStopVnd: Money | null;
  activeOriginalTakeProfitVnd: Money | null;
  activeDynamicStopVnd: Money | null;
};

export type TradingOrder = {
  id: string;
  accountId: string;
  userId: string;
  symbol: string;
  mode: 'san_tap' | 'thuc_chien';
  side: OrderSide;
  orderType: OrderType;
  status: OrderStatus;
  quantity: number;
  limitPriceVnd: Money | null;
  reservedCashVnd: Money;
  reservedQuantity: number;
  filledPriceVnd: Money | null;
  grossAmountVnd: Money | null;
  feeVnd: Money | null;
  taxVnd: Money | null;
  netAmountVnd: Money | null;
  tradingDate: string;
  expiresAt: Date | null;
  rejectionReason: string | null;
  cancelReason: string | null;
  configSnapshot: ConfigSnapshot;
  exitMatchedBuyOrderId: string | null;
  exitSnapshotAt: Date | null;
  exitAvgCostVnd: Money | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TradingQuote = {
  symbol: string;
  priceVnd: Money;
  source: string;
  priceTime: Date;
  /** Monotonic-enough local acquisition time used to reject old preflight quotes. */
  obtainedAt: Date;
};

export type ConfigSnapshot = {
  buy_fee_rate_bps: number;
  sell_fee_rate_bps: number;
  sell_tax_rate_bps: number;
  settlement_mode: SettlementMode;
  board_lot_size: number;
};

export type JourneyPlan = {
  ly_do_doi_thuong?: string | null;
  lyDo?: 'ky_thuat' | 'dong_tien' | 'noi_bo' | 'tin_tuc' | 'dinh_gia' | null;
  trangThai_luc_dat?: 'ung_ho' | 'trung_tinh' | 'can_chu_y' | 'nguoc_chieu' | null;
  vung_mua?: number | null;
  co_bam_doc_chi_tiet?: boolean;
  snapshot?: Record<string, unknown> | null;
  phuong_phap_sl_tp?: 'ho_tro_khang_cu' | 'bien_do_dao_dong' | null;
  cat_lo?: number | null;
  chot_loi?: number | null;
  nhoi_lenh_alert_id?: string | null;
  khau_vi?: 'than_trong' | 'can_bang' | 'tan_cong' | null;
  muc_tu_tin?: 1 | 2 | 3 | null;
  cach_khoi_luong?: 'khau_vi_tu_tin' | 'chia_deu' | 'linh_hoat' | 'ky_luat' | null;
  doc_5_lop?: Record<string, 'ok' | 'neu' | 'bad'> | null;
  conflict_level?: 'nhe' | 'ngai' | 'nghiem' | 'chua_ro' | null;
};

export type PersistJourneyPlanInput = {
  tx: SqlClient;
  userId: string;
  orderId: string;
  symbol: string;
  quantity: number;
  referencePriceVnd: Money;
  level: number;
  plan: JourneyPlan;
};

export type JourneyPlanResult = {
  savedLevels: number[];
  nhoiLenhAlertLinked: boolean;
};

export type PlaceOrderInput = {
  userId: string;
  isPremium: boolean;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  limitPriceVnd?: number | null;
  journeyPlan?: JourneyPlan | null;
};

export type PlaceOrderResult = {
  order: TradingOrder;
  journeyPlanSavedLevels: number[];
  nhoiLenhAlertLinked: boolean;
};
