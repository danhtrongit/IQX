import { ForbiddenException } from '@nestjs/common';

/**
 * Advanced capability → LEGACY lesson (18-chapter / 125-lesson catalog) whose 8/8 pass unlocks it.
 *
 * These lessons (old ch02-l14..16 and ch16-18) are not part of the current 13-chapter / 71-lesson
 * Academy catalog and the current catalog grants no `lesson:<id>` capability. The unlock is kept
 * only for legacy holders: `ACADEMY_GRANTS` still returns the `lesson:<legacy id>` capabilities
 * stored in the legacy `academy_grants` table, so existing users keep these backtest features
 * behind the same `STRATEGY_ADVANCED_CAPABILITIES` allowlist. A user without a legacy grant
 * cannot earn them any more (the Strategy spec removes these features from the product scope).
 */
export const CAPABILITY_LESSONS: Readonly<Record<string, string>> = Object.freeze({
  sensitivity: 'ch02-l14',
  out_of_sample: 'ch02-l15',
  walk_forward: 'ch02-l16',
  universe: 'ch16-l01',
  ranking: 'ch16-l02',
  logic_groups: 'ch16-l03',
  multi_timeframe: 'ch16-l04',
  signal_priority: 'ch16-l05',
  reentry_cooldown: 'ch16-l06',
  sizing_pct_nav: 'ch17-l01',
  sizing_fixed_amount: 'ch17-l02',
  max_positions: 'ch17-l03',
  stop_loss_pct: 'ch17-l04',
  take_profit_pct: 'ch17-l05',
  trailing_pct: 'ch17-l06',
  max_holding: 'ch17-l07',
  portfolio: 'ch18-l01',
  correlation: 'ch18-l02',
  concentration: 'ch18-l03',
  sector_weights: 'ch18-l04',
  rebalancing: 'ch18-l05',
  portfolio_drawdown: 'ch18-l06',
});

export type CapabilityLock = {
  capability: string;
  reason: 'flag_off' | 'not_learned';
  lesson_id: string | null;
};

/**
 * First locked capability of a run, or null when every one is usable. A
 * capability is usable only when it is in the `STRATEGY_ADVANCED_CAPABILITIES`
 * allowlist AND the user holds the legacy capability `lesson:<legacy id>`. Flag problems are
 * reported before learning problems so a disabled feature never asks for a lesson.
 */
export function findCapabilityLock(
  required: readonly string[],
  allowlist: readonly string[],
  granted: ReadonlySet<string>,
): CapabilityLock | null {
  const enabled = new Set(allowlist);
  const unique = [...new Set(required)];
  const off = unique.find((capability) => !enabled.has(capability));
  if (off !== undefined)
    return { capability: off, reason: 'flag_off', lesson_id: CAPABILITY_LESSONS[off] ?? null };
  for (const capability of unique) {
    const lesson = CAPABILITY_LESSONS[capability];
    if (lesson === undefined || !granted.has(`lesson:${lesson}`))
      return { capability, reason: 'not_learned', lesson_id: lesson ?? null };
  }
  return null;
}

/** 403 CAPABILITY_LOCKED; lock details are repeated in `details` because the error filter only forwards arrays. */
export function capabilityLockedException(lock: CapabilityLock): ForbiddenException {
  return new ForbiddenException({
    code: 'CAPABILITY_LOCKED',
    message:
      lock.reason === 'flag_off'
        ? `Tính năng nâng cao ${lock.capability} chưa được bật.`
        : `Tính năng nâng cao ${lock.capability} chỉ dành cho tài khoản đã hoàn thành bài học ${lock.lesson_id ?? ''} (8/8) của danh mục Học viện cũ; danh mục hiện tại không còn bài học này.`,
    capability: lock.capability,
    reason: lock.reason,
    lesson_id: lock.lesson_id,
    details: [lock],
  });
}
