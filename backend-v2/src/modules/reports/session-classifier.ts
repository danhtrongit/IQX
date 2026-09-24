import { isFuturesExpiryDate } from './market-calendar.js';
import type { JsonObject } from './reports.types.js';

function object(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}
function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function classifySession(payload: JsonObject): string {
  const vnindex = object(payload.vnindex);
  const breadth = object(payload.breadth);
  const contribution = object(object(payload.point_contribution).concentration);
  const foreign = object(payload.foreign_flow);
  const volume = object(payload.volume);
  const idxChange = number(vnindex.change_pct);
  const ratio = number(breadth.advances) / Math.max(number(breadth.declines, 1), 1);
  const top3Pct = number(contribution.top3_pct);
  const foreignNet = number(foreign.net_value_vnd_billion);
  const sessionDate = String(object(payload.meta).generated_for_date ?? '');

  if (
    (sessionDate && isFuturesExpiryDate(sessionDate)) ||
    (number(vnindex.intraday_range_pct) > 1.5 &&
      Math.abs(number(vnindex.last_30min_change_pct)) > 0.7)
  ) {
    return 'derivatives_anomaly';
  }
  if (idxChange < -2 && ratio < 0.3 && foreignNet < -500) return 'broad_selloff';
  const hiddenSignals =
    Number(foreignNet < -500) + Number(ratio < 0.6) + Number(number(foreign.streak_count) >= 3);
  if (Math.abs(idxChange) < 0.5 && hiddenSignals >= 2) return 'hidden_distribution';
  if (idxChange > 1 && ratio > 3 && top3Pct < 50) return 'broad_rally';
  if (idxChange > 0.5 && top3Pct > 50 && ratio < 1.5) return 'narrow_rally';
  const volumeRatio = typeof volume.ratio_vs_ma20 === 'number' ? volume.ratio_vs_ma20 : null;
  if (Math.abs(idxChange) < 0.3 && volumeRatio !== null && volumeRatio < 0.7)
    return 'low_volatility';
  return idxChange > 0 ? 'narrow_rally' : 'low_volatility';
}
