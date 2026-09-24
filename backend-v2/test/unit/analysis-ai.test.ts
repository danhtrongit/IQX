import { ServiceUnavailableException, BadGatewayException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiProviderService } from '../../src/modules/analysis/ai-provider.service.js';
import { AnalysisService } from '../../src/modules/analysis/analysis.service.js';
import { promptFor } from '../../src/modules/analysis/prompts.js';
import type { Environment } from '../../src/platform/config/environment.js';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  delete process.env.AI_PROXY_BASE_URL;
  delete process.env.AI_PROXY_API_KEY;
});

function config(overrides: Partial<Environment> = {}): ConfigService<Environment, true> {
  const values = {
    AI_PROXY_BASE_URL: undefined,
    AI_PROXY_API_KEY: undefined,
    AI_PROXY_MODEL: undefined,
    AI_PROXY_TIMEOUT_MS: 120_000,
    AI_PROXY_RETRIES: 2,
    ...overrides,
  } as Environment;
  return { get: vi.fn((key: keyof Environment) => values[key]) } as unknown as ConfigService<
    Environment,
    true
  >;
}

describe('AiProviderService', () => {
  it('fails closed when credentials are missing', async () => {
    process.env.AI_PROXY_BASE_URL = 'https://ambient-credential.example/v1';
    process.env.AI_PROXY_API_KEY = 'ambient-secret';
    await expect(new AiProviderService(config()).complete('system', 'user')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('parses an OpenAI-compatible response without logging payloads', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'test',
          choices: [{ message: { content: 'ok' } }],
          usage: { total_tokens: 12 },
        }),
        { status: 200 },
      ),
    );
    const service = new AiProviderService(
      config({ AI_PROXY_BASE_URL: 'https://ai.example/v1', AI_PROXY_API_KEY: 'secret' }),
    );
    await expect(service.complete('system', 'user')).resolves.toMatchObject({
      content: 'ok',
      model: 'test',
      usage: { totalTokens: 12 },
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/v1/chat/completions' }),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer secret' }),
      }),
    );
  });

  it('retries 429 then maps the final response to a bounded unavailable error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
    const service = new AiProviderService(
      config({
        AI_PROXY_BASE_URL: 'https://ai.example/v1',
        AI_PROXY_API_KEY: 'secret',
        AI_PROXY_RETRIES: 1,
      }),
    );
    await expect(service.complete('system', 'user')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AI_RATE_LIMITED' }),
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed successful responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{"choices":[]}', { status: 200 }));
    const service = new AiProviderService(
      config({ AI_PROXY_BASE_URL: 'https://ai.example/v1', AI_PROXY_API_KEY: 'secret' }),
    );
    await expect(service.complete('system', 'user')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('uses the documented Flash API ID and disables thinking only when configured', async () => {
    const requests: Record<string, unknown>[] = [];
    globalThis.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }],
        }),
      );
    });
    const credentials = {
      AI_PROXY_BASE_URL: 'https://api.deepseek.com',
      AI_PROXY_API_KEY: 'secret',
    };
    await new AiProviderService(config({ ...credentials, AI_PROXY_THINKING: 'disabled' })).complete(
      'system',
      'user',
      { json: true },
    );
    await new AiProviderService(config(credentials)).complete('system', 'user');
    expect(requests[0]).toMatchObject({
      model: 'deepseek-flash',
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
    });
    expect(requests[1]).not.toHaveProperty('thinking');
  });

  it.each(['', '{"ok":true}'])(
    'rejects token-limited output even if content looks valid: %s',
    async (content) => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ choices: [{ finish_reason: 'length', message: { content } }] }),
          ),
        );
      const service = new AiProviderService(
        config({ AI_PROXY_BASE_URL: 'https://api.deepseek.com', AI_PROXY_API_KEY: 'secret' }),
      );
      await expect(service.complete('system', 'user')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'AI_OUTPUT_TRUNCATED' }),
      });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('never exposes reasoning as the public answer', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: { content: '', reasoning_content: 'private reasoning' },
            },
          ],
        }),
      ),
    );
    const service = new AiProviderService(
      config({ AI_PROXY_BASE_URL: 'https://api.deepseek.com', AI_PROXY_API_KEY: 'secret' }),
    );
    await expect(service.complete('system', 'user')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AI_INVALID_RESPONSE' }),
    });
  });
});

describe('AI policy and prompts', () => {
  it('loads the checked-in legacy prompt assets and adds a versioned policy', () => {
    const prompt = promptFor('insight');
    expect(prompt.version).toMatch(/^insight-v/);
    expect(prompt.text.length).toBeGreaterThan(500);
  });

  it('fails closed on narrative forbidden recommendations', () => {
    const service = Object.create(AnalysisService.prototype) as AnalysisService;
    expect(() =>
      (
        service as unknown as {
          validateNarrative(value: Record<string, unknown>, template: string): unknown;
        }
      ).validateNarrative(
        { verdict_oneliner: 'nên mua', story: { paragraphs: ['a', 'b', 'c'] }, blocks: {} },
        'A',
      ),
    ).toThrow(BadGatewayException);
  });

  it('rejects a structurally incomplete insight instead of filling missing layers', () => {
    const service = Object.create(AnalysisService.prototype) as AnalysisService;
    expect(() =>
      (
        service as unknown as { validateInsight(value: Record<string, unknown>): unknown }
      ).validateInsight({ L1: {} }),
    ).toThrow(BadGatewayException);
  });

  it('rejects financial narrative numbers absent from deterministic input', () => {
    const service = Object.create(AnalysisService.prototype) as AnalysisService;
    const output = {
      verdict_oneliner: 'Doanh thu tăng 777%',
      story: {
        lead: 'Ổn định',
        paragraphs: ['Một', 'Hai', 'Ba'],
        strengths: ['Khỏe'],
        watchlist: ['Rủi ro'],
      },
      blocks: {
        valuation: { answer: 'Ổn định' },
        financial: { answer: 'Ổn định' },
        business: { answer: 'Ổn định' },
        cashflow: { answer: 'Ổn định' },
        dividend: { answer: 'Ổn định' },
        health: { answer: 'Ổn định', sub: { a: 'a', b: 'b', c: 'c' } },
      },
    };
    expect(() =>
      (
        service as unknown as {
          validateNarrative(
            value: Record<string, unknown>,
            template: string,
            payload: Record<string, unknown>,
          ): unknown;
        }
      ).validateNarrative(output, 'A', { revenue: 10 }),
    ).toThrow(/777/);
  });

  it('propagates insight persistence failure as service unavailable', async () => {
    const service = Object.assign(Object.create(AnalysisService.prototype) as AnalysisService, {
      database: { query: vi.fn().mockRejectedValue(new Error('database write failed')) },
    });
    await expect(
      (
        service as unknown as {
          saveInsight(symbol: string, result: Record<string, unknown>): Promise<void>;
        }
      ).saveInsight('VCB', { layers: {} }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AI_HISTORY_PERSIST_FAILED' }),
    });
  });
});
