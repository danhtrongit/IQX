import type { ReportType } from './reports.types.js';

/** Live aggregates cannot be backdated into an earlier trading session. */
export function isReportSnapshotTime(type: ReportType, date: string, capturedAt: Date): boolean {
  if (!Number.isFinite(capturedAt.getTime())) return false;
  const at = capturedAt.getTime();
  const time = (clock: string) => new Date(`${date}T${clock}+07:00`).getTime();
  if (type === 'daily') return at >= time('15:15:00');
  if (type === 'midday') return at >= time('11:30:00') && at < time('13:00:00');
  return at >= time('00:00:00') && at < time('09:00:00');
}
