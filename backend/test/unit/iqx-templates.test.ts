import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';

import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_ROLES_KEY } from '../../src/modules/auth/auth.decorators.js';
import { RolesGuard } from '../../src/modules/auth/index.js';
import {
  IqxTemplatesAdminController,
  IqxTemplatesController,
} from '../../src/modules/iqx-templates/iqx-templates.controller.js';
import { slugify } from '../../src/modules/iqx-templates/iqx-templates.service.js';
import {
  filterConditionCount,
  infoErrors,
  validateContent,
  validateFilterDefinition,
  validateStrategyDefinition,
} from '../../src/modules/iqx-templates/iqx-templates.validation.js';
import { SavedFiltersFeatureGuard } from '../../src/modules/saved-filters/saved-filters.feature.guard.js';
import { filterDefinitionSchema } from '../../src/modules/saved-filters/saved-filters.definition.js';
import { canonicalHash } from '../../src/modules/saved-filters/saved-filters.hash.js';
import { criteriaHash } from '../../src/modules/saved-filters/saved-results.service.js';

type SeedItem = {
  slug: string;
  content: Record<string, unknown> & { definition: Record<string, unknown> };
};
const seed = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../src/modules/iqx-templates/iqx-templates.seed.json'),
    'utf8',
  ),
) as { filter: SeedItem[]; strategy: SeedItem[] };
const migration = readFileSync(
  resolve(import.meta.dirname, '../../migrations/0057_iqx_templates.sql'),
  'utf8',
);

const clone = <T>(value: T): T => structuredClone(value);

describe('seed of the tab IQX (spec §2.4, §3.4, §4.1)', () => {
  it('has the 6 Bộ lọc IQX and 5 Chiến lược IQX in the order of the spec', () => {
    expect(seed.filter.map((item) => item.slug)).toEqual([
      'giatri',
      'chatluong',
      'garp',
      'canslim',
      'phadinh',
      'hoiphuc',
    ]);
    expect(seed.strategy.map((item) => item.slug)).toEqual([
      'xuhuong',
      'phadinh',
      'macd',
      'hoiphuc',
      'dongtien',
    ]);
  });

  it('every seed item passes the current validators unchanged', () => {
    for (const kind of ['filter', 'strategy'] as const) {
      for (const item of seed[kind]) {
        const checked = validateContent(kind, item.content);
        expect(checked, `${kind}/${item.slug}`).toMatchObject({ ok: true });
        if (checked.ok) expect(checked.content).toEqual(item.content);
      }
    }
  });

  it('the migration inserts exactly the seed file content, version 1, reason Khởi tạo', () => {
    for (const kind of ['filter', 'strategy'] as const) {
      seed[kind].forEach((item, index) => {
        const literal = JSON.stringify(item.content).replace(/'/g, "''");
        expect(migration).toContain(`('${kind}', '${item.slug}', ${index + 1}, '${literal}')`);
      });
    }
    expect(migration).toContain(`SELECT inserted.id, 1, seed.content::jsonb, 'Khởi tạo'`);
  });

  it('stores display values in registry units (ROE 15% → 0.15 ratio, P/E 12 lần)', () => {
    const chatluong = seed.filter.find((item) => item.slug === 'chatluong')!;
    const rules = chatluong.content.definition.rules as Array<Record<string, unknown>>;
    expect(rules.find((rule) => rule.metric_id === 'roe')).toMatchObject({
      period: 'ttm',
      operator: '>',
      value: 0.15,
      api_unit: 'ratio',
    });
    expect(rules.find((rule) => rule.metric_id === 'cfo_profit')).toMatchObject({
      value: 0.8,
      api_unit: 'lần',
    });
  });

  it('pairs every Bộ lọc IQX with a seeded Chiến lược IQX', () => {
    const strategies = new Set(seed.strategy.map((item) => item.slug));
    for (const item of seed.filter)
      expect(strategies.has(item.content.pair_slug as string)).toBe(true);
  });
});

describe('content checks (§5.3, §5.4)', () => {
  const filter = () => clone(seed.filter[0]!.content);
  const strategy = () => clone(seed.strategy[1]!.content);

  it('requires every info field and enforces the limits', () => {
    expect(infoErrors({})).toEqual([
      { field: 'name', message: 'Tên: bắt buộc nhập.' },
      { field: 'idea', message: 'Ý tưởng: bắt buộc nhập.' },
      { field: 'origin', message: 'Nguồn gốc: bắt buộc nhập.' },
      { field: 'when_wrong', message: 'Khi nào dễ sai: bắt buộc nhập.' },
    ]);
    const long = infoErrors({
      name: 'x'.repeat(41),
      idea: 'y'.repeat(141),
      origin: 'z'.repeat(121),
      when_wrong: 'w'.repeat(201),
    });
    expect(long.map((error) => error.field)).toEqual(['name', 'idea', 'origin', 'when_wrong']);
    expect(
      infoErrors({ name: 'A', idea: 'Câu một. Câu hai.', origin: 'o', when_wrong: 'w' }),
    ).toEqual([{ field: 'idea', message: 'Ý tưởng: chỉ viết 1 câu.' }]);
  });

  it('rejects a filter without any condition (Thị trường alone is not one)', () => {
    const content = filter();
    content.definition.rules = [];
    content.definition.technical = [];
    const checked = validateContent('filter', content);
    expect(checked).toEqual({
      ok: false,
      errors: [{ field: 'definition', message: 'Bộ lọc cần ít nhất một điều kiện.' }],
    });
  });

  it('a switched-off technical row is not a condition, Khối lượng counts two', () => {
    const canslim = seed.filter.find((item) => item.slug === 'canslim')!.content.definition;
    expect(filterConditionCount(canslim as never)).toBe(3 + 1 + 2);
  });

  it('reports Bộ lọc 4.0 validator errors by field and refuses an origin inside the template', () => {
    const content = filter();
    (content.definition.rules as Array<Record<string, unknown>>)[0]!.period = 'quarter';
    const checked = validateContent('filter', content);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.errors[0]!.field).toMatch(/^definition\.rules\.0/);
    const withOrigin = { ...filter().definition, origin: { type: 'iqx_filter' } };
    expect(validateFilterDefinition(withOrigin)).toMatchObject({ ok: false });
  });

  it('a Chiến lược needs one switched-on Mua row and one switched-on Bán row', () => {
    const content = strategy();
    const indicators = content.definition.indicators as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    indicators.donchian!.sell!.enabled = false;
    const checked = validateStrategyDefinition(content.definition);
    expect(checked).toEqual({
      ok: false,
      errors: [{ field: 'definition.sell', message: 'Chưa bật chỉ báo Bán nào.' }],
    });
  });

  it('Giữ tối đa is an integer from 3 to 250', () => {
    for (const value of [2, 251, 10.5, '30']) {
      const content = strategy();
      content.definition.max_holding = value;
      expect(validateStrategyDefinition(content.definition)).toMatchObject({
        ok: false,
        errors: [
          {
            field: 'definition.max_holding',
            message: 'Giữ tối đa phải từ 3 đến 250 phiên, số nguyên.',
          },
        ],
      });
    }
  });

  it('uses the Bot row validator (out-of-range period is refused with its message)', () => {
    const content = strategy();
    const indicators = content.definition.indicators as Record<
      string,
      Record<string, { rules: Array<Record<string, unknown>> }>
    >;
    indicators.donchian!.buy!.rules[0]!.period = 999;
    const checked = validateStrategyDefinition(content.definition);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.errors[0]!.field).toMatch(/^definition\.indicators\.donchian/);
  });

  it('refuses unknown indicators and fields', () => {
    const content = strategy();
    (content.definition.indicators as Record<string, unknown>).foo = {};
    expect(validateStrategyDefinition(content.definition)).toMatchObject({ ok: false });
    expect(validateContent('strategy', { ...strategy(), extra: 1 })).toMatchObject({ ok: false });
  });

  it('slugs new items from their name', () => {
    expect(slugify('Theo dòng tiền đầu phiên')).toBe('theo-dong-tien-dau-phien');
    expect(slugify('!!!')).toBe('muc');
  });
});

describe('saved filter origin (§2.3.5, §4.3)', () => {
  const base = seed.filter[0]!.content.definition;
  const origin = { type: 'iqx_filter', id: '00000000-0000-4000-8000-000000000001', version: 1 };

  it('is accepted by the saved filter definition schema', () => {
    expect(filterDefinitionSchema.safeParse({ ...base, origin }).success).toBe(true);
    expect(
      filterDefinitionSchema.safeParse({ ...base, origin: { ...origin, type: 'x' } }).success,
    ).toBe(false);
  });

  it('is part of definition_hash but not of criteriaHash', () => {
    expect(canonicalHash({ ...base, origin })).not.toBe(canonicalHash(base));
    expect(criteriaHash({ ...base, origin })).toBe(criteriaHash(base));
    expect(criteriaHash({ ...base, origin: { ...origin, version: 2 } })).toBe(criteriaHash(base));
  });
});

describe('access (§5.1, §0.2)', () => {
  it('the admin API is admin only through the roles guard (team_lead → 403)', () => {
    expect(Reflect.getMetadata(AUTH_ROLES_KEY, IqxTemplatesAdminController)).toEqual(['admin']);
    expect(Reflect.getMetadata(GUARDS_METADATA, IqxTemplatesAdminController)).toContain(RolesGuard);
    const guard = new RolesGuard(new Reflector());
    const context = (role: string) =>
      ({
        getHandler: () => IqxTemplatesAdminController.prototype.list,
        getClass: () => IqxTemplatesAdminController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      }) as never;
    expect(() => guard.canActivate(context('team_lead'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context('premium'))).toThrow(ForbiddenException);
    expect(guard.canActivate(context('admin'))).toBe(true);
  });

  it('the user API keeps the Strategy page gates (feature flag + Premium)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, IqxTemplatesController)).toContain(
      SavedFiltersFeatureGuard,
    );
  });
});
