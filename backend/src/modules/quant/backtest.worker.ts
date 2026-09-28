import { parentPort } from 'node:worker_threads';
import { buildFrame } from './conditions.js';
import { runBacktest, type RiskConfig } from './backtest.engine.js';
import { ohlcvFromRecords, type OhlcvRecord } from './indicators.js';
import type { Combination } from './conditions.js';

type WorkerRequest = {
  data: OhlcvRecord[];
  buy: Combination;
  sell: Combination;
  risk: RiskConfig;
  capital: number;
  startIndex: number;
};

if (!parentPort) throw new Error('Backtest worker requires a parent port');

parentPort.on('message', (request: WorkerRequest) => {
  try {
    const data = ohlcvFromRecords(request.data);
    const result = runBacktest(
      data,
      buildFrame(data),
      request.buy,
      request.sell,
      request.risk,
      request.capital,
      request.startIndex,
    );
    parentPort!.postMessage({ ok: true, result });
  } catch (error) {
    parentPort!.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
