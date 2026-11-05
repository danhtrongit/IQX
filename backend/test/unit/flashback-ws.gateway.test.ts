import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';

import { configureApiApp } from '../../src/app.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { FlashbackChatService } from '../../src/modules/flashback/flashback-chat.service.js';
import {
  FLASHBACK_MEDIA_OPTIONS,
  FlashbackMediaHub,
} from '../../src/modules/flashback/flashback-media.hub.js';
import { FlashbackRoomEvents } from '../../src/modules/flashback/flashback-room-events.js';
import { FlashbackWsGateway } from '../../src/modules/flashback/flashback-ws.gateway.js';
import { ConfigurationModule } from '../../src/platform/config/configuration.module.js';
import { createHttpAdapter } from '../../src/platform/http/http-adapter.js';

const CODE = '123456';
const USERS: Record<string, string> = { 'tok-a': 'user-a', 'tok-b': 'user-b' };
const png = (() => {
  const buffer = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(32, 16);
  buffer.writeUInt32BE(16, 20);
  return buffer;
})();

const sockets: WebSocket[] = [];

async function server() {
  const events = new FlashbackRoomEvents();
  @Module({
    imports: [ConfigurationModule.forEnvironment({ APP_ENV: 'test', LOG_LEVEL: 'silent' })],
    providers: [
      { provide: FlashbackRoomEvents, useValue: events },
      {
        provide: AuthService,
        useValue: {
          authenticate: async (token: string) => {
            const id = USERS[token];
            if (!id) throw new Error('bad token');
            return { id };
          },
        },
      },
      {
        provide: FlashbackChatService,
        useValue: {
          mediaContext: async (userId: string, code: string) => {
            if (code !== CODE) throw new Error('no room');
            return {
              roomId: 'room-1',
              name: userId === 'user-a' ? 'An' : 'Bình',
              chatEnabled: true,
              viewer: { userId, liveMatchId: null, step: null },
              position: { matchId: null, phien: 0 },
              muted: [],
            };
          },
          mediaRoomId: async () => 'room-1',
        },
      },
      {
        provide: FLASHBACK_MEDIA_OPTIONS,
        useValue: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
      },
      FlashbackMediaHub,
      FlashbackWsGateway,
    ],
  })
  class TestModule {}
  const app = await NestFactory.create<NestFastifyApplication>(TestModule, createHttpAdapter(), {
    logger: false,
  });
  await configureApiApp(app, { logger: false });
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as { port: number };
  return { app, events, url: `ws://127.0.0.1:${address.port}/api/v2/flashback/ws` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Inbox = { socket: WebSocket; messages: Array<Record<string, any>>; closed: number | null };

function connect(url: string): Promise<Inbox> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    sockets.push(socket);
    const inbox: Inbox = { socket, messages: [], closed: null };
    socket.on('message', (data) => inbox.messages.push(JSON.parse(data.toString())));
    socket.on('close', (code) => {
      inbox.closed = code;
    });
    socket.once('open', () => resolve(inbox));
    socket.once('error', reject);
  });
}

const waitFor = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('hết giờ chờ');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const send = (inbox: Inbox, message: unknown) => inbox.socket.send(JSON.stringify(message));
const has = (inbox: Inbox, type: string) => inbox.messages.some((message) => message.type === type);

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.terminate();
});

describe('cổng WebSocket /api/v2/flashback/ws (ws thật)', () => {
  it('xác thực bằng thông điệp đầu tiên rồi vào phòng, gửi ảnh, gọi và chuyển tín hiệu', async () => {
    const { app, url } = await server();
    try {
      const a = await connect(url);
      const b = await connect(url);
      send(a, { type: 'auth', token: 'tok-a' });
      send(b, { type: 'auth', token: 'tok-b' });
      await waitFor(() => has(a, 'ready') && has(b, 'ready'));
      expect(a.messages.find((m) => m.type === 'ready')).toEqual({
        type: 'ready',
        userId: 'user-a',
      });

      send(a, { type: 'room:join', roomId: CODE });
      send(b, { type: 'room:join', roomId: CODE });
      await waitFor(() => has(a, 'room:state') && has(b, 'room:state'));
      expect(a.messages.find((m) => m.type === 'room:state')).toMatchObject({
        roomId: CODE,
        images: [],
        call: [],
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      send(a, {
        type: 'image:send',
        roomId: CODE,
        clientId: 'x1',
        mime: 'image/png',
        data: png.toString('base64'),
        width: 32,
        height: 16,
      });
      await waitFor(() => has(a, 'image') && has(b, 'image'));
      expect(a.messages.find((m) => m.type === 'image')).toMatchObject({
        clientId: 'x1',
        width: 32,
        height: 16,
      });
      expect(b.messages.find((m) => m.type === 'image')).toMatchObject({
        clientId: null,
        userId: 'user-a',
      });

      const media = { audio: true, video: false, screen: false };
      send(a, { type: 'call:join', roomId: CODE, media });
      send(b, { type: 'call:join', roomId: CODE, media });
      await waitFor(() => has(a, 'call:peer-joined'));
      send(a, { type: 'rtc:signal', roomId: CODE, to: 'user-b', data: { sdp: 'offer' } });
      await waitFor(() => has(b, 'rtc:signal'));
      expect(b.messages.find((m) => m.type === 'rtc:signal')).toEqual({
        type: 'rtc:signal',
        from: 'user-a',
        data: { sdp: 'offer' },
      });

      // Đóng socket thô (mất mạng) thì người kia nhận peer-left.
      a.socket.terminate();
      await waitFor(() => has(b, 'call:peer-left'));
      expect(b.messages.find((m) => m.type === 'call:peer-left')).toEqual({
        type: 'call:peer-left',
        userId: 'user-a',
      });
    } finally {
      await app.close();
    }
  });

  it('token sai thì đóng với mã 4401', async () => {
    const { app, url } = await server();
    try {
      const a = await connect(url);
      send(a, { type: 'auth', token: 'sai' });
      await waitFor(() => a.closed !== null);
      expect(a.closed).toBe(4401);
    } finally {
      await app.close();
    }
  });

  it('phòng giải tán: client nhận room:closed rồi socket đóng 4410', async () => {
    const { app, url, events } = await server();
    try {
      const a = await connect(url);
      send(a, { type: 'auth', token: 'tok-a' });
      await waitFor(() => has(a, 'ready'));
      send(a, { type: 'room:join', roomId: CODE });
      await waitFor(() => has(a, 'room:state'));
      events.roomClosed({ roomId: 'room-1', code: CODE });
      await waitFor(() => a.closed !== null);
      expect(has(a, 'room:closed')).toBe(true);
      expect(a.closed).toBe(4410);
    } finally {
      await app.close();
    }
  });

  it('khung nhị phân bị từ chối; thông điệp vượt giới hạn kích thước bị đóng 1009', async () => {
    const { app, url } = await server();
    try {
      const binary = await connect(url);
      binary.socket.send(Buffer.from([1, 2, 3]));
      await waitFor(() => binary.closed !== null);
      expect(binary.closed).toBe(1003);

      const big = await connect(url);
      big.socket.send('x'.repeat(2_100_000));
      await waitFor(() => big.closed !== null);
      expect(big.closed).toBe(1009);
    } finally {
      await app.close();
    }
  });
});
