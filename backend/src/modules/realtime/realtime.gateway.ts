import { Inject, Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { OnApplicationShutdown } from '@nestjs/common';

import { RealtimeDemandService } from './realtime.demand.js';
import { eventChannel, parseClientFrame } from './protocol.js';
import { RealtimePubSub } from './realtime.pubsub.js';
import {
  REALTIME_OPTIONS,
  type RealtimeOptions,
  type RealtimeSubscription,
} from './realtime.types.js';

type Socket = {
  id?: string;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState?: number;
  bufferedAmount?: number;
  on?(event: 'message' | 'close', listener: (data: Buffer | string) => void): void;
};

type Connection = {
  socket: Socket;
  subscriptions: Map<string, RealtimeSubscription>;
  unsubscribers: Map<string, () => Promise<void>>;
  pendingCleanup: Set<() => Promise<void>>;
  bufferedBytes: number;
  backpressureNotified: boolean;
  windowStartedAt: number;
  inboundMessages: number;
  mutation: Promise<void>;
  released: boolean;
};

@WebSocketGateway({ path: '/api/v1/market-data/ws', transports: ['websocket'] })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnApplicationShutdown
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly connections = new Map<Socket, Connection>();

  constructor(
    private readonly demand: RealtimeDemandService,
    private readonly pubsub: RealtimePubSub,
    @Inject(REALTIME_OPTIONS) private readonly options: RealtimeOptions,
  ) {}

  handleConnection(socket: Socket): void {
    if (!this.options.enabled) {
      socket.close(1013, 'realtime disabled');
      return;
    }
    if (this.requiresV1Compatibility && this.options.v1CompatibilityEnabled === false) {
      socket.close(1008, 'v1 compatibility disabled');
      return;
    }
    this.connections.set(socket, {
      socket,
      subscriptions: new Map(),
      unsubscribers: new Map(),
      pendingCleanup: new Set(),
      bufferedBytes: 0,
      backpressureNotified: false,
      windowStartedAt: Date.now(),
      inboundMessages: 0,
      mutation: Promise.resolve(),
      released: false,
    });
    socket.on?.('message', (data) => {
      void this.onRawMessage(socket, data).catch(() => socket.close(1013, 'realtime unavailable'));
    });
  }

  /** Legacy gateways can be disabled while versioned v2 remains available. */
  protected readonly requiresV1Compatibility: boolean = true;

  async handleDisconnect(socket: Socket): Promise<void> {
    await this.release(socket);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([...this.connections.keys()].map((socket) => this.release(socket)));
  }

  async handleMessage(socket: Socket, raw: unknown): Promise<void> {
    const connection = this.connections.get(socket);
    if (!connection || connection.released) return;
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        this.send(socket, { type: 'error', detail: 'invalid message' });
        return;
      }
    }
    const frame = parseClientFrame(parsed);
    if (!frame) {
      this.send(socket, { type: 'error', detail: 'invalid message' });
      return;
    }
    if (frame.action === 'ping') {
      this.send(socket, { type: 'pong' });
      return;
    }
    if (frame.action === 'subscribe')
      await this.mutate(connection, () =>
        this.subscribe(connection, frame.symbols, frame.channels),
      );
    else
      await this.mutate(connection, () =>
        this.unsubscribe(connection, frame.symbols, frame.channels),
      );
  }

  // Native ws adapter fallback: this method can be attached to a `message` listener
  // when the application uses a raw `ws` server instead of Nest's gateway adapter.
  async onRawMessage(socket: Socket, data: string | Buffer): Promise<void> {
    const connection = this.connections.get(socket);
    if (!connection) return;
    const size = typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
    if (size > 65_536) {
      socket.close(1009, 'message too large');
      return;
    }
    const now = Date.now();
    if (now - connection.windowStartedAt >= 60_000) {
      connection.windowStartedAt = now;
      connection.inboundMessages = 0;
    }
    connection.inboundMessages += 1;
    if (connection.inboundMessages > 120) {
      socket.close(1008, 'message rate exceeded');
      return;
    }
    await this.handleMessage(socket, data.toString());
  }

  private async subscribe(
    connection: Connection,
    symbols: string[],
    channels: RealtimeSubscription['channel'][],
  ): Promise<void> {
    const distinct = new Set([...connection.subscriptions.values()].map((item) => item.symbol));
    const staged: Array<{
      key: string;
      item: RealtimeSubscription;
      unsubscribe: () => Promise<void>;
    }> = [];
    try {
      for (const symbol of symbols) {
        for (const channel of channels) {
          const key = `${channel}:${symbol}`;
          if (connection.subscriptions.has(key)) continue;
          if (
            channel !== 'index' &&
            !distinct.has(symbol) &&
            distinct.size >= this.options.maxSymbolsPerConnection
          ) {
            this.send(connection.socket, { type: 'error', detail: 'symbol limit reached' });
            continue;
          }
          const item = { symbol, channel } satisfies RealtimeSubscription;
          const unsubscribe = await this.pubsub.subscribe(
            eventChannel(channel, symbol),
            (payload) => this.send(connection.socket, payload),
          );
          staged.push({ key, item, unsubscribe });
          distinct.add(symbol);
        }
      }
      for (const { key, item, unsubscribe } of staged) {
        connection.subscriptions.set(key, item);
        connection.unsubscribers.set(key, unsubscribe);
      }
      await this.demand.set(`${this.connectionId(connection)}`, [
        ...connection.subscriptions.values(),
      ]);
    } catch (error) {
      const cleanup = await Promise.allSettled(staged.map(({ unsubscribe }) => unsubscribe()));
      for (const [index, { key, unsubscribe }] of staged.entries()) {
        if (cleanup[index]?.status === 'rejected') connection.pendingCleanup.add(unsubscribe);
        connection.subscriptions.delete(key);
        connection.unsubscribers.delete(key);
      }
      throw error;
    }
  }

  private async unsubscribe(
    connection: Connection,
    symbols: string[],
    channels: RealtimeSubscription['channel'][],
  ): Promise<void> {
    for (const symbol of symbols)
      for (const channel of channels) {
        const key = `${channel}:${symbol}`;
        connection.subscriptions.delete(key);
        await connection.unsubscribers.get(key)?.();
        connection.unsubscribers.delete(key);
      }
    await this.demand.set(this.connectionId(connection), [...connection.subscriptions.values()]);
  }

  private async release(socket: Socket): Promise<void> {
    const connection = this.connections.get(socket);
    if (!connection || connection.released) return;
    connection.released = true;
    await connection.mutation.catch(() => undefined);
    const cleanup = await Promise.allSettled(
      [...connection.unsubscribers.values(), ...connection.pendingCleanup].map((unsubscribe) =>
        unsubscribe(),
      ),
    );
    connection.subscriptions.clear();
    connection.unsubscribers.clear();
    connection.pendingCleanup.clear();
    try {
      await this.demand.remove(this.connectionId(connection));
    } catch (error) {
      this.logger.debug(
        `Realtime demand cleanup failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    } finally {
      this.connections.delete(socket);
    }
    if (cleanup.some((result) => result.status === 'rejected'))
      this.logger.debug('Realtime subscription cleanup failed');
  }

  private async mutate(connection: Connection, operation: () => Promise<void>): Promise<void> {
    const result = connection.mutation.then(operation);
    connection.mutation = result.catch(() => undefined);
    await result;
  }

  private connectionId(connection: Connection): string {
    if (!connection.socket.id) connection.socket.id = crypto.randomUUID();
    return connection.socket.id;
  }

  private send(socket: Socket, payload: unknown): void {
    try {
      const connection = this.connections.get(socket);
      const encoded = JSON.stringify(payload);
      const buffered = socket.bufferedAmount ?? connection?.bufferedBytes ?? 0;
      if (connection && buffered + encoded.length > this.options.maxBufferedBytes) {
        if (!connection.backpressureNotified) {
          connection.backpressureNotified = true;
          socket.send(JSON.stringify({ type: 'error', detail: 'backpressure: events dropped' }));
        }
        return;
      }
      if (socket.readyState === undefined || socket.readyState === 1) {
        socket.send(encoded);
      }
    } catch (error) {
      this.logger.debug(`Realtime send failed: ${error instanceof Error ? error.name : 'unknown'}`);
    }
  }
}

/** Same protocol on the versioned v2 route during the migration window. */
@WebSocketGateway({ path: '/api/v2/market-data/ws', transports: ['websocket'] })
export class RealtimeV2Gateway extends RealtimeGateway {
  protected override readonly requiresV1Compatibility = false;
  constructor(
    demand: RealtimeDemandService,
    pubsub: RealtimePubSub,
    @Inject(REALTIME_OPTIONS) options: RealtimeOptions,
  ) {
    super(demand, pubsub, options);
  }
}
