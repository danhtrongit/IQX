/**
 * Mưa lộc trên sàn (Tán lộc, `docs/trading-floor-fx/SPEC.md`). Cơn mưa đang rơi nằm trong bộ nhớ của
 * tiến trình API (vị trí từng đồng xu, ai đã nhặt); tiền thật nằm trong cơ sở dữ liệu: người tán trả
 * trước, mỗi lần nhặt cộng ví người nhặt, hết giờ thì hoàn phần còn lại. Khởi động lại giữa chừng thì
 * lần quét lúc boot (và mỗi 60 giây) chốt các cơn mưa bỏ dở, nên người tán không bao giờ mất xu.
 */

import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import {
  coinSpots,
  RAIN_COIN_VALUE,
  RAIN_GRAB_REACH,
  RAIN_MAX_LIVE,
  RAIN_TTL_MS,
  validAmount,
  withinReach,
  type FxPoint,
} from './floor-fx.logic.js';
import { FLOOR_FX_REPOSITORY, FloorFxRepository } from './floor-fx.repository.js';

export const FLOOR_FX_OPTIONS = Symbol('FLOOR_FX_OPTIONS');

export interface FloorFxOptions {
  now?: () => number;
  /** Thời gian sống của một cơn mưa (mặc định `RAIN_TTL_MS`). */
  ttlMs?: number;
  /** Tắt lần quét chốt mưa bỏ dở lúc boot (test). */
  disableSweep?: boolean;
}

/** Cơn mưa gửi cho client: chỉ các đồng chưa ai nhặt. */
export interface PublicRain {
  id: string;
  /** Mã nhân vật của người tán; null khi họ đã rời sàn. */
  by: string | null;
  giverName: string;
  value: number;
  endsAt: number;
  coins: Array<{ i: number; x: number; y: number }>;
}

/** Hub nối vào để phát sự kiện mưa. */
export interface FloorFxSink {
  broadcast(payload: unknown): void;
  toUser(userId: string, payload: unknown): void;
}

export type StartRainResult =
  | { ok: true; rain: PublicRain; balance: number }
  | { ok: false; code: 'BAD_AMOUNT' | 'RAIN_BUSY' | 'RAIN_FULL' | 'XU_INSUFFICIENT' };

interface LiveRain {
  id: string;
  giverUserId: string;
  giverPeerId: string | null;
  giverName: string;
  endsAt: number;
  coins: Array<{ i: number; x: number; y: number; taken: boolean }>;
  timer: ReturnType<typeof setTimeout> | null;
}

const SWEEP_EVERY_MS = 60_000;

@Injectable()
export class FloorFx implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FloorFx.name);
  private readonly live = new Map<string, LiveRain>();
  /** Người tán đang chờ cơ sở dữ liệu: giữ chỗ để hai lệnh tán cùng lúc không vượt giới hạn. */
  private readonly pending = new Set<string>();
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly disableSweep: boolean;
  private sink: FloorFxSink | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private sweeping = false;

  constructor(
    private readonly database: DatabaseService,
    @Inject(FLOOR_FX_REPOSITORY) private readonly repo: FloorFxRepository,
    @Optional() @Inject(FLOOR_FX_OPTIONS) options?: FloorFxOptions,
  ) {
    this.now = options?.now ?? Date.now;
    this.ttlMs = options?.ttlMs ?? RAIN_TTL_MS;
    this.disableSweep = options?.disableSweep ?? false;
  }

  attach(sink: FloorFxSink): void {
    this.sink = sink;
  }

  onApplicationBootstrap(): void {
    if (this.disableSweep) return;
    void this.sweep();
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    // Không chốt ở đây: lần quét lúc boot kế tiếp hoàn xu cho các cơn mưa còn dở.
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    for (const rain of this.live.values()) if (rain.timer) clearTimeout(rain.timer);
    this.live.clear();
    this.pending.clear();
  }

  // ================================================================== tán lộc

  async startRain(input: {
    userId: string;
    peerId: string;
    name: string;
    amount: unknown;
    pos: FxPoint;
    spots: unknown;
  }): Promise<StartRainResult> {
    if (!validAmount(input.amount)) return { ok: false, code: 'BAD_AMOUNT' };
    const amount = input.amount;
    if (this.pending.has(input.userId) || this.liveOf(input.userId))
      return { ok: false, code: 'RAIN_BUSY' };
    if (this.live.size + this.pending.size >= RAIN_MAX_LIVE)
      return { ok: false, code: 'RAIN_FULL' };
    const spots = coinSpots(amount, input.pos, input.spots);
    const endsAt = this.now() + this.ttlMs;
    this.pending.add(input.userId);
    let created: Awaited<ReturnType<FloorFxRepository['createRain']>>;
    try {
      created = await this.database.transaction((tx) =>
        this.repo.createRain(tx, {
          giverUserId: input.userId,
          amount,
          coins: spots.length,
          expiresAt: new Date(endsAt),
        }),
      );
    } finally {
      this.pending.delete(input.userId);
    }
    if (created === 'insufficient') return { ok: false, code: 'XU_INSUFFICIENT' };
    const rain: LiveRain = {
      id: created.id,
      giverUserId: input.userId,
      giverPeerId: input.peerId,
      giverName: input.name,
      endsAt,
      coins: spots.map((spot) => ({ ...spot, taken: false })),
      timer: null,
    };
    rain.timer = setTimeout(() => void this.end(rain.id), Math.max(0, endsAt - this.now()));
    rain.timer.unref?.();
    this.live.set(rain.id, rain);
    return { ok: true, rain: this.toPublic(rain), balance: created.balance };
  }

  /** Nhặt một đồng; null (im lặng) khi không được: đã có người nhặt, quá xa, của chính mình, đã tạnh. */
  async grab(input: {
    userId: string;
    rainId: string;
    coin: number;
    pos: FxPoint;
  }): Promise<{ balance: number; value: number } | null> {
    const rain = this.live.get(input.rainId);
    if (!rain || rain.giverUserId === input.userId) return null;
    if (!Number.isInteger(input.coin)) return null;
    const coin = rain.coins[input.coin];
    if (!coin || coin.taken) return null;
    if (!withinReach(input.pos, coin, RAIN_GRAB_REACH)) return null;
    // Đánh dấu trước khi chờ cơ sở dữ liệu để hai người không cùng nhặt một đồng.
    coin.taken = true;
    try {
      const result = await this.database.transaction((tx) =>
        this.repo.grab(tx, { rainId: rain.id, coin: coin.i, userId: input.userId }),
      );
      if (!result) coin.taken = false;
      return result;
    } catch (error) {
      coin.taken = false;
      this.logger.warn(`Nhặt xu lỗi (mưa ${rain.id}, đồng ${coin.i}): ${String(error)}`);
      return null;
    }
  }

  /** Mưa tạnh: báo cả sàn, chốt và hoàn phần còn lại cho người tán. */
  async end(rainId: string): Promise<void> {
    const rain = this.live.get(rainId);
    if (!rain) return;
    if (rain.timer) clearTimeout(rain.timer);
    this.live.delete(rainId);
    this.sink?.broadcast({ type: 'rain:end', rainId });
    try {
      const settled = await this.database.transaction((tx) => this.repo.settle(tx, rainId));
      if (settled && settled.refund > 0 && settled.balance !== null)
        this.sink?.toUser(settled.giverUserId, {
          type: 'rain:refund',
          rainId,
          amount: settled.refund,
          balance: settled.balance,
        });
    } catch (error) {
      // Lần quét định kỳ sẽ chốt lại sau.
      this.logger.error(`Chốt mưa lộc ${rainId} lỗi: ${String(error)}`);
    }
  }

  publicRains(): PublicRain[] {
    return [...this.live.values()].map((rain) => this.toPublic(rain));
  }

  /** Người tán rời sàn: mưa vẫn rơi tiếp, chỉ không còn gắn với nhân vật nào. */
  peerLeft(peerId: string): void {
    for (const rain of this.live.values()) if (rain.giverPeerId === peerId) rain.giverPeerId = null;
  }

  /** Chốt các cơn mưa đã hết giờ mà chưa chốt (không nằm trong bộ nhớ). Không bao giờ ném lỗi. */
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const ids = await this.repo.listUnsettledExpired(this.database);
      for (const id of ids) {
        if (this.live.has(id)) continue;
        try {
          await this.database.transaction((tx) => this.repo.settle(tx, id));
        } catch (error) {
          this.logger.error(`Quét chốt mưa lộc ${id} lỗi: ${String(error)}`);
        }
      }
    } catch (error) {
      this.logger.error(`Quét mưa lộc bỏ dở lỗi: ${String(error)}`);
    } finally {
      this.sweeping = false;
    }
  }

  // ================================================================== nội bộ

  private liveOf(userId: string): LiveRain | undefined {
    for (const rain of this.live.values()) if (rain.giverUserId === userId) return rain;
    return undefined;
  }

  private toPublic(rain: LiveRain): PublicRain {
    return {
      id: rain.id,
      by: rain.giverPeerId,
      giverName: rain.giverName,
      value: RAIN_COIN_VALUE,
      endsAt: rain.endsAt,
      coins: rain.coins.filter((c) => !c.taken).map(({ i, x, y }) => ({ i, x, y })),
    };
  }
}
