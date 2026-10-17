import { describe, expect, it } from 'vitest';

import {
  ACADEMY_CONTENT_DIR,
  loadAcademyContent,
} from '../../src/modules/academy/academy.content.js';
import { academyV3Fixture } from './academy-v3-fixture.js';

describe('academy boot on the real content/v3', () => {
  it('loads, validates and memoizes 49 items with 43 required lessons', () => {
    expect(ACADEMY_CONTENT_DIR).toMatch(/src\/modules\/academy\/content\/v3$/);
    const content = loadAcademyContent();
    expect(loadAcademyContent()).toBe(content);
    expect(content.items.size).toBe(49);
    expect(content.requiredTotal).toBe(43);
    expect(content.catalog.chapters.filter((chapter) => chapter.published)).toHaveLength(5);
  });

  it('matches the independent test fixture item for item', () => {
    const content = loadAcademyContent();
    const fixture = academyV3Fixture();
    expect([...content.items.keys()]).toEqual([...fixture.items.keys()]);
    for (const [id, item] of content.items) {
      const other = fixture.items.get(id)!;
      expect(item.bank.version, id).toBe(other.bank.version);
      expect(item.lesson?.content_version ?? null, id).toBe(other.lesson?.content_version ?? null);
      expect(item.capabilities, id).toEqual(other.capabilities);
      expect(item.position, id).toBe(other.position);
    }
    expect([...content.retired]).toEqual([...fixture.retired]);
  });
});
