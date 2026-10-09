import { ConflictException } from '@nestjs/common';

import type { SqlClient } from '../../platform/database/index.js';

/**
 * Which Bot buy-universe revisions still use a saved list (Strategy spec §8.7). The rules mirror
 * the Bot's own resolution (`bot-universe.service`):
 *  - effective: the newest revision in (pending, effective) whose `effective_session` is not after
 *    today (Asia/Ho_Chi_Minh);
 *  - pending: a `pending` revision whose session is after today, or the user's newest revision
 *    when its calendar is unavailable.
 * Cancelled and superseded revisions, and older revisions an effective one replaced, do not count.
 */
export type BotUsageRow = {
  revision: number;
  role: 'effective' | 'pending';
  status: string;
  effective_session: string | null;
  source_name: string;
  saved_list_id: string;
};

const USAGE_CORE = `
  SELECT r.revision,
         CASE WHEN r.status = 'calendar_unavailable' OR r.effective_session > $3::date
              THEN 'pending' ELSE 'effective' END AS role,
         r.status,
         r.effective_session::text AS effective_session,
         r.name AS source_name,
         r.saved_list_id::text AS saved_list_id
    FROM bot_universe_revisions r
   WHERE r.user_id = $1
     AND r.saved_list_id = ANY($2::uuid[])
     AND (
       (r.status = 'pending' AND r.effective_session > $3::date)
       OR (r.status = 'calendar_unavailable'
           AND r.revision = (SELECT max(m.revision) FROM bot_universe_revisions m
                              WHERE m.user_id = $1))
       OR r.revision = (SELECT l.revision FROM bot_universe_revisions l
                         WHERE l.user_id = $1 AND l.status IN ('pending', 'effective')
                           AND l.effective_session <= $3::date
                         ORDER BY l.revision DESC LIMIT 1)
     )
   ORDER BY r.revision DESC`;

/** Usage of one list. `$2` is the list id as a one-element uuid array. */
export const BOT_USAGE_SQL = USAGE_CORE;

export async function findBotUsage(
  client: SqlClient,
  userId: string,
  listIds: readonly string[],
  today: string,
): Promise<BotUsageRow[]> {
  if (!listIds.length) return [];
  return client.query<BotUsageRow>(BOT_USAGE_SQL, [userId, [...listIds], today]);
}

/** 409 with a code the page can explain: switch the Bot to another source or VN30 first. */
export function listInUseByBot(usage: readonly BotUsageRow[]): ConflictException {
  return new ConflictException({
    code: 'LIST_IN_USE_BY_BOT',
    message:
      'Danh mục đang là nguồn mua của Bot (hoặc đang chờ hiệu lực). Hãy chuyển Bot sang danh mục khác hoặc về VN30 và chờ hiệu lực trước khi xóa.',
    details: usage.map((row) => ({
      role: row.role,
      revision: row.revision,
      status: row.status,
      effective_session: row.effective_session,
      source_name: row.source_name,
      saved_list_id: row.saved_list_id,
      next_step:
        row.role === 'pending'
          ? 'cancel_pending_bot_source_or_wait_for_it_to_take_effect'
          : 'switch_bot_source_to_another_list_or_vn30_first',
    })),
  });
}
