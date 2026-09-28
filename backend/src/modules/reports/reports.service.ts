import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { classifySession } from './session-classifier.js';
import { buildReportPrompts } from './report-prompts.js';
import { parseAiJson, validateMarketReport } from './report-validator.js';
import { currentOrPreviousTradingDate } from './market-calendar.js';
import { buildReportVisuals } from './report-visuals.js';
import { ReportsRepository } from './reports.repository.js';
import {
  MARKET_REPORT_AI,
  MARKET_REPORT_INPUT,
  type JsonObject,
  type MarketAiPort,
  type MarketReport,
  type MarketReportGenerationResult,
  type MarketReportInputPort,
  type ReportType,
} from './reports.types.js';

function deterministicOutput(payload: JsonObject, type: ReportType): JsonObject {
  const vn =
    payload.vnindex && typeof payload.vnindex === 'object' && !Array.isArray(payload.vnindex)
      ? (payload.vnindex as JsonObject)
      : {};
  const change = typeof vn.change_pct === 'number' ? vn.change_pct : null;
  const direction = change === null ? 'flat' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const marker = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '•';
  const date =
    payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
      ? String((payload.meta as JsonObject).generated_for_date ?? '')
      : '';
  const headline =
    change === null
      ? 'VN-Index chưa xác định hướng từ snapshot'
      : `VN-Index ${change >= 0 ? 'tăng' : 'giảm'} ${Math.abs(change).toFixed(2)}%`;
  const close =
    typeof vn.close === 'number' ? vn.close : typeof vn.value === 'number' ? vn.value : null;
  const volume = typeof vn.volume === 'number' ? vn.volume : null;
  const marketHealth =
    close === null
      ? 'Sức khỏe thị trường chưa được xác định từ snapshot. Báo cáo giữ nguyên trạng thái chưa xác định vì không có giá trị đóng cửa để đối chiếu. Các chỉ báo breadth, dòng tiền và vùng giá chỉ được sử dụng khi trường tương ứng xuất hiện trong đầu vào; không suy diễn phần còn thiếu.'
      : `VN-Index ở mức ${close}; mức thay đổi phiên là ${change === null ? 'chưa xác định' : `${change}%`}. Khối lượng ghi nhận ${volume === null ? 'chưa xác định' : volume} theo snapshot. Các chỉ báo breadth, dòng tiền và vùng giá chỉ được sử dụng khi có trường tương ứng trong đầu vào; không suy diễn phần còn thiếu.`;
  const structure = date
    ? `Snapshot phiên ${date} được giữ nguyên theo các nguồn đã xác nhận.`
    : 'Cấu trúc phiên được giữ nguyên theo snapshot đã xác nhận.';
  const smartMoney =
    payload.foreign_flow || payload.prop_trading
      ? 'Dòng tiền chỉ phản ánh các trường foreign_flow và prop_trading có trong snapshot; không thêm mã hoặc giá trị ngoài nguồn.'
      : 'Dòng tiền chưa được xác định từ snapshot; không thêm mã hoặc giá trị ngoài nguồn.';

  if (type === 'daily') {
    return {
      headline: Array.from(headline).slice(0, 80).join(''),
      tagline: { direction, marker, text: 'Hướng vận động theo snapshot đã xác nhận' },
      paragraphs: { structure, smart_money: smartMoney, market_health: marketHealth },
      scenarios: [],
      watchlist: null,
      unexplained: null,
      meta: { deterministic: true, report_type: type },
    };
  }
  if (type === 'midday') {
    const generatedAt =
      payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
        ? String((payload.meta as JsonObject).generated_at ?? '')
        : '';
    return {
      headline: Array.from(headline).slice(0, 80).join(''),
      tagline: {
        text: 'Đánh giá phiên sáng theo snapshot đã xác nhận',
        color: direction === 'up' || direction === 'down' ? direction : 'neutral',
      },
      paragraphs: {
        session_structure: { status: 'published', content: structure },
        money_flow: { status: 'published', content: smartMoney },
        market_health: {
          status: 'pending',
          pending_message: 'Sức khỏe cuối phiên chờ dữ liệu xác nhận.',
          pending_until: generatedAt,
        },
      },
      scenarios: [],
      watchlist: null,
      unexplained: null,
      meta: { deterministic: true, report_type: type },
    };
  }
  const globalCount = Array.isArray(payload.global_markets) ? payload.global_markets.length : null;
  const newsCount = Array.isArray(payload.news_pool) ? payload.news_pool.length : null;
  const sourceCounts =
    globalCount !== null || newsCount !== null
      ? ` đã xác nhận${globalCount === null ? '' : ` ${globalCount} thị trường`}${globalCount !== null && newsCount !== null ? ' và' : ''}${newsCount === null ? '' : ` ${newsCount} tin nguồn`}`
      : '';
  return {
    headline: Array.from(headline).slice(0, 80).join(''),
    tagline: { text: `Snapshot trước phiên${sourceCounts}.` },
    paragraphs:
      globalCount !== null && globalCount > 0
        ? { world_paragraph: `Có ${globalCount} thị trường quốc tế trong snapshot trước phiên.` }
        : {},
    scenarios: [],
    watchlist: null,
    unexplained: null,
    meta: { deterministic: true, report_type: type },
  };
}

function normalizeCandidate(value: unknown, type: ReportType): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const candidate = { ...(value as JsonObject) };
  // DeepSeek occasionally emits the pre-market paragraph at the root. Move
  // the same value into the canonical envelope without inventing content.
  if (
    type === 'premarket' &&
    candidate.paragraphs === undefined &&
    typeof candidate.world_paragraph === 'string'
  ) {
    candidate.paragraphs = { world_paragraph: candidate.world_paragraph };
    delete candidate.world_paragraph;
  } else if (type === 'premarket' && typeof candidate.paragraphs === 'string') {
    candidate.paragraphs = { world_paragraph: candidate.paragraphs };
  }
  return candidate;
}

@Injectable()
export class MarketReportsService {
  private readonly logger = new Logger(MarketReportsService.name);
  constructor(
    private readonly repository: ReportsRepository,
    @Inject(MARKET_REPORT_INPUT) private readonly input: MarketReportInputPort,
    @Optional() @Inject(MARKET_REPORT_AI) private readonly ai?: MarketAiPort,
  ) {}

  async getLatest(type: ReportType): Promise<MarketReport> {
    const row = await this.repository.latest(type);
    if (!row)
      throw new NotFoundException({
        code: 'REPORT_NOT_FOUND',
        message: 'Chưa có báo cáo đã công bố',
      });
    return row;
  }

  async getByDate(type: ReportType, sessionDate: string): Promise<MarketReport> {
    const row = await this.repository.byDate(type, sessionDate);
    if (!row)
      throw new NotFoundException({
        code: 'REPORT_NOT_FOUND',
        message: `Không có báo cáo cho ngày ${sessionDate}`,
      });
    return row;
  }

  async list(type: ReportType, limit: number): Promise<MarketReport[]> {
    return this.repository.list(type, limit);
  }

  async generate(
    type: ReportType,
    sessionDate = currentOrPreviousTradingDate(),
  ): Promise<MarketReportGenerationResult> {
    const started = Date.now();
    const reserved = await this.repository.reserve(
      type,
      sessionDate,
      type === 'daily' ? 'eod' : type,
    );
    if (!reserved) {
      const existing = await this.repository.state(type, sessionDate);
      if (existing?.generationStatus === 'published') {
        return {
          session_date: sessionDate,
          session_type: existing.sessionType,
          valid: true,
          persisted: true,
          memory_loaded: true,
          attempts: 0,
          errors: [],
          model: String(existing.meta?.model ?? ''),
          generation_time_ms: 0,
        };
      }
      throw new ServiceUnavailableException({
        code: 'REPORT_GENERATION_IN_PROGRESS',
        message: 'Báo cáo đang được sinh',
      });
    }
    let attempts = 0;
    const errors: string[] = [];
    let model = '';
    try {
      const payload = await this.input.buildPayload(type, sessionDate);
      const sessionType = classifySession(payload);
      let output: JsonObject | null = null;
      for (const attempt of [1, 2, 3]) {
        attempts = attempt;
        const prompt = buildReportPrompts(type, payload, errors);
        const response = this.ai
          ? await this.ai.complete({ ...prompt, temperature: 0.2, responseFormat: 'json' })
          : {
              content: JSON.stringify(deterministicOutput(payload, type)),
              model: 'deterministic-input',
            };
        model = response.model;
        try {
          const checked = validateMarketReport(
            normalizeCandidate(parseAiJson(response.content), type),
            payload,
            type,
          );
          if (!checked.output || checked.errors.length) {
            errors.splice(0, errors.length, ...checked.errors);
            continue;
          }
          output = checked.output as unknown as JsonObject;
          break;
        } catch (error) {
          errors.splice(
            0,
            errors.length,
            error instanceof Error ? error.message : 'Invalid report output',
          );
        }
      }
      if (!output) throw new Error(errors.join('; ') || 'Không thể xác thực báo cáo');
      const visuals = buildReportVisuals(payload, type);
      // Provenance is owned by the input pipeline, never by generated prose.
      output.meta = {
        ...(output.meta && typeof output.meta === 'object' && !Array.isArray(output.meta)
          ? output.meta
          : {}),
        // Numeric visuals are copied from the captured snapshot, never accepted
        // from an AI response.
        charts: visuals.charts,
        pulse: visuals.pulse,
        input_hash: payload.meta.input_hash ?? null,
        data_quality: payload.data_quality,
        snapshot_captured_at: payload.meta.snapshot_captured_at ?? null,
      };
      await this.repository.publish(type, sessionDate, sessionType, output as never, {
        model,
        attempts,
        generationTimeMs: Date.now() - started,
      });
      return {
        session_date: sessionDate,
        session_type: sessionType,
        valid: true,
        persisted: true,
        memory_loaded: Boolean(payload.memory_context),
        attempts,
        errors: [],
        model,
        generation_time_ms: Date.now() - started,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Report generation failed';
      this.logger.error(message);
      await this.repository.fail(type, sessionDate, message);
      throw error;
    }
  }
}
