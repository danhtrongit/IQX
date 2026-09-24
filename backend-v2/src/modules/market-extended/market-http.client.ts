import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';

const ALLOWED_HOSTS = new Set([
  'trading.vietcap.com.vn',
  'iq.vietcap.com.vn',
  'ai.vietcap.com.vn',
  'data.maybanktrade.com.vn',
  'api.fmarket.vn',
  'api.simplize.vn',
  'sjc.com.vn',
  'www.vietcombank.com.vn',
  'assets.msn.com',
  'api.binance.com',
  'api-gcp.binance.com',
  'api1.binance.com',
  'api2.binance.com',
  'api3.binance.com',
  'api4.binance.com',
  'sheets.googleapis.com',
  'docs.google.com',
  'vnexpress.net',
  'tuoitre.vn',
  'cafebiz.vn',
  'vietstock.vn',
  'thanhnien.vn',
  'dantri.com.vn',
  'vietnamnet.vn',
]);

export type MarketRequestOptions = {
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  body?: unknown;
  form?: URLSearchParams;
  timeoutMs?: number;
};

@Injectable()
export class MarketHttpClient {
  async json<T = unknown>(
    url: string,
    method: 'GET' | 'POST' = 'GET',
    options: MarketRequestOptions = {},
  ): Promise<T> {
    const response = await this.request(url, method, options);
    try {
      return (await response.json()) as T;
    } catch {
      throw new BadGatewayException({
        code: 'UPSTREAM_INVALID_RESPONSE',
        message: 'Upstream returned invalid JSON',
      });
    }
  }

  async text(
    url: string,
    options: MarketRequestOptions = {},
  ): Promise<{ text: string; contentType: string; url: string }> {
    const response = await this.request(url, 'GET', options);
    return {
      text: await response.text(),
      contentType: response.headers.get('content-type') ?? '',
      url: response.url,
    };
  }

  private async request(
    urlValue: string,
    method: 'GET' | 'POST',
    options: MarketRequestOptions,
  ): Promise<Response> {
    const url = new URL(urlValue);
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
      throw new ServiceUnavailableException({
        code: 'UPSTREAM_NOT_ALLOWED',
        message: 'Market data upstream is not allowed',
      });
    }
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null && value !== '')
        url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 IQX-backend-v2/1.0',
      ...options.headers,
    };
    let body: string | undefined;
    if (options.form) {
      headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      body = options.form.toString();
    } else if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) {
        if (response.status === 404)
          throw new BadGatewayException({
            code: 'UPSTREAM_NOT_FOUND',
            message: 'Upstream resource not found',
          });
        if (response.status === 429 || response.status >= 500) {
          throw new ServiceUnavailableException({
            code: 'UPSTREAM_UNAVAILABLE',
            message: 'Market data upstream is unavailable',
          });
        }
        throw new BadGatewayException({
          code: 'UPSTREAM_REJECTED',
          message: `Upstream rejected request (${response.status})`,
        });
      }
      return response;
    } catch (error) {
      if (error instanceof BadGatewayException || error instanceof ServiceUnavailableException)
        throw error;
      throw new ServiceUnavailableException({
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Market data upstream is unavailable',
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
