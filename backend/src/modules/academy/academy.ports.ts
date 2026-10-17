/**
 * Cross-module port: capabilities opened by completing Academy lessons.
 * Implemented by the academy lane and exported from AcademyModule under ACADEMY_GRANTS.
 * Consumers (strategy-config, screener, strategy-backtests, bots) inject it with
 * `@Inject(ACADEMY_GRANTS)`; the interface is unchanged by Học viện v3.2.
 *
 * Capability ids are derived from `academy_completions` (one row per user and stable lesson key):
 *   catalog item with `unlock` (ch04-l04..l08) -> `indicator:<indicator id>`  e.g. indicator:rsi
 *   key outside the catalog: `technical:<id>` -> `indicator:<id>`, `fundamental:<id>` -> `metric:<id>`
 *   concept / exam / guide keys -> no capability
 *
 * Legacy holders additionally keep their `lesson:<legacy lesson id>` capabilities, read from the
 * legacy `academy_grants` table (18-chapter catalog, e.g. lesson:ch02-l14). Strategy-backtests'
 * advanced features (sensitivity, out-of-sample, walk-forward, system/portfolio groups) still
 * unlock through them. Lessons of the current catalog never grant a `lesson:*` capability, so a
 * new user cannot unlock those advanced features, and a legacy `lesson:<id>` is never read as
 * the current item with the same id.
 * Premium (billing) is checked independently by the caller; a grant never implies Premium
 * and Premium never implies a grant.
 */
export const ACADEMY_GRANTS = Symbol('ACADEMY_GRANTS');

export interface AcademyGrantsPort {
  /** All capability ids granted to the user (empty set when none). Never throws for unknown users. */
  grantedCapabilities(userId: string): Promise<ReadonlySet<string>>;
}
