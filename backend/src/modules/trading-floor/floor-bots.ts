/**
 * Nhân vật tự động của Khu giao dịch: luôn có vài người trong sảnh (2–5, giờ giao dịch 10), đi lại giữa
 * các khu, chào người mới vào, trả lời câu hỏi về thị trường bằng số thật và nói theo khung giờ.
 *
 * Chúng chỉ sống trong bộ nhớ của `FloorHub` (không có socket, không có tài khoản). Hub tính chúng vào
 * sức chứa sảnh và gọi `fit` để chúng nhường chỗ ngay khi người thật cần. Phần thuần ở
 * `floor-bots.logic.ts`.
 */

import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import {
  ambientLines,
  between,
  botIdentity,
  botsAllowed,
  botTarget,
  callName,
  classify,
  dayPhase,
  dialogue,
  facingOf,
  FLOOR_CAPACITY,
  FLOOR_CENTRAL,
  FLOOR_ZONES,
  greetBackLine,
  greetLine,
  inBox,
  marketLine,
  pick,
  ritualLine,
  route,
  thanksLine,
  tickerLine,
  type Rand,
} from './floor-bots.logic.js';
import { FloorEvents } from './floor-events.js';
import { FLOOR_MARKET, type FloorMarketPort } from './floor-market.js';
import { isSameVnDay } from './floor-ritual.logic.js';
import type { FloorPeer } from './floor-types.js';

export const FLOOR_BOTS_OPTIONS = Symbol('FLOOR_BOTS_OPTIONS');

export interface FloorBotsOptions {
  enabled?: boolean;
  now?: () => number;
  rand?: Rand;
}

/** Phần của hub mà các nhân vật tự động dùng. */
export interface FloorBotSink {
  /** Nhân vật của người thật đang đứng trong sảnh. */
  humans(): readonly FloorPeer[];
  /** Phát cho mọi người trong sảnh; `droppable` cho phép bỏ với socket nghẽn. */
  broadcast(payload: unknown, droppable?: boolean): void;
}

const TICK_MS = 100;
const SPEED = 115;
const SEND_MS = 250;
/** Giữa hai câu bất kỳ của các nhân vật tự động. */
const LINE_GAP_MS = 4_000;
/** Một nhân vật không nói liền hai câu trong khoảng này (trừ khi đáp lời). */
const BOT_GAP_MS = 60_000;
const RECENT_MAX = 15;
/** Số người có sẵn trong sảnh khi tiến trình vừa có người thật đầu tiên. */
const FLOOR_BOTS_INITIAL = 4;

type Bot = {
  peer: FloorPeer;
  path: Array<{ x: number; y: number }>;
  waitUntil: number;
  lastSent: number;
  leaveAt: number;
  lastSaid: number;
};

type Line = { at: number; botId: string | null; text: string; reply: boolean };

@Injectable()
export class FloorBots {
  private readonly logger = new Logger(FloorBots.name);
  private readonly bots = new Map<string, Bot>();
  private readonly lines: Line[] = [];
  private readonly recent: string[] = [];
  /** Tên người thật → lần cuối được chào (ms). */
  private readonly greeted = new Map<string, number>();
  /** Id nhân vật người thật → lần cuối được đáp (ms). */
  private readonly answered = new Map<string, number>();
  private readonly now: () => number;
  private readonly rand: Rand;
  private readonly enabled: boolean;
  private sink: FloorBotSink | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private nextAddAt = 0;
  private nextRemoveAt = 0;
  private nextAmbientAt = 0;
  private lastLineAt = 0;
  private readonly unsubscribe: () => void;

  constructor(
    @Inject(FLOOR_MARKET) private readonly market: FloorMarketPort,
    events: FloorEvents,
    @Optional() @Inject(FLOOR_BOTS_OPTIONS) options?: FloorBotsOptions,
  ) {
    this.now = options?.now ?? Date.now;
    this.rand = options?.rand ?? Math.random;
    this.enabled = options?.enabled ?? process.env.FLOOR_BOTS_ENABLED !== 'false';
    this.unsubscribe = events.subscribe((_target, message) => {
      if (message.type === 'ritual:done') this.onRitual(message);
    });
  }

  attach(sink: FloorBotSink): void {
    this.sink = sink;
  }

  /** Bắt đầu chạy (gọi khi người thật đầu tiên vào sảnh); tiến trình không có ai vào thì không tốn gì. */
  wake(): void {
    if (!this.enabled || this.timer) return;
    const now = this.now();
    this.last = now;
    this.nextAddAt = now;
    this.nextAmbientAt = now + between(40_000, 90_000, this.rand);
    // Lần đầu: đã có sẵn vài người trong sảnh, không bắt người vào đầu tiên đứng một mình.
    const humans = this.sink?.humans().length ?? 0;
    const initial = Math.min(FLOOR_BOTS_INITIAL, botsAllowed(botTarget(now), humans));
    for (let i = 0; i < initial; i++) this.add(now, false);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unsubscribe();
    this.bots.clear();
    this.lines.length = 0;
  }

  peers(): FloorPeer[] {
    return [...this.bots.values()].map((bot) => bot.peer);
  }

  get count(): number {
    return this.bots.size;
  }

  /** Bớt ngay cho còn tối đa `max` nhân vật tự động (nhường chỗ cho người thật). */
  fit(max: number): void {
    const extra = this.bots.size - Math.max(0, max);
    if (extra <= 0) return;
    // Ưu tiên bớt người đang đứng yên, rồi người ở lâu nhất.
    const order = [...this.bots.values()].sort(
      (a, b) =>
        Number(b.peer.moving === false) - Number(a.peer.moving === false) || a.leaveAt - b.leaveAt,
    );
    for (const bot of order.slice(0, extra)) this.remove(bot);
    this.nextAddAt = Math.max(this.nextAddAt, this.now() + 15_000);
  }

  /** Người thật vừa vào sảnh. */
  humanJoined(peer: FloorPeer): void {
    if (!this.timer) return;
    const now = this.now();
    const last = this.greeted.get(peer.name) ?? 0;
    if (now - last < 30 * 60_000 || this.rand() > 0.6) return;
    if (this.greeted.size > 500) this.greeted.clear();
    this.greeted.set(peer.name, now);
    this.schedule(
      now + between(3_000, 7_000, this.rand),
      this.nearest(peer)?.peer.id ?? null,
      greetLine(peer.name, this.rand),
      true,
    );
  }

  /** Người thật vừa nói `text`: đáp khi hiểu ý, im lặng khi không. */
  humanSaid(peer: FloorPeer, text: string): void {
    if (!this.timer || this.bots.size === 0) return;
    const now = this.now();
    if (now - (this.answered.get(peer.id) ?? 0) < 8_000) return;
    void this.answer(peer, text, now).catch((error: unknown) =>
      this.logger.warn(
        `bot reply failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  // ================================================================== nội bộ

  private async answer(peer: FloorPeer, text: string, now: number): Promise<void> {
    const listed = /[A-Z]{3}/.test(text) ? await this.market.listedSymbols(now) : null;
    const intent = classify(text, listed);
    let line: string | null = null;
    switch (intent.kind) {
      case 'greet':
        // Vừa được chào lúc vào (hoặc vừa đáp): không chào lại lần nữa.
        if (now - (this.greeted.get(peer.name) ?? 0) < 2 * 60_000) return;
        this.greeted.set(peer.name, now);
        line = greetBackLine(peer.name, this.rand);
        break;
      case 'market': {
        const quote = await this.market.vnindex(now);
        const phase = dayPhase(now);
        const live =
          (phase === 'session' || phase === 'atc') &&
          quote?.time != null &&
          isSameVnDay(quote.time, now);
        line = marketLine(quote, live, this.rand);
        break;
      }
      case 'ticker':
        line = this.rand() < 0.6 ? tickerLine(intent.symbol, this.rand) : null;
        break;
      case 'thanks':
        line = this.rand() < 0.4 ? thanksLine(this.rand) : null;
        break;
      case 'none':
        line = null;
    }
    if (!line) return;
    if (this.answered.size > 500) this.answered.clear();
    this.answered.set(peer.id, now);
    const bot = this.nearest(peer);
    if (bot && !bot.peer.moving) this.face(bot, peer);
    this.schedule(this.now() + between(2_000, 5_000, this.rand), bot?.peer.id ?? null, line, true);
  }

  private onRitual(message: Record<string, unknown>): void {
    if (!this.timer || this.bots.size === 0 || this.rand() > 0.5) return;
    const name = typeof message.name === 'string' ? message.name : '';
    const que = typeof message.que === 'string' ? message.que : '';
    const luck = typeof message.luck === 'number' ? message.luck : 3;
    if (!name || !que) return;
    const line = ritualLine(name, que, luck, this.rand);
    if (line) this.schedule(this.now() + between(3_000, 8_000, this.rand), null, line, true);
  }

  private schedule(at: number, botId: string | null, text: string, reply: boolean): void {
    if (this.lines.length >= 6) return;
    this.lines.push({ at, botId, text, reply });
    this.lines.sort((a, b) => a.at - b.at);
  }

  private tick(): void {
    const sink = this.sink;
    if (!sink) return;
    const now = this.now();
    const dt = Math.min(0.5, (now - this.last) / 1000);
    this.last = now;
    const humans = sink.humans();
    this.balance(now, humans.length);
    if (humans.length === 0) {
      this.lines.length = 0;
      return;
    }
    for (const bot of this.bots.values()) this.walk(bot, now, dt);
    this.speak(now);
  }

  /** Giữ số nhân vật tự động theo giờ, đổi người dần dần như người thật ra vào. */
  private balance(now: number, humans: number): void {
    const allowed = botsAllowed(botTarget(now), humans);
    if (this.bots.size > FLOOR_CAPACITY - humans) this.fit(FLOOR_CAPACITY - humans);
    if (this.bots.size > allowed && now >= this.nextRemoveAt) {
      this.fit(this.bots.size - 1);
      this.nextRemoveAt = now + between(20_000, 45_000, this.rand);
      return;
    }
    // Người ở đủ lâu thì ra về (khi đang đứng yên); chỗ trống được người khác vào thay sau ít phút.
    for (const bot of this.bots.values()) {
      if (bot.leaveAt <= now && !bot.peer.moving && bot.path.length === 0) {
        this.remove(bot);
        this.nextAddAt = Math.max(this.nextAddAt, now + between(20_000, 90_000, this.rand));
        break;
      }
    }
    if (this.bots.size < allowed && now >= this.nextAddAt) {
      this.add(now, humans > 0);
      this.nextAddAt = now + between(4_000, 15_000, this.rand);
    }
  }

  private add(now: number, walkIn: boolean): void {
    const taken = new Set<string>([
      ...[...this.bots.values()].flatMap((bot) => [bot.peer.name, callName(bot.peer.name)]),
      ...(this.sink?.humans() ?? []).map((peer) => peer.name),
    ]);
    const identity = botIdentity(taken, this.rand);
    const at = inBox(walkIn ? FLOOR_CENTRAL : pick(FLOOR_ZONES, this.rand), this.rand);
    const peer: FloorPeer = { id: randomUUID(), ...identity, ...at, facing: 's', moving: false };
    const bot: Bot = {
      peer,
      path: walkIn ? route(this.rand) : [],
      waitUntil: now + between(2_000, 10_000, this.rand),
      lastSent: 0,
      leaveAt: now + between(15, 50, this.rand) * 60_000,
      lastSaid: 0,
    };
    this.bots.set(peer.id, bot);
    this.sink?.broadcast({ type: 'peer:join', peer });
  }

  private remove(bot: Bot): void {
    if (!this.bots.delete(bot.peer.id)) return;
    for (let i = this.lines.length - 1; i >= 0; i--)
      if (this.lines[i]!.botId === bot.peer.id) this.lines.splice(i, 1);
    this.sink?.broadcast({ type: 'peer:leave', id: bot.peer.id });
  }

  private walk(bot: Bot, now: number, dt: number): void {
    const peer = bot.peer;
    if (bot.path.length === 0) {
      if (peer.moving) {
        peer.moving = false;
        this.sendState(bot, now, false);
        // Đứng một lúc; thỉnh thoảng đứng lâu như đang nói chuyện hay xem bảng.
        bot.waitUntil =
          now +
          (this.rand() < 0.25
            ? between(30_000, 70_000, this.rand)
            : between(5_000, 20_000, this.rand));
      }
      if (now >= bot.waitUntil) bot.path = route(this.rand);
      return;
    }
    let budget = SPEED * dt;
    let facing = peer.facing;
    let x = peer.x;
    let y = peer.y;
    while (budget > 0 && bot.path.length) {
      const w = bot.path[0]!;
      const dx = w.x - x;
      const dy = w.y - y;
      const d = Math.hypot(dx, dy);
      if (d > 0.5) facing = facingOf(dx, dy);
      if (d <= budget) {
        x = w.x;
        y = w.y;
        budget -= d;
        bot.path.shift();
      } else {
        x += (dx / d) * budget;
        y += (dy / d) * budget;
        budget = 0;
      }
    }
    const changed = !peer.moving || facing !== peer.facing;
    peer.x = Math.round(x * 10) / 10;
    peer.y = Math.round(y * 10) / 10;
    peer.facing = facing;
    peer.moving = true;
    if (changed || now - bot.lastSent >= SEND_MS) this.sendState(bot, now, !changed);
  }

  private sendState(bot: Bot, now: number, droppable: boolean): void {
    bot.lastSent = now;
    const { id, x, y, facing, moving } = bot.peer;
    this.sink?.broadcast({ type: 'peer:state', id, x, y, facing, moving }, droppable);
  }

  /** Quay mặt về phía người đang nói chuyện. */
  private face(bot: Bot, toward: FloorPeer): void {
    const facing = facingOf(toward.x - bot.peer.x, toward.y - bot.peer.y);
    if (facing === bot.peer.facing) return;
    bot.peer.facing = facing;
    bot.waitUntil = Math.max(bot.waitUntil, this.now() + 8_000);
    this.sendState(bot, this.now(), false);
  }

  private nearest(peer: FloorPeer): Bot | null {
    let best: Bot | null = null;
    let bestD = Infinity;
    for (const bot of this.bots.values()) {
      const d = Math.hypot(bot.peer.x - peer.x, bot.peer.y - peer.y) + (bot.peer.moving ? 200 : 0);
      if (d < bestD) {
        bestD = d;
        best = bot;
      }
    }
    return best;
  }

  private speak(now: number): void {
    const due = this.lines[0];
    if (due && due.at <= now && now - this.lastLineAt >= LINE_GAP_MS) {
      this.lines.shift();
      const bot = (due.botId && this.bots.get(due.botId)) || this.quietBot(now, due.reply);
      if (bot) this.say(bot, due.text, now);
      return;
    }
    if (now < this.nextAmbientAt || this.lines.length) return;
    this.nextAmbientAt = now + between(50_000, 130_000, this.rand);
    if (now - this.lastLineAt < 25_000) return;
    void this.ambient(now).catch(() => undefined);
  }

  private async ambient(now: number): Promise<void> {
    const phase = dayPhase(now);
    const roll = this.rand();
    if (roll < 0.25 && this.bots.size >= 2) {
      const [ask, reply] = dialogue(phase, this.rand);
      const a = this.quietBot(now, false);
      const b = [...this.bots.values()].find((bot) => bot !== a);
      if (!a || !b || this.recent.includes(ask)) return;
      this.face(a, b.peer);
      this.face(b, a.peer);
      this.schedule(now, a.peer.id, ask, false);
      this.schedule(now + between(4_000, 8_000, this.rand), b.peer.id, reply, true);
      return;
    }
    if (roll < 0.5 && (phase === 'session' || phase === 'closed')) {
      const quote = await this.market.vnindex(now);
      const live = phase === 'session' && quote?.time != null && isSameVnDay(quote.time, now);
      const fresh = live || (quote?.time != null && isSameVnDay(quote.time, now));
      const line = fresh ? marketLine(quote, live, this.rand) : null;
      if (line) {
        this.schedule(now, null, line, false);
        return;
      }
    }
    const options = ambientLines(phase).filter((line) => !this.recent.includes(line));
    if (options.length) this.schedule(now, null, pick(options, this.rand), false);
  }

  /** Nhân vật lâu chưa nói nhất (với câu thường: phải im ít nhất một phút). */
  private quietBot(now: number, reply: boolean): Bot | null {
    let best: Bot | null = null;
    for (const bot of this.bots.values()) {
      if (!reply && now - bot.lastSaid < BOT_GAP_MS) continue;
      if (!best || bot.lastSaid < best.lastSaid) best = bot;
    }
    return best;
  }

  private say(bot: Bot, text: string, now: number): void {
    bot.lastSaid = now;
    this.lastLineAt = now;
    this.recent.push(text);
    if (this.recent.length > RECENT_MAX) this.recent.shift();
    this.sink?.broadcast({ type: 'peer:emote', id: bot.peer.id, text });
  }
}
