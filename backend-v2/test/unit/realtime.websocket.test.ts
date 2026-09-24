import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';

import { RealtimeModule } from '../../src/modules/realtime/realtime.module.js';
import { configureApiApp } from '../../src/app.js';
import { ConfigurationModule } from '../../src/platform/config/configuration.module.js';
import { createHttpAdapter } from '../../src/platform/http/http-adapter.js';

const openSockets: WebSocket[] = [];

async function server(enabled: boolean, compatibilityEnabled = true) {
  @Module({
    imports: [
      ConfigurationModule.forEnvironment({
        APP_ENV: 'test',
        LOG_LEVEL: 'silent',
        COMPATIBILITY_V1_ENABLED: String(compatibilityEnabled),
      }),
      RealtimeModule.register({
        enabled,
        ingestEnabled: false,
        v1CompatibilityEnabled: compatibilityEnabled,
      }),
    ],
  })
  class TestModule {}
  const app = await NestFactory.create<NestFastifyApplication>(TestModule, createHttpAdapter(), {
    logger: false,
  });
  await configureApiApp(app, { logger: false });
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as { port: number };
  return { app, base: `ws://127.0.0.1:${address.port}` };
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    openSockets.push(socket);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) =>
    socket.once('message', (data) =>
      resolve(JSON.parse(data.toString()) as Record<string, unknown>),
    ),
  );
}

afterEach(() => {
  for (const socket of openSockets.splice(0)) socket.terminate();
});

describe('realtime native WebSocket routes', () => {
  for (const path of ['/api/v1/market-data/ws', '/api/v2/market-data/ws']) {
    it(`answers legacy ping frames on ${path}`, async () => {
      const { app, base } = await server(true);
      try {
        const socket = await connect(`${base}${path}`);
        const response = nextMessage(socket);
        socket.send(JSON.stringify({ action: 'ping' }));
        await expect(response).resolves.toEqual({ type: 'pong' });
      } finally {
        await app.close();
      }
    });
  }

  it('closes with 1013 when realtime is disabled', async () => {
    const { app, base } = await server(false);
    try {
      const socket = new WebSocket(`${base}/api/v1/market-data/ws`);
      openSockets.push(socket);
      const closed = new Promise<number>((resolve, reject) => {
        socket.once('close', (code) => resolve(code));
        socket.once('error', reject);
      });
      await expect(closed).resolves.toBe(1013);
    } finally {
      await app.close();
    }
  });

  it('keeps the v2 alias available when v1 compatibility is disabled', async () => {
    const { app, base } = await server(true, false);
    try {
      const socket = await connect(`${base}/api/v2/market-data/ws`);
      const response = nextMessage(socket);
      socket.send(JSON.stringify({ action: 'ping' }));
      await expect(response).resolves.toEqual({ type: 'pong' });
    } finally {
      await app.close();
    }
  });

  it('rejects the legacy route when v1 compatibility is disabled', async () => {
    const { app, base } = await server(true, false);
    try {
      const socket = new WebSocket(`${base}/api/v1/market-data/ws`);
      openSockets.push(socket);
      const closed = new Promise<number>((resolve, reject) => {
        socket.once('close', (code) => resolve(code));
        socket.once('error', reject);
      });
      await expect(closed).resolves.toBe(1008);
    } finally {
      await app.close();
    }
  });
});
