import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(packageDir, '../../frontend-v2/src/index.css');
const source = await readFile(sourcePath, 'utf8');
const nativeSource = await readFile(resolve(packageDir, 'src/index.ts'), 'utf8');
const hash = createHash('sha256').update(source).digest('hex');

function variablesIn(selector) {
  const match = new RegExp(`${selector.replace('.', '\\.') }\\s*\\{`).exec(source);
  if (!match) return new Map();
  const start = match.index;
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  const body = source.slice(open + 1, close);
  return new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, key, value]) => [key, value.trim()]));
}

const light = variablesIn(':root');
const dark = variablesIn('.dark');
const requiredLight = [
  '--background', '--foreground', '--card', '--primary', '--secondary', '--muted', '--accent', '--destructive',
  '--border', '--input', '--ring', '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--radius',
  '--price-up', '--price-down', '--price-ref', '--price-ceiling', '--price-floor', '--header-top', '--panel-header-height',
  '--sidebar-width', '--rail-width', '--page-padding', '--shadow-1', '--shadow-2', '--status-success', '--status-error',
  '--status-info', '--status-warning',
];
const requiredDark = ['--background', '--foreground', '--card', '--primary', '--secondary', '--muted', '--accent', '--destructive', '--border', '--input', '--ring', '--price-up', '--price-down', '--price-ref', '--price-ceiling', '--price-floor', '--shadow-1', '--shadow-2', '--status-success', '--status-error', '--status-info', '--status-warning'];
const missingLight = requiredLight.filter((key) => !light.has(key));
const missingDark = requiredDark.filter((key) => !dark.has(key));
const requiredNativeTokens = ['nativeColors', 'nativeMarketColors', 'typography', 'spacing', 'radius', 'motion', 'safeArea', 'touch'];
const missingNative = requiredNativeTokens.filter((name) => !new RegExp(`export const ${name}\\s*=`).test(nativeSource));
if (missingLight.length || missingDark.length || missingNative.length) {
  console.error('Design token parity check failed.');
  if (missingLight.length) console.error(`Missing in :root: ${missingLight.join(', ')}`);
  if (missingDark.length) console.error(`Missing in .dark: ${missingDark.join(', ')}`);
  if (missingNative.length) console.error(`Missing native token exports: ${missingNative.join(', ')}`);
  process.exit(1);
}
console.log(`Design token source parity OK (${light.size} light, ${dark.size} dark CSS variables).`);
console.log(`Source SHA-256: ${hash}`);
