import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { optionId } from '../../scripts/academy-v32-import/banks.js';
import { CHART_BUILDERS, TEXT_FIGURES } from '../../scripts/academy-v32-import/charts/index.js';
import { TextNormalizer } from '../../scripts/academy-v32-import/inline.js';
import { outDir, SOURCE_SHA256 } from '../../scripts/academy-v32-import/paths.js';
import { EXPECTED, verify } from '../../scripts/academy-v32-import/verify.js';
import { sha256, stableJson } from '../../scripts/academy-v32-import/write.js';
import { chartModelSchema } from '../../src/modules/academy/content/v3/schema.js';

describe('academy v3.2 importer output', () => {
  it('passes every no-source gate (schema, counts, chart recompute, goldens, salts)', () => {
    expect(verify()).toEqual([]);
  });

  it('has 114 chart builders that all parse, and 12 text figures', () => {
    expect(Object.keys(CHART_BUILDERS)).toHaveLength(EXPECTED.charts);
    expect(Object.keys(TEXT_FIGURES)).toHaveLength(12);
    for (const [id, build] of Object.entries(CHART_BUILDERS)) {
      const r = chartModelSchema.safeParse(build());
      expect(r.success, id).toBe(true);
    }
  });

  it('builds identical charts on every call (no hidden state)', () => {
    for (const [id, build] of Object.entries(CHART_BUILDERS))
      expect(stableJson(build()), id).toBe(stableJson(build()));
  });
});

describe('academy v3.2 importer helpers', () => {
  it('normalises text per design §6.3', () => {
    const n = new TextNormalizer({ 'vài tuần – vài tháng': 'vài tuần đến vài tháng' });
    expect(n.text('2015–2025 và 36 — 47%')).toBe('2015-2025 và 36-47%');
    expect(n.text('✓ Đã xong')).toBe('Đã xong');
    expect(n.text('vài tuần – vài tháng')).toBe('vài tuần đến vài tháng');
    expect(n.text('Ghi chú. Phần bạn viết được lưu trên trình duyệt này.')).toBe('Ghi chú.');
    expect(n.missing).toEqual([]);
    n.text('Đúng – Đủ');
    expect(n.missing).toHaveLength(1);
    expect(n.unusedOverrides()).toEqual([]);
  });

  it('salts option ids so they cannot be derived from the question id', () => {
    const salt = 'ab'.repeat(32);
    const id = optionId(salt, 'ch01-l01-q01', 0);
    expect(id).toMatch(/^[0-9a-f]{10}$/);
    expect(id).not.toBe(sha256('ch01-l01-q01|0').slice(0, 10));
    expect(optionId('cd'.repeat(32), 'ch01-l01-q01', 0)).not.toBe(id);
  });

  it('writes stable JSON (sorted keys, trailing newline)', () => {
    expect(stableJson({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(
      '{\n  "a": [\n    {\n      "c": 2,\n      "d": 1\n    }\n  ],\n  "b": 1\n}\n',
    );
  });
});

const source = process.env.ACADEMY_V32_SOURCE;
const haveSource = !!source && existsSync(source);

describe.skipIf(!haveSource)('academy v3.2 re-extract from the mockup', () => {
  it('reproduces the committed content byte for byte', async () => {
    const { extract } = await import('../../scripts/academy-v32-import/extract.js');
    const { files, manifest } = extract(source as string, undefined, { write: false });
    expect(manifest.source.sha256).toBe(SOURCE_SHA256);
    for (const [rel, text] of Object.entries(files))
      expect(text, rel).toBe(readFileSync(join(outDir(), rel), 'utf8'));
  }, 60_000);
});
