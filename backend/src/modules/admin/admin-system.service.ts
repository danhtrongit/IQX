import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../platform/config/environment.js';
import { DatabaseService } from '../../platform/database/index.js';
import type { AuditContext } from './admin-audit.service.js';
import { AdminAuditService } from './admin-audit.service.js';

export type JobsPort = {
  isEnabled(): boolean;
  list(): Promise<unknown[]>;
  runNow(name: string, requestedBy?: string): Promise<Record<string, unknown>>;
};

@Injectable()
export class AdminSystemService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
    private readonly audit: AdminAuditService,
    @Optional() @Inject('IQX_JOBS_SERVICE') private readonly jobs?: JobsPort,
  ) {}

  async status(): Promise<Record<string, unknown>> {
    const dbStats = await this.database.query<Record<string, string>>(
      `select
        (select count(*) from users)::text as users,
        (select count(*) from premium_subscriptions)::text as subscriptions,
        (select count(*) from premium_payment_orders)::text as payment_orders,
        (select count(*) from sepay_ipn_logs)::text as ipn_logs,
        (select count(*) from admin_audit_log)::text as audit_log`,
    );
    const lastIpn = await this.database.query<{ received_at: string }>(
      `select received_at from sepay_ipn_logs order by received_at desc limit 1`,
    );
    const processed = await this.database.query<{ total: string }>(
      `select count(*)::text as total from sepay_ipn_logs where received_at >= now() - interval '24 hours' and result_status = 'processed'`,
    );
    const jobs = this.jobs ? await this.jobs.list() : [];
    const row = dbStats[0] ?? {};
    return {
      version: '0.2.0',
      environment: this.config.get('APP_ENV', { infer: true }),
      scheduler_running: this.jobs?.isEnabled() ?? false,
      jobs,
      db_stats: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])),
      last_ipn_received_at: lastIpn[0]?.received_at ?? null,
      last_ipn_processed_count_24h: Number(processed[0]?.total ?? 0),
      generated_at: new Date().toISOString(),
    };
  }

  async runJob(jobId: string, context: AuditContext): Promise<Record<string, unknown>> {
    if (!this.jobs)
      throw new ServiceUnavailableException({
        code: 'RUNTIME_DISABLED',
        message: 'Job runtime is not configured',
      });
    const result = await this.jobs.runNow(jobId, context.adminId);
    await this.database.transaction(async (tx) => {
      await this.audit.record(tx, context, {
        action: 'system.job_run',
        targetEntity: 'job',
        targetId: jobId,
        after: result,
      });
    });
    return { job_id: jobId, ...result, ran_at: new Date().toISOString() };
  }
}
