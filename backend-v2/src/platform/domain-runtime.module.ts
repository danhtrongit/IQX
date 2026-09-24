import { Injectable, Module, type DynamicModule } from '@nestjs/common';

import { AlertService, AlertsModule } from '../modules/alerts/index.js';
import { BillingModule, BillingService } from '../modules/billing/index.js';
import { BotService, BotsModule } from '../modules/bots/index.js';
import { Cap5Service } from '../modules/journey/cap5/index.js';
import { JourneyModule } from '../modules/journey/journey.module.js';
import {
  classifyEvidence,
  digest,
  MASCOT_RULES_VERSION,
  type EvidenceRecord,
} from '../modules/journey/identity/index.js';
import { MarketDataModule, MarketDataService } from '../modules/market-data/index.js';
import { MarketExtendedModule, MarketExtendedService } from '../modules/market-extended/index.js';
import {
  MarketInputSnapshotService,
  MarketIntegrationModule,
} from '../modules/market-integration/index.js';
import { ReportsModule, MarketReportsService } from '../modules/reports/index.js';
import {
  RuntimeModule,
  type JobOutcome,
  type RuntimeJobHandlers,
  type TradingCalendarPort,
} from '../modules/runtime/index.js';
import { DatabaseModule, DatabaseService } from './database/index.js';

const ictDate = (date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date);

type OhlcvRow = {
  time?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
  volume?: unknown;
};

@Injectable()
export class DomainRuntimeJobs implements TradingCalendarPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly reports: MarketReportsService,
    private readonly alerts: AlertService,
    private readonly market: MarketDataService,
    private readonly billing: BillingService,
    private readonly cap5: Cap5Service,
    private readonly bot: BotService,
    private readonly extended: MarketExtendedService,
    private readonly marketInput: MarketInputSnapshotService,
  ) {}

  handlers(): RuntimeJobHandlers {
    return {
      'reports.daily': async ({ scheduledFor }) =>
        this.generateReport('daily', ictDate(scheduledFor)),
      'reports.daily-retry': async ({ scheduledFor }) =>
        this.retryDailyReport(ictDate(scheduledFor)),
      'reports.midday': async ({ scheduledFor }) =>
        this.generateReport('midday', ictDate(scheduledFor)),
      'reports.premarket': async ({ scheduledFor }) =>
        this.generateReport('premarket', ictDate(scheduledFor)),
      'billing.expiry-sweep': async () => this.expirySweep(),
      'billing.ipn-reconcile': async () => this.ipnReconcile(),
      'alerts.scan': async () => this.scanAlerts(),
      'journey.cap2-close-scan': async ({ scheduledFor }) =>
        this.cap2CloseScan(ictDate(scheduledFor)),
      'journey.cap5-consensus': async () => this.cap5Consensus(),
      'journey.identity-recovery': async () => this.identityRecovery(),
      'bot.session-eod': async ({ scheduledFor }) =>
        this.complete(await this.bot.runScheduledSession(ictDate(scheduledFor))),
      'market.snapshot-wave-1': async ({ scheduledFor }) =>
        this.snapshotWave(1, ictDate(scheduledFor)),
      'market.snapshot-wave-2': async ({ scheduledFor }) =>
        this.snapshotWave(2, ictDate(scheduledFor)),
      'market.snapshot-wave-3': async ({ scheduledFor }) =>
        this.snapshotWave(3, ictDate(scheduledFor)),
    };
  }

  private async generateReport(
    type: 'daily' | 'midday' | 'premarket',
    sessionDate: string,
  ): Promise<JobOutcome> {
    const snapshot = await this.marketInput.capture(type, sessionDate);
    const report = await this.reports.generate(type, sessionDate);
    return this.complete({ snapshot, report });
  }

  private async retryDailyReport(sessionDate: string): Promise<JobOutcome> {
    const published = await this.database.query<{ published: boolean }>(
      `select exists(
         select 1 from analysis_history
          where report_type = 'daily' and session_date = $1
            and is_published = true and generation_status = 'published'
       ) as published`,
      [sessionDate],
    );
    if (published[0]?.published) {
      return { status: 'skipped', reason: 'report-already-published' };
    }
    return this.generateReport('daily', sessionDate);
  }

  async isTradingDay(date: string): Promise<boolean> {
    const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    if (day === 0 || day === 6) return false;
    const rows = await this.database.query<{ holidays: unknown }>(
      'select holidays from virtual_trading_configs where is_active = true order by updated_at desc limit 1',
    );
    const raw = rows[0]?.holidays;
    let holidays: unknown = raw;
    if (typeof raw === 'string') {
      try {
        holidays = JSON.parse(raw);
      } catch {
        throw new Error('Active trading calendar contains invalid holiday JSON');
      }
    }
    if (holidays !== undefined && !Array.isArray(holidays)) {
      throw new Error('Active trading calendar holidays must be an array');
    }
    return !(holidays as unknown[] | undefined)?.map(String).includes(date);
  }

  private complete(value: unknown): JobOutcome {
    return { status: 'completed', detail: this.detail(value) };
  }

  private detail(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { result: value };
  }

  private async expirySweep(): Promise<JobOutcome> {
    const result = await this.database.transaction(async (tx) => {
      const expired = await tx.query<{ user_id: string }>(
        `update premium_subscriptions set status = 'expired', updated_at = now()
         where status = 'active' and current_period_end <= now() returning user_id`,
      );
      await tx.query(
        `update billing_entitlement_grants set status = 'expired', updated_at = now()
         where status = 'active' and ends_at <= now()`,
      );
      const downgraded = await tx.query<{ id: string }>(
        `update users u set role = 'user', updated_at = now()
         where u.role = 'premium' and u.id = any($1::uuid[])
           and not exists (select 1 from billing_entitlement_grants g where g.user_id = u.id and g.status = 'active' and g.starts_at <= now() and g.ends_at > now())
         returning u.id`,
        [expired.map((row) => row.user_id)],
      );
      return { expired_count: expired.length, downgraded_count: downgraded.length };
    });
    return this.complete(result);
  }

  private async ipnReconcile(): Promise<JobOutcome> {
    const rows = await this.database.query<{ id: string; raw_body: unknown }>(
      `select distinct on (o.id) l.id, l.raw_body
       from premium_payment_orders o join sepay_ipn_logs l
         on l.secret_key_valid = true and l.raw_body is not null
        and (l.matched_order_id = o.id or l.raw_body #>> '{order,order_invoice_number}' = o.invoice_number)
       where o.status = 'pending' and o.created_at < now() - interval '30 minutes'
       order by o.id, l.received_at desc limit 100`,
    );
    let reconciled = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const result = await this.billing.processWebhook(row.raw_body, {
          'x-iqx-replay-source': 'runtime',
        });
        reconciled += Number(result.message === 'processed');
      } catch {
        failed += 1;
      }
    }
    const stale = await this.database.query<{ id: string }>(
      `update premium_payment_orders set status = 'failed', updated_at = now()
       where status = 'pending' and created_at < now() - interval '24 hours'
         and not exists (select 1 from sepay_ipn_logs l where l.secret_key_valid = true and (l.matched_order_id = premium_payment_orders.id or l.raw_body #>> '{order,order_invoice_number}' = premium_payment_orders.invoice_number))
       returning id`,
    );
    return this.complete({ attempted: rows.length, reconciled, failed, failed_old: stale.length });
  }

  private async scanAlerts(): Promise<JobOutcome> {
    const result = await this.alerts.scan(async (symbol) => {
      const response = await this.market.getOhlcv(symbol, { interval: '1D' });
      const rows = Array.isArray(response.data) ? (response.data as OhlcvRow[]) : [];
      if (!rows.length) return null;
      return {
        time: rows.map((row) => String(row.time ?? '')),
        open: Float64Array.from(rows, (row) => Number(row.open)),
        high: Float64Array.from(rows, (row) => Number(row.high)),
        low: Float64Array.from(rows, (row) => Number(row.low)),
        close: Float64Array.from(rows, (row) => Number(row.close)),
        volume: Float64Array.from(rows, (row) => Number(row.volume)),
      };
    });
    return result.skipped
      ? { status: 'skipped', reason: result.skipped, detail: result }
      : this.complete(result);
  }

  private async cap2CloseScan(sessionDate: string): Promise<JobOutcome> {
    const positions = await this.database.query<{
      user_id: string;
      symbol: string;
      quantity_total: number;
      avg_cost_vnd: string;
      active_original_stop_vnd: string | null;
      active_plan_buy_order_id: string | null;
    }>(
      `select a.user_id, p.symbol, p.quantity_total, p.avg_cost_vnd, p.active_original_stop_vnd, p.active_plan_buy_order_id
       from virtual_positions p join virtual_trading_accounts a on a.id=p.account_id
       join cap2_progress c on c.user_id=a.user_id
       where p.quantity_total > 0 and p.active_original_stop_vnd is not null limit 500`,
    );
    let pending = 0;
    let unavailable = 0;
    for (const position of positions) {
      try {
        const response = await this.market.getOhlcv(position.symbol, {
          interval: '1D',
          start: sessionDate,
          end: sessionDate,
        });
        const bars = Array.isArray(response.data) ? (response.data as OhlcvRow[]) : [];
        const close = Number(bars.at(-1)?.close);
        if (!Number.isFinite(close) || close <= 0) {
          unavailable += 1;
          continue;
        }
        const stop = Number(position.active_original_stop_vnd);
        if (close > stop) continue;
        const inserted = await this.database.query<{ id: string }>(
          `insert into cap2_alert_events(user_id,alert_type,symbol,session_date,trigger_key,source_plan_order_id,observed_price_vnd,threshold_price_vnd,loss_pct,position_quantity,position_avg_cost_vnd,official_close_session_date,official_close_at,official_close_source,status,created_at,updated_at)
           values($1,'cham_cat_lo',$2,$3,$4,$5,$6,$7,$8,$9,$10,$3,now(),$11,'pending',now(),now())
           on conflict(user_id,alert_type,trigger_key) do nothing returning id`,
          [
            position.user_id,
            position.symbol,
            sessionDate,
            `close:${sessionDate}:${position.symbol}`,
            position.active_plan_buy_order_id,
            Math.round(close),
            stop,
            ((close - Number(position.avg_cost_vnd)) / Number(position.avg_cost_vnd)) * 100,
            position.quantity_total,
            position.avg_cost_vnd,
            response.meta.source,
          ],
        );
        pending += inserted.length;
      } catch {
        unavailable += 1;
      }
    }
    return this.complete({
      positions_checked: positions.length,
      alerts_pending: pending,
      unavailable_count: unavailable,
      official_session_date: sessionDate,
    });
  }

  private async cap5Consensus(): Promise<JobOutcome> {
    const users = await this.database.query<{ user_id: string }>(
      'select user_id from cap5_progress order by user_id',
    );
    let refreshed = 0;
    let failed = 0;
    for (const user of users) {
      try {
        await this.cap5.getProgress(user.user_id);
        refreshed += 1;
      } catch {
        failed += 1;
      }
    }
    return this.complete({ examined: users.length, refreshed, failed });
  }

  private async identityRecovery(): Promise<JobOutcome> {
    const users = await this.database.query<{
      user_id: string;
      window_start: Date | string | null;
      window_end: Date | string;
    }>(
      `select c.user_id, c4.entered_at as window_start, c.graduated_at as window_end
       from cap6_progress c left join cap4_progress c4 on c4.user_id=c.user_id
       left join bot_mascot_profiles p on p.user_id=c.user_id and p.mascot_rules_version=$1
       where c.graduated_at is not null and (p.id is null or p.assignment_status='pending_data_repair') order by c.user_id`,
      [MASCOT_RULES_VERSION],
    );
    let examined = 0;
    let recovered = 0;
    for (const user of users) {
      examined += 1;
      const records = await this.database.query<
        Omit<EvidenceRecord, 'ai_answers' | 'snapshot_matches'> & {
          payload: Record<string, unknown>;
        }
      >(
        `select a.id,a.user_id,a.symbol,a.trading_date::text,a.completed_at,a.revealed_at,a.answers,
                a.source,a.mode,a.record_status,a.proof_version,a.dataset_id,d.dataset_hash,d.payload
         from journey_assessments a join journey_reading_datasets d on d.id=a.dataset_id
         where a.user_id=$1 order by a.completed_at,a.id`,
        [user.user_id],
      );
      const evidence: EvidenceRecord[] = records.map((row) => ({
        ...row,
        ai_answers: row.payload.ai_answers,
        snapshot_matches: digest(row.payload) === row.dataset_hash,
      }));
      const result = classifyEvidence(evidence, user.user_id, user.window_start, user.window_end);
      await this.database.query(
        `insert into bot_mascot_profiles
          (user_id,mascot_rules_version,assignment_status,mascot_id,dominant_layer,assignment_basis,
           window_start,window_end,valid_pair_count,match_counts,tied_layers,selected_assessment_refs,
           dataset_hash,excluded_records_summary,assigned_at,created_at,updated_at)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14::jsonb,
                case when $3='assigned' then now() else null end,now(),now())
         on conflict(user_id,mascot_rules_version) do update set
           assignment_status=excluded.assignment_status,mascot_id=excluded.mascot_id,
           dominant_layer=excluded.dominant_layer,assignment_basis=excluded.assignment_basis,
           valid_pair_count=excluded.valid_pair_count,match_counts=excluded.match_counts,
           tied_layers=excluded.tied_layers,selected_assessment_refs=excluded.selected_assessment_refs,
           dataset_hash=excluded.dataset_hash,excluded_records_summary=excluded.excluded_records_summary,
           assigned_at=excluded.assigned_at,updated_at=now()`,
        [
          user.user_id,
          MASCOT_RULES_VERSION,
          result.assignment_status,
          result.mascot_id,
          result.dominant_layer,
          result.assignment_basis,
          user.window_start,
          user.window_end,
          result.valid_pair_count,
          JSON.stringify(result.match_counts),
          JSON.stringify(result.tied_layers),
          JSON.stringify(result.selected_assessment_refs),
          result.dataset_hash,
          JSON.stringify(result.excluded_records_summary),
        ],
      );
      if (result.assignment_status === 'assigned') recovered += 1;
    }
    return recovered
      ? this.complete({ examined, recovered })
      : { status: 'skipped', reason: 'no-recoverable-identity', detail: { examined } };
  }

  private async snapshotWave(wave: number, sessionDate: string): Promise<JobOutcome> {
    const waves: Record<number, string[]> = {
      1: ['INX', 'DJI', 'COMP', 'BTCUSDT', 'ETHUSDT'],
      2: ['N225', 'HSI', '000001', 'USDVND'],
      3: ['SENSEX', 'VNI', 'XAUUSD'],
    };
    const requested = waves[wave] ?? [];
    let persisted = 0;
    const failures: string[] = [];
    for (const symbol of requested) {
      try {
        const source = symbol.endsWith('USDT')
          ? await this.extended.global.cryptoTicker(symbol)
          : await this.extended.global.worldIndex(symbol);
        const data = Array.isArray(source.data) ? source.data.at(-1) : source.data;
        if (!data || typeof data !== 'object') throw new Error('empty provider payload');
        const row = data as Record<string, unknown>;
        const last = Number(row.last_price ?? row.close);
        const previous = Number(row.previous_close ?? row.open ?? last);
        if (!Number.isFinite(last) || !Number.isFinite(previous))
          throw new Error('invalid provider price');
        await this.database.query(
          `insert into market_data_snapshot(snapshot_date,asset_category,symbol,name,last_price,previous_close,change_value,change_percent,day_high,day_low,volume,currency,market_state,market_time,source,stale,fetched_at)
           values($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,'REGULAR',now(),$12,false,now())
           on conflict(snapshot_date,symbol) do update set last_price=excluded.last_price, previous_close=excluded.previous_close, change_value=excluded.change_value, change_percent=excluded.change_percent, day_high=excluded.day_high, day_low=excluded.day_low, volume=excluded.volume, source=excluded.source, stale=false, fetched_at=now()`,
          [
            sessionDate,
            symbol.endsWith('USDT') ? 'crypto' : 'index',
            symbol,
            last,
            previous,
            last - previous,
            previous ? ((last - previous) / previous) * 100 : 0,
            row.high_price ?? row.high ?? null,
            row.low_price ?? row.low ?? null,
            row.volume ?? null,
            symbol.endsWith('USDT') ? 'USD' : null,
            new URL(source.sourceUrl).hostname,
          ],
        );
        persisted += 1;
      } catch {
        failures.push(symbol);
      }
    }
    if (!persisted)
      throw new Error(`Snapshot wave ${wave} produced no valid rows: ${failures.join(',')}`);
    return this.complete({
      wave,
      requested: requested.length,
      persisted,
      failed_symbols: failures,
    });
  }
}

@Module({
  imports: [
    DatabaseModule,
    ReportsModule,
    AlertsModule,
    MarketDataModule,
    BillingModule,
    JourneyModule,
    BotsModule,
    MarketExtendedModule,
    MarketIntegrationModule,
  ],
  providers: [DomainRuntimeJobs],
  exports: [DomainRuntimeJobs],
})
class DomainJobHandlersModule {}

@Module({})
export class DomainRuntimeModule {
  static forApi(enabled: boolean): DynamicModule {
    return {
      module: DomainRuntimeModule,
      imports: [RuntimeModule.register({ enabled, consumeJobs: false })],
      exports: [RuntimeModule],
    };
  }

  static forWorker(enabled: boolean): DynamicModule {
    return {
      module: DomainRuntimeModule,
      imports: [
        DomainJobHandlersModule,
        RuntimeModule.registerAsync({
          imports: [DomainJobHandlersModule],
          inject: [DomainRuntimeJobs],
          useFactory: (jobs: DomainRuntimeJobs) => ({
            enabled,
            consumeJobs: true,
            handlers: jobs.handlers(),
            calendar: jobs,
          }),
        }),
      ],
      exports: [RuntimeModule],
    };
  }
}
