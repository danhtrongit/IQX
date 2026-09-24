import { readFile, writeFile } from 'node:fs/promises';

const coverage = JSON.parse(await readFile('contracts/api-coverage.json', 'utf8')) as {
  coverage: { http: { mapped: number; total: number } };
  mappings: Array<{ source: string; target: string | null }>;
};
const openapi = JSON.parse(await readFile('contracts/openapi-v2.json', 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
};
const shape = (value: string) => value.replace(/\{[^/{}]+\}/g, '{}');
const candidates = new Map<string, string>();
for (const [path, item] of Object.entries(openapi.paths))
  for (const method of Object.keys(item)) {
    if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method))
      candidates.set(shape(`${method.toUpperCase()} ${path}`), `${method.toUpperCase()} ${path}`);
  }
if (coverage.coverage.http.mapped !== coverage.coverage.http.total)
  throw new Error('Cannot update dispositions while HTTP coverage is incomplete');
const overrides: Record<string, { disposition: string; replacement: string; notes: string }> = {};
for (const mapping of coverage.mappings) {
  if (mapping.source.startsWith('WEBSOCKET ') || mapping.source.startsWith('WS ')) continue;
  if (!mapping.target) throw new Error(`Unmapped API: ${mapping.source}`);
  const versioned = mapping.target.replace('/api/v1/', '/api/v2/');
  const canonical = candidates.get(shape(versioned)) ?? mapping.target;
  overrides[mapping.source] = {
    disposition: 'implemented',
    replacement: canonical,
    notes:
      'Implemented in NestJS. Runtime route coverage is verified separately from provider credentials, production acceptance, and data migration.',
  };
}
overrides['GET /api/v1/market-data/reference/symbols/search']!.replacement =
  'GET /api/v2/instruments';
overrides['GET /api/v1/market-data/reference/symbols/{symbol}']!.replacement =
  'GET /api/v2/instruments/{symbol}';
const document = {
  schemaVersion: 1,
  defaultDisposition: 'pending',
  notes:
    'Full HTTP implementation inventory; WebSocket coverage is tracked in api-coverage.json. New unclassified endpoints remain pending, never implicitly unused.',
  overrides: Object.fromEntries(Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b))),
};
await writeFile('contracts/legacy-v1-dispositions.json', `${JSON.stringify(document, null, 2)}\n`);
console.log(`Recorded ${Object.keys(overrides).length} implemented HTTP endpoint mappings.`);
