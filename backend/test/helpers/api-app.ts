import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import { configureApiApp, createApiModule } from '../../src/app.js';
import { InstrumentsRepository } from '../../src/modules/market/instruments/instruments.repository.js';
import { createHttpAdapter } from '../../src/platform/http/http-adapter.js';

export interface InstrumentRepositoryStub {
  search: InstrumentsRepository['search'];
  findBySymbol: InstrumentsRepository['findBySymbol'];
}

const BASE_TEST_ENVIRONMENT: Record<string, string> = {
  APP_ENV: 'test',
  API_DOCS_ENABLED: 'false',
  COMPATIBILITY_V1_ENABLED: 'true',
  DATABASE_URL: 'postgresql://tester:secret@127.0.0.1:1/iqx_v2_test_mock',
  DB_CONNECT_TIMEOUT_MS: '100',
  DB_STATEMENT_TIMEOUT_MS: '100',
  LOG_LEVEL: 'silent',
  REDIS_ENABLED: 'false',
  JWT_SECRET_KEY: 'test-access-secret-at-least-thirty-two-characters',
  JWT_REFRESH_SECRET_KEY: 'test-refresh-secret-at-least-thirty-two-characters',
};

export async function createMockApiApp(
  repository: InstrumentRepositoryStub,
  environment: Record<string, string | undefined> = {},
): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [createApiModule({ ...BASE_TEST_ENVIRONMENT, ...environment })],
  })
    .overrideProvider(InstrumentsRepository)
    .useValue(repository)
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(createHttpAdapter(), {
    logger: false,
  });
  await configureApiApp(app, { logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
