import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { OpenAPIObject } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApp, createOpenApiDocument } from '../../src/app.js';
import { enrichOpenApiDocument } from '../../src/platform/openapi/enrich-openapi.js';

type Operation = {
  operationId?: string;
  'x-auth-level'?: string;
  'x-response-schema-status'?: string;
  requestBody?: unknown;
};

const ROUTES: Array<[string, string, string]> = [
  ['/api/v2/strategy/filters', 'get', 'explicit'],
  ['/api/v2/strategy/filters', 'post', 'explicit'],
  ['/api/v2/strategy/filters/{filterId}', 'get', 'explicit'],
  ['/api/v2/strategy/filters/{filterId}', 'put', 'explicit'],
  ['/api/v2/strategy/filters/{filterId}', 'delete', 'no-content'],
  ['/api/v2/strategy/lists', 'get', 'explicit'],
  ['/api/v2/strategy/lists', 'post', 'explicit'],
  ['/api/v2/strategy/lists/{listId}', 'get', 'explicit'],
  ['/api/v2/strategy/lists/{listId}', 'delete', 'no-content'],
];

describe('saved filters OpenAPI contract', () => {
  let app: NestFastifyApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    app = await createApiApp({
      environment: {
        APP_ENV: 'test',
        API_DOCS_ENABLED: 'true',
        MARKET_INGEST_ENABLED: 'false',
        QUEUE_ENABLED: 'false',
        REDIS_ENABLED: 'false',
        REALTIME_ENABLED: 'false',
      },
      logger: false,
    });
    await app.init();
    document = enrichOpenApiDocument(app, createOpenApiDocument(app));
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(ROUTES)('%s %s is premium with a typed response', (path, method, status) => {
    const operation = (document.paths[path] as Record<string, Operation> | undefined)?.[method];
    expect(operation, `${method} ${path}`).toBeDefined();
    expect(operation?.operationId).toMatch(/Strategy/);
    expect(operation?.['x-auth-level']).toBe('premium');
    expect(operation?.['x-response-schema-status']).toBe(status);
    if (method === 'post' || method === 'put') expect(operation?.requestBody).toBeDefined();
  });
});
