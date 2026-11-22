/**
 * The Bot schedule as the strategies module sees it (PLAN-bot-strategy §4 ports, §7 W2/W3).
 *
 * `BOT_SCHEDULE_PORT` and `BotSchedulePort` are declared in `strategy-rules/contracts.ts` (W1) and
 * implemented by the bots module (W3, `bot-strategy-schedule.service.ts`). This file adds:
 *  - `versionUsage` (optional, W3 implements it when it can): which exact versions of one strategy
 *    the last (locked) and next session rows point to, so "Lịch sử bản" can mark them (§4.10);
 *  - `resolveBotSchedule`: lazy lookup through Nest's `ModuleRef` (strict: false), because
 *    BotsModule imports StrategiesModule for `STRATEGY_READER` and a static import back would be
 *    a module cycle. When the bots module does not provide the port (tests, partial deploys) the
 *    strategies module answers "not on the Bot" and refuses `apply_next` with 503.
 *
 * Contract expected from `applyNext(tx, userId, request)` (W3):
 *  - writes only the unlocked next-session row of the user's Bot inside `tx`;
 *  - `request.ref.source = 'user'` → `follow_latest = request.follow_latest ?? true`;
 *    `'iqx'` → pins `version` (default current), 409 `IQX_TEMPLATE_HIDDEN` when hidden and not
 *    already pinned by this Bot;
 *  - `expected_next_session` differs from the computed next session → 409 `SCHEDULE_SESSION_LOCKED`;
 *  - lowering Giữ tối đa with due positions: missing `confirm_due_positions` → 422
 *    `DUE_CONFIRM_REQUIRED`, different list → 409 `DUE_POSITIONS_CHANGED` (§6.5);
 *  - errors are thrown as Nest `HttpException`s with `{code, message, details?}` so the caller's
 *    transaction rolls back and the client sees the same body as PUT /bot/schedule/next.
 */
import { ServiceUnavailableException } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';

import {
  BOT_SCHEDULE_PORT,
  PRICE_STORE,
  type PriceStorePort,
  type BotSchedulePort,
  type ScheduleUsage,
  type StrategySource,
} from '../strategy-rules/index.js';

export { BOT_SCHEDULE_PORT };
export type { BotSchedulePort, ScheduleUsage };

/** Versions of one strategy referenced by the Bot's last and next session rows (null = not used). */
export type ScheduleVersionUsage = {
  /** Version locked for the last session that ran with this strategy. */
  last: number | null;
  /** Version pinned for the next session; with `next_follow_latest` it is the latest version. */
  next: number | null;
  next_follow_latest: boolean;
};

export interface BotScheduleVersionUsagePort {
  versionUsage?(userId: string, source: StrategySource, id: string): Promise<ScheduleVersionUsage>;
}

export type BotScheduleLike = BotSchedulePort & BotScheduleVersionUsagePort;

export const NOT_ON_BOT: ScheduleUsage = Object.freeze({ last: false, next: false });

export function resolveBotSchedule(moduleRef: ModuleRef | undefined): BotScheduleLike | null {
  if (!moduleRef) return null;
  try {
    return moduleRef.get<BotScheduleLike>(BOT_SCHEDULE_PORT, { strict: false });
  } catch {
    return null;
  }
}

export const botScheduleUnavailable = () =>
  new ServiceUnavailableException({
    code: 'BOT_SCHEDULE_UNAVAILABLE',
    message: 'Lịch phiên Bot chưa sẵn sàng. Thử lại sau.',
  });

/** `PRICE_STORE` (W1 price-store module) from anywhere in the app; null when not registered. */
export function resolvePriceStore(moduleRef: ModuleRef | undefined): PriceStorePort | null {
  if (!moduleRef) return null;
  try {
    return moduleRef.get<PriceStorePort>(PRICE_STORE, { strict: false });
  } catch {
    return null;
  }
}
