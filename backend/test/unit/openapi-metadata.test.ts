import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { OpenAPIObject } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApp, createOpenApiDocument } from '../../src/app.js';
import {
  enrichOpenApiDocument,
  summarizeOpenApiMetadata,
} from '../../src/platform/openapi/enrich-openapi.js';

type ExtendedOperation = {
  security?: Array<Record<string, string[]>>;
  responses?: Record<
    string,
    {
      content?: Record<string, { schema?: unknown }>;
    }
  >;
  requestBody?: {
    content?: Record<string, { schema?: unknown }>;
  };
  'x-auth-level'?: string;
  'x-required-roles'?: string[];
  'x-response-schema-status'?: string;
};

describe('OpenAPI runtime metadata enrichment', () => {
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

  it('describes public, authenticated, admin, and premium guard behavior', () => {
    const publicOperation = operation(document, '/api/v2/market-data/reference/symbols', 'get');
    expect(publicOperation.security).toEqual([]);
    expect(publicOperation['x-auth-level']).toBe('public');
    expect(publicOperation.responses).not.toHaveProperty('401');

    const authenticated = operation(document, '/api/v2/users/me', 'get');
    expect(authenticated.security).toEqual([{ bearer: [] }]);
    expect(authenticated['x-auth-level']).toBe('authenticated');
    expect(authenticated.responses?.['401']).toBeDefined();
    expect(authenticated.responses?.['403']).toBeUndefined();

    const admin = operation(document, '/api/v2/admin/system/status', 'get');
    expect(admin.security).toEqual([{ bearer: [] }]);
    expect(admin['x-auth-level']).toBe('roles:admin');
    expect(admin['x-required-roles']).toEqual(['admin']);
    expect(admin.responses?.['403']).toBeDefined();

    const premium = operation(document, '/api/v2/ai/insight/{symbol}', 'get');
    expect(premium.security).toEqual([{ bearer: [] }]);
    expect(premium['x-auth-level']).toBe('premium');
    expect(premium.responses?.['403']).toBeDefined();

    const leaderboard = operation(document, '/api/v2/virtual-trading/leaderboard', 'get');
    expect(leaderboard.security).toEqual([]);
    expect(leaderboard['x-auth-level']).toBe('public');
  });

  it('maps verified legacy responses to v1 and same-handler v2 routes', () => {
    const v1 = operation(document, '/api/v1/market-data/trading/{symbol}/history', 'get');
    const v2 = operation(document, '/api/v2/market-data/trading/{symbol}/history', 'get');
    expect(v1['x-response-schema-status']).toBe('legacy-mapped');
    expect(v2['x-response-schema-status']).toBe('legacy-mapped');
    expect(successSchema(v2)).toEqual(successSchema(v1));
    expect(JSON.stringify(successSchema(v1))).toContain('#/components/schemas/Legacy_');
  });

  it('documents provider-backed market request and response contracts', () => {
    const screening = operation(document, '/api/v2/market-data/screening/search', 'post');
    expect(screening.requestBody?.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/ScreeningRequest',
    });
    expect(successSchema(screening)).toEqual({
      $ref: '#/components/schemas/MarketScreeningResponse',
    });

    const news = operation(document, '/api/v2/market-data/news/ai', 'get');
    expect(successSchema(news)).toEqual({ $ref: '#/components/schemas/AiNewsResponse' });
    const priceBoard = operation(document, '/api/v2/market-data/trading/price-board', 'post');
    expect(successSchema(priceBoard)).toEqual({
      $ref: '#/components/schemas/MarketPriceBoardResponse',
    });
  });

  it('documents multipart lesson uploads and all signed media outcomes', () => {
    for (const path of [
      '/api/v2/admin/lessons/courses/{courseId}/thumbnail',
      '/api/v2/admin/lessons/episodes/{episodeId}/file',
    ]) {
      const upload = operation(document, path, 'post');
      expect(upload.requestBody?.content?.['multipart/form-data']?.schema).toMatchObject({
        type: 'object',
        required: ['file'],
      });
    }
    const media = operation(document, '/api/v2/media/{token}', 'get');
    expect(media.responses?.['200']?.content?.['application/octet-stream']?.schema).toEqual({
      type: 'string',
      format: 'binary',
    });
    expect(media.responses?.['206']?.content?.['application/octet-stream']?.schema).toEqual({
      type: 'string',
      format: 'binary',
    });
    expect(media.responses?.['416']).toBeDefined();
  });

  it('documents unified report routes without applying snake_case output to v2', () => {
    expect(
      successSchema(operation(document, '/api/v1/market-analysis/{type}/latest', 'get')),
    ).toEqual({ $ref: '#/components/schemas/Legacy_AnalysisOut' });
    expect(
      successSchema(operation(document, '/api/v2/market-analysis/{type}/latest', 'get')),
    ).toEqual({ $ref: '#/components/schemas/MarketReportV2' });
    expect(successSchema(operation(document, '/api/v2/market-analysis/{type}', 'get'))).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/MarketReportV2' },
    });
    expect(
      successSchema(operation(document, '/api/v2/market-analysis/{type}/run', 'post')),
    ).toEqual({ $ref: '#/components/schemas/Legacy_GenerateResult' });
  });

  it('documents the actual portfolio analysis evidence and nullable metrics', () => {
    const analysis = document.components?.schemas?.PortfolioAnalysis;
    expect(successSchema(operation(document, '/api/v2/portfolio-manager/report', 'get'))).toEqual({
      $ref: '#/components/schemas/PortfolioReport',
    });
    expect(successSchema(operation(document, '/api/v2/portfolio-manager/analyze', 'post'))).toEqual(
      {
        $ref: '#/components/schemas/PortfolioReport',
      },
    );
    expect(schemaAt(analysis, 'meta', 'data_quality').required).toEqual([
      'complete_risk_history',
      'aligned_benchmark',
      'fundamentals_complete',
      'discipline_evidence_complete',
      'valuation_prices',
      'cash_components',
    ]);
    expect(schemaAt(analysis, 'meta', 'data_quality', 'valuation_prices').items).toMatchObject({
      additionalProperties: false,
      required: ['ticker', 'source', 'as_of', 'age_days', 'stale'],
    });
    expect(
      schemaAt(
        analysis,
        'meta',
        'data_quality',
        'valuation_prices',
        'items',
        'properties',
        'source',
      ),
    ).toEqual({ type: 'string', enum: ['symbol_snapshot', 'daily_close'] });
    for (const path of [
      ['overview', 'cash'],
      ['meta', 'data_quality', 'cash_components'],
    ]) {
      expect(schemaAt(analysis, ...path).required).toEqual([
        'available',
        'reserved',
        'pending',
        'total',
      ]);
    }
    expect(schemaAt(analysis, 'overview', 'positions').items).toMatchObject({
      additionalProperties: false,
      required: [
        'ticker',
        'sector',
        'weight',
        'pnl',
        'price_source',
        'price_as_of',
        'price_age_days',
        'price_stale',
      ],
    });
    expect(schemaAt(analysis, 'risk', 'data_quality').required).toEqual([
      'complete',
      'holdings_total',
      'holdings_with_history',
      'common_price_observations',
      'benchmark_aligned_observations',
      'beta_available',
      'missing_history',
      'history_alignment_complete',
    ]);
    expect(schemaAt(analysis, 'performance').required).toEqual([
      'portfolio_return',
      'benchmark_return',
      'excess_return',
      'max_drawdown',
      'method',
      'observations',
    ]);
    expect(schemaAt(analysis, 'quality').required).toEqual([
      'pe',
      'pb',
      'roe',
      'coverage',
      'score_eligible',
      'missing',
    ]);
    expect(schemaAt(analysis, 'behavior', 'evidence').required).toEqual([
      'evaluated',
      'closed_winner_quantity',
      'closed_loser_quantity',
      'average_winner_days',
      'average_loser_days',
      'closed_quantity',
    ]);
    expect(schemaAt(analysis, 'scores').required).toEqual([
      'pillars',
      'overall',
      'available_pillars',
    ]);
    for (const path of [
      ['overview', 'cash_pct'],
      ['overview', 'total_return'],
      ['concentration', 'effective_n'],
      ['performance', 'portfolio_return'],
      ['performance', 'benchmark_return'],
      ['performance', 'excess_return'],
      ['performance', 'max_drawdown'],
      ['risk', 'beta'],
      ['risk', 'volatility'],
      ['risk', 'max_drawdown'],
      ['quality', 'pe'],
      ['quality', 'pb'],
      ['quality', 'roe'],
      ['behavior', 'evidence', 'average_winner_days'],
      ['behavior', 'evidence', 'average_loser_days'],
      ['scores', 'overall'],
      ...['performance', 'risk', 'diversification', 'quality', 'discipline'].map((pillar) => [
        'scores',
        'pillars',
        pillar,
      ]),
    ]) {
      expect(schemaAt(analysis, ...path).oneOf, path.join('.')).toEqual([
        { type: path[0] === 'scores' && path[1] === 'pillars' ? 'integer' : 'number' },
        { type: 'string', nullable: true, enum: [null] },
      ]);
    }
    expect(schemaAt(analysis, 'behavior', 'disposition_flag').oneOf).toEqual([
      { type: 'boolean' },
      { type: 'string', nullable: true, enum: [null] },
    ]);
  });

  it('keeps every component reference resolvable and types every success response', () => {
    const schemas = document.components?.schemas ?? {};
    expect(
      Object.keys(schemas).filter((name) => name.startsWith('Legacy_')).length,
    ).toBeGreaterThan(270);
    for (const reference of collectLocalSchemaReferences(document)) {
      const name = reference.slice('#/components/schemas/'.length);
      expect(schemas, `missing schema for ${reference}`).toHaveProperty(name);
    }
    expect(JSON.stringify(document)).not.toContain('#/definitions/');
    expect(JSON.stringify(document)).not.toContain('"definitions":');
    expect(collectInvalidOpenApi30Keywords(document)).toEqual([]);

    const quality = summarizeOpenApiMetadata(document);
    expect(quality.operations).toBeGreaterThan(600);
    expect(quality.responseSchemas).toBeGreaterThan(quality.untypedResponses);
    expect(quality.responseSchemas + quality.noContentResponses + quality.untypedResponses).toBe(
      quality.operations,
    );
    expect(quality.noContentResponses).toBeGreaterThan(0);
    expect(quality.untypedResponses).toBe(0);
    for (const operationPath of [
      '/api/v2/ai/forecast/ranking',
      '/api/v2/ai/forecast/symbols/{symbol}',
      '/api/v2/ai/patterns/candles',
      '/api/v2/ai/patterns/{kind}/symbols',
      '/api/v2/ai/insight/{symbol}',
      '/api/v2/cap8/positions/{symbol}/exit-context',
    ]) {
      const pathItem = document.paths[operationPath];
      expect(pathItem?.get, `missing operation GET ${operationPath}`).toBeDefined();
      expect(successSchema(pathItem?.get as ExtendedOperation)).toBeDefined();
    }
  });

  it('uses the actual v1/v2 exception envelopes for global typed failures', () => {
    expect(errorSchema(operation(document, '/api/v1/users/me', 'get'), '401')).toEqual({
      $ref: '#/components/schemas/LegacyApiError',
    });
    expect(errorSchema(operation(document, '/api/v2/users/me', 'get'), '401')).toEqual({
      $ref: '#/components/schemas/ApiErrorV2',
    });
    expect(errorSchema(operation(document, '/api/v2/users/me', 'get'), '429')).toEqual({
      $ref: '#/components/schemas/ApiErrorV2',
    });
  });
});

function operation(document: OpenAPIObject, path: string, method: string): ExtendedOperation {
  const value = document.paths[path]?.[method as keyof (typeof document.paths)[string]];
  if (!value || typeof value !== 'object')
    throw new Error(`OpenAPI operation is missing: ${method} ${path}`);
  return value as ExtendedOperation;
}

function successSchema(operation: ExtendedOperation): unknown {
  const response = Object.entries(operation.responses ?? {}).find(([status]) =>
    status.startsWith('2'),
  )?.[1];
  return response?.content?.['application/json']?.schema;
}

function errorSchema(operation: ExtendedOperation, status: string): unknown {
  return operation.responses?.[status]?.content?.['application/json']?.schema;
}

function schemaAt(value: unknown, ...path: string[]): Record<string, unknown> {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== 'object')
      throw new Error(`missing schema: ${path.join('.')}`);
    const record = current as Record<string, unknown>;
    current =
      segment in record
        ? record[segment]
        : (record.properties as Record<string, unknown> | undefined)?.[segment];
  }
  if (!current || typeof current !== 'object') throw new Error(`missing schema: ${path.join('.')}`);
  return current as Record<string, unknown>;
}

function collectLocalSchemaReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectLocalSchemaReferences);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
    key === '$ref' && typeof item === 'string' && item.startsWith('#/components/schemas/')
      ? [item]
      : collectLocalSchemaReferences(item),
  );
}

function collectInvalidOpenApi30Keywords(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectInvalidOpenApi30Keywords(item, `${path}/${index}`),
    );
  }
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const invalid: string[] = [];
  if (record.type === 'null') invalid.push(`${path}/type:null`);
  if ('const' in record) invalid.push(`${path}/const`);
  if (typeof record.exclusiveMinimum === 'number') invalid.push(`${path}/exclusiveMinimum:number`);
  if (typeof record.exclusiveMaximum === 'number') invalid.push(`${path}/exclusiveMaximum:number`);
  if ('contentMediaType' in record) invalid.push(`${path}/contentMediaType`);
  return invalid.concat(
    Object.entries(record).flatMap(([key, item]) =>
      collectInvalidOpenApi30Keywords(item, `${path}/${key}`),
    ),
  );
}
