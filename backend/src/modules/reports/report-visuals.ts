import type { JsonObject, ReportType } from './reports.types.js';

type Visuals = { charts: JsonObject | null; pulse: JsonObject | null };

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function rows(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is JsonObject => Boolean(row) && typeof row === 'object' && !Array.isArray(row),
      )
    : [];
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function ratioLabel(up: number, down: number): string {
  if (up === 0 || down === 0) return `${up} : ${down}`;
  const ratio = up / Math.max(down, 1);
  return ratio < 1 ? `1 : ${round(1 / ratio, 1)}` : `${round(ratio, 1)} : 1`;
}

function breadthClassification(up: number, down: number): string {
  const ratio = up / Math.max(down, 1);
  if (ratio < 0.5) return 'Phân hóa tiêu cực';
  if (ratio < 0.8) return 'Nghiêng giảm';
  if (ratio <= 1.25) return 'Cân bằng';
  if (ratio <= 2) return 'Nghiêng tăng';
  return 'Tích cực';
}

function normalizedBreadth(payload: JsonObject): JsonObject | null {
  const source = object(payload.breadth);
  const up = number(source.advances ?? source.up);
  const down = number(source.declines ?? source.down);
  const flat = number(source.unchanged ?? source.flat);
  const ceiling = number(source.ceiling ?? source.ceiling_count);
  const floor = number(source.floor ?? source.floor_count);
  if ([up, down, flat, ceiling, floor].some((value) => value === null)) return null;
  return {
    ceiling,
    up,
    flat,
    down,
    floor,
    ratio_up_down: ratioLabel(up!, down!),
    classification: breadthClassification(up!, down!),
    // The upstream series is EMA20, not MA20. Never label it as MA20.
    pct_above_ma20: null,
  };
}

function normalizedContribution(payload: JsonObject): JsonObject | null {
  const source = object(payload.point_contribution ?? payload.am_contribution);
  if (!Object.keys(source).length) return null;
  const side = (value: unknown) =>
    rows(value)
      .map((row) => ({
        ticker:
          typeof (row.symbol ?? row.ticker) === 'string' ? String(row.symbol ?? row.ticker) : '',
        points: number(row.impact ?? row.points),
      }))
      .filter(
        (row): row is { ticker: string; points: number } =>
          Boolean(row.ticker) && row.points !== null,
      )
      .sort((left, right) => Math.abs(right.points) - Math.abs(left.points))
      .slice(0, 8);
  return {
    top_negative: side(source.top_down ?? source.top_negative),
    top_positive: side(source.top_up ?? source.top_positive),
  };
}

function dateValue(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(typeof value === 'number' ? value * 1000 : raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function rowDate(row: JsonObject): string | null {
  return dateValue(row.trading_date ?? row.date ?? row.time ?? row.timestamp ?? row.as_of);
}

function histories(payload: JsonObject, kind: 'foreign' | 'proprietary'): JsonObject[] {
  const source = object(payload.chart_sources);
  const legacy = object(payload.charts);
  const target = dateValue(object(payload.meta).generated_for_date);
  const ordered = rows(
    source[`${kind}_history`] ?? (kind === 'foreign' ? legacy.foreign : legacy.proprietary),
  )
    .map((row, index) => ({ row, index, date: rowDate(row) }))
    .filter((entry) => entry.date !== null && (!target || entry.date <= target))
    .sort((left, right) => left.date!.localeCompare(right.date!) || left.index - right.index);
  // Some range endpoints repeat a session. Keep the final normalized row for
  // that date so a duplicate cannot inflate streaks or chart length.
  return [...new Map(ordered.map((entry) => [entry.date!, entry.row])).values()];
}

function topRows(value: unknown, valueFields: string[], divisor: number): JsonObject[] {
  return rows(value)
    .map((row) => {
      const ticker = row.ticker ?? row.symbol;
      const raw =
        valueFields.map((field) => number(row[field])).find((item) => item !== null) ?? null;
      return {
        ticker: typeof ticker === 'string' ? ticker : '',
        value: raw === null ? null : round(raw / divisor),
      };
    })
    .filter(
      (row): row is { ticker: string; value: number } => Boolean(row.ticker) && row.value !== null,
    )
    .slice(0, 8);
}

function verifiedTop(
  source: JsonObject,
  key: 'top_buy' | 'top_sell',
  rawKey: 'net_buy' | 'net_sell' | 'buy' | 'sell',
): JsonObject[] {
  if (source.top_verified !== true) return [];
  const parentDate = rowDate(source);
  const candidate = source[key] ?? object(source.top)[rawKey];
  const items = rows(candidate);
  // Top endpoints are range-sensitive. Do not expose rows unless the parent
  // carries an exact session date (or every row does).
  if (!parentDate || items.some((row) => rowDate(row) !== null && rowDate(row) !== parentDate))
    return [];
  return items;
}

function foreignDetail(payload: JsonObject): JsonObject | null {
  const source = object(payload.foreign_flow ?? payload.am_foreign);
  if (!Object.keys(source).length) return null;
  const history = histories(payload, 'foreign');
  const datedNets = history.map((row) => {
    const buy = number(row.foreign_buy_value_vnd);
    const sell = number(row.foreign_sell_value_vnd);
    return { date: rowDate(row), value: buy === null || sell === null ? null : (buy - sell) / 1e9 };
  });
  const nets = datedNets.map((entry) => entry.value);
  const recentNets: number[] = [];
  for (const value of [...nets].reverse()) {
    if (value === null) break;
    recentNets.unshift(value);
  }
  const latest = datedNets.at(-1)?.value;
  let streakCount = 0;
  if (latest !== undefined && latest !== null && latest !== 0) {
    for (const entry of [...datedNets].reverse()) {
      if (entry.value === null || entry.value === 0 || entry.value > 0 !== latest > 0) break;
      streakCount += 1;
    }
  }
  return {
    total_buy_vnd_billion: number(source.buy_value_vnd_billion),
    total_sell_vnd_billion: number(source.sell_value_vnd_billion),
    streak: {
      count: streakCount,
      direction:
        latest === undefined || latest === null || latest === 0
          ? 'mixed'
          : latest > 0
            ? 'buy'
            : 'sell',
      last_5d_cumulative:
        recentNets.length >= 5
          ? round(
              recentNets.slice(-5).reduce((sum, value) => sum + value, 0),
              1,
            )
          : null,
    },
    last_12_sessions: recentNets.slice(-12).map((value) => round(value, 1)),
    top_sell: topRows(
      verifiedTop(source, 'top_sell', 'net_sell'),
      ['value_vnd_billion', 'net_value_vnd'],
      1e9,
    ),
    top_buy: topRows(
      verifiedTop(source, 'top_buy', 'net_buy'),
      ['value_vnd_billion', 'net_value_vnd'],
      1e9,
    ),
  };
}

function propDetail(payload: JsonObject): JsonObject | null {
  const source = object(payload.prop_trading ?? payload.am_prop);
  if (!Object.keys(source).length) return null;
  const nets = histories(payload, 'proprietary')
    .map((row) => {
      const buy = number(row.total_buy_value_vnd);
      const sell = number(row.total_sell_value_vnd);
      return buy === null || sell === null ? null : (buy - sell) / 1e9;
    })
    .filter((value): value is number => value !== null);
  return {
    total_buy_vnd_billion: number(source.buy_value_vnd_billion),
    total_sell_vnd_billion: number(source.sell_value_vnd_billion),
    net_vnd_billion: number(source.net_value_vnd_billion),
    last_12_sessions: nets.slice(-12).map((value) => round(value, 1)),
    top_buy: topRows(
      verifiedTop(source, 'top_buy', 'buy'),
      ['value_vnd_billion', 'total_value_vnd'],
      1e9,
    ),
    top_sell: topRows(
      verifiedTop(source, 'top_sell', 'sell'),
      ['value_vnd_billion', 'total_value_vnd'],
      1e9,
    ),
  };
}

function healthDetail(payload: JsonObject): JsonObject | null {
  const health = object(payload.market_health);
  const verifiedPercent = (row: JsonObject): number | null => {
    const count = number(row.count);
    const total = number(row.total);
    return count !== null && total !== null && count >= 0 && total > 0 && count <= total
      ? round((count / total) * 100, 1)
      : null;
  };
  const ema20 = rows(health.ema20)
    .map(verifiedPercent)
    .filter((value): value is number => value !== null);
  const ema50 = rows(health.ema50)
    .map(verifiedPercent)
    .filter((value): value is number => value !== null);
  if (!ema20.length && !ema50.length) return null;
  return {
    pct_above_ma20: null,
    pct_above_ma20_change: null,
    pct_above_ma50: null,
    pct_above_ma200: null,
    trend_20d: [],
    callout: null,
    indicator_basis: 'EMA',
    pct_above_ema20: ema20.at(-1) ?? null,
    pct_above_ema20_change: ema20.length >= 2 ? round(ema20.at(-1)! - ema20.at(-2)!, 1) : null,
    pct_above_ema50: ema50.at(-1) ?? null,
    trend_ema20_20d: ema20.slice(-20),
  };
}

function sectorRotation(payload: JsonObject): JsonObject | null {
  const sectors = rows(payload.sectors)
    .map((row) => {
      const name = row.name ?? (row.icb_code == null ? null : `ICB ${String(row.icb_code)}`);
      return {
        name: typeof name === 'string' ? name : '',
        pct: number(row.change_pct ?? row.icb_change_percent),
      };
    })
    .filter((row): row is { name: string; pct: number } => Boolean(row.name) && row.pct !== null)
    .sort((left, right) => right.pct - left.pct);
  return sectors.length ? { sectors_today: sectors } : null;
}

function withState(value: JsonObject | null, state: 'am_session' | 'unavailable'): JsonObject {
  return value ? { ...value, data_state: state } : { data_state: 'unavailable' };
}

/** Deterministic report visuals derived only from captured source data, never AI output. */
export function buildReportVisuals(payload: JsonObject, type: ReportType): Visuals {
  if (type === 'premarket') return { charts: null, pulse: null };
  const breadth = normalizedBreadth(payload);
  const contribution = normalizedContribution(payload);
  const foreign = foreignDetail(payload);
  const proprietary = propDetail(payload);
  const health = healthDetail(payload);
  const sectors = sectorRotation(payload);
  const charts =
    type === 'midday'
      ? {
          breadth: withState(breadth, 'am_session'),
          contribution: withState(contribution, 'am_session'),
          foreign_detail: withState(foreign, 'am_session'),
          prop_detail: withState(proprietary, 'am_session'),
          market_health_detail: { data_state: 'unavailable' },
          sector_rotation: { data_state: 'unavailable' },
        }
      : {
          breadth,
          contribution,
          foreign_detail: foreign,
          prop_detail: proprietary,
          market_health_detail: health,
          sector_rotation: sectors,
        };
  const vn = object(payload.vnindex);
  const volume = object(payload.volume);
  const pulse =
    type === 'midday'
      ? {
          vn_index: {
            value: number(vn.value ?? vn.close ?? vn.price),
            change: number(vn.change_points ?? vn.change),
            change_pct: number(vn.change_pct),
            sparkline: [],
          },
          breadth: {
            up: number(object(charts.breadth).up),
            down: number(object(charts.breadth).down),
          },
          foreign_net_billion: number(object(payload.foreign_flow).net_value_vnd_billion),
          liquidity: {
            am_value_billion: number(volume.total_value_vnd_billion),
            ma20_billion: number(volume.ma20_value_vnd_billion),
            vs_ma20_pct:
              number(volume.ratio_vs_ma20) === null
                ? null
                : round((number(volume.ratio_vs_ma20)! - 1) * 100),
          },
        }
      : null;
  return { charts, pulse };
}
