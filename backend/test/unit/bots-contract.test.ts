import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { OpenAPIObject, OperationObject, SchemaObject } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApp, createOpenApiDocument } from '../../src/app.js';
import { enrichOpenApiDocument } from '../../src/platform/openapi/enrich-openapi.js';

const BOT_READ_PATHS = ['', '/positions', '/status', '/journal', '/performance'] as const;
const WRITE_METHODS = ['post', 'put', 'patch', 'delete'] as const;
const UNIVERSE_WRITES = ['apply-list', 'revert-vn30', 'pending/cancel'] as const;

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

describe('Bot policy iqx-bot-v1.0 OpenAPI contract', () => {
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

  it('documents the overview for both API versions without any level or graduation field', () => {
    for (const version of ['v1', 'v2']) {
      expect(successRef(document, `/api/${version}/bot`)).toBe('#/components/schemas/BotOverview');
    }

    expect(schema(document, 'BotOverview').required).toContain('conditions');
    expect(schema(document, 'BotOverview').required).not.toContain('current_level');
    expect(schema(document, 'BotOverview').required).not.toContain('cap6_graduated_at');
    expect(properties(document, 'BotOverview')).not.toHaveProperty('cap6_graduated_at');
    expect(properties(document, 'BotConfig').policy_version).toEqual({
      type: 'string',
      enum: ['iqx-bot-v1.0'],
    });
    expect(properties(document, 'BotConfig')).not.toHaveProperty('product_stage');
    expect(properties(document, 'BotConfig').candidate_order_owner_confirmation).toEqual({
      type: 'string',
      enum: ['pending'],
    });
    expect(properties(document, 'BotConditions').state).toEqual({
      type: 'string',
      enum: ['waiting_for_conditions', 'buy_only', 'sell_only', 'buy_and_sell', 'error'],
    });
    expect(schema(document, 'BotConditions').required).toEqual(
      expect.arrayContaining([
        'state',
        'state_label',
        'has_active_buy',
        'has_active_sell',
        'buy_status',
        'sell_status',
        'errors',
        'saved_revision',
        'effective_revision',
        'effective_session',
        'config_status',
        'pending',
        'open_positions',
      ]),
    );
  });

  it('exposes stops only as nullable legacy history and the new source/holding fields', () => {
    for (const version of ['v1', 'v2']) {
      expect(successRef(document, `/api/${version}/bot/positions`)).toBe(
        '#/components/schemas/BotPositions',
      );
    }

    const position = properties(document, 'BotPosition');
    for (const retired of ['stop_loss_vnd', 'amplitude_at_entry_vnd', 'take_profit_vnd']) {
      expect(position).not.toHaveProperty(retired);
    }
    for (const legacy of [
      'legacy_stop_loss_vnd',
      'legacy_amplitude_at_entry_vnd',
      'legacy_amplitude_source_ref',
      'legacy_take_profit_vnd',
    ]) {
      expectNullable(position[legacy]!, 'string');
    }
    expectNullable(position.entry_config_revision!, 'integer');
    expect(position.entry_config_revision?.oneOf?.[0]).toMatchObject({ minimum: 1 });
    expectNullable(position.in_universe!, 'boolean');
    expectNullable(position.entry_source_snapshot!, 'object');
    expect(position.holding_sessions).toMatchObject({ type: 'integer' });
    expect(schema(document, 'BotPosition').required).toEqual(
      expect.arrayContaining(['in_universe', 'source_scope', 'holding_sessions', 'last_decision']),
    );
  });

  it('documents journal reasons, universe revision and condition evidence', () => {
    for (const version of ['v1', 'v2']) {
      expect(successRef(document, `/api/${version}/bot/journal`)).toBe(
        '#/components/schemas/BotJournal',
      );
    }

    const item = properties(document, 'BotJournalItem');
    expectNullable(item.policy_version!, 'string');
    expectNullable(item.reason_label!, 'string');
    expectNullable(item.in_universe!, 'boolean');
    expectNullable(item.universe_revision!, 'integer');
    expectNullable(item.decision_config_revision!, 'integer');
    expect(item.decision_config_revision?.oneOf?.[0]).toMatchObject({ minimum: 1 });
    expectNullable(item.condition_snapshot!, 'object');
    expect(item).not.toHaveProperty('supporting_count');
    expect(item).not.toHaveProperty('filter_ids');
  });

  it('documents the buy-universe endpoints with typed responses (v2 only)', () => {
    const base = '/api/v2/bot/universe';
    expect(document.paths[base]?.get?.operationId).toBe('getBotUniverse');
    for (const suffix of UNIVERSE_WRITES) {
      const operation = document.paths[`${base}/${suffix}`]?.post as OperationObject | undefined;
      expect(operation, `POST ${suffix}`).toBeDefined();
      expect(operation?.security ?? document.security).toBeDefined();
      expect(operation?.requestBody, `body of ${suffix}`).toBeDefined();
    }
    expect(document.paths[`${base}/apply-list`]?.post?.operationId).toBe('applyBotUniverseList');
    expect(document.paths['/api/v1/bot/universe']).toBeUndefined();
    const state = document.paths[base]?.get?.responses?.['200'];
    expect(
      state && !('$ref' in state) && state.content?.['application/json']?.schema,
    ).toMatchObject({
      type: 'object',
      properties: {
        revision: expect.anything(),
        effective: expect.anything(),
        pending: expect.anything(),
      },
    });
  });

  it('keeps the Bot trading API read-only; universe writes never place orders', () => {
    for (const version of ['v1', 'v2']) {
      for (const suffix of BOT_READ_PATHS) {
        const path = `/api/${version}/bot${suffix}`;
        expect(document.paths[path]?.get, `GET ${path}`).toBeDefined();
        for (const method of WRITE_METHODS) {
          expect(document.paths[path]?.[method], `${method.toUpperCase()} ${path}`).toBeUndefined();
        }
      }
    }
    const botWrites = Object.entries(document.paths).flatMap(([path, item]) =>
      path.startsWith('/api/v2/bot') && !path.startsWith('/api/v2/bot/mascot')
        ? WRITE_METHODS.filter((method) => (item as Record<string, unknown>)[method]).map(
            (method) => `${method} ${path}`,
          )
        : [],
    );
    expect(botWrites.sort()).toEqual([
      'post /api/v2/bot/universe/apply-list',
      'post /api/v2/bot/universe/pending/cancel',
      'post /api/v2/bot/universe/revert-vn30',
    ]);
  });
});
