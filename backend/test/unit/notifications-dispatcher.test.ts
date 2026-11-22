import { describe, expect, it, vi } from 'vitest';

import type { EmailService } from '../../src/modules/auth/email.service.js';
import { NotificationEmailDispatcher } from '../../src/modules/notifications/notification-email.dispatcher.js';
import { isolated } from '../../src/modules/notifications/notification-writer.service.js';
import { verifyUnsubscribeToken } from '../../src/modules/notifications/user-notifications.rules.js';
import { UNSUBSCRIBE_PLACEHOLDER } from '../../src/modules/notifications/user-notifications.text.js';
import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';

const SECRET = 's'.repeat(40);
const ROW_ID = '5a0e7a1e-3b5c-4d6e-8f90-1234567890ab';

type Call = { text: string; values: readonly unknown[] };

function fakeDatabase(claimed: Array<Record<string, unknown>>) {
  const calls: Call[] = [];
  const database = {
    query: vi.fn(async (text: string, values: readonly unknown[] = []) => {
      calls.push({ text, values });
      if (text.includes("set status = 'skipped'")) return [];
      if (text.includes('set attempts = e.attempts + 1')) return claimed;
      return [];
    }),
  };
  return { database: database as unknown as DatabaseService, calls };
}

const config = {
  get: (key: string) =>
    ({ APP_PUBLIC_URL: 'https://iqx.vn', NOTIFICATION_TOKEN_SECRET: SECRET })[key],
} as never;

function row(attempts: number) {
  return {
    id: ROW_ID,
    to_email: 'a@example.test',
    sender: 'bot@iqx.vn',
    subject: 'S',
    html: `<a href="${UNSUBSCRIBE_PLACEHOLDER}">Tắt thông báo này</a>`,
    attempts,
  };
}

describe('notifications: email dispatcher (spec §8.4, max 3 attempts)', () => {
  it('does nothing while email is disabled', async () => {
    const { database, calls } = fakeDatabase([]);
    const email = { isEnabled: () => false, deliver: vi.fn() } as unknown as EmailService;
    const result = await new NotificationEmailDispatcher(database, email, config).dispatch();
    expect(result).toEqual({ status: 'skipped', reason: 'email-disabled' });
    expect(calls).toHaveLength(0);
  });

  it('sends with the signed unsubscribe link and the per-type sender, then marks sent', async () => {
    const { database, calls } = fakeDatabase([row(1)]);
    const deliver = vi.fn(async () => ({ status: 'sent' as const }));
    const email = { isEnabled: () => true, deliver } as unknown as EmailService;
    const result = await new NotificationEmailDispatcher(database, email, config).dispatch();
    expect(result).toMatchObject({ status: 'completed', detail: { sent: 1 } });
    const message = (deliver.mock.calls[0] as unknown as [{ html: string; from: string }])[0];
    expect(message.from).toBe('bot@iqx.vn');
    const token = decodeURIComponent(/token=([^"]+)/.exec(message.html)![1]!);
    expect(verifyUnsubscribeToken(SECRET, token)).toBe(ROW_ID);
    expect(message.html).toContain('https://iqx.vn/thong-bao/tat?token=');
    expect(calls.some((call) => call.text.includes("set status = 'sent'"))).toBe(true);
  });

  it('retries a failed send later, and gives up after the third attempt', async () => {
    const failing = vi.fn(async () => ({
      status: 'failed' as const,
      error: 'provider status 500',
    }));
    const email = { isEnabled: () => true, deliver: failing } as unknown as EmailService;

    const first = fakeDatabase([row(1)]);
    const now = new Date('2026-11-24T12:00:00Z');
    await new NotificationEmailDispatcher(first.database, email, config).dispatch(now);
    const retry = first.calls.find((call) => call.text.includes('next_attempt_at = $3'))!;
    expect(retry.values[1]).toBe('provider status 500');
    expect((retry.values[2] as Date).getTime()).toBe(now.getTime() + 60_000);
    expect(first.calls.some((call) => call.text.includes("set status = 'failed'"))).toBe(false);

    const last = fakeDatabase([row(3)]);
    const result = await new NotificationEmailDispatcher(last.database, email, config).dispatch(
      now,
    );
    expect(result).toMatchObject({ detail: { failed: 1 } });
    expect(last.calls.some((call) => call.text.includes("set status = 'failed'"))).toBe(true);
  });
});

describe('notifications: savepoint isolation', () => {
  it('rolls back to the savepoint on error so the caller transaction stays usable', async () => {
    const statements: string[] = [];
    const tx: SqlClient = {
      query: async (text: string) => {
        statements.push(
          text.split(' ')[0]!.toLowerCase() + (text.includes('rollback') ? '-rb' : ''),
        );
        return [];
      },
    };
    const failed = await isolated(tx, async () => {
      throw new Error('boom');
    });
    expect(failed.ok).toBe(false);
    expect(statements).toEqual(['savepoint', 'rollback-rb', 'release']);
    statements.length = 0;
    const ok = await isolated(tx, async () => 42);
    expect(ok).toEqual({ ok: true, value: 42 });
    expect(statements).toEqual(['savepoint', 'release']);
  });
});
