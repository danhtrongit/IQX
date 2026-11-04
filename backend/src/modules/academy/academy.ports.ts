import type { AcademyAccessMode } from './content/v4/schema.js';

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
 * Per-learner access mode (spec v4 §4.1, supplement v4.1 §2). `free` is the default and the only mode v4 ships: every
 * lesson, exam and the practice are open. `sequential` keeps the v3.3 prefix rule (an item opens once every earlier
 * required item is passed) and is what the supplement's per-user / per-group setting will switch on later: the service
 * asks this port once per request, so a resolver backed by that setting plugs in here and nothing else changes.
 * Optional: without a provider every user is in the default mode.
 */
export const ACADEMY_ACCESS_MODE = Symbol('ACADEMY_ACCESS_MODE');

export interface AcademyAccessModePort {
  /** The learner's access mode (`free` when unknown). Never throws for unknown users. */
  accessModeOf(userId: string): Promise<AcademyAccessMode>;
}
