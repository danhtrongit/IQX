import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { ConfigurationModule } from '../platform/config/configuration.module.js';
import { parseEnvironment } from '../platform/config/environment.js';
import { ObservabilityModule } from '../platform/observability/observability.module.js';
import { installShutdownHandlers } from '../platform/health/shutdown.js';
import { RealtimeModule } from '../modules/realtime/index.js';
import {
  createDnseProviderFactory,
  providerOptionsFromEnvironment,
} from '../modules/realtime/dnse.stream.js';

@Module({})
class IngestApplication {}

async function main(): Promise<void> {
  const config = parseEnvironment(process.env);
  if (!config.MARKET_INGEST_ENABLED) {
    process.stdout.write('Market ingestion disabled by MARKET_INGEST_ENABLED=false.\n');
    return;
  }
  const app = await NestFactory.createApplicationContext(
    {
      module: IngestApplication,
      imports: [
        ConfigurationModule.forEnvironment(process.env),
        ObservabilityModule,
        RealtimeModule.register({
          enabled: true,
          ingestEnabled: true,
          providerFactory: createDnseProviderFactory(providerOptionsFromEnvironment(process.env)),
          maxSymbolsPerConnection: config.REALTIME_MAX_SYMBOLS,
          demandTtlMs: config.REALTIME_LEASE_TTL_SECONDS * 1000,
          leaderTtlMs: config.REALTIME_LEASE_TTL_SECONDS * 1000,
          reconcileMs: config.REALTIME_LEASE_RENEW_SECONDS * 1000,
        }),
      ],
    },
    { bufferLogs: true, abortOnError: false },
  );
  app.useLogger(app.get(Logger));
  installShutdownHandlers(app, config.SHUTDOWN_TIMEOUT_MS, () => undefined);
  app.get(Logger).log('IQX market ingestion started with leader election.');
}

main().catch(() => {
  process.stderr.write(
    'IQX market ingestion failed to initialize. Check Redis and DNSE configuration.\n',
  );
  process.exitCode = 1;
});
