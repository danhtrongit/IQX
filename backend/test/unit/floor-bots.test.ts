import { afterEach, describe, expect, it } from 'vitest';

import { FloorBots } from '../../src/modules/trading-floor/floor-bots.js';
import {
  FLOOR_CAPACITY,
  botIdentity,
  botTarget,
  botsAllowed,
  callName,
  classify,
  dayPhase,
  marketLine,
} from '../../src/modules/trading-floor/floor-bots.logic.js';
import { FloorEvents } from '../../src/modules/trading-floor/floor-events.js';
import type { FloorMarketPort } from '../../src/modules/trading-floor/floor-market.js';
import { FLOOR_EMOTE_MAX } from '../../src/modules/trading-floor/floor-profile.logic.js';
import { FloorHub, type FloorHubSocket } from '../../src/modules/trading-floor/floor.hub.js';

/** Epoch ms of a Vietnam wall-clock time (UTC+7). */
const vn = (iso: string): number => Date.parse(`${iso}+07:00`);
const fixed = (): number => 0.5;

describe('botTarget', () => {
  it('is 10 during weekday trading hours', () => {
    expect(botTarget(vn('2026-11-16T09:30:00'))).toBe(10); // Monday
    expect(botTarget(vn('2026-11-16T13:10:00'))).toBe(10);
  });

  it('stays between 2 and 5 outside trading hours and on weekends', () => {
    for (const iso of [
      '2026-11-16T12:00:00',
      '2026-11-16T20:00:00',
      '2026-11-15T10:00:00',
      '2026-11-16T02:00:00',
    ]) {
      for (let h = 0; h < 48; h++) {
        const t = botTarget(vn(iso) + h * 1_800_000);
        expect(t).toBeGreaterThanOrEqual(2);
        expect(t).toBeLessThanOrEqual(10);
      }
    }
    for (let h = 0; h < 48; h++) {
      const t = botTarget(vn('2026-11-15T00:00:00') + h * 1_800_000); // Sunday
      expect(t).toBeGreaterThanOrEqual(2);
      expect(t).toBeLessThanOrEqual(5);
    }
  });
});

describe('botsAllowed', () => {
  it('gives every place to humans when the hall fills up', () => {
    expect(botsAllowed(10, 0)).toBe(10);
    expect(botsAllowed(10, 45)).toBe(5);
    expect(botsAllowed(10, FLOOR_CAPACITY)).toBe(0);
    expect(botsAllowed(3, 60)).toBe(0);
  });
});

describe('dayPhase', () => {
  it('follows the Vietnamese trading day', () => {
    expect(dayPhase(vn('2026-11-16T08:00:00'))).toBe('preopen');
    expect(dayPhase(vn('2026-11-16T10:00:00'))).toBe('session');
    expect(dayPhase(vn('2026-11-16T12:00:00'))).toBe('lunch');
    expect(dayPhase(vn('2026-11-16T14:35:00'))).toBe('atc');
    expect(dayPhase(vn('2026-11-16T16:00:00'))).toBe('closed');
    expect(dayPhase(vn('2026-11-16T20:00:00'))).toBe('evening');
    expect(dayPhase(vn('2026-11-16T01:00:00'))).toBe('night');
    expect(dayPhase(vn('2026-11-15T10:00:00'))).toBe('weekend');
  });
});

describe('classify', () => {
  const listed = new Set(['FPT', 'HPG', 'VCB']);
  it('understands greetings, market questions and listed tickers', () => {
    expect(classify('Chào mọi người', listed).kind).toBe('greet');
    expect(classify('hello', listed).kind).toBe('greet');
    expect(classify('VNINDEX hôm nay sao rồi', listed).kind).toBe('market');
    expect(classify('thị trường thế nào', listed).kind).toBe('market');
    expect(classify('Có ai cầm FPT không', listed)).toEqual({ kind: 'ticker', symbol: 'FPT' });
  });

  it('stays quiet on things it does not understand', () => {
    expect(classify('ATC hôm nay ghê', listed).kind).toBe('none');
    expect(classify('ABC xyz', listed).kind).toBe('none');
    expect(classify('trời mưa quá', listed).kind).toBe('none');
    expect(classify('chiến thắng', listed).kind).toBe('none');
  });
});

describe('lines', () => {
  it('quotes the live index and fits a speech bubble', () => {
    const line = marketLine({ value: 1265.4, change: -12.3 }, true, fixed)!;
    expect(line).toContain('1.265,40');
    expect(line).toContain('−12,30');
    expect(line.length).toBeLessThanOrEqual(FLOOR_EMOTE_MAX);
    expect(marketLine(null, true, fixed)).toBeNull();
  });

  it('makes names that are not already on the floor', () => {
    let i = 0;
    const seq = (): number => [0.1, 0.1, 0.1, 0.1, 0.3, 0.9][i++ % 6]!;
    const first = botIdentity(new Set(), seq).name;
    i = 0;
    expect(botIdentity(new Set([first]), seq).name).not.toBe(first);
    expect(callName('Nguyễn Văn Minh')).toBe('Minh');
  });
});

// ================================================================== hub: capacity, bots giving way, queue

class FakeSocket implements FloorHubSocket {
  readonly sent: Array<Record<string, unknown>> = [];
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(): void {}
  last(type: string): Record<string, unknown> | undefined {
    return [...this.sent].reverse().find((m) => m.type === type);
  }
}

const market: FloorMarketPort = {
  vnindex: async () => ({ value: 1250, change: 5, time: Date.now() }),
  listedSymbols: async () => new Set(['FPT']),
  indexClose: async () => null,
};

function makeHub(now: () => number) {
  const events = new FloorEvents();
  const bots = new FloorBots(market, events, { enabled: true, now, rand: Math.random });
  const hub = new FloorHub(
    {} as never,
    { authenticate: async (token: string) => ({ id: token }) } as never,
    {
      connected() {},
      disconnected() {},
      onProfileChanged: () => () => undefined,
      bindSaco() {},
    } as never,
    events,
    { pendingInvite: () => null } as never,
    { find: async () => ({ name: 'Người thật', avatar: 'male01', color: 'default' }) } as never,
    { findByUser: async () => null } as never,
    { now, authTimeoutMs: 60_000 },
    bots,
  );
  return { hub, bots };
}

async function join(hub: FloorHub, n: number): Promise<FakeSocket> {
  const socket = new FakeSocket();
  hub.connect(socket);
  await hub.message(socket, JSON.stringify({ type: 'auth', token: `user-${n}` }));
  await hub.message(
    socket,
    JSON.stringify({ type: 'hello', x: 900, y: 700, facing: 's', moving: false }),
  );
  return socket;
}

describe('FloorHub with bots', () => {
  let stop: (() => void) | null = null;
  afterEach(() => stop?.());

  it('greets the first visitor with bots, makes room for humans, then queues', async () => {
    const now = (): number => vn('2026-11-16T10:00:00'); // peak: 10 bots wanted
    const { hub, bots } = makeHub(now);
    stop = () => hub.shutdown();

    const first = await join(hub, 0);
    const welcome = first.last('welcome') as { peers: unknown[] };
    expect(welcome.peers.length).toBeGreaterThan(0);
    expect(bots.count).toBeGreaterThan(0);

    const sockets = [first];
    for (let i = 1; i < FLOOR_CAPACITY; i++) sockets.push(await join(hub, i));
    expect(hub.stats.onFloor).toBe(FLOOR_CAPACITY);
    expect(bots.count).toBe(0);

    const late = await join(hub, 999);
    expect(late.last('welcome')).toBeUndefined();
    expect(late.last('queue')).toMatchObject({ position: 1, total: 1 });
    expect(hub.stats.queued).toBe(1);

    // Someone leaves: the first in line walks in with the other people in the hall.
    hub.disconnect(sockets[3]!);
    await new Promise((r) => setTimeout(r, 0));
    expect(late.last('welcome')).toBeDefined();
    expect(hub.stats.queued).toBe(0);
    expect(hub.stats.onFloor).toBe(FLOOR_CAPACITY);
  });

  it('a queued visitor who leaves frees their place in line', async () => {
    const now = (): number => vn('2026-11-16T10:00:00');
    const { hub } = makeHub(now);
    stop = () => hub.shutdown();
    for (let i = 0; i < FLOOR_CAPACITY; i++) await join(hub, i);
    const a = await join(hub, 1001);
    const b = await join(hub, 1002);
    expect(b.last('queue')).toMatchObject({ position: 2 });
    hub.disconnect(a);
    expect(b.last('queue')).toMatchObject({ position: 1, total: 1 });
  });
});
