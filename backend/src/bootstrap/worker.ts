import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { ConfigurationModule } from '../platform/config/configuration.module.js';
import { parseEnvironment } from '../platform/config/environment.js';
import { DomainRuntimeModule } from '../platform/domain-runtime.module.js';
import { ObservabilityModule } from '../platform/observability/observability.module.js';
import { installShutdownHandlers } from '../platform/health/shutdown.js';

@Module({})
class WorkerApplication {}

async function main(): Promise<void> {
  const config = parseEnvironment(process.env);
  if (!config.QUEUE_ENABLED) {
    process.stdout.write('Worker disabled by QUEUE_ENABLED=false.\n');
    return;
  }
  const app = await NestFactory.createApplicationContext(
    {
      module: WorkerApplication,
      imports: [
        ConfigurationModule.forEnvironment(process.env),
        ObservabilityModule,
        DomainRuntimeModule.forWorker(true),
      ],
    },
    { bufferLogs: true, abortOnError: false },
  );
  app.useLogger(app.get(Logger));
  installShutdownHandlers(app, config.SHUTDOWN_TIMEOUT_MS, () => undefined);
  app.get(Logger).log('IQX worker started with durable domain job handlers.');
}

main().catch(() => {
  process.stderr.write(
    'IQX worker failed to initialize. Check configuration and dependency readiness.\n',
  );
  process.exitCode = 1;
});
