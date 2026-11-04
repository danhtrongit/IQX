import { beforeAll, describe, expect, it } from 'vitest';

import { chartModelSchema } from '../../src/modules/academy/content/v4/schema.js';
import type { Builder, LegendItem } from '../../scripts/academy-v4-import/charts/kit.js';

/** Charts of the v4 mockup page script for the new chapters: `c{ch}l{lesson}-g{k}` (3 per lesson, c12l3 has 4). */
function mockupIds(chapter: number, lessons: number, extra: Record<number, number> = {}): string[] {
  const out: string[] = [];
  for (let l = 1; l <= lessons; l += 1)
    for (let g = 1; g <= (extra[l] ?? 3); g += 1) out.push(`c${chapter}l${l}-g${g}`);
  return out;
}

interface ChapterModule {
  builders: Record<string, Builder>;
  legends: Record<string, LegendItem[]>;
}

/* Dynamic imports keep a chapter's tests independent of the others (each chapter file is a separate module). */
const CHAPTERS: { name: string; load: () => Promise<ChapterModule>; ids: string[] }[] = [
  {
    name: 'ch10 (bank)',
    load: async () => {
      const m = await import('../../scripts/academy-v4-import/charts/ch10.js');
      return { builders: m.CH10_BUILDERS, legends: m.CH10_LEGENDS };
    },
    ids: mockupIds(10, 11),
  },
  {
    name: 'ch11 (securities)',
    load: async () => {
      const m = await import('../../scripts/academy-v4-import/charts/ch11.js');
      return { builders: m.CH11_BUILDERS, legends: m.CH11_LEGENDS };
    },
    ids: mockupIds(11, 10),
  },
  {
    name: 'ch12 (insurance)',
    load: async () => {
      const m = await import('../../scripts/academy-v4-import/charts/ch12.js');
      return { builders: m.CH12_BUILDERS, legends: m.CH12_LEGENDS };
    },
    ids: mockupIds(12, 8, { 3: 4 }),
  },
];

describe.each(CHAPTERS)('academy v4 chart builders: $name', ({ load, ids }) => {
  let mod: ChapterModule;
  beforeAll(async () => {
    mod = await load();
  });

  it('has exactly one builder per chart of the mockup', () => {
    expect(Object.keys(mod.builders).sort()).toEqual([...ids].sort());
  });

  it.each(ids)('%s builds a schema-valid, deterministic model', (id) => {
    const build = mod.builders[id];
    expect(build, `no builder for ${id}`).toBeTypeOf('function');
    const model = (build as Builder)();
    const parsed = chartModelSchema.safeParse(model);
    expect(
      parsed.success,
      parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 4)),
    ).toBe(true);
    expect(JSON.stringify((build as Builder)())).toBe(JSON.stringify(model));
  });

  it('only declares legends for charts it builds, with plain labels', () => {
    for (const [id, items] of Object.entries(mod.legends)) {
      expect(mod.builders[id], `legend for unknown chart ${id}`).toBeTypeOf('function');
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) expect(item.label).toMatch(/^[^–—✓✔]+$/);
    }
  });
});
