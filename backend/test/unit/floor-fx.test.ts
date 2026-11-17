import { afterEach, describe, expect, it, vi } from 'vitest';

import { userActor, guestActor } from '../../src/modules/trading-floor/floor-actor.js';
import { FloorEvents } from '../../src/modules/trading-floor/floor-events.js';
import {
  cleanGayText,
  coinSpots,
  FX_GAY_TEXT_MAX,
  hasBadWords,
  RAIN_BOX,
  RAIN_SCATTER_MAX,
  validAmount,
  withinReach,
} from '../../src/modules/trading-floor/floor-fx.logic.js';
import {
  FloorFxRepository,
  type CoinGrab,
  type FxCharge,
  type NewCoinRain,
  type RainSettlement,
} from '../../src/modules/trading-floor/floor-fx.repository.js';
import { FloorFx } from '../../src/modules/trading-floor/floor-fx.service.js';
import { FloorHub, type FloorHubSocket } from '../../src/modules/trading-floor/floor.hub.js';

const GUEST_ID = '11111111-1111-4111-8111-111111111111';
const GUEST_TOKEN = 'g'.repeat(43);

// ================================================================== logic

describe('floor-fx logic', () => {
  it('accepts only multiples of 10 from 50 to 1000', () => {
    expect(validAmount(200)).toBe(true);
    expect(validAmount(50)).toBe(true);
    expect(validAmount(1000)).toBe(true);
    expect(validAmount(40)).toBe(false);
    expect(validAmount(55)).toBe(false);
    expect(validAmount(1010)).toBe(false);
    expect(validAmount('200')).toBe(false);
    expect(validAmount(Number.NaN)).toBe(false);
  });

  it('keeps valid client coin spots, rounded to one decimal', () => {
    const giver = { x: 900, y: 700 };
    const client = Array.from({ length: 5 }, (_, i) => ({ x: 900 + i * 10.04, y: 750 }));
    expect(coinSpots(50, giver, client)).toEqual([
      { i: 0, x: 900, y: 750 },
      { i: 1, x: 910, y: 750 },
      { i: 2, x: 920.1, y: 750 },
      { i: 3, x: 930.1, y: 750 },
      { i: 4, x: 940.2, y: 750 },
    ]);
  });

  it('scatters the right number of coins inside the box when client spots are wrong', () => {
    const giver = { x: 100, y: 300 };
    const near = Array.from({ length: 5 }, () => ({ x: 120, y: 320 }));
    const cases: unknown[] = [
      near.slice(0, 4), // wrong count
      [...near.slice(0, 4), { x: 10, y: 320 }], // outside the box
      [...near.slice(0, 4), { x: 900, y: 320 }], // too far from the giver
      [...near.slice(0, 4), { x: Number.NaN, y: 320 }],
      'nope',
      undefined,
    ];
    for (const client of cases) {
      const spots = coinSpots(50, giver, client);
      expect(spots).toHaveLength(5);
      expect(spots.map((s) => s.i)).toEqual([0, 1, 2, 3, 4]);
      for (const s of spots) {
        expect(s.x).toBeGreaterThanOrEqual(RAIN_BOX.minX);
        expect(s.x).toBeLessThanOrEqual(RAIN_BOX.maxX);
        expect(s.y).toBeGreaterThanOrEqual(RAIN_BOX.minY);
        expect(s.y).toBeLessThanOrEqual(RAIN_BOX.maxY);
        expect(withinReach(giver, s, RAIN_SCATTER_MAX + 1)).toBe(true);
      }
    }
  });

  it('cleans gáy text like an emote and caps it at 80 chars', () => {
    expect(cleanGayText('  Lên   đỉnh\n<b>rồi</b>  ')).toBe('Lên đỉnh brồi/b');
    expect(cleanGayText('\u0007​')).toBeNull();
    expect(cleanGayText('   ')).toBeNull();
    expect(cleanGayText(42)).toBeNull();
    expect(cleanGayText('a'.repeat(200))).toHaveLength(FX_GAY_TEXT_MAX);
  });

  it('flags basic Vietnamese/English profanity', () => {
    for (const text of [
      'đm mày',
      'dit me no',
      'Đ.M',
      'con cặc',
      'fuck you',
      'd i t m e',
      'ĐỊT',
      'vãi lồn',
      'đụ má',
      'cứt',
      'concac',
      'v.c.l',
    ])
      expect(hasBadWords(text), text).toBe(true);
  });

  it('lets ordinary sentences through', () => {
    for (const text of [
      'các bạn ơi',
      'lon bia',
      'du lịch',
      'đụng đỉnh',
      'đĩa cơm',
      'cứu với',
      'VNINDEX lên 2000',
      'Thần Tài phù hộ, mua đâu lãi đó',
      'Về bờ rồi',
      'admin đẹp trai',
    ])
      expect(hasBadWords(text), text).toBe(false);
  });
});

// ================================================================== fakes

/** In-memory stand-in for tf_coin_rains / tf_coin_grabs and the coin wallets. */
class FakeFxRepo extends FloorFxRepository {
  readonly wallets = new Map<string, number>();
  readonly rains = new Map<
    string,
    { giver: string; coins: number; value: number; settled: boolean; refunded: number }
  >();
  readonly grabs = new Map<string, string>();
  private next = 0;

  async createRain(
    _tx: unknown,
    input: NewCoinRain,
  ): Promise<{ id: string; balance: number } | 'insufficient'> {
    const balance = this.wallets.get(input.giverUserId) ?? 0;
    if (balance < input.amount) return 'insufficient';
    this.next += 1;
    const id = `00000000-0000-4000-8000-${String(this.next).padStart(12, '0')}`;
    this.rains.set(id, {
      giver: input.giverUserId,
      coins: input.coins,
      value: input.amount / input.coins,
      settled: false,
      refunded: 0,
    });
    this.wallets.set(input.giverUserId, balance - input.amount);
    return { id, balance: balance - input.amount };
  }

  async grab(_tx: unknown, input: CoinGrab): Promise<{ balance: number; value: number } | null> {
    const rain = this.rains.get(input.rainId);
    const key = `${input.rainId}:${input.coin}`;
    if (!rain || rain.settled || rain.giver === input.userId || input.coin >= rain.coins)
      return null;
    if (this.grabs.has(key)) return null;
    this.grabs.set(key, input.userId);
    const balance = (this.wallets.get(input.userId) ?? 0) + rain.value;
    this.wallets.set(input.userId, balance);
    return { balance, value: rain.value };
  }

  async settle(_tx: unknown, rainId: string): Promise<RainSettlement | null> {
    const rain = this.rains.get(rainId);
    if (!rain || rain.settled) return null;
    const taken = [...this.grabs.keys()].filter((k) => k.startsWith(`${rainId}:`)).length;
    const refund = (rain.coins - taken) * rain.value;
    rain.settled = true;
    rain.refunded = refund;
    if (refund <= 0) return { giverUserId: rain.giver, refund: 0, balance: null };
    const balance = (this.wallets.get(rain.giver) ?? 0) + refund;
    this.wallets.set(rain.giver, balance);
    return { giverUserId: rain.giver, refund, balance };
  }

  readonly fees: FxCharge[] = [];

  async chargeFx(_tx: unknown, input: FxCharge): Promise<{ balance: number } | 'insufficient'> {
    const balance = this.wallets.get(input.userId) ?? 0;
    if (balance < input.cost) return 'insufficient';
    this.wallets.set(input.userId, balance - input.cost);
    this.fees.push(input);
    return { balance: balance - input.cost };
  }

  async listUnsettledExpired(): Promise<string[]> {
    return [...this.rains.entries()].filter(([, r]) => !r.settled).map(([id]) => id);
  }
}

class FakeSocket implements FloorHubSocket {
  readonly sent: Array<Record<string, unknown>> = [];
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(): void {}
  all(type: string): Array<Record<string, unknown>> {
    return this.sent.filter((m) => m.type === type);
  }
  last(type: string): Record<string, unknown> | undefined {
    return [...this.sent].reverse().find((m) => m.type === type);
  }
}

function makeHub(options: { ttlMs?: number } = {}) {
  const repo = new FakeFxRepo();
  const database = { transaction: <T>(fn: (tx: never) => Promise<T>) => fn({} as never) };
  let clock = 1_000_000;
  const now = () => clock;
  const fx = new FloorFx(database as never, repo, {
    disableSweep: true,
    ttlMs: options.ttlMs ?? 45_000,
  });
  const hub = new FloorHub(
    {} as never,
    {
      resolve: async ({
        accessToken,
        guestToken,
      }: {
        accessToken?: string;
        guestToken?: string;
      }) =>
        accessToken
          ? userActor(accessToken)
          : guestToken === GUEST_TOKEN
            ? guestActor(GUEST_ID)
            : null,
    } as never,
    {
      connected() {},
      disconnected() {},
      onProfileChanged: () => () => undefined,
      onSacoChanged: () => () => undefined,
      bindSaco() {},
    } as never,
    new FloorEvents(),
    { pendingInvite: () => null, typing: async () => undefined } as never,
    {
      find: async (_db: unknown, id: string) => ({
        name: `Tên ${id}`,
        avatar: 'male01',
        color: 'default',
      }),
      findGuest: async () => ({ name: 'Khách', avatar: 'female01', color: 'default' }),
      userBasics: async (_db: unknown, id: string) => ({ id, fullName: '', username: id }),
    } as never,
    { findByUser: async () => null } as never,
    { authTimeoutMs: 60_000, now },
    undefined,
    fx,
  );
  const join = async (who: { token?: string; guest?: string }, x = 900, y = 700) => {
    const socket = new FakeSocket();
    hub.connect(socket);
    await hub.message(socket, JSON.stringify({ type: 'auth', ...who }));
    await hub.message(socket, JSON.stringify({ type: 'hello', x, y, facing: 's', moving: false }));
    return socket;
  };
  const say = (socket: FakeSocket, payload: Record<string, unknown>) =>
    hub.message(socket, JSON.stringify(payload));
  const tick = (ms: number) => {
    clock += ms;
  };
  return { hub, fx, repo, join, say, tick };
}

/** 20 coins in a row just below the giver standing at (900, 700). */
const ROW = Array.from({ length: 20 }, (_, i) => ({ x: 900 + i * 15, y: 750 }));

// ================================================================== hub

describe('FloorHub fx', () => {
  let stop: (() => void) | null = null;
  afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
  });

  it('xả xui costs 50 xu: fx:done to the sender, peer:fx to the others, 5 s cooldown', async () => {
    const t = makeHub();
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    t.repo.wallets.set('acct-a', 1_000);
    const a = await t.join({ token: 'acct-a' });
    const b = await t.join({ token: 'acct-b' });
    const selfId = (a.last('welcome')!.self as { id: string }).id;
    await t.say(a, { type: 'fx', kind: 'xaxui' });
    expect(b.last('peer:fx')).toEqual({ type: 'peer:fx', id: selfId, kind: 'xaxui' });
    expect(a.last('peer:fx')).toBeUndefined();
    expect(a.last('fx:done')).toEqual({ type: 'fx:done', kind: 'xaxui', cost: 50, balance: 950 });
    expect(b.last('fx:done')).toBeUndefined();
    expect(t.repo.wallets.get('acct-a')).toBe(950);
    expect(t.repo.fees).toEqual([{ userId: 'acct-a', kind: 'xaxui', cost: 50, text: null }]);

    t.tick(4_999);
    await t.say(a, { type: 'fx', kind: 'xaxui' });
    expect(a.last('error')).toMatchObject({ code: 'FX_COOLDOWN' });
    expect(b.all('peer:fx')).toHaveLength(1);
    expect(t.repo.wallets.get('acct-a')).toBe(950);
    t.tick(1);
    await t.say(a, { type: 'fx', kind: 'xaxui' });
    expect(b.all('peer:fx')).toHaveLength(2);
    expect(a.last('fx:done')).toMatchObject({ balance: 900 });
  });

  it('every socket of the sender gets fx:done', async () => {
    const t = makeHub();
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    t.repo.wallets.set('acct-a', 1_000);
    const a1 = await t.join({ token: 'acct-a' });
    const a2 = await t.join({ token: 'acct-a' });
    await t.say(a1, { type: 'fx', kind: 'xaxui' });
    expect(a2.last('fx:done')).toMatchObject({ kind: 'xaxui', balance: 950 });
    expect(a2.last('peer:fx')).toMatchObject({ kind: 'xaxui' });
  });

  it('a guest cannot xả xui, gáy, khấn, give or grab', async () => {
    const t = makeHub();
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    const g = await t.join({ guest: GUEST_TOKEN });
    const b = await t.join({ token: 'acct-b' });
    await t.say(g, { type: 'fx', kind: 'xaxui' });
    expect(g.last('error')).toEqual({
      type: 'error',
      code: 'LOGIN_REQUIRED',
      message: 'Đăng nhập để dùng tính năng này',
    });
    await t.say(g, { type: 'fx', kind: 'gay', text: 'Lên!' });
    await t.say(g, { type: 'fx', kind: 'khan', text: 'Phù hộ' });
    await t.say(g, { type: 'rain:give', amount: 100 });
    expect(g.all('error')).toHaveLength(4);
    expect(g.all('error').every((e) => e.code === 'LOGIN_REQUIRED')).toBe(true);
    expect(b.all('peer:fx')).toHaveLength(0);
  });

  it('an unknown fx kind is BAD_MESSAGE', async () => {
    const t = makeHub();
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    const a = await t.join({ token: 'acct-a' });
    await t.say(a, { type: 'fx', kind: 'toString' });
    expect(a.last('error')).toMatchObject({ code: 'BAD_MESSAGE' });
  });

  it('gáy costs 100 xu: others get the name and the cleaned text; bad text is BAD_TEXT', async () => {
    const t = makeHub();
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    t.repo.wallets.set('acct-a', 1_000);
    const a = await t.join({ token: 'acct-a' });
    const b = await t.join({ token: 'acct-b' });
    await t.say(a, { type: 'fx', kind: 'gay', text: '<>  ' });
    expect(a.last('error')).toMatchObject({ code: 'BAD_TEXT' });
    expect(t.repo.wallets.get('acct-a')).toBe(1_000);
    await t.say(a, { type: 'fx', kind: 'gay', text: '  Về bờ   rồi ' });
    expect(b.last('peer:fx')).toMatchObject({
      kind: 'gay',
      name: 'Tên acct-a',
      text: 'Về bờ rồi',
    });
    expect(a.last('peer:fx')).toBeUndefined();
    expect(a.last('fx:done')).toEqual({
      type: 'fx:done',
      kind: 'gay',
      text: 'Về bờ rồi',
      cost: 100,
      balance: 900,
    });
    await t.say(a, { type: 'fx', kind: 'gay', text: 'Lần nữa' });
    expect(a.last('error')).toMatchObject({ code: 'FX_COOLDOWN' });
    t.tick(20_000);
    await t.say(a, { type: 'fx', kind: 'gay', text: 'Lần nữa' });
    expect(a.last('fx:done')).toMatchObject({ balance: 800 });
  });

  it('khấn costs 50 xu, carries name + text, cools down 10 s', async () => {
    const t = makeHub();
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    t.repo.wallets.set('acct-a', 1_000);
    const a = await t.join({ token: 'acct-a' });
    const b = await t.join({ token: 'acct-b' });
    const selfId = (a.last('welcome')!.self as { id: string }).id;
    await t.say(a, { type: 'fx', kind: 'khan', text: 'Thần Tài phù hộ' });
    expect(b.last('peer:fx')).toEqual({
      type: 'peer:fx',
      id: selfId,
      kind: 'khan',
      name: 'Tên acct-a',
      text: 'Thần Tài phù hộ',
    });
    expect(a.last('fx:done')).toEqual({
      type: 'fx:done',
      kind: 'khan',
      text: 'Thần Tài phù hộ',
      cost: 50,
      balance: 950,
    });
    expect(t.repo.fees.at(-1)).toEqual({
      userId: 'acct-a',
      kind: 'khan',
      cost: 50,
      text: 'Thần Tài phù hộ',
    });
    // Cooldowns are per kind: xả xui still works right away.
    await t.say(a, { type: 'fx', kind: 'xaxui' });
    expect(a.last('fx:done')).toMatchObject({ kind: 'xaxui', balance: 900 });
    t.tick(9_999);
    await t.say(a, { type: 'fx', kind: 'khan', text: 'Lần nữa' });
    expect(a.last('error')).toMatchObject({ code: 'FX_COOLDOWN' });
    t.tick(1);
    await t.say(a, { type: 'fx', kind: 'khan', text: 'Lần nữa' });
    expect(a.last('fx:done')).toMatchObject({ kind: 'khan', balance: 850 });
  });

  it('not enough xu is XU_INSUFFICIENT and does not start the cooldown', async () => {
    const t = makeHub();
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    t.repo.wallets.set('acct-a', 30);
    const a = await t.join({ token: 'acct-a' });
    const b = await t.join({ token: 'acct-b' });
    await t.say(a, { type: 'fx', kind: 'xaxui' });
    expect(a.last('error')).toEqual({
      type: 'error',
      code: 'XU_INSUFFICIENT',
      message: 'Không đủ xu',
    });
    expect(a.last('fx:done')).toBeUndefined();
    expect(b.all('peer:fx')).toHaveLength(0);
    t.repo.wallets.set('acct-a', 80);
    await t.say(a, { type: 'fx', kind: 'xaxui' });
    expect(a.last('fx:done')).toMatchObject({ kind: 'xaxui', balance: 30 });
    expect(b.all('peer:fx')).toHaveLength(1);
  });

  it('bad words are BAD_WORDS and nothing is charged', async () => {
    const t = makeHub();
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    t.repo.wallets.set('acct-a', 1_000);
    const a = await t.join({ token: 'acct-a' });
    const b = await t.join({ token: 'acct-b' });
    const bad = ['đm mày', 'dit me no', 'Đ.M', 'con cặc', 'fuck you', 'd i t m e'];
    for (const [i, text] of bad.entries()) {
      await t.say(a, { type: 'fx', kind: i % 2 ? 'gay' : 'khan', text });
      expect(a.last('error'), text).toEqual({
        type: 'error',
        code: 'BAD_WORDS',
        message: 'Câu có từ ngữ không phù hợp',
      });
    }
    expect(a.all('error')).toHaveLength(bad.length);
    expect(t.repo.wallets.get('acct-a')).toBe(1_000);
    expect(t.repo.fees).toHaveLength(0);
    expect(b.all('peer:fx')).toHaveLength(0);
    // A refused sentence does not start the cooldown.
    await t.say(a, { type: 'fx', kind: 'gay', text: 'Lên đỉnh' });
    expect(a.last('fx:done')).toMatchObject({ kind: 'gay', balance: 900 });
  });

  it('fx before hello is NOT_ON_FLOOR', async () => {
    const t = makeHub();
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    const socket = new FakeSocket();
    t.hub.connect(socket);
    await t.say(socket, { type: 'auth', token: 'acct-a' });
    await t.say(socket, { type: 'fx', kind: 'xaxui' });
    expect(socket.last('error')).toMatchObject({ code: 'NOT_ON_FLOOR' });
  });

  it('tán lộc 200 xu: everyone sees 20 coins, the giver is charged; a second give is RAIN_BUSY', async () => {
    const t = makeHub();
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    t.repo.wallets.set('acct-a', 1_000);
    const a = await t.join({ token: 'acct-a' });
    const b = await t.join({ token: 'acct-b' });
    await t.say(a, { type: 'rain:give', amount: 200, coins: ROW });
    const start = b.last('rain:start') as { rain: { id: string; coins: unknown[]; value: number } };
    expect(start.rain.coins).toHaveLength(20);
    expect(start.rain.value).toBe(10);
    expect(start.rain.coins[0]).toEqual({ i: 0, x: 900, y: 750 });
    expect(a.last('rain:start')).toEqual(start);
    expect(a.last('rain:given')).toEqual({
      type: 'rain:given',
      rainId: start.rain.id,
      amount: 200,
      balance: 800,
    });
    expect(b.last('rain:given')).toBeUndefined();
    expect(t.repo.wallets.get('acct-a')).toBe(800);

    await t.say(a, { type: 'rain:give', amount: 100 });
    expect(a.last('error')).toMatchObject({ code: 'RAIN_BUSY' });
    expect(t.repo.wallets.get('acct-a')).toBe(800);
  });

  it('rejects a bad amount and an empty wallet', async () => {
    const t = makeHub();
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    t.repo.wallets.set('acct-a', 30);
    const a = await t.join({ token: 'acct-a' });
    await t.say(a, { type: 'rain:give', amount: 55 });
    expect(a.last('error')).toMatchObject({ code: 'BAD_AMOUNT' });
    await t.say(a, { type: 'rain:give', amount: 100 });
    expect(a.last('error')).toMatchObject({ code: 'XU_INSUFFICIENT' });
    expect(a.last('rain:start')).toBeUndefined();
    expect(t.fx.publicRains()).toEqual([]);
  });

  it('caps the floor at 3 live rains (RAIN_FULL), even for gives racing the database', async () => {
    const t = makeHub();
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    const sockets: FakeSocket[] = [];
    for (const id of ['g1', 'g2', 'g3', 'g4']) {
      t.repo.wallets.set(id, 500);
      sockets.push(await t.join({ token: id }));
    }
    await Promise.all(sockets.map((s) => t.say(s, { type: 'rain:give', amount: 50 })));
    expect(t.fx.publicRains()).toHaveLength(3);
    expect(sockets[3]!.last('error')).toMatchObject({ code: 'RAIN_FULL' });
  });

  it('grabs: a near account picks a coin once; giver, far, guest and repeats get nothing', async () => {
    const t = makeHub();
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    t.repo.wallets.set('acct-a', 1_000);
    const a = await t.join({ token: 'acct-a' });
    const b = await t.join({ token: 'acct-b' }, 900, 740);
    const far = await t.join({ token: 'acct-far' }, 1_800, 1_200);
    const g = await t.join({ guest: GUEST_TOKEN }, 900, 740);
    await t.say(a, { type: 'rain:give', amount: 200, coins: ROW });
    const rainId = (a.last('rain:start')!.rain as { id: string }).id;
    const bId = (b.last('welcome')!.self as { id: string }).id;

    await t.say(b, { type: 'rain:grab', rainId, coin: 0 });
    const taken = { type: 'rain:taken', rainId, coin: 0, by: bId, name: 'Tên acct-b' };
    for (const s of [a, b, far, g]) expect(s.last('rain:taken')).toEqual(taken);
    expect(b.last('rain:caught')).toEqual({
      type: 'rain:caught',
      rainId,
      coin: 0,
      value: 10,
      balance: 10,
    });
    expect(a.last('rain:caught')).toBeUndefined();

    await t.say(b, { type: 'rain:grab', rainId, coin: 0 }); // already taken
    await t.say(a, { type: 'rain:grab', rainId, coin: 1 }); // own coin
    await t.say(far, { type: 'rain:grab', rainId, coin: 1 }); // too far
    await t.say(b, { type: 'rain:grab', rainId, coin: 99 }); // no such coin
    await t.say(b, { type: 'rain:grab', rainId: 'nope', coin: 1 });
    expect(b.all('rain:taken')).toHaveLength(1);
    expect(b.all('error')).toHaveLength(0);
    expect(a.all('error')).toHaveLength(0);
    expect(far.all('error')).toHaveLength(0);
    await t.say(g, { type: 'rain:grab', rainId, coin: 1 });
    expect(g.last('error')).toMatchObject({ code: 'LOGIN_REQUIRED' });
    expect(t.repo.wallets.get('acct-b')).toBe(10);
    expect(t.repo.wallets.get('acct-a')).toBe(800);
  });

  it('a late joiner sees the live rain without the taken coin', async () => {
    const t = makeHub();
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    t.repo.wallets.set('acct-a', 1_000);
    const a = await t.join({ token: 'acct-a' });
    const b = await t.join({ token: 'acct-b' }, 900, 740);
    await t.say(a, { type: 'rain:give', amount: 200, coins: ROW });
    const rainId = (a.last('rain:start')!.rain as { id: string }).id;
    await t.say(b, { type: 'rain:grab', rainId, coin: 0 });
    const late = await t.join({ token: 'acct-c' });
    const rains = late.last('welcome')!.rains as Array<{
      id: string;
      by: string;
      giverName: string;
      coins: Array<{ i: number }>;
    }>;
    expect(rains).toHaveLength(1);
    expect(rains[0]!.id).toBe(rainId);
    expect(rains[0]!.giverName).toBe('Tên acct-a');
    expect(rains[0]!.coins).toHaveLength(19);
    expect(rains[0]!.coins.some((c) => c.i === 0)).toBe(false);

    // The giver leaves: the rain keeps falling without a figure attached.
    t.hub.disconnect(a);
    expect(t.fx.publicRains()[0]!.by).toBeNull();
  });

  it('when the rain ends everyone is told and the giver gets the unpicked coins back', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const t = makeHub({ ttlMs: 1_000 });
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    t.repo.wallets.set('acct-a', 1_000);
    const a = await t.join({ token: 'acct-a' });
    const b = await t.join({ token: 'acct-b' }, 900, 740);
    await t.say(a, { type: 'rain:give', amount: 200, coins: ROW });
    const rainId = (a.last('rain:start')!.rain as { id: string }).id;
    await t.say(b, { type: 'rain:grab', rainId, coin: 0 });

    await vi.advanceTimersByTimeAsync(1_000);
    for (const s of [a, b]) expect(s.last('rain:end')).toEqual({ type: 'rain:end', rainId });
    expect(a.last('rain:refund')).toEqual({
      type: 'rain:refund',
      rainId,
      amount: 190,
      balance: 990,
    });
    expect(b.last('rain:refund')).toBeUndefined();
    expect(t.repo.rains.get(rainId)).toMatchObject({ settled: true, refunded: 190 });
    expect(t.fx.publicRains()).toEqual([]);

    // A grab after the end is silent and pays nothing.
    await t.say(b, { type: 'rain:grab', rainId, coin: 1 });
    expect(b.all('rain:caught')).toHaveLength(1);
    // The giver may give again.
    await t.say(a, { type: 'rain:give', amount: 50 });
    expect(a.all('rain:given')).toHaveLength(2);
  });

  it('a failed grab in the database frees the coin for someone else', async () => {
    const t = makeHub();
    stop = () => (t.hub.shutdown(), t.fx.onModuleDestroy());
    t.repo.wallets.set('acct-a', 1_000);
    const a = await t.join({ token: 'acct-a' });
    const b = await t.join({ token: 'acct-b' }, 900, 740);
    const c = await t.join({ token: 'acct-c' }, 900, 740);
    await t.say(a, { type: 'rain:give', amount: 200, coins: ROW });
    const rainId = (a.last('rain:start')!.rain as { id: string }).id;
    const original = t.repo.grab.bind(t.repo);
    t.repo.grab = async () => {
      throw new Error('db down');
    };
    await t.say(b, { type: 'rain:grab', rainId, coin: 0 });
    expect(b.last('rain:caught')).toBeUndefined();
    expect(b.last('error')).toBeUndefined();
    t.repo.grab = original;
    await t.say(c, { type: 'rain:grab', rainId, coin: 0 });
    expect(c.last('rain:caught')).toMatchObject({ coin: 0, balance: 10 });
  });

  it('the boot sweep settles left-over rains that are not live and never throws', async () => {
    const repo = new FakeFxRepo();
    repo.wallets.set('acct-a', 1_000);
    await repo.createRain(
      {},
      {
        giverUserId: 'acct-a',
        amount: 100,
        coins: 10,
        expiresAt: new Date(0),
      },
    );
    const database = { transaction: <T>(fn: (tx: never) => Promise<T>) => fn({} as never) };
    const fx = new FloorFx(database as never, repo, { disableSweep: true });
    await fx.sweep();
    expect(repo.wallets.get('acct-a')).toBe(1_000);
    repo.listUnsettledExpired = async () => {
      throw new Error('db down');
    };
    await expect(fx.sweep()).resolves.toBeUndefined();
  });
});
