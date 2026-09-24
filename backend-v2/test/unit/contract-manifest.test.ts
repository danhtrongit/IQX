import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { validateImplementedReplacements } from '../../scripts/validate-contract-links.js';

const backendRoot = fileURLToPath(new URL('../../', import.meta.url));

type LegacyContract = {
  counts: { routers: number; routes: number; http: number; websocket: number };
  routes: Array<{ method: string; path: string; protocol: string }>;
};

type Dispositions = {
  defaultDisposition: string;
  overrides: Record<string, { disposition: string; replacement?: string }>;
};

describe('legacy endpoint contract baseline', () => {
  it('matches a fresh static-AST extraction', () => {
    const result = spawnSync('python3', ['scripts/generate-legacy-contract.py', '--check'], {
      cwd: backendRoot,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('captures every currently mounted legacy route exactly once', () => {
    const contract = JSON.parse(
      readFileSync(new URL('../../contracts/legacy-v1-endpoints.json', import.meta.url), 'utf8'),
    ) as LegacyContract;
    const keys = contract.routes.map((route) => `${route.method} ${route.path}`);

    expect(contract.counts).toEqual({ routers: 41, routes: 316, http: 315, websocket: 1 });
    expect(new Set(keys).size).toBe(keys.length);
    expect(contract.routes.filter((route) => route.protocol === 'websocket')).toHaveLength(1);
  });

  it('records every delivered HTTP endpoint and keeps future unclassified routes pending', () => {
    const dispositions = JSON.parse(
      readFileSync(new URL('../../contracts/legacy-v1-dispositions.json', import.meta.url), 'utf8'),
    ) as Dispositions;
    const implemented = Object.entries(dispositions.overrides).filter(
      ([, value]) => value.disposition === 'implemented',
    );

    expect(dispositions.defaultDisposition).toBe('pending');
    expect(implemented).toHaveLength(315);
    expect(implemented).toEqual(
      expect.arrayContaining([
        [
          'GET /api/v1/market-data/reference/symbols/search',
          expect.objectContaining({ replacement: 'GET /api/v2/instruments' }),
        ],
        [
          'GET /api/v1/market-data/reference/symbols/{symbol}',
          expect.objectContaining({ replacement: 'GET /api/v2/instruments/{symbol}' }),
        ],
      ]),
    );
  });
});

describe('generated OpenAPI consumer types', () => {
  it('contains the full baseline while retaining instruments and health routes', () => {
    const document = JSON.parse(
      readFileSync(new URL('../../contracts/openapi-v2.json', import.meta.url), 'utf8'),
    ) as { paths: Record<string, Record<string, unknown>> };
    const operations = Object.entries(document.paths)
      .flatMap(([path, pathItem]) =>
        Object.keys(pathItem)
          .filter((method) =>
            ['delete', 'get', 'head', 'options', 'patch', 'post', 'put'].includes(method),
          )
          .map((method) => `${method.toUpperCase()} ${path}`),
      )
      .sort();

    expect(operations.length).toBeGreaterThanOrEqual(630);
    expect(operations).toEqual(
      expect.arrayContaining([
        'GET /api/v1/market-data/reference/symbols/search',
        'GET /api/v1/market-data/reference/symbols/{symbol}',
        'GET /api/v2/instruments',
        'GET /api/v2/instruments/{symbol}',
        'GET /health/live',
        'GET /health/ready',
      ]),
    );
  });

  it('contains only type artifacts and exposes both native and compatibility contracts', () => {
    const clientUrl = new URL('../../contracts/client/', import.meta.url);
    const files = readdirSync(clientUrl).sort();
    const generated = files
      .map((file) => readFileSync(new URL(file, clientUrl), 'utf8'))
      .join('\n');

    expect(files).toEqual(['index.ts', 'types.gen.ts']);
    expect(generated).toContain('export type SearchInstrumentsV2Data');
    expect(generated).toContain('export type SearchSymbolsV1CompatibilityData');
    expect(generated).not.toMatch(/\bexport\s+(?:class|const|enum|function)\b/);
    expect(generated).not.toContain('@hey-api/client');
  });
});

describe('migration disposition links', () => {
  const loadContracts = () => ({
    dispositions: JSON.parse(
      readFileSync(new URL('../../contracts/legacy-v1-dispositions.json', import.meta.url), 'utf8'),
    ) as unknown,
    legacy: JSON.parse(
      readFileSync(new URL('../../contracts/legacy-v1-endpoints.json', import.meta.url), 'utf8'),
    ) as unknown,
    openApi: JSON.parse(
      readFileSync(new URL('../../contracts/openapi-v2.json', import.meta.url), 'utf8'),
    ) as unknown,
  });

  it('resolves every implemented replacement to a generated operation', () => {
    expect(() => validateImplementedReplacements(loadContracts())).not.toThrow();
  });

  it('rejects an approved replacement containing a path typo', () => {
    const contracts = loadContracts();
    const dispositions = structuredClone(contracts.dispositions) as {
      overrides: Record<string, { replacement?: string }>;
    };
    const decision = dispositions.overrides['GET /api/v1/market-data/reference/symbols/search'];
    if (!decision) throw new Error('instrument search disposition fixture is missing');
    decision.replacement = 'GET /api/v2/instrument-typo';

    expect(() => validateImplementedReplacements({ ...contracts, dispositions })).toThrow(
      'Implemented replacement is absent from generated OpenAPI',
    );
  });
});
