import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import { MarketInputSnapshotService } from '../market-integration/market-input-snapshot.service.js';
import { buildCalendarBlock } from './market-calendar.js';
import { isReportSnapshotTime } from './report-snapshot-window.js';
import type {
  JsonObject,
  MarketReportInputPort,
  MarketReportPayload,
  ReportType,
} from './reports.types.js';

const MAX_AGE_MS: Record<ReportType, number> = {
  daily: 36 * 60 * 60 * 1000,
  midday: 4 * 60 * 60 * 1000,
  premarket: 12 * 60 * 60 * 1000,
};

function parseObject(value: unknown): JsonObject {
  const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('snapshot payload must be an object');
  return parsed as JsonObject;
}

/**
 * Persistence boundary for the market-core/extended/financial/quant aggregator.
 * Those services publish their normalized result to market_report_input_snapshots;
 * generation only consumes complete, recent snapshots and never fabricates data.
 */
@Injectable()
export class SqlMarketReportInputService implements MarketReportInputPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly snapshots: MarketInputSnapshotService,
  ) {}

  async buildPayload(type: ReportType, sessionDate: string): Promise<MarketReportPayload> {
    const rows = await this.database.query<{
      payload: unknown;
      captured_at: unknown;
      quality: unknown;
    }>(
      `select payload, captured_at, quality from market_report_input_snapshots
       where report_type=$1 and session_date=$2 and complete=true
       order by captured_at desc limit 1`,
      [type, sessionDate],
    );
    let row = rows[0];
    if (
      !row ||
      !isReportSnapshotTime(type, sessionDate, new Date(String(row.captured_at))) ||
      Date.now() - new Date(String(row.captured_at)).getTime() > MAX_AGE_MS[type]
    ) {
      const snapshot = await this.snapshots.capture(type, sessionDate);
      if (snapshot.complete)
        row = {
          payload: snapshot.payload,
          captured_at: snapshot.capturedAt,
          quality: snapshot.quality,
        };
    }
    if (!row)
      throw new ServiceUnavailableException({
        code: 'REPORT_INPUT_MISSING',
        message: 'Chưa có snapshot dữ liệu hoàn chỉnh cho báo cáo',
      });
    const capturedAt = new Date(String(row.captured_at));
    if (
      !Number.isFinite(capturedAt.getTime()) ||
      !isReportSnapshotTime(type, sessionDate, capturedAt) ||
      Date.now() - capturedAt.getTime() > MAX_AGE_MS[type]
    ) {
      throw new ServiceUnavailableException({
        code: 'REPORT_INPUT_STALE',
        message: 'Snapshot dữ liệu đã quá hạn',
      });
    }
    const payload = parseObject(row.payload);
    const quality = parseObject(row.quality);
    return {
      ...payload,
      calendar_hardcoded: buildCalendarBlock(sessionDate) as JsonObject,
      data_quality: quality,
      meta: {
        ...(payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
          ? payload.meta
          : {}),
        report_type: type,
        generated_for_date: sessionDate,
        generated_at: new Date().toISOString(),
        snapshot_captured_at: capturedAt.toISOString(),
      },
    } as MarketReportPayload;
  }
}
