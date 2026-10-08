import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ACADEMY_GRANTS } from '../../src/modules/academy/academy.ports.js';
import {
  BotService,
  BotUniverseService,
  type BotMarketSnapshotInput,
} from '../../src/modules/bots/index.js';
import { DatabaseService } from '../../src/platform/database/index.js';
import { IndexMembershipProvider } from '../../src/modules/market-integration/index.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TODAY = '2026-09-30'; // Wednesday
const NEXT = '2026-10-01'; // Thursday: first session after TODAY
const VN30_MEMBERS = ['VCB', 'VNM', 'HPG'];

describe('system acceptance: Bot buy universe (VN30 default, applied list snapshots)', () => {
  let stack: SystemStack;
  const grants = new Set<string>();

  beforeAll(async () => {
    stack = await startSystemStack(
      {},
      {
        overrideProviders: [
          { token: ACADEMY_GRANTS, value: { grantedCapabilities: async () => grants } },
        ],
      },
    );
    await stack.query(
      `insert into symbols (id, symbol, name, exchange, asset_type, is_index, current_price_vnd, last_synced_at, is_active)
       values
         ($1, 'HPG', 'Hoa Phat', 'HOSE', 'stock', false, 30000, now(), true),
         ($2, 'FPT', 'FPT', 'HOSE', 'stock', false, 120000, now(), true),
         ($3, 'SHB', 'SHB', 'HNX', 'stock', false, 12000, now(), true),
         ($4, 'DEAD', 'Delisted', 'HOSE', 'stock', false, 1000, now(), false),
         ($5, 'VN30IDX', 'VN30 index', 'HOSE', 'index', true, 1300, now(), true)
       on conflict (symbol) do nothing`,
      [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()],
    );
    // Membership snapshots are global per date: start from a clean table so reruns on a
    // reused external database behave like a fresh container.
    await stack.query('delete from index_membership_snapshots');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T05:00:00Z`)); // 12:00 Asia/Ho_Chi_Minh
  });

  afterAll(async () => {
    vi.useRealTimers();
    await stack?.close();
    vi.restoreAllMocks();
  });

  /** Register on the real clock (refresh-token expiry is compared with PostgreSQL now()). */
  async function botUser(suffix: string) {
    const fakedNow = Date.now();
    vi.useRealTimers();
    let user: Awaited<ReturnType<typeof registerAndLogin>>;
    try {
      user = await registerAndLogin(stack.app, suffix);
    } finally {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(fakedNow));
    }
    await stack.app.get(BotService).initializeAccount(user.id);
    return user;
  }

  async function savedList(userId: string, tickers: string[], extra: Json = {}) {
    const id = randomUUID();
    await stack.query(
      `insert into list_snapshots
         (id, user_id, name, filter_id, filter_version, tickers, as_of, data_source, scope)
       values ($1, $2, $3, $4, $5, $6::text[], '2026-09-29', 'VCI', '{"market":"HOSE"}'::jsonb)`,
      [
        id,
        userId,
        extra.name ?? 'Danh mục thử',
        extra.filterId ?? null,
        extra.filterVersion ?? null,
        tickers,
      ],
    );
    return id;
  }

  const get = (token: string) =>
    stack.app.inject({ method: 'GET', url: '/api/v2/bot/universe', headers: authHeader(token) });
  const post = (token: string, path: string, payload: unknown) =>
    stack.app.inject({
      method: 'POST',
      url: `/api/v2/bot/universe/${path}`,
      headers: authHeader(token),
      payload: payload as Record<string, unknown>,
    });
  const key = () => `universe-${randomUUID()}`;

  async function noOrders(userId: string) {
    const rows = await stack.query(
      `select
         (select count(*)::int from bot_executions e join bot_accounts a on a.id = e.bot_account_id where a.user_id = $1) as bot_executions,
         (select count(*)::int from bot_cash_ledger l join bot_accounts a on a.id = l.bot_account_id where a.user_id = $1) as ledger,
         (select count(*)::int from virtual_orders o join virtual_trading_accounts v on v.id = o.account_id where v.user_id = $1) as manual_orders`,
      [userId],
    );
    return rows[0];
  }

  it('U01 a new Bot reads the implicit VN30 from the stored membership, revision 0', async () => {
    const user = await botUser('universe-default');
    await stack.query(
      `insert into index_membership_snapshots (index_code, session_date, symbols, source, fetched_at, source_hash)
       values ('VN30', $1, $2::text[], 'system-fixture', now(), $3)`,
      [TODAY, VN30_MEMBERS, 'a'.repeat(64)],
    );

    const response = await get(user.accessToken);

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as Json;
    expect(body).toMatchObject({
      revision: 0,
      server_date: TODAY,
      pending: null,
      effective: {
        kind: 'vn30',
        revision: 0,
        status: 'implicit',
        symbol_count: 3,
        membership_session: TODAY,
      },
    });
    expect(body.effective.symbols.map((row: Json) => row.symbol)).toEqual(['HPG', 'VCB', 'VNM']);
  });

  it('U02/U03/U06 applying a selected subset is pending, effective next session, and creates no order', async () => {
    const user = await botUser('universe-apply');
    const listId = await savedList(user.id, ['VCB', 'HPG', 'FPT', 'VNM']);
    const before = await noOrders(user.id);

    const response = await post(user.accessToken, 'apply-list', {
      list_id: listId,
      symbols: ['fpt', 'VCB', 'FPT'],
      expected_revision: 0,
      idempotency_key: key(),
    });

    expect(response.statusCode, response.body).toBe(201);
    const body = response.json() as Json;
    expect(body.request).toMatchObject({
      kind: 'custom',
      revision: 1,
      status: 'pending',
      effective_session: NEXT,
      symbol_count: 2,
      saved_list_id: listId,
      list_as_of: '2026-09-29',
    });
    expect(body.request.provenance).toMatchObject({
      list: { id: listId, data_source: 'VCI', ticker_count: 4 },
      cutoff: '2026-09-29',
      selected_count: 2,
    });
    // The effective source is still the implicit VN30 today; the request sits in pending.
    expect(body.state).toMatchObject({
      revision: 1,
      effective: { kind: 'vn30', revision: 0 },
      pending: { revision: 1, effective_session: NEXT, status: 'pending' },
    });
    expect(await noOrders(user.id)).toEqual(before);
    const stored = await stack.query<{ tickers: string[]; status: string }>(
      'select tickers, status from bot_universe_revisions where user_id = $1',
      [user.id],
    );
    expect(stored).toEqual([{ tickers: ['FPT', 'VCB'], status: 'pending' }]);
  });

  it('U06 the saved-day session keeps the old source; the next session resolves the new list', async () => {
    const user = await botUser('universe-sessions');
    const listId = await savedList(user.id, ['VCB', 'FPT']);
    await post(user.accessToken, 'apply-list', {
      list_id: listId,
      symbols: ['FPT'],
      expected_revision: 0,
      idempotency_key: key(),
    });
    const universe = stack.app.get(BotUniverseService);

    const saveDay = await universe.resolveForSession(user.id, TODAY);
    const effectiveDay = await universe.resolveForSession(user.id, NEXT);

    expect(saveDay.evidence).toMatchObject({ kind: 'vn30', revision: 0, status: 'verified' });
    expect(saveDay.revisionId).toBeNull();
    expect(effectiveDay.evidence).toMatchObject({
      kind: 'custom',
      revision: 1,
      symbols: ['FPT'],
      status: 'verified',
      effective_session: NEXT,
    });
    expect(effectiveDay.revisionId).not.toBeNull();
  });

  it('U05 an empty selection is rejected and the current source is kept', async () => {
    const user = await botUser('universe-empty');
    const listId = await savedList(user.id, ['VCB']);

    const response = await post(user.accessToken, 'apply-list', {
      list_id: listId,
      symbols: [],
      expected_revision: 0,
      idempotency_key: key(),
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
    expect(
      await stack.query('select 1 from bot_universe_revisions where user_id = $1', [user.id]),
    ).toEqual([]);
    const state = (await get(user.accessToken)).json() as Json;
    expect(state).toMatchObject({ revision: 0, effective: { kind: 'vn30' }, pending: null });
  });

  it('U04 invalid symbols are listed back with a reason; nothing is silently dropped', async () => {
    const user = await botUser('universe-invalid');
    const listId = await savedList(user.id, ['VCB', 'SHB', 'DEAD', 'VN30IDX', 'GHOST']);

    const response = await post(user.accessToken, 'apply-list', {
      list_id: listId,
      symbols: ['VCB', 'SHB', 'DEAD', 'VN30IDX', 'GHOST', 'FPT'],
      expected_revision: 0,
      idempotency_key: key(),
    });

    expect(response.statusCode, response.body).toBe(422);
    const body = response.json() as Json;
    const invalid = body.error.details as Json[];
    expect(invalid).toEqual(
      expect.arrayContaining([
        { symbol: 'DEAD', reason: 'not_tradable' },
        { symbol: 'FPT', reason: 'not_in_list' },
        { symbol: 'GHOST', reason: 'unknown_symbol' },
        { symbol: 'SHB', reason: 'not_tradable' },
        { symbol: 'VN30IDX', reason: 'not_tradable' },
      ]),
    );
    expect(invalid).toHaveLength(5);
    expect(
      await stack.query('select 1 from bot_universe_revisions where user_id = $1', [user.id]),
    ).toEqual([]);
  });

  it('U16 another user list, a deleted list and a missing metric grant are refused', async () => {
    const owner = await botUser('universe-owner');
    const stranger = await botUser('universe-stranger');
    const ownerList = await savedList(owner.id, ['VCB']);
    const deleted = await savedList(stranger.id, ['VCB']);
    await stack.query('update list_snapshots set deleted_at = now() where id = $1', [deleted]);

    const foreign = await post(stranger.accessToken, 'apply-list', {
      list_id: ownerList,
      symbols: ['VCB'],
      expected_revision: 0,
      idempotency_key: key(),
    });
    expect(foreign.statusCode, foreign.body).toBe(404);
    const gone = await post(stranger.accessToken, 'apply-list', {
      list_id: deleted,
      symbols: ['VCB'],
      expected_revision: 0,
      idempotency_key: key(),
    });
    expect(gone.statusCode, gone.body).toBe(404);

    const filterId = randomUUID();
    await stack.query(
      `insert into strategy_filters (id, user_id, name, current_version) values ($1, $2, 'ROE', 1)`,
      [filterId, owner.id],
    );
    await stack.query(
      `insert into filter_versions (filter_id, version, definition, definition_hash)
       values ($1, 1, $2::jsonb, $3)`,
      [
        filterId,
        JSON.stringify({ rules: [{ id: 'r1', metric_id: 'roe', operator: '>', value: 10 }] }),
        'b'.repeat(64),
      ],
    );
    const filtered = await savedList(owner.id, ['VCB', 'VNM'], { filterId, filterVersion: 1 });
    const locked = await post(owner.accessToken, 'apply-list', {
      list_id: filtered,
      symbols: ['VCB'],
      expected_revision: 0,
      idempotency_key: key(),
    });
    expect(locked.statusCode, locked.body).toBe(403);
    expect((locked.json() as Json).error.details).toEqual([
      { capability: 'metric:roe', reason: 'not_learned' },
    ]);

    grants.add('metric:roe');
    const allowed = await post(owner.accessToken, 'apply-list', {
      list_id: filtered,
      symbols: ['VCB'],
      expected_revision: 0,
      idempotency_key: key(),
    });
    grants.delete('metric:roe');
    expect(allowed.statusCode, allowed.body).toBe(201);
    expect((allowed.json() as Json).request.provenance.filter).toEqual({
      id: filterId,
      version: 1,
    });
  });

  it('U15 a stale expected revision is a 409 and a replayed key returns the committed result once', async () => {
    const user = await botUser('universe-conflict');
    const listId = await savedList(user.id, ['VCB', 'VNM']);
    const idempotencyKey = key();
    const payload = {
      list_id: listId,
      symbols: ['VCB'],
      expected_revision: 0,
      idempotency_key: idempotencyKey,
    };

    const first = await post(user.accessToken, 'apply-list', payload);
    const replay = await post(user.accessToken, 'apply-list', payload);
    expect(first.statusCode, first.body).toBe(201);
    expect(replay.statusCode, replay.body).toBe(201);
    expect((replay.json() as Json).request.revision).toBe(1);
    expect(
      await stack.query('select 1 from bot_universe_revisions where user_id = $1', [user.id]),
    ).toHaveLength(1);

    const reused = await post(user.accessToken, 'apply-list', { ...payload, symbols: ['VNM'] });
    expect(reused.statusCode, reused.body).toBe(409);

    const stale = await post(user.accessToken, 'apply-list', {
      ...payload,
      idempotency_key: key(),
      symbols: ['VNM'],
    });
    expect(stale.statusCode, stale.body).toBe(409);
    expect((stale.json() as Json).error).toMatchObject({
      code: 'REVISION_CONFLICT',
      details: [{ field: 'expected_revision', current_revision: 1 }],
    });
  });

  it('U12 a later request for the same session supersedes the earlier one, keeping its trace', async () => {
    const user = await botUser('universe-supersede');
    const first = await savedList(user.id, ['VCB'], { name: 'A' });
    const second = await savedList(user.id, ['VNM'], { name: 'B' });
    await post(user.accessToken, 'apply-list', {
      list_id: first,
      symbols: ['VCB'],
      expected_revision: 0,
      idempotency_key: key(),
    });
    await post(user.accessToken, 'apply-list', {
      list_id: second,
      symbols: ['VNM'],
      expected_revision: 1,
      idempotency_key: key(),
    });

    const rows = await stack.query(
      'select revision, name, status, superseded_by from bot_universe_revisions where user_id = $1 order by revision',
      [user.id],
    );
    expect(rows).toEqual([
      { revision: 1, name: 'A', status: 'superseded', superseded_by: 2 },
      { revision: 2, name: 'B', status: 'pending', superseded_by: null },
    ]);
    const universe = stack.app.get(BotUniverseService);
    expect((await universe.resolveForSession(user.id, NEXT)).evidence).toMatchObject({
      name: 'B',
      symbols: ['VNM'],
    });
  });

  it('U07 cancelling a pending change keeps the effective source, once, and is retry-safe', async () => {
    const user = await botUser('universe-cancel');
    const listId = await savedList(user.id, ['VCB']);
    await post(user.accessToken, 'apply-list', {
      list_id: listId,
      symbols: ['VCB'],
      expected_revision: 0,
      idempotency_key: key(),
    });

    const stale = await post(user.accessToken, 'pending/cancel', { expected_revision: 5 });
    expect(stale.statusCode, stale.body).toBe(409);

    const cancelled = await post(user.accessToken, 'pending/cancel', { expected_revision: 1 });
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    const body = cancelled.json() as Json;
    expect(body.request).toMatchObject({ revision: 1, status: 'cancelled' });
    expect(body.state).toMatchObject({ revision: 1, pending: null, effective: { kind: 'vn30' } });

    const retry = await post(user.accessToken, 'pending/cancel', { expected_revision: 1 });
    expect(retry.statusCode, retry.body).toBe(200);
    expect(
      await stack.query(
        'select status, cancelled_at is not null as has_ts from bot_universe_revisions where user_id = $1',
        [user.id],
      ),
    ).toEqual([{ status: 'cancelled', has_ts: true }]);

    const universe = stack.app.get(BotUniverseService);
    expect((await universe.resolveForSession(user.id, NEXT)).evidence.kind).toBe('vn30');
  });

  it('U07b a change that a run already consumed, or whose session arrived, cannot be cancelled', async () => {
    const user = await botUser('universe-consumed');
    const listId = await savedList(user.id, ['VCB']);
    await post(user.accessToken, 'apply-list', {
      list_id: listId,
      symbols: ['VCB'],
      expected_revision: 0,
      idempotency_key: key(),
    });
    const universe = stack.app.get(BotUniverseService);

    // The Bot captures the effective session: the revision becomes effective.
    const resolved = await universe.resolveForSession(user.id, NEXT);
    await stack.app
      .get(DatabaseService)
      .transaction(async (tx) => universe.consume(tx, user.id, resolved));
    expect(
      await stack.query('select status from bot_universe_revisions where user_id = $1', [user.id]),
    ).toEqual([{ status: 'effective' }]);

    const consumed = await post(user.accessToken, 'pending/cancel', { expected_revision: 1 });
    expect(consumed.statusCode, consumed.body).toBe(409);
    expect(JSON.stringify(consumed.json())).toContain('PENDING_ALREADY_EFFECTIVE');

    // Even without a run, once the server date reaches the effective session it is effective.
    const other = await botUser('universe-date-reached');
    const list = await savedList(other.id, ['VNM']);
    await post(other.accessToken, 'apply-list', {
      list_id: list,
      symbols: ['VNM'],
      expected_revision: 0,
      idempotency_key: key(),
    });
    vi.setSystemTime(new Date(`${NEXT}T01:00:00Z`)); // 08:00 on the effective session
    try {
      const late = await post(other.accessToken, 'pending/cancel', { expected_revision: 1 });
      expect(late.statusCode, late.body).toBe(409);
      const state = (await get(other.accessToken)).json() as Json;
      expect(state).toMatchObject({
        effective: { kind: 'custom', status: 'effective' },
        pending: null,
      });
    } finally {
      vi.setSystemTime(new Date(`${TODAY}T05:00:00Z`));
    }
  });

  it('U09/U14 reverting to VN30 is itself pending; held positions are untouched; VN30 membership is per session', async () => {
    const user = await botUser('universe-revert');
    const listId = await savedList(user.id, ['FPT']);
    const noCustom = await post(user.accessToken, 'revert-vn30', {
      expected_revision: 0,
      idempotency_key: key(),
    });
    expect(noCustom.statusCode, noCustom.body).toBe(409);

    await post(user.accessToken, 'apply-list', {
      list_id: listId,
      symbols: ['FPT'],
      expected_revision: 0,
      idempotency_key: key(),
    });
    // Make the custom list effective by moving the server date past its session.
    vi.setSystemTime(new Date(`${NEXT}T08:00:00Z`));
    try {
      const reverted = await post(user.accessToken, 'revert-vn30', {
        expected_revision: 1,
        idempotency_key: key(),
      });
      expect(reverted.statusCode, reverted.body).toBe(201);
      const body = reverted.json() as Json;
      expect(body.request).toMatchObject({ kind: 'vn30', revision: 2, status: 'pending' });
      expect(body.state).toMatchObject({
        effective: { kind: 'custom', name: 'Danh mục thử' },
        pending: { kind: 'vn30', revision: 2 },
      });
      const again = await post(user.accessToken, 'revert-vn30', {
        expected_revision: 2,
        idempotency_key: key(),
      });
      expect(again.statusCode, again.body).toBe(409);
    } finally {
      vi.setSystemTime(new Date(`${TODAY}T05:00:00Z`));
    }
    const universe = stack.app.get(BotUniverseService);
    // On the session of the revert request the custom list still applies; later it is VN30.
    expect((await universe.resolveForSession(user.id, NEXT)).evidence.kind).toBe('custom');
    const afterRevert = await universe.resolveForSession(user.id, '2026-10-02');
    expect(afterRevert.evidence).toMatchObject({
      kind: 'vn30',
      revision: 2,
      status: 'unavailable',
    });
    await stack.query(
      `insert into index_membership_snapshots (index_code, session_date, symbols, source, fetched_at, source_hash)
       values ('VN30', '2026-10-02', $1::text[], 'system-fixture', now(), $2)`,
      [['VCB', 'FPT'], 'c'.repeat(64)],
    );
    expect((await universe.resolveForSession(user.id, '2026-10-02')).evidence).toMatchObject({
      kind: 'vn30',
      status: 'verified',
      symbols: ['FPT', 'VCB'],
    });
    // A past session is never rewritten from today's list.
    expect((await universe.resolveForSession(user.id, '2026-10-01')).evidence.kind).toBe('custom');
  });

  it('U13b the membership is fetched at most once for today and never for a past session', async () => {
    const user = await botUser('universe-membership');
    const fetch = vi
      .spyOn(stack.app.get(IndexMembershipProvider), 'fetchCurrent')
      .mockResolvedValue({
        index_code: 'VN30',
        symbols: ['FPT', 'VCB'],
        source: 'system-fixture:getByGroup',
        source_hash: 'd'.repeat(64),
      });
    const universe = stack.app.get(BotUniverseService);

    const past = await universe.resolveForSession(user.id, '2026-09-29');
    expect(past.evidence.status).toBe('unavailable');
    expect(fetch).not.toHaveBeenCalled();

    const today = await universe.resolveForSession(user.id, '2026-09-30');
    expect(today.evidence.status).toBe('verified');
    await universe.resolveForSession(user.id, '2026-09-30');
    expect(fetch).toHaveBeenCalledTimes(0); // the U01 fixture already stored today's snapshot
    await stack.query(`delete from index_membership_snapshots where session_date = $1`, [TODAY]);
    const refetched = await universe.resolveForSession(user.id, '2026-09-30');
    expect(refetched.evidence).toMatchObject({ status: 'verified', symbols: ['FPT', 'VCB'] });
    await universe.resolveForSession(user.id, '2026-09-30');
    expect(fetch).toHaveBeenCalledTimes(1);

    fetch.mockRejectedValue(new Error('upstream down'));
    await stack.query(`delete from index_membership_snapshots where session_date = $1`, [TODAY]);
    const failed = await universe.resolveForSession(user.id, '2026-09-30');
    expect(failed.evidence).toMatchObject({ status: 'unavailable', symbols: [] });
    fetch.mockRestore();
  });

  it('U14 index membership changes apply per session: a leaver stops being a candidate, history is kept', async () => {
    const user = await botUser('universe-membership-change');
    await stack.query(
      `insert into index_membership_snapshots (index_code, session_date, symbols, source, fetched_at, source_hash)
       values ('VN30', '2026-11-02', $1::text[], 'system-fixture', now(), $3),
              ('VN30', '2026-11-03', $2::text[], 'system-fixture', now(), $4)`,
      [['AAA', 'BBB'], ['BBB', 'CCC'], 'e'.repeat(64), 'f'.repeat(64)],
    );
    const universe = stack.app.get(BotUniverseService);

    const before = await universe.resolveForSession(user.id, '2026-11-02');
    const after = await universe.resolveForSession(user.id, '2026-11-03');
    const replay = await universe.resolveForSession(user.id, '2026-11-02');

    expect(before.evidence).toMatchObject({ kind: 'vn30', symbols: ['AAA', 'BBB'] });
    expect(after.evidence).toMatchObject({ kind: 'vn30', symbols: ['BBB', 'CCC'] });
    expect(after.evidence.symbols_hash).not.toBe(before.evidence.symbols_hash);
    expect(after.evidence.membership?.session_date).toBe('2026-11-03');
    expect(replay.evidence).toEqual(before.evidence);
  });

  it('U17 without a verified trading calendar the request is calendar_unavailable and never effective', async () => {
    const user = await botUser('universe-calendar');
    const listId = await savedList(user.id, ['VCB']);
    await stack.query(`update virtual_trading_configs set holidays = '{}' where is_active = true`);
    try {
      const response = await post(user.accessToken, 'apply-list', {
        list_id: listId,
        symbols: ['VCB'],
        expected_revision: 0,
        idempotency_key: key(),
      });
      expect(response.statusCode, response.body).toBe(201);
      expect((response.json() as Json).request).toMatchObject({
        status: 'calendar_unavailable',
        effective_session: null,
      });
    } finally {
      await stack.query(
        `update virtual_trading_configs set holidays = '[]' where is_active = true`,
      );
    }
    const universe = stack.app.get(BotUniverseService);
    expect((await universe.resolveForSession(user.id, '2030-01-01')).evidence.kind).toBe('vn30');
    const cancel = await post(user.accessToken, 'pending/cancel', { expected_revision: 1 });
    expect(cancel.statusCode, cancel.body).toBe(200);
  });

  it('U18 the Bot session captures the pending revision as effective together with its universe', async () => {
    const user = await botUser('universe-capture');
    const listId = await savedList(user.id, ['VCB', 'VNM']);
    await post(user.accessToken, 'apply-list', {
      list_id: listId,
      symbols: ['VNM'],
      expected_revision: 0,
      idempotency_key: key(),
    });
    vi.setSystemTime(new Date(`${NEXT}T12:00:00Z`));
    try {
      const requested: Array<{ universeSymbols?: readonly string[] }> = [];
      const input = (tradingDate: string): BotMarketSnapshotInput => ({
        trading_date: tradingDate,
        data_version: 'universe-capture',
        close_is_official: true,
        buy_inputs_complete: true,
        symbols: {},
        fee_rules: {
          buy_fee_rate_bps: 10,
          sell_fee_rate_bps: 10,
          sell_tax_rate_bps: 10,
          board_lot_size: 100,
          source_ref: 'system-fixture',
        },
      });
      const run = await stack.app.get(BotService).runAccountSession(user.id, NEXT, {
        buildSnapshot: async (tradingDate, options) => {
          requested.push(options);
          return input(tradingDate);
        },
      });
      expect(run.status).toBe('succeeded');
      const receipt = await stack.query<{ universe_revision: number; universe_kind: string }>(
        'select universe_revision, universe_kind from bot_run_receipts where id = $1',
        [run.id],
      );
      expect(receipt).toEqual([{ universe_revision: 1, universe_kind: 'custom' }]);
      expect(
        await stack.query('select status from bot_universe_revisions where user_id = $1', [
          user.id,
        ]),
      ).toEqual([{ status: 'effective' }]);
      const payload = await stack.query<{ payload: Json }>(
        'select payload from bot_market_snapshots where bot_run_id = $1',
        [run.id],
      );
      expect(payload[0]?.payload.universe).toMatchObject({
        kind: 'custom',
        revision: 1,
        symbols: ['VNM'],
        status: 'verified',
      });
      // No Buy side is configured, so the provider is not asked for universe data.
      expect(requested).toEqual([{ openSymbols: [], universeSymbols: [] }]);
    } finally {
      vi.setSystemTime(new Date(`${TODAY}T05:00:00Z`));
    }
  });

  it('U19 requests need authentication and stay inside the caller account', async () => {
    const anonymous = await stack.app.inject({ method: 'GET', url: '/api/v2/bot/universe' });
    expect(anonymous.statusCode).toBe(401);
    const fakedNow = Date.now();
    vi.useRealTimers();
    const noAccount = await registerAndLogin(stack.app, 'universe-noaccount');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(fakedNow));
    const apply = await post(noAccount.accessToken, 'apply-list', {
      list_id: randomUUID(),
      symbols: ['VCB'],
      expected_revision: 0,
      idempotency_key: key(),
    });
    expect([404, 409]).toContain(apply.statusCode);
    const state = await get(noAccount.accessToken);
    expect(state.statusCode, state.body).toBe(200);
    expect((state.json() as Json).revision).toBe(0);
  });
});
