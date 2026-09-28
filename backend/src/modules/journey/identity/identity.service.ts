import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService, type SqlClient } from '../../../platform/database/index.js';
import { AnalysisService } from '../../analysis/index.js';
import { FinancialsService } from '../../financials/index.js';
import { MarketDataService } from '../../market-data/index.js';
import { CoreJourneyService, JourneyEventService } from '../core/index.js';
import {
  MASCOTS,
  MASCOT_RULES_VERSION,
  classifyEvidence,
  completeAssessmentMap,
  digest,
  validateFrozenAssignment,
  type ClassificationResult,
  type MascotId,
} from './identity.classification.js';
import { buildFrozenDataset } from './identity.dataset.js';

const IDENTITY_COLUMNS = `
  id, user_id, mascot_rules_version, assignment_status, mascot_id,
  dominant_layer, assignment_basis, window_start, window_end,
  valid_pair_count, match_counts, tied_layers, selected_assessment_refs,
  dataset_hash, excluded_records_summary, assigned_at, created_at, updated_at`;

type ProfileRow = ClassificationResult & {
  id: string;
  user_id: string;
  mascot_rules_version: number;
  window_start: Date | string | null;
  window_end: Date | string;
  assigned_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type AssessmentRow = {
  id: string;
  user_id: string;
  dataset_id: string;
  symbol: string;
  trading_date: string;
  completed_at: Date | string;
  revealed_at: Date | string | null;
  answers: Record<string, string>;
  source: string;
  mode: string;
  record_status: string;
  proof_version: string;
};

type DatasetRow = {
  id: string;
  user_id: string;
  symbol: string;
  trading_date: string;
  created_at: Date | string;
  dataset_hash: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class JourneyIdentityService {
  constructor(
    private readonly database: DatabaseService,
    private readonly journey: CoreJourneyService,
    private readonly events: JourneyEventService,
    private readonly config: ConfigService,
    private readonly analysis: AnalysisService,
    private readonly financials: FinancialsService,
    private readonly market: MarketDataService,
  ) {}

  async get(userId: string): Promise<Record<string, unknown>> {
    return this.database.transaction((tx) => this.getInTransaction(tx, userId));
  }

  async getInTransaction(tx: SqlClient, userId: string): Promise<Record<string, unknown>> {
    const level = await this.journey.getActiveLevel(tx, userId);
    const [graduated] = await tx.query<{ graduated_at: Date | string | null }>(
      'select graduated_at from cap6_progress where user_id = $1 limit 1',
      [userId],
    );
    const profile = await this.profile(tx, userId);
    let mascot: Record<string, unknown> | null;
    let lifecycle: 'egg' | 'pending_data_repair' | 'reveal_pending' | 'mascot' = 'egg';
    if (graduated?.graduated_at) {
      lifecycle = 'pending_data_repair';
      if (profile?.assignment_status === 'assigned') {
        this.validateProfileShape(profile);
        mascot = mascotView(profile);
      } else {
        mascot = await this.readQaMascot(tx, userId, graduated.graduated_at);
      }
      if (mascot) lifecycle = 'reveal_pending';
      const [ui] = await tx.query<Record<string, unknown>>(
        `select last_seen_egg_level, last_seen_egg_level_at, egg_hatch_seen_at,
                mascot_reveal_seen_at, mascot_greeted_local_date, last_animated_bot_run_id
         from journey_identity_ui where user_id = $1 limit 1`,
        [userId],
      );
      if (mascot && ui?.mascot_reveal_seen_at) lifecycle = 'mascot';
      return {
        lifecycle,
        current_level: level ?? 0,
        cap6_graduated_at: graduated.graduated_at,
        mascot_rules_version: MASCOT_RULES_VERSION,
        mascot,
        today_local: localDate(),
        timezone: 'Asia/Ho_Chi_Minh',
        ui_state: this.uiView(ui),
        bot_run: await this.botStatus(tx, userId, ui),
      };
    }
    const [ui] = await tx.query<Record<string, unknown>>(
      `select last_seen_egg_level, last_seen_egg_level_at, egg_hatch_seen_at,
              mascot_reveal_seen_at, mascot_greeted_local_date, last_animated_bot_run_id
       from journey_identity_ui where user_id = $1 limit 1`,
      [userId],
    );
    return {
      lifecycle,
      current_level: level ?? 0,
      cap6_graduated_at: null,
      mascot_rules_version: MASCOT_RULES_VERSION,
      mascot: null,
      today_local: localDate(),
      timezone: 'Asia/Ho_Chi_Minh',
      ui_state: this.uiView(ui),
      bot_run: await this.botStatus(tx, userId, ui),
    };
  }

  async createDataset(userId: string, symbol: string): Promise<Record<string, unknown>> {
    const observedAt = new Date();
    // Provider/AI work must finish before opening the write transaction. A
    // slow upstream is never allowed to hold the user/progress row locks.
    const sources = await Promise.allSettled([
      this.analysis.insight({ symbol, language: 'vi', include_payload: false }, userId),
      this.financials.getDashboard(symbol, 1),
      this.market.getOhlcv(symbol, { interval: '1D' }),
    ]);
    const insight = sources[0]!.status === 'fulfilled' ? sources[0]!.value : null;
    const dashboard = sources[1]!.status === 'fulfilled' ? sources[1]!.value : null;
    const ohlcv = sources[2]!.status === 'fulfilled' ? sources[2]!.value : [];
    const payload = buildFrozenDataset({
      symbol,
      insight,
      financialDashboard: dashboard ? { ...dashboard.data, meta: dashboard.meta } : null,
      ohlcv,
      observedAt,
    });
    const datasetHash = digest(payload);
    return this.database.transaction(async (tx) => {
      await this.requireCap4(tx, userId);
      await this.lockUser(tx, userId);
      const [existing] = await tx.query<DatasetRow>(
        `select id, user_id, symbol, trading_date, created_at, dataset_hash, payload
         from journey_reading_datasets
         where user_id = $1 and symbol = $2 and trading_date = $3
         order by created_at desc limit 1`,
        [userId, symbol, payload.trading_date],
      );
      if (existing) {
        this.assertDataset(existing, symbol);
        return datasetView(existing);
      }
      const [created] = await tx.query<DatasetRow>(
        `insert into journey_reading_datasets
           (id, user_id, symbol, trading_date, created_at, dataset_hash, payload)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6::json)
         returning id, user_id, symbol, trading_date, created_at, dataset_hash, payload`,
        [userId, symbol, payload.trading_date, observedAt, datasetHash, JSON.stringify(payload)],
      );
      if (!created)
        throw new ConflictException({
          code: 'DATASET_NOT_SAVED',
          message: 'Không thể đóng băng bộ dữ liệu đọc',
        });
      return datasetView(created);
    });
  }

  async initializeAfterGraduation(userId: string): Promise<Record<string, unknown> | null> {
    return this.database.transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const [cap6] = await tx.query<{ graduated_at: Date | string | null }>(
        'select graduated_at from cap6_progress where user_id = $1 limit 1',
        [userId],
      );
      if (!cap6?.graduated_at) return null;
      const [cap4] = await tx.query<{ entered_at: Date | string }>(
        'select entered_at from cap4_progress where user_id = $1 limit 1',
        [userId],
      );
      let profile = await this.profile(tx, userId);
      if (profile?.assignment_status === 'assigned') {
        await this.validateFrozenProfile(tx, profile, cap4?.entered_at ?? null, cap6.graduated_at);
        return mascotView(profile);
      }

      const windowStart = profile?.window_start ?? cap4?.entered_at ?? null;
      const windowEnd = profile?.window_end ?? cap6.graduated_at;
      this.assertWindow(
        profile,
        windowStart,
        windowEnd,
        cap4?.entered_at ?? null,
        cap6.graduated_at,
      );
      const classification = classifyEvidence(
        await this.evidenceRecords(tx, userId),
        userId,
        windowStart,
        windowEnd,
      );
      const assignedAt = classification.assignment_status === 'assigned' ? new Date() : null;
      if (!profile) {
        await tx.query(
          `insert into bot_mascot_profiles (
             id, user_id, mascot_rules_version, assignment_status, mascot_id,
             dominant_layer, assignment_basis, window_start, window_end,
             valid_pair_count, match_counts, tied_layers, selected_assessment_refs,
             dataset_hash, excluded_records_summary, assigned_at, created_at, updated_at
           ) values (
             gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8,
             $9, $10::json, $11::json, $12::json, $13, $14::json, $15, now(), now()
           )`,
          profileValues(userId, classification, windowStart, windowEnd, assignedAt),
        );
      } else {
        await tx.query(
          `update bot_mascot_profiles set
             assignment_status = $3, mascot_id = $4, dominant_layer = $5,
             assignment_basis = $6, window_start = $7,
             valid_pair_count = $9, match_counts = $10::json, tied_layers = $11::json,
             selected_assessment_refs = $12::json, dataset_hash = $13,
             excluded_records_summary = $14::json, assigned_at = $15, updated_at = now()
           where user_id = $1 and mascot_rules_version = $2
             and assignment_status = 'pending_data_repair'`,
          profileValues(userId, classification, windowStart, windowEnd, assignedAt),
        );
      }
      profile = await this.profile(tx, userId);
      return profile?.assignment_status === 'assigned' ? mascotView(profile) : null;
    });
  }

  async submit(
    userId: string,
    datasetId: string,
    answers: Record<string, string>,
  ): Promise<Record<string, string>> {
    if (!completeAssessmentMap(answers))
      throw new BadRequestException({
        code: 'INVALID_ASSESSMENT',
        message: 'Cần tự chấm đủ 5 lớp',
      });
    return this.database.transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const dataset = await this.dataset(tx, datasetId, userId);
      this.assertDataset(dataset, dataset.symbol);
      const [current] = await tx.query<AssessmentRow>(
        `select id, user_id, dataset_id, symbol, trading_date, completed_at, revealed_at,
                answers, source, mode, record_status, proof_version
         from journey_assessments where user_id = $1 and symbol = $2 and trading_date = $3 limit 1`,
        [userId, dataset.symbol, dataset.trading_date],
      );
      if (current) return { id: current.id, dataset_id: current.dataset_id };
      const [row] = await tx.query<{ id: string; dataset_id: string }>(
        `insert into journey_assessments
           (id, user_id, dataset_id, symbol, trading_date, completed_at,
            answers, source, mode, record_status, proof_version)
         values (gen_random_uuid(), $1, $2, $3, $4, now(), $5::json,
                 'learning', 'thuc_chien', 'valid', 'commit_then_reveal_v1')
         returning id, dataset_id`,
        [userId, dataset.id, dataset.symbol, dataset.trading_date, JSON.stringify(answers)],
      );
      if (!row)
        throw new ConflictException({
          code: 'ASSESSMENT_NOT_SAVED',
          message: 'Không thể lưu bài tự chấm',
        });
      return row;
    });
  }

  async reveal(userId: string, assessmentId: string): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const [assessment] = await tx.query<AssessmentRow>(
        `select id, user_id, dataset_id, symbol, trading_date, completed_at, revealed_at,
                answers, source, mode, record_status, proof_version
         from journey_assessments where id = $1 and user_id = $2 limit 1`,
        [assessmentId, userId],
      );
      if (!assessment)
        throw new NotFoundException({
          code: 'ASSESSMENT_NOT_FOUND',
          message: 'Không tìm thấy bài tự chấm',
        });
      const dataset = await this.dataset(tx, assessment.dataset_id, userId);
      this.assertDataset(dataset, assessment.symbol);
      await tx.query(
        'update journey_assessments set revealed_at = coalesce(revealed_at, now()) where id = $1',
        [assessment.id],
      );
      return {
        id: assessment.id,
        dataset_id: assessment.dataset_id,
        ai_answers: dataset.payload.ai_answers,
        readings: dataset.payload.readings,
        first_answers: assessment.answers,
      };
    });
  }

  async uiEvent(
    userId: string,
    input: {
      event: 'level_seen' | 'hatch_seen' | 'reveal_seen' | 'greet_seen' | 'bot_run_updated_seen';
      level?: number | null;
      run_id?: string | null;
      local_date?: string | null;
    },
  ): Promise<Record<string, unknown>> {
    return this.database.transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const state = await this.getInTransaction(tx, userId);
      const today = localDate();
      if (input.local_date && input.local_date !== today)
        throw new BadRequestException({
          code: 'STALE_UI_DATE',
          message: 'Ngày hiển thị đã thay đổi; vui lòng tải lại',
        });
      const [ui] = await tx.query<Record<string, unknown>>(
        'select * from journey_identity_ui where user_id = $1 for update',
        [userId],
      );
      if (input.event === 'level_seen') {
        const currentLevel = Number(state.current_level ?? 0);
        if (input.level == null || input.level < 0 || input.level > currentLevel || input.level > 6)
          throw new BadRequestException({
            code: 'INVALID_LEVEL_EVENT',
            message: 'Cấp hiển thị không hợp lệ',
          });
        if (!ui) {
          await tx.query(
            `insert into journey_identity_ui (user_id, last_seen_egg_level, last_seen_egg_level_at, updated_at)
             values ($1, $2, now(), now())`,
            [userId, input.level],
          );
        } else if (ui.last_seen_egg_level == null || Number(ui.last_seen_egg_level) < input.level) {
          await tx.query(
            `update journey_identity_ui set last_seen_egg_level = $2, last_seen_egg_level_at = now(), updated_at = now()
             where user_id = $1`,
            [userId, input.level],
          );
        }
      } else {
        if (!state.mascot || !state.cap6_graduated_at)
          throw new ConflictException({
            code: 'MASCOT_NOT_READY',
            message: 'Linh thú chưa được xác định',
          });
        if (input.event === 'hatch_seen') {
          await this.ensureUi(tx, userId);
          await tx.query(
            'update journey_identity_ui set egg_hatch_seen_at = coalesce(egg_hatch_seen_at, now()), updated_at = now() where user_id = $1',
            [userId],
          );
        } else {
          const currentUi = ui ?? {};
          if (input.event === 'reveal_seen' && !currentUi.egg_hatch_seen_at)
            throw new ConflictException({
              code: 'HATCH_REQUIRED',
              message: 'Chưa hoàn tất phần nở trứng',
            });
          if (
            (input.event === 'greet_seen' || input.event === 'bot_run_updated_seen') &&
            !currentUi.mascot_reveal_seen_at
          )
            throw new ConflictException({
              code: 'REVEAL_REQUIRED',
              message: 'Chưa hoàn tất phần giới thiệu Linh thú',
            });
          if (input.event === 'reveal_seen')
            await tx.query(
              'update journey_identity_ui set mascot_reveal_seen_at = coalesce(mascot_reveal_seen_at, now()), mascot_greeted_local_date = $2, updated_at = now() where user_id = $1',
              [userId, today],
            );
          else if (input.event === 'greet_seen')
            await tx.query(
              'update journey_identity_ui set mascot_greeted_local_date = $2, updated_at = now() where user_id = $1',
              [userId, today],
            );
          else await thisrecordBotRunSeen(tx, userId, input.run_id, today);
        }
      }
      await this.events.recordInTransaction(tx, {
        userId,
        name: `identity_${input.event}`,
        fields: { source: 'server' },
        dedupKey: `${input.event}:${input.run_id ?? ''}:${today}`,
        source: 'server',
      });
      return this.getInTransaction(tx, userId);
    });
  }

  async grantQaMascot(
    admin: { id: string; role: string; status: string },
    input: { user_id: string; mascot_id: MascotId; reason: string },
  ): Promise<{ accepted: true; target_user_id: string; mascot_id: MascotId }> {
    if (
      this.config.get<string>('APP_ENV') === 'production' ||
      !asBoolean(this.config.get('JOURNEY_QA_GRANTS_ENABLED'))
    ) {
      throw new NotFoundException({
        code: 'QA_GRANTS_DISABLED',
        message: 'Tính năng QA không khả dụng',
      });
    }
    if (admin.role !== 'admin' || admin.status !== 'active') {
      throw new NotFoundException({
        code: 'QA_GRANTS_DISABLED',
        message: 'Tính năng QA không khả dụng',
      });
    }
    return this.database.transaction(async (tx) => {
      const [target] = await tx.query<{ id: string; email: string }>(
        'select id, email from users where id = $1 for update',
        [input.user_id],
      );
      if (!target)
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: 'Không tìm thấy người dùng',
        });
      if (!/^[^@\s]+\+iqx-qa-[^@\s]+@[^@\s]+$/i.test(target.email)) {
        throw new ConflictException({
          code: 'QA_ACCOUNT_REQUIRED',
          message: 'Chỉ tài khoản QA được cấp Linh thú QA',
        });
      }
      const [cap6] = await tx.query<{ graduated_at: Date | string | null }>(
        'select graduated_at from cap6_progress where user_id = $1 limit 1',
        [input.user_id],
      );
      if (!cap6?.graduated_at)
        throw new ConflictException({
          code: 'CAP6_REQUIRED',
          message: 'Tài khoản QA chưa tốt nghiệp Cấp 6',
        });
      const profile = await this.profile(tx, input.user_id);
      if (profile?.assignment_status === 'assigned')
        throw new ConflictException({
          code: 'MASCOT_ALREADY_ASSIGNED',
          message: 'Tài khoản đã có Linh thú từ chứng cứ học tập',
        });
      const graduation = new Date(cap6.graduated_at).toISOString();
      const expected = {
        user_id: input.user_id,
        mascot_id: input.mascot_id,
        mascot_rules_version: MASCOT_RULES_VERSION,
        cap6_graduated_at: graduation,
        purpose: 'qa_display_override',
      };
      const prior = await tx.query<{
        payload_after: Record<string, unknown>;
        created_at: Date | string;
      }>(
        `select payload_after, created_at from admin_audit_log
         where action = 'journey.mascot_qa_grant' and target_entity = 'user' and target_id = $1
         order by created_at desc limit 10`,
        [input.user_id],
      );
      if (prior.length > 0) {
        const stored = prior[0]!.payload_after;
        if (stableJson(stored) !== stableJson(expected))
          throw new ConflictException({
            code: 'QA_GRANT_IMMUTABLE',
            message: 'Không thể đổi Linh thú đã cấp cho tài khoản QA',
          });
        return { accepted: true, target_user_id: input.user_id, mascot_id: input.mascot_id };
      }
      await tx.query(
        `insert into admin_audit_log
           (id, admin_user_id, action, target_entity, target_id, payload_before, payload_after, note, created_at)
         values (gen_random_uuid(), $1, 'journey.mascot_qa_grant', 'user', $2, null, $3::jsonb, $4, now())`,
        [admin.id, input.user_id, JSON.stringify(expected), input.reason.trim()],
      );
      return { accepted: true, target_user_id: input.user_id, mascot_id: input.mascot_id };
    });
  }

  private async evidenceRecords(tx: SqlClient, userId: string) {
    const rows = await tx.query<
      AssessmentRow & {
        dataset_user_id: string;
        dataset_symbol: string;
        dataset_trading_date: string;
        dataset_created_at: Date | string;
        dataset_hash: string;
        payload: Record<string, unknown>;
      }
    >(
      `select a.id, a.user_id, a.dataset_id, a.symbol, a.trading_date,
              a.completed_at, a.revealed_at, a.answers, a.source, a.mode,
              a.record_status, a.proof_version,
              d.user_id as dataset_user_id, d.symbol as dataset_symbol,
              d.trading_date as dataset_trading_date, d.created_at as dataset_created_at,
              d.dataset_hash, d.payload
       from journey_assessments a
       join journey_reading_datasets d on d.id = a.dataset_id
       where a.user_id = $1`,
      [userId],
    );
    return rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      symbol: row.symbol,
      trading_date: dateOnly(row.trading_date),
      completed_at: row.completed_at,
      revealed_at: row.revealed_at,
      answers: row.answers,
      source: row.source,
      mode: row.mode,
      record_status: row.record_status,
      proof_version: row.proof_version,
      dataset_id: row.dataset_id,
      dataset_hash: row.dataset_hash,
      ai_answers: row.payload.ai_answers,
      snapshot_matches:
        row.dataset_user_id === userId &&
        row.dataset_symbol === row.symbol &&
        dateOnly(row.dataset_trading_date) === dateOnly(row.trading_date) &&
        row.payload.symbol === row.symbol &&
        row.payload.source_symbol === row.symbol &&
        row.payload.valuation_source_symbol === row.symbol &&
        row.payload.trading_date === dateOnly(row.dataset_trading_date) &&
        digest(row.payload) === row.dataset_hash &&
        new Date(row.dataset_created_at).getTime() <= new Date(row.completed_at).getTime(),
    }));
  }

  private assertWindow(
    profile: ProfileRow | null,
    windowStart: Date | string | null,
    windowEnd: Date | string,
    cap4EnteredAt: Date | string | null,
    cap6GraduatedAt: Date | string,
  ): void {
    const equal = (left: Date | string, right: Date | string) =>
      new Date(left).getTime() === new Date(right).getTime();
    if (
      !equal(windowEnd, cap6GraduatedAt) ||
      (windowStart !== null &&
        (cap4EnteredAt === null ||
          !equal(windowStart, cap4EnteredAt) ||
          new Date(windowStart) > new Date(windowEnd))) ||
      (profile?.window_end && !equal(profile.window_end, cap6GraduatedAt))
    ) {
      throw new ConflictException({
        code: 'MASCOT_WINDOW_INVALID',
        message: 'Mốc dữ liệu Linh thú cần được kiểm tra',
      });
    }
  }

  private async validateFrozenProfile(
    tx: SqlClient,
    profile: ProfileRow,
    cap4EnteredAt: Date | string | null,
    cap6GraduatedAt: Date | string,
  ): Promise<void> {
    this.validateProfileShape(profile);
    this.assertWindow(
      profile,
      profile.window_start,
      profile.window_end,
      cap4EnteredAt,
      cap6GraduatedAt,
    );
    const evidence = classifyEvidence(
      await this.evidenceRecords(tx, profile.user_id),
      profile.user_id,
      profile.window_start,
      profile.window_end,
    );
    if (
      stableJson(evidence.selected_assessment_refs) !== stableJson(profile.selected_assessment_refs)
    ) {
      throw new ConflictException({
        code: 'MASCOT_EVIDENCE_INTEGRITY_ERROR',
        message: 'Chứng cứ Linh thú cần được kiểm tra',
      });
    }
  }

  private async profile(tx: SqlClient, userId: string): Promise<ProfileRow | null> {
    const [profile] = await tx.query<ProfileRow>(
      `select ${IDENTITY_COLUMNS} from bot_mascot_profiles
       where user_id = $1 and mascot_rules_version = $2 limit 1`,
      [userId, MASCOT_RULES_VERSION],
    );
    return profile ?? null;
  }

  private validateProfileShape(profile: ProfileRow): void {
    try {
      validateFrozenAssignment(profile);
    } catch {
      throw new ConflictException({
        code: 'MASCOT_INTEGRITY_ERROR',
        message: 'Hồ sơ Linh thú cần được kiểm tra dữ liệu',
      });
    }
    if (profile.window_start && new Date(profile.window_start) > new Date(profile.window_end))
      throw new ConflictException({
        code: 'MASCOT_WINDOW_INVALID',
        message: 'Mốc dữ liệu Linh thú cần được kiểm tra',
      });
  }

  private async requireCap4(tx: SqlClient, userId: string): Promise<void> {
    const [row] = await tx.query<{ id: string }>(
      'select id from cap4_progress where user_id = $1 limit 1',
      [userId],
    );
    if (!row) throw new ConflictException({ code: 'CAP4_REQUIRED', message: 'Chưa vào Cấp 4' });
  }

  private async dataset(tx: SqlClient, id: string, userId: string): Promise<DatasetRow> {
    const [row] = await tx.query<DatasetRow>(
      `select id, user_id, symbol, trading_date, created_at, dataset_hash, payload
       from journey_reading_datasets where id = $1 and user_id = $2 limit 1`,
      [id, userId],
    );
    if (!row)
      throw new NotFoundException({
        code: 'DATASET_NOT_FOUND',
        message: 'Không tìm thấy bộ dữ liệu',
      });
    return row;
  }

  private assertDataset(row: DatasetRow, expectedSymbol: string): void {
    if (
      row.symbol !== expectedSymbol ||
      digest(row.payload) !== row.dataset_hash ||
      row.payload.symbol !== row.symbol ||
      (row.payload.source_symbol != null && row.payload.source_symbol !== row.symbol) ||
      (row.payload.valuation_source_symbol != null &&
        row.payload.valuation_source_symbol !== row.symbol)
    ) {
      throw new ConflictException({
        code: 'DATASET_INTEGRITY_ERROR',
        message: 'Bộ dữ liệu đối chiếu cần được kiểm tra',
      });
    }
    if (!row.payload.readings || typeof row.payload.readings !== 'object')
      throw new ConflictException({
        code: 'DATASET_INCOMPLETE',
        message: 'Bộ dữ liệu chưa đủ thông tin đọc',
      });
  }

  private async lockUser(tx: SqlClient, userId: string): Promise<void> {
    const [user] = await tx.query<{ id: string }>('select id from users where id = $1 for update', [
      userId,
    ]);
    if (!user)
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng' });
  }

  private async ensureUi(tx: SqlClient, userId: string): Promise<void> {
    await tx.query(
      `insert into journey_identity_ui (user_id, updated_at) values ($1, now()) on conflict (user_id) do nothing`,
      [userId],
    );
  }

  private uiView(ui: Record<string, unknown> | undefined): Record<string, unknown> {
    return {
      last_seen_egg_level: ui?.last_seen_egg_level ?? null,
      egg_hatch_seen_at: ui?.egg_hatch_seen_at ?? null,
      reveal_seen_at: ui?.mascot_reveal_seen_at ?? null,
      greeted_local_date: ui?.mascot_greeted_local_date ?? null,
      last_animated_bot_run_id: ui?.last_animated_bot_run_id ?? null,
    };
  }

  private async botStatus(
    tx: SqlClient,
    userId: string,
    ui?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const runs = await tx.query<{
      id: string;
      status: string;
      trading_date: string;
      started_at: Date | string;
      completed_at: Date | string | null;
      issues: unknown[];
    }>(
      `select id, status, trading_date, started_at, completed_at, issues
       from bot_run_receipts where user_id = $1 order by trading_date desc, started_at desc`,
      [userId],
    );
    const latest = runs[0];
    const cursor = ui?.last_animated_bot_run_id
      ? runs.find((run) => run.id === ui.last_animated_bot_run_id)
      : undefined;
    return {
      status: latest?.status ?? 'idle',
      latest_run_id: latest?.id ?? null,
      last_updated_at: latest?.completed_at ?? latest?.started_at ?? null,
      processed_unseen_sessions: runs.filter(
        (run) => run.status === 'succeeded' && (!cursor || run.trading_date > cursor.trading_date),
      ).length,
      issues: latest?.issues ?? [],
      connected: Boolean(latest),
    };
  }

  private async readQaMascot(
    tx: SqlClient,
    userId: string,
    graduatedAt: Date | string,
  ): Promise<Record<string, unknown> | null> {
    if (
      this.config.get<string>('APP_ENV') === 'production' ||
      !asBoolean(this.config.get('JOURNEY_QA_GRANTS_ENABLED'))
    )
      return null;
    const [user] = await tx.query<{ email: string }>(
      'select email from users where id = $1 limit 1',
      [userId],
    );
    if (!user || !/^[^@\s]+\+iqx-qa-[^@\s]+@[^@\s]+$/i.test(user.email)) return null;
    const rows = await tx.query<{
      payload_after: Record<string, unknown>;
      created_at: Date | string;
    }>(
      `select payload_after, created_at from admin_audit_log
       where action = 'journey.mascot_qa_grant' and target_entity = 'user' and target_id = $1
       order by created_at desc limit 10`,
      [userId],
    );
    for (const row of rows) {
      const payload = row.payload_after;
      if (
        payload?.purpose !== 'qa_display_override' ||
        payload.user_id !== userId ||
        payload.mascot_rules_version !== MASCOT_RULES_VERSION ||
        payload.cap6_graduated_at !== new Date(graduatedAt).toISOString()
      )
        continue;
      const mascot = MASCOTS[payload.mascot_id as keyof typeof MASCOTS];
      if (!mascot) continue;
      const layer = Object.entries(MASCOTS).find(([, value]) => value.id === mascot.id)?.[0];
      return {
        id: mascot.id,
        name: mascot.name,
        dominant_layer: layer,
        assignment_basis: 'qa_override',
        valid_pair_count: 0,
        match_counts: { ky_thuat: 0, dong_tien: 0, noi_bo: 0, tin_tuc: 0, dinh_gia: 0 },
        tied_layers: [],
        window_start: null,
        window_end: graduatedAt,
        assigned_at: row.created_at,
      };
    }
    return null;
  }
}

function datasetView(row: DatasetRow): Record<string, unknown> {
  const payload = row.payload;
  return {
    id: row.id,
    symbol: row.symbol,
    trading_date: row.trading_date,
    readings: payload.readings,
    price: payload.price ?? null,
  };
}

function mascotView(profile: ProfileRow): Record<string, unknown> {
  const mascot = profile.mascot_id
    ? Object.values(MASCOTS).find((item) => item.id === profile.mascot_id)
    : null;
  return {
    id: profile.mascot_id,
    name: mascot?.name ?? profile.mascot_id,
    dominant_layer: profile.dominant_layer,
    assignment_basis: profile.assignment_basis,
    valid_pair_count: profile.valid_pair_count,
    match_counts: profile.match_counts,
    tied_layers: profile.tied_layers,
    window_start: profile.window_start,
    window_end: profile.window_end,
    assigned_at: profile.assigned_at,
  };
}

async function thisrecordBotRunSeen(
  tx: SqlClient,
  userId: string,
  runId: string | null | undefined,
  today: string,
): Promise<void> {
  if (!runId)
    throw new BadRequestException({
      code: 'BOT_RUN_REQUIRED',
      message: 'Cần phiên Bot đã xử lý thành công',
    });
  const [run] = await tx.query<{
    id: string;
    user_id: string;
    status: string;
    trading_date: string;
  }>('select id, user_id, status, trading_date from bot_run_receipts where id = $1 limit 1', [
    runId,
  ]);
  if (!run || run.user_id !== userId || run.status !== 'succeeded')
    throw new BadRequestException({
      code: 'BOT_RUN_INVALID',
      message: 'Phiên Bot chưa xử lý thành công',
    });
  await tx.query(
    'update journey_identity_ui set last_animated_bot_run_id = $2, mascot_greeted_local_date = $3, updated_at = now() where user_id = $1',
    [userId, run.id, today],
  );
}

function localDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function profileValues(
  userId: string,
  result: ClassificationResult,
  windowStart: Date | string | null,
  windowEnd: Date | string,
  assignedAt: Date | null,
): readonly unknown[] {
  return [
    userId,
    MASCOT_RULES_VERSION,
    result.assignment_status,
    result.mascot_id,
    result.dominant_layer,
    result.assignment_basis,
    windowStart,
    windowEnd,
    result.valid_pair_count,
    JSON.stringify(result.match_counts),
    JSON.stringify(result.tied_layers),
    JSON.stringify(result.selected_assessment_refs),
    result.dataset_hash,
    JSON.stringify(result.excluded_records_summary),
    assignedAt,
  ];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
