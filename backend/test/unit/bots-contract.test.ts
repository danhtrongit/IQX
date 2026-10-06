import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { OpenAPIObject, OperationObject, SchemaObject } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApp, createOpenApiDocument } from '../../src/app.js';
import { enrichOpenApiDocument } from '../../src/platform/openapi/enrich-openapi.js';

const BOT_READ_PATHS = ['', '/positions', '/status', '/journal', '/performance'] as const;
const WRITE_METHODS = ['post', 'put', 'patch', 'delete'] as const;

function schema(document: OpenAPIObject, name: string): SchemaObject {
  const value = document.components?.schemas?.[name];
  expect(value, `OpenAPI component ${name}`).toBeDefined();
  expect(value).not.toHaveProperty('$ref');
  return value as SchemaObject;
}

function properties(document: OpenAPIObject, name: string): Record<string, SchemaObject> {
  return schema(document, name).properties as Record<string, SchemaObject>;
}

function successRef(document: OpenAPIObject, path: string): string | undefined {
  const operation = document.paths[path]?.get as OperationObject | undefined;
  const response = operation?.responses?.['200'];
  if (!response || '$ref' in response) return undefined;
  const responseSchema = response.content?.['application/json']?.schema;
  return responseSchema && '$ref' in responseSchema ? responseSchema.$ref : undefined;
}

function expectNullable(value: SchemaObject, type: string): void {
  expect(value.oneOf?.[0]).toMatchObject({ type });
  expect(value.oneOf?.[1]).toMatchObject({ enum: [null], nullable: true });
}

describe('Bot Academy OpenAPI contract', () => {
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

  it('documents the Academy activation overview for both API versions', () => {
    for (const version of ['v1', 'v2']) {
      expect(successRef(document, `/api/${version}/bot`)).toBe('#/components/schemas/BotOverview');
    }

    expect(schema(document, 'BotOverview').required).toContain('conditions');
    expect(properties(document, 'BotConfig').policy_version).toEqual({
      type: 'string',
      enum: ['iqx-bot-academy-activation-1'],
    });
    expect(properties(document, 'BotConfig').product_stage).toEqual({
      type: 'string',
      enum: ['bot_v1_waiting', 'bot_v2_academy'],
    });
    expect(schema(document, 'BotConditions').required).toEqual(
      expect.arrayContaining([
        'state',
        'has_active_buy',
        'has_active_sell',
        'buy_condition_count',
        'sell_condition_count',
        'saved_revision',
        'effective_revision',
        'effective_session',
        'config_status',
        'open_positions',
      ]),
    );
  });

  it('exposes legacy take-profit only as nullable audit data and the entry revision', () => {
    for (const version of ['v1', 'v2']) {
      expect(successRef(document, `/api/${version}/bot/positions`)).toBe(
        '#/components/schemas/BotPositions',
      );
    }

    const position = properties(document, 'BotPosition');
    expect(position).not.toHaveProperty('take_profit_vnd');
    expectNullable(position.legacy_take_profit_vnd!, 'string');
    expectNullable(position.entry_config_revision!, 'integer');
    expect(position.entry_config_revision?.oneOf?.[0]).toMatchObject({ minimum: 1 });
  });

  it('documents journal policy and condition evidence while keeping supporting count nullable', () => {
    for (const version of ['v1', 'v2']) {
      expect(successRef(document, `/api/${version}/bot/journal`)).toBe(
        '#/components/schemas/BotJournal',
      );
    }

    const item = properties(document, 'BotJournalItem');
    expectNullable(item.policy_version!, 'string');
    expectNullable(item.decision_config_revision!, 'integer');
    expect(item.decision_config_revision?.oneOf?.[0]).toMatchObject({ minimum: 1 });
    expectNullable(item.condition_snapshot!, 'object');
    expectNullable(item.supporting_count!, 'integer');
  });

  it('keeps the Bot trading API read-only', () => {
    for (const version of ['v1', 'v2']) {
      for (const suffix of BOT_READ_PATHS) {
        const path = `/api/${version}/bot${suffix}`;
        expect(document.paths[path]?.get, `GET ${path}`).toBeDefined();
        for (const method of WRITE_METHODS) {
          expect(document.paths[path]?.[method], `${method.toUpperCase()} ${path}`).toBeUndefined();
        }
      }
    }
  });
});
