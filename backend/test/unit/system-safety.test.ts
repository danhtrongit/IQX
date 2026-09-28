import { describe, expect, it } from 'vitest';

import {
  assertConnectedSystemTestDatabase,
  installIsolatedRuntimeEnvironment,
  requireSystemTestDatabaseName,
} from '../system/service-safety.js';

describe('system acceptance service safety', () => {
  it.each([
    'postgresql://tester:secret@127.0.0.1:55484/iqx_v2_system_tests',
    'postgresql://tester:secret@localhost:55484/iqx_v2_system_12345',
    'postgresql://tester:secret@[::1]:55484/iqx_v2_test_instruments',
  ])('accepts an explicitly test-scoped database name: %s', (connectionString) => {
    expect(requireSystemTestDatabaseName(connectionString)).toMatch(/^iqx_v2_(system|test)_/);
  });

  it.each([
    'postgresql://localhost/iqx_v2_production',
    'postgresql://localhost/iqx_v2_local',
    'postgresql://localhost/iqx_v2_system',
    'postgresql://localhost/iqx_v2_test',
    'postgresql://localhost/postgres',
  ])('rejects a database without an explicit system/test suffix: %s', (connectionString) => {
    expect(() => requireSystemTestDatabaseName(connectionString)).toThrow(
      /iqx_v2_system_\* or iqx_v2_test_\*/,
    );
  });

  it.each([
    'postgresql://localhost/iqx_v2_system_tests?dbname=iqx_v2_production',
    'postgresql://localhost/iqx_v2_system_tests?database=iqx_v2_production',
    'postgresql://localhost/iqx_v2_system_tests?host=production.example',
  ])('rejects connection-string query target overrides: %s', (connectionString) => {
    expect(() => requireSystemTestDatabaseName(connectionString)).toThrow(/query parameters/);
  });

  it('requires the connected identity to exactly match the URL path before writes', () => {
    const expected = requireSystemTestDatabaseName('postgresql://localhost/iqx_v2_system_tests');

    expect(() => assertConnectedSystemTestDatabase(expected, 'iqx_v2_production')).toThrow(
      /refuse connected database/,
    );
    expect(() => assertConnectedSystemTestDatabase(expected, 'iqx_v2_test_other')).toThrow(
      /identity mismatch/,
    );
    expect(() => assertConnectedSystemTestDatabase(expected, expected)).not.toThrow();
  });

  it('isolates direct process-environment readers and restores ambient values', () => {
    const ambient: Record<string, string | undefined> = {
      APP_ENV: 'production',
      CAP_MAX_ENABLED: '8',
      DNSE_API_KEY: 'production-secret',
      DNSE_API_SECRET: 'production-secret',
      DNSE_OPENAPI_WS_URL: 'wss://production.example/ws',
      DNSE_USERNAME: 'production-user',
      REALTIME_DNSE_PASSWORD: 'production-password',
      JOB_ALERTS_SCAN_ENABLED: 'true',
      UNRELATED_SETTING: 'preserved',
    };

    const restore = installIsolatedRuntimeEnvironment(
      {
        APP_ENV: 'test',
        CAP_MAX_ENABLED: '6',
        JOB_ALERTS_SCAN_ENABLED: 'false',
      },
      ambient,
    );

    expect(ambient).toMatchObject({
      APP_ENV: 'production',
      CAP_MAX_ENABLED: '6',
      JOB_ALERTS_SCAN_ENABLED: 'false',
      UNRELATED_SETTING: 'preserved',
    });
    expect(ambient.DNSE_API_KEY).toBeUndefined();
    expect(ambient.DNSE_API_SECRET).toBeUndefined();
    expect(ambient.DNSE_OPENAPI_WS_URL).toBeUndefined();
    expect(ambient.DNSE_USERNAME).toBeUndefined();
    expect(ambient.REALTIME_DNSE_PASSWORD).toBeUndefined();

    restore();
    restore();
    expect(ambient).toEqual({
      APP_ENV: 'production',
      CAP_MAX_ENABLED: '8',
      DNSE_API_KEY: 'production-secret',
      DNSE_API_SECRET: 'production-secret',
      DNSE_OPENAPI_WS_URL: 'wss://production.example/ws',
      DNSE_USERNAME: 'production-user',
      REALTIME_DNSE_PASSWORD: 'production-password',
      JOB_ALERTS_SCAN_ENABLED: 'true',
      UNRELATED_SETTING: 'preserved',
    });
  });
});
