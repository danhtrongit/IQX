import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlashbackChatService } from '../../src/modules/flashback/flashback-chat.service.js';
import type { FbMediaContext } from '../../src/modules/flashback/flashback-chat.service.js';
import {
  FlashbackMediaHub,
  type FbHubSocket,
} from '../../src/modules/flashback/flashback-media.hub.js';
import {
  checkImage,
  FbImageRateLimiter,
  FbImageStore,
  matchesMime,
  type FbStoredImage,
} from '../../src/modules/flashback/flashback-media.logic.js';
import { FlashbackRoomEvents } from '../../src/modules/flashback/flashback-room-events.js';
import { MemoryChatRepository } from './helpers/flashback-chat-memory.js';
import { setup } from './helpers/flashback-rooms-fixtures.js';
import { memoryDatabase } from './helpers/flashback-rooms-memory.js';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const D = '00000000-0000-4000-8000-00000000000d';
const CODE = '123456';
const ICE = [{ urls: 'stun:stun.example.org:3478' }];

// ------------------------------------------------------------------ ảnh mẫu (đủ phần đầu tệp)

function png(width: number, height: number, size = 64): Buffer {
  const buffer = Buffer.alloc(Math.max(size, 33));
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function jpeg(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(64);
  buffer.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46], 0); // APP0 ngắn
  buffer.set([0xff, 0xc0, 0x00, 0x11, 0x08], 8);
  buffer.writeUInt16BE(height, 13);
  buffer.writeUInt16BE(width, 15);
  return buffer;
}

function webpExtended(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(40);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(32, 4);
  buffer.write('WEBPVP8X', 8, 'ascii');
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

function webpLossy(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(40);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBPVP8 ', 8, 'ascii');
  buffer.set([0x9d, 0x01, 0x2a], 23);
  buffer.writeUInt16LE(width, 26);
  buffer.writeUInt16LE(height, 28);
  return buffer;
}

function webpLossless(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(40);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBPVP8L', 8, 'ascii');
  buffer[20] = 0x2f;
  const w = width - 1;
  const h = height - 1;
  buffer[21] = w & 0xff;
  buffer[22] = ((w >> 8) & 0x3f) | ((h & 0x03) << 6);
  buffer[23] = (h >> 2) & 0xff;
  buffer[24] = (h >> 10) & 0x0f;
  return buffer;
}

const b64 = (buffer: Buffer) => buffer.toString('base64');

describe('kiểm ảnh (flashback-media.logic)', () => {
  it('đọc đúng kích thước khung của PNG, JPEG và ba kiểu WebP', () => {
    const cases: Array<[string, Buffer]> = [
      ['image/png', png(640, 480)],
      ['image/jpeg', jpeg(800, 600)],
      ['image/webp', webpExtended(1000, 700)],
      ['image/webp', webpLossy(321, 123)],
      ['image/webp', webpLossless(1600, 900)],
    ];
    const expected = [
      [640, 480],
      [800, 600],
      [1000, 700],
      [321, 123],
      [1600, 900],
    ];
    cases.forEach(([mime, buffer], index) => {
      const result = checkImage({ mime, data: b64(buffer) });
      expect(result.ok).toBe(true);
      if (result.ok) expect([result.width, result.height]).toEqual(expected[index]);
    });
  });

  it('kiểm byte đầu: khai báo một đằng, dữ liệu một nẻo thì từ chối', () => {
    expect(matchesMime(png(1, 1), 'image/png')).toBe(true);
    expect(matchesMime(png(1, 1), 'image/jpeg')).toBe(false);
    expect(matchesMime(png(1, 1), 'image/webp')).toBe(false);
    expect(matchesMime(jpeg(1, 1), 'image/webp')).toBe(false);
    const swapped = checkImage({ mime: 'image/webp', data: b64(png(10, 10)) });
    expect(swapped).toMatchObject({ ok: false, code: 'IMAGE_INVALID' });
    // Tệp không phải ảnh (ví dụ HTML) dù khai báo gì cũng bị loại.
    const html = checkImage({
      mime: 'image/png',
      data: Buffer.from('<script>1</script>').toString('base64'),
    });
    expect(html).toMatchObject({ ok: false, code: 'IMAGE_INVALID' });
  });

  it('chỉ nhận webp, jpeg, png; từ chối svg, gif và kiểu lạ', () => {
    for (const mime of ['image/svg+xml', 'image/gif', 'text/html', '', 5, null])
      expect(checkImage({ mime, data: b64(png(1, 1)) })).toMatchObject({ ok: false });
  });

  it('dữ liệu sau giải mã tối đa 1,5 MB', () => {
    expect(checkImage({ mime: 'image/png', data: b64(png(100, 100, 1_500_000)) }).ok).toBe(true);
    expect(checkImage({ mime: 'image/png', data: b64(png(100, 100, 1_500_001)) })).toMatchObject({
      ok: false,
      code: 'IMAGE_TOO_LARGE',
    });
  });

  it('khung tối đa 4096 px mỗi cạnh', () => {
    expect(checkImage({ mime: 'image/png', data: b64(png(4096, 4096)) }).ok).toBe(true);
    expect(checkImage({ mime: 'image/png', data: b64(png(4097, 10)) })).toMatchObject({
      ok: false,
      code: 'IMAGE_INVALID',
    });
    expect(checkImage({ mime: 'image/jpeg', data: b64(jpeg(10, 5000)) })).toMatchObject({
      ok: false,
    });
    expect(checkImage({ mime: 'image/png', data: b64(png(0, 10)) })).toMatchObject({ ok: false });
  });

  it('base64 hỏng hoặc trống thì từ chối', () => {
    for (const data of ['', 'abc', '!!!!', 'AAAA====', 7])
      expect(checkImage({ mime: 'image/png', data })).toMatchObject({ ok: false });
  });
});

describe('giới hạn tốc độ ảnh', () => {
  it('1 ảnh mỗi 2 giây', () => {
    const limiter = new FbImageRateLimiter();
    expect(limiter.take(A, 0).ok).toBe(true);
    expect(limiter.take(A, 1999)).toMatchObject({ ok: false, code: 'IMAGE_TOO_FAST' });
    expect(limiter.take(A, 2000).ok).toBe(true);
    // Người khác không bị ảnh hưởng.
    expect(limiter.take(B, 2001).ok).toBe(true);
  });

  it('20 ảnh mỗi phút, ảnh thứ 21 bị chặn tới khi ảnh cũ nhất quá một phút', () => {
    const limiter = new FbImageRateLimiter();
    for (let i = 0; i < 20; i += 1) expect(limiter.take(A, i * 2000).ok).toBe(true);
    expect(limiter.take(A, 40_000)).toMatchObject({ ok: false, code: 'IMAGE_RATE_LIMIT' });
    expect(limiter.take(A, 59_999)).toMatchObject({ ok: false, code: 'IMAGE_RATE_LIMIT' });
    expect(limiter.take(A, 60_000).ok).toBe(true);
  });

  it('dọn người đã im quá một phút', () => {
    const limiter = new FbImageRateLimiter();
    limiter.take(A, 0);
    limiter.prune(61_000);
    expect(limiter.size).toBe(0);
  });
});

describe('kho ảnh trong bộ nhớ', () => {
  const image = (store: FbImageStore, room: string, bytes: number): FbStoredImage => ({
    id: crypto.randomUUID(),
    seq: store.nextSeq(),
    roomCode: room,
    userId: A,
    name: 'An',
    matchId: null,
    phien: 0,
    mime: 'image/png',
    buffer: Buffer.alloc(bytes),
    width: 1,
    height: 1,
    sentAt: new Date(0).toISOString(),
  });

  it('mỗi phòng tối đa 50 ảnh gần nhất', () => {
    const store = new FbImageStore();
    for (let i = 0; i < 60; i += 1) store.add(image(store, CODE, 10));
    expect(store.list(CODE)).toHaveLength(50);
    expect(store.totalBytes).toBe(500);
  });

  it('mỗi phòng tối đa 30 MB, bỏ ảnh cũ nhất', () => {
    const store = new FbImageStore();
    const ids: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      const item = image(store, CODE, 1_400_000);
      ids.push(item.id);
      store.add(item);
    }
    const kept = store.list(CODE);
    expect(kept.reduce((sum, item) => sum + item.buffer.length, 0)).toBeLessThanOrEqual(30_000_000);
    expect(kept.at(-1)!.id).toBe(ids.at(-1));
    expect(kept[0]!.id).not.toBe(ids[0]);
  });

  it('toàn tiến trình tối đa 200 MB, bỏ ảnh cũ nhất của toàn tiến trình', () => {
    const store = new FbImageStore({
      roomCount: 50,
      roomBytes: 30_000_000,
      totalBytes: 200_000_000,
    });
    // 8 phòng, mỗi phòng 26 MB = 208 MB: vượt trần toàn tiến trình.
    for (let room = 0; room < 8; room += 1)
      for (let i = 0; i < 13; i += 1) store.add(image(store, `10000${room}`, 2_000_000));
    expect(store.totalBytes).toBeLessThanOrEqual(200_000_000);
    // Phòng đầu tiên (cũ nhất) mất ảnh trước.
    expect(store.list('100000').length).toBeLessThan(13);
    expect(store.list('100007')).toHaveLength(13);
  });

  it('xoá cả phòng thì trả lại đúng số byte', () => {
    const store = new FbImageStore();
    store.add(image(store, CODE, 100));
    store.add(image(store, '654321', 50));
    expect(store.clearRoom(CODE)).toBe(1);
    expect(store.totalBytes).toBe(50);
    expect(store.list(CODE)).toHaveLength(0);
  });
});

// ------------------------------------------------------------------ hub với cổng giả

class FakeSocket implements FbHubSocket {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly sent: Array<Record<string, any>> = [];
  closed: { code?: number; reason?: string } | null = null;
  bufferedAmount = 0;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
  }
  of(type: string) {
    return this.sent.filter((message) => message.type === type);
  }
  last(type: string) {
    return this.of(type).at(-1);
  }
}

type FakeRoom = {
  id: string;
  chatEnabled: boolean;
  matchId: string | null;
  members: Map<string, string>;
  steps: Map<string, number | null>;
  muted: Map<string, Set<string>>;
};

class FakePort {
  readonly rooms = new Map<string, FakeRoom>();

  addRoom(code: string, members: Record<string, string>, chatEnabled = true): FakeRoom {
    const room: FakeRoom = {
      id: `room-${code}`,
      chatEnabled,
      matchId: null,
      members: new Map(Object.entries(members)),
      steps: new Map(),
      muted: new Map(),
    };
    this.rooms.set(code, room);
    return room;
  }

  async mediaContext(userId: string, code: string): Promise<FbMediaContext> {
    const room = this.rooms.get(code);
    if (!room) throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Không có phòng' });
    const name = room.members.get(userId);
    if (!name)
      throw new ForbiddenException({ code: 'NOT_IN_ROOM', message: 'Không ở trong phòng' });
    const step = room.steps.get(userId) ?? null;
    return {
      roomId: room.id,
      name,
      chatEnabled: room.chatEnabled,
      viewer: { userId, liveMatchId: room.matchId, step: room.matchId ? step : null },
      position: { matchId: room.matchId, phien: room.matchId ? (step ?? 0) : 0 },
      muted: [...(room.muted.get(userId) ?? [])],
    };
  }

  async mediaRoomId(code: string): Promise<string | null> {
    return this.rooms.get(code)?.id ?? null;
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('FlashbackMediaHub', () => {
  let port: FakePort;
  let events: FlashbackRoomEvents;
  let hub: FlashbackMediaHub;
  let clock: number;
  const sockets: FakeSocket[] = [];

  const authenticate = vi.fn(async (token: string) => {
    const id = { 'tok-a': A, 'tok-b': B, 'tok-c': C, 'tok-d': D }[token];
    if (!id) throw new Error('bad token');
    return { id };
  });

  const send = async (socket: FakeSocket, message: unknown) => {
    await hub.message(socket, JSON.stringify(message));
    await flush();
  };

  /** Kết nối, xác thực và (tuỳ chọn) vào phòng. */
  async function client(user: 'a' | 'b' | 'c' | 'd', join: string | null = CODE) {
    const socket = new FakeSocket();
    sockets.push(socket);
    hub.connect(socket);
    await send(socket, { type: 'auth', token: `tok-${user}` });
    if (join) await send(socket, { type: 'room:join', roomId: join });
    return socket;
  }

  const imageMessage = (data = b64(png(640, 480)), clientId = 'c1', mime = 'image/png') => ({
    type: 'image:send',
    roomId: CODE,
    clientId,
    mime,
    data,
    width: 640,
    height: 480,
  });

  beforeEach(() => {
    clock = 1_000_000;
    port = new FakePort();
    port.addRoom(CODE, { [A]: 'An', [B]: 'Bình', [C]: 'Chi' });
    events = new FlashbackRoomEvents();
    hub = new FlashbackMediaHub({ authenticate } as never, port as never, events, {
      iceServers: ICE,
      now: () => clock,
      authTimeoutMs: 30,
    });
  });

  afterEach(() => {
    hub.shutdown();
    sockets.length = 0;
  });

  describe('xác thực', () => {
    it('token đúng thì trả ready với userId', async () => {
      const socket = await client('a', null);
      expect(socket.last('ready')).toEqual({ type: 'ready', userId: A });
      expect(socket.closed).toBeNull();
    });

    it('token sai thì báo lỗi và đóng với mã 4401', async () => {
      const socket = new FakeSocket();
      hub.connect(socket);
      await send(socket, { type: 'auth', token: 'rác' });
      expect(socket.last('error')).toMatchObject({ code: 'AUTH_INVALID' });
      expect(socket.closed?.code).toBe(4401);
    });

    it('gửi thông điệp khác khi chưa xác thực thì đóng 4401', async () => {
      const socket = new FakeSocket();
      hub.connect(socket);
      await send(socket, { type: 'room:join', roomId: CODE });
      expect(socket.last('error')).toMatchObject({ code: 'AUTH_REQUIRED' });
      expect(socket.closed?.code).toBe(4401);
    });

    it('thiếu token cũng bị đóng 4401', async () => {
      const socket = new FakeSocket();
      hub.connect(socket);
      await send(socket, { type: 'auth' });
      expect(socket.closed?.code).toBe(4401);
    });

    it('kết nối im lặng quá hạn thì bị đóng 4401', async () => {
      const socket = new FakeSocket();
      hub.connect(socket);
      await vi.waitFor(() => expect(socket.closed?.code).toBe(4401));
    });

    it('JSON hỏng thì báo BAD_MESSAGE', async () => {
      const socket = await client('a', null);
      await hub.message(socket, '{không phải json');
      expect(socket.last('error')).toMatchObject({ code: 'BAD_MESSAGE' });
    });
  });

  describe('vào phòng', () => {
    it('chỉ thành viên mới vào được; người ngoài nhận NOT_IN_ROOM và không có room:state', async () => {
      const outsider = await client('d');
      expect(outsider.last('error')).toMatchObject({ code: 'NOT_IN_ROOM' });
      expect(outsider.of('room:state')).toHaveLength(0);
    });

    it('phòng không tồn tại thì ROOM_NOT_FOUND; mã sai dạng thì BAD_MESSAGE', async () => {
      const socket = await client('a', '999999');
      expect(socket.last('error')).toMatchObject({ code: 'ROOM_NOT_FOUND' });
      await send(socket, { type: 'room:join', roomId: 'abc' });
      expect(socket.last('error')).toMatchObject({ code: 'BAD_MESSAGE' });
    });

    it('thành viên nhận room:state có ảnh, danh sách cuộc gọi và iceServers', async () => {
      const socket = await client('a');
      expect(socket.last('room:state')).toEqual({
        type: 'room:state',
        roomId: CODE,
        images: [],
        call: [],
        iceServers: ICE,
      });
    });

    it('một socket một phòng', async () => {
      port.addRoom('222222', { [A]: 'An' });
      const socket = await client('a');
      await send(socket, { type: 'room:join', roomId: '222222' });
      expect(socket.last('error')).toMatchObject({ code: 'ALREADY_JOINED' });
    });

    it('chưa vào phòng thì không gửi ảnh và không vào cuộc gọi được', async () => {
      const socket = await client('a', null);
      await send(socket, imageMessage());
      expect(socket.last('error')).toMatchObject({ clientId: 'c1', code: 'NOT_JOINED' });
      await send(socket, { type: 'call:join', roomId: CODE, media: { audio: true } });
      expect(socket.last('error')).toMatchObject({ code: 'NOT_JOINED' });
    });

    it('ping nhận lại pong', async () => {
      const socket = await client('a', null);
      await send(socket, { type: 'ping' });
      expect(socket.last('pong')).toEqual({ type: 'pong' });
    });
  });

  describe('gửi ảnh', () => {
    it('người gửi nhận lại ảnh có clientId, người khác nhận cùng ảnh với clientId null', async () => {
      const a = await client('a');
      const b = await client('b');
      const data = b64(png(640, 480));
      await send(a, imageMessage(data, 'mine'));
      const mine = a.last('image')!;
      expect(mine).toMatchObject({
        clientId: 'mine',
        roomId: CODE,
        userId: A,
        name: 'An',
        mime: 'image/png',
        data,
        width: 640,
        height: 480,
      });
      expect(typeof mine.id).toBe('string');
      expect(Number.isNaN(Date.parse(mine.sentAt))).toBe(false);
      const theirs = b.last('image')!;
      expect(theirs).toMatchObject({ id: mine.id, clientId: null, userId: A, data });
    });

    it('chiều rộng, cao do client khai không được tin: server đọc từ tệp', async () => {
      const a = await client('a');
      await send(a, { ...imageMessage(b64(png(300, 200))), width: 4000, height: 4000 });
      expect(a.last('image')).toMatchObject({ width: 300, height: 200 });
    });

    it('người vào sau thấy ảnh cũ trong room:state, kể cả ảnh của chính mình', async () => {
      const a = await client('a');
      await send(a, imageMessage());
      const late = await client('b');
      expect(late.last('room:state')!.images).toHaveLength(1);
      const again = await client('a');
      expect(again.last('room:state')!.images[0]).toMatchObject({ userId: A, clientId: null });
    });

    it.each([
      ['byte đầu sai', () => imageMessage(b64(jpeg(10, 10)), 'x', 'image/png'), 'IMAGE_INVALID'],
      [
        'kiểu không hỗ trợ',
        () => imageMessage(b64(png(10, 10)), 'x', 'image/gif'),
        'IMAGE_INVALID',
      ],
      ['base64 hỏng', () => imageMessage('@@@@', 'x'), 'IMAGE_INVALID'],
      ['quá 1,5 MB', () => imageMessage(b64(png(10, 10, 1_500_001)), 'x'), 'IMAGE_TOO_LARGE'],
      ['quá 4096 px', () => imageMessage(b64(png(5000, 10)), 'x'), 'IMAGE_INVALID'],
    ])('từ chối ảnh %s và không giao cho ai', async (_name, build, code) => {
      const a = await client('a');
      const b = await client('b');
      await send(a, build());
      expect(a.last('error')).toMatchObject({ clientId: 'x', code });
      expect(b.of('image')).toHaveLength(0);
      expect(hub.stats.imageBytes).toBe(0);
    });

    it('thiếu clientId thì BAD_MESSAGE', async () => {
      const a = await client('a');
      await send(a, { ...imageMessage(), clientId: '' });
      expect(a.last('error')).toMatchObject({ code: 'BAD_MESSAGE' });
    });

    it('1 ảnh mỗi 2 giây: ảnh thứ hai quá sớm bị từ chối, sau 2 giây thì được', async () => {
      const a = await client('a');
      await send(a, imageMessage(undefined, 'one'));
      clock += 1000;
      await send(a, imageMessage(undefined, 'two'));
      expect(a.last('error')).toMatchObject({ clientId: 'two', code: 'IMAGE_TOO_FAST' });
      clock += 1000;
      await send(a, imageMessage(undefined, 'three'));
      expect(a.last('image')).toMatchObject({ clientId: 'three' });
    });

    it('20 ảnh mỗi phút: ảnh thứ 21 bị từ chối', async () => {
      const a = await client('a');
      for (let i = 0; i < 20; i += 1) {
        await send(a, imageMessage(undefined, `i${i}`));
        clock += 2100;
      }
      expect(a.of('image')).toHaveLength(20);
      await send(a, imageMessage(undefined, 'over'));
      expect(a.last('error')).toMatchObject({ clientId: 'over', code: 'IMAGE_RATE_LIMIT' });
    });

    it('phòng tắt chat thì không gửi ảnh được', async () => {
      port.rooms.get(CODE)!.chatEnabled = false;
      const a = await client('a');
      const b = await client('b');
      await send(a, imageMessage());
      expect(a.last('error')).toMatchObject({ clientId: 'c1', code: 'CHAT_DISABLED' });
      expect(b.of('image')).toHaveLength(0);
    });

    it('người đã bị đưa ra khỏi phòng mà socket còn sống thì không gửi được', async () => {
      const a = await client('a');
      port.rooms.get(CODE)!.members.delete(A);
      await send(a, imageMessage());
      expect(a.last('error')).toMatchObject({ code: 'NOT_IN_ROOM' });
    });
  });

  describe('tắt tiếng', () => {
    it('người đã tắt tiếng A không nhận ảnh của A; người khác vẫn nhận', async () => {
      port.rooms.get(CODE)!.muted.set(B, new Set([A]));
      const a = await client('a');
      const b = await client('b');
      const c = await client('c');
      await send(a, imageMessage());
      await flush();
      expect(b.of('image')).toHaveLength(0);
      expect(c.of('image')).toHaveLength(1);
      // Vào lại phòng cũng không thấy ảnh của người đã tắt tiếng.
      const b2 = await client('b');
      expect(b2.last('room:state')!.images).toHaveLength(0);
    });
  });

  describe('quy tắc phiên (v2.4 §3.4)', () => {
    /** A ở phiên 22, B ở phiên 14, C ở phiên 30; ván đang chơi. */
    function inMatch() {
      const room = port.rooms.get(CODE)!;
      room.matchId = 'm1';
      room.steps.set(A, 22);
      room.steps.set(B, 14);
      room.steps.set(C, 30);
      return room;
    }

    it('ảnh gửi ở phiên 22 chỉ tới người đã tới phiên 22; người chậm hơn giữ chờ rồi nhận khi tới', async () => {
      const room = inMatch();
      const a = await client('a');
      const b = await client('b');
      const c = await client('c');
      await send(a, imageMessage());
      await flush();
      expect(c.of('image')).toHaveLength(1);
      expect(b.of('image')).toHaveLength(0);
      expect(JSON.stringify(b.sent)).not.toContain(a.last('image')!.id);

      // B tới phiên 21: vẫn chưa.
      room.steps.set(B, 21);
      events.positionChanged({ roomId: room.id, userId: B });
      await flush();
      expect(b.of('image')).toHaveLength(0);

      // B tới phiên 22: nhận đúng một lần.
      room.steps.set(B, 22);
      events.positionChanged({ roomId: room.id, userId: B });
      await flush();
      events.positionChanged({ roomId: room.id, userId: B });
      await flush();
      expect(b.of('image')).toHaveLength(1);
      expect(b.last('image')).toMatchObject({ userId: A, clientId: null });
    });

    it('vào lại phòng: ảnh chưa tới phiên không nằm trong room:state, tới phiên rồi mới được giao', async () => {
      const room = inMatch();
      const a = await client('a');
      await send(a, imageMessage());
      const b = await client('b');
      expect(b.last('room:state')!.images).toHaveLength(0);
      room.steps.set(B, 25);
      events.positionChanged({ roomId: room.id, userId: B });
      await flush();
      expect(b.of('image')).toHaveLength(1);
    });

    it('ván kết thúc thì mọi ảnh đang chờ được giao (tick bắt kịp ván chốt ở tiến trình khác)', async () => {
      const room = inMatch();
      const a = await client('a');
      const b = await client('b');
      await send(a, imageMessage());
      expect(b.of('image')).toHaveLength(0);
      room.matchId = null; // ván đã kết thúc ở worker, không có sự kiện nào tới API
      await hub.tick();
      expect(b.of('image')).toHaveLength(1);
    });

    it('người nhận chưa tới phiên không bị gửi gì dù qua nhiều lần kiểm tra', async () => {
      inMatch();
      const a = await client('a');
      const b = await client('b');
      await send(a, imageMessage());
      for (let i = 0; i < 4; i += 1) await hub.tick();
      expect(b.of('image')).toHaveLength(0);
    });

    it('ảnh gửi ở phòng chờ giao ngay cho mọi người', async () => {
      const a = await client('a');
      const b = await client('b');
      await send(a, imageMessage());
      await flush();
      expect(b.of('image')).toHaveLength(1);
    });
  });

  describe('cuộc gọi và tín hiệu WebRTC', () => {
    const media = { audio: true, video: false, screen: false };

    it('call:join trả danh sách người đang gọi, báo peer-joined cho người khác, không báo cho người chưa vào gọi', async () => {
      const a = await client('a');
      const b = await client('b');
      const c = await client('c');
      await send(a, { type: 'call:join', roomId: CODE, media });
      expect(a.last('call:joined')).toMatchObject({ peers: [] });
      await send(b, {
        type: 'call:join',
        roomId: CODE,
        media: { audio: true, video: true, screen: false },
      });
      expect(b.last('call:joined')!.peers).toEqual([{ userId: A, name: 'An', media }]);
      expect(a.last('call:peer-joined')).toEqual({
        type: 'call:peer-joined',
        userId: B,
        name: 'Bình',
        media: { audio: true, video: true, screen: false },
      });
      expect(c.of('call:peer-joined')).toHaveLength(0);
      expect(b.of('call:peer-joined')).toHaveLength(0);
    });

    it('room:state của người vào sau liệt kê cuộc gọi hiện tại', async () => {
      const a = await client('a');
      await send(a, { type: 'call:join', roomId: CODE, media });
      const c = await client('c');
      expect(c.last('room:state')!.call).toEqual([{ userId: A, name: 'An', media }]);
    });

    it('call:media phát cho người khác trong cuộc gọi, và chỉ khi mình đang trong cuộc gọi', async () => {
      const a = await client('a');
      const b = await client('b');
      const c = await client('c');
      await send(c, { type: 'call:media', roomId: CODE, media });
      expect(c.last('error')).toMatchObject({ code: 'NOT_IN_CALL' });
      await send(a, { type: 'call:join', roomId: CODE, media });
      await send(b, { type: 'call:join', roomId: CODE, media });
      const next = { audio: false, video: true, screen: true };
      await send(a, { type: 'call:media', roomId: CODE, media: next });
      expect(b.last('call:media')).toEqual({ type: 'call:media', userId: A, media: next });
      expect(c.of('call:media')).toHaveLength(0);
      expect(a.of('call:media')).toHaveLength(0);
    });

    it('call:leave và ngắt kết nối đều phát peer-left', async () => {
      const a = await client('a');
      const b = await client('b');
      const c = await client('c');
      for (const socket of [a, b, c])
        await send(socket, { type: 'call:join', roomId: CODE, media });
      await send(a, { type: 'call:leave', roomId: CODE });
      expect(b.last('call:peer-left')).toEqual({ type: 'call:peer-left', userId: A });
      expect(c.last('call:peer-left')).toEqual({ type: 'call:peer-left', userId: A });
      hub.disconnect(b);
      expect(c.of('call:peer-left').map((m) => m.userId)).toEqual([A, B]);
      // Mất kết nối khi chưa vào cuộc gọi thì không phát gì.
      const before = c.sent.length;
      hub.disconnect(await client('b', null));
      expect(c.sent.length).toBe(before);
    });

    it('rtc:signal chuyển nguyên data cho người nhận, kèm from, khi cả hai cùng trong cuộc gọi', async () => {
      const a = await client('a');
      const b = await client('b');
      await send(a, { type: 'call:join', roomId: CODE, media });
      await send(b, { type: 'call:join', roomId: CODE, media });
      const data = {
        sdp: { type: 'offer', sdp: 'v=0...' },
        candidate: null,
        nested: [1, { x: 'ý' }],
      };
      await send(a, { type: 'rtc:signal', roomId: CODE, to: B, data });
      expect(b.last('rtc:signal')).toEqual({ type: 'rtc:signal', from: A, data });
      expect(a.of('rtc:signal')).toHaveLength(0);
    });

    it('rtc:signal bị chặn khi người gửi chưa vào cuộc gọi, khi người nhận chưa vào, hoặc tự gửi cho mình', async () => {
      const a = await client('a');
      const b = await client('b');
      const c = await client('c');
      await send(b, { type: 'call:join', roomId: CODE, media });
      // A chưa vào cuộc gọi.
      await send(a, { type: 'rtc:signal', roomId: CODE, to: B, data: { x: 1 } });
      expect(a.last('error')).toMatchObject({ code: 'NOT_IN_CALL' });
      expect(b.of('rtc:signal')).toHaveLength(0);
      // C vào cuộc gọi nhưng gửi cho A (chưa vào).
      await send(c, { type: 'call:join', roomId: CODE, media });
      await send(c, { type: 'rtc:signal', roomId: CODE, to: A, data: { x: 1 } });
      expect(c.last('error')).toMatchObject({ code: 'PEER_NOT_IN_CALL' });
      expect(a.of('rtc:signal')).toHaveLength(0);
      // Tự gửi cho mình.
      await send(c, { type: 'rtc:signal', roomId: CODE, to: C, data: { x: 1 } });
      expect(c.last('error')).toMatchObject({ code: 'BAD_MESSAGE' });
    });

    it('rtc:signal không vượt phòng: người ở phòng khác dù cùng trong cuộc gọi cũng không nhận', async () => {
      port.addRoom('222222', { [D]: 'Dũng' });
      const a = await client('a');
      const d = await client('d', '222222');
      await send(a, { type: 'call:join', roomId: CODE, media });
      await send(d, { type: 'call:join', roomId: '222222', media });
      await send(a, { type: 'rtc:signal', roomId: CODE, to: D, data: { x: 1 } });
      expect(a.last('error')).toMatchObject({ code: 'PEER_NOT_IN_CALL' });
      expect(d.of('rtc:signal')).toHaveLength(0);
    });

    it('rtc:signal sau khi người nhận rời cuộc gọi thì bị chặn', async () => {
      const a = await client('a');
      const b = await client('b');
      await send(a, { type: 'call:join', roomId: CODE, media });
      await send(b, { type: 'call:join', roomId: CODE, media });
      await send(b, { type: 'call:leave', roomId: CODE });
      await send(a, { type: 'rtc:signal', roomId: CODE, to: B, data: { x: 1 } });
      expect(a.last('error')).toMatchObject({ code: 'PEER_NOT_IN_CALL' });
    });

    it('kết nối mới của cùng người thay kết nối cũ trong cuộc gọi', async () => {
      const a = await client('a');
      const b = await client('b');
      await send(b, { type: 'call:join', roomId: CODE, media });
      await send(a, { type: 'call:join', roomId: CODE, media });
      const a2 = await client('a');
      await send(a2, { type: 'call:join', roomId: CODE, media });
      expect(b.of('call:peer-left').map((m) => m.userId)).toEqual([A]);
      expect(
        (a2.last('call:joined')!.peers as Array<{ userId: string }>).map((p) => p.userId),
      ).toEqual([B]);
    });

    it('call:join thiếu media thì BAD_MESSAGE; media chỉ nhận ba cờ boolean', async () => {
      const a = await client('a');
      const b = await client('b');
      await send(a, { type: 'call:join', roomId: CODE });
      expect(a.last('error')).toMatchObject({ code: 'BAD_MESSAGE' });
      await send(a, {
        type: 'call:join',
        roomId: CODE,
        media: { audio: 'yes', video: 1, screen: true, extra: 'x' },
      });
      await send(b, { type: 'call:join', roomId: CODE, media });
      expect(b.last('call:joined')!.peers[0].media).toEqual({
        audio: false,
        video: false,
        screen: true,
      });
    });
  });

  describe('đóng phòng, rời phòng, bị mời ra', () => {
    it('phòng giải tán: phát room:closed, đóng 4410, xoá ảnh và cuộc gọi trong bộ nhớ', async () => {
      const a = await client('a');
      const b = await client('b');
      await send(a, imageMessage());
      await send(a, {
        type: 'call:join',
        roomId: CODE,
        media: { audio: true, video: false, screen: false },
      });
      expect(hub.stats.imageBytes).toBeGreaterThan(0);
      events.roomClosed({ roomId: `room-${CODE}`, code: CODE });
      for (const socket of [a, b]) {
        expect(socket.last('room:closed')).toEqual({ type: 'room:closed', roomId: CODE });
        expect(socket.closed?.code).toBe(4410);
      }
      expect(hub.stats).toMatchObject({ imageBytes: 0, imageRooms: 0, rooms: 0, connections: 0 });
      // Vào lại cùng mã phòng (phòng mới) thì không còn ảnh cũ.
      const again = await client('c');
      expect(again.last('room:state')).toMatchObject({ images: [], call: [] });
    });

    it('phòng đóng khi không còn socket nào vẫn xoá ảnh (người gửi đã đi, ảnh còn trong bộ nhớ)', async () => {
      const a = await client('a');
      await send(a, imageMessage());
      hub.disconnect(a);
      expect(hub.stats.imageBytes).toBeGreaterThan(0);
      events.roomClosed({ roomId: `room-${CODE}`, code: CODE });
      expect(hub.stats.imageBytes).toBe(0);
    });

    it('ảnh không nằm ở nơi nào khác ngoài bộ nhớ: socket đóng hết, phòng đóng thì không còn gì', async () => {
      const a = await client('a');
      await send(a, imageMessage());
      events.roomClosed({ roomId: `room-${CODE}`, code: CODE });
      expect(hub.stats).toEqual({ connections: 0, rooms: 0, imageBytes: 0, imageRooms: 0 });
    });

    it('đối chiếu định kỳ: phòng đã đóng ở tiến trình khác (worker quét) thì dọn ở đây', async () => {
      const a = await client('a');
      await send(a, imageMessage());
      port.rooms.delete(CODE);
      await hub.reconcile();
      expect(a.last('room:closed')).toBeTruthy();
      expect(a.closed?.code).toBe(4410);
      expect(hub.stats.imageBytes).toBe(0);
    });

    it('rời phòng hoặc bị mời ra: peer-left cho người khác, đóng socket của người đó (4403), người khác ở lại', async () => {
      const a = await client('a');
      const b = await client('b');
      const media = { audio: true, video: false, screen: false };
      await send(a, { type: 'call:join', roomId: CODE, media });
      await send(b, { type: 'call:join', roomId: CODE, media });
      events.memberLeft({ roomId: `room-${CODE}`, code: CODE, userId: A });
      expect(a.closed?.code).toBe(4403);
      expect(b.last('call:peer-left')).toEqual({ type: 'call:peer-left', userId: A });
      expect(b.closed).toBeNull();
      // Người đã rời không nhận thêm ảnh nữa.
      await send(b, imageMessage());
      expect(a.of('image')).toHaveLength(0);
    });

    it('ping/pong: socket đóng thì rời cuộc gọi như mất kết nối', async () => {
      const a = await client('a');
      const b = await client('b');
      const media = { audio: false, video: false, screen: false };
      await send(a, { type: 'call:join', roomId: CODE, media });
      await send(b, { type: 'call:join', roomId: CODE, media });
      hub.disconnect(a);
      expect(b.last('call:peer-left')).toMatchObject({ userId: A });
    });

    it('quá nhiều thông điệp mỗi phút thì đóng kết nối', async () => {
      const a = await client('a', null);
      for (let i = 0; i < 1300; i += 1) void hub.message(a, JSON.stringify({ type: 'ping' }));
      expect(a.closed?.code).toBe(1008);
    });
  });
});

// ------------------------------------------------------------------ hub với dịch vụ thật (bộ nhớ)

describe('FlashbackMediaHub với dịch vụ phòng và chat thật', () => {
  const sockets: FakeSocket[] = [];
  let h: ReturnType<typeof setup>;
  let chat: FlashbackChatService;
  let repo: MemoryChatRepository;
  let events: FlashbackRoomEvents;
  let hub: FlashbackMediaHub;
  let code: string;
  let clock: number;

  const flushAll = async () => {
    for (let i = 0; i < 5; i += 1) await flush();
  };

  async function client(userId: string) {
    const socket = new FakeSocket();
    sockets.push(socket);
    hub.connect(socket);
    await hub.message(socket, JSON.stringify({ type: 'auth', token: userId }));
    await hub.message(socket, JSON.stringify({ type: 'room:join', roomId: code }));
    await flushAll();
    return socket;
  }

  const say = async (socket: FakeSocket, clientId: string) => {
    await hub.message(
      socket,
      JSON.stringify({
        type: 'image:send',
        roomId: code,
        clientId,
        mime: 'image/png',
        data: b64(png(100, 80)),
        width: 100,
        height: 80,
      }),
    );
    await flushAll();
    clock += 2100;
  };

  beforeEach(async () => {
    clock = 5_000_000;
    h = setup();
    h.repository.addUser(A, 'An', 1000);
    h.repository.addUser(B, 'Bình', 1000);
    h.repository.addUser(C, 'Chi', 1000);
    events = new FlashbackRoomEvents();
    Object.assign(h.service, { events });
    repo = new MemoryChatRepository(h.repository);
    chat = new FlashbackChatService(memoryDatabase(), h.repository, repo, h.service, {
      now: () => h.clock.at,
    });
    hub = new FlashbackMediaHub(
      { authenticate: async (token: string) => ({ id: token }) } as never,
      chat,
      events,
      { iceServers: ICE, now: () => clock },
    );
    const created = await h.service.createRoom(A, { max_players: 4, stake_xu: 10 });
    code = created.id;
    await h.service.joinRoom(B, code, null);
    await h.service.joinRoom(C, code, null);
  });

  afterEach(() => {
    hub.shutdown();
    sockets.length = 0;
  });

  async function start() {
    await h.service.setReady(B, code, true);
    await h.service.setReady(C, code, true);
    return (await h.service.startRoom(A, code)).match.match_id;
  }

  async function step(userId: string, matchId: string, count: number) {
    for (let i = 0; i < count; i += 1) await h.service.next(userId, matchId);
  }

  it('A đi trước B 8 phiên: ảnh của A chỉ tới B khi B tới đúng phiên, qua sự kiện của dịch vụ phòng', async () => {
    const matchId = await start();
    const a = await client(A);
    const b = await client(B);
    const c = await client(C);
    await step(A, matchId, 22);
    await step(B, matchId, 14);
    await say(a, 'img');
    expect(a.last('image')).toMatchObject({ clientId: 'img' });
    expect(b.of('image')).toHaveLength(0);
    expect(c.of('image')).toHaveLength(0);

    await step(B, matchId, 7);
    await flushAll();
    expect(b.of('image')).toHaveLength(0);
    await step(B, matchId, 1);
    await vi.waitFor(() => expect(b.of('image')).toHaveLength(1));
    expect(b.last('image')).toMatchObject({ userId: A, name: 'An', clientId: null });
    expect(c.of('image')).toHaveLength(0);
  });

  it('ảnh gửi ở phòng chờ giao ngay; tắt tiếng người gửi thì không nhận', async () => {
    await chat.setMuted(C, code, A, true);
    const a = await client(A);
    const b = await client(B);
    const c = await client(C);
    await say(a, 'img');
    await vi.waitFor(() => expect(b.of('image')).toHaveLength(1));
    expect(c.of('image')).toHaveLength(0);
    expect((await client(C)).last('room:state')!.images).toHaveLength(0);
  });

  it('phòng tắt chat thì từ chối ảnh', async () => {
    h.repository.addUser(D, 'Dũng', 1000);
    const off = await h.service.createRoom(D, { max_players: 4, chat_enabled: false });
    code = off.id;
    const d = await client(D);
    await say(d, 'img');
    expect(d.last('error')).toMatchObject({ clientId: 'img', code: 'CHAT_DISABLED' });
    expect(hub.stats.imageBytes).toBe(0);
  });

  it('người rời phòng bị đóng socket (4403) và phòng trống thì đóng cả phòng, xoá ảnh', async () => {
    const a = await client(A);
    const b = await client(B);
    const c = await client(C);
    await say(a, 'img');
    expect(hub.stats.imageBytes).toBeGreaterThan(0);

    await h.service.leaveRoom(B, code);
    expect(b.closed?.code).toBe(4403);
    expect(a.closed).toBeNull();

    await h.service.leaveRoom(C, code);
    expect(c.closed?.code).toBe(4403);
    await h.service.leaveRoom(A, code);
    expect(a.closed?.code).toBe(4403);
    expect(hub.stats.imageBytes).toBe(0);
    expect(hub.stats.rooms).toBe(0);
  });

  it('chủ phòng mời người ra: người đó bị đóng socket, người khác ở lại', async () => {
    const a = await client(A);
    const b = await client(B);
    await h.service.kickMember(A, code, B);
    expect(b.closed?.code).toBe(4403);
    expect(a.closed).toBeNull();
  });

  it('tác vụ quét đóng phòng chờ quá hạn: phát room:closed, đóng socket, xoá ảnh', async () => {
    const a = await client(A);
    const b = await client(B);
    await say(a, 'img');
    h.advance(31 * 60 * 1000);
    const swept = await h.service.sweep();
    expect(swept.closed).toBe(1);
    for (const socket of [a, b]) {
      expect(socket.last('room:closed')).toEqual({ type: 'room:closed', roomId: code });
      expect(socket.closed?.code).toBe(4410);
    }
    expect(hub.stats.imageBytes).toBe(0);
  });

  it('người ngoài phòng không vào được socket của phòng', async () => {
    const outsider = new FakeSocket();
    hub.connect(outsider);
    await hub.message(
      outsider,
      JSON.stringify({ type: 'auth', token: '00000000-0000-4000-8000-0000000000ee' }),
    );
    await hub.message(outsider, JSON.stringify({ type: 'room:join', roomId: code }));
    await flushAll();
    expect(outsider.last('error')).toMatchObject({
      code: expect.stringMatching(/NOT_IN_ROOM|ROOM_NOT_FOUND/),
    });
    expect(outsider.of('room:state')).toHaveLength(0);
  });
});
