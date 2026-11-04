import type { ScreenerRow } from './screener.schemas.js';

/**
 * Server-side sorting of a stored result (Bộ lọc 4.0 §4.3): the whole result is ordered before it is
 * cut into pages. A blank or non-`ok` cell is always last whatever the direction; ties are broken by
 * Mã A→Z, so the order is total and the same for every page of the same `result_id`.
 *
 * Sort keys:
 *  - text:    `symbol`, `name`, `exchange`, `group` (Ngành = statement group);
 *  - numbers: `price`, `change_pct`, `market_cap`, `avg_value`;
 *  - `metric:<metric_id>`: a fundamental cell (condition or reference column), `ok` values only;
 *  - `tech:<key>`: a technical cell by its server-computed sort value (e.g. `tech:rsi.level`).
 */
export const SCREENER_SORT_KEY_PATTERN =
  /^(?:symbol|name|exchange|group|price|change_pct|market_cap|avg_value|metric:[a-z][a-z0-9_]*|tech:[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?)$/;

export type SortOrder = 'asc' | 'desc';

const TEXT_KEYS = new Set(['symbol', 'name', 'exchange', 'group']);

/** Display order of the groups (Ngành column): Thường, Ngân hàng, Chứng khoán, Bảo hiểm. */
const GROUP_RANK: Readonly<Record<string, number>> = { thuong: 0, nh: 1, ck: 2, bh: 3 };

type SortValue = number | string | null;

function valueOf(row: ScreenerRow, key: string): SortValue {
  switch (key) {
    case 'symbol':
      return row.symbol;
    case 'name':
      return row.name;
    case 'exchange':
      return row.exchange;
    case 'group':
      return row.group === null || row.group === undefined ? null : (GROUP_RANK[row.group] ?? null);
    case 'price':
    case 'change_pct':
    case 'market_cap':
    case 'avg_value':
      return row.market?.[key] ?? null;
    default:
  }
  if (key.startsWith('metric:')) {
    const cell = row.metrics[key.slice('metric:'.length)];
    return cell && cell.status === 'ok' ? cell.value : null;
  }
  if (key.startsWith('tech:')) {
    const cell = row.technical?.[key.slice('tech:'.length)];
    return cell && cell.status === 'ok' ? cell.sort_value : null;
  }
  return null;
}

const compareSymbol = (a: ScreenerRow, b: ScreenerRow): number =>
  a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;

/** A new array ordered by `key`/`order`; the input is not modified. Unknown keys fall back to Mã A→Z. */
export function sortRows(
  rows: readonly ScreenerRow[],
  key: string | undefined,
  order: SortOrder = 'asc',
): ScreenerRow[] {
  const sortKey = key && SCREENER_SORT_KEY_PATTERN.test(key) ? key : 'symbol';
  const direction = order === 'desc' ? -1 : 1;
  const text = TEXT_KEYS.has(sortKey) && sortKey !== 'group';
  return rows
    .map((row) => ({ row, value: valueOf(row, sortKey) }))
    .sort((a, b) => {
      const aBlank = a.value === null || a.value === undefined || (typeof a.value === 'number' && !Number.isFinite(a.value));
      const bBlank = b.value === null || b.value === undefined || (typeof b.value === 'number' && !Number.isFinite(b.value));
      if (aBlank !== bBlank) return aBlank ? 1 : -1;
      if (!aBlank) {
        let diff = 0;
        if (text) diff = String(a.value).localeCompare(String(b.value), 'vi');
        else diff = (a.value as number) - (b.value as number);
        if (diff !== 0) return diff * direction;
      }
      return compareSymbol(a.row, b.row);
    })
    .map((entry) => entry.row);
}
