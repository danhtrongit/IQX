import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import {
  PRICE_STORE,
  STRATEGY_READER,
  STRATEGY_RULES,
  universeLabel,
  type BotSchedulePort,
  type DueImpact,
  type DuePosition,
  type PriceStorePort,
  type ResolvedStrategy,
  type ScheduleApplyRequest,
  type ScheduleUsage,
  type SessionCalendar,
  type StrategyContent,
  type StrategyReaderPort,
  type StrategySource,
} from '../strategy-rules/index.js';
import {
  botCalendar,
  botSessionCutoff,
  cutoffInstant,
  ictDate,
  isAtOrAfterCutoff,
  isSession,
  loadHolidays,
  nextSessionAt,
} from './bot-calendar.js';

export type ScheduleRow = {
  bot_id: string;
  session_date: string;
  strategy_source: StrategySource | null;
  strategy_id: string | null;
  version: number | null;
  follow_latest: boolean;
  locked_at: Date | string | null;
  run_status: string | null;
};

export type ScheduleState = {
  /** Latest locked row that ran (or will run) — "Phiên gần nhất". */
  last: ScheduleRow | null;
  /** The unlocked row — "Phiên tới". */
  next: ScheduleRow;
  /** Row locked during this call (lazy lock at cutoff), if any. */
  lockedNow: ScheduleRow | null;
};

export type ScheduleEntryView = {
  session_date: string;
  source: StrategySource | null;
  id: string | null;
  name: string | null;
  version: number | null;
  version_label: string | null;
  hidden: boolean;
  deleted: boolean;
  max_holding: number;
  universe_label: string | null;
  content: StrategyContent | null;
};

export type ScheduleView = {
  last: ScheduleEntryView | null;
  next: ScheduleEntryView & { follow_latest: boolean; cutoff_at: string };
  iqx_update: { latest_version: number; content: StrategyContent } | null;
};

type BotRef = { bot_id: string; user_id: string; account_id: string };

const SCHEDULE_COLUMNS = `bot_id, to_char(session_date, 'YYYY-MM-DD') as session_date,
  strategy_source, strategy_id, version, follow_latest, locked_at, run_status`;

function sameRef(row: ScheduleRow, source: StrategySource, id: string): boolean {
  return row.strategy_source === source && row.strategy_id === id;
}

/**
 * Bot v2.0 Lịch phiên (spec §6, PLAN §6.2): one row per session, the unlocked row is "Phiên
 * tới". Every write targets only the unlocked row and is checked against `expected_next_session`;
 * a row is locked at the cutoff of its session (by the Bot job, or lazily by the first request
 * after the cutoff) and from then on never changes (§6.4).
 */
@Injectable()
export class BotScheduleService implements BotSchedulePort {
  constructor(
    private readonly database: DatabaseService,
    @Optional() @Inject(STRATEGY_READER) private readonly reader?: StrategyReaderPort,
    @Optional() @Inject(PRICE_STORE) private readonly priceStore?: PriceStorePort,
  ) {}

  // ---------------------------------------------------------------------------------------
  // Calendar and rows
  // ---------------------------------------------------------------------------------------

  async calendar(client: SqlClient = this.database): Promise<SessionCalendar> {
    const [dates, holidays] = await Promise.all([
      this.priceStore ? this.priceStore.calendar() : Promise.resolve([] as string[]),
      loadHolidays(client),
    ]);
    return botCalendar(dates, holidays);
  }

  private async botFor(client: SqlClient, userId: string, lock = false): Promise<BotRef | null> {
    const rows = await client.query<BotRef>(
      `select i.id as bot_id, i.user_id, i.bot_account_id as account_id
         from bot_instances i where i.user_id = $1${lock ? ' for update' : ''}`,
      [userId],
    );
    return rows[0] ?? null;
  }

  private async requireBot(client: SqlClient, userId: string, lock = false): Promise<BotRef> {
    const bot = await this.botFor(client, userId, lock);
    if (!bot) {
      throw new NotFoundException({ code: 'BOT_NOT_FOUND', message: 'Bot chưa được khởi tạo' });
    }
    return bot;
  }

  private async rows(client: SqlClient, botId: string): Promise<{
    unlocked: ScheduleRow | null;
    lastLocked: ScheduleRow | null;
  }> {
    const unlocked =
      (
        await client.query<ScheduleRow>(
          `select ${SCHEDULE_COLUMNS} from bot_strategy_schedule
            where bot_id = $1 and locked_at is null`,
          [botId],
        )
      )[0] ?? null;
    const lastLocked =
      (
        await client.query<ScheduleRow>(
          `select ${SCHEDULE_COLUMNS} from bot_strategy_schedule
            where bot_id = $1 and locked_at is not null
              and coalesce(run_status, '') <> 'skipped_no_session'
            order by session_date desc limit 1`,
          [botId],
        )
      )[0] ?? null;
    return { unlocked, lastLocked };
  }

  /** Latest version of a user strategy saved at or before `at` (follow_latest at the cutoff). */
  private async latestUserVersion(
    client: SqlClient,
    userId: string,
    strategyId: string,
    at: Date,
  ): Promise<number | null> {
    const table = (
      await client.query<{ present: boolean }>(
        `select to_regclass('public.user_strategy_versions') is not null as present`,
      )
    )[0]?.present;
    if (table) {
      const rows = await client.query<{ version: number | null }>(
        `select max(v.version)::int as version
           from user_strategy_versions v join user_strategies s on s.id = v.strategy_id
          where v.strategy_id::text = $1 and s.user_id = $2 and v.created_at <= $3`,
        [strategyId, userId, at],
      );
      if (rows[0]?.version) return rows[0].version;
    }
    const resolved = await this.reader?.resolve(userId, { source: 'user', id: strategyId }, client);
    return resolved?.ref.version ?? null;
  }

  /**
   * Bring the rows of one Bot up to `now` inside `tx` (caller holds the bot_instances row lock):
   *  1. at/after the cutoff of a session day, the unlocked row becomes that session's locked row
   *     (follow_latest resolved to the version saved at the cutoff);
   *  2. the unlocked row is (re)dated to Phiên tới, or created as a copy of the last locked row.
   */
  async ensure(tx: SqlClient, bot: BotRef, now = new Date(), calendar?: SessionCalendar): Promise<ScheduleState> {
    const cal = calendar ?? (await this.calendar(tx));
    const cutoff = botSessionCutoff();
    const today = ictDate(now);
    let { unlocked, lastLocked } = await this.rows(tx, bot.bot_id);
    const todayLockedRow = (
      await tx.query<ScheduleRow>(
        `select ${SCHEDULE_COLUMNS} from bot_strategy_schedule
          where bot_id = $1 and session_date = $2::date and locked_at is not null`,
        [bot.bot_id, today],
      )
    )[0];
    let lockedNow: ScheduleRow | null = null;
    if (
      !todayLockedRow &&
      unlocked &&
      unlocked.session_date <= today &&
      isSession(cal, today) &&
      isAtOrAfterCutoff(now, cutoff)
    ) {
      lockedNow = await this.lockRow(tx, bot, unlocked, today, now, cutoff);
      lastLocked = lockedNow;
      unlocked = null;
    }
    const next = nextSessionAt(cal, now, {
      todayLocked: Boolean(todayLockedRow) || lockedNow !== null,
      cutoff,
    });
    if (!unlocked) {
      const template = lastLocked;
      const inserted = await tx.query<ScheduleRow>(
        `insert into bot_strategy_schedule
           (bot_id, session_date, strategy_source, strategy_id, version, follow_latest, updated_at)
         values ($1, $2::date, $3, $4, $5, $6, now())
         on conflict (bot_id, session_date) do update set updated_at = excluded.updated_at
         returning ${SCHEDULE_COLUMNS}`,
        [
          bot.bot_id,
          next,
          template?.strategy_source ?? null,
          template?.strategy_id ?? null,
          template?.strategy_source ? template.version : null,
          template?.follow_latest ?? false,
        ],
      );
      unlocked = inserted[0] ?? null;
      if (!unlocked || unlocked.locked_at !== null) {
        throw new Error(`Không tạo được dòng lịch phiên tới ${next}`);
      }
    } else if (unlocked.session_date !== next) {
      unlocked = (
        await tx.query<ScheduleRow>(
          `update bot_strategy_schedule set session_date = $3::date, updated_at = now()
            where bot_id = $1 and session_date = $2::date and locked_at is null
            returning ${SCHEDULE_COLUMNS}`,
          [bot.bot_id, unlocked.session_date, next],
        )
      )[0]!;
    }
    return { last: lastLocked, next: unlocked, lockedNow };
  }

  private async lockRow(
    tx: SqlClient,
    bot: BotRef,
    row: ScheduleRow,
    session: string,
    now: Date,
    cutoff: { hour: number; minute: number },
  ): Promise<ScheduleRow> {
    let version = row.version;
    if (row.strategy_source === 'user' && row.strategy_id && row.follow_latest) {
      version =
        (await this.latestUserVersion(
          tx,
          bot.user_id,
          row.strategy_id,
          cutoffInstant(session, cutoff),
        )) ?? row.version;
    }
    if (row.strategy_source && version === null) {
      const resolved = await this.reader?.resolve(
        bot.user_id,
        { source: row.strategy_source, id: row.strategy_id! },
        tx,
      );
      version = resolved?.ref.version ?? null;
    }
    // A strategy whose version cannot be resolved any more runs as "Chưa chọn" for the session.
    const keep = row.strategy_source !== null && version !== null;
    // A locked row for this session cannot exist (checked by the caller), but a stale locked
    // row of an older date may: the unlocked row is re-dated onto `session`.
    const locked = (
      await tx.query<ScheduleRow>(
        `update bot_strategy_schedule
            set session_date = $3::date, locked_at = $4, version = $5,
                strategy_source = $6, strategy_id = $7, updated_at = now()
          where bot_id = $1 and session_date = $2::date and locked_at is null
          returning ${SCHEDULE_COLUMNS}`,
        [
          bot.bot_id,
          row.session_date,
          session,
          now,
          keep ? version : null,
          keep ? row.strategy_source : null,
          keep ? row.strategy_id : null,
        ],
      )
    )[0];
    if (!locked) throw new Error(`Không khóa được lịch phiên ${session}`);
    return locked;
  }

  /**
   * Locked row of session D for the Bot run (§6.4 steps 1–3): locks the unlocked row when the
   * cutoff of D has passed, creates the next row, and returns D's row (null when D is not a
   * session for this Bot).
   */
  async lockForSession(userId: string, session: string, now = new Date()): Promise<ScheduleRow | null> {
    return this.database.transaction(async (tx) => {
      const bot = await this.requireBot(tx, userId, true);
      await this.ensure(tx, bot, now);
      return (
        (
          await tx.query<ScheduleRow>(
            `select ${SCHEDULE_COLUMNS} from bot_strategy_schedule
              where bot_id = $1 and session_date = $2::date and locked_at is not null`,
            [bot.bot_id, session],
          )
        )[0] ?? null
      );
    });
  }

  async markRun(client: SqlClient, botId: string, session: string, status: string): Promise<void> {
    await client.query(
      `update bot_strategy_schedule set run_status = $3, updated_at = now()
        where bot_id = $1 and session_date = $2::date and locked_at is not null`,
      [botId, session, status],
    );
  }

  // ---------------------------------------------------------------------------------------
  // Resolution
  // ---------------------------------------------------------------------------------------

  async resolveRow(
    userId: string,
    row: Pick<ScheduleRow, 'strategy_source' | 'strategy_id' | 'version' | 'follow_latest'>,
    client: SqlClient = this.database,
    latest = false,
  ): Promise<ResolvedStrategy | null> {
    if (!row.strategy_source || !row.strategy_id || !this.reader) return null;
    const version =
      latest || (row.strategy_source === 'user' && row.follow_latest) ? undefined : (row.version ?? undefined);
    return this.reader.resolve(
      userId,
      { source: row.strategy_source, id: row.strategy_id, ...(version ? { version } : {}) },
      client,
    );
  }

  private async entryView(
    userId: string,
    row: ScheduleRow,
    client: SqlClient,
  ): Promise<ScheduleEntryView> {
    const resolved = await this.resolveRow(userId, row, client);
    return {
      session_date: row.session_date,
      source: resolved ? row.strategy_source : null,
      id: resolved ? row.strategy_id : null,
      name: resolved?.name ?? null,
      version: resolved?.ref.version ?? null,
      version_label: resolved?.version_label ?? null,
      hidden: resolved?.hidden ?? false,
      deleted: resolved?.deleted ?? false,
      max_holding: resolved?.content.max_holding ?? STRATEGY_RULES.default_max_holding,
      universe_label: resolved ? universeLabel(resolved.content.universe) : null,
      content: resolved?.content ?? null,
    };
  }

  async view(userId: string, now = new Date()): Promise<ScheduleView> {
    return this.database.transaction(async (tx) => {
      const bot = await this.requireBot(tx, userId, true);
      const state = await this.ensure(tx, bot, now);
      return this.viewOf(tx, userId, state);
    });
  }

  private async viewOf(tx: SqlClient, userId: string, state: ScheduleState): Promise<ScheduleView> {
    const last = state.last ? await this.entryView(userId, state.last, tx) : null;
    const next = await this.entryView(userId, state.next, tx);
    let iqxUpdate: ScheduleView['iqx_update'] = null;
    if (next.source === 'iqx' && next.id && next.version !== null) {
      const current = await this.resolveRow(userId, state.next, tx, true);
      if (current && current.ref.version > next.version) {
        iqxUpdate = { latest_version: current.ref.version, content: current.content };
      }
    }
    return {
      last,
      next: {
        ...next,
        follow_latest: state.next.follow_latest,
        cutoff_at: cutoffInstant(state.next.session_date).toISOString(),
      },
      iqx_update: iqxUpdate,
    };
  }

  // ---------------------------------------------------------------------------------------
  // Hạ giữ tối đa (§6.5)
  // ---------------------------------------------------------------------------------------

  private async duePositions(
    client: SqlClient,
    bot: BotRef,
    calendar: SessionCalendar,
    nextSession: string,
    nCurrent: number,
    nNew: number,
  ): Promise<DuePosition[]> {
    if (nNew >= nCurrent) return [];
    const positions = await client.query<{
      symbol: string;
      opened_session: string;
      anchor_session: string | null;
    }>(
      `select symbol, to_char(opened_session, 'YYYY-MM-DD') as opened_session,
              to_char(anchor_session, 'YYYY-MM-DD') as anchor_session
         from bot_positions where bot_account_id = $1 and status = 'open' order by symbol`,
      [bot.account_id],
    );
    const due: DuePosition[] = [];
    for (const position of positions) {
      const held = calendar.countSessions(position.opened_session, nextSession);
      if (held < STRATEGY_RULES.settlement_sessions) continue;
      const counted = calendar.countSessions(
        position.anchor_session ?? position.opened_session,
        nextSession,
      );
      if (counted >= nNew && counted < nCurrent) {
        due.push({ symbol: position.symbol, counted, sell_session: nextSession });
      }
    }
    return due;
  }

  private async maxHoldingOf(
    userId: string,
    row: ScheduleRow | null,
    client: SqlClient,
  ): Promise<number> {
    if (!row) return STRATEGY_RULES.default_max_holding;
    const resolved = await this.resolveRow(userId, row, client);
    return resolved?.content.max_holding ?? STRATEGY_RULES.default_max_holding;
  }

  private async resolveTarget(
    userId: string,
    ref: { source: StrategySource; id: string; version?: number },
    client: SqlClient,
  ): Promise<ResolvedStrategy> {
    const resolved = this.reader ? await this.reader.resolve(userId, ref, client) : null;
    if (!resolved || (ref.source === 'user' && resolved.deleted)) {
      throw new NotFoundException({
        code: 'STRATEGY_NOT_FOUND',
        message: 'Không tìm thấy chiến lược',
      });
    }
    return resolved;
  }

  async impact(
    userId: string,
    ref: { source: StrategySource; id: string; version?: number },
    now = new Date(),
  ): Promise<DueImpact> {
    return this.database.transaction(async (tx) => {
      const bot = await this.requireBot(tx, userId, true);
      const calendar = await this.calendar(tx);
      const state = await this.ensure(tx, bot, now, calendar);
      const target = await this.resolveTarget(userId, ref, tx);
      const nCurrent = await this.maxHoldingOf(userId, state.next, tx);
      const nNew = target.content.max_holding;
      return {
        next_session: state.next.session_date,
        n_current: nCurrent,
        n_new: nNew,
        positions: await this.duePositions(tx, bot, calendar, state.next.session_date, nCurrent, nNew),
      };
    });
  }

  private assertConfirmed(due: DuePosition[], confirm: readonly string[] | undefined): void {
    if (due.length === 0) return;
    if (!confirm || confirm.length === 0) {
      throw new UnprocessableEntityException({
        code: 'DUE_CONFIRM_REQUIRED',
        message: `${due.length} vị thế sẽ được bán ở phiên tới vì đã giữ đủ số phiên mới. Cần xác nhận.`,
        details: due,
      });
    }
    const expected = [...new Set(due.map((row) => row.symbol))].sort();
    const given = [...new Set(confirm.map((symbol) => symbol.trim().toUpperCase()))].sort();
    if (JSON.stringify(expected) !== JSON.stringify(given)) {
      throw new ConflictException({
        code: 'DUE_POSITIONS_CHANGED',
        message: 'Danh sách vị thế đến hạn đã thay đổi. Xem lại trước khi xác nhận.',
        details: due,
      });
    }
  }

  private assertNextSession(state: ScheduleState, expected: string): void {
    if (state.next.session_date !== expected) {
      throw new ConflictException({
        code: 'SCHEDULE_SESSION_LOCKED',
        message: `Phiên ${expected} vừa chốt. Thay đổi áp dụng từ phiên ${state.next.session_date}.`,
        details: [{ next_session: state.next.session_date }],
      });
    }
  }

  // ---------------------------------------------------------------------------------------
  // Writes (§6.3, §5.3) — only the unlocked row, never an order
  // ---------------------------------------------------------------------------------------

  /** `BOT_SCHEDULE_PORT.applyNext`: inside the caller's transaction (W2 "Lưu và áp dụng"). */
  async applyNext(tx: SqlClient, userId: string, request: ScheduleApplyRequest, now = new Date()): Promise<ScheduleView> {
    const bot = await this.requireBot(tx, userId, true);
    const calendar = await this.calendar(tx);
    const state = await this.ensure(tx, bot, now, calendar);
    this.assertNextSession(state, request.expected_next_session);
    const target = await this.resolveTarget(userId, request.ref, tx);
    if (
      request.ref.source === 'iqx' &&
      target.hidden &&
      !sameRef(state.next, 'iqx', request.ref.id) &&
      !(state.last && sameRef(state.last, 'iqx', request.ref.id))
    ) {
      throw new ConflictException({
        code: 'IQX_TEMPLATE_HIDDEN',
        message: 'IQX đã ngừng cung cấp chiến lược này.',
      });
    }
    const nCurrent = await this.maxHoldingOf(userId, state.next, tx);
    const due = await this.duePositions(
      tx,
      bot,
      calendar,
      state.next.session_date,
      nCurrent,
      target.content.max_holding,
    );
    this.assertConfirmed(due, request.confirm_due_positions);
    const followLatest = request.ref.source === 'user' ? (request.follow_latest ?? true) : false;
    await tx.query(
      `update bot_strategy_schedule
          set strategy_source = $3, strategy_id = $4, version = $5, follow_latest = $6,
              updated_at = now(), updated_by = $7
        where bot_id = $1 and session_date = $2::date and locked_at is null`,
      [
        bot.bot_id,
        state.next.session_date,
        request.ref.source,
        request.ref.id,
        target.ref.version,
        followLatest,
        userId,
      ],
    );
    const after = await this.ensure(tx, bot, now, calendar);
    return this.viewOf(tx, userId, after);
  }

  /** PUT /bot/schedule/next. */
  putNext(
    userId: string,
    body: {
      source: StrategySource;
      id: string;
      version?: number;
      expected_next_session: string;
      confirm_due_positions?: string[];
    },
    now = new Date(),
  ): Promise<ScheduleView> {
    return this.database.transaction((tx) =>
      this.applyNext(
        tx,
        userId,
        {
          ref: {
            source: body.source,
            id: body.id,
            ...(body.source === 'iqx' && body.version ? { version: body.version } : {}),
          },
          expected_next_session: body.expected_next_session,
          confirm_due_positions: body.confirm_due_positions,
        },
        now,
      ),
    );
  }

  /** POST /bot/schedule/next/keep-last: the next session runs exactly the last one (pinned). */
  keepLast(
    userId: string,
    body: { expected_next_session: string; confirm_due_positions?: string[] },
    now = new Date(),
  ): Promise<ScheduleView> {
    return this.database.transaction(async (tx) => {
      const bot = await this.requireBot(tx, userId, true);
      const calendar = await this.calendar(tx);
      const state = await this.ensure(tx, bot, now, calendar);
      this.assertNextSession(state, body.expected_next_session);
      if (!state.last) {
        throw new NotFoundException({
          code: 'SCHEDULE_LAST_NOT_FOUND',
          message: 'Bot chưa có phiên gần nhất.',
        });
      }
      const nCurrent = await this.maxHoldingOf(userId, state.next, tx);
      const nNew = await this.maxHoldingOf(userId, state.last, tx);
      const due = await this.duePositions(tx, bot, calendar, state.next.session_date, nCurrent, nNew);
      this.assertConfirmed(due, body.confirm_due_positions);
      await tx.query(
        `update bot_strategy_schedule
            set strategy_source = $3, strategy_id = $4, version = $5, follow_latest = false,
                updated_at = now(), updated_by = $6
          where bot_id = $1 and session_date = $2::date and locked_at is null`,
        [
          bot.bot_id,
          state.next.session_date,
          state.last.strategy_source,
          state.last.strategy_id,
          state.last.strategy_source ? state.last.version : null,
          userId,
        ],
      );
      const after = await this.ensure(tx, bot, now, calendar);
      return this.viewOf(tx, userId, after);
    });
  }

  // ---------------------------------------------------------------------------------------
  // Reads for other modules (BOT_SCHEDULE_PORT) and the Bot strategy lists
  // ---------------------------------------------------------------------------------------

  async usage(userId: string, source: StrategySource, id: string): Promise<ScheduleUsage> {
    const bot = await this.botFor(this.database, userId);
    if (!bot) return { last: false, next: false };
    const { unlocked, lastLocked } = await this.rows(this.database, bot.bot_id);
    return {
      last: Boolean(lastLocked && sameRef(lastLocked, source, id)),
      next: Boolean(unlocked && sameRef(unlocked, source, id)),
    };
  }

  /** Exact versions of one strategy on the last locked and the next session rows (W2 "Lịch sử bản"). */
  async versionUsage(
    userId: string,
    source: StrategySource,
    id: string,
  ): Promise<{ last: number | null; next: number | null; next_follow_latest: boolean }> {
    const bot = await this.botFor(this.database, userId);
    if (!bot) return { last: null, next: null, next_follow_latest: false };
    const { unlocked, lastLocked } = await this.rows(this.database, bot.bot_id);
    const onLast = Boolean(lastLocked && sameRef(lastLocked, source, id));
    const onNext = Boolean(unlocked && sameRef(unlocked, source, id));
    return {
      last: onLast && lastLocked!.version !== null ? Number(lastLocked!.version) : null,
      next: onNext && unlocked!.version !== null ? Number(unlocked!.version) : null,
      next_follow_latest: onNext && unlocked!.follow_latest === true,
    };
  }

  async botCountsByIqx(): Promise<Map<string, number>> {
    const rows = await this.database.query<{ strategy_id: string; n: number }>(
      `select strategy_id, count(*)::int as n from bot_strategy_schedule
        where locked_at is null and strategy_source = 'iqx' group by strategy_id`,
    );
    return new Map(rows.map((row) => [row.strategy_id, Number(row.n)]));
  }

  /**
   * GET /bot/strategy-options (§5.4): shown IQX strategies + hidden ones the Bot runs (last/next),
   * and the user's own strategies. Available to every Bot user (no Premium, D15).
   */
  async strategyOptions(userId: string, now = new Date()): Promise<{
    iqx: Array<{
      id: string;
      slug: string;
      name: string;
      version: number;
      universe_label: string;
      max_holding: number;
      hidden: boolean;
      on_bot: ScheduleUsage;
    }>;
    mine: Array<{
      id: string;
      name: string;
      latest_version: number;
      latest_saved_at: string | null;
      on_bot: ScheduleUsage;
    }>;
  }> {
    const state = await this.database.transaction(async (tx) => {
      const bot = await this.requireBot(tx, userId, true);
      return this.ensure(tx, bot, now);
    });
    const usage = (source: StrategySource, id: string): ScheduleUsage => ({
      last: Boolean(state.last && sameRef(state.last, source, id)),
      next: sameRef(state.next, source, id),
    });
    const templates = await this.database.query<{ id: string; slug: string; visibility: string }>(
      `select id::text as id, slug, visibility from iqx_templates
        where kind = 'strategy' and current_version is not null
        order by sort_order, slug`,
    );
    const iqx = [];
    for (const template of templates) {
      const onBot = usage('iqx', template.id);
      const hidden = template.visibility === 'hidden';
      if (hidden && !onBot.last && !onBot.next) continue;
      const resolved = await this.reader?.resolve(userId, { source: 'iqx', id: template.id });
      if (!resolved) continue;
      iqx.push({
        id: template.id,
        slug: template.slug,
        name: resolved.name,
        version: resolved.ref.version,
        universe_label: universeLabel(resolved.content.universe),
        max_holding: resolved.content.max_holding,
        hidden,
        on_bot: onBot,
      });
    }
    const present = (
      await this.database.query<{ present: boolean }>(
        `select to_regclass('public.user_strategies') is not null as present`,
      )
    )[0]?.present;
    const mine = present
      ? (
          await this.database.query<{
            id: string;
            name: string;
            latest_version: number;
            latest_saved_at: Date | string | null;
          }>(
            `select s.id::text as id, s.name, s.latest_version,
                    (select v.created_at from user_strategy_versions v
                      where v.strategy_id = s.id and v.version = s.latest_version) as latest_saved_at
               from user_strategies s
              where s.user_id = $1 and s.deleted_at is null
              order by s.updated_at desc, s.name`,
            [userId],
          )
        ).map((row) => ({
          id: row.id,
          name: row.name,
          latest_version: Number(row.latest_version),
          latest_saved_at:
            row.latest_saved_at === null
              ? null
              : new Date(row.latest_saved_at).toISOString(),
          on_bot: usage('user', row.id),
        }))
      : [];
    return { iqx, mine };
  }
}
