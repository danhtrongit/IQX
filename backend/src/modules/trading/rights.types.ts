export type VnDate = string;

export type ActionKind = 'cash_dividend' | 'stock_dividend' | 'listing';

export type ActionEventCode = 'DIV' | 'ISS' | 'AIS';

export type ActionStage =
  | 'announced'
  | 'ex_date_pending'
  | 'ex_applied'
  | 'paid'
  | 'credited'
  | 'skipped_pre_deploy'
  | 'review_required'
  | 'listing';

export type NormalizedAction = {
  sourceEventId: string;
  symbol: string;
  eventCode: ActionEventCode;
  kind: ActionKind;
  eventTitleEn: string;
  announcedDate: VnDate | null;
  exrightDate: VnDate | null;
  recordDate: VnDate | null;
  payoutDate: VnDate | null;
  issueDate: VnDate | null;
  cashPerShareVnd: bigint | null;
  stockRatio: string | null;
  latestPayload: Record<string, unknown>;
};

export type ClassifyResult = { action: NormalizedAction } | { ignored: string };

export type ReplayTrade = {
  side: 'buy' | 'sell';
  quantity: number;
  sessionDate: VnDate;
  tradedAt: Date;
};

export type PriorStockEntitlement = {
  effectiveExDate: VnDate;
  shareQuantity: number;
};

export type EligibleQuantityResult = {
  quantity: number;
  negative: boolean;
};

export type CashTerms = { kind: 'cash_dividend'; cashPerShareVnd: bigint };
export type StockTerms = { kind: 'stock_dividend'; stockRatio: string };
export type RightsTerms = CashTerms | StockTerms;

export type RightsAdjustment = {
  newAvgVnd: bigint;
  cashVnd: bigint;
  shares: number;
};

export type RightsTransition =
  { type: 'apply_ex' } | { type: 'pay_cash' } | { type: 'credit_stock' };

export type CorporateActionDisposition = 'processable' | 'skipped_pre_deploy' | 'review_required';

export type EntitlementStatus =
  'no_entitlement' | 'pending_cash' | 'pending_stock' | 'paid' | 'credited' | 'cancelled_reset';

export type CorporateActionRow = {
  id: string;
  source: string;
  source_event_id: string;
  symbol: string;
  event_code: ActionEventCode;
  kind: ActionKind;
  event_title_en: string;
  announced_date: string | null;
  exright_date: string | null;
  record_date: string | null;
  payout_date: string | null;
  issue_date: string | null;
  cash_per_share_vnd: bigint | null;
  stock_ratio: string | null;
  credit_date: string | null;
  credit_action_id: string | null;
  disposition: CorporateActionDisposition;
  review_reason: string | null;
  financial_frozen_at: Date | null;
  latest_payload: Record<string, unknown>;
  first_seen_at: Date;
  last_seen_at: Date;
};

export type EntitlementRow = {
  id: string;
  account_id: string;
  corporate_action_id: string;
  account_epoch_at: Date;
  kind: 'cash_dividend' | 'stock_dividend';
  effective_ex_date: string;
  eligibility_date: string;
  eligible_quantity: number;
  cash_amount_vnd: bigint;
  share_quantity: number;
  avg_before_ex_vnd: bigint;
  avg_after_ex_vnd: bigint;
  status: EntitlementStatus;
  applied_at: Date;
  fulfilled_at: Date | null;
};
