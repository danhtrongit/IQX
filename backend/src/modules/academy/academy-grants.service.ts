import { Inject, Injectable } from '@nestjs/common';

import { CURRENT_INDICATOR_IDS } from '../quant/v2/types.js';
import { SCREENER_METRIC_IDS } from '../screener/screener.registry.js';
import { INDICATOR_CAPABILITY_PREFIX, METRIC_CAPABILITY_PREFIX } from './academy.capabilities.js';
import type { AcademyGrantsPort } from './academy.ports.js';
import { AcademyRepository, type AcademyStoreProvider } from './academy.repository.js';

/**
 * Every tool capability: `indicator:<id>` for the 16 current indicators (Bot, Backtest, Alerts, Flashback) and
 * `metric:<id>` for the 42 screener metrics. Học viện v4 (spec §4.2) ties no tool to a lesson, so all of them are
 * granted to everybody; the ids come from the tools' own registries, so a new indicator or metric is open the day it
 * ships. Sorted, frozen, shared.
 */
export const ALL_TOOL_CAPABILITIES: readonly string[] = Object.freeze(
  [
    ...CURRENT_INDICATOR_IDS.map((id) => `${INDICATOR_CAPABILITY_PREFIX}${id}`),
    ...SCREENER_METRIC_IDS.map((id) => `${METRIC_CAPABILITY_PREFIX}${id}`),
  ].sort(),
);

@Injectable()
export class AcademyGrantsService implements AcademyGrantsPort {
  constructor(@Inject(AcademyRepository) private readonly repository: AcademyStoreProvider) {}

  /**
   * All tool capabilities for every user, plus the legacy `lesson:*` capabilities of legacy holders (read from the
   * legacy `academy_grants` table, kept for strategy-backtests' advanced features). Completions no longer matter.
   */
  async grantedCapabilities(userId: string): Promise<ReadonlySet<string>> {
    const legacy = await this.repository.store().legacyLessonCapabilities(userId);
    return new Set([...ALL_TOOL_CAPABILITIES, ...legacy].sort());
  }
}
