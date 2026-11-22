import { describe, expect, it } from 'vitest';

import {
  ACADEMY_CONTENT_DIR,
  loadAcademyContent,
} from '../../src/modules/academy/academy.content.js';
import { academyV4Fixture } from './academy-v4-fixture.js';

describe('academy boot on the real content/v5', () => {
  it('loads, validates and memoizes 221 items with 203 required lessons in 17 chapters', () => {
    expect(ACADEMY_CONTENT_DIR).toMatch(/src\/modules\/academy\/content\/v5$/);
    const content = loadAcademyContent();
    expect(loadAcademyContent()).toBe(content);
    expect(content.items.size).toBe(221);
    expect(content.requiredTotal).toBe(203);
    expect(content.catalog.chapters.filter((chapter) => chapter.published)).toHaveLength(17);
    // 149 metric lessons over 90 metric keys; (metric_key, nganh) is unique.
    expect(content.itemsByMetricKey.size).toBe(90);
    expect([...content.itemsByMetricKey.values()].flat()).toHaveLength(149);
    expect(content.itemByMetricNganh.size).toBe(149);
    expect(content.itemsByMetricKey.get('roe')!.map((item) => item.id)).toEqual(['ch08-l11', 'ch10-l13', 'ch11-l13', 'ch12-l10']);
  });

  it('matches the test fixture item for item', () => {
    const content = loadAcademyContent();
    const fixture = academyV4Fixture();
    expect([...content.items.keys()]).toEqual([...fixture.items.keys()]);
    for (const [id, item] of content.items) {
      const other = fixture.items.get(id)!;
      expect(item.bank.version, id).toBe(other.bank.version);
      expect(item.lesson?.content_version ?? null, id).toBe(other.lesson?.content_version ?? null);
      expect(item.metric_key, id).toBe(other.metric_key);
      expect(item.position, id).toBe(other.position);
    }
    expect([...content.retired]).toEqual([...fixture.retired]);
  });
});
