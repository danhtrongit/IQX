import { parentPort } from 'node:worker_threads';

import {
  executeBacktestJob,
  serializeJobError,
  type BacktestJob,
} from './strategy-backtests.jobs.js';

if (!parentPort) throw new Error('Strategy backtest worker requires a parent port');

parentPort.on('message', (job: BacktestJob) => {
  try {
    parentPort!.postMessage({ ok: true, output: executeBacktestJob(job) });
  } catch (error) {
    parentPort!.postMessage({ ok: false, error: serializeJobError(error) });
  }
});
