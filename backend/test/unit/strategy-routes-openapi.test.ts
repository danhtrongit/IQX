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
  responses?: Record<string, { content?: Record<string, { schema?: Record<string, unknown> }> }>;
};

/** [path, method, operationId, response schema status] of the Strategy routes added or changed. */
const ROUTES: Array<[string, string, string, string]> = [
  ['/api/v2/strategy/alerts', 'get', 'strategyAlertsList', 'explicit'],
  ['/api/v2/strategy/alerts', 'post', 'strategyAlertsCreate', 'explicit'],
  ['/api/v2/strategy/alerts/source-preview', 'post', 'strategyAlertsSourcePreview', 'explicit'],
  ['/api/v2/strategy/alerts/events', 'get', 'strategyAlertEventsList', 'explicit'],
  ['/api/v2/strategy/alerts/events/{eventId}', 'get', 'strategyAlertEventGet', 'explicit'],
  ['/api/v2/strategy/alerts/{alertId}', 'get', 'strategyAlertGet', 'explicit'],
  ['/api/v2/strategy/alerts/{alertId}', 'patch', 'strategyAlertUpdate', 'explicit'],
  ['/api/v2/strategy/alerts/{alertId}', 'delete', 'strategyAlertDelete', 'no-content'],
  ['/api/v2/strategy/backtests/{id}/trades', 'get', 'strategyBacktestsTrades', 'explicit'],
  ['/api/v2/strategy/screener/results/{resultId}', 'get', 'screenerResultGet', 'explicit'],
  ['/api/v2/strategy/screener/run', 'post', 'screenerRun', 'explicit'],
  ['/api/v2/strategy/screener/metrics', 'get', 'screenerMetrics', 'explicit'],
];

describe('Strategy routes OpenAPI contract', () => {
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

  it.each(ROUTES)('%s %s is premium with a typed response', (path, method, operationId, status) => {
    const operation = (document.paths[path] as Record<string, Operation> | undefined)?.[method];
    expect(operation, `${method} ${path}`).toBeDefined();
    expect(operation?.operationId).toBe(operationId);
    expect(operation?.['x-auth-level']).toBe('premium');
    expect(operation?.['x-response-schema-status']).toBe(status);
    if (['post', 'patch', 'put'].includes(method) && !path.endsWith('/run'))
      expect(operation?.requestBody).toBeDefined();
  });

  it('documents the single metric status enum and the per-condition period on the screener', () => {
    const run = (document.paths['/api/v2/strategy/screener/run'] as Record<string, Operation>)
      .post!;
    const schema = JSON.stringify(run.responses?.['200']?.content?.['application/json']?.schema);
    for (const status of [
      'ok',
      'missing',
      'not_applicable',
      'insufficient_base',
      'definition_pending',
      'data_unavailable',
    ])
      expect(schema).toContain(`"${status}"`);
    expect(schema).toContain('actual_period_label');
    expect(schema).toContain('period_mode');
    expect(schema).not.toContain('undefined_denominator');
    expect(JSON.stringify(run.requestBody)).toContain('"period"');
  });

  it('documents the six backtest KPIs by their spec names, with closed_trade_count', () => {
    const get = (document.paths['/api/v2/strategy/backtests/{id}'] as Record<string, Operation>)
      .get!;
    const schema = JSON.stringify(get.responses?.['200']?.content?.['application/json']?.schema);
    for (const name of [
      'total_return_pct',
      'annualized_return_pct',
      'max_drawdown_pct',
      'closed_trade_count',
      'win_rate_pct',
      'buy_hold_return_pct',
    ])
      expect(schema).toContain(name);
    expect(schema).toContain('Lợi nhuận danh mục (%)');
    expect(schema).toContain('open_position_count');
  });
});
