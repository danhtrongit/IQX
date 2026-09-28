import { describe, expect, it } from 'vitest';

import {
  assertIsolatedTestDatabaseUrl,
  assertIsolatedTestRedisUrl,
} from '../helpers/test-stack.js';

describe('isolated integration service guards', () => {
  it('accepts only an explicitly named localhost test database', () => {
    expect(
      assertIsolatedTestDatabaseUrl(
        'postgresql://tester:secret@127.0.0.1:55432/iqx_v2_test_contracts',
      ).pathname,
    ).toBe('/iqx_v2_test_contracts');

    expect(() =>
      assertIsolatedTestDatabaseUrl('postgresql://tester:secret@127.0.0.1:55432/iqx'),
    ).toThrow(/iqx_v2_test_/);
    expect(() =>
      assertIsolatedTestDatabaseUrl(
        'postgresql://tester:secret@database.example/iqx_v2_test_contracts',
      ),
    ).toThrow(/localhost/);
  });

  it('requires localhost and a dedicated Redis port/database', () => {
    expect(assertIsolatedTestRedisUrl('redis://127.0.0.1:56379/15').pathname).toBe('/15');

    expect(() => assertIsolatedTestRedisUrl('redis://127.0.0.1:6379/15')).toThrow(
      /non-default port/,
    );
    expect(() => assertIsolatedTestRedisUrl('redis://127.0.0.1:56379/0')).toThrow(
      /non-default Redis database/,
    );
    expect(() => assertIsolatedTestRedisUrl('redis://cache.example:56379/15')).toThrow(/localhost/);
  });
});
