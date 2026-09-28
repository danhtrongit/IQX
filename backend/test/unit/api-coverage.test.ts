import { describe, expect, it } from 'vitest';

import {
  analyzeApiCoverage,
  extractOpenApiOperations,
  operationIdentityKey,
  operationKey,
  type CoverageInput,
} from '../../scripts/api-coverage.js';

const operation = (
  responses: Record<string, unknown> = {
    '200': { content: { 'application/json': { schema: { type: 'object' } } } },
  },
) => ({
  responses,
  security: [{ bearer: [] }],
});

function fixture(overrides: Partial<CoverageInput> = {}): CoverageInput {
  return {
    legacy: {
      counts: { http: 2, routes: 2, websocket: 0 },
      routes: [
        { method: 'GET', path: '/api/v1/demo', protocol: 'http', router: { module: 'demo' } },
        { method: 'POST', path: '/api/v1/demo/:id', protocol: 'http', router: { module: 'demo' } },
      ],
    },
    openApi: {
      paths: {
        '/api/v2/demo': { get: operation() },
        '/api/v2/demo/{id}': { post: operation() },
      },
    },
    runtime: {
      http: [
        { method: 'GET', path: '/api/v2/demo' },
        { method: 'POST', path: '/api/v2/demo/:id' },
      ],
      websocket: { adapter: null, gateways: [] },
    },
    dispositions: { overrides: {} },
    ...overrides,
  };
}

describe('api coverage analysis', () => {
  it('normalizes parameter syntaxes and extracts only OpenAPI operations', () => {
    expect(operationKey('get', '/api/v2/demo/:id(\\d+)')).toBe('GET /api/v2/demo/{id}');
    expect(operationIdentityKey('get', '/api/v2/courses/{course_id}')).toBe(
      'GET /api/v2/courses/{}',
    );
    expect(operationIdentityKey('get', '/api/v2/courses/:courseId')).toBe('GET /api/v2/courses/{}');
    expect(
      extractOpenApiOperations({ paths: { '/demo': { get: operation(), parameters: [] } } }),
    ).toHaveLength(1);
  });

  it('supports approved explicit replacement and reports complete structural coverage', () => {
    const report = analyzeApiCoverage({
      ...fixture(),
      dispositions: {
        overrides: {
          'GET /api/v1/demo': {
            disposition: 'implemented',
            replacement: 'GET /api/v2/demo',
          },
          'POST /api/v1/demo/{id}': {
            disposition: 'implemented',
            replacement: 'POST /api/v2/demo/{id}',
          },
        },
      },
    });
    expect(report.coverage.http).toEqual({ mapped: 2, missing: [], total: 2 });
    expect(report.verdict.structurallyComplete).toBe(true);
    expect(report.verdict.semanticComplete).toBe(false);
  });

  it('rejects missing handlers, unknown runtime operations and duplicate inventory entries', () => {
    const input = fixture({
      runtime: {
        http: [
          { method: 'GET', path: '/api/v2/demo' },
          { method: 'GET', path: '/api/v2/demo' },
          { method: 'DELETE', path: '/api/v2/unknown' },
        ],
        websocket: { adapter: null, gateways: [] },
      },
    });
    const report = analyzeApiCoverage(input);
    expect(report.coverage.http.missing).toContain('POST /api/v1/demo/{id}');
    expect(report.consistency.duplicateRuntime).toContain('GET /api/v2/demo');
    expect(report.consistency.runtimeWithoutOpenApi).toContain('DELETE /api/v2/unknown');
    expect(report.verdict.structurallyComplete).toBe(false);
  });

  it('keeps WebSocket completeness separate and requires a verified adapter and gateway', () => {
    const input = fixture({
      legacy: {
        counts: { http: 0, routes: 1, websocket: 1 },
        routes: [{ method: 'WEBSOCKET', path: '/api/v1/market-data/ws', protocol: 'websocket' }],
      },
      openApi: { paths: {} },
      runtime: {
        http: [],
        websocket: {
          adapter: 'WsAdapter',
          gateways: [
            {
              className: 'MarketDataGateway',
              messageHandlers: ['subscribe'],
              path: '/api/v1/market-data/ws',
            },
          ],
        },
      },
    });
    const report = analyzeApiCoverage(input);
    expect(report.coverage.http).toEqual({ mapped: 0, missing: [], total: 0 });
    expect(report.coverage.websocket).toEqual({ mapped: 1, missing: [], total: 1 });
    expect(report.runtime.websocketAdapter).toBe('WsAdapter');
  });

  it('maps concrete legacy variants to a segment-bounded consolidated route', () => {
    const report = analyzeApiCoverage({
      legacy: {
        counts: { http: 2, routes: 2, websocket: 0 },
        routes: [
          { method: 'GET', path: '/api/v1/market-analysis/daily/latest', protocol: 'http' },
          {
            method: 'GET',
            path: '/api/v1/market-analysis/daily/{session_date}',
            protocol: 'http',
          },
        ],
      },
      openApi: {
        paths: {
          '/api/v1/market-analysis/{type}/latest': { get: operation() },
          '/api/v1/market-analysis/{type}/{sessionDate}': { get: operation() },
        },
      },
      runtime: {
        http: [
          { method: 'GET', path: '/api/v1/market-analysis/:type/latest' },
          { method: 'GET', path: '/api/v1/market-analysis/:type/:sessionDate' },
        ],
        websocket: { adapter: null, gateways: [] },
      },
    });

    expect(report.coverage.http).toEqual({ mapped: 2, missing: [], total: 2 });
    expect(report.mappings.map((mapping) => mapping.strategy)).toEqual([
      'parameterized-consolidation',
      'parameterized-consolidation',
    ]);
  });
});
