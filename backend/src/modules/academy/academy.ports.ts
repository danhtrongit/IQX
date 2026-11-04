import type { ResolvedAcademyConfig } from './academy.config.js';

/**
 * Cross-module port: capabilities of the learner's tools.
 * Implemented by the academy lane and exported from AcademyModule under ACADEMY_GRANTS.
 * Consumers (strategy-config, screener, strategy-backtests, bots, alerts, practice) inject it with
 * `@Inject(ACADEMY_GRANTS)`; the interface is unchanged since Học viện v3.2.
 *
 * Học viện v4 (spec §4.2) ties NO tool to the Academy any more: the port answers every indicator
 * (`indicator:<id>`, the 16 current indicators) and every screener metric (`metric:<id>`) for every
 * user, whatever they completed, so each consumer's existing "learned" check passes. The only
 * capabilities that still come from stored data are the LEGACY `lesson:<legacy lesson id>` ones,
 * read from the legacy `academy_grants` table (18-chapter catalog, e.g. lesson:ch02-l14):
 * strategy-backtests' advanced features (sensitivity, out-of-sample, walk-forward, system/portfolio
 * groups) still unlock through them, exactly as before. Lessons of the current catalog never grant
 * a `lesson:*` capability, and a legacy `lesson:<id>` is never read as the current item with the
 * same id.
 * Premium (billing) is checked independently by the caller; a grant never implies Premium
 * and Premium never implies a grant.
 */
export const ACADEMY_GRANTS = Symbol('ACADEMY_GRANTS');

export interface AcademyGrantsPort {
  /** All capability ids granted to the user (every tool capability + legacy holders' `lesson:*`). Never throws for unknown users. */
  grantedCapabilities(userId: string): Promise<ReadonlySet<string>>;
}

/**
 * Per-learner Academy config (supplement v4.1 §1, §8.2): which chapters a user learns and in which mode (`free` or
 * `sequential`). It is resolved from the user's group on EVERY call, so a config edit or a change of group applies at
 * once (spec §7) and nothing about the learner is stored or cached. The service asks this port once per request;
 * without a provider every learner gets the rollout default (Học tự do, all 12 chapters). A failing lookup fails the
 * request: it never falls back to another config, because opening chapters or locks by accident is worse than an error.
 */
export const ACADEMY_CONFIG = Symbol('ACADEMY_CONFIG');

export interface AcademyConfigPort {
  /** The config that applies to the user (an unknown user gets the default config). */
  configOf(userId: string): Promise<ResolvedAcademyConfig>;
  /** Same rule for many users in two queries (staff progress lists); every id has an entry. */
  configsOf(userIds: readonly string[]): Promise<Map<string, ResolvedAcademyConfig>>;
}
