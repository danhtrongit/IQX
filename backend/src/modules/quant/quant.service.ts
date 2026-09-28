import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { attachVnIndex, type BacktestResult, type RiskConfig } from './backtest.engine.js';
import { BacktestWorkerError, runBacktestInWorker } from './backtest.worker-runner.js';
import { factorLibraryPayload, resolveFactor } from './catalog.js';
import { validateCombination, type Combination } from './conditions.js';
import { ohlcvFromRecords } from './indicators.js';
import {
  type BacktestRunInput,
  type StrategyCreateInput,
  type StrategyUpdateInput,
} from './quant.schemas.js';
import { StrategyRepository } from './strategy.repository.js';
import { STRATEGY_TEMPLATES } from './templates.js';
import { QUANT_MARKET_DATA, type QuantMarketDataProvider } from './quant.types.js';

const FEES = { standard: [0.0015, 0.0025], low: [0.001, 0.001], none: [0, 0] } as const;
const MAX_BARS = 3_500;
function isUniqueViolation(error: unknown): boolean {
  let value: unknown = error;
  for (let depth = 0; depth < 4 && typeof value === 'object' && value; depth += 1) {
    if ('code' in value && (value as { code?: unknown }).code === '23505') return true;
    value = 'cause' in value ? (value as { cause?: unknown }).cause : undefined;
  }
  return false;
}

@Injectable()
export class QuantService {
  constructor(
    private readonly strategies: StrategyRepository,
    @Optional() @Inject(QUANT_MARKET_DATA) private readonly market?: QuantMarketDataProvider,
  ) {}

  catalog(): Record<string, unknown> {
    return {
      factors: factorLibraryPayload(),
      templates: STRATEGY_TEMPLATES,
      risk_presets: {
        stop_loss: [
          { value: 'atr', mult: 2, label: '2.0× ATR' },
          { value: 'atr', mult: 1.5, label: '1.5× ATR' },
          { value: 'atr', mult: 3, label: '3.0× ATR' },
          { value: 'fixed', pct: 0.05, label: 'Cố định 5%' },
          { value: 'none', label: 'Không có' },
        ],
        take_profit: [
          { value: null, label: 'Không (theo signal)' },
          { value: 0.1, label: '10%' },
          { value: 0.15, label: '15%' },
          { value: 0.2, label: '20%' },
        ],
        position_size: [
          { value: 'all', label: '100% vốn còn lại' },
          { value: 'half', label: '50% vốn còn lại' },
          { value: 'fixed', amount: 10_000_000, label: 'Cố định 10tr/lệnh' },
        ],
        fee: [
          { value: 'standard', label: 'Chuẩn (0.15% + 0.1%)' },
          { value: 'low', label: 'Thấp (0.10%)' },
        ],
      },
    };
  }

  async run(input: BacktestRunInput): Promise<Record<string, unknown>> {
    if (!this.market)
      throw new ServiceUnavailableException({
        code: 'MARKET_DATA_UNAVAILABLE',
        message: 'Dịch vụ dữ liệu thị trường chưa sẵn sàng',
      });
    const buy: Combination = {
      logic: input.buy.logic,
      conditions: input.buy.factors.map((item) => resolveFactor(item.id, item.value)),
    };
    const sell: Combination = {
      logic: input.sell.logic,
      conditions: input.sell.factors.map((item) => resolveFactor(item.id, item.value)),
    };
    validateCombination(buy);
    if (sell.conditions.length) validateCombination(sell);
    const [feeBuy, feeSell] = FEES[input.risk.fee];
    const risk: RiskConfig = { ...input.risk, fee_buy: feeBuy, fee_sell: feeSell };
    const history = await this.market.getHistoricalOhlcv(input.symbol, input.start, input.end, {
      warmupSessions: 300,
      maxBars: MAX_BARS,
    });
    if (!history.records.length)
      throw new NotFoundException({
        code: 'MARKET_HISTORY_NOT_FOUND',
        message: `Không có dữ liệu giá cho mã ${input.symbol}`,
      });
    if (history.records.length > MAX_BARS)
      throw new ConflictException({
        code: 'BACKTEST_BAR_LIMIT',
        message: `Dữ liệu vượt giới hạn ${MAX_BARS} phiên`,
      });
    const data = ohlcvFromRecords(history.records);
    let result: BacktestResult;
    try {
      result = await runBacktestInWorker({
        data: history.records,
        buy,
        sell,
        risk,
        capital: input.capital,
        startIndex: history.startIndex,
      });
    } catch (error) {
      if (error instanceof BacktestWorkerError) {
        if (error.code === 'BACKTEST_QUEUE_FULL')
          throw new ConflictException({ code: error.code, message: error.message });
        throw new ServiceUnavailableException({ code: error.code, message: error.message });
      }
      throw error;
    }
    try {
      const benchmark = await this.market.getHistoricalOhlcv('VNINDEX', input.start, input.end, {
        warmupSessions: 0,
        maxBars: MAX_BARS,
      });
      attachVnIndex(
        result.equity_curve,
        benchmark.records.map((item) => item.time),
        benchmark.records.map((item) => item.close),
      );
    } catch {
      /* benchmark is optional and never invalidates the strategy run */
    }
    const traded = data.time.slice(history.startIndex);
    return {
      meta: {
        symbol: input.symbol,
        start: traded[0] ?? input.start,
        end: traded.at(-1) ?? input.end,
        n_sessions: result.kpis.n_sessions,
        capital: input.capital,
        data_quality: {
          source: history.source ?? 'unknown',
          source_priority: history.sourcePriority ?? null,
          adjusted: history.adjusted ?? false,
          skipped_rows: history.skippedRows ?? 0,
        },
        execution: {
          signal: 'bar close',
          entry: 'same close',
          settlement: 'T+2',
          gap: 'open price',
          intrabar_priority: ['stop_loss', 'take_profit'],
          lot_size: 100,
          fees: { buy: feeBuy, sell: feeSell, pnl: 'net of buy fee and sell tax' },
        },
      },
      ...result,
    };
  }

  listStrategies(userId: string) {
    return this.strategies.list(userId);
  }
  async createStrategy(userId: string, input: StrategyCreateInput) {
    try {
      return await this.strategies.create(userId, input.name, input.symbol ?? null, input.config);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException({
          code: 'STRATEGY_NAME_EXISTS',
          message: 'Đã tồn tại chiến lược cùng tên',
        });
      throw error;
    }
  }
  async updateStrategy(userId: string, id: string, input: StrategyUpdateInput) {
    try {
      const strategy = await this.strategies.update(userId, id, input);
      if (!strategy)
        throw new NotFoundException({
          code: 'STRATEGY_NOT_FOUND',
          message: 'Không tìm thấy chiến lược',
        });
      return strategy;
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException({
          code: 'STRATEGY_NAME_EXISTS',
          message: 'Đã tồn tại chiến lược cùng tên',
        });
      throw error;
    }
  }
  async deleteStrategy(userId: string, id: string): Promise<void> {
    if (!(await this.strategies.delete(userId, id)))
      throw new NotFoundException({
        code: 'STRATEGY_NOT_FOUND',
        message: 'Không tìm thấy chiến lược',
      });
  }
}
