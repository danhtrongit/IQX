import type { SqlClient } from '../../platform/database/index.js';

/**
 * Silent Bot pause of the indicator-conditions V3 upgrade (SPEC V3 §6.2, migration 0032).
 *
 * A Bot that was running when the conditions moved to `iqx-rules-4.0` gets one
 * `bot_config_pauses` row. While it is unresolved the session is skipped exactly like a
 * suspended account: no signal, no order, no receipt, no NAV row, positions and cash untouched,
 * no notification. Saving the shared config sets `resume_revision`; the Bot runs again from the
 * session where that revision is effective (the next session, as for any save).
 */
export const BOT_CONFIG_PAUSE_REASON = 'indicator_conditions_v3' as const;

export type BotConfigPause = {
  reason: typeof BOT_CONFIG_PAUSE_REASON;
  paused_at: Date | string;
  /** Shared-config revision written by the migration (the new defaults); null without one. */
  paused_revision: number | null;
  /** First revision saved by the user after the pause; null until then. */
  resume_revision: number | null;
  resumed_at: Date | string | null;
};

export async function readConfigPause(
  client: SqlClient,
  userId: string,
): Promise<BotConfigPause | null> {
  const rows = await client.query<BotConfigPause>(
    `select reason, paused_at, paused_revision, resume_revision, resumed_at
     from bot_config_pauses where user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * The pause holds while no revision was saved after it, or while the revision effective for
 * the session is older than that save (`effectiveRevision` null = nothing effective yet).
 */
export function configPauseUnresolved(
  pause: Pick<BotConfigPause, 'resume_revision'> | null,
  effectiveRevision: number | null,
): boolean {
  if (!pause) return false;
  if (pause.resume_revision === null) return true;
  return effectiveRevision === null || effectiveRevision < pause.resume_revision;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Owner decision 1 ("Bot đang chạy"), the config half: the PRE-migration effective document
 * (any rule version, read as raw JSON) has at least one indicator with master ON, a side ON and
 * at least one rule of that side ON (a rule without `enabled` counts as ON). The migration also
 * requires `bot_accounts.status = 'active'` and a `bot_instances` row before pausing a Bot.
 */
export function botHasActiveConditions(rawConfig: unknown): boolean {
  if (!isRecord(rawConfig) || !isRecord(rawConfig.indicators)) return false;
  return Object.values(rawConfig.indicators).some((item) => {
    if (!isRecord(item) || item.master_enabled !== true) return false;
    return (['buy', 'sell'] as const).some((side) => {
      const value = item[side];
      return (
        isRecord(value) &&
        value.enabled === true &&
        Array.isArray(value.rules) &&
        value.rules.some((rule) => isRecord(rule) && rule.enabled !== false)
      );
    });
  });
}
