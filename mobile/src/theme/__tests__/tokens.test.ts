import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { darkPalette, lightPalette } from '..';

describe('design tokens', () => {
  it('tokens.generated.ts is in sync with frontend/src/index.css', () => {
    const script = resolve(__dirname, '../../../scripts/sync-design-tokens.mjs');
    expect(() => execFileSync('node', [script, '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('exposes semantic roles for both schemes', () => {
    for (const p of [lightPalette, darkPalette]) {
      for (const k of ['background', 'card', 'primary', 'accent', 'priceUp', 'priceDown', 'priceRef', 'priceCeiling', 'priceFloor', 'chart1', 'chart5'] as const) {
        expect(p[k]).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    expect(darkPalette.background).not.toBe(lightPalette.background);
  });
});
