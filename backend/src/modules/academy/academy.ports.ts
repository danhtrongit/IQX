/**
 * Cross-module port: learned capabilities granted by passing an Academy quiz (8/8).
 * Implemented by the academy lane and exported from AcademyModule under ACADEMY_GRANTS.
 * Consumers (strategy-config, screener) inject it with `@Inject(ACADEMY_GRANTS)`.
 *
 * Capability ids (see .pi/botv2/CONTRACTS.md §2):
 *   technical lesson   -> `indicator:<config_id>`   e.g. indicator:rsi
 *   fundamental lesson -> `metric:<config_id>`      e.g. metric:roe
 *   every passed lesson-> `lesson:<lesson_id>`      e.g. lesson:ch02-l14
 * Premium (billing) is checked independently by the caller; a grant never implies Premium
 * and Premium never implies a grant.
 */
export const ACADEMY_GRANTS = Symbol('ACADEMY_GRANTS');

export interface AcademyGrantsPort {
  /** All capability ids granted to the user (empty set when none). Never throws for unknown users. */
  grantedCapabilities(userId: string): Promise<ReadonlySet<string>>;
}
