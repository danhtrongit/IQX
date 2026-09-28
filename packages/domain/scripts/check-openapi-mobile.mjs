import { readFile } from 'node:fs/promises';

const document = JSON.parse(await readFile(new URL('../../../backend-v2/contracts/openapi-v2.json', import.meta.url), 'utf8'));
const required = [
  '/api/v2/mobile/premium/products',
  '/api/v2/mobile/premium/purchases/apple/verify',
  '/api/v2/mobile/premium/purchases/google/verify',
  '/api/v2/mobile/market-data/ws-ticket',
  '/api/v2/mobile/devices',
  '/api/v2/users/me/deletion',
  '/api/v2/users/me/deletion-status',
  '/api/v2/users/me/export',
];
const missing = required.filter((path) => !document.paths?.[path]);
if (missing.length) throw new Error(`Missing mobile OpenAPI paths: ${missing.join(', ')}`);
console.log(`Mobile OpenAPI contract OK (${required.length} required paths).`);
