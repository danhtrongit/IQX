/** Prefix of the capability ids that unlock a technical indicator. */
export const INDICATOR_CAPABILITY_PREFIX = 'indicator:';
/** Prefix of the capability ids that unlock a fundamental screener metric. */
export const METRIC_CAPABILITY_PREFIX = 'metric:';
/**
 * Prefix of the LEGACY per-lesson capability ids (`lesson:<legacy lesson id>`, 18-chapter /
 * 125-lesson catalog). They are only read from the legacy `academy_grants` table so the
 * advanced backtest features keep working for legacy holders; no Học viện v3.2 item grants them.
 */
export const LEGACY_LESSON_CAPABILITY_PREFIX = 'lesson:';
