import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockApiApp } from '../helpers/api-app.js';
import { LifecycleService } from '../../src/platform/health/lifecycle.service.js';

describe('HTTP platform boundary', () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => {
    await app?.close();
  });
  const emptyRepository = () => ({
    search: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    findBySymbol: vi.fn().mockResolvedValue(null),
  });
  it('sanitizes malformed URLs before routing and still emits a request ID', async () => {
    app = await createMockApiApp(emptyRepository());
    const reply = await app.inject({ method: 'GET', url: '/bad%zz' });
    expect(reply.statusCode).toBe(400);
    expect(reply.headers['x-request-id']).toEqual(expect.any(String));
    expect(reply.json()).toEqual({
      error: { code: 'BAD_REQUEST', message: 'Yêu cầu không hợp lệ' },
      request_id: reply.headers['x-request-id'],
    });
    expect(reply.body).not.toContain('/bad%zz');
  });
  it('throttles public API requests while exempting health probes', async () => {
    app = await createMockApiApp(emptyRepository(), {
      RATE_LIMIT_MAX: '1',
      RATE_LIMIT_TTL_MS: '60000',
    });
    expect((await app.inject('/api/v2/instruments')).statusCode).toBe(200);
    const rejected = await app.inject('/api/v2/instruments');
    expect(rejected.statusCode).toBe(429);
    expect(rejected.json().error.code).toBe('RATE_LIMITED');
    expect(rejected.headers['retry-after']).toBeDefined();
    expect((await app.inject('/health/live')).statusCode).toBe(200);
    expect((await app.inject('/health/live')).statusCode).toBe(200);
  });
  it('retains request ID across body and headers and does not trust spoofed forwarded IPs', async () => {
    app = await createMockApiApp(emptyRepository(), { RATE_LIMIT_MAX: '1' });
    const first = await app.inject({
      method: 'GET',
      url: '/api/v2/instruments',
      headers: { 'x-request-id': 'checked-id', 'x-forwarded-for': '192.0.2.1' },
    });
    expect(first.headers['x-request-id']).toBe('checked-id');
    expect(first.json().meta.request_id).toBe('checked-id');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v2/instruments',
          headers: { 'x-forwarded-for': '192.0.2.2' },
        })
      ).statusCode,
    ).toBe(429);
  });
  it('reports not-ready once shutdown begins', async () => {
    app = await createMockApiApp(emptyRepository());
    app.get(LifecycleService).beginDraining();
    expect((await app.inject('/health/ready')).statusCode).toBe(503);
    expect((await app.inject('/health/live')).statusCode).toBe(200);
  });
  it('permits only the nonce-bearing reset form script under CSP', async () => {
    app = await createMockApiApp(emptyRepository());
    const reply = await app.inject('/api/v2/auth/reset-password?token=example-safe-token');
    expect(reply.statusCode).toBe(200);
    const nonce = /<script nonce="([a-zA-Z0-9_-]+)">/.exec(reply.body)?.[1];
    expect(nonce).toBeTruthy();
    expect(reply.headers['content-security-policy']).toContain(`'nonce-${nonce}'`);
    expect(reply.headers['content-security-policy']).not.toContain('unsafe-inline');
    expect(reply.headers['cache-control']).toBe('no-store');
  });
  it('preserves legacy field-level validation errors and their order', async () => {
    app = await createMockApiApp(emptyRepository());
    const reply = await app.inject(
      '/api/v1/market-data/reference/symbols/search?include_indices=bad&page=0&page_size=101',
    );
    expect(reply.statusCode).toBe(422);
    expect(reply.json()).toEqual({
      detail: [
        {
          type: 'bool_parsing',
          loc: ['query', 'include_indices'],
          msg: 'Input should be a valid boolean, unable to interpret input',
          input: 'bad',
        },
        {
          type: 'greater_than_equal',
          loc: ['query', 'page'],
          msg: 'Input should be greater than or equal to 1',
          input: '0',
          ctx: { ge: 1 },
        },
        {
          type: 'less_than_equal',
          loc: ['query', 'page_size'],
          msg: 'Input should be less than or equal to 100',
          input: '101',
          ctx: { le: 100 },
        },
      ],
    });
  });
});
