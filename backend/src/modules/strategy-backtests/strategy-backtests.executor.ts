import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { Injectable } from '@nestjs/common';

import {
  deserializeJobError,
  executeBacktestJob,
  type BacktestJob,
  type BacktestJobOutput,
  type SerializedJobError,
} from './strategy-backtests.jobs.js';

const MAX_CONCURRENT_RUNS = 2;
const MAX_QUEUED_RUNS = 8;
const RUN_TIMEOUT_MS = 30_000;

type WorkerReply =
  { ok: true; output: BacktestJobOutput } | { ok: false; error: SerializedJobError };

export class BacktestExecutorError extends Error {
  constructor(
    message: string,
    readonly code: 'BACKTEST_QUEUE_FULL' | 'BACKTEST_TIMEOUT' | 'BACKTEST_WORKER_FAILED',
  ) {
    super(message);
    this.name = 'BacktestExecutorError';
  }
}

/**
 * Bounded runner for v2 backtest jobs: at most 2 at a time, 8 waiting, and a
 * 30s budget from admission request to result (queue wait included). Jobs run
 * in a worker thread from the compiled build so research sweeps never block
 * the API event loop; when the compiled worker is absent (tsx/vitest) the job
 * runs inline under the same concurrency bound.
 */
@Injectable()
export class StrategyBacktestExecutor {
  readonly limits = {
    maxConcurrent: MAX_CONCURRENT_RUNS,
    maxQueued: MAX_QUEUED_RUNS,
    timeoutMs: RUN_TIMEOUT_MS,
  } as const;
  private readonly workerUrl = new URL('./strategy-backtests.worker.js', import.meta.url);
  private readonly useWorker = existsSync(fileURLToPath(this.workerUrl));
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  async run(job: BacktestJob): Promise<BacktestJobOutput> {
    const deadline = Date.now() + RUN_TIMEOUT_MS;
    await this.acquire(deadline);
    try {
      return this.useWorker ? await this.inWorker(job, deadline) : executeBacktestJob(job);
    } finally {
      this.release();
    }
  }

  private acquire(deadline: number): Promise<void> {
    if (this.active < MAX_CONCURRENT_RUNS) {
      this.active += 1;
      return Promise.resolve();
    }
    if (this.waiting.length >= MAX_QUEUED_RUNS)
      return Promise.reject(
        new BacktestExecutorError('Hàng đợi backtest đang đầy.', 'BACKTEST_QUEUE_FULL'),
      );
    return new Promise((resolve, reject) => {
      const admit = (): void => {
        clearTimeout(timer);
        this.active += 1;
        resolve();
      };
      const timer = setTimeout(
        () => {
          const index = this.waiting.indexOf(admit);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(
            new BacktestExecutorError('Backtest chờ quá lâu trong hàng đợi.', 'BACKTEST_TIMEOUT'),
          );
        },
        Math.max(1, deadline - Date.now()),
      );
      this.waiting.push(admit);
    });
  }

  private release(): void {
    this.active -= 1;
    this.waiting.shift()?.();
  }

  private inWorker(job: BacktestJob, deadline: number): Promise<BacktestJobOutput> {
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        // Test runners and embedders may launch Node with --input-type; that flag
        // is only valid for the parent eval/stdin and must not reach the worker.
        worker = new Worker(this.workerUrl, {
          execArgv: process.execArgv.filter((argument) => !argument.startsWith('--input-type')),
        });
      } catch (error) {
        reject(
          new BacktestExecutorError(
            error instanceof Error ? error.message : String(error),
            'BACKTEST_WORKER_FAILED',
          ),
        );
        return;
      }
      let settled = false;
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        void worker.terminate();
        callback();
      };
      const timeout = setTimeout(
        () =>
          finish(() =>
            reject(
              new BacktestExecutorError('Backtest vượt quá thời gian xử lý.', 'BACKTEST_TIMEOUT'),
            ),
          ),
        Math.max(1, deadline - Date.now()),
      );
      worker.once('error', (error) =>
        finish(() => reject(new BacktestExecutorError(error.message, 'BACKTEST_WORKER_FAILED'))),
      );
      worker.once('exit', (code) =>
        finish(() =>
          reject(
            new BacktestExecutorError(
              `Backtest worker exited (${code}).`,
              'BACKTEST_WORKER_FAILED',
            ),
          ),
        ),
      );
      worker.once('message', (reply: WorkerReply) =>
        finish(() => (reply.ok ? resolve(reply.output) : reject(deserializeJobError(reply.error)))),
      );
      worker.postMessage(job);
    });
  }
}
