import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { ACADEMY_GRANTS, type AcademyGrantsPort } from '../academy/academy.ports.js';
import {
  CALCULATION_VERSION,
  RULE_VERSION,
  calc,
  canonicalJson,
  indicatorCapability,
  sha256Hex,
  type RegistryEntry,
} from '../quant/v2/index.js';
import { buildChart } from './practice.chart.js';
import { buildComment } from './practice.comments.js';
import {
  defaultPracticeConfig,
  normalizePracticeConfig,
  practiceEntry,
  practiceForm,
  toSideConfig,
  validatePracticeConfig,
} from './practice.config.js';
import {
  HOLD_MAX_DEFAULT,
  HOLD_MAX_MAX,
  HOLD_MAX_MIN,
  MINI_PROFILE_V1,
  PRACTICE_CASE_COUNT,
  PRACTICE_ENGINE_VERSION,
  PRACTICE_INDICATOR_IDS,
} from './practice.constants.js';
import {
  PRACTICE_DATA,
  PracticeDataError,
  type LoadedCase,
  type PracticeCaseDataPort,
} from './practice.data.js';
import { simulate } from './practice.engine.js';
import { generateCases } from './practice.permutation.js';
import {
  PRACTICE_STORE,
  type ProgressRow,
  type RunCompletion,
  type RunHeader,
  type RunRow,
  type PracticeStoreProvider,
} from './practice.repository.js';
import type {
  DraftBody,
  DraftResponse,
  HistoryQuery,
  HistoryResponse,
  IndicatorsResponse,
  NextBody,
  PracticeConfigInput,
  PreviewBody,
  PreviewResponse,
  RunView,
  StartRunBody,
  StateResponse,
} from './practice.schemas.js';
import { PRACTICE_SET, type PracticeSet } from './practice.set.js';
import type { PracticeConfig, PracticeValidationError } from './practice.types.js';

type ErrorBody = { code: string; message: string; details?: PracticeValidationError[] };

const notFound = (code: string, message: string) => new NotFoundException({ code, message });
const conflict = (code: string, message: string) => new ConflictException({ code, message });

const configInvalid = (errors: PracticeValidationError[]) =>
  new UnprocessableEntityException({
    code: 'PRACTICE_CONFIG_INVALID',
    message: errors[0]?.message ?? 'Cấu hình luyện tập chưa hợp lệ.',
    details: errors,
  } satisfies ErrorBody);

const caseMismatch = () =>
  conflict(
    'PRACTICE_CASE_MISMATCH',
    'Tình huống hiện tại đã thay đổi ở nơi khác. Tải lại để tiếp tục.',
  );

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const toConfig = (input: PracticeConfigInput): PracticeConfig => ({
  buy: { enabled: input.buy.enabled, params: input.buy.params, ops: input.buy.ops },
  sell: { enabled: input.sell.enabled, params: input.sell.params, ops: input.sell.ops },
  hold_max_sessions: input.hold_max_sessions,
});

const briefOf = (header: RunHeader) => ({
  run_id: header.id,
  ordinal: header.ordinal,
  case_id: header.case_id,
  status: header.status,
  summary: header.summary ? (header.summary as unknown as BriefSummary) : null,
});
type BriefSummary = StateResponse['runs'][number]['summary'];

/**
 * Mini practice (Bot SPEC §10-§11): server-side permutation of 30 hidden cases per
 * (user, indicator, set), a draft per progress, locked immutable runs and next-open execution.
 * It never touches bot/manual accounts, shared config, grants or coins; grants are only read.
 */
@Injectable()
export class PracticeService {
  private readonly logger = new Logger(PracticeService.name);

  constructor(
    @Inject(PRACTICE_STORE) private readonly repository: PracticeStoreProvider,
    @Inject(ACADEMY_GRANTS) private readonly grants: AcademyGrantsPort,
    @Inject(PRACTICE_DATA) private readonly data: PracticeCaseDataPort,
    @Inject(PRACTICE_SET) private readonly set: PracticeSet,
  ) {}

  // ----------------------------------------------------------------- indicators

  async listIndicators(userId: string): Promise<IndicatorsResponse> {
    const [granted, summaries] = await Promise.all([
      this.grants.grantedCapabilities(userId),
      this.repository.store().progressSummaries(userId, this.set.set_version),
    ]);
    const byIndicator = new Map(summaries.map((row) => [row.indicator_id, row]));
    return {
      set: {
        set_version: this.set.set_version,
        case_count: PRACTICE_CASE_COUNT,
        test_months: this.set.test.months,
        window_bars: this.set.window_bars,
      },
      profile: MINI_PROFILE_V1,
      hold: { default: HOLD_MAX_DEFAULT, min: HOLD_MAX_MIN, max: HOLD_MAX_MAX },
      indicators: PRACTICE_INDICATOR_IDS.map((id) => {
        const entry = practiceEntry(id);
        const isGranted = entry !== null && granted.has(indicatorCapability(id));
        const summary = byIndicator.get(id);
        return {
          indicator_id: id,
          name: entry?.name ?? id,
          lesson_key: `technical:${id}`,
          granted: isGranted,
          progress:
            isGranted && summary
              ? {
                  status:
                    summary.completed_count >= PRACTICE_CASE_COUNT
                      ? ('completed' as const)
                      : summary.completed_count > 0 || summary.current_status !== null
                        ? ('in_progress' as const)
                        : ('not_started' as const),
                  cursor: summary.cursor_ordinal,
                  completed_count: summary.completed_count,
                  total: PRACTICE_CASE_COUNT,
                }
              : isGranted
                ? {
                    status: 'not_started' as const,
                    cursor: 1,
                    completed_count: 0,
                    total: PRACTICE_CASE_COUNT,
                  }
                : null,
        };
      }),
    };
  }

  // ----------------------------------------------------------------- state / draft

  async state(userId: string, indicatorId: string): Promise<StateResponse> {
    const entry = await this.authorize(userId, indicatorId);
    const progress = await this.ensureProgress(userId, entry);
    return this.stateOf(entry, progress);
  }

  async saveDraft(userId: string, indicatorId: string, body: DraftBody): Promise<DraftResponse> {
    const entry = await this.authorize(userId, indicatorId);
    const progress = await this.ensureProgress(userId, entry);
    const store = this.repository.store();
    // The form is locked from Start until "next": the draft cannot be edited under a locked run.
    if (await store.runByOrdinal(progress.id, progress.cursor_ordinal)) {
      throw conflict('PRACTICE_RUN_LOCKED', 'Cấu hình đã khóa sau khi bắt đầu lượt này.');
    }
    const draft = toConfig(body.draft);
    const updated = await store.updateDraft(progress.id, body.expected_revision, draft);
    if (!updated) {
      throw conflict(
        'DRAFT_REVISION_CONFLICT',
        'Bản nháp đã được lưu ở nơi khác. Tải lại để xem bản mới nhất.',
      );
    }
    return {
      draft: updated.draft,
      draft_revision: updated.draft_revision,
      validation: this.validation(entry, updated.draft),
    };
  }

  // ----------------------------------------------------------------- preview

  async preview(userId: string, indicatorId: string, body: PreviewBody): Promise<PreviewResponse> {
    const entry = await this.authorize(userId, indicatorId);
    const progress = await this.ensureProgress(userId, entry);
    const candidate: PracticeConfig = {
      ...progress.draft,
      buy: { ...progress.draft.buy, params: body.buy_params ?? progress.draft.buy.params },
      sell: { ...progress.draft.sell, params: body.sell_params ?? progress.draft.sell.params },
    };
    const paramErrors = validatePracticeConfig(entry, candidate, { requireBuy: false }).filter(
      (error) => error.path.includes('.params'),
    );
    if (paramErrors.length) throw configInvalid(paramErrors);

    const reserved = await this.requireCase(progress);
    const loaded = await this.loadCase(reserved.symbol);
    const { calendar } = loaded;
    // Only warmup + observation bars are fed to the engine: no future bar can seed a value.
    const visibleBars = calendar.bars.slice(0, calendar.firstTest);
    const buy = toSideConfig(entry, 'buy', candidate.buy);
    const sell = toSideConfig(entry, 'sell', candidate.sell);
    const series = {
      buy: calc(entry.id, buy.params, visibleBars),
      sell: calc(entry.id, sell.params, visibleBars),
    };
    return {
      ordinal: reserved.ordinal,
      case_id: reserved.case_id,
      window_bars: this.set.window_bars,
      chart: buildChart({
        indicatorId: entry.id,
        calendar,
        from: calendar.observationStart,
        to: calendar.firstTest - 1,
        series,
        params: { buy: buy.params, sell: sell.params },
      }),
      data_notes: [...loaded.notes],
    };
  }

  // ----------------------------------------------------------------- start / run

  async startRun(userId: string, indicatorId: string, body: StartRunBody): Promise<RunView> {
    const entry = await this.authorize(userId, indicatorId);
    const config = toConfig(body.config);
    const errors = validatePracticeConfig(entry, config, { requireBuy: true });
    if (errors.length) throw configInvalid(errors);
    const normalized = normalizePracticeConfig(entry, config);
    const requestHash = sha256Hex(
      canonicalJson({
        v: 1,
        indicator_id: entry.id,
        set_version: this.set.set_version,
        ordinal: body.ordinal,
        case_id: body.case_id,
        config: normalized,
      }),
    );
    const store = this.repository.store();

    // Retry of the same intent: the stored run answers, whatever the cursor says now.
    const replay = await store.runByIdempotencyKey(userId, body.idempotency_key);
    if (replay) {
      this.assertSameRequest(replay, requestHash, body.idempotency_key);
      return this.finalize(entry, replay);
    }

    const progress = await this.ensureProgress(userId, entry);
    const reserved = await store.caseAt(progress.id, progress.cursor_ordinal);
    if (!reserved || reserved.ordinal !== body.ordinal || reserved.case_id !== body.case_id) {
      throw caseMismatch();
    }
    // Frozen data is read BEFORE the lock: a data failure must not consume the case.
    const loaded = await this.loadCase(reserved.symbol);

    const run = await this.repository.transaction(async (tx) => {
      const locked = await tx.progress(userId, entry.id, this.set.set_version, { lock: true });
      if (!locked || locked.cursor_ordinal !== body.ordinal) throw caseMismatch();
      const existing = await tx.runByOrdinal(locked.id, body.ordinal);
      if (existing) {
        this.assertSameRequest(existing, requestHash, body.idempotency_key);
        return existing;
      }
      const inserted = await tx.insertRun({
        id: randomUUID(),
        progress_id: locked.id,
        user_id: userId,
        indicator_id: entry.id,
        set_version: this.set.set_version,
        ordinal: body.ordinal,
        case_id: reserved.case_id,
        config: normalized,
        config_hash: sha256Hex(canonicalJson(normalized)),
        hold_max_sessions: normalized.hold_max_sessions,
        idempotency_key: body.idempotency_key,
        request_hash: requestHash,
        data_version: loaded.data_version,
        profile_version: MINI_PROFILE_V1.profile_version,
        calculation_version: CALCULATION_VERSION,
        rule_version: RULE_VERSION,
        engine_version: PRACTICE_ENGINE_VERSION,
        execution_version: this.set.versions.execution,
        comment_version: this.set.versions.comment,
      });
      if (inserted) {
        // The started config becomes the draft, so it carries over to the next case unchanged.
        await tx.updateDraft(locked.id, locked.draft_revision, normalized);
        return inserted;
      }
      const raced = await tx.runByIdempotencyKey(userId, body.idempotency_key);
      if (raced) {
        this.assertSameRequest(raced, requestHash, body.idempotency_key);
        return raced;
      }
      throw conflict('PRACTICE_RUN_LOCKED', 'Lượt này đã được bắt đầu.');
    });
    return this.finalize(entry, run, loaded);
  }

  async getRun(userId: string, runId: string): Promise<RunView> {
    const run = await this.repository.store().runById(userId, runId);
    if (!run) throw notFound('PRACTICE_RUN_NOT_FOUND', 'Không tìm thấy lượt luyện tập.');
    return this.view(run);
  }

  // ----------------------------------------------------------------- next

  async next(userId: string, indicatorId: string, body: NextBody): Promise<StateResponse> {
    const entry = await this.authorize(userId, indicatorId);
    const progress = await this.ensureProgress(userId, entry);
    await this.repository.transaction(async (tx) => {
      const locked = await tx.progress(userId, entry.id, this.set.set_version, { lock: true });
      if (!locked) throw notFound('PRACTICE_NOT_FOUND', 'Không tìm thấy tiến trình luyện tập.');
      const byKey = await tx.advanceByKey(locked.id, body.idempotency_key);
      if (byKey) {
        if (byKey.from_ordinal !== body.expected_cursor) {
          throw conflict(
            'IDEMPOTENCY_KEY_REUSED',
            'Khóa idempotency đã được dùng cho một yêu cầu khác.',
          );
        }
        return;
      }
      if (locked.cursor_ordinal !== body.expected_cursor) {
        // A second click of the same intent (different key) must not advance twice.
        const done = await tx.advanceFrom(locked.id, body.expected_cursor);
        if (done && locked.cursor_ordinal > body.expected_cursor) return;
        throw conflict(
          'PRACTICE_CURSOR_MISMATCH',
          'Tiến trình đã thay đổi ở nơi khác. Tải lại để tiếp tục.',
        );
      }
      if (locked.cursor_ordinal >= PRACTICE_CASE_COUNT) {
        throw conflict('PRACTICE_SET_COMPLETED', 'Bạn đã hoàn thành cả 30 tình huống của bộ này.');
      }
      const current = await tx.runByOrdinal(locked.id, locked.cursor_ordinal);
      if (!current || current.status !== 'succeeded') {
        throw conflict(
          'PRACTICE_RUN_NOT_COMPLETED',
          'Hoàn thành lượt hiện tại trước khi chuyển sang tình huống kế tiếp.',
        );
      }
      const advanced = await tx.advanceCursor(locked.id, locked.cursor_ordinal);
      if (!advanced) {
        throw conflict('PRACTICE_CURSOR_MISMATCH', 'Tiến trình đã thay đổi ở nơi khác.');
      }
      await tx.insertAdvance({
        progress_id: locked.id,
        from_ordinal: locked.cursor_ordinal,
        to_ordinal: locked.cursor_ordinal + 1,
        idempotency_key: body.idempotency_key,
      });
    });
    const fresh = await this.repository.store().progress(userId, entry.id, this.set.set_version);
    return this.stateOf(entry, fresh ?? progress);
  }

  // ----------------------------------------------------------------- history

  async history(
    userId: string,
    indicatorId: string,
    query: HistoryQuery,
  ): Promise<HistoryResponse> {
    const entry = await this.authorize(userId, indicatorId);
    const store = this.repository.store();
    const progress = await store.progress(userId, entry.id, this.set.set_version);
    if (!progress) return { page: query.page, page_size: query.page_size, total: 0, items: [] };
    const { rows, total } = await store.historyPage(
      progress.id,
      query.page_size,
      (query.page - 1) * query.page_size,
    );
    return {
      page: query.page,
      page_size: query.page_size,
      total,
      items: rows.map((row) => ({
        run_id: row.id,
        ordinal: row.ordinal,
        case_id: row.case_id,
        completed_at: row.completed_at ? iso(row.completed_at) : null,
        config: row.config,
        kpis: row.summary ? (row.summary as unknown as BriefSummary) : null,
        versions: this.versions(row),
      })),
    };
  }

  // ----------------------------------------------------------------- internals

  private requireEntry(indicatorId: string): RegistryEntry {
    const entry = practiceEntry(indicatorId);
    if (!entry) {
      throw notFound('PRACTICE_INDICATOR_NOT_FOUND', 'Chỉ báo không có trong bộ luyện tập.');
    }
    return entry;
  }

  /** Indicator whitelist + learned grant `indicator:<id>` (read-only use of the Academy port). */
  private async authorize(userId: string, indicatorId: string): Promise<RegistryEntry> {
    const entry = this.requireEntry(indicatorId);
    const capability = indicatorCapability(entry.id);
    const granted = await this.grants.grantedCapabilities(userId);
    if (!granted.has(capability)) {
      throw new ForbiddenException({
        code: 'CAPABILITY_LOCKED',
        message: `Cần hoàn thành bài học của chỉ báo ${entry.name} (8/8) trước khi luyện tập.`,
        capability,
        reason: 'not_learned',
        // the v2 error filter forwards only `code`, `message` and array `details`
        details: [{ capability, reason: 'not_learned', indicator: entry.id }],
      });
    }
    return entry;
  }

  /** Creates the stored permutation exactly once; later calls always return the same one. */
  private async ensureProgress(userId: string, entry: RegistryEntry): Promise<ProgressRow> {
    const store = this.repository.store();
    const existing = await store.progress(userId, entry.id, this.set.set_version);
    if (existing) return existing;
    const created = await this.repository.transaction((tx) =>
      tx.insertProgress(
        {
          id: randomUUID(),
          user_id: userId,
          indicator_id: entry.id,
          set_version: this.set.set_version,
          draft: defaultPracticeConfig(entry),
        },
        generateCases(this.set.symbols),
      ),
    );
    if (created) return created;
    const raced = await store.progress(userId, entry.id, this.set.set_version);
    if (!raced) throw new Error('practice progress could not be created');
    return raced;
  }

  private async requireCase(progress: ProgressRow) {
    const reserved = await this.repository.store().caseAt(progress.id, progress.cursor_ordinal);
    if (!reserved) throw new Error('practice case missing for cursor');
    return reserved;
  }

  private async loadCase(symbol: string): Promise<LoadedCase> {
    try {
      return await this.data.load(symbol);
    } catch (error) {
      if (error instanceof PracticeDataError) {
        throw new ServiceUnavailableException({
          code:
            error.code === 'DATA_INSUFFICIENT'
              ? 'PRACTICE_DATA_INSUFFICIENT'
              : 'PRACTICE_DATA_UNAVAILABLE',
          message: error.message,
        });
      }
      throw error;
    }
  }

  private validation(entry: RegistryEntry, config: PracticeConfig) {
    const errors = validatePracticeConfig(entry, config, { requireBuy: true });
    return { valid: errors.length === 0, errors };
  }

  private async stateOf(entry: RegistryEntry, progress: ProgressRow): Promise<StateResponse> {
    const store = this.repository.store();
    const [reserved, headers] = await Promise.all([
      this.requireCase(progress),
      store.runHeaders(progress.id),
    ]);
    const current = headers.find((header) => header.ordinal === progress.cursor_ordinal) ?? null;
    const validation = this.validation(entry, progress.draft);
    const cursor = progress.cursor_ordinal;
    const status: StateResponse['status'] =
      current === null
        ? 'ready'
        : current.status === 'computing'
          ? 'computing'
          : current.status === 'failed'
            ? 'failed'
            : cursor >= PRACTICE_CASE_COUNT
              ? 'set_completed'
              : 'completed';
    return {
      set_version: this.set.set_version,
      indicator: { id: entry.id, name: entry.name },
      status,
      ordinal: cursor,
      total: PRACTICE_CASE_COUNT,
      case: { case_id: reserved.case_id, ordinal: cursor, window_bars: this.set.window_bars },
      draft: progress.draft,
      draft_revision: progress.draft_revision,
      validation,
      current_run: current ? briefOf(current) : null,
      can_start: current === null && validation.valid,
      can_retry: current !== null && current.status !== 'succeeded',
      can_next: current?.status === 'succeeded' && cursor < PRACTICE_CASE_COUNT,
      completed_count: headers.filter((header) => header.status === 'succeeded').length,
      runs: headers.map(briefOf),
      profile: MINI_PROFILE_V1,
      form: practiceForm(entry),
    };
  }

  private assertSameRequest(row: RunHeader, requestHash: string, idempotencyKey: string): void {
    if (row.request_hash === requestHash) return;
    if (row.idempotency_key === idempotencyKey) {
      throw conflict(
        'IDEMPOTENCY_KEY_REUSED',
        'Khóa idempotency đã được dùng cho một yêu cầu khác.',
      );
    }
    throw conflict('PRACTICE_RUN_LOCKED', 'Cấu hình của tình huống này đã khóa sau khi bắt đầu.');
  }

  private versions(row: RunHeader): RunView['versions'] {
    return {
      set_version: row.set_version,
      data_version: row.data_version,
      profile_version: row.profile_version,
      calculation_version: row.calculation_version,
      rule_version: row.rule_version,
      engine_version: row.engine_version,
      execution_version: row.execution_version,
      comment_version: row.comment_version,
    };
  }

  private view(row: RunRow): RunView {
    const done = row.status === 'succeeded';
    return {
      run_id: row.id,
      indicator_id: row.indicator_id,
      ordinal: row.ordinal,
      total: PRACTICE_CASE_COUNT,
      case_id: row.case_id,
      status: row.status,
      config: row.config,
      versions: this.versions(row),
      locked_at: iso(row.created_at),
      completed_at: row.completed_at ? iso(row.completed_at) : null,
      attempts: row.attempts,
      error: row.status === 'failed' ? row.error : null,
      result: done ? (row.result as unknown as RunView['result']) : null,
      chart: done ? (row.chart as unknown as RunView['chart']) : null,
    };
  }

  /**
   * Computes (or retries) a locked run and stores its immutable outcome. A failure keeps the
   * reservation: the run stays failed/computing with the locked config and can be retried.
   */
  private async finalize(entry: RegistryEntry, run: RunRow, loaded?: LoadedCase): Promise<RunView> {
    if (run.status === 'succeeded') return this.view(run);
    const store = this.repository.store();
    let data = loaded;
    if (!data) {
      const reserved = await store.caseAt(run.progress_id, run.ordinal);
      if (!reserved) throw new Error('practice case missing for run');
      data = await this.loadCase(reserved.symbol);
    }
    let completion: RunCompletion;
    try {
      completion = this.compute(entry, run, data);
    } catch (error) {
      this.logger.error(
        `Practice run ${run.id} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      await store.failRun(run.id, {
        code: 'PRACTICE_COMPUTE_FAILED',
        message: 'Không tính được kết quả lượt này. Lượt vẫn được giữ để thử lại.',
      });
      throw new InternalServerErrorException({
        code: 'PRACTICE_COMPUTE_FAILED',
        message: 'Không tính được kết quả lượt này. Lượt vẫn được giữ để thử lại.',
      });
    }
    const done = await store.completeRun(run.id, completion);
    if (done) return this.view(done);
    // Another request finished first: the stored immutable result wins.
    const stored = await store.runById(run.user_id, run.id);
    if (!stored) throw notFound('PRACTICE_RUN_NOT_FOUND', 'Không tìm thấy lượt luyện tập.');
    return this.view(stored);
  }

  private compute(entry: RegistryEntry, run: RunRow, loaded: LoadedCase): RunCompletion {
    if (loaded.data_version !== run.data_version) {
      throw new Error('frozen data version differs from the locked run');
    }
    const { calendar } = loaded;
    const config = run.config;
    const buy = toSideConfig(entry, 'buy', config.buy);
    const sell = toSideConfig(entry, 'sell', config.sell);
    const outcome = simulate({
      entry,
      bars: calendar.bars,
      firstTestIndex: calendar.firstTest,
      lastTestIndex: calendar.lastTest,
      buy,
      sell,
      holdMaxSessions: run.hold_max_sessions,
    });
    const comment = buildComment({
      kpis: outcome.kpis,
      trades: outcome.trades,
      indicatorName: entry.name,
      version: run.comment_version,
    });
    const chart = buildChart({
      indicatorId: entry.id,
      calendar,
      from: calendar.observationStart,
      to: calendar.lastTest,
      series: outcome.series,
      params: { buy: buy.params, sell: sell.params },
    });
    return {
      summary: {
        total_return: outcome.kpis.total_return,
        buy_count: outcome.kpis.buy_count,
        closed_trade_count: outcome.kpis.closed_trade_count,
        open_position: outcome.kpis.open_position,
        comment_rule_id: comment.rule_id,
      },
      result: {
        first_session: 1,
        last_session: calendar.lastTest - calendar.firstTest + 1,
        kpis: outcome.kpis,
        trades: outcome.trades,
        events: outcome.events,
        pending_orders: outcome.pending_orders,
        missed_buys: outcome.missed_buys,
        nav: outcome.nav,
        comment,
        data_notes: [...loaded.notes],
      },
      chart: chart as unknown as Record<string, unknown>,
    };
  }
}
