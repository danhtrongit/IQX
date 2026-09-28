import type { INestApplicationContext } from '@nestjs/common';

import { RuntimeWorker } from './runtime.worker.js';

export async function startRuntime(application: INestApplicationContext): Promise<void> {
  await application.get(RuntimeWorker).start();
}

export async function stopRuntime(application: INestApplicationContext): Promise<void> {
  await application.get(RuntimeWorker).stop();
}
