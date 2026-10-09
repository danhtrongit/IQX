import { Inject, Injectable } from '@nestjs/common';

import { loadAcademyContent, type AcademyContent } from './academy.content.js';
import type { AcademyGrantsPort } from './academy.ports.js';
import {
  AcademyRepository,
  type AcademyStoreProvider,
  type CompletionRow,
} from './academy.repository.js';

/**
 * Sorted capability ids opened by the completions of the current catalog. A completion whose
 * lesson key is not in the catalog (a later catalog dropped it) opens nothing.
 */
export function capabilitiesFromCompletions(
  content: AcademyContent,
  completions: readonly Pick<CompletionRow, 'lesson_key'>[],
): string[] {
  const capabilities = new Set<string>();
  for (const completion of completions)
    for (const capability of content.lessonsByKey.get(completion.lesson_key)?.capabilities ?? [])
      capabilities.add(capability);
  return [...capabilities].sort();
}

@Injectable()
export class AcademyGrantsService implements AcademyGrantsPort {
  protected readonly content: () => AcademyContent = loadAcademyContent;

  constructor(@Inject(AcademyRepository) private readonly repository: AcademyStoreProvider) {}

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
