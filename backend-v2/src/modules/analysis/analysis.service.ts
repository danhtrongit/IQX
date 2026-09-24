import { createHash, randomUUID } from 'node:crypto';
import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../../platform/database/index.js';
import { RedisService } from '../../platform/redis/index.js';
import { MarketDataService } from '../market-data/market-data.service.js';
import { VietcapInsightProvider } from '../market-extended/vietcap-insight.provider.js';
import { VietcapOverviewProvider } from '../market-extended/vietcap-overview.provider.js';
import { AiNewsProvider } from '../market-extended/ai-news.provider.js';
import { FinancialsService } from '../financials/financials.service.js';
import { buildBctcPayload } from '../financials/bctc.js';
import { assembleDashboard } from '../financials/dashboard.js';
import { AiProviderService } from './ai-provider.service.js';
import { promptFor, type AnalysisPromptKind } from './prompts.js';
import { buildInsightResponse } from './insight-response.js';
import type {
  DashboardAnalyze,
  IndustryAnalyze,
  IndustryBatchAnalyze,
  InsightAnalyze,
} from './analysis.schemas.js';

type Json = Record<string, unknown>;
type CacheValue = { value: Json; expiresAt: number };

const localCache = new Map<string, CacheValue>();
const inFlight = new Map<string, Promise<Json>>();
const NUMBER_TOKEN = /-?\d[\d,]*\.?\d*/g;
const NUMBER_SCALES = [1, 0.01, 100, 1e9, 1e-9, 1e6] as const;
const BANNED_FINANCIAL_LANGUAGE =
  /khuy[ếe]n ngh[ịi]|\bmua\b|\bb[áa]n\b|\bgi[ữu] (?:m[ãa]|c[ổo])|\bbuy\b|\bsell\b|\bhold\b|target price|gi[áa] m[ụu]c ti[êe]u/i;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Json)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function hash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex').slice(0, 32);
}

function cleanSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function parseJsonObject(text: string): Json | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const value = JSON.parse(cleaned) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const value = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
      return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
    } catch {
      return null;
    }
  }
}

function asRows(value: unknown): Json[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Json => !!item && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}

function allowedNumbers(value: unknown): Set<number> {
  const allowed = new Set<number>();
  const walk = (item: unknown): void => {
    if (typeof item === 'number' && Number.isFinite(item)) {
      allowed.add(Number(item.toFixed(4)));
      allowed.add(Number((item * 100).toFixed(2)));
    } else if (Array.isArray(item)) item.forEach(walk);
    else if (item && typeof item === 'object') Object.values(item as Json).forEach(walk);
  };
  walk(value);
  return allowed;
}

function tokenCandidates(token: string): number[] {
  return [token.replaceAll(',', ''), token.replaceAll('.', '').replace(',', '.')]
    .map(Number)
    .filter(Number.isFinite);
}

function closeToAllowed(value: number, allowed: Set<number>): boolean {
  if (Number.isInteger(value) && value >= 1990 && value <= 2100) return true;
  return [...allowed].some(
    (candidate) =>
      Math.abs(value - candidate) <= 0.05 ||
      (candidate !== 0 && Math.abs(value - candidate) / Math.abs(candidate) <= 0.02),
  );
}

function validateFinancialText(text: string, payload: unknown): void {
  if (!text.trim())
    throw new BadGatewayException({
      code: 'AI_INVALID_OUTPUT',
      message: 'AI trả về nội dung trống',
    });
  if (BANNED_FINANCIAL_LANGUAGE.test(text))
    throw new BadGatewayException({
      code: 'AI_POLICY_VIOLATION',
      message: 'AI trả về khuyến nghị giao dịch bị cấm',
    });
  const allowed = allowedNumbers(payload);
  for (const token of text.match(NUMBER_TOKEN) ?? []) {
    const valid = tokenCandidates(token).some((candidate) =>
      NUMBER_SCALES.some((scale) => closeToAllowed(candidate * scale, allowed)),
    );
    if (!valid)
      throw new BadGatewayException({
        code: 'AI_FABRICATED_NUMBER',
        message: `AI trả về số không có trong dữ liệu đầu vào: ${token}`,
      });
  }
}

function objectValue(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function requireStrings(value: Json, keys: readonly string[], label: string): void {
  for (const key of keys) {
    if (typeof value[key] !== 'string' || !(value[key] as string).trim()) {
      throw new BadGatewayException({
        code: 'AI_INVALID_OUTPUT',
        message: `${label}.${key} thiếu hoặc không phải chuỗi`,
      });
    }
  }
}

@Injectable()
export class AnalysisService {
  constructor(
    private readonly ai: AiProviderService,
    private readonly market: MarketDataService,
    private readonly overview: VietcapOverviewProvider,
    private readonly insightProvider: VietcapInsightProvider,
    private readonly news: AiNewsProvider,
    private readonly financials: FinancialsService,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async dashboard(input: DashboardAnalyze, userId: string, force = false): Promise<Json> {
    const payload = await this.dashboardPayload(input.language);
    return this.runText('dashboard', 'all', input.language, payload, input.include_payload, force);
  }

  async industry(input: IndustryAnalyze, userId: string, force = false): Promise<Json> {
    const payload = await this.industryPayload(input.icb_code, input.language);
    const result = await this.runText(
      'industry',
      String(input.icb_code),
      input.language,
      payload,
      input.include_payload,
      force,
    );
    return { ...result, icb_code: input.icb_code };
  }

  async industryBatch(input: IndustryBatchAnalyze, userId: string): Promise<Json> {
    const unique = [...new Set(input.icb_codes)];
    const results = await Promise.all(
      unique.map(async (icbCode) => {
        try {
          return await this.industry({ ...input, icb_code: icbCode }, userId);
        } catch (error) {
          const status = error instanceof Error ? error.message : 'AI request failed';
          return { icb_code: icbCode, error: status };
        }
      }),
    );
    return {
      results: input.icb_codes.map(
        (code) =>
          results.find((item) => item.icb_code === code) ?? { icb_code: code, error: 'unknown' },
      ),
    };
  }

  async insight(input: InsightAnalyze, userId: string, force = false): Promise<Json> {
    const symbol = cleanSymbol(input.symbol);
    const payload = await this.insightPayload(symbol, input.language);
    const previous = await this.previousInsight(symbol);
    const enriched = { ...payload, previousInsight: previous };
    const prompt = promptFor('insight');
    const inputHash = hash(enriched);
    const key = this.key('insight', `${symbol}:${input.language}`, prompt.version, inputHash);
    if (!force) {
      const cached = await this.getCache(key);
      if (cached) {
        const result = this.normalizeCachedInsight(cached, symbol, payload, previous);
        return input.include_payload ? { ...result, payload } : result;
      }
    }
    const result = await this.runDedup(key, async () => {
      const completion = await this.completeJson(prompt.text, JSON.stringify(enriched), true);
      const normalized = this.normalizeInsight(
        completion.value,
        symbol,
        payload,
        completion.model,
        previous === null,
      );
      // Persist the provider schema (L1..L6), which is the exact previous-session
      // context expected by the prompt. The API projection is cached separately.
      await this.saveInsight(symbol, completion.value);
      await this.setCache(key, normalized, 1_800);
      return normalized;
    });
    const response = this.normalizeCachedInsight(result, symbol, payload, previous);
    return input.include_payload ? { ...response, payload } : response;
  }

  async bctc(
    symbol: string,
    termType: 1 | 2,
    language: 'vi' | 'en',
    userId: string,
    force = false,
  ): Promise<Json> {
    const normalized = cleanSymbol(symbol);
    const snapshot = await this.financials.snapshot(normalized, termType);
    const payload = {
      symbol: normalized,
      term_type: termType,
      language,
      bctc: buildBctcPayload(
        snapshot.statements.balance_sheet,
        snapshot.statements.income_statement,
        snapshot.statements.cash_flow,
        snapshot.ratioRows,
      ),
      source_url: snapshot.sourceUrl,
    };
    const prompt = promptFor('bctc');
    const key = this.key(
      'bctc',
      `${normalized}:${termType}:${language}`,
      prompt.version,
      hash(payload),
    );
    if (!force) {
      const cached = await this.getCache(key);
      if (cached) return cached;
    }
    return this.runDedup(key, async () => {
      const completion = await this.completeJson(prompt.text, JSON.stringify(payload), true);
      const memo = typeof completion.value.memo === 'string' ? completion.value.memo : '';
      const modulesRaw =
        completion.value.modules && typeof completion.value.modules === 'object'
          ? (completion.value.modules as Json)
          : {};
      const modules = Object.fromEntries(
        Object.entries(modulesRaw)
          .filter(([, value]) => typeof value === 'string')
          .map(([keyName, value]) => [keyName, value]),
      );
      if (!memo && !Object.keys(modules).length)
        throw new BadGatewayException({
          code: 'AI_INVALID_OUTPUT',
          message: 'AI BCTC không đúng schema',
        });
      validateFinancialText([memo, ...Object.values(modules)].join('\n'), payload.bctc);
      const result: Json = {
        type: 'bctc',
        input: { symbol: normalized, term_type: termType, language },
        analysis: { memo, modules },
        model: completion.model,
        prompt_version: prompt.version,
        input_hash: hash(payload),
        as_of: new Date().toISOString(),
      };
      await this.setCache(key, result, 604_800);
      return result;
    });
  }

  async bctcNarrative(
    symbol: string,
    termType: 1 | 2,
    language: 'vi' | 'en',
    userId: string,
    force = false,
  ): Promise<Json> {
    const normalized = cleanSymbol(symbol);
    const snapshot = await this.financials.snapshot(normalized, termType);
    const payload = {
      symbol: normalized,
      term_type: termType,
      language,
      ...assembleDashboard(
        snapshot.statements.balance_sheet,
        snapshot.statements.income_statement,
        snapshot.statements.cash_flow,
        snapshot.ratioRows,
        snapshot.overview,
        normalized,
      ),
      source_url: snapshot.sourceUrl,
    };
    const prompt = promptFor('bctc-narrative');
    const key = this.key(
      'bctc-narrative',
      `${normalized}:${termType}`,
      prompt.version,
      hash(payload),
    );
    if (!force) {
      const cached = await this.getCache(key);
      if (cached) return { data: cached };
    }
    const result = await this.runDedup(key, async () => {
      const completion = await this.completeJson(prompt.text, JSON.stringify(payload), true);
      const validated = this.validateNarrative(completion.value, payload.template, payload);
      await this.setCache(key, validated, 604_800);
      return validated;
    });
    return { data: result };
  }

  private async runText(
    kind: AnalysisPromptKind,
    identifier: string,
    language: string,
    payload: Json,
    includePayload: boolean,
    force: boolean,
  ): Promise<Json> {
    const prompt = promptFor(kind);
    const inputHash = hash(payload);
    const key = this.key(kind, `${identifier}:${language}`, prompt.version, inputHash);
    if (!force) {
      const cached = await this.getCache(key);
      if (cached) return includePayload ? { ...cached, payload } : cached;
    }
    const result = await this.runDedup(key, async () => {
      const completion = await this.ai.complete(prompt.text, JSON.stringify(payload), {
        temperature: 0.2,
        maxTokens: kind === 'bctc' ? 2_500 : 3_000,
      });
      const value: Json = {
        type: kind,
        input: { identifier, language },
        analysis: completion.content,
        model: completion.model,
        prompt_version: prompt.version,
        input_hash: inputHash,
        as_of: new Date().toISOString(),
      };
      await this.setCache(key, value, kind === 'bctc' ? 604_800 : 1_800);
      return value;
    });
    return includePayload ? { ...result, payload } : result;
  }

  private async completeJson(
    system: string,
    user: string,
    json: boolean,
  ): Promise<{ value: Json; model: string }> {
    let feedback = '';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const completion = await this.ai.complete(system, `${user}${feedback}`, {
        temperature: 0.1,
        maxTokens: 5_000,
        json,
      });
      const value = parseJsonObject(completion.content);
      if (value) return { value, model: completion.model };
      feedback =
        '\n\nPrevious output was invalid JSON. Return only the required JSON object, with no markdown or prose.';
    }
    throw new BadGatewayException({
      code: 'AI_INVALID_OUTPUT',
      message: 'Dịch vụ AI trả về JSON không hợp lệ',
    });
  }

  private normalizeInsight(
    value: Json,
    symbol: string,
    payload: Json,
    model: string,
    first = false,
  ): Json {
    const layers = this.validateInsight(value);
    const updatedAt = new Date().toISOString();
    return {
      ...buildInsightResponse(
        layers,
        { ...payload, symbol },
        this.header(payload),
        updatedAt,
        first,
      ),
      dataSummary: { model, as_of: updatedAt, input_hash: hash(payload) },
    };
  }

  private normalizeCachedInsight(
    cached: Json,
    symbol: string,
    payload: Json,
    previous: Json | null,
  ): Json {
    const briefing = objectValue(cached.briefing);
    const layers = objectValue(cached.layers);
    if (
      briefing &&
      Array.isArray(briefing.narrative) &&
      layers &&
      ['L1', 'L2', 'L3', 'L4', 'L5'].every((key) => Array.isArray(objectValue(layers[key])?.fields))
    )
      return cached;
    // Previous v2 cache entries contain the raw L6 and L1–L5 model objects.
    // Project them in place on read; preserve their original timestamp and never call AI.
    const raw = cached.L6 ? cached : { ...layers, L6: briefing };
    const validated = this.validateInsight(raw);
    const updatedAt =
      typeof cached.updatedAt === 'string' ? cached.updatedAt : new Date().toISOString();
    return {
      ...buildInsightResponse(
        validated,
        { ...payload, symbol },
        this.header(payload),
        updatedAt,
        previous === null,
      ),
      ...(cached.dataSummary ? { dataSummary: cached.dataSummary } : {}),
    };
  }

  private validateInsight(value: Json): Json {
    const specs: Readonly<Record<string, readonly string[]>> = {
      L1: ['xu_huong', 'statusLabel', 'diff'],
      L2: ['thanh_khoan', 'statusLabel', 'diff'],
      L3: ['khoi_ngoai', 'tu_doanh', 'statusLabel', 'diff'],
      L4: ['noi_bo', 'statusLabel', 'diff'],
      L5: ['tong_quan', 'statusLabel', 'diff'],
      L6: ['trend', 'status', 'timeframe', 'narrative', 'diff', 'recommendation'],
    };
    const layers: Json = {};
    for (const [key, fields] of Object.entries(specs)) {
      const layer = objectValue(value[key]);
      if (!layer)
        throw new BadGatewayException({
          code: 'AI_INVALID_OUTPUT',
          message: `AI insight thiếu object ${key}`,
        });
      requireStrings(layer, fields, key);
      layers[key] = layer;
    }
    const l5 = layers.L5 as Json;
    for (const key of ['L1', 'L2', 'L3', 'L4', 'L5']) {
      const label = (layers[key] as Json).statusLabel as string;
      const valid: Record<string, readonly string[]> = {
        L1: ['Rất yếu', 'Yếu', 'Trung bình', 'Mạnh', 'Rất mạnh'],
        L2: ['Rất yếu', 'Yếu', 'Bình thường', 'Mạnh', 'Rất mạnh'],
        L3: ['Cảnh báo mạnh', 'Cảnh báo nhẹ', 'Trung tính', 'Hỗ trợ nhẹ', 'Hỗ trợ mạnh'],
        L4: ['Cảnh báo mạnh', 'Cảnh báo nhẹ', 'Trung tính', 'Hỗ trợ nhẹ', 'Hỗ trợ mạnh'],
        L5: ['Rất tiêu cực', 'Tiêu cực', 'Trung tính', 'Tích cực', 'Rất tích cực'],
      };
      if (!valid[key]?.includes(label))
        throw new BadGatewayException({
          code: 'AI_INVALID_OUTPUT',
          message: `${key}.statusLabel không hợp lệ`,
        });
    }
    for (const field of ['tin_material', 'tin_filler']) {
      if (!Array.isArray(l5[field]))
        throw new BadGatewayException({
          code: 'AI_INVALID_OUTPUT',
          message: `L5.${field} phải là mảng`,
        });
      for (const [index, item] of l5[field].entries()) {
        const news = objectValue(item);
        if (!news || typeof news.tieu_de !== 'string' || typeof news.tag !== 'string')
          throw new BadGatewayException({
            code: 'AI_INVALID_OUTPUT',
            message: `L5.${field}[${index}] không đúng schema`,
          });
      }
    }
    const l6 = layers.L6 as Json;
    const observations = objectValue(l6.observations);
    if (!observations)
      throw new BadGatewayException({
        code: 'AI_INVALID_OUTPUT',
        message: 'L6.observations phải là object',
      });
    requireStrings(
      observations,
      ['liquidity', 'moneyFlow', 'insider', 'news', 'supportResistance'],
      'L6.observations',
    );
    if (!Array.isArray(l6.watchLevels))
      throw new BadGatewayException({
        code: 'AI_INVALID_OUTPUT',
        message: 'L6.watchLevels phải là mảng',
      });
    for (const [index, item] of l6.watchLevels.entries()) {
      const level = objectValue(item);
      if (!level)
        throw new BadGatewayException({
          code: 'AI_INVALID_OUTPUT',
          message: `L6.watchLevels[${index}] phải là object`,
        });
      requireStrings(level, ['tag', 'description'], `L6.watchLevels[${index}]`);
    }
    const recommendation = l6.recommendation as string;
    if (
      !new Set(['Chờ điểm mua', 'Có thể mua thử', 'Quan sát thêm', 'Nên giảm bớt', 'Bán bớt']).has(
        recommendation,
      )
    )
      throw new BadGatewayException({
        code: 'AI_INVALID_OUTPUT',
        message: 'L6.recommendation không hợp lệ',
      });
    return layers;
  }

  private header(payload: Json): Json {
    const board = asRows(payload.price_board)[0] ?? {};
    const overview = (
      payload.company_overview && typeof payload.company_overview === 'object'
        ? payload.company_overview
        : {}
    ) as Json;
    const numberOrNull = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };
    const price = numberOrNull(
      board.close_price ?? board.matchedPrice ?? board.close ?? board.price,
    );
    const ref = numberOrNull(
      board.reference_price ?? board.refPrice ?? board.referencePrice ?? board.ref_price,
    );
    const volume = numberOrNull(board.total_volume ?? board.totalVolume ?? board.nmTotalTradedQty);
    const volumeLabel =
      volume === null
        ? ''
        : volume >= 1_000_000
          ? `${(volume / 1_000_000).toFixed(1)}M`
          : volume >= 1_000
            ? `${(volume / 1_000).toFixed(1)}K`
            : `${volume}`;
    return {
      symbol: payload.symbol,
      sector: overview.sector ?? overview.icb_name_2 ?? null,
      indexGroup:
        overview.indexGroup ?? overview.stock_type ?? overview.exchange ?? board.exchange ?? null,
      price,
      changePercent: ref !== null && ref > 0 && price !== null ? ((price - ref) / ref) * 100 : null,
      high: numberOrNull(board.high_price ?? board.high ?? board.highPrice),
      low: numberOrNull(board.low_price ?? board.low ?? board.lowPrice),
      volume: volumeLabel,
      isLive: Object.keys(board).length > 0,
    };
  }

  private validateNarrative(value: Json, template: string, payload?: Json): Json {
    const forbidden = [
      'altman',
      'z-score',
      'piotroski',
      'f-score',
      'beneish',
      'm-score',
      'dupont',
      'sloan',
      'accrual',
      'nên mua',
      'nên bán',
      'nên giữ',
      'khuyến nghị',
    ];
    const text = JSON.stringify(value).toLowerCase();
    if (forbidden.some((token) => text.includes(token)))
      throw new BadGatewayException({
        code: 'AI_POLICY_VIOLATION',
        message: 'AI narrative vi phạm chính sách nội dung',
      });
    const story = value.story;
    const blocks = value.blocks;
    const storyObject = story && typeof story === 'object' ? (story as Json) : null;
    const paragraphs = storyObject?.paragraphs;
    if (
      !value.verdict_oneliner ||
      !storyObject ||
      !Array.isArray(paragraphs) ||
      paragraphs.length !== 3 ||
      !blocks ||
      typeof blocks !== 'object'
    )
      throw new BadGatewayException({
        code: 'AI_INVALID_OUTPUT',
        message: 'AI narrative không đúng schema',
      });
    const required =
      template === 'B'
        ? ['valuation', 'financial', 'earning', 'efficiency', 'asset_quality', 'dividend']
        : ['valuation', 'financial', 'business', 'cashflow', 'health', 'dividend'];
    for (const key of required)
      if (!(
        (blocks as Json)[key] &&
        typeof (blocks as Json)[key] === 'object' &&
        String(((blocks as Json)[key] as Json).answer ?? '').trim()
      ))
        throw new BadGatewayException({
          code: 'AI_INVALID_OUTPUT',
          message: 'AI narrative thiếu khối bắt buộc',
        });
    if (payload) validateFinancialText(JSON.stringify(value), payload);
    return value;
  }

  private async dashboardPayload(language: string): Promise<Json> {
    const [index, sectors, breadth, foreign, proprietary, news] = await Promise.allSettled([
      this.overview.marketIndex(['VNINDEX', 'VN30']),
      this.overview.sectorsAllocation('ALL', 'ONE_DAY'),
      this.overview.breadth('EMA50', 'HSX,HNX,UPCOM', 'Y1'),
      this.overview.foreign({ group: 'ALL', timeFrame: 'ONE_DAY' }),
      this.overview.proprietary('ALL', 'ONE_DAY'),
      this.news.list('business', { page: 1, pageSize: 10 }),
    ]);
    const unwrap = (item: PromiseSettledResult<{ data: unknown }>) =>
      item.status === 'fulfilled' ? item.value.data : null;
    return {
      language,
      as_of: new Date().toISOString(),
      market_index: unwrap(index),
      sectors_allocation: unwrap(sectors),
      breadth: unwrap(breadth),
      foreign: unwrap(foreign),
      proprietary: unwrap(proprietary),
      news: unwrap(news),
    };
  }

  private async industryPayload(icbCode: number, language: string): Promise<Json> {
    const [day, week, month, info, ranking, market] = await Promise.allSettled([
      this.overview.sectorDetail(icbCode, 'ALL', 'ONE_DAY'),
      this.overview.sectorDetail(icbCode, 'ALL', 'ONE_WEEK'),
      this.overview.sectorDetail(icbCode, 'ALL', 'ONE_MONTH'),
      this.insightProvider.sectorInformation(2),
      this.insightProvider.sectorRanking(2, 3, 3),
      this.overview.marketIndex(['VNINDEX']),
    ]);
    const unwrap = (item: PromiseSettledResult<{ data: unknown }>) =>
      item.status === 'fulfilled' ? item.value.data : null;
    return {
      language,
      icb_code: icbCode,
      as_of: new Date().toISOString(),
      sector_detail_1d: unwrap(day),
      sector_detail_1w: unwrap(week),
      sector_detail_1m: unwrap(month),
      sector_information: unwrap(info),
      sector_ranking: unwrap(ranking),
      market_index: unwrap(market),
    };
  }

  private async insightPayload(symbol: string, language: string): Promise<Json> {
    const [board, overview, chart, history, foreign, proprietary, news] = await Promise.allSettled([
      this.market.priceBoard([symbol]),
      this.market.companyOverview(symbol),
      this.market.priceChart(symbol, 30),
      this.market.tradingHistory(symbol, { resolution: '1D', page: 0, size: 30 }),
      this.market.foreignTrade(symbol, undefined, undefined, 30),
      this.market.proprietary(symbol, { resolution: '1D', page: 0, size: 30 }),
      this.market.companyNews(symbol),
    ]);
    const unwrap = (item: PromiseSettledResult<{ data: unknown }>) =>
      item.status === 'fulfilled' ? item.value.data : null;
    return {
      symbol,
      language,
      as_of: new Date().toISOString(),
      price_board: unwrap(board),
      company_overview: unwrap(overview),
      ohlcv_30: unwrap(chart),
      trading_history: unwrap(history),
      foreign_trade: unwrap(foreign),
      proprietary: unwrap(proprietary),
      news: unwrap(news),
    };
  }

  private key(kind: string, identifier: string, promptVersion: string, inputHash: string): string {
    return this.redis.key('ai', kind, identifier, this.ai.model(), promptVersion, inputHash);
  }

  private async getCache(key: string): Promise<Json | null> {
    const local = localCache.get(key);
    if (local && local.expiresAt > Date.now()) return local.value;
    localCache.delete(key);
    if (!this.redis.isEnabled()) return null;
    try {
      return await this.redis.execute(async (client) => {
        const raw = await client.get(key);
        return raw ? (JSON.parse(raw) as Json) : null;
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'AI_CACHE_UNAVAILABLE',
        message: 'Bộ nhớ đệm AI tạm thời không khả dụng',
      });
    }
  }

  private async setCache(key: string, value: Json, ttlSeconds: number): Promise<void> {
    if (this.redis.isEnabled()) {
      try {
        await this.redis.execute((client) =>
          client.set(key, JSON.stringify(value), 'EX', ttlSeconds),
        );
      } catch {
        throw new ServiceUnavailableException({
          code: 'AI_CACHE_UNAVAILABLE',
          message: 'Không thể lưu kết quả AI vào bộ nhớ đệm',
        });
      }
    }
    localCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1_000 });
  }

  private async runDedup(key: string, task: () => Promise<Json>): Promise<Json> {
    const existing = inFlight.get(key);
    if (existing) return existing;
    const pending = this.runDistributedDedup(key, task).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  }

  private async runDistributedDedup(key: string, task: () => Promise<Json>): Promise<Json> {
    let lockAcquired = false;
    const lockKey = `${key}:lock`;
    const lockToken = randomUUID();
    if (this.redis.isEnabled()) {
      try {
        const status = await this.redis.execute((client) =>
          client.set(lockKey, lockToken, 'EX', 180, 'NX'),
        );
        lockAcquired = status === 'OK';
        if (!lockAcquired) {
          for (let attempt = 0; attempt < 50; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            const cached = await this.getCache(key);
            if (cached) return cached;
          }
          throw new ServiceUnavailableException({
            code: 'AI_GENERATION_IN_PROGRESS',
            message: 'Một yêu cầu AI giống hệt đang được xử lý',
          });
        }
      } catch (error) {
        if (error instanceof ServiceUnavailableException) throw error;
        throw new ServiceUnavailableException({
          code: 'AI_DEDUP_UNAVAILABLE',
          message: 'Không thể bảo đảm chống tạo trùng kết quả AI',
        });
      }
    }
    try {
      return await task();
    } finally {
      if (lockAcquired) {
        try {
          await this.redis.execute((client) =>
            client.eval(
              'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
              1,
              lockKey,
              lockToken,
            ),
          );
        } catch {
          /* The lock expires automatically; never delete another owner's lock. */
        }
      }
    }
  }

  private async previousInsight(symbol: string): Promise<Json | null> {
    try {
      const rows = await this.database.query<Json>(
        'select payload from ai_insight_history where symbol = $1 order by session_date desc limit 1',
        [symbol],
      );
      return (rows[0]?.payload as Json) ?? null;
    } catch {
      throw new ServiceUnavailableException({
        code: 'AI_HISTORY_UNAVAILABLE',
        message: 'Không thể đọc lịch sử AI insight',
      });
    }
  }

  private async saveInsight(symbol: string, result: Json): Promise<void> {
    try {
      await this.database.query(
        'insert into ai_insight_history (id, symbol, session_date, payload) values (gen_random_uuid(), $1, current_date, $2::jsonb) on conflict (symbol, session_date) do update set payload = excluded.payload, updated_at = now()',
        [symbol, JSON.stringify(result)],
      );
    } catch {
      throw new ServiceUnavailableException({
        code: 'AI_HISTORY_PERSIST_FAILED',
        message: 'Không thể lưu lịch sử AI insight',
      });
    }
  }
}
