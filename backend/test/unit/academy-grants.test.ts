import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  AcademyGrantsService,
  capabilitiesFromCompletions,
} from '../../src/modules/academy/academy-grants.service.js';
import { MemoryAcademy, USER, OTHER_USER } from './academy-test-kit.js';
import { academyV3Fixture, academyV3Source } from './academy-v3-fixture.js';

const here = dirname(fileURLToPath(import.meta.url));
const content = academyV3Fixture();

type OldLesson = {
  lesson_key: string;
  capability_binding: { kind: 'technical' | 'fundamental'; id: string } | null;
};
const oldCatalog = JSON.parse(
  readFileSync(join(here, '../fixtures/academy/catalog-13ch.v1.json'), 'utf8'),
) as { chapters: Array<{ lessons: OldLesson[] }> };
const oldLessons = oldCatalog.chapters.flatMap((chapter) => chapter.lessons);

const keys = (lessonKeys: readonly string[]) => lessonKeys.map((lesson_key) => ({ lesson_key }));

describe('academy grants (design §5)', () => {
  it('keeps every capability of the 13-chapter catalog for a user holding all 71 old keys', () => {
    expect(oldLessons).toHaveLength(71);
    const old = new Set(
      oldLessons.flatMap((lesson) =>
        lesson.capability_binding
          ? [
              `${lesson.capability_binding.kind === 'technical' ? 'indicator' : 'metric'}:${lesson.capability_binding.id}`,
            ]
          : [],
      ),
    );
    const next = capabilitiesFromCompletions(content, keys(oldLessons.map((l) => l.lesson_key)));
    expect([...next].sort()).toEqual([...old].sort());
    expect([...next].filter((capability) => capability.startsWith('indicator:'))).toHaveLength(16);
    expect([...next].filter((capability) => capability.startsWith('metric:'))).toHaveLength(42);
  });

  it('opens exactly the 16 indicators and 33 metrics for a user who passed every v3.3 item', () => {
    /* Spec v3.3 §4.2: 16 chỉ báo kỹ thuật, 33 chỉ tiêu cơ bản. */
    const technical = [
      'bollinger',
      'cci',
      'cmf',
      'donchian',
      'dmi',
      'ema',
      'macd',
      'ma',
      'ma_cross',
      'mfi',
      'obv',
      'roc',
      'rsi',
      'stochastic',
      'volume',
      'williams_r',
    ];
    const fundamental = [
      'asset_turnover',
      'capex_revenue',
      'ccc',
      'cfo_margin',
      'cfo_profit',
      'current_ratio',
      'debt_equity',
      'eps_cagr3',
      'eps_growth_stability',
      'eps_yoy',
      'ev_ebitda',
      'fcf_margin',
      'fcf_positive_streak',
      'fcf_yield',
      'gross_margin',
      'interest_coverage',
      'net_debt_ebitda',
      'net_margin',
      'net_margin_stability',
      'pb',
      'pe',
      'peg',
      'profit_cagr3',
      'profit_positive_streak',
      'profit_yoy',
      'ps',
      'revenue_cagr3',
      'revenue_growth_stability',
      'revenue_yoy',
      'roa',
      'roe',
      'roic',
      'roic_stability',
    ];
    const expected = [
      ...technical.map((id) => `indicator:${id}`),
      ...fundamental.map((id) => `metric:${id}`),
    ].sort();
    const all = [...content.items.values()].map((item) => item.lesson_key);
    expect([...capabilitiesFromCompletions(content, keys(all))].sort()).toEqual(expected);
    // The reachable set of a learner: every published item grants its own capability.
    const reachable = new Set([...content.items.values()].flatMap((item) => item.capabilities));
    expect([...reachable].sort()).toEqual(expected);
    expect([...content.items.values()].filter((item) => item.capabilities.length)).toHaveLength(49);
  });

  it('concept, exam, guide and unknown keys open nothing', () => {
    expect(
      capabilitiesFromCompletions(
        content,
        keys(['concept:hop_luu', 'exam:ch01', 'guide:ch02-l01', 'concept:dca', 'technical:']),
      ).size,
    ).toBe(0);
  });

  it('adds the legacy lesson:* capabilities of legacy holders, per user', async () => {
    const memory = new MemoryAcademy();
    memory.complete(USER, ['technical:rsi', 'fundamental:roe', 'concept:dca']);
    memory.legacyCapabilities.set(USER, ['lesson:ch02-l14']);
    const grants = new AcademyGrantsService(memory, academyV3Source);
    expect([...(await grants.grantedCapabilities(USER))]).toEqual([
      'indicator:rsi',
      'lesson:ch02-l14',
      'metric:roe',
    ]);
    expect((await grants.grantedCapabilities(OTHER_USER)).size).toBe(0);
  });
});
