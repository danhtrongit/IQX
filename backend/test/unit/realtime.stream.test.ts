import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DnseMqttStream,
  DnseOpenApiStream,
  type DnseProviderOptions,
} from '../../src/modules/realtime/dnse.stream.js';

type BrowserListener = (event: { data?: unknown }) => void;

class FakeWebSocket {
  static latest: FakeWebSocket | undefined;
  readonly sent: string[] = [];
  private readonly listeners = new Map<
    string,
    Array<{ listener: BrowserListener; once: boolean }>
  >();

  constructor(readonly url: string) {
    FakeWebSocket.latest = this;
  }

  addEventListener(
    event: string,
    listener: BrowserListener,
    options?: boolean | { once?: boolean },
  ): void {
    const once = typeof options === 'object' && options.once === true;
    const listeners = this.listeners.get(event) ?? [];
    listeners.push({ listener, once });
    this.listeners.set(event, listeners);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.emit('close');
  }

  emit(event: string, data?: unknown): void {
    const listeners = this.listeners.get(event) ?? [];
    for (const entry of [...listeners]) entry.listener({ data });
    this.listeners.set(
      event,
      listeners.filter((entry) => !entry.once),
    );
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}

const mqttOptions: DnseProviderOptions = {
  transport: 'mqtt',
  openApiUrl: '',
  apiKey: '',
  apiSecret: '',
  mqttUrl: 'wss://mqtt.invalid',
  mqttWsPath: '/mqtt',
  authUrl: 'https://auth.invalid/auth',
  meUrl: 'https://auth.invalid/me',
  username: 'user',
  password: 'password',
};

function stubDnseAuth(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(input).endsWith('/auth') ? { token: 'token' } : { investorId: 'investor' },
    })),
  );
}

function mqttClient() {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    client: {
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        const current = listeners.get(event) ?? [];
        current.push(listener);
        listeners.set(event, current);
      }),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      end: vi.fn(),
    },
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) listener(...args);
    },
  };
}

afterEach(() => {
  FakeWebSocket.latest = undefined;
  vi.unstubAllGlobals();
});

describe('DNSE stream lifecycle', () => {
  it('bounds the OpenAPI inbox, drops oldest frames, and ignores frames after close', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const stream = new DnseOpenApiStream('wss://dnse.invalid', 'key', 'secret', 2);
    const connecting = stream.connect();
    await vi.waitFor(() => expect(FakeWebSocket.latest).toBeDefined());
    const socket = FakeWebSocket.latest as FakeWebSocket;
    socket.emit('open');
    await vi.waitFor(() => expect(socket.listenerCount('message')).toBe(1));
    socket.emit('message', JSON.stringify({ sid: 'session' }));
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
    socket.emit('message', JSON.stringify({ action: 'auth_success' }));
    await connecting;

    for (const symbol of ['FPT', 'VNM', 'HPG'])
      socket.emit('message', JSON.stringify({ type: 'tick', symbol }));
    socket.emit(
      'message',
      JSON.stringify({ type: 'tick', symbol: 'OVERSIZED', padding: 'x'.repeat(65_536) }),
    );
    await stream.close();
    socket.emit('message', JSON.stringify({ type: 'tick', symbol: 'LATE' }));

    const received = [];
    for await (const message of stream.messages()) received.push(message.symbol);
    expect(received).toEqual(['VNM', 'HPG']);
  });

  it('bounds the MQTT inbox with the same newest-frame policy', async () => {
    stubDnseAuth();
    const mqtt = mqttClient();
    const connect = vi.fn(() => mqtt.client);
    const stream = new DnseMqttStream(mqttOptions, async () => ({ connect }), 2);
    const connecting = stream.connect();
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    mqtt.emit('connect');
    await connecting;

    for (const symbol of ['FPT', 'VNM', 'HPG'])
      mqtt.emit(
        'message',
        `plaintext/quotes/krx/mdds/tick/v1/roundlot/symbol/${symbol}`,
        JSON.stringify({ symbol }),
      );
    await stream.close();
    mqtt.emit('message', 'plaintext/quotes/krx/mdds/tick/v1/roundlot/symbol/LATE', '{}');

    const received = [];
    for await (const message of stream.messages()) received.push(message.symbol);
    expect(received).toEqual(['VNM', 'HPG']);
  });

  it('aborts an MQTT client that is still connecting during shutdown', async () => {
    stubDnseAuth();
    const mqtt = mqttClient();
    const connect = vi.fn(() => mqtt.client);
    const stream = new DnseMqttStream(mqttOptions, async () => ({ connect }));
    const outcome = stream.connect().catch((error: unknown) => error);
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());

    await stream.close();

    expect(await outcome).toEqual(
      expect.objectContaining({ message: 'DNSE MQTT connection closed' }),
    );
    expect(mqtt.client.end).toHaveBeenCalledWith(true);
  });

  it('disposes an MQTT client when connecting fails', async () => {
    stubDnseAuth();
    const mqtt = mqttClient();
    const connect = vi.fn(() => mqtt.client);
    const stream = new DnseMqttStream(mqttOptions, async () => ({ connect }));
    const outcome = stream.connect().catch((error: unknown) => error);
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());

    mqtt.emit('error', new Error('broker unavailable'));

    expect(await outcome).toEqual(expect.objectContaining({ message: 'broker unavailable' }));
    expect(mqtt.client.end).toHaveBeenCalledWith(true);
    await expect(stream.updateSubscriptions([])).rejects.toThrow('not connected');
  });

  it('settles shutdown even when the MQTT module loader never resolves', async () => {
    const stream = new DnseMqttStream(
      mqttOptions,
      async () => await new Promise<never>(() => undefined),
    );
    const outcome = stream.connect().catch((error: unknown) => error);

    await stream.close();

    expect(await outcome).toEqual(
      expect.objectContaining({ message: 'DNSE MQTT connection closed' }),
    );
  });

  it('does not create an MQTT client when shutdown wins the profile response race', async () => {
    let resolveProfile: ((profile: { investorId: string }) => void) | undefined;
    const profile = new Promise<{ investorId: string }>((resolve) => {
      resolveProfile = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: 'token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => await profile,
      });
    vi.stubGlobal('fetch', fetchMock);
    const mqtt = mqttClient();
    const connect = vi.fn(() => mqtt.client);
    const stream = new DnseMqttStream(mqttOptions, async () => ({ connect }));
    const outcome = stream.connect().catch((error: unknown) => error);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    resolveProfile?.({ investorId: 'investor' });
    await stream.close();

    expect(await outcome).toEqual(
      expect.objectContaining({ message: 'DNSE MQTT connection closed' }),
    );
    expect(connect).not.toHaveBeenCalled();
  });
});
