import { Inject, Injectable, Optional } from '@nestjs/common';

import { INDICATOR_CAPABILITY_PREFIX, METRIC_CAPABILITY_PREFIX } from './academy.capabilities.js';
import { loadAcademyContent } from './academy.content.js';
import {
  ACADEMY_CONTENT,
  type AcademyContent,
  type AcademyContentSource,
} from './academy.content.types.js';
import type { AcademyGrantsPort } from './academy.ports.js';
import {
  AcademyRepository,
  type AcademyStoreProvider,
  type CompletionRow,
} from './academy.repository.js';

/** Capability of a completion key that is no longer in the catalog (13ch/71 and older keys). */
const RETIRED_PREFIX: Record<string, (id: string) => string> = {
  technical: (id) => `${INDICATOR_CAPABILITY_PREFIX}${id}`,
  fundamental: (id) => `${METRIC_CAPABILITY_PREFIX}${id}`,
};
const RETIRED_KEY = /^(technical|fundamental):([a-z0-9_]+)$/;

/**
 * Capability ids opened by the user's completions (design §5). A key of the current catalog opens
 * exactly its item's capabilities (only ch04-l04..l08 unlock an indicator; concept and exam keys
 * open nothing). A key outside the catalog keeps the grant its prefix always meant
 * (`technical:<id>` -> `indicator:<id>`, `fundamental:<id>` -> `metric:<id>`), so learners never
 * lose a tool they earned under an older catalog.
 */
export function capabilitiesFromCompletions(
  content: AcademyContent,
  completions: readonly Pick<CompletionRow, 'lesson_key'>[],
): Set<string> {
  const out = new Set<string>();
  for (const completion of completions) {
    const item = content.itemsByKey.get(completion.lesson_key);
    if (item) {
      item.capabilities.forEach((capability) => out.add(capability));
      continue;
    }
    const match = RETIRED_KEY.exec(completion.lesson_key);
    if (match) out.add(RETIRED_PREFIX[match[1]!]!(match[2]!));
  }
  return out;
}

/** `capabilitiesFromCompletions` as a sorted list (wire order). */
export function sortedCapabilities(
  content: AcademyContent,
  completions: readonly Pick<CompletionRow, 'lesson_key'>[],
): string[] {
  return [...capabilitiesFromCompletions(content, completions)].sort();
}

@Injectable()
export class AcademyGrantsService implements AcademyGrantsPort {
  private readonly content: AcademyContentSource;

  constructor(
    @Inject(AcademyRepository) private readonly repository: AcademyStoreProvider,
    @Optional() @Inject(ACADEMY_CONTENT) content?: AcademyContentSource,
  ) {
    this.content = content ?? loadAcademyContent;
  }

  /** `indicator:*` / `metric:*` from completions plus the legacy `lesson:*` holder capabilities. */
  async grantedCapabilities(userId: string): Promise<ReadonlySet<string>> {
    const store = this.repository.store();
    const [completions, legacy] = await Promise.all([
      store.completions(userId),
      store.legacyLessonCapabilities(userId),
    ]);
    return new Set([...capabilitiesFromCompletions(this.content(), completions), ...legacy].sort());
  }
}
