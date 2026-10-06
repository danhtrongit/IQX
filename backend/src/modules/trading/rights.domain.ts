import { isTradingDay } from './trading.calendar.js';
import type {
  ActionStage,
  ClassifyResult,
  CorporateActionRow,
  EligibleQuantityResult,
  EntitlementRow,
  PriorStockEntitlement,
  ReplayTrade,
  RightsAdjustment,
  RightsTerms,
  RightsTransition,
  StockTerms,
  VnDate,
} from './rights.types.js';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RATIO_SCALE = 10_000_000_000n;
const RATIO_SCALE_DIGITS = 10;

const PURCHASE_RIGHT_MARKERS = [
  'rights issue',
  'rights offering',
  'subscription right',
  'purchase right',
  'preferential subscription',
] as const;

export class RightsNegativeCostError extends Error {
  readonly liveQuantity: number;
  readonly eligibleQuantity: number;
  readonly liveAvgVnd: bigint;
  readonly newAvgVnd: bigint;

  constructor(detail: {
    liveQuantity: number;
    eligibleQuantity: number;
    liveAvgVnd: bigint;
    newAvgVnd: bigint;
  }) {
    super(
      `Rights adjustment produced a negative average cost (${detail.newAvgVnd} VND from ${detail.liveAvgVnd} VND)`,
    );
    this.name = 'RightsNegativeCostError';
    this.liveQuantity = detail.liveQuantity;
    this.eligibleQuantity = detail.eligibleQuantity;
    this.liveAvgVnd = detail.liveAvgVnd;
    this.newAvgVnd = detail.newAvgVnd;
  }
}

export function vnDate(now: Date): VnDate {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('roundHalfUp denominator must be positive');
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = (2n * magnitude + denominator) / (2n * denominator);
  return sign * rounded;
}

function decimalText(value: unknown): string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'string') {
    const text = value.trim();
    return text === '' ? null : text;
  }
  return null;
}

function parsePositiveDecimalText(value: unknown): { intPart: string; fracPart: string } | null {
  const text = decimalText(value);
  if (text === null) return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const intPart = match[1] ?? '0';
  const fracPart = match[2] ?? '';
  if (BigInt(intPart + fracPart) <= 0n) return null;
  return { intPart, fracPart };
}

export function parseRatio(value: unknown): string | null {
  const parts = parsePositiveDecimalText(value);
  if (parts === null) return null;
  if (parts.fracPart.length > RATIO_SCALE_DIGITS) return null;
  const normalizedInt = parts.intPart.replace(/^0+(?=\d)/, '');
  const normalizedFrac = parts.fracPart.replace(/0+$/, '');
  return normalizedFrac === '' ? normalizedInt : `${normalizedInt}.${normalizedFrac}`;
}

function cashPerShareHalfUp(value: unknown): bigint | null {
  const parts = parsePositiveDecimalText(value);
  if (parts === null) return null;
  const numerator = BigInt(parts.intPart + parts.fracPart);
  const denominator = 10n ** BigInt(parts.fracPart.length);
  return roundHalfUp(numerator, denominator);
}

function ratioToScaled(ratio: string): bigint {
  const [intPart = '0', fracPart = ''] = ratio.split('.');
  const digits = BigInt(intPart + fracPart);
  return digits * 10n ** BigInt(RATIO_SCALE_DIGITS - fracPart.length);
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

type DateRead = { ok: true; value: VnDate | null } | { ok: false };

function readDate(value: unknown): DateRead {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const candidate = value.slice(0, 10);
  if (!DATE_PATTERN.test(candidate)) return { ok: false };
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate) {
    return { ok: false };
  }
  return { ok: true, value: candidate };
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\u2010-\u2015-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseStockTitle(title: string): 'stock_dividend' | 'purchase_right' | 'unknown' {
  const normalized = normalizeTitle(title);
  for (const marker of PURCHASE_RIGHT_MARKERS) {
    if (normalized.includes(marker)) return 'purchase_right';
  }
  if (normalized.includes('stock dividend') || normalized.includes('bonus')) {
    return 'stock_dividend';
  }
  return 'unknown';
}

export function classifyVciEvent(raw: unknown): ClassifyResult {
  const record = asRecord(raw);
  if (record === null) return { ignored: 'not_an_object' };

  const sourceEventId = nonEmptyString(record['id']);
  const symbol = nonEmptyString(record['ticker']);
  const eventCode = nonEmptyString(record['event_code']);
  if (sourceEventId === null) return { ignored: 'missing_source_event_id' };
  if (symbol === null) return { ignored: 'missing_ticker' };
  if (eventCode === null) return { ignored: 'missing_event_code' };

  const announced = readDate(record['public_date']);
  const exright = readDate(record['exright_date']);
  const recordDate = readDate(record['record_date']);
  const payout = readDate(record['payout_date']);
  const issue = readDate(record['issue_date']);
  if (!announced.ok || !exright.ok || !recordDate.ok || !payout.ok || !issue.ok) {
    return { ignored: 'invalid_date' };
  }

  const eventTitleEn = nonEmptyString(record['event_title_en']) ?? '';
  const base = {
    sourceEventId,
    symbol: symbol.toUpperCase(),
    eventTitleEn,
    announcedDate: announced.value,
    exrightDate: exright.value,
    recordDate: recordDate.value,
    payoutDate: payout.value,
    issueDate: issue.value,
    latestPayload: record,
  };

  if (eventCode === 'DIV') {
    const cashPerShareVnd = cashPerShareHalfUp(record['value_per_share']);
    if (cashPerShareVnd === null) return { ignored: 'missing_or_invalid_value_per_share' };
    return {
      action: {
        ...base,
        eventCode: 'DIV',
        kind: 'cash_dividend',
        cashPerShareVnd,
        stockRatio: null,
      },
    };
  }

  if (eventCode === 'ISS') {
    const titleKind = parseStockTitle(eventTitleEn);
    if (titleKind === 'purchase_right') return { ignored: 'purchase_right_not_a_dividend' };
    if (titleKind === 'unknown') return { ignored: 'unrecognized_iss_title' };
    const stockRatio = parseRatio(record['exercise_ratio']);
    if (stockRatio === null) return { ignored: 'missing_or_invalid_exercise_ratio' };
    return {
      action: {
        ...base,
        eventCode: 'ISS',
        kind: 'stock_dividend',
        cashPerShareVnd: null,
        stockRatio,
      },
    };
  }

  if (eventCode === 'AIS') {
    if (base.issueDate === null) return { ignored: 'missing_issue_date' };
    return {
      action: {
        ...base,
        eventCode: 'AIS',
        kind: 'listing',
        cashPerShareVnd: null,
        stockRatio: null,
      },
    };
  }

  return { ignored: 'unsupported_event_code' };
}

export function deriveActionStage(action: CorporateActionRow, asOf: VnDate): ActionStage {
  if (action.kind === 'listing') return 'listing';
  if (action.disposition === 'skipped_pre_deploy') return 'skipped_pre_deploy';
  if (action.disposition === 'review_required') return 'review_required';
  if (action.exright_date === null) return 'announced';
  if (asOf < action.exright_date) return 'ex_date_pending';
  if (action.kind === 'cash_dividend') {
    if (action.payout_date !== null && asOf >= action.payout_date) return 'paid';
  } else if (action.credit_date !== null && asOf >= action.credit_date) {
    return 'credited';
  }
  return 'ex_applied';
}

export function previousTradingDate(date: VnDate, holidays: ReadonlySet<string>): VnDate {
  const cursor = new Date(`${date}T00:00:00.000Z`);
  for (;;) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const candidate = cursor.toISOString().slice(0, 10);
    if (isTradingDay(candidate, holidays)) return candidate;
  }
}

export function computeEligibleQuantity(input: {
  trades: readonly ReplayTrade[];
  priorStockEntitlements: readonly PriorStockEntitlement[];
  eligibilityDate: VnDate;
  accountEpochAt: Date;
}): EligibleQuantityResult {
  const epochMs = input.accountEpochAt.getTime();
  let net = 0;
  for (const trade of input.trades) {
    if (trade.sessionDate > input.eligibilityDate) continue;
    if (trade.tradedAt.getTime() < epochMs) continue;
    net += trade.side === 'buy' ? trade.quantity : -trade.quantity;
  }
  for (const prior of input.priorStockEntitlements) {
    if (prior.effectiveExDate <= input.eligibilityDate) net += prior.shareQuantity;
  }
  const negative = net < 0;
  return { quantity: negative ? 0 : net, negative };
}

export function computeRightsAdjustment(input: {
  eligibleQuantity: number;
  liveQuantity: number;
  liveAvgVnd: bigint;
  terms: RightsTerms;
}): RightsAdjustment {
  const eligible = BigInt(input.eligibleQuantity);
  if (input.terms.kind === 'cash_dividend') {
    const cashVnd = eligible * input.terms.cashPerShareVnd;
    let newAvgVnd: bigint;
    if (input.liveQuantity === 0) {
      newAvgVnd = input.liveAvgVnd;
    } else {
      const liveQty = BigInt(input.liveQuantity);
      newAvgVnd = roundHalfUp(
        input.liveAvgVnd * liveQty - input.terms.cashPerShareVnd * eligible,
        liveQty,
      );
    }
    if (newAvgVnd < 0n) {
      throw new RightsNegativeCostError({
        liveQuantity: input.liveQuantity,
        eligibleQuantity: input.eligibleQuantity,
        liveAvgVnd: input.liveAvgVnd,
        newAvgVnd,
      });
    }
    return { newAvgVnd, cashVnd, shares: 0 };
  }

  const terms: StockTerms = input.terms;
  const ratio = parseRatio(terms.stockRatio);
  if (ratio === null) throw new Error(`Invalid stock ratio: ${terms.stockRatio}`);
  const scaledRatio = ratioToScaled(ratio);
  const sharesBig = (eligible * scaledRatio) / RATIO_SCALE;
  const shares = Number(sharesBig);
  let newAvgVnd: bigint;
  if (input.liveQuantity === 0) {
    newAvgVnd = roundHalfUp(input.liveAvgVnd * RATIO_SCALE, RATIO_SCALE + scaledRatio);
  } else {
    newAvgVnd = roundHalfUp(
      input.liveAvgVnd * BigInt(input.liveQuantity),
      BigInt(input.liveQuantity) + sharesBig,
    );
  }
  if (newAvgVnd < 0n) {
    throw new RightsNegativeCostError({
      liveQuantity: input.liveQuantity,
      eligibleQuantity: input.eligibleQuantity,
      liveAvgVnd: input.liveAvgVnd,
      newAvgVnd,
    });
  }
  return { newAvgVnd, cashVnd: 0n, shares };
}

export function determineDueTransitions(
  action: CorporateActionRow,
  entitlement: EntitlementRow | null,
  asOf: VnDate,
): readonly RightsTransition[] {
  const transitions: RightsTransition[] = [];
  if (
    entitlement === null &&
    action.disposition === 'processable' &&
    action.kind !== 'listing' &&
    action.exright_date !== null &&
    action.exright_date <= asOf
  ) {
    transitions.push({ type: 'apply_ex' });
  }
  if (
    entitlement?.status === 'pending_cash' &&
    action.payout_date !== null &&
    action.payout_date <= asOf
  ) {
    transitions.push({ type: 'pay_cash' });
  }
  if (
    entitlement?.status === 'pending_stock' &&
    action.credit_date !== null &&
    action.credit_date <= asOf
  ) {
    transitions.push({ type: 'credit_stock' });
  }
  return transitions;
}
