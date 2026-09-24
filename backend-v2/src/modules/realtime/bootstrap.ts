import type { INestApplicationContext } from '@nestjs/common';

import { RealtimeBridge } from './realtime.bridge.js';

export function startRealtimeIngest(application: INestApplicationContext): void {
  application.get(RealtimeBridge).start();
}

export async function stopRealtimeIngest(application: INestApplicationContext): Promise<void> {
  await application.get(RealtimeBridge).onApplicationShutdown();
}
