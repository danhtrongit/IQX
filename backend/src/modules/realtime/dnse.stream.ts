import { createHmac } from 'node:crypto';

import type { MarketStreamPort, RealtimeSubscription, RealtimeChannel } from './realtime.types.js';

type RawFrame = Record<string, unknown>;
type MqttClient = {
  on(event: string, listener: (...args: unknown[]) => void): void;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  end(force?: boolean): void;
};
type MqttModule = {
  connect(url: string, options: Record<string, unknown>): MqttClient;
};
type MqttModuleLoader = () => Promise<MqttModule>;

type MessageQueue<T> = {
  values: Array<T | undefined>;
  head: number;
  size: number;
  waiters: Array<(result: IteratorResult<T>) => void>;
  closed: boolean;
  capacity: number;
};

export const DNSE_INBOX_CAPACITY = 1_000;
export const DNSE_MAX_FRAME_BYTES = 65_536;

function queue<T>(capacity: number): MessageQueue<T> {
  return {
    values: [],
    head: 0,
    size: 0,
    waiters: [],
    closed: false,
    capacity: Math.max(1, Math.floor(capacity)),
  };
}
function push<T>(target: MessageQueue<T>, value: T): void {
  if (target.closed) return;
  const waiter = target.waiters.shift();
  if (waiter) waiter({ value, done: false });
  else {
    // Realtime frames become less useful as they age. Keep the newest bounded
    // window so a slow downstream cannot grow the process heap indefinitely.
    if (target.size === target.capacity) {
      target.values[target.head] = value;
      target.head = (target.head + 1) % target.capacity;
    } else {
      target.values[(target.head + target.size) % target.capacity] = value;
      target.size += 1;
    }
  }
}
function end<T>(target: MessageQueue<T>): void {
  target.closed = true;
  while (target.waiters.length) target.waiters.shift()?.({ value: undefined as T, done: true });
}
async function* consume<T>(target: MessageQueue<T>): AsyncGenerator<T> {
  while (!target.closed || target.size) {
    if (target.size) {
      const value = target.values[target.head] as T;
      target.values[target.head] = undefined;
      target.head = (target.head + 1) % target.capacity;
      target.size -= 1;
      yield value;
    } else {
      const next = await new Promise<IteratorResult<T>>((resolve) => target.waiters.push(resolve));
      if (next.done) return;
      yield next.value;
    }
  }
}

const kindFor = (raw: RawFrame): RealtimeChannel | null => {
  const kind = String(raw.T ?? raw.type ?? '').toLowerCase();
  if (kind === 't' || kind === 'te' || kind === 'tick') return 'tick';
  if (kind === 'q' || kind === 'orderbook' || kind === 'top_price') return 'orderbook';
  if (kind === 'b' || kind === 'ohlc') return 'ohlc';
  if (kind === 'mi' || kind === 'index') return 'index';
  return null;
};
const symbolFor = (raw: RawFrame): string => String(raw.symbol ?? raw.code ?? raw.indexName ?? '');

function untilMqttShutdown<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('DNSE MQTT connection closed'));
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(new Error('DNSE MQTT connection closed'));
    signal.addEventListener('abort', aborted, { once: true });
    void pending.then(
      (value) => {
        signal.removeEventListener('abort', aborted);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', aborted);
        reject(error);
      },
    );
  });
}

export class DnseOpenApiStream implements MarketStreamPort {
  private socket: WebSocket | undefined;
  private readonly inbox: MessageQueue<{
    channel: RealtimeChannel;
    symbol: string;
    payload: RawFrame;
  }>;
  private subscriptions = new Map<string, RealtimeSubscription>();

  constructor(
    private readonly url = process.env.DNSE_OPENAPI_WS_URL ??
      'wss://ws-openapi.dnse.com.vn/v1/stream?encoding=json',
    private readonly apiKey = process.env.DNSE_API_KEY ?? '',
    private readonly apiSecret = process.env.DNSE_API_SECRET ?? '',
    inboxCapacity = DNSE_INBOX_CAPACITY,
  ) {
    this.inbox = queue(inboxCapacity);
  }

  async connect(): Promise<void> {
    if (!this.apiKey || !this.apiSecret)
      throw new Error('DNSE_API_KEY and DNSE_API_SECRET are required');
    const socket = new WebSocket(this.url.includes('?') ? this.url : `${this.url}?encoding=json`);
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('DNSE OpenAPI connection timeout')),
        30_000,
      );
      socket.addEventListener(
        'open',
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        'error',
        () => {
          clearTimeout(timeout);
          reject(new Error('DNSE OpenAPI socket error'));
        },
        { once: true },
      );
    });
    const nextControl = (): Promise<RawFrame> =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('DNSE OpenAPI handshake timeout')),
          30_000,
        );
        socket.addEventListener(
          'message',
          (event) => {
            clearTimeout(timeout);
            try {
              resolve(JSON.parse(String(event.data)) as RawFrame);
            } catch {
              reject(new Error('DNSE OpenAPI returned an invalid handshake frame'));
            }
          },
          { once: true },
        );
      });
    await nextControl(); // welcome frame containing session_id/sid
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomUUID();
    const signature = createHmac('sha256', this.apiSecret)
      .update(`${this.apiKey}:${timestamp}:${nonce}`)
      .digest('hex');
    socket.send(
      JSON.stringify({ action: 'auth', api_key: this.apiKey, signature, timestamp, nonce }),
    );
    const auth = await nextControl();
    if ((auth.action ?? auth.a) !== 'auth_success') {
      socket.close();
      throw new Error('DNSE OpenAPI authentication failed');
    }
    socket.addEventListener('message', (event) => {
      try {
        const encoded = String(event.data);
        if (Buffer.byteLength(encoded) > DNSE_MAX_FRAME_BYTES) return;
        const raw = JSON.parse(encoded) as RawFrame;
        if (raw.action === 'ping') {
          socket.send(JSON.stringify({ action: 'pong' }));
          return;
        }
        const channel = kindFor(raw);
        const symbol = symbolFor(raw);
        if (channel && symbol) push(this.inbox, { channel, symbol, payload: raw });
      } catch {
        /* malformed provider frames are discarded */
      }
    });
    socket.addEventListener('close', () => end(this.inbox), { once: true });
  }

  async updateSubscriptions(subscriptions: readonly RealtimeSubscription[]): Promise<void> {
    if (!this.socket) throw new Error('DNSE OpenAPI stream is not connected');
    const next = new Map(subscriptions.map((item) => [`${item.channel}:${item.symbol}`, item]));
    const additions = [...next]
      .filter(([key]) => !this.subscriptions.has(key))
      .map(([, item]) => item);
    const removals = [...this.subscriptions]
      .filter(([key]) => !next.has(key))
      .map(([, item]) => item);
    const frame = (action: 'subscribe' | 'unsubscribe', items: readonly RealtimeSubscription[]) => {
      const byChannel = new Map<string, string[]>();
      for (const item of items) {
        const name =
          item.channel === 'tick'
            ? 'tick_extra.G1.json'
            : item.channel === 'orderbook'
              ? 'top_price.G1.json'
              : item.channel === 'ohlc'
                ? 'ohlc.1.json'
                : `market_index.${item.symbol}.json`;
        const symbols = byChannel.get(name) ?? [];
        if (item.channel !== 'index') symbols.push(item.symbol);
        byChannel.set(name, symbols);
      }
      if (byChannel.size)
        this.socket?.send(
          JSON.stringify({
            action,
            channels: [...byChannel].map(([name, symbols]) => ({ name, symbols })),
          }),
        );
    };
    frame('unsubscribe', removals);
    frame('subscribe', additions);
    this.subscriptions = next;
  }

  messages(): AsyncIterable<{ channel: RealtimeChannel; symbol: string; payload: RawFrame }> {
    return consume<{ channel: RealtimeChannel; symbol: string; payload: RawFrame }>(this.inbox);
  }
  async close(): Promise<void> {
    this.socket?.close();
    this.socket = undefined;
    end(this.inbox);
  }
}

/**
 * MQTT adapter is deliberately loaded only when ingestion is enabled. This keeps
 * API/tests independent from the provider and prevents an accidental connection.
 */
export class DnseMqttStream implements MarketStreamPort {
  private client: MqttClient | undefined;
  private readonly inbox: MessageQueue<{
    channel: RealtimeChannel;
    symbol: string;
    payload: RawFrame;
  }>;
  private topics = new Set<string>();
  private connectAbort: AbortController | undefined;

  constructor(
    private readonly options: DnseProviderOptions = providerOptionsFromEnvironment(process.env),
    private readonly loadMqtt: MqttModuleLoader = defaultMqttModuleLoader,
    inboxCapacity = DNSE_INBOX_CAPACITY,
  ) {
    this.inbox = queue(inboxCapacity);
  }

  async connect(): Promise<void> {
    const connectAbort = new AbortController();
    this.connectAbort = connectAbort;
    try {
      const module = await untilMqttShutdown(this.loadMqtt(), connectAbort.signal);
      if (!this.options.username || !this.options.password)
        throw new Error('DNSE_USERNAME and DNSE_PASSWORD are required for MQTT');
      const auth = await fetch(this.options.authUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: this.options.username, password: this.options.password }),
        signal: AbortSignal.any([connectAbort.signal, AbortSignal.timeout(15_000)]),
      });
      if (!auth.ok) throw new Error(`DNSE authentication failed (${auth.status})`);
      const authBody = (await auth.json()) as { token?: string };
      if (!authBody.token) throw new Error('DNSE authentication returned no token');
      const me = await fetch(this.options.meUrl, {
        headers: { authorization: `Bearer ${authBody.token}` },
        signal: AbortSignal.any([connectAbort.signal, AbortSignal.timeout(15_000)]),
      });
      if (!me.ok) throw new Error(`DNSE profile failed (${me.status})`);
      const meBody = (await me.json()) as { investorId?: string };
      if (!meBody.investorId) throw new Error('DNSE profile returned no investorId');
      if (connectAbort.signal.aborted) throw new Error('DNSE MQTT connection closed');
      const url = this.options.mqttUrl;
      const client = module.connect(url, {
        username: meBody.investorId,
        password: authBody.token,
        protocolVersion: 5,
        path: this.options.mqttWsPath,
      });
      this.client = client;
      if (connectAbort.signal.aborted) {
        client.end(true);
        this.client = undefined;
        throw new Error('DNSE MQTT connection closed');
      }
      client.on('message', (...args) => {
        const topic = String(args[0] ?? '');
        try {
          const encoded = String(args[1] ?? '{}');
          if (Buffer.byteLength(encoded) > DNSE_MAX_FRAME_BYTES) return;
          const raw = JSON.parse(encoded) as RawFrame;
          const channel: RealtimeChannel | null = topic.includes('/tick/')
            ? 'tick'
            : topic.includes('/topprice/')
              ? 'orderbook'
              : topic.includes('/ohlc/')
                ? 'ohlc'
                : topic.includes('/marketindex/')
                  ? 'index'
                  : null;
          const symbol = symbolFor(raw) || topic.split('/').at(-1) || '';
          if (channel && symbol) push(this.inbox, { channel, symbol, payload: raw });
        } catch {
          /* malformed provider frames are discarded */
        }
      });
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (result: 'resolve' | 'reject', error?: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          connectAbort.signal.removeEventListener('abort', aborted);
          if (result === 'resolve') resolve();
          else reject(error);
        };
        const aborted = () => finish('reject', new Error('DNSE MQTT connection closed'));
        const timeout = setTimeout(
          () => finish('reject', new Error('DNSE MQTT connection timeout')),
          30_000,
        );
        timeout.unref();
        connectAbort.signal.addEventListener('abort', aborted, { once: true });
        client.on('connect', () => finish('resolve'));
        client.on('error', (...errors) => finish('reject', errors[0]));
      });
    } catch (error) {
      const client = this.client;
      this.client = undefined;
      try {
        client?.end(true);
      } catch {
        // Preserve the connection failure that triggered cleanup.
      }
      throw error;
    } finally {
      if (this.connectAbort === connectAbort) this.connectAbort = undefined;
    }
  }

  async updateSubscriptions(subscriptions: readonly RealtimeSubscription[]): Promise<void> {
    if (!this.client) throw new Error('DNSE MQTT stream is not connected');
    const next = new Set<string>();
    for (const item of subscriptions) {
      const base =
        item.channel === 'tick'
          ? 'plaintext/quotes/krx/mdds/tick/v1/roundlot/symbol'
          : item.channel === 'orderbook'
            ? 'plaintext/quotes/krx/mdds/topprice/v1/roundlot/symbol'
            : item.channel === 'ohlc'
              ? 'plaintext/quotes/krx/mdds/v2/ohlc/stock/1'
              : 'plaintext/quotes/krx/mdds/marketindex/v1/code';
      next.add(`${base}/${item.symbol}`);
    }
    for (const topic of this.topics) if (!next.has(topic)) this.client.unsubscribe(topic);
    for (const topic of next) if (!this.topics.has(topic)) this.client.subscribe(topic);
    this.topics = next;
  }
  messages(): AsyncIterable<{ channel: RealtimeChannel; symbol: string; payload: RawFrame }> {
    return consume<{ channel: RealtimeChannel; symbol: string; payload: RawFrame }>(this.inbox);
  }
  async close(): Promise<void> {
    this.connectAbort?.abort();
    this.connectAbort = undefined;
    this.client?.end(true);
    this.client = undefined;
    end(this.inbox);
  }
}

const defaultMqttModuleLoader: MqttModuleLoader = async () => {
  const moduleName = 'mqtt';
  const loader = new Function('name', 'return import(name)') as (
    name: string,
  ) => Promise<MqttModule>;
  return loader(moduleName);
};

export type DnseProviderOptions = {
  transport: 'auto' | 'openapi' | 'mqtt';
  openApiUrl: string;
  apiKey: string;
  apiSecret: string;
  mqttUrl: string;
  mqttWsPath: string;
  authUrl: string;
  meUrl: string;
  username: string;
  password: string;
};

export function providerOptionsFromEnvironment(
  values: Record<string, string | undefined>,
): DnseProviderOptions {
  const host = values.DNSE_MQTT_HOST ?? 'mqtt.dnse.com.vn';
  const port = values.DNSE_MQTT_PORT ?? '443';
  return {
    transport:
      values.DNSE_TRANSPORT === 'mqtt' || values.DNSE_TRANSPORT === 'openapi'
        ? values.DNSE_TRANSPORT
        : 'auto',
    openApiUrl:
      values.DNSE_OPENAPI_WS_URL ?? 'wss://ws-openapi.dnse.com.vn/v1/stream?encoding=json',
    apiKey: values.DNSE_API_KEY ?? '',
    apiSecret: values.DNSE_API_SECRET ?? '',
    mqttUrl: values.DNSE_MQTT_URL ?? values.REALTIME_DNSE_MQTT_URL ?? `wss://${host}:${port}`,
    mqttWsPath: values.DNSE_MQTT_WS_PATH ?? '/mqtt',
    authUrl: values.DNSE_AUTH_URL ?? 'https://services.entrade.com.vn/dnse-user-service/api/auth',
    meUrl: values.DNSE_ME_URL ?? 'https://services.entrade.com.vn/dnse-user-service/api/me',
    username: values.DNSE_USERNAME ?? values.REALTIME_DNSE_USERNAME ?? '',
    password: values.DNSE_PASSWORD ?? values.REALTIME_DNSE_PASSWORD ?? '',
  };
}

export function createDnseProviderFactory(options: DnseProviderOptions): () => MarketStreamPort {
  const transport =
    options.transport === 'auto'
      ? options.apiKey && options.apiSecret
        ? 'openapi'
        : 'mqtt'
      : options.transport;
  if (transport === 'openapi' && (!options.apiKey || !options.apiSecret))
    throw new Error('DNSE OpenAPI credentials are required when realtime ingestion is enabled');
  if (transport === 'mqtt' && (!options.username || !options.password))
    throw new Error('DNSE MQTT credentials are required when realtime ingestion is enabled');
  return () =>
    transport === 'mqtt'
      ? new DnseMqttStream(options)
      : new DnseOpenApiStream(options.openApiUrl, options.apiKey, options.apiSecret);
}

export function dnseProviderFactory(): MarketStreamPort {
  return createDnseProviderFactory(providerOptionsFromEnvironment(process.env))();
}
