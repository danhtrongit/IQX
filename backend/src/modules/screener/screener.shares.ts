/**
 * Lịch sử số cổ phiếu và EPS điều chỉnh (Dashboard spec §10, cập nhật 22-10 DB-01/DB-03). Pure.
 *
 * Nguồn:
 *  - Số cổ phiếu lưu hành cuối mỗi quý = vốn góp của chủ sở hữu (VCI `bsa80`, đồng) / mệnh giá
 *    10.000 đồng. Cổ phiếu quỹ không được trừ (VCI không tách dòng này trên BCTC).
 *  - Sự kiện chia tách/thưởng/cổ tức bằng cổ phiếu: VCI `/v1/events` mã `ISS` — cùng nguồn đang
 *    dùng cho cổ tức của Demo trading (`trading/rights.domain.ts`). Quyền mua, ESOP, phát hành
 *    riêng lẻ và hoán đổi là phát hành thật (có tiền/tài sản vào) nên KHÔNG điều chỉnh hồi tố.
 *
 * Điều chỉnh hồi tố: số cổ phiếu cuối quý t nhân (1 + tỷ lệ) của mọi sự kiện chưa phản ánh trong
 * vốn góp cuối quý t, nên mọi kỳ cùng gốc với ngày hôm nay (gốc của giá đã điều chỉnh). Một sự
 * kiện chưa phản ánh khi cuối quý trước ngày giao dịch không hưởng quyền, hoặc ở quý đầu tiên sau
 * ngày đó mà vốn góp chưa tăng (cổ phiếu mới thường được ghi nhận vốn vài tuần sau ngày GDKHQ).
 *
 * EPS quý = LNST quý của cổ đông công ty mẹ / số cổ phiếu bình quân đã điều chỉnh (bình quân đầu
 * quý và cuối quý). EPS 4 quý và EPS năm là tổng EPS các quý, nên luôn cùng một gốc.
 */
import { finite } from '../financials/financials.calculations.js';
import { parseStockTitle } from '../trading/rights.domain.js';
import type { NormalizedStatements, StatementPeriod } from './screener.statements.js';

/** Mệnh giá cổ phiếu niêm yết tại Việt Nam (đồng). */
export const PAR_VALUE_VND = 10_000;

/** Một sự kiện làm tăng số cổ phiếu mà không có tiền vào (chia tách, thưởng, cổ tức cổ phiếu). */
export interface ShareEvent {
  /** Ngày giao dịch không hưởng quyền (YYYY-MM-DD). */
  ex_date: string;
  /** Số cổ phiếu mới trên một cổ phiếu cũ (0,15 = thưởng 15%). */
  ratio: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}/;

const VN_OFFSET_MS = 7 * 3_600_000;

/** Ngày lịch Việt Nam của một thời điểm. */
export function vnDay(instant: Date): string {
  return new Date(instant.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Sự kiện điều chỉnh từ các dòng VCI `/v1/events` (snake_case). Chỉ lấy `ISS` là chia tách/thưởng/
 * cổ tức bằng cổ phiếu, có ngày GDKHQ không sau `asOf` và tỷ lệ dương; bỏ dòng trùng (VCI có khi
 * trả hai dòng giống hệt nhau cho một đợt).
 */
export function shareEventsFromVci(
  rows: readonly Record<string, unknown>[],
  asOf: Date,
): ShareEvent[] {
  const cutoff = vnDay(asOf);
  const seen = new Set<string>();
  const events: ShareEvent[] = [];
  for (const row of rows) {
    if (row.event_code !== 'ISS') continue;
    const exDate =
      typeof row.exright_date === 'string' && DATE.test(row.exright_date)
        ? row.exright_date.slice(0, 10)
        : null;
    if (exDate === null || exDate > cutoff) continue;
    const title = typeof row.event_title_en === 'string' ? row.event_title_en : '';
    if (parseStockTitle(title) !== 'stock_dividend') continue;
    const ratio = finite(row.exercise_ratio);
    if (ratio === undefined || !(ratio > 0)) continue;
    const key = `${exDate}:${ratio}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({ ex_date: exDate, ratio });
  }
  return events.sort((a, b) => a.ex_date.localeCompare(b.ex_date) || a.ratio - b.ratio);
}

/** Ngày kết thúc của một quý (YYYY-MM-DD) hoặc của năm tài chính (quý null). */
export function periodEnd(period: Pick<StatementPeriod, 'year' | 'quarter'>): string {
  const month = (period.quarter ?? 4) * 3;
  const last = new Date(Date.UTC(period.year, month, 0)).getUTCDate();
  return `${period.year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

const ordinal = (p: StatementPeriod) => p.year * 4 + (p.quarter ?? 1) - 1;

/** Số cổ phiếu thô cuối kỳ từ vốn góp (null khi BCTC không có dòng vốn góp). */
export function rawShares(period: StatementPeriod): number | null {
  const capital = period.values.charter_capital;
  return capital !== undefined && capital > 0 ? capital / PAR_VALUE_VND : null;
}

/**
 * Số cổ phiếu cuối quý đã điều chỉnh về gốc hiện tại, theo thứ tự `quarters` (mới nhất trước).
 * Null ở quý không có vốn góp.
 */
export function adjustedQuarterShares(
  quarters: readonly StatementPeriod[],
  events: readonly ShareEvent[],
): (number | null)[] {
  const byOrdinal = new Map(quarters.map((q) => [ordinal(q), q] as const));
  const ends = quarters.map((q) => periodEnd(q));
  // First quarter end on or after each ex-date (the quarter where registration may still lag).
  const firstAfter = events.map((event) => {
    const after = quarters.filter((_, index) => ends[index]! >= event.ex_date).map(ordinal);
    return after.length ? Math.min(...after) : null;
  });
  return quarters.map((quarter, index) => {
    const raw = rawShares(quarter);
    if (raw === null) return null;
    let factor = 1;
    events.forEach((event, e) => {
      if (ends[index]! < event.ex_date) {
        factor *= 1 + event.ratio;
        return;
      }
      if (firstAfter[e] !== ordinal(quarter)) return;
      const previous = byOrdinal.get(ordinal(quarter) - 1);
      const before = previous ? rawShares(previous) : null;
      // Charter capital not raised yet at this quarter end: the new shares are still pending.
      if (before !== null && raw < before * (1 + event.ratio / 2)) factor *= 1 + event.ratio;
    });
    return raw * factor;
  });
}

/**
 * Thêm `shares` (số cổ phiếu cuối kỳ đã điều chỉnh) và `eps` (EPS điều chỉnh, đồng/CP) vào các kỳ.
 * `events = null` nghĩa là không lấy được lịch sử sự kiện: không dựng EPS (chỉ tiêu EPS trả thiếu
 * dữ liệu, không ghép hai EPS khác gốc).
 */
export function withShareHistory(
  statements: NormalizedStatements,
  events: readonly ShareEvent[] | null,
): NormalizedStatements {
  if (events === null) return statements;
  const adjusted = adjustedQuarterShares(statements.quarters, events);
  const sharesByOrdinal = new Map<number, number>();
  statements.quarters.forEach((q, index) => {
    const shares = adjusted[index];
    if (shares !== null && shares !== undefined) sharesByOrdinal.set(ordinal(q), shares);
  });
  const quarters = statements.quarters.map((q) => {
    const values = { ...q.values };
    const end = sharesByOrdinal.get(ordinal(q));
    if (end !== undefined) {
      values.shares = end;
      const start = sharesByOrdinal.get(ordinal(q) - 1);
      const average = start === undefined ? end : (start + end) / 2;
      if (q.values.npat_parent !== undefined) values.eps = q.values.npat_parent / average;
    }
    return { ...q, values };
  });
  const quarterOf = new Map(quarters.map((q) => [ordinal(q), q] as const));
  const years = statements.years.map((year) => {
    const values = { ...year.values };
    const rows = [1, 2, 3, 4].map((quarter) => quarterOf.get(year.year * 4 + quarter - 1));
    const q4Shares = rows[3]?.values.shares;
    if (q4Shares !== undefined) values.shares = q4Shares;
    if (rows.every((row) => row?.values.eps !== undefined))
      values.eps = rows.reduce((total, row) => total + row!.values.eps!, 0);
    return { ...year, values };
  });
  return { ...statements, quarters, years };
}

/**
 * Số cổ phiếu đã điều chỉnh tại một ngày: số cuối quý gần nhất không sau ngày đó (null khi
 * chưa có quý nào). `quarters` mới nhất trước, như `NormalizedStatements`.
 */
export function sharesAt(quarters: readonly StatementPeriod[], date: string): number | null {
  for (const quarter of quarters) {
    if (periodEnd(quarter) > date) continue;
    const shares = quarter.values.shares;
    if (shares !== undefined) return shares;
  }
  return null;
}
