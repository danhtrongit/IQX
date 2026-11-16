import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { floorChatTiming } from '../../src/modules/trading-floor/floor-chat.logic.js';
import { FLOOR_CLOCK } from '../../src/modules/trading-floor/floor-clock.js';
import { FLOOR_MARKET, type FloorMarketPort } from '../../src/modules/trading-floor/floor-market.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

// Khu giao dịch trên PostgreSQL và Redis thật với migration 0047, WebSocket thật (`ws`) và access token
// thật: hồ sơ nhân vật, Thần Tài v2 (gieo quẻ, dự đoán, cầu mã, kết quả cả sàn, hạn 11:30) và quản trị
// thư viện quẻ, trưởng nhóm gán quyền SACO cho nhóm mình, nhắn trực tiếp, Chat SACO khớp qua hai socket,
// và gỡ quyền làm cuộc chat chỉ đọc. Đồng hồ của khu được dịch về tháng 11/2026 để ngày khấn xác định.
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
  /** VNINDEX 1.756,52 (+9,62 so với tham chiếu 1.746,90) và đúng hai mã niêm yết FPT, VCB. */
  const market: FloorMarketPort = {
    vnindex: async () => ({ value: 1756.52, change: 9.62, time: clock.now().getTime() }),
    listedSymbols: async () => new Set(['FPT', 'VCB']),
    indexClose: async () => null,
  };

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
        if (token?.startsWith('guest:')) {
          socket.send(JSON.stringify({ type: 'auth', guest: token.slice('guest:'.length) }));
        } else if (token !== null) socket.send(JSON.stringify({ type: 'auth', token }));
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
    // Nhân vật tự động làm lệch số người trên sàn mà các kịch bản dưới đây đếm.
    process.env.FLOOR_BOTS_ENABLED = 'false';
    stack = await startSystemStack(
      {},
      {
        overrideProviders: [
          { token: FLOOR_CLOCK, value: clock },
          { token: FLOOR_MARKET, value: market },
        ],
      },
    );
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

    // Khách: chỉ nhập tên và tạo nhân vật, vào sàn qua token khách; nhân vật riêng bị chặn.
    const reserved = await call(null, 'POST', '/guest', {
      name: 'Khách lạ',
      avatar: 'danhtrongit',
      color: 'default',
    });
    expect(reserved.statusCode).toBe(403);
    const created = await call(null, 'POST', '/guest', {
      name: 'Khách Một',
      avatar: 'female01',
      color: 'default',
    });
    expect(created.statusCode).toBe(200);
    const guestToken = (created.json() as { token: string }).token;
    const guest = await connect(`guest:${guestToken}`);
    const ready = await waitFor(guest, (m) => m.type === 'ready', 'ready của khách');
    expect(ready.guest).toBe(true);
    send(guest, { type: 'hello', x: 30, y: 30, facing: 's', moving: false });
    const guestWelcome = await waitFor(guest, (m) => m.type === 'welcome', 'welcome của khách');
    expect(guestWelcome.self).toMatchObject({ name: 'Khách Một', avatar: 'female01' });
    await waitFor(u1Floor, (m) => m.type === 'peer:join' && m.peer.name === 'Khách Một', 'khách join');
    const badGuest = await connect('guest:' + 'x'.repeat(43));
    await until(() => badGuest.closed !== null, 'đóng vì sai token khách');
    expect(badGuest.closed).toBe(4401);
    guest.socket.close();
    await waitFor(u1Floor, (m) => m.type === 'peer:leave', 'khách rời');
  });

  it('Thần Tài v2: gieo quẻ một lần (song song vẫn một lá), dự đoán, cầu mã, kết quả cả sàn, hạn 11:30', async () => {
    const ngay = '2026-11-12';
    // Cơ sở dữ liệu ngoài có thể còn dữ liệu của lần chạy trước.
    await stack.query('delete from tf_khan_daily');
    await stack.query('delete from tf_la_seen');
    // Thư viện trống: không rút được.
    await stack.query('update tf_kd_la set active = false');
    const empty = await call(u1, 'POST', '/than-tai/draw');
    expect(empty.statusCode).toBe(503);
    expect(errorOf(empty)).toBe('THU_VIEN_TRONG');

    await stack.query(
      `insert into tf_kd_que (id, ten, chu_han, hao, que_tren, que_duoi, tuong, thoan, thoan_nghia)
       values (1, 'Thuần Càn', '乾為天', '111111', 'can', 'can', 'Tượng thử', 'Thoán thử', 'Nghĩa thoán thử')
       on conflict (id) do update set ten = excluded.ten, chu_han = excluded.chu_han`,
    );
    await stack.query(
      `insert into tf_kd_la (que_id, hao_dong, ten_hao, hao_van, hao_nghia, hang, luan, chot, active) values
         (1, 1, 'Sơ Cửu', 'Tiềm long vật dụng', 'Rồng còn ẩn', 'dai_cat', 'Luận thử một', 'Chốt thử một', true),
         (1, 2, 'Cửu Nhị', 'Kiến long tại điền', 'Rồng hiện ruộng', 'than_trong', 'Luận thử hai', 'Chốt thử hai', true)
       on conflict (que_id, hao_dong) do update
         set hang = excluded.hang, luan = excluded.luan, chot = excluded.chot, active = true`,
    );

    const before = await ok(u1, 'GET', '/than-tai/today');
    expect(before).toMatchObject({
      status: 'chua_khan',
      step: 1,
      la: null,
      prediction: null,
      tickers: null,
      vnindexRef: 1746.9,
      deadline: Date.UTC(2026, 10, 12, 4, 30),
    });
    expect(before.day).toMatchObject({ date: ngay, hop: expect.any(Array), kieng: expect.any(Array) });
    expect(before.day.hop).toHaveLength(2);
    expect(before.day.kieng).toHaveLength(2);
    expect(before.day.hop.every((g: Body) => g.nganh.length <= 4)).toBe(true);
    expect((await call(null, 'GET', '/than-tai/today')).statusCode).toBe(401);

    expect(errorOf(await call(u3, 'POST', '/than-tai/predict', { direction: 'up' }))).toBe('CHUA_GIEO_QUE');
    expect(errorOf(await call(u1, 'POST', '/than-tai/cau', { tickers: [] }))).toBe('CHUA_DU_DOAN');

    const drawn = await ok(u1, 'POST', '/than-tai/draw');
    expect(drawn).toMatchObject({ status: 'dang_do', step: 2, prediction: null, tickers: null });
    expect(drawn.la.que).toMatchObject({ id: 1, hao: '111111', tren: { key: 'can' }, duoi: { key: 'can' } });
    expect(drawn.la.hangLabel).toBe(drawn.la.hang === 'dai_cat' ? 'Đại cát' : 'Thận trọng');
    expect((await ok(u1, 'POST', '/than-tai/draw')).la.id).toBe(drawn.la.id);
    expect((await ok(u1, 'GET', '/than-tai/today')).la.id).toBe(drawn.la.id);

    // Gọi song song vẫn chỉ ra một lá và một dòng.
    const racers = await Promise.all(
      Array.from({ length: 6 }, () => call(u2, 'POST', '/than-tai/draw')),
    );
    expect(racers.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(new Set(racers.map((r) => (r.json() as Body).la.id)).size).toBe(1);
    const rows = await stack.query(
      `select 1 from tf_khan_daily where actor_key = $1 and ngay = $2::date`,
      [`u:${u2.id}`, ngay],
    );
    expect(rows).toHaveLength(1);
    const seen = await stack.query(`select 1 from tf_la_seen where actor_key = $1`, [`u:${u2.id}`]);
    expect(seen).toHaveLength(1);

    // Bước 2.
    expect((await call(u1, 'POST', '/than-tai/predict', { direction: 'sideways' })).statusCode).toBe(422);
    const predicted = await ok(u1, 'POST', '/than-tai/predict', { direction: 'up' });
    expect(predicted).toMatchObject({ status: 'dang_do', step: 3, prediction: 'up', tickers: null });
    expect(errorOf(await call(u1, 'POST', '/than-tai/predict', { direction: 'down' }))).toBe('DA_DU_DOAN');

    // Bước 3.
    expect(errorOf(await call(u1, 'POST', '/than-tai/cau', { tickers: ['FPT', 'FPT'] }))).toBe('MA_KHONG_HOP_LE');
    expect(errorOf(await call(u1, 'POST', '/than-tai/cau', { tickers: ['F'] }))).toBe('MA_KHONG_HOP_LE');
    expect(errorOf(await call(u1, 'POST', '/than-tai/cau', { tickers: ['ZZZ'] }))).toBe('MA_KHONG_HOP_LE');
    const tooMany = await call(u1, 'POST', '/than-tai/cau', { tickers: ['FPT', 'VCB', 'VNM', 'HPG'] });
    expect(tooMany.statusCode).toBe(422);
    expect(errorOf(tooMany)).toBe('QUA_3_MA');
    const results403 = await call(u1, 'GET', '/than-tai/results');
    expect(results403.statusCode).toBe(403);
    expect(errorOf(results403)).toBe('KET_QUA_CHUA_MO');
    const done = await ok(u1, 'POST', '/than-tai/cau', { tickers: ['fpt'] });
    expect(done).toMatchObject({ status: 'da_xong', step: 4, prediction: 'up', tickers: ['FPT'] });
    expect(errorOf(await call(u1, 'POST', '/than-tai/cau', { tickers: [] }))).toBe('DA_CAU');

    await ok(u2, 'POST', '/than-tai/predict', { direction: 'down' });
    const skipped = await ok(u2, 'POST', '/than-tai/cau', { tickers: [] });
    expect(skipped).toMatchObject({ status: 'da_xong', step: 4, tickers: [] });

    // Kết quả cả sàn: người chưa xong và người ẩn danh chưa xem được trước 11:30.
    expect(errorOf(await call(u3, 'GET', '/than-tai/results'))).toBe('KET_QUA_CHUA_MO');
    expect(errorOf(await call(null, 'GET', '/than-tai/results'))).toBe('KET_QUA_CHUA_MO');
    const results = await ok(u1, 'GET', '/than-tai/results');
    expect(results).toMatchObject({
      total: 2,
      up: 1,
      flat: 0,
      down: 1,
      top5: [{ ticker: 'FPT', count: 1 }],
    });

    // Lá bị tắt sau khi gieo vẫn hiển thị đủ trong ngày.
    await stack.query('update tf_kd_la set active = false');
    const rendered = await ok(u1, 'GET', '/than-tai/today');
    expect(rendered.la).toMatchObject({ id: drawn.la.id, luan: drawn.la.luan, chot: drawn.la.chot });

    // Hạn 11:30 giờ Việt Nam: 11:29:59 còn khấn được, 11:30:00 thì HET_GIO.
    await stack.query('update tf_kd_la set active = true where que_id = 1');
    setClock('2026-11-12T04:29:59Z');
    expect((await ok(u3, 'POST', '/than-tai/draw')).status).toBe('dang_do');
    setClock('2026-11-12T04:30:00Z');
    const late = await call(u3, 'POST', '/than-tai/predict', { direction: 'flat' });
    expect(late.statusCode).toBe(409);
    expect(errorOf(late)).toBe('HET_GIO');
    expect(errorOf(await call(u3, 'POST', '/than-tai/draw'))).toBe('HET_GIO');
    expect(errorOf(await call(u3, 'POST', '/than-tai/cau', { tickers: [] }))).toBe('HET_GIO');
    const closed = await ok(u3, 'GET', '/than-tai/today');
    expect(closed).toMatchObject({ status: 'het_gio', step: 2 });
    expect((await ok(u1, 'GET', '/than-tai/today')).status).toBe('da_xong');
    // Sau 11:30 ai cũng xem được kết quả, kể cả chưa đăng nhập.
    expect(await ok(null, 'GET', '/than-tai/results')).toMatchObject({ total: 2, up: 1, down: 1 });

    // Qua nửa đêm giờ Việt Nam là ngày mới, khấn lại được.
    setClock('2026-11-12T17:30:00Z'); // 00:30 ngày 13
    const next = await ok(u1, 'GET', '/than-tai/today');
    expect(next).toMatchObject({ status: 'chua_khan', step: 1, la: null });
    expect(next.day.date).toBe('2026-11-13');
    setClock('2026-11-12T03:00:00Z');
  });

  it('Thần Tài: bảng vinh danh tháng chỉ chấm ngày đã có giá đóng cửa, chỉ xếp tài khoản có hồ sơ', async () => {
    const board = (session: Session | null, query = '?month=2026-11') =>
      ok(session, 'GET', `/than-tai/leaderboard${query}`);
    try {
      // Nến VNINDEX: 02/11 +10 (tăng), 03/11 0 (đi ngang), 04/11 -10 (giảm), 05/11 +5 (tăng), 12/11 +15
      // (hôm nay). 09/11 không có nến (nghỉ). Nến 30/10 là tham chiếu của 02/11.
      await stack.query('delete from market_index_bars');
      await stack.query(
        `insert into market_index_bars (symbol, trade_date, open, high, low, close, volume) values
           ('VNINDEX', '2026-10-30', 1700, 1700, 1700, 1700, 1),
           ('VNINDEX', '2026-11-02', 1710, 1710, 1710, 1710, 1),
           ('VNINDEX', '2026-11-03', 1710, 1710, 1710, 1710, 1),
           ('VNINDEX', '2026-11-04', 1700, 1700, 1700, 1700, 1),
           ('VNINDEX', '2026-11-05', 1705, 1705, 1705, 1705, 1),
           ('VNINDEX', '2026-11-12', 1720, 1720, 1720, 1720, 1)`,
      );
      const created = await call(null, 'POST', '/guest', {
        name: 'Khách Bảng',
        avatar: 'female01',
        color: 'default',
      });
      const guestToken = (created.json() as { token: string }).token;
      const [guestRow] = await stack.query<{ id: string }>(
        `select id from tf_guests where display_name = 'Khách Bảng'`,
      );
      const [la] = await stack.query<{ id: number }>('select id from tf_kd_la order by id limit 1');
      await stack.query('delete from tf_khan_daily');
      const calls: Array<[string, ...string[]]> = [
        // u1 đoán đúng cả bốn ngày đã chốt; 09/11 (không có nến) và 12/11 (chưa 15:00) chưa chấm.
        [`u:${u1.id}`, 'up', 'flat', 'down', 'up', 'up', 'up'],
        [`u:${u2.id}`, 'up', 'up', 'down', 'down'],
        [`u:${u3.id}`, 'up'],
        // Khách và tài khoản chưa có hồ sơ trên sàn không được xếp hạng.
        [`g:${guestRow!.id}`, 'up', 'flat', 'down', 'up'],
        [`u:${memberA.id}`, 'up', 'flat', 'down', 'up'],
      ];
      const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-09', '2026-11-12'];
      for (const [actorKey, ...picks] of calls) {
        for (const [index, pick] of picks.entries()) {
          await stack.query(
            `insert into tf_khan_daily (actor_key, ngay, la_id, hang, du_doan, step)
             values ($1, $2, $3, 'dai_cat', $4, 3)`,
            [actorKey, days[index], la!.id, pick],
          );
        }
      }
      // Một người chỉ mới gieo quẻ (chưa dự đoán) không có mặt.
      await stack.query(
        `insert into tf_khan_daily (actor_key, ngay, la_id, hang, step) values ($1, '2026-11-02', $2, 'dai_cat', 2)`,
        [`u:${outsider.id}`, la!.id],
      );

      setClock('2026-11-12T03:00:00Z'); // 10:00: nến 12/11 đã có nhưng phiên chưa chốt
      const anon = await board(null);
      expect(anon).toMatchObject({ month: '2026-11', scoredDays: 4, me: null });
      expect(anon.rows).toEqual([
        { rank: 1, name: 'Nam Bình', avatar: 'male02', color: 'forest', correct: 4, total: 4 },
        { rank: 2, name: 'Người 2', avatar: 'female01', color: 'default', correct: 2, total: 4 },
        { rank: 3, name: 'Người 3', avatar: 'female01', color: 'default', correct: 1, total: 1 },
      ]);
      expect((await board(u2)).me).toMatchObject({ rank: 2, correct: 2, total: 4 });
      expect((await board(memberA)).me).toBeNull();
      const guestView = await app.inject({
        method: 'GET',
        url: `${BASE}/than-tai/leaderboard?month=2026-11`,
        headers: { 'x-floor-guest': guestToken },
      });
      expect(guestView.statusCode).toBe(200);
      expect(guestView.json()).toMatchObject({ me: null, scoredDays: 4 });

      // Sau 15:00 nến 12/11 được chấm (kết quả được nhớ 60 giây nên đồng hồ nhảy qua hạn nhớ).
      setClock('2026-11-12T08:30:00Z'); // 15:30
      const after = await board(u1);
      expect(after.scoredDays).toBe(5);
      expect(after.rows[0]).toMatchObject({ name: 'Nam Bình', correct: 5, total: 5 });
      expect(after.me).toMatchObject({ rank: 1, correct: 5, total: 5 });

      // Mặc định là tháng hiện tại; tháng chưa có ngày nào được chấm thì trống.
      expect((await board(null, '')).month).toBe('2026-11');
      expect(await board(null, '?month=2026-10')).toMatchObject({
        month: '2026-10',
        scoredDays: 0,
        rows: [],
        me: null,
      });
      const bad = await call(null, 'GET', '/than-tai/leaderboard?month=2026-13');
      expect(bad.statusCode).toBe(422);
    } finally {
      setClock('2026-11-12T03:00:00Z');
      await stack.query('delete from market_index_bars');
    }
  });

  it('quản trị Thần Tài: chỉ quản trị viên, sửa lá/quẻ/hành có kiểm tra độ dài và ghi nhật ký', async () => {
    const MANAGE = '/manage/than-tai';
    expect((await call(u1, 'GET', `${MANAGE}/la`)).statusCode).toBe(403);
    expect((await call(lead, 'GET', `${MANAGE}/hanh`)).statusCode).toBe(403);
    expect((await call(null, 'GET', `${MANAGE}/la`)).statusCode).toBe(401);

    const list = await ok(admin, 'GET', `${MANAGE}/la`);
    const target = list.items.find((item: Body) => item.queId === 1 && item.haoDong === 1);
    expect(target).toMatchObject({ queTen: expect.any(String), hao: '111111', active: true });

    const updated = await ok(admin, 'PUT', `${MANAGE}/la/${target.id}`, {
      luan: 'Luận đã sửa',
      hang: 'trung_cat',
      active: false,
    });
    expect(updated).toMatchObject({ id: target.id, luan: 'Luận đã sửa', hang: 'trung_cat', active: false });
    expect((await call(admin, 'PUT', `${MANAGE}/la/${target.id}`, { luan: 'x'.repeat(1201) })).statusCode).toBe(422);
    expect((await call(admin, 'PUT', `${MANAGE}/la/${target.id}`, { chot: 'x'.repeat(121) })).statusCode).toBe(422);
    expect((await call(admin, 'PUT', `${MANAGE}/la/${target.id}`, { hang: 'tuyet_cat' })).statusCode).toBe(422);
    expect((await call(admin, 'PUT', `${MANAGE}/la/${target.id}`, {})).statusCode).toBe(422);
    expect((await call(admin, 'PUT', `${MANAGE}/la/99999999`, { luan: 'y' })).statusCode).toBe(404);

    const que = await ok(admin, 'PUT', `${MANAGE}/que/1`, { tuong: 'Tượng đã sửa' });
    expect(que).toMatchObject({ id: 1, tuong: 'Tượng đã sửa' });
    expect((await call(admin, 'PUT', `${MANAGE}/que/65`, { tuong: 'z' })).statusCode).toBe(422);

    const hanh = await ok(admin, 'GET', `${MANAGE}/hanh`);
    expect(hanh.items.map((item: Body) => item.hanh)).toEqual(['kim', 'moc', 'thuy', 'hoa', 'tho']);
    const kim = await ok(admin, 'PUT', `${MANAGE}/hanh/kim`, {
      nganh: ['Ngân hàng', 'Chứng khoán'],
      mau: [{ ten: 'Trắng', hex: '#FFFFFF' }],
      huong: 'Tây',
    });
    expect(kim).toMatchObject({ hanh: 'kim', nganh: ['Ngân hàng', 'Chứng khoán'], huong: 'Tây' });
    expect(
      (await call(admin, 'PUT', `${MANAGE}/hanh/kim`, { mau: [{ ten: 'Xấu', hex: 'trắng' }] })).statusCode,
    ).toBe(422);
    expect((await call(admin, 'PUT', `${MANAGE}/hanh/dat`, { huong: 'x' })).statusCode).toBe(422);

    const audit = await stack.query(
      `select action from admin_audit_log where action like 'trading_floor.than_tai_%' order by created_at`,
    );
    expect(audit.map((row) => row.action)).toEqual([
      'trading_floor.than_tai_la_update',
      'trading_floor.than_tai_que_update',
      'trading_floor.than_tai_hanh_update',
    ]);
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

  it('khách chat với SACO như tài khoản: nhắn trực tiếp, hộp thư, Chat SACO qua socket, chỉ phần SACO là của tài khoản', async () => {
    const guestCall = (token: string, method: string, path: string, payload?: unknown) =>
      app.inject({
        method: method as 'GET',
        url: `${BASE}${path}`,
        headers: { 'x-floor-guest': token },
        ...(payload === undefined ? {} : { payload: payload as Json }),
      });
    const guestOk = async (
      token: string,
      method: string,
      path: string,
      payload?: unknown,
    ): Promise<Body> => {
      const response = await guestCall(token, method, path, payload);
      expect(response.statusCode, `${method} ${path}: ${response.body}`).toBe(200);
      return response.json();
    };
    const newGuest = async (name: string): Promise<string> => {
      const created = await call(null, 'POST', '/guest', { name, avatar: 'female01', color: 'default' });
      expect(created.statusCode, created.body).toBe(200);
      return (created.json() as { token: string }).token;
    };

    const token = await newGuest('Khách Chat');
    const other = await newGuest('Khách Khác');

    // Không có danh tính (cả tài khoản lẫn khách) thì vẫn là 401; phần SACO không mở cho khách.
    expect((await call(null, 'GET', '/chat/inbox')).statusCode).toBe(401);
    expect((await call(null, 'POST', '/chat/open', { sacoId: sacoA })).statusCode).toBe(401);
    expect((await guestCall(token, 'POST', '/saco/duty', { on: true })).statusCode).toBe(401);
    expect((await guestCall(token, 'POST', '/chat/invites/1', { accept: true })).statusCode).toBe(401);
    expect((await guestCall('x'.repeat(43), 'GET', '/chat/inbox')).statusCode).toBe(401);

    // Nhắn SACO: mở cuộc chat trực tiếp, dùng lại cuộc cũ, gửi tin.
    const conv = await guestOk(token, 'POST', '/chat/open', { sacoId: sacoA });
    expect(conv).toMatchObject({ side: 'user', peerName: 'Sư Tử Vàng', matched: false, writable: true, unread: 0 });
    expect((await guestOk(token, 'POST', '/chat/open', { sacoId: sacoA })).id).toBe(conv.id);
    const sent = await guestOk(token, 'POST', `/chat/convs/${conv.id}/send`, { text: '  Chào SACO, mình là khách  ' });
    expect(sent).toMatchObject({ from: 'u', text: 'Chào SACO, mình là khách' });
    const fast = await guestCall(token, 'POST', `/chat/convs/${conv.id}/send`, { text: 'quá nhanh' });
    expect(fast.statusCode).toBe(429);
    expect(errorOf(fast)).toBe('SEND_TOO_FAST');
    const guestInbox = await guestOk(token, 'GET', '/chat/inbox');
    expect(guestInbox.saco).toBeNull();
    expect(guestInbox.asSaco).toEqual([]);
    expect(guestInbox.asUser.map((c: Body) => c.id)).toEqual([conv.id]);

    // SACO thấy tin trong hộp thư, đúng tên khách và có dấu khách; người ngoài cuộc không đọc được.
    const inbox = await ok(memberA, 'GET', '/chat/inbox');
    const entry = inbox.asSaco.find((c: Body) => c.id === conv.id);
    expect(entry).toMatchObject({ side: 'saco', peerName: 'Khách Chat (khách)', unread: 1 });
    expect(entry.last).toMatchObject({ from: 'u', text: 'Chào SACO, mình là khách' });
    expect((await guestCall(other, 'GET', `/chat/convs/${conv.id}`)).statusCode).toBe(404);
    expect((await guestCall(other, 'POST', `/chat/convs/${conv.id}/send`, { text: 'chen ngang' })).statusCode).toBe(404);
    expect((await call(outsider, 'GET', `/chat/convs/${conv.id}`)).statusCode).toBe(404);

    // Trưởng nhóm xem được lịch sử, tên khách có dấu khách và không lỗi dù không có tài khoản.
    const staff = await ok(lead, 'GET', '/manage/convs');
    expect(staff.items.find((item: Body) => item.id === conv.id)).toMatchObject({
      userName: 'Khách Chat (khách)',
      sacoName: 'Sư Tử Vàng',
    });
    expect((await ok(lead, 'GET', `/manage/convs/${conv.id}`)).userName).toBe('Khách Chat (khách)');

    // SACO trả lời; khách đọc, đánh dấu đã xem.
    await sleep(300);
    expect((await ok(memberA, 'POST', `/chat/convs/${conv.id}/send`, { text: 'Chào bạn, mình nghe đây' })).from).toBe('s');
    const seen = await guestOk(token, 'GET', `/chat/convs/${conv.id}`);
    expect(seen.messages.map((m: Body) => m.text)).toEqual(['Chào SACO, mình là khách', 'Chào bạn, mình nghe đây']);
    expect(seen).toMatchObject({ unread: 1, writable: true });
    expect(seen.peerReadAt).toBeGreaterThan(0);
    await guestOk(token, 'POST', `/chat/convs/${conv.id}/read`);
    expect((await guestOk(token, 'GET', '/chat/inbox')).asUser[0].unread).toBe(0);

    // Thời gian thực: socket khách và socket SACO nhận tin, "đang soạn", "đã xem", và khách hiện online.
    const sacoSocket = await authed(memberA);
    const guestSocket = await connect(`guest:${token}`);
    await waitFor(guestSocket, (m) => m.type === 'ready' && m.guest === true, 'ready của khách');
    expect((await ok(memberA, 'GET', '/chat/inbox')).asSaco.find((c: Body) => c.id === conv.id).online).toBe(true);
    send(guestSocket, { type: 'chat:typing', convId: conv.id });
    await waitFor(sacoSocket, (m) => m.type === 'chat:typing' && m.convId === conv.id && m.side === 'user', 'khách đang soạn');
    await sleep(300);
    await guestOk(token, 'POST', `/chat/convs/${conv.id}/send`, { text: 'Cho mình hỏi về VCB' });
    await waitFor(sacoSocket, (m) => m.type === 'chat:msg' && m.message?.text === 'Cho mình hỏi về VCB', 'tin của khách tới SACO');
    await waitFor(guestSocket, (m) => m.type === 'chat:msg' && m.message?.text === 'Cho mình hỏi về VCB', 'tin của khách tới chính khách');
    send(sacoSocket, { type: 'chat:typing', convId: conv.id });
    await waitFor(guestSocket, (m) => m.type === 'chat:typing' && m.convId === conv.id && m.side === 'saco', 'SACO đang soạn');
    await ok(memberA, 'POST', `/chat/convs/${conv.id}/read`);
    await waitFor(guestSocket, (m) => m.type === 'chat:read' && m.convId === conv.id && m.side === 'saco', 'chat:read tới khách');
    await sleep(300);
    await ok(memberA, 'POST', `/chat/convs/${conv.id}/send`, { text: 'VCB đang tích luỹ' });
    await waitFor(guestSocket, (m) => m.type === 'chat:msg' && m.message?.text === 'VCB đang tích luỹ', 'tin của SACO tới khách');
    expect(guestSocket.messages.some((m) => m.type === 'error')).toBe(false);

    // Chat SACO: khách được hỏi như tài khoản; SACO đồng ý thì khớp và nhận sự kiện qua socket khách.
    await ok(memberA, 'POST', '/saco/duty', { on: true });
    expect(await guestOk(token, 'POST', '/chat/match')).toEqual({ running: true });
    expect(await guestOk(token, 'POST', '/chat/match')).toEqual({ running: true });
    const invite = await waitFor(sacoSocket, (m) => m.type === 'chat:invite' && m.invite.userName === 'Khách Chat (khách)', 'lời mời của khách');
    await waitFor(guestSocket, (m) => m.type === 'chat:match' && m.event.state === 'asking', 'asking tới khách');
    await ok(memberA, 'POST', `/chat/invites/${invite.invite.id}`, { accept: true });
    const matched = await waitFor(guestSocket, (m) => m.type === 'chat:match' && m.event.state === 'matched', 'matched tới khách');
    expect(matched.event.convId).toBe(conv.id);
    expect((await guestOk(token, 'GET', '/chat/inbox')).matchedConvId).toBe(conv.id);
    expect(await guestOk(token, 'POST', '/chat/match')).toEqual({ convId: conv.id });

    // Huỷ lượt tìm bằng REST, rồi đóng socket khách giữa lượt cũng là huỷ.
    const second = await newGuest('Khách Hai');
    const secondSocket = await connect(`guest:${second}`);
    await waitFor(secondSocket, (m) => m.type === 'ready', 'ready của khách hai');
    const before = sacoSocket.messages.length;
    expect(await guestOk(second, 'POST', '/chat/match')).toEqual({ running: true });
    await until(() => sacoSocket.messages.slice(before).some((m) => m.type === 'chat:invite'), 'lời mời của khách hai');
    secondSocket.socket.close();
    await until(() => sacoSocket.messages.slice(before).some((m) => m.type === 'chat:invite:end'), 'thu hồi khi khách hai mất socket');
    expect(await guestOk(second, 'POST', '/chat/match/cancel')).toEqual({ ok: true });

    // Nhật ký lời mời của trưởng nhóm có dòng của khách, ghi bằng cột guest_id.
    const logged = await stack.query<{ guest_id: string | null; user_id: string | null }>(
      'select guest_id, user_id from tf_chat_invites where guest_id is not null',
    );
    expect(logged.length).toBeGreaterThanOrEqual(2);
    expect(logged.every((row) => row.user_id === null)).toBe(true);
    const staffInvites = await ok(lead, 'GET', '/manage/invites?limit=50');
    expect(staffInvites.items.some((item: Body) => item.userName === 'Khách Chat (khách)' && item.result === 'accept')).toBe(true);

    await ok(memberA, 'POST', '/saco/duty', { on: false });
    guestSocket.socket.close();
  });
});

