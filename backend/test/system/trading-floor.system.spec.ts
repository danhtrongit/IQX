import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { floorChatTiming } from '../../src/modules/trading-floor/floor-chat.logic.js';
import { FLOOR_CLOCK } from '../../src/modules/trading-floor/floor-clock.js';
import { FloorRitualJob } from '../../src/modules/trading-floor/floor-ritual.job.js';
import { leaderboardId } from '../../src/modules/trading-floor/floor-ritual.repository.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

// Khu giao dịch trên PostgreSQL và Redis thật với migration 0047, WebSocket thật (`ws`) và access token
// thật: hồ sơ nhân vật, nghi lễ Thần Tài chấm bằng nến VNINDEX (kể cả phiên bị lỡ), bảng xếp hạng tháng,
// trưởng nhóm gán quyền SACO cho nhóm mình, nhắn trực tiếp, Chat SACO khớp qua hai socket, và gỡ quyền
// làm cuộc chat chỉ đọc. Đồng hồ của khu được dịch về tháng 11/2026 để phiên nghi lễ xác định.
const BASE = '/api/v2/trading-floor';
const PASSWORD = 'System!Passw0rd';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Session = Awaited<ReturnType<typeof registerAndLogin>>;
type Json = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Message = Record<string, any>;
type Client = { socket: WebSocket; messages: Message[]; closed: number | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

describe('system acceptance: Khu giao dịch', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  let wsUrl = '';
  const open: WebSocket[] = [];
  /** Giờ của khu = giờ thật cộng độ lệch; đổi độ lệch để nhảy tới giờ mong muốn mà đồng hồ vẫn chạy. */
  let shiftMs = 0;
  const clock = { now: () => new Date(Date.now() + shiftMs) };
  const setClock = (iso: string) => {
    shiftMs = new Date(iso).getTime() - Date.now();
  };
  const originalInviteMs = floorChatTiming.inviteMs;

  let admin: Session;
  let lead: Session;
  let lead2: Session;
  let memberA: Session;
  let memberB: Session;
  let outsider: Session;
  let u1: Session;
  let u2: Session;
  let u3: Session;
  let sacoA = '';
  let sacoB = '';
  let u1Floor: Client;

  const call = (session: Session | null, method: string, path: string, payload?: unknown) =>
    app.inject({
      method: method as 'GET',
      url: `${BASE}${path}`,
      headers: session ? authHeader(session.accessToken) : undefined,
      ...(payload === undefined ? {} : { payload: payload as Json }),
    });

  const ok = async (
    session: Session | null,
    method: string,
    path: string,
    payload?: unknown,
    status = 200,
  ): Promise<Body> => {
    const response = await call(session, method, path, payload);
    expect(response.statusCode, `${method} ${path}: ${response.body}`).toBe(status);
    return response.json();
  };

  const errorOf = (response: { json(): unknown }) =>
    (response.json() as { error?: { code?: string } }).error?.code;

  async function relogin(user: Session): Promise<Session> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { identifier: user.email, password: PASSWORD },
    });
    expect(response.statusCode, response.body).toBe(200);
    return { ...user, accessToken: (response.json() as { access_token: string }).access_token };
  }

  async function makeLead(suffix: string): Promise<Session> {
    const user = await registerAndLogin(app, suffix);
    await stack.query("update users set role = 'team_lead' where id = $1", [user.id]);
    await stack.query(
      "insert into team_lead_profiles (user_id, status, appointed_by) values ($1, 'active', $2)",
      [user.id, admin.id],
    );
    return relogin(user);
  }

  async function makeMember(suffix: string, leadId: string | null): Promise<Session> {
    const user = await registerAndLogin(app, suffix);
    if (leadId) {
      await stack.query(
        `update users set group_lead_id = $2, group_joined_at = now(), group_join_via = 'admin'
          where id = $1`,
        [user.id, leadId],
      );
    }
    return user;
  }

  /** Mở socket thật và xác thực ngay bằng thông điệp đầu tiên. */
  function connect(token: string | null): Promise<Client> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      open.push(socket);
      const client: Client = { socket, messages: [], closed: null };
      socket.on('message', (data) => client.messages.push(JSON.parse(data.toString()) as Message));
      socket.on('close', (code) => {
        client.closed = code;
      });
      socket.once('error', reject);
      socket.once('open', () => {
        if (token !== null) socket.send(JSON.stringify({ type: 'auth', token }));
        resolve(client);
      });
    });
  }

  async function until(check: () => boolean, label: string, ms = 6000): Promise<void> {
    const end = Date.now() + ms;
    while (!check()) {
      if (Date.now() > end) throw new Error(`Hết giờ chờ: ${label}`);
      await sleep(15);
    }
  }

  async function waitFor(
    client: Client,
    predicate: (message: Message) => boolean,
    label: string,
    ms = 6000,
  ): Promise<Message> {
    let found: Message | undefined;
    await until(
      () => {
        found = client.messages.find(predicate);
        return found !== undefined;
      },
      label,
      ms,
    );
    return found!;
  }

  const send = (client: Client, message: Json) => client.socket.send(JSON.stringify(message));

  async function authed(session: Session): Promise<Client> {
    const client = await connect(session.accessToken);
    await waitFor(client, (m) => m.type === 'ready', `ready của ${session.username}`);
    return client;
  }

  beforeAll(async () => {
    stack = await startSystemStack({}, { overrideProviders: [{ token: FLOOR_CLOCK, value: clock }] });
    app = stack.app;
    floorChatTiming.inviteMs = 1500;
    setClock('2026-11-12T03:00:00Z'); // thứ Năm 10:00 giờ Việt Nam
    const adminUser = await registerAndLogin(app, 'tf-admin');
    await stack.query("update users set role = 'admin', is_email_verified = true where id = $1", [
      adminUser.id,
    ]);
    admin = await relogin(adminUser);
    lead = await makeLead('tf-lead');
    lead2 = await makeLead('tf-lead2');
    memberA = await makeMember('tf-membera', lead.id);
    memberB = await makeMember('tf-memberb', lead2.id);
    outsider = await makeMember('tf-outsider', lead2.id);
    u1 = await makeMember('tf-u1', null);
    u2 = await makeMember('tf-u2', null);
    u3 = await makeMember('tf-u3', null);
    await stack.query(
      `insert into symbols (id, symbol, name, exchange, asset_type, is_index, current_price_vnd, last_synced_at, is_active)
       values ('20000000-0000-4000-8000-000000000003', 'FPT', 'FPT', 'HOSE', 'stock', false, 100000, now(), true)
       on conflict (symbol) do nothing`,
    );
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    wsUrl = `ws://127.0.0.1:${address.port}/api/v2/trading-floor/ws`;
  }, 180_000);

  afterAll(async () => {
    floorChatTiming.inviteMs = originalInviteMs;
    for (const socket of open) socket.terminate();
    await stack?.close();
  });

  it('hồ sơ và /me: chưa có nhân vật thì gợi ý tên, lưu rồi đọc lại, tên sai bị từ chối', async () => {
    expect((await call(null, 'GET', '/me')).statusCode).toBe(401);
    const before = await ok(u1, 'GET', '/me');
    expect(before).toMatchObject({ profile: null, saco: null, suggestedName: 'System tf-u1' });

    const bad = await call(u1, 'PUT', '/profile', { name: 'A', avatar: 'male01', color: 'default' });
    expect(bad.statusCode).toBe(422);
    expect(errorOf(bad)).toBe('INVALID_NAME');
    expect(
      (await call(u1, 'PUT', '/profile', { name: 'An', avatar: 'robot', color: 'default' })).statusCode,
    ).toBe(422);

    const saved = await ok(u1, 'PUT', '/profile', {
      name: '  Nam   Bình ',
      avatar: 'male02',
      color: 'navy',
    });
    expect(saved).toEqual({ name: 'Nam Bình', avatar: 'male02', color: 'navy' });
    expect((await ok(u1, 'GET', '/me')).profile).toEqual(saved);
    for (const [index, session] of [u2, u3].entries()) {
      await ok(session, 'PUT', '/profile', {
        name: `Người ${index + 2}`,
        avatar: 'female01',
        color: 'default',
      });
    }
  });

  it('WebSocket sàn: sai token bị đóng 4401, vào sàn cần nhân vật, đổi nhân vật phát peer:update', async () => {
    const bad = await connect('khong-phai-token');
    await until(() => bad.closed !== null, 'đóng vì sai token');
    expect(bad.closed).toBe(4401);
    expect(bad.messages.some((m) => m.type === 'error' && m.code === 'AUTH_INVALID')).toBe(true);

    const noProfile = await authed(memberA);
    send(noProfile, { type: 'hello', x: 10, y: 10, facing: 's', moving: false });
    await waitFor(noProfile, (m) => m.type === 'error' && m.code === 'NO_PROFILE', 'NO_PROFILE');

    u1Floor = await authed(u1);
    send(u1Floor, { type: 'hello', x: 120.04, y: 80, facing: 's', moving: false });
    const welcome = await waitFor(u1Floor, (m) => m.type === 'welcome', 'welcome');
    expect(welcome.self).toMatchObject({ name: 'Nam Bình', avatar: 'male02', x: 120 });

    const second = await authed(u2);
    send(second, { type: 'hello', x: 5, y: 5, facing: 'n', moving: false });
    const welcomeTwo = await waitFor(second, (m) => m.type === 'welcome', 'welcome của u2');
    expect(welcomeTwo.peers).toHaveLength(1);
    await waitFor(u1Floor, (m) => m.type === 'peer:join' && m.peer.name === 'Người 2', 'peer:join');
    send(second, { type: 'state', x: 50, y: 5, facing: 'e', moving: true });
    await waitFor(u1Floor, (m) => m.type === 'peer:state' && m.x === 50, 'peer:state');

    await ok(u1, 'PUT', '/profile', { name: 'Nam Bình', avatar: 'male02', color: 'forest' });
    await waitFor(
      u1Floor,
      (m) => m.type === 'peer:update' && m.peer.color === 'forest' && m.peer.name === 'Nam Bình',
      'peer:update',
    );
    second.socket.close();
    await waitFor(u1Floor, (m) => m.type === 'peer:leave', 'peer:leave');
  });

  it('nghi lễ: gieo quẻ một lần, dự đoán, chấm bằng nến VNINDEX cả phiên bị lỡ, rồi bảng xếp hạng', async () => {
    const today = await ok(u1, 'GET', '/ritual/today');
    expect(today).toMatchObject({ session: '2026-11-12', mine: null, lastResult: null });
    expect(today.cutoffAt).toBe(Date.UTC(2026, 10, 12, 7, 30));
    expect(today.stats).toMatchObject({ total: 0, up: 0, down: 0 });

    const early = await call(u1, 'POST', '/ritual/submit', {
      direction: 'up',
      level: 1745,
      tickers: ['VCB', 'VNM', 'FPT'],
    });
    expect(early.statusCode).toBe(409);
    expect(errorOf(early)).toBe('RITUAL_NOT_DRAWN');

    const drawn = await ok(u1, 'POST', '/ritual/draw');
    expect(drawn.ritual).toMatchObject({ session: '2026-11-12', direction: null });
    expect(drawn.que.id).toBe(drawn.ritual.queId);
    expect((await ok(u1, 'POST', '/ritual/draw')).que.id).toBe(drawn.que.id);

    const badTickers = await call(u1, 'POST', '/ritual/submit', {
      direction: 'up',
      level: 1745,
      tickers: ['VCB', 'VCB', 'FPT'],
    });
    expect(errorOf(badTickers)).toBe('RITUAL_BAD_TICKERS');
    const unknown = await call(u1, 'POST', '/ritual/submit', {
      direction: 'up',
      level: 1745,
      tickers: ['VCB', 'VNM', 'ZZZ'],
    });
    expect(errorOf(unknown)).toBe('RITUAL_UNKNOWN_TICKER');
    expect(
      (await call(u1, 'POST', '/ritual/submit', { direction: 'up', level: -1, tickers: [] })).statusCode,
    ).toBe(422);

    const submitted = await ok(u1, 'POST', '/ritual/submit', {
      direction: 'up',
      level: 1745,
      tickers: ['vcb', 'vnm', 'fpt'],
    });
    expect(submitted.mine).toMatchObject({ direction: 'up', level: 1745, correct: null });
    expect(submitted.mine.tickers).toEqual(['VCB', 'VNM', 'FPT']);
    await waitFor(u1Floor, (m) => m.type === 'ritual:done' && m.name === 'Nam Bình', 'ritual:done');
    const again = await call(u1, 'POST', '/ritual/submit', {
      direction: 'down',
      level: 1700,
      tickers: ['VCB', 'VNM', 'FPT'],
    });
    expect(again.statusCode).toBe(409);
    expect(errorOf(again)).toBe('RITUAL_ALREADY_DONE');

    await ok(u2, 'POST', '/ritual/draw');
    await ok(u2, 'POST', '/ritual/submit', { direction: 'down', level: 1700, tickers: ['VCB', 'FPT', 'VNM'] });
    await ok(u3, 'POST', '/ritual/draw');
    await ok(u3, 'POST', '/ritual/submit', { direction: 'up', level: 1750, tickers: ['VCB', 'VNM', 'FPT'] });
    const stats = (await ok(u1, 'GET', '/ritual/today')).stats;
    expect(stats).toMatchObject({ total: 3, up: 2, down: 1 });
    expect(stats.topTickers).toHaveLength(3);
    expect(stats.topTickers[0].count).toBe(3);

    // Một phiên bị lỡ trước đó (10/11, đoán giảm) và các nến VNINDEX cần để chấm.
    await stack.query(
      `insert into tf_rituals (user_id, session, que_id, direction, level, tickers, created_at, done_at)
       values ($1, '2026-11-10', 1, 'down', 1730, '{VCB,VNM,FPT}', now(), now())`,
      [u1.id],
    );
    await stack.query(
      `insert into market_index_bars (symbol, trade_date, open, high, low, close, volume) values
         ('VNINDEX', '2026-11-09', 1740, 1742, 1738, 1740, 1000),
         ('VNINDEX', '2026-11-10', 1738, 1740, 1730, 1735.5, 1000),
         ('VNINDEX', '2026-11-12', 1736, 1750, 1735, 1745.12, 1000)`,
    );

    const job = app.get(FloorRitualJob);
    // 14:59: chưa tới giờ chấm của phiên hôm nay; phiên 10/11 thì chấm được từ sớm.
    setClock('2026-11-12T07:59:00Z');
    const early1 = await job.run();
    expect(early1).toMatchObject({ status: 'completed' });
    expect((early1 as { detail: Body }).detail.scored.map((s: Body) => s.session)).toEqual(['2026-11-10']);

    setClock('2026-11-12T08:30:00Z'); // 15:30
    const scored = await job.run();
    expect((scored as { detail: Body }).detail.scored).toEqual([
      expect.objectContaining({ session: '2026-11-12', rituals: 3, close: 1745.12, change: 9.62 }),
    ]);
    const rerun = await job.run();
    expect((rerun as { detail: Body }).detail).toEqual({ scored: [], waiting: [] });

    const rows = await stack.query<{ user_id: string; correct: boolean; error: string }>(
      `select user_id, correct, error from tf_rituals where session = '2026-11-12' order by user_id`,
    );
    const byUser = new Map(rows.map((row) => [row.user_id, row]));
    expect(byUser.get(u1.id)).toMatchObject({ correct: true });
    expect(Number(byUser.get(u1.id)!.error)).toBeCloseTo(0.12, 2);
    expect(byUser.get(u2.id)).toMatchObject({ correct: false });
    expect(byUser.get(u3.id)).toMatchObject({ correct: true });

    const board = await ok(u2, 'GET', '/leaderboard?month=2026-11');
    expect(board.month).toBe('2026-11');
    expect(board.rows.map((row: Body) => row.id)).toEqual([leaderboardId(u1.id), leaderboardId(u3.id)]);
    expect(board.rows[0]).toMatchObject({ rank: 1, correct: 2, total: 2, name: 'Nam Bình' });
    expect(board.rows[0].avgError).toBeCloseTo((5.5 + 0.12) / 2, 2);
    expect(board.rows[1]).toMatchObject({ rank: 2, correct: 1, total: 1 });
    expect((await ok(u2, 'GET', '/leaderboard')).month).toBe('2026-11');
    expect((await ok(u2, 'GET', '/leaderboard?month=2026-10')).rows).toEqual([]);
    expect((await call(u2, 'GET', '/leaderboard?month=2026-13')).statusCode).toBe(422);

    const after = await ok(u1, 'GET', '/ritual/today');
    expect(after.session).toBe('2026-11-13');
    expect(after.mine).toBeNull();
    expect(after.lastResult).toEqual({
      session: '2026-11-12',
      close: 1745.12,
      change: 9.62,
      total: 3,
      correct: 2,
    });
  });

  it('quản trị SACO: trưởng nhóm gán cho người trong nhóm, bị từ chối với người ngoài nhóm, người thường bị 403', async () => {
    expect((await call(u1, 'GET', '/manage/sacos')).statusCode).toBe(403);
    expect((await call(u1, 'POST', '/manage/sacos', { userId: memberA.id })).statusCode).toBe(403);
    expect((await call(null, 'GET', '/manage/sacos')).statusCode).toBe(401);

    const granted = await ok(lead, 'POST', '/manage/sacos', { userId: memberA.id, displayName: ' Sư Tử ' }, 201);
    sacoA = granted.id;
    expect(granted).toMatchObject({
      userId: memberA.id,
      name: 'Sư Tử',
      active: true,
      onDuty: false,
      position: 1,
      mine: true,
      leadUserId: lead.id,
    });
    expect(typeof granted.icon).toBe('string');

    const foreign = await call(lead, 'POST', '/manage/sacos', { userId: memberB.id });
    expect(foreign.statusCode).toBe(404);
    expect(errorOf(foreign)).toBe('USER_NOT_FOUND');
    const duplicate = await call(lead, 'POST', '/manage/sacos', { userId: memberA.id });
    expect(duplicate.statusCode).toBe(409);
    expect(errorOf(duplicate)).toBe('SACO_EXISTS');
    const staff = await call(admin, 'POST', '/manage/sacos', { userId: lead.id, leadUserId: lead.id });
    expect(staff.statusCode).toBe(422);
    expect(errorOf(staff)).toBe('USER_NOT_ELIGIBLE');
    expect(errorOf(await call(admin, 'POST', '/manage/sacos', { userId: u3.id }))).toBe('LEAD_REQUIRED');

    const candidates = await ok(lead, 'GET', '/manage/saco-candidates?q=tf-');
    const candidateIds = candidates.items.map((item: Body) => item.userId);
    expect(candidateIds).not.toContain(memberB.id);
    expect(candidateIds).not.toContain(u1.id);
    const adminCandidates = await ok(admin, 'GET', '/manage/saco-candidates?q=tf-memberb');
    expect(adminCandidates.items.map((item: Body) => item.userId)).toContain(memberB.id);

    const second = await ok(admin, 'POST', '/manage/sacos', { userId: memberB.id, leadUserId: lead2.id }, 201);
    sacoB = second.id;
    expect(second).toMatchObject({ position: 2, leadUserId: lead2.id, mine: true });

    const renamed = await ok(lead, 'PATCH', `/manage/sacos/${sacoA}`, { displayName: 'Sư Tử Vàng' });
    expect(renamed.name).toBe('Sư Tử Vàng');
    const noGroup = await call(lead, 'PATCH', `/manage/sacos/${sacoA}`, { leadUserId: lead2.id });
    expect(noGroup.statusCode).toBe(403);
    expect(errorOf(noGroup)).toBe('ADMIN_ONLY');
    expect((await call(lead, 'PATCH', `/manage/sacos/${sacoB}`, { displayName: 'Hack' })).statusCode).toBe(404);
    expect((await call(lead, 'PATCH', `/manage/sacos/${sacoA}`, {})).statusCode).toBe(422);

    const mineView = await ok(lead, 'GET', '/manage/sacos');
    const rowB = mineView.items.find((item: Body) => item.id === sacoB);
    expect(rowB).toMatchObject({ mine: false, userId: '', email: '' });
    expect(mineView.items.find((item: Body) => item.id === sacoA)).toMatchObject({ mine: true });
    expect(mineView.leads.map((item: Body) => item.id)).toContain(lead.id);

    // Đổi chỗ: trưởng nhóm chỉ đổi trong các vị trí của nhóm mình (A một mình nên không đổi), quản trị đổi tự do.
    const stay = await ok(lead, 'POST', `/manage/sacos/${sacoA}/move`, { dir: 'down' });
    expect(stay.items.filter((item: Body) => item.active).map((item: Body) => item.id)).toEqual([sacoA, sacoB]);
    const swapped = await ok(admin, 'POST', `/manage/sacos/${sacoB}/move`, { dir: 'up' });
    expect(swapped.items.filter((item: Body) => item.active).map((item: Body) => item.id)).toEqual([sacoB, sacoA]);
    expect(swapped.items.filter((item: Body) => item.active).map((item: Body) => item.position)).toEqual([1, 2]);
    await ok(admin, 'POST', `/manage/sacos/${sacoA}/move`, { dir: 'up' });
    const restored = await ok(admin, 'GET', '/manage/sacos');
    expect(restored.items.filter((item: Body) => item.active).map((item: Body) => item.id)).toEqual([sacoA, sacoB]);

    const me = await ok(memberA, 'GET', '/me');
    expect(me.saco).toMatchObject({ id: sacoA, name: 'Sư Tử Vàng', active: true, onDuty: false, position: 1 });

    const audit = await stack.query<{ action: string; actor_role: string }>(
      `select action, actor_role::text as actor_role from admin_audit_log
        where action like 'trading_floor.%' order by created_at`,
    );
    expect(audit.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'trading_floor.saco_grant',
        'trading_floor.saco_update',
        'trading_floor.saco_move',
      ]),
    );
    expect(audit.some((row) => row.action === 'trading_floor.saco_grant' && row.actor_role === 'team_lead')).toBe(true);
    expect(audit.some((row) => row.action === 'trading_floor.saco_move' && row.actor_role === 'admin')).toBe(true);
  });

  let directConv = '';

  it('nhắn trực tiếp: mở cuộc chat, gửi, đọc, người ngoài cuộc không thấy, tin trống bị từ chối', async () => {
    expect((await call(u1, 'POST', '/chat/open', { sacoId: '00000000-0000-4000-8000-000000000000' })).statusCode).toBe(404);
    expect(errorOf(await call(memberA, 'POST', '/chat/open', { sacoId: sacoA }))).toBe('SELF_CHAT');

    const conv = await ok(u1, 'POST', '/chat/open', { sacoId: sacoA });
    directConv = conv.id;
    expect(conv).toMatchObject({ side: 'user', peerName: 'Sư Tử Vàng', matched: false, writable: true, unread: 0 });
    expect((await ok(u1, 'POST', '/chat/open', { sacoId: sacoA })).id).toBe(directConv);

    expect(errorOf(await call(u1, 'POST', `/chat/convs/${directConv}/send`, { text: '   ' }))).toBe('MESSAGE_INVALID');
    const sent = await ok(u1, 'POST', `/chat/convs/${directConv}/send`, { text: '  Xin chào SACO  ' });
    expect(sent).toMatchObject({ from: 'u', text: 'Xin chào SACO' });
    const fast = await call(u1, 'POST', `/chat/convs/${directConv}/send`, { text: 'quá nhanh' });
    expect(fast.statusCode).toBe(429);
    expect(errorOf(fast)).toBe('SEND_TOO_FAST');

    const inbox = await ok(memberA, 'GET', '/chat/inbox');
    expect(inbox.saco).toMatchObject({ id: sacoA, active: true });
    expect(inbox.asSaco).toHaveLength(1);
    expect(inbox.asSaco[0]).toMatchObject({ id: directConv, side: 'saco', peerName: 'Nam Bình', unread: 1 });
    expect(inbox.asSaco[0].last).toMatchObject({ from: 'u', text: 'Xin chào SACO' });
    expect((await ok(u1, 'GET', '/chat/inbox')).asUser[0]).toMatchObject({ id: directConv, unread: 0 });

    expect((await call(outsider, 'GET', `/chat/convs/${directConv}`)).statusCode).toBe(404);
    expect((await call(outsider, 'POST', `/chat/convs/${directConv}/send`, { text: 'chen ngang' })).statusCode).toBe(404);
    expect((await call(outsider, 'POST', `/chat/convs/${directConv}/read`)).statusCode).toBe(404);
    expect((await call(u1, 'GET', '/chat/convs/khong-phai-uuid')).statusCode).toBe(422);

    await sleep(300);
    const reply = await ok(memberA, 'POST', `/chat/convs/${directConv}/send`, { text: 'Chào bạn, mình nghe đây' });
    expect(reply.from).toBe('s');
    const seenByUser = await ok(u1, 'GET', `/chat/convs/${directConv}`);
    expect(seenByUser.messages.map((m: Body) => m.text)).toEqual(['Xin chào SACO', 'Chào bạn, mình nghe đây']);
    expect(seenByUser.unread).toBe(1);
    expect(seenByUser.peerReadAt).toBeGreaterThan(0);
    await ok(u1, 'POST', `/chat/convs/${directConv}/read`);
    expect((await ok(u1, 'GET', '/chat/inbox')).asUser[0].unread).toBe(0);
    const detailForSaco = await ok(memberA, 'GET', `/chat/convs/${directConv}`);
    expect(detailForSaco.peerReadAt).toBeGreaterThan(0);
  });

  let matchedConv = '';

  it('Chat SACO: khớp qua hai socket thật khi SACO đồng ý, hết giờ thì sang SACO kế, huỷ thì thu hồi lời mời', async () => {
    expect((await call(u1, 'POST', '/saco/duty', { on: true })).statusCode).toBe(403);

    const sacoSocket = await authed(memberA);
    const userSocket = await authed(u2);
    const duty = await ok(memberA, 'POST', '/saco/duty', { on: true });
    expect(duty).toMatchObject({ id: sacoA, onDuty: true });
    const manage = await ok(lead, 'GET', '/manage/sacos');
    expect(manage.items.find((item: Body) => item.id === sacoA)).toMatchObject({ onDuty: true, online: true });

    // SACO đồng ý trong cửa sổ lời mời.
    expect(await ok(u2, 'POST', '/chat/match')).toEqual({ running: true });
    expect(await ok(u2, 'POST', '/chat/match')).toEqual({ running: true });
    const invite = await waitFor(sacoSocket, (m) => m.type === 'chat:invite', 'chat:invite');
    expect(invite.invite).toMatchObject({ userName: 'Người 2' });
    await waitFor(userSocket, (m) => m.type === 'chat:match' && m.event.state === 'asking', 'asking');
    await ok(memberA, 'POST', `/chat/invites/${invite.invite.id}`, { accept: true });
    const matched = await waitFor(userSocket, (m) => m.type === 'chat:match' && m.event.state === 'matched', 'matched');
    matchedConv = matched.event.convId as string;
    await waitFor(sacoSocket, (m) => m.type === 'chat:invite:end' && m.id === invite.invite.id, 'invite:end');
    const sacoSawMessage = await waitFor(
      sacoSocket,
      (m) => m.type === 'chat:msg' && m.convId === matchedConv,
      'tin hệ thống tới SACO',
    );
    expect(sacoSawMessage.message.from).toBe('x');
    const inbox = await ok(u2, 'GET', '/chat/inbox');
    expect(inbox.matchedConvId).toBe(matchedConv);
    expect(inbox.asUser[0]).toMatchObject({ id: matchedConv, matched: true, writable: true, online: true });
    expect(await ok(u2, 'POST', '/chat/match')).toEqual({ convId: matchedConv });
    const lateAnswer = await call(memberA, 'POST', `/chat/invites/${invite.invite.id}`, { accept: true });
    expect(lateAnswer.statusCode).toBe(410);
    expect(errorOf(lateAnswer)).toBe('INVITE_EXPIRED');

    // Tin nhắn trong cuộc chat đã khớp tới cả hai socket; "đang soạn" tới bên kia.
    await sleep(300);
    await ok(u2, 'POST', `/chat/convs/${matchedConv}/send`, { text: 'Cho mình hỏi về VCB' });
    await waitFor(sacoSocket, (m) => m.type === 'chat:msg' && m.message?.text === 'Cho mình hỏi về VCB', 'chat:msg tới SACO');
    send(userSocket, { type: 'chat:typing', convId: matchedConv });
    await waitFor(sacoSocket, (m) => m.type === 'chat:typing' && m.convId === matchedConv && m.side === 'user', 'chat:typing');
    await ok(memberA, 'POST', `/chat/convs/${matchedConv}/read`);
    await waitFor(userSocket, (m) => m.type === 'chat:read' && m.convId === matchedConv && m.side === 'saco', 'chat:read');

    // Không ai trả lời: hết giờ, vì không còn SACO nào nên báo không khớp.
    const waiting = await authed(u3);
    await ok(u3, 'POST', '/chat/match');
    await waitFor(sacoSocket, (m) => m.type === 'chat:invite' && m.invite.userName === 'Người 3', 'lời mời cho u3');
    await waitFor(waiting, (m) => m.type === 'chat:match' && m.event.state === 'none', 'không khớp', 8000);

    // Huỷ giữa chừng: lời mời bị thu hồi.
    const before = sacoSocket.messages.length;
    await ok(u3, 'POST', '/chat/match');
    await until(
      () => sacoSocket.messages.slice(before).some((m) => m.type === 'chat:invite'),
      'lời mời thứ hai của u3',
    );
    await ok(u3, 'POST', '/chat/match/cancel');
    await waitFor(waiting, (m) => m.type === 'chat:match' && m.event.state === 'cancelled', 'cancelled');
    await until(
      () => sacoSocket.messages.slice(before).some((m) => m.type === 'chat:invite:end'),
      'invite:end sau khi huỷ',
    );

    // Đóng socket cuối của người đang tìm cũng là huỷ.
    const beforeThird = sacoSocket.messages.length;
    await ok(u3, 'POST', '/chat/match');
    await until(
      () => sacoSocket.messages.slice(beforeThird).some((m) => m.type === 'chat:invite'),
      'lời mời thứ ba của u3',
    );
    waiting.socket.close();
    await until(
      () => sacoSocket.messages.slice(beforeThird).some((m) => m.type === 'chat:invite:end'),
      'thu hồi khi mất socket',
    );
    await sleep(100);

    const invites = await ok(lead, 'GET', '/manage/invites?limit=50');
    const results = invites.items.map((item: Body) => item.result);
    expect(results).toEqual(expect.arrayContaining(['accept', 'timeout', 'cancel']));
    expect(invites.items.every((item: Body) => item.sacoName === 'Sư Tử Vàng')).toBe(true);
    // SACO ngoài nhóm không có trong nhật ký của trưởng nhóm này.
    expect(((await ok(lead2, 'GET', '/manage/invites')).items as Body[]).filter((i) => i.sacoName === 'Sư Tử Vàng')).toEqual([]);

    // SACO vắng thì Chat SACO không hỏi nữa: báo không khớp ngay.
    await ok(memberA, 'POST', '/saco/duty', { on: false });
    const again = await authed(u3);
    await ok(u3, 'POST', '/chat/match');
    await waitFor(again, (m) => m.type === 'chat:match' && m.event.state === 'none', 'không còn SACO trực');
  });

  it('lịch sử chat theo nhóm, gỡ quyền SACO làm cuộc chat chỉ đọc, gán lại thì mở lại', async () => {
    const convs = await ok(lead, 'GET', '/manage/convs');
    const ids = convs.items.map((item: Body) => item.id);
    expect(ids).toEqual(expect.arrayContaining([directConv, matchedConv]));
    expect(convs.items.find((item: Body) => item.id === matchedConv)).toMatchObject({
      userName: 'Người 2',
      sacoName: 'Sư Tử Vàng',
      matched: true,
    });
    expect((await ok(lead2, 'GET', '/manage/convs')).items).toEqual([]);
    expect((await call(lead2, 'GET', `/manage/convs/${matchedConv}`)).statusCode).toBe(404);
    expect((await call(u2, 'GET', `/manage/convs/${matchedConv}`)).statusCode).toBe(403);

    const unreadBefore = (await ok(memberA, 'GET', '/chat/inbox')).asSaco.map((c: Body) => [c.id, c.unread]);
    const detail = await ok(lead, 'GET', `/manage/convs/${matchedConv}`);
    expect(detail.messages.map((m: Body) => m.from)).toContain('x');
    expect(detail.messages.some((m: Body) => m.text === 'Cho mình hỏi về VCB')).toBe(true);
    // Xem lịch sử không đổi trạng thái chưa đọc của hai bên.
    expect((await ok(memberA, 'GET', '/chat/inbox')).asSaco.map((c: Body) => [c.id, c.unread])).toEqual(unreadBefore);

    const sacoSocket = await authed(memberA);
    const userSocket = await authed(u2);
    expect((await call(lead2, 'POST', `/manage/sacos/${sacoA}/remove`)).statusCode).toBe(404);
    const removed = await ok(lead, 'POST', `/manage/sacos/${sacoA}/remove`);
    expect(removed.items.find((item: Body) => item.id === sacoA)).toMatchObject({ active: false, onDuty: false, position: null });
    expect(removed.items.filter((item: Body) => item.active).map((item: Body) => [item.id, item.position])).toEqual([[sacoB, 1]]);
    expect((await ok(lead, 'POST', `/manage/sacos/${sacoA}/remove`)).items).toBeDefined();

    await waitFor(userSocket, (m) => m.type === 'chat:inbox', 'chat:inbox tới người dùng');
    await waitFor(sacoSocket, (m) => m.type === 'chat:inbox', 'chat:inbox tới SACO');
    const readOnly = await ok(u2, 'GET', `/chat/convs/${matchedConv}`);
    expect(readOnly.writable).toBe(false);
    expect(readOnly.messages.at(-1)).toMatchObject({ from: 'x' });
    expect(readOnly.messages.some((m: Body) => m.text === 'Cho mình hỏi về VCB')).toBe(true);
    const blocked = await call(u2, 'POST', `/chat/convs/${matchedConv}/send`, { text: 'còn đó không' });
    expect(blocked.statusCode).toBe(403);
    expect(errorOf(blocked)).toBe('SACO_INACTIVE');
    expect((await call(memberA, 'POST', `/chat/convs/${directConv}/send`, { text: 'tôi còn quyền?' })).statusCode).toBe(403);
    expect((await call(memberA, 'POST', '/saco/duty', { on: true })).statusCode).toBe(403);
    expect(errorOf(await call(u1, 'POST', '/chat/open', { sacoId: sacoA }))).toBe('SACO_NOT_FOUND');
    expect((await ok(memberA, 'GET', '/me')).saco).toMatchObject({ id: sacoA, active: false });

    const regranted = await ok(lead, 'POST', '/manage/sacos', { userId: memberA.id }, 201);
    expect(regranted).toMatchObject({ id: sacoA, active: true, onDuty: false, position: 2 });
    const writable = await ok(u2, 'GET', `/chat/convs/${matchedConv}`);
    expect(writable.writable).toBe(true);
    await sleep(300);
    expect((await ok(u2, 'POST', `/chat/convs/${matchedConv}/send`, { text: 'quay lại rồi' })).from).toBe('u');

    const audit = await stack.query<{ action: string }>(
      "select action from admin_audit_log where action = 'trading_floor.saco_remove'",
    );
    expect(audit).toHaveLength(1);
  });
});
