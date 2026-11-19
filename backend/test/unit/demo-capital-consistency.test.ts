import { describe, expect, it } from 'vitest';

import type {
  AdminAuditService,
  AuditContext,
} from '../../src/modules/admin/admin-audit.service.js';
import { AdminVTService } from '../../src/modules/admin/admin-vt.service.js';
import { BOT_POLICY } from '../../src/modules/bots/bot.domain.js';
import { Cap0Service } from '../../src/modules/journey/cap0/cap0.service.js';
import { memberPerformance } from '../../src/modules/users/member-performance.js';
import type { JourneyEventService } from '../../src/modules/journey/core/journey-event.service.js';
import type { TradingRightsService } from '../../src/modules/trading/rights.service.js';
import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';

type QueryCall = { sql: string; values: readonly unknown[] };

/** A DatabaseService that records every statement and answers from a lookup table. */
function fakeDatabase(answer: (sql: string) => unknown[]) {
  const calls: QueryCall[] = [];
  const run = async (sql: string, values: readonly unknown[] = []) => {
    calls.push({ sql, values });
    return answer(sql);
  };
  const tx = { query: run } as unknown as SqlClient;
  const database = {
    query: run,
    transaction: (operation: (client: SqlClient) => Promise<unknown>) => operation(tx),
  } as unknown as DatabaseService;
  return { calls, database };
}

const AUDIT_CONTEXT: AuditContext = {
  adminId: 'admin-1',
  actorRole: 'admin',
  ip: null,
  userAgent: null,
  requestId: null,
};

describe('Demo Trading capital consistency (update 19-11 §8.1: 100.000.000 VND)', () => {
  it('opens the Demo account of the journey with 100.000.000 VND and one funding row', async () => {
    const progressRow = {
      id: 'progress-1',
      user_id: 'user-1',
      entered_at: new Date(),
      virtual_balance_init: 100_000_000,
      task_1_done_at: null,
      task_2_done_at: null,
      task_3_done_at: null,
      task_4_done_at: null,
      task_5_done_at: null,
      task1_star_clicked: false,
      task5_debrief_done: false,
      graduated_at: null,
      time_to_graduate_hours: null,
    };
    const { calls, database } = fakeDatabase((sql) => {
      if (sql.includes('insert into cap0_progress')) return [progressRow];
      if (sql.includes('insert into virtual_trading_accounts')) return [{ id: 'account-1' }];
      return [];
    });
    const service = new Cap0Service(database, {} as JourneyEventService);

    const result = await service.enter('user-1');

    expect(result).toMatchObject({ virtual_balance_init: 100_000_000 });
    const progressInsert = calls.find((call) => call.sql.includes('insert into cap0_progress'));
    const accountInsert = calls.find((call) =>
      call.sql.includes('insert into virtual_trading_accounts'),
    );
    expect(progressInsert).toBeDefined();
    expect(accountInsert).toBeDefined();
    // Cả hai đều ghi vốn mở tài khoản: 100.000.000đ, và đúng một dòng cấp vốn có khoá.
    expect(progressInsert!.values[2]).toBe(100_000_000);
    expect(accountInsert!.values[2]).toBe(100_000_000);
    const funding = calls.find((call) => call.sql.includes('insert into virtual_cash_ledger'));
    expect(funding).toBeDefined();
    expect(funding!.values[2]).toBe(100_000_000);
    expect(funding!.values[4]).toBe('manual:initial_funding:user-1');
  });

  it('resets a Demo account with no capital and no deposited baseline', async () => {
    const accountRow = {
      id: 'account-1',
      user_id: 'user-1',
      status: 'active',
      initial_cash_vnd: '100000000',
      cash_available_vnd: '50000000',
      cash_reserved_vnd: '0',
      cash_pending_vnd: '0',
      net_deposited_cash_vnd: '100000000',
    };
    const { calls, database } = fakeDatabase((sql) => {
      if (sql.includes('select id from virtual_trading_accounts where user_id')) {
        return [{ id: 'account-1' }];
      }
      if (sql.includes('for update')) return [accountRow];
      if (sql.includes('from virtual_trading_configs')) return [{ initial_cash_vnd: '0' }];
      return [];
    });
    const service = new AdminVTService(
      database,
      { record: async () => undefined } as unknown as AdminAuditService,
      { cancelPendingForResetSameTx: async () => undefined } as unknown as TradingRightsService,
    );

    await service.resetByUser('user-1', AUDIT_CONTEXT, { dry_run: false, reason: 'test' });

    const update = calls.find((call) => call.sql.includes('update virtual_trading_accounts'));
    expect(update).toBeDefined();
    // Mẫu số của % lợi nhuận Demo phải được đặt lại cùng vốn được cấp.
    expect(update!.sql).toContain('net_deposited_cash_vnd = $1');
    expect(update!.values[0]).toBe('0');
    expect(update!.sql).toContain('cash_available_vnd = $1');
    expect(update!.sql).toContain('initial_cash_vnd = $1');
  });

  it('keeps the admin "cấp lại vốn" parameter and applies it to the deposited baseline', async () => {
    const accountRow = {
      id: 'account-1',
      user_id: 'user-1',
      status: 'active',
      initial_cash_vnd: '0',
      cash_available_vnd: '0',
      cash_reserved_vnd: '0',
      cash_pending_vnd: '0',
      net_deposited_cash_vnd: '0',
    };
    const { calls, database } = fakeDatabase((sql) => {
      if (sql.includes('select id from virtual_trading_accounts where user_id')) {
        return [{ id: 'account-1' }];
      }
      if (sql.includes('for update')) return [accountRow];
      if (sql.includes('from virtual_trading_configs')) {
        return [{ initial_cash_vnd: '5000000' }];
      }
      return [];
    });
    const service = new AdminVTService(
      database,
      { record: async () => undefined } as unknown as AdminAuditService,
      { cancelPendingForResetSameTx: async () => undefined } as unknown as TradingRightsService,
    );

    await service.resetByUser('user-1', AUDIT_CONTEXT, { dry_run: false, reason: 'test' });

    const update = calls.find((call) => call.sql.includes('update virtual_trading_accounts'));
    expect(update!.values[0]).toBe('5000000');
  });

  it('re-grants 100.000.000 VND on reset when no trading config exists', async () => {
    const accountRow = {
      id: 'account-1',
      user_id: 'user-1',
      status: 'active',
      initial_cash_vnd: '0',
      cash_available_vnd: '0',
      cash_reserved_vnd: '0',
      cash_pending_vnd: '0',
      net_deposited_cash_vnd: '0',
    };
    const { calls, database } = fakeDatabase((sql) => {
      if (sql.includes('select id from virtual_trading_accounts where user_id')) {
        return [{ id: 'account-1' }];
      }
      if (sql.includes('for update')) return [accountRow];
      return [];
    });
    const service = new AdminVTService(
      database,
      { record: async () => undefined } as unknown as AdminAuditService,
      { cancelPendingForResetSameTx: async () => undefined } as unknown as TradingRightsService,
    );

    await service.resetByUser('user-1', AUDIT_CONTEXT, { dry_run: false, reason: 'test' });

    const update = calls.find((call) => call.sql.includes('update virtual_trading_accounts'));
    expect(update!.values[0]).toBe('100000000');
  });

  it('computes the member Demo profit against the fixed 100.000.000 VND base', async () => {
    const { calls, database } = fakeDatabase(() => []);
    await memberPerformance(database, ['user-1']);
    const demo = calls.find((call) => call.sql.includes('from virtual_trading_accounts a'));
    expect(demo).toBeDefined();
    expect(demo!.sql).not.toContain('net_deposited_cash_vnd');
    expect(demo!.values[1]).toBe('100000000');
  });

  it('never touches the Bot capital: the Bot still gets 100.000.000 VND', () => {
    expect(BOT_POLICY.initial_cash_vnd).toBe(100_000_000);
  });
});
