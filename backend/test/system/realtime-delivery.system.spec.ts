import { once } from 'node:events';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RealtimePubSub, RealtimeDemandService } from '../../src/modules/realtime/index.js';
import { startSystemStack, type SystemStack } from './system-stack.js';

describe('system acceptance: realtime Redis delivery', () => {
  let stack: SystemStack;
  beforeAll(async () => {
    stack = await startSystemStack({ REALTIME_ENABLED: 'true' });
    await stack.app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await stack?.close();
  });

  it('delivers JSON objects to both versioned sockets through one Redis multiplexer', async () => {
    const address = stack.app.getHttpServer().address() as { port: number };
    const clients = [1, 2].map(
      (version) => new WebSocket(`ws://127.0.0.1:${address.port}/api/v${version}/market-data/ws`),
    );
    try {
      await Promise.all(clients.map((socket) => once(socket, 'open')));
      for (const socket of clients)
        socket.send(JSON.stringify({ action: 'subscribe', symbols: ['VCB'], channels: ['tick'] }));
      const demand = stack.app.get(RealtimeDemandService);
      const deadline = Date.now() + 5000;
      while ((await demand.current()).length === 0 && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 20));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const frames = clients.map(
        (socket) =>
          new Promise<Record<string, unknown>>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('No realtime tick received')), 5000);
            socket.once('message', (data) => {
              clearTimeout(timeout);
              resolve(JSON.parse(data.toString()) as Record<string, unknown>);
            });
          }),
      );
      await stack.app
        .get(RealtimePubSub)
        .publish('rt:tick:VCB', { type: 'tick', symbol: 'VCB', price: 90000, volume: 100 });
      for (const frame of await Promise.all(frames))
        expect(frame).toMatchObject({ type: 'tick', symbol: 'VCB', price: 90000, volume: 100 });
    } finally {
      await Promise.all(
        clients.map(async (socket) => {
          if (socket.readyState !== WebSocket.CLOSED) {
            const closed = once(socket, 'close');
            socket.close();
            await closed;
          }
        }),
      );
    }
  });
});
