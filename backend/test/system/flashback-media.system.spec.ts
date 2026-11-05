import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { vietnamDate } from '../../src/modules/flashback/flashback.round-builder.js';
import { FLASHBACK_CLOCK } from '../../src/modules/flashback/flashback.service.js';
import { FlashbackDatasetBuilder } from '../../src/modules/flashback/flashback-dataset.builder.js';
import type { DatasetRawRow } from '../../src/modules/flashback/flashback-dataset.logic.js';
import { FLASHBACK_DATASET_SOURCE } from '../../src/modules/flashback/flashback-dataset.source.js';
import { FlashbackMediaHub } from '../../src/modules/flashback/flashback-media.hub.js';
import { FlashbackRoomsService } from '../../src/modules/flashback/flashback-rooms.service.js';
import { weekdaysFrom } from '../unit/helpers/flashback-dataset-fixtures.js';
import { FakeDatasetSource } from '../unit/helpers/flashback-dataset-memory.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

// Flashback v2.5 · máy chủ thời gian thực (ảnh chat, cuộc gọi, tín hiệu WebRTC) trên PostgreSQL và
// Redis thật, WebSocket thật (`ws`), xác thực bằng access token thật. Ảnh chỉ nằm trong bộ nhớ: ở
// đây kiểm giao theo thành viên, tắt tiếng, phiên của ván thật, dọn khi rời phòng và khi phòng đóng.
const BASE = '/api/v2/flashback';
const DATASET_SYMBOLS = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF'];

function datasetRows(symbol: string, dates: readonly string[]): DatasetRawRow[] {
  const seed = symbol.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  let price = 50_000;
  return dates.map((date, index) => {
    price *= 1 + 0.02 * Math.sin((index + 1) * 1.7 + seed);
    const close = Math.round(price);
    return { date, open: close, high: close, low: close, close, volume: 1_000_000 };
  });
}

function datasetSource(): FakeDatasetSource {
  const today = vietnamDate(new Date());
  const weekdays = Math.ceil(((Date.now() - Date.UTC(2012, 0, 2)) / 86_400_000) * (5 / 7)) + 10;
  const dates = weekdaysFrom('2012-01-02', weekdays).filter((date) => date < today);
  const source = new FakeDatasetSource();
  source.basketSymbols = [...DATASET_SYMBOLS];
  source.calendarDates = dates;
  for (const symbol of DATASET_SYMBOLS) source.histories.set(symbol, datasetRows(symbol, dates));
  return source;
}

/** PNG 32x16 tối thiểu: đủ phần đầu tệp để server đọc đúng kiểu và kích thước khung. */
const PNG = (() => {
  const buffer = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(32, 16);
  buffer.writeUInt32BE(16, 20);
  return buffer;
})().toString('base64');

type Session = Awaited<ReturnType<typeof registerAndLogin>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Message = Record<string, any>;
type Client = { socket: WebSocket; messages: Message[]; closed: number | null; session: Session };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, label: string, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`Hết giờ chờ: ${label}`);
    await sleep(15);
  }
}

describe('system acceptance: Flashback v2.5 · WebSocket phòng (ảnh, cuộc gọi, tín hiệu)', () => {
  let stack: SystemStack;
  let app: NestFastifyApplication;
  let wsUrl = '';
  const clock = { at: new Date() };
  const open: WebSocket[] = [];

  beforeAll(async () => {
    stack = await startSystemStack(
      {},
      {
        overrideProviders: [
          { token: FLASHBACK_DATASET_SOURCE, value: datasetSource() },
          { token: FLASHBACK_CLOCK, value: { now: () => clock.at } },
        ],
      },
    );
    app = stack.app;
    await stack.query(
      `insert into flashback_settings (key, value) values ('dataset', $1::jsonb)
       on conflict (key) do update set value = flashback_settings.value || excluded.value`,
      [JSON.stringify({ min_symbols: DATASET_SYMBOLS.length })],
    );
    const built = await app.get(FlashbackDatasetBuilder).build({ trigger: 'cli' });
    expect(built).toMatchObject({ status: 'active', okCount: DATASET_SYMBOLS.length });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    wsUrl = `ws://127.0.0.1:${address.port}/api/v2/flashback/ws`;
  }, 180_000);

  afterAll(async () => {
    for (const socket of open) socket.terminate();
    await stack?.close();
  });

  const call = (session: Session, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({
      method,
      url: `${BASE}/${url}`,
      headers: authHeader(session.accessToken),
      ...(payload ? { payload } : {}),
    });

  async function user(name: string): Promise<Session> {
    const session = await registerAndLogin(app, name);
    await stack.query(
      `insert into coin_wallets (user_id, balance, last_seq) values ($1, 1000, 0)
       on conflict (user_id) do update set balance = excluded.balance`,
      [session.id],
    );
    return session;
  }

  /** Mở socket thật; có `token` thì xác thực ngay. */
  function connect(session: Session, token: string | null = session.accessToken): Promise<Client> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      open.push(socket);
      const client: Client = { socket, messages: [], closed: null, session };
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

  const send = (client: Client, message: Message) => client.socket.send(JSON.stringify(message));
  const of = (client: Client, type: string) => client.messages.filter((m) => m.type === type);
  const gotType = (client: Client, type: string, count = 1) => of(client, type).length >= count;

  async function enter(session: Session, code: string): Promise<Client> {
    const client = await connect(session);
    await until(() => gotType(client, 'ready'), `ready của ${session.username}`);
    send(client, { type: 'room:join', roomId: code });
    await until(
      () => gotType(client, 'room:state') || gotType(client, 'error'),
      `room:state của ${session.username}`,
    );
    return client;
  }

  async function newRoom(owner: Session, others: Session[]): Promise<string> {
    const created = await call(owner, 'POST', 'rooms', {
      view_bars: 40,
      play_bars: 30,
      minutes: 10,
      max_players: 4,
      stake_xu: 100,
    });
    expect(created.statusCode, created.body).toBe(200);
    const code = (created.json() as { id: string }).id;
    for (const other of others) {
      const joined = await call(other, 'POST', `rooms/${code}/join`, {});
      expect(joined.statusCode, joined.body).toBe(200);
    }
    return code;
  }

  const image = (clientId: string, data = PNG, mime = 'image/png') => ({
    type: 'image:send',
    clientId,
    mime,
    data,
    width: 32,
    height: 16,
  });

  it('phòng chờ: xác thực thật, kiểm thành viên, giao ảnh, giới hạn, tắt tiếng, cuộc gọi và tín hiệu, rời phòng và bị mời ra', async () => {
    const [a, b, c, stranger] = [
      await user('ws-a'),
      await user('ws-b'),
      await user('ws-c'),
      await user('ws-x'),
    ] as [Session, Session, Session, Session];
    const code = await newRoom(a, [b, c]);

    // Token sai: đóng 4401. Người ngoài phòng: bị từ chối, không nhận room:state.
    const bad = await connect(a, 'token-gia');
    await until(() => bad.closed !== null, 'token sai bị đóng');
    expect(bad.closed).toBe(4401);
    const outsider = await enter(stranger, code);
    expect(of(outsider, 'room:state')).toHaveLength(0);
    expect(of(outsider, 'error')[0]).toMatchObject({ code: 'NOT_IN_ROOM' });

    const [wa, wb, wc] = [await enter(a, code), await enter(b, code), await enter(c, code)] as [
      Client,
      Client,
      Client,
    ];
    expect(of(wa, 'ready')[0]).toEqual({ type: 'ready', userId: a.id });
    expect(of(wa, 'room:state')[0]).toMatchObject({
      roomId: code,
      images: [],
      call: [],
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // A gửi ảnh: A nhận bản có clientId, B và C nhận bản giống hệt không có clientId.
    send(wa, { ...image('a1'), roomId: code });
    await until(
      () => gotType(wb, 'image') && gotType(wc, 'image') && gotType(wa, 'image'),
      'ảnh tới',
    );
    expect(of(wa, 'image')[0]).toMatchObject({
      clientId: 'a1',
      userId: a.id,
      width: 32,
      height: 16,
    });
    expect(of(wb, 'image')[0]).toMatchObject({
      clientId: null,
      userId: a.id,
      mime: 'image/png',
      data: PNG,
    });

    // Gửi nhanh quá, ảnh hỏng (byte đầu không phải PNG) đều bị từ chối.
    send(wa, { ...image('a2'), roomId: code });
    await until(() => of(wa, 'error').some((m) => m.clientId === 'a2'), 'IMAGE_TOO_FAST');
    expect(of(wa, 'error').find((m) => m.clientId === 'a2')).toMatchObject({
      code: 'IMAGE_TOO_FAST',
    });
    await sleep(2100);
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0x4a, 0x46]).toString('base64');
    send(wa, { ...image('a3', jpegBytes), roomId: code });
    await until(() => of(wa, 'error').some((m) => m.clientId === 'a3'), 'IMAGE_INVALID');
    expect(of(wa, 'error').find((m) => m.clientId === 'a3')).toMatchObject({
      code: 'IMAGE_INVALID',
    });

    // Người vào sau thấy ảnh cũ trong room:state.
    const late = await enter(b, code);
    expect(of(late, 'room:state')[0]!.images).toHaveLength(1);
    late.socket.close();

    // B tắt tiếng A qua HTTP: ảnh kế của A không tới B nhưng vẫn tới C.
    const muted = await call(b, 'POST', `rooms/${code}/chat/mute`, { user_id: a.id, muted: true });
    expect(muted.statusCode, muted.body).toBe(200);
    await sleep(2100);
    send(wa, { ...image('a4'), roomId: code });
    await until(() => gotType(wc, 'image', 2), 'ảnh thứ hai tới C');
    await sleep(300);
    expect(of(wb, 'image')).toHaveLength(1);

    // Cuộc gọi: A và C vào, B không vào. Tín hiệu A tới C; A gửi B (không trong cuộc gọi) bị chặn.
    const media = { audio: true, video: false, screen: false };
    send(wa, { type: 'call:join', roomId: code, media });
    send(wc, { type: 'call:join', roomId: code, media });
    await until(
      () => gotType(wa, 'call:peer-joined') && gotType(wc, 'call:joined'),
      'vào cuộc gọi',
    );
    expect(of(wc, 'call:joined')[0]!.peers).toEqual([
      { userId: a.id, name: expect.any(String), media },
    ]);
    expect(of(wb, 'call:peer-joined')).toHaveLength(0);
    const data = { sdp: { type: 'offer', sdp: 'v=0' }, n: [1, 2] };
    send(wa, { type: 'rtc:signal', roomId: code, to: c.id, data });
    await until(() => gotType(wc, 'rtc:signal'), 'tín hiệu tới C');
    expect(of(wc, 'rtc:signal')[0]).toEqual({ type: 'rtc:signal', from: a.id, data });
    send(wa, { type: 'rtc:signal', roomId: code, to: b.id, data });
    await until(() => of(wa, 'error').some((m) => m.code === 'PEER_NOT_IN_CALL'), 'chặn tín hiệu');
    expect(of(wb, 'rtc:signal')).toHaveLength(0);

    // Mất kết nối của C (ngắt thô) thì A nhận peer-left.
    wc.socket.terminate();
    await until(() => gotType(wa, 'call:peer-left'), 'peer-left');
    expect(of(wa, 'call:peer-left')[0]).toEqual({ type: 'call:peer-left', userId: c.id });

    // Chủ phòng mời B ra: socket của B đóng 4403. C rời bằng HTTP rồi vào lại socket thì bị từ chối.
    const kicked = await call(a, 'POST', `rooms/${code}/kick`, { user_id: b.id });
    expect(kicked.statusCode, kicked.body).toBe(200);
    await until(() => wb.closed !== null, 'B bị đóng socket');
    expect(wb.closed).toBe(4403);
    expect(wa.closed).toBeNull();
    expect((await call(c, 'POST', `rooms/${code}/leave`)).statusCode).toBe(200);
    const again = await enter(c, code);
    expect(of(again, 'error')[0]).toMatchObject({ code: 'NOT_IN_ROOM' });

    // Người cuối cùng rời: phòng đóng, ảnh trong bộ nhớ bị xoá sạch.
    expect(app.get(FlashbackMediaHub).stats.imageBytes).toBeGreaterThan(0);
    expect((await call(a, 'POST', `rooms/${code}/leave`)).statusCode).toBe(200);
    await until(() => wa.closed !== null, 'A bị đóng socket');
    expect(app.get(FlashbackMediaHub).stats.imageBytes).toBe(0);
    expect(app.get(FlashbackMediaHub).stats.rooms).toBe(0);
  }, 60_000);

  it('phòng chờ quá hạn bị tác vụ quét đóng: client nhận room:closed, socket đóng 4410, ảnh bị xoá', async () => {
    const [e, f] = [await user('ws-e'), await user('ws-f')] as [Session, Session];
    const code = await newRoom(e, [f]);
    const [we, wf] = [await enter(e, code), await enter(f, code)] as [Client, Client];
    send(we, { ...image('e1'), roomId: code });
    await until(() => gotType(wf, 'image'), 'ảnh tới F');
    expect(app.get(FlashbackMediaHub).stats.imageBytes).toBeGreaterThan(0);

    clock.at = new Date(clock.at.getTime() + 31 * 60_000);
    const swept = await app.get(FlashbackRoomsService).sweep(clock.at);
    expect(swept.closed).toBeGreaterThanOrEqual(1);
    await until(() => we.closed !== null && wf.closed !== null, 'socket bị đóng');
    expect(we.closed).toBe(4410);
    expect(wf.closed).toBe(4410);
    expect(of(we, 'room:closed')[0]).toEqual({ type: 'room:closed', roomId: code });
    expect(app.get(FlashbackMediaHub).stats).toMatchObject({ imageBytes: 0, rooms: 0 });
  }, 60_000);

  it('quy tắc phiên trên ván thật: ảnh của người đi trước chỉ tới người đi sau khi họ tới đúng phiên', async () => {
    const [g, h] = [await user('ws-g'), await user('ws-h')] as [Session, Session];
    const code = await newRoom(g, [h]);
    expect((await call(h, 'POST', `rooms/${code}/ready`, { ready: true })).statusCode).toBe(200);
    const started = await call(g, 'POST', `rooms/${code}/start`);
    expect(started.statusCode, started.body).toBe(200);
    const matchId = (started.json() as { match: { match_id: string } }).match.match_id;
    const step = async (session: Session, count: number) => {
      for (let i = 0; i < count; i += 1) {
        const next = await call(session, 'POST', `matches/${matchId}/next`);
        expect(next.statusCode, next.body).toBe(200);
      }
    };
    await step(g, 22);
    await step(h, 14);

    const [wg, wh] = [await enter(g, code), await enter(h, code)] as [Client, Client];
    send(wg, { ...image('g1'), roomId: code });
    await until(() => gotType(wg, 'image'), 'echo cho G');
    await sleep(400);
    expect(of(wh, 'image')).toHaveLength(0);

    await step(h, 7);
    await sleep(600);
    expect(of(wh, 'image')).toHaveLength(0);
    await step(h, 1);
    await until(() => gotType(wh, 'image'), 'ảnh tới H khi tới phiên 22');
    expect(of(wh, 'image')[0]).toMatchObject({ userId: g.id, clientId: null });

    // Vào lại: ảnh đã tới lượt nằm trong room:state.
    const rejoined = await enter(h, code);
    expect(of(rejoined, 'room:state')[0]!.images).toHaveLength(1);
  }, 90_000);
});
