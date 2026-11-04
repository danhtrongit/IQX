import { describe, expect, it } from 'vitest';

import {
  ACADEMY_CONTENT_DIR,
  loadAcademyContent,
} from '../../src/modules/academy/academy.content.js';
import { academyV4Fixture } from './academy-v4-fixture.js';

describe('academy boot on the real content/v4', () => {
  it('loads, validates and memoizes 129 items with 116 required lessons in 12 chapters', () => {
    expect(ACADEMY_CONTENT_DIR).toMatch(/src\/modules\/academy\/content\/v4$/);
    const content = loadAcademyContent();
    expect(loadAcademyContent()).toBe(content);
    expect(content.items.size).toBe(129);
    expect(content.requiredTotal).toBe(116);
    expect(content.catalog.chapters.filter((chapter) => chapter.published)).toHaveLength(12);
    expect(content.itemsByMetricKey.size).toBe(62);
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
