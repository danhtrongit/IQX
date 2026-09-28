const TEST_DATABASE_NAME = /^iqx_v2_(?:system|test)_[a-z0-9_]+$/;

const DIRECT_RUNTIME_ENVIRONMENT_KEYS = ['CAP_MAX_ENABLED'] as const;
const DIRECT_RUNTIME_ENVIRONMENT_PREFIXES = ['DNSE_', 'REALTIME_DNSE_', 'JOB_'] as const;

export function requireSystemTestDatabaseName(connectionString: string): string {
  const url = new URL(connectionString);
  const targetOverrideKeys = new Set([
    'dbname',
    'database',
    'host',
    'port',
    'user',
    'username',
    'password',
    'options',
  ]);
  const unsafeQueryKey = [...url.searchParams.keys()].find((key) =>
    targetOverrideKeys.has(key.toLowerCase()),
  );
  if (unsafeQueryKey || url.hash) {
    throw new Error(
      `System acceptance test database URLs must not override target with query parameters${unsafeQueryKey ? ` (${unsafeQueryKey})` : ''}`,
    );
  }
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!TEST_DATABASE_NAME.test(databaseName)) {
    throw new Error(
      `System acceptance tests require an iqx_v2_system_* or iqx_v2_test_* database; received ${databaseName || '<empty>'}`,
    );
  }
  return databaseName;
}

export function assertConnectedSystemTestDatabase(
  expectedDatabaseName: string,
  connectedDatabaseName: string,
): void {
  if (!TEST_DATABASE_NAME.test(connectedDatabaseName)) {
    throw new Error(
      `System acceptance tests refuse connected database: ${connectedDatabaseName || '<empty>'}`,
    );
  }
  if (connectedDatabaseName !== expectedDatabaseName) {
    throw new Error(
      `System acceptance test database identity mismatch: expected ${expectedDatabaseName}, connected ${connectedDatabaseName}`,
    );
  }
}

/**
 * A few legacy services still consult process.env directly. Keep those reads
 * isolated to the explicit system-test environment for the full app lifetime,
 * then restore the caller's environment exactly.
 */
export function installIsolatedRuntimeEnvironment(
  explicitEnvironment: Readonly<Record<string, string | undefined>>,
  targetEnvironment: Record<string, string | undefined> = process.env,
): () => void {
  const keys = new Set<string>(DIRECT_RUNTIME_ENVIRONMENT_KEYS);
  for (const key of [...Object.keys(targetEnvironment), ...Object.keys(explicitEnvironment)]) {
    if (DIRECT_RUNTIME_ENVIRONMENT_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      keys.add(key);
    }
  }

  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, targetEnvironment[key]);
    const explicitValue = explicitEnvironment[key];
    if (explicitValue === undefined) delete targetEnvironment[key];
    else targetEnvironment[key] = explicitValue;
  }

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const [key, value] of previous) {
      if (value === undefined) delete targetEnvironment[key];
      else targetEnvironment[key] = value;
    }
  };
}
