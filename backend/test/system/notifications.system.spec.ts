import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  BULLETIN_NOTIFIER,
  NOTIFICATION_WRITER,
  NotificationEmailDispatcher,
  type BotTradesNotificationInput,
  type BulletinNotifier,
  type NotificationWriter,
} from '../../src/modules/notifications/index.js';
import { DatabaseService } from '../../src/platform/database/index.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Account = Awaited<ReturnType<typeof registerAndLogin>>;

const SESSION = '2026-11-24';
const trades = (userId: string, tradeDate = SESSION): BotTradesNotificationInput => ({
  userId,
  tradeDate,
  executions: [
    { side: 'buy', symbol: 'HPG', price: 25_300, quantity: 500 },
    { side: 'buy', symbol: 'FPT', price: 118_000, quantity: 100 },
    { side: 'sell', symbol: 'VNM', price: 61_200, quantity: 300, reason: 'max_holding' },
  ],
  strategyLabel: 'Chiến lược của tôi · bản 1',
  navVnd: 100_500_000,
});
const BULLETIN = {
  tradeDate: '2026-11-21',
  close: 1284.56,
  change: 10.8,
  changePct: 0.85,
  volume: 812_000_000,
  pickCount: 12,
};

/**
 * Thông báo (update 22-11 §8, §16.4 T01–T08) trên PostgreSQL thật qua HTTP và qua cổng ghi tin:
 * mặc định, chống trùng theo (user, type, phiên), công tắc, email outbox + gửi lại, link tắt.
 */
describe('system acceptance: notifications (update 22-11 §8)', () => {
  let stack: SystemStack;
  let database: DatabaseService;
  let writer: NotificationWriter;
  let notifier: BulletinNotifier;
  let plain: Account;
  let botOff: Account;
  let masterOff: Account;
  let emailUser: Account;

  beforeAll(async () => {
    stack = await startSystemStack({
      EMAIL_ENABLED: 'true',
      EMAIL_PROVIDER_URL: 'https://mail.invalid/send',
      EMAIL_API_KEY: 'system-test-email-key',
      EMAIL_SENDER: 'noreply@iqx.test',
      EMAIL_SENDER_BOT: 'bot@iqx.test',
      EMAIL_SENDER_BULLETIN: 'bantin@iqx.test',
      NOTIFICATION_TOKEN_SECRET: 'system-test-notification-token-secret-32+',
    });
    database = stack.app.get(DatabaseService);
    writer = stack.app.get(NOTIFICATION_WRITER);
    notifier = stack.app.get(BULLETIN_NOTIFIER);
    plain = await registerAndLogin(stack.app, 'notif-plain');
    botOff = await registerAndLogin(stack.app, 'notif-botoff');
    masterOff = await registerAndLogin(stack.app, 'notif-master');
    emailUser = await registerAndLogin(stack.app, 'notif-email');
  });

  afterAll(async () => {
    await stack?.close();
  });

  const get = (account: Account, url: string) =>
    stack.app.inject({ method: 'GET', url, headers: authHeader(account.accessToken) });
  const send = (account: Account, method: 'PUT' | 'POST', url: string, payload: Json) =>
    stack.app.inject({ method, url, headers: authHeader(account.accessToken), payload });
  const settings = (enabled: boolean, bulletin: boolean, botTrades: boolean, email = false) => ({
    enabled,
    types: { bulletin, bot_trades: botTrades },
    channels: { email },
  });
  const writeTrades = (input: BotTradesNotificationInput) =>
    database.transaction((tx) => writer.botTrades(tx, input));
  const inbox = async (account: Account) => (await get(account, '/api/v2/me/notifications')).json();
  const count = async (userId: string, type: string) =>
    Number(
      (
        await stack.query<{ n: string }>(
          'select count(*)::text as n from user_notifications where user_id = $1 and type = $2',
          [userId, type],
        )
      )[0]!.n,
    );

  it('defaults: master on, both types on, email off and unavailable', async () => {
    const response = await get(plain, '/api/v2/me/notification-settings');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      enabled: true,
      types: { bulletin: true, bot_trades: true },
      channels: { web: true, email: false },
      email_available: false,
      updated_at: null,
    });
  });

  it('T01: one "Bot giao dịch" notification, unread +1', async () => {
    const result = await writeTrades(trades(plain.id));
    expect(result).toMatchObject({ created: true, email: false });
    const body = await inbox(plain);
    expect(body.unread_count).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      type: 'bot_trades',
      trade_date: SESSION,
      title: 'Bot giao dịch · phiên 24/11',
      body: 'Mua HPG, FPT · Bán VNM (hết thời gian giữ)',
      link: '/luyen-tap?tool=bot&bot_tab=lich-su',
      read_at: null,
    });
    expect((await get(plain, '/api/v2/me/notifications/unread-count')).json()).toEqual({
      unread_count: 1,
    });
    // Người khác không thấy tin của tài khoản này.
    expect((await inbox(botOff)).items).toHaveLength(0);
  });

  it('T02: a session without executions creates nothing', async () => {
    const result = await writeTrades({ ...trades(plain.id, '2026-11-25'), executions: [] });
    expect(result).toEqual({ created: false, reason: 'no_executions' });
    expect(await count(plain.id, 'bot_trades')).toBe(1);
  });

  it('T03: retrying the same session is a no-op', async () => {
    expect(await writeTrades(trades(plain.id))).toEqual({ created: false, reason: 'duplicate' });
    expect(await count(plain.id, 'bot_trades')).toBe(1);
  });

  it('a run that rolls back after the writer leaves no notification (commit only)', async () => {
    await expect(
      database.transaction(async (tx) => {
        await writer.botTrades(tx, trades(plain.id, '2026-11-26'));
        throw new Error('bot run failed mid-way');
      }),
    ).rejects.toThrow('bot run failed mid-way');
    expect(await count(plain.id, 'bot_trades')).toBe(1);
  });

  it('T04: "Bot giao dịch" off → no Bot notification, bulletin still received', async () => {
    const saved = await send(
      botOff,
      'PUT',
      '/api/v2/me/notification-settings',
      settings(true, true, false),
    );
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      enabled: true,
      types: { bulletin: true, bot_trades: false },
    });
    expect(await writeTrades(trades(botOff.id))).toEqual({ created: false, reason: 'disabled' });
    await database.transaction((tx) => notifier.bulletinPublished(tx, BULLETIN));
    expect(await count(botOff.id, 'bot_trades')).toBe(0);
    expect(await count(botOff.id, 'bulletin')).toBe(1);
  });

  it('T05: master off → nothing at all', async () => {
    const saved = await send(
      masterOff,
      'PUT',
      '/api/v2/me/notification-settings',
      settings(false, true, true),
    );
    expect(saved.json()).toMatchObject({ enabled: false });
    expect(await writeTrades(trades(masterOff.id))).toEqual({ created: false, reason: 'disabled' });
    // The bulletin of T04 reached this account while its settings were still the defaults; a
    // bulletin of another session after switching the master off must not.
    const before = (await inbox(masterOff)).items.length;
    await database.transaction((tx) =>
      notifier.bulletinPublished(tx, { ...BULLETIN, tradeDate: '2026-11-20' }),
    );
    expect((await inbox(masterOff)).items).toHaveLength(before);
    expect(await count(masterOff.id, 'bot_trades')).toBe(0);
  });

  it('switch rules: both types off turns the master off; master back on turns both on', async () => {
    const off = await send(
      botOff,
      'PUT',
      '/api/v2/me/notification-settings',
      settings(true, false, false),
    );
    expect(off.json()).toMatchObject({
      enabled: false,
      types: { bulletin: false, bot_trades: false },
    });
    const on = await send(
      botOff,
      'PUT',
      '/api/v2/me/notification-settings',
      settings(true, false, false),
    );
    expect(on.json()).toMatchObject({ enabled: true, types: { bulletin: true, bot_trades: true } });
  });

  it('T06: bulletin published again → still one notification per account', async () => {
    await database.transaction((tx) => notifier.bulletinPublished(tx, BULLETIN));
    await database.transaction((tx) => notifier.bulletinPublished(tx, BULLETIN));
    expect(await count(plain.id, 'bulletin')).toBe(2); // sessions 21/11 and 20/11, once each
    const item = (await inbox(plain)).items.find(
      (entry: Json) => entry.type === 'bulletin' && entry.trade_date === '2026-11-21',
    );
    expect(item).toMatchObject({
      title: 'Bản tin cuối phiên 21/11',
      body: 'VN-Index 1.284,56 (+0,85%) · 12 mã trong 3 bộ lọc',
      link: '/thi-truong?bt=ban-tin&date=2026-11-21',
    });
  });

  it('T08: email cannot be turned on without a verified email', async () => {
    const denied = await send(
      plain,
      'PUT',
      '/api/v2/me/notification-settings',
      settings(true, true, true, true),
    );
    expect(denied.statusCode).toBe(422);
    expect(denied.json().error.code).toBe('EMAIL_UNVERIFIED');
    expect((await get(plain, '/api/v2/me/notification-settings')).json()).toMatchObject({
      email_available: false,
      channels: { email: false },
    });
  });

  it('T07: email queued with the web notification, sent, unsubscribe link single-use', async () => {
    await stack.query('update users set is_email_verified = true where id = $1', [emailUser.id]);
    const saved = await send(
      emailUser,
      'PUT',
      '/api/v2/me/notification-settings',
      settings(true, true, true, true),
    );
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      email_available: true,
      channels: { web: true, email: true },
    });

    expect(await writeTrades(trades(emailUser.id))).toMatchObject({ created: true, email: true });
    // Retry: no second email (T03).
    await writeTrades(trades(emailUser.id));
    const queued = await stack.query<Json>(
      `select e.* from user_notification_emails e join user_notifications n on n.id = e.notification_id
        where n.user_id = $1`,
      [emailUser.id],
    );
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      status: 'pending',
      sender: 'bot@iqx.test',
      to_email: emailUser.email,
      subject: 'Bot giao dịch phiên 24/11: mua HPG, FPT, bán VNM',
    });

    // Provider down: the email is retried later, the web notification is untouched.
    const dispatcher = stack.app.get(NotificationEmailDispatcher);
    await stack.query("update user_notification_emails set status = 'skipped' where id <> $1", [
      queued[0]!.id,
    ]);
    const down = await dispatcher.dispatch();
    expect(down).toMatchObject({ status: 'completed', detail: { retried: 1 } });
    const [afterFailure] = await stack.query<Json>(
      'select status, attempts, last_error from user_notification_emails where id = $1',
      [queued[0]!.id],
    );
    expect(afterFailure).toMatchObject({ status: 'pending', attempts: 1 });
    expect(await count(emailUser.id, 'bot_trades')).toBe(1);

    // Provider up again on the next tick.
    const sent: Array<{ from: string; to: string; subject: string; html: string }> = [];
    vi.mocked(globalThis.fetch).mockImplementationOnce(async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response('{}', { status: 200 });
    });
    const up = await dispatcher.dispatch(new Date(Date.now() + 120_000));
    expect(up).toMatchObject({ status: 'completed', detail: { sent: 1 } });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ from: 'bot@iqx.test', to: emailUser.email });
    expect(sent[0]!.html).toContain('Giao dịch mô phỏng.');
    const token = decodeURIComponent(/token=([^"&]+)/.exec(sent[0]!.html)![1]!);

    // Unsubscribe without login: turns off exactly that type; reuse says already used.
    const first = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/notifications/unsubscribe',
      payload: { token },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ type: 'bot_trades', status: 'unsubscribed' });
    expect((await get(emailUser, '/api/v2/me/notification-settings')).json()).toMatchObject({
      enabled: true,
      types: { bulletin: true, bot_trades: false },
    });
    const again = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/notifications/unsubscribe',
      payload: { token },
    });
    expect(again.json()).toEqual({ type: 'bot_trades', status: 'already_used' });
    const bad = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/notifications/unsubscribe',
      payload: { token: `${token.slice(0, -2)}xx` },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('TOKEN_INVALID');
  });

  it('mark one / all as read; another account cannot mark it', async () => {
    const items = (await inbox(plain)).items as Json[];
    expect(items.length).toBe(3); // bot trades + 2 bulletins
    const foreign = await send(botOff, 'POST', '/api/v2/me/notifications/read', {
      id: items[0]!.id,
    });
    expect(foreign.statusCode).toBe(404);
    const one = await send(plain, 'POST', '/api/v2/me/notifications/read', { id: items[0]!.id });
    expect(one.json()).toEqual({ unread_count: 2 });
    const all = await send(plain, 'POST', '/api/v2/me/notifications/read', { all: true });
    expect(all.json()).toEqual({ unread_count: 0 });
    expect((await inbox(plain)).items.every((item: Json) => item.read_at !== null)).toBe(true);
  });

  it('requires login for the inbox and settings', async () => {
    const response = await stack.app.inject({ method: 'GET', url: '/api/v2/me/notifications' });
    expect(response.statusCode).toBe(401);
  });
});
