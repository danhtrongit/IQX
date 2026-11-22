import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import {
  PRICE_STORE,
  STRATEGY_RULES,
  defaultRange,
  earliestStart,
  normalizeSymbols,
  validateStrategyContent,
  type PriceStorePort,
  type StrategyContent,
  type StrategyContentKind,
  type StrategyValidationIssue,
} from '../strategy-rules/index.js';
import {
  NOT_ON_BOT,
  botScheduleUnavailable,
  resolveBotSchedule,
  resolvePriceStore,
  type BotScheduleLike,
  type ScheduleUsage,
} from './bot-schedule.port.js';
import { universeCountOf, universeLabelOf, userVersionLabel } from './strategies.labels.js';
import {
  STRATEGY_LIMIT,
  type StrategyCreateBody,
  type StrategyRestoreBody,
  type StrategyVersionCreateBody,
} from './strategies.schemas.js';

type Timestamp = Date | string;

type StrategyRow = {
  id: string;
  user_id: string;
  name: string;
  latest_version: number;
  sell_only: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
};

type VersionRow = {
  strategy_id: string;
  version: number;
  content: StrategyContent;
  config_hash: string;
  from_run_id: string | null;
  note: string | null;
  created_at: Timestamp;
};

type ApplyFields = {
  apply_next?: boolean | undefined;
  expected_next_session?: string | undefined;
  confirm_due_positions?: string[] | undefined;
};

const iso = (value: Timestamp) => new Date(value).toISOString();

export const strategyNotFound = () =>
  new NotFoundException({ code: 'STRATEGY_NOT_FOUND', message: 'Không tìm thấy chiến lược.' });

const nameTaken = () =>
  new ConflictException({
    code: 'STRATEGY_NAME_TAKEN',
    message: 'Tên này đã có trong chiến lược của bạn.',
    details: [{ field: 'name', message: 'Tên này đã có trong chiến lược của bạn.' }],
  });

const limitReached = () =>
  new ConflictException({
    code: 'STRATEGY_LIMIT',
    message: `Đã đủ ${STRATEGY_LIMIT} chiến lược. Xóa bớt trước khi tạo mới.`,
  });

const versionConflict = (latest: number) =>
  new ConflictException({
    code: 'STRATEGY_VERSION_CONFLICT',
    message: 'Chiến lược vừa được lưu ở nơi khác. Tải lại để xem bản mới nhất.',
    details: [{ latest_version: latest }],
  });

const runRequired = () =>
  new UnprocessableEntityException({
    code: 'RUN_REQUIRED',
    message: 'Bản nháp đã sửa sau lần chạy (hoặc chưa chạy). Bấm Chạy trước khi Lưu.',
  });

export function strategyInvalid(
  code: 'STRATEGY_INVALID' | 'UNIVERSE_EMPTY',
  issues: readonly StrategyValidationIssue[],
) {
  return new UnprocessableEntityException({
    code,
    message: issues[0]?.message ?? 'Chiến lược không hợp lệ.',
    details: issues,
  });
}

export const priceStoreUnavailable = () =>
  new ServiceUnavailableException({
    code: 'MARKET_DATA_UNAVAILABLE',
    message: 'Kho dữ liệu giá chưa sẵn sàng.',
  });

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';

/**
 * Chiến lược của người dùng (spec §4.3–4.6, §6.2, §10.3): at most 20 not deleted per user, unique
 * names (case-insensitive) among them, immutable versions proven by a Backtest run (`from_run_id`),
 * soft delete refused while the Bot's last or next session uses the strategy.
 */
@Injectable()
export class StrategiesService {
  constructor(
    private readonly database: DatabaseService,
    @Optional() private readonly moduleRef?: ModuleRef,
    /** `PRICE_STORE` from PriceStoreModule (imported by StrategiesModule). */
    @Optional() @Inject(PRICE_STORE) private readonly injectedStore?: PriceStorePort,
  ) {}

  private get store(): PriceStorePort | undefined {
    return this.injectedStore ?? resolvePriceStore(this.moduleRef) ?? undefined;
  }

  private get schedule(): BotScheduleLike | null {
    return resolveBotSchedule(this.moduleRef);
  }

  // ---------------------------------------------------------------------------------------------
  // Store + universe

  async storeMeta() {
    const store = this.requireStore();
    const [meta, calendar] = await Promise.all([store.meta(), store.calendar()]);
    const range = defaultRange(calendar);
    return {
      data_store: meta.data_store,
      data_as_of: meta.data_as_of,
      earliest_start: meta.earliest_start ?? earliestStart(calendar),
      price_unit: meta.price_unit,
      adjusted: meta.adjusted,
      sessions: meta.sessions,
      default_start: range?.start ?? null,
      default_end: range?.end ?? null,
      max_range_days: STRATEGY_RULES.max_range_days,
    };
  }

  async universeOptions(userId: string) {
    const eligibility = await this.requireStore().eligibility();
    const vn100 = new Set(eligibility.vn100);
    const lists = await this.database.query<{ id: string; name: string; tickers: string[] }>(
      `select id, name, tickers from list_snapshots
        where user_id = $1 and deleted_at is null and visibility = 'saved'
        order by created_at desc, id`,
      [userId],
    );
    return {
      vn30: { symbols: [...eligibility.vn30].sort() },
      vn100: { symbols: [...eligibility.vn100].sort() },
      saved_lists: lists.map((list) => {
        const symbols = normalizeSymbols(list.tickers ?? []);
        return {
          id: list.id,
          name: list.name,
          symbols_total: symbols.length,
          symbols_kept: symbols.filter((symbol) => vn100.has(symbol)),
          excluded: symbols.filter((symbol) => !vn100.has(symbol)),
        };
      }),
    };
  }

  /** Validates a content against the rules and the store's VN100 (saved lists are filtered). */
  async validateContent(input: unknown, kind: StrategyContentKind = 'user') {
    const needsStore =
      typeof input === 'object' &&
      input !== null &&
      (input as { universe?: { type?: unknown } }).universe?.type === 'saved_list';
    const eligible = needsStore
      ? new Set((await this.requireStore().eligibility()).vn100)
      : undefined;
    const checked = validateStrategyContent(input, {
      kind,
      ...(eligible ? { eligibleSymbols: eligible } : {}),
    });
    if (!checked.ok) throw strategyInvalid(checked.code, checked.issues);
    return checked;
  }

  // ---------------------------------------------------------------------------------------------
  // Reads

  async list(userId: string) {
    const rows = await this.database.query<
      StrategyRow & { content: StrategyContent; latest_saved_at: Timestamp }
    >(
      `select s.id, s.user_id, s.name, s.latest_version, s.sell_only, s.created_at, s.updated_at,
              s.deleted_at, v.content, v.created_at as latest_saved_at
         from user_strategies s
         join user_strategy_versions v on v.strategy_id = s.id and v.version = s.latest_version
        where s.user_id = $1 and s.deleted_at is null
        order by v.created_at desc, s.id`,
      [userId],
    );
    const usage = await this.usageMap(
      userId,
      rows.map((row) => row.id),
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        latest_version: Number(row.latest_version),
        latest_saved_at: iso(row.latest_saved_at),
        universe_label: universeLabelOf(row.content.universe),
        universe_count: universeCountOf(row.content.universe),
        sell_only: row.sell_only,
        on_bot: usage.get(row.id) ?? NOT_ON_BOT,
      })),
      limit: STRATEGY_LIMIT as typeof STRATEGY_LIMIT,
    };
  }

  async versions(userId: string, id: string) {
    const strategy = await this.owned(this.database, userId, id);
    const rows = await this.database.query<VersionRow>(
      `select strategy_id, version, content, trim(config_hash) as config_hash, from_run_id, note,
              created_at
         from user_strategy_versions where strategy_id = $1 order by version desc`,
      [id],
    );
    const versionUsage = await this.versionUsage(userId, strategy);
    return {
      strategy_id: strategy.id,
      name: strategy.name,
      latest_version: Number(strategy.latest_version),
      items: rows.map((row) => ({
        version: Number(row.version),
        created_at: iso(row.created_at),
        version_label: userVersionLabel(row.created_at),
        note: row.note,
        universe_label: universeLabelOf(row.content.universe),
        max_holding: row.content.max_holding,
        from_run_id: row.from_run_id,
        on_bot: {
          last: versionUsage.last === Number(row.version),
          next: versionUsage.next === Number(row.version),
        },
      })),
    };
  }

  async version(userId: string, id: string, version: number) {
    const strategy = await this.owned(this.database, userId, id);
    const row = await this.versionRow(this.database, id, version);
    if (!row)
      throw new NotFoundException({
        code: 'STRATEGY_VERSION_NOT_FOUND',
        message: 'Không tìm thấy bản của chiến lược.',
      });
    return this.versionView(strategy, row);
  }

  // ---------------------------------------------------------------------------------------------
  // Writes

  async create(userId: string, body: StrategyCreateBody) {
    const checked = await this.validateContent(body.content);
    return this.database.transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await this.assertRun(tx, userId, body.from_run_id, checked.config_hash);
      const [{ count }] = (await tx.query<{ count: string | number }>(
        `select count(*) as count from user_strategies where user_id = $1 and deleted_at is null`,
        [userId],
      )) as [{ count: string | number }];
      if (Number(count) >= STRATEGY_LIMIT) throw limitReached();
      await this.assertNameFree(tx, userId, body.name, null);
      let strategy: StrategyRow;
      try {
        [strategy] = (await tx.query<StrategyRow>(
          `insert into user_strategies (user_id, name, latest_version, sell_only)
           values ($1, $2, 1, $3)
           returning id, user_id, name, latest_version, sell_only, created_at, updated_at, deleted_at`,
          [userId, body.name, checked.content.sell_only === true],
        )) as [StrategyRow];
      } catch (error) {
        if (isUniqueViolation(error)) throw nameTaken();
        throw error;
      }
      const version = await this.insertVersion(
        tx,
        strategy.id,
        1,
        checked.content,
        checked.config_hash,
        body.from_run_id,
        null,
      );
      const schedule = await this.applyNext(tx, userId, strategy.id, 1, body);
      return {
        strategy: this.strategyView(strategy),
        version: this.versionView(strategy, version),
        schedule,
      };
    });
  }

  async rename(userId: string, id: string, name: string) {
    return this.database.transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const strategy = await this.owned(tx, userId, id);
      await this.assertNameFree(tx, userId, name, id);
      try {
        const [updated] = (await tx.query<StrategyRow>(
          `update user_strategies set name = $2, updated_at = now() where id = $1
           returning id, user_id, name, latest_version, sell_only, created_at, updated_at, deleted_at`,
          [strategy.id, name],
        )) as [StrategyRow];
        return this.strategyView(updated);
      } catch (error) {
        if (isUniqueViolation(error)) throw nameTaken();
        throw error;
      }
    });
  }

  /** Soft delete (§4.6): refused while the Bot's last or next session uses it. */
  async remove(userId: string, id: string): Promise<void> {
    await this.database.transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const strategy = await this.owned(tx, userId, id, true);
      const usage = await this.usage(userId, strategy.id);
      if (usage.last || usage.next)
        throw new ConflictException({
          code: 'STRATEGY_IN_USE',
          message: 'Đang dùng trên Bot. Đổi chiến lược của Bot trước khi xóa.',
          details: [usage],
        });
      await tx.query(
        `update user_strategies set deleted_at = now(), updated_at = now() where id = $1`,
        [strategy.id],
      );
    });
  }

  async createVersion(userId: string, id: string, body: StrategyVersionCreateBody) {
    const checked = await this.validateContent(body.content);
    return this.database.transaction(async (tx) => {
      const strategy = await this.lockStrategy(tx, userId, id);
      if (Number(strategy.latest_version) !== body.expected_latest_version)
        throw versionConflict(Number(strategy.latest_version));
      await this.assertRun(tx, userId, body.from_run_id, checked.config_hash);
      return this.appendVersion(
        tx,
        userId,
        strategy,
        checked.content,
        checked.config_hash,
        body.from_run_id,
        null,
        body,
      );
    });
  }

  /** "Khôi phục thành bản mới" (§4.10): the old version's content as a new version. */
  async restore(userId: string, id: string, version: number, body: StrategyRestoreBody) {
    return this.database.transaction(async (tx) => {
      const strategy = await this.lockStrategy(tx, userId, id);
      if (Number(strategy.latest_version) !== body.expected_latest_version)
        throw versionConflict(Number(strategy.latest_version));
      const source = await this.versionRow(tx, id, version);
      if (!source)
        throw new NotFoundException({
          code: 'STRATEGY_VERSION_NOT_FOUND',
          message: 'Không tìm thấy bản của chiến lược.',
        });
      const note = `Khôi phục từ ${userVersionLabel(source.created_at)}`;
      return this.appendVersion(
        tx,
        userId,
        strategy,
        source.content,
        source.config_hash,
        null,
        note,
        body,
      );
    });
  }

  // ---------------------------------------------------------------------------------------------

  private requireStore(): PriceStorePort {
    if (!this.store) throw priceStoreUnavailable();
    return this.store;
  }

  private async appendVersion(
    tx: SqlClient,
    userId: string,
    strategy: StrategyRow,
    content: StrategyContent,
    configHash: string,
    fromRunId: string | null,
    note: string | null,
    apply: ApplyFields,
  ) {
    const next = Number(strategy.latest_version) + 1;
    const version = await this.insertVersion(
      tx,
      strategy.id,
      next,
      content,
      configHash,
      fromRunId,
      note,
    );
    const [updated] = (await tx.query<StrategyRow>(
      `update user_strategies set latest_version = $2, sell_only = $3, updated_at = now()
        where id = $1
       returning id, user_id, name, latest_version, sell_only, created_at, updated_at, deleted_at`,
      [strategy.id, next, content.sell_only === true],
    )) as [StrategyRow];
    const schedule = await this.applyNext(tx, userId, strategy.id, next, apply);
    return {
      strategy: this.strategyView(updated),
      version: this.versionView(updated, version),
      schedule,
    };
  }

  private async insertVersion(
    tx: SqlClient,
    strategyId: string,
    version: number,
    content: StrategyContent,
    configHash: string,
    fromRunId: string | null,
    note: string | null,
  ): Promise<VersionRow> {
    const [row] = (await tx.query<VersionRow>(
      `insert into user_strategy_versions (strategy_id, version, content, config_hash, from_run_id, note)
       values ($1, $2, $3::jsonb, $4, $5, $6)
       returning strategy_id, version, content, trim(config_hash) as config_hash, from_run_id, note,
                 created_at`,
      [strategyId, version, JSON.stringify(content), configHash, fromRunId, note],
    )) as [VersionRow];
    return row;
  }

  private async applyNext(
    tx: SqlClient,
    userId: string,
    strategyId: string,
    version: number,
    apply: ApplyFields,
  ): Promise<unknown> {
    if (!apply.apply_next) return null;
    const schedule = this.schedule;
    if (!schedule) throw botScheduleUnavailable();
    return (
      (await schedule.applyNext(tx, userId, {
        ref: { source: 'user', id: strategyId, version },
        expected_next_session: apply.expected_next_session!,
        ...(apply.confirm_due_positions
          ? { confirm_due_positions: apply.confirm_due_positions }
          : {}),
        follow_latest: true,
      })) ?? null
    );
  }

  /** `from_run_id` (§10.3): the caller's succeeded basket run whose config hash equals the content's. */
  private async assertRun(tx: SqlClient, userId: string, runId: string, configHash: string) {
    const [run] = await tx.query<{ id: string }>(
      `select id from backtest_runs
        where id = $1 and user_id = $2 and status = 'succeeded' and kind = 'basket'
          and trim(config_hash) = $3`,
      [runId, userId, configHash],
    );
    if (!run) throw runRequired();
  }

  private async assertNameFree(
    tx: SqlClient,
    userId: string,
    name: string,
    exceptId: string | null,
  ) {
    const [taken] = await tx.query<{ id: string }>(
      `select id from user_strategies
        where user_id = $1 and deleted_at is null and lower(name) = lower($2)
          and ($3::uuid is null or id <> $3::uuid)
        limit 1`,
      [userId, name, exceptId],
    );
    if (taken) throw nameTaken();
  }

  private lockUser(tx: SqlClient, userId: string) {
    return tx.query(`select pg_advisory_xact_lock(hashtext('user_strategies:' || $1::text))`, [
      userId,
    ]);
  }

  private async lockStrategy(tx: SqlClient, userId: string, id: string): Promise<StrategyRow> {
    const [row] = await tx.query<StrategyRow>(
      `select id, user_id, name, latest_version, sell_only, created_at, updated_at, deleted_at
         from user_strategies
        where id = $1::uuid and user_id = $2 and deleted_at is null
        for update`,
      [id, userId],
    );
    if (!row) throw strategyNotFound();
    return row;
  }

  private async owned(
    db: Pick<SqlClient, 'query'>,
    userId: string,
    id: string,
    forUpdate = false,
  ): Promise<StrategyRow> {
    const [row] = await db.query<StrategyRow>(
      `select id, user_id, name, latest_version, sell_only, created_at, updated_at, deleted_at
         from user_strategies
        where id = $1::uuid and user_id = $2 and deleted_at is null
        ${forUpdate ? 'for update' : ''}`,
      [id, userId],
    );
    if (!row) throw strategyNotFound();
    return row;
  }

  private async versionRow(db: Pick<SqlClient, 'query'>, id: string, version: number) {
    const [row] = await db.query<VersionRow>(
      `select strategy_id, version, content, trim(config_hash) as config_hash, from_run_id, note,
              created_at
         from user_strategy_versions where strategy_id = $1 and version = $2`,
      [id, version],
    );
    return row ?? null;
  }

  private async usage(userId: string, id: string): Promise<ScheduleUsage> {
    const schedule = this.schedule;
    if (!schedule) return NOT_ON_BOT;
    return schedule.usage(userId, 'user', id);
  }

  private async usageMap(userId: string, ids: readonly string[]) {
    const map = new Map<string, ScheduleUsage>();
    const schedule = this.schedule;
    if (!schedule) return map;
    for (const id of ids) map.set(id, await schedule.usage(userId, 'user', id));
    return map;
  }

  /** Exact versions on the Bot; falls back to `usage` (next = latest when only that is known). */
  private async versionUsage(userId: string, strategy: StrategyRow) {
    const schedule = this.schedule;
    if (!schedule) return { last: null, next: null };
    if (schedule.versionUsage) {
      const exact = await schedule.versionUsage(userId, 'user', strategy.id);
      return {
        last: exact.last,
        next: exact.next_follow_latest ? Number(strategy.latest_version) : exact.next,
      };
    }
    const usage = await schedule.usage(userId, 'user', strategy.id);
    return { last: null, next: usage.next ? Number(strategy.latest_version) : null };
  }

  private strategyView(row: StrategyRow) {
    return {
      id: row.id,
      name: row.name,
      latest_version: Number(row.latest_version),
      sell_only: row.sell_only,
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
    };
  }

  private versionView(strategy: Pick<StrategyRow, 'id' | 'name'>, row: VersionRow) {
    return {
      strategy_id: strategy.id,
      name: strategy.name,
      version: Number(row.version),
      version_label: userVersionLabel(row.created_at),
      content: row.content,
      config_hash: row.config_hash,
      created_at: iso(row.created_at),
      note: row.note,
      from_run_id: row.from_run_id,
    };
  }
}
