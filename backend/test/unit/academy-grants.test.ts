import { describe, expect, it } from 'vitest';

import {
  ALL_TOOL_CAPABILITIES,
  AcademyGrantsService,
} from '../../src/modules/academy/academy-grants.service.js';
import { CURRENT_INDICATOR_IDS } from '../../src/modules/quant/v2/types.js';
import {
  SCREENER_METRIC_IDS,
  loadFundamentalRegistry,
} from '../../src/modules/screener/screener.registry.js';
import { MemoryAcademy, OTHER_USER, USER } from './academy-test-kit.js';
import { academyV4Fixture } from './academy-v4-fixture.js';

const content = academyV4Fixture();

describe('academy grants (spec v4 §4.2: no tool is tied to a lesson)', () => {
  it('lists every tool capability: the 16 indicators and the 42 screener metrics, sorted', () => {
    expect(ALL_TOOL_CAPABILITIES).toHaveLength(58);
    expect([...ALL_TOOL_CAPABILITIES]).toEqual([...ALL_TOOL_CAPABILITIES].sort());
    expect(
      ALL_TOOL_CAPABILITIES.filter((capability) => capability.startsWith('indicator:')),
    ).toEqual(CURRENT_INDICATOR_IDS.map((id) => `indicator:${id}`).sort());
    expect(ALL_TOOL_CAPABILITIES.filter((capability) => capability.startsWith('metric:'))).toEqual(
      SCREENER_METRIC_IDS.map((id) => `metric:${id}`).sort(),
    );
    expect(Object.isFrozen(ALL_TOOL_CAPABILITIES)).toBe(true);
  });

  it('grants every capability to a user who completed nothing', async () => {
    const grants = new AcademyGrantsService(new MemoryAcademy());
    const granted = await grants.grantedCapabilities(USER);
    expect([...granted]).toEqual([...ALL_TOOL_CAPABILITIES]);
    // What each consumer asks for: `indicator:<id>` per registry indicator, `metric:<id>` per screener metric.
    for (const id of CURRENT_INDICATOR_IDS) expect(granted.has(`indicator:${id}`), id).toBe(true);
    for (const metric of loadFundamentalRegistry())
      expect(granted.has(`metric:${metric.id}`), metric.id).toBe(true);
  });

  it('completions change nothing: a learner who passed everything has the same capabilities', async () => {
    const memory = new MemoryAcademy();
    const grants = new AcademyGrantsService(memory);
    const before = [...(await grants.grantedCapabilities(USER))];
    memory.complete(
      USER,
      [...content.items.values()].map((item) => item.lesson_key),
    );
    expect([...(await grants.grantedCapabilities(USER))]).toEqual(before);
    memory.completionRows = [];
    memory.complete(USER, ['concept:hop_luu', 'exam:ch01', 'guide:ch02-l01']);
    expect([...(await grants.grantedCapabilities(USER))]).toEqual(before);
  });

  it('keeps the legacy lesson:* capabilities of legacy holders (advanced backtest), per user', async () => {
    const memory = new MemoryAcademy();
    memory.legacyCapabilities.set(USER, ['lesson:ch02-l14']);
    const grants = new AcademyGrantsService(memory);
    const holder = await grants.grantedCapabilities(USER);
    expect(holder.has('lesson:ch02-l14')).toBe(true);
    expect(holder.size).toBe(ALL_TOOL_CAPABILITIES.length + 1);
    // A learner without legacy rows never gets a lesson:* capability, whatever they finish.
    const other = await grants.grantedCapabilities(OTHER_USER);
    expect([...other].some((capability) => capability.startsWith('lesson:'))).toBe(false);
    expect(other.size).toBe(ALL_TOOL_CAPABILITIES.length);
  });
});

describe('screener registry lesson links follow the v4 catalog', () => {
  it('points every metric that has a lesson at the v4 lesson whose key is fundamental:<id>', () => {
    const registry = loadFundamentalRegistry();
    const withLesson = registry.filter((metric) => metric.lesson_id !== null);
    expect(withLesson).toHaveLength(33);
    for (const metric of withLesson) {
      const lesson = content.itemsByKey.get(`fundamental:${metric.id}`);
      expect(lesson?.id, metric.id).toBe(metric.lesson_id);
      expect(lesson?.chapter, metric.id).toBe(metric.chapter);
      expect(lesson?.metric_key, metric.id).toBe(metric.id);
    }
    // The 9 metrics without a lesson are not in the catalog under any key.
    for (const metric of registry.filter((candidate) => candidate.lesson_id === null))
      expect(content.itemsByKey.has(`fundamental:${metric.id}`), metric.id).toBe(false);
  });
});
