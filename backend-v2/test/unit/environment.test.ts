import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/platform/config/environment.js';
import { ConfigurationModule } from '../../src/platform/config/configuration.module.js';

const productionSettings = {
  APP_ENV: 'production',
  DATABASE_URL: 'postgres://localhost/iqx',
  REDIS_ENABLED: 'true',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET_KEY: 'a'.repeat(32),
  JWT_REFRESH_SECRET_KEY: 'b'.repeat(32),
};

const providerUrls = [
  ['AI_PROXY_BASE_URL', 'http:', 'https:'],
  ['EMAIL_PROVIDER_URL', 'http:', 'https:'],
  ['DNSE_AUTH_URL', 'http:', 'https:'],
  ['DNSE_ME_URL', 'http:', 'https:'],
  ['DNSE_OPENAPI_WS_URL', 'ws:', 'wss:'],
  ['DNSE_MQTT_URL', 'mqtt:', 'mqtts:'],
  ['REALTIME_DNSE_MQTT_URL', 'mqtt:', 'mqtts:'],
] as const;

describe('environment boundary', () => {
  it('defaults to local safe modes with no implicit database or Redis', () => {
    const env = parseEnvironment({});
    expect(env.APP_ENV).toBe('development');
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.REDIS_ENABLED).toBe(false);
    expect(env.QUEUE_ENABLED).toBe(false);
    expect(env.MARKET_INGEST_ENABLED).toBe(false);
    expect(env.API_DOCS_ENABLED).toBe(false);
  });
  it.each(['false', '0', ''])('does not coerce %s to true', (value) => {
    expect(parseEnvironment({ REDIS_ENABLED: value }).REDIS_ENABLED).toBe(false);
  });
  it.each(['yes', 'no', 'FALSE', 'unexpected'])('rejects ambiguous boolean %s', (value) => {
    expect(() => parseEnvironment({ REDIS_ENABLED: value })).toThrow('Invalid configuration');
  });
  it('requires explicit dependencies and strict positive bounds', () => {
    expect(() => parseEnvironment({ APP_ENV: 'production' })).toThrow('DATABASE_URL');
    expect(() => parseEnvironment({ REDIS_ENABLED: 'true' })).toThrow('REDIS_URL');
    expect(() => parseEnvironment({ QUEUE_ENABLED: 'true' })).toThrow('REDIS_ENABLED');
    expect(() => parseEnvironment({ DB_POOL_MAX: '0' })).toThrow('DB_POOL_MAX');
    expect(() => parseEnvironment({ PORT: 'NaN' })).toThrow('PORT');
  });
  it('rejects wildcard CORS and paths and requires HTTPS in production', () => {
    expect(() => parseEnvironment({ CORS_ORIGINS: '*' })).toThrow('CORS_ORIGINS');
    expect(() => parseEnvironment({ CORS_ORIGINS: 'https://iqx.example/path' })).toThrow(
      'CORS_ORIGINS',
    );
    expect(() =>
      parseEnvironment({
        APP_ENV: 'production',
        DATABASE_URL: 'postgres://localhost/iqx',
        CORS_ORIGINS: 'http://iqx.example',
      }),
    ).toThrow('CORS_ORIGINS');
  });
  it('never includes a supplied connection secret in validation errors', () => {
    expect(() =>
      parseEnvironment({ DATABASE_URL: 'mysql://user:secret-value@localhost/db' }),
    ).toThrow('Unsupported URL protocol');
    try {
      parseEnvironment({ DATABASE_URL: 'mysql://user:secret-value@localhost/db' });
    } catch (error) {
      expect(String(error)).not.toContain('secret-value');
    }
  });
  it.each(providerUrls)('rejects remote plaintext %s in production', (key, insecure) => {
    const value = `${insecure}//user:provider-secret@provider.example/path`;
    try {
      parseEnvironment({ ...productionSettings, [key]: value });
      throw new Error('Expected invalid configuration');
    } catch (error) {
      expect(String(error)).toContain(key);
      expect(String(error)).not.toContain('provider-secret');
    }
  });
  it.each(providerUrls)('accepts secure %s in production', (key, _insecure, secure) => {
    expect(
      parseEnvironment({ ...productionSettings, [key]: `${secure}//provider.example/path` })[key],
    ).toBe(`${secure}//provider.example/path`);
  });
  it.each(providerUrls)('accepts plaintext %s only at exact loopback hosts', (key, insecure) => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      const value = `${insecure}//${host}:1234/path`;
      expect(parseEnvironment({ ...productionSettings, [key]: value })[key]).toBe(value);
    }
    for (const host of ['localhost.example', '127.0.0.2', '[::2]']) {
      expect(() =>
        parseEnvironment({ ...productionSettings, [key]: `${insecure}//${host}/path` }),
      ).toThrow(key);
    }
  });
  it('keeps optional provider URLs absent in valid production defaults', () => {
    const env = parseEnvironment(productionSettings);
    for (const [key] of providerUrls) expect(env[key]).toBeUndefined();
  });
  it.each(['DNSE_MQTT_URL', 'REALTIME_DNSE_MQTT_URL'] as const)(
    'also requires secure WebSocket transport for %s',
    (key) => {
      expect(() =>
        parseEnvironment({ ...productionSettings, [key]: 'ws://provider.example/mqtt' }),
      ).toThrow(key);
      expect(
        parseEnvironment({ ...productionSettings, [key]: 'wss://provider.example/mqtt' })[key],
      ).toBe('wss://provider.example/mqtt');
    },
  );
  it('permits remote plaintext provider URLs outside production', () => {
    expect(
      parseEnvironment({ AI_PROXY_BASE_URL: 'http://provider.example/v1' }).AI_PROXY_BASE_URL,
    ).toBe('http://provider.example/v1');
  });
  it('uses explicitly injected configuration instead of inherited process environment', () => {
    const module = ConfigurationModule.forEnvironment({ APP_ENV: 'test' });
    expect(module.global).toBe(true);
    expect(module.imports).toHaveLength(1);
  });
  it('trusts only explicit proxy IPs/CIDRs and refuses blanket trust', () => {
    expect(
      parseEnvironment({ TRUST_PROXY_CIDRS: '127.0.0.1,10.20.0.0/16' }).TRUST_PROXY_CIDRS,
    ).toEqual(['127.0.0.1', '10.20.0.0/16']);
    for (const value of ['true', '*', '0.0.0.0/0', '::/0', 'evil.example'])
      expect(() => parseEnvironment({ TRUST_PROXY_CIDRS: value })).toThrow('TRUST_PROXY_CIDRS');
  });
});
