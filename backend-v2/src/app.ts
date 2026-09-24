import 'reflect-metadata';
import { Module, StandardSchemaValidationPipe, UnprocessableEntityException } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { ConfigurationModule } from './platform/config/configuration.module.js';
import { parseEnvironment } from './platform/config/environment.js';
import type { Environment } from './platform/config/environment.js';
import { ObservabilityModule } from './platform/observability/observability.module.js';
import { ensureRequestId } from './platform/observability/request-id.js';
import { ApiExceptionFilter } from './platform/http/api-exception.filter.js';
import { ResponseMetadataInterceptor } from './platform/http/response-metadata.interceptor.js';
import { createHttpAdapter } from './platform/http/http-adapter.js';
import { RateLimitModule } from './platform/rate-limit/rate-limit.module.js';
import { HealthModule } from './platform/health/health.module.js';
import { InstrumentsModule } from './modules/market/instruments/instruments.module.js';
import { MarketDataModule } from './modules/market-data/index.js';
import { QuantModule } from './modules/quant/index.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { V1InstrumentsController } from './compatibility/v1/instruments.controller.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { TradingModule } from './modules/trading/index.js';
import { AuthModule } from './modules/auth/index.js';
import { enrichOpenApiDocument } from './platform/openapi/enrich-openapi.js';
import { LearningModule } from './modules/learning/index.js';
import { MediaModule } from './modules/media/index.js';
import { AlertsModule } from './modules/alerts/index.js';
import { JourneyModule } from './modules/journey/journey.module.js';
import { UsersModule } from './modules/users/index.js';
import { WatchlistsModule } from './modules/watchlists/index.js';
import { ChartDrawingsModule } from './modules/chart-drawings/index.js';
import { MarketExtendedModule } from './modules/market-extended/index.js';
import { FinancialsModule } from './modules/financials/index.js';
import { AnalysisModule } from './modules/analysis/index.js';
import { ForecastsModule } from './modules/forecasts/forecasts.module.js';
import { PatternsModule } from './modules/patterns/patterns.module.js';
import { ReportsModule } from './modules/reports/index.js';
import { PortfolioManagerModule } from './modules/portfolio-manager/index.js';
import { BotsModule } from './modules/bots/index.js';
import { NotificationsModule } from './modules/notifications/index.js';
import { RealtimeModule } from './modules/realtime/index.js';
import { DomainRuntimeModule } from './platform/domain-runtime.module.js';

@Module({})
class ApiModule {}

export function createApiModule(
  environment: Record<string, string | undefined> = process.env,
): DynamicModule {
  const values = parseEnvironment(environment);
  return {
    module: ApiModule,
    imports: [
      ConfigurationModule.forEnvironment(environment),
      ObservabilityModule,
      HealthModule,
      RateLimitModule,
      InstrumentsModule,
      AdminModule,
      TradingModule,
      MarketDataModule,
      QuantModule,
      BillingModule,
      AuthModule,
      MediaModule,
      LearningModule,
      AlertsModule,
      JourneyModule,
      UsersModule,
      WatchlistsModule,
      ChartDrawingsModule,
      MarketExtendedModule,
      FinancialsModule,
      AnalysisModule,
      ForecastsModule,
      PatternsModule,
      ReportsModule,
      PortfolioManagerModule,
      BotsModule,
      NotificationsModule,
      DomainRuntimeModule.forApi(values.QUEUE_ENABLED),
      RealtimeModule.register({
        enabled: values.REALTIME_ENABLED,
        ingestEnabled: false,
        v1CompatibilityEnabled: values.COMPATIBILITY_V1_ENABLED,
        maxSymbolsPerConnection: values.REALTIME_MAX_SYMBOLS,
        demandTtlMs: values.REALTIME_LEASE_TTL_SECONDS * 1000,
        leaderTtlMs: values.REALTIME_LEASE_TTL_SECONDS * 1000,
        reconcileMs: values.REALTIME_LEASE_RENEW_SECONDS * 1000,
      }),
    ],
    controllers: values.COMPATIBILITY_V1_ENABLED ? [V1InstrumentsController] : [],
  };
}

export function createOpenApiDocument(app: NestFastifyApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('IQX backend-v2')
    .setDescription(
      'IQX backend-v2 modular API. Database migrations are explicit and guarded for fresh v2 databases.',
    )
    .setVersion('0.2.0')
    .build();
  const document = enrichOpenApiDocument(app, SwaggerModule.createDocument(app, config));
  if (!app.get(ConfigService<Environment, true>).get('COMPATIBILITY_V1_ENABLED', { infer: true })) {
    for (const path of Object.keys(document.paths))
      if (path.startsWith('/api/v1/')) delete document.paths[path];
  }
  return document;
}

export async function configureApiApp(
  app: NestFastifyApplication,
  options: { logger?: boolean } = {},
): Promise<void> {
  const config = app.get(ConfigService<Environment, true>);
  app.useWebSocketAdapter(new WsAdapter(app));
  if (options.logger !== false) app.useLogger(app.get(PinoLogger));
  else app.useLogger(false);
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', async (request, reply) => {
      request.id = ensureRequestId(request.raw);
      reply.header('X-Request-ID', request.id);
      if (
        !config.get('COMPATIBILITY_V1_ENABLED', { infer: true }) &&
        request.url.startsWith('/api/v1/')
      ) {
        await reply
          .status(404)
          .send({ detail: 'API v1 compatibility is disabled', code: 'NOT_FOUND' });
      }
    });
  await app.register(helmet);
  const multipart = (await import('@fastify/multipart')).default;
  await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024, files: 1 } });
  const origins = config.get('CORS_ORIGINS', { infer: true });
  app.enableCors({
    origin: origins.length ? origins : false,
    credentials: false,
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'Retry-After'],
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new StandardSchemaValidationPipe({
      exceptionFactory: (issues) =>
        new UnprocessableEntityException({
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu yêu cầu không hợp lệ',
          details: issues.map((issue) => ({ path: issue.path, message: issue.message })),
        }),
    }),
  );
  app.useGlobalInterceptors(new ResponseMetadataInterceptor());
  if (config.get('API_DOCS_ENABLED', { infer: true })) {
    SwaggerModule.setup('docs', app, createOpenApiDocument(app), {
      jsonDocumentUrl: 'openapi.json',
    });
  }
}

export async function createApiApp(
  options: { environment?: Record<string, string | undefined>; logger?: boolean } = {},
): Promise<NestFastifyApplication> {
  const environment = {
    ...(options.environment ?? process.env),
    ...(options.logger === false ? { LOG_LEVEL: 'silent' } : {}),
  };
  const app = await NestFactory.create<NestFastifyApplication>(
    createApiModule(environment),
    createHttpAdapter(parseEnvironment(environment).TRUST_PROXY_CIDRS),
    {
      logger: options.logger === false ? false : undefined,
      bufferLogs: options.logger !== false,
      abortOnError: false,
    },
  );
  try {
    app.useWebSocketAdapter(new WsAdapter(app));
    await configureApiApp(app, options);
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
