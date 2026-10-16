#!/usr/bin/env node
// Generates src/theme/tokens.generated.ts from the web design tokens (frontend/src/index.css).
// Usage: node scripts/sync-design-tokens.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = resolve(here, '../../frontend/src/index.css');
const OUT_PATH = resolve(here, '../src/theme/tokens.generated.ts');
const SOURCE_LABEL = 'frontend/src/index.css';

// ---- CSS parsing -----------------------------------------------------------

function extractBlock(css, selectorRe) {
  const m = selectorRe.exec(css);
  if (!m) throw new Error(`Selector not found: ${selectorRe}`);
  let i = css.indexOf('{', m.index) + 1;
  let depth = 1;
  const start = i;
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  return css.slice(start, i - 1);
}

function parseVars(block) {
  const vars = {};
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(block))) vars[m[1]] = m[2].trim();
  return vars;
}

function resolveVars(value, scope, base, depth = 0) {
  if (depth > 10) throw new Error(`var() cycle: ${value}`);
  return value.replace(/var\(--([a-z0-9-]+)\)/gi, (_, name) => {
    const v = scope[name] ?? base[name];
    if (v === undefined) throw new Error(`Unresolved var(--${name})`);
    return resolveVars(v, scope, base, depth + 1);
  });
}

// ---- OKLCH -> sRGB hex -----------------------------------------------------

function oklchToSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgb;
}

const inGamut = (rgb) => rgb.every((v) => v >= -1e-6 && v <= 1 + 1e-6);

/** Gamut clip by reducing chroma (binary search) at constant L and h. */
function oklchToHex(L, C, h) {
  let rgb = oklchToSrgb(L, C, h);
  if (!inGamut(rgb)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToSrgb(L, mid, h))) lo = mid; else hi = mid;
    }
    rgb = oklchToSrgb(L, lo, h);
  }
  const enc = (x) => {
    x = Math.min(1, Math.max(0, x));
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return `#${enc(rgb[0])}${enc(rgb[1])}${enc(rgb[2])}`;
}

function toHex(value) {
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`.toLowerCase();
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(v);
  if (m) return oklchToHex(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

// ---- Generation ------------------------------------------------------------

export function generate(css = readFileSync(CSS_PATH, 'utf8')) {
  const root = parseVars(extractBlock(css, /^:root\s*\{/m));
  const dark = parseVars(extractBlock(css, /^\.dark\s*\{/m));

  const build = (scope) => {
    const colors = {};
    const shadows = {};
    const names = new Set([...Object.keys(root), ...Object.keys(scope)]);
    for (const name of [...names].sort()) {
      const raw = scope[name] ?? root[name];
      if (/^(radius|header-top|panel-header-height|sidebar-width|rail-width|page-padding)$/.test(name)) continue;
      const resolved = resolveVars(raw, scope, root);
      if (name.startsWith('shadow-')) {
        shadows[camel(name)] = resolved;
        continue;
      }
      const hex = toHex(resolved);
      if (hex) colors[camel(name)] = hex;
    }
    return { colors, shadows };
  };

  const light = build(root);
  const darkOut = build(dark);

  const px = (name) => {
    const v = /^([\d.]+)(rem|px)$/.exec(root[name] ?? '');
    if (!v) throw new Error(`Cannot parse --${name}`);
    return Number(v[1]) * (v[2] === 'rem' ? 16 : 1);
  };
  const geometry = {
    radius: px('radius'),
    headerTop: px('header-top'),
    panelHeaderHeight: px('panel-header-height'),
    pagePadding: px('page-padding'),
  };

  const body = {
    light: light.colors,
    dark: darkOut.colors,
    shadows: { light: light.shadows, dark: darkOut.shadows },
    geometry,
  };

  return `// GENERATED FILE - DO NOT EDIT.
// Source: ${SOURCE_LABEL} (:root and .dark blocks). Regenerate with: npm run tokens:sync
// oklch() values are converted to sRGB hex with gamut clipping by scripts/sync-design-tokens.mjs.

export const generatedTokens = ${JSON.stringify(body, null, 2)} as const;
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(CSS_PATH)) {
    console.error(`Missing ${CSS_PATH}`);
    process.exit(2);
  }
  const next = generate();
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf8') : '';
    if (current !== next) {
      console.error('tokens.generated.ts is stale. Run: npm run tokens:sync');
      process.exit(1);
    }
    console.log('tokens.generated.ts is up to date');
  } else {
    writeFileSync(OUT_PATH, next);
    console.log(`Wrote ${OUT_PATH}`);
  }
}
