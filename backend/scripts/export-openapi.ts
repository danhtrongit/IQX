import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createApiApp, createOpenApiDocument } from '../src/app.js';
import { validateImplementedReplacements } from './validate-contract-links.js';

const outputPath = resolve(process.cwd(), 'contracts/openapi-v2.json');
const legacyPath = resolve(process.cwd(), 'contracts/legacy-v1-endpoints.json');
const dispositionsPath = resolve(process.cwd(), 'contracts/legacy-v1-dispositions.json');

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

async function renderOpenApi(): Promise<string> {
  const app = await createApiApp({
    environment: {
      APP_ENV: 'test',
      API_DOCS_ENABLED: 'true',
      MARKET_INGEST_ENABLED: 'false',
      QUEUE_ENABLED: 'false',
      REDIS_ENABLED: 'false',
    },
    logger: false,
  });

  try {
    await app.init();
    const document = createOpenApiDocument(app);
    return `${JSON.stringify(canonicalize(document), null, 2)}\n`;
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  const expected = await renderOpenApi();
  validateImplementedReplacements({
    dispositions: JSON.parse(await readFile(dispositionsPath, 'utf8')) as unknown,
    legacy: JSON.parse(await readFile(legacyPath, 'utf8')) as unknown,
    openApi: JSON.parse(expected) as unknown,
  });
  if (process.argv.slice(2).includes('--check')) {
    let actual: string;
    try {
      actual = await readFile(outputPath, 'utf8');
    } catch (error) {
      console.error(`OpenAPI snapshot is missing: ${String(error)}`);
      process.exitCode = 1;
      return;
    }
    if (actual !== expected) {
      console.error('OpenAPI snapshot is stale; run `npm run contracts:generate` from backend-v2.');
      process.exitCode = 1;
      return;
    }
    console.log('OpenAPI snapshot is current');
    return;
  }

  await writeFile(outputPath, expected, 'utf8');
  console.log(`wrote ${outputPath}`);
}

await main();
