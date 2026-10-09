import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { OpenAPIObject, OperationObject, SchemaObject } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApp, createOpenApiDocument } from '../../src/app.js';
import { enrichOpenApiDocument } from '../../src/platform/openapi/enrich-openapi.js';

const WRITE_METHODS = ['post', 'put', 'patch', 'delete'] as const;
const ROUTES = [
  ['/api/v2/bot/trades', 'getBotTrades'],
  ['/api/v2/bot/journal/sessions', 'listBotJournalSessions'],
  ['/api/v2/bot/journal/sessions/{session}', 'getBotJournalSession'],
] as const;

type Parameter = { name: string; in: string; required?: boolean };

function responseSchema(operation: OperationObject): SchemaObject {
  const response = operation.responses?.['200'];
  expect(response).toBeDefined();
  expect(response).not.toHaveProperty('$ref');
  const content = (response as { content?: Record<string, { schema?: SchemaObject }> }).content;
  return content?.['application/json']?.schema ?? {};
}

describe('Bot history OpenAPI contract', () => {
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

  it('documents the three read-only v2 routes with operation ids and authentication', () => {
    for (const [path, operationId] of ROUTES) {
      const item = document.paths[path];
      expect(item?.get?.operationId, path).toBe(operationId);
      for (const method of WRITE_METHODS) {
        expect(item?.[method], `${method} ${path}`).toBeUndefined();
      }
      expect(item?.get?.security ?? document.security, path).toBeDefined();
      // v2 only: the legacy v1 surface does not grow.
      expect(document.paths[path.replace('/api/v2/', '/api/v1/')], path).toBeUndefined();
    }
  });

  it('documents cursor/limit query parameters and the session path parameter', () => {
    for (const [path] of ROUTES) {
      const parameters = (document.paths[path]?.get?.parameters ?? []) as Parameter[];
      expect(
        parameters.map((parameter) => parameter.name),
        path,
      ).toEqual(expect.arrayContaining(['cursor', 'limit']));
      expect(parameters.find((parameter) => parameter.name === 'cursor')?.required).not.toBe(true);
    }
    const detail = (document.paths['/api/v2/bot/journal/sessions/{session}']?.get?.parameters ??
      []) as Parameter[];
    expect(detail.find((parameter) => parameter.name === 'session')).toMatchObject({
      in: 'path',
      required: true,
    });
  });

  it('documents the response shapes the frontend reads', () => {
    const trades = responseSchema(document.paths['/api/v2/bot/trades']!.get as OperationObject);
    expect(trades.properties).toHaveProperty('items');
    expect(trades.properties).toHaveProperty('next_cursor');
    const item = (trades.properties!.items as SchemaObject).items as SchemaObject;
    const tradeFields = Object.keys(item.properties!);
    expect(tradeFields).toEqual(
      expect.arrayContaining([
        'id',
        'symbol',
        'buy',
        'sell',
        'realized_pnl_vnd',
        'realized_pnl_pct',
        'holding_sessions',
        'legacy_stop_loss_vnd',
        'legacy_take_profit_vnd',
      ]),
    );
    expect(tradeFields).not.toContain('stop_loss_vnd');
    expect(tradeFields).not.toContain('take_profit_vnd');
    const sell = item.properties!.sell as SchemaObject;
    expect(Object.keys(sell.properties!)).toEqual(
      expect.arrayContaining(['tax_vnd', 'net_vnd', 'decision_config_revision', 'reason_code']),
    );

    const sessions = responseSchema(
      document.paths['/api/v2/bot/journal/sessions']!.get as OperationObject,
    );
    const row = (sessions.properties!.items as SchemaObject).items as SchemaObject;
    expect(Object.keys(row.properties!)).toEqual(
      expect.arrayContaining([
        'session',
        'run_status',
        'policy_version',
        'universe',
        'config_revision',
        'counts',
        'reasons',
        'nav_end_vnd',
      ]),
    );

    const detail = responseSchema(
      document.paths['/api/v2/bot/journal/sessions/{session}']!.get as OperationObject,
    );
    expect(Object.keys(detail.properties!)).toEqual(
      expect.arrayContaining(['session', 'items', 'next_cursor']),
    );
  });

  it('documents the effective block and cross_fields on the strategy shared-config routes', () => {
    const state = responseSchema(
      document.paths['/api/v2/strategy/shared-config']!.get as OperationObject,
    );
    expect(Object.keys(state.properties!)).toEqual(
      expect.arrayContaining(['saved_revision', 'effective_revision', 'config', 'effective']),
    );
    expect(JSON.stringify(state.properties!.effective)).toContain('effective_session');
    const registry = responseSchema(
      document.paths['/api/v2/strategy/registry/technical']!.get as OperationObject,
    );
    const indicator = (registry.properties!.indicators as SchemaObject).items as SchemaObject;
    expect(Object.keys(indicator.properties!)).toContain('validation');
    expect(JSON.stringify(indicator.properties!.validation)).toContain('cross_fields');
  });
});
