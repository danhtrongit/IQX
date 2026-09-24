import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { parseAiJson } from '../reports/report-validator.js';
import { PORTFOLIO_AI, type PortfolioAiPort, type PortfolioReport } from './portfolio.types.js';
import { PortfolioRepository } from './portfolio.repository.js';
import { buildAnalysis } from './portfolio.math.js';
import { portfolioNarrativeSchema } from './portfolio.schemas.js';

const LAYER_KEYS = [
  'overview',
  'performance',
  'allocation',
  'stress',
  'risk',
  'attribution',
  'quality',
  'behavior',
];

function deterministicNarrative(analysis: Record<string, unknown>): Record<string, unknown> {
  const layers = Object.fromEntries(
    LAYER_KEYS.map((key) => [key, `Số liệu lớp ${key} được tính trực tiếp từ snapshot danh mục.`]),
  );
  const concentration = (analysis.concentration ?? {}) as Record<string, unknown>;
  const top1 = typeof concentration.top1 === 'number' ? concentration.top1 : 0;
  const performance = (analysis.performance ?? {}) as Record<string, unknown>;
  const excess = typeof performance.excess_return === 'number' ? performance.excess_return : null;
  layers.performance =
    excess === null
      ? 'Chưa đủ dữ liệu lịch sử được căn chỉnh để so sánh với chỉ số tham chiếu.'
      : `Lợi suất danh mục vượt/ thấp hơn chỉ số tham chiếu ${excess}; đây là phép tính từ giá trị đầu vào.`;
  layers.concentration = `Tỷ trọng vị thế lớn nhất là ${top1}; theo dõi ngưỡng này trong phiên kế tiếp.`;
  return {
    title: 'Tổng quan danh mục',
    verdict: 'Theo dõi theo số liệu thực tế',
    lede: 'Báo cáo được xây dựng từ trạng thái lệnh và vị thế đã khớp.',
    layers,
    actions: [
      {
        title: 'Theo dõi tỷ trọng',
        detail: `Kiểm tra tỷ trọng lớn nhất hiện là ${top1} sau phiên giao dịch tiếp theo.`,
      },
    ],
    watch: [],
    closing: 'Đánh giá lại khi có dữ liệu phiên mới.',
    progress_text: '',
    low_data_note:
      excess === null
        ? 'Một số lớp chỉ được trả về null khi thiếu lịch sử giá, benchmark hoặc dữ liệu cơ bản.'
        : '',
    meta: { deterministic: true, score: analysis.scores },
  };
}

@Injectable()
export class PortfolioManagerService {
  constructor(
    private readonly repository: PortfolioRepository,
    @Optional() @Inject(PORTFOLIO_AI) private readonly ai?: PortfolioAiPort,
  ) {}

  async get(userId: string): Promise<PortfolioReport> {
    const accountId = await this.repository.accountId(userId);
    const cached = await this.repository.latest(accountId);
    if (!cached)
      throw new NotFoundException({
        code: 'PORTFOLIO_REPORT_NOT_FOUND',
        message: 'Chưa có báo cáo phân tích danh mục',
      });
    return cached;
  }

  async generate(userId: string): Promise<PortfolioReport> {
    const input = await this.repository.input(userId);
    const cached = await this.repository.forDate(input.accountId, input.asOf);
    if (cached) return cached;
    const analysis = buildAnalysis(input);
    let narrative: Record<string, unknown> | null = null;
    let model = 'deterministic-input';
    if (this.ai) {
      const response = await this.ai.complete({
        systemPrompt: 'Trả về JSON narrative danh mục đúng schema; chỉ dùng số liệu payload.',
        userPrompt: JSON.stringify(analysis),
        temperature: 0.2,
        responseFormat: 'json',
      });
      model = response.model;
      const parsed = portfolioNarrativeSchema.safeParse(parseAiJson(response.content));
      if (parsed.success) narrative = parsed.data;
    }
    narrative ??= deterministicNarrative(analysis);
    const valid = portfolioNarrativeSchema.safeParse(narrative).success;
    await this.repository.save(input.accountId, input.asOf, analysis, narrative, model, valid);
    return {
      analysis,
      narrative,
      meta: { valid, cached: false, persisted: true, model, session_date: input.asOf },
    };
  }
}
