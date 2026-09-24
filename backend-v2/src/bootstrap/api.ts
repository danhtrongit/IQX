import { ConfigService } from '@nestjs/config';
import { createApiApp } from '../app.js';
import type { Environment } from '../platform/config/environment.js';
import { LifecycleService } from '../platform/health/lifecycle.service.js';
import { installShutdownHandlers } from '../platform/health/shutdown.js';

async function main(): Promise<void> {
  const app = await createApiApp();
  try {
    const config = app.get(ConfigService<Environment, true>);
    await app.listen(config.get('PORT', { infer: true }), config.get('HOST', { infer: true }));
    installShutdownHandlers(app, config.get('SHUTDOWN_TIMEOUT_MS', { infer: true }), () =>
      app.get(LifecycleService).beginDraining(),
    );
  } catch (error) {
    await app.close();
    throw error;
  }
}

main().catch(() => {
  process.stderr.write(
    'IQX API could not start. Check validated configuration and dependency readiness.\n',
  );
  process.exitCode = 1;
});
