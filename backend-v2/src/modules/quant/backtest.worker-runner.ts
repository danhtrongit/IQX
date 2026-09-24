import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import type { BacktestResult, RiskConfig } from './backtest.engine.js';
import type { Combination } from './conditions.js';
import type { OhlcvRecord } from './indicators.js';

type Request = {
  data: OhlcvRecord[];
  buy: Combination;
  sell: Combination;
  risk: RiskConfig;
  capital: number;
  startIndex: number;
};
type WorkerReply = { ok: true; result: BacktestResult } | { ok: false; error: string };

const MAX_CONCURRENT_WORKERS = 2;
const MAX_QUEUED_WORKERS = 8;
const WORKER_TIMEOUT_MS = 30_000;
let activeWorkers = 0;
const queue: Array<() => void> = [];

export class BacktestWorkerError extends Error {
  constructor(
    message: string,
    readonly code: 'BACKTEST_WORKER_FAILED' | 'BACKTEST_WORKER_TIMEOUT' | 'BACKTEST_QUEUE_FULL',
  ) {
    super(message);
    this.name = 'BacktestWorkerError';
  }
}

function drain(): void {
  while (activeWorkers < MAX_CONCURRENT_WORKERS) {
    const next = queue.shift();
    if (!next) return;
    activeWorkers += 1;
    next();
  }
}

export function runBacktestInWorker(request: Request): Promise<BacktestResult> {
  if (queue.length >= MAX_QUEUED_WORKERS)
    return Promise.reject(
      new BacktestWorkerError('Hàng đợi backtest đang đầy', 'BACKTEST_QUEUE_FULL'),
    );
  return new Promise((resolve, reject) => {
    let admitted = false;
    let timedOut = false;
    const queuedAt = Date.now();
    const admissionTimeout = setTimeout(() => {
      timedOut = true;
      if (!admitted)
        reject(
          new BacktestWorkerError('Backtest chờ quá lâu trong hàng đợi', 'BACKTEST_WORKER_TIMEOUT'),
        );
    }, WORKER_TIMEOUT_MS);
    queue.push(() => {
      admitted = true;
      clearTimeout(admissionTimeout);
      if (timedOut) {
        activeWorkers -= 1;
        drain();
        return;
      }
      let worker: Worker;
      try {
        // Test runners and embedders may launch Node with --input-type; that
        // flag is only valid for the parent eval/stdin and must not propagate
        // to a file-backed worker.
        worker = new Worker(new URL('./backtest.worker.js', import.meta.url), {
          execArgv: process.execArgv.filter((argument) => !argument.startsWith('--input-type')),
        });
      } catch (error) {
        activeWorkers -= 1;
        reject(
          new BacktestWorkerError(
            error instanceof Error ? error.message : String(error),
            'BACKTEST_WORKER_FAILED',
          ),
        );
        drain();
        return;
      }
      let settled = false;
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        void worker.terminate();
        activeWorkers -= 1;
        callback();
        drain();
      };
      const remaining = Math.max(1, WORKER_TIMEOUT_MS - (Date.now() - queuedAt));
      const timeout = setTimeout(
        () =>
          finish(() =>
            reject(
              new BacktestWorkerError(
                'Backtest vượt quá thời gian xử lý',
                'BACKTEST_WORKER_TIMEOUT',
              ),
            ),
          ),
        remaining,
      );
      worker.once('error', (error) =>
        finish(() => reject(new BacktestWorkerError(error.message, 'BACKTEST_WORKER_FAILED'))),
      );
      worker.once('message', (message: WorkerReply) => {
        if (message.ok) finish(() => resolve(message.result));
        else finish(() => reject(new BacktestWorkerError(message.error, 'BACKTEST_WORKER_FAILED')));
      });
      worker.postMessage(request);
    });
    drain();
  });
}

export const backtestWorkerConfig = {
  maxConcurrent: MAX_CONCURRENT_WORKERS,
  maxQueued: MAX_QUEUED_WORKERS,
  timeoutMs: WORKER_TIMEOUT_MS,
  workerPath: fileURLToPath(new URL('./backtest.worker.js', import.meta.url)),
} as const;
