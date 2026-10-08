import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import { ACADEMY_GRANTS, type AcademyGrantsPort } from '../academy/academy.ports.js';
import { IndexMembershipService } from '../market-integration/index-membership.service.js';
import {
  nextEffectiveSession,
  tradingDayPredicate,
  vnDate,
} from '../strategy-config/strategy-config.calendar.js';
import { canonicalHash } from './bot.domain.js';
import { classifyBotSymbol } from './bot.tradability.js';
import type { BotUniversePort, BotUniverseEvidence, ResolvedBotUniverse } from './bot.types.js';
import type {
  ApplyListInput,
  CancelPendingInput,
  RevertVn30Input,
  UniverseMutationResult,
  UniverseSourceView,
  UniverseState,
} from './bot-universe.schemas.js';

const VN30 = 'VN30';
const HISTORY_LIMIT = 10;

type RevisionStatus = 'pending' | 'effective' | 'cancelled' | 'superseded' | 'calendar_unavailable';

type RevisionRow = {
  id: string;
  user_id: string;
  bot_account_id: string;
  revision: number;
  kind: 'vn30' | 'custom';
  saved_list_id: string | null;
  list_as_of: Date | string | null;
  list_filter_id: string | null;
  list_filter_version: number | null;
  name: string;
  tickers: string[] | null;
  provenance: Record<string, unknown> | null;
  requested_at: Date | string;
  effective_session: Date | string | null;
  status: RevisionStatus;
  superseded_by: number | null;
  idempotency_key: string;
  request_hash: string;
  created_at: Date | string;
  cancelled_at: Date | string | null;
};

type ListRow = {
  id: string;
  name: string;
  tickers: string[];
  filter_id: string | null;
  filter_version: number | null;
  as_of: Date | string;
  data_source: string;
  scope: Record<string, unknown> | null;
  created_at: Date | string;
};

type InvalidSymbol = {
  symbol: string;
  reason: 'not_in_list' | 'unknown_symbol' | 'not_tradable';
};

const REVISION_COLUMNS = `id, user_id, bot_account_id, revision, kind, saved_list_id, list_as_of,
  list_filter_id, list_filter_version, name, tickers, provenance, requested_at, effective_session,
  status, superseded_by, idempotency_key, request_hash, created_at, cancelled_at`;

const day = (value: Date | string | null): string | null =>
  value === null
    ? null
    : value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value).slice(0, 10);
const iso = (value: Date | string | null): string | null =>
  value === null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))].sort();
}

export function universeSymbolsHash(symbols: readonly string[]): string {
  return canonicalHash(sortedUnique(symbols));
}

/** The v2 error envelope forwards `code`, `message` and an array `details` only. */
function revisionConflict(current: number): ConflictException {
  return new ConflictException({
    code: 'REVISION_CONFLICT',
    message: 'Nguồn mua đã được thay đổi ở nơi khác. Tải lại để xem bản mới nhất.',
    details: [{ field: 'expected_revision', current_revision: current }],
  });
}

/**
 * Bot buy-universe revisions (Bot SPEC section 6, Strategy SPEC 8.4-8.7). A request never
 * creates an order: it is a pending revision that becomes effective at the first trading
 * session with a date later than the server save date (Asia/Ho_Chi_Minh).
 */
@Injectable()
export class BotUniverseService implements BotUniversePort {
  constructor(
    private readonly database: DatabaseService,
    private readonly membership: IndexMembershipService,
    @Inject(ACADEMY_GRANTS) private readonly grants: AcademyGrantsPort,
  ) {}

  // --- reads --------------------------------------------------------------------------

  async state(userId: string, now = new Date()): Promise<UniverseState> {
    return this.buildState(this.database, userId, now);
  }

  private async buildState(client: SqlClient, userId: string, now: Date): Promise<UniverseState> {
    const today = vnDate(now);
    const rows = await client.query<RevisionRow>(
      `select ${REVISION_COLUMNS} from bot_universe_revisions
        where user_id = $1 order by revision desc limit $2`,
      [userId, HISTORY_LIMIT],
    );
    const latest = rows[0]?.revision ?? 0;
    const live = (
      await client.query<RevisionRow>(
        `select ${REVISION_COLUMNS} from bot_universe_revisions
          where user_id = $1 and status in ('pending', 'effective')
            and effective_session <= $2::date
          order by revision desc limit 1`,
        [userId, today],
      )
    )[0];
    const pendingRow = rows[0] && this.isPendingRow(rows[0], today) ? rows[0] : null;

    const effectiveSource = live ? this.view(live, today) : this.implicitVn30View(today);
    let symbols: string[] = [];
    let membershipSession: string | null = null;
    let unavailableReason: string | null = null;
    if (live?.kind === 'custom') {
      symbols = sortedUnique(live.tickers ?? []);
    } else {
      const snapshot = await this.membership.latestOnOrBefore(VN30, today);
      if (snapshot) {
        symbols = snapshot.symbols;
        membershipSession = snapshot.session_date;
      } else {
        unavailableReason = 'Chưa có dữ liệu thành phần VN30';
      }
    }
    return {
      revision: latest,
      server_date: today,
      effective: {
        ...effectiveSource,
        symbol_count: unavailableReason ? null : symbols.length,
        symbols: await this.symbolViews(client, symbols),
        membership_session: membershipSession,
        unavailable_reason: unavailableReason,
      },
      pending: pendingRow ? this.view(pendingRow, today) : null,
      history: rows.map((row) => this.view(row, today)),
    };
  }

  private isPendingRow(row: RevisionRow, today: string): boolean {
    if (row.status === 'calendar_unavailable') return true;
    return (
      row.status === 'pending' &&
      row.effective_session !== null &&
      day(row.effective_session)! > today
    );
  }

  private implicitVn30View(today: string): UniverseSourceView {
    void today;
    return {
      kind: 'vn30',
      revision: 0,
      name: 'VN30',
      saved_list_id: null,
      list_as_of: null,
      effective_session: null,
      status: 'implicit',
      requested_at: null,
      cancelled_at: null,
      superseded_by: null,
      symbol_count: null,
      provenance: { source: 'index_membership_snapshots', index_code: VN30 },
    };
  }

  private view(row: RevisionRow, today: string): UniverseSourceView {
    const session = day(row.effective_session);
    // Pending rows whose session has arrived are effective in time even before a run
    // marks them (lazy marking at capture).
    const status: UniverseSourceView['status'] =
      row.status === 'pending' && session !== null && session <= today ? 'effective' : row.status;
    return {
      kind: row.kind,
      revision: row.revision,
      name: row.name,
      saved_list_id: row.saved_list_id,
      list_as_of: day(row.list_as_of),
      effective_session: session,
      status,
      requested_at: iso(row.requested_at),
      cancelled_at: iso(row.cancelled_at),
      superseded_by: row.superseded_by,
      symbol_count: row.kind === 'custom' ? sortedUnique(row.tickers ?? []).length : null,
      provenance: row.provenance ?? {},
    };
  }

  private async symbolViews(client: SqlClient, symbols: readonly string[]) {
    if (!symbols.length) return [];
    const rows = await client.query<{
      symbol: string;
      name: string | null;
      exchange: string | null;
    }>(
      `select upper(symbol) as symbol, name, exchange from symbols where upper(symbol) = any($1::text[])`,
      [symbols],
    );
    const bySymbol = new Map(rows.map((row) => [row.symbol, row]));
    return symbols.map((symbol) => ({
      symbol,
      name: bySymbol.get(symbol)?.name ?? null,
      exchange: bySymbol.get(symbol)?.exchange ?? null,
    }));
  }

  // --- writes -------------------------------------------------------------------------

  async applyList(userId: string, input: ApplyListInput): Promise<UniverseMutationResult> {
    const requestedAt = new Date();
    const requestHash = canonicalHash({
      op: 'apply-list',
      list_id: input.list_id,
      symbols: sortedUnique(input.symbols),
      expected_revision: input.expected_revision,
    });
    return this.database.transaction(async (tx) => {
      const accountId = await this.lockOwner(tx, userId);
      const replay = await this.replay(tx, userId, input.idempotency_key, requestHash);
      if (replay) return this.result(tx, userId, replay, requestedAt);
      await this.assertRevision(tx, userId, input.expected_revision);

      const list = await this.ownedList(tx, userId, input.list_id);
      await this.assertFilterGrants(tx, userId, list);
      const selected = sortedUnique(input.symbols);
      await this.assertSelection(tx, list, selected);

      const provenance = {
        list: {
          id: list.id,
          name: list.name,
          as_of: day(list.as_of),
          data_source: list.data_source,
          scope: list.scope ?? {},
          created_at: iso(list.created_at),
          ticker_count: list.tickers.length,
        },
        filter:
          list.filter_id && list.filter_version
            ? { id: list.filter_id, version: list.filter_version }
            : null,
        cutoff: day(list.as_of),
        selected_count: selected.length,
        symbols_hash: universeSymbolsHash(selected),
      };
      const row = await this.insertRevision(tx, {
        userId,
        accountId,
        kind: 'custom',
        savedListId: list.id,
        listAsOf: day(list.as_of),
        filterId: list.filter_id,
        filterVersion: list.filter_version,
        name: list.name,
        tickers: selected,
        provenance,
        requestedAt,
        idempotencyKey: input.idempotency_key,
        requestHash,
      });
      return this.result(tx, userId, row, requestedAt);
    });
  }

  async revertToVn30(userId: string, input: RevertVn30Input): Promise<UniverseMutationResult> {
    const requestedAt = new Date();
    const requestHash = canonicalHash({
      op: 'revert-vn30',
      expected_revision: input.expected_revision,
    });
    return this.database.transaction(async (tx) => {
      const accountId = await this.lockOwner(tx, userId);
      const replay = await this.replay(tx, userId, input.idempotency_key, requestHash);
      if (replay) return this.result(tx, userId, replay, requestedAt);
      await this.assertRevision(tx, userId, input.expected_revision);

      const live = (
        await tx.query<RevisionRow>(
          `select ${REVISION_COLUMNS} from bot_universe_revisions
            where user_id = $1 and status in ('pending', 'effective')
            order by revision desc limit 1`,
          [userId],
        )
      )[0];
      if (!live || live.kind === 'vn30') {
        throw new ConflictException({
          code: 'ALREADY_VN30',
          message: 'Nguồn mua đã là VN30 hoặc đang chờ chuyển về VN30.',
          details: [{ field: 'expected_revision', current_revision: live?.revision ?? 0 }],
        });
      }
      const row = await this.insertRevision(tx, {
        userId,
        accountId,
        kind: 'vn30',
        savedListId: null,
        listAsOf: null,
        filterId: null,
        filterVersion: null,
        name: VN30,
        tickers: null,
        provenance: { source: 'index_membership_snapshots', index_code: VN30 },
        requestedAt,
        idempotencyKey: input.idempotency_key,
        requestHash,
      });
      return this.result(tx, userId, row, requestedAt);
    });
  }

  /** Cancels the latest revision only while it has not become effective or been consumed. */
  async cancelPending(userId: string, input: CancelPendingInput): Promise<UniverseMutationResult> {
    const now = new Date();
    const today = vnDate(now);
    return this.database.transaction(async (tx) => {
      await this.lockOwner(tx, userId);
      const latest = (
        await tx.query<RevisionRow>(
          `select ${REVISION_COLUMNS} from bot_universe_revisions
            where user_id = $1 order by revision desc limit 1 for update`,
          [userId],
        )
      )[0];
      if (!latest || latest.revision !== input.expected_revision) {
        throw revisionConflict(latest?.revision ?? 0);
      }
      if (latest.status === 'cancelled') return this.result(tx, userId, latest, now); // retry
      const session = day(latest.effective_session);
      const stillPending =
        latest.status === 'calendar_unavailable' ||
        (latest.status === 'pending' && session !== null && session > today);
      if (!stillPending) {
        throw new ConflictException({
          code: 'PENDING_ALREADY_EFFECTIVE',
          message: 'Thay đổi đã có hiệu lực hoặc đã được Bot sử dụng nên không thể hủy.',
          details: [{ field: 'expected_revision', current_revision: latest.revision }],
        });
      }
      const cancelled = (
        await tx.query<RevisionRow>(
          `update bot_universe_revisions set status = 'cancelled', cancelled_at = $2
            where id = $1 and status in ('pending', 'calendar_unavailable')
            returning ${REVISION_COLUMNS}`,
          [latest.id, now],
        )
      )[0];
      if (!cancelled) throw revisionConflict(latest.revision);
      return this.result(tx, userId, cancelled, now);
    });
  }

  private async result(
    tx: SqlClient,
    userId: string,
    row: RevisionRow,
    now: Date,
  ): Promise<UniverseMutationResult> {
    return { request: this.view(row, vnDate(now)), state: await this.buildState(tx, userId, now) };
  }

  /** Serialises one owner's universe writes and returns the Bot account id. */
  private async lockOwner(tx: SqlClient, userId: string): Promise<string> {
    await tx.query(
      `select pg_advisory_xact_lock(hashtext('bot_universe_revisions:' || $1::text))`,
      [userId],
    );
    const account = (
      await tx.query<{ id: string }>('select id from bot_accounts where user_id = $1', [userId])
    )[0];
    if (!account) {
      throw new ConflictException({
        code: 'BOT_NOT_INITIALIZED',
        message: 'Tài khoản Bot chưa được khởi tạo.',
      });
    }
    return account.id;
  }

  private async replay(
    tx: SqlClient,
    userId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<RevisionRow | null> {
    const row = (
      await tx.query<RevisionRow>(
        `select ${REVISION_COLUMNS} from bot_universe_revisions
          where user_id = $1 and idempotency_key = $2`,
        [userId, idempotencyKey],
      )
    )[0];
    if (!row) return null;
    if (row.request_hash.trim() !== requestHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Khóa idempotency đã được dùng cho một yêu cầu khác.',
      });
    }
    return row;
  }

  private async assertRevision(tx: SqlClient, userId: string, expected: number): Promise<void> {
    const current =
      (
        await tx.query<{ revision: number | null }>(
          'select max(revision) as revision from bot_universe_revisions where user_id = $1',
          [userId],
        )
      )[0]?.revision ?? 0;
    if (Number(current) !== expected) throw revisionConflict(Number(current));
  }

  private async ownedList(tx: SqlClient, userId: string, listId: string): Promise<ListRow> {
    const list = (
      await tx.query<ListRow>(
        `select id, name, tickers, filter_id, filter_version, as_of, data_source, scope, created_at
           from list_snapshots where id = $1 and user_id = $2 and deleted_at is null`,
        [listId, userId],
      )
    )[0];
    if (!list) {
      throw new NotFoundException({ code: 'LIST_NOT_FOUND', message: 'Không tìm thấy danh sách' });
    }
    return list;
  }

  /** A list produced by a fundamental filter needs `metric:<id>` for every metric it used. */
  private async assertFilterGrants(tx: SqlClient, userId: string, list: ListRow): Promise<void> {
    if (!list.filter_id || !list.filter_version) return;
    const version = (
      await tx.query<{ definition: { rules?: Array<{ metric_id?: unknown }> } | null }>(
        'select definition from filter_versions where filter_id = $1 and version = $2',
        [list.filter_id, list.filter_version],
      )
    )[0];
    const metrics = [
      ...new Set(
        (version?.definition?.rules ?? [])
          .map((rule) => rule.metric_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    if (!metrics.length) return;
    const granted = await this.grants.grantedCapabilities(userId);
    const locked = metrics.filter((id) => !granted.has(`metric:${id}`));
    if (locked.length) {
      throw new ForbiddenException({
        code: 'CAPABILITY_LOCKED',
        message: 'Bạn cần hoàn thành bài học của chỉ tiêu đã dùng trong bộ lọc trước khi áp dụng.',
        details: locked.map((id) => ({ capability: `metric:${id}`, reason: 'not_learned' })),
      });
    }
  }

  /** Every selected symbol must be in the list and tradable; nothing is silently dropped. */
  private async assertSelection(
    tx: SqlClient,
    list: ListRow,
    selected: readonly string[],
  ): Promise<void> {
    const inList = new Set(sortedUnique(list.tickers));
    const invalid: InvalidSymbol[] = selected
      .filter((symbol) => !inList.has(symbol))
      .map((symbol) => ({ symbol, reason: 'not_in_list' as const }));
    const checkable = selected.filter((symbol) => inList.has(symbol));
    if (checkable.length) {
      const rows = await tx.query<{
        symbol: string;
        is_active: boolean | null;
        exchange: string | null;
        is_index: boolean | null;
        asset_type: string | null;
      }>(
        `select upper(symbol) as symbol, is_active, exchange, is_index, asset_type
           from symbols where upper(symbol) = any($1::text[])`,
        [checkable],
      );
      const bySymbol = new Map(rows.map((row) => [row.symbol, row]));
      for (const symbol of checkable) {
        const verdict = classifyBotSymbol(bySymbol.get(symbol));
        if (verdict !== 'tradable') invalid.push({ symbol, reason: verdict });
      }
    }
    if (invalid.length) {
      throw new UnprocessableEntityException({
        code: 'UNIVERSE_SYMBOLS_INVALID',
        message: `Một số mã không hợp lệ cho nguồn mua của Bot: ${[...invalid]
          .map((item) => item.symbol)
          .sort()
          .join(', ')}. Hãy xác nhận lại lựa chọn.`,
        details: [...invalid].sort((a, b) => a.symbol.localeCompare(b.symbol)),
      });
    }
  }

  private async insertRevision(
    tx: SqlClient,
    values: {
      userId: string;
      accountId: string;
      kind: 'vn30' | 'custom';
      savedListId: string | null;
      listAsOf: string | null;
      filterId: string | null;
      filterVersion: number | null;
      name: string;
      tickers: string[] | null;
      provenance: Record<string, unknown>;
      requestedAt: Date;
      idempotencyKey: string;
      requestHash: string;
    },
  ): Promise<RevisionRow> {
    const revision =
      Number(
        (
          await tx.query<{ revision: number | null }>(
            'select max(revision) as revision from bot_universe_revisions where user_id = $1',
            [values.userId],
          )
        )[0]?.revision ?? 0,
      ) + 1;
    const calendar = (
      await tx.query<{ holidays: unknown }>(
        'select holidays from virtual_trading_configs where is_active = true order by updated_at desc limit 1',
      )
    )[0];
    const isTradingDay = tradingDayPredicate(calendar);
    // Never +24h or weekday-only: no verified calendar means the revision cannot take effect.
    const session = isTradingDay ? nextEffectiveSession(values.requestedAt, isTradingDay) : null;
    const row = (
      await tx.query<RevisionRow>(
        `insert into bot_universe_revisions
           (id, user_id, bot_account_id, revision, kind, saved_list_id, list_as_of,
            list_filter_id, list_filter_version, name, tickers, provenance, requested_at,
            effective_session, status, idempotency_key, request_hash)
         values ($1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11::text[],$12::jsonb,$13,$14::date,$15,$16,$17)
         returning ${REVISION_COLUMNS}`,
        [
          randomUUID(),
          values.userId,
          values.accountId,
          revision,
          values.kind,
          values.savedListId,
          values.listAsOf,
          values.filterId,
          values.filterVersion,
          values.name,
          values.tickers,
          JSON.stringify(values.provenance),
          values.requestedAt,
          session,
          session ? 'pending' : 'calendar_unavailable',
          values.idempotencyKey,
          values.requestHash,
        ],
      )
    )[0];
    if (!row) throw new Error('Failed to create the universe revision');
    if (session) {
      // Several requests for the same session: the latest revision wins, older ones keep
      // their trace as superseded.
      await tx.query(
        `update bot_universe_revisions set status = 'superseded', superseded_by = $3
          where user_id = $1 and status = 'pending' and effective_session = $2::date
            and revision < $3`,
        [values.userId, session, revision],
      );
    }
    return row;
  }

  // --- Bot worker port ----------------------------------------------------------------

  async resolveForSession(userId: string, tradingDate: string): Promise<ResolvedBotUniverse> {
    const row = (
      await this.database.query<RevisionRow>(
        `select ${REVISION_COLUMNS} from bot_universe_revisions
          where user_id = $1 and status in ('pending', 'effective')
            and effective_session <= $2::date
          order by revision desc limit 1`,
        [userId, tradingDate],
      )
    )[0];
    if (row?.kind === 'custom') {
      const symbols = sortedUnique(row.tickers ?? []);
      return {
        revisionId: row.id,
        evidence: {
          status: symbols.length ? 'verified' : 'unavailable',
          kind: 'custom',
          revision: row.revision,
          name: row.name,
          saved_list_id: row.saved_list_id,
          effective_session: day(row.effective_session),
          symbols,
          symbols_hash: symbols.length ? universeSymbolsHash(symbols) : null,
          membership: null,
          unavailable_reason: symbols.length ? null : 'Danh mục riêng không có mã',
        },
      };
    }
    return {
      revisionId: row?.id ?? null,
      evidence: await this.vn30Evidence(
        row?.revision ?? 0,
        row ? day(row.effective_session) : null,
        tradingDate,
      ),
    };
  }

  private async vn30Evidence(
    revision: number,
    effectiveSession: string | null,
    tradingDate: string,
  ): Promise<BotUniverseEvidence> {
    const base = {
      kind: 'vn30' as const,
      revision,
      name: VN30,
      saved_list_id: null,
      effective_session: effectiveSession,
    };
    try {
      const snapshot = await this.membership.ensureForSession(VN30, tradingDate);
      if (snapshot) {
        return {
          ...base,
          status: 'verified',
          symbols: snapshot.symbols,
          symbols_hash: universeSymbolsHash(snapshot.symbols),
          membership: {
            index_code: snapshot.index_code,
            session_date: snapshot.session_date,
            source: snapshot.source,
            source_hash: snapshot.source_hash,
            fetched_at: snapshot.fetched_at,
          },
          unavailable_reason: null,
        };
      }
      return {
        ...base,
        status: 'unavailable',
        symbols: [],
        symbols_hash: null,
        membership: null,
        unavailable_reason: `Chưa có thành phần VN30 của phiên ${tradingDate}`,
      };
    } catch (error) {
      return {
        ...base,
        status: 'unavailable',
        symbols: [],
        symbols_hash: null,
        membership: null,
        unavailable_reason: `Không đọc được thành phần VN30: ${
          error instanceof Error ? error.name : 'unknown'
        }`,
      };
    }
  }

  async consume(tx: SqlClient, userId: string, resolved: ResolvedBotUniverse): Promise<boolean> {
    if (resolved.revisionId === null) return true;
    const row = (
      await tx.query<{ status: RevisionStatus }>(
        `select status from bot_universe_revisions where id = $1 and user_id = $2 for update`,
        [resolved.revisionId, userId],
      )
    )[0];
    if (!row || (row.status !== 'pending' && row.status !== 'effective')) return false;
    if (row.status === 'pending') {
      await tx.query(
        `update bot_universe_revisions set status = 'effective' where id = $1 and status = 'pending'`,
        [resolved.revisionId],
      );
    }
    return true;
  }

  async effectiveSymbols(userId: string, tradingDate: string): Promise<ReadonlySet<string> | null> {
    const row = (
      await this.database.query<RevisionRow>(
        `select ${REVISION_COLUMNS} from bot_universe_revisions
          where user_id = $1 and status in ('pending', 'effective')
            and effective_session <= $2::date
          order by revision desc limit 1`,
        [userId, tradingDate],
      )
    )[0];
    if (row?.kind === 'custom') return new Set(sortedUnique(row.tickers ?? []));
    const snapshot = await this.membership.latestOnOrBefore(VN30, tradingDate);
    return snapshot ? new Set(snapshot.symbols) : null;
  }
}
