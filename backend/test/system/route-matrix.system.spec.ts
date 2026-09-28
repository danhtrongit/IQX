import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOpenApiDocument } from '../../src/app.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head'] as const;
const ALLOWED = new Set([
  200, 201, 202, 204, 400, 401, 403, 404, 405, 409, 413, 415, 422, 429, 502, 503, 504,
]);
const UUID = '00000000-0000-4000-8000-000000000099';

function concretePath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, (_match, parameter: string) => {
    const name = String(parameter).toLowerCase();
    if (name.includes('symbol')) return 'VCB';
    if (name.includes('date')) return '2026-01-01';
    if (name.includes('token')) return 'invalid-token';
    if (name.includes('indicator')) return 'gdp';
    if (name.includes('commodity') || name === 'code') return 'gold';
    if (name.includes('fund')) return '1';
    if (name.includes('type')) return 'daily';
    if (name.includes('slug')) return 'missing-system-resource';
    return UUID;
  });
}

function payloadFor(path: string, method: string): Record<string, unknown> | undefined {
  if (method === 'get' || method === 'head' || method === 'delete') return undefined;
  if (path.includes('/auth/register'))
    return { email: 'matrix@example.test', password: 'System!Passw0rd', full_name: 'Matrix' };
  if (path.includes('/auth/login'))
    return { email: 'matrix@example.test', password: 'System!Passw0rd' };
  if (path.includes('/auth/refresh')) return { refresh_token: 'invalid' };
  if (path.includes('/watchlists')) return { symbol: 'VCB' };
  if (path.includes('chart-drawings')) return { state: {} };
  if (path.includes('virtual-trading/orders'))
    return { symbol: 'VCB', side: 'buy', order_type: 'limit', quantity: 1, limit_price_vnd: 90000 };
  if (path.includes('placement')) return { answer: 'never' };
  return {};
}

describe('system acceptance: registered-route guard and DI matrix', () => {
  let stack: SystemStack;
  beforeAll(async () => {
    stack = await startSystemStack();
  });
  afterAll(async () => {
    await stack?.close();
  });

  async function checkRegisteredRoutes(accessToken?: string): Promise<void> {
    const document = createOpenApiDocument(stack.app);
    const cases: Array<{ method: (typeof METHODS)[number]; path: string }> = [];
    for (const [path, item] of Object.entries(document.paths)) {
      for (const method of METHODS) {
        if ((item as Record<string, unknown>)[method]) cases.push({ method, path });
      }
    }
    // The full v2 surface contains 315 legacy operations plus canonical v2
    // routes and additional operations. Keep a hard lower bound so this test
    // cannot silently pass against a partially wired Nest application.
    expect(cases.length).toBeGreaterThanOrEqual(650);
    const failures: Array<{ method: string; path: string; status: number; body: string }> = [];
    let completed = 0;
    for (let offset = 0; offset < cases.length; offset += 16) {
      const batch = cases.slice(offset, offset + 16);
      const responses = await Promise.all(
        batch.map((route) =>
          stack.app.inject({
            method: route.method.toUpperCase() as
              'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD',
            url: concretePath(route.path),
            payload: payloadFor(route.path, route.method),
            headers: accessToken ? authHeader(accessToken) : undefined,
          }),
        ),
      );
      for (const [index, response] of responses.entries()) {
        const route = batch[index]!;
        completed += 1;
        if (!ALLOWED.has(response.statusCode)) {
          failures.push({
            method: route.method.toUpperCase(),
            path: route.path,
            status: response.statusCode,
            body: response.body.slice(0, 300),
          });
        }
      }
      if (completed % 25 === 0 || completed === cases.length) {
        process.stdout.write(`[route-matrix] ${completed}/${cases.length}\n`);
      }
    }
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  }

  it('executes every anonymous route through its public handler or auth boundary', async () => {
    await checkRegisteredRoutes();
  });

  it('executes every registered route with a verified entitled administrator', async () => {
    const administrator = await registerAndLogin(stack.app, 'route-matrix-admin');
    await stack.query("UPDATE users SET role='admin', is_email_verified=true WHERE id=$1", [
      administrator.id,
    ]);
    await checkRegisteredRoutes(administrator.accessToken);
  });
});
